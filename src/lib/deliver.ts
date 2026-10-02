import { gps } from './gps';
import { recorder } from './recorder';
import type { TrackPoint } from './types';

/**
 * Every fix, from any source (background task, watcher, simulator), goes
 * through here: the status pill sees it and the recorder records it.
 * UI-free, so the headless background task can import it.
 */
export function deliver(points: TrackPoint[]) {
  if (points.length === 0) return;
  gps.report(points);
  recorder.addPoints(points);
}
