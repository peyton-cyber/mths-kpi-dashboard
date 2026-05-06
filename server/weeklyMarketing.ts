/**
 * Weekly 2026 Marketing tab parser.
 *
 * The tab in 2026 Master KPIs has a non-standard layout:
 *   - 3 month-blocks side-by-side, each 9 columns wide + 1 spacer = 10 cols per block
 *   - Each block has columns: Month, Week, Lead Source, Gross Lead, Net Lead,
 *     Active Listing, No Comps / Fit, Out of Buy Box, No Reply
 *   - Blocks run 1: Jan/Feb/Mar, then a 2-row gap, then 2: Apr/May/Jun, etc.
 *   - Some later blocks (Apr+) have 10 columns due to "No Comps" + "Not a Fit"
 *     split into 2 separate columns.
 *   - Within each block, a row group is 9 lead-source rows (SEO, Facebook,
 *     Google PPC, TV, Radio, Referrals, PPL, Trucks, Billboards) with the
 *     Month + Week labels only on the first row.
 *
 * This module flattens the whole thing into a clean list of records
 * keyed by (month, week, source), then aggregates for the dashboard.
 */
import { fetchSheetRaw } from "./google-sheets-client";

const MASTER_KPIS = "1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0";
const TAB_NAME = "Weekly 2026 Marketing";

