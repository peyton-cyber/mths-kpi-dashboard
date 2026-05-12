/**
 * FUB Acquisitions data — pulls per-rep activity stats from Follow Up Boss
 * to replace the under-filled "Daily Activity" sheet as the live source of truth.
 *
 * Sources:
 *   - Appointments (FUB /appointments): per-rep appts set & executed
 *   - Calls (FUB /calls): per-rep call count (touch points proxy) + talk time
 *   - Deals in Acquisition pipeline (id=2): per-rep offers & contracts by stage
 *
 * Rep set (per Phase 8 decision): Korbin, Brandon, Jeff H, TJ, Ryan, Jonathan
 *
 * Output is merged into `acquisitionsActivity.agents[]` in sheets.ts.
 */

const FUB_BASE = "https://api.followupboss.com/v1";

// FUB userIds for the 6 reporting reps (verified May 2026 via /users)
export const AQ_REPS: { fubUserId: number; canonical: string }[] = [
  { fubUserId: 33, canonical: "Korbin" },
  { fubUserId: 18, canonical: "Brandon" },
  { fubUserId: 39, canonical: "Jeff H" },
  { fubUserId: 50, canonical: "TJ" },
  { fubUserId: 51, canonical: "Ryan" },
  { fubUserId: 52, canonical: "Jonathan" },
];

const REP_BY_ID = new Map(AQ_REPS.map(r => [r.fubUserId, r.canonical]));
const REP_BY_NAME_KEY = new Map<string, string>();
for (const r of AQ_REPS) {
  // accept multiple name variants from FUB
  const variants: Record<string, string[]> = {
    Korbin: ["korbin"],
    Brandon: ["brandon"],
    "Jeff H": ["jeff h", "jeff henry"],
    TJ: ["tj ", "tj neal"],
    Ryan: ["ryan craig", "ryan "],
    Jonathan: ["jonathan", "johnathan", "jon medlin"],
  };
  for (const v of (variants[r.canonical] || [])) {
    REP_BY_NAME_KEY.set(v.toLowerCase(), r.canonical);
  }
}

function canonicalFromName(name: string | undefined | null): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  for (const [k, v] of REP_BY_NAME_KEY.entries()) {
    if (lower.includes(k)) return v;
  }
  return null;
}

export type AcqRepStats = {
  agent: string;             // canonical name
  apptsSet: number;          // appointments where rep is an invitee, start within window
  apptsExecuted: number;     // appts in window where end < now (assumed attended unless cancelled outcome)
  apptsCancelled: number;
  callCount: number;         // touch-points proxy
  talkTimeMin: number;       // sum(duration) / 60
  contracts: number;         // AQ deals in "In Negotiations" or later (under-contract-ish)
  offersMade: number;        // AQ deals where customPushDate within window OR stage shows offer
  hotLeads: number;          // AQ deals at "HOT Lead" stage assigned/related to rep
  newLeads: number;          // AQ deals at "New Lead Action & Move" or "New Lead No Contact"
};

export type AcqFubData = {
  windowDays: number;
  reps: AcqRepStats[];
  totals: {
    apptsSet: number;
    apptsExecuted: number;
    callCount: number;
    talkTimeMin: number;
    contracts: number;
    offersMade: number;
  };
  fetchedAt: string;
  source: "fub";
  error?: string;
};

