// Shared dashboard primitives: scorecards, stoplight badges, progress rings.
import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { StoplightStatus } from "@/lib/data";
import { ArrowUp, ArrowDown } from "lucide-react";
import { pacingStatus, type PacePeriod } from "@/lib/pacing";
import { getRedAction } from "@/lib/redActions";

export function Section({
  title,
  subtitle,
  actions,
  source,
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  source?: DataSourceProps | DataSourceProps[];
  children: ReactNode;
  className?: string;
}) {
  const sources = Array.isArray(source) ? source : source ? [source] : [];
  return (
    <section className={cn("space-y-3", className)}>
      {(title || subtitle || actions || sources.length > 0) && (
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div className="bb-section-header">
            {title && (
              <h2 className="text-xs uppercase tracking-[0.14em] text-foreground/80 font-semibold">
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="text-[12px] text-muted-foreground/80 mt-0.5">
                {subtitle}
              </p>
            )}
            {sources.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {sources.map((s, i) => (
                  <DataSource key={i} {...s} />
                ))}
              </div>
            )}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

// ─── Data-source pill ─────────────────────────────────────────────
// Tiny labeled chip used inline on Sections (and anywhere else) so the team
// can instantly see WHERE the numbers came from. Click-to-open when a URL is
// provided.
export type DataSourceProps = {
  label: string;          // e.g. "Sales 2026 KPIs"
  detail?: string;        // optional tab/range hint e.g. "per-rep monthly"
  url?: string;           // optional clickable link to the sheet/tab
  tone?: "sheet" | "api" | "computed" | "warn";
};

export function DataSource({ label, detail, url, tone = "sheet" }: DataSourceProps) {
  const toneCls =
    tone === "api"
      ? "border-status-blue/30 bg-status-blue/5 text-status-blue"
      : tone === "computed"
      ? "border-status-purple/30 bg-status-purple/5 text-status-purple"
      : tone === "warn"
      ? "border-status-yellow/40 bg-status-yellow/10 text-status-yellow"
      : "border-border bg-muted/40 text-muted-foreground";
  const labelTxt =
    tone === "api" ? "API" : tone === "computed" ? "Derived" : tone === "warn" ? "Heads up" : "Source";
  const inner = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide",
        toneCls,
      )}
      title={detail ? `${label} — ${detail}` : label}
      data-testid={`source-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
    >
      <span className="uppercase opacity-60">{labelTxt}</span>
      <span className="font-semibold">{label}</span>
      {detail && <span className="opacity-70">· {detail}</span>}
    </span>
  );
  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="hover:opacity-80">
        {inner}
      </a>
    );
  }
  return inner;
}

export function Card({
  children,
  className,
  padding = "p-4",
  glow,
}: {
  children: ReactNode;
  className?: string;
  padding?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm transition-shadow hover:shadow-md",
        glow && "bb-hero-glow",
        padding,
        className,
      )}
      style={{ borderColor: "hsl(var(--card-border))" }}
    >
      {children}
    </div>
  );
}

export function StoplightDot({
  status,
  className,
}: {
  status: StoplightStatus;
  className?: string;
}) {
  const bg =
    status === "green"
      ? "bg-status-green"
      : status === "yellow"
        ? "bg-status-yellow"
        : "bg-status-red";
  return (
    <span
      aria-label={`Status: ${status}`}
      className={cn("inline-block h-2.5 w-2.5 rounded-full", bg, className)}
    />
  );
}

export function StoplightBadge({
  status,
  label,
}: {
  status: StoplightStatus;
  label?: string;
}) {
  const cls =
    status === "green"
      ? "status-green-bg"
      : status === "yellow"
        ? "status-yellow-bg"
        : "status-red-bg";
  const defaultLabel =
    status === "green" ? "On Target" : status === "yellow" ? "Close" : "Below";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        cls,
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label ?? defaultLabel}
    </span>
  );
}

export interface PaceProps {
  /** Numeric current value for the period */
  numericValue: number;
  /** Full-period target */
  target: number;
  /** Period the target applies to (e.g. "month" for monthly contracts) */
  period: PacePeriod;
}

/**
 * Compact "On Pace / Behind Pace / Off Pace" caption.
 * Color-matches the underlying status so it visually echoes the stoplight dot.
 */
export function PaceBadge({
  numericValue,
  target,
  period,
  className,
}: PaceProps & { className?: string }) {
  const result = pacingStatus({ value: numericValue, target, period });
  const cls =
    result.status === "green"
      ? "text-status-green"
      : result.status === "yellow"
        ? "text-status-yellow"
        : result.status === "red"
          ? "text-status-red"
          : "text-muted-foreground"; // neutral / no target
  const title =
    result.status === "neutral"
      ? "No target set for this period"
      : `Projected ${result.projected.toLocaleString()} of ${target.toLocaleString()} target (${result.percentOfPace}% of pace)`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide",
        cls,
        className,
      )}
      title={title}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {result.label}
    </span>
  );
}

export function Scorecard({
  label,
  value,
  sub,
  trend,
  status,
  size = "md",
  accent,
  className,
  tooltip,
  pulse,
  pace,
  metricKey,
  recordsHref,
  recordsLabel,
}: {
  label: string;
  value: string | number;
  sub?: ReactNode;
  trend?: { dir: "up" | "down"; value: string; positive?: boolean };
  status?: StoplightStatus;
  size?: "sm" | "md" | "lg" | "xl";
  accent?: boolean;
  className?: string;
  /** Optional 'so what' note shown on hover next to the label */
  tooltip?: string;
  /** When true, applies the persistent-red pulsing alert ring */
  pulse?: boolean;
  /**
   * If provided, the dot color and any caption are derived from pace projection
   * instead of the raw `status` prop. Use for any KPI tied to a period target
   * (monthly contracts, quarterly revenue, etc.) so partial periods don't burn red.
   */
  pace?: PaceProps;
  /**
   * Metric identifier for the red-state action library (e.g. "appts_set",
   * "talk_time"). When the tile is red (status==="red" OR pulse===true),
   * hovering reveals the recommended action + records link from
   * `lib/redActions.ts`.
   */
  metricKey?: string;
  /** Override the records link from the registry (deal-specific overrides). */
  recordsHref?: string;
  /** Override the records button label. */
  recordsLabel?: string;
}) {
  const valueClass = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
    xl: "text-5xl",
  }[size];
  // When a tile is red (either by explicit status, persistent-red pulse, OR
  // pace-derived red), try to attach a recommended-action tooltip.
  const paceRedStatus = pace
    ? pacingStatus({ value: pace.numericValue, target: pace.target, period: pace.period }).status
    : null;
  const isRed = pulse || status === "red" || paceRedStatus === "red";
  const redAction = isRed ? getRedAction(metricKey) : null;
  const finalRecordsHref = recordsHref ?? redAction?.recordsHref;
  const finalRecordsLabel = recordsLabel ?? redAction?.recordsLabel;
  return (
    <Card className={cn(className, pulse && "kpi-alert-pulse", isRed && "relative")} padding="p-0">
      <div className="bb-card-header-sm">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex items-center gap-1.5">
            <div className="text-[10px] uppercase tracking-[0.12em] font-semibold" style={{ color: "hsl(var(--baby-blue-700))" }}>
              {label}
            </div>
            {tooltip && (
              <span className="kpi-tooltip" tabIndex={0} aria-label="What this KPI means">
                <span className="kpi-tooltip-icon" aria-hidden>i</span>
                <span role="tooltip" className="kpi-tooltip-bubble">
                  <strong>{label}</strong>
                  {tooltip}
                </span>
              </span>
            )}
            {redAction && (
              <span
                className="kpi-tooltip kpi-tooltip-red"
                tabIndex={0}
                aria-label="Recommended action for this red KPI"
              >
                <span
                  className="kpi-tooltip-icon kpi-tooltip-icon-red"
                  aria-hidden
                >!</span>
                <span role="tooltip" className="kpi-tooltip-bubble kpi-tooltip-bubble-red">
                  <strong className="block mb-1 uppercase tracking-wider text-[10px]" style={{ color: "hsl(var(--status-red))" }}>
                    {redAction.title}
                  </strong>
                  <span className="block mb-2">{redAction.action}</span>
                  {finalRecordsHref && (
                    <a
                      href={finalRecordsHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold underline"
                      style={{ color: "hsl(var(--baby-blue-700))" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      → {finalRecordsLabel ?? "Open records"}
                    </a>
                  )}
                </span>
              </span>
            )}
          </div>
          {pace ? (() => {
            // When a metric has no target for the current period, render a muted
            // gray dot instead of red/yellow — reds should only appear when
            // we're meaningfully behind a real target.
            const paceResult = pacingStatus({
              value: pace.numericValue,
              target: pace.target,
              period: pace.period,
            });
            if (paceResult.status === "neutral") {
              return (
                <span
                  aria-label="No target set"
                  title="No target set for this period"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-muted-foreground/40"
                />
              );
            }
            return <StoplightDot status={paceResult.status} />;
          })() : (
            status && <StoplightDot status={status} />
          )}
        </div>
      </div>
      <div className="px-4 pb-3 pt-1">
        <div
          className={cn(
            "scorecard tabular",
            valueClass,
            accent ? "text-primary" : "text-foreground",
          )}
        >
          {value}
        </div>
        {pace && (
          <div className="mt-1">
            <PaceBadge numericValue={pace.numericValue} target={pace.target} period={pace.period} />
          </div>
        )}
        {(sub || trend) && (
          <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
            {trend && (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 font-semibold",
                  trend.positive ?? trend.dir === "up"
                    ? "text-status-green"
                    : "text-status-red",
                )}
              >
                {trend.dir === "up" ? (
                  <ArrowUp className="h-3 w-3" />
                ) : (
                  <ArrowDown className="h-3 w-3" />
                )}
                {trend.value}
              </span>
            )}
            {sub && <span className="truncate">{sub}</span>}
          </div>
        )}
      </div>
    </Card>
  );
}

export function ProgressBar({
  value,
  max,
  status,
  className,
  showLabel = false,
}: {
  value: number;
  max: number;
  status?: StoplightStatus;
  className?: string;
  showLabel?: boolean;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const bar =
    status === "green"
      ? "bg-status-green"
      : status === "yellow"
        ? "bg-status-yellow"
        : status === "red"
          ? "bg-status-red"
          : "bg-primary";
  return (
    <div className={cn("space-y-1", className)}>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <div className="text-[11px] text-muted-foreground num">
          {pct.toFixed(0)}%
        </div>
      )}
    </div>
  );
}

// Circular progress ring — for hero KPI (revenue goal)
export function ProgressRing({
  value,
  max,
  size = 150,
  stroke = 12,
  label,
  sub,
  accent = "primary",
}: {
  value: number;
  max: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  sub?: ReactNode;
  accent?: "primary" | "green" | "yellow" | "red";
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(1, value / max);
  const offset = circumference * (1 - pct);

  const colorVar =
    accent === "green"
      ? "var(--status-green)"
      : accent === "yellow"
        ? "var(--status-yellow)"
        : accent === "red"
          ? "var(--status-red)"
          : "var(--primary)";

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="hsl(var(--muted))"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`hsl(${colorVar})`}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          fill="none"
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.2, 0.6, 0.2, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        {label && (
          <div className="scorecard tabular text-2xl text-foreground">
            {label}
          </div>
        )}
        {sub && (
          <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mt-0.5 px-2">
            {sub}
          </div>
        )}
      </div>
    </div>
  );
}

// Stat row inside cards — compact label/value pair
export function StatRow({
  label,
  value,
  sub,
  status,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  status?: StoplightStatus;
}) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-b-0" style={{ borderColor: "hsl(var(--card-border))" }}>
      <div className="flex items-center gap-1.5 min-w-0">
        {status && <StoplightDot status={status} />}
        <div className="text-[13px] text-muted-foreground">{label}</div>
      </div>
      <div className="text-right">
        <div className="text-[13px] font-semibold num">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground num">{sub}</div>}
      </div>
    </div>
  );
}

// Tab label for wall-screen section headers
export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          {eyebrow && (
            <div className="text-[10px] uppercase tracking-[0.16em] font-semibold mb-0.5" style={{ color: "hsl(var(--baby-blue-500))" }}>
              {eyebrow}
            </div>
          )}
          <h2 className="text-xl font-bold tracking-tight">
            {title}
          </h2>
        </div>
        {children}
      </div>
      <div className="bb-divider mt-3" />
    </div>
  );
}
