import { useSyncExternalStore } from 'react';

import { kv } from '@/store/storage';
import {
  acceptPoint,
  AUTO_PAUSE_MIN_SPAN_MS,
  AUTO_PAUSE_SPEED_MPS,
  AUTO_PAUSE_WINDOW_MS,
  AUTO_RESUME_DISTANCE_M,
  AUTO_RESUME_SPEED_MPS,
  FIRST_FIX_ACCURACY_M,
  GAP_MS,
  haversine,
} from './geo';
import { lapsFromMarks, type LapMark } from './laps';
import type { FlatStep, RunType, Segment, TrackPoint } from './types';
import { advanceWorkout, type StepCue } from './workouts';

export type RecorderStatus = 'idle' | 'recording' | 'paused';

/** The workout being followed, copied in at Start so a relaunch mid-run doesn't depend on it still existing. */
export type RecorderWorkout = {
  id: string;
  name: string;
  runType: RunType;
  steps: FlatStep[];
  /** The training plan session this run was started from. */
  sessionKey?: string;
};

export type RecorderState = {
  status: RecorderStatus;
  startedAt: number | null;
  segments: Segment[];
  distanceM: number;
  /** Moving time banked from earlier recording stretches. */
  bankedMs: number;
  /** When the current recording stretch began, or null while paused/idle/auto-paused. */
  resumedAt: number | null;
  /** Stopped by auto-pause. The status stays 'recording' so the run resumes by itself. */
  autoPaused: boolean;
  /** Fixes timestamped before this are stale (delivered from before the current stretch). */
  notBefore: number;
  /** Whole km/miles announced so far, and the moving time when the last one was crossed. */
  splitIndex: number;
  splitAtMs: number;
  /** The last completed split, for the live screen. */
  lastSplit: { index: number; ms: number } | null;
  /** Fed by the web demo's simulated GPS. */
  simulated: boolean;
  /** Run totals at each Lap press. In a workout, at each step boundary. */
  lapMarks: LapMark[];
  /** Set for a guided workout, null for a free run. */
  workout: RecorderWorkout | null;
};

export type RecorderEvent =
  | { type: 'split'; index: number; distanceM: number; movingMs: number; splitMs: number; splitM: number }
  | { type: 'lap'; index: number; distanceM: number; movingMs: number }
  | { type: 'autopause' }
  | { type: 'autoresume' }
  | { type: 'workout'; cue: StepCue; steps: FlatStep[] };

const KEY = 'recorder';
/** Fixes up to this much older than the start/resume time are still used (device and GPS clocks can disagree). */
const STALE_WINDOW_MS = 30_000;
/** Lap presses closer together than this (in moving time) are treated as a double tap. */
const MIN_LAP_MS = 1000;
/** Write the in-progress run to disk at most this often, plus on pause/finish and when the app backgrounds. */
const PERSIST_EVERY_MS = 10_000;

const IDLE: RecorderState = {
  status: 'idle',
  startedAt: null,
  segments: [],
  distanceM: 0,
  bankedMs: 0,
  resumedAt: null,
  autoPaused: false,
  notBefore: 0,
  splitIndex: 0,
  splitAtMs: 0,
  lastSplit: null,
  simulated: false,
  lapMarks: [],
  workout: null,
};

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
const eventListeners = new Set<(e: RecorderEvent) => void>();
let lastPersist = 0;
let dirty = false;
/** Newest fix timestamp seen in any state, so a resume can drop fixes from before it. */
let newestSeen = -Infinity;
/** Previous raw fix while auto-paused, to measure speed for auto-resume. */
let lastRaw: TrackPoint | null = null;
/** Run totals when the workout was last advanced, so halfway cues fire once. Null after a relaunch. */
let workoutCheckedAt: LapMark | null = null;

const current = () => (state ??= load());

