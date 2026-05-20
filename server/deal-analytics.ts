/**
 * Deal Analytics — Phase 2 dashboard views from the Historic Deal KPIs sheet.
 *
 * Inputs: the same parsed CCCDeal[] used by cashConversionCycle in sheets.ts,
 * plus the rawHistoric rows (so we can include open deals — CCC requires a
 * Close Date, but Current Deals must include deals with NO close date).
 *
 * Outputs (all surfaced on /api/kpi-data):
 *   - currentDeals          { activeDeals, pipelineDeals, summary, byPhase }
 *   - aqFunnel              Marketing → Lead → Net Lead → Appt Set → Appt Executed → UC → Closed
 *   - dealTypeSegmentation  { breakdown[], totals }
 *   - lmAqCombos            { combos[], top }
 */

import { parseFlexDate } from "./date-utils";

const COL = {
  marketingLeadSource: "Marketing Lead Source",
  dealType: "Deal Type",
  leadManager: "Lead Manager",
  aqAgent: "AQ Agent",
  dispoManager: "Dispo Manager",
  tc: "TC",
  leadCreated: "Lead Created Date",
  netLead: "Net Lead Created Date",
  apptSet: "Appt Set Date",
  apptExec: "Appt Executed Date",
  uc: "UC Date",
  purchasePrice: "Purchase Price",
  address: "Street Address",
  city: "City",
  zip: "Zip Code",
  bed: "Bed",
  bath: "Bath",
  sqft: "Square Feet",
  yearBuilt: "Year Build",
  purchaseDate: "Purchase Date",
  pushedDate: "Pushed Date",
  pushedPrice: "Pushed Price",
  dateAssigned: "Date Assigned",
  assignedPrice: "Assigned Price",
  salePrice: "Sale Price",
  closeDate: "Close Date",
  profit: "Profit",
};

const NULLISH = new Set(["", "No users found", "TBD", "N/A", "n/a", "-"]);
function clean(v: any): string {
  const s = String(v ?? "").trim();
  return NULLISH.has(s) ? "" : s;
}

/**
 * Normalize person-name casing: "Tj Neal" vs "TJ Neal" should match. We
 * Title-Case each token, but preserve known short uppercase forms (TJ, JJ,
 * AJ, DJ, etc.) and the common LM/AQA names used at MTHS.
 */
