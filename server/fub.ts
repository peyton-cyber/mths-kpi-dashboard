/**
 * Follow Up Boss integration — pulls Disposition pipeline deals only.
 *
 * Why this exists:
 *   Acquisitions sheet was the prior dispo source, which mixed novation /
 *   listing referral / flip / rental deals into "dispo" totals. Per leadership
 *   feedback (Aug 5 review), dispo metrics must ONLY count deals in the
 *   Disposition pipeline in FUB.
 *
 * Pipeline IDs (verified via /pipelines endpoint, Aug 5 2026):
 *   1  Disposition         <-- INCLUDED
 *   3  Novations           <-- excluded
 *   25 Flips               <-- excluded
 *   26 Rentals             <-- excluded
 *   27 Listing Referrals   <-- excluded
 *   23 Dropped             <-- separate metric (dropped count)
 *   2  Acquisition         <-- AQ side, not dispo
 *   14 Underwriting        <-- AQ side
 *
 * Auth: HTTP Basic, API key as username, blank password. Adds X-System
 *   headers per FUB best practice.
 */

const FUB_BASE = "https://api.followupboss.com/v1";
const DISPO_PIPELINE_ID = 1;
const DROPPED_PIPELINE_ID = 23;

type FubUser = { id: number; name?: string };

export type FubDeal = {
  id: number;
  name?: string;
  stageName?: string;
  pipelineId?: number;
  pipelineName?: string;
  price?: number;
  customAssignedPrice?: number | string | null;
  customDateAssigned?: string | null;
  customDealType?: string | null;
  customPushDate?: string | null;
  customUnderContractDate?: string | null;
  projectedCloseDate?: string | null;
  enteredStageAt?: string | null;
  createdAt?: string | null;
  users?: FubUser[];
};

export type DispoFubData = {
  /** Total live deals in Disposition pipeline (excludes Novation/Flip/Rental/Listing-Referral) */
  totalActiveDispo: number;
  /** Deals that have closed (Stage = "Closed Deal") in the dispo pipeline */
  totalClosedDispo: number;
  /** Total dropped deals (pipeline 23 — across all dispo types but typically dispo) */
  totalDropped: number;
  /** Dispo revenue assigned per week — last 12 weeks, sum of customAssignedPrice */
  revenueAssignedByWeek: { weekStart: string; total: number; count: number }[];
  /** Average assignment per deal (assigned price ÷ count) for last 30 days of assignments */
  avgAssignmentPerDeal: number;
  /** Stage breakdown of currently active dispo deals */
  stageBreakdown: { stage: string; count: number; totalPrice: number }[];
  /** Dispo agent ownership — derived from FUB users array, taking the user that
   *  matches one of the dispo team names (Joseph Hooper, Jeb Burchett, etc).
   *  Each deal counted exactly once per owner per stage. */
  byOwner: { owner: string; activeCount: number; closedCount: number; assignedRev: number }[];
  /** Buy It Now (Subject-To and similar non-cash deal types) flag from customDealType */
  byDealType: { dealType: string; count: number; gross: number }[];
  /** Status flags */
  source: "fub";
  fetchedAt: string;
  error?: string;
};

// FUB user-name keywords that identify the dispo-side owner of a deal.
// Verified against live FUB data (May 2026): the dispo team in FUB is
// Jeff Davidson, Klint Ruud, Kalyn Kratzer, Jonathan Medlin (TC support),
// plus Joseph Hooper and Jeb Burchett who were originally listed but
// don't show up in many recent deal user arrays. Including all known
// dispo names so the picker prefers them over AQ reps.
const DISPO_TEAM_KEYWORDS = [
  "joseph", "jeb", "jeff davidson", "klint", "jordan",
];

/** Realistic assignment-fee bounds. customAssignedPrice in FUB is sometimes
 *  the property sale price ($150K+) and sometimes the actual assignment fee
 *  ($1K-$80K). Cap the average calculation to fee-range values. */
const MIN_FEE = 500;
const MAX_FEE = 100_000;

