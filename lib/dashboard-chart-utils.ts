import { format, isBefore, startOfMonth, subMonths } from 'date-fns';

// ─────────────────────────────────────────────
// Donut chart math
// ─────────────────────────────────────────────
//
// Renders as plain SVG (see components/donut-chart.tsx) rather than pulling
// in the recharts dependency — this project has hit a deterministic
// Next.js 13.5.1 SWC-minifier build bug before from introducing a new UI
// library into the module graph for the first time, so new visuals here are
// deliberately kept dependency-free.
//
// The classic technique: a circle with radius 15.91549430918954 has a
// circumference of exactly 100 (2 * pi * r), so percentages map directly
// onto `stroke-dasharray`/`stroke-dashoffset` without any further scaling.

export type DonutInput = { label: string; value: number };
export type DonutSegment = DonutInput & { percent: number; offset: number };

// `offset` is the cumulative percent of every prior segment — where this
// segment's arc should start along the circle's circumference.
export function computeDonutSegments(segments: DonutInput[]): DonutSegment[] {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  let cumulative = 0;
  return segments.map((s) => {
    const percent = total > 0 ? (s.value / total) * 100 : 0;
    const segment: DonutSegment = { ...s, percent, offset: cumulative };
    cumulative += percent;
    return segment;
  });
}

// ─────────────────────────────────────────────
// Growth series
// ─────────────────────────────────────────────

export type GrowthPoint = { month: string; count: number };

// Buckets a list of creation timestamps into `monthsBack` monthly buckets
// ending with the month of `referenceDate`, and returns the *cumulative*
// count as of the end of each month — this is what "inventory growth over
// time" means: a running total, not a per-month delta. Records older than
// the window are folded into the first bucket's baseline rather than
// dropped, so the line starts at the right total instead of at zero.
export function buildGrowthSeries(
  createdDates: Date[],
  monthsBack: number,
  referenceDate: Date = new Date(),
): GrowthPoint[] {
  const windowStart = startOfMonth(subMonths(referenceDate, monthsBack - 1));

  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    months.push(format(subMonths(referenceDate, i), 'yyyy-MM'));
  }

  const countsByMonth = new Map<string, number>();
  for (const m of months) countsByMonth.set(m, 0);

  let baseline = 0;
  for (const date of createdDates) {
    if (isBefore(date, windowStart)) {
      baseline++;
      continue;
    }
    const key = format(date, 'yyyy-MM');
    if (countsByMonth.has(key)) {
      countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
    }
  }

  let cumulative = baseline;
  return months.map((month) => {
    cumulative += countsByMonth.get(month) ?? 0;
    return { month, count: cumulative };
  });
}

// Formats a 'yyyy-MM' bucket key as a short label for chart axes, e.g. "Jan".
export function formatMonthLabel(month: string): string {
  const [year, monthNum] = month.split('-').map(Number);
  if (!year || !monthNum) return month;
  return format(new Date(year, monthNum - 1, 1), 'MMM');
}
