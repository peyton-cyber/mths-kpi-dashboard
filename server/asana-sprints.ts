/**
 * Asana 90-Day Sprint goals fetcher.
 *
 * Auto-discovers the active sprint task (e.g., "90 Day Sprint - Q2 2026") and
 * parses revenue/contract/profit targets from its notes — no hardcoded values.
 *
 * Lookup strategy:
 *   1. Search workspace for tasks containing "90 Day Sprint" in name
 *   2. For each candidate, parse name for "Q{N} {YYYY}" pattern
 *   3. Match by current quarter+year, fall back to the one whose due_on
 *      falls within the current quarter window
 *
 * Notes parsing — supports the patterns used in MTHS sprint tasks:
 *   "Revenue target: $1,650,000"
 *   "Closing target: 66"
 *   "Profit per deal target: $25,000"
 *   "April $460k / May $595k / June $595k"
 */

// Asana REST API — https://developers.asana.com/reference/rest-api-reference
// Replaces the previous MCP/external-tool CLI calls so the dashboard can run
// on any host. Auth via personal access token in env var ASANA_PAT.

const WORKSPACE_GID = process.env.ASANA_WORKSPACE_GID || "471974462137775";
const ASANA_API = "https://app.asana.com/api/1.0";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
const MONTH_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

export interface SprintGoals {
  quarter: number;          // 1-4
  year: number;             // e.g. 2026
  taskGid: string;
  taskName: string;
  quarterRevenueTarget: number | null;     // e.g. 1650000
  closingTarget: number | null;            // contracts for the quarter, e.g. 66
  profitPerDeal: number | null;            // e.g. 25000
  monthlyRevenue: Record<string, number>;  // { Apr: 460000, May: 595000, Jun: 595000 }
}

function getAsanaToken(): string {
  const tok = process.env.ASANA_PAT || process.env.ASANA_PERSONAL_ACCESS_TOKEN || "";
  if (!tok) {
    throw new Error("Missing ASANA_PAT env var (Asana personal access token).");
  }
  return tok;
}

/**
 * Make an authenticated GET against the Asana REST API.
 * Returns the parsed JSON body or null on failure.
 */
