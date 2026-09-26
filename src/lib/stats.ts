import { progressSeries, type ProgressSample } from './geo';
import type { BestEffortKey, Run, Segment, Split, Units } from './types';

export const METRES_PER_MILE = 1609.344;

export const unitLength = (units: Units) => (units === 'metric' ? 1000 : METRES_PER_MILE);

export const BEST_EFFORTS: { key: BestEffortKey; label: string; metres: number }[] = [
  { key: '400m', label: '400m', metres: 400 },
  { key: '1k', label: '1K', metres: 1000 },
  { key: '1mi', label: '1 Mile', metres: METRES_PER_MILE },
  { key: '5k', label: '5K', metres: 5000 },
  { key: '10k', label: '10K', metres: 10000 },
  { key: 'half', label: 'Half Marathon', metres: 21097.5 },
  { key: 'marathon', label: 'Marathon', metres: 42195 },
];

/** Linear interpolation of the moving time at which distance `d` was reached between two samples. */
function timeAt(a: ProgressSample, b: ProgressSample, d: number): number {
  if (b.d === a.d) return a.t;
  return a.t + ((d - a.d) / (b.d - a.d)) * (b.t - a.t);
}

function altAt(a: ProgressSample, b: ProgressSample, d: number): number | null {
  if (a.alt == null || b.alt == null) return a.alt ?? b.alt;
  if (b.d === a.d) return a.alt;
  return a.alt + ((d - a.d) / (b.d - a.d)) * (b.alt - a.alt);
}

/** Pace in seconds per kilometre, or 0 when no distance was covered. */
export function paceSecPerKm(distanceM: number, durationMs: number): number {
  return distanceM > 0 ? durationMs / distanceM : 0;
}

/**
 * Splits the run into km (or mile) chunks. The final split is partial if
 * the run didn't end on a round number; partials under 50 m are dropped.
 */
export function computeSplits(segments: Segment[], units: Units): Split[] {
  const samples = progressSeries(segments);
  if (samples.length < 2) return [];
  const len = unitLength(units);
  const splits: Split[] = [];
  let startT = 0;
  let startAlt = samples[0].alt;
  let next = len;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1];
    const b = samples[i];
    while (b.d >= next) {
      const t = timeAt(a, b, next);
      const alt = altAt(a, b, next);
      splits.push({
        index: splits.length + 1,
        distanceM: len,
        durationMs: t - startT,
        paceSecPerKm: paceSecPerKm(len, t - startT),
        elevationDeltaM: alt != null && startAlt != null ? alt - startAlt : 0,
      });
      startT = t;
      startAlt = alt;
      next += len;
    }
  }
  const last = samples[samples.length - 1];
  const rest = last.d - (next - len);
  if (rest >= 50) {
    splits.push({
      index: splits.length + 1,
      distanceM: rest,
      durationMs: last.t - startT,
      paceSecPerKm: paceSecPerKm(rest, last.t - startT),
      elevationDeltaM: last.alt != null && startAlt != null ? last.alt - startAlt : 0,
    });
  }
  return splits;
}

/**
 * Fastest moving time (ms) over any continuous stretch of `metres` within
 * the run, or null if the run is shorter than that. Two-pointer sweep, O(n).
 */
export function fastestStretch(samples: ProgressSample[], metres: number): number | null {
  if (samples.length < 2 || samples[samples.length - 1].d < metres) return null;
  let best = Infinity;
  let i = 0;
  for (let j = 1; j < samples.length; j++) {
    const target = samples[j].d - metres;
    if (target < 0) continue;
    while (i + 1 < j && samples[i + 1].d <= target) i++;
    const t = samples[j].t - timeAt(samples[i], samples[i + 1], target);
    if (t < best) best = t;
  }
  return Number.isFinite(best) ? best : null;
}

export function computeBestEfforts(segments: Segment[]): Run['bestEfforts'] {
  const samples = progressSeries(segments);
  const out: Run['bestEfforts'] = {};
  for (const e of BEST_EFFORTS) {
    const t = fastestStretch(samples, e.metres);
    if (t != null) out[e.key] = Math.round(t);
  }
  return out;
}

export type PersonalRecord = { key: BestEffortKey; label: string; ms: number; runId: string; date: number };

export function personalRecords(runs: Run[]): PersonalRecord[] {
  return BEST_EFFORTS.flatMap((e) => {
    let best: PersonalRecord | null = null;
    for (const r of runs) {
      const ms = r.bestEfforts[e.key];
      if (ms != null && (!best || ms < best.ms)) {
        best = { key: e.key, label: e.label, ms, runId: r.id, date: r.startedAt };
      }
    }
    return best ? [best] : [];
  });
}

/** Which of this run's efforts are the fastest across all runs (ties go to the earliest run). */
export function prsSetBy(run: Run, runs: Run[]): BestEffortKey[] {
  return personalRecords(runs)
    .filter((pr) => pr.runId === run.id)
    .map((pr) => pr.key);
}

/** Monday 00:00 local time of the week containing `ts`. */
export function startOfWeek(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - dow);
  return d.getTime();
}

export type WeekSummary = { weekStart: number; distanceM: number; movingMs: number; runs: number; elevationGainM: number };

/** The last `count` weeks (oldest first), including empty ones. */
export function weeklySummaries(runs: Run[], count: number, now = Date.now()): WeekSummary[] {
  const current = startOfWeek(now);
  const weeks: WeekSummary[] = [];
  for (let k = count - 1; k >= 0; k--) {
    const d = new Date(current);
    d.setDate(d.getDate() - 7 * k);
    weeks.push({ weekStart: d.getTime(), distanceM: 0, movingMs: 0, runs: 0, elevationGainM: 0 });
  }
  for (const r of runs) {
    const ws = startOfWeek(r.startedAt);
    const w = weeks.find((x) => x.weekStart === ws);
    if (!w) continue;
    w.distanceM += r.distanceM;
    w.movingMs += r.movingMs;
    w.runs += 1;
    w.elevationGainM += r.elevationGainM;
  }
  return weeks;
}

/** Consecutive weeks (ending this week or last week) with at least one run. */
export function weekStreak(runs: Run[], now = Date.now()): number {
  const weeks = new Set(runs.map((r) => startOfWeek(r.startedAt)));
  const cursor = new Date(startOfWeek(now));
  if (!weeks.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 7);
  let streak = 0;
  while (weeks.has(cursor.getTime())) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}

export function totals(runs: Run[]) {
  return runs.reduce(
    (acc, r) => ({
      runs: acc.runs + 1,
      distanceM: acc.distanceM + r.distanceM,
      movingMs: acc.movingMs + r.movingMs,
      elevationGainM: acc.elevationGainM + r.elevationGainM,
      longestM: Math.max(acc.longestM, r.distanceM),
    }),
    { runs: 0, distanceM: 0, movingMs: 0, elevationGainM: 0, longestM: 0 },
  );
}

/** A title like "Morning Run" based on the local start hour. */
export function defaultTitle(startedAt: number): string {
  const h = new Date(startedAt).getHours();
  if (h < 5) return 'Night Run';
  if (h < 12) return 'Morning Run';
  if (h < 14) return 'Lunch Run';
  if (h < 18) return 'Afternoon Run';
  if (h < 22) return 'Evening Run';
  return 'Night Run';
}