function persist(force = false) {
  // Serialising the whole track on every fix is wasteful on long runs; write on a timer instead.
  const now = Date.now();
  if (!force && now - lastPersist < PERSIST_EVERY_MS) {
    dirty = true;
    return;
  }
  lastPersist = now;
  dirty = false;
  const s = current();
  if (s.status === 'idle') kv.remove(KEY);
  else kv.set(KEY, JSON.stringify(s));
}

function set(next: RecorderState, force = false) {
  state = next;
  persist(force);
  listeners.forEach((l) => l());
}

const emit = (e: RecorderEvent) => eventListeners.forEach((l) => l(e));

/**
 * Moves a guided workout on to the run's current totals: adds a lap mark at
 * each step boundary passed and returns the cues to announce. A free run
 * comes back unchanged.
 */
function advance(s: RecorderState, now: number): { next: RecorderState; events: RecorderEvent[] } {
  if (!s.workout || s.status !== 'recording') return { next: s, events: [] };
  const to = { distanceM: s.distanceM, movingMs: movingMs(s, now) };
  const from = workoutCheckedAt ?? to;
  workoutCheckedAt = to;
  const { marks, cues } = advanceWorkout(s.workout.steps, s.lapMarks, from, to);
  const steps = s.workout.steps;
  const events = cues.map((cue): RecorderEvent => ({ type: 'workout', cue, steps }));
  return { next: marks.length ? { ...s, lapMarks: [...s.lapMarks, ...marks] } : s, events };
}

