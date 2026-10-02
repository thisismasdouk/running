import type { ActivePlan, Run, RunType, SessionStatus, StepTarget, Workout } from './types';
import { estimateWorkout, formatTarget, libraryWorkout } from './workouts';

/*
 * Training plans: weeks of 3–4 sessions, each either a library workout or a
 * plain easy/long run or race with a distance or time. The schedule is worked
 * out from the plan's start date; ActivePlan only stores how each session went.
 */

export type PlanSession =
  | { kind: 'workout'; day: number; workoutId: string }
  | { kind: 'easy' | 'long'; day: number; target: StepTarget }
  | { kind: 'race'; day: number; target: StepTarget; name: string };

export type TrainingPlan = {
  id: string;
  name: string;
  level: string;
  description: string;
  weeks: PlanSession[][];
};

const DAY_MS = 86_400_000;

/** A session before it is given a day of the week. */
type Spec = PlanSession extends infer S ? (S extends PlanSession ? Omit<S, 'day'> : never) : never;

const easy = (min: number): Spec => ({ kind: 'easy', target: { type: 'time', seconds: min * 60 } });
const longKm = (km: number): Spec => ({ kind: 'long', target: { type: 'distance', metres: km * 1000 } });
const longMin = (min: number): Spec => ({ kind: 'long', target: { type: 'time', seconds: min * 60 } });
const wk = (workoutId: string): Spec => ({ kind: 'workout', workoutId });
const race = (metres: number, name: string): Spec => ({ kind: 'race', target: { type: 'distance', metres }, name });

/** Days from the start of the week (the plan's start weekday) for 3 and 4 runs a week; a race is always on the last day. */
const DAYS: Record<number, number[]> = { 3: [0, 2, 5], 4: [0, 2, 4, 6] };

function week(...specs: Spec[]): PlanSession[] {
  const days = DAYS[specs.length] ?? specs.map((_, i) => i);
  return specs.map((s, i) => ({ ...s, day: s.kind === 'race' ? 6 : days[i] }) as PlanSession);
}

export const PLANS: TrainingPlan[] = [
  {
    id: '5k-beginner',
    name: '5K',
    level: 'Beginner · 8 weeks · 3 runs a week',
    description: 'From easy running to your first 5K race. Short runs, a little speed from week 3, and a gentle taper.',
    weeks: [
      week(easy(20), easy(20), longMin(25)),
      week(easy(20), easy(25), longMin(30)),
      week(easy(25), wk('fartlek-4x3'), longMin(35)),
      week(easy(25), wk('intervals-6x400'), longMin(35)),
      week(easy(30), wk('fartlek-4x3'), longMin(40)),
      week(easy(30), wk('intervals-6x400'), wk('easy-5k')),
      week(easy(30), wk('tempo-20'), longMin(40)),
      week(easy(20), easy(15), race(5000, '5K race')),
    ],
  },
  {
    id: '10k',
    name: '10K',
    level: 'Intermediate · 8 weeks · 4 runs a week',
    description: 'For runners comfortable with 5K. Builds the long run to 12 km with one quality session a week.',
    weeks: [
      week(easy(30), wk('fartlek-4x3'), easy(30), longKm(8)),
      week(easy(30), wk('intervals-6x400'), easy(35), longKm(9)),
      week(easy(35), wk('tempo-20'), easy(30), longKm(10)),
      week(easy(30), wk('intervals-5x1k'), easy(30), longKm(8)),
      week(easy(35), wk('tempo-20'), easy(35), longKm(11)),
      week(easy(40), wk('intervals-5x1k'), easy(35), longKm(12)),
      week(easy(35), wk('tempo-20'), easy(30), longKm(10)),
      week(easy(30), wk('intervals-6x400'), easy(20), race(10_000, '10K race')),
    ],
  },
  {
    id: 'half',
    name: 'Half marathon',
    level: 'Intermediate · 12 weeks · 4 runs a week',
    description: 'Steady build to an 18 km long run, with tempo and interval days, a cutback every fourth week and a two-week taper.',
    weeks: [
      week(easy(30), wk('fartlek-4x3'), easy(35), longKm(10)),
      week(easy(35), wk('tempo-20'), easy(35), longKm(11)),
      week(easy(35), wk('intervals-6x400'), easy(40), longKm(12)),
      week(easy(30), wk('fartlek-4x3'), easy(30), longKm(10)),
      week(easy(40), wk('tempo-20'), easy(40), longKm(13)),
      week(easy(40), wk('intervals-5x1k'), easy(40), longKm(14)),
      week(easy(45), wk('tempo-20'), easy(40), longKm(15)),
      week(easy(35), wk('fartlek-4x3'), easy(35), wk('long-90')),
      week(easy(45), wk('intervals-5x1k'), easy(45), longKm(16)),
      week(easy(45), wk('tempo-20'), easy(40), longKm(18)),
      week(easy(40), wk('intervals-5x1k'), easy(35), longKm(14)),
      week(easy(30), wk('fartlek-4x3'), easy(20), race(21_097.5, 'Half marathon race')),
    ],
  },
];

