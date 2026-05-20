/**
 * Red-state action library — per-metric recommended next action + records link.
 *
 * Added 5/20 review: when a KPI tile is red (status==="red" or pulsing red),
 * hovering the tile reveals (a) what to do next and (b) a link to the underlying
 * records (Google Sheet row, FUB filtered list, CallRail recent calls, etc.).
 *
 * Keys are stable identifiers (snake_case). Add new keys as new red-state tiles
 * appear. Generic fallback applies when no specific entry is found.
 */

// Master KPIs workbook (Sales/Marketing/Dispo/Historic — all live here)
export const MASTER_KPIS_SHEET_ID = "1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0";
// Per-worksheet (gid) anchors so a deep link drops the user on the right tab
const GID = {
  historicDeals: 17564421,
  sales2026: 565376861,
  marketing2026: 1262354506,
  dispo2026: 1540577449,
} as const;

const sheet = (gid: number) =>
  `https://docs.google.com/spreadsheets/d/${MASTER_KPIS_SHEET_ID}/edit#gid=${gid}`;

const fubBase = "https://app.followupboss.com";
const callRailBase = "https://app.callrail.com";

export interface RedAction {
  /** Short label shown in the tooltip header */
  title: string;
  /** Specific recommended next action — keep to 1-2 short sentences */
  action: string;
  /** Link to the underlying records (Sheet row, FUB filtered list, etc.) */
  recordsHref?: string;
  /** Display label for the records link button */
  recordsLabel?: string;
}

/**
 * Metric registry. Keys map to short identifiers that tile callers pass via
 * the `metricKey` prop. Add entries here as new red-state tiles appear.
 */
export const RED_ACTIONS: Record<string, RedAction> = {
  // === Marketing / top of funnel ===
  net_leads: {
    title: "Net Leads below target",
    action: "Check Marketing 2026 KPIs for spend pace. If spend is on target but net leads aren't, push lead managers on speed-to-lead.",
    recordsHref: sheet(GID.marketing2026),
    recordsLabel: "Open Marketing KPIs",
  },
  gross_leads: {
    title: "Gross Leads below target",
    action: "Verify campaigns are live and CallRail is forwarding. Talk to Trey about creative refresh if channel volume has dropped.",
    recordsHref: sheet(GID.marketing2026),
    recordsLabel: "Open Marketing KPIs",
  },
  cost_per_appt: {
    title: "Cost per Appt above target",
    action: "Pull this week's spend by channel and divide by appts executed. Reallocate spend off the worst-performing channel.",
    recordsHref: sheet(GID.marketing2026),
    recordsLabel: "Open Marketing KPIs",
  },
  contact_rate: {
    title: "Contact Rate below target",
    action: "Pull dial logs for the lead manager. Check speed-to-lead — anything beyond 5 minutes kills contact rate.",
    recordsHref: `${callRailBase}/calls`,
    recordsLabel: "Open CallRail",
  },

  // === Lead-manager / acquisitions funnel ===
  appts_set: {
    title: "Appts Set below pace",
    action: "Pull this week's net leads → appts in FUB. If conversion is fine, the issue is upstream lead volume — see Marketing.",
    recordsHref: `${fubBase}/2/people/list?stage=qualified`,
    recordsLabel: "Open FUB qualified leads",
  },
  appts_executed: {
    title: "Appts Executed gap vs Set",
    action: "Review no-show rate. If gap > 15%, push for confirmation calls 24h before each appt.",
    recordsHref: `${fubBase}/2/appointments`,
    recordsLabel: "Open FUB appointments",
  },
  contracts: {
    title: "Contracts below pace",
    action: "Audit AQA close rate by rep. Joint-call low performers this week. Check pricing — over-bidding usually shows up here first.",
    recordsHref: sheet(GID.historicDeals),
    recordsLabel: "Open Historic Deal KPIs",
  },
  appt_to_contract: {
    title: "Appt → Contract conversion red",
    action: "Pull last 10 executed appts that didn't sign. Listen to call recordings — what objection are we losing on?",
    recordsHref: `${callRailBase}/calls`,
    recordsLabel: "Open CallRail",
  },
  net_to_appt: {
    title: "Net → Appt conversion red",
    action: "Lead-manager performance issue. Pull dial volume and connect rate by LM, schedule a 1:1.",
    recordsHref: `${fubBase}/2/people/list?stage=qualified`,
    recordsLabel: "Open FUB net leads",
  },

  // === Per-rep weekly streaks (System 60 territory) ===
  talk_time: {
    title: "Talk Time streak (3+ weeks red)",
    action: "Block 90 min of dial time on the rep's calendar daily this week. Pair them with Brandon for 30 min of live dials.",
    recordsHref: `${callRailBase}/calls`,
    recordsLabel: "Open CallRail user view",
  },
  touch_points: {
    title: "Touch Points streak",
    action: "Pull active pipeline for this rep. Set a minimum 3-touch cadence per active deal this week (call + text + email).",
    recordsHref: `${fubBase}/2/people`,
    recordsLabel: "Open FUB people",
  },
  contact_rate_day1: {
    title: "Day-1 Contact Rate below 80%",
    action: "Speed-to-lead is broken. Verify FUB notifications are firing — and that the rep's phone isn't on Do Not Disturb during business hours.",
    recordsHref: `${fubBase}/2/people?filter=created_today`,
    recordsLabel: "Open FUB today's leads",
  },

  profit_per_deal: {
    title: "Avg Profit per Deal below target",
    action: "Margin compression — pull the last 10 closed deals and check sale prices vs assigned prices. Either we're bidding too high or under-pricing on the buyer side.",
    recordsHref: sheet(GID.historicDeals),
    recordsLabel: "Open Historic Deal KPIs",
  },

  // === Pipeline / deal health ===

  uc_to_pushed: {
    title: "UC → Pushed cycle too long",
    action: "Walk the open UC list. Anything >7 days under contract without disposition action gets a same-day status from Jeff H.",
    recordsHref: sheet(GID.historicDeals),
    recordsLabel: "Open Historic Deal KPIs",
  },
  pushed_to_assigned: {
    title: "Pushed → Assigned cycle too long",
    action: "Dispo team review: any deal pushed > 5 days without a buyer match needs price re-review or buyer-list expansion.",
    recordsHref: sheet(GID.dispo2026),
    recordsLabel: "Open Dispo KPIs",
  },
  dropped_contracts: {
    title: "Dropped Contracts above tolerance",
    action: "Pull cancellation reasons from TC notes. If two+ cite same reason (title/financing/seller change-of-mind), escalate to Kalyn.",
    recordsHref: sheet(GID.historicDeals),
    recordsLabel: "Open Historic Deal KPIs",
  },
};

/** Generic fallback when a tile signals red but has no specific entry. */
export const RED_ACTION_FALLBACK: RedAction = {
  title: "KPI red",
  action: "This tile is behind target. Open the underlying records to investigate the drivers — usually drop-off shows up in either lead volume, lead-manager conversion, or AQA close rate.",
  recordsHref: sheet(GID.historicDeals),
  recordsLabel: "Open Historic Deal KPIs",
};

export function getRedAction(metricKey?: string): RedAction {
  if (!metricKey) return RED_ACTION_FALLBACK;
  return RED_ACTIONS[metricKey] ?? RED_ACTION_FALLBACK;
}

/**
 * Build a deep link to a specific Historic Deal KPIs row by row number.
 * The sheet's first row is the header; pass the 1-based row number where the deal lives.
 */
export function historicDealRowLink(rowNum: number): string {
  return `${sheet(GID.historicDeals)}&range=A${rowNum}`;
}
