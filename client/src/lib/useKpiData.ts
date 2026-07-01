import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "./queryClient";

// Types matching the backend response shape
export interface KpiData {
  salesMonthly: {
    marketing_spend: Record<string, number | null>;
    gross_leads: Record<string, number | null>;
    net_leads: Record<string, number | null>;
    appts_set: Record<string, number | null>;
    appts_executed: Record<string, number | null>;
    contracts: Record<string, number | null>;
    dropped_contracts: Record<string, number | null>;
    closed_deals: Record<string, number | null>;
    revenue: Record<string, number | null>;
    profit_per_deal: Record<string, number | null>;
    contact_rate: Record<string, number | null>;
    net_to_gross: Record<string, number | null>;
    net_to_appt: Record<string, number | null>;
    cost_per_appt: Record<string, number | null>;
    appt_to_contract: Record<string, number | null>;
    goals: {
      gross_leads: number;
      net_leads: number;
      appts_set: number;
      appts_executed: number;
      contracts: number;
      revenue: number;
      cost_per_appt: number;
      appt_to_contract: number;
      profit_per_deal: number;
      dropped_contracts: number;
    };
  };
  activeMonths: string[];
  salesActiveMonths: string[];
  ytd: {
    revenue: number;
    contracts: number;
    closed_deals: number;
    marketing_spend: number;
    gross_leads: number;
    net_leads: number;
    appts_set: number;
    appts_executed: number;
  };
  avgProfitPerDeal: number;
  quarterly: {
    Q1: QuarterData;
    Q2: QuarterData;
    Q3: QuarterData;
    Q4: QuarterData;
  };
  marketingChannels: Channel[];
  marketingTotals: {
    spend: number;
    gross_leads: number;
    net_leads: number;
    deals: number;
    conversion: number;
    cost_per_deal: number;
    revenue: number;
    roas: number;
  };
  topDeals: { address: string; profit: number }[];
  companyRecords: {
    label: string;
    value: number;
    when: string;
    subtitle?: string;
    format: "money" | "int";
  }[];
  newBuyers: {
    sources: { name: string; buyers: number; qualified: number; deals: number }[];
    totals: { buyers: number; qualified: number; deals: number };
    monthly: Record<string, { buyers: number; qualified: number }>;
  };
  transactions: {
    team: TCMember[];
    tcBreakdown: Record<string, {
      active: number; closed: number; revenue: number; at_risk: number;
      workload_points: number; escalations: number; delays: number;
      stages: Record<string, number>; complexity: Record<string, number>;
    }>;
    pipeline: { stage: string; count: number }[];
    activeFiles: number;
    pipelineRevenue: number;
    revenueAtRisk: number;
    revenueClearToClose: number;
    rise_metrics: {
      active_files: { current: number; target: number };
      revenue_closed: { current: number; target: number };
      contracts_closed: { current: number; target: number };
      stuck_deals: { current: number; target: number };
    };
    termination_rate: { current: number; target: number };
    terminated: number;
    onHold: number;
    complexityBreakdown: { type: string; count: number }[];
    transactionTypes: { type: string; count: number }[];
    ageBuckets: { range: string; count: number }[];
    avgDaysInPipeline: number;
    avgDaysToTitle: number;
    avgDaysToClose: number;
    activeEscalations: number;
    activeDelays: number;
    activePastTarget: number;
    active46PlusDays: number;
    titleIssueRate: number;
    pctActivePastTarget: number;
    delayReasons: { reason: string; count: number }[];
    termReasons: { reason: string; count: number }[];
    dealFiles: DealFile[];
    totalDeals: number;
    closedRevenue: number;
  };
  company: {
    revenue_target_q2: number;
    profit_margin_target: number;
    cash_conversion_target_days: number;
    cash_on_hand_days: number;
    purpose_target: number;
    annual_revenue_goal: number;
  };
  companyWeekly: {
    gross_leads: Record<string, number>;      // { Mar: 168, Apr: 168, target: 212 }
    net_leads: Record<string, number>;         // { Mar: 94, Apr: 94, target: 117 }
    cost_per_appt: Record<string, number>;     // { Mar: 813, Apr: 813, target: 1200 }
    cost_per_contract: Record<string, number>; // { Mar: 5322, Apr: 5322, target: 6470 }
    appts_scheduled: Record<string, number>;   // { Mar: 59, Apr: 59, target: 69 }
    appts_attended: Record<string, number>;    // { Mar: 44, Apr: 44, target: 60 }
    revenue_q2_target: number;
    revenue_q2_april: number;
    profit_margin_target: number;
    cash_conversion_actual: number;
    cash_conversion_target: number;
  };
  dispoWeekly: {
    reps: {
      name: string;
      total_deals: number;
      avg_assignment: number;
      total_attendance: number;
      total_offers: number;
      assignments_2026: number;
    }[];
    commissions: {
      joseph: Record<string, number>;
      jeb: Record<string, number>;
      jeff_d: Record<string, number>;
    };
    targets: {
      avg_assignment: number;
      avg_attendance: number;
      outbound_calls: number;
      assignments: number;
      qualified_buyers_added: number;
      buy_it_now: number;
    };
  };
  salesWeekly: {
    reps: {
      korbin: { commissions: Record<string, number> };
      brandon: { commissions: Record<string, number> };
      jeff_h: { commissions: Record<string, number> };
      tj: { commissions: Record<string, number> };
      ryan: { commissions: Record<string, number> };
    };
    leadManagers: Record<string, {
      net_leads: Record<string, number>;
      appts_set: Record<string, number>;
      ratio: Record<string, number | null>;
      contracted: Record<string, number>;
      conversion: Record<string, number | null>;
    }>;
    aqAgents: Record<string, {
      appts_executed: Record<string, number>;
      contracts: Record<string, number>;
      conversion: Record<string, number | null>;
      dropped_contracts: Record<string, number>;
    }>;
    targets: {
      appts_scheduled: number;
      talk_time_hrs: number;
      touchpoints_new: number;
      touchpoints_hot: number;
      touchpoints_followup: number;
    };
  };
  revenueTracker: {
    monthlyActuals: Record<string, number>;
    dealsByMonth: Record<string, { deal: string; gross: number; closeDate: string }[]>;
    perPersonCommissions: Record<string, Record<string, number>>;
    projectedYearTotal: number;
    ytdActualRevenue: number;
  };
  revenueTrackerYoY?: {
    year2025: { monthlyActuals: Record<string, number>; monthlyDeals: Record<string, number>; ytdRevenue: number; ytdDeals: number };
    year2026: { monthlyActuals: Record<string, number>; monthlyDeals: Record<string, number>; ytdRevenue: number; ytdDeals: number };
    comparison: {
      monthsCompared: string[];
      ytd2025SameMonths: number;
      ytd2025DealsSameMonths: number;
      deltaYtdRevenue: number;
      deltaYtdPct: number;
      deltaYtdDeals: number;
    };
  };
  revenueFunnel: {
    annual_profit_goal: number;
    monthly_profit_goal: number;
    weekly_profit_goal: number;
    profit_per_deal: number;
    deals_required_annual: number;
    deals_required_monthly: number;
    fallout_rate: number;
    appt_to_contract: number;
    appt_set_to_held: number;
    lead_to_appt: number;
    gross_to_net: number;
    gross_leads_monthly: number;
  };
  hr: {
    maggie: {
      trainual_hours: Record<string, number>;
      time_to_hire: Record<string, number>;
      payroll_ontime: Record<string, number>;
      policy_compliance: Record<string, number>;
      meeting_rating: Record<string, number>;
    };
  };
  rateMeeting: Record<string, (number | null)[]>;
  surveyResults: {
    respondent: string;
    department: string;
    role: string;
    top_10_kpis: string[];
    top_3_game_changers: string[];
  };
  dailyDates: string[];
  dailySales: {
    jeff_h: { appts: number[]; calls: number[] };
    brandon: { appts: number[]; calls: number[] };
  };
  dailyDispo: {
    joseph: { calls: number[]; buyers_added: number[] };
    jeb: { calls: number[]; buyers_added: number[] };
  };
  dailyTransactions: {
    kalyn: { files_touched: number[]; closings: number[] };
    dana: { files_touched: number[]; closings: number[] };
  };
  lastUpdated: string;
  cashConversionCycle: CashConversionCycle;
  acquisitionsActivity: AcquisitionsActivity;
  marketingSpendDetail: MarketingSpendDetail;
  kpiOwnership: KpiOwnership;
  alerts?: { redStreaks: RedStreakAlert[] };
  revTrackerRoas?: {
    perAgentGross: Record<string, Record<string, number>>;
    perAgentDealCount: Record<string, Record<string, number>>;
    marketingSourceRollup: Record<string, { gross: number; dealCount: number; perAgent: Record<string, number> }>;
  };
  bouncieDriveTime?: {
    byAgent: Record<string, { totalMinutes: number; totalMiles: number; totalStops: number; days: number; avgMinutes: number; avgMiles: number }>;
    daily: { date: string; agent: string; driveMinutes: number; miles: number; stops: number }[];
    source: "mock" | "live";
    lastUpdated: string;
  };
  /** dispoFub removed 2026-06-17 — FUB data deemed inaccurate. Field kept
   *  optional so older cached payloads still type-check; live API no longer
   *  populates it. Disposition page now uses sheet-only Dispo 2026 KPIs. */
  dispoFub?: DispoFubData;
  mailchimp?: MailchimpData;
  weeklyMarketing?: WeeklyMarketingData;
  /** Lead-Source ROI — now sheet-derived from Marketing 2026 KPIs (was FUB). */
  leadSources?: {
    windowDays: number;
    windowLabel?: string;
    fetchedAt: string;
    error?: string;
    sources: { source: string; leads: number; appts: number; contracts: number; spend: number; cac: number; cpl: number }[];
    totalLeads: number;
    totalContracts: number;
    totalSpend: number;
    source?: string;
  };
  /** daysToClose — no longer computed (required FUB Under-Contract date).
   *  See dealEconomics.avgDaysToClose on Overview for sheet-based equivalent. */
  daysToClose?: {
    avgDays: number | null;
    medianDays: number | null;
    sampleSize: number;
    fastest: number | null;
    slowest: number | null;
    fubFound: number;
    revTrackerFound: number;
    matched: number;
    method: string;
  };
  /** Per-rep funnel — sheet-only from Sales 2026 KPIs (current KPI month).
   *  Calls/Offers stages dropped (no sheet equivalent). */
  perRepFunnel?: {
    windowLabel: string;
    closingsMonth: string;
    source: string;
    note: string;
    reps: {
      rep: string;
      netLeads: number;
      apptsSet: number;
      apptsExecuted: number;
      contracts: number;
      droppedContracts: number;
      closings: number;
      leadToAppt: number;
      apptToContract: number;
      role: "LM" | "AQ";
    }[];
  };
  dataFreshness?: Record<string, { fetchedAt?: string; error?: string; source?: string }>;
}