async function asanaGet(path: string, params: Record<string, string | number | string[]> = {}, timeoutMs = 15000): Promise<any> {
  const url = new URL(ASANA_API + path);
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) {
      url.searchParams.set(k, v.join(","));
    } else if (v !== null && v !== undefined && v !== "") {
      url.searchParams.set(k, String(v));
    }
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${getAsanaToken()}`,
        Accept: "application/json",
      },
      signal: ctrl.signal,
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "");
      console.error(`[asana] GET ${path} → ${resp.status}: ${body.slice(0, 200)}`);
      return null;
    }
    return await resp.json();
  } catch (err: any) {
    console.error(`[asana] GET ${path} threw: ${(err.message || "").slice(0, 200)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Search tasks in a workspace. Asana REST endpoint is
 *   GET /workspaces/{workspace_gid}/tasks/search?text=...
 * Returns { data: [{ gid, name, due_on, completed }], ... } or null.
 */
async function searchTasks(text: string, optFields: string[], limit = 50): Promise<any> {
  return asanaGet(`/workspaces/${WORKSPACE_GID}/tasks/search`, {
    text,
    opt_fields: optFields,
    limit,
  });
}

/**
 * Fetch a single task with the requested fields.
 */
async function getTask(taskGid: string, optFields: string[]): Promise<any> {
  const resp = await asanaGet(`/tasks/${taskGid}`, { opt_fields: optFields });
  // The REST API wraps the task in { data: {...} } — unwrap so callers see the
  // task directly (same shape the old MCP returned).
  if (resp && resp.data) return resp.data;
  return resp;
}

/** Parse a money string like "$1,650,000", "$460k", "$25,000" → number */
function parseMoneyish(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const m = cleaned.match(/^([\d.]+)([kKmM]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (isNaN(n)) return null;
  const suffix = m[2].toLowerCase();
  if (suffix === "k") return Math.round(n * 1000);
  if (suffix === "m") return Math.round(n * 1000000);
  return Math.round(n);
}

/** Parse the sprint notes for revenue, closing, profit, and monthly targets */
export function parseSprintNotes(notes: string): {
  quarterRevenueTarget: number | null;
  closingTarget: number | null;
  profitPerDeal: number | null;
  monthlyRevenue: Record<string, number>;
} {
  const out = {
    quarterRevenueTarget: null as number | null,
    closingTarget: null as number | null,
    profitPerDeal: null as number | null,
    monthlyRevenue: {} as Record<string, number>,
  };
  if (!notes) return out;

  // "Revenue target: $1,650,000" — also tolerate "Revenue Target:" / extra spaces
  const revMatch = notes.match(/Revenue\s+target\s*:?\s*(\$?[\d,.kKmM]+)/i);
  if (revMatch) out.quarterRevenueTarget = parseMoneyish(revMatch[1]);

  // "Closing target: 66" — plain integer
  const closeMatch = notes.match(/Closing\s+target\s*:?\s*(\d+)/i);
  if (closeMatch) out.closingTarget = parseInt(closeMatch[1], 10);

  // "Profit per deal target: $25,000"
  const profMatch = notes.match(/Profit\s+per\s+deal\s+target\s*:?\s*(\$?[\d,.kKmM]+)/i);
  if (profMatch) out.profitPerDeal = parseMoneyish(profMatch[1]);

  // Monthly: scan for "<MonthName> $<amount>" patterns globally
  // Handles both inline ("April $460k May $595k June $595k") and line-separated formats
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const name = MONTH_NAMES[i];
    const short = MONTH_SHORT[i];
    // Look for "<MonthName>" followed (within ~30 chars) by "$<amount>"
    const re = new RegExp(`${name}\\s*\\$([\\d,.kKmM]+)`, "i");
    const m = notes.match(re);
    if (m) {
      const val = parseMoneyish("$" + m[1]);
      if (val !== null && val > 0) out.monthlyRevenue[short] = val;
    }
  }

  return out;
}

/** Detect quarter (1-4) from a month index (0-11) */
function quarterFromMonth(monthIdx: number): number {
  return Math.floor(monthIdx / 3) + 1;
}

/** Parse "Q{N} {YYYY}" from a task name like "🗓️ 90 Day Sprint - Q2 2026" */
function parseQuarterFromName(name: string): { quarter: number; year: number } | null {
  const m = name.match(/Q([1-4])\s+(\d{4})/);
  if (!m) return null;
  return { quarter: parseInt(m[1], 10), year: parseInt(m[2], 10) };
}

/**
 * Fetch the active 90-Day Sprint task and parse its goals.
 * Returns null if no matching task is found or the call fails.
 */
export async function fetchActiveSprintGoals(now = new Date()): Promise<SprintGoals | null> {
  const currentQuarter = quarterFromMonth(now.getMonth());
  const currentYear = now.getFullYear();

  // Step 1 — search for any task with "90 Day Sprint" in the name
  const searchResp = await searchTasks("90 Day Sprint", ["name", "due_on", "completed", "gid"], 25);

  if (!searchResp || !searchResp.data || !Array.isArray(searchResp.data)) {
    console.error("[asana] search_tasks returned no data");
    return null;
  }

  // Step 2 — score candidates: name explicitly mentions Q{current}+{currentYear} wins;
  //   else the task whose due_on falls within current quarter; else any 2026 sprint.
  const candidates: Array<{
    gid: string; name: string; q: number; y: number; dueOn: string | null; score: number;
  }> = [];
  for (const t of searchResp.data) {
    if (!t.name || !t.gid) continue;
    if (!/90\s*Day\s*Sprint/i.test(t.name)) continue;

    const parsed = parseQuarterFromName(t.name);
    let q = parsed?.quarter ?? 0;
    let y = parsed?.year ?? 0;
    const dueOn: string | null = t.due_on ?? null;

    // If we couldn't parse Q from name, infer from due_on
    if (!q && dueOn) {
      const d = new Date(dueOn + "T00:00:00");
      q = quarterFromMonth(d.getMonth());
      y = d.getFullYear();
    }
    if (!q) continue; // can't classify

    let score = 0;
    if (q === currentQuarter && y === currentYear) score += 100;
    if (y === currentYear) score += 10;
    if (!t.completed) score += 5;
    candidates.push({ gid: t.gid, name: t.name, q, y, dueOn, score });
  }

  if (candidates.length === 0) {
    console.warn("[asana] No 90 Day Sprint tasks matched");
    return null;
  }

  candidates.sort((a, b) => b.score - a.score);
  const winner = candidates[0];
  console.log(`[asana] Active sprint: "${winner.name}" (Q${winner.q} ${winner.y}, gid=${winner.gid})`);

  // Step 3 — fetch full task to get notes
  const taskResp = await getTask(winner.gid, ["name", "notes", "due_on"]);

  if (!taskResp || !taskResp.notes) {
    console.error("[asana] get_task returned no notes");
    return null;
  }

  const parsed = parseSprintNotes(taskResp.notes);
  console.log(
    `[asana] Parsed Q${winner.q}: rev=$${parsed.quarterRevenueTarget?.toLocaleString() || "?"}, ` +
    `closing=${parsed.closingTarget || "?"}, profit/deal=$${parsed.profitPerDeal?.toLocaleString() || "?"}, ` +
    `months=${JSON.stringify(parsed.monthlyRevenue)}`
  );

  return {
    quarter: winner.q,
    year: winner.y,
    taskGid: winner.gid,
    taskName: winner.name,
    ...parsed,
  };
}

/**
 * Fetch all 4 quarters' sprints (best effort) so we have monthly goals for the entire year.
 * Used for cross-period dashboards (e.g., Q1 history + current quarter).
 */
export async function fetchAllSprintsThisYear(now = new Date()): Promise<SprintGoals[]> {
  const currentYear = now.getFullYear();
  const searchResp = await searchTasks("90 Day Sprint", ["name", "due_on", "completed", "gid"], 50);

  if (!searchResp || !searchResp.data || !Array.isArray(searchResp.data)) return [];

  const yearSprints: Array<{ gid: string; name: string; q: number; y: number }> = [];
  for (const t of searchResp.data) {
    if (!t.name || !t.gid) continue;
    if (!/90\s*Day\s*Sprint/i.test(t.name)) continue;
    const parsed = parseQuarterFromName(t.name);
    let q = parsed?.quarter ?? 0;
    let y = parsed?.year ?? 0;
    if (!q && t.due_on) {
      const d = new Date(t.due_on + "T00:00:00");
      q = quarterFromMonth(d.getMonth());
      y = d.getFullYear();
    }
    if (q && y === currentYear) {
      // Avoid duplicates — keep the most recent (incomplete > complete for same quarter)
      const existing = yearSprints.find((s) => s.q === q && s.y === y);
      if (!existing) yearSprints.push({ gid: t.gid, name: t.name, q, y });
    }
  }

  if (yearSprints.length === 0) return [];

  // Fetch each task in parallel
  const fullTasks = await Promise.all(
    yearSprints.map((s) =>
      getTask(s.gid, ["name", "notes", "due_on"]).then((task) => ({ s, task }))
    )
  );

  const out: SprintGoals[] = [];
  for (const { s, task } of fullTasks) {
    if (!task || !task.notes) continue;
    const parsed = parseSprintNotes(task.notes);
    out.push({
      quarter: s.q,
      year: s.y,
      taskGid: s.gid,
      taskName: s.name,
      ...parsed,
    });
  }

  console.log(`[asana] Fetched ${out.length} sprint(s) for ${currentYear}: ${out.map(s => `Q${s.quarter}`).join(", ")}`);
  return out;
}
