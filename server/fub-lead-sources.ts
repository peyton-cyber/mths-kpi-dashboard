// Lead-source attribution: people created in window, grouped by source,
// joined with marketing spend (sheet) and AQ pipeline outcomes.

interface LeadSourceMetrics {
  source: string;       // normalized
  leads: number;        // people created in window with this source
  appts: number;        // people who have an appointment scheduled in window
  contracts: number;    // people who entered AQ "Under Contract" stage in window
  spend: number;        // matched from marketing-spend sheet by channel
  cac: number;          // spend / contracts
  cpl: number;          // spend / leads
}

// Normalize FUB source strings to a small set of marketing channels.
// Keep canonical names aligned with sheet "Channel" values.
function normalizeSource(raw: string): string {
  const s = (raw || "").toLowerCase().trim();
  if (!s) return "Unknown";
  if (s.includes("ppl") || s.includes("property leads")) return "PPL";
  if (s.includes("google")) return "Google PPC";
  if (s.includes("facebook") || s.includes("fb ad") || s.includes("fb retarget")) return "Facebook";
  if (s.includes("tv ad") || s === "tv") return "TV";
  if (s.includes("radio")) return "Radio";
  if (s.includes("referr") || s.includes("relationship")) return "Referral";
  if (s.includes("outreach")) return "Outreach";
  if (s.includes("mytennesseehomesolution") || s.includes("website")) return "Organic Web";
  if (s.includes("yard sign") || s.includes("billboard") || s.includes("direct mail")) return "Print/Signage";
  if (s.includes("mevlo")) return "Mevlo";
  return raw.length > 28 ? raw.slice(0, 28) + "…" : raw;
}

async function fubGet(apiKey: string, path: string, signal?: AbortSignal): Promise<any> {
  const auth = Buffer.from(`${apiKey}:`).toString("base64");
  const r = await fetch(`https://api.followupboss.com${path}`, {
    headers: { Authorization: `Basic ${auth}`, "X-System": "MTHS" },
    signal,
  });
  if (!r.ok) throw new Error(`FUB ${r.status} ${path}`);
  return r.json();
}

async function paginate<T>(apiKey: string, basePath: string, key: string, signal?: AbortSignal, maxPages = 20): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  const limit = 100;
  for (let i = 0; i < maxPages; i++) {
    const sep = basePath.includes("?") ? "&" : "?";
    const j = await fubGet(apiKey, `${basePath}${sep}limit=${limit}&offset=${offset}`, signal);
    const items = j[key] || [];
    out.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return out;
}

export interface FubLeadSourceData {
  windowDays: number;
  fetchedAt: string;
  sources: LeadSourceMetrics[];
  totalLeads: number;
  totalContracts: number;
  totalSpend: number;
  error?: string;
}

export async function fetchLeadSourceData(
  apiKey: string,
  spendByChannel: Map<string, number>,
  windowDays = 90,
): Promise<FubLeadSourceData> {
  const fetchedAt = new Date().toISOString();
  const empty: FubLeadSourceData = {
    windowDays, fetchedAt, sources: [], totalLeads: 0, totalContracts: 0, totalSpend: 0,
  };
  if (!apiKey) return { ...empty, error: "FUB_API_KEY not configured" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const startMs = Date.now() - windowDays * 24 * 3600 * 1000;
    const startISO = new Date(startMs).toISOString();

    // Pull recent people (created in window). We sort by -created and stop
    // when we hit our cutoff to keep page count low.
    const people: any[] = [];
    {
      let offset = 0;
      const limit = 100;
      for (let page = 0; page < 30; page++) {
        const j = await fubGet(apiKey, `/v1/people?limit=${limit}&offset=${offset}&sort=-created`, controller.signal);
        const batch = j.people || [];
        if (!batch.length) break;
        let crossedCutoff = false;
        for (const p of batch) {
          const c = p.created ? new Date(p.created).getTime() : 0;
          if (c < startMs) { crossedCutoff = true; continue; }
          people.push(p);
        }
        if (crossedCutoff || batch.length < limit) break;
        offset += limit;
      }
    }

    // Pull deals from Underwriting (14) and Disposition (1) pipelines.
    // Reason: this team's contract signal is when a deal CROSSES OVER from AQ
    // pipeline (id=2) into Underwriting (id=14). Sometimes deals fast-track
    // into Disposition (id=1) directly. The legacy approach checked
    // d.stage === "Under Contract" inside the AQ pipeline, but FUB's `stage`
    // field is always null for this org and the AQ pipeline has no
    // "Under Contract" stage, so the count was always 0.
    const [uwDeals, dispoDeals] = await Promise.all([
      paginate<any>(apiKey, `/v1/deals?pipelineId=14&sort=-updated`, "deals", controller.signal, 10),
      paginate<any>(apiKey, `/v1/deals?pipelineId=1&sort=-updated`, "deals", controller.signal, 10),
    ]);
    const contractDeals = [...uwDeals, ...dispoDeals];

    clearTimeout(timer);

    // Map peopleId -> source for contracts attribution
    const sourceByPerson = new Map<number, string>();
    const buckets = new Map<string, LeadSourceMetrics>();
    function bucket(src: string): LeadSourceMetrics {
      if (!buckets.has(src)) {
        buckets.set(src, { source: src, leads: 0, appts: 0, contracts: 0, spend: 0, cac: 0, cpl: 0 });
      }
      return buckets.get(src)!;
    }

    for (const p of people) {
      const src = normalizeSource(p.source || "");
      sourceByPerson.set(p.id, src);
      const b = bucket(src);
      b.leads += 1;
      if ((p.appointmentCount || 0) > 0) b.appts += 1;
    }

    // Count contracts in window — a deal entered Underwriting or Disposition
    // pipeline within the window. Dedupe by deal id in case the same deal
    // crossed both pipelines.
    const cutoffMs = startMs;
    const counted = new Set<number>();
    for (const d of contractDeals) {
      if (!d?.id || counted.has(d.id)) continue;
      const entered = d.enteredStageAt
        ? new Date(d.enteredStageAt).getTime()
        : (d.created ? new Date(d.created).getTime() : 0);
      if (!entered || entered < cutoffMs) continue;
      const pid = d.people?.[0]?.id;
      if (!pid) continue;
      const src = sourceByPerson.get(pid);
      if (src) {
        bucket(src).contracts += 1;
        counted.add(d.id);
      }
    }

    // Attach spend from sheet
    for (const b of buckets.values()) {
      b.spend = spendByChannel.get(b.source) || 0;
      b.cac = b.contracts > 0 ? Math.round(b.spend / b.contracts) : 0;
      b.cpl = b.leads > 0 ? Math.round(b.spend / b.leads) : 0;
    }

    const sources = Array.from(buckets.values())
      .filter(b => b.leads > 0 || b.spend > 0)
      .sort((a, b) => b.leads - a.leads);

    return {
      windowDays, fetchedAt, sources,
      totalLeads: sources.reduce((s, x) => s + x.leads, 0),
      totalContracts: sources.reduce((s, x) => s + x.contracts, 0),
      totalSpend: sources.reduce((s, x) => s + x.spend, 0),
    };
  } catch (e: any) {
    clearTimeout(timer);
    return { ...empty, error: `lead-source fetch: ${(e?.message || "unknown").slice(0, 200)}` };
  }
}
