// Bouncie OAuth + trip data fetcher.
// Tokens are stored in process.env at runtime (Render env vars) for cold-restart
// persistence. Access token is refreshed automatically when it expires.

const BOUNCIE_TOKEN_URL = "https://auth.bouncie.com/oauth/token";
const BOUNCIE_API = "https://api.bouncie.dev/v1";

// Rep -> IMEI mapping. Add more as new Bouncie devices are paired.
// Vehicles currently connected (verified via /v1/vehicles):
//   TJ Neal        -> 865612074154697 (Ford F-150 2025)
//   Korbin Hoffmann -> 865612074173457 (Ford Ranger 2020)
const REP_BY_IMEI: Record<string, string> = {
  "865612074154697": "TJ",
  "865612074173457": "Korbin",
};

let cachedAccessToken: string | null = null;
let cachedAccessExpiresAt = 0;
// Bouncie rotates refresh tokens on every refresh call. We hold the latest one
// in process memory AND persist it back to Render env vars so it survives cold
// starts on the free tier (which spins down the process after 15min idle).
let currentRefreshToken: string | null = null;
let pendingPersist: Promise<void> | null = null;

/**
 * Persist rotated Bouncie tokens back to Render env vars so the next cold
 * start can authenticate. Without this, the free-tier spin-down loses the
 * in-memory token and the next refresh fails with invalid_grant 403.
 *
 * Requires RENDER_API_KEY and RENDER_SERVICE_ID env vars (set on Render).
 * NOTE: Updating env vars via the Render API does NOT trigger a redeploy
 * (verified — the API returns the updated value but the service keeps running).
 */
