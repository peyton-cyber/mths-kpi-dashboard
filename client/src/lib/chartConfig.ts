// Shared chart styling constants for consistent, polished Recharts visuals

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 10,
  fontSize: 12,
  padding: "8px 12px",
  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
  lineHeight: "1.5",
} as const;

export const CHART_GRID_COLOR = "hsl(var(--border) / 0.5)";

export const CHART_AXIS = {
  stroke: "hsl(var(--muted-foreground) / 0.5)",
  fontSize: 11,
  tickLine: false as const,
  axisLine: false as const,
} as const;

export const CHART_LEGEND = {
  iconType: "circle" as const,
  wrapperStyle: { fontSize: 11, paddingTop: 8 },
} as const;

// Line chart defaults
export const LINE_DEFAULTS = {
  strokeWidth: 2.5,
  dot: { r: 3.5, strokeWidth: 2, fill: "hsl(var(--card))" },
  activeDot: { r: 5, strokeWidth: 2 },
} as const;

// Bar chart defaults
export const BAR_DEFAULTS = {
  radius: [4, 4, 0, 0] as [number, number, number, number],
  barSize: 28,
  isAnimationActive: false as const,
} as const;

export const BAR_HORIZONTAL_DEFAULTS = {
  radius: [0, 4, 4, 0] as [number, number, number, number],
  barSize: 24,
  isAnimationActive: false as const,
} as const;

// Format helpers for axes
export const moneyTickFormatter = (v: number) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

// Chart margin presets
export const CHART_MARGIN = { top: 8, right: 16, bottom: 4, left: -8 };
export const CHART_MARGIN_HORIZONTAL = { top: 8, right: 50, bottom: 8, left: 12 };