export interface WeeklyMarketingRecord {
  month: string;
  week: string;
  weekStart: string;
  source: string;
  grossLead: number;
  netLead: number;
  activeListing: number;
  noCompsOrFit: number;
  outOfBuyBox: number;
  noReply: number;
}

export interface WeeklyMarketingData {
  records: WeeklyMarketingRecord[];
  byWeek: {
    month: string; week: string; weekKey: string;
    grossLead: number; netLead: number; netToGrossPct: number; sourceCount: number;
  }[];
  bySource: {
    source: string;
    grossLead: number; netLead: number; netToGrossPct: number;
    activeListing: number; noCompsOrFit: number; outOfBuyBox: number; noReply: number;
    disqualified: number;
  }[];
  byMonth: { month: string; grossLead: number; netLead: number; netToGrossPct: number }[];
  totals: { grossLead: number; netLead: number; netToGrossPct: number; weeksCovered: number; sourcesCovered: number };
  source: "google_sheets";
  fetchedAt: string;
  error?: string;
}

export interface MailchimpCampaignSummary {
  id: string;
  subjectLine: string;
  sendTime: string;
  emailsSent: number;
  opens: number;
  uniqueOpens: number;
  openRate: number; // 0-1
  clicks: number;
  uniqueClicks: number;
  clickRate: number; // 0-1
}

