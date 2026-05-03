/**
 * AlertBanner — horizontal pill bar across top of page.
 * Single-line summary of unacknowledged red streaks. Click any pill to expand
 * detail + acknowledge inline. Pulls /api/alerts on mount + every 60s.
 */
import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, CheckCircle2, X, ChevronDown } from "lucide-react";
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
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

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
      if (note === null) { setBusy(null); return; }
      const r = await apiRequest("POST", "/api/alerts/ack", {
        person: a.person, metric: a.metric, severity: a.severity,
        streak: a.streak, note,
      });
      if (r.ok) {
        await load();
        setExpandedKey(null);
      }
    } finally {
      setBusy(null);
    }
  };

  const visible = alerts.filter(a => !a.acknowledged && !dismissed.has(a.alertKey));
  const filtered = filterPersons
    ? visible.filter(a => filterPersons.some(p => a.person.toLowerCase().includes(p.toLowerCase())))
    : visible;

  if (filtered.length === 0) return null;

  const expanded = filtered.find(a => a.alertKey === expandedKey);

  return (
    <div className={className ?? ""}>
      <div
        className="rounded-xl border border-red-300 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 p-2 flex items-center gap-2 overflow-x-auto"
        style={{ animation: "pulse-bg 2.4s ease-in-out infinite" }}
      >
        <div className="shrink-0 flex items-center gap-1.5 pl-1 pr-2 border-r border-red-300 dark:border-red-900/50">
          <AlertTriangle className="h-4 w-4 text-red-600 animate-pulse" />
          <span className="text-[10px] uppercase tracking-[0.14em] font-bold text-red-700 dark:text-red-400 whitespace-nowrap">
            {filtered.length} red {filtered.length === 1 ? "alert" : "alerts"}
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-nowrap">
          {filtered.map(a => {
            const isWeek = a.severity === "week3";
            const isOpen = expandedKey === a.alertKey;
            return (
              <button
                key={a.alertKey}
                onClick={() => setExpandedKey(isOpen ? null : a.alertKey)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all ${
                  isOpen
                    ? "bg-red-600 text-white ring-2 ring-red-400"
                    : "bg-white dark:bg-red-950/40 text-red-700 dark:text-red-300 border border-red-300 dark:border-red-900/50 hover:bg-red-100 dark:hover:bg-red-950/60"
                }`}
                data-testid={`pill-alert-${a.alertKey}`}
              >
                <span className={`text-[9px] uppercase tracking-wider px-1 py-0.5 rounded ${isOpen ? "bg-white/20" : "bg-red-600 text-white"}`}>
                  {isWeek ? "W3" : "D3"}
                </span>
                <span>{a.person}</span>
                <span className="opacity-60">·</span>
                <span className="font-normal">{a.metric}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
            );
          })}
        </div>
      </div>

      {expanded && (
        <div className="mt-2 rounded-xl border border-red-300 dark:border-red-900/50 bg-white dark:bg-red-950/20 p-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] uppercase tracking-[0.14em] font-bold px-1.5 py-0.5 rounded bg-red-600 text-white">
                {expanded.severity === "week3" ? "WEEK-3 RED" : "DAY-3 RED"}
              </span>
              <span className="font-semibold text-sm">{expanded.person}</span>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm">{expanded.metric}</span>
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {expanded.streak} consecutive {expanded.severity === "week3" ? "weeks" : "days"} below target
              {" · "}latest <span className="font-mono">{expanded.latestActual}</span>
              {" / target "}<span className="font-mono">{expanded.target}</span>
              {expanded.weeksRed.length > 0 && (
                <span className="block opacity-70 mt-0.5">Periods red: {expanded.weeksRed.join(", ")}</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => acknowledge(expanded)}
              disabled={busy === expanded.alertKey}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[12px] font-semibold rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              data-testid={`button-ack-${expanded.alertKey}`}
            >
              <CheckCircle2 className="h-3 w-3" />
              {busy === expanded.alertKey ? "Saving" : "Acknowledge"}
            </button>
            <button
              onClick={() => {
                setDismissed(prev => new Set(prev).add(expanded.alertKey));
                setExpandedKey(null);
              }}
              className="h-6 w-6 rounded-md flex items-center justify-center opacity-50 hover:opacity-100 transition-opacity"
              aria-label="Hide"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
