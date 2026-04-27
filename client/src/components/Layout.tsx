import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Logo } from "./Logo";
import { useAuth } from "@/lib/useAuth";
import { useKpiSafe, useKpiMeta } from "@/components/KpiDataProvider";
import {
  LayoutDashboard,
  Target,
  HandCoins,
  FileCheck2,
  Megaphone,
  Users,
  Sun,
  Moon,
  ShieldCheck,
  LogOut,
  Heart,
  Monitor,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  short: string;
  icon: React.ComponentType<{ className?: string }>;
  dept?: string; // if set, only visible to users with this department (or "all")
};

const NAV: NavItem[] = [
  { href: "/", label: "Company Overview", short: "Overview", icon: LayoutDashboard },
  { href: "/acquisitions", label: "Acquisitions", short: "AQ", icon: Target, dept: "acquisitions" },
  { href: "/dispositions", label: "Dispositions", short: "Dispo", icon: HandCoins, dept: "dispositions" },
  { href: "/transactions", label: "Transactions", short: "TC", icon: FileCheck2, dept: "transactions" },
  { href: "/marketing", label: "Marketing", short: "MKT", icon: Megaphone, dept: "marketing" },
  { href: "/leadership", label: "Leadership", short: "L10", icon: Users, dept: "leadership" },
];

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useTheme() {
  const [isDark, setIsDark] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);
  return { isDark, toggle: () => setIsDark((d) => !d) };
}