export interface MailchimpData {
  audienceName: string;
  totalSubscribers: number;
  activeSubscribers: number;
  unsubscribed: number;
  cleaned: number;
  audienceOpenRate: number; // 0-1
  audienceClickRate: number; // 0-1
  campaignCount: number;
  lastSentAt: string | null;
  recentCampaigns: MailchimpCampaignSummary[];
  weeklyVolume: { weekStart: string; campaigns: number; emailsSent: number; avgOpenRate: number; avgClickRate: number }[];
  source: "mailchimp";
  fetchedAt: string;
  error?: string;
}

export interface DispoFubData {
  /** Live dispo deals NOT yet closed (excludes Novation/Flip/Rental/Listing-Referral pipelines) */
  totalActiveDispo: number;
  /** Closed dispo deals only */
  totalClosedDispo: number;
  /** Dropped pipeline (across all deal types but typically dispo) */
  totalDropped: number;
  /** Revenue assigned per ISO-week, last 12 weeks */
  revenueAssignedByWeek: { weekStart: string; total: number; count: number }[];
  /** Average assignment fee per deal, rolling 30 days */
  avgAssignmentPerDeal: number;
  /** Stage breakdown of currently active dispo deals */
  stageBreakdown: { stage: string; count: number; totalPrice: number }[];
  /** Per-owner ownership — each deal counted exactly once (Joseph/Jeb dedup) */
  byOwner: { owner: string; activeCount: number; closedCount: number; assignedRev: number }[];
  /** Deal type breakdown (Cash, Subject-To, etc.) */
  byDealType: { dealType: string; count: number; gross: number }[];
  source: "fub";
  fetchedAt: string;
  error?: string;
}

