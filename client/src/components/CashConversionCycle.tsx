// Cash Conversion Cycle dashboard — adds a 7-stage funnel + total + sortable
// per-house table to the Company Overview page. Data flows from
// /api/kpi-data > cashConversionCycle (computed in server/sheets.ts from the
// "Historic Deal KPIs" tab).
import { useMemo, useState } from "react";
import { Card, Section, StoplightDot } from "@/components/dash";
import { KpiTooltip, KPI_NOTES } from "@/components/KpiTooltip";
import { fmtMoney } from "@/lib/useKpiData";
import type { CashConversionCycle, CCCDeal } from "@/lib/useKpiData";
import { ChevronUp, ChevronDown, ArrowRight } from "lucide-react";

// Stage-level "so what" notes — index-aligned with backend stages array.
const STAGE_NOTES: string[] = [
  KPI_NOTES.ccc_lead_to_net,
  KPI_NOTES.ccc_net_to_apptSet,
  KPI_NOTES.ccc_apptSet_to_apptExec,
  KPI_NOTES.ccc_apptExec_to_uc,
  KPI_NOTES.ccc_uc_to_pushed,
  KPI_NOTES.ccc_pushed_to_assigned,
  KPI_NOTES.ccc_assigned_to_closed,
];

// Status thresholds (days) per stage — drives the dot color in the funnel.
// Targets are loose first-pass values; team can refine as we collect more data.
const STAGE_TARGETS = [3, 7, 5, 7, 7, 5, 30] as const;
function stageStatus(avg: number, target: number): "green" | "yellow" | "red" {
  if (avg <= target) return "green";
  if (avg <= target * 1.5) return "yellow";
  return "red";
}

type SortKey =
  | "closeDate"
  | "profit"
  | "days_total"
  | "purchasePrice"
  | "salePrice"
  | "sqft";

