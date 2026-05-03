/**
 * AlertBanner — pulsing red-streak alerts with inline Acknowledge action.
 * Pulls /api/alerts on mount + every 60s. Shows only unacknowledged alerts
 * matching the optional `team` filter (e.g. "AQA" / "Lead Manager").
 */
import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface AlertItem {
  alertKey: string;
  person: string;
  metric: string;
  target: string;
  streak: number;
  weeksRed: string[];
  latestActual: string;
  severity: "day3" | "week3";
  acknowledged: boolean;
  ack?: { acknowledgedBy: string; acknowledgedAt: string; note?: string | null };
}

export function AlertBanner({
  filterPersons,
  className,
}: {
  /** Only show alerts whose person is in this list (case-insensitive). */
  filterPersons?: string[];
  className?: string;
}) {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const r = await apiRequest("GET", "/api/alerts");
      if (!r.ok) return;
      const data = await r.json();
      setAlerts(data.alerts || []);
    } catch {/* noop */}
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 60_000);
    return () => clearInterval(id);
  }, [load]);

  const acknowledge = async (a: AlertItem) => {
    setBusy(a.alertKey);
    try {
      const note = window.prompt(
        `Acknowledge ${a.severity === "week3" ? "Week-3" : "Day-3"} red on ${a.person} → ${a.metric}.\nWhat will you change this week to get back to green? (optional)`,
        ""
      );
      // null = user cancelled; empty string = ok with no note
      if (note === null) { setBusy(null); return; }
      const r = await apiRequest("POST", "/api/alerts/ack", {
        person: a.person, metric: a.metric, severity: a.severity,
        streak: a.streak, note,
      });
      if (r.ok) await load();
    } finally {
      setBusy(null);
    }
  };

  const visible = alerts.filter(a => !a.acknowledged && !dismissed.has(a.alertKey));
  const filtered = filterPersons
    ? visible.filter(a => filterPersons.some(p => a.person.toLowerCase().includes(p.toLowerCase())))
    : visible;

  if (filtered.length === 0) return null;

  return (
    <div className={className ?? ""}>
      <div className="space-y-2">
        {filtered.map(a => {
          const isWeek = a.severity === "week3";
          return (
            <div
              key={a.alertKey}
              className="rounded-xl border-l-4 p-3 flex items-start gap-3 bg-red-50 dark:bg-red-950/30 border-red-500"
              style={{ animation: "pulse-bg 2.4s ease-in-out infinite" }}
            >
              <div className="mt-0.5 shrink-0">
                <AlertTriangle className="h-5 w-5 text-red-600 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                    {isWeek ? "WEEK-3 RED" : "DAY-3 RED"}
                  </span>
                  <span className="font-semibold text-sm">{a.person}</span>
                  <span className="text-muted-foreground text-sm">·</span>
                  <span className="text-sm">{a.metric}</span>
                </div>
                <div className="mt-1 text-[12px] text-muted-foreground">
                  {a.streak} consecutive {isWeek ? "weeks" : "days"} below target
                  {" · "}latest <span className="font-mono">{a.latestActual}</span>
                  {" / target "}<span className="font-mono">{a.target}</span>
                  {a.weeksRed.length > 0 && (
                    <span className="block opacity-70 mt-0.5">Periods red: {a.weeksRed.join(", ")}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => acknowledge(a)}
                  disabled={busy === a.alertKey}
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  data-testid={`button-ack-${a.alertKey}`}
                >
                  <CheckCircle2 className="h-3 w-3" />
                  {busy === a.alertKey ? "Saving" : "Acknowledge"}
                </button>
                <button
                  onClick={() => setDismissed(prev => new Set(prev).add(a.alertKey))}
                  className="h-6 w-6 rounded-md flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
                  aria-label="Hide"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
