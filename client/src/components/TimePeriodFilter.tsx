import { cn } from "@/lib/utils";

export type TimePeriod = "day" | "week" | "month" | "quarter" | "year";
const PERIODS: { key: TimePeriod; label: string }[] = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "quarter", label: "Quarter" },
  { key: "year", label: "Year" },
];

export function TimePeriodFilter({
  value,
  onChange,
  className,
}: {
  value: TimePeriod;
  onChange: (p: TimePeriod) => void;
  className?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-lg bg-muted p-1", className)}
      data-testid="time-period-filter"
    >
      {PERIODS.map((p) => (
        <button
          key={p.key}
          onClick={() => onChange(p.key)}
          data-testid={`filter-${p.key}`}
          className={cn(
            "px-3 py-1.5 rounded-md text-[11px] uppercase tracking-[0.12em] font-semibold transition-all",
            value === p.key
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-accent"
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
