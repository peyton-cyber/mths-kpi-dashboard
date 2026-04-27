import { ReactNode, useEffect, useState, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/useAuth";
import { useKpiSafe } from "@/components/KpiDataProvider";
import {
  Heart,
  Monitor,
  Pause,
  Play,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Page registry ─────────────────────────────────── */
export type TvPage = {
  path: string;
  label: string;
  dept?: string; // undefined = everyone
};

export const TV_PAGES: TvPage[] = [
  { path: "/", label: "Company Overview" },
  { path: "/acquisitions", label: "Acquisitions", dept: "acquisitions" },
  { path: "/dispositions", label: "Dispositions", dept: "dispositions" },
  { path: "/transactions", label: "Transactions", dept: "transactions" },
  { path: "/marketing", label: "Marketing", dept: "marketing" },
  { path: "/leadership", label: "Leadership", dept: "leadership" },
];

const CYCLE_SECONDS = 25; // seconds per page

/* ── Clock ─────────────────────────────────────────── */
function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

/* ── Layout ─────────────────────────────────────────── */
export function TvLayout({
  children,
  pages,
  currentIndex,
  onNavigate,
  paused,
  onTogglePause,
  progress,
}: {
  children: ReactNode;
  pages: TvPage[];
  currentIndex: number;
  onNavigate: (idx: number) => void;
  paused: boolean;
  onTogglePause: () => void;
  progress: number; // 0-1
}) {
  const now = useClock();
  const { user } = useAuth();
  const kpiData = useKpiSafe();

  const livesImpacted = kpiData ? Math.round(kpiData.ytd.closed_deals * 3) : 0;
  const purposeTarget = kpiData?.company?.purpose_target ?? 264;
  const livesPct = purposeTarget > 0 ? Math.round((livesImpacted / purposeTarget) * 100) : 0;

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

  // Force dark mode + add tv-mode class to body for global styles
  useEffect(() => {
    document.documentElement.classList.add("dark");
    document.body.classList.add("tv-mode-active");
    return () => {
      document.body.classList.remove("tv-mode-active");
    };
  }, []);

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-background text-foreground tv-mode">
      {/* ── Top bar ─── thin branding strip */}
      <div
        className="shrink-0 flex items-center justify-between px-6 py-2"
        style={{ backgroundColor: "hsl(var(--sidebar))" }}
      >
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-auto drop-shadow-[0_1px_8px_rgba(255,255,255,0.15)]" variant="white" />
          <div
            className="text-[10px] uppercase tracking-[0.2em] font-bold"
            style={{ color: "hsl(var(--sidebar-primary))" }}
          >
            Team KPI Dashboards
          </div>
        </div>

        {/* Lives Impacted — compact horizontal */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5" style={{ color: "hsl(var(--baby-blue-400))" }} />
            <span className="text-[10px] uppercase tracking-wider font-bold text-white/60">
              Lives Impacted
            </span>
            <span className="text-lg font-bold tabular-nums text-white">
              {livesImpacted}
            </span>
            <span className="text-xs text-white/40">/ {purposeTarget}</span>
            <div className="w-20 h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(livesPct, 100)}%`,
                  background: "linear-gradient(90deg, hsl(var(--baby-blue-400)), #fff)",
                }}
              />
            </div>
          </div>

          <div className="h-5 w-px bg-white/10" />

          <div className="text-right leading-tight">
            <div className="text-[9px] uppercase tracking-wider text-white/40">{dateStr}</div>
            <div className="text-sm font-semibold tabular-nums text-white">{timeStr}</div>
          </div>
        </div>
      </div>

      {/* ── Main content area — scrollable page content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 tv-content">
        {children}
      </div>

      {/* ── Bottom bar ─── page nav + controls */}
      <div
        className="shrink-0 border-t flex items-center justify-between px-6 py-2"
        style={{
          backgroundColor: "hsl(var(--sidebar))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Page label */}
        <div className="flex items-center gap-2.5">
          <Monitor className="h-3.5 w-3.5 text-white/40" />
          <span className="text-xs font-semibold text-white/80">
            {pages[currentIndex]?.label}
          </span>
        </div>

        {/* Dots + controls */}
        <div className="flex items-center gap-3">
          {/* Prev */}
          <button
            onClick={() => onNavigate((currentIndex - 1 + pages.length) % pages.length)}
            className="h-6 w-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition"
            data-testid="tv-prev"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>

          {/* Page dots */}
          <div className="flex items-center gap-1.5">
            {pages.map((p, i) => (
              <button
                key={p.path}
                onClick={() => onNavigate(i)}
                data-testid={`tv-dot-${i}`}
                className={cn(
                  "rounded-full transition-all duration-300",
                  i === currentIndex
                    ? "w-6 h-2"
                    : "w-2 h-2 opacity-40 hover:opacity-70",
                )}
                style={{
                  backgroundColor: i === currentIndex
                    ? "hsl(var(--baby-blue-400))"
                    : "hsl(var(--sidebar-foreground))",
                }}
              />
            ))}
          </div>

          {/* Next */}
          <button
            onClick={() => onNavigate((currentIndex + 1) % pages.length)}
            className="h-6 w-6 rounded flex items-center justify-center text-white/40 hover:text-white/80 transition"
            data-testid="tv-next"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>

          <div className="h-4 w-px bg-white/10" />

          {/* Pause/Play */}
          <button
            onClick={onTogglePause}
            data-testid="tv-pause"
            className={cn(
              "h-7 px-2.5 rounded-md flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider transition",
              paused
                ? "bg-white/10 text-white/70"
                : "text-white/40 hover:text-white/60",
            )}
          >
            {paused ? (
              <>
                <Play className="h-3 w-3" /> Paused
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" /> Auto
              </>
            )}
          </button>
        </div>

        {/* Progress bar — shows time to next page */}
        <div className="w-24 h-1 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-[width] duration-1000 linear"
            style={{
              width: `${progress * 100}%`,
              backgroundColor: "hsl(var(--baby-blue-500))",
            }}
          />
        </div>
      </div>
    </div>
  );
}
