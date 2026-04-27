/**
 * Period-aware data helpers.
 *
 * Given the raw KPI data and a selected time-period, these helpers produce
 * the correct aggregated values so every stat on every page responds to
 * the Day / Week / Month / Quarter / Year selector.
 *
 * Data availability by period:
 *   Day    → dailySales / dailyDispo / dailyTransactions (last entry in arrays)
 *   Week   → monthly value ÷ 4 (best available approximation)
 *   Month  → salesMonthly[latestMonth]  (the latest month with pipeline data)
 *   Quarter→ quarterly.Q<current>
 *   Year   → ytd totals
 */

import type { KpiData } from "./useKpiData";
import type { TimePeriod } from "@/components/TimePeriodFilter";

// ── helpers ──────────────────────────────────────────────────────────

/** Sum values for given months from a monthly-keyed record */
export function sumMonths(
  obj: Record<string, number | null> | undefined,
  months: string[]
): number {
  if (!obj) return 0;
  return months.reduce((s, m) => s + ((obj[m] as number) ?? 0), 0);
}

/** Average non-null values for given months */
export function avgMonths(
  obj: Record<string, number | null> | undefined,
  months: string[]
): number | null {
  if (!obj) return null;
  const vals = months.map((m) => obj[m]).filter((v) => v != null && v !== 0) as number[];
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/** Determine current quarter string from a month abbreviation */
export function quarterForMonth(month: string): "Q1" | "Q2" | "Q3" | "Q4" {
  const q1 = ["Jan", "Feb", "Mar"];
  const q2 = ["Apr", "May", "Jun"];
  const q3 = ["Jul", "Aug", "Sep"];
  if (q1.includes(month)) return "Q1";
  if (q2.includes(month)) return "Q2";
  if (q3.includes(month)) return "Q3";
  return "Q4";
}

export function quarterMonths(q: "Q1" | "Q2" | "Q3" | "Q4"): string[] {
  switch (q) {
    case "Q1": return ["Jan", "Feb", "Mar"];
    case "Q2": return ["Apr", "May", "Jun"];
    case "Q3": return ["Jul", "Aug", "Sep"];
    case "Q4": return ["Oct", "Nov", "Dec"];
  }
}

/** Get the current quarter label based on the latest active month */
export function currentQuarterLabel(salesActiveMonths: string[]): string {
  const latest = salesActiveMonths[salesActiveMonths.length - 1] ?? "Apr";
  return quarterForMonth(latest);
}

/** Get months in the current quarter that have data */
export function currentQuarterMonths(salesActiveMonths: string[]): string[] {
  const q = currentQuarterLabel(salesActiveMonths) as "Q1" | "Q2" | "Q3" | "Q4";
  const qm = quarterMonths(q);
  return salesActiveMonths.filter((m) => qm.includes(m));
}

// ── Period-specific pipeline aggregate ──────────────────────────────

export interface PipelineAgg {
  grossLeads: number;
  netLeads: number;
  apptsSet: number;
  apptsExecuted: number;
  contracts: number;
  closedDeals: number;
  revenue: number;
  marketingSpend: number;
  profitPerDeal: number;
  droppedContracts: number;
}

/**
 * Return aggregated pipeline numbers for the given period.
 * This is the single source of truth for period-filtered stats.
 */
export function getPipelineForPeriod(
  data: KpiData,
  period: TimePeriod
): PipelineAgg {
  const {
    salesMonthly, ytd, quarterly, salesActiveMonths, avgProfitPerDeal, dailySales,
  } = data;
  const MONTHS = salesActiveMonths;
  const latestMonth = MONTHS[MONTHS.length - 1] ?? "Jan";

  switch (period) {
    case "day": {
      // Approximate daily = latest month / days in month (~30) or / 14 for recent window
      const div = 30;
      return {
        grossLeads: Math.round((salesMonthly.gross_leads[latestMonth] as number ?? 0) / div),
        netLeads: Math.round((salesMonthly.net_leads[latestMonth] as number ?? 0) / div),
        apptsSet: Math.round((salesMonthly.appts_set[latestMonth] as number ?? 0) / div),
        apptsExecuted: Math.round((salesMonthly.appts_executed[latestMonth] as number ?? 0) / div),
        contracts: 0,
        closedDeals: 0,
        revenue: Math.round((salesMonthly.revenue[latestMonth] as number ?? 0) / div),
        marketingSpend: Math.round((salesMonthly.marketing_spend[latestMonth] as number ?? 0) / div),
        profitPerDeal: avgProfitPerDeal,
        droppedContracts: 0,
      };
    }
    case "week": {
      const div = 4;
      return {
        grossLeads: Math.round((salesMonthly.gross_leads[latestMonth] as number ?? 0) / div),
        netLeads: Math.round((salesMonthly.net_leads[latestMonth] as number ?? 0) / div),
        apptsSet: Math.round((salesMonthly.appts_set[latestMonth] as number ?? 0) / div),
        apptsExecuted: Math.round((salesMonthly.appts_executed[latestMonth] as number ?? 0) / div),
        contracts: Math.round((salesMonthly.contracts[latestMonth] as number ?? 0) / div),
        closedDeals: Math.round((salesMonthly.closed_deals[latestMonth] as number ?? 0) / div),
        revenue: Math.round((salesMonthly.revenue[latestMonth] as number ?? 0) / div),
        marketingSpend: Math.round((salesMonthly.marketing_spend[latestMonth] as number ?? 0) / div),
        profitPerDeal: (salesMonthly.profit_per_deal[latestMonth] as number) ?? avgProfitPerDeal,
        droppedContracts: Math.round((salesMonthly.dropped_contracts[latestMonth] as number ?? 0) / div),
      };
    }
    case "month": {
      return {
        grossLeads: (salesMonthly.gross_leads[latestMonth] as number) ?? 0,
        netLeads: (salesMonthly.net_leads[latestMonth] as number) ?? 0,
        apptsSet: (salesMonthly.appts_set[latestMonth] as number) ?? 0,
        apptsExecuted: (salesMonthly.appts_executed[latestMonth] as number) ?? 0,
        contracts: (salesMonthly.contracts[latestMonth] as number) ?? 0,
        closedDeals: (salesMonthly.closed_deals[latestMonth] as number) ?? 0,
        revenue: (salesMonthly.revenue[latestMonth] as number) ?? 0,
        marketingSpend: (salesMonthly.marketing_spend[latestMonth] as number) ?? 0,
        profitPerDeal: (salesMonthly.profit_per_deal[latestMonth] as number) ?? avgProfitPerDeal,
        droppedContracts: (salesMonthly.dropped_contracts[latestMonth] as number) ?? 0,
      };
    }
    case "quarter": {
      const q = currentQuarterLabel(MONTHS) as "Q1" | "Q2" | "Q3" | "Q4";
      const qd = quarterly[q];
      const qMonths = currentQuarterMonths(MONTHS);
      return {
        grossLeads: qd.gross_leads,
        netLeads: qd.net_leads,
        apptsSet: qd.appts_set,
        apptsExecuted: qd.appts_executed,
        contracts: qd.contracts,
        closedDeals: qd.closed_deals,
        revenue: qd.revenue,
        marketingSpend: qd.marketing_spend,
        profitPerDeal: qd.closed_deals > 0 ? Math.round(qd.revenue / qd.closed_deals) : avgProfitPerDeal,
        droppedContracts: sumMonths(salesMonthly.dropped_contracts, qMonths),
      };
    }
    case "year":
    default: {
      return {
        grossLeads: ytd.gross_leads,
        netLeads: ytd.net_leads,
        apptsSet: ytd.appts_set,
        apptsExecuted: ytd.appts_executed,
        contracts: ytd.contracts,
        closedDeals: ytd.closed_deals,
        revenue: ytd.revenue,
        marketingSpend: ytd.marketing_spend,
        profitPerDeal: avgProfitPerDeal,
        droppedContracts: sumMonths(salesMonthly.dropped_contracts, MONTHS),
      };
    }
  }
}

/**
 * Get the period label for display (e.g., "Apr" for month, "Q2" for quarter, "YTD" for year).
 */
export function periodDisplayLabel(
  period: TimePeriod,
  salesActiveMonths: string[]
): string {
  const latest = salesActiveMonths[salesActiveMonths.length - 1] ?? "Apr";
  switch (period) {
    case "day": return "Today";
    case "week": return `Week of ${latest}`;
    case "month": return latest;
    case "quarter": return currentQuarterLabel(salesActiveMonths);
    case "year": return `Jan–${latest}`;
  }
}

/**
 * Get the goal multiplier for the period.
 * Monthly goals × this = period goal.
 */
export function goalMultiplier(
  period: TimePeriod,
  salesActiveMonths: string[]
): number {
  switch (period) {
    case "day": return 1 / 30;
    case "week": return 1 / 4;
    case "month": return 1;
    case "quarter": return 3;
    case "year": return salesActiveMonths.length || 4;
  }
}

/**
 * For rep cards: get the correct value from a per-month record for the selected period.
 *   Day/Week   → latestMonth value (÷ 30 or ÷ 4 for estimated)
 *   Month      → latestMonth value
 *   Quarter    → sum of current quarter months
 *   Year       → sum of all active months
 */
export function repValueForPeriod(
  monthlyRecord: Record<string, number> | undefined,
  period: TimePeriod,
  salesActiveMonths: string[],
  opts?: { divide?: boolean }
): number {
  if (!monthlyRecord) return 0;
  const MONTHS = salesActiveMonths;
  const latest = MONTHS[MONTHS.length - 1] ?? "Jan";

  switch (period) {
    case "day":
      return opts?.divide
        ? Math.round((monthlyRecord[latest] ?? 0) / 30)
        : (monthlyRecord[latest] ?? 0);
    case "week":
      return opts?.divide
        ? Math.round((monthlyRecord[latest] ?? 0) / 4)
        : (monthlyRecord[latest] ?? 0);
    case "month":
      return monthlyRecord[latest] ?? 0;
    case "quarter": {
      const qMonths = currentQuarterMonths(MONTHS);
      return qMonths.reduce((s, m) => s + (monthlyRecord[m] ?? 0), 0);
    }
    case "year":
      return MONTHS.reduce((s, m) => s + (monthlyRecord[m] ?? 0), 0);
  }
}

/**
 * For percentage/ratio metrics: get averaged value for the period.
 */
export function ratioForPeriod(
  monthlyRecord: Record<string, number | null> | undefined,
  period: TimePeriod,
  salesActiveMonths: string[]
): number | null {
  if (!monthlyRecord) return null;
  const MONTHS = salesActiveMonths;
  const latest = MONTHS[MONTHS.length - 1] ?? "Jan";

  switch (period) {
    case "day":
    case "week":
    case "month":
      return (monthlyRecord[latest] as number) ?? null;
    case "quarter":
      return avgMonths(monthlyRecord, currentQuarterMonths(MONTHS));
    case "year":
      return avgMonths(monthlyRecord, MONTHS);
  }
}

/**
 * For commission/revenue records keyed by month.
 */
export function commissionForPeriod(
  monthlyRecord: Record<string, number> | undefined,
  period: TimePeriod,
  salesActiveMonths: string[],
  activeMonths: string[]
): number {
  if (!monthlyRecord) return 0;
  // For commissions, use activeMonths (includes May-Jul revenue months)
  const ALL_MONTHS = activeMonths;
  const MONTHS = salesActiveMonths;
  const latest = MONTHS[MONTHS.length - 1] ?? ALL_MONTHS[ALL_MONTHS.length - 1] ?? "Apr";

  switch (period) {
    case "day":
      return Math.round((monthlyRecord[latest] ?? 0) / 30);
    case "week":
      return Math.round((monthlyRecord[latest] ?? 0) / 4);
    case "month":
      return monthlyRecord[latest] ?? 0;
    case "quarter": {
      const qMonths = currentQuarterMonths(MONTHS);
      // Include ALL_MONTHS that fall in this quarter for revenue
      const allQMonths = ALL_MONTHS.filter((m) => qMonths.some((qm) => quarterForMonth(m) === quarterForMonth(qm)));
      return allQMonths.reduce((s, m) => s + (monthlyRecord[m] ?? 0), 0);
    }
    case "year":
      return ALL_MONTHS.reduce((s, m) => s + (monthlyRecord[m] ?? 0), 0);
  }
}
