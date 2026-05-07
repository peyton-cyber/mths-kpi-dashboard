/**
 * Pacing helpers — project current run-rate to period-end and assess on-pace status.
 *
 * Why this exists:
 *   The team was seeing scorecards burn red mid-month/mid-quarter because we were
 *   comparing partial-period actuals to full-period targets. That created false
 *   alarms ("we don't have 17 contracts yet — RED") even when we were ahead of pace.
 *
 *   Pacing logic answers a different question: "if today's velocity holds, will
 *   we hit the target by the end of the period?" That projection is what should
 *   drive the stoplight color, not the absolute count.
 *
 * Usage:
 *   const status = pacingStatus({ value: 7, target: 17, period: "month" });
 *   // -> { status: "green" | "yellow" | "red", label, projected, percentOfPace }
 */

export type StoplightStatus = "green" | "yellow" | "red";
export type PacePeriod = "day" | "week" | "month" | "quarter" | "year";

export interface PaceInput {
  /** Current actual to-date for the period */
  value: number;
  /** Full-period target */
  target: number;
  /** Period over which the target applies */
  period: PacePeriod;
  /**
   * Optional reference date (defaults to now). Used by tests so the same
   * input always returns the same projection.
   */
  now?: Date;
  /**
   * For weekly periods, override the week start (Monday default).
   * Sunday=0, Monday=1, etc.
   */
  weekStartsOn?: number;
}

export interface PaceResult {
  status: StoplightStatus;
  /** Short human label: "On Pace", "Behind Pace", "Ahead of Pace" */
  label: string;
  /** Projected period-end value if current pace holds */
  projected: number;
  /** Projected as % of target */
  percentOfPace: number;
  /** What fraction of the period has elapsed (0..1) */
  periodElapsed: number;
}

/**
 * How far through the current period are we?
 * Returns a fraction 0..1 of (elapsed / total).
 */
export function periodFractionElapsed(period: PacePeriod, now: Date = new Date(), weekStartsOn = 1): number {
  switch (period) {
    case "day": {
      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);
      const ms = now.getTime() - startOfDay.getTime();
      return Math.min(1, Math.max(0, ms / (24 * 60 * 60 * 1000)));
    }
    case "week": {
      const day = now.getDay(); // 0=Sun
      const offset = (day - weekStartsOn + 7) % 7;
      const startOfWeek = new Date(now);
      startOfWeek.setDate(now.getDate() - offset);
      startOfWeek.setHours(0, 0, 0, 0);
      const ms = now.getTime() - startOfWeek.getTime();
      return Math.min(1, Math.max(0, ms / (7 * 24 * 60 * 60 * 1000)));
    }
    case "month": {
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      // Use day-fraction so a partial day still counts (mid-day boost).
      const hourFrac = (now.getHours() + now.getMinutes() / 60) / 24;
      return Math.min(1, Math.max(0, (dayOfMonth - 1 + hourFrac) / daysInMonth));
    }
    case "quarter": {
      const month = now.getMonth();
      const quarterStartMonth = Math.floor(month / 3) * 3;
      const start = new Date(now.getFullYear(), quarterStartMonth, 1);
      const end = new Date(now.getFullYear(), quarterStartMonth + 3, 1);
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      return Math.min(1, Math.max(0, elapsed / total));
    }
    case "year": {
      const start = new Date(now.getFullYear(), 0, 1);
      const end = new Date(now.getFullYear() + 1, 0, 1);
      const total = end.getTime() - start.getTime();
      const elapsed = now.getTime() - start.getTime();
      return Math.min(1, Math.max(0, elapsed / total));
    }
  }
}

/**
 * Project current value to period-end if the pace holds.
 * Guards against division by zero at start of period.
 */
export function projectToEnd(value: number, period: PacePeriod, now: Date = new Date()): number {
  const frac = periodFractionElapsed(period, now);
  if (frac <= 0.001) return value; // too early to extrapolate
  return value / frac;
}

/**
 * Pacing thresholds:
 *   green:  projection >= 100% of target
 *   yellow: projection 85% to 99% of target
 *   red:    projection < 85% of target
 *
 * Why 85%: stoplights need to flag when we're meaningfully behind, not when
 * we're 1-2% short. 85% gives the team time to react before it becomes a
 * real miss, while keeping greens meaningful.
 */
export function pacingStatus(input: PaceInput): PaceResult {
  const now = input.now ?? new Date();
  const periodElapsed = periodFractionElapsed(input.period, now, input.weekStartsOn);

  // Special case: target is 0 or missing — don't render a misleading status
  if (!input.target || input.target <= 0) {
    return {
      status: "yellow",
      label: "No Target",
      projected: input.value,
      percentOfPace: 0,
      periodElapsed,
    };
  }

  const projected = projectToEnd(input.value, input.period, now);
  const percentOfPace = (projected / input.target) * 100;

  let status: StoplightStatus;
  let label: string;
  if (percentOfPace >= 100) {
    status = "green";
    // If they're meaningfully ahead, call it out
    label = percentOfPace >= 110 ? "Ahead of Pace" : "On Pace";
  } else if (percentOfPace >= 85) {
    status = "yellow";
    label = "Behind Pace";
  } else {
    status = "red";
    label = "Off Pace";
  }

  // Special case: period is essentially over and we still haven't hit it
  if (periodElapsed >= 0.97 && input.value < input.target) {
    status = input.value >= input.target * 0.85 ? "yellow" : "red";
    label = "Below Target";
  }

  return {
    status,
    label,
    projected: Math.round(projected),
    percentOfPace: Math.round(percentOfPace),
    periodElapsed,
  };
}

/**
 * Convenience: get just the status color from a value/target/period combo.
 */
export function pacingColor(value: number, target: number, period: PacePeriod): StoplightStatus {
  return pacingStatus({ value, target, period }).status;
}
