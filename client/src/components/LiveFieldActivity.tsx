/**
 * LiveFieldActivity — map + windshield-time card for the Acquisitions tab.
 *
 * Today this renders a stub map (Tennessee bounding box w/ pinned markers)
 * with realistic mock locations for AQ agents Korbin / TJ / Ryan and three
 * vehicles. Everything is keyed by agent name and refreshes every 30 seconds.
 *
 * When the Bouncie API token is wired in, the backend will start emitting
 * a `fieldActivity` payload on /api/kpi-data with shape:
 *   { agents: [{ name, lat, lng, lastPing, status, vehicleId? }],
 *     vehicles: [{ id, lat, lng, speed, heading, lastPing }],
 *     windshieldTime: { [agentName]: { todayHrs, weekHrs, avgHrs } } }
 * This component will pick that up automatically (the mock falls back
 * only when the payload is absent).
 */
import { useEffect, useMemo, useState } from "react";
import { Card, Section, StoplightDot } from "./dash";
import { Truck, MapPin, Clock, Radio } from "lucide-react";

// ---- Types matching the future backend contract ----
export interface FieldAgent {
  name: string;
  role: string;
  lat: number;
  lng: number;
  lastPing: string; // ISO timestamp
  status: "active" | "idle" | "offline";
  vehicleId?: string;
  currentTask?: string;
}

export interface FieldVehicle {
  id: string;
  driver?: string;
  lat: number;
  lng: number;
  speed: number; // mph
  heading?: number; // degrees
  lastPing: string;
}

export interface WindshieldTime {
  todayHrs: number;
  weekHrs: number;
  avgHrs: number;
}

export interface FieldActivityData {
  agents: FieldAgent[];
  vehicles: FieldVehicle[];
  windshieldTime: Record<string, WindshieldTime>;
  source: "bouncie" | "mock";
  lastUpdated: string;
}

// ---- Tennessee bounding box for the stub map ----
const TN_BOUNDS = { north: 36.7, south: 34.95, west: -90.5, east: -81.6 };
const NASHVILLE_CENTER = { lat: 36.1627, lng: -86.7816 };

// Realistic, jittered mock locations clustered around Nashville/Middle TN
function generateMockData(): FieldActivityData {
  const now = new Date();
  const ago = (mins: number) => new Date(now.getTime() - mins * 60_000).toISOString();

  return {
    source: "mock",
    lastUpdated: now.toISOString(),
    agents: [
      {
        name: "Korbin",
        role: "AQ Manager",
        lat: 36.1627 + (Math.random() - 0.5) * 0.15,
        lng: -86.7816 + (Math.random() - 0.5) * 0.2,
        lastPing: ago(2),
        status: "active",
        vehicleId: "V-101",
        currentTask: "Property walkthrough · Brentwood",
      },
      {
        name: "TJ",
        role: "AQ Agent",
        lat: 36.0628 + (Math.random() - 0.5) * 0.1,
        lng: -86.6614 + (Math.random() - 0.5) * 0.15,
        lastPing: ago(5),
        status: "active",
        vehicleId: "V-102",
        currentTask: "Lead visit · Antioch",
      },
      {
        name: "Ryan",
        role: "AQ Agent",
        lat: 36.31 + (Math.random() - 0.5) * 0.1,
        lng: -86.85 + (Math.random() - 0.5) * 0.15,
        lastPing: ago(12),
        status: "idle",
        vehicleId: "V-103",
        currentTask: "Driving to next appt · Hendersonville",
      },
    ],
    vehicles: [
      { id: "V-101", driver: "Korbin", lat: 36.158, lng: -86.78, speed: 0, lastPing: ago(2) },
      { id: "V-102", driver: "TJ", lat: 36.06, lng: -86.66, speed: 38, heading: 90, lastPing: ago(5) },
      { id: "V-103", driver: "Ryan", lat: 36.31, lng: -86.85, speed: 52, heading: 270, lastPing: ago(12) },
    ],
    windshieldTime: {
      Korbin: { todayHrs: 3.2, weekHrs: 18.5, avgHrs: 4.1 },
      TJ: { todayHrs: 4.8, weekHrs: 22.1, avgHrs: 4.6 },
      Ryan: { todayHrs: 2.1, weekHrs: 16.3, avgHrs: 3.8 },
    },
  };
}

