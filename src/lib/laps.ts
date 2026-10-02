import type { Lap } from './types';

/** Where the Lap button was pressed: totals for the run so far at that moment. */
export type LapMark = { distanceM: number; movingMs: number };

/**
 * Turns Lap presses into laps. The run's end closes a final lap, so two
 * presses make three laps. No presses means no laps.
 */
export function lapsFromMarks(marks: LapMark[], end: LapMark): Lap[] {
  if (marks.length === 0) return [];
  const laps: Lap[] = [];
  let prev: LapMark = { distanceM: 0, movingMs: 0 };
  for (const m of [...marks, end]) {
    laps.push({ distanceM: Math.max(0, m.distanceM - prev.distanceM), movingMs: Math.max(0, m.movingMs - prev.movingMs) });
    prev = m;
  }
  // Finishing straight after a Lap press leaves an empty last lap; drop it.
  const last = laps[laps.length - 1];
  if (laps.length > 1 && last.movingMs < 1000 && last.distanceM < 1) laps.pop();
  return laps;
}
