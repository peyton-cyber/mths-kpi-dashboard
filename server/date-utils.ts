// Shared date-parsing helpers used by sheets.ts and deal-analytics.ts.
// Historic Deal KPIs is messy: M/D/YY, M/D/YYYY, ISO, MM/DD/YY.

export function parseFlexDate(s: string | undefined | null): Date | null {
  if (!s || typeof s !== "string") return null;
  const t = s.trim();
  if (!t) return null;
  // ISO format YYYY-MM-DD
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return isNaN(d.getTime()) ? null : d;
  }
  // M/D/YY or MM/DD/YYYY
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (m) {
    let yr = Number(m[3]);
    if (yr < 100) yr = yr < 50 ? 2000 + yr : 1900 + yr;
    const d = new Date(yr, Number(m[1]) - 1, Number(m[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  // Fallback: native parse
  const d = new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

export function daysBetween(a: Date | null, b: Date | null): number | null {
  if (!a || !b) return null;
  const ms = b.getTime() - a.getTime();
  if (ms < 0) return null;
  return Math.round(ms / (1000 * 60 * 60 * 24));
}
