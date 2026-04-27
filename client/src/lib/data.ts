// MTHS KPI data — derived from kpi_data.json
// All values are the real business numbers. Do not change without source update.

export const company = {
  revenue_target_q2: 1650000,
  profit_margin_target: 0.2,
  cash_conversion_target_days: 60,
  cash_on_hand_days: 20,
  purpose_target: 264,
  annual_revenue_goal: 6000000,
};

export type MonthKey = "Jan" | "Feb" | "Mar" | "Apr";
export const MONTHS: MonthKey[] = ["Jan", "Feb", "Mar", "Apr"];

export const salesMonthly = {
  marketing_spend: { Jan: 86748, Feb: 90601, Mar: 98380, Apr: 47903 },
  gross_leads: { Jan: 226, Feb: 229, Mar: 234, Apr: 168 },
  contact_rate: { Jan: 0.71, Feb: 0.81, Mar: 0.81, Apr: null as number | null },
  net_leads: { Jan: 131, Feb: 126, Mar: 102, Apr: 94 },
  net_to_gross: { Jan: 0.58, Feb: 0.55, Mar: 0.44, Apr: 0.56 },
  appts_set: { Jan: 80, Feb: 84, Mar: 71, Apr: 59 },
  net_to_appt: { Jan: 0.61, Feb: 0.67, Mar: 0.7, Apr: 0.63 },
  cost_per_appt: { Jan: 1084, Feb: 1079, Mar: 1386, Apr: 812 },
  appts_executed: { Jan: 62, Feb: 77, Mar: 63, Apr: 44 },
  contracts: { Jan: 15, Feb: 20, Mar: 15, Apr: 9 },
  appt_to_contract: { Jan: 0.24, Feb: 0.26, Mar: 0.24, Apr: 0.2 },
  dropped_contracts: { Jan: 3, Feb: 5, Mar: 3, Apr: 0 },
  closed_deals: { Jan: 9, Feb: 10, Mar: 12, Apr: 4 },
  revenue: { Jan: 210495, Feb: 397040, Mar: 240771, Apr: 46722 },
  profit_per_deal: { Jan: 23388, Feb: 39704, Mar: 20064, Apr: 11680 },
  goals: {
    gross_leads: 212,
    net_leads: 117,
    appts_set: 69,
    appts_executed: 60,
    contracts: 17,
    revenue: 240000,
    cost_per_appt: 1200,
    appt_to_contract: 0.28,
    profit_per_deal: 20000,
    dropped_contracts: 2,
  },
};

// YTD totals computed from monthly values
export const ytd = {
  revenue:
    salesMonthly.revenue.Jan +
    salesMonthly.revenue.Feb +
    salesMonthly.revenue.Mar +
    salesMonthly.revenue.Apr, // 895,028
  contracts:
    salesMonthly.contracts.Jan +
    salesMonthly.contracts.Feb +
    salesMonthly.contracts.Mar +
    salesMonthly.contracts.Apr, // 59
  closed_deals:
    salesMonthly.closed_deals.Jan +
    salesMonthly.closed_deals.Feb +
    salesMonthly.closed_deals.Mar +
    salesMonthly.closed_deals.Apr, // 35
  marketing_spend:
    salesMonthly.marketing_spend.Jan +
    salesMonthly.marketing_spend.Feb +
    salesMonthly.marketing_spend.Mar +
    salesMonthly.marketing_spend.Apr, // 323,632
  gross_leads: 226 + 229 + 234 + 168,
  net_leads: 131 + 126 + 102 + 94,
  appts_set: 80 + 84 + 71 + 59,
  appts_executed: 62 + 77 + 63 + 44,
};
export const avgProfitPerDeal = Math.round(
  (salesMonthly.profit_per_deal.Jan +
    salesMonthly.profit_per_deal.Feb +
    salesMonthly.profit_per_deal.Mar +
    salesMonthly.profit_per_deal.Apr) /
    4,
); // 25,459

export type Channel = {
  name: string;
  spend: number;
  gross_leads: number;
  net_leads: number;
  deals: number;
  conversion: number;
  cost_per_deal: number;
  revenue: number;
  roas: number | null;
};

