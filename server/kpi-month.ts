// kpi-month.ts
// ----------------------------------------------------------------------------
// MTHS KPI months do NOT match calendar months. They run MONDAY → SUNDAY.
// Example: 2026 "JAN" = Dec 29, 2025 → Feb 1, 2026.
//
// This module parses the inline date hints from sheet headers like
//   "JAN (Dec 29-Feb1)", "FEB (Feb 2-Mar1)", "MAR (2-29)", "APR (30-4)",
//   "MAY", "JUN", ...
// and produces a calendar of {start, end, key} for the current year.
//
// For headers with no inline range (e.g. "MAY"), the boundaries are computed
// to continue the chain: each KPI month starts the day after the previous
// month's end. Each month should span ~4-5 full weeks (Mon-Sun) so we walk
// forward roughly 4 weeks then snap to the next Sunday whose week count
// brings us closest to the original calendar boundary.
// ----------------------------------------------------------------------------

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"] as const;
const MONTH_FULL_TO_IDX: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, july: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

export type KpiMonth = {
  /** "Jan" | "Feb" | ... | "Dec" */
  key: string;
  /** Column header from the sheet, e.g. "JAN (Dec 29-Feb1)" */
  header: string;
  /** Inclusive start date (Monday) */
  start: Date;
  /** Inclusive end date (Sunday) */
  end: Date;
};

function parseMonthAndDay(s: string, fallbackMonth: number, year: number): Date | null {
  // Parse "Dec 29", "Feb1", "29", etc.
  const m = s.trim().toLowerCase();
  let monIdx = fallbackMonth;
  let dayStr = m;

  // Look for a month token at the start
  const monMatch = m.match(/^([a-z]{3,5})\s*(\d{1,2})$/);
  if (monMatch) {
    const tok = monMatch[1];
    if (MONTH_FULL_TO_IDX[tok] !== undefined) {
      monIdx = MONTH_FULL_TO_IDX[tok];
      dayStr = monMatch[2];
    }
  } else {
    const justDay = m.match(/^(\d{1,2})$/);
    if (!justDay) return null;
    dayStr = justDay[1];
  }
  const day = parseInt(dayStr, 10);
  if (isNaN(day) || day < 1 || day > 31) return null;
  // Year may need to roll back (e.g. "Dec 29" in a January header)
  return new Date(year, monIdx, day);
}

/**
 * Parse a header like "JAN (Dec 29-Feb1)" or "MAR (2-29)" or "MAY".
 * Returns the parsed range, or null if no range was specified.
 */
function parseHeaderRange(header: string, monthIdx: number, year: number): { start: Date; end: Date } | null {
  const m = header.match(/\(([^)]+)\)/);
  if (!m) return null;
  const inside = m[1];
  // Try various splits: "Dec 29-Feb1", "Feb 2-Mar1", "2-29", "30-4"
  const parts = inside.split(/[-–—]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length !== 2) return null;

  // Left side: starts in prior or current month
  let leftMonth = monthIdx;
  let leftYear = year;
  const leftHasMonth = /[a-z]/i.test(parts[0]);
  if (leftHasMonth) {
    // The month is explicit
    const start = parseMonthAndDay(parts[0], monthIdx, year);
    if (!start) return null;
    // If the parsed month is later in the year than monthIdx, we crossed into prior calendar year
    if (start.getMonth() > monthIdx) {
      start.setFullYear(year - 1);
    }
    // Right side
    let end: Date | null;
    if (/[a-z]/i.test(parts[1])) {
      end = parseMonthAndDay(parts[1], monthIdx, year);
      if (end && end.getMonth() < start.getMonth() && start.getFullYear() === year - 1) {
        // start in prev year, end in current year - already correct
      }
    } else {
      // Right is just a day; assume it's in the *next* month from start (since KPI months span)
      const nextMon = (start.getMonth() + 1) % 12;
      const nextYr = nextMon === 0 ? start.getFullYear() + 1 : start.getFullYear();
      end = new Date(nextYr, nextMon, parseInt(parts[1], 10));
    }
    if (!end) return null;
    return { start, end };
  } else {
    // Left is just a day (e.g. "2-29" or "30-4"). Day belongs to monthIdx or monthIdx-1.
    const d1 = parseInt(parts[0], 10);
    const d2 = parseInt(parts[1], 10);
    if (isNaN(d1) || isNaN(d2)) return null;
    // If d1 is "large" (>20) and we're at start of month, it's previous month
    let startMon = monthIdx;
    let startYr = year;
    if (d1 > 20) {
      startMon = monthIdx - 1;
      if (startMon < 0) { startMon = 11; startYr = year - 1; }
    }
    const start = new Date(startYr, startMon, d1);
    // End: if d2 < d1, it's the *next* month
    let endMon = startMon;
    let endYr = startYr;
    if (d2 < d1) {
      endMon = (startMon + 1) % 12;
      if (endMon === 0) endYr = startYr + 1;
    } else {
      // If start was in monthIdx, end stays in monthIdx (e.g. "2-29")
      endMon = monthIdx;
      endYr = year;
    }
    const end = new Date(endYr, endMon, d2);
    return { start, end };
  }
}

