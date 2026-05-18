/**
 * LiveRepMap — real OpenStreetMap (Leaflet) map showing live Bouncie vehicle
 * locations for AQ reps. Replaces the LiveFieldActivity stub.
 *
 * Data source: kpiData.bouncieMeta.locations (added by sheets.ts; populated
 * from /v1/vehicles stats.location). Only reps with paired Bouncie devices
 * appear (currently TJ + Korbin); others show in a "no device paired" list.
 */
import { useEffect, useMemo } from "react";
import { Card, Section } from "./dash";
import { useKpi } from "./KpiDataProvider";
import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import L, { LatLngBounds } from "leaflet";
import "leaflet/dist/leaflet.css";
import { Truck, Navigation, Fuel, Gauge } from "lucide-react";

// Per-rep marker colors — same palette across the dashboard
const REP_COLOR: Record<string, string> = {
  TJ: "#22c55e",        // green
  Korbin: "#3b82f6",    // blue
  Brandon: "#f59e0b",   // amber
  "Jeff H": "#ef4444",  // red
  Ryan: "#8b5cf6",      // purple
  Jonathan: "#ec4899",  // pink
};

function carIcon(color: string, heading: number, isRunning: boolean) {
  // Inline SVG marker: rounded triangle pointing at heading bearing
  const opacity = isRunning ? 1 : 0.7;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="34" height="34" viewBox="0 0 32 32"
         style="transform: rotate(${heading}deg); transform-origin: 50% 50%; opacity:${opacity};">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>
      <path d="M16 6 L22 22 L16 18 L10 22 Z" fill="white"/>
    </svg>`;
  return L.divIcon({
    html: svg,
    className: "live-rep-marker",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -14],
  });
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Helper component: pans/zooms the map to fit all current markers
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 11, { animate: false });
      return;
    }
    const bounds = new LatLngBounds(points);
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 12 });
  }, [map, points]);
  return null;
}

export function LiveRepMap() {
  const data = useKpi();
  const meta: any = (data as any).bouncieMeta;
  const locations: any[] = meta?.locations || [];
  const hasReal = locations.length > 0;

  // Center: average of all locations, fallback to Nashville
  const center: [number, number] = useMemo(() => {
    if (locations.length === 0) return [36.1627, -86.7816];
    const lat = locations.reduce((s, l) => s + l.lat, 0) / locations.length;
    const lng = locations.reduce((s, l) => s + l.lng, 0) / locations.length;
    return [lat, lng];
  }, [locations]);

  const points: [number, number][] = locations.map(l => [l.lat, l.lng]);

  return (
    <Section
      title="Live Rep Locations"
      subtitle={hasReal
        ? `Bouncie GPS · ${locations.length} ${locations.length === 1 ? "vehicle" : "vehicles"} reporting · refreshed ${meta?.fetchedAt ? timeAgo(meta.fetchedAt) : "—"}`
        : "Waiting for Bouncie devices to be paired"}
    >
      <Card>
        <div
          data-testid="live-rep-map"
          className="rounded-md overflow-hidden border"
          style={{ height: 420, borderColor: "hsl(var(--border))" }}
        >
          <MapContainer
            center={center}
            zoom={10}
            scrollWheelZoom={false}
            style={{ height: "100%", width: "100%", background: "#0a0f17" }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <FitBounds points={points} />
            {locations.map((l, i) => (
              <Marker
                key={l.imei || i}
                position={[l.lat, l.lng]}
                icon={carIcon(REP_COLOR[l.rep] || "#888", l.heading || 0, l.isRunning)}
              >
                <Popup>
                  <div style={{ fontFamily: "system-ui, sans-serif", fontSize: 12, minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>{l.rep}</div>
                    <div style={{ color: "#666", marginBottom: 6 }}>{l.vehicle}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 8px" }}>
                      <span style={{ color: "#666" }}>Status:</span>
                      <span style={{ color: l.isRunning ? "#16a34a" : "#999" }}>{l.isRunning ? "Running" : "Parked"}</span>
                      <span style={{ color: "#666" }}>Speed:</span>
                      <span>{l.speed} mph</span>
                      <span style={{ color: "#666" }}>Fuel:</span>
                      <span>{l.fuelLevel}%</span>
                      <span style={{ color: "#666" }}>Odometer:</span>
                      <span>{l.odometer.toLocaleString()} mi</span>
                      <span style={{ color: "#666" }}>Last ping:</span>
                      <span>{timeAgo(l.lastUpdated)}</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        {/* Rep strip — live status + jump-to */}
        <div className="mt-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {locations.map(l => (
            <div
              key={l.imei}
              className="rounded-md border p-2"
              style={{ borderColor: "hsl(var(--border))", background: "hsl(var(--muted) / 0.3)" }}
              data-testid={`rep-card-${l.rep.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <span className="h-2 w-2 rounded-full" style={{ background: REP_COLOR[l.rep] || "#888" }} />
                <span className="font-semibold text-xs">{l.rep}</span>
                {l.isRunning && <span className="text-[9px] uppercase tracking-wider" style={{ color: "hsl(var(--status-green))" }}>· Driving</span>}
              </div>
              <div className="text-[10px] text-muted-foreground space-y-0.5">
                <div className="flex items-center gap-1"><Navigation className="h-2.5 w-2.5" /> {l.speed} mph</div>
                <div className="flex items-center gap-1"><Fuel className="h-2.5 w-2.5" /> {l.fuelLevel}%</div>
                <div className="flex items-center gap-1"><Gauge className="h-2.5 w-2.5" /> {l.odometer.toLocaleString()} mi</div>
                <div className="text-[9px] opacity-70">{timeAgo(l.lastUpdated)}</div>
              </div>
            </div>
          ))}
          {/* Unpaired reps */}
          {(meta?.unmappedReps || []).map((rep: string) => (
            <div
              key={rep}
              className="rounded-md border border-dashed p-2 opacity-60"
              style={{ borderColor: "hsl(var(--border))" }}
              data-testid={`rep-card-unpaired-${rep.toLowerCase().replace(/\s/g, "-")}`}
            >
              <div className="flex items-center gap-1.5 mb-1">
                <Truck className="h-3 w-3 text-muted-foreground" />
                <span className="font-semibold text-xs text-muted-foreground">{rep}</span>
              </div>
              <div className="text-[10px] text-muted-foreground">No device paired</div>
            </div>
          ))}
        </div>

        {!hasReal && (
          <div className="mt-4 text-xs text-muted-foreground text-center py-6">
            No vehicles reporting yet. Confirm Bouncie devices are paired and powered on, then refresh.
          </div>
        )}
      </Card>
    </Section>
  );
}
