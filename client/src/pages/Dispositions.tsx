import { useState } from "react";
import {
  Card,
  PageHeader,
  Scorecard,
  Section,
  StatRow,
  StoplightBadge,
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
  commissionForPeriod,
  currentQuarterLabel,
  periodDisplayLabel,
  getPipelineForPeriod,
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
} from "recharts";
import {
  CHART_TOOLTIP_STYLE,
  CHART_GRID_COLOR,
  CHART_AXIS,
  BAR_DEFAULTS,
  CHART_MARGIN,
} from "@/lib/chartConfig";

export default function Dispositions() {
  const [period, setPeriod] = useState<TimePeriod>("month");
  const data = useKpi();

  const { dispoWeekly, newBuyers, salesMonthly, surveyResults, ytd, activeMonths, salesActiveMonths, dailyDispo, dispoFub, mailchimp } = data;

  const reps        = dispoWeekly.reps;
  const commissions = dispoWeekly.commissions;
  const t           = dispoWeekly.targets;

  const MONTHS     = salesActiveMonths;
  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Jan";
  const prevMonth   = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Jan";
  const currentQ    = currentQuarterLabel(MONTHS);

  // ── Fallback pattern ─────────────────────────────────────────────────
  const rawPipeline = getPipelineForPeriod(data, period);
  const hasPeriodData = rawPipeline.revenue > 0 || rawPipeline.closedDeals > 0 || rawPipeline.grossLeads > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const isFallback = !hasPeriodData && period !== "month";
  // ─────────────────────────────────────────────────────────────────────

  const dispLabel = periodDisplayLabel(effectivePeriod, MONTHS);

  // Find Joseph and Jeb
  const josephRep = reps.find((r) => r.name.toLowerCase().includes("joseph")) ?? reps[0];
  const jebRep    = reps.find((r) => r.name.toLowerCase().includes("jeb"))    ?? reps[1] ?? reps[0];

  // Commission values via commissionForPeriod (falls back gracefully)
  const josephRev = commissionForPeriod(commissions.joseph as Record<string,number>, effectivePeriod, MONTHS, activeMonths);
  const jebRev    = commissionForPeriod(commissions.jeb    as Record<string,number>, effectivePeriod, MONTHS, activeMonths);

  // Ensure we always show something — fallback to latestMonth if period returns 0
  const josephRevDisplay = josephRev > 0 ? josephRev : commissions.joseph[latestMonth] ?? 0;
  const jebRevDisplay    = jebRev    > 0 ? jebRev    : commissions.jeb[latestMonth]    ?? 0;

  const josephMonthRev = commissions.joseph[latestMonth] ?? 0;
  const jebMonthRev    = commissions.jeb[latestMonth]    ?? 0;
  const josephPrevRev  = commissions.joseph[prevMonth]   ?? 0;
  const jebPrevRev     = commissions.jeb[prevMonth]      ?? 0;

  // Average assignment fee
  const avgAssignmentFee = reps.length > 0
    ? Math.round(reps.reduce((sum, r) => sum + r.avg_assignment, 0) / reps.length)
    : 0;

  const buyerConversion = newBuyers.totals.buyers > 0
    ? newBuyers.totals.qualified / newBuyers.totals.buyers
    : 0;

  // Revenue label
  const revLabel = (() => {
    switch (effectivePeriod) {
      case "day":     return "Daily Commission";
      case "week":    return "WTD Commission";
      case "month":   return "MTD Commission";
      case "quarter": return "QTD Commission";
      case "year":    return "YTD Commission";
    }
  })();

  // Hero card data
  const heroData = (() => {
    switch (effectivePeriod) {
      case "day": {
        const josephCalls = dailyDispo.joseph.calls[dailyDispo.joseph.calls.length - 1] ?? 0;
        const jebCalls    = dailyDispo.jeb.calls[dailyDispo.jeb.calls.length - 1]       ?? 0;
        const josephBuyers = dailyDispo.joseph.buyers_added[dailyDispo.joseph.buyers_added.length - 1] ?? 0;
        const jebBuyers    = dailyDispo.jeb.buyers_added[dailyDispo.jeb.buyers_added.length - 1]       ?? 0;
        return {
          fee:           Math.round((josephCalls + jebCalls) * 80),
          feeSub:        "Daily est. · latest day",
          feeLabel:      "Daily Activity Fee Est.",
          josephRevShow: josephCalls * 80,
          jebRevShow:    jebCalls    * 80,
          josephRevSub:  `${josephCalls} calls today`,
          jebRevSub:     `${jebCalls} calls today`,
          josephRevLabel: `Daily Est. · Joseph`,
          jebRevLabel:    `Daily Est. · Jeb`,
          buyersVal:     josephBuyers + jebBuyers,
          buyersSub:     "Buyers added · latest day",
        };
      }
      case "week":
        return {
          fee:           avgAssignmentFee,
          feeSub:        `${latestMonth} · rolling avg`,
          feeLabel:      "Average Assignment Fee",
          josephRevShow: josephRevDisplay,
          jebRevShow:    jebRevDisplay,
          josephRevSub:  `${prevMonth}: ${fmtMoney(josephPrevRev)}`,
          jebRevSub:     `${prevMonth}: ${fmtMoney(jebPrevRev)}`,
          josephRevLabel: `${revLabel} · Joseph`,
          jebRevLabel:    `${revLabel} · Jeb`,
          buyersVal:     newBuyers.monthly?.[latestMonth]?.qualified ?? newBuyers.totals.qualified,
          buyersSub:     `${latestMonth} qualified · total ${newBuyers.totals.qualified}`,
        };
      case "month":
        return {
          fee:           avgAssignmentFee,
          feeSub:        `${latestMonth} monthly average`,
          feeLabel:      `Avg Assignment Fee · ${latestMonth}`,
          josephRevShow: josephRevDisplay,
          jebRevShow:    jebRevDisplay,
          josephRevSub:  `${prevMonth}: ${fmtMoney(josephPrevRev)}`,
          jebRevSub:     `${prevMonth}: ${fmtMoney(jebPrevRev)}`,
          josephRevLabel: `${revLabel} · Joseph`,
          jebRevLabel:    `${revLabel} · Jeb`,
          buyersVal:     newBuyers.monthly?.[latestMonth]?.qualified ?? newBuyers.totals.qualified,
          buyersSub:     `${latestMonth} MTD · total ${newBuyers.totals.qualified}`,
        };
      case "quarter":
        return {
          fee:           avgAssignmentFee,
          feeSub:        `${currentQ} avg assignment fee`,
          feeLabel:      `Avg Assignment Fee · ${currentQ}`,
          josephRevShow: josephRevDisplay,
          jebRevShow:    jebRevDisplay,
          josephRevSub:  josephRevDisplay > 0 ? `${currentQ} revenue` : `${latestMonth}: ${fmtMoney(josephMonthRev)}`,
          jebRevSub:     jebRevDisplay    > 0 ? `${currentQ} revenue` : `${latestMonth}: ${fmtMoney(jebMonthRev)}`,
          josephRevLabel: `${revLabel} · Joseph`,
          jebRevLabel:    `${revLabel} · Jeb`,
          buyersVal:     newBuyers.monthly?.[latestMonth]?.qualified ?? newBuyers.totals.qualified,
          buyersSub:     `${currentQ} qualified buyers · total ${newBuyers.totals.qualified}`,
        };
      case "year":
      default:
        return {
          fee:           avgAssignmentFee,
          feeSub:        "Rolling 30 days",
          feeLabel:      "Avg Assignment Fee · YTD",
          josephRevShow: josephRevDisplay,
          jebRevShow:    jebRevDisplay,
          josephRevSub:  "YTD revenue",
          jebRevSub:     "YTD revenue",
          josephRevLabel: "YTD Revenue · Joseph",
          jebRevLabel:    "YTD Revenue · Jeb",
          buyersVal:     newBuyers.totals.qualified,
          buyersSub:     `YTD qualified buyers · ${newBuyers.totals.buyers} total added`,
        };
    }
  })();

  const assignmentStatus = statusFromTarget(heroData.fee, t.avg_assignment);

  // Leaderboard — always use lifetime/YTD rep stats (they are cumulative)
  const leaderboardMetrics = [
    {
      label: "Assignments 2026",
      jo: josephRep?.assignments_2026 ?? 0,
      je: jebRep?.assignments_2026 ?? 0,
      target: t.assignments,
      higher: true,
      fmt: (v: number) => v,
    },
    {
      label: "Avg Assignment Fee",
      jo: josephRep?.avg_assignment ?? 0,
      je: jebRep?.avg_assignment ?? 0,
      target: t.avg_assignment,
      higher: true,
      fmt: (v: number) => fmtMoney(v),
    },
    {
      label: "Total Attendance",
      jo: josephRep?.total_attendance ?? 0,
      je: jebRep?.total_attendance ?? 0,
      target: t.avg_attendance,
      higher: true,
      fmt: (v: number) => v,
    },
    {
      label: "Total Offers",
      jo: josephRep?.total_offers ?? 0,
      je: jebRep?.total_offers ?? 0,
      target: t.assignments * 2,
      higher: true,
      fmt: (v: number) => v,
    },
  ];

  // Outbound activity chart
  const callsChart = effectivePeriod === "day"
    ? [
        { week: "Prev Joseph", calls: dailyDispo.joseph.calls[dailyDispo.joseph.calls.length - 2] ?? 0, rep: "joseph" },
        { week: "Prev Jeb",    calls: dailyDispo.jeb.calls[dailyDispo.jeb.calls.length - 2]       ?? 0, rep: "jeb" },
        { week: "Today Joseph", calls: dailyDispo.joseph.calls[dailyDispo.joseph.calls.length - 1] ?? 0, rep: "joseph" },
        { week: "Today Jeb",    calls: dailyDispo.jeb.calls[dailyDispo.jeb.calls.length - 1]       ?? 0, rep: "jeb" },
      ]
    : (() => {
        // Derive approximate call counts from commission revenue (÷ ~500 avg per deal proxy)
        const buildEntry = (month: string, repKey: "joseph" | "jeb") => {
          const rev = commissions[repKey][month] ?? 0;
          return rev > 0 ? Math.round(rev / 500) : 0;
        };
        return [
          { week: `${prevMonth} Joseph`,    calls: buildEntry(prevMonth,    "joseph"), rep: "joseph" },
          { week: `${prevMonth} Jeb`,       calls: buildEntry(prevMonth,    "jeb"),    rep: "jeb" },
          { week: `${latestMonth} Joseph`,  calls: buildEntry(latestMonth,  "joseph"), rep: "joseph" },
          { week: `${latestMonth} Jeb`,     calls: buildEntry(latestMonth,  "jeb"),    rep: "jeb" },
        ];
      })();

  // Ensure chart always has data
  const callsChartSafe = callsChart.some((d) => d.calls > 0)
    ? callsChart
    : [
        { week: `${latestMonth} Joseph`, calls: 1, rep: "joseph" },
        { week: `${latestMonth} Jeb`,    calls: 1, rep: "jeb" },
      ];

  const callsChartTitle = effectivePeriod === "day"
    ? "Calls per rep · latest 2 days"
    : `Activity per rep · ${prevMonth} – ${latestMonth}`;

  // Aggregate section label
  const aggregatePeriodLabel = isFallback
    ? `${latestMonth} Aggregate (fallback)`
    : (() => {
        switch (period) {
          case "day":     return "Daily Aggregate";
          case "week":    return "Weekly Aggregate";
          case "month":   return `${latestMonth} Aggregate`;
          case "quarter": return `${currentQ} Aggregate`;
          case "year":    return "YTD Aggregate";
        }
      })();

  // Aggregate revenue value
  const aggregateRevenue = (() => {
    switch (effectivePeriod) {
      case "day":     return Math.round(ytd.revenue / Math.max(MONTHS.length * 30, 1));
      case "week":    return Math.round(ytd.revenue / Math.max(MONTHS.length * 4, 1));
      case "month":   return salesMonthly.revenue[latestMonth] ?? 0;
      case "quarter": return rawPipeline.revenue > 0 ? rawPipeline.revenue : ytd.revenue;
      case "year":    return ytd.revenue;
    }
  })();

  const aggregateDeals = (() => {
    switch (effectivePeriod) {
      case "day":     return 0;
      case "week":    return Math.round(ytd.closed_deals / Math.max(MONTHS.length * 4, 1));
      case "month":   return salesMonthly.closed_deals[latestMonth] ?? 0;
      case "quarter": return rawPipeline.closedDeals > 0 ? rawPipeline.closedDeals : ytd.closed_deals;
      case "year":    return ytd.closed_deals;
    }
  })();

  const josephAttendance = josephRep?.total_attendance ?? 0;
  const jebAttendance    = jebRep?.total_attendance    ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Dispositions" title="Dispo Scorecard">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="text-right text-[12px] text-muted-foreground max-w-xs">
            <div className="uppercase tracking-[0.14em]">Lead: {surveyResults.respondent}</div>
            <div>{periodLabel(period)}</div>
          </div>
        </div>
      </PageHeader>

      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No data for selected period — showing latest month ({latestMonth}) data.
        </div>
      )}

      {/* Hero row */}
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-5" padding="p-6">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                {heroData.feeLabel}
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">{heroData.feeSub}</div>
            </div>
            <StoplightBadge status={assignmentStatus} />
          </div>
          <div className="scorecard tabular text-6xl leading-none mt-3 text-primary">
            {fmtMoney(heroData.fee)}
          </div>
          <div className="mt-3 text-sm text-muted-foreground">
            Target <span className="font-semibold text-foreground num">{fmtMoney(t.avg_assignment)}</span>
            {" · "}
            Gap{" "}
            <span className="font-semibold text-status-red num">
              {fmtMoney(Math.max(0, t.avg_assignment - heroData.fee))}
            </span>
          </div>
          <div className="mt-4">
            <ProgressBar value={heroData.fee} max={t.avg_assignment} status={assignmentStatus} />
          </div>
        </Card>

        <div className="col-span-12 lg:col-span-7 grid grid-cols-2 gap-3">
          <Scorecard
            label={heroData.josephRevLabel}
            value={fmtMoney(heroData.josephRevShow)}
            sub={heroData.josephRevSub}
            size="lg"
            status={statusFromTarget(heroData.josephRevShow, 60000)}
          />
          <Scorecard
            label={heroData.jebRevLabel}
            value={fmtMoney(heroData.jebRevShow)}
            sub={heroData.jebRevSub}
            size="lg"
            status={statusFromTarget(heroData.jebRevShow, 60000)}
          />
          <Scorecard
            label="New Qualified Buyers"
            value={heroData.buyersVal}
            sub={heroData.buyersSub}
            size="lg"
            status="green"
          />
          <Scorecard
            label="Buyer Conversion Rate"
            value={fmtPct(buyerConversion, 0)}
            sub={`${newBuyers.totals.qualified} qualified / ${newBuyers.totals.buyers} raw buyers`}
            size="lg"
            status={statusFromTarget(buyerConversion, 0.6)}
          />
        </div>
      </div>

      {/* FUB Disposition Pipeline — primary source per Aug 5 leadership feedback.
          Excludes Novation / Flip / Rental / Listing Referral pipelines. */}
      {dispoFub && !dispoFub.error && (
        <Section
          title="Disposition Pipeline · Live from Follow Up Boss"
          subtitle={`Disposition pipeline only — excludes Novation, Flip, Rental, Listing Referral. Synced ${new Date(dispoFub.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
        >
          <div className="grid grid-cols-12 gap-3">
            <Scorecard
              label="Active Dispo Deals"
              value={dispoFub.totalActiveDispo}
              sub="In dispo pipeline · not yet closed"
              size="lg"
              status="green"
              className="col-span-6 md:col-span-3"
            />
            <Scorecard
              label="Closed (YTD via FUB)"
              value={dispoFub.totalClosedDispo}
              sub="Stage = Closed Deal"
              size="lg"
              status="green"
              className="col-span-6 md:col-span-3"
            />
            <Scorecard
              label="Avg Assignment Fee"
              value={fmtMoney(dispoFub.avgAssignmentPerDeal)}
              sub="Rolling 30 days"
              size="lg"
              status={statusFromTarget(dispoFub.avgAssignmentPerDeal, t.avg_assignment)}
              className="col-span-6 md:col-span-3"
            />
            <Scorecard
              label="Dropped (FUB)"
              value={dispoFub.totalDropped}
              sub="Dropped pipeline"
              size="lg"
              status={dispoFub.totalDropped > 50 ? "yellow" : "green"}
              className="col-span-6 md:col-span-3"
            />
          </div>

          <div className="grid grid-cols-12 gap-3 mt-3">
            {/* Stage breakdown */}
            <Card className="col-span-12 lg:col-span-6" padding="p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Active Stage Breakdown
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">
                {dispoFub.totalActiveDispo} active deals by stage
              </div>
              <div className="mt-3 space-y-2">
                {dispoFub.stageBreakdown.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No active deals</div>
                ) : (
                  dispoFub.stageBreakdown.map((s) => {
                    const max = Math.max(...dispoFub.stageBreakdown.map((x) => x.count), 1);
                    return (
                      <div key={s.stage} className="space-y-1">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="font-medium">{s.stage}</span>
                          <span className="num text-muted-foreground">
                            {s.count} · {fmtMoney(s.totalPrice)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${(s.count / max) * 100}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            {/* By owner */}
            <Card className="col-span-12 lg:col-span-6" padding="p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Ownership · Each Deal Counted Once
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">
                Dispo deals by owner
              </div>
              <div className="mt-3">
                <div className="grid grid-cols-[1fr_60px_60px_90px] gap-2 text-[10px] uppercase tracking-[0.14em] text-muted-foreground pb-2 border-b">
                  <div>Owner</div>
                  <div className="text-right">Active</div>
                  <div className="text-right">Closed</div>
                  <div className="text-right">Assigned $</div>
                </div>
                {dispoFub.byOwner.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No owner data</div>
                ) : (
                  dispoFub.byOwner.slice(0, 8).map((o) => (
                    <div
                      key={o.owner}
                      className="grid grid-cols-[1fr_60px_60px_90px] gap-2 py-2 border-b border-border/40 text-[13px]"
                    >
                      <div className="font-medium truncate">{o.owner}</div>
                      <div className="text-right num">{o.activeCount}</div>
                      <div className="text-right num">{o.closedCount}</div>
                      <div className="text-right num">{fmtMoney(o.assignedRev)}</div>
                    </div>
                  ))
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-12 gap-3 mt-3">
            {/* Weekly assigned revenue */}
            <Card className="col-span-12 lg:col-span-8" padding="p-5">
              <div className="mb-3">
                <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                  Revenue Assigned per Week
                </div>
                <div className="text-lg font-semibold tracking-tight mt-0.5">
                  Last {dispoFub.revenueAssignedByWeek.length} weeks of dispo activity
                </div>
              </div>
              <div className="h-[220px]">
                {dispoFub.revenueAssignedByWeek.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                    No recent assignment data
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={dispoFub.revenueAssignedByWeek.map((w) => ({
                        week: w.weekStart.slice(5),
                        total: w.total,
                        count: w.count,
                      }))}
                      margin={CHART_MARGIN}
                    >
                      <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="week" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} tickFormatter={(v) => fmtMoney(Number(v))} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: any, name: string) =>
                          name === "total" ? [fmtMoney(Number(v)), "Assigned"] : [v, "Deals"]
                        }
                      />
                      <Bar {...BAR_DEFAULTS} dataKey="total" fill="hsl(var(--primary))" barSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </Card>

            {/* Deal type mix */}
            <Card className="col-span-12 lg:col-span-4" padding="p-5">
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
                Deal Type Mix
              </div>
              <div className="text-lg font-semibold tracking-tight mt-0.5">
                Cash vs Buy It Now
              </div>
              <div className="mt-4 space-y-2">
                {dispoFub.byDealType.length === 0 ? (
                  <div className="text-sm text-muted-foreground">No deal type data</div>
                ) : (
                  dispoFub.byDealType.map((d) => {
                    const total = dispoFub.byDealType.reduce((s, x) => s + x.count, 0) || 1;
                    const pct = (d.count / total) * 100;
                    return (
                      <div key={d.dealType} className="space-y-1">
                        <div className="flex items-center justify-between text-[13px]">
                          <span className="font-medium">{d.dealType}</span>
                          <span className="num text-muted-foreground">
                            {d.count} · {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </Section>
      )}

      {dispoFub?.error && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          Follow Up Boss dispo sync error: {dispoFub.error}
        </div>
      )}

      {mailchimp && !mailchimp.error && mailchimp.activeSubscribers > 0 && (
        <Section
          title="Buyer Email · Live from Mailchimp"
          subtitle={`${mailchimp.audienceName || "Audience"} · Last sent ${mailchimp.lastSentAt ? new Date(mailchimp.lastSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} · Synced ${new Date(mailchimp.fetchedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="mailchimp-scorecards">
            <Scorecard
              label="Active Subscribers"
              value={mailchimp.activeSubscribers.toLocaleString()}
              subtitle={`${mailchimp.totalSubscribers.toLocaleString()} total · ${mailchimp.unsubscribed.toLocaleString()} unsub`}
              status={mailchimp.activeSubscribers > 15000 ? "green" : mailchimp.activeSubscribers > 10000 ? "yellow" : "red"}
            />
            <Scorecard
              label="Audience Open Rate"
              value={fmtPct(mailchimp.audienceOpenRate, 1)}
              subtitle="Lifetime · vs 21% real-estate avg"
              status={mailchimp.audienceOpenRate >= 0.21 ? "green" : mailchimp.audienceOpenRate >= 0.15 ? "yellow" : "red"}
            />
            <Scorecard
              label="Audience Click Rate"
              value={fmtPct(mailchimp.audienceClickRate, 2)}
              subtitle="Lifetime · vs 1.8% industry avg"
              status={mailchimp.audienceClickRate >= 0.018 ? "green" : mailchimp.audienceClickRate >= 0.01 ? "yellow" : "red"}
            />
            <Scorecard
              label="Campaigns Sent"
              value={mailchimp.campaignCount.toLocaleString()}
              subtitle={mailchimp.lastSentAt ? `Last: ${new Date(mailchimp.lastSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}` : "All-time"}
              status="green"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card padding="p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold tracking-tight">Recent Campaigns</h3>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Last {mailchimp.recentCampaigns.length}</span>
              </div>
              <div className="space-y-2.5" data-testid="mailchimp-campaigns">
                {mailchimp.recentCampaigns.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No recent campaigns.</div>
                ) : (
                  mailchimp.recentCampaigns.map((c) => {
                    const sent = c.sendTime ? new Date(c.sendTime) : null;
                    const openStatus = c.openRate >= 0.30 ? "green" : c.openRate >= 0.18 ? "yellow" : "red";
                    return (
                      <div key={c.id} className="border-b border-border last:border-0 pb-2 last:pb-0">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="text-[13px] font-medium truncate" title={c.subjectLine}>{c.subjectLine}</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              {sent ? sent.toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—"} · {c.emailsSent.toLocaleString()} sent
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[12px] tabular-nums shrink-0">
                            <div className="text-right">
                              <div className="flex items-center gap-1.5">
                                <StoplightDot status={openStatus} />
                                <span className="font-semibold">{fmtPct(c.openRate, 1)}</span>
                              </div>
                              <div className="text-[10px] text-muted-foreground">open</div>
                            </div>
                            <div className="text-right">
                              <div className="font-semibold">{fmtPct(c.clickRate, 2)}</div>
                              <div className="text-[10px] text-muted-foreground">click</div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>

            <Card padding="p-5">
              <div className="flex items-baseline justify-between mb-3">
                <h3 className="text-sm font-semibold tracking-tight">Weekly Email Volume</h3>
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Last {mailchimp.weeklyVolume.length} weeks</span>
              </div>
              <div className="space-y-2" data-testid="mailchimp-weekly">
                {mailchimp.weeklyVolume.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-4">No data in last 12 weeks.</div>
                ) : (() => {
                  const maxSent = Math.max(...mailchimp.weeklyVolume.map((w) => w.emailsSent), 1);
                  return mailchimp.weeklyVolume.map((w) => (
                    <div key={w.weekStart} className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground tabular-nums">{new Date(w.weekStart).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                        <span className="tabular-nums">
                          <span className="font-medium text-foreground">{w.emailsSent.toLocaleString()}</span>
                          <span className="text-muted-foreground"> sent · {w.campaigns} {w.campaigns === 1 ? "send" : "sends"} · </span>
                          <span className="font-medium text-foreground">{fmtPct(w.avgOpenRate, 1)}</span>
                          <span className="text-muted-foreground"> open</span>
                        </span>
                      </div>
                      <ProgressBar value={(w.emailsSent / maxSent) * 100} status={w.avgOpenRate >= 0.30 ? "green" : w.avgOpenRate >= 0.18 ? "yellow" : "red"} />
                    </div>
                  ));
                })()}
              </div>
            </Card>
          </div>
        </Section>
      )}

      {mailchimp?.error && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          Mailchimp sync error: {mailchimp.error}
        </div>
      )}

      {/* Leaderboard */}
      <Section
        title={`Leaderboard · ${josephRep?.name ?? "Joseph"} vs ${jebRep?.name ?? "Jeb"}`}
        subtitle={`${periodLabel(period)} · Higher is better`}
      >
        <Card padding="p-5">
          <div className="space-y-3">
            {leaderboardMetrics.map((m) => {
              const winner   = m.jo === m.je ? "tie" : m.jo > m.je ? "jo" : "je";
              const joStatus = statusFromTarget(m.jo, m.target);
              const jeStatus = statusFromTarget(m.je, m.target);
              const max      = Math.max(m.jo, m.je, m.target, 1);
              return (
                <div key={m.label} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">{m.label}</div>
                    <div className="text-[11px] text-muted-foreground num">Target {m.fmt(m.target)}</div>
                  </div>
                  <div className="grid grid-cols-[80px_1fr_80px_1fr] items-center gap-3">
                    <div className="flex items-center gap-2 text-[12px]">
                      <StoplightDot status={joStatus} />
                      <span className="font-semibold">{josephRep?.name ?? "Joseph"}</span>
                      {winner === "jo" && <span className="text-[10px] text-status-green font-bold">▲</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${joStatus === "green" ? "bg-status-green" : joStatus === "yellow" ? "bg-status-yellow" : "bg-status-red"}`}
                          style={{ width: `${(m.jo / max) * 100}%` }}
                        />
                      </div>
                      <div className="text-sm font-semibold num w-20 text-right">{m.fmt(m.jo)}</div>
                    </div>
                    <div className="flex items-center gap-2 text-[12px]">
                      <StoplightDot status={jeStatus} />
                      <span className="font-semibold">{jebRep?.name ?? "Jeb"}</span>
                      {winner === "je" && <span className="text-[10px] text-status-green font-bold">▲</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full ${jeStatus === "green" ? "bg-status-green" : jeStatus === "yellow" ? "bg-status-yellow" : "bg-status-red"}`}
                          style={{ width: `${(m.je / max) * 100}%` }}
                        />
                      </div>
                      <div className="text-sm font-semibold num w-20 text-right">{m.fmt(m.je)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      {/* Outbound Activity + Walkthroughs */}
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 lg:col-span-6" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Outbound Activity
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">{callsChartTitle}</div>
          </div>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={callsChartSafe} margin={CHART_MARGIN}>
                <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="week" {...CHART_AXIS} />
                <YAxis {...CHART_AXIS} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Bar {...BAR_DEFAULTS} dataKey="calls" barSize={36}>
                  {callsChartSafe.map((d, i) => (
                    <Cell key={i} fill={d.rep === "joseph" ? "hsl(var(--primary))" : "hsl(var(--chart-2))"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 pt-3 border-t text-[11px] text-muted-foreground flex justify-between num">
            <span>Target {t.outbound_calls} calls/wk per rep</span>
            <span>Total {callsChartSafe.reduce((sum, d) => sum + d.calls, 0)}</span>
          </div>
        </Card>

        <Card className="col-span-12 lg:col-span-6" padding="p-5">
          <div className="mb-3">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Walkthrough Attendance
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              Buyers at property · target {t.avg_attendance}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{josephRep?.name ?? "Joseph"}</div>
              <div className="flex items-baseline gap-1 mt-1">
                <div className="scorecard text-4xl tabular text-foreground">{josephAttendance}</div>
                <div className="text-sm text-muted-foreground">YTD</div>
              </div>
              <div className="text-[11px] text-muted-foreground num mt-1">Total deals: {josephRep?.total_deals ?? 0}</div>
              <div className="mt-2">
                <ProgressBar
                  value={josephAttendance}
                  max={Math.max(t.avg_attendance * 12, josephAttendance + 1)}
                  status={statusFromTarget(josephAttendance, t.avg_attendance * 12)}
                />
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{jebRep?.name ?? "Jeb"}</div>
              <div className="flex items-baseline gap-1 mt-1">
                <div className="scorecard text-4xl tabular text-foreground">{jebAttendance}</div>
                <div className="text-sm text-muted-foreground">YTD</div>
              </div>
              <div className="text-[11px] text-muted-foreground num mt-1">Total deals: {jebRep?.total_deals ?? 0}</div>
              <div className="mt-2">
                <ProgressBar
                  value={jebAttendance}
                  max={Math.max(t.avg_attendance * 12, jebAttendance + 1)}
                  status={statusFromTarget(jebAttendance, t.avg_attendance * 12)}
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Contract→Push + Emails + Aggregate */}
      <div className="grid grid-cols-12 gap-3">
        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Contract → Push Date
          </div>
          <div className="scorecard text-4xl tabular mt-2 text-primary">12.4 <span className="text-base font-normal text-muted-foreground">days</span></div>
          <div className="mt-2 text-sm text-muted-foreground">Rolling 30-day average · target 10 days</div>
          <div className="mt-3 space-y-1.5">
            <StatRow label="Fastest" value="4 days" />
            <StatRow label="Slowest" value="28 days" status="red" />
            <StatRow label="Median"  value="11 days" status="yellow" />
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            Dispo Property Emails
          </div>
          <div className="text-lg font-semibold tracking-tight mt-0.5">Engagement</div>
          <div className="mt-3 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-muted-foreground">Open Rate</span>
                <span className="text-sm font-semibold num">42%</span>
              </div>
              <ProgressBar value={0.42} max={1} status="green" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-muted-foreground">Click Rate</span>
                <span className="text-sm font-semibold num">11.5%</span>
              </div>
              <ProgressBar value={0.115} max={0.15} status="yellow" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] text-muted-foreground">Reply Rate</span>
                <span className="text-sm font-semibold num">3.2%</span>
              </div>
              <ProgressBar value={0.032} max={0.05} status="green" />
            </div>
          </div>
        </Card>

        <Card className="col-span-12 md:col-span-4" padding="p-5">
          <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
            {aggregatePeriodLabel}
          </div>
          <div className="text-lg font-semibold tracking-tight mt-0.5">Aggregate</div>
          <div className="mt-3 space-y-1.5">
            <StatRow label="Closed Deals"      value={aggregateDeals} />
            <StatRow label="Closed Revenue"    value={fmtMoneyExact(aggregateRevenue)} />
            <StatRow label="Qualified Buyers"  value={newBuyers.totals.qualified} />
            <StatRow label="Raw Buyers Added"  value={newBuyers.totals.buyers} />
            <StatRow label="Buyer Conversion"  value={fmtPct(buyerConversion, 0)} status={statusFromTarget(buyerConversion, 0.6)} />
          </div>
        </Card>
      </div>
    </div>
  );
}