export const recorder = {
  get: current,

  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },

  /** Splits (each whole km/mile per `splitLength`) and auto-pause changes. */
  on(l: (e: RecorderEvent) => void) {
    eventListeners.add(l);
    return () => {
      eventListeners.delete(l);
    };
  },

  splitLength: 1000,
  autoPause: false,

  start(now = Date.now(), simulated = false, workout: RecorderWorkout | null = null) {
    lastRaw = null;
    workoutCheckedAt = { distanceM: 0, movingMs: 0 };
    set(
      {
        ...IDLE,
        status: 'recording',
        startedAt: now,
        segments: [[]],
        resumedAt: now,
        notBefore: Math.max(newestSeen + 1, now - STALE_WINDOW_MS),
        simulated,
        workout,
      },
      true,
    );
  },

  pause(now = Date.now()) {
    const s = current();
    if (s.status !== 'recording') return;
    const stretch = s.resumedAt != null ? Math.max(0, now - s.resumedAt) : 0;
    set({ ...s, status: 'paused', bankedMs: s.bankedMs + stretch, resumedAt: null, autoPaused: false }, true);
  },

  resume(now = Date.now()) {
    const s = current();
    if (s.status !== 'paused') return;
    lastRaw = null;
    set(
      {
        ...s,
        status: 'recording',
        resumedAt: now,
        segments: [...s.segments, []],
        notBefore: Math.max(newestSeen + 1, now - STALE_WINDOW_MS),
      },
      true,
    );
  },

  /**
   * Ends the current lap and starts the next one. Returns the lap just
   * completed (1-based), or null when not recording or pressed twice in a row.
   * In a workout this skips to the next step (announced as that step).
   */
  lap(now = Date.now()) {
    const s = current();
    if (s.status !== 'recording') return null;
    const moving = movingMs(s, now);
    const prev = s.lapMarks[s.lapMarks.length - 1] ?? { distanceM: 0, movingMs: 0 };
    if (moving - prev.movingMs < MIN_LAP_MS) return null;
    const mark = { distanceM: s.distanceM, movingMs: moving };
    set({ ...s, lapMarks: [...s.lapMarks, mark] }, true);
    const lap = { index: s.lapMarks.length + 1, distanceM: mark.distanceM - prev.distanceM, movingMs: mark.movingMs - prev.movingMs };
    const steps = s.workout?.steps;
    if (steps && s.lapMarks.length < steps.length) {
      workoutCheckedAt = mark;
      const next = s.lapMarks.length + 1;
      emit({ type: 'workout', cue: next < steps.length ? { type: 'step', index: next } : { type: 'done' }, steps });
    } else {
      emit({ type: 'lap', ...lap });
    }
    return lap;
  },

  /** Moves a workout's time-based steps on between GPS fixes. Does nothing on a free run. */
  tick(now = Date.now()) {
    const s = current();
    if (!s.workout || s.status !== 'recording') return;
    const { next, events } = advance(s, now);
    if (next !== s) set(next, true);
    events.forEach(emit);
  },

  /** Clears the in-progress run and returns what was recorded. */
  finish(now = Date.now()) {
    const s = current();
    const moving = movingMs(s, now);
    const result = {
      startedAt: s.startedAt ?? now,
      segments: s.segments.filter((seg) => seg.length > 0),
      distanceM: s.distanceM,
      movingMs: moving,
      elapsedMs: now - (s.startedAt ?? now),
      simulated: s.simulated,
      laps: lapsFromMarks(s.lapMarks, { distanceM: s.distanceM, movingMs: moving }),
      workout: s.workout,
    };
    set(IDLE, true);
    return result;
  },

  discard() {
    set(IDLE, true);
  },

  /** Writes any unsaved fixes now, e.g. when the app goes to the background. */
  flush() {
    if (dirty) persist(true);
  },

  addPoints(points: TrackPoint[], now = Date.now()) {
    if (points.length === 0) return;
    for (const p of points) newestSeen = Math.max(newestSeen, p.t);
    const s = current();
    if (s.status !== 'recording') return;

    const segments = s.segments.length ? s.segments.slice() : [[]];
    let seg = segments[segments.length - 1].slice();
    let { distanceM, bankedMs, resumedAt, autoPaused, splitIndex, splitAtMs, lastSplit } = s;
    const events: RecorderEvent[] = [];
    const len = recorder.splitLength;
    const checkSplit = (p: TrackPoint) => {
      if (Math.floor(distanceM / len) <= splitIndex) return;
      splitIndex = Math.floor(distanceM / len);
      const moving = bankedMs + (resumedAt != null ? Math.max(0, p.t - resumedAt) : 0);
      const splitMs = moving - splitAtMs;
      splitAtMs = moving;
      lastSplit = { index: splitIndex, ms: splitMs };
      events.push({ type: 'split', index: splitIndex, distanceM, movingMs: moving, splitMs, splitM: len });
    };

    for (const p of points) {
      if (p.t < s.notBefore) continue;

      if (autoPaused) {
        // Standing still: nothing is recorded until the runner clearly moves off again.
        const anchor = seg[seg.length - 1];
        const prevRaw = lastRaw;
        if (p.acc != null && p.acc > FIRST_FIX_ACCURACY_M) continue;
        lastRaw = p;
        const moved = anchor ? haversine(anchor, p) : Infinity;
        const dt = prevRaw ? (p.t - prevRaw.t) / 1000 : 0;
        const speed = prevRaw && dt > 0 ? haversine(prevRaw, p) / dt : 0;
        if (moved >= AUTO_RESUME_DISTANCE_M && speed >= AUTO_RESUME_SPEED_MPS) {
          autoPaused = false;
          segments[segments.length - 1] = seg;
          if (anchor) {
            // The runner left the stop point about moved/speed ago. Bridge from there so the
            // metres covered while auto-resume was deciding still count, in distance and time.
            const leftAt = Math.min(p.t - 1, Math.max(anchor.t + 1, Math.round(p.t - (moved / speed) * 1000)));
            seg = [{ ...anchor, t: leftAt }, p];
            distanceM += moved;
            resumedAt = Math.min(leftAt, now);
          } else {
            seg = [p];
            resumedAt = Math.min(p.t, now);
          }
          segments.push(seg);
          lastRaw = null;
          events.push({ type: 'autoresume' });
          checkSplit(p);
        }
        continue;
      }

      let prev: TrackPoint | undefined = seg[seg.length - 1];
      // A long silence (app killed, watcher suspended) is not a straight line.
      if (prev && p.t - prev.t > GAP_MS) {
        segments[segments.length - 1] = seg;
        seg = [];
        segments.push(seg);
        prev = undefined;
      }
      if (!acceptPoint(prev, p)) continue;
      if (prev) distanceM += haversine(prev, p);
      seg.push(p);

      checkSplit(p);

      if (recorder.autoPause && resumedAt != null) {
        // Find the oldest fix still inside the window.
        let i = seg.length - 1;
        while (i > 0 && p.t - seg[i - 1].t <= AUTO_PAUSE_WINDOW_MS) i--;
        const span = p.t - seg[i].t;
        if (span >= AUTO_PAUSE_MIN_SPAN_MS && haversine(seg[i], p) / (span / 1000) < AUTO_PAUSE_SPEED_MPS) {
          // Stopped since seg[i]: trim the stationary jitter so it adds neither distance nor time.
          for (let k = i + 1; k < seg.length; k++) distanceM -= haversine(seg[k - 1], seg[k]);
          seg = seg.slice(0, i + 1);
          bankedMs += Math.max(0, Math.min(seg[i].t, now) - resumedAt);
          resumedAt = null;
          autoPaused = true;
          lastRaw = p;
          events.push({ type: 'autopause' });
        }
      }
    }

    segments[segments.length - 1] = seg;
    const { next, events: cues } = advance({ ...s, segments, distanceM, bankedMs, resumedAt, autoPaused, splitIndex, splitAtMs, lastSplit }, now);
    // A step boundary is written straight away so a relaunch keeps the laps.
    set(next, next.lapMarks !== s.lapMarks);
    [...events, ...cues].forEach(emit);
  },
};

