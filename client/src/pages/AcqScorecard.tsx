/**
 * Acquisitions Scorecard — per-agent activity (drive/windshield/talk/touch),
 * appointment funnel (set→attended→offers→contracts), and ROAS by agent.
 *
 * Data source:
 *  - data.acquisitionsActivity: 90-day window per-agent rollup (driveTime,
 *    windshieldTime, talkTime, touchPoints, apptsSet, apptsAttended, offers,
 *    contracts, plus daily targets)
 *  - data.marketingSpendDetail.byAgent: per-agent spend, profit, ROAS
 */
import { Card, PageHeader, Section } from "@/components/dash";
import { useKpi } from "@/components/KpiDataProvider";
import { AlertBanner } from "@/components/AlertBanner";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend,
} from "recharts";
import {
  CHART_TOOLTIP_STYLE, CHART_GRID_COLOR, CHART_AXIS, CHART_LEGEND,
  BAR_DEFAULTS, CHART_MARGIN,
} from "@/lib/chartConfig";
import { fmtMoney } from "@/lib/useKpiData";
import { Link } from "wouter";

function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 100) : 0;
}

function statusColor(actual: number, target: number, lowerIsBetter = false): string {
  if (target === 0) return "hsl(var(--muted-foreground))";
  const ratio = actual / target;
  if (lowerIsBetter) {
    if (ratio <= 0.9) return "hsl(var(--status-green))";
    if (ratio <= 1.1) return "hsl(var(--status-amber))";
    return "hsl(var(--status-red))";
  }
  if (ratio >= 1.0) return "hsl(var(--status-green))";
  if (ratio >= 0.8) return "hsl(var(--status-amber))";
  return "hsl(var(--status-red))";
}

