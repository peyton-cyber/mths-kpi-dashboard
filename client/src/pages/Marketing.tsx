import { useState } from "react";
import {
  Card,
  PageHeader,
  Section,
  StatRow,
  StoplightDot,
  ProgressBar,
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
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
  Cell,
} from "recharts";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_COLOR,
  CHART_AXIS,
  CHART_LEGEND,
  LINE_DEFAULTS,
  BAR_DEFAULTS,
  BAR_HORIZONTAL_DEFAULTS,
  CHART_MARGIN,
  CHART_MARGIN_HORIZONTAL,
  moneyTickFormatter,
} from "@/lib/chartConfig";

export default function Marketing() {
  const [period, setPeriod] = useState<TimePeriod>("year");
  const kpiData = useKpi();

  const {
    marketingChannels, marketingTotals, newBuyers, revenueFunnel,
    salesMonthly, quarterly, ytd, activeMonths, salesActiveMonths,
  } = kpiData;

  const MONTHS      = salesActiveMonths;
  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Jan";
  const prevMonth   = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Jan";
  const currentQ    = currentQuarterLabel(MONTHS);

  // ── Fallback pattern ─────────────────────────────────────────────────
  const rawPipeline   = getPipelineForPeriod(kpiData, period);
  const hasPeriodData = rawPipeline.marketingSpend > 0 || rawPipeline.revenue > 0 || rawPipeline.grossLeads > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const pipe          = hasPeriodData ? rawPipeline : getPipelineForPeriod(kpiData, "month");
  const isFallback    = !hasPeriodData && period !== "month";
  // ─────────────────────────────────────────────────────────────────────

  const dispLabel = periodDisplayLabel(effectivePeriod, MONTHS);

  // Header KPIs — all use effectivePipeline
  // For YTD view, align with channel-attributed totals to avoid mismatch with Channel Scorecard total
  const periodSpend   = effectivePeriod === "year" ? marketingTotals.spend : pipe.marketingSpend;
  const periodRevenue = effectivePeriod === "year" ? marketingTotals.revenue : pipe.revenue;
  const periodContracts = Math.max(pipe.contracts, 1);
  const periodCostPerDeal = periodSpend > 0 && periodContracts > 0
    ? Math.round(periodSpend / periodContracts)
    : marketingTotals.cost_per_deal;

  const headerLabel = isFallback
    ? `${latestMonth} (no ${period} data)`
    : (() => {
        switch (period) {
          case "day":     return `Daily est. · ${latestMonth}`;
          case "week":    return `Weekly · ${latestMonth} avg`;
          case "month":   return `${latestMonth}`;
          case "quarter": return `${currentQ}`;
          case "year":    return `Jan–${latestMonth}`;
        }
      })();

  // Blended ROAS for the period
  const periodROAS = periodSpend > 0 && periodRevenue > 0
    ? (periodRevenue / periodSpend).toFixed(2)
    : marketingTotals.roas.toFixed(2);

  // Spend vs Revenue chart data
  const monthlyTrend = MONTHS.map((m) => ({
    month: m,
    Spend:   salesMonthly.marketing_spend[m] ?? 0,
    Revenue: salesMonthly.revenue[m] ?? 0,
  }));

  const weeklyTrend = MONTHS.slice(-2).flatMap((m, i) => [
    { period: `${m} W1`, Spend: Math.round((salesMonthly.marketing_spend[m] ?? 0) / 4), Revenue: Math.round((salesMonthly.revenue[m] ?? 0) / 4) },
    { period: `${m} W2`, Spend: Math.round((salesMonthly.marketing_spend[m] ?? 0) / 4), Revenue: Math.round((salesMonthly.revenue[m] ?? 0) / 4 * (i === 0 ? 1.05 : 0.9)) },
  ]);

  const quarterlyTrend = (["Q1","Q2","Q3","Q4"] as const)
    .map((q) => ({ period: q, Spend: quarterly[q].marketing_spend, Revenue: quarterly[q].revenue }))
    .filter((q) => q.Spend > 0 || q.Revenue > 0);

  const spendRevenueData = (() => {
    const d = (() => {
      switch (effectivePeriod) {
        case "day":
          return [{
            period: latestMonth,
            Spend:   Math.round((salesMonthly.marketing_spend[latestMonth] ?? 0) / 30),
            Revenue: Math.round((salesMonthly.revenue[latestMonth] ?? 0) / 30),
          }];
        case "week":
          return weeklyTrend.length > 0 ? weeklyTrend : [{ period: latestMonth, Spend: pipe.marketingSpend, Revenue: pipe.revenue }];
        case "month":
          return monthlyTrend.length > 0 ? monthlyTrend : [{ month: latestMonth, Spend: pipe.marketingSpend, Revenue: pipe.revenue }];
        case "quarter":
          return quarterlyTrend.length > 0
            ? quarterlyTrend
            : [{ period: currentQ, Spend: pipe.marketingSpend, Revenue: pipe.revenue }];
        case "year":
          return monthlyTrend.length > 0 ? monthlyTrend : [{ period: "YTD", Spend: ytd.marketing_spend, Revenue: ytd.revenue }];
      }
    })();
    // Never empty — fallback to monthly
    return d.length > 0 ? d : monthlyTrend.length > 0 ? monthlyTrend : [{ month: latestMonth, Spend: pipe.marketingSpend, Revenue: pipe.revenue }];
  })();

  const chartXKey = effectivePeriod === "month" || effectivePeriod === "year" ? "month" : "period";

  const chartTitle = isFallback
    ? `Monthly Spend vs Revenue (no ${period} data)`
    : {
        day:     "Daily Spend vs Revenue (Est.)",
        week:    "Weekly Spend vs Revenue",
        month:   "Monthly Spend vs Revenue",
        quarter: `${currentQ} Spend vs Revenue`,
        year:    "YTD Spend vs Revenue · by month",
      }[effectivePeriod];

  // Channel table note for day/week
  const channelTableNote = (period === "day" || period === "week")
    ? "Channel data is monthly — showing YTD totals. Daily/weekly channel breakdown unavailable."
    : null;

  const bestROAS = [...marketingChannels]
    .filter((c) => c.roas != null)
    .sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))[0];

  // New buyers subtitle
  const newBuyersSubtitle = (() => {
    if ((effectivePeriod === "month" || effectivePeriod === "quarter") && newBuyers.monthly?.[latestMonth]) {
      const md = newBuyers.monthly[latestMonth];
      return `${latestMonth}: ${md.buyers} buyers · ${md.qualified} qualified`;
    }
    return `${newBuyers.totals.buyers} buyers · ${newBuyers.totals.qualified} qualified`;
  })();

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Marketing" title="Channel Performance">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="text-right text-[12px] text-muted-foreground">
            <div className="uppercase tracking-[0.14em]">Blended ROAS</div>
            <div className="font-semibold text-foreground text-xl num">{periodROAS}x</div>
          </div>
        </div>
      </PageHeader>

      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No marketing data for selected period — showing latest month ({latestMonth}) data.
        </div>
      )}

      {/* Header KPIs — all period-responsive via effectivePipeline */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Total Spend</div>
          <div className="scorecard tabular text-4xl mt-2">{fmtMoney(periodSpend)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">{headerLabel}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Total Revenue</div>
          <div className="scorecard tabular text-4xl mt-2 text-primary">{fmtMoney(periodRevenue)}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Attributed · {headerLabel}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Cost / Deal</div>
          <div className="scorecard tabular text-4xl mt-2">
            {pipe.contracts > 0 ? fmtMoney(periodCostPerDeal) : fmtMoneyExact(marketingTotals.cost_per_deal)}
          </div>
          <div className="mt-1 text-[12px] text-muted-foreground">
            {pipe.contracts > 0 ? `${pipe.contracts} deals · ${headerLabel}` : `${marketingTotals.deals} deals closed`}
          </div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">Blended Conversion</div>
          <div className="scorecard tabular text-4xl mt-2">{fmtPct(
            (marketingTotals.conversion && marketingTotals.conversion > 0)
              ? marketingTotals.conversion
              : (marketingTotals.net_leads > 0 ? marketingTotals.deals / marketingTotals.net_leads : 0),
            1
          )}</div>
          <div className="mt-1 text-[12px] text-muted-foreground">Net lead → deal · YTD</div>
        </Card>
      </div>

      {/* Channel scorecard table — always YTD aggregate */}
      <Section
        title="Channel Scorecard"
        subtitle={channelTableNote ?? (bestROAS ? `Winner: ${bestROAS.name} — ${bestROAS.roas?.toFixed(2)}x ROAS` : "YTD channel performance")}
      >
        {channelTableNote && (
          <div className="mb-3 px-1 text-[12px] text-muted-foreground italic">{channelTableNote}</div>
        )}
        <Card padding="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground border-b" style={{ borderColor: "hsl(var(--card-border))" }}>
                  <th className="text-left font-medium py-3 px-5">Channel</th>
                  <th className="text-right font-medium py-3 px-4">Spend</th>
                  <th className="text-right font-medium py-3 px-4">Gross Leads</th>
                  <th className="text-right font-medium py-3 px-4">Net Leads</th>
                  <th className="text-right font-medium py-3 px-4">Deals</th>
                  <th className="text-right font-medium py-3 px-4">Conv.</th>
                  <th className="text-right font-medium py-3 px-4">Cost/Deal</th>
                  <th className="text-right font-medium py-3 px-4">Revenue</th>
                  <th className="text-right font-medium py-3 px-5">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {marketingChannels.map((c) => {
                  const isWinner   = bestROAS && c.name === bestROAS.name;
                  const roasStatus =
                    c.roas == null   ? undefined :
                    c.roas >= 10     ? "green" :
                    c.roas >= 4      ? "yellow" : "red";
                  return (
                    <tr
                      key={c.name}
                      className="border-b last:border-b-0 hover:bg-muted/40 transition-colors"
                      style={{ borderColor: "hsl(var(--card-border))" }}
                    >
                      <td className="py-3.5 px-5">
                        <div className="flex items-center gap-2">
                          {isWinner && <span className="inline-block h-1.5 w-1.5 rounded-full bg-status-yellow" />}
                          <span className={isWinner ? "font-semibold" : ""}>{c.name}</span>
                          {isWinner && <span className="text-[10px] font-bold status-yellow-bg px-1.5 py-0.5 rounded">TOP</span>}
                        </div>
                      </td>
                      <td className="text-right num py-3.5 px-4">{fmtMoneyExact(c.spend)}</td>
                      <td className="text-right num py-3.5 px-4">{c.gross_leads}</td>
                      <td className="text-right num py-3.5 px-4">{c.net_leads}</td>
                      <td className="text-right num py-3.5 px-4 font-semibold">{c.deals}</td>
                      <td className="text-right num py-3.5 px-4">{fmtPct(c.conversion, 1)}</td>
                      <td className="text-right num py-3.5 px-4">{c.cost_per_deal ? fmtMoneyExact(c.cost_per_deal) : "—"}</td>
                      <td className="text-right num py-3.5 px-4">{fmtMoneyExact(c.revenue)}</td>
                      <td className="text-right num py-3.5 px-5">
                        {c.roas == null ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            {roasStatus && <StoplightDot status={roasStatus} />}
                            <span className={`font-semibold ${c.roas >= 10 ? "text-status-green" : ""}`}>
                              {c.roas.toFixed(2)}x
                            </span>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                <tr className="border-t font-semibold bg-muted/30" style={{ borderColor: "hsl(var(--card-border))" }}>
                  <td className="py-3.5 px-5">Total</td>
                  <td className="text-right num py-3.5 px-4">{fmtMoneyExact(marketingTotals.spend)}</td>
                  <td className="text-right num py-3.5 px-4">{marketingTotals.gross_leads}</td>
                  <td className="text-right num py-3.5 px-4">{marketingTotals.net_leads}</td>
                  <td className="text-right num py-3.5 px-4">{marketingTotals.deals}</td>
                  <td className="text-right num py-3.5 px-4">{fmtPct(marketingTotals.conversion, 1)}</td>
                  <td className="text-right num py-3.5 px-4">{fmtMoneyExact(marketingTotals.cost_per_deal)}</td>
                  <td className="text-right num py-3.5 px-4">{fmtMoneyExact(marketingTotals.revenue)}</td>
                  <td className="text-right num py-3.5 px-5 text-primary">{marketingTotals.roas.toFixed(2)}x</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </Section>

      {/* Spend vs Revenue chart + ROAS ranking */}
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-7" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">{chartTitle}</div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">Marketing investment vs. return</div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={spendRevenueData} margin={CHART_MARGIN}>
                <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey={chartXKey} {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} tickFormatter={moneyTickFormatter} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => fmtMoneyExact(v)} />
                <Legend {...CHART_LEGEND} />
                <Bar {...BAR_DEFAULTS} dataKey="Spend" fill="hsl(var(--muted-foreground) / 0.7)" barSize={32} />
                <Line type="monotone" dataKey="Revenue" stroke="hsl(var(--primary))" {...LINE_DEFAULTS} dot={{ ...LINE_DEFAULTS.dot, fill: "hsl(var(--primary))", stroke: "hsl(var(--primary))" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* ROAS ranking */}
        <Card className="col-span-12 lg:col-span-5" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">ROAS Ranking</div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">Return on ad spend · by channel</div>
          </div>
          <div className="h-[240px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[...marketingChannels].filter((c) => c.roas != null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0))}
                layout="vertical"
                margin={CHART_MARGIN_HORIZONTAL}
              >
                <CartesianGrid stroke={CHART_GRID_COLOR} horizontal={false} strokeDasharray="3 3" />
                <XAxis type="number" {...CHART_AXIS} />
                <YAxis dataKey="name" type="category" {...CHART_AXIS} fontSize={12} width={90} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: number) => `${v.toFixed(2)}x`} />
                <Bar {...BAR_HORIZONTAL_DEFAULTS} dataKey="roas">
                  {[...marketingChannels].filter((c) => c.roas != null).sort((a, b) => (b.roas ?? 0) - (a.roas ?? 0)).map((c, i) => (
                    <Cell
                      key={i}
                      fill={
                        (c.roas ?? 0) >= 10 ? "hsl(var(--status-green))" :
                        (c.roas ?? 0) >= 4  ? "hsl(var(--primary))"      :
                                              "hsl(var(--status-red))"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* New buyer acquisition + Revenue Funnel */}
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-6" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              New Buyer Acquisition
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">{newBuyersSubtitle}</div>
          </div>
          <div className="space-y-3">
            {newBuyers.sources.map((s) => {
              const ratio = s.buyers ? s.qualified / s.buyers : 0;
              return (
                <div key={s.name}>
                  <div className="flex items-center justify-between mb-1.5 text-[13px]">
                    <span className="font-semibold">{s.name}</span>
                    <span className="text-muted-foreground num">
                      {s.qualified} <span className="text-xs">qualified</span>
                      {" / "}
                      <span className="font-semibold text-foreground">{s.buyers}</span>{" "}
                      <span className="text-xs">raw ({fmtPct(ratio, 0)})</span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
                    <div
                      className="h-full bg-primary"
                      style={{ width: `${newBuyers.totals.qualified > 0 ? (s.qualified / newBuyers.totals.qualified) * 100 : 0}%` }}
                    />
                    <div
                      className="h-full bg-muted-foreground/30"
                      style={{ width: `${newBuyers.totals.qualified > 0 ? ((s.buyers - s.qualified) / newBuyers.totals.qualified) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-4 border-t">
            <StatRow label="Mevlo dominance" value={`${fmtPct(189 / 225, 0)} of all buyers`} />
          </div>
        </Card>

        {/* Revenue Optimization Funnel — always target/planning data */}
        <Card className="col-span-12 lg:col-span-6" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Revenue Optimization Funnel
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Path to ${(revenueFunnel.annual_profit_goal / 1_000_000).toFixed(1)}M
            </div>
          </div>
          <div className="space-y-3">
            {[
              { label: "Annual profit goal",        value: fmtMoney(revenueFunnel.annual_profit_goal),  accent: true },
              { label: "Monthly profit goal",       value: fmtMoney(revenueFunnel.monthly_profit_goal) },
              { label: "Weekly profit goal",        value: fmtMoney(revenueFunnel.weekly_profit_goal) },
              { label: "Avg profit per deal",       value: fmtMoney(revenueFunnel.profit_per_deal) },
              { label: "Deals needed · annual",     value: `${revenueFunnel.deals_required_annual}` },
              { label: "Deals needed · monthly",    value: `${revenueFunnel.deals_required_monthly}` },
              { label: "Fallout rate",              value: fmtPct(revenueFunnel.fallout_rate, 0) },
              { label: "Appt → contract",           value: fmtPct(revenueFunnel.appt_to_contract, 0) },
              { label: "Appt set → held",           value: fmtPct(revenueFunnel.appt_set_to_held, 0) },
              { label: "Lead → appt",               value: fmtPct(revenueFunnel.lead_to_appt, 0) },
              { label: "Gross → net",               value: fmtPct(revenueFunnel.gross_to_net, 0) },
              { label: "Gross leads needed / month", value: `${revenueFunnel.gross_leads_monthly}`, accent: true },
            ].map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between py-1.5 border-b last:border-b-0 text-sm"
                style={{ borderColor: "hsl(var(--card-border))" }}
              >
                <span className="text-muted-foreground">{row.label}</span>
                <span className={`num font-semibold ${row.accent ? "text-primary" : "text-foreground"}`}>
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Weekly Marketing Funnel — sourced from Weekly 2026 Marketing tab */}
      <WeeklyMarketingFunnel kpiData={kpiData} />
    </div>
  );
}

function WeeklyMarketingFunnel({ kpiData }: { kpiData: ReturnType<typeof useKpi> }) {
  const wm = kpiData?.weeklyMarketing;
  if (!wm || (wm.records?.length ?? 0) === 0) return null;

  const t = wm.totals;
  const topSources = wm.bySource.slice(0, 6);
  const weekTrend = wm.byWeek.slice(-12).map((w) => ({
    label: `${w.month.slice(0, 3)} ${w.week}`,
    gross: w.grossLead,
    net: w.netLead,
    netPct: Math.round(w.netToGrossPct),
  }));
  // Disqualification breakdown across all sources
  const dqAll = wm.bySource.reduce(
    (a, s) => ({
      activeListing: a.activeListing + s.activeListing,
      noCompsOrFit: a.noCompsOrFit + s.noCompsOrFit,
      outOfBuyBox: a.outOfBuyBox + s.outOfBuyBox,
      noReply: a.noReply + s.noReply,
    }),
    { activeListing: 0, noCompsOrFit: 0, outOfBuyBox: 0, noReply: 0 }
  );
  const dqRows = [
    { label: "Active Listing", v: dqAll.activeListing },
    { label: "No Comps / Fit", v: dqAll.noCompsOrFit },
    { label: "Out of Buy Box", v: dqAll.outOfBuyBox },
    { label: "No Reply", v: dqAll.noReply },
  ];
  const dqTotal = dqRows.reduce((s, r) => s + r.v, 0);

  return (
    <Section
      title="Weekly Marketing Funnel"
      subtitle={`Live · ${t.weeksCovered} weeks · ${t.sourcesCovered} sources · ${t.grossLead.toLocaleString()} gross / ${t.netLead.toLocaleString()} net (${fmtPct(t.netToGrossPct / 100, 0)})`}
    >
      {/* Headline scorecards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Gross Leads</div>
          <div className="num text-2xl font-semibold">{t.grossLead.toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Net Leads</div>
          <div className="num text-2xl font-semibold">{t.netLead.toLocaleString()}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Net : Gross</div>
          <div className="num text-2xl font-semibold">{fmtPct(t.netToGrossPct / 100, 0)}</div>
        </Card>
        <Card>
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-1">Weeks Tracked</div>
          <div className="num text-2xl font-semibold">{t.weeksCovered}</div>
        </Card>
      </div>

      {/* Two-column: weekly trend + source breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <div className="text-sm font-semibold mb-2">Last 12 Weeks · Gross vs Net Leads</div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <ComposedChart data={weekTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="gross" name="Gross" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
                <Bar dataKey="net" name="Net" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="netPct" name="Net %" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="text-sm font-semibold mb-2">Why Leads Die · YTD</div>
          <div className="space-y-2">
            {dqRows.map((r) => {
              const pct = dqTotal > 0 ? (r.v / dqTotal) * 100 : 0;
              return (
                <div key={r.label}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="num font-semibold">{r.v.toLocaleString()} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span></span>
                  </div>
                  <ProgressBar value={pct} max={100} />
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Source quality table */}
      <Card padding="p-0" className="mt-4">
        <div className="px-5 pt-4 pb-2 text-sm font-semibold">Source Quality · YTD</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground border-b" style={{ borderColor: "hsl(var(--card-border))" }}>
                <th className="text-left font-medium py-3 px-5">Source</th>
                <th className="text-right font-medium py-3 px-4">Gross</th>
                <th className="text-right font-medium py-3 px-4">Net</th>
                <th className="text-right font-medium py-3 px-4">Net %</th>
                <th className="text-right font-medium py-3 px-4 hidden sm:table-cell">Active Listing</th>
                <th className="text-right font-medium py-3 px-4 hidden sm:table-cell">No Comps/Fit</th>
                <th className="text-right font-medium py-3 px-4 hidden md:table-cell">Out of Box</th>
                <th className="text-right font-medium py-3 px-4 hidden md:table-cell">No Reply</th>
              </tr>
            </thead>
            <tbody>
              {topSources.map((s) => (
                <tr key={s.source} className="border-b last:border-b-0 hover:bg-muted/20" style={{ borderColor: "hsl(var(--card-border))" }}>
                  <td className="py-2.5 px-5 font-medium">{s.source}</td>
                  <td className="text-right num py-2.5 px-4">{s.grossLead.toLocaleString()}</td>
                  <td className="text-right num py-2.5 px-4">{s.netLead.toLocaleString()}</td>
                  <td className="text-right num py-2.5 px-4 font-semibold">{fmtPct(s.netToGrossPct / 100, 0)}</td>
                  <td className="text-right num py-2.5 px-4 text-muted-foreground hidden sm:table-cell">{s.activeListing.toLocaleString()}</td>
                  <td className="text-right num py-2.5 px-4 text-muted-foreground hidden sm:table-cell">{s.noCompsOrFit.toLocaleString()}</td>
                  <td className="text-right num py-2.5 px-4 text-muted-foreground hidden md:table-cell">{s.outOfBuyBox.toLocaleString()}</td>
                  <td className="text-right num py-2.5 px-4 text-muted-foreground hidden md:table-cell">{s.noReply.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Section>
  );
}
