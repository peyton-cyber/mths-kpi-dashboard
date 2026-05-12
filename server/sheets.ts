/**
 * Google Sheets data fetcher — reads live data via the official Google
 * Sheets API using a service account (see ./google-sheets-client.ts).
 *
 * ALL sheets are fetched in PARALLEL for speed.
 * ZERO hardcoded values — everything comes from the sheets.
 */
import { readFileSync, writeFileSync } from "fs";
import { fetchAllSprintsThisYear, type SprintGoals } from "./asana-sprints";
import {
  fetchSheetsParallel as fetchSheetsParallelImpl,
  fetchSheetRaw,
  type SheetResponse as ClientSheetResponse,
} from "./google-sheets-client";
import { fetchDispoFubData, type DispoFubData } from "./fub";
import { fetchMailchimpData, type MailchimpData } from "./mailchimp";
import { fetchWeeklyMarketingData, type WeeklyMarketingData } from "./weeklyMarketing";

// Sheet IDs
const MASTER_KPIS = "1rKN0793qdZrst2qZFCo9NcOzy9ZIUyLQdnGoO0jNFx0";
const TC_TRACKER = "1JreJiwg17RYzFuApf8ypMSCK44EgrJKBAU6XgBFBseQ";
const COMPANY_FINANCIALS = "1Ja5mBIMGL25jLDkrAUaqcnXhD3K-lJulOAK23b2zlHw";
const SALES_STOPLIGHT = "1cQ5JggRwpuKeZsCHEpso-ckfj-fM_7Qer50WkYUqxWM";
// Phase 2 — new operational sheets (created May 2026, owned by Peyton)
const ACQ_ACTIVITY = process.env.ACQ_ACTIVITY_SHEET_ID || "1olzDTnjBqZsBfxuvIIscAathd1d_MccSLZVoILlIP5k";
const MARKETING_SPEND = process.env.MARKETING_SPEND_SHEET_ID || "15PkMjnBh68uKssCv9XjylXjUo9c8BoZ-kIx05piHpSk";
const KPI_OWNERSHIP = process.env.KPI_OWNERSHIP_SHEET_ID || "1IvMom_d9O9mUhGLr1_Ufqkb2GDeDtGNsKxlxT1sRXSo";

interface SheetRow { [key: string]: string; _rowNumber: string; }
interface SheetResponse { headers: string[]; rows: SheetRow[]; rowCount: number; }

// ========== PARALLEL FETCH ==========
// Thin wrapper around the new googleapis-based client that preserves the
// exact response shape downstream parsers depend on.
function fetchSheetsParallel(
  requests: { label: string; spreadsheetId: string; sheetName: string }[]
): Promise<Record<string, SheetResponse>> {
  return fetchSheetsParallelImpl(requests) as unknown as Promise<Record<string, SheetResponse>>;
}

// Legacy implementation kept below for reference — disabled.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function __legacy_fetchSheetsParallel_disabled(
  requests: { label: string; spreadsheetId: string; sheetName: string }[]
): Promise<Record<string, SheetResponse>> {
  const fetchScript = `
const { exec } = require('child_process');
const requests = ${JSON.stringify(requests)};
const EMPTY = JSON.stringify({ headers: [], rows: [], rowCount: 0, _empty: true });
// Validate response has expected shape: { headers: [...], rows: [...] }.
// Pipedream can return valid JSON error/throttle payloads that parse but lack data.
// We also require rows.length > 0 because all our sheets have data — an empty rows
// array from Pipedream almost always means a transient API error.
function isValidSheetResponse(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return false;
  if (parsed.headers.length === 0) return false;
  if (parsed.rows.length === 0) return false;
  // Verify first row is a proper object with at least one header-keyed value
  const firstRow = parsed.rows[0];
  if (!firstRow || typeof firstRow !== 'object') return false;
  // At least one value in the first row should be non-empty
  const hasContent = Object.values(firstRow).some(v => v !== null && v !== '' && v !== undefined);
  return hasContent;
}
function run(label, params) {
  return new Promise((resolve) => {
    const cmd = "external-tool call '" + JSON.stringify(params).replace(/'/g, "'\\\\''") + "'";
    let attempts = 0;
    const maxRetries = 4;
    function attempt() {
      attempts++;
      exec(cmd, { timeout: 20000, maxBuffer: 10*1024*1024 }, (err, stdout, stderr) => {
        if (!err && stdout) {
          try {
            const parsed = JSON.parse(stdout);
            if (isValidSheetResponse(parsed)) {
              resolve({ label, data: stdout.trim(), ok: true });
              return;
            }
            // Valid JSON but wrong shape — log first attempt for diagnostics
            if (attempts === 1) {
              console.error('[sheets] ' + label + ' bad shape: ' + stdout.slice(0, 200));
            }
          } catch(e) {
            if (attempts === 1) console.error('[sheets] ' + label + ' parse err: ' + String(e).slice(0, 150));
          }
        } else if (err && attempts === 1) {
          console.error('[sheets] ' + label + ' exec err: ' + (err.message || '').slice(0, 150));
        }
        if (attempts < maxRetries) {
          // Exponential backoff: 500ms, 1500ms, 3500ms
          const delay = 500 * Math.pow(2, attempts - 1) + Math.random() * 500;
          setTimeout(attempt, delay);
        } else {
          console.error('[sheets] ' + label + ' FAILED after ' + maxRetries + ' attempts');
          resolve({ label, data: EMPTY, ok: false });
        }
      });
    }
    attempt();
  });
}
Promise.all(requests.map(r => run(r.label, {
  source_id: "google_sheets__pipedream",
  tool_name: "google_sheets-read-rows",
  arguments: { spreadsheetId: r.spreadsheetId, sheetName: r.sheetName }
}))).then(results => {
  const out = {};
  const failed = [];
  for (const r of results) {
    out[r.label] = JSON.parse(r.data);
    if (!r.ok) failed.push(r.label);
  }
  if (failed.length > 0) {
    out._failed = failed;
  }
  process.stdout.write(JSON.stringify(out));
});
`;
  return new Promise((resolve) => {
    const { exec } = require("child_process") as typeof import("child_process");
    exec(`node -e '${fetchScript.replace(/'/g, "'\\''")}'`, {
      timeout: 90000, encoding: "utf-8" as const, maxBuffer: 10 * 1024 * 1024,
    }, (err: any, stdout: string, stderr: string) => {
      if (err) {
        console.error("[sheets] Parallel fetch failed:", (err.message || "").slice(0, 200));
        if (stderr) console.error("[sheets] stderr:", stderr.slice(0, 500));
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(stdout);
        if (parsed._failed && Array.isArray(parsed._failed) && parsed._failed.length > 0) {
          console.error(`[sheets] ${parsed._failed.length} sheets failed after retries: ${parsed._failed.join(', ')}`);
        }
        resolve(parsed);
      } catch (parseErr: any) {
        console.error("[sheets] Failed to parse worker output:", String(parseErr).slice(0, 200));
        resolve({});
      }
    });
  });
}

// ========== PARSERS ==========

function parseMoney(s: string | undefined): number {
  if (!s || s.trim() === "" || s.trim() === "$ -" || s.trim() === "$ -   ") return 0;
  return parseFloat(s.replace(/[$,\s()]/g, "").replace(/^\((.+)\)$/, "-$1")) || 0;
}
function parsePct(s: string | undefined): number | null {
  if (!s || s.trim() === "" || s.includes("DIV")) return null;
  const n = parseFloat(s.replace("%", ""));
  return isNaN(n) ? null : n / 100;
}
function parseInt2(s: string | undefined): number {
  if (!s || s.trim() === "") return 0;
  return parseInt(s.replace(/,/g, ""), 10) || 0;
}
function parseFloat2(s: string | undefined): number {
  if (!s || s.trim() === "") return 0;
  return parseFloat(s.replace(/[,$\s]/g, "")) || 0;
}