const MONTH_ORDER = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
// Tolerate the typo present in the sheet ("Janurary").
function normalizeMonth(raw: string): string | null {
  const v = (raw || "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  if (lower.startsWith("janu")) return "January";
  for (const m of MONTH_ORDER) if (lower.startsWith(m.slice(0, 3).toLowerCase())) return m;
  return v;
}

function num(v: string | undefined | null): number {
  if (v === undefined || v === null) return 0;
  const s = String(v).trim().replace(/[$,]/g, "");
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export interface WeeklyMarketingRecord {
  month: string;        // e.g., "January"
  week: string;         // e.g., "29-4"
  weekStart: string;    // ISO-ish label, best-effort for sorting
  source: string;       // SEO, Facebook, Google PPC, TV, Radio, Referrals, PPL, Trucks, Billboards
  grossLead: number;
  netLead: number;
  activeListing: number;
  noCompsOrFit: number;
  outOfBuyBox: number;
  noReply: number;
}

export interface WeeklyMarketingData {
  records: WeeklyMarketingRecord[];
  // Aggregations
  byWeek: Array<{
    month: string;
    week: string;
    weekKey: string;
    grossLead: number;
    netLead: number;
    netToGrossPct: number;
    sourceCount: number;
  }>;
  bySource: Array<{
    source: string;
    grossLead: number;
    netLead: number;
    netToGrossPct: number;
    activeListing: number;
    noCompsOrFit: number;
    outOfBuyBox: number;
    noReply: number;
    disqualified: number;
  }>;
  byMonth: Array<{
    month: string;
    grossLead: number;
    netLead: number;
    netToGrossPct: number;
  }>;
  totals: {
    grossLead: number;
    netLead: number;
    netToGrossPct: number;
    weeksCovered: number;
    sourcesCovered: number;
  };
  source: "google_sheets";
  fetchedAt: string;
  error?: string;
}

// Parse one block of 9 contiguous columns starting at colOffset within `rows`.
// Returns flat records discovered. Carries last-seen month + week downward.
function parseBlock(
  rows: string[][],
  startRow: number,
  endRow: number,
  colOffset: number,
  hasSplitNoComps: boolean
): WeeklyMarketingRecord[] {
  const out: WeeklyMarketingRecord[] = [];
  let currentMonth: string | null = null;
  let currentWeek: string | null = null;

  for (let r = startRow; r < endRow && r < rows.length; r++) {
    const row = rows[r] || [];
    const monthCell = row[colOffset];
    const weekCell = row[colOffset + 1];
    const sourceCell = row[colOffset + 2];

    if (monthCell && monthCell.trim()) currentMonth = normalizeMonth(monthCell);
    if (weekCell && weekCell.trim()) currentWeek = weekCell.trim();

    const source = (sourceCell || "").trim();
    if (!source) continue;
    if (!currentMonth || !currentWeek) continue;

    let activeListing: number;
    let noCompsOrFit: number;
    let outOfBuyBox: number;
    let noReply: number;
    if (hasSplitNoComps) {
      // 10-col block: ..., Active Listing, No Comps, Not a Fit, Out of Buy Box, No Reply
      activeListing = num(row[colOffset + 5]);
      const noComps = num(row[colOffset + 6]);
      const notFit = num(row[colOffset + 7]);
      noCompsOrFit = noComps + notFit;
      outOfBuyBox = num(row[colOffset + 8]);
      noReply = num(row[colOffset + 9]);
    } else {
      // 9-col block: Active Listing, No Comps / Fit, Out of Buy Box, No Reply
      activeListing = num(row[colOffset + 5]);
      noCompsOrFit = num(row[colOffset + 6]);
      outOfBuyBox = num(row[colOffset + 7]);
      noReply = num(row[colOffset + 8]);
    }

    out.push({
      month: currentMonth,
      week: currentWeek,
      weekStart: `${currentMonth}-${currentWeek}`,
      source,
      grossLead: num(row[colOffset + 3]),
      netLead: num(row[colOffset + 4]),
      activeListing,
      noCompsOrFit,
      outOfBuyBox,
      noReply,
    });
  }
  return out;
}

function isHeaderRow(row: string[] | undefined): boolean {
  if (!row) return false;
  const a = (row[0] || "").trim().toLowerCase();
  const c = (row[2] || "").trim().toLowerCase();
  return a === "month" && c === "lead source";
}

export async function fetchWeeklyMarketingData(): Promise<WeeklyMarketingData> {
  const empty: WeeklyMarketingData = {
    records: [],
    byWeek: [],
    bySource: [],
    byMonth: [],
    totals: { grossLead: 0, netLead: 0, netToGrossPct: 0, weeksCovered: 0, sourcesCovered: 0 },
    source: "google_sheets",
    fetchedAt: new Date().toISOString(),
  };

  let raw: string[][];
  try {
    raw = await fetchSheetRaw(MASTER_KPIS, TAB_NAME);
  } catch (e: any) {
    return { ...empty, error: `weeklyMarketing fetch threw: ${(e?.message || "").slice(0, 200)}` };
  }
  if (!raw.length) return { ...empty, error: "weeklyMarketing returned no rows" };

  // Find header rows (each represents the start of a new 3-month band).
  const headerRows: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (isHeaderRow(raw[i])) headerRows.push(i);
  }
  if (!headerRows.length) return { ...empty, error: "weeklyMarketing no header rows found" };

  const allRecords: WeeklyMarketingRecord[] = [];
  for (let h = 0; h < headerRows.length; h++) {
    const headerRow = headerRows[h];
    const nextHeaderRow = headerRows[h + 1] ?? raw.length;
    const dataStart = headerRow + 1;
    // Determine if this band uses split No Comps / Not a Fit by checking column count
    const headerLen = (raw[headerRow] || []).length;
    // Detect by looking for "No Comps" and "Not a Fit" both present
    const headerCells = (raw[headerRow] || []).map((c) => (c || "").trim().toLowerCase());
    const hasSplitNoComps = headerCells.includes("no comps") && headerCells.includes("not a fit");
    const blockWidth = hasSplitNoComps ? 11 : 10; // 9 (or 10) data cols + spacer

    // Each band has 3 blocks side-by-side
    for (let block = 0; block < 3; block++) {
      const colOffset = block * blockWidth;
      if (colOffset + 8 >= headerLen) break;
      const recs = parseBlock(raw, dataStart, nextHeaderRow, colOffset, hasSplitNoComps);
      allRecords.push(...recs);
    }
  }

  // Filter out totally empty records (all metrics 0 AND no point in keeping)
  const records = allRecords.filter(
    (r) =>
      r.grossLead +
        r.netLead +
        r.activeListing +
        r.noCompsOrFit +
        r.outOfBuyBox +
        r.noReply >
      0
  );

  // Aggregations
  const byWeekMap = new Map<string, ReturnType<typeof emptyWeekAgg>>();
  function emptyWeekAgg() {
    return { month: "", week: "", weekKey: "", grossLead: 0, netLead: 0, netToGrossPct: 0, sourceCount: 0 };
  }
  for (const rec of records) {
    const key = `${rec.month}|${rec.week}`;
    let agg = byWeekMap.get(key);
    if (!agg) {
      agg = emptyWeekAgg();
      agg.month = rec.month;
      agg.week = rec.week;
      agg.weekKey = key;
      byWeekMap.set(key, agg);
    }
    agg.grossLead += rec.grossLead;
    agg.netLead += rec.netLead;
    agg.sourceCount += 1;
  }
  const byWeek = Array.from(byWeekMap.values()).map((w) => ({
    ...w,
    netToGrossPct: w.grossLead > 0 ? (w.netLead / w.grossLead) * 100 : 0,
  }));
  // Sort weeks by month order then week label numeric start
  byWeek.sort((a, b) => {
    const am = MONTH_ORDER.indexOf(a.month);
    const bm = MONTH_ORDER.indexOf(b.month);
    if (am !== bm) return am - bm;
    const aStart = parseInt((a.week.split("-")[0] || "0").replace(/\D/g, ""), 10) || 0;
    const bStart = parseInt((b.week.split("-")[0] || "0").replace(/\D/g, ""), 10) || 0;
    return aStart - bStart;
  });

  const bySourceMap = new Map<string, ReturnType<typeof emptySourceAgg>>();
  function emptySourceAgg() {
    return {
      source: "",
      grossLead: 0,
      netLead: 0,
      netToGrossPct: 0,
      activeListing: 0,
      noCompsOrFit: 0,
      outOfBuyBox: 0,
      noReply: 0,
      disqualified: 0,
    };
  }
  for (const rec of records) {
    let agg = bySourceMap.get(rec.source);
    if (!agg) {
      agg = emptySourceAgg();
      agg.source = rec.source;
      bySourceMap.set(rec.source, agg);
    }
    agg.grossLead += rec.grossLead;
    agg.netLead += rec.netLead;
    agg.activeListing += rec.activeListing;
    agg.noCompsOrFit += rec.noCompsOrFit;
    agg.outOfBuyBox += rec.outOfBuyBox;
    agg.noReply += rec.noReply;
  }
  const bySource = Array.from(bySourceMap.values())
    .map((s) => ({
      ...s,
      netToGrossPct: s.grossLead > 0 ? (s.netLead / s.grossLead) * 100 : 0,
      disqualified: s.activeListing + s.noCompsOrFit + s.outOfBuyBox + s.noReply,
    }))
    .sort((a, b) => b.grossLead - a.grossLead);

  const byMonthMap = new Map<string, { month: string; grossLead: number; netLead: number; netToGrossPct: number }>();
  for (const rec of records) {
    let agg = byMonthMap.get(rec.month);
    if (!agg) {
      agg = { month: rec.month, grossLead: 0, netLead: 0, netToGrossPct: 0 };
      byMonthMap.set(rec.month, agg);
    }
    agg.grossLead += rec.grossLead;
    agg.netLead += rec.netLead;
  }
  const byMonth = Array.from(byMonthMap.values())
    .map((m) => ({
      ...m,
      netToGrossPct: m.grossLead > 0 ? (m.netLead / m.grossLead) * 100 : 0,
    }))
    .sort((a, b) => MONTH_ORDER.indexOf(a.month) - MONTH_ORDER.indexOf(b.month));

  const totalGross = bySource.reduce((s, x) => s + x.grossLead, 0);
  const totalNet = bySource.reduce((s, x) => s + x.netLead, 0);

  return {
    records,
    byWeek,
    bySource,
    byMonth,
    totals: {
      grossLead: totalGross,
      netLead: totalNet,
      netToGrossPct: totalGross > 0 ? (totalNet / totalGross) * 100 : 0,
      weeksCovered: byWeek.length,
      sourcesCovered: bySource.length,
    },
    source: "google_sheets",
    fetchedAt: new Date().toISOString(),
  };
}
