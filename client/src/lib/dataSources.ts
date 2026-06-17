// Single source of truth for "where does this section's data come from?"
// Reference these from Section's `source` prop so the team can instantly
// see which sheet / tab / API powers each panel.
import type { DataSourceProps } from "@/components/dash";

const MASTER_KPIS = "1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0";
const COMPANY_FINANCIALS = "1Ja5mBIMGL25jLDkrAUaqcnXhD3K-lJulOAK23b2zlHw";
const TC_TRACKER = "1JreJiwg17RYzFuApf8ypMSCK44EgrJKBAU6XgBFBseQ";

function tab(sheetId: string, gid?: string) {
  return `https://docs.google.com/spreadsheets/d/${sheetId}${gid ? `/edit#gid=${gid}` : ""}`;
}

export const SRC = {
  // ── Master KPIs tabs (canonical) ──
  marketing2026: {
    label: "Marketing 2026 KPIs",
    detail: "current-month channels",
    url: tab(MASTER_KPIS),
    tone: "sheet" as const,
  },
  weeklyMarketing: {
    label: "Weekly 2026 Marketing",
    detail: "per-week × per-source",
    url: tab(MASTER_KPIS),
    tone: "sheet" as const,
  },
  sales2026: {
    label: "Sales 2026 KPIs",
    detail: "per-rep monthly",
    url: tab(MASTER_KPIS),
    tone: "sheet" as const,
  },
  dispo2026: {
    label: "Dispo 2026 KPIs",
    detail: "deal-level 2026",
    url: tab(MASTER_KPIS),
    tone: "sheet" as const,
  },
  historicDeal: {
    label: "Historic Deal KPIs",
    detail: "Current Deals / AQ Funnel",
    url: tab(MASTER_KPIS, "17564421"),
    tone: "sheet" as const,
  },

  // ── Company Financials tabs ──
  revTracker: {
    label: "Revenue Tracker",
    detail: "commissions + closings",
    url: tab(COMPANY_FINANCIALS),
    tone: "sheet" as const,
  },
  financials: {
    label: "Company Financials",
    url: tab(COMPANY_FINANCIALS),
    tone: "sheet" as const,
  },

  // ── TC Tracker ──
  tcTracker: {
    label: "TC Tracker",
    detail: "active deals + capacity",
    url: tab(TC_TRACKER),
    tone: "sheet" as const,
  },

  // ── External APIs ──
  bouncie: { label: "Bouncie API", detail: "drive/idle per device", tone: "api" as const },
  mailchimp: { label: "Mailchimp API", detail: "audience + campaigns", tone: "api" as const },

  // ── Derived / computed ──
  derived: (what: string): DataSourceProps => ({
    label: "Computed",
    detail: what,
    tone: "computed" as const,
  }),

  // ── Heads-up notice ──
  fubRemoved: {
    label: "FUB removed",
    detail: "see Master KPIs",
    tone: "warn" as const,
  },
} as const satisfies Record<string, DataSourceProps | ((s: string) => DataSourceProps)>;
