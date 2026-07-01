/**
 * FUB Acquisitions data — pulls per-rep activity stats from Follow Up Boss
 * to replace the under-filled "Daily Activity" sheet as the live source of truth.
 *
 * Sources:
 *   - Appointments (FUB /appointments): per-rep appts set & executed
 *   - Calls (FUB /calls): per-rep call count (touch points proxy) + talk time
 *   - Deals in Acquisition pipeline (id=2): per-rep offers & contracts by stage
 *
 * Rep set (per Phase 8 decision): Korbin, Brandon, Jeff H, TJ, Ryan
 *
 * Output is merged into `acquisitionsActivity.agents[]` in sheets.ts.
 */

const FUB_BASE = "https://api.followupboss.com/v1";

// FUB userIds for the 5 reporting reps (verified May 2026 via /users).
// startDate is the FUB user's `created` timestamp — used to pro-rate YTD
// metrics so Ryan/TJ (who started mid-year) aren't compared
// against full-year peers without context.
export const AQ_REPS: { fubUserId: number; canonical: string; startDate: string }[] = [
  { fubUserId: 18, canonical: "Brandon",  startDate: "2023-08-28" },
  { fubUserId: 33, canonical: "Korbin",   startDate: "2024-05-22" },
  { fubUserId: 39, canonical: "Jeff H",   startDate: "2025-02-05" },
  { fubUserId: 50, canonical: "TJ",       startDate: "2025-12-05" },
  { fubUserId: 51, canonical: "Ryan",     startDate: "2026-01-24" },
];

export const REP_START_BY_CANONICAL: Record<string, string> = Object.fromEntries(
  AQ_REPS.map(r => [r.canonical, r.startDate])
);

const REP_BY_ID = new Map(AQ_REPS.map(r => [r.fubUserId, r.canonical]));
const REP_BY_NAME_KEY = new Map<string, string>();
for (const r of AQ_REPS) {
  // accept multiple name variants from FUB
  const variants: Record<string, string[]> = {
    Korbin: ["korbin"],
    Brandon: ["brandon"],
    "Jeff H": ["jeff h", "jeff henry"],
    TJ: ["tj ", "tj neal"],
    Ryan: ["ryan craig", "ryan "],
  };
  for (const v of (variants[r.canonical] || [])) {
    REP_BY_NAME_KEY.set(v.toLowerCase(), r.canonical);
  }
}

function canonicalFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [k, v] of REP_BY_NAME_KEY.entries()) {
    if (lower.includes(k)) return v;
  }
  return null;
}

export type AcqRepStats = {
  agent: string;             // canonical name
  startDate: string;         // ISO date the rep was created in FUB (their "start")
  daysSinceStart: number;    // whole days from startDate to now
  monthsSinceStart: number;  // float months (daysSinceStart / 30.44) — for pro-rating YTD
  apptsSet: number;          // appointments where rep is an invitee, start within window
  apptsExecuted: number;     // appts in window where end < now (assumed attended unless cancelled outcome)
  apptsCancelled: number;
  callCount: number;         // touch-points proxy
  talkTimeMin: number;       // sum(duration) / 60
  contracts: number;         // AQ deals in "In Negotiations" or later (under-contract-ish)
  offersMade: number;        // AQ deals where customPushDate within window OR stage shows offer
  hotLeads: number;          // AQ deals at "HOT Lead" stage assigned/related to rep
  newLeads: number;          // AQ deals at "New Lead Action & Move" or "New Lead No Contact"
};

export type AcqFubData = {
  windowDays: number;
  reps: AcqRepStats[];
  totals: {
    apptsSet: number;
    apptsExecuted: number;
    callCount: number;
    talkTimeMin: number;
    contracts: number;
    offersMade: number;
  };
  /** Flat list of deals with FUB Under-Contract date, for days-to-close join. */
  dealsWithUC?: { name: string; ucDate: string }[];
  fetchedAt: string;
  source: "fub";
  error?: string;
};