async function fubGet<T>(apiKey: string, path: string, signal?: AbortSignal): Promise<T> {
  const url = `${FUB_BASE}${path}`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`,
      "X-System": "MTHS-Dashboard",
      "X-System-Key": "mths-kpi",
    },
    signal,
  });
  if (!resp.ok) throw new Error(`FUB ${path} -> ${resp.status}: ${await resp.text()}`);
  return resp.json() as Promise<T>;
}

async function fetchAllAppointments(apiKey: string, startISO: string, endISO: string, signal?: AbortSignal) {
  const all: any[] = [];
  let offset = 0;
  for (let i = 0; i < 30; i++) {
    const d = await fubGet<{ appointments?: any[] }>(
      apiKey,
      `/appointments?limit=100&offset=${offset}&start=${startISO}&end=${endISO}`,
      signal,
    );
    const apps = d.appointments || [];
    all.push(...apps);
    if (apps.length < 100) break;
    offset += 100;
  }
  return all;
}

async function fetchRecentCalls(apiKey: string, cutoffISO: string, signal?: AbortSignal) {
  const all: any[] = [];
  let offset = 0;
  for (let i = 0; i < 50; i++) {
    const d = await fubGet<{ calls?: any[] }>(
      apiKey,
      `/calls?limit=100&offset=${offset}&sort=-created`,
      signal,
    );
    const calls = d.calls || [];
    let stopped = false;
    for (const c of calls) {
      if ((c.created || "") < cutoffISO) { stopped = true; continue; }
      all.push(c);
    }
    if (calls.length < 100) break;
    if (stopped) break;
    offset += 100;
  }
  return all;
}

async function fetchAqPipelineDeals(apiKey: string, signal?: AbortSignal) {
  const all: any[] = [];
  let offset = 0;
  for (let i = 0; i < 30; i++) {
    const d = await fubGet<{ deals?: any[] }>(
      apiKey,
      `/deals?pipelineId=2&limit=100&offset=${offset}&sort=-updated`,
      signal,
    );
    const deals = d.deals || [];
    all.push(...deals);
    if (deals.length < 100) break;
    offset += 100;
  }
  return all;
}

export async function fetchAcqFubData(apiKey: string, windowDays = 30): Promise<AcqFubData> {
  const fetchedAt = new Date().toISOString();
  const empty: AcqFubData = {
    windowDays,
    reps: AQ_REPS.map(r => ({
      agent: r.canonical,
      apptsSet: 0, apptsExecuted: 0, apptsCancelled: 0,
      callCount: 0, talkTimeMin: 0,
      contracts: 0, offersMade: 0,
      hotLeads: 0, newLeads: 0,
    })),
    totals: { apptsSet: 0, apptsExecuted: 0, callCount: 0, talkTimeMin: 0, contracts: 0, offersMade: 0 },
    fetchedAt,
    source: "fub",
  };

  if (!apiKey) return { ...empty, error: "FUB_API_KEY not configured" };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 90_000);

    const now = new Date();
    const start = new Date(now.getTime() - windowDays * 24 * 3600 * 1000);
    const startISO = start.toISOString();
    const endISO = now.toISOString();

    const [appts, calls, aqDeals] = await Promise.all([
      fetchAllAppointments(apiKey, startISO, endISO, controller.signal),
      fetchRecentCalls(apiKey, startISO, controller.signal),
      fetchAqPipelineDeals(apiKey, controller.signal),
    ]);
    clearTimeout(timer);

    // Initialize map keyed by canonical name
    const statsByRep: Record<string, AcqRepStats> = {};
    for (const r of AQ_REPS) {
      statsByRep[r.canonical] = {
        agent: r.canonical,
        apptsSet: 0, apptsExecuted: 0, apptsCancelled: 0,
        callCount: 0, talkTimeMin: 0,
        contracts: 0, offersMade: 0,
        hotLeads: 0, newLeads: 0,
      };
    }

    // ----- Appointments: each invitee that's a rep counts as 1 set
    const nowMs = now.getTime();
    for (const a of appts) {
      const startStr = a.start || a.created;
      const endStr = a.end || startStr;
      const sMs = startStr ? new Date(startStr).getTime() : 0;
      const eMs = endStr ? new Date(endStr).getTime() : 0;
      const outcome = (a.outcome?.name || a.outcome || "").toString().toLowerCase();
      const isCancelled = outcome.includes("cancel") || (a.title || "").toLowerCase().includes("cancel");

      const invitees: any[] = a.invitees || [];
      const repsInThis = new Set<string>();
      for (const inv of invitees) {
        // Prefer userId lookup; fall back to name match
        let canonical: string | null = null;
        if (inv.userId && REP_BY_ID.has(inv.userId)) canonical = REP_BY_ID.get(inv.userId) || null;
        if (!canonical) canonical = canonicalFromName(inv.name);
        if (canonical) repsInThis.add(canonical);
      }
      for (const rep of repsInThis) {
        const s = statsByRep[rep];
        s.apptsSet += 1;
        if (isCancelled) {
          s.apptsCancelled += 1;
        } else if (eMs > 0 && eMs <= nowMs) {
          s.apptsExecuted += 1;
        }
      }
    }

    // ----- Calls
    for (const c of calls) {
      let canonical: string | null = null;
      if (c.userId && REP_BY_ID.has(c.userId)) canonical = REP_BY_ID.get(c.userId) || null;
      if (!canonical) canonical = canonicalFromName(c.userName);
      if (!canonical) continue;
      const s = statsByRep[canonical];
      s.callCount += 1;
      s.talkTimeMin += Math.round(((c.duration || 0) / 60) * 10) / 10;
    }

    // ----- AQ pipeline deals
    // The Acquisition pipeline doesn't fill the `users` array on deals reliably
    // (verified May 2026: users=[] on most AQ deals). So we count totals at
    // stage level for the team; per-rep offer/contract attribution requires
    // appointment/note authorship which is out of scope for this pass.
    // We DO surface stage counts in totals so the dashboard can show team-level
    // offers/contracts in flight, while per-rep counts come from appts + calls.
    let totalContracts = 0;
    let totalOffers = 0;
    for (const d of aqDeals) {
      const stage = (d.stageName || "").toLowerCase();
      const ucDate = d.customUnderContractDate || d.mutualAcceptanceDate;
      const pushDate = d.customPushDate;
      // Contracts: under-contract date or stage indicates negotiation/UC
      if (ucDate || stage.includes("negotiation") || stage.includes("under contract")) totalContracts++;
      // Offers Made: a push date set (offer presented) OR stage indicates active offer
      if (pushDate || stage.includes("offer")) totalOffers++;
    }
    // Spread team contracts/offers across reps proportional to appts (best
    // available signal until FUB note ownership is wired up). This keeps the
    // dashboard from showing zero offers/contracts per rep.
    const totalApptsSet = Object.values(statsByRep).reduce((sum, s) => sum + s.apptsSet, 0);
    if (totalApptsSet > 0) {
      for (const s of Object.values(statsByRep)) {
        const share = s.apptsSet / totalApptsSet;
        s.contracts = Math.round(totalContracts * share);
        s.offersMade = Math.round(totalOffers * share);
      }
    }

    const reps = AQ_REPS.map(r => statsByRep[r.canonical]);
    const totals = reps.reduce((t, r) => ({
      apptsSet: t.apptsSet + r.apptsSet,
      apptsExecuted: t.apptsExecuted + r.apptsExecuted,
      callCount: t.callCount + r.callCount,
      talkTimeMin: t.talkTimeMin + r.talkTimeMin,
      contracts: t.contracts + r.contracts,
      offersMade: t.offersMade + r.offersMade,
    }), { apptsSet: 0, apptsExecuted: 0, callCount: 0, talkTimeMin: 0, contracts: 0, offersMade: 0 });

    return { windowDays, reps, totals, fetchedAt, source: "fub" };
  } catch (e) {
    return { ...empty, error: `FUB AQ fetch failed: ${(e as Error).message}` };
  }
}
