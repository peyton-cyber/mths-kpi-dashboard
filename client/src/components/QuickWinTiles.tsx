/**
 * QuickWinTiles — three tiles added in the post-Bouncie quick-wins sprint:
 *   1) Per-rep conversion funnel (calls → appts → offers → contracts → closings)
 *   2) Days-to-close (FUB UC date ↔ Rev Tracker close date join)
 *   3) Lead-source ROI (channel → revenue, spend, ROAS, CAC)
 *
 * All read from KpiData; gracefully render empty states if data is missing.
 */
import { Card, Section } from "@/components/dash";
import { useKpi } from "@/components/KpiDataProvider";
import { fmtMoney } from "@/lib/useKpiData";

function pct(n: number): string {
  if (!isFinite(n) || n === 0) return "—";
  return n.toFixed(1) + "%";
}

export function PerRepFunnelTile() {
  const data = useKpi();
  const funnel = data.perRepFunnel;
  if (!funnel || funnel.reps.length === 0) return null;

  return (
    <Section
      title={`Per-Rep Funnel — ${funnel.windowLabel}`}
      subtitle={`Net Leads → Appts Set → Executed → Contracts → Closings (${funnel.closingsMonth}) — sheet-only (Master KPIs)`}
    >
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-per-rep-funnel">
            <thead>
              <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <th className="text-left py-2 pl-2 pr-3 text-muted-foreground uppercase tracking-wider text-[10px]">Rep</th>
                <th className="text-left py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Role</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Net Leads</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Appts Set</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Executed</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Contracts</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Dropped</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Closings (mo)</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Lead→Appt</th>
                <th className="text-right py-2 pl-2 pr-2 text-muted-foreground uppercase tracking-wider text-[10px]">Appt→Contract</th>
              </tr>
            </thead>
            <tbody>
              {funnel.reps.map(r => (
                <tr key={r.rep} className="border-b" style={{ borderColor: "hsl(var(--border))" }} data-testid={`row-funnel-${r.rep.toLowerCase().replace(/\s/g, "-")}`}>
                  <td className="py-2 pl-2 pr-3 font-semibold">{r.rep}</td>
                  <td className="py-2 px-2 text-muted-foreground">{r.role}</td>
                  <td className="py-2 px-2 text-right num">{r.netLeads}</td>
                  <td className="py-2 px-2 text-right num">{r.apptsSet}</td>
                  <td className="py-2 px-2 text-right num">{r.apptsExecuted}</td>
                  <td className="py-2 px-2 text-right num">{r.contracts}</td>
                  <td className="py-2 px-2 text-right num text-muted-foreground">{r.droppedContracts}</td>
                  <td className="py-2 px-2 text-right num font-semibold">{r.closings}</td>
                  <td className="py-2 px-2 text-right num text-muted-foreground">{pct(r.leadToAppt)}</td>
                  <td className="py-2 pl-2 pr-2 text-right num text-muted-foreground">{pct(r.apptToContract)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[10px] text-muted-foreground">{funnel.note}</div>
        </div>
      </Card>
    </Section>
  );
}

export function DaysToCloseTile() {
  const data = useKpi();
  const dtc = data.daysToClose;
  // No sample data after FUB removal — hide tile entirely.
  // Sheet-based avg days to close is shown in the Overview "Deal Economics" card.
  if (!dtc || dtc.sampleSize === 0) return null;
  return (
    <Section title="Days to Close" subtitle="Avg cycle time from contract to close">
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Stat label="Avg Days" value={dtc.avgDays != null ? `${dtc.avgDays}d` : "—"} highlight />
          <Stat label="Median" value={dtc.medianDays != null ? `${dtc.medianDays}d` : "—"} />
          <Stat label="Fastest" value={dtc.fastest != null ? `${dtc.fastest}d` : "—"} />
          <Stat label="Slowest" value={dtc.slowest != null ? `${dtc.slowest}d` : "—"} />
          <Stat label="Sample" value={`${dtc.sampleSize} deals`} />
        </div>
        <div className="mt-3 text-[10px] text-muted-foreground">{dtc.method}</div>
      </Card>
    </Section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 num ${highlight ? "text-2xl font-bold" : "text-lg font-semibold"}`} style={highlight ? { color: "hsl(var(--baby-blue-500))" } : undefined}>
        {value}
      </div>
    </div>
  );
}

export function LeadSourceRoiTile() {
  const data = useKpi();
  const ls = data.leadSources;
  if (!ls || !ls.sources || ls.sources.length === 0) {
    return (
      <Section title="Lead-Source ROI" subtitle="Cost-per-lead and CAC by channel (Marketing 2026 KPIs)">
        <Card>
          <div className="text-xs text-muted-foreground py-4 text-center">
            {ls?.error ?? "Lead-source data not available yet."}
          </div>
        </Card>
      </Section>
    );
  }

  // Sort by leads desc
  const sorted = [...ls.sources].sort((a, b) => b.leads - a.leads);

  return (
    <Section
      title="Lead-Source ROI"
      subtitle={`${ls.windowLabel || `Last ${ls.windowDays}d`} · ${ls.totalLeads} leads · ${ls.totalContracts} contracts · ${fmtMoney(ls.totalSpend)} spend · source: Marketing 2026 KPIs`}
    >
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" data-testid="table-lead-source-roi">
            <thead>
              <tr className="border-b" style={{ borderColor: "hsl(var(--border))" }}>
                <th className="text-left py-2 pl-2 pr-3 text-muted-foreground uppercase tracking-wider text-[10px]">Source</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Leads</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Appts</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Contracts</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">Spend</th>
                <th className="text-right py-2 px-2 text-muted-foreground uppercase tracking-wider text-[10px]">CPL</th>
                <th className="text-right py-2 pl-2 pr-2 text-muted-foreground uppercase tracking-wider text-[10px]">CAC</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(r => (
                <tr key={r.source} className="border-b" style={{ borderColor: "hsl(var(--border))" }} data-testid={`row-source-${r.source.toLowerCase().replace(/\s/g, "-")}`}>
                  <td className="py-2 pl-2 pr-3 font-semibold">{r.source}</td>
                  <td className="py-2 px-2 text-right num">{r.leads}</td>
                  <td className="py-2 px-2 text-right num text-muted-foreground">{r.appts}</td>
                  <td className="py-2 px-2 text-right num">{r.contracts}</td>
                  <td className="py-2 px-2 text-right num text-muted-foreground">{r.spend > 0 ? fmtMoney(r.spend) : "—"}</td>
                  <td className="py-2 px-2 text-right num">{r.cpl > 0 ? fmtMoney(r.cpl) : "—"}</td>
                  <td className="py-2 pl-2 pr-2 text-right num">{r.cac > 0 ? fmtMoney(r.cac) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 text-[10px] text-muted-foreground">
            CPL = Cost Per Lead (spend / leads). CAC = Customer Acquisition Cost (spend / contracts). Spend is only attributed to channels with current marketing budget.
          </div>
        </div>
      </Card>
    </Section>
  );
}

/**
 * DataFreshnessBanner — slim per-source freshness display. Mount in the Layout
 * header next to the "Live" indicator or above the page content.
 */
function timeAgo(iso?: string): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return "—";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function DataFreshnessBanner() {
  const data = useKpi();
  const df = data.dataFreshness;
  if (!df) return null;
  const sources = Object.entries(df).filter(([k]) => k !== "computedAt");

  return (
    <div
      data-testid="data-freshness-banner"
      className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-md text-[10px] mb-3"
      style={{ background: "hsl(var(--muted) / 0.5)", border: "1px solid hsl(var(--border))" }}
    >
      <span className="font-semibold uppercase tracking-wider text-muted-foreground">Data Freshness:</span>
      {sources.map(([name, meta]) => {
        const fetchedAt = (meta as any)?.fetchedAt;
        const error = (meta as any)?.error;
        const ageMs = fetchedAt ? Date.now() - new Date(fetchedAt).getTime() : null;
        const stale = ageMs != null && ageMs > 30 * 60 * 1000; // 30+ min = amber
        return (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{
                background: error
                  ? "hsl(var(--status-red))"
                  : stale
                  ? "hsl(var(--status-amber))"
                  : "hsl(var(--status-green))",
              }}
            />
            <span className="font-medium">{name}</span>
            <span className="text-muted-foreground">{error ? "error" : timeAgo(fetchedAt)}</span>
          </span>
        );
      })}
    </div>
  );
}

const MONTH_ORDER = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * YoYTile — 2025 vs 2026 revenue tracker comparison.
 * Shows YTD same-months delta + month-by-month bars.
 */
export function YoYTile() {
  const data = useKpi();
  const yoy = data.revenueTrackerYoY;
  if (!yoy) return null;
  const { year2025, year2026, comparison } = yoy;
  const months = MONTH_ORDER.filter(m =>
    (year2025.monthlyActuals[m] || 0) > 0 || (year2026.monthlyActuals[m] || 0) > 0
  );
  const maxVal = Math.max(
    1,
    ...months.map(m => Math.max(year2025.monthlyActuals[m] || 0, year2026.monthlyActuals[m] || 0))
  );
  const deltaPositive = comparison.deltaYtdRevenue >= 0;
  const deltaColor = deltaPositive ? "hsl(var(--status-green))" : "hsl(var(--status-red))";

  return (
    <Section
      title="2026 vs 2025 — Year-Over-Year"
      subtitle={`YTD comparison across ${comparison.monthsCompared.length || 0} months with 2026 actuals`}
    >
      <Card>
        {/* Headline metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 pb-4 border-b" style={{ borderColor: "hsl(var(--border))" }}>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">2026 YTD</div>
            <div className="text-lg font-bold">{fmtMoney(year2026.ytdRevenue)}</div>
            <div className="text-[11px] text-muted-foreground">{year2026.ytdDeals} deals</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">2025 (same months)</div>
            <div className="text-lg font-bold">{fmtMoney(comparison.ytd2025SameMonths)}</div>
            <div className="text-[11px] text-muted-foreground">{comparison.ytd2025DealsSameMonths} deals</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ Revenue</div>
            <div className="text-lg font-bold" style={{ color: deltaColor }}>
              {deltaPositive ? "+" : ""}{fmtMoney(comparison.deltaYtdRevenue)}
            </div>
            <div className="text-[11px]" style={{ color: deltaColor }}>
              {deltaPositive ? "+" : ""}{comparison.deltaYtdPct.toFixed(1)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Δ Deals</div>
            <div className="text-lg font-bold" style={{ color: comparison.deltaYtdDeals >= 0 ? "hsl(var(--status-green))" : "hsl(var(--status-red))" }}>
              {comparison.deltaYtdDeals >= 0 ? "+" : ""}{comparison.deltaYtdDeals}
            </div>
            <div className="text-[11px] text-muted-foreground">vs 2025 same months</div>
          </div>
        </div>

        {/* Reference totals */}
        <div className="text-[11px] text-muted-foreground mb-3">
          2025 Full Year: <span className="font-semibold text-foreground">{fmtMoney(year2025.ytdRevenue)}</span> ({year2025.ytdDeals} deals)
        </div>

        {/* Monthly bars */}
        <div className="space-y-2">
          {months.map(m => {
            const v2025 = year2025.monthlyActuals[m] || 0;
            const v2026 = year2026.monthlyActuals[m] || 0;
            const w2025 = (v2025 / maxVal) * 100;
            const w2026 = (v2026 / maxVal) * 100;
            return (
              <div key={m} className="grid grid-cols-[40px_1fr] gap-2 items-center text-[11px]">
                <div className="font-semibold text-muted-foreground">{m}</div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted-foreground w-10">2025</div>
                    <div className="flex-1 h-3 rounded" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                      <div className="h-full rounded" style={{ width: `${w2025}%`, background: "hsl(var(--muted-foreground) / 0.5)" }} />
                    </div>
                    <div className="num text-muted-foreground w-20 text-right">{v2025 > 0 ? fmtMoney(v2025) : "—"}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-[10px] text-muted-foreground w-10">2026</div>
                    <div className="flex-1 h-3 rounded" style={{ background: "hsl(var(--muted) / 0.4)" }}>
                      <div className="h-full rounded" style={{ width: `${w2026}%`, background: "hsl(var(--primary))" }} />
                    </div>
                    <div className="num font-semibold w-20 text-right">{v2026 > 0 ? fmtMoney(v2026) : "—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </Section>
  );
}