async function fubGet<T>(apiKey: string, path: string, signal?: AbortSignal): Promise<T> {
  const url = `${FUB_BASE}${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "X-System": "MTHS-Dashboard",
      "X-System-Key": "mths-kpi",
    },
    signal,
  });
  if (!resp.ok) throw new Error(`FUB ${path} -> ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

/** Generic FUB paginator using `nextLink` (cursor pagination).
 *  FUB disables offset-based pagination past ~2000 records. Cursor links
 *  returned in _metadata.nextLink are the only way to walk large datasets.
 *  earlyStop(record) lets the caller stop once results fall outside the
 *  desired window (e.g. older than cutoff). */
async function fubPaginate<T = any>(
  apiKey: string,
  firstPath: string,
  arrayKey: string,
  earlyStop?: (rec: T) => boolean,
  signal?: AbortSignal,
  maxPages = 60,
): Promise<T[]> {
  const all: T[] = [];
  let nextUrl: string | null = `${FUB_BASE}${firstPath}`;
  for (let i = 0; i < maxPages && nextUrl; i++) {
    const resp = await fetch(nextUrl, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
        "X-System": "MTHS-Dashboard",
        "X-System-Key": "mths-kpi",
      },
      signal,
    });
    if (!resp.ok) throw new Error(`FUB ${nextUrl} -> ${resp.status}: ${await resp.text()}`);
    const data = await resp.json() as any;
    const arr: T[] = data[arrayKey] || [];
    let shouldStop = false;
    for (const rec of arr) {
      if (earlyStop && earlyStop(rec)) { shouldStop = true; break; }
      all.push(rec);
    }
    if (shouldStop) break;
    if (arr.length === 0) break;
    nextUrl = data?._metadata?.nextLink || null;
  }
  return all;
}