export function CashConversionCycleSection({
  ccc,
}: {
  ccc: CashConversionCycle | undefined;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [limit, setLimit] = useState(25);

  if (!ccc || !ccc.stages?.length) {
    return null;
  }

  const totalStatus =
    ccc.totalAvgDays <= 60
      ? "green"
      : ccc.totalAvgDays <= 90
        ? "yellow"
        : "red";

  const sortedDeals = useMemo(() => {
    const xs = [...ccc.deals];
    xs.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      // Treat null as smaller than everything
      if (av === null && bv === null) return 0;
      if (av === null) return sortDir === "asc" ? -1 : 1;
      if (bv === null) return sortDir === "asc" ? 1 : -1;
      // Date strings sort lexically (ISO format)
      if (typeof av === "string" || typeof bv === "string") {
        const cmp = String(av).localeCompare(String(bv));
        return sortDir === "asc" ? cmp : -cmp;
      }
      const cmp = (av as number) - (bv as number);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return xs.slice(0, limit);
  }, [ccc.deals, sortKey, sortDir, limit]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const SortHeader = ({ k, children, align = "left" }: { k: SortKey; children: React.ReactNode; align?: "left" | "right" }) => (
    <th
      className={`px-3 py-2 text-[11px] uppercase tracking-wide font-semibold cursor-pointer select-none hover:text-foreground transition-colors ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => toggleSort(k)}
    >
      <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        {sortKey === k ? (
          sortDir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <span className="opacity-30 text-[9px]">⇅</span>
        )}
      </span>
    </th>
  );

  return (
    <Section
      title="Cash Conversion Cycle"
      subtitle={`Lead created → closed. Stage-level breakdown across the ${ccc.totalSampleSize} deals closed in the last 12 months.`}
    >
      {/* Total card + funnel */}
      <Card padding="p-5">
        <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch">
          {/* Total CCC summary */}
          <div className="lg:w-[260px] lg:shrink-0 lg:border-r lg:pr-6 lg:border-[hsl(var(--card-border))]">
            <div className="flex items-center gap-2 mb-2">
              <KpiTooltip
                label={
                  <span className="text-[11px] uppercase tracking-[0.14em] font-semibold text-muted-foreground">
                    Lead → Closed
                  </span>
                }
                note={KPI_NOTES.cash_conversion_cycle}
                title="Cash Conversion Cycle"
              />
              <StoplightDot status={totalStatus} />
            </div>
            <div className="scorecard tabular text-5xl text-primary leading-none">
              {ccc.totalAvgDays}
              <span className="text-2xl text-muted-foreground ml-1">d</span>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              Median {ccc.totalMedianDays}d · {ccc.totalSampleSize} deals (last 12mo)
            </div>
            <div className="text-[11px] text-muted-foreground/70 mt-1">
              All-time avg {ccc.allTimeAvgDays}d · {ccc.allTimeSampleSize} deals
            </div>
          </div>

          {/* Stage funnel */}
          <div className="flex-1 min-w-0">
            <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
              {ccc.stages.map((stage, idx) => {
                const status = stageStatus(stage.avgDays, STAGE_TARGETS[idx] ?? 7);
                const note = STAGE_NOTES[idx] ?? "";
                return (
                  <div key={stage.key} className="flex items-center gap-1 min-w-0">
                    <div
                      className="ccc-stage-card rounded-md border bg-background/40 px-3 py-2.5 min-w-[120px]"
                      style={{ borderColor: "hsl(var(--card-border))" }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <KpiTooltip
                          label={
                            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground truncate">
                              {stage.label}
                            </span>
                          }
                          note={note}
                          title={stage.label}
                        />
                      </div>
                      <div className="flex items-baseline gap-2">
                        <div className="scorecard tabular text-2xl leading-none">
                          {stage.avgDays}
                          <span className="text-sm text-muted-foreground ml-0.5">d</span>
                        </div>
                        <StoplightDot status={status} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1.5 leading-tight">
                        median {stage.medianDays}d · n={stage.sampleSize}
                      </div>
                    </div>
                    {idx < ccc.stages.length - 1 && (
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground/70 mt-3">
              Sample sizes vary by stage — some older deals are missing intermediate dates. Hover any stage label for a "so what" explanation.
            </p>
          </div>
        </div>
      </Card>

      {/* Per-house table — sortable, defaults to profit ↓ ("bread and butter" view) */}
      <Card padding="p-0">
        <div className="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2"
             style={{ borderColor: "hsl(var(--card-border))" }}>
          <div>
            <KpiTooltip
              label={
                <span className="text-xs uppercase tracking-[0.14em] font-semibold text-foreground/80">
                  Per-House Detail
                </span>
              }
              note='Click any column header to sort. Defaults to "bread and butter" — highest-profit deals first. Use the sort to surface high-profit, fast-cycle deals you want to replicate.'
              title="Per-House Detail"
            />
            <p className="text-[11px] text-muted-foreground/80 mt-0.5">
              Showing {sortedDeals.length} of {ccc.deals.length} deals · sorted by {sortKey.replace(/_/g, " ")} {sortDir === "desc" ? "↓" : "↑"}
            </p>
          </div>
          <div className="flex gap-1">
            {[25, 50, 100, 250].map((n) => (
              <button
                key={n}
                onClick={() => setLimit(n)}
                className={`text-[11px] px-2 py-1 rounded border transition-colors ${
                  limit === n
                    ? "bg-primary/15 text-primary border-primary/40"
                    : "text-muted-foreground border-[hsl(var(--card-border))] hover:text-foreground"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground bg-muted/20">
              <tr>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold">Address</th>
                <th className="px-3 py-2 text-left text-[11px] uppercase tracking-wide font-semibold">City</th>
                <SortHeader k="profit" align="right">Profit</SortHeader>
                <SortHeader k="purchasePrice" align="right">Purchase</SortHeader>
                <SortHeader k="salePrice" align="right">Sale</SortHeader>
                <SortHeader k="sqft" align="right">Sq Ft</SortHeader>
                <th className="px-3 py-2 text-right text-[11px] uppercase tracking-wide font-semibold">Bd/Ba</th>
                <SortHeader k="days_total" align="right">CCC</SortHeader>
                <SortHeader k="closeDate" align="right">Closed</SortHeader>
              </tr>
            </thead>
            <tbody>
              {sortedDeals.map((d, i) => (
                <DealRow d={d} key={`${d.address}-${i}`} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Section>
  );
}

function DealRow({ d }: { d: CCCDeal }) {
  return (
    <tr className="border-t hover:bg-muted/10 transition-colors"
        style={{ borderColor: "hsl(var(--card-border))" }}>
      <td className="px-3 py-2 truncate max-w-[260px]" title={d.address}>{d.address || "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{d.city || "—"}</td>
      <td className="px-3 py-2 text-right tabular font-semibold">{d.profit ? fmtMoney(d.profit) : "—"}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">{d.purchasePrice ? fmtMoney(d.purchasePrice) : "—"}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">{d.salePrice ? fmtMoney(d.salePrice) : "—"}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">{d.sqft ? d.sqft.toLocaleString() : "—"}</td>
      <td className="px-3 py-2 text-right tabular text-muted-foreground">
        {d.bed || "—"}{d.bath ? `/${d.bath}` : ""}
      </td>
      <td className="px-3 py-2 text-right tabular">
        {d.days_total !== null ? `${d.days_total}d` : "—"}
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground tabular">{d.closeDate || "—"}</td>
    </tr>
  );
}
