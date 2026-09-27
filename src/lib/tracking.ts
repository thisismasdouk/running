import { Platform } from 'react-native';

import { deliver } from './deliver';
import { gps, type TrackingMode } from './gps';
import {
  getAccess,
  lastKnownPosition,
  startBackgroundUpdates,
  stopBackgroundUpdates,
  supportsBackgroundUpdates,
  watchPosition,
  type AccessResult,
} from './location';
import { recorder } from './recorder';
import { startSimulator } from './simulator';
import type { TrackPoint } from './types';

export type { Access, AccessResult } from './location';
export type { TrackingMode } from './gps';
export { canOpenSettings, openSettings } from './location';


const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => resolve(onTimeout()), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      },
    );
  });
}

/**
 * Checks (or with `ask`, requests) location access. Never throws and never
 * hangs: failures and timeouts come back as 'unavailable' with a message.
 */
export async function checkAccess(ask: boolean): Promise<AccessResult> {
  // A native permission dialog can legitimately stay open a while; a browser prompt can be ignored forever.
  const ms = Platform.OS === 'web' ? 15_000 : ask ? 120_000 : 10_000;
  try {
    return await withTimeout(getAccess(ask), ms, () => ({
      access: 'unavailable',
      message:
        Platform.OS === 'web'
          ? 'No answer from the location prompt. Allow location for this site, then try again.'
          : 'Location did not respond. Try again.',
    }));
  } catch (e) {
    return { access: 'unavailable', message: message(e) };
  }
}

export { lastKnownPosition };

// All start/stop work runs one at a time, so a quick Start → Finish or a
// double tap can't interleave and leave a watcher or task running.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(f: () => Promise<T>): Promise<T> {
  const next = queue.then(f, f);
  queue = next.catch(() => {});
  return next;
}

let mode: TrackingMode | null = null;
let stopSource: (() => void) | null = null;

export const trackingMode = () => mode;

function setMode(next: TrackingMode | null) {
  mode = next;
  gps.setMode(next);
}

/**
 * Starts delivering fixes to the recorder and returns how. Prefers OS-managed
 * updates that survive a locked screen, falls back to a foreground watcher
 * (e.g. in Expo Go), or runs the web demo simulator. Safe to call repeatedly.
 * Rejects if no source could be started.
 */
export function startTracking(opts: { simulate?: boolean; origin?: TrackPoint | null } = {}): Promise<TrackingMode> {
  return serial(async () => {
    if (mode === 'simulated' && !opts.simulate) await teardown();
    if (mode) return mode;
    if (opts.simulate) {
      stopSource = startSimulator(opts.origin, () => recorder.get().status === 'recording', (p) => deliver([p]));
      setMode('simulated');
      return mode!;
    }
    if (supportsBackgroundUpdates) {
      try {
        await startBackgroundUpdates();
        setMode('background');
        return mode!;
      } catch {
        // Fall back to a watcher below.
      }
    }
    stopSource = await watchPosition(
      (p) => deliver([p]),
      (msg) => gps.reportError(msg),
    );
    setMode('foreground');
    return mode!;
  });
}

async function teardown() {
  stopSource?.();
  stopSource = null;
  if (supportsBackgroundUpdates) await stopBackgroundUpdates();
  setMode(null);
}

export function stopTracking(): Promise<void> {
  return serial(teardown);
}

/**
 * A lightweight watcher for the idle Record screen so the status pill shows
 * a live fix (and its accuracy) before Start. Returns a stop function that is
 * safe to call before the watcher has finished starting.
 */
export function startPreview(): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  watchPosition(
    (p) => deliver([p]),
    (msg) => gps.reportError(msg),
  ).then(
    (s) => (cancelled ? s() : (stop = s)),
    (e) => gps.reportError(message(e)),
  );
  return () => {
    cancelled = true;
    stop?.();
  };
}

/**
 * Called once at app start: if a run was in progress when the app was killed
 * or reloaded, get fixes flowing again without waiting for the Record screen.
 */
export async function resumeTrackingIfNeeded(): Promise<void> {
  const s = recorder.get();
  if (s.status === 'idle') {
    // expo-task-manager restores registered tasks on launch. If the app died between
    // startTracking() and recorder.start() (countdown, a permission prompt, a crash),
    // an orphaned location task would keep running with nothing recording it.
    await stopTracking();
    return;
  }
  try {
    if (s.simulated) {
      const segs = s.segments.flat();
      await startTracking({ simulate: true, origin: segs[segs.length - 1] });
      return;
    }
    const { access } = await checkAccess(false);
    if (access === 'granted') await startTracking();
  } catch (e) {
    gps.reportError(message(e));
  }
}