async function fetchAllAppointments(apiKey: string, startISO: string, endISO: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/appointments?limit=100&start=${startISO}&end=${endISO}`,
    "appointments",
    undefined,
    signal,
    30,
  );
}

async function fetchRecentCalls(apiKey: string, cutoffISO: string, signal?: AbortSignal) {
  // Calls don't have a server-side date filter, so we walk newest-first via
  // nextLink and stop once we cross the cutoff.
  return fubPaginate<any>(
    apiKey,
    `/calls?limit=100&sort=-created`,
    "calls",
    (c) => (c.created || "") < cutoffISO,
    signal,
    60,
  );
}

async function fetchAqPipelineDeals(apiKey: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=2&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

async function fetchDispoPipelineDeals(apiKey: string, signal?: AbortSignal) {
  // Disposition pipeline (1): deals that have been signed UC — they include the original
  // AQ rep in users[] alongside dispo agents.
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=1&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

// Novations (pipeline 3): Jeff H runs a lot of these. Each entry counts as a contract.
async function fetchNovationsDeals(apiKey: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=3&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

// Flips (pipeline 25)
async function fetchFlipsDeals(apiKey: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=25&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

// Listing Referrals (pipeline 27)
async function fetchListingReferralsDeals(apiKey: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=27&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

// Underwriting (pipeline 14): a deal landing here means it crossed UC.
// We use enteredStageAt as the UC date because customUnderContractDate is
// not consistently populated by this team.
async function fetchUnderwritingDeals(apiKey: string, signal?: AbortSignal) {
  return fubPaginate<any>(
    apiKey,
    `/deals?pipelineId=14&limit=100&sort=-updated`,
    "deals",
    undefined,
    signal,
    30,
  );
}

export async function fetchAcqFubData(apiKey: string, windowDays = 30): Promise<AcqFubData> {
  const fetchedAt = new Date().toISOString();
  const empty: AcqFubData = {
    windowDays,
    reps: AQ_REPS.map(r => {
      const startMs = new Date(r.startDate + "T00:00:00Z").getTime();
      const daysSinceStart = Math.max(0, Math.floor((Date.now() - startMs) / 86_400_000));
      return {
        agent: r.canonical,
        startDate: r.startDate,
        daysSinceStart,
        monthsSinceStart: +(daysSinceStart / 30.44).toFixed(2),
        apptsSet: 0, apptsExecuted: 0, apptsCancelled: 0,
        callCount: 0, talkTimeMin: 0,
        contracts: 0, offersMade: 0,
        hotLeads: 0, newLeads: 0,
      };
    }),
    totals: { apptsSet: 0, apptsExecuted: 0, callCount: 0, talkTimeMin: 0, contracts: 0, offersMade: 0 },
    fetchedAt,
    source: "fub",
  };

  if (!apiKey) return { ...empty, error: "FUB_API_KEY not configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    const now = new Date();
    const start = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);
    const startISO = start.toISOString();
    const endISO = now.toISOString();

    const [appts, calls, aqDeals, dispoDeals, novationDeals, flipDeals, listingReferralDeals, uwDeals] = await Promise.all([
      fetchAllAppointments(apiKey, startISO, endISO, controller.signal),
      fetchRecentCalls(apiKey, startISO, controller.signal),
      fetchAqPipelineDeals(apiKey, controller.signal),
      fetchDispoPipelineDeals(apiKey, controller.signal),
      fetchNovationsDeals(apiKey, controller.signal),
      fetchFlipsDeals(apiKey, controller.signal),
      fetchListingReferralsDeals(apiKey, controller.signal),
      fetchUnderwritingDeals(apiKey, controller.signal),
    ]);
    clearTimeout(timer);

    // Initialize map keyed by canonical name
    const statsByRep: Record<string, AcqRepStats> = {};
    const nowMs = now.getTime();
    for (const r of AQ_REPS) {
      const startMs = new Date(r.startDate + "T00:00:00Z").getTime();
      const daysSinceStart = Math.max(0, Math.floor((nowMs - startMs) / 86_400_000));
      const monthsSinceStart = +(daysSinceStart / 30.44).toFixed(2);
      statsByRep[r.canonical] = {
        agent: r.canonical,
        startDate: r.startDate,
        daysSinceStart,
        monthsSinceStart,
        apptsSet: 0, apptsExecuted: 0, apptsCancelled: 0,
        callCount: 0, talkTimeMin: 0,
        contracts: 0, offersMade: 0,
        hotLeads: 0, newLeads: 0,
      };
    }

    // ----- Appointments: each invitee that's a rep counts as 1 set
    for (const a of appts) {
      const startStr = a.start || a.created;
      const endStr = a.end || startStr;
      const sMs = startStr ? new Date(startStr).getTime() : 0;
      const eMs = endStr ? new Date(endStr).getTime() : 0;
      const outcome = (a.outcome?.name || a.outcome || "").toString().toLowerCase();
      const isCancelled = outcome.includes("cancel") || (a.title || "").toLowerCase().includes("cancel");

      const invitees: any[] = a.invitees || [];
      const repsInThis = new Set<string>();
      for (const inv of invitees) {
        // Prefer userId lookup; fall back to name match
        let canonical: string | null = null;
        if (inv.userId && REP_BY_ID.has(inv.userId)) canonical = REP_BY_ID.get(inv.userId) || null;
        if (!canonical) canonical = canonicalFromName(inv.name);
        if (canonical) repsInThis.add(canonical);
      }
      for (const rep of repsInThis) {
        const s = statsByRep[rep];
        s.apptsSet += 1;
        if (isCancelled) {
          s.apptsCancelled += 1;
        } else if (eMs > 0 && eMs <= nowMs) {
          s.apptsExecuted += 1;
        }
      }
    }

    // ----- Calls
    for (const c of calls) {
      let canonical: string | null = null;
      if (c.userId && REP_BY_ID.has(c.userId)) canonical = REP_BY_ID.get(c.userId) || null;
      if (!canonical) canonical = canonicalFromName(c.userName);
      if (!canonical) continue;
      const s = statsByRep[canonical];
      s.callCount += 1;
      s.talkTimeMin += Math.round(((c.duration || 0) / 60) * 10) / 10;
    }

    // ----- AQ pipeline deals — per-rep attribution via `users` array on each deal.
    // OFFERS: a deal in "In Negotiations" stage (id 169) means an offer was made.
    //         enteredStageAt tells us WHEN they entered negotiations — within window.
    // CONTRACTS: a deal with customUnderContractDate set OR mutualAcceptanceDate within window,
    //            OR a deal that's progressed beyond AQ (closed deal etc.)
    const cutoffMs = start.getTime();
    let teamOffersFallback = 0;
    let teamContractsFallback = 0;
    for (const d of aqDeals) {
      const stage = (d.stageName || "").toLowerCase();
      const enteredStageAt = d.enteredStageAt ? new Date(d.enteredStageAt).getTime() : 0;
      const ucDateStr = d.customUnderContractDate || d.mutualAcceptanceDate;
      const ucDateMs = ucDateStr ? new Date(ucDateStr).getTime() : 0;
      const stageInNegotiation = stage.includes("negotiation") || stage.includes("under contract");
      const isOfferInWindow = stageInNegotiation && enteredStageAt >= cutoffMs;
      const isContractInWindow = ucDateMs >= cutoffMs;

      const users: any[] = d.users || [];
      const repsOnDeal = new Set<string>();
      for (const u of users) {
        let canonical: string | null = null;
        if (u.id && REP_BY_ID.has(u.id)) canonical = REP_BY_ID.get(u.id) || null;
        if (!canonical) canonical = canonicalFromName(u.name);
        if (canonical) repsOnDeal.add(canonical);
      }

      if (isOfferInWindow) {
        if (repsOnDeal.size > 0) {
          for (const rep of repsOnDeal) statsByRep[rep].offersMade += 1;
        } else {
          teamOffersFallback += 1;
        }
      }
      if (isContractInWindow) {
        if (repsOnDeal.size > 0) {
          for (const rep of repsOnDeal) statsByRep[rep].contracts += 1;
        } else {
          teamContractsFallback += 1;
        }
      }
      // Hot lead & new lead snapshot counts (current state, not in-window)
      if (stage.includes("hot lead")) {
        for (const rep of repsOnDeal) statsByRep[rep].hotLeads += 1;
      }
      if (stage.includes("new lead")) {
        for (const rep of repsOnDeal) statsByRep[rep].newLeads += 1;
      }
    }
    // ----- Disposition pipeline: deals that signed UC. The AQ rep stays in users[]
    // alongside dispo agents, so we credit them based on customUnderContractDate (canonical
    // contract signal) when it falls in the window. This is the authoritative contract count.
    const aqRepIds = new Set(AQ_REPS.map(r => r.fubUserId));
    for (const d of dispoDeals) {
      const ucStr = d.customUnderContractDate;
      if (!ucStr) continue;
      const ucMs = new Date(ucStr).getTime();
      if (ucMs < cutoffMs) continue;
      const users: any[] = d.users || [];
      const aqRepsOnDeal = new Set<string>();
      for (const u of users) {
        if (u.id && aqRepIds.has(u.id)) {
          const canonical = REP_BY_ID.get(u.id);
          if (canonical) aqRepsOnDeal.add(canonical);
        }
      }
      if (aqRepsOnDeal.size > 0) {
        // Credit ONE primary AQ rep per deal to avoid double-counting (lowest userId = original AQ)
        const primary = users
          .filter((u: any) => u.id && aqRepIds.has(u.id))
          .sort((a: any, b: any) => (a.id || 0) - (b.id || 0))[0];
        if (primary?.id) {
          const canonical = REP_BY_ID.get(primary.id);
          if (canonical) statsByRep[canonical].contracts += 1;
        }
      } else {
        teamContractsFallback += 1;
      }
    }

    // ----- Novations / Flips / Listing Referrals: count each deal as a contract
    // for any rep on the deal whose enteredStageAt or earliest activity is in window.
    // Jeff H closes a meaningful share of these — without them they show 0.
    const sideDeals = [...novationDeals, ...flipDeals, ...listingReferralDeals];
    for (const d of sideDeals) {
      const enteredStageAt = d.enteredStageAt ? new Date(d.enteredStageAt).getTime() : 0;
      const created = d.created ? new Date(d.created).getTime() : 0;
      const ucStr = d.customUnderContractDate;
      const ucMs = ucStr ? new Date(ucStr).getTime() : 0;
      const dealDate = ucMs || enteredStageAt || created;
      if (dealDate < cutoffMs) continue;
      const users: any[] = d.users || [];
      const repsOnDeal = new Set<string>();
      for (const u of users) {
        let canonical: string | null = null;
        if (u.id && REP_BY_ID.has(u.id)) canonical = REP_BY_ID.get(u.id) || null;
        if (!canonical) canonical = canonicalFromName(u.name);
        if (canonical) repsOnDeal.add(canonical);
      }
      if (repsOnDeal.size > 0) {
        // Credit ONE primary AQ rep per deal (lowest userId = original acquirer)
        const primary = users
          .filter((u: any) => u.id && REP_BY_ID.has(u.id))
          .sort((a: any, b: any) => (a.id || 0) - (b.id || 0))[0];
        if (primary?.id) {
          const canonical = REP_BY_ID.get(primary.id);
          if (canonical) statsByRep[canonical].contracts += 1;
        }
      }
    }

    // Distribute unattributed offers/contracts proportional to appts so totals stay accurate.
    const totalApptsSet = Object.values(statsByRep).reduce((sum, s) => sum + s.apptsSet, 0);
    if (totalApptsSet > 0 && (teamOffersFallback > 0 || teamContractsFallback > 0)) {
      for (const s of Object.values(statsByRep)) {
        const share = s.apptsSet / totalApptsSet;
        s.offersMade += Math.round(teamOffersFallback * share);
        s.contracts += Math.round(teamContractsFallback * share);
      }
    }

    const reps = AQ_REPS.map(r => statsByRep[r.canonical]);
    const totals = reps.reduce((t, r) => ({
      apptsSet: t.apptsSet + r.apptsSet,
      apptsExecuted: t.apptsExecuted + r.apptsExecuted,
      callCount: t.callCount + r.callCount,
      talkTimeMin: t.talkTimeMin + r.talkTimeMin,
      contracts: t.contracts + r.contracts,
      offersMade: t.offersMade + r.offersMade,
    }), { apptsSet: 0, apptsExecuted: 0, callCount: 0, talkTimeMin: 0, contracts: 0, offersMade: 0 });

    // Days-to-close feed: every deal with a UC date.
    // Priority order for UC date:
    //   1. customUnderContractDate (legacy field — rarely populated by this team)
    //   2. mutualAcceptanceDate (also rarely populated)
    //   3. enteredStageAt for deals in Underwriting (14) or Disposition (1)
    //      pipelines — this is when the deal CROSSED UC for this team.
    // Dedupe by deal id; prefer the earliest UC date when a deal appears in
    // multiple pipelines.
    const dealsWithUC: { name: string; ucDate: string }[] = [];
    const ucByDealId = new Map<number, { name: string; ucDate: string }>();
    type DealSource = { d: any; pipelineUC?: boolean };
    const ranked: DealSource[] = [
      ...uwDeals.map(d => ({ d, pipelineUC: true })),
      ...dispoDeals.map(d => ({ d, pipelineUC: true })),
      ...aqDeals.map(d => ({ d, pipelineUC: false })),
      ...novationDeals.map(d => ({ d, pipelineUC: false })),
      ...flipDeals.map(d => ({ d, pipelineUC: false })),
      ...listingReferralDeals.map(d => ({ d, pipelineUC: false })),
    ];
    for (const { d, pipelineUC } of ranked) {
      const id = (d as any)?.id;
      const nm = (d as any).name || (d as any).deal || "";
      if (!nm) continue;
      const explicitUC =
        (d as any).customUnderContractDate || (d as any).mutualAcceptanceDate;
      const ucDate = explicitUC
        ? String(explicitUC)
        : (pipelineUC && (d as any).enteredStageAt ? String((d as any).enteredStageAt) : "");
      if (!ucDate) continue;
      const entry = { name: String(nm), ucDate };
      if (!id) {
        dealsWithUC.push(entry);
        continue;
      }
      const prev = ucByDealId.get(id);
      if (!prev || new Date(ucDate).getTime() < new Date(prev.ucDate).getTime()) {
        ucByDealId.set(id, entry);
      }
    }
    for (const e of ucByDealId.values()) dealsWithUC.push(e);
    return { windowDays, reps, totals, dealsWithUC, fetchedAt, source: "fub" };
  } catch (e) {
    return { ...empty, error: `FUB AQ fetch failed: ${(e as Error).message}` };
  }
}