/** Snap a date forward to the nearest Sunday. */
function nextSunday(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const offset = day === 0 ? 0 : 7 - day;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
}

/**
 * Build the full year's KPI month calendar from sheet headers.
 *
 * @param headers - SALES_MONTH_COLS e.g. ["JAN (Dec 29-Feb1)", ..., "MAY", ..., "DEC"]
 * @param year - The KPI year, e.g. 2026
 */
export function buildKpiMonthCalendar(headers: string[], year: number): KpiMonth[] {
  const months: KpiMonth[] = [];
  let cursorStart: Date | null = null;

  for (let i = 0; i < Math.min(headers.length, 12); i++) {
    const header = headers[i];
    const key = MONTH_SHORT[i];
    const range = parseHeaderRange(header, i, year);
    let start: Date;
    let end: Date;
    if (range) {
      start = range.start;
      end = range.end;
    } else {
      // Compute: starts day after previous end; ends on a Sunday ~4-5 weeks later
      if (cursorStart) {
        start = new Date(cursorStart.getFullYear(), cursorStart.getMonth(), cursorStart.getDate());
      } else {
        // Fall back to first Monday on or after the 1st of this calendar month
        const first = new Date(year, i, 1);
        const dow = first.getDay();
        const mondayOffset = dow === 0 ? 1 : dow === 1 ? 0 : 8 - dow;
        start = new Date(year, i, 1 + mondayOffset);
      }
      // KPI month should END on a Sunday that lands in this calendar month if possible.
      // Walk forward from start; end is the LAST Sunday whose date is in calendar month i,
      // unless that gives < 28 days span (i.e. month had a Sunday very early), in which case
      // extend one more week.
      const probe = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      let lastSundayInMonth: Date | null = null;
      for (let j = 0; j < 42; j++) {
        const d = new Date(probe.getFullYear(), probe.getMonth(), probe.getDate() + j);
        if (d.getDay() === 0 && d.getMonth() === i) {
          lastSundayInMonth = d;
        }
        // Stop if we've passed calendar month i
        if (d.getMonth() !== i && d.getMonth() !== probe.getMonth()) break;
      }
      if (lastSundayInMonth) {
        end = lastSundayInMonth;
      } else {
        // Fallback: 4 weeks forward then snap to Sunday
        const tmp = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 27);
        end = nextSunday(tmp);
      }
    }
    months.push({ key, header, start, end });
    cursorStart = new Date(end.getFullYear(), end.getMonth(), end.getDate() + 1);
  }
  return months;
}

/**
 * Given today's date and the KPI calendar, return the index (0-11) of the
 * KPI month "today" falls into. Returns the calendar month idx as fallback.
 */
export function getCurrentKpiMonthIdx(today: Date, calendar: KpiMonth[]): number {
  const t = today.getTime();
  for (let i = 0; i < calendar.length; i++) {
    const m = calendar[i];
    // end is the Sunday end-of-day; include full day
    const endEod = new Date(m.end.getFullYear(), m.end.getMonth(), m.end.getDate(), 23, 59, 59);
    if (t >= m.start.getTime() && t <= endEod.getTime()) return i;
  }
  // Fallback
  return today.getMonth();
}

export function getCurrentKpiMonthShort(today: Date, calendar: KpiMonth[]): string {
  return MONTH_SHORT[getCurrentKpiMonthIdx(today, calendar)];
}