export default function AcqScorecard() {
  const data = useKpi();
  const acq = data.acquisitionsActivity;
  const spendByAgent = data.marketingSpendDetail?.byAgent || [];

  const agents = acq?.agents || [];
  const hasData = agents.length > 0;

  // Merge spend ROAS into agent rows
  const rows = agents.map(a => {
    const spendRow = spendByAgent.find(s => s.name.toLowerCase() === a.agent.toLowerCase());
    return {
      ...a,
      spend: spendRow?.spend ?? 0,
      profit: spendRow?.profit ?? 0,
      roas: spendRow?.roas ?? 0,
      leads: spendRow?.leads ?? 0,
    };
  });

  // Daily averages (vs daily targets)
  const tgtTalk = rows[0]?.target?.talkTime || 120;
  const tgtTouch = rows[0]?.target?.touchPoints || 70;
  const tgtAppts = rows[0]?.target?.apptsSet || 2;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${acq?.windowDays ?? 90}-day window · ${acq?.rowCount ?? 0} activity rows`}
        title="Acquisitions Scorecard"
      />

      <AlertBanner filterPersons={["Korbin", "TJ", "Ryan", "Brandon", "Jeff", "Jonathan"]} />

      {!hasData && (
        <Card padding="p-6">
          <div className="text-sm text-muted-foreground">
            No activity rows yet. Add daily entries to the{" "}
            <a
              className="text-primary underline"
              href="https://docs.google.com/spreadsheets/d/1olzDTnjBqZsBfxuvIIscAathd1d_MccSLZVoILlIP5k/edit"
              target="_blank" rel="noreferrer"
            >Acquisitions Activity sheet</a>{" "}
            and refresh.
          </div>
        </Card>
      )}

      {hasData && (
        <>
          {/* Per-agent table */}
          <Section title="Per-Agent Activity" subtitle="Daily averages vs target">
            <Card padding="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground border-b">
                      <th className="text-left p-3 font-semibold">Agent</th>
                      <th className="text-right p-3 font-semibold">Days</th>
                      <th className="text-right p-3 font-semibold">Talk Time<br/><span className="text-[9px] opacity-60">avg min/day · tgt {tgtTalk}</span></th>
                      <th className="text-right p-3 font-semibold">Touch Points<br/><span className="text-[9px] opacity-60">avg/day · tgt {tgtTouch}</span></th>
                      <th className="text-right p-3 font-semibold">Appts Set<br/><span className="text-[9px] opacity-60">avg/day · tgt {tgtAppts}</span></th>
                      <th className="text-right p-3 font-semibold">Drive<br/><span className="text-[9px] opacity-60">total min</span></th>
                      <th className="text-right p-3 font-semibold">Wndshld<br/><span className="text-[9px] opacity-60">total min</span></th>
                      <th className="text-right p-3 font-semibold">Appts Atd</th>
                      <th className="text-right p-3 font-semibold">Offers</th>
                      <th className="text-right p-3 font-semibold">Contracts</th>
                      <th className="text-right p-3 font-semibold">Spend</th>
                      <th className="text-right p-3 font-semibold">ROAS</th>
                      <th className="text-right p-3 font-semibold">Drill-down</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const tt = r.target?.talkTime ?? tgtTalk;
                      const tp = r.target?.touchPoints ?? tgtTouch;
                      const ta = r.target?.apptsSet ?? tgtAppts;
                      return (
                        <tr key={r.agent} className="border-b last:border-b-0 hover:bg-accent/30">
                          <td className="p-3 font-semibold">{r.agent}</td>
                          <td className="p-3 text-right tabular-nums">{r.days}</td>
                          <td className="p-3 text-right tabular-nums" style={{ color: statusColor(r.avgTalkTime, tt) }}>
                            {r.avgTalkTime}
                          </td>
                          <td className="p-3 text-right tabular-nums" style={{ color: statusColor(r.avgTouchPoints, tp) }}>
                            {r.avgTouchPoints}
                          </td>
                          <td className="p-3 text-right tabular-nums" style={{ color: statusColor(r.avgApptsSet, ta) }}>
                            {r.avgApptsSet}
                          </td>
                          <td className="p-3 text-right tabular-nums opacity-80">{r.driveTime}</td>
                          <td className="p-3 text-right tabular-nums opacity-80">{r.windshieldTime}</td>
                          <td className="p-3 text-right tabular-nums">{r.apptsAttended}</td>
                          <td className="p-3 text-right tabular-nums">{r.offers}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">{r.contracts}</td>
                          <td className="p-3 text-right tabular-nums">{r.spend > 0 ? fmtMoney(r.spend) : "—"}</td>
                          <td className="p-3 text-right tabular-nums font-semibold">
                            {r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—"}
                          </td>
                          <td className="p-3 text-right">
                            <Link
                              href={`/employees/${encodeURIComponent(r.agent.toLowerCase())}`}
                              className="text-[11px] text-primary hover:underline"
                            >
                              Open →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          {/* Funnel chart */}
          <Section title="Per-Agent Activity Funnel" subtitle="Touch points → appts set → attended → offers → contracts (period totals)">
            <Card>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rows} margin={CHART_MARGIN}>
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                    <XAxis dataKey="agent" {...CHART_AXIS} />
                    <YAxis {...CHART_AXIS} />
                    <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                    <Legend {...CHART_LEGEND} />
                    <Bar dataKey="apptsSet" name="Appts Set" fill="hsl(var(--baby-blue-300))" {...BAR_DEFAULTS} />
                    <Bar dataKey="apptsAttended" name="Attended" fill="hsl(var(--baby-blue-500))" {...BAR_DEFAULTS} />
                    <Bar dataKey="offers" name="Offers" fill="hsl(var(--baby-blue-700))" {...BAR_DEFAULTS} />
                    <Bar dataKey="contracts" name="Contracts" fill="hsl(var(--status-green))" {...BAR_DEFAULTS} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </Section>

          {/* ROAS by agent */}
          {rows.some(r => r.spend > 0) && (
            <Section title="Marketing ROAS by Agent" subtitle="Profit per dollar spent (last reported month)">
              <Card>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows.filter(r => r.spend > 0)} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis dataKey="agent" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} />
                      <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(v: any) => `${Number(v).toFixed(2)}x`} />
                      <Bar dataKey="roas" name="ROAS" {...BAR_DEFAULTS}>
                        {rows.filter(r => r.spend > 0).map((r, i) => (
                          <Cell key={i} fill={r.roas >= 3 ? "hsl(var(--status-green))" : r.roas >= 1.5 ? "hsl(var(--status-amber))" : "hsl(var(--status-red))"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
