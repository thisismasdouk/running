// Apple Health only exists on iOS; see health.ios.ts. Elsewhere every call is a no-op.
import type { HrSample } from './heartrate';
import type { Run } from './types';

/** Why Apple Health can't be used here, or null when it can. */
export function healthUnavailableReason(): string | null {
  return 'Apple Health is only available on iPhone.';
}

export async function requestHealthAccess(): Promise<boolean> {
  return false;
}

export async function saveRunToHealth(_run: Run, _weightKg: number | null): Promise<boolean> {
  return false;
}

export async function readHeartRate(_startMs: number, _endMs: number): Promise<HrSample[] | null> {
  return null;
}
