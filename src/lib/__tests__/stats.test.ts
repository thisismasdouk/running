import { computeBestEfforts, computeSplits, fastestStretch, personalRecords, startOfWeek, weeklySummaries, weekStreak } from '../stats';
import { progressSeries } from '../geo';
import type { Run } from '../types';
import { straightRun } from '@/test/helpers';

const run = (over: Partial<Run>): Run => ({
  id: 'r',
  title: 'Run',
  notes: '',
  effort: null,
  startedAt: 0,
  movingMs: 0,
  elapsedMs: 0,
  distanceM: 0,
  elevationGainM: 0,
  segments: [],
  bestEfforts: {},
  ...over,
});

describe('computeSplits', () => {
  it('splits a 5:00/km run into even km splits plus a partial', () => {
    const splits = computeSplits([straightRun(3500, 300)], 'metric');
    expect(splits).toHaveLength(4);
    for (const s of splits.slice(0, 3)) {
      expect(s.distanceM).toBe(1000);
      expect(s.paceSecPerKm).toBeCloseTo(300, 0);
    }
    expect(splits[3].distanceM).toBeCloseTo(500, 0);
    expect(splits[3].paceSecPerKm).toBeCloseTo(300, 0);
  });

  it('uses miles for imperial units', () => {
    const splits = computeSplits([straightRun(3250, 300)], 'imperial');
    expect(splits.map((s) => Math.round(s.distanceM))).toEqual([1609, 1609]);
  });

  it('does not count paused time', () => {
    const a = straightRun(500, 300);
    const b = straightRun(500, 300, { start: a[a.length - 1].t + 600_000 }).map((p) => ({ ...p, lat: p.lat + 0.01 }));
    const [split] = computeSplits([a, b], 'metric');
    expect(split.durationMs).toBeCloseTo(300_000, -3);
  });
});

describe('best efforts', () => {
  it('finds the fastest stretch inside a run with a fast middle', () => {
    const slow1 = straightRun(2000, 360);
    const fast = straightRun(1000, 240).map((p) => ({ ...p, lat: p.lat + slow1[slow1.length - 1].lat, t: p.t + slow1[slow1.length - 1].t }));
    const lastFast = fast[fast.length - 1];
    const slow2 = straightRun(2000, 360).map((p) => ({ ...p, lat: p.lat + lastFast.lat, t: p.t + lastFast.t }));
    const samples = progressSeries([[...slow1, ...fast.slice(1), ...slow2.slice(1)]]);
    expect(fastestStretch(samples, 1000)! / 1000).toBeCloseTo(240, -1);
  });

  it('only includes distances the run reached', () => {
    const efforts = computeBestEfforts([straightRun(5100, 300)]);
    expect(Object.keys(efforts).sort()).toEqual(['1k', '1mi', '400m', '5k'].sort());
    expect(efforts['5k']! / 1000).toBeCloseTo(1500, -1);
  });

  it('picks the fastest run as the PR', () => {
    const prs = personalRecords([
      run({ id: 'a', bestEfforts: { '5k': 1_500_000 } }),
      run({ id: 'b', bestEfforts: { '5k': 1_400_000, '1k': 250_000 } }),
    ]);
    expect(prs.find((p) => p.key === '5k')?.runId).toBe('b');
    expect(prs.find((p) => p.key === '10k')).toBeUndefined();
  });

  it('credits a tie to the earlier run even when runs are sorted newest first', () => {
    const prs = personalRecords([
      run({ id: 'new', startedAt: 2000, bestEfforts: { '1k': 240_000 } }),
      run({ id: 'old', startedAt: 1000, bestEfforts: { '1k': 240_000 } }),
    ]);
    expect(prs.find((p) => p.key === '1k')?.runId).toBe('old');
  });
});

describe('weeks', () => {
  const wed = new Date(2026, 8, 23, 12).getTime(); // Wed 23 Sep 2026

  it('starts weeks on Monday', () => {
    expect(new Date(startOfWeek(wed)).getDay()).toBe(1);
    expect(new Date(startOfWeek(wed)).getDate()).toBe(21);
  });

  it('buckets runs into weeks, oldest first', () => {
    const lastWeek = wed - 7 * 86_400_000;
    const weeks = weeklySummaries([run({ startedAt: wed, distanceM: 5000 }), run({ startedAt: lastWeek, distanceM: 8000 })], 3, wed);
    expect(weeks.map((w) => w.distanceM)).toEqual([0, 8000, 5000]);
  });

  it('counts a streak that ended last week', () => {
    const day = 86_400_000;
    const runs = [run({ startedAt: wed - 7 * day }), run({ startedAt: wed - 14 * day }), run({ startedAt: wed - 28 * day })];
    expect(weekStreak(runs, wed)).toBe(2);
    expect(weekStreak([], wed)).toBe(0);
  });
});
