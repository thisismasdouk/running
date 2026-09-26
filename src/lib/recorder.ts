import { useSyncExternalStore } from 'react';

import { kv } from '@/store/storage';
import { acceptPoint, haversine } from './geo';
import type { Segment, TrackPoint } from './types';

export type RecorderStatus = 'idle' | 'recording' | 'paused';

export type RecorderState = {
  status: RecorderStatus;
  startedAt: number | null;
  segments: Segment[];
  distanceM: number;
  /** Moving time banked from earlier recording stretches. */
  bankedMs: number;
  /** When the current recording stretch began, or null while paused/idle. */
  resumedAt: number | null;
};

const KEY = 'recorder';
const IDLE: RecorderState = { status: 'idle', startedAt: null, segments: [], distanceM: 0, bankedMs: 0, resumedAt: null };

function load(): RecorderState {
  try {
    const raw = kv.get(KEY);
    return raw ? { ...IDLE, ...(JSON.parse(raw) as RecorderState) } : IDLE;
  } catch {
    return IDLE;
  }
}

let state: RecorderState | null = null;
const listeners = new Set<() => void>();
const splitListeners = new Set<(distanceM: number) => void>();
let unsaved = 0;

const current = () => (state ??= load());

function persist(force = false) {
  // Writing the whole track on every fix is wasteful; batch unless forced.
  if (force || ++unsaved >= 5) {
    unsaved = 0;
    const s = current();
    if (s.status === 'idle') kv.remove(KEY);
    else kv.set(KEY, JSON.stringify(s));
  }
}

function set(next: RecorderState, force = false) {
  state = next;
  persist(force);
  listeners.forEach((l) => l());
}

export const recorder = {
  get: current,

  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },

  /** Called with the new total distance whenever a whole km/mile (per `splitLength`) is crossed. */
  onSplit(l: (distanceM: number) => void) {
    splitListeners.add(l);
    return () => {
      splitListeners.delete(l);
    };
  },

  splitLength: 1000,

  start(now = Date.now()) {
    set({ status: 'recording', startedAt: now, segments: [[]], distanceM: 0, bankedMs: 0, resumedAt: now }, true);
  },

  pause(now = Date.now()) {
    const s = current();
    if (s.status !== 'recording') return;
    set({ ...s, status: 'paused', bankedMs: s.bankedMs + (now - (s.resumedAt ?? now)), resumedAt: null }, true);
  },

  resume(now = Date.now()) {
    const s = current();
    if (s.status !== 'paused') return;
    set({ ...s, status: 'recording', resumedAt: now, segments: [...s.segments, []] }, true);
  },

  /** Clears the in-progress run and returns what was recorded. */
  finish(now = Date.now()) {
    const s = current();
    const result = {
      startedAt: s.startedAt ?? now,
      segments: s.segments.filter((seg) => seg.length > 0),
      distanceM: s.distanceM,
      movingMs: movingMs(s, now),
      elapsedMs: now - (s.startedAt ?? now),
    };
    set(IDLE, true);
    return result;
  },

  discard() {
    set(IDLE, true);
  },

  addPoints(points: TrackPoint[]) {
    const s = current();
    if (s.status !== 'recording' || points.length === 0) return;
    const segments = s.segments.length ? s.segments.slice() : [[]];
    const seg = segments[segments.length - 1].slice();
    let distanceM = s.distanceM;
    for (const p of points) {
      const prev = seg[seg.length - 1];
      // Ignore stale fixes delivered from before this recording stretch began.
      if (s.resumedAt != null && p.t < s.resumedAt - 2000) continue;
      if (!acceptPoint(prev, p)) continue;
      if (prev) distanceM += haversine(prev, p);
      seg.push(p);
    }
    segments[segments.length - 1] = seg;
    const len = recorder.splitLength;
    const crossed = Math.floor(distanceM / len) > Math.floor(s.distanceM / len);
    set({ ...s, segments, distanceM });
    if (crossed) splitListeners.forEach((l) => l(distanceM));
  },
};

export function movingMs(s: RecorderState, now = Date.now()): number {
  return s.bankedMs + (s.status === 'recording' && s.resumedAt != null ? now - s.resumedAt : 0);
}

/**
 * Pace over the last `windowMs` of the current segment in seconds per km,
 * or 0 if there isn't enough data yet.
 */
export function currentPace(s: RecorderState, windowMs = 30_000): number {
  const seg = s.segments[s.segments.length - 1];
  if (!seg || seg.length < 2) return 0;
  const end = seg[seg.length - 1];
  let d = 0;
  let i = seg.length - 1;
  while (i > 0 && end.t - seg[i - 1].t <= windowMs) {
    d += haversine(seg[i - 1], seg[i]);
    i--;
  }
  const dt = end.t - seg[i].t;
  // Standing still or too little data: no meaningful pace.
  if (d < 10 || dt < 5000) return 0;
  return dt / d;
}

export function useRecorder(): RecorderState {
  return useSyncExternalStore(recorder.subscribe, recorder.get, recorder.get);
}

/** Resets module state; for tests only. */
export function __resetRecorder() {
  state = null;
  unsaved = 0;
  listeners.clear();
  splitListeners.clear();
}