// Convert a lat/lng to a 0..1 fraction within TN bounds for absolute positioning
function projectToBox(lat: number, lng: number): { x: number; y: number } {
  const x = (lng - TN_BOUNDS.west) / (TN_BOUNDS.east - TN_BOUNDS.west);
  const y = 1 - (lat - TN_BOUNDS.south) / (TN_BOUNDS.north - TN_BOUNDS.south);
  return { x: Math.max(0.02, Math.min(0.98, x)), y: Math.max(0.02, Math.min(0.98, y)) };
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

const STATUS_COLOR: Record<FieldAgent["status"], "green" | "yellow" | "red"> = {
  active: "green",
  idle: "yellow",
  offline: "red",
};

export function LiveFieldActivity({
  /** Optionally pass in real backend data; falls back to mock if undefined */
  data,
}: {
  data?: FieldActivityData;
}) {
  const [mock, setMock] = useState<FieldActivityData>(() => generateMockData());

  // If we're in mock mode, jitter every 30s so it feels live
  useEffect(() => {
    if (data) return;
    const t = setInterval(() => setMock(generateMockData()), 30_000);
    return () => clearInterval(t);
  }, [data]);

  const live = data ?? mock;
  const isMock = live.source === "mock";

  // Pre-project all positions for layout
  const agentPins = useMemo(
    () => live.agents.map((a) => ({ ...a, ...projectToBox(a.lat, a.lng) })),
    [live.agents],
  );
  const vehiclePins = useMemo(
    () => live.vehicles.map((v) => ({ ...v, ...projectToBox(v.lat, v.lng) })),
    [live.vehicles],
  );

  return (
    <Section
      title="Live Field Activity"
      subtitle="AQ agent + vehicle positions across Middle Tennessee. Refreshes automatically."
      actions={
        <div className="flex items-center gap-2 text-[11px]">
          <Radio className={`h-3 w-3 ${isMock ? "text-status-yellow" : "text-status-green animate-pulse"}`} />
          <span className="text-muted-foreground">
            {isMock ? "Demo data · awaiting Bouncie connection" : `Live · updated ${timeAgo(live.lastUpdated)}`}
          </span>
        </div>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Map: 2/3 width */}
        <Card className="lg:col-span-2" padding="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
            <MapPin className="h-3 w-3" /> Tennessee · Middle Region
          </div>
          <div
            className="relative w-full rounded-md overflow-hidden border bg-muted/30"
            style={{ aspectRatio: "16 / 9", minHeight: 280 }}
          >
            {/* Stub map background — gradient that suggests TN topography */}
            <div
              className="absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at 35% 55%, rgba(59,130,246,0.10), transparent 60%), radial-gradient(ellipse at 65% 40%, rgba(16,185,129,0.08), transparent 55%), linear-gradient(180deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)",
              }}
            />
            {/* TN outline approximation */}
            <svg
              viewBox="0 0 800 350"
              className="absolute inset-0 w-full h-full opacity-60"
              preserveAspectRatio="none"
              aria-hidden
            >
              <path
                d="M 30 60 L 770 50 L 760 280 L 220 295 L 180 270 L 30 270 Z"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="1.5"
                strokeDasharray="4 3"
              />
              <text x="400" y="180" textAnchor="middle" fill="hsl(var(--muted-foreground))" fontSize="9" opacity="0.4" letterSpacing="2">
                TENNESSEE
              </text>
            </svg>
            {/* Vehicle pins */}
            {vehiclePins.map((v) => (
              <div
                key={v.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${v.x * 100}%`, top: `${v.y * 100}%` }}
              >
                <div className="flex flex-col items-center">
                  <div className="rounded-full bg-card border-2 border-status-green shadow-sm p-1">
                    <Truck className="h-3 w-3 text-status-green" />
                  </div>
                  <div className="mt-0.5 px-1 rounded bg-card/90 border text-[9px] font-semibold whitespace-nowrap">
                    {v.id} · {v.speed}mph
                  </div>
                  {/* Tooltip on hover */}
                  <div className="absolute top-full mt-1 hidden group-hover:block z-10 px-2 py-1 rounded bg-popover text-popover-foreground border shadow-md text-[10px] whitespace-nowrap">
                    Driver: {v.driver ?? "—"} · {timeAgo(v.lastPing)}
                  </div>
                </div>
              </div>
            ))}
            {/* Agent pins */}
            {agentPins.map((a) => (
              <div
                key={a.name}
                className="absolute -translate-x-1/2 -translate-y-1/2 group"
                style={{ left: `${a.x * 100}%`, top: `${a.y * 100}%` }}
              >
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className={`rounded-full px-2 py-0.5 text-[10px] font-bold shadow-md border-2 bg-card`} style={{ borderColor: `var(--status-${STATUS_COLOR[a.status]})` }}>
                      {a.name}
                    </div>
                    <span
                      className={`absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-status-${STATUS_COLOR[a.status]} ${a.status === "active" ? "animate-pulse" : ""}`}
                    />
                  </div>
                </div>
              </div>
            ))}
            {/* Legend */}
            <div className="absolute bottom-2 left-2 rounded-md bg-card/95 border px-2 py-1 text-[10px] flex items-center gap-3">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-status-green" /> Active
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-status-yellow" /> Idle
              </span>
              <span className="flex items-center gap-1">
                <Truck className="h-2.5 w-2.5 text-status-green" /> Vehicle
              </span>
            </div>
          </div>
          {/* Agent strip below map */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2">
            {live.agents.map((a) => (
              <div key={a.name} className="rounded-md border px-3 py-2 text-[12px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{a.name}</span>
                  <StoplightDot status={STATUS_COLOR[a.status]} />
                </div>
                <div className="text-muted-foreground text-[10px] mt-0.5">{a.role}</div>
                <div className="text-[11px] mt-1 truncate" title={a.currentTask}>
                  {a.currentTask ?? "—"}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Last ping {timeAgo(a.lastPing)}
                  {a.vehicleId && <> · {a.vehicleId}</>}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Windshield Time card */}
        <Card padding="p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
            <Clock className="h-3 w-3" /> Windshield Time
          </div>
          <div className="space-y-3">
            {live.agents.map((a) => {
              const wt = live.windshieldTime[a.name];
              if (!wt) return null;
              const todayPctOfAvg = wt.avgHrs > 0 ? (wt.todayHrs / wt.avgHrs) * 100 : 0;
              return (
                <div key={a.name} className="space-y-1">
                  <div className="flex items-center justify-between text-[12px]">
                    <span className="font-semibold">{a.name}</span>
                    <span className="tabular-nums">
                      <span className="font-bold">{wt.todayHrs.toFixed(1)}h</span>
                      <span className="text-muted-foreground"> today</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        todayPctOfAvg >= 90
                          ? "bg-status-green"
                          : todayPctOfAvg >= 60
                            ? "bg-status-yellow"
                            : "bg-status-red"
                      }`}
                      style={{ width: `${Math.min(100, todayPctOfAvg)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Week: {wt.weekHrs.toFixed(1)}h</span>
                    <span>Avg/day: {wt.avgHrs.toFixed(1)}h</span>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t text-[10px] text-muted-foreground">
            Once Bouncie is connected, these reflect actual ignition-on time per vehicle, attributed to the assigned driver.
          </div>
        </Card>
      </div>
    </Section>
  );
}
