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

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = process.env.BOUNCIE_REFRESH_TOKEN;
  const clientId = process.env.BOUNCIE_CLIENT_ID;
  const clientSecret = process.env.BOUNCIE_CLIENT_SECRET;
  if (!refreshToken || !clientId || !clientSecret) {
    console.warn("[bouncie] missing env vars BOUNCIE_REFRESH_TOKEN / CLIENT_ID / CLIENT_SECRET");
    return null;
  }
  try {
    const resp = await fetch(BOUNCIE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        redirect_uri: "https://mths-kpi-api.onrender.com/api/bouncie/callback",
      }),
    });
    if (!resp.ok) {
      console.warn(`[bouncie] refresh failed ${resp.status}: ${await resp.text()}`);
      return null;
    }
    const j: any = await resp.json();
    cachedAccessToken = j.access_token;
    cachedAccessExpiresAt = Date.now() + (j.expires_in || 3600) * 1000 - 60_000;
    // If a new refresh token was issued, surface it so we can rotate
    if (j.refresh_token && j.refresh_token !== refreshToken) {
      console.log("[bouncie] new refresh token issued — update BOUNCIE_REFRESH_TOKEN env var");
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
}

export interface BouncieData {
  fetchedAt: string;
  windowDays: number;
  reps: BouncieRepStats[];
  vehiclesConnected: number;
  unmappedRepsNote: string[];
}

export async function fetchBouncieData(windowDays = 30): Promise<BouncieData> {
  const fetchedAt = new Date().toISOString();
  const empty: BouncieData = {
    fetchedAt,
    windowDays,
    reps: [],
    vehiclesConnected: 0,
    unmappedRepsNote: ["Brandon", "Jeff H", "Ryan", "Jonathan"],
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

  for (const v of vehicles) {
    const imei: string = v.imei;
    const rep = REP_BY_IMEI[imei];
    if (!rep) continue;
    if (!repStats[rep]) {
      repStats[rep] = {
        rep, imei,
        tripCount: 0, driveTimeMin: 0, idleTimeMin: 0, totalTimeMin: 0,
        distanceMi: 0, hardBrakes: 0, hardAccels: 0,
      };
    }
    try {
      const url = `${BOUNCIE_API}/trips?imei=${imei}&starts-after=${encodeURIComponent(startsAfter)}&gpsFormat=polyline`;
      const r = await fetch(url, { headers: { Authorization: token } });
      if (!r.ok) {
        console.warn(`[bouncie] trips ${imei} ${r.status}`);
        continue;
      }
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
    } catch (e: any) {
      console.warn(`[bouncie] trips err ${imei}: ${e?.message}`);
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
  };
}