async function fetchAllPagesForPipeline(apiKey: string, pipelineId: number, signal?: AbortSignal): Promise<FubDeal[]> {
  const all: FubDeal[] = [];
  let offset = 0;
  const limit = 100;
  // FUB hard cap is 100 per page; loop until empty.
  for (let i = 0; i < 50; i++) { // safety: max 5,000 deals per pipeline
    const url = `${FUB_BASE}/deals?pipelineId=${pipelineId}&limit=${limit}&offset=${offset}&sort=-updated`;
    const resp = await fetch(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "X-System": "MTHS-Dashboard",
        "X-System-Key": "mths-kpi",
      },
      signal,
    });
    if (!resp.ok) {
      throw new Error(`FUB API error ${resp.status}: ${await resp.text()}`);
    }
    const data = await resp.json() as { deals?: FubDeal[]; _metadata?: { total?: number; nextLink?: string } };
    const deals = data.deals || [];
    all.push(...deals);
    if (deals.length < limit) break;
    offset += limit;
  }
  return all;
}

function parseMoney(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function isoWeekStart(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  // Move to Monday 00:00 UTC of that week
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + diff));
  return monday.toISOString().slice(0, 10);
}

/** Pick the dispo-team owner from a deal's users array.
 *  Rule: walk the users list in order, return first user whose name contains
 *  a dispo team keyword. If none match, fall back to first user.
 *  This implements the Aug 5 leadership ask: each deal assigned to ONE owner. */
function pickDispoOwner(deal: FubDeal): string | null {
  const users = deal.users || [];
  if (!users.length) return null;
  for (const u of users) {
    const lower = (u.name || "").toLowerCase();
    if (DISPO_TEAM_KEYWORDS.some(k => lower.includes(k))) {
      return u.name || null;
    }
  }
  // Fallback: first listed user (typically AQ rep)
  return users[0].name || null;
}

