import { useState } from "react";
import {
  Card,
  PageHeader,
  Scorecard,
  Section,
  StatRow,
  StoplightBadge,
  ProgressBar,
  StoplightDot,
} from "@/components/dash";
import { TimePeriodFilter, type TimePeriod } from "@/components/TimePeriodFilter";
import { useKpi } from "@/components/KpiDataProvider";
import {
  fmtMoney,
  fmtMoneyExact,
  fmtPct,
  statusFromTarget,
  periodLabel,
} from "@/lib/useKpiData";
import {
  getPipelineForPeriod,
  currentQuarterLabel,
  periodDisplayLabel,
} from "@/lib/periodHelpers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  PieChart,
  Pie,
  Legend,
} from "recharts";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_COLOR,
  CHART_AXIS,
  CHART_LEGEND,
  BAR_DEFAULTS,
  BAR_HORIZONTAL_DEFAULTS,
  CHART_MARGIN,
  CHART_MARGIN_HORIZONTAL,
} from "@/lib/chartConfig";

// Pie chart color palette
const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "hsl(var(--status-yellow))",
  "hsl(var(--status-green))",
  "hsl(var(--status-red))",
  "hsl(var(--muted-foreground))",
];

const AGE_COLORS = [
  "hsl(var(--status-green))",
  "hsl(var(--accent))",
  "hsl(var(--status-yellow))",
  "hsl(var(--status-red))",
];

const COMPLEXITY_COLORS: Record<string, string> = {
  Standard: "hsl(var(--status-green))",
  Creative: "hsl(var(--accent))",
  Complex: "hsl(var(--status-yellow))",
  "Title-Heavy": "hsl(var(--status-red))",
  Simple: "hsl(var(--primary))",
  Unknown: "hsl(var(--muted-foreground))",
};

