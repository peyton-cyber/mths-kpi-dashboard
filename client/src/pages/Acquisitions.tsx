import { useState } from "react";
import {
  Card,
  PageHeader,
  Scorecard,
  Section,
  StatRow,
  StoplightBadge,
  ProgressBar,
} from "@/components/dash";
import { TimePeriodFilter, type TimePeriod } from "@/components/TimePeriodFilter";
import { useKpi } from "@/components/KpiDataProvider";
import { AlertBanner } from "@/components/AlertBanner";
import { LiveFieldActivity } from "@/components/LiveFieldActivity";
import {
  fmtPct,
  fmtMoney,
  statusFromTarget,
  periodLabel,
} from "@/lib/useKpiData";
import {
  getPipelineForPeriod,
  periodDisplayLabel,
  goalMultiplier,
  currentQuarterLabel,
  currentQuarterMonths,
  repValueForPeriod,
  ratioForPeriod,
} from "@/lib/periodHelpers";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
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
  BAR_DEFAULTS,
  BAR_HORIZONTAL_DEFAULTS,
  CHART_MARGIN,
  CHART_MARGIN_HORIZONTAL,
} from "@/lib/chartConfig";

export default function Acquisitions() {
  const [period, setPeriod] = useState<TimePeriod>("month");
  const data = useKpi();

  const { salesMonthly, salesWeekly, companyWeekly, ytd, quarterly, salesActiveMonths, dailySales } = data;
  const MONTHS = salesActiveMonths;

  const t = salesWeekly.targets;
  const leadManagers = salesWeekly.leadManagers;
  const aqAgents = salesWeekly.aqAgents;
  const riseQ2LM = salesWeekly.riseQ2?.leadManagers || {};
  const riseQ2AQ = salesWeekly.riseQ2?.aqAgents || {};

  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Jan";
  const prevMonth   = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Jan";
  const currentQ    = currentQuarterLabel(MONTHS);

  // ── Fallback pattern ─────────────────────────────────────────────────
  const rawPipeline = getPipelineForPeriod(data, period);
  const hasPeriodData =
    rawPipeline.grossLeads > 0 || rawPipeline.netLeads > 0 ||
    rawPipeline.apptsSet > 0  || rawPipeline.revenue > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const pipe = hasPeriodData ? rawPipeline : getPipelineForPeriod(data, "month");
  const isFallback = !hasPeriodData && period !== "month";
  // ─────────────────────────────────────────────────────────────────────

  const mult       = goalMultiplier(effectivePeriod, MONTHS);
  const dispLabel  = periodDisplayLabel(effectivePeriod, MONTHS);

  // Section title for scorecards
  const targetSectionTitle = isFallback
    ? `Monthly Targets · ${latestMonth} (no ${period} data)`
    : (() => {
        switch (period) {
          case "day":     return "Daily Targets";
          case "week":    return `Weekly Targets · ${latestMonth}`;
          case "month":   return `Monthly Targets · ${latestMonth}`;
          case "quarter": return `${currentQ} Targets`;
          case "year":    return "YTD Targets";
        }
      })();

  // The 4 scorecards use getPipelineForPeriod values + scaled goals
  const grossLeadsGoal  = Math.round(salesMonthly.goals.gross_leads  * mult);
  const netLeadsGoal    = Math.round(salesMonthly.goals.net_leads    * mult);
  const apptsSetGoal    = Math.round(salesMonthly.goals.appts_set    * mult);
  const apptsExecGoal   = Math.round(salesMonthly.goals.appts_executed * mult);

  // Per-period "effective target" used by pace dots. Returns 0 when the
  // current period has no explicit target in the sheet — the dot is then
  // rendered as muted gray ("No Target") instead of falsely going red.
  // Source: backend `salesMonthly.monthlyGoals[metric][month]` (number | null).
  const monthlyGoals: Record<string, Record<string, number | null>> | undefined =
    (salesMonthly as any).monthlyGoals;
  function paceTarget(metricKey: string, fullPeriodGoal: number): number {
    // No per-month map yet (older API) — fall back to scaled goal.
    if (!monthlyGoals || !monthlyGoals[metricKey]) return fullPeriodGoal;
    const map = monthlyGoals[metricKey];
    if (effectivePeriod === "month" || effectivePeriod === "week" || effectivePeriod === "day") {
      const t = map[latestMonth];
      if (t == null) return 0; // suppress pace dot — no target set
      // For sub-month periods, scale the monthly target proportionally.
      return Math.round(t * mult);
    }
    if (effectivePeriod === "quarter") {
      const qm = currentQuarterMonths(MONTHS);
      let sum = 0; let any = false;
      for (const m of qm) { const t = map[m]; if (t != null) { sum += t; any = true; } }
      return any ? sum : 0;
    }
    if (effectivePeriod === "year") {
      let sum = 0; let any = false;
      for (const m of MONTHS) { const t = map[m]; if (t != null) { sum += t; any = true; } }
      return any ? sum : 0;
    }
    return fullPeriodGoal;
  }
  const grossLeadsPaceTgt = paceTarget("gross_leads",    grossLeadsGoal);
  const netLeadsPaceTgt   = paceTarget("net_leads",      netLeadsGoal);
  const apptsSetPaceTgt   = paceTarget("appts_set",      apptsSetGoal);
  const apptsExecPaceTgt  = paceTarget("appts_executed", apptsExecGoal);

  // Funnel chart data
  const monthFunnel = [
    { stage: "Gross Leads",    value: salesMonthly.gross_leads[latestMonth]    ?? 0, goal: salesMonthly.goals.gross_leads },
    { stage: "Net Leads",      value: salesMonthly.net_leads[latestMonth]      ?? 0, goal: salesMonthly.goals.net_leads },
    { stage: "Appts Set",      value: salesMonthly.appts_set[latestMonth]      ?? 0, goal: salesMonthly.goals.appts_set },
    { stage: "Appts Executed", value: salesMonthly.appts_executed[latestMonth] ?? 0, goal: salesMonthly.goals.appts_executed },
    { stage: "Contracts",      value: salesMonthly.contracts[latestMonth]      ?? 0, goal: salesMonthly.goals.contracts },
    { stage: "Closed Deals",   value: salesMonthly.closed_deals[latestMonth]   ?? 0, goal: 0 },
  ];

  const ytdFunnel = [
    { stage: "Gross Leads",    value: ytd.gross_leads,    goal: salesMonthly.goals.gross_leads    * MONTHS.length },
    { stage: "Net Leads",      value: ytd.net_leads,      goal: salesMonthly.goals.net_leads      * MONTHS.length },
    { stage: "Appts Set",      value: ytd.appts_set,      goal: salesMonthly.goals.appts_set      * MONTHS.length },
    { stage: "Appts Executed", value: ytd.appts_executed, goal: salesMonthly.goals.appts_executed * MONTHS.length },
  ];

  const qMonths = currentQuarterMonths(MONTHS);
  const qData   = quarterly[currentQ as "Q1"|"Q2"|"Q3"|"Q4"];
  const quarterFunnel = [
    { stage: "Gross Leads",    value: qData.gross_leads,    goal: salesMonthly.goals.gross_leads    * 3 },
    { stage: "Net Leads",      value: qData.net_leads,      goal: salesMonthly.goals.net_leads      * 3 },
    { stage: "Appts Set",      value: qData.appts_set,      goal: salesMonthly.goals.appts_set      * 3 },
    { stage: "Appts Executed", value: qData.appts_executed, goal: salesMonthly.goals.appts_executed * 3 },
    { stage: "Contracts",      value: qData.contracts,      goal: salesMonthly.goals.contracts      * 3 },
  ];

  const weekFunnel = [
    { stage: "Gross Leads",     value: companyWeekly.gross_leads[latestMonth]    ?? 0, goal: companyWeekly.gross_leads.target },
    { stage: "Net Leads",       value: companyWeekly.net_leads[latestMonth]      ?? 0, goal: companyWeekly.net_leads.target },
    { stage: "Appts Scheduled", value: companyWeekly.appts_scheduled[latestMonth] ?? 0, goal: companyWeekly.appts_scheduled.target },
    { stage: "Appts Attended",  value: companyWeekly.appts_attended[latestMonth]  ?? 0, goal: companyWeekly.appts_attended.target },
  ];

  const dayFunnel = [
    { stage: "Jeff H Appts",   value: dailySales.jeff_h.appts[dailySales.jeff_h.appts.length - 1]    ?? 0, goal: 2 },
    { stage: "Brandon Appts",  value: dailySales.brandon.appts[dailySales.brandon.appts.length - 1]  ?? 0, goal: 2 },
    { stage: "Jeff H Calls",   value: dailySales.jeff_h.calls[dailySales.jeff_h.calls.length - 1]    ?? 0, goal: 25 },
    { stage: "Brandon Calls",  value: dailySales.brandon.calls[dailySales.brandon.calls.length - 1]  ?? 0, goal: 25 },
  ];

  const funnelSteps = (() => {
    const steps = (() => {
      switch (effectivePeriod) {
        case "day":     return dayFunnel;
        case "week":    return weekFunnel;
        case "month":   return monthFunnel;
        case "quarter": return quarterFunnel.some((s) => s.value > 0) ? quarterFunnel : monthFunnel;
        case "year":    return ytdFunnel.some((s) => s.value > 0) ? ytdFunnel : monthFunnel;
      }
    })();
    return steps.length > 0 ? steps : monthFunnel;
  })();

  const funnelTitle = isFallback
    ? `${latestMonth} Funnel (fallback)`
    : (() => {
        switch (period) {
          case "day":     return "Daily Activity";
          case "week":    return `${latestMonth} Funnel (Weekly)`;
          case "month":   return `${latestMonth} Funnel`;
          case "quarter": return `${currentQ} Funnel`;
          case "year":    return "YTD Funnel";
        }
      })();

  const funnelSubtitle = (() => {
    switch (effectivePeriod) {
      case "day":     return "Latest day · individual rep output";
      case "week":    return `${latestMonth} leads and appointments vs targets`;
      case "month":   return "From gross leads to closed deals — with monthly goals";
      case "quarter": return `${currentQ} aggregate`;
      case "year":    return "Year-to-date pipeline vs annual goals";
    }
  })();

  // Goals comparison chart
  const goalsChartData = (() => {
    switch (effectivePeriod) {
      case "year":
        return [
          { metric: "Gross Leads",    Actual: ytd.gross_leads,    Goal: salesMonthly.goals.gross_leads    * MONTHS.length },
          { metric: "Net Leads",      Actual: ytd.net_leads,      Goal: salesMonthly.goals.net_leads      * MONTHS.length },
          { metric: "Appts Set",      Actual: ytd.appts_set,      Goal: salesMonthly.goals.appts_set      * MONTHS.length },
          { metric: "Appts Executed", Actual: ytd.appts_executed, Goal: salesMonthly.goals.appts_executed * MONTHS.length },
        ];
      case "quarter":
        return [
          { metric: "Gross Leads",    Actual: qData.gross_leads,    Goal: salesMonthly.goals.gross_leads    * 3 },
          { metric: "Net Leads",      Actual: qData.net_leads,      Goal: salesMonthly.goals.net_leads      * 3 },
          { metric: "Appts Set",      Actual: qData.appts_set,      Goal: salesMonthly.goals.appts_set      * 3 },
          { metric: "Appts Executed", Actual: qData.appts_executed, Goal: salesMonthly.goals.appts_executed * 3 },
          { metric: "Contracts",      Actual: qData.contracts,      Goal: salesMonthly.goals.contracts      * 3 },
        ];
      default:
        return [
          { metric: "Gross Leads",    Actual: salesMonthly.gross_leads[latestMonth]    ?? 0, Goal: Math.round(salesMonthly.goals.gross_leads    * mult) },
          { metric: "Net Leads",      Actual: salesMonthly.net_leads[latestMonth]      ?? 0, Goal: Math.round(salesMonthly.goals.net_leads      * mult) },
          { metric: "Appts Set",      Actual: salesMonthly.appts_set[latestMonth]      ?? 0, Goal: Math.round(salesMonthly.goals.appts_set      * mult) },
          { metric: "Appts Executed", Actual: salesMonthly.appts_executed[latestMonth] ?? 0, Goal: Math.round(salesMonthly.goals.appts_executed * mult) },
          { metric: "Contracts",      Actual: salesMonthly.contracts[latestMonth]      ?? 0, Goal: Math.round(salesMonthly.goals.contracts      * mult) },
        ];
    }
  })();

  const goalsChartLabel = (() => {
    switch (effectivePeriod) {
      case "year":    return "YTD · Actual vs Goal";
      case "quarter": return `${currentQ} · Actual vs Goal`;
      case "day":     return `Daily Est. · Actual vs Goal`;
      case "week":    return `${latestMonth} Weekly · Actual vs Goal`;
      default:        return `${latestMonth} · Actual vs Goal`;
    }
  })();

  const goalsChartSub = (() => {
    switch (effectivePeriod) {
      case "year":    return "Year-to-date performance";
      case "quarter": return `${currentQ} performance`;
      default:        return "Period performance at a glance";
    }
  })();

  // Conversion rates card
  const showAllMonths = effectivePeriod === "year";
  const conversionMonths = showAllMonths ? MONTHS : [latestMonth];
  const conversionTitle = (() => {
    switch (effectivePeriod) {
      case "day":
      case "week":    return `${latestMonth} snapshot (monthly resolution)`;
      case "month":   return "Monthly ratios";
      case "quarter": return `${currentQ} avg conversion rates`;
      case "year":    return "Monthly ratios (all months)";
    }
  })();

  // Rep section title
  const repSectionTitle = isFallback
    ? `Rep Performance · ${latestMonth} (fallback)`
    : (() => {
        switch (period) {
          case "day":     return "Rep Activity · Today";
          case "week":    return `Rep Performance · ${latestMonth} (Weekly)`;
          case "month":   return `Rep Performance · ${latestMonth}`;
          case "quarter": return `Rep Performance · ${currentQ}`;
          case "year":    return "Rep Performance · YTD";
        }
      })();

  const repSubLabel = isFallback ? latestMonth : dispLabel;

  const leadManagerNames = Object.keys(leadManagers);
  const aqAgentNames     = Object.keys(aqAgents);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Acquisitions · Sales" title="Lead-to-Contract Engine">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="flex items-center gap-2 text-[12px]">
            <span className="text-muted-foreground">Viewing</span>
            <span className="font-semibold num text-foreground">{periodLabel(period)}</span>
          </div>
        </div>
      </PageHeader>

      <AlertBanner filterPersons={["Korbin", "TJ", "Ryan", "Brandon", "Jeff", "Jonathan"]} />

      {/* Live AQ field activity — map + windshield time. Stub data until Bouncie is wired. */}
      <LiveFieldActivity data={(data as any)?.fieldActivity} />

      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No data available for the selected period — showing latest month ({latestMonth}) data.
        </div>
      )}

      {/* Scorecard targets — all 4 use getPipelineForPeriod + scaled goals */}
      <Section title={targetSectionTitle}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Scorecard
            label="Gross Leads"
            value={pipe.grossLeads}
            sub={`Target ${grossLeadsGoal} · ${dispLabel}`}
            pace={{ numericValue: pipe.grossLeads, target: grossLeadsPaceTgt, period: effectivePeriod as any }}
            size="lg"
          />
          <Scorecard
            label="Net Leads"
            value={pipe.netLeads}
            sub={`Target ${netLeadsGoal} · ${dispLabel}`}
            pace={{ numericValue: pipe.netLeads, target: netLeadsPaceTgt, period: effectivePeriod as any }}
            size="lg"
          />
          <Scorecard
            label="Appts Scheduled"
            value={pipe.apptsSet}
            sub={`Target ${apptsSetGoal} · ${dispLabel}`}
            pace={{ numericValue: pipe.apptsSet, target: apptsSetPaceTgt, period: effectivePeriod as any }}
            size="lg"
          />
          <Scorecard
            label="Appts Attended"
            value={pipe.apptsExecuted}
            sub={`Target ${apptsExecGoal} · ${dispLabel}`}
            pace={{ numericValue: pipe.apptsExecuted, target: apptsExecPaceTgt, period: effectivePeriod as any }}
            size="lg"
          />
        </div>
      </Section>

      {/* Funnel chart */}
      <Section title={funnelTitle} subtitle={funnelSubtitle}>
        <Card padding="p-5">
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={funnelSteps}
                layout="vertical"
                margin={CHART_MARGIN_HORIZONTAL}
              >
                <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" {...CHART_AXIS} />
                <YAxis dataKey="stage" type="category" {...CHART_AXIS} fontSize={12} width={130} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar {...BAR_HORIZONTAL_DEFAULTS} dataKey="value">
                  {funnelSteps.map((s, i) => {
                    const hit   = s.goal === 0 || s.value >= s.goal;
                    const close = s.goal > 0 && s.value >= s.goal * 0.9;
                    const color = hit ? "hsl(var(--status-green))" : close ? "hsl(var(--status-yellow))" : "hsl(var(--primary))";
                    return <Cell key={i} fill={color} />;
                  })}
                  <LabelList dataKey="value" position="right" fill="hsl(var(--foreground))" fontSize={12} fontWeight={600} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
            {funnelSteps.map((s) => (
              <div key={s.stage}>
                <div className="text-muted-foreground">{s.stage}</div>
                <div className="font-semibold num">
                  {s.value}
                  {s.goal > 0 && <span className="text-muted-foreground font-normal"> / {s.goal}</span>}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </Section>

      {/* Lead Managers */}
      <Section title={repSectionTitle}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {leadManagerNames.map((name) => {
            const lm = leadManagers[name];

            // Use repValueForPeriod — falls back to latestMonth for day/week naturally
            const netLeads   = repValueForPeriod(lm.net_leads   as Record<string,number>, effectivePeriod, MONTHS);
            const apptsSet   = repValueForPeriod(lm.appts_set   as Record<string,number>, effectivePeriod, MONTHS);
            const contracted = repValueForPeriod(lm.contracted  as Record<string,number>, effectivePeriod, MONTHS);
            const ratio      = ratioForPeriod(lm.ratio      as Record<string,number|null>, effectivePeriod, MONTHS);
            const conversion = ratioForPeriod(lm.conversion as Record<string,number|null>, effectivePeriod, MONTHS);

            // Day period: show daily calls/appts from dailySales arrays
            const displayNetLeads = effectivePeriod === "day"
              ? (name === "brandon"
                  ? (dailySales.brandon.calls[dailySales.brandon.calls.length - 1] ?? 0)
                  : (dailySales.jeff_h.calls[dailySales.jeff_h.calls.length - 1]   ?? 0))
              : (netLeads > 0 ? netLeads : lm.net_leads[latestMonth] ?? 0);

            const displayApptsSet = effectivePeriod === "day"
              ? (name === "brandon"
                  ? (dailySales.brandon.appts[dailySales.brandon.appts.length - 1] ?? 0)
                  : (dailySales.jeff_h.appts[dailySales.jeff_h.appts.length - 1]   ?? 0))
              : (apptsSet > 0 ? apptsSet : lm.appts_set[latestMonth] ?? 0);

            const displayContracted = contracted > 0 ? contracted : lm.contracted[latestMonth] ?? 0;

            const perRepNetLeadsGoal = Math.round(salesMonthly.goals.net_leads / Math.max(leadManagerNames.length, 1));
            const perRepApptsGoal = Math.round(salesMonthly.goals.appts_set / Math.max(leadManagerNames.length, 1));
            const netLeadsSub = effectivePeriod === "day"
              ? "Daily calls"
              : `${prevMonth}: ${lm.net_leads[prevMonth] ?? "—"} · Goal ${perRepNetLeadsGoal}`;
            const apptsSetSub = effectivePeriod === "day"
              ? "Daily appts"
              : `${prevMonth}: ${lm.appts_set[prevMonth] ?? "—"} · Target ${perRepApptsGoal}`;

            // RISE weekly metrics for this LM
            const riseKey = Object.keys(riseQ2LM).find(k => k.toLowerCase().startsWith(name.toLowerCase().split(" ")[0]));
            const rise = riseKey ? riseQ2LM[riseKey] : null;

            return (
              <Card key={name} padding="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Lead Manager</div>
                    <h3 className="text-lg font-semibold tracking-tight mt-0.5 capitalize">{name}</h3>
                    <div className="text-[12px] text-muted-foreground mt-1">
                      Net leads · appt conversion · {repSubLabel}
                    </div>
                  </div>
                  {displayApptsSet > 0 || displayNetLeads > 0 ? (
                    <StoplightBadge status={statusFromTarget(displayApptsSet, salesMonthly.goals.appts_set / Math.max(leadManagerNames.length, 1))} />
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">No Data</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Net Leads</div>
                    <div className="scorecard text-2xl mt-1 tabular">{displayNetLeads}</div>
                    <div className="text-[11px] text-muted-foreground num mt-1">{netLeadsSub}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Appts Set</div>
                    <div className="scorecard text-2xl mt-1 tabular">{displayApptsSet}</div>
                    <div className="text-[11px] text-muted-foreground num mt-1">{apptsSetSub}</div>
                  </div>
                </div>
                <div className="space-y-2">
                  <StatRow
                    label="Contracted"
                    value={displayContracted}
                    sub={`${repSubLabel} contracted`}
                  />
                  <StatRow
                    label="Net → Appt Ratio"
                    value={ratio != null ? fmtPct(ratio, 0) : "—"}
                    sub={`Conversion: ${conversion != null ? fmtPct(conversion, 0) : "—"}`}
                    status={statusFromTarget(ratio, 0.5)}
                  />
                </div>
                {/* RISE Weekly Metrics */}
                {rise && (rise.talk_time_hrs.actual > 0 || rise.touch_points_new.actual > 0) && (
                  <div className="mt-4 pt-3 border-t border-border/50">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2">RISE Weekly</div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      <div>
                        <div className="text-muted-foreground">Talk Time</div>
                        <div className="font-semibold num">
                          {rise.talk_time_hrs.actual}h
                          <span className="text-muted-foreground font-normal"> / {rise.talk_time_hrs.target}h</span>
                        </div>
                        <ProgressBar value={rise.talk_time_hrs.actual} max={rise.talk_time_hrs.target || 10} status={statusFromTarget(rise.talk_time_hrs.actual, rise.talk_time_hrs.target)} />
                      </div>
                      <div>
                        <div className="text-muted-foreground">New Leads TP</div>
                        <div className="font-semibold num">
                          {rise.touch_points_new.actual}
                          <span className="text-muted-foreground font-normal"> / {rise.touch_points_new.target}</span>
                        </div>
                        <ProgressBar value={rise.touch_points_new.actual} max={rise.touch_points_new.target || 200} status={statusFromTarget(rise.touch_points_new.actual, rise.touch_points_new.target)} />
                      </div>
                      <div>
                        <div className="text-muted-foreground">Follow-up TP</div>
                        <div className="font-semibold num">
                          {rise.touch_points_followup.actual}
                          <span className="text-muted-foreground font-normal"> / {rise.touch_points_followup.target}</span>
                        </div>
                        <ProgressBar value={rise.touch_points_followup.actual} max={rise.touch_points_followup.target || 50} status={statusFromTarget(rise.touch_points_followup.actual, rise.touch_points_followup.target)} />
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>

        {/* AQ Agents */}
        {aqAgentNames.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            {aqAgentNames.map((name) => {
              const agent = aqAgents[name];

              const apptsExec = repValueForPeriod(agent.appts_executed    as Record<string,number>, effectivePeriod, MONTHS);
              const contracts = repValueForPeriod(agent.contracts         as Record<string,number>, effectivePeriod, MONTHS);
              const dropped   = repValueForPeriod(agent.dropped_contracts as Record<string,number>, effectivePeriod, MONTHS);
              const conversion = ratioForPeriod(agent.conversion as Record<string,number|null>, effectivePeriod, MONTHS);

              const displayApptsExec = apptsExec > 0 ? apptsExec : agent.appts_executed[latestMonth] ?? 0;
              const displayContracts = contracts > 0 ? contracts : agent.contracts[latestMonth] ?? 0;
              const displayDropped   = dropped;

              // RISE weekly metrics for this AQ
              const riseKey = Object.keys(riseQ2AQ).find(k => k.toLowerCase().startsWith(name.toLowerCase().split(" ")[0].replace("_", "")));
              const rise = riseKey ? riseQ2AQ[riseKey] : null;

              return (
                <Card key={name} padding="p-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">AQ Agent</div>
                      <h3 className="text-lg font-semibold tracking-tight mt-0.5 capitalize">{name.replace("_", " ")}</h3>
                      <div className="text-[12px] text-muted-foreground mt-1">
                        Appt-holder · contract output · {repSubLabel}
                      </div>
                    </div>
                    {displayContracts > 0 || displayApptsExec > 0 ? (
                      <StoplightBadge status={statusFromTarget(displayContracts, salesMonthly.goals.contracts / Math.max(aqAgentNames.length, 1))} />
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide bg-muted text-muted-foreground">No Data</span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Appts Executed</div>
                      <div className="scorecard text-2xl mt-1 tabular">{displayApptsExec}</div>
                      <div className="text-[11px] text-muted-foreground num mt-1">
                        {prevMonth}: {agent.appts_executed[prevMonth] ?? "—"} · Goal {Math.round(salesMonthly.goals.appts_executed / Math.max(aqAgentNames.length, 1))}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">Contracts</div>
                      <div className="scorecard text-2xl mt-1 tabular">{displayContracts}</div>
                      <div className="text-[11px] text-muted-foreground num mt-1">
                        {prevMonth}: {agent.contracts[prevMonth] ?? "—"} · Target {salesMonthly.goals.contracts}
                      </div>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <StatRow
                      label="Appt → Contract"
                      value={conversion != null ? fmtPct(conversion, 0) : "—"}
                      sub={`Target ${fmtPct(salesMonthly.goals.appt_to_contract, 0)}`}
                      status={statusFromTarget(conversion, salesMonthly.goals.appt_to_contract)}
                    />
                    <StatRow
                      label="Dropped Contracts"
                      value={displayDropped}
                      sub={`Target ≤ ${salesMonthly.goals.dropped_contracts}`}
                      status={statusFromTarget(displayDropped, salesMonthly.goals.dropped_contracts, false)}
                    />
                  </div>
                  {/* RISE Weekly Metrics */}
                  {rise && (rise.offers_made.actual > 0 || rise.touch_points.actual > 0 || rise.appts_executed.actual > 0) && (
                    <div className="mt-4 pt-3 border-t border-border/50">
                      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-medium mb-2">RISE Weekly</div>
                      <div className="grid grid-cols-3 gap-2 text-[12px]">
                        <div>
                          <div className="text-muted-foreground">Offers Made</div>
                          <div className="font-semibold num">
                            {rise.offers_made.actual}
                            <span className="text-muted-foreground font-normal"> / {rise.offers_made.target}</span>
                          </div>
                          <ProgressBar value={rise.offers_made.actual} max={rise.offers_made.target || 6} status={statusFromTarget(rise.offers_made.actual, rise.offers_made.target)} />
                        </div>
                        <div>
                          <div className="text-muted-foreground">Touch Points</div>
                          <div className="font-semibold num">
                            {rise.touch_points.actual}
                            <span className="text-muted-foreground font-normal"> / {rise.touch_points.target}</span>
                          </div>
                          <ProgressBar value={rise.touch_points.actual} max={rise.touch_points.target || 70} status={statusFromTarget(rise.touch_points.actual, rise.touch_points.target)} />
                        </div>
                        <div>
                          <div className="text-muted-foreground">Videos</div>
                          <div className="font-semibold num">
                            {rise.content_video.actual}
                            <span className="text-muted-foreground font-normal"> / {rise.content_video.target}</span>
                          </div>
                          <ProgressBar value={rise.content_video.actual} max={rise.content_video.target || 1} status={statusFromTarget(rise.content_video.actual, rise.content_video.target)} />
                        </div>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <div className="grid grid-cols-12 gap-3">
        {/* Goals chart */}
        <Card className="col-span-12 lg:col-span-7" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{goalsChartLabel}</div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">{goalsChartSub}</div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={goalsChartData} margin={{ ...CHART_MARGIN, bottom: 8 }}>
                <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="metric" {...CHART_AXIS} angle={-12} dy={8} height={50} />
                <YAxis {...CHART_AXIS} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend {...CHART_LEGEND} />
                <Bar {...BAR_DEFAULTS} dataKey="Goal"   fill="hsl(var(--muted) / 0.7)" barSize={22} />
                <Bar {...BAR_DEFAULTS} dataKey="Actual" fill="hsl(var(--primary))" barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Conversion rates */}
        <Card className="col-span-12 lg:col-span-5" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Conversion Rates</div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">{conversionTitle}</div>
          </div>
          <div className="space-y-4">
            {conversionMonths.map((m) => {
              const ntg = salesMonthly.net_to_gross[m]     as number | null;
              const nta = salesMonthly.net_to_appt[m]      as number | null;
              const atc = salesMonthly.appt_to_contract[m] as number | null;
              return (
                <div key={m} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-[13px] font-semibold">{m}</div>
                    <div className="text-[11px] text-muted-foreground num">
                      Net/Gross {fmtPct(ntg, 0)} · Net/Appt {fmtPct(nta, 0)} · Appt/Contract {fmtPct(atc, 0)}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <ProgressBar value={ntg} max={1} status={statusFromTarget(ntg, 0.5)} />
                    <ProgressBar value={nta} max={1} status={statusFromTarget(nta, 0.65)} />
                    <ProgressBar value={atc} max={1} status={statusFromTarget(atc, salesMonthly.goals.appt_to_contract)} />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