export const getPlan = (id: string | undefined) => PLANS.find((p) => p.id === id);

/* ---------- Dates ---------- */

/** Local midnight of the day containing `ts`. */
export function dayStart(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** `n` calendar days after `ts` (local time, so DST changes don't shift the hour). */
export function addDays(ts: number, n: number): number {
  const d = new Date(dayStart(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

export const daysBetween = (a: number, b: number) => Math.round((dayStart(b) - dayStart(a)) / DAY_MS);

/** Days from the first day to the last session (the race, if there is one). */
export function planLengthDays(plan: TrainingPlan): number {
  const last = plan.weeks[plan.weeks.length - 1];
  return (plan.weeks.length - 1) * 7 + Math.max(...last.map((s) => s.day));
}

/** The start date that puts the plan's last session on race day. */
export const startForRace = (plan: TrainingPlan, raceDate: number) => addDays(raceDate, -planLengthDays(plan));

/* ---------- Sessions ---------- */

/** "3-2": week 3, second session. */
export const sessionKey = (week: number, index: number) => `${week}-${index + 1}`;

/** Id for the made-up workout behind a plain easy/long/race session. */
const SESSION_PREFIX = 'plan-';

const RUN_TYPE: Record<'easy' | 'long' | 'race', RunType> = { easy: 'easy', long: 'long', race: 'race' };

/** The workout to run for a session: the library workout, or a single-step one for a plain run. */
export function sessionWorkout(session: PlanSession, key: string): Workout {
  if (session.kind === 'workout') {
    return libraryWorkout(session.workoutId) ?? { id: session.workoutId, name: 'Workout', runType: 'easy', items: [] };
  }
  const name =
    session.kind === 'race'
      ? session.name
      : `${session.kind === 'easy' ? 'Easy run' : 'Long run'} · ${formatTarget(session.target)}`;
  const description =
    session.kind === 'race' ? 'Race day. Start steady, finish strong.' : session.kind === 'easy' ? 'Relaxed, conversational pace.' : 'Easy pace, time on your feet.';
  return {
    id: `${SESSION_PREFIX}${key}`,
    name,
    description,
    runType: RUN_TYPE[session.kind],
    items: [{ kind: 'run', target: session.target }],
    builtIn: true,
  };
}

export type SessionState = SessionStatus | 'today' | 'missed' | 'upcoming';

export type ScheduledSession = {
  key: string;
  /** 1-based. */
  week: number;
  index: number;
  date: number;
  session: PlanSession;
  workout: Workout;
  state: SessionState;
  runId?: string;
};

/** Every session of the active plan with its date and how it went. */
export function planSchedule(plan: TrainingPlan, active: ActivePlan, now = Date.now()): ScheduledSession[] {
  const today = dayStart(now);
  const out: ScheduledSession[] = [];
  plan.weeks.forEach((sessions, w) =>
    sessions.forEach((session, i) => {
      const key = sessionKey(w + 1, i);
      const date = addDays(active.startDate, w * 7 + session.day);
      const log = active.sessions[key];
      const state: SessionState = log?.status ?? (date === today ? 'today' : date < today ? 'missed' : 'upcoming');
      out.push({ key, week: w + 1, index: i, date, session, workout: sessionWorkout(session, key), state, ...(log?.runId ? { runId: log.runId } : {}) });
    }),
  );
  return out;
}

/** The plan week containing `now` (1-based), clamped to the plan. */
export function currentWeek(plan: TrainingPlan, active: ActivePlan, now = Date.now()): number {
  const w = Math.floor(daysBetween(active.startDate, now) / 7) + 1;
  return Math.min(plan.weeks.length, Math.max(1, w));
}

export function weekProgress(schedule: ScheduledSession[], week: number) {
  const sessions = schedule.filter((s) => s.week === week);
  return { done: sessions.filter((s) => s.state === 'done').length, total: sessions.length };
}

/** Today's session (whatever its state), and the next session still to run after today. */
export function upNext(schedule: ScheduledSession[], now = Date.now()) {
  const today = dayStart(now);
  return {
    today: schedule.find((s) => s.date === today) ?? null,
    next: schedule.find((s) => s.date > today && s.state === 'upcoming') ?? null,
  };
}

/** Nothing left to run: every session is done, skipped or in the past. */
export const planFinished = (schedule: ScheduledSession[]) => schedule.every((s) => s.state !== 'today' && s.state !== 'upcoming');

/** Resolves a workout id from the library, the runner's own workouts, or a session of the active plan. */
export function resolveWorkout(id: string | undefined, custom: Workout[], active: ActivePlan | null): Workout | undefined {
  if (!id) return undefined;
  if (id.startsWith(SESSION_PREFIX)) {
    const plan = active && getPlan(active.planId);
    if (!plan) return undefined;
    const key = id.slice(SESSION_PREFIX.length);
    const [w, i] = key.split('-').map(Number);
    const session = plan.weeks[w - 1]?.[i - 1];
    return session ? sessionWorkout(session, key) : undefined;
  }
  return libraryWorkout(id) ?? custom.find((w) => w.id === id);
}

/** Share of a plain session's distance or time a run must cover to count. */
const MATCH_SHARE = 0.8;

/** Whether `run` does the job of a session (ignoring the date). */
export function runMatchesSession(s: Pick<ScheduledSession, 'session' | 'workout'>, run: Run): boolean {
  if (run.workoutId === s.workout.id) return true;
  if (s.session.kind !== 'workout') return coversTarget(s.session, run);
  // A free run counts for a workout session if it was saved as the same kind and was about as long.
  return !run.workoutId && run.type === s.workout.runType && run.distanceM >= estimateWorkout(s.workout).distanceM * 0.5;
}

function coversTarget(session: Exclude<PlanSession, { kind: 'workout' }>, run: Run): boolean {
  const t = session.target;
  return t.type === 'distance' ? run.distanceM >= t.metres * MATCH_SHARE : run.movingMs >= t.seconds * 1000 * MATCH_SHARE;
}

/**
 * Marks the session a saved run completes: the one it was started from, or
 * else a session still to do on the run's day that it matches. Returns the
 * same object when nothing changes.
 */
export function recordRun(plan: TrainingPlan, active: ActivePlan, run: Run, sessionKey?: string, now = Date.now()): ActivePlan {
  const schedule = planSchedule(plan, active, now);
  const day = dayStart(run.startedAt);
  const open = (s: ScheduledSession) => s.state !== 'done' && s.state !== 'skipped';
  const target =
    (sessionKey && schedule.find((s) => s.key === sessionKey && open(s))) ||
    schedule.find((s) => s.date === day && open(s) && runMatchesSession(s, run));
  if (!target) return active;
  return setSession(active, target.key, 'done', run.id, now);
}

/** Sets (or with null, clears) a session's status. */
export function setSession(active: ActivePlan, key: string, status: SessionStatus | null, runId?: string, now = Date.now()): ActivePlan {
  const sessions = { ...active.sessions };
  if (status) sessions[key] = { status, at: now, ...(runId ? { runId } : {}) };
  else delete sessions[key];
  return { ...active, sessions };
}

/** Un-marks sessions done by a run that has been deleted. */
export function unlinkRun(active: ActivePlan, runId: string): ActivePlan {
  const keys = Object.keys(active.sessions).filter((k) => active.sessions[k].runId === runId);
  return keys.reduce((a, k) => setSession(a, k, null), active);
}