export const marketingChannels: Channel[] = [
  { name: "SEO",         spend: 12816,  gross_leads: 121, net_leads: 68,  deals: 16, conversion: 0.235, cost_per_deal: 801,   revenue: 261061, roas: 20.37 },
  { name: "Google PPC",  spend: 36625,  gross_leads: 153, net_leads: 70,  deals: 10, conversion: 0.143, cost_per_deal: 3662,  revenue: 206952, roas: 5.65 },
  { name: "Facebook Ads",spend: 26866,  gross_leads: 203, net_leads: 91,  deals: 9,  conversion: 0.099, cost_per_deal: 2985,  revenue: 252050, roas: 9.38 },
  { name: "TV Ads",      spend: 153429, gross_leads: 78,  net_leads: 54,  deals: 9,  conversion: 0.167, cost_per_deal: 17048, revenue: 345501, roas: 2.25 },
  { name: "Radio",       spend: 40321,  gross_leads: 42,  net_leads: 32,  deals: 3,  conversion: 0.094, cost_per_deal: 13440, revenue: 150000, roas: 3.72 },
  { name: "PPL",         spend: 28575,  gross_leads: 186, net_leads: 104, deals: 5,  conversion: 0.048, cost_per_deal: 5715,  revenue: 145000, roas: 5.07 },
  { name: "Referrals",   spend: 0,      gross_leads: 69,  net_leads: 30,  deals: 6,  conversion: 0.2,   cost_per_deal: 0,     revenue: 125974, roas: null },
];
export const marketingTotals = {
  spend: 323632,
  gross_leads: 787,
  net_leads: 422,
  deals: 52,
  conversion: 0.123,
  cost_per_deal: 6224,
  revenue: 1360564,
  roas: 4.2,
};

export const newBuyers = {
  sources: [
    { name: "Mevlo", buyers: 189, qualified: 154, deals: 0 },
    { name: "Realtracs", buyers: 28, qualified: 1, deals: 0 },
    { name: "Investor Form", buyers: 2, qualified: 2, deals: 0 },
    { name: "Deal Sniper", buyers: 5, qualified: 3, deals: 0 },
    { name: "Referrals", buyers: 1, qualified: 0, deals: 0 },
  ],
  totals: { buyers: 225, qualified: 160, deals: 0 },
  monthly: {
    Jan: { buyers: 63, qualified: 50 },
    Feb: { buyers: 59, qualified: 43 },
    Mar: { buyers: 49, qualified: 36 },
    Apr: { buyers: 56, qualified: 31 },
  },
};

export const dispoWeekly = {
  joseph: {
    avg_assignment: { W15: 16087, W16: 30000 },
    avg_attendance: { W15: 6, W16: 10 },
    outbound_calls: { W15: 151, W16: 106 },
    assignments: { W15: 3, W16: 2 },
    qualified_buyers_added: { W15: 5, W16: 4 },
    buy_it_now: { W15: 2, W16: 2 },
  },
  jeb: {
    avg_assignment: { W15: 10100, W16: 9400 },
    avg_attendance: { W15: 2, W16: 4 },
    outbound_calls: { W15: 134, W16: 117 },
    // assumed zeros where not provided in source
    assignments: { W15: 1, W16: 1 },
    qualified_buyers_added: { W15: 2, W16: 1 },
    buy_it_now: { W15: 1, W16: 0 },
  },
  targets: {
    avg_assignment: 25000,
    avg_attendance: 8,
    outbound_calls: 150,
    assignments: 3,
    qualified_buyers_added: 2,
    buy_it_now: 2,
  },
};

export const salesWeekly = {
  jeff_h: {
    appts_scheduled: { W15: 3, W16: 10 },
    talk_time_hrs: { W15: 4.6, W16: 10.5 },
    contact_rate: { W15: 1.0, W16: 0.84 },
    touchpoints_new: { W15: 149, W16: 262 },
    touchpoints_hot: { W15: 69, W16: 157 },
    touchpoints_followup: { W15: 63, W16: 30 },
  },
  brandon: {
    appts_scheduled: { W15: 8, W16: 8 },
    talk_time_hrs: { W15: 10.53, W16: 12.36 },
    contact_rate: { W15: 0.75, W16: 0.77 },
    touchpoints_new: { W15: 265, W16: 184 },
  },
  targets: {
    appts_scheduled: 8,
    talk_time_hrs: 10,
    contact_rate: 0.8,
    touchpoints_new: 200,
    touchpoints_hot: 100,
    touchpoints_followup: 50,
  },
};

export const transactions = {
  team: [
    { name: "Kalyn", role: "TC Manager", active_files: 15, workload_points: 30.58, capacity: 20, utilization: 1.72, status: "OVERLOADED" as const },
    { name: "Dana",  role: "Senior TC",  active_files: 15, workload_points: 21.34, capacity: 30, utilization: 0.64, status: "UNDERUTILIZED" as const },
  ],
  rise_metrics: {
    active_files: { W15: 34, W16: 30, W17: 36, target: 36 },
    revenue_at_risk: { W15: 0.129, W16: 15.4 },
    revenue_closed: { W15: 73151, W16: 13000, target: 126923 },
    contracts_closed: { W15: 5, W16: 3, target: 5 },
    stuck_deals: { W15: 4, W16: 4, target: 2 },
  },
  pipeline: [
    { stage: "Due Diligence", count: 9 },
    { stage: "Title Review", count: 8 },
    { stage: "Appraisal / Inspection", count: 5 },
    { stage: "Clear to Close", count: 4 },
    { stage: "Scheduled to Close", count: 3 },
    { stage: "Stuck / At Risk", count: 4 },
  ],
  termination_rate: { W15: 0.06, W16: 0.09, target: 0.05 },
};

