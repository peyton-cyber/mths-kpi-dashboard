/**
 * Google Sheets client — uses a service account to read live data
 * from Google Sheets directly via the official googleapis SDK.
 *
 * Replaces the previous Pipedream/external-tool CLI approach so the
 * dashboard can run on any host (Render, etc.) without Perplexity infra.
 *
 * Auth source: GOOGLE_SERVICE_ACCOUNT_JSON env var (full JSON blob).
 *   - In dev: read from a local key file path via GOOGLE_APPLICATION_CREDENTIALS.
 *   - In production (Render): paste the JSON contents into an env var.
 */
import { google, sheets_v4 } from "googleapis";
import { JWT } from "google-auth-library";

interface SheetRow {
  [key: string]: string;
  _rowNumber: string;
}

export interface SheetResponse {
  headers: string[];
  rows: SheetRow[];
  rowCount: number;
  _empty?: boolean;
}

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets.readonly"];

let _client: sheets_v4.Sheets | null = null;

function loadCredentials(): { client_email: string; private_key: string } {
  // Prefer GOOGLE_SERVICE_ACCOUNT_JSON (full JSON in one env var) for
  // production hosts where mounting a file is awkward.
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) {
    try {
      const parsed = JSON.parse(inline);
      if (parsed.client_email && parsed.private_key) {
        return {
          client_email: parsed.client_email,
          // Some env stores escape \n in private keys — normalize.
          private_key: parsed.private_key.replace(/\\n/g, "\n"),
        };
      }
    } catch (e) {
      throw new Error(
        `GOOGLE_SERVICE_ACCOUNT_JSON env var is not valid JSON: ${(e as Error).message}`
      );
    }
  }

  // Fallback: read from a file path (useful for local dev)
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs") as typeof import("fs");
    const parsed = JSON.parse(fs.readFileSync(path, "utf-8"));
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  throw new Error(
    "No Google credentials. Set GOOGLE_SERVICE_ACCOUNT_JSON (preferred) or GOOGLE_APPLICATION_CREDENTIALS (file path)."
  );
}

function getClient(): sheets_v4.Sheets {
  if (_client) return _client;
  const { client_email, private_key } = loadCredentials();
  const auth = new JWT({
    email: client_email,
    key: private_key,
    scopes: SCOPES,
  });
  _client = google.sheets({ version: "v4", auth });
  console.log(`[google-sheets] Authenticated as ${client_email}`);
  return _client;
}

/**
 * Fetch a single sheet/tab and return rows-as-objects keyed by header.
 * Output shape MUST match what fetchSheetsParallel previously returned so
 * downstream parsers don't need to change.
 */
async function fetchSingleSheet(
  spreadsheetId: string,
  sheetName: string
): Promise<SheetResponse> {
  const client = getClient();
  // Wrap sheet name in single quotes; escape any embedded single quotes.
  const range = `'${sheetName.replace(/'/g, "''")}'`;
  const resp = await client.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: "FORMATTED_VALUE",
    dateTimeRenderOption: "FORMATTED_STRING",
  });

  const values = (resp.data.values as string[][] | undefined) || [];
  if (values.length === 0) {
    return { headers: [], rows: [], rowCount: 0, _empty: true };
  }

  const headers = (values[0] || []).map((h) => String(h ?? "").trim());
  const rows: SheetRow[] = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const obj: SheetRow = { _rowNumber: String(i + 1) };
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j];
      if (!key) continue;
      // Cell may be undefined when shorter than the header row
      obj[key] = row[j] != null ? String(row[j]) : "";
    }
    rows.push(obj);
  }
  return { headers, rows, rowCount: rows.length };
}

/**
 * Validate response has expected shape — same logic the old worker used.
 * Empty sheets count as a "soft fail" so we retry; truly empty tabs are rare.
 */
function isValidSheetResponse(parsed: SheetResponse | null): boolean {
  if (!parsed) return false;
  if (!Array.isArray(parsed.headers) || !Array.isArray(parsed.rows)) return false;
  if (parsed.headers.length === 0) return false;
  if (parsed.rows.length === 0) return false;
  const firstRow = parsed.rows[0];
  if (!firstRow || typeof firstRow !== "object") return false;
  return Object.values(firstRow).some(
    (v) => v !== null && v !== "" && v !== undefined
  );
}

/**
 * Fetch many sheets in parallel with retries, mirroring the previous
 * fetchSheetsParallel contract exactly.
 */
export async function fetchSheetsParallel(
  requests: { label: string; spreadsheetId: string; sheetName: string }[]
): Promise<Record<string, SheetResponse>> {
  const MAX_RETRIES = 4;

  async function withRetry(req: {
    label: string;
    spreadsheetId: string;
    sheetName: string;
  }): Promise<{ label: string; data: SheetResponse; ok: boolean }> {
    let lastErr: any = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const data = await fetchSingleSheet(req.spreadsheetId, req.sheetName);
        if (isValidSheetResponse(data) || data._empty) {
          return { label: req.label, data, ok: true };
        }
        if (attempt === 1) {
          console.error(
            `[google-sheets] ${req.label} bad shape (headers=${data.headers.length}, rows=${data.rows.length})`
          );
        }
      } catch (err: any) {
        lastErr = err;
        const code = err?.code || err?.response?.status || "?";
        const msg = (err?.message || "").slice(0, 200);
        if (attempt === 1) {
          console.error(`[google-sheets] ${req.label} err ${code}: ${msg}`);
        }
        // Don't retry on 401/403/404 — credentials/permission issues won't fix themselves
        if (code === 401 || code === 403 || code === 404) {
          break;
        }
      }
      if (attempt < MAX_RETRIES) {
        const delay = 500 * Math.pow(2, attempt - 1) + Math.random() * 500;
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    console.error(
      `[google-sheets] ${req.label} FAILED after ${MAX_RETRIES} attempts${
        lastErr ? `: ${(lastErr.message || "").slice(0, 150)}` : ""
      }`
    );
    return {
      label: req.label,
      data: { headers: [], rows: [], rowCount: 0, _empty: true },
      ok: false,
    };
  }

  const results = await Promise.all(requests.map(withRetry));
  const out: Record<string, SheetResponse> = {};
  const failed: string[] = [];
  for (const r of results) {
    out[r.label] = r.data;
    if (!r.ok) failed.push(r.label);
  }
  if (failed.length > 0) {
    console.error(
      `[google-sheets] ${failed.length} sheets failed after retries: ${failed.join(", ")}`
    );
    (out as any)._failed = failed;
  }
  return out;
}
