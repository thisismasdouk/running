import type { ProgressSample } from './geo';

/*
 * Pace-over-distance series for the run detail chart. Raw GPS pace jumps
 * around from fix to fix, so each point is the average pace over a window of
 * distance centred on it (200 m by default).
 */

export type PacePoint = { d: number; pace: number };

/** Moving time (ms) at distance `d`, interpolated between samples. `samples` must have non-decreasing d. */
function timeAt(samples: ProgressSample[], d: number): number {
  let lo = 0;
  let hi = samples.length - 1;
  if (d <= samples[0].d) return samples[0].t;
  if (d >= samples[hi].d) return samples[hi].t;
  // First sample at or beyond d.
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d < d) lo = mid + 1;
    else hi = mid;
  }
  const b = samples[lo];
  const a = samples[lo - 1];
  const span = b.d - a.d;
  return span > 0 ? a.t + ((d - a.d) / span) * (b.t - a.t) : b.t;
}

/**
 * Smoothed pace (seconds per km) at evenly spaced distances along the run,
 * about `points` of them. Runs shorter than the window get one flat pace.
 */
export function paceSeries(samples: ProgressSample[], windowM = 200, points = 150): PacePoint[] {
  if (samples.length < 2) return [];
  const total = samples[samples.length - 1].d;
  if (total < 50) return [];
  const half = Math.min(windowM, total) / 2;
  const step = Math.max(10, total / points);
  const out: PacePoint[] = [];
  for (let d = 0; ; d = Math.min(total, d + step)) {
    // Keep the window full length at the ends by sliding it inward.
    const lo = Math.max(0, Math.min(d - half, total - 2 * half));
    const hi = lo + 2 * half;
    const ms = timeAt(samples, hi) - timeAt(samples, lo);
    if (ms > 0) out.push({ d, pace: ms / (hi - lo) });
    if (d >= total) break;
  }
  return out;
}

/**
 * Fastest and slowest pace to show. Walking breaks and stops would squash the
 * running part of the chart, so the slow end is capped well past the median.
 */
export function paceRange(series: PacePoint[]): { fast: number; slow: number } | null {
  if (series.length === 0) return null;
  const sorted = series.map((p) => p.pace).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const fast = sorted[0];
  const slow = Math.min(sorted[sorted.length - 1], median * 1.5);
  // At least 30 s/km of range, so an even run doesn't look jagged.
  const pad = Math.max(5, (30 - (slow - fast)) / 2);
  return { fast: Math.max(0, fast - pad), slow: slow + pad };
}
