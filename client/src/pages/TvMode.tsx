import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "@/lib/useAuth";
import { TvLayout, TV_PAGES, type TvPage } from "@/components/TvLayout";
import Overview from "./Overview";
import Acquisitions from "./Acquisitions";
import Dispositions from "./Dispositions";
import Transactions from "./Transactions";
import Marketing from "./Marketing";
import Leadership from "./Leadership";

const PAGE_COMPONENTS: Record<string, React.ComponentType> = {
  "/": Overview,
  "/acquisitions": Acquisitions,
  "/dispositions": Dispositions,
  "/transactions": Transactions,
  "/marketing": Marketing,
  "/leadership": Leadership,
};

const CYCLE_MS = 25_000; // 25 seconds per page
const TICK_MS = 1_000; // progress updates every second

export default function TvMode() {
  const { user } = useAuth();

  /* ── Visible pages based on department access ─── */
  const visiblePages = useMemo(() => {
    if (!user) return [TV_PAGES[0]];
    const depts = user.departments.split(",").filter(Boolean);
    if (depts.includes("all")) return TV_PAGES;
    return TV_PAGES.filter((p) => !p.dept || depts.includes(p.dept));
  }, [user]);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const progress = elapsed / CYCLE_MS;

  /* ── Auto-cycle timer ─── */
  useEffect(() => {
    if (paused || visiblePages.length <= 1) return;

    const interval = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + TICK_MS;
        if (next >= CYCLE_MS) {
          setCurrentIndex((idx) => (idx + 1) % visiblePages.length);
          return 0;
        }
        return next;
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [paused, visiblePages.length]);

  /* ── Manual navigation resets timer ─── */
  const handleNavigate = useCallback(
    (idx: number) => {
      setCurrentIndex(idx);
      setElapsed(0);
    },
    [],
  );

  const handleTogglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  /* ── Keyboard controls ─── */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " ") {
        e.preventDefault();
        handleNavigate((currentIndex + 1) % visiblePages.length);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        handleNavigate((currentIndex - 1 + visiblePages.length) % visiblePages.length);
      } else if (e.key === "p" || e.key === "P") {
        handleTogglePause();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [currentIndex, visiblePages.length, handleNavigate, handleTogglePause]);

  /* ── Render current page ─── */
  const page = visiblePages[currentIndex];
  const PageComponent = PAGE_COMPONENTS[page?.path ?? "/"] ?? Overview;

  return (
    <TvLayout
      pages={visiblePages}
      currentIndex={currentIndex}
      onNavigate={handleNavigate}
      paused={paused}
      onTogglePause={handleTogglePause}
      progress={progress}
    >
      <PageComponent />
    </TvLayout>
  );
}