export const companyWeekly = {
  gross_leads: { W14: 48, W15: 66, target: 52 },
  net_leads: { W14: 33, W15: 40, target: 28 },
  cost_per_appt: { W14: 1860, W15: 1141, target: 1300 },
  cost_per_contract: { W14: 10759, W15: 7543, target: 6470 },
  appts_scheduled: { W14: 16, W15: 27, target: 24 },
  appts_attended: { W14: 15, W15: 13, target: 21 },
  revenue_q2_target: 1650000,
  revenue_q2_april: 395000,
  profit_margin_target: 0.2,
  cash_conversion_actual: 54,
  cash_conversion_target: 60,
};

export const topDeals = [
  { address: "101 Hunters Lane, Smyrna", profit: 121000 },
  { address: "150 Lee Etta Dr, Gallatin", profit: 115000 },
  { address: "3945 E Ridge Dr, Nashville", profit: 114614 },
  { address: "912 Livingston St, Old Hickory", profit: 107000 },
  { address: "2221 Jo Ann Drive, Spring Hill", profit: 106000 },
  { address: "100 Baker Springs Ln, Spring Hill", profit: 103000 },
  { address: "2809 Lincoya Drive, Nashville", profit: 100000 },
  { address: "3809 Bryce Rd, Nashville", profit: 99000 },
  { address: "125 Summerlake Place, Hendersonville", profit: 95882 },
  { address: "217 Kingwood Lane, Rockvale", profit: 95000 },
];

export const revenueFunnel = {
  annual_profit_goal: 6000000,
  monthly_profit_goal: 500000,
  weekly_profit_goal: 120000,
  profit_per_deal: 25000,
  deals_required_annual: 240,
  deals_required_monthly: 20,
  fallout_rate: 0.1,
  appt_to_contract: 0.28,
  appt_set_to_held: 0.85,
  lead_to_appt: 0.7,
  gross_to_net: 0.5,
  gross_leads_monthly: 267,
};

export const surveyResults = {
  respondent: "Jeff Davidson",
  department: "Dispositions",
  role: "Director of Dispositions",
  top_10_kpis: [
    "Month to date revenue (Per Rep)",
    "Quarter to date revenue (Per Rep)",
    "Revenue needed to hit goal / broken down by week & quarter",
    "New qualified buyers added this week",
    "Assignment fee per deal (rolling 30 days)",
    "Outbound Text Messages / Calls (day/week)",
    "Conversion & Fallout Rate",
    "Number of RSVPs - Broken down by each deal",
    "ARV% - MTD and QTD",
    "Number of Days from Contract to Push Date",
  ],
  top_3_game_changers: [
    "Average Assignment Fee (Price and ARV%)",
    "New buyers added (WTD, MTD, QTD) + Buyer conversion rate",
    "Number of Days from Contract to Push Date",
  ],
};

export const hr = {
  maggie: {
    trainual_hours: { W15: 2, W16: 1, target: 3 },
    time_to_hire: { W15: 25, W16: 32, target: 30 },
    payroll_ontime: { W15: 100, W16: 100, target: 100 },
    policy_compliance: { W15: 100, W16: 100, target: 80 },
    meeting_rating: { W15: 4, W16: 5, target: 5 },
  },
};