export function movingMs(s: RecorderState, now = Date.now()): number {
  return s.bankedMs + (s.status === 'recording' && s.resumedAt != null ? Math.max(0, now - s.resumedAt) : 0);
}

/**
 * Pace over roughly the last `windowMs` of moving time in seconds per km,
 * or 0 if there isn't enough data yet. It reaches back across pauses so the
 * reading doesn't blank out after every resume.
 */
export function currentPace(s: RecorderState, windowMs = 30_000): number {
  if (s.autoPaused) return 0;
  let d = 0;
  let t = 0;
  outer: for (let k = s.segments.length - 1; k >= 0; k--) {
    const seg = s.segments[k];
    for (let i = seg.length - 1; i > 0; i--) {
      const dt = seg[i].t - seg[i - 1].t;
      if (t > 0 && t + dt > windowMs) break outer;
      d += haversine(seg[i - 1], seg[i]);
      t += dt;
    }
  }
  // Standing still or too little data: no meaningful pace.
  if (d < 10 || t < 5000) return 0;
  return t / d;
}

/** The split in progress: distance and moving time since the last whole km/mile. */
export function currentSplit(s: RecorderState, now = Date.now(), len = recorder.splitLength) {
  const d = Math.max(0, s.distanceM - s.splitIndex * len);
  const ms = Math.max(0, movingMs(s, now) - s.splitAtMs);
  return { index: s.splitIndex + 1, distanceM: d, ms };
}

/** The lap in progress: distance and moving time since the last Lap press (or the start). */
export function currentLap(s: RecorderState, now = Date.now()) {
  const prev = s.lapMarks[s.lapMarks.length - 1] ?? { distanceM: 0, movingMs: 0 };
  return {
    index: s.lapMarks.length + 1,
    distanceM: Math.max(0, s.distanceM - prev.distanceM),
    ms: Math.max(0, movingMs(s, now) - prev.movingMs),
  };
}

export function useRecorder(): RecorderState {
  return useSyncExternalStore(recorder.subscribe, recorder.get, recorder.get);
}

/** Resets module state; for tests only. */
export function __resetRecorder() {
  state = null;
  lastPersist = 0;
  dirty = false;
  newestSeen = -Infinity;
  lastRaw = null;
  workoutCheckedAt = null;
  listeners.clear();
  eventListeners.clear();
  recorder.splitLength = 1000;
  recorder.autoPause = false;
}
