import { elevationGain, thin, totalDistance } from './geo';
import { computeBestEfforts, defaultTitle } from './stats';
import type { Run, Segment } from './types';

export function newRunId(startedAt: number): string {
  return `${startedAt.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Turns a finished recording into a saveable Run. */
export function buildRun(rec: {
  startedAt: number;
  segments: Segment[];
  movingMs: number;
  elapsedMs: number;
}): Run {
  // Best efforts use the full-resolution track; only the stored route is thinned.
  const segments = rec.segments.filter((s) => s.length > 0);
  return {
    id: newRunId(rec.startedAt),
    title: defaultTitle(rec.startedAt),
    notes: '',
    effort: null,
    startedAt: rec.startedAt,
    movingMs: rec.movingMs,
    elapsedMs: rec.elapsedMs,
    distanceM: totalDistance(segments),
    elevationGainM: elevationGain(segments),
    bestEfforts: computeBestEfforts(segments),
    segments: segments.map((s) => thin(s)),
  };
}
