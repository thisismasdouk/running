import { useSyncExternalStore } from 'react';

import { getPlan, recordRun, setSession, unlinkRun } from '@/lib/plans';
import { normaliseRun } from '@/lib/runs';
import type { ActivePlan, Profile, Run, SessionStatus, Shoe, Workout } from '@/lib/types';
import { normaliseWorkout } from '@/lib/workouts';
import { kv } from './storage';

const RUN_IDS_KEY = 'runs:ids';
const runKey = (id: string) => `run:${id}`;
const PROFILE_KEY = 'profile';
const SHOES_KEY = 'shoes';
const WORKOUTS_KEY = 'workouts';
const PLAN_KEY = 'plan';

export const DEFAULT_PROFILE: Profile = {
  name: 'Runner',
  units: 'metric',
  weeklyGoalM: 20_000,
  splitHaptics: true,
  audioCues: true,
  autoPause: false,
  countdown: true,
  voiceId: null,
  speechRate: 1,
  defaultShoeId: null,
};

type Listener = () => void;

function createStore<T>(load: () => T) {
  let value: T | undefined;
  const listeners = new Set<Listener>();
  return {
    get(): T {
      if (value === undefined) value = load();
      return value;
    },
    set(next: T) {
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe(l: Listener) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

function readJSON<T>(key: string): T | null {
  try {
    const raw = kv.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

// Each run is stored under its own key so saving one run doesn't rewrite them all.
const runsStore = createStore<Run[]>(() => {
  const ids = readJSON<string[]>(RUN_IDS_KEY) ?? [];
  return ids
    .map((id) => readJSON<Run>(runKey(id)))
    .filter((r): r is Run => r != null)
    .map(normaliseRun)
    .sort((a, b) => b.startedAt - a.startedAt);
});

const profileStore = createStore<Profile>(() => ({ ...DEFAULT_PROFILE, ...readJSON<Partial<Profile>>(PROFILE_KEY) }));

const shoesStore = createStore<Shoe[]>(() => readJSON<Shoe[]>(SHOES_KEY) ?? []);

/** The runner's own workouts; the built-in library isn't stored. */
const workoutsStore = createStore<Workout[]>(() =>
  (readJSON<Workout[]>(WORKOUTS_KEY) ?? []).map(normaliseWorkout).filter((w): w is Workout => w != null),
);

/** Null when no plan is being followed. Wrapped so "no plan" is a cached value too. */
const planStore = createStore<{ plan: ActivePlan | null }>(() => {
  const raw = readJSON<ActivePlan>(PLAN_KEY);
  return { plan: raw && getPlan(raw.planId) && typeof raw.startDate === 'number' ? { ...raw, sessions: raw.sessions ?? {} } : null };
});

function persistIds(runs: Run[]) {
  kv.set(RUN_IDS_KEY, JSON.stringify(runs.map((r) => r.id)));
}

export function saveRun(run: Run) {
  kv.set(runKey(run.id), JSON.stringify(run));
  const next = [run, ...runsStore.get().filter((r) => r.id !== run.id)].sort((a, b) => b.startedAt - a.startedAt);
  persistIds(next);
  runsStore.set(next);
}

export function updateRun(id: string, patch: Partial<Pick<Run, 'title' | 'notes' | 'effort' | 'type' | 'shoeId'>>) {
  const run = runsStore.get().find((r) => r.id === id);
  if (!run) return;
  saveRun({ ...run, ...patch });
  // Setting the type when saving can make the run match that day's plan session.
  if (patch.type) recordRunInPlan({ ...run, ...patch });
}

export function deleteRun(id: string) {
  kv.remove(runKey(id));
  const next = runsStore.get().filter((r) => r.id !== id);
  persistIds(next);
  runsStore.set(next);
  // A session this run completed is open again.
  const active = planStore.get().plan;
  if (active) persistPlan(unlinkRun(active, id));
}

export function updateProfile(patch: Partial<Profile>) {
  const next = { ...profileStore.get(), ...patch };
  kv.set(PROFILE_KEY, JSON.stringify(next));
  profileStore.set(next);
}

function persistShoes(next: Shoe[]) {
  kv.set(SHOES_KEY, JSON.stringify(next));
  shoesStore.set(next);
}

/** Adds or replaces a shoe. */
export function saveShoe(shoe: Shoe) {
  persistShoes([...shoesStore.get().filter((s) => s.id !== shoe.id), shoe].sort((a, b) => a.addedAt - b.addedAt));
}

export function addShoe(name: string, now = Date.now()): Shoe {
  const shoe: Shoe = { id: `shoe-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name, retired: false, addedAt: now };
  saveShoe(shoe);
  // The first shoe is the obvious default.
  if (!profileStore.get().defaultShoeId) updateProfile({ defaultShoeId: shoe.id });
  return shoe;
}

export function updateShoe(id: string, patch: Partial<Pick<Shoe, 'name' | 'retired'>>) {
  const shoe = shoesStore.get().find((s) => s.id === id);
  if (!shoe) return;
  saveShoe({ ...shoe, ...patch });
  // A retired shoe shouldn't be picked for new runs.
  if (patch.retired && profileStore.get().defaultShoeId === id) updateProfile({ defaultShoeId: null });
}

/** Removes the shoe; runs that used it simply show no shoe. */
export function deleteShoe(id: string) {
  persistShoes(shoesStore.get().filter((s) => s.id !== id));
  if (profileStore.get().defaultShoeId === id) updateProfile({ defaultShoeId: null });
}

/** Adds or replaces one of the runner's own workouts. */
export function saveWorkout(w: Workout) {
  const next = [...workoutsStore.get().filter((x) => x.id !== w.id), w].sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
  kv.set(WORKOUTS_KEY, JSON.stringify(next));
  workoutsStore.set(next);
}

export function deleteWorkout(id: string) {
  const next = workoutsStore.get().filter((w) => w.id !== id);
  kv.set(WORKOUTS_KEY, JSON.stringify(next));
  workoutsStore.set(next);
}

export const newWorkoutId = (now = Date.now()) => `wk-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function persistPlan(plan: ActivePlan | null) {
  if (plan === planStore.get().plan) return;
  if (plan) kv.set(PLAN_KEY, JSON.stringify(plan));
  else kv.remove(PLAN_KEY);
  planStore.set({ plan });
}

export function startPlan(planId: string, startDate: number, raceDate?: number) {
  persistPlan({ planId, startDate, ...(raceDate != null ? { raceDate } : {}), sessions: {} });
}

export const leavePlan = () => persistPlan(null);

/** Marks a session done or skipped by hand, or with null puts it back to do. */
export function setSessionStatus(key: string, status: SessionStatus | null) {
  const active = planStore.get().plan;
  if (active) persistPlan(setSession(active, key, status));
}

/** Ticks off the plan session a just-saved run completes (the one it was started from, or a match on that day). */
export function recordRunInPlan(run: Run, sessionKey?: string) {
  const active = planStore.get().plan;
  const plan = getPlan(active?.planId);
  if (active && plan) persistPlan(recordRun(plan, active, run, sessionKey));
}

export const getRuns = () => runsStore.get();
export const getActivePlan = () => planStore.get().plan;
export const getProfile = () => profileStore.get();

export function useRuns(): Run[] {
  return useSyncExternalStore(runsStore.subscribe, runsStore.get, runsStore.get);
}

export function useRun(id: string | undefined): Run | undefined {
  return useRuns().find((r) => r.id === id);
}

export function useShoes(): Shoe[] {
  return useSyncExternalStore(shoesStore.subscribe, shoesStore.get, shoesStore.get);
}

export function useWorkouts(): Workout[] {
  return useSyncExternalStore(workoutsStore.subscribe, workoutsStore.get, workoutsStore.get);
}

export function useActivePlan(): ActivePlan | null {
  return useSyncExternalStore(planStore.subscribe, planStore.get, planStore.get).plan;
}

export function useProfile(): Profile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
}