export async function fetchDispoFubData(apiKey: string): Promise<DispoFubData> {
  const fetchedAt = new Date().toISOString();
  const empty: DispoFubData = {
    totalActiveDispo: 0,
    totalClosedDispo: 0,
    totalDropped: 0,
    revenueAssignedByWeek: [],
    avgAssignmentPerDeal: 0,
    stageBreakdown: [],
    byOwner: [],
    byDealType: [],
    source: "fub",
    fetchedAt,
  };

  if (!apiKey) {
    return { ...empty, error: "FUB_API_KEY not configured" };
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60_000); // 60s total budget

    // Fetch dispo + dropped pipelines in parallel
    const [dispoDeals, droppedDeals] = await Promise.all([
      fetchAllPagesForPipeline(apiKey, DISPO_PIPELINE_ID, controller.signal),
      fetchAllPagesForPipeline(apiKey, DROPPED_PIPELINE_ID, controller.signal),
    ]);
    clearTimeout(timer);

    // Stage breakdown of currently active dispo deals (NOT yet closed)
    // YTD filter for closed count — only deals closed in the current calendar year.
    const stageMap = new Map<string, { count: number; totalPrice: number }>();
    let activeCount = 0;
    let closedCount = 0; // YTD only
    const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();

    for (const deal of dispoDeals) {
      const stage = deal.stageName || "Unknown";
      const isClosed = stage.toLowerCase().includes("closed");
      if (isClosed) {
        // Only count if closed THIS year. Use enteredStageAt (when deal entered Closed),
        // falling back to customUnderContractDate, projectedCloseDate, then createdAt.
        const dateRaw = deal.enteredStageAt || deal.customUnderContractDate || deal.projectedCloseDate || deal.createdAt;
        if (dateRaw) {
          const dt = new Date(dateRaw).getTime();
          if (!isNaN(dt) && dt >= yearStart) closedCount++;
        }
      } else {
        activeCount++;
        const cur = stageMap.get(stage) || { count: 0, totalPrice: 0 };
        cur.count++;
        cur.totalPrice += parseMoney(deal.price);
        stageMap.set(stage, cur);
      }
    }

    const stageBreakdown = Array.from(stageMap.entries())
      .map(([stage, s]) => ({ stage, count: s.count, totalPrice: s.totalPrice }))
      .sort((a, b) => b.count - a.count);

    // Per-owner counts (Joseph vs Jeb dedup happens here — each deal counted once)
    const ownerMap = new Map<string, { active: number; closed: number; assignedRev: number }>();
    for (const deal of dispoDeals) {
      const owner = pickDispoOwner(deal);
      if (!owner) continue;
      const cur = ownerMap.get(owner) || { active: 0, closed: 0, assignedRev: 0 };
      const stage = (deal.stageName || "").toLowerCase();
      if (stage.includes("closed")) {
        // YTD filter — only count deals closed this year
        const dateRaw = deal.enteredStageAt || deal.customUnderContractDate || deal.projectedCloseDate || deal.createdAt;
        if (dateRaw) {
          const dt = new Date(dateRaw).getTime();
          if (!isNaN(dt) && dt >= yearStart) cur.closed++;
        }
      } else {
        cur.active++;
      }
      const feeCandidate = parseMoney(deal.customAssignedPrice);
      if (feeCandidate >= MIN_FEE && feeCandidate <= MAX_FEE) {
        cur.assignedRev += feeCandidate;
      }
      ownerMap.set(owner, cur);
    }

    const byOwner = Array.from(ownerMap.entries())
      .map(([owner, s]) => ({
        owner,
        activeCount: s.active,
        closedCount: s.closed,
        assignedRev: s.assignedRev,
      }))
      .sort((a, b) => (b.activeCount + b.closedCount) - (a.activeCount + a.closedCount));

    // Revenue assigned per week — last 12 weeks
    const weekMap = new Map<string, { total: number; count: number }>();
    const cutoff = Date.now() - 12 * 7 * 24 * 3600 * 1000;
    for (const deal of dispoDeals) {
      const dateStr = deal.customDateAssigned || deal.customUnderContractDate;
      if (!dateStr) continue;
      const dt = new Date(dateStr).getTime();
      if (isNaN(dt) || dt < cutoff) continue;
      const wk = isoWeekStart(dateStr);
      if (!wk) continue;
      const price = parseMoney(deal.customAssignedPrice);
      if (price < MIN_FEE || price > MAX_FEE) continue;
      const cur = weekMap.get(wk) || { total: 0, count: 0 };
      cur.total += price;
      cur.count++;
      weekMap.set(wk, cur);
    }
    const revenueAssignedByWeek = Array.from(weekMap.entries())
      .map(([weekStart, s]) => ({ weekStart, total: s.total, count: s.count }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart));

    // Avg assignment FEE per deal — last 30 days. Filter to plausible fee range
    // (FUB customAssignedPrice is sometimes mistakenly the sale price).
    const cutoff30 = Date.now() - 30 * 24 * 3600 * 1000;
    let recentSum = 0, recentCount = 0;
    for (const deal of dispoDeals) {
      const dateStr = deal.customDateAssigned;
      if (!dateStr) continue;
      const dt = new Date(dateStr).getTime();
      if (isNaN(dt) || dt < cutoff30) continue;
      const price = parseMoney(deal.customAssignedPrice);
      if (price < MIN_FEE || price > MAX_FEE) continue; // skip invalid / sale-price entries
      recentSum += price;
      recentCount++;
    }
    const avgAssignmentPerDeal = recentCount > 0 ? recentSum / recentCount : 0;

    // Deal type breakdown (Cash, Subject-To, etc.) — Buy It Now
    const dealTypeMap = new Map<string, { count: number; gross: number }>();
    for (const deal of dispoDeals) {
      const dt = (deal.customDealType || "Unknown").trim() || "Unknown";
      const cur = dealTypeMap.get(dt) || { count: 0, gross: 0 };
      cur.count++;
      cur.gross += parseMoney(deal.price);
      dealTypeMap.set(dt, cur);
    }
    const byDealType = Array.from(dealTypeMap.entries())
      .map(([dealType, s]) => ({ dealType, count: s.count, gross: s.gross }))
      .sort((a, b) => b.count - a.count);

    return {
      totalActiveDispo: activeCount,
      totalClosedDispo: closedCount,
      totalDropped: droppedDeals.length,
      revenueAssignedByWeek,
      avgAssignmentPerDeal,
      stageBreakdown,
      byOwner,
      byDealType,
      source: "fub",
      fetchedAt,
    };
  } catch (e) {
    return {
      ...empty,
      error: `FUB fetch failed: ${(e as Error).message}`,
    };
  }
}