function getVisibleNav(departments: string): NavItem[] {
  const depts = departments.split(",").filter(Boolean);
  if (depts.includes("all")) return NAV;
  return NAV.filter((item) => !item.dept || depts.includes(item.dept));
}

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const now = useClock();
  const { isDark, toggle } = useTheme();
  const { user, logout } = useAuth();
  const kpiData = useKpiSafe();
  const { isRefreshing, handleForceUpdate } = useKpiMeta();

  const livesImpacted = kpiData ? Math.round(kpiData.ytd.closed_deals * 3) : 0;
  const purposeTarget = kpiData?.company?.purpose_target ?? 264;
  const livesPct = purposeTarget > 0 ? Math.round((livesImpacted / purposeTarget) * 100) : 0;

  const visibleNav = user ? getVisibleNav(user.departments) : NAV;

  const dateStr = now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const current = visibleNav.find((n) => n.href === location) ?? visibleNav[0];

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Sidebar */}
      <aside
        className="sticky top-0 h-screen w-56 shrink-0 flex flex-col border-r"
        style={{
          backgroundColor: "hsl(var(--sidebar))",
          color: "hsl(var(--sidebar-foreground))",
          borderColor: "hsl(var(--sidebar-border))",
        }}
      >
        {/* Brand */}
        <div className="px-4 pt-5 pb-4 flex flex-col items-center gap-2 border-b"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}>
          <Logo className="h-12 w-auto drop-shadow-[0_1px_8px_rgba(255,255,255,0.15)]" variant="white" />
          <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-center" style={{ color: "hsl(var(--sidebar-primary))" }}>
            Team KPI Dashboards
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto">
          {visibleNav.map((item) => {
            const active = item.href === location;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                data-testid={`link-${item.short.toLowerCase()}`}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all",
                  active
                    ? "text-[hsl(var(--sidebar-primary-foreground))]"
                    : "text-[hsl(var(--sidebar-foreground))]/65 hover:text-[hsl(var(--sidebar-foreground))]",
                )}
                style={active ? {
                  backgroundColor: "hsl(var(--sidebar-primary))",
                  boxShadow: "0 2px 8px hsl(var(--sidebar-primary) / 0.35)",
                } : undefined}
              >
                <Icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-[hsl(var(--sidebar-primary-foreground))]")} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* TV Mode link */}
          <div className="pt-2 pb-0.5 px-3">
            <div className="h-px w-full" style={{ backgroundColor: "hsl(var(--sidebar-border))" }} />
          </div>
          <Link
            href="/tv"
            data-testid="link-tv-mode"
            className={cn(
              "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all",
              location === "/tv"
                ? "text-[hsl(var(--sidebar-primary-foreground))]"
                : "text-[hsl(var(--sidebar-foreground))]/65 hover:text-[hsl(var(--sidebar-foreground))]",
            )}
            style={location === "/tv" ? {
              backgroundColor: "hsl(var(--sidebar-primary))",
              boxShadow: "0 2px 8px hsl(var(--sidebar-primary) / 0.35)",
            } : undefined}
          >
            <Monitor className={cn("h-3.5 w-3.5 shrink-0", location === "/tv" && "text-[hsl(var(--sidebar-primary-foreground))]")} />
            <span>TV Mode</span>
          </Link>

          {/* Admin link */}
          {user?.isAdmin && (
            <>
              <div className="pt-2 pb-0.5 px-3">
                <div className="h-px w-full" style={{ backgroundColor: "hsl(var(--sidebar-border))" }} />
              </div>
              <Link
                href="/admin"
                data-testid="link-admin"
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium transition-all",
                  location === "/admin"
                    ? "text-[hsl(var(--sidebar-primary-foreground))]"
                    : "text-[hsl(var(--sidebar-foreground))]/65 hover:text-[hsl(var(--sidebar-foreground))]",
                )}
                style={location === "/admin" ? {
                  backgroundColor: "hsl(var(--sidebar-primary))",
                  boxShadow: "0 2px 8px hsl(var(--sidebar-primary) / 0.35)",
                } : undefined}
              >
                <ShieldCheck className={cn("h-3.5 w-3.5 shrink-0", location === "/admin" && "text-[hsl(var(--sidebar-primary-foreground))]")} />
                <span>Admin</span>
              </Link>
            </>
          )}
        </nav>

        {/* User / Footer */}
        <div
          className="border-t"
          style={{ borderColor: "hsl(var(--sidebar-border))" }}
        >
          {user && (
            <div className="px-3 py-3 flex items-center gap-2.5">
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name}
                  className="h-8 w-8 rounded-full object-cover shrink-0"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: "hsl(var(--sidebar-primary))" }}
                >
                  {user.name.charAt(0).toUpperCase()}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-[12px] font-semibold truncate" style={{ color: "hsl(var(--sidebar-foreground))" }}>
                  {user.name}
                </div>
                <div className="text-[10px] truncate opacity-50" style={{ color: "hsl(var(--sidebar-foreground))" }}>
                  {user.email}
                </div>
              </div>
              <button
                onClick={logout}
                data-testid="button-logout"
                aria-label="Sign out"
                className="shrink-0 h-7 w-7 rounded-md flex items-center justify-center transition-colors opacity-50 hover:opacity-100"
                style={{ color: "hsl(var(--sidebar-foreground))" }}
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {/* PURPOSE — Lives Positively Impacted */}
          <div
            className="mx-2.5 mb-2.5 rounded-lg px-2.5 py-2 relative overflow-hidden"
            style={{
              background: "linear-gradient(135deg, hsl(var(--baby-blue-600)), hsl(var(--baby-blue-700)) 60%, hsl(210 60% 28%))",
            }}
          >
            <div className="absolute -top-4 -right-4 w-14 h-14 rounded-full opacity-15" style={{ background: "radial-gradient(circle, hsl(var(--baby-blue-300)), transparent 70%)" }} />
            <div className="relative z-10">
              <div className="flex items-center gap-1.5 mb-1">
                <Heart className="h-2.5 w-2.5 text-white/80" />
                <span className="text-[8px] uppercase tracking-[0.14em] font-bold text-white/70">Lives Positively Impacted</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-[22px] font-bold tabular-nums leading-none text-white">
                  {livesImpacted}
                </span>
                <span className="text-[10px] text-white/55">of {purposeTarget}</span>
              </div>
              <div className="mt-1.5 h-1 w-full rounded-full bg-white/15 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(livesPct, 100)}%`,
                    background: "linear-gradient(90deg, hsl(var(--baby-blue-300)), #fff)",
                  }}
                />
              </div>
              <div className="mt-1 text-[8px] text-white/45 tabular-nums">
                {livesPct}% of annual goal
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-10 backdrop-blur-md border-b" style={{ backgroundColor: "hsl(var(--background) / 0.85)" }}>
          <div className="flex items-center justify-between gap-4 px-6 py-2.5">
            <div className="flex items-center gap-3">
              <div className="h-6 w-1 rounded-full" style={{ backgroundColor: "hsl(var(--baby-blue-500))" }} />
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] font-semibold" style={{ color: "hsl(var(--baby-blue-500))" }}>
                  {location === "/admin" ? "Admin" : current?.short}
                </div>
                <h1 className="text-base font-bold tracking-tight">
                  {location === "/admin" ? "User Management" : current?.label}
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {/* Live indicator + Force refresh */}
              {kpiData && (
                <div
                  data-testid="live-status-bar"
                  className="hidden md:flex items-center gap-2.5 text-[10px] text-muted-foreground pr-3 border-r"
                  style={{ borderColor: "hsl(var(--border))" }}
                >
                  <span className="flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-status-green animate-pulse" />
                    <span>Live · {new Date(kpiData.lastUpdated).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                  </span>
                  <button
                    onClick={handleForceUpdate}
                    disabled={isRefreshing}
                    data-testid="button-force-update"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider transition-all hover:bg-primary/10 disabled:opacity-50"
                    style={{ color: "hsl(var(--baby-blue-500))" }}
                    title="Force refresh data from Google Sheets"
                  >
                    <RefreshCw className={cn("h-3 w-3", isRefreshing && "animate-spin")} />
                    <span className="hidden lg:inline">{isRefreshing ? "Updating" : "Refresh"}</span>
                  </button>
                </div>
              )}
              <div className="text-right leading-tight">
                <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                  {dateStr}
                </div>
                <div className="text-sm font-semibold num">{timeStr}</div>
              </div>
              <button
                onClick={toggle}
                data-testid="button-theme-toggle"
                aria-label="Toggle theme"
                className="h-8 w-8 rounded-lg border bg-card hover:bg-accent flex items-center justify-center transition-colors"
              >
                {isDark ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 px-6 py-4">{children}</div>
      </main>
    </div>
  );
}
