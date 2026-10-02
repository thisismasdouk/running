import type { LapMark } from './laps';
import type { FlatStep, PaceTarget, RepeatBlock, RunType, StepKind, StepTarget, Workout, WorkoutItem, WorkoutStep } from './types';

/*
 * Structured workouts: the model, the built-in library, the simple builder's
 * form, and the step engine that follows a workout during a run. All pure, so
 * it's unit tested; the recorder feeds the engine its moving time and distance.
 */

export const isRepeat = (item: WorkoutItem): item is RepeatBlock => 'repeat' in item;

const dist = (metres: number): StepTarget => ({ type: 'distance', metres });
const time = (seconds: number): StepTarget => ({ type: 'time', seconds });
const min = (m: number) => time(m * 60);

const warmup = (m = 10): WorkoutStep => ({ kind: 'warmup', target: min(m) });
const cooldown = (m = 10): WorkoutStep => ({ kind: 'cooldown', target: min(m) });

/** The built-in library. Ids are stable: training plans and saved runs refer to them. */
export const LIBRARY: Workout[] = ([
  {
    id: 'easy-5k',
    name: 'Easy 5 km',
    description: 'Relaxed, conversational pace the whole way.',
    runType: 'easy',
    items: [{ kind: 'run', target: dist(5000) }],
  },
  {
    id: 'intervals-6x400',
    name: '6 × 400 m',
    description: 'Short, fast repeats with a jog between them. Builds speed.',
    runType: 'intervals',
    items: [warmup(), { repeat: 6, steps: [{ kind: 'run', target: dist(400) }, { kind: 'recover', target: time(90) }] }, cooldown()],
  },
  {
    id: 'intervals-5x1k',
    name: '5 × 1 km',
    description: 'Kilometre repeats around 5K race pace.',
    runType: 'intervals',
    items: [warmup(), { repeat: 5, steps: [{ kind: 'run', target: dist(1000) }, { kind: 'recover', target: min(2) }] }, cooldown()],
  },
  {
    id: 'fartlek-4x3',
    name: 'Fartlek 4 × 3 min',
    description: 'Three minutes hard, two minutes easy, four times.',
    runType: 'intervals',
    items: [warmup(), { repeat: 4, steps: [{ kind: 'run', target: min(3) }, { kind: 'recover', target: min(2) }] }, cooldown()],
  },
  {
    id: 'tempo-20',
    name: '20 min tempo',
    description: 'Comfortably hard: you could say a few words, not chat.',
    runType: 'tempo',
    items: [warmup(), { kind: 'run', target: min(20) }, cooldown()],
  },
  {
    id: 'long-90',
    name: 'Long run 90 min',
    description: 'Easy pace, time on your feet. Bring water.',
    runType: 'long',
    items: [{ kind: 'run', target: min(90) }],
  },
] satisfies Workout[]).map((w) => ({ ...w, builtIn: true }));

export const libraryWorkout = (id: string) => LIBRARY.find((w) => w.id === id);

/** Writes out repeat blocks so every step is listed in the order it is run. */
export function flattenWorkout(w: Pick<Workout, 'items'>): FlatStep[] {
  const out: FlatStep[] = [];
  for (const item of w.items) {
    if (!isRepeat(item)) {
      out.push({ ...item });
      continue;
    }
    for (let r = 1; r <= item.repeat; r++) {
      for (const s of item.steps) out.push(item.repeat > 1 ? { ...s, rep: r, reps: item.repeat } : { ...s });
    }
  }
  return out;
}

export const KIND_LABELS: Record<StepKind, string> = { warmup: 'Warm-up', run: 'Run', recover: 'Recover', cooldown: 'Cool-down' };

/** "Warm-up", "Interval 2/6", "Recover", "Run". */
export function stepLabel(step: FlatStep): string {
  if (step.kind === 'run' && step.reps) return `Interval ${step.rep}/${step.reps}`;
  return KIND_LABELS[step.kind];
}