export default function Transactions() {
  const [period, setPeriod] = useState<TimePeriod>("week");
  const [showDealTable, setShowDealTable] = useState(false);
  const kpiData = useKpi();

  const { transactions, dailyTransactions, salesActiveMonths, salesMonthly, ytd, quarterly } = kpiData;

  const r = transactions.rise_metrics;
  const t = transactions.team;
  // Find by name regardless of array order
  const kalyn = t.find((m) => m.name.toLowerCase().includes("kalyn")) ?? t[0];
  const dana  = t.find((m) => m.name.toLowerCase().includes("dana")) ?? (t.length > 1 ? t[1] : t[0]);

  const MONTHS      = salesActiveMonths;
  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Current";
  const prevMonth   = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Prev";
  const currentQ    = currentQuarterLabel(MONTHS);

  // ── Fallback pattern ─────────────────────────────────────────────────
  const rawPipeline   = getPipelineForPeriod(kpiData, period);
  const hasPeriodData = rawPipeline.revenue > 0 || rawPipeline.closedDeals > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const isFallback    = !hasPeriodData && period !== "month";
  const dispLabel     = periodDisplayLabel(effectivePeriod, MONTHS);

  const revClosedStatus   = statusFromTarget(r.revenue_closed.current,   r.revenue_closed.target);
  const contractsStatus   = statusFromTarget(r.contracts_closed.current, r.contracts_closed.target);
  const stuckStatus       = statusFromTarget(r.stuck_deals.current,      r.stuck_deals.target, false, 0.0);
  const termStatus        = statusFromTarget(transactions.termination_rate.current, transactions.termination_rate.target, false, 0.0);
  const activeFilesStatus = statusFromTarget(r.active_files.current,     r.active_files.target, true, 0.0);

  // Rise Metrics section label
  const riseSectionTitle = isFallback
    ? `Rise Metrics · ${latestMonth} (no ${period} data)`
    : (() => {
        switch (period) {
          case "day":     return `Rise Metrics · Today (${latestMonth})`;
          case "week":    return `Rise Metrics · ${latestMonth} (Latest Month)`;
          case "month":   return `Monthly Rise Metrics · ${latestMonth}`;
          case "quarter": return `Rise Metrics · ${currentQ}`;
          case "year":    return "Rise Metrics · YTD";
        }
      })();

  const revLabel = (() => {
    switch (effectivePeriod) {
      case "day":     return `Revenue Closed · Today`;
      case "week":    return `Revenue Closed · ${latestMonth}`;
      case "month":   return `Revenue Closed · ${latestMonth}`;
      case "quarter": return `Revenue Closed · ${currentQ}`;
      case "year":    return "Revenue Closed · YTD";
    }
  })();

  const contractsLabel = (() => {
    switch (effectivePeriod) {
      case "day":
      case "week":
      case "month":   return `Contracts Closed · ${latestMonth}`;
      case "quarter": return `Contracts Closed · ${currentQ}`;
      case "year":    return "Contracts Closed · YTD";
    }
  })();

  // Revenue closed trend chart
  const dailyRevTrend = [
    {
      period: dailyTransactions.kalyn.files_touched.length > 1 ? "Prev Kalyn" : "Kalyn",
      value:  dailyTransactions.kalyn.files_touched[dailyTransactions.kalyn.files_touched.length - 2] ?? 0,
      label:  `${dailyTransactions.kalyn.closings[dailyTransactions.kalyn.closings.length - 2] ?? 0} closings`,
    },
    {
      period: dailyTransactions.dana.files_touched.length > 1 ? "Prev Dana" : "Dana",
      value:  dailyTransactions.dana.files_touched[dailyTransactions.dana.files_touched.length - 2] ?? 0,
      label:  `${dailyTransactions.dana.closings[dailyTransactions.dana.closings.length - 2] ?? 0} closings`,
    },
    {
      period: "Today Kalyn",
      value:  dailyTransactions.kalyn.files_touched[dailyTransactions.kalyn.files_touched.length - 1] ?? 0,
      label:  `${dailyTransactions.kalyn.closings[dailyTransactions.kalyn.closings.length - 1] ?? 0} closings`,
    },
    {
      period: "Today Dana",
      value:  dailyTransactions.dana.files_touched[dailyTransactions.dana.files_touched.length - 1] ?? 0,
      label:  `${dailyTransactions.dana.closings[dailyTransactions.dana.closings.length - 1] ?? 0} closings`,
    },
  ];

  const monthlyRevTrend = [
    { period: prevMonth,   value: r.revenue_closed.current, label: `${((r.revenue_closed.current / Math.max(r.revenue_closed.target, 1)) * 100).toFixed(0)}% of target` },
    { period: latestMonth, value: r.revenue_closed.current, label: `${((r.revenue_closed.current / Math.max(r.revenue_closed.target, 1)) * 100).toFixed(0)}% of target` },
  ];

  const quarterlyRevTrend = (["Q1","Q2","Q3","Q4"] as const)
    .map((q) => ({ period: q, value: quarterly[q].revenue, label: `${quarterly[q].closed_deals} deals` }))
    .filter((q) => q.value > 0);

  const revClosedTrend = (() => {
    const trend = (() => {
      switch (effectivePeriod) {
        case "day":     return dailyRevTrend;
        case "quarter": return quarterlyRevTrend.length > 0 ? quarterlyRevTrend : monthlyRevTrend;
        case "year":    return [{ period: "YTD", value: ytd.revenue, label: `${ytd.closed_deals} deals` }];
        default:        return monthlyRevTrend;
      }
    })();
    return trend.length > 0 ? trend : monthlyRevTrend;
  })();

  const revTrendTitle = isFallback
    ? `Monthly — ${prevMonth} & ${latestMonth} (fallback)`
    : (() => {
        switch (period) {
          case "day":     return "Daily files touched";
          case "week":    return `Monthly — ${prevMonth} & ${latestMonth}`;
          case "month":   return `Monthly — ${prevMonth} & ${latestMonth}`;
          case "quarter": return `Quarterly Revenue — ${currentQ}`;
          case "year":    return "YTD Revenue";
        }
      })();

  const revTrendMax = (() => {
    switch (effectivePeriod) {
      case "day":     return Math.max(...revClosedTrend.map((d) => d.value), 1);
      case "quarter": return Math.max(...revClosedTrend.map((d) => d.value), r.revenue_closed.target * 3, 1);
      case "year":    return Math.max(ytd.revenue, 1);
      default:        return Math.max(r.revenue_closed.target, 1);
    }
  })();

  const pipelineChart = transactions.pipeline.map((p) => ({ ...p }));

  // New data from TC tracker — with safe fallbacks for cached data missing new fields
  const tx = {
    ...transactions,
    complexityBreakdown: transactions.complexityBreakdown ?? [],
    transactionTypes: transactions.transactionTypes ?? [],
    ageBuckets: transactions.ageBuckets ?? [{ range: "0-30 days", count: 0 }, { range: "31-45 days", count: 0 }, { range: "46-60 days", count: 0 }, { range: "61+ days", count: 0 }],
    avgDaysInPipeline: transactions.avgDaysInPipeline ?? 0,
    avgDaysToTitle: transactions.avgDaysToTitle ?? 0,
    avgDaysToClose: transactions.avgDaysToClose ?? 0,
    activeEscalations: transactions.activeEscalations ?? 0,
    activeDelays: transactions.activeDelays ?? 0,
    activePastTarget: transactions.activePastTarget ?? 0,
    active46PlusDays: transactions.active46PlusDays ?? 0,
    titleIssueRate: transactions.titleIssueRate ?? 0,
    pctActivePastTarget: transactions.pctActivePastTarget ?? 0,
    delayReasons: transactions.delayReasons ?? [],
    termReasons: transactions.termReasons ?? [],
    dealFiles: transactions.dealFiles ?? [],
    totalDeals: transactions.totalDeals ?? 0,
    closedRevenue: transactions.closedRevenue ?? 0,
    revenueClearToClose: transactions.revenueClearToClose ?? 0,
    pipelineRevenue: transactions.pipelineRevenue ?? 0,
    revenueAtRisk: transactions.revenueAtRisk ?? 0,
  };
  const escalationStatus = tx.activeEscalations > 3 ? "red" : tx.activeEscalations > 1 ? "yellow" : "green";
  const delayStatus = tx.activeDelays > 3 ? "red" : tx.activeDelays > 1 ? "yellow" : "green";
  const titleStatus = tx.titleIssueRate > 0.25 ? "red" : tx.titleIssueRate > 0.1 ? "yellow" : "green";
  const agingStatus = tx.avgDaysInPipeline > 60 ? "red" : tx.avgDaysInPipeline > 45 ? "yellow" : "green";

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Transactions" title="TC Capacity & Pipeline">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="text-right text-[12px] text-muted-foreground">
            <div className="uppercase tracking-[0.14em]">Active Files</div>
            <div className="font-semibold num text-foreground text-xl">{r.active_files.current}</div>
          </div>
        </div>
      </PageHeader>

      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No revenue data for selected period — showing latest month ({latestMonth}) snapshot.
        </div>
      )}

      {/* ═══ TC Capacity — always current snapshot ═══ */}
      <Section title="TC Capacity" subtitle="Live snapshot · workload points vs. individual capacity">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Kalyn */}
          <Card padding="p-5" className="border-status-red/30">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{kalyn.role}</div>
                <h3 className="text-lg font-semibold tracking-tight mt-0.5">{kalyn.name}</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider status-red-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {kalyn.status}
              </span>
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className="scorecard text-5xl tabular text-status-red">{Math.round(kalyn.utilization * 100)}%</div>
                <div className="text-sm text-muted-foreground mt-1 num">{kalyn.workload_points.toFixed(1)} pts / {kalyn.capacity} cap</div>
              </div>
              <div className="flex-1 pb-2">
                <ProgressBar value={kalyn.workload_points} max={kalyn.capacity * 2} status="red" />
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground num">
                  <span>0</span>
                  <span className="border-l pl-1 -ml-px" style={{ borderColor: "hsl(var(--border))" }}>capacity {kalyn.capacity}</span>
                  <span>{kalyn.capacity * 2}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <StatRow label="Active Files"    value={kalyn.active_files} />
              <StatRow label="Workload Points" value={kalyn.workload_points.toFixed(1)} />
              <StatRow label="Over Capacity By" value={`${(kalyn.workload_points - kalyn.capacity).toFixed(1)} pts`} status="red" />
            </div>
          </Card>

          {/* Dana */}
          <Card padding="p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{dana.role}</div>
                <h3 className="text-lg font-semibold tracking-tight mt-0.5">{dana.name}</h3>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider status-yellow-bg">
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {dana.status}
              </span>
            </div>
            <div className="flex items-end gap-4 mb-4">
              <div>
                <div className="scorecard text-5xl tabular text-status-yellow">{Math.round(dana.utilization * 100)}%</div>
                <div className="text-sm text-muted-foreground mt-1 num">{dana.workload_points.toFixed(1)} pts / {dana.capacity} cap</div>
              </div>
              <div className="flex-1 pb-2">
                <ProgressBar value={dana.workload_points} max={dana.capacity * 2} status="yellow" />
                <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground num">
                  <span>0</span>
                  <span>capacity {dana.capacity}</span>
                  <span>{dana.capacity * 2}</span>
                </div>
              </div>
            </div>
            <div className="space-y-1">
              <StatRow label="Active Files"    value={dana.active_files} />
              <StatRow label="Workload Points" value={dana.workload_points.toFixed(1)} />
              <StatRow label="Spare Capacity"  value={`${(dana.capacity - dana.workload_points).toFixed(1)} pts`} status="green" />
            </div>
          </Card>
        </div>

        {/* Rebalancing call-out */}
        {kalyn.workload_points > kalyn.capacity && dana.workload_points < dana.capacity && (
          <Card padding="p-4" className="border-l-4">
            <div className="flex items-center gap-3">
              <StoplightDot status="red" />
              <div className="flex-1 text-sm">
                <span className="font-semibold">Rebalance needed:</span>{" "}
                <span className="text-muted-foreground">
                  Shift ~{Math.round((kalyn.workload_points - dana.workload_points) / 2)} workload points from {kalyn.name} to {dana.name} to level both near optimal utilization.
                </span>
              </div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Action</div>
            </div>
          </Card>
        )}
      </Section>

      {/* ═══ Pipeline Snapshot — Key operational health metrics ═══ */}
      <Section title="Pipeline Snapshot" subtitle="Active deals · live operational health metrics">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <Scorecard
            label="Total Deals"
            value={tx.totalDeals}
            sub={`${tx.activeFiles} active · ${transactions.terminated} terminated`}
            size="lg"
          />
          <Scorecard
            label="Pipeline Revenue"
            value={fmtMoney(tx.pipelineRevenue)}
            sub={`${fmtMoney(tx.revenueClearToClose)} clear to close`}
            status="green"
            size="lg"
          />
          <Scorecard
            label="Avg Days in Pipeline"
            value={tx.avgDaysInPipeline}
            sub={`${tx.active46PlusDays} files 46+ days`}
            status={agingStatus as any}
            size="lg"
          />
          <Scorecard
            label="Active Escalations"
            value={tx.activeEscalations}
            sub={`${tx.activeDelays} delays`}
            status={escalationStatus as any}
            size="lg"
          />
          <Scorecard
            label="Title Issue Rate"
            value={fmtPct(tx.titleIssueRate, 0)}
            sub={`${tx.avgDaysToTitle > 0 ? `avg ${tx.avgDaysToTitle}d to title` : "no title data"}`}
            status={titleStatus as any}
            size="lg"
          />
          <Scorecard
            label="Revenue at Risk"
            value={fmtMoney(tx.revenueAtRisk)}
            sub={`${tx.onHold} on hold`}
            status="yellow"
            size="lg"
          />
        </div>
      </Section>

      {/* ═══ Rise Metrics — snapshot ═══ */}
      <Section title={riseSectionTitle}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Scorecard
            label="Active Files"
            value={r.active_files.current}
            sub={`Target ${r.active_files.target} · current snapshot`}
            status={activeFilesStatus}
            size="lg"
          />
          <Scorecard
            label={revLabel}
            value={fmtMoney(r.revenue_closed.current)}
            sub={`Target ${fmtMoney(r.revenue_closed.target)}`}
            status={revClosedStatus}
            size="lg"
          />
          <Scorecard
            label={contractsLabel}
            value={r.contracts_closed.current}
            sub={`Target ${r.contracts_closed.target}`}
            status={contractsStatus}
            size="lg"
          />
          <Scorecard
            label="Stuck Deals"
            value={r.stuck_deals.current}
            sub={`Target ≤ ${r.stuck_deals.target}`}
            status={stuckStatus}
            size="lg"
          />
          {(() => {
            const closed = r.contracts_closed.current;
            const active = r.active_files.current;
            const pct = active > 0 ? (closed / active) : 0;
            const closeStatus: "red" | "yellow" | "green" = pct >= 0.15 ? "green" : pct >= 0.08 ? "yellow" : "red";
            return (
              <Scorecard
                label="Weekly Close Rate"
                value={`${(pct * 100).toFixed(1)}%`}
                sub={`${closed} closed of ${active} active`}
                status={closeStatus}
                size="lg"
              />
            );
          })()}
        </div>

        {/* Daily files touched — only shown for day period */}
        {effectivePeriod === "day" && (
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Card padding="p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-3">
                Kalyn · Latest Day
              </div>
              <div className="space-y-2">
                <StatRow label="Files Touched" value={dailyTransactions.kalyn.files_touched[dailyTransactions.kalyn.files_touched.length - 1] ?? 0} />
                <StatRow label="Closings"       value={dailyTransactions.kalyn.closings[dailyTransactions.kalyn.closings.length - 1] ?? 0} />
              </div>
            </Card>
            <Card padding="p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-3">
                Dana · Latest Day
              </div>
              <div className="space-y-2">
                <StatRow label="Files Touched" value={dailyTransactions.dana.files_touched[dailyTransactions.dana.files_touched.length - 1] ?? 0} />
                <StatRow label="Closings"       value={dailyTransactions.dana.closings[dailyTransactions.dana.closings.length - 1] ?? 0} />
              </div>
            </Card>
          </div>
        )}
      </Section>

      {/* ═══ Deal Pipeline + Revenue Trend + Age Buckets ═══ */}
      <div className="grid grid-cols-12 gap-3">
        {/* Deal Pipeline */}
        <Card className="col-span-12 lg:col-span-5" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Deal Pipeline
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              By stage · active files
            </div>
          </div>
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pipelineChart} layout="vertical" margin={CHART_MARGIN_HORIZONTAL}>
                <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" {...CHART_AXIS} />
                <YAxis dataKey="stage" type="category" {...CHART_AXIS} fontSize={11} width={130} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar {...BAR_HORIZONTAL_DEFAULTS} dataKey="count">
                  {pipelineChart.map((p, i) => (
                    <Cell
                      key={i}
                      fill={
                        p.stage === "Stuck / At Risk"
                          ? "hsl(var(--status-red))"
                          : p.stage === "Clear to Close" || p.stage === "Scheduled to Close"
                            ? "hsl(var(--status-green))"
                            : "hsl(var(--primary))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Age in Pipeline */}
        <Card className="col-span-12 lg:col-span-3" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Aging & Timing Risk
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Days in pipeline
            </div>
          </div>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={tx.ageBuckets} margin={{ top: 8, right: 8, bottom: 4, left: -16 }}>
                <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" />
                <XAxis dataKey="range" {...CHART_AXIS} fontSize={10} />
                <YAxis {...CHART_AXIS} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar {...BAR_DEFAULTS} dataKey="count" barSize={32}>
                  {tx.ageBuckets.map((_, i) => (
                    <Cell key={i} fill={AGE_COLORS[i]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 space-y-1.5">
            <StatRow label="Avg Days" value={`${tx.avgDaysInPipeline}d`} status={agingStatus as any} />
            <StatRow label="Past Target" value={`${fmtPct(tx.pctActivePastTarget, 0)} (${tx.activePastTarget})`} status={tx.activePastTarget > 3 ? "red" : "yellow"} />
            {tx.avgDaysToClose > 0 && (
              <StatRow label="Avg Days to Close" value={`${tx.avgDaysToClose}d`} />
            )}
          </div>
        </Card>

        {/* Revenue Trend */}
        <div className="col-span-12 lg:col-span-4 space-y-3">
          <Card padding="p-5">
            <div className="mb-3">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Revenue Closed Trend
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">
                {revTrendTitle}
              </div>
            </div>
            <div className="space-y-3">
              {revClosedTrend.map((item) => {
                const val    = item.value;
                const pct    = revTrendMax > 0 ? (val / revTrendMax) * 100 : 0;
                const status = statusFromTarget(val, r.revenue_closed.target);
                return (
                  <div key={item.period} className="space-y-1">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-semibold num">{item.period}</span>
                      <span className="num">
                        {fmtMoneyExact(val)}{" "}
                        <span className="text-muted-foreground">({pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <ProgressBar value={val} max={Math.max(revTrendMax, 1)} status={status} />
                  </div>
                );
              })}
              <div className="pt-3 border-t text-[11px] text-muted-foreground num flex justify-between">
                <span>Target</span>
                <span className="font-semibold text-foreground">{fmtMoneyExact(r.revenue_closed.target)} / month</span>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* ═══ Complexity + Transaction Types + Risk ═══ */}
      <div className="grid grid-cols-12 gap-3">
        {/* Complexity Breakdown */}
        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Deal Complexity
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Active files breakdown
            </div>
          </div>
          <div className="space-y-2">
            {tx.complexityBreakdown.map((c) => {
              const total = tx.complexityBreakdown.reduce((s, x) => s + x.count, 0);
              const pct = total > 0 ? (c.count / total) * 100 : 0;
              return (
                <div key={c.type} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: COMPLEXITY_COLORS[c.type] || COMPLEXITY_COLORS.Unknown }}
                      />
                      <span className="font-medium">{c.type}</span>
                    </div>
                    <span className="num">{c.count} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: COMPLEXITY_COLORS[c.type] || COMPLEXITY_COLORS.Unknown,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Transaction Types */}
        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Transaction Types
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Active deals by type
            </div>
          </div>
          <div className="space-y-2">
            {tx.transactionTypes.map((t, i) => {
              const total = tx.transactionTypes.reduce((s, x) => s + x.count, 0);
              const pct = total > 0 ? (t.count / total) * 100 : 0;
              return (
                <div key={t.type} className="space-y-1">
                  <div className="flex items-center justify-between text-[13px]">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-sm"
                        style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="font-medium">{t.type}</span>
                    </div>
                    <span className="num">{t.count} <span className="text-muted-foreground">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Risk Indicators */}
        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Risk Indicators
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Active file risk summary
            </div>
          </div>
          <div className="space-y-2">
            <StatRow
              label={`Termination Rate`}
              value={fmtPct(transactions.termination_rate.current, 1)}
              sub={`Target ≤ ${fmtPct(transactions.termination_rate.target, 0)} · ${transactions.terminated} terminated`}
              status={termStatus}
            />
            <StatRow
              label="Revenue at Risk"
              value={fmtMoneyExact(transactions.revenueAtRisk)}
              status="yellow"
              sub={`${transactions.onHold} on hold`}
            />
            <StatRow
              label="Title Issues"
              value={fmtPct(tx.titleIssueRate, 0)}
              status={titleStatus as any}
              sub={tx.avgDaysToTitle > 0 ? `Avg ${tx.avgDaysToTitle} days to title` : undefined}
            />
            <StatRow
              label="Escalations"
              value={tx.activeEscalations}
              status={escalationStatus as any}
            />
            <StatRow
              label="Delays"
              value={tx.activeDelays}
              status={delayStatus as any}
            />
            <StatRow label="Stuck ≥ 2 Weeks" value={r.stuck_deals.current} status={stuckStatus} />
          </div>

          {/* Delay reasons if any */}
          {tx.delayReasons.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Delay Reasons
              </div>
              {tx.delayReasons.map((d) => (
                <div key={d.reason} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground truncate mr-2">{d.reason}</span>
                  <span className="num font-medium">{d.count}</span>
                </div>
              ))}
            </div>
          )}

          {/* Term reasons if any */}
          {tx.termReasons.length > 0 && (
            <div className="mt-3 pt-3 border-t space-y-1.5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Termination Reasons
              </div>
              {tx.termReasons.map((t) => (
                <div key={t.reason} className="flex items-center justify-between text-[12px]">
                  <span className="text-muted-foreground truncate mr-2">{t.reason}</span>
                  <span className="num font-medium">{t.count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ═══ Active Deal Files Table ═══ */}
      <Section title="Active Deal Files" subtitle={`${tx.dealFiles.length} active files · sorted by days in pipeline`}>
        <Card padding="p-0" className="overflow-hidden">
          {/* Toggle */}
          <div className="px-5 py-3 border-b flex items-center justify-between">
            <div className="text-[13px] text-muted-foreground">
              {tx.dealFiles.length} files · {fmtMoneyExact(tx.pipelineRevenue)} pipeline revenue
            </div>
            <button
              onClick={() => setShowDealTable(!showDealTable)}
              className="text-[12px] font-medium text-primary hover:underline"
              data-testid="toggle-deal-table"
            >
              {showDealTable ? "Hide table" : "Show table"}
            </button>
          </div>

          {showDealTable && (
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]" data-testid="deal-files-table">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-2 font-medium text-muted-foreground">Address</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">TC</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Stage</th>
                    <th className="text-left px-3 py-2 font-medium text-muted-foreground">Complexity</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Days</th>
                    <th className="text-right px-3 py-2 font-medium text-muted-foreground">Revenue</th>
                    <th className="text-center px-3 py-2 font-medium text-muted-foreground">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.dealFiles.map((deal, i) => (
                    <tr
                      key={deal.fileId || i}
                      className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${deal.hasEscalation || deal.pastTarget ? "bg-status-red/5" : ""}`}
                    >
                      <td className="px-4 py-2 font-medium max-w-[180px] truncate" title={deal.address}>
                        {deal.address}
                      </td>
                      <td className="px-3 py-2">{deal.tc}</td>
                      <td className="px-3 py-2">
                        <span className="inline-block px-1.5 py-0.5 rounded bg-muted text-[10px] font-medium">
                          {deal.type}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{deal.stage}</td>
                      <td className="px-3 py-2">
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            backgroundColor: `${COMPLEXITY_COLORS[deal.complexity] || COMPLEXITY_COLORS.Unknown}20`,
                            color: COMPLEXITY_COLORS[deal.complexity] || COMPLEXITY_COLORS.Unknown,
                          }}
                        >
                          {deal.complexity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num">
                        <span className={deal.daysInPipeline >= 61 ? "text-status-red font-semibold" : deal.daysInPipeline >= 46 ? "text-status-yellow font-medium" : ""}>
                          {deal.daysInPipeline}d
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right num">
                        {deal.projectedRevenue > 0 ? fmtMoney(deal.projectedRevenue) : "—"}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {deal.hasEscalation && (
                            <span className="inline-block w-4 h-4 rounded-full bg-status-red/15 text-status-red text-[9px] font-bold leading-4 text-center" title="Escalation">!</span>
                          )}
                          {deal.hasDelay && (
                            <span className="inline-block w-4 h-4 rounded-full bg-status-yellow/15 text-status-yellow text-[9px] font-bold leading-4 text-center" title="Delay">D</span>
                          )}
                          {deal.pastTarget && (
                            <span className="inline-block w-4 h-4 rounded-full bg-status-red/15 text-status-red text-[9px] font-bold leading-4 text-center" title="Past Target">T</span>
                          )}
                          {deal.titleStatus && deal.titleStatus.toLowerCase() !== "clean" && deal.titleStatus.toLowerCase() !== "clear" && deal.titleStatus.toLowerCase() !== "received" && (
                            <span className="inline-block w-4 h-4 rounded-full bg-accent/15 text-accent text-[9px] font-bold leading-4 text-center" title={`Title: ${deal.titleStatus}`}>§</span>
                          )}
                          {!deal.hasEscalation && !deal.hasDelay && !deal.pastTarget && "—"}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </Section>
    </div>
  );
}