const KNOWN_NAMES: Record<string, string> = {
  "tj neal": "TJ Neal",
  "jj": "JJ",
  "aj": "AJ",
  "dj": "DJ",
  "jeff h": "Jeff Henry",
  "jeff henry": "Jeff Henry",
  "jeff hentry": "Jeff Henry",
  "johnathan medlin": "Jonathan Medlin",
  "jonathan medlin": "Jonathan Medlin",
  "korbin hoffmann": "Korbin Hoffmann",
  "brandon speer": "Brandon Speer",
  "ryan craig": "Ryan Craig",
  "ryan newton": "Ryan Newton",
};
function normalizeName(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return "";
  const key = trimmed.toLowerCase();
  if (KNOWN_NAMES[key]) return KNOWN_NAMES[key];
  // Generic Title Case as fallback
  return trimmed.split(/\s+/).map((tok) => {
    const lc = tok.toLowerCase();
    if (KNOWN_NAMES[lc]) return KNOWN_NAMES[lc];
    return lc.charAt(0).toUpperCase() + lc.slice(1);
  }).join(" ");
}
function money(v: any): number {
  const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Derive the deal's current phase from which date columns are filled.
 * Order (latest stage wins):
 *   closed → assigned → pushed → uc → appt_executed → appt_set → net_lead → lead → unknown
 */
export function derivePhase(row: any): {
  phase: string;
  phaseRank: number;
  isOpen: boolean;
} {
  const has = (k: string) => !!parseFlexDate(clean(row[k]));
  // phaseRank: 0=unknown, 1=lead, 2=net_lead, 3=appt_set, 4=appt_exec,
  //            5=uc, 6=pushed, 7=assigned, 8=closed
  if (has(COL.closeDate)) return { phase: "Closed", phaseRank: 8, isOpen: false };
  if (has(COL.dateAssigned)) return { phase: "Assigned", phaseRank: 7, isOpen: true };
  if (has(COL.pushedDate)) return { phase: "Pushed to Buyer", phaseRank: 6, isOpen: true };
  if (has(COL.uc)) return { phase: "Under Contract", phaseRank: 5, isOpen: true };
  if (has(COL.apptExec)) return { phase: "Appt Executed", phaseRank: 4, isOpen: true };
  if (has(COL.apptSet)) return { phase: "Appt Set", phaseRank: 3, isOpen: true };
  if (has(COL.netLead)) return { phase: "Net Lead", phaseRank: 2, isOpen: true };
  if (has(COL.leadCreated)) return { phase: "Lead", phaseRank: 1, isOpen: true };
  return { phase: "Unknown", phaseRank: 0, isOpen: true };
}

export type CurrentDeal = {
  id: string;
  address: string;
  city: string;
  zip: string;
  phase: string;
  phaseRank: number;
  isOpen: boolean;
  leadSource: string;
  dealType: string;
  leadManager: string;
  aqAgent: string;
  dispoManager: string;
  tc: string;
  // Key dates (most useful)
  ddDate: string; // = Pushed Date (when due-diligence-completed / pushed to buyer)
  ucDate: string;
  closeDate: string;
  dateAssigned: string;
  // Money
  purchasePrice: number;
  pushedPrice: number;
  assignedPrice: number;
  salePrice: number;
  profit: number;
  projectedRevenue: number; // best-available: salePrice → assignedPrice → pushedPrice → purchasePrice
  // Tenure on this deal
  ageDays: number | null; // days since lead created
};

const isoOf = (s: string): string => {
  const d = parseFlexDate(s);
  if (!d) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

function rowToDeal(row: any, idx: number): CurrentDeal {
  const { phase, phaseRank, isOpen } = derivePhase(row);
  const purchase = money(row[COL.purchasePrice]);
  const pushed = money(row[COL.pushedPrice]);
  const assigned = money(row[COL.assignedPrice]);
  const sale = money(row[COL.salePrice]);
  const projected = sale || assigned || pushed || purchase;
  const leadIso = isoOf(clean(row[COL.leadCreated]));
  const leadDate = parseFlexDate(leadIso);
  const ageDays = leadDate ? Math.floor((Date.now() - leadDate.getTime()) / 86400000) : null;
  return {
    id: clean(row["f"]) || `row-${idx}`,
    address: clean(row[COL.address]),
    city: clean(row[COL.city]),
    zip: clean(row[COL.zip]),
    phase,
    phaseRank,
    isOpen,
    leadSource: clean(row[COL.marketingLeadSource]),
    dealType: clean(row[COL.dealType]) || "Unspecified",
    leadManager: normalizeName(clean(row[COL.leadManager])),
    aqAgent: normalizeName(clean(row[COL.aqAgent])),
    dispoManager: normalizeName(clean(row[COL.dispoManager])),
    tc: clean(row[COL.tc]),
    ddDate: isoOf(clean(row[COL.pushedDate])),
    ucDate: isoOf(clean(row[COL.uc])),
    closeDate: isoOf(clean(row[COL.closeDate])),
    dateAssigned: isoOf(clean(row[COL.dateAssigned])),
    purchasePrice: purchase,
    pushedPrice: pushed,
    assignedPrice: assigned,
    salePrice: sale,
    profit: money(row[COL.profit]),
    projectedRevenue: projected,
    ageDays,
  };
}

/**
 * Build the Current Deals overview: every deal that is NOT yet closed.
 * Returns deals sorted newest first (by ageDays asc means lower ageDays first;
 * but team wants newest-activity first → sort by phaseRank desc then ageDays asc).
 */
export function buildCurrentDeals(rows: any[]): {
  activeDeals: CurrentDeal[];
  byPhase: Record<string, { count: number; projectedRevenue: number }>;
  byDealType: Record<string, { count: number; projectedRevenue: number }>;
  byLeadManager: Record<string, { count: number; projectedRevenue: number }>;
  byAqAgent: Record<string, { count: number; projectedRevenue: number }>;
  summary: {
    totalOpen: number;
    totalProjectedRevenue: number;
    avgProjectedPerDeal: number;
    underContract: number;
    pushedToBuyer: number;
    assigned: number;
  };
} {
  const all = rows.map((r, i) => rowToDeal(r, i));
  // Open = no close date OR future close date AFTER today
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const activeDeals = all.filter((d) => {
    if (!d.closeDate) return d.isOpen; // no close date and phase < closed
    // has close date — only consider "open" if close date is in the future
    const cd = parseFlexDate(d.closeDate);
    if (!cd) return true;
    return cd.getTime() >= today.getTime();
  });

  const byPhase: Record<string, { count: number; projectedRevenue: number }> = {};
  const byDealType: Record<string, { count: number; projectedRevenue: number }> = {};
  const byLeadManager: Record<string, { count: number; projectedRevenue: number }> = {};
  const byAqAgent: Record<string, { count: number; projectedRevenue: number }> = {};
  for (const d of activeDeals) {
    const bump = (m: typeof byPhase, k: string) => {
      const key = k || "Unspecified";
      if (!m[key]) m[key] = { count: 0, projectedRevenue: 0 };
      m[key].count += 1;
      m[key].projectedRevenue += d.projectedRevenue || 0;
    };
    bump(byPhase, d.phase);
    bump(byDealType, d.dealType);
    bump(byLeadManager, d.leadManager);
    bump(byAqAgent, d.aqAgent);
  }

  const totalProjectedRevenue = activeDeals.reduce((s, d) => s + (d.projectedRevenue || 0), 0);
  const summary = {
    totalOpen: activeDeals.length,
    totalProjectedRevenue,
    avgProjectedPerDeal: activeDeals.length ? Math.round(totalProjectedRevenue / activeDeals.length) : 0,
    underContract: activeDeals.filter((d) => d.phase === "Under Contract").length,
    pushedToBuyer: activeDeals.filter((d) => d.phase === "Pushed to Buyer").length,
    assigned: activeDeals.filter((d) => d.phase === "Assigned").length,
  };

  // Sort newest first: by phaseRank desc, then ageDays asc
  activeDeals.sort((a, b) => b.phaseRank - a.phaseRank || (a.ageDays ?? 999) - (b.ageDays ?? 999));

  return { activeDeals, byPhase, byDealType, byLeadManager, byAqAgent, summary };
}

/**
 * Build the AQ-page funnel: counts at each stage within a rolling window.
 *
 *   Net Leads (Marketing KPI proxy) → Appt Set → Appt Executed → UC → Contracts
 *
 * Counts based on which DATE column has a value falling INSIDE the window.
 * Each stage is independent (a deal can advance through multiple stages in
 * one window). This gives a "how much activity is happening" view, NOT a
 * cohort-conversion view.
 */
export function buildAqFunnel(rows: any[], windowDays: number = 30, marketingNetLeads?: number): {
  windowDays: number;
  stages: { label: string; value: number; fromTop: number; fromPrev: number | null }[];
  source: string;
} {
  const cutoff = Date.now() - windowDays * 86400000;
  const inWindow = (dateStr: string): boolean => {
    const d = parseFlexDate(dateStr);
    return d ? d.getTime() >= cutoff : false;
  };

  let netLeads = 0;
  let apptSet = 0;
  let apptExec = 0;
  let uc = 0;
  let closed = 0;
  for (const r of rows) {
    if (inWindow(clean(r[COL.netLead]))) netLeads += 1;
    if (inWindow(clean(r[COL.apptSet]))) apptSet += 1;
    if (inWindow(clean(r[COL.apptExec]))) apptExec += 1;
    if (inWindow(clean(r[COL.uc]))) uc += 1;
    if (inWindow(clean(r[COL.closeDate]))) closed += 1;
  }

  // Prefer Marketing KPI net leads as the source of truth if provided & non-zero
  // (matches the 5/20 review decision to use Marketing 2026 KPIs as authoritative)
  const topValue = marketingNetLeads && marketingNetLeads > 0 ? marketingNetLeads : netLeads;
  const source = marketingNetLeads && marketingNetLeads > 0
    ? "marketing_kpis_for_top + historic_for_stages"
    : "historic_deal_kpis_only";

  const stages = [
    { label: "Net Leads", value: topValue },
    { label: "Appts Set", value: apptSet },
    { label: "Appts Executed", value: apptExec },
    { label: "Under Contract", value: uc },
    { label: "Closed", value: closed },
  ].map((s, i, arr) => {
    const top = arr[0].value;
    const prev = i > 0 ? arr[i - 1].value : null;
    return {
      label: s.label,
      value: s.value,
      fromTop: top > 0 ? Math.round((s.value / top) * 1000) / 10 : 0,
      fromPrev: prev !== null && prev > 0 ? Math.round((s.value / prev) * 1000) / 10 : null,
    };
  });
  return { windowDays, stages, source };
}

/**
 * Deal-type segmentation: breakdown across Cash / No-cash / Reno / Sub-2 /
 * Flip / Listing / Referral. Falls back to the literal Deal Type value.
 */
export function buildDealTypeSegmentation(rows: any[], windowDays: number = 90): {
  windowDays: number;
  breakdown: { dealType: string; count: number; totalGross: number; totalProfit: number; avgProfit: number }[];
  totals: { count: number; gross: number; profit: number };
} {
  const cutoff = Date.now() - windowDays * 86400000;
  const stat: Record<string, { count: number; gross: number; profit: number }> = {};
  for (const r of rows) {
    // Only count deals whose CLOSE DATE is in the window
    const cd = parseFlexDate(clean(r[COL.closeDate]));
    if (!cd || cd.getTime() < cutoff) continue;
    const dt = (clean(r[COL.dealType]) || "Unspecified").trim();
    if (!stat[dt]) stat[dt] = { count: 0, gross: 0, profit: 0 };
    stat[dt].count += 1;
    stat[dt].gross += money(r[COL.salePrice]) || money(r[COL.assignedPrice]) || money(r[COL.pushedPrice]) || 0;
    stat[dt].profit += money(r[COL.profit]);
  }
  const breakdown = Object.entries(stat).map(([dealType, v]) => ({
    dealType,
    count: v.count,
    totalGross: Math.round(v.gross),
    totalProfit: Math.round(v.profit),
    avgProfit: v.count > 0 ? Math.round(v.profit / v.count) : 0,
  })).sort((a, b) => b.totalProfit - a.totalProfit);

  const totals = breakdown.reduce(
    (acc, b) => ({ count: acc.count + b.count, gross: acc.gross + b.totalGross, profit: acc.profit + b.totalProfit }),
    { count: 0, gross: 0, profit: 0 },
  );
  return { windowDays, breakdown, totals };
}

/**
 * Lead Manager × AQ Agent combos — which pairs are producing deals?
 * Returns top combos by closed-deal count, then by profit.
 */
export function buildLmAqCombos(rows: any[], windowDays: number = 90): {
  windowDays: number;
  combos: { leadManager: string; aqAgent: string; deals: number; profit: number; avgProfit: number }[];
  topByDeals: { leadManager: string; aqAgent: string; deals: number; profit: number }[];
  topByProfit: { leadManager: string; aqAgent: string; deals: number; profit: number }[];
} {
  const cutoff = Date.now() - windowDays * 86400000;
  const stat: Record<string, { lm: string; aq: string; deals: number; profit: number }> = {};
  for (const r of rows) {
    const cd = parseFlexDate(clean(r[COL.closeDate]));
    if (!cd || cd.getTime() < cutoff) continue;
    const lm = normalizeName(clean(r[COL.leadManager])) || "Unassigned";
    const aq = normalizeName(clean(r[COL.aqAgent])) || "Unassigned";
    const key = `${lm}__${aq}`;
    if (!stat[key]) stat[key] = { lm, aq, deals: 0, profit: 0 };
    stat[key].deals += 1;
    stat[key].profit += money(r[COL.profit]);
  }
  const combos = Object.values(stat).map((c) => ({
    leadManager: c.lm,
    aqAgent: c.aq,
    deals: c.deals,
    profit: Math.round(c.profit),
    avgProfit: c.deals > 0 ? Math.round(c.profit / c.deals) : 0,
  })).sort((a, b) => b.deals - a.deals || b.profit - a.profit);

  const topByDeals = [...combos].sort((a, b) => b.deals - a.deals).slice(0, 10)
    .map(({ leadManager, aqAgent, deals, profit }) => ({ leadManager, aqAgent, deals, profit }));
  const topByProfit = [...combos].sort((a, b) => b.profit - a.profit).slice(0, 10)
    .map(({ leadManager, aqAgent, deals, profit }) => ({ leadManager, aqAgent, deals, profit }));

  return { windowDays, combos, topByDeals, topByProfit };
}