/** "400 m", "1 km", "2.5 km", "90 s", "3 min", "1 h 30 min". */
export function formatTarget(t: StepTarget): string {
  if (t.type === 'distance') {
    if (t.metres < 1000) return `${Math.round(t.metres)} m`;
    const km = t.metres / 1000;
    return `${parseFloat(km.toFixed(2))} km`;
  }
  const s = Math.round(t.seconds);
  if (s < 120 && s % 60 !== 0) return `${s} s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h > 0) return m ? `${h} h ${m} min` : `${h} h`;
  return rest ? `${m}:${String(rest).padStart(2, '0')} min` : `${m} min`;
}

const stepText = (s: WorkoutStep) => (s.kind === 'run' ? formatTarget(s.target) : `${formatTarget(s.target)} ${KIND_LABELS[s.kind].toLowerCase()}`);

/** One line for lists: "10 min warm-up · 6 × (400 m / 90 s) · 10 min cool-down". */
export function workoutSummary(w: Pick<Workout, 'items'>): string {
  return w.items
    .map((item) => {
      if (!isRepeat(item)) return stepText(item);
      const inner = item.steps.map((s) => formatTarget(s.target)).join(' / ');
      if (item.repeat === 1) return item.steps.map(stepText).join(' · ');
      return item.steps.length > 1 ? `${item.repeat} × (${inner})` : `${item.repeat} × ${inner}`;
    })
    .join(' · ');
}

/** Typical paces (sec/km) used to estimate how long distance steps take, and how far time steps go. */
const ESTIMATE_PACE: Record<StepKind, number> = { warmup: 390, run: 330, recover: 450, cooldown: 390 };

const stepPace = (s: WorkoutStep) => (s.pace ? (s.pace.min + s.pace.max) / 2 : ESTIMATE_PACE[s.kind]);

/** Rough total distance and time of a workout, for "about 6.4 km · 45 min". */
export function estimateWorkout(w: Pick<Workout, 'items'>): { distanceM: number; ms: number } {
  let distanceM = 0;
  let ms = 0;
  for (const s of flattenWorkout(w)) {
    const pace = stepPace(s);
    if (s.target.type === 'distance') {
      distanceM += s.target.metres;
      ms += (s.target.metres / 1000) * pace * 1000;
    } else {
      ms += s.target.seconds * 1000;
      distanceM += (s.target.seconds / pace) * 1000;
    }
  }
  return { distanceM, ms };
}

/** Drops anything malformed from a stored workout; null if nothing usable is left. */
export function normaliseWorkout(raw: Workout): Workout | null {
  if (!raw || typeof raw.id !== 'string' || !Array.isArray(raw.items)) return null;
  const validStep = (s: WorkoutStep) =>
    !!s &&
    ['warmup', 'run', 'recover', 'cooldown'].includes(s.kind) &&
    !!s.target &&
    ((s.target.type === 'distance' && s.target.metres > 0) || (s.target.type === 'time' && s.target.seconds > 0));
  const items = raw.items
    .map((item): WorkoutItem | null => {
      if (isRepeat(item)) {
        const steps = Array.isArray(item.steps) ? item.steps.filter(validStep) : [];
        return steps.length && item.repeat >= 1 ? { repeat: Math.floor(item.repeat), steps } : null;
      }
      return validStep(item) ? item : null;
    })
    .filter((i): i is WorkoutItem => i != null);
  if (items.length === 0) return null;
  return { ...raw, name: raw.name || 'Workout', runType: raw.runType ?? 'easy', items };
}

/* ---------- The builder's simple form ---------- */

/**
 * What the builder screen edits: an optional warm-up, the main set (work,
 * with optional recovery, repeated), and an optional cool-down.
 */
export type SimpleWorkout = {
  name: string;
  /** Minutes, 0 for none. */
  warmupMin: number;
  repeats: number;
  work: StepTarget;
  workPace?: PaceTarget;
  /** Recovery after each repeat; null for none. */
  recover: StepTarget | null;
  cooldownMin: number;
};

export const NEW_WORKOUT: SimpleWorkout = {
  name: '',
  warmupMin: 10,
  repeats: 6,
  work: dist(400),
  recover: time(90),
  cooldownMin: 10,
};

/** The run type a workout of this shape is saved with. */
export function guessRunType(f: SimpleWorkout): RunType {
  if (f.repeats > 1) return 'intervals';
  const long = f.work.type === 'distance' ? f.work.metres >= 15_000 : f.work.seconds >= 75 * 60;
  if (long) return 'long';
  return f.workPace ? 'tempo' : 'easy';
}

export function buildWorkout(f: SimpleWorkout, id: string, createdAt = Date.now()): Workout {
  const items: WorkoutItem[] = [];
  if (f.warmupMin > 0) items.push(warmup(f.warmupMin));
  const work: WorkoutStep = { kind: 'run', target: f.work, ...(f.workPace ? { pace: f.workPace } : {}) };
  if (f.repeats > 1) items.push({ repeat: f.repeats, steps: f.recover ? [work, { kind: 'recover', target: f.recover }] : [work] });
  else items.push(work);
  if (f.cooldownMin > 0) items.push(cooldown(f.cooldownMin));
  const name = f.name.trim() || (f.repeats > 1 ? `${f.repeats} × ${formatTarget(f.work)}` : `${formatTarget(f.work)} run`);
  return { id, name, runType: guessRunType(f), items, createdAt };
}

/** The builder form for a workout, or null if it has a shape the simple builder can't show. */
export function toSimpleForm(w: Workout): SimpleWorkout | null {
  const items = w.items.slice();
  let warmupMin = 0;
  let cooldownMin = 0;
  const first = items[0];
  if (first && !isRepeat(first) && first.kind === 'warmup' && first.target.type === 'time') {
    warmupMin = first.target.seconds / 60;
    items.shift();
  }
  const last = items[items.length - 1];
  if (last && !isRepeat(last) && last.kind === 'cooldown' && last.target.type === 'time') {
    cooldownMin = last.target.seconds / 60;
    items.pop();
  }
  if (items.length !== 1) return null;
  const main = items[0];
  const block: RepeatBlock = isRepeat(main) ? main : { repeat: 1, steps: [main] };
  const [work, recover, ...rest] = block.steps;
  if (rest.length || !work || work.kind !== 'run' || (recover && recover.kind !== 'recover')) return null;
  return {
    name: w.name,
    warmupMin,
    repeats: block.repeat,
    work: work.target,
    ...(work.pace ? { workPace: work.pace } : {}),
    recover: recover?.target ?? null,
    cooldownMin,
  };
}

/** The next value up or down for a builder stepper, in sensible increments. */
export function stepTarget(t: StepTarget, dir: 1 | -1): StepTarget {
  if (t.type === 'distance') {
    const m = t.metres;
    const inc = dir > 0 ? (m < 1000 ? 100 : m < 5000 ? 500 : 1000) : m <= 1000 ? 100 : m <= 5000 ? 500 : 1000;
    return dist(Math.max(100, m + dir * inc));
  }
  const s = t.seconds;
  const inc = dir > 0 ? (s < 120 ? 15 : s < 600 ? 30 : 60) : s <= 120 ? 15 : s <= 600 ? 30 : 60;
  return time(Math.max(15, s + dir * inc));
}

/* ---------- Step engine ---------- */

/** Something to tell the runner while following a workout. */
export type StepCue =
  /** Step `index` has just begun. */
  | { type: 'step'; index: number }
  | { type: 'halfway'; index: number }
  | { type: 'last100'; index: number }
  /** The last step is done. */
  | { type: 'done' };

/** Halfway cues only for steps long enough to need one. */
const HALFWAY_MIN_M = 800;
const HALFWAY_MIN_S = 120;
/** "Last hundred metres" only for distance steps at least this long. */
const LAST100_MIN_M = 300;

const ZERO: LapMark = { distanceM: 0, movingMs: 0 };

const lerp = (a: number, b: number, f: number) => a + (b - a) * f;

/**
 * Advances a workout from run totals `from` to `to` (distance and moving
 * time). Each step starts at the previous step boundary (`marks`, one per
 * completed step). Returns the boundaries crossed in between, interpolated to
 * where the target was actually reached so laps come out at exactly 400 m or
 * 90 s, and the cues due on the way.
 */
export function advanceWorkout(steps: FlatStep[], marks: LapMark[], from: LapMark, to: LapMark): { marks: LapMark[]; cues: StepCue[] } {
  const added: LapMark[] = [];
  const cues: StepCue[] = [];
  let a = from;
  for (;;) {
    const index = marks.length + added.length;
    if (index >= steps.length) break;
    const step = steps[index];
    const start = added[added.length - 1] ?? marks[marks.length - 1] ?? ZERO;
    // Where along the from→to stretch a value of the step's measure is reached.
    const key = step.target.type === 'distance' ? 'distanceM' : 'movingMs';
    const at = (v: number): LapMark => {
      const span = to[key] - a[key];
      const f = span > 0 ? Math.min(1, Math.max(0, (v - a[key]) / span)) : 1;
      const other = key === 'distanceM' ? 'movingMs' : 'distanceM';
      const mark = { [key]: v, [other]: lerp(a[other], to[other], f) } as LapMark;
      // Never before the step began (a late fix can trail a timer-set boundary).
      return { distanceM: Math.max(start.distanceM, mark.distanceM), movingMs: Math.max(start.movingMs, mark.movingMs) };
    };
    const size = step.target.type === 'distance' ? step.target.metres : step.target.seconds * 1000;
    const end = start[key] + size;
    const reachedEnd = to[key] >= end;
    const upTo = reachedEnd ? end : to[key];
    const crossed = (v: number) => a[key] < v && v <= upTo;

    if (step.target.type === 'distance') {
      if (size >= HALFWAY_MIN_M && crossed(start.distanceM + size / 2)) cues.push({ type: 'halfway', index });
      if (size >= LAST100_MIN_M && crossed(end - 100)) cues.push({ type: 'last100', index });
    } else if (step.target.seconds >= HALFWAY_MIN_S && crossed(start.movingMs + size / 2)) {
      cues.push({ type: 'halfway', index });
    }

    if (!reachedEnd) break;
    const mark = at(end);
    added.push(mark);
    cues.push(index + 1 < steps.length ? { type: 'step', index: index + 1 } : { type: 'done' });
    a = mark;
  }
  return { marks: added, cues };
}

export type StepStatus = {
  /** 0-based index of the step in progress (steps.length once the workout is done). */
  index: number;
  total: number;
  step: FlatStep | null;
  next: FlatStep | null;
  done: boolean;
  /** Covered so far in this step. */
  distanceM: number;
  ms: number;
  /** Left in this step, in the step's own measure (metres or ms). */
  remaining: { type: 'distance'; metres: number } | { type: 'time'; ms: number } | null;
  /** 0–1 through the step. */
  progress: number;
};

/** Where the runner is in the workout, for the live panel. */
export function stepStatus(steps: FlatStep[], marks: LapMark[], totals: LapMark): StepStatus {
  const index = Math.min(marks.length, steps.length);
  const start = marks[index - 1] ?? ZERO;
  const distanceM = Math.max(0, totals.distanceM - start.distanceM);
  const ms = Math.max(0, totals.movingMs - start.movingMs);
  const step = steps[index] ?? null;
  const base = { index, total: steps.length, step, next: steps[index + 1] ?? null, distanceM, ms };
  if (!step) return { ...base, done: true, remaining: null, progress: 1 };
  if (step.target.type === 'distance') {
    const metres = Math.max(0, step.target.metres - distanceM);
    return { ...base, done: false, remaining: { type: 'distance', metres }, progress: Math.min(1, distanceM / step.target.metres) };
  }
  const left = Math.max(0, step.target.seconds * 1000 - ms);
  return { ...base, done: false, remaining: { type: 'time', ms: left }, progress: Math.min(1, ms / (step.target.seconds * 1000)) };
}

/** Compares live pace (sec/km, 0 when unknown) with the step's pace band. */
export function paceAdvice(step: FlatStep | null, liveSecPerKm: number): 'slow-down' | 'speed-up' | 'on-pace' | null {
  if (!step?.pace || !(liveSecPerKm > 0)) return null;
  if (liveSecPerKm < step.pace.min) return 'slow-down';
  if (liveSecPerKm > step.pace.max) return 'speed-up';
  return 'on-pace';
}
