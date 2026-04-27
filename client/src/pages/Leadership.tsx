import { useState } from "react";
import {
  Card,
  PageHeader,
  Scorecard,
  Section,
  StoplightDot,
  ProgressBar,
} from "@/components/dash";
import { TimePeriodFilter, type TimePeriod } from "@/components/TimePeriodFilter";
import { useKpi } from "@/components/KpiDataProvider";
import {
  fmtPct,
  statusFromTarget,
  fmtMoney,
  periodLabel,
} from "@/lib/useKpiData";
import { Heart } from "lucide-react";
import {
  getPipelineForPeriod,
  currentQuarterLabel,
  periodDisplayLabel,
} from "@/lib/periodHelpers";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
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
  CHART_MARGIN,
} from "@/lib/chartConfig";

const rateKeys = ["Jeff D", "Kalyn", "Jordan", "Trey", "Maggie", "average"] as const;
const rateColors: Record<(typeof rateKeys)[number], string> = {
  "Jeff D":  "hsl(var(--chart-1))",
  Kalyn:     "hsl(var(--chart-2))",
  Jordan:    "hsl(var(--chart-3))",
  Trey:      "hsl(var(--chart-4))",
  Maggie:    "hsl(var(--chart-5))",
  average:   "hsl(var(--foreground))",
};

