import { useState } from "react";
import {
  Card,
  PageHeader,
  ProgressRing,
  Scorecard,
  Section,
  StatRow,
  StoplightBadge,
  ProgressBar,
  StoplightDot,
} from "@/components/dash";
import { KpiTooltip, KPI_NOTES, isRedStreak } from "@/components/KpiTooltip";
import { CashConversionCycleSection } from "@/components/CashConversionCycle";
import { TimePeriodFilter, type TimePeriod } from "@/components/TimePeriodFilter";
import { DataFreshnessBanner, YoYTile } from "@/components/QuickWinTiles";
import { useKpi } from "@/components/KpiDataProvider";
import {
  fmtMoney,
  fmtMoneyExact,
  statusFromTarget,
  periodLabel,
} from "@/lib/useKpiData";
import {
  getPipelineForPeriod,
  periodDisplayLabel,
  goalMultiplier,
  currentQuarterLabel,
} from "@/lib/periodHelpers";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Bar,
  BarChart,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_COLOR,
  CHART_AXIS,
  CHART_LEGEND,
  LINE_DEFAULTS,
  BAR_DEFAULTS,
  CHART_MARGIN,
  moneyTickFormatter,
} from "@/lib/chartConfig";

export default function Overview() {
  const [period, setPeriod] = useState<TimePeriod>("month");
  const data = useKpi();

  const {
    salesMonthly, ytd, company, companyWeekly, quarterly,
    avgProfitPerDeal, activeMonths, salesActiveMonths,
    dailyDates, dailySales, transactions, companyRecords,
    cashConversionCycle,
  } = data;
  // Board prep additions — may be undefined on older backends
  const dealEconomics = (data as any).dealEconomics as
    | {
        fundedDealCount: number;
        avgDealSize: number;
        medianDealSize: number;
        avgDealSizeByMonth: Record<string, number>;
        avgDaysToClose: number;
        medianDaysToClose: number;
        daysToCloseNote?: string;
      }
    | undefined;
  const pipelineForward = (data as any).pipelineForward as
    | {
        currentMonthRemaining: { count: number; value: number };
        futureMonths: { count: number; value: number };
        total: { count: number; value: number };
        byMonth: Record<string, { count: number; value: number }>;
        projected: { count: number; value: number };
      }
    | undefined;
  const conversionFunnel = (data as any).conversionFunnel as
    | {
        windowDays: number;
        windowLabel?: string;
        source: string;
        stages: { label: string; value: number; fromPrev: number | null; fromTop: number }[];
        note?: string;
      }
    | undefined;
  const MONTHS = salesActiveMonths;

  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Jan";
  const prevMonth = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Jan";

  const annualGoal = company.annual_revenue_goal;
  const q2Actual = companyWeekly.revenue_q2_april;
  const q2Target = companyWeekly.revenue_q2_target;
  const ccc = companyWeekly.cash_conversion_actual;
  const cccTarget = companyWeekly.cash_conversion_target;
  const cccStatus = statusFromTarget(ccc, cccTarget, false, 0.05);

  // ── Dropped deals & Follow-Through Rate ─────────────────────────────
  // Follow-Through Rate = contracts that did NOT drop / total contracts. Target 85%.
  const droppedMonthly = (salesMonthly as any).dropped_contracts as Record<string, number | null> | undefined;
  const droppedThisMonth = droppedMonthly?.[latestMonth] ?? 0;
  const droppedYtd = droppedMonthly
    ? Object.entries(droppedMonthly)
        .filter(([k]) => MONTHS.includes(k))
        .reduce((s, [, v]) => s + (Number(v) || 0), 0)
    : 0;
  const contractsThisMonth = salesMonthly.contracts[latestMonth] ?? 0;
  const contractsYtd = ytd.contracts;
  const followThroughMonth = contractsThisMonth > 0
    ? Math.max(0, Math.min(1, (contractsThisMonth - droppedThisMonth) / contractsThisMonth))
    : 0;
  const followThroughYtd = contractsYtd > 0
    ? Math.max(0, Math.min(1, (contractsYtd - droppedYtd) / contractsYtd))
    : 0;
  const followThroughTarget = 0.85;
  const followThroughStatus: "red" | "yellow" | "green" =
    followThroughYtd >= followThroughTarget ? "green"
    : followThroughYtd >= followThroughTarget * 0.9 ? "yellow"
    : "red";

  // ── Fallback pattern ─────────────────────────────────────────────────
  const rawPipeline = getPipelineForPeriod(data, period);
  const hasPeriodData =
    rawPipeline.grossLeads > 0 ||
    rawPipeline.revenue > 0 ||
    rawPipeline.contracts > 0 ||
    rawPipeline.closedDeals > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const pipe = hasPeriodData ? rawPipeline : getPipelineForPeriod(data, "month");
  const isFallback = !hasPeriodData && period !== "month";
  // ─────────────────────────────────────────────────────────────────────

  const dispLabel = periodDisplayLabel(effectivePeriod, MONTHS);
  const mult = goalMultiplier(effectivePeriod, MONTHS);
  const currentQ = currentQuarterLabel(MONTHS);

  const paceStatus = statusFromTarget(ytd.revenue, annualGoal * (MONTHS.length / 12), true, 0.15);

  // Hero revenue ring — period-appropriate
  // For the CURRENT (in-progress) month/quarter/year, use TOTAL (funded + assigned)
  // as the headline — mid-period funded alone underrepresents what's on the board.
  // For prior periods (Jan, Feb, Mar, Apr in May), funded equals total so it's identical.
  const monthRev = (m: string) => {
    const total = (salesMonthly as any).revenue_total?.[m] ?? 0;
    const funded = salesMonthly.revenue[m] ?? 0;
    return total > 0 ? total : funded;
  };
  const heroRevenue = (() => {
    switch (effectivePeriod) {
      case "day":   return Math.round(monthRev(latestMonth) / 30);
      case "week":  return Math.round(monthRev(latestMonth) / 4);
      case "month": return monthRev(latestMonth);
      case "quarter": {
        const qData = quarterly[currentQ as "Q1"|"Q2"|"Q3"|"Q4"];
        const qTotal = (qData as any).revenue_total ?? 0;
        const qFunded = qData.revenue ?? 0;
        const qVal = qTotal > 0 ? qTotal : qFunded;
        return qVal > 0 ? qVal : monthRev(latestMonth);
      }
      case "year":  return (ytd as any).revenue_total ?? ytd.revenue;
    }
  })();

  // Helper: get per-month revenue goal (from Asana), fallback to sheet goal
  const monthRevGoal = (m: string) => (salesMonthly as any).monthlyRevenueGoals?.[m] ?? salesMonthly.goals.revenue;
  const currentMonthGoal = monthRevGoal(latestMonth);

  const heroGoal = (() => {
    switch (effectivePeriod) {
      case "day":     return Math.round(currentMonthGoal / 30);
      case "week":    return Math.round(currentMonthGoal / 4);
      case "month":   return currentMonthGoal;
      case "quarter": {
        const qMonths = effectivePeriod === "quarter" ? (currentQ === "Q1" ? ["Jan","Feb","Mar"] : currentQ === "Q2" ? ["Apr","May","Jun"] : currentQ === "Q3" ? ["Jul","Aug","Sep"] : ["Oct","Nov","Dec"]) : [];
        return qMonths.reduce((s, m) => s + monthRevGoal(m), 0);
      }
      case "year":    return annualGoal;
    }
  })();

  const heroLabel = (() => {
    switch (effectivePeriod) {
      case "day":     return "Daily Revenue Est.";
      case "week":    return "Weekly Revenue";
      case "month":   return `${latestMonth} Revenue`;
      case "quarter": return `${currentQ} Revenue Target`;
      case "year":    return "Annual Revenue Goal";
    }
  })();

  // Section title
  const periodSectionTitle = isFallback
    ? `Monthly Key Metrics · ${latestMonth} (no ${period} data)`
    : (() => {
        switch (period) {
          case "day":     return "Daily Key Metrics";
          case "week":    return "Weekly Key Metrics";
          case "month":   return `Monthly Key Metrics · ${latestMonth}`;
          case "quarter": return `Quarterly Key Metrics · ${currentQ}`;
          case "year":    return "YTD Key Metrics";
        }
      })();

  // KPI scorecards
  const goalContracts = Math.round(salesMonthly.goals.contracts * mult);
  const periodKpis = (() => {
    switch (effectivePeriod) {
      case "day":
        return {
          contracts: pipe.contracts,
          contractsSub: `Daily est. · ${dispLabel}`,
          closedDeals: pipe.closedDeals,
          closedDealsSub: "Daily est.",
          profitPerDeal: fmtMoney(pipe.profitPerDeal),
          profitSub: "Rolling avg",
          marketingSpend: fmtMoney(pipe.marketingSpend),
          marketingSpendSub: "Estimated daily spend",
        };
      case "week":
        return {
          contracts: pipe.contracts,
          contractsSub: `Weekly est. · ${dispLabel}`,
          closedDeals: pipe.closedDeals,
          closedDealsSub: "Weekly est.",
          profitPerDeal: fmtMoney(pipe.profitPerDeal),
          profitSub: `Target ${fmtMoney(salesMonthly.goals.profit_per_deal)}`,
          marketingSpend: fmtMoney(pipe.marketingSpend),
          marketingSpendSub: "Avg weekly spend",
        };
      case "month":
        return {
          contracts: pipe.contracts,
          contractsSub: `Target ${salesMonthly.goals.contracts} · ${latestMonth}`,
          closedDeals: pipe.closedDeals,
          closedDealsSub: latestMonth,
          profitPerDeal: fmtMoney(pipe.profitPerDeal),
          profitSub: `Target ${fmtMoney(salesMonthly.goals.profit_per_deal)}`,
          marketingSpend: fmtMoney(pipe.marketingSpend),
          marketingSpendSub: `${latestMonth} · 7 channels`,
        };
      case "quarter":
        return {
          contracts: pipe.contracts,
          contractsSub: `${currentQ} (current quarter)`,
          closedDeals: pipe.closedDeals,
          closedDealsSub: `${currentQ} (current quarter)`,
          profitPerDeal: fmtMoney(pipe.profitPerDeal),
          profitSub: `${currentQ} avg profit/deal`,
          marketingSpend: fmtMoney(pipe.marketingSpend),
          marketingSpendSub: `${currentQ} spend`,
        };
      case "year":
      default:
        return {
          contracts: pipe.contracts,
          contractsSub: `Target ${goalContracts} (${salesMonthly.goals.contracts}/mo)`,
          closedDeals: pipe.closedDeals,
          closedDealsSub: `Jan – ${latestMonth}`,
          profitPerDeal: fmtMoney(pipe.profitPerDeal),
          profitSub: `Target ${fmtMoney(salesMonthly.goals.profit_per_deal)} · ${pipe.profitPerDeal >= salesMonthly.goals.profit_per_deal ? "above" : "below"} goal`,
          marketingSpend: fmtMoney(pipe.marketingSpend),
          marketingSpendSub: "Across 7 channels",
        };
    }
  })();

  // Pipeline trend chart data
  const trendData = MONTHS.map((m) => ({
    month: m,
    "Gross Leads":   salesMonthly.gross_leads[m]    ?? 0,
    "Net Leads":     salesMonthly.net_leads[m]      ?? 0,
    "Appts Set":     salesMonthly.appts_set[m]      ?? 0,
    "Appts Executed":salesMonthly.appts_executed[m] ?? 0,
    Contracts:       salesMonthly.contracts[m]      ?? 0,
  }));

  const dailyTrendData = dailyDates.length > 0
    ? dailyDates.map((d, i) => ({
        date: d,
        "Jeff H Appts":   dailySales.jeff_h.appts[i]   ?? 0,
        "Brandon Appts":  dailySales.brandon.appts[i]  ?? 0,
      }))
    : [{ date: latestMonth, "Jeff H Appts": 0, "Brandon Appts": 0 }];

  const weekChartData = MONTHS.length >= 2
    ? [
        { period: prevMonth,   "Gross Leads": companyWeekly.gross_leads[prevMonth]   ?? 0, "Net Leads": companyWeekly.net_leads[prevMonth]   ?? 0, "Appts Set": companyWeekly.appts_scheduled[prevMonth]   ?? 0, "Appts Executed": salesMonthly.appts_executed[prevMonth]   ?? 0, Contracts: 0 },
        { period: latestMonth, "Gross Leads": companyWeekly.gross_leads[latestMonth] ?? 0, "Net Leads": companyWeekly.net_leads[latestMonth] ?? 0, "Appts Set": companyWeekly.appts_scheduled[latestMonth] ?? 0, "Appts Executed": salesMonthly.appts_executed[latestMonth] ?? 0, Contracts: 0 },
      ]
    : [{ period: latestMonth, "Gross Leads": companyWeekly.gross_leads[latestMonth] ?? 0, "Net Leads": companyWeekly.net_leads[latestMonth] ?? 0, "Appts Set": companyWeekly.appts_scheduled[latestMonth] ?? 0, "Appts Executed": salesMonthly.appts_executed[latestMonth] ?? 0, Contracts: 0 }];

  const quarterlyChartData = (["Q1","Q2","Q3","Q4"] as const)
    .map((q) => ({ period: q, "Gross Leads": quarterly[q].gross_leads, "Net Leads": quarterly[q].net_leads, "Appts Set": quarterly[q].appts_set, "Appts Executed": quarterly[q].appts_executed ?? 0, Contracts: quarterly[q].contracts }))
    .filter((q) => q["Gross Leads"] > 0 || q.Contracts > 0);

  const chartData = (() => {
    const d = (() => {
      switch (effectivePeriod) {
        case "day":     return dailyTrendData;
        case "week":    return weekChartData;
        case "quarter": return quarterlyChartData.length > 0 ? quarterlyChartData : trendData;
        case "year":    return [{ period: "YTD", "Gross Leads": ytd.gross_leads, "Net Leads": ytd.net_leads, "Appts Set": ytd.appts_set, "Appts Executed": ytd.appts_executed ?? 0, Contracts: ytd.contracts }];
        case "month":
        default:        return trendData;
      }
    })();
    // Never return empty — fallback to monthly trend
    return d.length > 0 ? d : trendData;
  })();

  const chartXKey = effectivePeriod === "day" ? "date" : effectivePeriod === "month" ? "month" : "period";
  const chartLines = effectivePeriod === "day"
    ? ["Jeff H Appts", "Brandon Appts"]
    : ["Gross Leads", "Net Leads", "Appts Set", "Appts Executed", "Contracts"];
  const lineColors = ["hsl(var(--chart-1))", "hsl(var(--chart-3))", "hsl(var(--chart-2))", "hsl(var(--chart-5))", "hsl(var(--chart-4))"];

  // Revenue chart — per-month goals from Asana.
  // For the CURRENT in-progress month, show total (funded + assigned) so the bar reflects
  // what's actually on the board. Past months will have assigned = 0 so total == funded.
  const revenueMonthlyData = activeMonths.map((m) => {
    const total = (salesMonthly as any).revenue_total?.[m] ?? 0;
    const funded = salesMonthly.revenue[m] ?? 0;
    return {
      month: m,
      Revenue: total > 0 ? total : funded,
      Funded: funded,
      Goal: monthRevGoal(m),
    };
  });

  const Q_MONTHS: Record<string, string[]> = {
    Q1: ["Jan","Feb","Mar"], Q2: ["Apr","May","Jun"],
    Q3: ["Jul","Aug","Sep"], Q4: ["Oct","Nov","Dec"],
  };
  const quarterlyRevenueData = (["Q1","Q2","Q3","Q4"] as const)
    .map((q) => {
      const total = (quarterly[q] as any).revenue_total ?? 0;
      const funded = quarterly[q].revenue ?? 0;
      return {
        period: q,
        Revenue: total > 0 ? total : funded,
        Funded: funded,
        Goal: Q_MONTHS[q].reduce((s, m) => s + monthRevGoal(m), 0),
      };
    })
    .filter((q) => q.Revenue > 0);

  const weeklyGoal = Math.round(currentMonthGoal / 4);
  const prevMonthRevenue  = Math.round((salesMonthly.revenue[prevMonth]  ?? 0) / 4);
  const latestMonthRevenue = Math.round((salesMonthly.revenue[latestMonth] ?? 0) / 4);

  const revenueChartData = (() => {
    const d = (() => {
      switch (effectivePeriod) {
        case "day":
          return [{ period: "Today", Revenue: pipe.revenue || Math.round((salesMonthly.revenue[latestMonth] ?? 0) / 30), Goal: Math.round(currentMonthGoal / 30) }];
        case "week":
          return [
            { period: `${prevMonth} avg/wk`,    Revenue: prevMonthRevenue,    Goal: Math.round(monthRevGoal(prevMonth) / 4) },
            { period: `${latestMonth} avg/wk`,   Revenue: latestMonthRevenue,  Goal: Math.round(monthRevGoal(latestMonth) / 4) },
          ];
        case "month":
          return revenueMonthlyData.length > 0 ? revenueMonthlyData : [{ month: latestMonth, Revenue: salesMonthly.revenue[latestMonth] ?? 0, Goal: currentMonthGoal }];
        case "quarter":
          return quarterlyRevenueData.length > 0
            ? quarterlyRevenueData
            : [{ period: currentQ, Revenue: pipe.revenue, Goal: (Q_MONTHS[currentQ] || []).reduce((s: number, m: string) => s + monthRevGoal(m), 0) }];
        case "year":
          return [{ period: "YTD", Revenue: (ytd as any).revenue_total ?? ytd.revenue, Funded: ytd.revenue, Goal: annualGoal }];
      }
    })();
    return d.length > 0 ? d : [{ period: latestMonth, Revenue: salesMonthly.revenue[latestMonth] ?? 0, Goal: currentMonthGoal }];
  })();

  const revXKey = effectivePeriod === "month" ? "month" : "period";

  const revChartTitle = {
    day:     "Daily Revenue Est.",
    week:    "Weekly Revenue Closed",
    month:   "Monthly Revenue vs. Goal",
    quarter: `${currentQ} Quarterly Revenue`,
    year:    "YTD Revenue",
  }[effectivePeriod];

  // On-track status per revenue data point (compare each entry against its own goal)
  const revOnTrackSummary = (() => {
    const aboveCount = revenueChartData.filter((d) => (d as any).Revenue >= ((d as any).Goal ?? currentMonthGoal)).length;
    const total = revenueChartData.length;
    if (total === 0) return { status: "yellow" as const, label: "No Data" };
    const pct = aboveCount / total;
    if (pct >= 0.75) return { status: "green" as const, label: "On Track" };
    if (pct >= 0.4) return { status: "yellow" as const, label: "Behind Pace" };
    return { status: "red" as const, label: "Below Goal" };
  })();

  // Calculate a prorated goal line for the current month (since it's mid-month)
  const proratedGoalForMonth = (month: string) => {
    const mGoal = monthRevGoal(month);
    // If this is the current month and we're mid-month, show prorated
    if (month === latestMonth) {
      const today = new Date();
      const dayOfMonth = today.getDate();
      const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
      return Math.round(mGoal * (dayOfMonth / daysInMonth));
    }
    return mGoal;
  };

  const pipelineSubtitle = isFallback
    ? `Showing ${latestMonth} data (no data for selected ${period} period)`
    : {
        day:     "Daily appointment activity",
        week:    `Monthly leads and appointments — ${prevMonth} vs ${latestMonth}`,
        quarter: `Quarterly pipeline — ${currentQ}`,
        year:    "Year-to-date pipeline totals",
        month:   `Monthly leads, appointments, and contracts — ${MONTHS[0] ?? ""} through ${latestMonth}`,
      }[effectivePeriod];

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="My Tennessee Home Solution" title="Company Scorecard">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="text-right text-[12px] text-muted-foreground">
            <div className="uppercase tracking-[0.14em]">Reporting</div>
            <div className="font-semibold text-foreground">{periodLabel(period)}</div>
          </div>
        </div>
      </PageHeader>

      <DataFreshnessBanner />

      {/* 2026 vs 2025 YoY comparison */}
      <YoYTile />

      {/* Fallback notice */}
      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No data available for the selected period — showing latest month ({latestMonth}) data.
        </div>
      )}

      {/* Hero: revenue ring + breakdown */}
      <div className="grid grid-cols-12 gap-4">
        <Card className="col-span-12 lg:col-span-5 flex items-center gap-6" padding="p-6">
          <ProgressRing
            value={heroRevenue}
            max={Math.max(heroGoal, 1)}
            size={160}
            stroke={14}
            label={fmtMoney(heroRevenue)}
            sub={`of ${fmtMoney(heroGoal)} ${effectivePeriod === "year" ? "goal" : "target"}`}
            accent="primary"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                {heroLabel}
              </div>
              <StoplightBadge
                status={paceStatus}
                label={paceStatus === "green" ? "On Pace" : paceStatus === "yellow" ? "Behind Pace" : "Below Pace"}
              />
            </div>
            <div className="mt-1.5 text-2xl font-semibold tracking-tight whitespace-nowrap">
              {fmtMoney(heroRevenue)}
              <span className="text-base font-normal text-muted-foreground">
                {" "}of {fmtMoney(heroGoal)}
              </span>
            </div>
            <div className="mt-1 text-sm text-muted-foreground">
              {((heroRevenue / Math.max(heroGoal, 1)) * 100).toFixed(1)}% of {effectivePeriod === "year" ? "annual" : "period"} goal
              {effectivePeriod === "year" && " · pace target ~33%"}
            </div>
            <div className="mt-3 space-y-1.5">
              <StatRow
                label="Q2 Revenue Target"
                value={fmtMoney(q2Target)}
                sub="April – June"
              />
              <StatRow
                label="Q2 Contracted"
                value={fmtMoney(q2Actual)}
                sub={`${((q2Actual / Math.max(q2Target, 1)) * 100).toFixed(0)}% of Q2 target · signed in pipeline`}
                status={statusFromTarget(q2Actual, q2Target / 3, true, 0.1)}
              />
              <StatRow
                label={`${latestMonth} Total Possible`}
                value={fmtMoney((salesMonthly as any).revenue_total_possible?.[latestMonth] ?? (salesMonthly as any).revenue_total?.[latestMonth] ?? (salesMonthly.revenue[latestMonth] ?? 0))}
                sub="Per Rev Tracker summary row"
              />
              <StatRow
                label={`${latestMonth} Actual (funded)`}
                value={fmtMoney(salesMonthly.revenue[latestMonth] ?? 0)}
                sub="Closed and in the bank"
              />
              {(((salesMonthly as any).revenue_assigned?.[latestMonth] ?? 0) > 0) && (
                <StatRow
                  label={`${latestMonth} Assigned`}
                  value={fmtMoney((salesMonthly as any).revenue_assigned?.[latestMonth] ?? 0)}
                  sub="Signed contracts, scheduled close"
                />
              )}
              {(((salesMonthly as any).revenue_soon_assigned?.[latestMonth] ?? 0) > 0) && (
                <StatRow
                  label={`${latestMonth} Soon Assigned`}
                  value={fmtMoney((salesMonthly as any).revenue_soon_assigned?.[latestMonth] ?? 0)}
                  sub="Likely deals, softer commitments"
                />
              )}
              {(((salesMonthly as any).revenue_contracted_tbd?.[latestMonth] ?? 0) > 0) && (
                <StatRow
                  label={`${latestMonth} Contracted (TBD close)`}
                  value={fmtMoney((salesMonthly as any).revenue_contracted_tbd?.[latestMonth] ?? 0)}
                  sub="Signed, close date TBD"
                />
              )}
              <StatRow
                label="Profit Margin Target"
                value={`${(company.profit_margin_target * 100).toFixed(0)}%`}
              />
            </div>
          </div>
        </Card>

        {/* Revenue chart — bar graph with on-track indicators */}
        <Card className="col-span-12 lg:col-span-7" padding="p-5">
          <div className="flex items-end justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {revChartTitle}
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">Revenue vs. Goal</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-status-green" /> At/Above
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-status-red" /> Below
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: "hsl(var(--accent) / 0.18)", border: "1.5px solid hsl(var(--accent) / 0.5)" }} /> Goal
                </span>
              </div>
              <StoplightBadge
                status={revOnTrackSummary.status}
                label={revOnTrackSummary.label}
              />
            </div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueChartData} margin={CHART_MARGIN}>
                <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey={revXKey} {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} tickFormatter={moneyTickFormatter} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  cursor={false}
                  formatter={(value: number, name: string) => [
                    fmtMoneyExact(value),
                    name,
                  ]}
                  labelFormatter={(label: string) => {
                    const item = revenueChartData.find((d) => (d as any)[revXKey] === label);
                    const rev = (item as any)?.Revenue ?? 0;
                    const goal = (item as any)?.Goal ?? 0;
                    const pct = goal > 0 ? ((rev / goal) * 100).toFixed(0) : "—";
                    const status = rev >= goal ? "\u2705 On Track" : "\u26a0\ufe0f Behind";
                    return `${label} — ${pct}% of goal ${status}`;
                  }}
                />
                {/* Goal bar — light translucent bar showing each period's target (no label, shown in summary row below) */}
                <Bar
                  dataKey="Goal"
                  radius={[4, 4, 0, 0]}
                  barSize={revenueChartData.length <= 2 ? 36 : revenueChartData.length <= 4 ? 24 : 18}
                  fill="hsl(var(--accent) / 0.15)"
                  stroke="hsl(var(--accent) / 0.45)"
                  strokeWidth={1.5}
                  isAnimationActive={false}
                />
                {/* Revenue bar — colored green/red based on goal comparison */}
                <Bar
                  dataKey="Revenue"
                  radius={[4, 4, 0, 0]}
                  barSize={revenueChartData.length <= 2 ? 36 : revenueChartData.length <= 4 ? 24 : 18}
                  isAnimationActive={false}
                >
                  {revenueChartData.map((entry, idx) => {
                    const rev = (entry as any).Revenue ?? 0;
                    const goal = (entry as any).Goal ?? salesMonthly.goals.revenue;
                    const month = (entry as any)[revXKey] ?? "";
                    const compareGoal = (effectivePeriod === "month" && month === latestMonth)
                      ? proratedGoalForMonth(latestMonth)
                      : goal;
                    const isOnTrack = rev >= compareGoal;
                    return (
                      <Cell
                        key={idx}
                        fill={isOnTrack ? "hsl(var(--status-green))" : "hsl(var(--status-red))"}
                        fillOpacity={0.85}
                      />
                    );
                  })}
                  <LabelList
                    dataKey="Revenue"
                    position="top"
                    formatter={(value: number) => fmtMoney(value)}
                    style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {/* On-track summary row under chart */}
          <div className="mt-3 flex items-center gap-2 border-t pt-3" style={{ borderColor: "hsl(var(--card-border))" }}>
            {revenueChartData.map((entry, idx) => {
              const rev = (entry as any).Revenue ?? 0;
              const goal = (entry as any).Goal ?? salesMonthly.goals.revenue;
              const label = (entry as any)[revXKey] ?? "";
              const month = label;
              const compareGoal = (effectivePeriod === "month" && month === latestMonth)
                ? proratedGoalForMonth(latestMonth)
                : goal;
              const isOnTrack = rev >= compareGoal;
              const pct = goal > 0 ? ((rev / goal) * 100).toFixed(0) : "0";
              return (
                <div key={idx} className="flex-1 text-center">
                  <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>
                  <div className={`text-sm font-bold num ${isOnTrack ? "text-status-green" : "text-status-red"}`}>
                    {pct}%
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {isOnTrack ? "On Track" : "Behind"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* KPI summary row */}
      <Section title={periodSectionTitle}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {(() => {
            // Contracts: pace-projected against the period-appropriate target.
            // For weekly/daily slices we don't have a meaningful contracts target,
            // so we keep them un-paced (no dot) rather than show a misleading red.
            // Prefer per-month targets (`monthlyGoals.contracts[month]`) when
            // available — a `null` value means no target was set for that month
            // and we pass target=0 so the dot renders muted gray ("No Target").
            const cMonthly: Record<string, number | null> | undefined =
              (salesMonthly as any).monthlyGoals?.contracts;
            let contractsTarget: number | undefined;
            if (effectivePeriod === "month") {
              if (cMonthly) {
                const t = cMonthly[latestMonth];
                contractsTarget = t == null ? 0 : t;
              } else {
                contractsTarget = salesMonthly.goals.contracts;
              }
            } else if (effectivePeriod === "quarter") {
              if (cMonthly) {
                let sum = 0; let any = false;
                for (const m of MONTHS.slice(-3)) { const t = cMonthly[m]; if (t != null) { sum += t; any = true; } }
                contractsTarget = any ? sum : 0;
              } else {
                contractsTarget = salesMonthly.goals.contracts * 3;
              }
            } else if (effectivePeriod === "year") {
              if (cMonthly) {
                let sum = 0; let any = false;
                for (const m of MONTHS) { const t = cMonthly[m]; if (t != null) { sum += t; any = true; } }
                contractsTarget = any ? sum : 0;
              } else {
                contractsTarget = salesMonthly.goals.contracts * MONTHS.length;
              }
            }
            const contractsPace = contractsTarget !== undefined ? {
              numericValue: pipe.contracts,
              target: contractsTarget,
              period: effectivePeriod as any,
            } : undefined;
            const profitStatus = statusFromTarget(pipe.profitPerDeal, salesMonthly.goals.profit_per_deal);
            return (
              <>
                <Scorecard
                  label="Contracts Signed"
                  value={periodKpis.contracts}
                  sub={periodKpis.contractsSub}
                  pace={contractsPace}
                  tooltip={KPI_NOTES.contracts}
                  metricKey="contracts"
                  size="lg"
                />
                <Scorecard
                  label="Closed Deals"
                  value={periodKpis.closedDeals}
                  sub={periodKpis.closedDealsSub}
                  tooltip={KPI_NOTES.closed_deals}
                  size="lg"
                />
                <Scorecard
                  label="Avg Profit / Deal"
                  value={periodKpis.profitPerDeal}
                  sub={periodKpis.profitSub}
                  status={profitStatus}
                  tooltip={KPI_NOTES.profit_per_deal}
                  pulse={profitStatus === "red"}
                  metricKey="profit_per_deal"
                  size="lg"
                />
                <Scorecard
                  label="Marketing Spend"
                  value={periodKpis.marketingSpend}
                  sub={periodKpis.marketingSpendSub}
                  tooltip={KPI_NOTES.marketing_spend}
                  metricKey="cost_per_appt"
                  size="lg"
                />
              </>
            );
          })()}
        </div>
      </Section>

      {/* Board Snapshot — Funnel + Deal Economics + Forward Pipeline */}
      {(conversionFunnel || dealEconomics || pipelineForward) && (
        <Section title="Board Snapshot" subtitle={`${conversionFunnel?.windowLabel ?? `Last ${conversionFunnel?.windowDays ?? 30} days`} conversion + deal economics + forward pipeline`}>
          <div className="grid grid-cols-12 gap-3">
            {/* Conversion Funnel */}
            {conversionFunnel && (
              <Card className="col-span-12 lg:col-span-5" padding="p-5">
                <div className="flex items-baseline justify-between mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                      Conversion Funnel
                    </div>
                    <div className="text-lg font-semibold tracking-tight mt-0.5">
                      Net Leads → Funded ({conversionFunnel.windowLabel ?? `${conversionFunnel.windowDays}d`})
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{conversionFunnel.source}</div>
                </div>
                <div className="space-y-2">
                  {conversionFunnel.stages.map((stage, i) => {
                    const widthPct = Math.max(4, Math.min(100, stage.fromTop));
                    return (
                      <div key={stage.label} className="text-sm">
                        <div className="flex items-baseline justify-between mb-1">
                          <div className="font-medium">{stage.label}</div>
                          <div className="tabular text-right">
                            <span className="font-semibold">{stage.value.toLocaleString()}</span>
                            {stage.fromPrev !== null && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {stage.fromPrev}% from prev
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${widthPct}%`, opacity: 1 - i * 0.12 }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            {/* Deal Economics */}
            {dealEconomics && (
              <Card className="col-span-12 lg:col-span-3" padding="p-5">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Deal Economics (YTD)
                </div>
                <div className="text-lg font-semibold tracking-tight mt-0.5 mb-3">
                  Avg Deal · Days-to-Close
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Avg Deal Size</div>
                    <div className="text-2xl font-semibold tabular">{fmtMoney(dealEconomics.avgDealSize)}</div>
                    <div className="text-xs text-muted-foreground">Median {fmtMoney(dealEconomics.medianDealSize)} · n={dealEconomics.fundedDealCount}</div>
                  </div>
                  <div className="pt-2 border-t border-border/40">
                    <div className="text-xs text-muted-foreground">Avg Days to Close</div>
                    <div className="text-2xl font-semibold tabular">{dealEconomics.avgDaysToClose}d</div>
                    <div className="text-xs text-muted-foreground">Median {dealEconomics.medianDaysToClose}d</div>
                  </div>
                </div>
              </Card>
            )}

            {/* Forward Pipeline Value */}
            {pipelineForward && (
              <Card className="col-span-12 lg:col-span-4" padding="p-5">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Forward Pipeline
                </div>
                <div className="text-lg font-semibold tracking-tight mt-0.5 mb-3">
                  What's coming
                </div>
                <div className="space-y-1.5">
                  <StatRow
                    label={`${latestMonth} — Remaining`}
                    value={fmtMoney(pipelineForward.currentMonthRemaining.value)}
                    sub={`${pipelineForward.currentMonthRemaining.count} deals scheduled later this month`}
                  />
                  <StatRow
                    label="Future Months"
                    value={fmtMoney(pipelineForward.futureMonths.value)}
                    sub={`${pipelineForward.futureMonths.count} deals beyond ${latestMonth}`}
                  />
                  <StatRow
                    label="Total Forward"
                    value={fmtMoney(pipelineForward.total.value)}
                    sub={`${pipelineForward.total.count} assigned, not yet funded`}
                  />
                  {pipelineForward.projected.count > 0 && (
                    <StatRow
                      label="TBD / Projected"
                      value={fmtMoney(pipelineForward.projected.value)}
                      sub={`${pipelineForward.projected.count} no close date set`}
                    />
                  )}
                </div>
              </Card>
            )}
          </div>
        </Section>
      )}

      {/* Current Deals Snapshot — added 5/20 review */}
      <CurrentDealsSection data={data as any} />

      {/* Pipeline trend */}
      <Section title="Pipeline Trend" subtitle={pipelineSubtitle}>
        <Card padding="p-5">
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              {effectivePeriod === "year" ? (
                <BarChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey={chartXKey} {...CHART_AXIS} />
                  <YAxis {...CHART_AXIS} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend {...CHART_LEGEND} />
                  <Bar {...BAR_DEFAULTS} dataKey="Gross Leads"    fill="hsl(var(--chart-1))" />
                  <Bar {...BAR_DEFAULTS} dataKey="Net Leads"      fill="hsl(var(--chart-3))" />
                  <Bar {...BAR_DEFAULTS} dataKey="Appts Set"      fill="hsl(var(--chart-2))" />
                  <Bar {...BAR_DEFAULTS} dataKey="Appts Executed" fill="hsl(var(--chart-5))" />
                  <Bar {...BAR_DEFAULTS} dataKey="Contracts"      fill="hsl(var(--chart-4))" />
                </BarChart>
              ) : (
                <LineChart data={chartData} margin={CHART_MARGIN}>
                  <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey={chartXKey} {...CHART_AXIS} />
                  <YAxis {...CHART_AXIS} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Legend {...CHART_LEGEND} />
                  {chartLines.map((key, i) => (
                    <Line
                      key={key}
                      isAnimationActive={false}
                      type="monotone"
                      dataKey={key}
                      stroke={lineColors[i] ?? "hsl(var(--chart-1))"}
                      {...LINE_DEFAULTS}
                      dot={{ ...LINE_DEFAULTS.dot, fill: lineColors[i] ?? "hsl(var(--chart-1))", stroke: lineColors[i] ?? "hsl(var(--chart-1))" }}
                      connectNulls
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        </Card>
      </Section>

      {/* Follow-Through Rate + Current Pipeline Deals */}
      <div className="grid grid-cols-12 gap-3">
        <Card
          className={`col-span-12 md:col-span-4 ${followThroughStatus === "red" ? "kpi-alert-pulse" : ""}`}
          padding="p-5"
        >
          <div className="flex items-center justify-between">
            <KpiTooltip
              label={
                <span className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Follow-Through Rate
                </span>
              }
              note="Percentage of signed contracts that did NOT drop. Calculated as (contracts − dropped contracts) ÷ contracts. Company benchmark: 85% or better."
              title="Follow-Through Rate"
            />
            <StoplightBadge status={followThroughStatus} />
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <div className="scorecard tabular text-5xl text-primary">{Math.round(followThroughYtd * 100)}</div>
            <div className="text-sm text-muted-foreground">% YTD</div>
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Target {Math.round(followThroughTarget * 100)}% — {followThroughYtd >= followThroughTarget ? "on track" : `${Math.round((followThroughTarget - followThroughYtd) * 100)} pts to goal`}
          </div>
          <div className="mt-4">
            <ProgressBar value={Math.round(followThroughYtd * 100)} max={Math.round(followThroughTarget * 100)} status={followThroughStatus} />
            <div className="mt-2 flex justify-between text-[11px] text-muted-foreground num">
              <span>0%</span>
              <span>Target: {Math.round(followThroughTarget * 100)}%</span>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dropped · {latestMonth}</div>
              <div className="text-xl font-semibold tabular-nums mt-0.5">
                {droppedThisMonth}
                <span className="text-[11px] text-muted-foreground ml-1">of {contractsThisMonth}</span>
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Dropped · YTD</div>
              <div className="text-xl font-semibold tabular-nums mt-0.5">
                {droppedYtd}
                <span className="text-[11px] text-muted-foreground ml-1">of {contractsYtd}</span>
              </div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-muted-foreground/80 border-t pt-2">
            Cash on hand: <span className="font-semibold text-foreground">{company.cash_on_hand_days} days</span> runway · CCC: <span className="font-semibold text-foreground">{ccc}d</span> (see breakdown below)
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-8" padding="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Current Pipeline Deals
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">
                Top active deals by projected revenue
              </div>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Total ·{" "}
              <span className="font-semibold num text-foreground">
                {fmtMoneyExact(transactions.pipelineRevenue)}
              </span>
              <span className="ml-2">{transactions.activeFiles} active</span>
            </div>
          </div>
          <div className="mb-2 text-[10px] text-muted-foreground/80 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-red inline-block"></span>Red = stage is <em className="not-italic font-semibold">File Issue</em> or <em className="not-italic font-semibold">Follow-Up Boss</em>, escalation flag, or past target close date</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-yellow inline-block"></span>Yellow = delay flagged</span>
            <span className="inline-flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-status-green inline-block"></span>Green = on track</span>
          </div>
          <div className="space-y-1">
            {transactions.dealFiles
              .slice()
              .sort((a, b) => b.projectedRevenue - a.projectedRevenue)
              .slice(0, 10)
              .map((deal, i) => {
                const stageLower = (deal.stage || "").toLowerCase();
                const stuckStage = stageLower.includes("file issue") || stageLower.includes("follow-up boss") || stageLower.includes("follow up boss");
                const status = deal.hasEscalation || deal.pastTarget || stuckStage
                  ? "red"
                  : deal.hasDelay
                  ? "yellow"
                  : "green";
                const valueColor =
                  status === "red"
                    ? "text-status-red"
                    : status === "yellow"
                    ? "text-status-yellow"
                    : "text-foreground";
                return (
                  <div
                    key={deal.fileId || `${deal.address}-${i}`}
                    className="flex items-center gap-3 py-2 border-b last:border-b-0"
                    style={{ borderColor: "hsl(var(--card-border))" }}
                  >
                    <div className="w-6 text-[11px] font-semibold num text-muted-foreground">
                      {String(i + 1).padStart(2, "0")}
                    </div>
                    <StoplightDot status={status} className="!h-2 !w-2" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-foreground truncate">{deal.address}</div>
                      <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                        <span className={stuckStage ? "text-status-red font-semibold" : ""}>{deal.stage || "In progress"}</span>
                        {deal.tc ? <span>· {deal.tc}</span> : null}
                        {deal.daysInPipeline > 0 && (
                          <span className={`px-1.5 py-px rounded text-[10px] tabular-nums ${stuckStage ? "bg-status-red/15 text-status-red" : "bg-muted/40"}`}>
                            {deal.daysInPipeline}d
                          </span>
                        )}
                      </div>
                    </div>
                    <div className={`text-sm font-semibold num ${valueColor}`}>
                      {fmtMoneyExact(deal.projectedRevenue)}
                    </div>
                  </div>
                );
              })}
            {transactions.dealFiles.length === 0 && (
              <div className="text-sm text-muted-foreground py-6 text-center">
                No active pipeline deals.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Detailed CCC: 7-stage funnel + per-house table (data from Historic Deal KPIs) */}
      <CashConversionCycleSection ccc={cashConversionCycle} />

      {/* Company Records — all-time bests */}
      {companyRecords && companyRecords.length > 0 && (
        <Section
          title="Company Records"
          subtitle="All-time bests across the team"
        >
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {companyRecords.map((rec) => (
              <Card key={rec.label} padding="p-4">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  {rec.label}
                </div>
                <div className="mt-2 text-3xl font-semibold tabular tracking-tight text-foreground">
                  {rec.format === "money"
                    ? fmtMoneyExact(rec.value)
                    : rec.value.toLocaleString()}
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {rec.when}
                </div>
                {rec.subtitle && (
                  <div className="mt-1 text-[12px] text-muted-foreground truncate">
                    {rec.subtitle}
                  </div>
                )}
              </Card>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ============================================================================
// CurrentDealsSection — added 5/20 review.
// Renders the live Current Deals snapshot (DD/UC/close dates, phase, projected
// revenue, attribution). Gracefully no-ops if the backend hasn't shipped yet.
// ============================================================================
function CurrentDealsSection({ data }: { data: any }) {
  const cd = data.currentDeals as
    | {
        activeDeals: Array<{
          address: string; city: string; phase: string; phaseRank: number;
          leadSource: string; dealType: string; leadManager: string; aqAgent: string;
          ddDate: string; ucDate: string; closeDate: string; dateAssigned: string;
          projectedRevenue: number; ageDays: number | null;
        }>;
        byPhase: Record<string, { count: number; projectedRevenue: number }>;
        byDealType: Record<string, { count: number; projectedRevenue: number }>;
        summary: { totalOpen: number; totalProjectedRevenue: number; avgProjectedPerDeal: number; underContract: number; pushedToBuyer: number; assigned: number };
      }
    | undefined;
  if (!cd || !cd.activeDeals?.length) return null;
  const sorted = [...cd.activeDeals].sort((a, b) => b.phaseRank - a.phaseRank);
  const top = sorted.slice(0, 25);
  return (
    <Section
      title="Current Deals Snapshot"
      subtitle={`${cd.summary.totalOpen} open deals • ${fmtMoney(cd.summary.totalProjectedRevenue)} projected (sale > assigned > pushed > purchase)`}
      actions={
        <a
          href="https://docs.google.com/spreadsheets/d/1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0/edit#gid=17564421"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[11px] uppercase tracking-[0.12em] font-semibold underline"
          style={{ color: "hsl(var(--baby-blue-700))" }}
        >
          → Open Records (Historic Deal KPIs)
        </a>
      }
    >
      <div className="grid grid-cols-12 gap-3 mb-3">
        <Card className="col-span-12 md:col-span-3" padding="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Open Deals</div>
          <div className="text-2xl font-bold tabular mt-1">{cd.summary.totalOpen}</div>
          <div className="text-xs text-muted-foreground mt-1">avg {fmtMoney(cd.summary.avgProjectedPerDeal)} / deal</div>
        </Card>
        <Card className="col-span-12 md:col-span-3" padding="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Under Contract</div>
          <div className="text-2xl font-bold tabular mt-1">{cd.summary.underContract}</div>
          <div className="text-xs text-muted-foreground mt-1">awaiting buyer push</div>
        </Card>
        <Card className="col-span-12 md:col-span-3" padding="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Pushed to Buyer</div>
          <div className="text-2xl font-bold tabular mt-1">{cd.summary.pushedToBuyer}</div>
          <div className="text-xs text-muted-foreground mt-1">awaiting assignment</div>
        </Card>
        <Card className="col-span-12 md:col-span-3" padding="p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Assigned</div>
          <div className="text-2xl font-bold tabular mt-1">{cd.summary.assigned}</div>
          <div className="text-xs text-muted-foreground mt-1">scheduled to close</div>
        </Card>
      </div>
      <Card padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground border-b border-border">
              <tr>
                <th className="py-2.5 px-3 text-left font-semibold">Address</th>
                <th className="py-2.5 px-3 text-left font-semibold">Phase</th>
                <th className="py-2.5 px-3 text-left font-semibold">Deal Type</th>
                <th className="py-2.5 px-3 text-left font-semibold">AQ · LM</th>
                <th className="py-2.5 px-3 text-right font-semibold">DD</th>
                <th className="py-2.5 px-3 text-right font-semibold">UC</th>
                <th className="py-2.5 px-3 text-right font-semibold">Assigned</th>
                <th className="py-2.5 px-3 text-right font-semibold">Close</th>
                <th className="py-2.5 px-3 text-right font-semibold">Projected $</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {top.map((d, i) => (
                <tr key={i} className="hover:bg-muted/30">
                  <td className="py-2 px-3 font-semibold">
                    <a
                      href={`https://docs.google.com/spreadsheets/d/1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0/edit?gid=17564421#gid=17564421&fvid=0&q=${encodeURIComponent(d.address || "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                      title="Find this row in Historic Deal KPIs"
                    >
                      {d.address}
                    </a>
                    <div className="text-[11px] text-muted-foreground font-normal">{d.city}</div>
                  </td>
                  <td className="py-2 px-3"><span className="inline-flex items-center gap-1.5 text-[12px]"><span className={`inline-block w-2 h-2 rounded-full ${phaseColor(d.phaseRank)}`}/>{d.phase}</span></td>
                  <td className="py-2 px-3 text-[12px]">{d.dealType}</td>
                  <td className="py-2 px-3 text-[12px]"><span className="font-medium">{d.aqAgent || "—"}</span>{d.leadManager ? <span className="text-muted-foreground"> · {d.leadManager}</span> : null}</td>
                  <td className="py-2 px-3 text-right tabular text-[12px]">{d.ddDate || "—"}</td>
                  <td className="py-2 px-3 text-right tabular text-[12px]">{d.ucDate || "—"}</td>
                  <td className="py-2 px-3 text-right tabular text-[12px]">{d.dateAssigned || "—"}</td>
                  <td className="py-2 px-3 text-right tabular text-[12px]">{d.closeDate || "—"}</td>
                  <td className="py-2 px-3 text-right tabular font-semibold">{d.projectedRevenue > 0 ? fmtMoney(d.projectedRevenue) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {sorted.length > top.length ? (
          <div className="text-xs text-muted-foreground px-3 py-2 border-t border-border">
            Showing top {top.length} of {sorted.length} open deals (sorted by phase → newest).
          </div>
        ) : null}
      </Card>
    </Section>
  );
}

function phaseColor(rank: number): string {
  // Higher rank = closer to close. Use semantic dashboard tokens.
  if (rank >= 7) return "bg-[hsl(var(--status-green))]";   // Assigned
  if (rank >= 5) return "bg-[hsl(var(--baby-blue-500))]";  // UC/Pushed
  if (rank >= 3) return "bg-[hsl(var(--status-amber))]";   // Appt set/exec
  return "bg-[hsl(var(--status-red))]";                    // Lead/Unknown
}
