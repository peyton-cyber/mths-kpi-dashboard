/**
 * Acquisitions Scorecard — horizontal matrix view.
 * Layout: KPIs as rows, agents as columns. Plus Drive Time card (Bouncie mock)
 * and Rev Tracker ROAS section (per-agent gross & marketing source rollup).
 */
import { useState } from "react";
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
import { Car, Gauge, MapPin } from "lucide-react";

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

interface MatrixRow {
  label: string;
  sub?: string;
  values: Record<string, { value: number | string; color?: string; bold?: boolean }>;
  format?: (v: number) => string;
}

export default function AcqScorecard() {
  const data = useKpi();
  const acq = data.acquisitionsActivity;
  const spendByAgent = data.marketingSpendDetail?.byAgent || [];

  const agents = acq?.agents || [];
  const hasData = agents.length > 0;

  // Agent focus toggle: "all" or specific agent name. Filters the funnel/charts.
  const [focusAgent, setFocusAgent] = useState<string>("all");

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

  const tgtTalk = rows[0]?.target?.talkTime || 120;
  const tgtTouch = rows[0]?.target?.touchPoints || 70;
  const tgtAppts = rows[0]?.target?.apptsSet || 2;

  // Build matrix: KPI rows × agent columns
  const agentNames = rows.map(r => r.agent);

  const buildMatrix = (): MatrixRow[] => {
    const make = (
      label: string,
      sub: string | undefined,
      pick: (r: typeof rows[number]) => { value: number | string; color?: string; bold?: boolean }
    ): MatrixRow => ({
      label,
      sub,
      values: Object.fromEntries(rows.map(r => [r.agent, pick(r)])),
    });

    return [
      make("Talk Time", `avg min/day · target ${tgtTalk}`, r => {
        const tt = r.target?.talkTime ?? tgtTalk;
        return { value: r.avgTalkTime, color: statusColor(r.avgTalkTime, tt) };
      }),
      make("Touch Points", `avg/day · target ${tgtTouch}`, r => {
        const tp = r.target?.touchPoints ?? tgtTouch;
        return { value: r.avgTouchPoints, color: statusColor(r.avgTouchPoints, tp) };
      }),
      make("Appts Set", `avg/day · target ${tgtAppts}`, r => {
        const ta = r.target?.apptsSet ?? tgtAppts;
        return { value: r.avgApptsSet, color: statusColor(r.avgApptsSet, ta) };
      }),
      make("Days Active", "in window", r => ({ value: r.days })),
      make("Drive Time", "total min", r => ({ value: r.driveTime })),
      make("Windshield", "total min", r => ({ value: r.windshieldTime })),
      make("Appts Attended", undefined, r => ({ value: r.apptsAttended })),
      make("Offers Made", undefined, r => ({ value: r.offers })),
      make("Contracts", undefined, r => ({ value: r.contracts, bold: true })),
      make("Marketing Spend", undefined, r => ({ value: r.spend > 0 ? fmtMoney(r.spend) : "—" })),
      make("ROAS", "profit per $", r => ({
        value: r.roas > 0 ? `${r.roas.toFixed(2)}x` : "—",
        color: r.roas >= 3 ? "hsl(var(--status-green))" : r.roas >= 1.5 ? "hsl(var(--status-amber))" : r.roas > 0 ? "hsl(var(--status-red))" : undefined,
        bold: true,
      })),
    ];
  };

  const matrix = hasData ? buildMatrix() : [];

  // Bouncie drive time
  const bouncie = data.bouncieDriveTime;
  const bouncieRows = bouncie ? Object.entries(bouncie.byAgent).map(([name, b]) => ({
    name, ...b,
  })).sort((a, b) => b.totalMinutes - a.totalMinutes) : [];

  // Rev Tracker ROAS
  const revRoas = data.revTrackerRoas;
  const marketingSourceData = revRoas
    ? Object.entries(revRoas.marketingSourceRollup)
        .map(([name, v]) => ({ name, gross: v.gross, deals: v.dealCount }))
        .sort((a, b) => b.gross - a.gross)
        .slice(0, 8)
    : [];
  const perAgentGross = revRoas
    ? Object.entries(revRoas.perAgentGross)
        .map(([name, monthly]) => {
          const total = Object.values(monthly).reduce((a, b) => a + b, 0);
          const dealCount = Object.values(revRoas.perAgentDealCount[name] || {}).reduce((a, b) => a + b, 0);
          return { name, total, dealCount };
        })
        .filter(r => r.total > 0)
        .sort((a, b) => b.total - a.total)
    : [];

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
          {/* MATRIX: KPIs as rows, agents as columns */}
          <Section title="Per-Agent Scorecard" subtitle="KPIs (rows) × Agents (columns)">
            <Card padding="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead className="bg-muted/40">
                    <tr className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground border-b">
                      <th className="text-left p-3 font-semibold sticky left-0 bg-muted/60 z-10 min-w-[160px]">KPI</th>
                      {agentNames.map(name => (
                        <th key={name} className="text-right p-3 font-semibold min-w-[110px]">
                          <Link href={`/employees/${encodeURIComponent(name.toLowerCase())}`} className="hover:underline text-foreground">
                            {name}
                          </Link>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((row, ri) => (
                      <tr key={row.label} className={`border-b last:border-b-0 ${ri % 2 === 1 ? "bg-muted/10" : ""} hover:bg-accent/20`}>
                        <td className="p-3 sticky left-0 bg-inherit z-10">
                          <div className="font-semibold">{row.label}</div>
                          {row.sub && <div className="text-[10px] text-muted-foreground mt-0.5">{row.sub}</div>}
                        </td>
                        {agentNames.map(name => {
                          const cell = row.values[name];
                          if (!cell) return <td key={name} className="p-3 text-right text-muted-foreground">—</td>;
                          return (
                            <td
                              key={name}
                              className={`p-3 text-right tabular-nums ${cell.bold ? "font-bold" : ""}`}
                              style={cell.color ? { color: cell.color } : undefined}
                            >
                              {cell.value}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </Section>

          {/* Drive Time card (Bouncie mock) */}
          {bouncieRows.length > 0 && (
            <Section
              title="Drive Time"
              subtitle={`Bouncie · last 30 days · ${bouncie?.source === "mock" ? "MOCK DATA (until token arrives)" : "live"}`}
            >
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {bouncieRows.map(b => (
                  <Card key={b.name} padding="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Car className="h-4 w-4 text-primary" />
                      <div className="font-semibold text-sm">{b.name}</div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <Gauge className="h-3 w-3" /> Min/Day
                        </div>
                        <div className="text-lg font-bold tabular-nums">{b.avgMinutes}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> Mi/Day
                        </div>
                        <div className="text-lg font-bold tabular-nums">{b.avgMiles}</div>
                      </div>
                      <div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Stops</div>
                        <div className="text-lg font-bold tabular-nums">{b.totalStops}</div>
                      </div>
                    </div>
                    <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                      Total: {b.totalMinutes} min · {b.totalMiles} mi · {b.days} days
                    </div>
                  </Card>
                ))}
              </div>
            </Section>
          )}

          {/* Funnel chart with agent focus toggle */}
          <Section
            title="Per-Agent Activity Funnel"
            subtitle="Touch points → appts set → attended → offers → contracts (period totals)"
            actions={
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  onClick={() => setFocusAgent("all")}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                    focusAgent === "all"
                      ? "bg-primary/15 text-primary border-primary/40"
                      : "text-muted-foreground border-[hsl(var(--card-border))] hover:text-foreground"
                  }`}
                >All agents</button>
                {agentNames.map(name => (
                  <button
                    key={name}
                    onClick={() => setFocusAgent(name)}
                    className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                      focusAgent === name
                        ? "bg-primary/15 text-primary border-primary/40"
                        : "text-muted-foreground border-[hsl(var(--card-border))] hover:text-foreground"
                    }`}
                  >{name}</button>
                ))}
              </div>
            }
          >
            <Card>
              <div className="h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={focusAgent === "all" ? rows : rows.filter(r => r.agent === focusAgent)} margin={CHART_MARGIN}>
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

          {/* Rev Tracker ROAS — per agent gross */}
          {perAgentGross.length > 0 && (
            <Section
              title="Revenue Tracker — Per-Agent Gross"
              subtitle="Sum of deal gross revenue when agent earned a commission (YTD)"
            >
              <Card>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perAgentGross} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis dataKey="name" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} tickFormatter={(v: number) => fmtMoney(v)} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: any, n: any) => n === "Gross" ? fmtMoney(Number(v)) : v}
                      />
                      <Legend {...CHART_LEGEND} />
                      <Bar dataKey="total" name="Gross" fill="hsl(var(--baby-blue-600))" {...BAR_DEFAULTS} />
                      <Bar dataKey="dealCount" name="Deals" fill="hsl(var(--status-green))" {...BAR_DEFAULTS} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Section>
          )}

          {/* Rev Tracker — Marketing Source Rollup */}
          {marketingSourceData.length > 0 && (
            <Section
              title="Revenue Tracker — Gross by Marketing Source"
              subtitle="Top sources from Rev Tracker (deals attributed via Marketing Month + Source column)"
            >
              <Card>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={marketingSourceData} margin={CHART_MARGIN}>
                      <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID_COLOR} />
                      <XAxis dataKey="name" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} tickFormatter={(v: number) => fmtMoney(v)} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        formatter={(v: any, n: any) => n === "Gross" ? fmtMoney(Number(v)) : v}
                      />
                      <Legend {...CHART_LEGEND} />
                      <Bar dataKey="gross" name="Gross" fill="hsl(var(--baby-blue-600))" {...BAR_DEFAULTS}>
                        {marketingSourceData.map((_, i) => (
                          <Cell key={i} fill={`hsl(var(--baby-blue-${[300, 400, 500, 600, 700][i % 5]}))`} />
                        ))}
                      </Bar>
                      <Bar dataKey="deals" name="Deals" fill="hsl(var(--status-green))" {...BAR_DEFAULTS} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </Section>
          )}

          {/* ROAS by agent removed per leadership feedback — not high-priority at agent level */}
        </>
      )}
    </div>
  );
}