export default function Leadership() {
  const [period, setPeriod] = useState<TimePeriod>("year");
  const kpiData = useKpi();

  const { company, hr, rateMeeting, revenueFunnel, ytd, salesActiveMonths } = kpiData;

  const MONTHS      = salesActiveMonths;
  const latestMonth = MONTHS.length > 0 ? MONTHS[MONTHS.length - 1] : "Apr";
  const prevMonth   = MONTHS.length > 1 ? MONTHS[MONTHS.length - 2] : MONTHS[0] ?? "Mar";
  const currentQ    = currentQuarterLabel(MONTHS);

  // ── Fallback pattern ─────────────────────────────────────────────────
  // Purpose tracker uses ytd.closed_deals — always has data.
  // HR metrics use month keys — always fallback to latestMonth.
  // Rate Meeting chart always shows all 14 weeks regardless.
  // We still compute effective period for purpose/HR labels.
  const rawPipeline   = getPipelineForPeriod(kpiData, period);
  const hasPeriodData = rawPipeline.closedDeals > 0 || rawPipeline.revenue > 0 || rawPipeline.contracts > 0;
  const effectivePeriod: TimePeriod = hasPeriodData ? period : "month";
  const isFallback    = !hasPeriodData && period !== "month";
  // ─────────────────────────────────────────────────────────────────────

  const dispLabel = periodDisplayLabel(effectivePeriod, MONTHS);

  // Rate Meeting chart — always all 14 weeks (historical, period-agnostic)
  const rateData = Array.from({ length: 14 }, (_, i) => {
    const week = i + 1;
    const entry: Record<string, number | string | null> = { week: `W${week}` };
    rateKeys.forEach((k) => {
      entry[k] = rateMeeting[k]?.[i] ?? null;
    });
    return entry;
  });

  const m = hr.maggie;
  const livesImpacted = Math.round(ytd.closed_deals * 3);
  const livesStatus   = statusFromTarget(livesImpacted, company.purpose_target, true, 0.3);

  // HR section — always use latestMonth / prevMonth (monthly resolution)
  // For year period, average across months where possible
  const hrCurrent = latestMonth;
  const hrPrev    = prevMonth;

  const hrSectionTitle = isFallback
    ? `HR · People Operations · ${latestMonth} (no ${period} data)`
    : `HR · People Operations · ${periodLabel(period)}`;

  // Purpose tracker — period-appropriate lives estimate
  const purposeData = (() => {
    // Always has data since based on ytd.closed_deals
    switch (effectivePeriod) {
      case "day":
        return {
          lives: Math.max(Math.round(ytd.closed_deals * 3 / Math.max(MONTHS.length * 30, 1)), 1),
          label: `Daily est. · ${latestMonth}`,
          sub:   "Based on YTD run rate",
        };
      case "week":
        return {
          lives: Math.max(Math.round(ytd.closed_deals * 3 / Math.max(MONTHS.length * 4, 1)), 1),
          label: `Weekly est. · ${latestMonth}`,
          sub:   "Based on monthly run rate ÷ 4",
        };
      case "month":
        return {
          lives: Math.max(Math.round((ytd.closed_deals / Math.max(MONTHS.length, 1)) * 3), 1),
          label: `Monthly avg · ${latestMonth}`,
          sub:   "Avg monthly lives impacted",
        };
      case "quarter": {
        const qDeals = rawPipeline.closedDeals > 0
          ? rawPipeline.closedDeals
          : Math.round(ytd.closed_deals / Math.max(Math.ceil(MONTHS.length / 3), 1));
        return {
          lives: Math.max(qDeals * 3, 1),
          label: `${currentQ} · lives impacted`,
          sub:   `${qDeals} closed deals × ~3 lives`,
        };
      }
      case "year":
      default:
        return {
          lives: Math.max(livesImpacted, 1),
          label: "Year to Date · 2026",
          sub:   `${ytd.closed_deals} closed deals × ~3 lives`,
        };
    }
  })();

  // HR metrics — for year period, show avg of available months where possible
  const trainualHours    = effectivePeriod === "year"
    ? Math.round(Object.entries(m.trainual_hours).filter(([k]) => MONTHS.includes(k)).reduce((s, [,v]) => s + (v as number), 0) / Math.max(MONTHS.length, 1))
    : (m.trainual_hours[hrCurrent] ?? 0);

  const timeToHire = m.time_to_hire[hrCurrent] ?? m.time_to_hire[hrPrev] ?? 0;
  const payrollOntime = m.payroll_ontime[hrCurrent] ?? m.payroll_ontime[hrPrev] ?? 0;
  const policyCompliance = m.policy_compliance[hrCurrent] ?? m.policy_compliance[hrPrev] ?? 0;
  const meetingRating = m.meeting_rating[hrCurrent] ?? m.meeting_rating[hrPrev] ?? 0;

  const hrSubtitle = isFallback
    ? `Maggie — ${latestMonth} scorecard (fallback)`
    : `Maggie — ${latestMonth} scorecard`;

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Leadership · L10" title="Team Health & Purpose">
        <div className="flex items-center gap-4">
          <TimePeriodFilter value={period} onChange={setPeriod} />
          <div className="text-right text-[12px] text-muted-foreground">
            <div className="uppercase tracking-[0.14em]">14-week rolling window</div>
            <div className="font-semibold text-foreground">Rate Meeting Scores</div>
          </div>
        </div>
      </PageHeader>

      {isFallback && (
        <div className="rounded-lg border border-status-yellow/40 bg-status-yellow/5 px-4 py-2.5 text-[13px] text-muted-foreground">
          No pipeline data for selected period — showing latest month ({latestMonth}) context for labels.
        </div>
      )}

      {/* Rate Meeting Chart — always full 14-week history, period-agnostic */}
      <Section
        title="Rate the Meeting"
        subtitle={`Weekly 1–5 scores · leadership team · showing all 14 weeks`}
      >
        <Card padding="p-5">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rateData} margin={CHART_MARGIN}>
                <CartesianGrid stroke={CHART_GRID_COLOR} vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="week" {...CHART_AXIS} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} {...CHART_AXIS} />
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                <Legend {...CHART_LEGEND} />
                <ReferenceLine y={3} stroke="hsl(var(--muted-foreground) / 0.4)" strokeDasharray="4 4" />
                {rateKeys.map((k) =>
                  k === "average" ? (
                    <Line
                      key={k}
                      isAnimationActive={false}
                      type="monotone"
                      dataKey={k}
                      stroke={rateColors[k]}
                      {...LINE_DEFAULTS}
                      dot={{ ...LINE_DEFAULTS.dot, fill: rateColors[k], stroke: rateColors[k] }}
                      connectNulls
                      name="Team Avg"
                    />
                  ) : (
                    <Line
                      key={k}
                      isAnimationActive={false}
                      type="monotone"
                      dataKey={k}
                      stroke={rateColors[k]}
                      strokeWidth={1.5}
                      strokeOpacity={0.7}
                      dot={{ r: 2.5, strokeWidth: 1.5, fill: "hsl(var(--card))", stroke: rateColors[k] }}
                      connectNulls
                    />
                  )
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {/* Per-person averages */}
          <div className="mt-3 pt-3 border-t grid grid-cols-3 md:grid-cols-5 gap-3">
            {(["Jeff D", "Kalyn", "Jordan", "Trey", "Maggie"] as const).map((name) => {
              const values = (rateMeeting[name] ?? []).filter((v) => v != null) as number[];
              const avg    = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              const status = avg >= 2.8 ? "green" : avg >= 2.3 ? "yellow" : "red";
              return (
                <div key={name}>
                  <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                    <StoplightDot status={status} />
                    {name}
                  </div>
                  <div className="scorecard tabular text-2xl mt-1">{avg.toFixed(2)}</div>
                  <div className="text-[11px] text-muted-foreground num">avg · last 14 weeks</div>
                </div>
              );
            })}
          </div>
        </Card>
      </Section>

      {/* Purpose tracker + Revenue Funnel */}
      <div className="grid grid-cols-12 gap-3">
        {/* Hero Purpose Card */}
        <div
          className="col-span-12 lg:col-span-5 rounded-2xl p-6 relative overflow-hidden"
          style={{
            background: "linear-gradient(135deg, hsl(var(--baby-blue-600)), hsl(var(--baby-blue-700)) 50%, hsl(210 55% 22%))",
          }}
        >
          {/* Decorative glow */}
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full opacity-15" style={{ background: "radial-gradient(circle, hsl(var(--baby-blue-300)), transparent 70%)" }} />
          <div className="absolute -bottom-16 -left-8 w-32 h-32 rounded-full opacity-10" style={{ background: "radial-gradient(circle, #fff, transparent 70%)" }} />

          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-1">
              <div className="h-8 w-8 rounded-lg bg-white/15 flex items-center justify-center">
                <Heart className="h-4 w-4 text-white" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-white/60">Company Purpose</div>
                <div className="text-[13px] font-semibold text-white/90">{purposeData.label}</div>
              </div>
            </div>

            <div className="mt-4 flex items-baseline gap-3">
              <span className="text-[42px] font-extrabold tabular-nums leading-none text-white drop-shadow-[0_2px_12px_rgba(255,255,255,0.25)]">
                {purposeData.lives}
              </span>
              <div>
                <div className="text-sm font-semibold text-white/80">of {company.purpose_target}</div>
                <div className="text-[12px] text-white/50">lives impacted</div>
              </div>
            </div>

            {/* Big progress bar */}
            <div className="mt-5 h-2.5 w-full rounded-full bg-white/15 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min((purposeData.lives / Math.max(company.purpose_target, 1)) * 100, 100)}%`,
                  background: "linear-gradient(90deg, hsl(var(--baby-blue-300)), #fff)",
                  boxShadow: "0 0 12px rgba(255,255,255,0.35)",
                }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-white/50 tabular-nums">
                {((purposeData.lives / Math.max(company.purpose_target, 1)) * 100).toFixed(0)}% of annual goal
              </span>
              <span className="text-white/40">{purposeData.sub}</span>
            </div>

            <div className="mt-4 pt-3 border-t border-white/10 text-[13px] text-white/60 leading-relaxed">
              Every deal closed frees a family or homeowner from their burden.
            </div>
          </div>
        </div>

        {/* Revenue Optimization Funnel — always target/planning data */}
        <Card className="col-span-12 lg:col-span-7" padding="p-5">
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-medium">
              Revenue Optimization Funnel
            </div>
            <div className="text-lg font-semibold tracking-tight mt-0.5">
              ${(revenueFunnel.annual_profit_goal / 1_000_000).toFixed(0)}M annual profit · reverse engineered
            </div>
          </div>
          <div className="relative">
            {[
              { label: "Gross Leads / month",    value: revenueFunnel.gross_leads_monthly, width: 100 },
              { label: "Net Leads / month",      value: Math.round(revenueFunnel.gross_leads_monthly * revenueFunnel.gross_to_net), width: 82 },
              { label: "Appts Set / month",      value: Math.round(revenueFunnel.gross_leads_monthly * revenueFunnel.gross_to_net * revenueFunnel.lead_to_appt), width: 64 },
              { label: "Appts Held / month",     value: Math.round(revenueFunnel.gross_leads_monthly * revenueFunnel.gross_to_net * revenueFunnel.lead_to_appt * revenueFunnel.appt_set_to_held), width: 50 },
              { label: "Contracts / mo",         value: revenueFunnel.deals_required_monthly + Math.round(revenueFunnel.deals_required_monthly * revenueFunnel.fallout_rate), width: 34 },
              { label: "Closed Deals / mo",      value: revenueFunnel.deals_required_monthly, width: 26 },
              { label: `Avg Profit ${fmtMoney(revenueFunnel.profit_per_deal)}/deal`, value: null as unknown as number, width: 26, accent: true },
            ].map((s, i) => (
              <div key={i} className="flex items-center gap-4 mb-2.5">
                <div
                  className={`h-11 rounded-md flex items-center justify-between px-4 ${s.accent ? "bg-primary text-primary-foreground" : "bg-accent text-foreground"}`}
                  style={{ width: `${s.width}%` }}
                >
                  <span className="text-[12px] font-medium truncate">{s.label}</span>
                  {s.value != null && (
                    <span className="text-sm font-semibold num ml-3">{s.value}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* HR Metrics — always use latestMonth / prevMonth (monthly resolution) */}
      <Section title={hrSectionTitle} subtitle={hrSubtitle}>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Scorecard
            label="Trainual Hours"
            value={trainualHours}
            sub={`Target ${m.trainual_hours.target} · ${hrPrev}: ${m.trainual_hours[hrPrev] ?? "—"}`}
            status={statusFromTarget(trainualHours, m.trainual_hours.target)}
            size="md"
          />
          <Scorecard
            label="Time to Hire"
            value={`${timeToHire}d`}
            sub={`Target ≤ ${m.time_to_hire.target}d · ${hrPrev}: ${m.time_to_hire[hrPrev] ?? "—"}d`}
            status={statusFromTarget(timeToHire || null, m.time_to_hire.target, false)}
            size="md"
          />
          <Scorecard
            label="Payroll On-Time"
            value={fmtPct((payrollOntime) / 100, 0)}
            sub={`Target ${fmtPct(m.payroll_ontime.target / 100, 0)} · ${hrPrev}: ${fmtPct((m.payroll_ontime[hrPrev] ?? 0) / 100, 0)}`}
            status="green"
            size="md"
          />
          <Scorecard
            label="Policy Compliance"
            value={fmtPct((policyCompliance) / 100, 0)}
            sub={`Target ${fmtPct(m.policy_compliance.target / 100, 0)} · ${hrPrev}: ${fmtPct((m.policy_compliance[hrPrev] ?? 0) / 100, 0)}`}
            status="green"
            size="md"
          />
          <Scorecard
            label="Meeting Rating"
            value={`${meetingRating}/5`}
            sub={`${hrPrev}: ${m.meeting_rating[hrPrev] ?? "—"}/5 · Target ${m.meeting_rating.target}`}
            status={statusFromTarget(meetingRating || null, m.meeting_rating.target)}
            size="md"
          />
        </div>
      </Section>
    </div>
  );
}