export interface RedStreakAlert {
  person: string;
  metric: string;
  target: string;
  streak: number;
  weeksRed: string[];
  latestActual: string;
  severity: "day3" | "week3";
}

export interface AcqAgent {
  agent: string;
  days: number;
  driveTime: number;
  windshieldTime: number;
  talkTime: number;
  touchPoints: number;
  apptsSet: number;
  apptsAttended: number;
  offers: number;
  contracts: number;
  avgTalkTime: number;
  avgTouchPoints: number;
  avgApptsSet: number;
  target?: { talkTime: number; touchPoints: number; apptsSet: number; };
}
export interface AcquisitionsActivity {
  windowDays: number;
  agents: AcqAgent[];
  rowCount: number;
}

export interface SpendEntry {
  month: string; agent: string; channel: string;
  spend: number; leads: number; appts: number;
  contracts: number; closedDeals: number; profit: number; roas: number;
}
export interface SpendRollup {
  name: string; spend: number; profit: number;
  leads: number; contracts: number; closedDeals: number; roas: number;
}
export interface MarketingSpendDetail {
  entries: SpendEntry[];
  byAgent: SpendRollup[];
  byChannel: SpendRollup[];
  totalSpend: number;
  totalProfit: number;
  overallRoas: number;
}

export interface KpiOwner {
  kpi: string; owners: string; team: string;
  cadence: string; target: string; source: string; notes: string;
}
export interface KpiOwnership {
  map: KpiOwner[];
}

export interface CCCStage {
  key: string;
  label: string;
  from: string;
  to: string;
  avgDays: number;
  medianDays: number;
  sampleSize: number;
  allTimeAvg: number;
  allTimeN: number;
}

