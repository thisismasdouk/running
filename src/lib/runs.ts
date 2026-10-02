import { elevationGain, thin, totalDistance } from './geo';
import { computeBestEfforts, defaultTitle } from './stats';
import type { FlatStep, Lap, Run, RunType, Segment } from './types';

export const RUN_TYPES: { key: RunType; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'long', label: 'Long' },
  { key: 'tempo', label: 'Tempo' },
  { key: 'intervals', label: 'Intervals' },
  { key: 'race', label: 'Race' },
  { key: 'recovery', label: 'Recovery' },
];

export const runTypeOf = (run: Pick<Run, 'type'>): RunType => run.type ?? 'easy';
export const runTypeLabel = (type: RunType) => RUN_TYPES.find((t) => t.key === type)?.label ?? 'Easy';

/**
 * Fills in anything a run saved by an older version (or a damaged record)
 * might be missing, so screens can rely on the required fields.
 */
export function normaliseRun(raw: Run): Run {
  const run: Run = {
    ...raw,
    title: raw.title ?? '',
    notes: raw.notes ?? '',
    effort: raw.effort ?? null,
    segments: Array.isArray(raw.segments) ? raw.segments : [],
    bestEfforts: raw.bestEfforts ?? {},
  };
  if (run.type && !RUN_TYPES.some((t) => t.key === run.type)) delete run.type;
  if (run.laps && !Array.isArray(run.laps)) delete run.laps;
  if (run.workoutSteps && !Array.isArray(run.workoutSteps)) delete run.workoutSteps;
  return run;
}

export function newRunId(startedAt: number): string {
  return `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Turns a finished recording into a saveable Run. */
export function buildRun(rec: {
  startedAt: number;
  segments: Segment[];
  movingMs: number;
  elapsedMs: number;
  simulated?: boolean;
  laps?: Lap[];
  /** The guided workout followed, if any. */
  workout?: { id: string; name: string; runType: RunType; steps: FlatStep[] } | null;
}): Run {
  // Best efforts use the full-resolution track; only the stored route is thinned.
  const segments = rec.segments.filter((s) => s.length > 0);
  // A workout's name ("6 × 400 m") says more than "Morning Run".
  const title = rec.workout?.name ?? defaultTitle(rec.startedAt);
  return {
    id: newRunId(rec.startedAt),
    title: rec.simulated ? `Simulated ${title}` : title,
    notes: '',
    effort: null,
    startedAt: rec.startedAt,
    movingMs: rec.movingMs,
    elapsedMs: rec.elapsedMs,
    distanceM: totalDistance(segments),
    elevationGainM: elevationGain(segments),
    bestEfforts: computeBestEfforts(segments),
    segments: segments.map((s) => thin(s)),
    ...(rec.simulated ? { simulated: true } : {}),
    ...(rec.laps?.length ? { laps: rec.laps } : {}),
    ...(rec.workout
      ? { workoutId: rec.workout.id, workoutName: rec.workout.name, workoutSteps: rec.workout.steps, type: rec.workout.runType }
      : {}),
  };
}
