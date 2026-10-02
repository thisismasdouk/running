import { getProfile, getRuns, setRunHealth } from '@/store';
import { readHeartRate, saveRunToHealth } from './health';
import { DEFAULT_MAX_HR, summariseHeartRate } from './heartrate';
import type { Run } from './types';

/** Runs whose heart rate was looked for this session, so a run without a watch isn't queried on every visit. */
const checked = new Set<string>();

/**
 * Pulls heart rate for a run from Apple Health. A watch can take a few
 * minutes to sync, so a run with no readings yet is checked again the next
 * time the app is opened.
 */
export async function fetchRunHeartRate(run: Run): Promise<void> {
  const profile = getProfile();
  if (!profile.healthSync || run.heartRate || run.simulated || checked.has(run.id)) return;
  checked.add(run.id);
  try {
    const samples = await readHeartRate(run.startedAt, run.startedAt + run.elapsedMs);
    const summary = samples && summariseHeartRate(samples, run.startedAt, run.startedAt + run.elapsedMs, profile.maxHr ?? DEFAULT_MAX_HR);
    if (summary) setRunHealth(run.id, { heartRate: summary });
  } catch {
    // Read access denied or Health unavailable: the run simply has no heart rate.
  }
}

/** Writes a just-recorded run to Apple Health, once, then reads its heart rate. */
export async function syncRunToHealth(runId: string): Promise<void> {
  const profile = getProfile();
  const run = getRuns().find((r) => r.id === runId);
  if (!profile.healthSync || !run || run.healthSavedAt || run.simulated) return;
  try {
    if (await saveRunToHealth(run, profile.weightKg)) setRunHealth(run.id, { healthSavedAt: Date.now() });
  } catch {
    // Write access denied: keep the run local only.
  }
  await fetchRunHeartRate(run);
}