async function persistTokensToRender(refreshToken: string, accessToken: string, expiresAt: number): Promise<void> {
  const renderKey = process.env.RENDER_API_KEY;
  const serviceId = process.env.RENDER_SERVICE_ID;
  if (!renderKey || !serviceId) {
    console.warn("[bouncie] cannot persist tokens — RENDER_API_KEY or RENDER_SERVICE_ID not set");
    return;
  }
  // Coalesce concurrent persist calls
  if (pendingPersist) return pendingPersist;
  pendingPersist = (async () => {
    const updates: Array<[string, string]> = [
      ["BOUNCIE_REFRESH_TOKEN", refreshToken],
      ["BOUNCIE_ACCESS_TOKEN_SEED", accessToken],
      ["BOUNCIE_ACCESS_EXPIRES_AT", String(expiresAt)],
    ];
    for (const [key, value] of updates) {
      try {
        const r = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars/${key}`, {
          method: "PUT",
          headers: { "Authorization": `Bearer ${renderKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
        if (!r.ok) console.warn(`[bouncie] persist ${key} failed: ${r.status} ${await r.text()}`);
      } catch (e: any) {
        console.warn(`[bouncie] persist ${key} error: ${e?.message}`);
      }
    }
    console.log(`[bouncie] persisted rotated tokens to Render env vars (refresh + access seed)`);
  })();
  try { await pendingPersist; } finally { pendingPersist = null; }
}

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = currentRefreshToken || process.env.BOUNCIE_REFRESH_TOKEN || null;
  const clientId = process.env.BOUNCIE_CLIENT_ID;
  const clientSecret = process.env.BOUNCIE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    console.warn("[bouncie] missing env vars BOUNCIE_REFRESH_TOKEN / CLIENT_ID / CLIENT_SECRET");
    return null;
  }
  try {
    // Bouncie's OAuth server REQUIRES application/x-www-form-urlencoded body
    // (RFC 6749). Sending JSON returns invalid_grant 403.
    const params = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      redirect_uri: "https://mths-kpi-api.onrender.com/api/bouncie/callback",
    });
    const resp = await fetch(BOUNCIE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });
    if (!resp.ok) {
      console.warn(`[bouncie] refresh failed ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const j: any = await resp.json();
    cachedAccessToken = j.access_token;
    cachedAccessExpiresAt = Date.now() + (j.expires_in || 3600) * 1000 - 60_000;
    // Bouncie rotates refresh tokens — keep the latest one in memory AND persist
    // back to Render env vars so it survives cold starts.
    if (j.refresh_token && j.refresh_token !== refreshToken) {
      currentRefreshToken = j.refresh_token;
      console.log(`[bouncie] refresh token rotated, persisting to Render env vars`);
      // Fire and forget — don't block the caller on persistence.
      persistTokensToRender(j.refresh_token, j.access_token, cachedAccessExpiresAt).catch(e =>
        console.warn(`[bouncie] persist failed: ${e?.message}`)
      );
    }
    return cachedAccessToken;
  } catch (e: any) {
    console.warn(`[bouncie] refresh error: ${e?.message}`);
    return null;
  }
}

async function getAccessToken(): Promise<string | null> {
  // Use seed access token from env if cache empty and seed is still valid
  if (!cachedAccessToken && process.env.BOUNCIE_ACCESS_TOKEN_SEED) {
    cachedAccessToken = process.env.BOUNCIE_ACCESS_TOKEN_SEED;
    cachedAccessExpiresAt = Number(process.env.BOUNCIE_ACCESS_EXPIRES_AT || 0);
  }
  if (cachedAccessToken && Date.now() < cachedAccessExpiresAt) {
    return cachedAccessToken;
  }
  return await refreshAccessToken();
}

export interface BouncieRepStats {
  rep: string;
  imei: string;
  tripCount: number;
  driveTimeMin: number;   // total moving time
  idleTimeMin: number;    // total idle (engine on, not moving) — "windshield" time
  totalTimeMin: number;   // drive + idle
  distanceMi: number;
  hardBrakes: number;
  hardAccels: number;
  source: "trips" | "history-fallback" | "unavailable";
  fallbackNote?: string;
}

export interface BouncieLocation {
  rep: string;
  imei: string;
  vehicle: string;       // e.g. "Ford F-150 2025"
  lat: number;
  lng: number;
  heading: number;       // degrees 0-360
  speed: number;         // mph (Bouncie returns mph in US accounts)
  isRunning: boolean;
  fuelLevel: number;     // percent 0-100
  odometer: number;
  lastUpdated: string;   // ISO timestamp
}

export interface BouncieData {
  fetchedAt: string;
  windowDays: number;
  reps: BouncieRepStats[];
  vehiclesConnected: number;
  unmappedRepsNote: string[];
  locations: BouncieLocation[];
}

export async function fetchBouncieData(windowDays = 30): Promise<BouncieData> {
  const fetchedAt = new Date().toISOString();
  const empty: BouncieData = {
    fetchedAt,
    windowDays,
    reps: [],
    vehiclesConnected: 0,
    unmappedRepsNote: ["Brandon", "Jeff H", "Ryan", "Jonathan"],
    locations: [],
  };
  const token = await getAccessToken();
  if (!token) return empty;

  // List vehicles to confirm which are active and which IMEIs to query
  let vehicles: any[] = [];
  try {
    const r = await fetch(`${BOUNCIE_API}/vehicles`, { headers: { Authorization: token } });
    if (!r.ok) {
      console.warn(`[bouncie] vehicles ${r.status}`);
      return empty;
    }
    vehicles = await r.json();
  } catch (e: any) {
    console.warn(`[bouncie] vehicles err: ${e?.message}`);
    return empty;
  }

  const startsAfter = new Date(Date.now() - windowDays * 24 * 3600 * 1000).toISOString();
  const repStats: Record<string, BouncieRepStats> = {};

  const locations: BouncieLocation[] = [];
  for (const v of vehicles) {
    const imei: string = v.imei;
    const rep = REP_BY_IMEI[imei];
    if (!rep) continue;
    if (!repStats[rep]) {
      repStats[rep] = {
        rep, imei,
        tripCount: 0, driveTimeMin: 0, idleTimeMin: 0, totalTimeMin: 0,
        distanceMi: 0, hardBrakes: 0, hardAccels: 0,
        source: "trips",
      };
    }
    // Capture live location from /vehicles stats block
    const loc = v?.stats?.location;
    if (loc?.lat != null && loc?.lon != null) {
      locations.push({
        rep,
        imei,
        vehicle: `${v?.model?.make || ""} ${v?.model?.name || ""} ${v?.model?.year || ""}`.trim(),
        lat: Number(loc.lat),
        lng: Number(loc.lon),
        heading: Number(loc.heading || 0),
        speed: Number(v?.stats?.speed || 0),
        isRunning: Boolean(v?.stats?.isRunning),
        fuelLevel: Math.round(Number(v?.stats?.fuelLevel || 0)),
        odometer: Math.round(Number(v?.stats?.odometer || 0)),
        lastUpdated: v?.stats?.lastUpdated || fetchedAt,
      });
    }
    let tripsLoaded = false;
    try {
      const url = `${BOUNCIE_API}/trips?imei=${imei}&starts-after=${encodeURIComponent(startsAfter)}&gpsFormat=polyline`;
      const r = await fetch(url, { headers: { Authorization: token } });
      if (r.ok) {
        const trips: any[] = await r.json();
        for (const t of trips) {
          const startMs = new Date(t.startTime).getTime();
          const endMs = new Date(t.endTime).getTime();
          const totalSec = Math.max(0, (endMs - startMs) / 1000);
          const idleSec = t.totalIdleDuration || 0;
          const driveSec = Math.max(0, totalSec - idleSec);
          repStats[rep].tripCount += 1;
          repStats[rep].driveTimeMin += driveSec / 60;
          repStats[rep].idleTimeMin += idleSec / 60;
          repStats[rep].totalTimeMin += totalSec / 60;
          repStats[rep].distanceMi += t.distance || 0;
          repStats[rep].hardBrakes += t.hardBrakingCount || 0;
          repStats[rep].hardAccels += t.hardAccelerationCount || 0;
        }
        tripsLoaded = true;
      } else {
        console.warn(`[bouncie] trips ${imei} ${r.status} — attempting GPS-history fallback`);
      }
    } catch (e: any) {
      console.warn(`[bouncie] trips err ${imei}: ${e?.message} — attempting GPS-history fallback`);
    }

    // ----------------------------------------------------------------
    // GPS-history fallback. /trips has been HTTP 500 since 5/18 — we
    // estimate drive time from raw GPS pings instead. Bouncie exposes
    // location history via two possible endpoints (we try both):
    //   1. /vehicles/{imei}/locations?starts-after=...
    //   2. /locations?imei={imei}&starts-after=...
    // We reconstruct trips by clustering pings: a trip starts when the
    // vehicle moves (>0 mph or position changed) and ends after a 5min
    // gap of no movement. Distance is summed via great-circle between
    // consecutive moving pings.
    // ----------------------------------------------------------------
    if (!tripsLoaded) {
      const fallbackResult = await reconstructTripsFromHistory(
        token, imei, startsAfter, fetchedAt,
      );
      if (fallbackResult) {
        const s = repStats[rep];
        s.tripCount += fallbackResult.tripCount;
        s.driveTimeMin += fallbackResult.driveTimeMin;
        s.idleTimeMin += fallbackResult.idleTimeMin;
        s.totalTimeMin += fallbackResult.totalTimeMin;
        s.distanceMi += fallbackResult.distanceMi;
        s.source = "history-fallback";
        s.fallbackNote = `estimated from ${fallbackResult.pingCount} GPS pings (Bouncie /trips returning 500)`;
      } else {
        repStats[rep].source = "unavailable";
        repStats[rep].fallbackNote = "Bouncie /trips and /locations endpoints both unavailable";
      }
    }
  }

  // Round everything
  for (const s of Object.values(repStats)) {
    s.driveTimeMin = Math.round(s.driveTimeMin);
    s.idleTimeMin = Math.round(s.idleTimeMin);
    s.totalTimeMin = Math.round(s.totalTimeMin);
    s.distanceMi = Math.round(s.distanceMi);
  }

  return {
    fetchedAt,
    windowDays,
    reps: Object.values(repStats),
    vehiclesConnected: vehicles.length,
    unmappedRepsNote: ["Brandon", "Jeff H", "Ryan", "Jonathan"].filter(
      r => !Object.values(REP_BY_IMEI).includes(r)
    ),
    locations,
  };
}

// ============================================================
// GPS history -> reconstructed trips.
// Tries two Bouncie endpoints in order; returns null if both fail.
// ============================================================
interface ReconstructedTrips {
  tripCount: number;
  driveTimeMin: number;
  idleTimeMin: number;
  totalTimeMin: number;
  distanceMi: number;
  pingCount: number;
}

async function reconstructTripsFromHistory(
  token: string,
  imei: string,
  startsAfter: string,
  _fetchedAt: string,
): Promise<ReconstructedTrips | null> {
  // Try multiple endpoints (Bouncie has changed paths historically)
  const endpoints = [
    `${BOUNCIE_API}/vehicles/${imei}/locations?starts-after=${encodeURIComponent(startsAfter)}`,
    `${BOUNCIE_API}/locations?imei=${imei}&starts-after=${encodeURIComponent(startsAfter)}`,
  ];
  let pings: any[] | null = null;
  const probeResults: string[] = [];
  for (const url of endpoints) {
    try {
      const r = await fetch(url, { headers: { Authorization: token } });
      const shortUrl = url.replace(BOUNCIE_API, "").split("?")[0];
      if (r.ok) {
        const j = await r.json();
        pings = Array.isArray(j) ? j : (j?.locations || j?.data || null);
        const count = pings?.length || 0;
        probeResults.push(`${shortUrl}=200(${count})`);
        if (pings && pings.length > 0) break;
      } else {
        probeResults.push(`${shortUrl}=${r.status}`);
      }
    } catch (e: any) {
      probeResults.push(`err:${e?.message?.slice(0, 40)}`);
    }
  }
  console.log(`[bouncie] history-fallback ${imei}: ${probeResults.join(" | ")}`);
  if (!pings || pings.length === 0) return null;

  // Normalize and sort
  const norm = pings
    .map(p => ({
      ts: new Date(p.timestamp || p.time || p.lastUpdated || 0).getTime(),
      lat: Number(p.lat ?? p.latitude),
      lng: Number(p.lon ?? p.lng ?? p.longitude),
      speed: Number(p.speed ?? 0),
    }))
    .filter(p => p.ts > 0 && Number.isFinite(p.lat) && Number.isFinite(p.lng))
    .sort((a, b) => a.ts - b.ts);

  if (norm.length < 2) return null;

  // Cluster into trips: gap >= 5 min of no movement starts a new trip
  const TRIP_GAP_MS = 5 * 60 * 1000;
  const MOVING_SPEED_MPH = 2; // below this, treat as idle
  type Trip = { startTs: number; endTs: number; driveSec: number; idleSec: number; distanceMi: number };
  const trips: Trip[] = [];
  let cur: Trip | null = null;

  function haversineMi(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
    const R = 3959;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const aa = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(aa));
  }

  for (let i = 0; i < norm.length; i++) {
    const p = norm[i];
    if (!cur) {
      cur = { startTs: p.ts, endTs: p.ts, driveSec: 0, idleSec: 0, distanceMi: 0 };
      continue;
    }
    const gap = p.ts - cur.endTs;
    if (gap > TRIP_GAP_MS) {
      // close current trip if it has duration
      if (cur.endTs - cur.startTs > 60_000) trips.push(cur);
      cur = { startTs: p.ts, endTs: p.ts, driveSec: 0, idleSec: 0, distanceMi: 0 };
      continue;
    }
    const prev = norm[i - 1];
    const dtSec = (p.ts - prev.ts) / 1000;
    const dist = haversineMi(prev, p);
    const moving = p.speed >= MOVING_SPEED_MPH || dist > 0.05;
    if (moving) {
      cur.driveSec += dtSec;
      cur.distanceMi += dist;
    } else {
      cur.idleSec += dtSec;
    }
    cur.endTs = p.ts;
  }
  if (cur && cur.endTs - cur.startTs > 60_000) trips.push(cur);

  const driveTimeMin = trips.reduce((s, t) => s + t.driveSec / 60, 0);
  const idleTimeMin = trips.reduce((s, t) => s + t.idleSec / 60, 0);
  const distanceMi = trips.reduce((s, t) => s + t.distanceMi, 0);

  return {
    tripCount: trips.length,
    driveTimeMin,
    idleTimeMin,
    totalTimeMin: driveTimeMin + idleTimeMin,
    distanceMi,
    pingCount: norm.length,
  };
}