export interface CCCDeal {
  address: string;
  city: string;
  zip: string;
  bed: number;
  bath: number;
  sqft: number;
  yearBuilt: number;
  leadSource: string;
  dealType: string;
  leadManager: string;
  aqAgent: string;
  dispoManager: string;
  tc: string;
  purchasePrice: number;
  salePrice: number;
  profit: number;
  closeDate: string;
  leadCreated: string;
  days_lead_to_net: number | null;
  days_net_to_apptSet: number | null;
  days_apptSet_to_apptExec: number | null;
  days_apptExec_to_uc: number | null;
  days_uc_to_pushed: number | null;
  days_pushed_to_assigned: number | null;
  days_assigned_to_closed: number | null;
  days_total: number | null;
}

export interface CashConversionCycle {
  stages: CCCStage[];
  totalAvgDays: number;
  totalMedianDays: number;
  totalSampleSize: number;
  allTimeAvgDays: number;
  allTimeSampleSize: number;
  deals: CCCDeal[];
}

interface QuarterData {
  revenue: number;
  contracts: number;
  closed_deals: number;
  gross_leads: number;
  net_leads: number;
  marketing_spend: number;
  appts_set: number;
  appts_executed: number;
}

export interface Channel {
  name: string;
  spend: number;
  gross_leads: number;
  net_leads: number;
  deals: number;
  conversion: number;
  cost_per_deal: number;
  revenue: number;
  roas: number | null;
}

export interface TCMember {
  name: string;
  role: string;
  active_files: number;
  workload_points: number;
  capacity: number;
  utilization: number;
  status: "OVERLOADED" | "UNDERUTILIZED" | "OPTIMAL";
}

export interface DealFile {
  fileId: string;
  address: string;
  tc: string;
  type: string;
  stage: string;
  status: string;
  complexity: string;
  daysInPipeline: number;
  projectedRevenue: number;
  revenueAtRisk: number;
  hasEscalation: boolean;
  hasDelay: boolean;
  titleStatus: string;
  pastTarget: boolean;
}

// Auto-refresh every 90 seconds for TV display
const REFETCH_INTERVAL = 90 * 1000; // 90 seconds

export function useKpiData() {
  return useQuery<KpiData>({
    queryKey: ["/api/kpi-data"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/kpi-data");
      const data = await res.json();
      if (!data || data.error) {
        throw new Error(data?.error || "No data returned");
      }
      return data;
    },
    refetchInterval: REFETCH_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 60 * 1000, // 60 seconds
    retry: (failureCount, error: any) => {
      // Don't retry auth errors
      if (error?.message?.includes("401")) return false;
      // Retry up to 5 times for data loading (server may need time to fetch from Sheets)
      return failureCount < 5;
    },
    retryDelay: (attempt) => Math.min(1000 * (attempt + 1), 5000),
  });
}

// Utility functions (same as before, but exported from here for convenience)
export const fmtMoney = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : n >= 1_000
      ? `$${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`
      : `$${n.toLocaleString()}`;

export const fmtMoneyExact = (n: number) => `$${n.toLocaleString()}`;

export const fmtPct = (n: number | null | undefined, digits = 0) =>
  n == null ? "—" : `${(n * 100).toFixed(digits)}%`;

export type StoplightStatus = "green" | "yellow" | "red";

export function statusFromTarget(
  actual: number | null,
  target: number,
  higherIsBetter = true,
  tolerance = 0.1
): StoplightStatus {
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

export function periodLabel(
  period: "day" | "week" | "month" | "quarter" | "year"
): string {
  const now = new Date();
  const monthName = now.toLocaleString("en-US", { month: "long" });
  const day = now.getDate();
  const weekNum = Math.ceil(
    (now.getTime() - new Date(now.getFullYear(), 0, 1).getTime()) /
      (7 * 24 * 60 * 60 * 1000)
  );
  const quarter = Math.ceil((now.getMonth() + 1) / 3);
  switch (period) {
    case "day":
      return `Daily · ${monthName.substring(0, 3)} ${day}`;
    case "week":
      return `Weekly · W${weekNum}`;
    case "month":
      return `Monthly · ${monthName}`;
    case "quarter":
      return `Quarterly · Q${quarter}`;
    case "year":
      return `Year to Date · ${now.getFullYear()}`;
  }
}
