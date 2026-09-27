import { useSyncExternalStore } from 'react';

import { MAX_ACCURACY_M } from './geo';
import type { TrackPoint } from './types';

/** How fixes are reaching the app right now. */
export type TrackingMode = 'background' | 'foreground' | 'simulated';

export type GpsState = {
  /** Latest raw fix, accepted by the recorder or not. */
  fix: TrackPoint | null;
  /** Local clock time the fix arrived (fix timestamps can come from a different clock). */
  receivedAt: number | null;
  /** Last error reported by the location provider, cleared by the next fix. */
  error: string | null;
  mode: TrackingMode | null;
};

export type GpsSignal = 'searching' | 'weak' | 'ready' | 'lost';

let state: GpsState = { fix: null, receivedAt: null, error: null, mode: null };
const listeners = new Set<() => void>();

function set(next: GpsState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Live GPS status for the UI, separate from the recorder so warm-up fixes are visible too. */
export const gps = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  report(points: TrackPoint[], now = Date.now()) {
    const fix = points[points.length - 1];
    if (fix) set({ ...state, fix, receivedAt: now, error: null });
  },
  reportError(message: string) {
    set({ ...state, error: message });
  },
  setMode(mode: TrackingMode | null) {
    if (mode !== state.mode) set({ ...state, mode });
  },
  /** Forget the last fix, e.g. when location access was lost. */
  reset() {
    set({ fix: null, receivedAt: null, error: null, mode: state.mode });
  },
};

/**
 * Classifies the live signal: no fix yet, a fix too inaccurate to record,
 * a usable fix, or no fix for a while. `readyAccuracyM` is the accuracy the
 * recorder needs right now: the stricter FIRST_FIX_ACCURACY_M before a
 * segment has its first point, MAX_ACCURACY_M after that.
 */
export function gpsSignal(
  s: Pick<GpsState, 'fix' | 'receivedAt'>,
  now: number,
  lostAfterMs = 15_000,
  readyAccuracyM = MAX_ACCURACY_M,
): GpsSignal {
  if (!s.fix || s.receivedAt == null) return 'searching';
  if (now - s.receivedAt > lostAfterMs) return 'lost';
  if (s.fix.acc != null && s.fix.acc > readyAccuracyM) return 'weak';
  return 'ready';
}

export function useGps(): GpsState {
  return useSyncExternalStore(gps.subscribe, gps.get, gps.get);
}
