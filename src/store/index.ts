import { useSyncExternalStore } from 'react';

import type { Profile, Run } from '@/lib/types';
import { kv } from './storage';

const RUN_IDS_KEY = 'runs:ids';
const runKey = (id: string) => `run:${id}`;
const PROFILE_KEY = 'profile';

export const DEFAULT_PROFILE: Profile = {
  name: 'Runner',
  units: 'metric',
  weeklyGoalM: 20_000,
  splitHaptics: true,
  audioCues: true,
  autoPause: false,
  countdown: true,
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
    .sort((a, b) => b.startedAt - a.startedAt);
});

const profileStore = createStore<Profile>(() => ({ ...DEFAULT_PROFILE, ...readJSON<Partial<Profile>>(PROFILE_KEY) }));

function persistIds(runs: Run[]) {
  kv.set(RUN_IDS_KEY, JSON.stringify(runs.map((r) => r.id)));
}

export function saveRun(run: Run) {
  kv.set(runKey(run.id), JSON.stringify(run));
  const next = [run, ...runsStore.get().filter((r) => r.id !== run.id)].sort((a, b) => b.startedAt - a.startedAt);
  persistIds(next);
  runsStore.set(next);
}

export function updateRun(id: string, patch: Partial<Pick<Run, 'title' | 'notes' | 'effort'>>) {
  const run = runsStore.get().find((r) => r.id === id);
  if (run) saveRun({ ...run, ...patch });
}

export function deleteRun(id: string) {
  kv.remove(runKey(id));
  const next = runsStore.get().filter((r) => r.id !== id);
  persistIds(next);
  runsStore.set(next);
}

export function updateProfile(patch: Partial<Profile>) {
  const next = { ...profileStore.get(), ...patch };
  kv.set(PROFILE_KEY, JSON.stringify(next));
  profileStore.set(next);
}

export const getRuns = () => runsStore.get();
export const getProfile = () => profileStore.get();

export function useRuns(): Run[] {
  return useSyncExternalStore(runsStore.subscribe, runsStore.get, runsStore.get);
}

export function useRun(id: string | undefined): Run | undefined {
  return useRuns().find((r) => r.id === id);
}

export function useProfile(): Profile {
  return useSyncExternalStore(profileStore.subscribe, profileStore.get, profileStore.get);
}
