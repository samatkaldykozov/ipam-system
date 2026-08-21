import { describe, expect, it } from 'vitest';

import {
  buildGrowthSeries,
  computeDonutSegments,
  formatMonthLabel,
} from './dashboard-chart-utils';

describe('computeDonutSegments', () => {
  it('computes percent and cumulative offset for each segment', () => {
    const result = computeDonutSegments([
      { label: 'Assigned', value: 30 },
      { label: 'Available', value: 50 },
      { label: 'Reserved', value: 20 },
    ]);

    expect(result[0]).toEqual({
      label: 'Assigned',
      value: 30,
      percent: 30,
      offset: 0,
    });
    expect(result[1]).toEqual({
      label: 'Available',
      value: 50,
      percent: 50,
      offset: 30,
    });
    expect(result[2]).toEqual({
      label: 'Reserved',
      value: 20,
      percent: 20,
      offset: 80,
    });
  });

  it('returns all-zero percents when every value is zero, without dividing by zero', () => {
    const result = computeDonutSegments([
      { label: 'A', value: 0 },
      { label: 'B', value: 0 },
    ]);
    expect(result).toEqual([
      { label: 'A', value: 0, percent: 0, offset: 0 },
      { label: 'B', value: 0, percent: 0, offset: 0 },
    ]);
  });

  it('handles a single segment covering the whole circle', () => {
    const result = computeDonutSegments([{ label: 'All', value: 10 }]);
    expect(result).toEqual([
      { label: 'All', value: 10, percent: 100, offset: 0 },
    ]);
  });

  it('returns an empty array for no segments', () => {
    expect(computeDonutSegments([])).toEqual([]);
  });
});

describe('buildGrowthSeries', () => {
  const reference = new Date('2026-08-15T12:00:00Z');

  it('returns one bucket per month, ending at the reference month', () => {
    const series = buildGrowthSeries([], 3, reference);
    expect(series.map((p) => p.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });

  it('accumulates counts cumulatively across months', () => {
    const dates = [
      new Date('2026-06-05T00:00:00Z'),
      new Date('2026-06-20T00:00:00Z'),
      new Date('2026-07-10T00:00:00Z'),
      new Date('2026-08-01T00:00:00Z'),
      new Date('2026-08-02T00:00:00Z'),
      new Date('2026-08-03T00:00:00Z'),
    ];
    const series = buildGrowthSeries(dates, 3, reference);
    expect(series).toEqual([
      { month: '2026-06', count: 2 },
      { month: '2026-07', count: 3 },
      { month: '2026-08', count: 6 },
    ]);
  });

  it('folds records older than the window into the first bucket as a baseline', () => {
    const dates = [
      new Date('2020-01-01T00:00:00Z'), // long before the window
      new Date('2026-08-01T00:00:00Z'),
    ];
    const series = buildGrowthSeries(dates, 3, reference);
    expect(series).toEqual([
      { month: '2026-06', count: 1 },
      { month: '2026-07', count: 1 },
      { month: '2026-08', count: 2 },
    ]);
  });

  it('never decreases from one bucket to the next', () => {
    const series = buildGrowthSeries(
      [new Date('2026-06-15T00:00:00Z')],
      6,
      reference,
    );
    for (let i = 1; i < series.length; i++) {
      expect(series[i].count).toBeGreaterThanOrEqual(series[i - 1].count);
    }
  });
});

describe('formatMonthLabel', () => {
  it('formats a yyyy-MM bucket key as a short month label', () => {
    expect(formatMonthLabel('2026-01')).toBe('Jan');
    expect(formatMonthLabel('2026-12')).toBe('Dec');
  });

  it('returns the input unchanged if it is not a valid bucket key', () => {
    expect(formatMonthLabel('garbage')).toBe('garbage');
  });
});