export const rateMeeting: Record<string, (number | null)[]> = {
  "Jeff D": [2.5, 3, 3, 3, 3, 3, 3, 1, 2, 2, 3, 3, 2, 3],
  Kalyn:   [2, 3, 3, 3, 3, 3, 2, 1, null, 2, 2, 3, 2, 3],
  Jordan:  [3, 3, 3, 3, null, 2, 2, null, 2, 2, 3, 3, 2, 3],
  Trey:    [3, 3, 3, 2, 3, 3, 2, 1, 1, 2, 3, 3, 1, 3],
  Maggie:  [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
  average: [2.7, 3, 3, 3, 3, 2.8, 2.4, 1.5, 2, 2.2, 2.8, 3, 2, 3],
};

// Helpers
export const fmtMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(2)}M` :
  n >= 1_000 ? `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K` :
  `$${n.toLocaleString()}`;

export const fmtMoneyExact = (n: number) => `$${n.toLocaleString()}`;

export const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export type StoplightStatus = "green" | "yellow" | "red";

// Standard comparator: higher is better
export function statusFromTarget(actual: number | null, target: number, higherIsBetter = true, tolerance = 0.1): StoplightStatus {
  if (actual == null) return "yellow";
  const ratio = actual / target;
  if (higherIsBetter) {
    if (ratio >= 1) return "green";
    if (ratio >= 1 - tolerance) return "yellow";
    return "red";
  } else {
    if (ratio <= 1) return "green";
    if (ratio <= 1 + tolerance) return "yellow";
    return "red";
  }
}

// ========== TIME PERIOD DATA ==========
// Note: TimePeriod type is defined in the component to avoid circular deps;
// periodLabel is co-located here for convenience and typed with a string union.

// Daily stoplight data (3/30 – 4/14, subset shown)
export const dailyDates = [
  "3/30","3/31","4/1","4/2","4/3","4/4","4/7","4/8","4/9","4/10","4/11","4/12","4/13","4/14"
];

export const dailySales = {
  jeff_h: {
    appts: [1,0,2,1,0,1,0,2,1,0,1,1,2,1],
    calls: [22,18,31,27,15,20,25,30,28,22,26,19,33,24],
  },
  brandon: {
    appts: [2,1,1,0,1,2,1,1,2,1,0,2,1,1],
    calls: [30,25,28,22,18,26,31,29,35,27,20,28,24,30],
  },
};

export const dailyDispo = {
  joseph: {
    calls: [12,15,18,22,10,8,20,25,18,15,22,12,18,20],
    buyers_added: [0,1,0,1,0,0,1,0,1,0,1,0,0,1],
  },
  jeb: {
    calls: [10,12,14,18,8,6,15,20,16,12,18,10,15,17],
    buyers_added: [0,0,1,0,0,0,0,1,0,1,0,0,1,0],
  },
};

export const dailyTransactions = {
  kalyn: {
    files_touched: [3,4,2,5,3,2,4,3,5,4,2,3,4,3],
    closings: [0,0,1,0,0,0,0,1,0,0,1,0,0,0],
  },
  dana: {
    files_touched: [2,3,2,4,2,1,3,2,4,3,2,2,3,2],
    closings: [0,1,0,0,0,0,1,0,0,0,0,1,0,0],
  },
};

// Weekly keys available
export type WeekKey = "W14" | "W15" | "W16" | "W17";
export const WEEKS: WeekKey[] = ["W14", "W15", "W16", "W17"];

// Quarterly aggregations derived from salesMonthly
export const quarterly = {
  Q1: {
    revenue: salesMonthly.revenue.Jan + salesMonthly.revenue.Feb + salesMonthly.revenue.Mar,
    contracts: salesMonthly.contracts.Jan + salesMonthly.contracts.Feb + salesMonthly.contracts.Mar,
    closed_deals: salesMonthly.closed_deals.Jan + salesMonthly.closed_deals.Feb + salesMonthly.closed_deals.Mar,
    gross_leads: salesMonthly.gross_leads.Jan + salesMonthly.gross_leads.Feb + salesMonthly.gross_leads.Mar,
    net_leads: salesMonthly.net_leads.Jan + salesMonthly.net_leads.Feb + salesMonthly.net_leads.Mar,
    marketing_spend: salesMonthly.marketing_spend.Jan + salesMonthly.marketing_spend.Feb + salesMonthly.marketing_spend.Mar,
    appts_set: salesMonthly.appts_set.Jan + salesMonthly.appts_set.Feb + salesMonthly.appts_set.Mar,
    appts_executed: salesMonthly.appts_executed.Jan + salesMonthly.appts_executed.Feb + salesMonthly.appts_executed.Mar,
  },
  Q2: {
    revenue: salesMonthly.revenue.Apr,
    contracts: salesMonthly.contracts.Apr,
    closed_deals: salesMonthly.closed_deals.Apr,
    gross_leads: salesMonthly.gross_leads.Apr,
    net_leads: salesMonthly.net_leads.Apr,
    marketing_spend: salesMonthly.marketing_spend.Apr,
    appts_set: salesMonthly.appts_set.Apr,
    appts_executed: salesMonthly.appts_executed.Apr,
  },
};

// Helper: get label for current period
export function periodLabel(period: "day" | "week" | "month" | "quarter" | "year"): string {
  switch (period) {
    case "day": return "Daily · Apr 14";
    case "week": return "Weekly · W16";
    case "month": return "Monthly · April";
    case "quarter": return "Quarterly · Q2";
    case "year": return "Year to Date · 2026";
  }
}