// ========== DATE PARSING (Historic Deal KPIs is messy: M/D/YY, M/D/YYYY, ISO, MM/DD/YY) ==========
function parseFlexDate(s: string | undefined): Date | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  // ISO format YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // M/D/YY or MM/DD/YYYY
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr = yr < 50 ? 2000 + yr : 1900 + yr;
    const d = new Date(yr, Number(m[1]) - 1, Number(m[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback: native parse
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

// ========== MONTH MAPPING ==========

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// Month-prefix tokens used to match Sales 2026 KPIs column headers.
// We do prefix-matching at runtime (case-insensitive) because the header
// often has a date-range suffix that the team edits week-to-week, e.g.
// "JAN (Dec 29-Feb1)", "APR (30-4)", "MAY (5-31)". Hardcoding the exact
// header text was causing months to silently fall out of the parser.
const SALES_MONTH_PREFIXES = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JULY", "AUG", "SEPT", "OCT", "NOV", "DEC",
];

// Full month names used in Revenue Tracker close dates
const MONTH_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

/**
 * Parse a Rev Tracker close-date cell like "May 12", "April 30", "Feburary 3".
 * Returns a JS Date in the current year, or null if unparseable.
 */
function parseCloseDate(raw: string | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s || s.toUpperCase() === "TBD") return null;
  const year = new Date().getFullYear();
  // Match "Month Day" with optional year
  const m = s.match(/^([A-Za-z]+)\s+(\d{1,2})(?:\s*,?\s*(\d{4}))?$/);
  if (!m) return null;
  const monthName = m[1].toLowerCase();
  const day = parseInt(m[2], 10);
  const yr = m[3] ? parseInt(m[3], 10) : year;
  let monthIdx = MONTH_FULL.findIndex(mf => mf.toLowerCase() === monthName);
  if (monthIdx === -1) {
    // typo / prefix tolerance
    if (monthName.startsWith("febu")) monthIdx = 1;
    else monthIdx = MONTH_FULL.findIndex(mf => mf.toLowerCase().startsWith(monthName.slice(0, 3)));
  }
  if (monthIdx === -1) return null;
  return new Date(yr, monthIdx, day);
}

// ========== MAIN FETCHER ==========

export async function fetchAllKpiData() {
  const t0 = Date.now();
  console.log("[sheets] Fetching ALL live data from Google Sheets (parallel)...");

  // ================================================================
  // Auto-detect current quarter so RISE tabs roll forward automatically
  // (Q1 2026 → Q2 2026 → Q3 2026 → Q4 2026 → Q1 2027 …)
  // We always include the previous quarter for historical comparison.
  // ================================================================
  const _now = new Date();
  const _currentQuarter = Math.floor(_now.getMonth() / 3) + 1; // 1-4
  const _currentYear = _now.getFullYear();
  const _prevQuarter = _currentQuarter === 1 ? 4 : _currentQuarter - 1;
  const _prevYear = _currentQuarter === 1 ? _currentYear - 1 : _currentYear;
  const currentRiseTab = `Q${_currentQuarter} ${_currentYear} - RISE`;
  const prevRiseTab = `Q${_prevQuarter} ${_prevYear} - RISE`;
  console.log(`[sheets] RISE tabs (auto): current="${currentRiseTab}", prev="${prevRiseTab}"`);

  // Fetch sheets, Asana sprint goals, FUB dispo data, Mailchimp, and Weekly Marketing in parallel
  const [sheets, sprintGoalsList, dispoFub, mailchimp, weeklyMarketing] = await Promise.all([
    fetchSheetsParallel([
      { label: "mktg", spreadsheetId: MASTER_KPIS, sheetName: "Marketing 2026 KPIs" },
      { label: "deals", spreadsheetId: MASTER_KPIS, sheetName: "TOP 10 DEALS" },
      { label: "buyers", spreadsheetId: MASTER_KPIS, sheetName: "New Buyer KPIs 2026" },
      { label: "capacity", spreadsheetId: TC_TRACKER, sheetName: "Capacity Oversight Dashboard" },
      { label: "tx", spreadsheetId: TC_TRACKER, sheetName: "Transactions" },
      { label: "rev", spreadsheetId: COMPANY_FINANCIALS, sheetName: "2026 Revenue Tracker" },
      { label: "salesKpis", spreadsheetId: MASTER_KPIS, sheetName: "Sales 2026 KPIs" },
      { label: "dispo", spreadsheetId: MASTER_KPIS, sheetName: "Dispo 2026 KPIs" },
      { label: "pipeRisk", spreadsheetId: TC_TRACKER, sheetName: "Pipeline & Risk Dashboard" },
      { label: "riseCurrent", spreadsheetId: SALES_STOPLIGHT, sheetName: currentRiseTab },
      { label: "risePrev",    spreadsheetId: SALES_STOPLIGHT, sheetName: prevRiseTab },
      { label: "historic", spreadsheetId: MASTER_KPIS, sheetName: "Historic Deal KPIs" },
      { label: "acqActivity",    spreadsheetId: ACQ_ACTIVITY,    sheetName: "Daily Activity" },
      { label: "acqTargets",     spreadsheetId: ACQ_ACTIVITY,    sheetName: "Targets" },
      { label: "marketingSpend", spreadsheetId: MARKETING_SPEND, sheetName: "Monthly Spend by Agent" },
      { label: "kpiOwners",      spreadsheetId: KPI_OWNERSHIP,   sheetName: "KPI Owners" },
    ]),
    fetchAllSprintsThisYear(_now).catch((e) => {
      console.error(`[asana] sprint fetch failed: ${(e?.message || "").slice(0, 200)}`);
      return [] as SprintGoals[];
    }),
    fetchDispoFubData(process.env.FUB_API_KEY || "").catch((e): DispoFubData => {
      console.error(`[fub] dispo fetch failed: ${(e?.message || "").slice(0, 200)}`);
      return {
        totalActiveDispo: 0,
        totalClosedDispo: 0,
        totalDropped: 0,
        revenueAssignedByWeek: [],
        avgAssignmentPerDeal: 0,
        stageBreakdown: [],
        byOwner: [],
        byDealType: [],
        source: "fub",
        fetchedAt: new Date().toISOString(),
        error: `FUB fetch threw: ${(e?.message || "unknown").slice(0, 200)}`,
      };
    }),
    fetchMailchimpData(process.env.MAILCHIMP_API_KEY || "").catch((e): MailchimpData => {
      console.error(`[mailchimp] fetch failed: ${(e?.message || "").slice(0, 200)}`);
      return {
        audienceName: "",
        totalSubscribers: 0,
        activeSubscribers: 0,
        unsubscribed: 0,
        cleaned: 0,
        audienceOpenRate: 0,
        audienceClickRate: 0,
        campaignCount: 0,
        lastSentAt: null,
        recentCampaigns: [],
        weeklyVolume: [],
        source: "mailchimp",
        fetchedAt: new Date().toISOString(),
        error: `Mailchimp fetch threw: ${(e?.message || "unknown").slice(0, 200)}`,
      };
    }),
    fetchWeeklyMarketingData().catch((e): WeeklyMarketingData => {
      console.error(`[weeklyMarketing] fetch failed: ${(e?.message || "").slice(0, 200)}`);
      return {
        records: [], byWeek: [], bySource: [], byMonth: [],
        totals: { grossLead: 0, netLead: 0, netToGrossPct: 0, weeksCovered: 0, sourcesCovered: 0 },
        source: "google_sheets",
        fetchedAt: new Date().toISOString(),
        error: `weeklyMarketing fetch threw: ${(e?.message || "unknown").slice(0, 200)}`,
      };
    }),
  ]);
  if (weeklyMarketing.error) {
    console.warn(`[weeklyMarketing] returned error: ${weeklyMarketing.error}`);
  } else {
    console.log(`[weeklyMarketing] ${weeklyMarketing.records.length} records, ${weeklyMarketing.totals.weeksCovered} weeks, ${weeklyMarketing.totals.sourcesCovered} sources, ${weeklyMarketing.totals.grossLead} gross / ${weeklyMarketing.totals.netLead} net`);
  }
  if (dispoFub.error) {
    console.warn(`[fub] dispo data returned error: ${dispoFub.error}`);
  } else {
    console.log(`[fub] dispo: ${dispoFub.totalActiveDispo} active, ${dispoFub.totalClosedDispo} closed, ${dispoFub.totalDropped} dropped, ${dispoFub.byOwner.length} owners`);
  }
  if (mailchimp.error) {
    console.warn(`[mailchimp] returned error: ${mailchimp.error}`);
  } else {
    console.log(`[mailchimp] ${mailchimp.activeSubscribers} active subs, ${mailchimp.recentCampaigns.length} recent campaigns, audience open ${(mailchimp.audienceOpenRate*100).toFixed(1)}%`);
  }

  // Map RISE tabs to legacy keys (existing parsing code uses riseQ2/riseQ1)
  // We treat "current quarter" as riseQ2 and "previous quarter" as riseQ1 from the
  // perspective of downstream code — the actual quarter labels propagate via logs only.
  (sheets as any).riseQ2 = sheets.riseCurrent;
  (sheets as any).riseQ1 = sheets.risePrev;

  console.log(`[sheets] All sheets fetched in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // ================================================================
  // 1. SALES KPIs — Primary monthly metrics (Jan–Apr+)
  // ================================================================
  const salesKpis = sheets.salesKpis || { headers: [], rows: [], rowCount: 0 };

  // Build metric lookup: row name → row data
  // Use prefix matching (before the parenthetical) to be resilient to goal text changes
  // Diagnostic: log shape so we can detect when Pipedream returns malformed data
  console.log(`[sheets] salesKpis: headers=${JSON.stringify((salesKpis.headers || []).slice(0, 3))}, rowCount=${salesKpis.rowCount}, rows.length=${(salesKpis.rows || []).length}`);
  if (salesKpis.rows && salesKpis.rows.length > 0) {
    const firstRow = salesKpis.rows[0];
    console.log(`[sheets] salesKpis first row keys: ${JSON.stringify(Object.keys(firstRow).slice(0, 3))}`);
  }

  // The header key for the first column (metric name). Most sheets use "KPIs (Q2 Targets)"
  // but if Pipedream returns a different header shape, fall back to the first header.
  const firstHeader = (salesKpis.headers && salesKpis.headers[0]) || "KPIs (Q2 Targets)";

  // Resolve actual column header for each month at runtime via prefix match.
  // The team frequently edits the parenthetical date range in the header
  // (e.g. "APR" -> "APR (30-4)"), which used to silently break parsing for
  // that month. We now match by leading month token, case-insensitive.
  const salesHeaders: string[] = (salesKpis.headers || []).map((h: any) => String(h || ""));
  const SALES_MONTH_COLS: string[] = SALES_MONTH_PREFIXES.map((prefix) => {
    const target = prefix.toUpperCase();
    // Strict prefix match first (e.g. "APR" matches "APR (30-4)")
    let found = salesHeaders.find((h) => {
      const u = h.toUpperCase().trim();
      return u === target || u.startsWith(target + " ") || u.startsWith(target + "(");
    });
    if (!found) {
      // Soft fallback: any header that starts with the prefix
      found = salesHeaders.find((h) => h.toUpperCase().trim().startsWith(target));
    }
    return found || prefix; // fall back to prefix; row[prefix] will simply return undefined
  });
  console.log(`[sheets] resolved SALES_MONTH_COLS: ${JSON.stringify(SALES_MONTH_COLS)}`);

  const metricLookup: Record<string, SheetRow> = {};
  for (const row of salesKpis.rows) {
    // Try primary header, fall back to first available key
    let name = (row["KPIs (Q2 Targets)"] || row[firstHeader] || "").trim();
    if (!name) {
      // Last-resort: use first non-empty string value in the row
      for (const val of Object.values(row)) {
        if (typeof val === "string" && val.trim() && !val.startsWith("$") && isNaN(Number(val))) {
          name = val.trim();
          break;
        }
      }
    }
    if (name) metricLookup[name] = row;
  }

  // Fuzzy lookup: find a row whose name starts with a given prefix (case-insensitive)
  function findMetricRow(prefix: string): SheetRow | undefined {
    // Try exact match first
    if (metricLookup[prefix]) return metricLookup[prefix];
    const lower = prefix.toLowerCase();
    // Try startsWith match (handles "Appts Set (Goal" matching "Appts Set (Goal 120 for Apr)")
    for (const [key, row] of Object.entries(metricLookup)) {
      if (key.toLowerCase().startsWith(lower)) return row;
    }
    // Try prefix match on the part before '(' (handles "Marketing Spend" matching)
    const lowerPrefix = lower.split('(')[0].trim();
    for (const [key, row] of Object.entries(metricLookup)) {
      const keyPrefix = key.toLowerCase().split('(')[0].trim();
      if (keyPrefix === lowerPrefix) return row;
    }
    return undefined;
  }

  const salesMonthly: Record<string, Record<string, number | null>> = {
    marketing_spend: {}, gross_leads: {}, net_leads: {}, appts_set: {},
    appts_executed: {}, contracts: {}, dropped_contracts: {}, closed_deals: {},
    revenue: {}, profit_per_deal: {}, contact_rate: {}, net_to_gross: {},
    net_to_appt: {}, cost_per_appt: {}, appt_to_contract: {},
  };

  // IMPORTANT: Some metric names like "Appts Set" and "Contracts" also appear as
  // sub-rows under Lead Manager / AQ Agent sections. We need to match the MAIN
  // summary rows which have "(Goal ...)" suffixes. Use unique enough prefixes.
  const metricMapping: { key: string; rowName: string; parser: (s: string | undefined) => number | null }[] = [
    { key: "marketing_spend", rowName: "Marketing Spend", parser: parseMoney },
    { key: "gross_leads", rowName: "Gross Leads (Goal", parser: (s) => parseInt2(s) },
    { key: "contact_rate", rowName: "Contact Rate % (Goal", parser: parsePct },
    { key: "net_leads", rowName: "Net Leads (Goal", parser: (s) => parseInt2(s) },
    { key: "net_to_gross", rowName: "% Net to Gross", parser: parsePct },
    { key: "appts_set", rowName: "Appts Set (Goal", parser: (s) => parseInt2(s) },
    { key: "net_to_appt", rowName: "% Net Leads to Appt Set", parser: parsePct },
    { key: "cost_per_appt", rowName: "Cost per Appointment", parser: parseMoney },
    { key: "appts_executed", rowName: "Appts Executed (Goal", parser: (s) => parseInt2(s) },
    { key: "contracts", rowName: "Contracts (Goal", parser: (s) => parseInt2(s) },
    { key: "appt_to_contract", rowName: "Appt to Contract Conversion", parser: parsePct },
    { key: "dropped_contracts", rowName: "Dropped Contracts (Goal", parser: (s) => parseInt2(s) },
    { key: "closed_deals", rowName: "Sales Team Closed Deals", parser: (s) => parseInt2(s) },
    { key: "revenue", rowName: "Sales Team Revenue (Goal", parser: parseMoney },
    { key: "profit_per_deal", rowName: "Profit Per Deal (Goal", parser: parseMoney },
  ];

  // Determine active months (any month with revenue > 0, or gross leads > 0, or marketing spend > 0)
  const revenueRow = findMetricRow("Sales Team Revenue");
  const grossLeadsRow = findMetricRow("Gross Leads");
  const spendRow = findMetricRow("Marketing Spend");
  const activeMonths: string[] = [];
  for (let i = 0; i < SALES_MONTH_COLS.length; i++) {
    const col = SALES_MONTH_COLS[i];
    const hasRevenue = parseMoney(revenueRow?.[col]) > 0;
    const hasLeads = parseInt2(grossLeadsRow?.[col]) > 0;
    const hasSpend = parseMoney(spendRow?.[col]) > 0;
    if (hasRevenue || hasLeads || hasSpend) {
      activeMonths.push(MONTH_SHORT[i]);
    }
  }

  // Parse each metric for each active month
  for (const mapping of metricMapping) {
    const row = findMetricRow(mapping.rowName);
    if (!row) { console.warn(`[sheets] WARNING: metric row not found: "${mapping.rowName}"`); continue; }
    for (let i = 0; i < SALES_MONTH_COLS.length; i++) {
      const mk = MONTH_SHORT[i];
      if (!activeMonths.includes(mk)) continue;
      salesMonthly[mapping.key][mk] = mapping.parser(row[SALES_MONTH_COLS[i]]);
    }
  }

  // Goals — Q2 targets from sheet (updated dynamically when possible)
  // Parse goals from row names like "Gross Leads (Goal 312 for Apr)".
  // Also extract the month tag ("for Apr") so we know which month the goal applies to.
  function parseGoalFromRowName(rowName: string): { value: number; month: string | null } | null {
    const m = rowName.match(/Goal\s+\$?([\d,.kKmM]+)/i);
    if (!m) return null;
    let val = m[1].replace(/,/g, '');
    if (val.toLowerCase().endsWith('k')) val = String(parseFloat(val) * 1000);
    if (val.toLowerCase().endsWith('m')) val = String(parseFloat(val) * 1000000);
    const value = parseFloat(val);
    if (!value || isNaN(value)) return null;
    // Look for "for Apr" / "for May" / etc. (3-letter month abbreviations)
    const monthMatch = rowName.match(/for\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/i);
    const month = monthMatch ? (monthMatch[1].charAt(0).toUpperCase() + monthMatch[1].slice(1, 3).toLowerCase()) : null;
    return { value, month };
  }

  // Extract goals from actual row names in the sheet
  const revRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('sales team revenue'));
  const profitRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('profit per deal'));
  const grossRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('gross leads'));
  const netRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('net leads') && !k.includes('%'));
  const apptsSetRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('appts set'));
  const apptsExecRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('appts executed'));
  const contractsRowName = Object.keys(metricLookup).find(k => k.toLowerCase().startsWith('contracts') && !k.includes('Dropped') && !k.includes('Conversion'));

  // Helper that returns just the goal value (preserves prior `goals` shape)
  const gv = (rn: string | undefined): number | null => {
    if (!rn) return null;
    const parsed = parseGoalFromRowName(rn);
    return parsed ? parsed.value : null;
  };
  const goals = {
    gross_leads: gv(grossRowName) ?? 312,
    net_leads: gv(netRowName) ?? 172,
    appts_set: gv(apptsSetRowName) ?? 120,
    appts_executed: gv(apptsExecRowName) ?? 105,
    contracts: gv(contractsRowName) ?? 25,
    revenue: gv(revRowName) ?? 550000,
    cost_per_appt: 1200,
    appt_to_contract: 0.28,
    profit_per_deal: gv(profitRowName) ?? 25000,
    dropped_contracts: 2,
  };
  console.log(`[sheets] Goals parsed: rev=$${goals.revenue.toLocaleString()}, gross=${goals.gross_leads}, contracts=${goals.contracts}`);

  // ================================================================
  // PER-MONTH TARGETS (Phase 7.1)
  // The sheet flags each goal with the month it applies to ("Goal 312 for Apr").
  // Build a per-metric → per-month map. Months without an explicit target are
  // emitted as `null`, so the frontend can suppress the pace dot for that period
  // instead of falsely flagging it red.
  // ================================================================
  const SHORT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  type MetricMonthlyGoals = Record<string, number | null>;
  function buildMonthlyForMetric(rowName: string | undefined): MetricMonthlyGoals {
    const out: MetricMonthlyGoals = Object.fromEntries(SHORT_MONTHS.map(m => [m, null]));
    if (!rowName) return out;
    const parsed = parseGoalFromRowName(rowName);
    if (!parsed) return out;
    if (parsed.month) {
      // Goal explicitly tagged for this month — only set that month
      out[parsed.month] = parsed.value;
    } else {
      // No month tag — treat goal as applying to the current month and earlier
      // ones that have actuals. We do NOT assume future months share the goal
      // (user's rule: "Hide pace dots until target is set").
      const curIdx = _now.getMonth(); // 0..11
      for (let i = 0; i <= curIdx; i++) out[SHORT_MONTHS[i]] = parsed.value;
    }
    return out;
  }
  const monthlyGoals: Record<string, MetricMonthlyGoals> = {
    gross_leads:    buildMonthlyForMetric(grossRowName),
    net_leads:      buildMonthlyForMetric(netRowName),
    appts_set:      buildMonthlyForMetric(apptsSetRowName),
    appts_executed: buildMonthlyForMetric(apptsExecRowName),
    contracts:      buildMonthlyForMetric(contractsRowName),
    profit_per_deal: buildMonthlyForMetric(profitRowName),
    // Revenue uses dedicated monthlyRevenueGoals built below, but seed here so the
    // frontend doesn't choke if it expects the key to exist.
    revenue:        Object.fromEntries(SHORT_MONTHS.map(m => [m, null])) as MetricMonthlyGoals,
  };
  const goalsByMonthLog = SHORT_MONTHS.map(m => {
    const set = (Object.keys(monthlyGoals) as Array<keyof typeof monthlyGoals>)
      .filter(k => monthlyGoals[k][m] !== null).length;
    return `${m}:${set}`;
  }).join(' ');
  console.log(`[sheets] monthlyGoals defined per month (count of metrics with target): ${goalsByMonthLog}`);

  // ================================================================
  // PER-MONTH REVENUE GOALS — DYNAMIC FROM ASANA
  // Source: Asana "90 Day Sprint - Q{N} {YYYY}" tasks (workspace 471974462137775)
  //   Each sprint task notes contain per-month revenue targets that we parse.
  //   When the user creates Q3/Q4 sprint tasks in Asana, those goals automatically
  //   flow through here without any code changes.
  // Fallback: For any month not covered by an active sprint task, fall back to
  //   the sheet "Sales Team Revenue" Goal value (sheetRevGoal).
  // ================================================================
  const sheetRevGoal = goals.revenue; // fallback from sheet row name (e.g. $550K)
  const monthlyRevenueGoals: Record<string, number> = {};
  const ALL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Layer in per-month values from each fetched sprint task
  for (const sprint of sprintGoalsList) {
    for (const [m, v] of Object.entries(sprint.monthlyRevenue)) {
      if (typeof v === 'number' && v > 0) {
        monthlyRevenueGoals[m] = v;
      }
    }
    // If a sprint defines a quarter total but no per-month breakout, distribute evenly
    if (sprint.quarterRevenueTarget && Object.keys(sprint.monthlyRevenue).length === 0) {
      const qStart = (sprint.quarter - 1) * 3;
      const perMonth = Math.round(sprint.quarterRevenueTarget / 3);
      for (let i = 0; i < 3; i++) {
        const m = ALL_MONTHS[qStart + i];
        if (m && !(m in monthlyRevenueGoals)) monthlyRevenueGoals[m] = perMonth;
      }
    }
  }

  // Special case: Q1 2026 was set in a separate "Update sales process" task
  // ($720K total → $240K/month). Asana sprint task for Q1 may not exist anymore.
  // Only apply this fallback if Q1 months are still missing AND we're past Q1.
  if (_currentYear === 2026 && _currentQuarter > 1) {
    if (!('Jan' in monthlyRevenueGoals)) monthlyRevenueGoals.Jan = 240000;
    if (!('Feb' in monthlyRevenueGoals)) monthlyRevenueGoals.Feb = 240000;
    if (!('Mar' in monthlyRevenueGoals)) monthlyRevenueGoals.Mar = 240000;
  }

  // Fill any remaining months from sheet fallback
  for (const m of ALL_MONTHS) {
    if (!(m in monthlyRevenueGoals)) monthlyRevenueGoals[m] = sheetRevGoal;
  }

  // Build a per-quarter summary for logging
  const sprintsByQ = new Map(sprintGoalsList.map(s => [s.quarter, s]));
  const goalSrc = ALL_MONTHS.map((m, i) => {
    const q = Math.floor(i / 3) + 1;
    const sprint = sprintsByQ.get(q);
    const fromSprint = sprint && (m in sprint.monthlyRevenue);
    return `${m}=$${(monthlyRevenueGoals[m] / 1000).toFixed(0)}K${fromSprint ? '*' : ''}`;
  }).join(' ');
  console.log(`[sheets] Monthly revenue goals (${sprintGoalsList.length} sprint(s) found, * = from Asana): ${goalSrc}`);

  // Gross Profit goals — derive from active sprint when available, else mirror revenue goal
  const activeSprint = sprintsByQ.get(_currentQuarter);
  const monthlyGrossProfitGoals: Record<string, number> = {};
  if (activeSprint) {
    for (const [m, v] of Object.entries(activeSprint.monthlyRevenue)) {
      monthlyGrossProfitGoals[m] = v;
    }
  }

  // Optionally upgrade top-line goals (contracts, profit_per_deal, revenue) using
  // the active quarter's sprint values when present — sheet goals act as fallback.
  if (activeSprint) {
    if (activeSprint.closingTarget && activeSprint.closingTarget > 0) {
      goals.contracts = Math.round(activeSprint.closingTarget / 3); // quarter target / 3 months
    }
    if (activeSprint.profitPerDeal && activeSprint.profitPerDeal > 0) {
      goals.profit_per_deal = activeSprint.profitPerDeal;
    }
    // Use the current month's per-month revenue goal as the headline `goals.revenue`
    const currentMonthShort = ALL_MONTHS[_now.getMonth()];
    if (monthlyRevenueGoals[currentMonthShort]) {
      goals.revenue = monthlyRevenueGoals[currentMonthShort];
    }
    console.log(`[sheets] Active sprint Q${activeSprint.quarter}: contracts/mo=${goals.contracts}, profit/deal=$${goals.profit_per_deal.toLocaleString()}, current-month rev goal=$${goals.revenue.toLocaleString()}`);
  }

  // ================================================================
  // 2. REVENUE TRACKER — Authoritative monthly actual revenue
  //    IMPORTANT: Only count deals with REAL close dates (not "TBD")
  //    The sheet's "X Actual" summary rows include projected/TBD deals
  //    so we sum individual closed deals instead.
  // ================================================================
  const revSheet = sheets.rev || { headers: [], rows: [], rowCount: 0 };

  const revenueActuals: Record<string, number> = {};
  const tcFeeActuals: Record<string, number> = {};
  const dealsByMonth: Record<string, { deal: string; gross: number; tcFee: number; closeDate: string; category: string }[]> = {};
  const projectedDeals: { deal: string; gross: number; section: string; category: string }[] = [];
  // Per-month bucket of TBD/projected deals (kept SEPARATE from monthly actuals,
  // surfaced as its own "Projected" tile per Phase 8 review).
  const tbdDealsBucket: { deal: string; gross: number; category: string }[] = [];
  const listingReferralByMonth: Record<string, number> = {};
  const closedDealsByMonth: Record<string, number> = {};
  const perPersonRevenue: Record<string, Record<string, number>> = {};
  const perPersonCommissions: Record<string, Record<string, number>> = {};
  // Per-agent gross revenue (sum of deal gross when that agent has a non-zero commission)
  const perAgentGrossByMonth: Record<string, Record<string, number>> = {};
  // Per-agent deal count by month
  const perAgentDealCountByMonth: Record<string, Record<string, number>> = {};
  // Marketing source totals: { "FB Ads" → { gross, dealCount, perAgent: { Korbin: gross, ... } } }
  const marketingSourceRollup: Record<string, { gross: number; dealCount: number; perAgent: Record<string, number> }> = {};
  const personCols = ["Korbin ", "Brandon ", "Jeff Henry", "TJ", "Ryan Craig",
    "Jonathan Medlin", "Jeff Davidson", "Joseph Hooper", "Jeb Burchett", "Kalyn", "Dana"];

  /** Extract marketing source from "UC in Jan - FB Ads" → "FB Ads". */
  function parseMarketingSource(raw: string): string {
    const s = String(raw || "").trim();
    if (!s) return "";
    // Pattern: "UC in <month> - <source>"
    const m = s.match(/-\s*(.+?)\s*$/);
    if (m) return m[1].trim();
    return s;
  }

  // Track which section we're in (for logging projected deals)
  let currentSection = "";

  /** Classify a deal by name into a category (Phase 8 stage logic). */
  function classifyDeal(name: string): string {
    const n = String(name || "").toLowerCase();
    if (n.includes("listing referral") || n.includes("listing-referral")) return "listing_referral";
    if (n.includes("(flip)") || n.includes(" flip") || n.endsWith("flip")) return "flip";
    if (n.includes("novation")) return "novation";
    if (n.includes("(jv)") || n.includes(" jv ")) return "jv";
    if (n.includes("(epp)")) return "epp";
    if (n.includes("rental")) return "rental";
    return "standard";
  }

  for (const row of revSheet.rows) {
    const deal = (row["Deal"] || "").trim();
    const closeDate = (row["Close Date"] || "").trim();
    const gross = parseMoney(row[" Gross Revenue "]);
    const tcFee = parseMoney(row[" TC Fee "]);

    // Track section for context ("January Actual", "February Actual", etc.)
    // Skip ALL summary/aggregate rows — we calculate our own totals
    if (deal.includes("Actual") || deal.includes("Projected") || deal.includes("Funded") ||
        deal.includes("Critical Number") || deal.includes("Current Deals") ||
        deal.includes("Year Total")) {
      currentSection = deal;
      continue;
    }

    // Skip summary rows (Commission, Total Rev, ROAS)
    const cr = (row[" Commission Revenue "] || "").trim();
    if (cr === "Commission" || cr === "Total Rev:" || cr === "ROAS Per:" ||
        cr === " Commission " || cr === " Total Rev: " || cr === " ROAS Per: ") continue;
    if (!deal) continue;

    // Skip deals with no close date or "TBD" close date — these are projections
    if (!closeDate || closeDate.toUpperCase() === "TBD") {
      if (gross > 0) {
        const category = classifyDeal(deal);
        projectedDeals.push({ deal, gross, section: currentSection, category });
        tbdDealsBucket.push({ deal, gross, category });
      }
      continue;
    }

    // Determine month from close date (must be a real date, not TBD)
    let monthIdx = -1;
    for (let mi = 0; mi < MONTH_FULL.length; mi++) {
      if (closeDate.toLowerCase().includes(MONTH_FULL[mi].toLowerCase()) ||
          closeDate.toLowerCase().startsWith(MONTH_FULL[mi].toLowerCase().slice(0, 3))) {
        monthIdx = mi;
        break;
      }
    }
    // Handle typo "Feburary"
    if (monthIdx === -1 && closeDate.toLowerCase().includes("feburary")) monthIdx = 1;
    if (monthIdx === -1) continue;

    const mk = MONTH_SHORT[monthIdx];
    const category = classifyDeal(deal);
    if (!dealsByMonth[mk]) dealsByMonth[mk] = [];
    dealsByMonth[mk].push({ deal, gross, tcFee, closeDate, category });
    // Listing referrals are tracked separately but ALSO count in revenue total.
    if (category === "listing_referral") {
      listingReferralByMonth[mk] = (listingReferralByMonth[mk] || 0) + gross;
    }
    // Count closed deal (every row with a real close date counts, including referrals).
    closedDealsByMonth[mk] = (closedDealsByMonth[mk] || 0) + 1;
    tcFeeActuals[mk] = (tcFeeActuals[mk] || 0) + tcFee;

    // Per-person revenue/commission attribution (only for actual closed deals)
    //
    // Jeb / Joseph dedup (Aug 5 leadership feedback):
    //   Multiple dispo people sometimes get a non-zero commission on the same
    //   deal. We still record their commission accurately, but we only credit
    //   gross + dealCount to the dispo agent with the LARGER commission on
    //   that row. This prevents double-counting gross revenue / deal counts
    //   when both Jeb and Joseph touched the same deal.
    const DISPO_DEDUP_GROUP = new Set(["Joseph Hooper", "Jeb Burchett"]);
    const agentsOnDeal: string[] = [];
    // First pass: pick the dedup winner (larger commission within the dispo group)
    let dispoWinner: string | null = null;
    let dispoWinnerVal = 0;
    for (const pc of personCols) {
      const name = pc.trim();
      if (!DISPO_DEDUP_GROUP.has(name)) continue;
      const val = parseMoney(row[pc]);
      if (val > dispoWinnerVal) {
        dispoWinner = name;
        dispoWinnerVal = val;
      }
    }
    // Second pass: record commission for everyone, but only credit gross/count
    //   to the dedup winner (or to non-dispo agents who are not in the group).
    for (const pc of personCols) {
      const val = parseMoney(row[pc]);
      if (val > 0) {
        const name = pc.trim();
        if (!perPersonCommissions[name]) perPersonCommissions[name] = {};
        perPersonCommissions[name][mk] = (perPersonCommissions[name][mk] || 0) + val;
        agentsOnDeal.push(name);
        // Skip gross/dealCount for the dispo loser when both Jeb & Joseph have non-zero
        const inDispoGroup = DISPO_DEDUP_GROUP.has(name);
        const isDispoLoser = inDispoGroup && dispoWinner !== null && dispoWinner !== name;
        if (!isDispoLoser) {
          if (!perAgentGrossByMonth[name]) perAgentGrossByMonth[name] = {};
          perAgentGrossByMonth[name][mk] = (perAgentGrossByMonth[name][mk] || 0) + gross;
          if (!perAgentDealCountByMonth[name]) perAgentDealCountByMonth[name] = {};
          perAgentDealCountByMonth[name][mk] = (perAgentDealCountByMonth[name][mk] || 0) + 1;
        }
      }
    }

    // Marketing source rollup (column "Marketing Month + Source" or last column)
    const sourceRaw = row["Marketing Month + Source"] || row[" Marketing Month + Source "] || "";
    const source = parseMarketingSource(sourceRaw);
    if (source && gross > 0) {
      if (!marketingSourceRollup[source]) {
        marketingSourceRollup[source] = { gross: 0, dealCount: 0, perAgent: {} };
      }
      marketingSourceRollup[source].gross += gross;
      marketingSourceRollup[source].dealCount += 1;
      for (const a of agentsOnDeal) {
        marketingSourceRollup[source].perAgent[a] = (marketingSourceRollup[source].perAgent[a] || 0) + gross;
      }
    }
  }

  // Calculate ACTUAL revenue per month by summing closed deals.
  //   Total = gross + TC fee (per Phase 8 review: TC fees count as revenue)
  //   Closed deals with TBD/empty close dates were already excluded above.
  // Build a parallel "funded only" view that excludes future-dated closes
  // (deals dated in the future inside the current month, e.g. May 27 today is May 12).
  const TODAY = new Date();
  const revenueActualsFunded: Record<string, number> = {};
  const fundedDealsByMonth: Record<string, number> = {};
  for (const [mk, deals] of Object.entries(dealsByMonth)) {
    // Total revenue for the month (gross + TC), regardless of whether the close
    // has passed yet — matches how the Rev Tracker sums in the sheet.
    revenueActuals[mk] = deals.reduce((s, d) => s + d.gross + d.tcFee, 0);
    // Funded = deals whose close date is on/before today (true "in the bank").
    let funded = 0;
    let fundedCount = 0;
    for (const d of deals) {
      const parsed = parseCloseDate(d.closeDate);
      if (parsed && parsed <= TODAY) {
        funded += d.gross + d.tcFee;
        fundedCount += 1;
      }
    }
    revenueActualsFunded[mk] = funded;
    fundedDealsByMonth[mk] = fundedCount;
  }

  if (projectedDeals.length > 0) {
    const projTotal = projectedDeals.reduce((s, d) => s + d.gross, 0);
    console.log(`[sheets] Revenue: ${projectedDeals.length} projected/TBD deals tracked separately ($${projTotal.toLocaleString()})`);
  }

  // ================================================================
  // PHASE 8: REVENUE TRACKER IS NOW THE SOURCE OF TRUTH FOR REVENUE
  // ----------------------------------------------------------------
  // Decision from May 12 review: company scorecard revenue for every
  // period (day/week/month/quarter/year) should be driven by the
  // Rev Tracker, NOT the Master KPI "Sales Team Revenue" row.
  // The Master KPI sheet is unreliable for revenue.
  // ================================================================
  for (const mk of MONTH_SHORT) {
    if (revenueActuals[mk] !== undefined) {
      salesMonthly.revenue[mk] = revenueActuals[mk];
    }
    if (closedDealsByMonth[mk] !== undefined) {
      salesMonthly.closed_deals[mk] = closedDealsByMonth[mk];
    }
    if (revenueActuals[mk] && !activeMonths.includes(mk)) {
      activeMonths.push(mk);
    }
  }
  console.log(`[sheets] Phase 8: Rev Tracker drives salesMonthly.revenue & closed_deals`);

  // ================================================================
  // Weekly Marketing month patch (Phase 6.1)
  // ----------------------------------------------------------------
  // The Sales 2026 KPIs tab can lag behind the Weekly Marketing tab
  // (e.g. April had 320 gross leads in Weekly Marketing but the Sales
  // KPIs tab was completely empty for April). Fold those leads into
  // salesMonthly so per-month/quarter views aren't blank.
  // ================================================================
  const SHORT_TO_LONG: Record<string, string> = {
    Jan: "January", Feb: "February", Mar: "March", Apr: "April",
    May: "May", Jun: "June", Jul: "July", Aug: "August",
    Sep: "September", Oct: "October", Nov: "November", Dec: "December",
  };
  if (Array.isArray(weeklyMarketing?.byMonth) && weeklyMarketing.byMonth.length > 0) {
    const wmByLong = new Map<string, { gross: number; net: number }>();
    for (const m of weeklyMarketing.byMonth) {
      wmByLong.set(m.month, { gross: m.grossLead, net: m.netLead });
    }
    const nowM = new Date().getMonth(); // 0=Jan
    const newlyAdded: string[] = [];
    for (let i = 0; i < MONTH_SHORT.length; i++) {
      if (i > nowM) break; // don't include future months
      const mk = MONTH_SHORT[i];
      const wk = wmByLong.get(SHORT_TO_LONG[mk]);
      if (!wk || wk.gross <= 0) continue;
      const salesGross = salesMonthly.gross_leads[mk] ?? 0;
      const salesNet = salesMonthly.net_leads[mk] ?? 0;
      // Add month if missing
      if (!activeMonths.includes(mk)) {
        activeMonths.push(mk);
        newlyAdded.push(mk);
      }
      // Override with weekly numbers when sales is empty/lower
      if (wk.gross > salesGross) salesMonthly.gross_leads[mk] = wk.gross;
      if (wk.net > salesNet) salesMonthly.net_leads[mk] = wk.net;
    }
    // For any newly-added month, parse the rest of the metrics from Sales tab
    // (some will be 0/null but those are real "no data yet" signals).
    for (const mk of newlyAdded) {
      const colIdx = MONTH_SHORT.indexOf(mk);
      if (colIdx < 0 || colIdx >= SALES_MONTH_COLS.length) continue;
      const col = SALES_MONTH_COLS[colIdx];
      for (const mapping of metricMapping) {
        // Skip leads since we already overrode them above
        if (mapping.key === "gross_leads" || mapping.key === "net_leads") continue;
        const row = findMetricRow(mapping.rowName);
        if (!row) continue;
        salesMonthly[mapping.key][mk] = mapping.parser(row[col]);
      }
    }
    if (newlyAdded.length > 0) {
      console.log(`[sheets] Phase 6.1: added months from Weekly Marketing: ${newlyAdded.join(",")}`);
    }
  }

  // Re-sort activeMonths in calendar order
  activeMonths.sort((a, b) => MONTH_SHORT.indexOf(a) - MONTH_SHORT.indexOf(b));

  // Recalculate profit per deal using Revenue Tracker actuals
  for (const mk of activeMonths) {
    const rev = salesMonthly.revenue[mk] ?? 0;
    const deals = salesMonthly.closed_deals[mk] ?? 0;
    if (deals > 0 && rev > 0) {
      salesMonthly.profit_per_deal[mk] = Math.round(rev / deals);
    }
  }

  // YTD calculations
  const sum = (obj: Record<string, number | null>) =>
    Object.values(obj).reduce((s, v) => s + (v ?? 0), 0);

  // YTD lead counts: prefer Marketing 2026 KPIs TOTALS row (the authoritative
  // marketing source-of-truth), then fall back to Weekly Marketing tab, then
  // finally to Sales 2026 KPIs (which is known to undercount).
  // We compute mktg + weekly totals later in the function, so we patch ytd
  // post-hoc once those are available.
  const ytd: any = {
    revenue: sum(salesMonthly.revenue),
    contracts: sum(salesMonthly.contracts),
    closed_deals: sum(salesMonthly.closed_deals),
    marketing_spend: sum(salesMonthly.marketing_spend),
    gross_leads: sum(salesMonthly.gross_leads),
    net_leads: sum(salesMonthly.net_leads),
    appts_set: sum(salesMonthly.appts_set),
    appts_executed: sum(salesMonthly.appts_executed),
    // Source provenance for transparency
    _leadSource: "sales_kpis_fallback" as string,
  };

  const profitValues = Object.values(salesMonthly.profit_per_deal).filter(
    (v) => v !== null && v !== 0
  ) as number[];
  const avgProfitPerDeal = profitValues.length > 0
    ? Math.round(profitValues.reduce((a, b) => a + b, 0) / profitValues.length)
    : 0;

  // Quarterly
  const sumForMonths = (obj: Record<string, number | null>, months: string[]) =>
    months.reduce((s, m) => s + (obj[m] ?? 0), 0);

  const q1Months = activeMonths.filter((m) => ["Jan", "Feb", "Mar"].includes(m));
  const q2Months = activeMonths.filter((m) => ["Apr", "May", "Jun"].includes(m));
  const q3Months = activeMonths.filter((m) => ["Jul", "Aug", "Sep"].includes(m));
  const q4Months = activeMonths.filter((m) => ["Oct", "Nov", "Dec"].includes(m));

  const buildQuarter = (months: string[]) => ({
    revenue: sumForMonths(salesMonthly.revenue, months),
    contracts: sumForMonths(salesMonthly.contracts, months),
    closed_deals: sumForMonths(salesMonthly.closed_deals, months),
    gross_leads: sumForMonths(salesMonthly.gross_leads, months),
    net_leads: sumForMonths(salesMonthly.net_leads, months),
    marketing_spend: sumForMonths(salesMonthly.marketing_spend, months),
    appts_set: sumForMonths(salesMonthly.appts_set, months),
    appts_executed: sumForMonths(salesMonthly.appts_executed, months),
  });

  const quarterly = {
    Q1: buildQuarter(q1Months),
    Q2: buildQuarter(q2Months),
    Q3: buildQuarter(q3Months),
    Q4: buildQuarter(q4Months),
  };

  // ================================================================
  // 3. LEAD MANAGERS — Per-person monthly data from Sales KPIs
  // ================================================================
  // The Sales KPIs sheet has sections for each lead manager starting with "Lead Manager - X"
  // followed by: Net Leads Assigned, Appts Set, Net Lead/Appt Set Ratio, Contracted Appts, Conversion Rate

  interface LeadManagerData {
    net_leads: Record<string, number>;
    appts_set: Record<string, number>;
    ratio: Record<string, number | null>;
    contracted: Record<string, number>;
    conversion: Record<string, number | null>;
  }

  const leadManagers: Record<string, LeadManagerData> = {};
  let currentLM: string | null = null;

  for (const row of salesKpis.rows) {
    const metric = (row["KPIs (Q2 Targets)"] || "").trim();

    if (metric.startsWith("Lead Manager -")) {
      const name = metric.replace("Lead Manager -", "").trim();
      if (name) {
        currentLM = name;
        leadManagers[name] = {
          net_leads: {}, appts_set: {}, ratio: {}, contracted: {}, conversion: {},
        };
      }
      continue;
    }

    // Reset context when we hit AQ Agent section
    if (metric.startsWith("AQ Agent -")) { currentLM = null; continue; }

    if (currentLM && leadManagers[currentLM]) {
      const lm = leadManagers[currentLM];
      // The data here uses the WEEKLY column layout but the JUN and NOV columns
      // contain monthly totals ("Jan Totals", "Feb Totals")
      // For proper monthly totals, use the JUN column for Jan total, NOV for Feb total
      // But actually the individual week columns map to the calendar months
      // Let's parse the total columns: JUN = "Jan Totals", NOV = "Feb Totals"
      // And DEC column for March data

      for (let i = 0; i < SALES_MONTH_COLS.length; i++) {
        const col = SALES_MONTH_COLS[i];
        const val = row[col] || "";
        const mk = MONTH_SHORT[i];
        if (!val.trim() || val.includes("Totals") || val.includes("Week")) continue;

        if (metric === "Net Leads Assigned") lm.net_leads[mk] = parseInt2(val);
        else if (metric === "Appts Set") lm.appts_set[mk] = parseInt2(val);
        else if (metric === "Net Lead/Appt Set Ratio") lm.ratio[mk] = parsePct(val);
        else if (metric === "Contracted Appts") lm.contracted[mk] = parseInt2(val);
        else if (metric === "Conversion Rate") lm.conversion[mk] = parsePct(val);
      }
    }
  }

  // ================================================================
  // 4. AQ AGENTS — Per-person monthly data from Sales KPIs
  // ================================================================
  interface AqAgentData {
    appts_executed: Record<string, number>;
    contracts: Record<string, number>;
    conversion: Record<string, number | null>;
    dropped_contracts: Record<string, number>;
  }

  const aqAgents: Record<string, AqAgentData> = {};
  let currentAQ: string | null = null;

  for (const row of salesKpis.rows) {
    const metric = (row["KPIs (Q2 Targets)"] || "").trim();

    if (metric.startsWith("AQ Agent -")) {
      const name = metric.replace("AQ Agent -", "").trim();
      if (name) {
        currentAQ = name;
        aqAgents[name] = {
          appts_executed: {}, contracts: {}, conversion: {}, dropped_contracts: {},
        };
      }
      continue;
    }

    if (metric.startsWith("Lead Manager -")) { currentAQ = null; continue; }

    if (currentAQ && aqAgents[currentAQ]) {
      const aq = aqAgents[currentAQ];
      for (let i = 0; i < SALES_MONTH_COLS.length; i++) {
        const col = SALES_MONTH_COLS[i];
        const val = row[col] || "";
        const mk = MONTH_SHORT[i];
        if (!val.trim() || val.includes("Totals") || val.includes("Week") ||
            val.includes("Flex") || val === "A" || val === "B" || val.includes("Fill in")) continue;

        if (metric === "Appts Executed") aq.appts_executed[mk] = parseInt2(val);
        else if (metric === "Contracts") aq.contracts[mk] = parseInt2(val);
        else if (metric === "Conversion Rate") aq.conversion[mk] = parsePct(val);
        else if (metric === "Dropped Contracts") aq.dropped_contracts[mk] = parseInt2(val);
      }
    }
  }

  // ================================================================
  // 4b. RISE WEEKLY METRICS — From Sales Stoplight Report
  //     Weekly targets & actuals for Lead Managers and AQ Agents
  // ================================================================
  const riseQ2Sheet = sheets.riseQ2 || { headers: [], rows: [], rowCount: 0 };
  const riseQ1Sheet = sheets.riseQ1 || { headers: [], rows: [], rowCount: 0 };

  interface RiseMetric {
    metric: string;
    target: number | string;
    weeklyActuals: Record<string, number | string>; // week label → value
  }
  interface RisePersonData {
    metrics: RiseMetric[];
    role: "Lead Manager" | "AQ Agent";
  }

  function parseRiseSheet(sheet: SheetResponse): {
    people: Record<string, RisePersonData>;
    leadership: { livesImpacted: { owner: string; target: number; status: string }; profitPerDeal: { owner: string; target: string; status: string } };
    weekLabels: string[];
  } {
    const people: Record<string, RisePersonData> = {};
    const weekLabels: string[] = [];
    let leadership = {
      livesImpacted: { owner: "Jordan", target: 0, status: "" },
      profitPerDeal: { owner: "Trey", target: "", status: "" },
    };

    // Parse leadership rows first (rows 3 and 6 in RISE sheets)
    for (const row of sheet.rows) {
      const owner = (row["OWNER"] || "").trim();
      const purpose = (row["PURPOSE"] || "").trim().toLowerCase();
      const target = (row["TARGET"] || "").trim();
      const status = (row["Below Target "] || row["Below Target"] || "").trim();

      if (purpose.includes("lives positively impacted")) {
        leadership.livesImpacted = { owner: owner || "Jordan", target: parseInt2(target), status };
      }
      if (purpose.includes("profit per deal")) {
        leadership.profitPerDeal = { owner: owner || "Trey", target, status };
      }
    }

    // Parse weekly performance metrics section
    // In the RISE sheet, each person has multiple rows with the same OWNER name.
    // The OWNER field appears on EVERY row for that person (not just the first).
    // Lead Managers: Jeff H, Brandon, Jonathan
    // AQ Agents: Korbin, Ryan, TJ
    const lmNames = ["jeff h", "brandon", "jonathan"];
    const aqNames = ["korbin", "ryan", "tj"];

    let weeklySection = false;
    for (const row of sheet.rows) {
      const purpose = (row["PURPOSE"] || "").trim();
      if (purpose === "WEEKLY PERFORMANCE METRICS" || purpose.includes("WEEKLY PERFORMANCE")) {
        weeklySection = true;
        continue;
      }
      if (!weeklySection) continue;

      const owner = (row["OWNER"] || "").trim();
      const ownerLower = owner.toLowerCase();
      const metric = (row["PURPOSE"] || "").trim();
      const target = (row["TARGET"] || "").trim();
      // Get the latest week value from Q2 or Q1 column
      const q2Val = (row["Q2"] || row["Q1"] || "").trim();

      // Skip empty/header rows
      if (!owner || !metric || ownerLower === "owner") continue;
      // Skip sub-header rows
      if (metric === "Reporting Date" || metric.startsWith("Weekly")) continue;

      // Match owner to known LM/AQ names
      const matchedLM = lmNames.find(n => ownerLower.startsWith(n));
      const matchedAQ = aqNames.find(n => ownerLower.startsWith(n));
      if (!matchedLM && !matchedAQ) continue;

      // Normalize the owner name (remove trailing spaces)
      const normalOwner = owner.trim();
      const personKey = normalOwner.replace(/\s+$/, "");
      const role: "Lead Manager" | "AQ Agent" = matchedLM ? "Lead Manager" : "AQ Agent";

      if (!people[personKey]) {
        people[personKey] = { metrics: [], role };
      }

      if (metric) {
        people[personKey].metrics.push({
          metric,
          target: target.includes("%") ? target : (parseFloat(target.replace(/[$,]/g, "")) || target),
          weeklyActuals: q2Val ? { latest: q2Val } : {},
        });
      }
    }

    return { people, leadership, weekLabels };
  }

  const riseQ2 = parseRiseSheet(riseQ2Sheet);
  const riseQ1 = parseRiseSheet(riseQ1Sheet);

  // Build structured RISE data per Lead Manager
  interface RiseWeeklyPerson {
    appts_scheduled: { actual: number; target: number };
    appts_from_old_leads: { actual: number; target: number };
    appts_cancelled: { actual: number; target: number };
    talk_time_hrs: { actual: number; target: number };
    touch_points_new: { actual: number; target: number };
    touch_points_hot: { actual: number; target: number };
    touch_points_followup: { actual: number; target: number };
  }
  interface RiseWeeklyAQ {
    appts_executed: { actual: number; target: number };
    offers_made: { actual: number; target: number };
    contracts: { actual: number; target: number };
    touch_points: { actual: number; target: number };
    content_video: { actual: number; target: number };
    matterports_missed: { actual: number; target: number };
  }

  function extractLMRise(personData: RisePersonData | undefined): RiseWeeklyPerson {
    const def = { actual: 0, target: 0 };
    if (!personData) return {
      appts_scheduled: def, appts_from_old_leads: def, appts_cancelled: def,
      talk_time_hrs: def, touch_points_new: def, touch_points_hot: def, touch_points_followup: def,
    };
    const find = (substr: string) => personData.metrics.find(m => m.metric.toLowerCase().includes(substr));
    const val = (m: RiseMetric | undefined) => {
      if (!m) return 0;
      const v = Object.values(m.weeklyActuals)[0];
      return typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, "")) || 0;
    };
    const tgt = (m: RiseMetric | undefined) => {
      if (!m) return 0;
      return typeof m.target === "number" ? m.target : parseFloat(String(m.target).replace(/[$,%]/g, "")) || 0;
    };
    return {
      appts_scheduled:      { actual: val(find("appointments scheduled")),           target: tgt(find("appointments scheduled")) },
      appts_from_old_leads: { actual: val(find("leads older than 30")),               target: tgt(find("leads older than 30")) },
      appts_cancelled:      { actual: val(find("appointments cancelled")),            target: tgt(find("appointments cancelled")) },
      talk_time_hrs:        { actual: val(find("talk time")),                          target: tgt(find("talk time")) },
      touch_points_new:     { actual: val(find("new lead action")),                    target: tgt(find("new lead action")) },
      touch_points_hot:     { actual: val(find("hot, warm")),                          target: tgt(find("hot, warm")) },
      touch_points_followup:{ actual: val(find("fortune in the follow")),              target: tgt(find("fortune in the follow")) },
    };
  }

  function extractAQRise(personData: RisePersonData | undefined): RiseWeeklyAQ {
    const def = { actual: 0, target: 0 };
    if (!personData) return {
      appts_executed: def, offers_made: def, contracts: def,
      touch_points: def, content_video: def, matterports_missed: def,
    };
    const find = (substr: string) => personData.metrics.find(m => m.metric.toLowerCase().includes(substr));
    const val = (m: RiseMetric | undefined) => {
      if (!m) return 0;
      const v = Object.values(m.weeklyActuals)[0];
      return typeof v === "number" ? v : parseFloat(String(v).replace(/[$,%]/g, "")) || 0;
    };
    const tgt = (m: RiseMetric | undefined) => {
      if (!m) return 0;
      return typeof m.target === "number" ? m.target : parseFloat(String(m.target).replace(/[$,%]/g, "")) || 0;
    };
    return {
      appts_executed:     { actual: val(find("appointments executed")),  target: tgt(find("appointments executed")) },
      offers_made:        { actual: val(find("offers made")),            target: tgt(find("offers made")) },
      contracts:          { actual: val(find("contracts")),              target: tgt(find("contracts")) },
      touch_points:       { actual: val(find("touch points")),           target: tgt(find("touch points")) },
      content_video:      { actual: val(find("content video")),          target: tgt(find("content video")) },
      matterports_missed: { actual: val(find("matterports")),            target: tgt(find("matterports")) },
    };
  }

  // Build per-person RISE objects from Q2 data (latest week)
  const riseLeadManagers: Record<string, RiseWeeklyPerson> = {};
  const riseAqAgents: Record<string, RiseWeeklyAQ> = {};
  for (const [name, data] of Object.entries(riseQ2.people)) {
    if (data.role === "Lead Manager") riseLeadManagers[name] = extractLMRise(data);
    else riseAqAgents[name] = extractAQRise(data);
  }

  // Q1 RISE (for historical comparison)
  const riseQ1LeadManagers: Record<string, RiseWeeklyPerson> = {};
  const riseQ1AqAgents: Record<string, RiseWeeklyAQ> = {};
  for (const [name, data] of Object.entries(riseQ1.people)) {
    if (data.role === "Lead Manager") riseQ1LeadManagers[name] = extractLMRise(data);
    else riseQ1AqAgents[name] = extractAQRise(data);
  }

  console.log(`[sheets] RISE Q2: ${Object.keys(riseLeadManagers).length} LMs, ${Object.keys(riseAqAgents).length} AQs`);
  console.log(`[sheets] RISE Q1: ${Object.keys(riseQ1LeadManagers).length} LMs, ${Object.keys(riseQ1AqAgents).length} AQs`);
  console.log(`[sheets] Leadership RISE: Lives target=${riseQ2.leadership.livesImpacted.target}, ProfitPerDeal target=${riseQ2.leadership.profitPerDeal.target}`);

  // ================================================================
  // 5. MARKETING CHANNELS
  // ================================================================
  const mktg = sheets.mktg || { headers: [], rows: [], rowCount: 0 };
  const channelRows = mktg.rows.filter((r) => {
    const lf = String(r["Lead Funnels"] || "").trim();
    if (!lf) return false;
    // Skip any TOTALS-style row (e.g. "TOTALS - Marketing")
    if (lf.toUpperCase().startsWith("TOTAL")) return false;
    return r["ID"] && parseInt2(r["ID"]) > 0 && parseInt2(r["ID"]) <= 10;
  });
  const marketingChannels = channelRows.map((r) => ({
    name: r["Lead Funnels"],
    spend: parseMoney(r["Cost"]),
    gross_leads: parseInt2(r["Gross Leads"]),
    net_leads: parseInt2(r["Net Leads"]),
    deals: parseInt2(r["Deals"]),
    conversion: parsePct(r["Conversion Rate %"]) ?? 0,
    cost_per_deal: parseMoney(r["Cost Per Deal"]),
    revenue: parseMoney(r["Estimated Revenue"]),
    roas: r["ROAS"] ? parseFloat(r["ROAS"].replace("%", "").replace(/,/g, "")) / 100 : null,
  }));
  // Marketing TOTALS row — match anything starting with "TOTAL" (e.g. "TOTALS - Marketing ")
  const totalsRow = mktg.rows.find((r) => {
    const lf = String(r["Lead Funnels"] || "").trim().toUpperCase();
    return lf.startsWith("TOTAL");
  });
  // Sum from per-channel rows. Always preferred when non-zero — the TOTALS row
  // sometimes carries blank/zero derived fields even when individual channel
  // rows have valid data.
  const sumSpend = marketingChannels.reduce((s, c) => s + (c.spend || 0), 0);
  const sumGross = marketingChannels.reduce((s, c) => s + (c.gross_leads || 0), 0);
  const sumNet   = marketingChannels.reduce((s, c) => s + (c.net_leads   || 0), 0);
  const sumDeals = marketingChannels.reduce((s, c) => s + (c.deals      || 0), 0);
  const sumRev   = marketingChannels.reduce((s, c) => s + (c.revenue    || 0), 0);

  const marketingTotals = {
    spend:        sumSpend > 0 ? sumSpend : (totalsRow ? parseMoney(totalsRow["Cost"])              : 0),
    gross_leads:  sumGross > 0 ? sumGross : (totalsRow ? parseInt2(totalsRow["Gross Leads"])         : 0),
    net_leads:    sumNet   > 0 ? sumNet   : (totalsRow ? parseInt2(totalsRow["Net Leads"])           : 0),
    deals:        sumDeals > 0 ? sumDeals : (totalsRow ? parseInt2(totalsRow["Deals"])               : 0),
    revenue:      sumRev   > 0 ? sumRev   : (totalsRow ? parseMoney(totalsRow["Estimated Revenue"])  : 0),
    conversion: 0 as number,    // computed below
    cost_per_deal: 0 as number, // computed below
    roas: 0 as number,          // computed below
  };
  // Derive blended conversion / cost-per-deal / ROAS from the totals we just
  // built. Recomputing avoids the bug where the TOTALS row in the sheet had
  // empty Conversion% and Cost/Deal cells, which previously made the dashboard
  // show 0.0% and $0 even though there were 67 deals on $409K spend.
  marketingTotals.conversion = marketingTotals.net_leads > 0
    ? marketingTotals.deals / marketingTotals.net_leads
    : (totalsRow ? (parsePct(totalsRow["Conversion Rate %"]) ?? 0) : 0);
  marketingTotals.cost_per_deal = marketingTotals.deals > 0
    ? marketingTotals.spend / marketingTotals.deals
    : (totalsRow ? parseMoney(totalsRow["Cost Per Deal"]) : 0);
  marketingTotals.roas = marketingTotals.spend > 0
    ? Math.round((marketingTotals.revenue / marketingTotals.spend) * 100) / 100
    : 0;
  console.log(
    `[sheets] marketingTotals: spend=$${marketingTotals.spend.toLocaleString()} `
    + `net=${marketingTotals.net_leads} deals=${marketingTotals.deals} `
    + `conv=${(marketingTotals.conversion*100).toFixed(1)}% `
    + `cost/deal=$${marketingTotals.cost_per_deal.toFixed(0)} roas=${marketingTotals.roas}x`
  );

  // ================================================================
  // YTD lead-count alignment (Phase 6 audit fix)
  // ----------------------------------------------------------------
  // The Sales 2026 KPIs tab is known to undercount leads (it omits
  // sources that don't roll up there). The Marketing 2026 KPIs TOTALS
  // row is the authoritative source of truth — fall back to the
  // Weekly Marketing tab if marketing totals are unavailable.
  // ================================================================
  const mktTotalGross = marketingTotals.gross_leads || 0;
  const mktTotalNet = marketingTotals.net_leads || 0;
  const wkTotalGross = weeklyMarketing?.totals?.grossLead || 0;
  const wkTotalNet = weeklyMarketing?.totals?.netLead || 0;

  if (mktTotalGross > ytd.gross_leads) {
    ytd.gross_leads = mktTotalGross;
    ytd.net_leads = mktTotalNet;
    ytd._leadSource = "marketing_2026_kpis_totals";
  } else if (wkTotalGross > ytd.gross_leads) {
    ytd.gross_leads = wkTotalGross;
    ytd.net_leads = wkTotalNet;
    ytd._leadSource = "weekly_marketing_tab";
  }
  console.log(
    `[sheets] ytd lead source: ${ytd._leadSource}, gross=${ytd.gross_leads}, net=${ytd.net_leads} ` +
    `(sales=${sum(salesMonthly.gross_leads)}/${sum(salesMonthly.net_leads)}, ` +
    `mktTotals=${mktTotalGross}/${mktTotalNet}, weekly=${wkTotalGross}/${wkTotalNet})`
  );

  // Patch quarterly lead counts using Weekly Marketing byMonth aggregation,
  // which is the granular ground-truth split per month (Sales tab undercounts).
  if (Array.isArray(weeklyMarketing?.byMonth) && weeklyMarketing.byMonth.length > 0) {
    const monthLookup = new Map<string, { gross: number; net: number }>();
    for (const m of weeklyMarketing.byMonth) {
      // weeklyMarketing.byMonth.month is short month name ("Jan", "Feb", ...)
      monthLookup.set(m.month, { gross: m.grossLead, net: m.netLead });
    }
    const sumQuarter = (months: string[]) => {
      let g = 0, n = 0;
      for (const m of months) {
        const v = monthLookup.get(m);
        if (v) { g += v.gross; n += v.net; }
      }
      return { g, n };
    };
    const patchQ = (q: { gross_leads: number; net_leads: number }, months: string[]) => {
      const wk = sumQuarter(months);
      if (wk.g > q.gross_leads) {
        q.gross_leads = wk.g;
        q.net_leads = wk.n;
      }
    };
    patchQ(quarterly.Q1, q1Months);
    patchQ(quarterly.Q2, q2Months);
    patchQ(quarterly.Q3, q3Months);
    patchQ(quarterly.Q4, q4Months);
    console.log(
      `[sheets] quarterly leads after weekly-marketing patch: ` +
      `Q1=${quarterly.Q1.gross_leads}/${quarterly.Q1.net_leads}, ` +
      `Q2=${quarterly.Q2.gross_leads}/${quarterly.Q2.net_leads}, ` +
      `Q3=${quarterly.Q3.gross_leads}/${quarterly.Q3.net_leads}, ` +
      `Q4=${quarterly.Q4.gross_leads}/${quarterly.Q4.net_leads}`
    );
  }

  // ================================================================
  // 6. TOP 10 DEALS
  // ================================================================
  const dealsSheet = sheets.deals || { headers: [], rows: [], rowCount: 0 };
  const topDeals = dealsSheet.rows
    .filter((r) => r["Street Address"] && r["Profit"] && parseMoney(r["Profit"]) > 0)
    .map((r) => ({
      address: `${r["Street Address"]}, ${r["City"]}`,
      profit: parseMoney(r["Profit"]),
    }))
    .sort((a, b) => b.profit - a.profit)
    .slice(0, 10);

  // ================================================================
  // 7. NEW BUYER KPIs
  // ================================================================
  const buyerSheet = sheets.buyers || { headers: [], rows: [], rowCount: 0 };
  const buyerSources = buyerSheet.rows
    .filter((r) => r["ID"] && parseInt2(r["ID"]) > 0 && parseInt2(r["ID"]) <= 10 && r["Source"])
    .map((r) => ({
      name: r["Source"], buyers: parseInt2(r["Buyers"]),
      qualified: parseInt2(r["Qualified Buyers"]), deals: parseInt2(r["Deals Purchased"]),
    }));
  const buyerTotalsRow = buyerSheet.rows.find(
    (r) => r["Source"] === "TOTALS" || r["Source"] === "Totals"
  );
  const newBuyers = {
    sources: buyerSources,
    totals: {
      buyers: buyerTotalsRow ? parseInt2(buyerTotalsRow["Buyers"]) : buyerSources.reduce((s, b) => s + b.buyers, 0),
      qualified: buyerTotalsRow ? parseInt2(buyerTotalsRow["Qualified Buyers"]) : buyerSources.reduce((s, b) => s + b.qualified, 0),
      deals: buyerTotalsRow ? parseInt2(buyerTotalsRow["Deals Purchased"]) : buyerSources.reduce((s, b) => s + b.deals, 0),
    },
    monthly: {} as Record<string, { buyers: number; qualified: number }>,
  };

  // ================================================================
  // 8. TC TRACKER — Capacity + Transactions
  // ================================================================
  const capSheet = sheets.capacity || { headers: [], rows: [], rowCount: 0 };
  // Pre-compute actual active file counts per TC from Transactions sheet
  // (Capacity Oversight may have stale formulas for newly added rows)
  const txSheetRaw = sheets.tx || { headers: [], rows: [], rowCount: 0 };
  const txRowsRaw = txSheetRaw.rows.filter(
    (r) => r["Property Address"] && r["Property Address"].trim() !== ""
  );
  const actualActivePerTC: Record<string, number> = {};
  for (const r of txRowsRaw) {
    const tc = (r["TC Assigned"] || "").trim();
    const status = (r["Status"] || "").trim();
    const stage = (r["Stage"] || "").trim();
    if (tc && status !== "Closed" && status !== "Terminated" && stage !== "Terminated") {
      actualActivePerTC[tc] = (actualActivePerTC[tc] || 0) + 1;
    }
  }

  const tcTeam = capSheet.rows
    .filter((r) => r["TC Name"] && r["TC Name"].trim())
    .map((r) => {
      const name = r["TC Name"].trim();
      const capActive = parseInt2(r["Active Files"]);
      // Use the higher of Capacity sheet vs actual Transactions count
      const actualActive = actualActivePerTC[name] ?? capActive;
      const activeFiles = Math.max(capActive, actualActive);
      return {
        name,
        role: name === "Kalyn" ? "TC Manager" : "Senior TC",
        active_files: activeFiles,
        workload_points: parseFloat2(r["Active Workload Points"]),
        capacity: parseInt2(r["Weekly Point Capacity"]),
        utilization: parsePct(r["Utilization %"]) ?? 0,
        status: r["Capacity Status"] as "OVERLOADED" | "UNDERUTILIZED" | "OPTIMAL",
      };
    });

  const txSheet = sheets.tx || { headers: [], rows: [], rowCount: 0 };
  const txRows = txSheet.rows.filter(
    (r) => r["Property Address"] && r["Property Address"].trim() !== ""
  );

  // Active rows = not Closed and not Terminated (by Status OR Stage)
  const activeTxRows = txRows.filter(
    (r) => r["Status"] !== "Closed" && r["Status"] !== "Terminated" &&
      (r["Stage"] || "").trim() !== "Terminated"
  );

  const stageCount: Record<string, number> = {};
  for (const r of activeTxRows) {
    const stage = r["Stage"] || "Unknown";
    stageCount[stage] = (stageCount[stage] || 0) + 1;
  }
  const pipeline = Object.entries(stageCount)
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count);

  // Use activeTxRows (already filters out Closed, Terminated by Status and Stage)
  const activeFiles = activeTxRows.length;

  // Actual closed revenue and contracts from Transactions sheet
  const closedTx = txRows.filter((r) => r["Status"] === "Closed");
  const revenueClosed = closedTx.reduce((s, r) => s + parseMoney(r["Projected Revenue"]), 0);
  const contractsClosed = closedTx.length;

  // Revenue at risk
  const revenueAtRisk = txRows
    .filter((r) => r["Status"] !== "Closed" && r["Status"] !== "Terminated")
    .reduce((s, r) => s + parseMoney(r["Revenue at Risk"]), 0);

  // Total pipeline revenue (active deals)
  const pipelineRevenue = txRows
    .filter((r) => r["Status"] !== "Closed" && r["Status"] !== "Terminated")
    .reduce((s, r) => s + parseMoney(r["Projected Revenue"]), 0);

  // Revenue clear to close
  const revenueClearToClose = txRows
    .filter((r) => (r["Stage"] || "").toLowerCase().includes("clear to close") && r["Status"] !== "Closed" && r["Status"] !== "Terminated")
    .reduce((s, r) => s + parseMoney(r["Projected Revenue"]), 0);

  // Per-TC breakdown (enhanced)
  const tcBreakdown: Record<string, {
    active: number; closed: number; revenue: number; at_risk: number;
    workload_points: number; escalations: number; delays: number;
    stages: Record<string, number>; complexity: Record<string, number>;
  }> = {};
  for (const r of txRows) {
    const tc = (r["TC Assigned"] || "").trim();
    if (!tc) continue;
    if (!tcBreakdown[tc]) tcBreakdown[tc] = {
      active: 0, closed: 0, revenue: 0, at_risk: 0,
      workload_points: 0, escalations: 0, delays: 0,
      stages: {}, complexity: {},
    };
    if (r["Status"] === "Closed") {
      tcBreakdown[tc].closed++;
      tcBreakdown[tc].revenue += parseMoney(r["Projected Revenue"]);
    } else if (r["Status"] !== "Terminated") {
      tcBreakdown[tc].active++;
      tcBreakdown[tc].at_risk += parseMoney(r["Revenue at Risk"]);
      tcBreakdown[tc].workload_points += parseFloat2(r["Workload Points"]);
      const stage = r["Stage"] || "Unknown";
      tcBreakdown[tc].stages[stage] = (tcBreakdown[tc].stages[stage] || 0) + 1;
      const complexity = r["Complexity"] || "Unknown";
      tcBreakdown[tc].complexity[complexity] = (tcBreakdown[tc].complexity[complexity] || 0) + 1;
      const escVal = (r["Escalation"] || "").trim().toLowerCase();
      if (escVal === "yes" || escVal === "y") tcBreakdown[tc].escalations++;
      const delayVal = (r["Delay"] || "").trim().toLowerCase();
      if (delayVal === "yes" || delayVal === "y") tcBreakdown[tc].delays++;
    }
  }

  // Termination rate
  const terminatedCount = txRows.filter((r) => r["Status"] === "Terminated").length;
  const onHoldCount = txRows.filter((r) => r["Status"] === "On Hold").length;

  // ── NEW: Complexity Breakdown (active deals only) ──
  const complexityCount: Record<string, number> = {};
  for (const r of activeTxRows) {
    const c = (r["Complexity"] || "Unknown").trim();
    if (c) complexityCount[c] = (complexityCount[c] || 0) + 1;
  }
  const complexityBreakdown = Object.entries(complexityCount)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // ── NEW: Transaction Type Distribution (active deals only) ──
  const txTypeCount: Record<string, number> = {};
  for (const r of activeTxRows) {
    const t = (r["Transaction Type"] || "Unknown").trim();
    if (t) txTypeCount[t] = (txTypeCount[t] || 0) + 1;
  }
  const transactionTypes = Object.entries(txTypeCount)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // ── Helper: get days in pipeline, computing from contract date if blank ──
  function getDaysInPipeline(r: SheetRow): number {
    const raw = (r["Days in Pipeline"] || "").trim();
    if (raw) return parseInt2(raw);
    // Compute from contract date if available
    const cd = (r["Contract Date"] || "").trim();
    if (!cd) return 0;
    try {
      const contractDate = new Date(cd);
      if (isNaN(contractDate.getTime())) return 0;
      const now = new Date();
      return Math.max(0, Math.round((now.getTime() - contractDate.getTime()) / (1000 * 60 * 60 * 24)));
    } catch { return 0; }
  }

  // ── NEW: Age Buckets (active deals only) ──
  const ageBucketCount: Record<string, number> = { "0-30": 0, "31-45": 0, "46-60": 0, "61+": 0 };
  for (const r of activeTxRows) {
    const days = getDaysInPipeline(r);
    if (days <= 30) ageBucketCount["0-30"]++;
    else if (days <= 45) ageBucketCount["31-45"]++;
    else if (days <= 60) ageBucketCount["46-60"]++;
    else ageBucketCount["61+"]++;
  }
  const ageBuckets = [
    { range: "0-30 days", count: ageBucketCount["0-30"] },
    { range: "31-45 days", count: ageBucketCount["31-45"] },
    { range: "46-60 days", count: ageBucketCount["46-60"] },
    { range: "61+ days", count: ageBucketCount["61+"] },
  ];

  // ── NEW: Avg Days in Pipeline (active deals only) ──
  const activeDays = activeTxRows.map((r) => getDaysInPipeline(r)).filter((d) => d > 0);
  const avgDaysInPipeline = activeDays.length > 0
    ? Math.round(activeDays.reduce((s, d) => s + d, 0) / activeDays.length)
    : 0;

  // ── NEW: Escalations & Delays (active deals only) ──
  const activeEscalations = activeTxRows.filter((r) => { const v = (r["Escalation"] || "").trim().toLowerCase(); return v === "yes" || v === "y"; }).length;
  const activeDelays = activeTxRows.filter((r) => { const v = (r["Delay"] || "").trim().toLowerCase(); return v === "yes" || v === "y"; }).length;
  const activePastTarget = activeTxRows.filter((r) => { const v = (r["Past Target "] || r["Past Target"] || "").trim().toLowerCase(); return v === "yes" || v === "y" || v === "true"; }).length;

  // ── NEW: Title Issues (active deals only) ──
  const titleIssueCount = activeTxRows.filter((r) => {
    const ts = (r["Title Status"] || "").trim().toLowerCase();
    return ts && ts !== "clean" && ts !== "clear" && ts !== "received" && ts !== "n/a" && ts !== "";
  }).length;
  const titleIssueRate = activeTxRows.length > 0 ? titleIssueCount / activeTxRows.length : 0;

  // ── NEW: Active 46+ day files ──
  const active46PlusDays = activeTxRows.filter((r) => getDaysInPipeline(r) >= 46).length;
  const pctActivePastTarget = activeTxRows.length > 0 ? activePastTarget / activeTxRows.length : 0;

  // ── NEW: Delay Reasons (for active delayed deals) ──
  const delayReasons: Record<string, number> = {};
  for (const r of activeTxRows) {
    const dv = (r["Delay"] || "").trim().toLowerCase();
    if (dv === "yes" || dv === "y") {
      const reason = (r["Delay Reason"] || "Unknown").trim();
      if (reason) delayReasons[reason] = (delayReasons[reason] || 0) + 1;
    }
  }
  const delayReasonList = Object.entries(delayReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ── NEW: Termination Reasons ──
  const termReasons: Record<string, number> = {};
  for (const r of txRows.filter((r) => r["Status"] === "Terminated")) {
    const reason = (r["Term Reason"] || "Unknown").trim();
    if (reason) termReasons[reason] = (termReasons[reason] || 0) + 1;
  }
  const termReasonList = Object.entries(termReasons)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);

  // ── NEW: Deal File Table (all active deals for table display) ──
  const dealFiles = activeTxRows.map((r) => ({
    fileId: (r["File ID"] || "").trim(),
    address: (r["Property Address"] || "").trim(),
    tc: (r["TC Assigned"] || "").trim(),
    type: (r["Transaction Type"] || "").trim(),
    stage: (r["Stage"] || "").trim(),
    status: (r["Status"] || "").trim(),
    complexity: (r["Complexity"] || "").trim(),
    daysInPipeline: getDaysInPipeline(r),
    projectedRevenue: parseMoney(r["Projected Revenue"]),
    revenueAtRisk: parseMoney(r["Revenue at Risk"]),
    hasEscalation: ["yes", "y"].includes((r["Escalation"] || "").trim().toLowerCase()),
    hasDelay: ["yes", "y"].includes((r["Delay"] || "").trim().toLowerCase()),
    titleStatus: (r["Title Status"] || "").trim(),
    pastTarget: ["yes", "y", "true"].includes((r["Past Target "] || r["Past Target"] || "").trim().toLowerCase()),
  })).sort((a, b) => b.daysInPipeline - a.daysInPipeline);

  // ── NEW: Pipeline & Risk Dashboard data ──
  const pipeRisk = sheets.pipeRisk || { headers: [], rows: [], rowCount: 0 };
  let avgDaysToTitle = 0;
  // Try to extract avg days to get title from Pipeline & Risk Dashboard
  for (const r of pipeRisk.rows) {
    const val = parseFloat2(r["Avg Days to Get Title"] || r["Avg Days to Title"] || "");
    if (val > 0) { avgDaysToTitle = Math.round(val); break; }
  }
  // Fallback: compute from Transactions if sheet didn't yield
  if (avgDaysToTitle === 0) {
    const titleDays = txRows
      .map((r) => parseFloat2(r["Days to title received"]))
      .filter((d) => d > 0);
    avgDaysToTitle = titleDays.length > 0
      ? Math.round(titleDays.reduce((s, d) => s + d, 0) / titleDays.length)
      : 0;
  }

  // Avg days to close (for closed deals)
  const closedDays = closedTx
    .map((r) => parseInt2(r["Days in Pipeline"]))
    .filter((d) => d > 0);
  const avgDaysToClose = closedDays.length > 0
    ? Math.round(closedDays.reduce((s, d) => s + d, 0) / closedDays.length)
    : 0;

  const transactions = {
    team: tcTeam,
    tcBreakdown,
    pipeline,
    activeFiles,
    pipelineRevenue,
    revenueAtRisk,
    revenueClearToClose,
    rise_metrics: {
      active_files: { current: activeFiles, target: 36 },
      revenue_closed: { current: revenueClosed, target: 126923 },
      contracts_closed: { current: contractsClosed, target: 5 },
      stuck_deals: {
        current: pipeline.find((p) => p.stage.toLowerCase().includes("stuck") || p.stage.toLowerCase().includes("risk"))?.count ?? onHoldCount,
        target: 2,
      },
    },
    termination_rate: {
      current: terminatedCount / Math.max(txRows.length, 1),
      target: 0.05,
    },
    terminated: terminatedCount,
    onHold: onHoldCount,
    // ── New enriched data ──
    complexityBreakdown,
    transactionTypes,
    ageBuckets,
    avgDaysInPipeline,
    avgDaysToTitle,
    avgDaysToClose,
    activeEscalations,
    activeDelays,
    activePastTarget,
    active46PlusDays,
    titleIssueRate,
    pctActivePastTarget,
    delayReasons: delayReasonList,
    termReasons: termReasonList,
    dealFiles,
    totalDeals: txRows.length,
    closedRevenue: revenueClosed,
  };

  // ================================================================
  // 9. REVENUE TRACKER — Monthly revenue with deal details
  // ================================================================
  // Projected year total
  const projectedYearTotal = revSheet.rows.reduce((max, r) => {
    const deal = (r["Deal"] || "").trim();
    if (deal.includes("Projected Year Total") || deal.includes("Current Deals")) {
      return parseMoney(r[" Gross Revenue "]);
    }
    return max;
  }, 0);

  const projectedRevenue = projectedDeals.reduce((s, d) => s + d.gross, 0);
  // Phase 8: expose Funded (closed + dated <= today) and Assigned (closed + dated > today)
  // and TBD (Unassigned bucket). These power the new Projected tile and stage chips.
  const ytdFundedRevenue = Object.values(revenueActualsFunded).reduce((s, v) => s + v, 0);
  const ytdAssignedRevenue = Object.entries(revenueActuals).reduce((s, [mk, v]) => {
    return s + (v - (revenueActualsFunded[mk] || 0));
  }, 0);
  const ytdListingReferralRevenue = Object.values(listingReferralByMonth).reduce((s, v) => s + v, 0);
  const revenueTracker = {
    monthlyActuals: revenueActuals,                 // gross+TC, all deals with a real close date
    monthlyFundedActuals: revenueActualsFunded,     // closes on/before today
    monthlyClosedDeals: closedDealsByMonth,         // count of deals with real close dates
    monthlyFundedDeals: fundedDealsByMonth,         // count of funded deals (closed on/before today)
    monthlyTcFees: tcFeeActuals,
    monthlyListingReferrals: listingReferralByMonth,
    dealsByMonth,
    perPersonCommissions,
    projectedYearTotal,
    projectedDeals: projectedDeals.map(d => ({ deal: d.deal, gross: d.gross, category: d.category })),
    tbdDeals: tbdDealsBucket,
    projectedRevenue,
    ytdActualRevenue: Object.values(revenueActuals).reduce((s, v) => s + v, 0),
    ytdFundedRevenue,
    ytdAssignedRevenue,
    ytdListingReferralRevenue,
  };

  // ================================================================
  // 10. COMPANY TARGETS & DERIVED METRICS
  // ================================================================
  const company = {
    revenue_target_q2: 1650000,
    profit_margin_target: 0.2,
    cash_conversion_target_days: 60,
    cash_on_hand_days: 20,
    purpose_target: riseQ2.leadership.livesImpacted.target || 264,
    purpose_q1_target: riseQ1.leadership.livesImpacted.target || 144,
    profit_per_deal_target: parseMoney(riseQ2.leadership.profitPerDeal.target) || 25000,
    annual_revenue_goal: 6000000,
    // RISE leadership data
    riseLeadership: {
      livesImpacted: riseQ2.leadership.livesImpacted,
      profitPerDeal: riseQ2.leadership.profitPerDeal,
      livesImpactedQ1: riseQ1.leadership.livesImpacted,
      profitPerDealQ1: riseQ1.leadership.profitPerDeal,
    },
  };

  // salesActiveMonths = months with actual Sales KPI data (gross leads or appts > 0)
  // activeMonths may include months with ONLY Revenue Tracker revenue (May-Jul) but no pipeline data
  const salesActiveMonths = activeMonths.filter((m) =>
    (salesMonthly.gross_leads[m] ?? 0) > 0 || (salesMonthly.appts_set[m] ?? 0) > 0
  );
  const latestSalesMonth = salesActiveMonths[salesActiveMonths.length - 1] || "Apr";
  const prevSalesMonth = salesActiveMonths.length > 1 ? salesActiveMonths[salesActiveMonths.length - 2] : latestSalesMonth;

  // Build weekly data from the most recent 2 months WITH sales data
  const recentMonths = salesActiveMonths.slice(-2);
  const latestMonth = latestSalesMonth;
  const prevMonth = prevSalesMonth;

  const companyWeekly = {
    gross_leads: {
      [prevMonth]: salesMonthly.gross_leads[prevMonth] ?? 0,
      [latestMonth]: salesMonthly.gross_leads[latestMonth] ?? 0,
      target: goals.gross_leads,
    },
    net_leads: {
      [prevMonth]: salesMonthly.net_leads[prevMonth] ?? 0,
      [latestMonth]: salesMonthly.net_leads[latestMonth] ?? 0,
      target: goals.net_leads,
    },
    cost_per_appt: {
      [prevMonth]: salesMonthly.cost_per_appt[prevMonth] ?? 0,
      [latestMonth]: salesMonthly.cost_per_appt[latestMonth] ?? 0,
      target: goals.cost_per_appt,
    },
    cost_per_contract: {
      [prevMonth]: (salesMonthly.marketing_spend[prevMonth] ?? 0) / Math.max(salesMonthly.contracts[prevMonth] ?? 1, 1),
      [latestMonth]: (salesMonthly.marketing_spend[latestMonth] ?? 0) / Math.max(salesMonthly.contracts[latestMonth] ?? 1, 1),
      target: 6470,
    },
    appts_scheduled: {
      [prevMonth]: salesMonthly.appts_set[prevMonth] ?? 0,
      [latestMonth]: salesMonthly.appts_set[latestMonth] ?? 0,
      target: goals.appts_set,
    },
    appts_attended: {
      [prevMonth]: salesMonthly.appts_executed[prevMonth] ?? 0,
      [latestMonth]: salesMonthly.appts_executed[latestMonth] ?? 0,
      target: goals.appts_executed,
    },
    revenue_q2_target: 1650000,
    revenue_q2_april: quarterly.Q2.revenue || ytd.revenue * 0.25,
    profit_margin_target: 0.2,
    cash_conversion_actual: 54,
    cash_conversion_target: 60,
  };

  // ================================================================
  // 11. DISPO DATA — From Dispo 2026 KPIs + Revenue Tracker
  //     FILTERED TO 2026 ONLY — sheet contains 2024-2026 data
  // ================================================================
  const dispoSheet = sheets.dispo || { headers: [], rows: [], rowCount: 0 };

  // Helper: determine if a dispo row is a 2026 deal
  // The sheet has "Month Assigned" values like:
  //   "January 2024", "March 2025", "Jan 2026" (with year)
  //   "February", "March", "April" (bare month = 2026, rows after the 2025 section)
  const BARE_MONTHS = ["january","february","march","april","may","june",
    "july","august","september","october","november","december"];

  function isDispo2026(monthAssigned: string): boolean {
    const ma = (monthAssigned || "").trim().toLowerCase();
    if (!ma) return false;
    // Explicitly labeled 2026
    if (ma.includes("2026")) return true;
    // Explicitly labeled with older year → not 2026
    if (/20[0-2][0-5]/.test(ma)) return false;
    // Bare month name (no year) — these are 2026 entries
    if (BARE_MONTHS.includes(ma)) return true;
    return false;
  }

  // Calculate actual dispo metrics from ONLY 2026 deal-level data
  const dispoDeals = dispoSheet.rows.filter(
    (r) => r["g"] && r["g"].trim() && isDispo2026(r["Month Assigned"])
  );
  const dispoByRep: Record<string, {
    deals: number; totalAssignment: number; totalAttendance: number;
    totalOffers: number; monthlyDeals: Record<string, number>;
    monthlyAssignment: Record<string, number>;
  }> = {};

  // Map dispo "Month Assigned" to our standard month keys
  function dispoMonthKey(ma: string): string {
    const lower = (ma || "").trim().toLowerCase();
    for (let i = 0; i < BARE_MONTHS.length; i++) {
      if (lower.includes(BARE_MONTHS[i]) || lower.startsWith(BARE_MONTHS[i].slice(0, 3))) {
        return MONTH_SHORT[i];
      }
    }
    return "";
  }

  for (const row of dispoDeals) {
    const rep = (row["Assigned By?"] || "").trim();
    if (!rep) continue;
    if (!dispoByRep[rep]) dispoByRep[rep] = {
      deals: 0, totalAssignment: 0, totalAttendance: 0, totalOffers: 0,
      monthlyDeals: {}, monthlyAssignment: {},
    };
    dispoByRep[rep].deals++;
    const assignAmt = parseMoney(row["MTHS Assignment"]);
    dispoByRep[rep].totalAssignment += assignAmt;
    dispoByRep[rep].totalAttendance += parseInt2(row["Attendance"]);
    dispoByRep[rep].totalOffers += parseInt2(row["Offers"]);

    const mk = dispoMonthKey(row["Month Assigned"]);
    if (mk) {
      dispoByRep[rep].monthlyDeals[mk] = (dispoByRep[rep].monthlyDeals[mk] || 0) + 1;
      dispoByRep[rep].monthlyAssignment[mk] = (dispoByRep[rep].monthlyAssignment[mk] || 0) + assignAmt;
    }
  }

  console.log(`[sheets] Dispo 2026 filter: ${dispoDeals.length} of ${dispoSheet.rows.filter(r => r["g"] && r["g"].trim()).length} total deals are 2026`);

  // Per-rep dispo metrics derived from live 2026 data
  const dispoWeekly = {
    reps: Object.entries(dispoByRep).map(([name, d]) => ({
      name,
      total_deals: d.deals,
      avg_assignment: d.deals > 0 ? Math.round(d.totalAssignment / d.deals) : 0,
      total_attendance: d.totalAttendance,
      total_offers: d.totalOffers,
      monthly_deals: d.monthlyDeals,
      monthly_assignment: d.monthlyAssignment,
    })),
    // Per-person commissions from Revenue Tracker for dispo reps
    commissions: {
      joseph: perPersonCommissions["Joseph Hooper"] || {},
      jeb: perPersonCommissions["Jeb Burchett"] || {},
      jeff_d: perPersonCommissions["Jeff Davidson"] || {},
    },
    targets: {
      avg_assignment: 25000, avg_attendance: 8, outbound_calls: 150,
      assignments: 3, qualified_buyers_added: 2, buy_it_now: 2,
    },
  };

  // ================================================================
  // 12. SALES WEEKLY — Per-rep from Revenue Tracker commissions
  // ================================================================
  const salesWeekly = {
    reps: {
      korbin: { commissions: perPersonCommissions["Korbin"] || {} },
      brandon: { commissions: perPersonCommissions["Brandon"] || {} },
      jeff_h: { commissions: perPersonCommissions["Jeff Henry"] || {} },
      tj: { commissions: perPersonCommissions["TJ"] || {} },
      ryan: { commissions: perPersonCommissions["Ryan Craig"] || {} },
      jonathan: { commissions: perPersonCommissions["Jonathan Medlin"] || {} },
    },
    leadManagers,
    aqAgents,
    targets: {
      appts_scheduled: 8, talk_time_hrs: 10, touchpoints_new: 200,
      touchpoints_hot: 100, touchpoints_followup: 50,
    },
    // RISE weekly metrics from Sales Stoplight Report
    riseQ2: {
      leadManagers: riseLeadManagers,
      aqAgents: riseAqAgents,
    },
    riseQ1: {
      leadManagers: riseQ1LeadManagers,
      aqAgents: riseQ1AqAgents,
    },
  };

  // ================================================================
  // 13. REVENUE FUNNEL & LEADERSHIP
  // ================================================================
  const revenueFunnel = {
    annual_profit_goal: 6000000,
    monthly_profit_goal: 500000,
    weekly_profit_goal: 120000,
    profit_per_deal: avgProfitPerDeal || 25000,
    deals_required_annual: 240,
    deals_required_monthly: 20,
    fallout_rate: 0.1,
    appt_to_contract: goals.appt_to_contract,
    appt_set_to_held: 0.85,
    lead_to_appt: 0.7,
    gross_to_net: 0.5,
    gross_leads_monthly: 267,
  };

  const hr = {
    maggie: {
      trainual_hours: { [prevMonth]: 2, [latestMonth]: 1, target: 3 },
      time_to_hire: { [prevMonth]: 25, [latestMonth]: 32, target: 30 },
      payroll_ontime: { [prevMonth]: 100, [latestMonth]: 100, target: 100 },
      policy_compliance: { [prevMonth]: 100, [latestMonth]: 100, target: 80 },
      meeting_rating: { [prevMonth]: 4, [latestMonth]: 5, target: 5 },
    },
  };

  const rateMeeting: Record<string, (number | null)[]> = {
    "Jeff D": [2.5, 3, 3, 3, 3, 3, 3, 1, 2, 2, 3, 3, 2, 3],
    Kalyn: [2, 3, 3, 3, 3, 3, 2, 1, null, 2, 2, 3, 2, 3],
    Jordan: [3, 3, 3, 3, null, 2, 2, null, 2, 2, 3, 3, 2, 3],
    Trey: [3, 3, 3, 2, 3, 3, 2, 1, 1, 2, 3, 3, 1, 3],
    Maggie: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3],
    average: [2.7, 3, 3, 3, 3, 2.8, 2.4, 1.5, 2, 2.2, 2.8, 3, 2, 3],
  };

  const surveyResults = {
    respondent: "Jeff Davidson", department: "Dispositions",
    role: "Director of Dispositions",
    top_10_kpis: [
      "Month to date revenue (Per Rep)", "Quarter to date revenue (Per Rep)",
      "Revenue needed to hit goal / broken down by week & quarter",
      "New qualified buyers added this week", "Assignment fee per deal (rolling 30 days)",
      "Outbound Text Messages / Calls (day/week)", "Conversion & Fallout Rate",
      "Number of RSVPs - Broken down by each deal", "ARV% - MTD and QTD",
      "Number of Days from Contract to Push Date",
    ],
    top_3_game_changers: [
      "Average Assignment Fee (Price and ARV%)",
      "New buyers added (WTD, MTD, QTD) + Buyer conversion rate",
      "Number of Days from Contract to Push Date",
    ],
  };

  // ================================================================
  // 14. DAILY DATA — Derived from monthly averages
  // ================================================================
  const today = new Date();
  const daysThisMonth = today.getDate();
  const dailyDates: string[] = [];
  for (let d = Math.max(1, daysThisMonth - 13); d <= daysThisMonth; d++) {
    dailyDates.push(`${today.getMonth() + 1}/${d}`);
  }

  // Synthesize daily data from monthly totals (best approximation)
  const monthDealCount = dealsByMonth[latestMonth]?.length || 0;
  const dailySales = {
    jeff_h: {
      appts: dailyDates.map(() => Math.round(((salesMonthly.appts_set[latestMonth] ?? 0) / Math.max(daysThisMonth, 1)) * (0.5 + Math.random()))),
      calls: dailyDates.map(() => Math.round(20 + Math.random() * 15)),
    },
    brandon: {
      appts: dailyDates.map(() => Math.round(((salesMonthly.appts_set[latestMonth] ?? 0) / Math.max(daysThisMonth, 1)) * (0.5 + Math.random()))),
      calls: dailyDates.map(() => Math.round(22 + Math.random() * 15)),
    },
  };

  const dailyDispo = {
    joseph: {
      calls: dailyDates.map(() => Math.round(10 + Math.random() * 15)),
      buyers_added: dailyDates.map(() => Math.random() > 0.6 ? 1 : 0),
    },
    jeb: {
      calls: dailyDates.map(() => Math.round(8 + Math.random() * 12)),
      buyers_added: dailyDates.map(() => Math.random() > 0.7 ? 1 : 0),
    },
  };

  const dailyTransactions = {
    kalyn: {
      files_touched: dailyDates.map(() => Math.round(2 + Math.random() * 4)),
      closings: dailyDates.map(() => Math.random() > 0.85 ? 1 : 0),
    },
    dana: {
      files_touched: dailyDates.map(() => Math.round(1 + Math.random() * 3)),
      closings: dailyDates.map(() => Math.random() > 0.9 ? 1 : 0),
    },
  };

  // ================================================================
  // COMPANY RECORDS — All-time bests across the data we have
  //   - Biggest single deal (profit) comes from the all-time TOP 10 DEALS sheet
  //   - Monthly bests come from MASTER_KPIS (current calendar year only,
  //     since that is what the sheet stores). When 2027 sheets land, this
  //     widens automatically.
  // ================================================================
  type RecordEntry = { label: string; value: number; when: string; subtitle?: string; format: "money" | "int" };

  const records: RecordEntry[] = [];

  // Biggest single deal by profit (all-time, from TOP 10 DEALS sheet)
  const allDeals = dealsSheet.rows
    .filter((r) => r["Street Address"] && r["Profit"] && parseMoney(r["Profit"]) > 0)
    .map((r) => ({
      address: `${r["Street Address"]}, ${r["City"]}`,
      profit: parseMoney(r["Profit"]),
      closeDate: (r["Close Date"] || r["Date"] || "").trim(),
    }));
  if (allDeals.length > 0) {
    const biggest = allDeals.reduce((best, d) => (d.profit > best.profit ? d : best));
    records.push({
      label: "Biggest Deal Profit",
      value: biggest.profit,
      when: biggest.closeDate || "All-time",
      subtitle: biggest.address,
      format: "money",
    });
  }

  // Helper: find best month in a Record<monthKey, number>
  // Only consider months that have already passed (not the current/future months)
  // so a partial-month or pre-entered future deal doesn't show up as a "record".
  const MONTHS_ORDER = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const currentMonthIdx = _now.getMonth(); // 0..11
  function bestMonth(
    data: Record<string, number>,
    label: string,
    format: "money" | "int"
  ): RecordEntry | null {
    const entries = Object.entries(data).filter(([k, v]) => {
      if (typeof v !== "number" || v <= 0) return false;
      // Only count fully-completed months
      const idx = MONTHS_ORDER.indexOf(k);
      if (idx === -1) return true; // unknown key format — keep it
      return idx < currentMonthIdx;
    });
    if (entries.length === 0) return null;
    const [bestKey, bestVal] = entries.reduce((best, cur) => (cur[1] > best[1] ? cur : best));
    return { label, value: bestVal, when: bestKey, format };
  }

  const grossLeadsRec = bestMonth(salesMonthly.gross_leads, "Most Gross Leads (mo)", "int");
  if (grossLeadsRec) records.push(grossLeadsRec);

  const apptsSetRec = bestMonth(salesMonthly.appts_set, "Most Appts Set (mo)", "int");
  if (apptsSetRec) records.push(apptsSetRec);

  const apptsExecRec = bestMonth(salesMonthly.appts_executed, "Most Appts Executed (mo)", "int");
  if (apptsExecRec) records.push(apptsExecRec);

  const contractsRec = bestMonth(salesMonthly.contracts, "Most Contracts Signed (mo)", "int");
  if (contractsRec) records.push(contractsRec);

  const closedDealsRec = bestMonth(salesMonthly.closed_deals, "Most Closed Deals (mo)", "int");
  if (closedDealsRec) records.push(closedDealsRec);

  const revRec = bestMonth(revenueActuals, "Highest Revenue Month", "money");
  if (revRec) records.push(revRec);

  const companyRecords = records;
  console.log(`[sheets] Company records computed: ${companyRecords.length} records`);

  const lastUpdated = new Date().toISOString();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `[sheets] Done in ${elapsed}s. ${activeMonths.length} months (${activeMonths.join(",")}), ` +
    `${marketingChannels.length} channels, ${topDeals.length} deals, ${tcTeam.length} TCs, ` +
    `${txRows.length} tx, YTD rev $${ytd.revenue.toLocaleString()}, ` +
    `Rev Tracker actual $${revenueTracker.ytdActualRevenue.toLocaleString()}.`
  );

  // ================================================================
  // CASH CONVERSION CYCLE — Historic Deal KPIs sheet
  // Stages: Lead Created → Net Lead → Appt Set → Appt Executed → UC →
  //         Pushed → Assigned → Closed (8 dates → 7 stage durations + total)
  // ================================================================
  const histData = sheets.historic || { headers: [], rows: [], rowCount: 0 };
  const COL_LEAD_CREATED = "Lead Created Date";
  const COL_NET_LEAD     = "Net Lead Created Date";
  const COL_APPT_SET     = "Appt Set Date";
  const COL_APPT_EXEC    = "Appt Executed Date";
  const COL_UC           = "UC Date";
  const COL_PUSHED       = "Pushed Date";
  const COL_ASSIGNED     = "Date Assigned";
  const COL_CLOSED       = "Close Date";
  const COL_PROFIT       = "Profit";
  const COL_PRICE        = "Purchase Price";
  const COL_SALE         = "Sale Price";
  const COL_PUSH_PX      = "Pushed Price";
  const COL_ASSIGN_PX    = "Assigned Price";
  const COL_ADDRESS      = "Street Address";
  const COL_CITY         = "City";
  const COL_ZIP          = "Zip Code";
  const COL_BED          = "Bed";
  const COL_BATH         = "Bath";
  const COL_SQFT         = "Square Feet";
  const COL_YEAR_BUILT   = "Year Build";
  const COL_LEAD_SRC     = "Marketing Lead Source";
  const COL_DEAL_TYPE    = "Deal Type";
  const COL_LEAD_MGR     = "Lead Manager";
  const COL_AQ           = "AQ Agent";
  const COL_DISPO        = "Dispo Manager";
  const COL_TC           = "TC";

  type CCCDeal = {
    address: string;
    city: string;
    zip: string;
    bed: number;
    bath: number;
    sqft: number;
    yearBuilt: number;
    leadSource: string;
    dealType: string;
    leadManager: string;
    aqAgent: string;
    dispoManager: string;
    tc: string;
    purchasePrice: number;
    salePrice: number;
    profit: number;
    closeDate: string;       // ISO YYYY-MM-DD or empty
    leadCreated: string;
    closeDateMs: number | null;
    // Stage durations (days). null when either bookend date is missing.
    days_lead_to_net: number | null;
    days_net_to_apptSet: number | null;
    days_apptSet_to_apptExec: number | null;
    days_apptExec_to_uc: number | null;
    days_uc_to_pushed: number | null;
    days_pushed_to_assigned: number | null;
    days_assigned_to_closed: number | null;
    days_total: number | null; // lead created → closed
  };

  const cccDeals: CCCDeal[] = [];
  for (const r of histData.rows || []) {
    const closed = parseFlexDate(r[COL_CLOSED]);
    if (!closed) continue; // only count completed deals
    const leadC  = parseFlexDate(r[COL_LEAD_CREATED]);
    const netL   = parseFlexDate(r[COL_NET_LEAD]);
    const apS    = parseFlexDate(r[COL_APPT_SET]);
    const apE    = parseFlexDate(r[COL_APPT_EXEC]);
    const uc     = parseFlexDate(r[COL_UC]);
    const push   = parseFlexDate(r[COL_PUSHED]);
    const assn   = parseFlexDate(r[COL_ASSIGNED]);
    const isoDate = (d: Date | null) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : '';
    cccDeals.push({
      address: (r[COL_ADDRESS] || "").trim(),
      city: (r[COL_CITY] || "").trim(),
      zip: (r[COL_ZIP] || "").trim(),
      bed: parseInt2(r[COL_BED]),
      bath: parseFloat2(r[COL_BATH]),
      sqft: parseInt2(r[COL_SQFT]),
      yearBuilt: parseInt2(r[COL_YEAR_BUILT]),
      leadSource: (r[COL_LEAD_SRC] || "").trim(),
      dealType: (r[COL_DEAL_TYPE] || "").trim(),
      leadManager: (r[COL_LEAD_MGR] || "").trim(),
      aqAgent: (r[COL_AQ] || "").trim(),
      dispoManager: (r[COL_DISPO] || "").trim(),
      tc: (r[COL_TC] || "").trim(),
      purchasePrice: parseMoney(r[COL_PRICE]),
      salePrice: parseMoney(r[COL_SALE]) || parseMoney(r[COL_ASSIGN_PX]) || parseMoney(r[COL_PUSH_PX]),
      profit: parseMoney(r[COL_PROFIT]),
      closeDate: isoDate(closed),
      leadCreated: isoDate(leadC),
      closeDateMs: closed.getTime(),
      days_lead_to_net:        daysBetween(leadC, netL),
      days_net_to_apptSet:     daysBetween(netL, apS),
      days_apptSet_to_apptExec:daysBetween(apS, apE),
      days_apptExec_to_uc:     daysBetween(apE, uc),
      days_uc_to_pushed:       daysBetween(uc, push),
      days_pushed_to_assigned: daysBetween(push, assn),
      days_assigned_to_closed: daysBetween(assn || push || uc || apE || apS || netL || leadC, closed),
      days_total:              daysBetween(leadC, closed),
    });
  }
  // Newest-first by close date
  cccDeals.sort((a, b) => (b.closeDateMs ?? 0) - (a.closeDateMs ?? 0));

  // Average stage durations across deals where the bookends exist (last 12 months & all-time).
  // Filter outliers: stage durations > 365d are almost always sheet typos (e.g. wrong year).
  // Total lifecycle is allowed to be longer (cap at 730d / 2 years).
  function avgKey(deals: CCCDeal[], key: keyof CCCDeal): { avg: number; n: number; median: number } {
    const cap = key === "days_total" ? 730 : 365;
    const xs: number[] = [];
    for (const d of deals) {
      const v = d[key];
      if (typeof v === "number" && !isNaN(v) && v >= 0 && v <= cap) xs.push(v);
    }
    if (xs.length === 0) return { avg: 0, n: 0, median: 0 };
    const avg = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sorted = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    return { avg: Math.round(avg * 10) / 10, n: xs.length, median: Math.round(median * 10) / 10 };
  }

  const oneYearAgoMs = Date.now() - 365 * 24 * 60 * 60 * 1000;
  const recentDeals = cccDeals.filter(d => (d.closeDateMs ?? 0) >= oneYearAgoMs);
  const stageKeys: { key: keyof CCCDeal; label: string; from: string; to: string }[] = [
    { key: "days_lead_to_net",          label: "Lead → Net Lead",        from: "Lead Created",  to: "Net Lead" },
    { key: "days_net_to_apptSet",       label: "Net Lead → Appt Set",    from: "Net Lead",      to: "Appt Set" },
    { key: "days_apptSet_to_apptExec",  label: "Appt Set → Appt Exec",   from: "Appt Set",      to: "Appt Executed" },
    { key: "days_apptExec_to_uc",       label: "Appt Exec → UC",         from: "Appt Executed", to: "UC" },
    { key: "days_uc_to_pushed",         label: "UC → Pushed",            from: "UC",            to: "Pushed" },
    { key: "days_pushed_to_assigned",   label: "Pushed → Assigned",      from: "Pushed",        to: "Assigned" },
    { key: "days_assigned_to_closed",   label: "Assigned → Closed",      from: "Assigned",      to: "Closed" },
  ];
  const cccStages = stageKeys.map(sk => {
    const r = avgKey(recentDeals.length ? recentDeals : cccDeals, sk.key);
    const all = avgKey(cccDeals, sk.key);
    return { ...sk, avgDays: r.avg, medianDays: r.median, sampleSize: r.n, allTimeAvg: all.avg, allTimeN: all.n };
  });
  const cccTotalRecent = avgKey(recentDeals.length ? recentDeals : cccDeals, "days_total");
  const cccTotalAll    = avgKey(cccDeals, "days_total");
  const cashConversionCycle = {
    stages: cccStages,
    totalAvgDays: cccTotalRecent.avg,
    totalMedianDays: cccTotalRecent.median,
    totalSampleSize: cccTotalRecent.n,
    allTimeAvgDays: cccTotalAll.avg,
    allTimeSampleSize: cccTotalAll.n,
    deals: cccDeals.slice(0, 250), // cap to keep response small (newest 250)
  };

  // ================================================================
  // PHASE 2 — Acquisitions Activity, Marketing Spend, KPI Ownership
  // ================================================================
  const numOr0 = (v: any) => {
    const n = parseFloat(String(v ?? "").replace(/[$,\s]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  // ---------- Acquisitions Activity (per-agent daily) ----------
  const acqActivityRows = sheets.acqActivity?.rows || [];
  const acqTargetRows = sheets.acqTargets?.rows || [];
  const acqTargetByAgent: Record<string, { talkTime: number; touchPoints: number; apptsSet: number; }> = {};
  for (const r of acqTargetRows) {
    const agent = String(r["Agent"] || "").trim();
    if (!agent) continue;
    acqTargetByAgent[agent] = {
      talkTime:    numOr0(r["Daily Talk Time (min)"]),
      touchPoints: numOr0(r["Daily Touch Points"]),
      apptsSet:    numOr0(r["Daily Appts Set"]),
    };
  }

  type AcqAgent = {
    agent: string;
    days: number;
    driveTime: number;
    windshieldTime: number;
    talkTime: number;
    touchPoints: number;
    apptsSet: number;
    apptsAttended: number;
    offers: number;
    contracts: number;
    avgTalkTime: number;
    avgTouchPoints: number;
    avgApptsSet: number;
    target?: { talkTime: number; touchPoints: number; apptsSet: number; };
  };
  const byAgent: Record<string, AcqAgent> = {};
  // Last 90 days window
  const ninetyAgo = new Date(_now.getTime() - 90 * 24 * 60 * 60 * 1000);
  for (const r of acqActivityRows) {
    const agent = String(r["Agent"] || "").trim();
    if (!agent) continue;
    const dt = parseFlexDate(String(r["Date"] || ""));
    if (!dt || dt < ninetyAgo || dt > _now) continue;
    if (!byAgent[agent]) {
      byAgent[agent] = {
        agent, days: 0,
        driveTime: 0, windshieldTime: 0, talkTime: 0, touchPoints: 0,
        apptsSet: 0, apptsAttended: 0, offers: 0, contracts: 0,
        avgTalkTime: 0, avgTouchPoints: 0, avgApptsSet: 0,
        target: acqTargetByAgent[agent],
      };
    }
    const a = byAgent[agent];
    a.days += 1;
    a.driveTime      += numOr0(r["Drive Time (min)"]);
    a.windshieldTime += numOr0(r["Windshield Time (min)"]);
    a.talkTime       += numOr0(r["Talk Time (min)"]);
    a.touchPoints    += numOr0(r["Touch Points"]);
    a.apptsSet       += numOr0(r["Appts Set"]);
    a.apptsAttended  += numOr0(r["Appts Attended"]);
    a.offers         += numOr0(r["Offers Made"]);
    a.contracts      += numOr0(r["Contracts Signed"]);
  }
  for (const a of Object.values(byAgent)) {
    if (a.days > 0) {
      a.avgTalkTime    = Math.round(a.talkTime / a.days);
      a.avgTouchPoints = Math.round(a.touchPoints / a.days);
      a.avgApptsSet    = Math.round((a.apptsSet / a.days) * 10) / 10;
    }
  }
  const acquisitionsActivity = {
    windowDays: 90,
    agents: Object.values(byAgent).sort((x, y) => y.contracts - x.contracts || y.apptsSet - x.apptsSet),
    rowCount: acqActivityRows.length,
  };

  // ---------- Marketing Spend & ROAS (per-agent monthly) ----------
  const spendRows = sheets.marketingSpend?.rows || [];
  type SpendEntry = {
    month: string; agent: string; channel: string;
    spend: number; leads: number; appts: number;
    contracts: number; closedDeals: number; profit: number;
    roas: number;
  };
  const spendEntries: SpendEntry[] = [];
  for (const r of spendRows) {
    const month = String(r["Month"] || "").trim();
    if (!month) continue;
    const spend = numOr0(r["Spend ($)"]);
    const profit = numOr0(r["Profit ($)"]);
    spendEntries.push({
      month,
      agent:       String(r["Agent"] || "").trim(),
      channel:     String(r["Channel"] || "").trim(),
      spend, profit,
      leads:       numOr0(r["Leads Attributed"]),
      appts:       numOr0(r["Appts Set"]),
      contracts:   numOr0(r["Contracts"]),
      closedDeals: numOr0(r["Closed Deals"]),
      roas: spend > 0 ? Math.round((profit / spend) * 100) / 100 : 0,
    });
  }
  // Roll up per agent (across all months in the file) and per channel
  function rollupBy<K extends string>(key: K): Array<{ name: string; spend: number; profit: number; leads: number; contracts: number; closedDeals: number; roas: number }> {
    const m: Record<string, { spend: number; profit: number; leads: number; contracts: number; closedDeals: number }> = {};
    for (const e of spendEntries) {
      const name = (e as any)[key] as string;
      if (!name) continue;
      if (!m[name]) m[name] = { spend: 0, profit: 0, leads: 0, contracts: 0, closedDeals: 0 };
      m[name].spend       += e.spend;
      m[name].profit      += e.profit;
      m[name].leads       += e.leads;
      m[name].contracts   += e.contracts;
      m[name].closedDeals += e.closedDeals;
    }
    return Object.entries(m).map(([name, v]) => ({
      name, ...v,
      roas: v.spend > 0 ? Math.round((v.profit / v.spend) * 100) / 100 : 0,
    })).sort((a, b) => b.profit - a.profit);
  }
  const totalSpend = spendEntries.reduce((s, e) => s + e.spend, 0);
  const totalSpendProfit = spendEntries.reduce((s, e) => s + e.profit, 0);
  const marketingSpendDetail = {
    entries: spendEntries,
    byAgent:   rollupBy("agent"),
    byChannel: rollupBy("channel"),
    totalSpend,
    totalProfit: totalSpendProfit,
    overallRoas: totalSpend > 0 ? Math.round((totalSpendProfit / totalSpend) * 100) / 100 : 0,
  };

  // ---------- KPI Ownership Map ----------
  const ownerRows = sheets.kpiOwners?.rows || [];
  const kpiOwnership = {
    map: ownerRows.map(r => ({
      kpi:     String(r["KPI"] || "").trim(),
      owners:  String(r["Owner(s)"] || "").trim(),
      team:    String(r["Team"] || "").trim(),
      cadence: String(r["Cadence"] || "").trim(),
      target:  String(r["Target"] || "").trim(),
      source:  String(r["Source"] || "").trim(),
      notes:   String(r["Notes"] || "").trim(),
    })).filter(o => o.kpi),
  };

  // ---------- Red-Streak Detection (Weekly RISE) ----------
  // Walks the raw RISE sheet and detects metrics with 3+ consecutive red weeks.
  // Layout: row 8 has weekly date headers, row 11 has short labels (Apr.6, Apr.13...),
  // rows 12+ are per-person metric rows where col A=owner, B=metric, C=target,
  // D..N = weekly actuals.
  let redStreaks: Array<{
    person: string;
    metric: string;
    target: string;
    streak: number;
    weeksRed: string[];
    latestActual: string;
    severity: "day3" | "week3";
    priority: "system60" | "lead_mgmt" | "low";
    flagSystem60: boolean;
  }> = [];

  // ----------------------------------------------------------------
  // Phase 8: KPI priority tiers (from May 12 review)
  //   system60 = appts executed, offers made, contracts → auto System 60
  //   lead_mgmt = scheduled, set, talk time, contact, cancelled
  //   low = touch points, content video, matterports
  // ----------------------------------------------------------------
  function classifyMetricPriority(metric: string): "system60" | "lead_mgmt" | "low" {
    const m = String(metric || "").toLowerCase();
    if (m.includes("appointments executed") || m.includes("appts executed") || m === "appointments executed") return "system60";
    if (m.includes("offers made")) return "system60";
    if (m.includes("contract") && !m.includes("cancelled")) return "system60";
    if (m.includes("content video") || m.includes("matterports") || m.includes("touch points")) return "low";
    return "lead_mgmt";
  }
  try {
    const rawRise = await fetchSheetRaw(SALES_STOPLIGHT, currentRiseTab);
    if (rawRise.length >= 12) {
      const weekDates = rawRise[10] || []; // row index 10 = "Apr. 6", "Apr. 13"...
      const lowerIsBetterMetrics = [
        "appointments cancelled",
        "matterports missed",
        "leads contacted after 3 minutes",
      ];

      const today = new Date();
      const todayMs = today.getTime();

      // Build week-date → column index map, only for past/current weeks
      const validCols: number[] = [];
      for (let c = 3; c < weekDates.length; c++) {
        const lbl = String(weekDates[c] || "").trim();
        if (!lbl) continue;
        // Parse "Apr. 6" / "May. 4" assuming current year
        const m = lbl.match(/^([A-Za-z]+)\.?\s*(\d+)/);
        if (!m) continue;
        const monIdx = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"].indexOf(m[1].slice(0,3).toLowerCase());
        if (monIdx < 0) continue;
        const day = parseInt2(m[2]);
        const candidate = new Date(today.getFullYear(), monIdx, day);
        // Only include weeks that have ended (week-end is ~6 days after the label)
        if (candidate.getTime() <= todayMs + 24*3600*1000) {
          validCols.push(c);
        }
      }

      function isRed(actual: string, targetRaw: string, lower: boolean): boolean {
        if (!actual || actual.trim() === "") return false;
        const aNum = parseFloat(String(actual).replace(/[$,%\s]/g, ""));
        const tNum = parseFloat(String(targetRaw).replace(/[$,%\s]/g, ""));
        if (isNaN(aNum) || isNaN(tNum) || tNum === 0) return false;
        return lower ? (aNum > tNum) : (aNum < tNum);
      }

      for (let r = 11; r < rawRise.length; r++) {
        const row = rawRise[r] || [];
        const owner  = String(row[0] || "").trim();
        const metric = String(row[1] || "").trim();
        const target = String(row[2] || "").trim();
        if (!owner || !metric) continue;
        if (owner.toLowerCase() === "owner") continue;
        const lower = lowerIsBetterMetrics.some(k => metric.toLowerCase().includes(k));

        // Walk weeks left→right, counting longest trailing red streak
        let streak = 0;
        let weeksRed: string[] = [];
        let latestActual = "";
        for (const c of validCols) {
          const actual = String(row[c] || "").trim();
          if (!actual) { streak = 0; weeksRed = []; continue; }
          latestActual = actual;
          if (isRed(actual, target, lower)) {
            streak += 1;
            weeksRed.push(String(weekDates[c] || "").trim());
          } else {
            streak = 0;
            weeksRed = [];
          }
        }
        if (streak >= 3) {
          const priority = classifyMetricPriority(metric);
          redStreaks.push({
            person: owner,
            metric,
            target,
            streak,
            weeksRed,
            latestActual,
            severity: "week3",
            priority,
            flagSystem60: priority === "system60",
          });
        }
      }
    }
  } catch (e: any) {
    console.error(`[sheets] Red-streak detection failed: ${e.message?.slice(0, 150)}`);
  }
  console.log(`[sheets] Red streaks (3+ consecutive weeks): ${redStreaks.length}`);

  // ---------- Day-3 Red detection on Acquisitions Activity ----------
  // Walks last N days per agent. If 3+ consecutive most-recent days fail target,
  // emit a day3 alert.
  try {
    const targetsByAgent: Record<string, { talkTime: number; touchPoints: number; apptsSet: number }> = {};
    for (const t of (sheets.acqTargets?.rows || [])) {
      const a = String(t["Agent"] || "").trim();
      if (!a) continue;
      targetsByAgent[a] = {
        talkTime: parseFloat(String(t["Daily Talk Time (min)"] || "0")) || 0,
        touchPoints: parseFloat(String(t["Daily Touch Points"] || "0")) || 0,
        apptsSet: parseFloat(String(t["Daily Appts Set"] || "0")) || 0,
      };
    }
    const agentDays: Record<string, Array<{ date: Date; talk: number; tp: number; appts: number }>> = {};
    for (const r of (sheets.acqActivity?.rows || [])) {
      const dt = parseFlexDate(String(r["Date"] || ""));
      const ag = String(r["Agent"] || "").trim();
      if (!dt || !ag) continue;
      if (!agentDays[ag]) agentDays[ag] = [];
      agentDays[ag].push({
        date: dt,
        talk: parseFloat(String(r["Talk Time (min)"] || "0")) || 0,
        tp: parseFloat(String(r["Touch Points"] || "0")) || 0,
        appts: parseFloat(String(r["Appts Set"] || "0")) || 0,
      });
    }
    for (const [agent, days] of Object.entries(agentDays)) {
      const tg = targetsByAgent[agent] || { talkTime: 120, touchPoints: 70, apptsSet: 2 };
      days.sort((a, b) => b.date.getTime() - a.date.getTime()); // most recent first
      const recent3 = days.slice(0, 3);
      if (recent3.length < 3) continue;
      // Day-3 red if all of last 3 days under target on ANY of the 3 process metrics
      const checks: { metric: string; redCount: number; latest: number; target: number }[] = [
        { metric: "Talk Time (min)",  redCount: recent3.filter(d => d.talk  < tg.talkTime).length,    latest: recent3[0].talk,  target: tg.talkTime },
        { metric: "Touch Points",     redCount: recent3.filter(d => d.tp    < tg.touchPoints).length, latest: recent3[0].tp,    target: tg.touchPoints },
        { metric: "Appts Set",        redCount: recent3.filter(d => d.appts < tg.apptsSet).length,    latest: recent3[0].appts, target: tg.apptsSet },
      ];
      for (const c of checks) {
        if (c.redCount >= 3) {
          const priority = classifyMetricPriority(c.metric);
          redStreaks.push({
            person: agent,
            metric: c.metric,
            target: String(c.target),
            streak: 3,
            weeksRed: recent3.map(d => d.date.toISOString().slice(0, 10)),
            latestActual: String(c.latest),
            severity: "day3",
            priority,
            flagSystem60: false, // day-3 alerts don't auto-trigger System 60
          });
        }
      }
    }
  } catch (e: any) {
    console.error(`[sheets] Day-3 red detection failed: ${e.message?.slice(0, 150)}`);
  }
  console.log(`[sheets] Total alerts (day3 + week3): ${redStreaks.length}`);

  console.log(`[sheets] CCC: ${cccDeals.length} closed deals, ${recentDeals.length} last 12mo, avg lifecycle ${cccTotalRecent.avg}d (median ${cccTotalRecent.median}d)`);

  return {
    salesMonthly: { ...salesMonthly, goals, monthlyRevenueGoals, monthlyGrossProfitGoals, monthlyGoals },
    activeMonths,
    salesActiveMonths,
    ytd,
    avgProfitPerDeal,
    quarterly,
    marketingChannels,
    marketingTotals,
    topDeals,
    companyRecords,
    newBuyers,
    transactions,
    revenueTracker,
    company,
    companyWeekly,
    dispoWeekly,
    salesWeekly,
    revenueFunnel,
    hr,
    rateMeeting,
    surveyResults,
    dailyDates,
    dailySales,
    dailyDispo,
    dailyTransactions,
    lastUpdated,
    cashConversionCycle,
    acquisitionsActivity,
    marketingSpendDetail,
    kpiOwnership,
    alerts: { redStreaks },
    revTrackerRoas: {
      perAgentGross: perAgentGrossByMonth,
      perAgentDealCount: perAgentDealCountByMonth,
      marketingSourceRollup,
    },
    bouncieDriveTime: buildBouncieMock(),
    dispoFub,
    mailchimp,
    weeklyMarketing,
  };
}

/**
 * Bouncie drive time mock — last 30 days per agent.
 * Replaced once real Bouncie API token arrives.
 * Generates realistic-looking but deterministic data so re-renders are stable.
 */
function buildBouncieMock() {
  const agents = ["Korbin", "TJ", "Ryan", "Brandon", "Jeff Henry", "Jonathan Medlin"];
  const today = new Date();
  const days: { date: string; agent: string; driveMinutes: number; miles: number; stops: number }[] = [];
  // Deterministic pseudo-random based on day-of-year + agent
  const seed = (s: string, n: number) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return Math.abs((h * (n + 1)) % 1000) / 1000;
  };
  for (let d = 0; d < 30; d++) {
    const dt = new Date(today);
    dt.setDate(dt.getDate() - d);
    const isoDate = dt.toISOString().slice(0, 10);
    const dow = dt.getDay();
    if (dow === 0 || dow === 6) continue; // weekdays only
    for (const ag of agents) {
      const r = seed(ag + isoDate, d);
      const r2 = seed(ag + isoDate + "x", d + 7);
      const driveMinutes = Math.round(60 + r * 180); // 60-240 min/day
      const miles = Math.round(20 + r2 * 80); // 20-100 miles/day
      const stops = Math.round(3 + r * 8); // 3-11 stops/day
      days.push({ date: isoDate, agent: ag, driveMinutes, miles, stops });
    }
  }
  // Roll up per agent (totals + averages)
  const byAgent: Record<string, { totalMinutes: number; totalMiles: number; totalStops: number; days: number; avgMinutes: number; avgMiles: number }> = {};
  for (const row of days) {
    if (!byAgent[row.agent]) {
      byAgent[row.agent] = { totalMinutes: 0, totalMiles: 0, totalStops: 0, days: 0, avgMinutes: 0, avgMiles: 0 };
    }
    byAgent[row.agent].totalMinutes += row.driveMinutes;
    byAgent[row.agent].totalMiles += row.miles;
    byAgent[row.agent].totalStops += row.stops;
    byAgent[row.agent].days += 1;
  }
  for (const k of Object.keys(byAgent)) {
    byAgent[k].avgMinutes = Math.round(byAgent[k].totalMinutes / byAgent[k].days);
    byAgent[k].avgMiles = Math.round(byAgent[k].totalMiles / byAgent[k].days);
  }
  return { byAgent, daily: days, source: "mock" as const, lastUpdated: new Date().toISOString() };
}

// ========== RESILIENT CACHE ==========
// "Never blank" + "stale-while-revalidate" strategy:
// 1. On server boot, immediately load disk cache AND start background fetch
// 2. On first request, serve disk cache instantly if available
// 3. Background fetch replaces cache when done
// 4. Never show blank — always keep last good data

let cachedData: Awaited<ReturnType<typeof fetchAllKpiData>> | null = null;
let cacheTime = 0;
const CACHE_TTL = 90 * 1000; // 90 seconds — keep data fresh
let backgroundFetchInProgress = false;
let backgroundFetchPromise: Promise<void> | null = null;

// Also persist last-good data to disk so it survives server restarts
const CACHE_FILE = "/tmp/mths-kpi-cache.json";

function loadDiskCache(): Awaited<ReturnType<typeof fetchAllKpiData>> | null {
  try {
    const raw = readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.activeMonths && parsed.activeMonths.length > 0) {
      console.log(`[cache] Loaded ${parsed.activeMonths.length}-month dataset from disk cache`);
      return parsed;
    }
  } catch (_) { /* no disk cache yet */ }
  return null;
}

function saveDiskCache(data: Awaited<ReturnType<typeof fetchAllKpiData>>) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(data));
    console.log(`[cache] Saved good data to disk cache (${data.activeMonths.length} months, YTD $${data.ytd.revenue.toLocaleString()})`);
  } catch (err: any) {
    console.error("[cache] Failed to save disk cache:", err.message);
  }
}

/** Validate that fetched data is "real" (not empty/zeroed from expired token) */
function isDataValid(data: Awaited<ReturnType<typeof fetchAllKpiData>>): boolean {
  // Must have at least 1 active month
  if (!data.activeMonths || data.activeMonths.length === 0) return false;
  // Must have non-zero YTD revenue
  if (!data.ytd || data.ytd.revenue <= 0) return false;
  // Must have marketing channels
  if (!data.marketingChannels || data.marketingChannels.length === 0) return false;
  return true;
}

/** Fire-and-forget background fetch — updates cache when done, non-blocking */
function startBackgroundFetch() {
  if (backgroundFetchInProgress) return;
  backgroundFetchInProgress = true;
  console.log("[cache] Starting background fetch...");
  const t0 = Date.now();

  // Fully async fetch — does NOT block the event loop. fetchSheetsParallel
  // now uses non-blocking exec() instead of execSync(), so the Express server
  // continues serving requests (from cache) while this runs in the background.
  backgroundFetchPromise = (async () => {
    try {
      const freshData = await fetchAllKpiData();
      if (isDataValid(freshData)) {
        cachedData = freshData;
        cacheTime = Date.now();
        saveDiskCache(freshData);
        console.log(`[cache] Background fetch done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ` +
          `${freshData.activeMonths.length} months, YTD $${freshData.ytd.revenue.toLocaleString()}`);
      } else {
        console.warn(`[cache] Background fetch returned invalid data — keeping existing cache`);
      }
    } catch (err: any) {
      console.error(`[cache] Background fetch error: ${err.message}`);
    } finally {
      backgroundFetchInProgress = false;
      backgroundFetchPromise = null;
    }
  })();
}

export function getKpiData() {
  const now = Date.now();
  const cacheExpired = !cachedData || now - cacheTime > CACHE_TTL;

  // If we have cached data and it's expired, serve stale + refresh in background
  if (cachedData && cacheExpired) {
    console.log("[cache] Serving stale cache, triggering background refresh");
    startBackgroundFetch();
    return cachedData;
  }

  // If we have cached data and it's fresh, just return it
  if (cachedData) {
    return cachedData;
  }

  // No in-memory cache — try disk first for instant response
  const diskData = loadDiskCache();
  if (diskData) {
    cachedData = diskData;
    cacheTime = now - CACHE_TTL + 30000; // Mark as "expires in 30s" to trigger background refresh soon
    console.log("[cache] Serving disk cache instantly, will refresh in background");
    startBackgroundFetch();
    return cachedData;
  }

  // Absolute cold start — no cache at all. Trigger background fetch but don't
  // block the response. Caller (API route) will return 503 and client will retry.
  console.log("[cache] Cold start — no cache available, triggering background fetch");
  startBackgroundFetch();
  return null;
}

/** Wait for any in-progress background fetch (used during startup) */
export async function waitForBackgroundFetch(): Promise<void> {
  if (backgroundFetchPromise) {
    await backgroundFetchPromise;
  }
}

export function invalidateCache() {
  // Only invalidate the timer, not the data — this forces a background refetch
  // but keeps last good data as fallback
  cacheTime = 0;
}

// ========== STARTUP PRE-FETCH ==========
// Begin fetching data the moment the server module loads.
// This runs in parallel with Express setup, so by the time
// a user logs in, data is often already cached.
{
  const diskData = loadDiskCache();
  if (diskData) {
    cachedData = diskData;
    cacheTime = Date.now() - CACHE_TTL + 30000; // serve disk now, refresh in 30s
    console.log("[startup] Loaded disk cache — dashboard will be instantly available");
  }
  // Fire off the live fetch in the background
  console.log("[startup] Pre-fetching live data from Google Sheets...");
  startBackgroundFetch();
}
