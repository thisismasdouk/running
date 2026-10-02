import Constants, { ExecutionEnvironment } from 'expo-constants';

import { runCalories, type HrSample } from './heartrate';
import type { Run } from './types';

type HealthKit = typeof import('@kingstinct/react-native-healthkit');

let hk: HealthKit | null | undefined;
let reason: string | null = null;

/**
 * HealthKit is a native module that Expo Go doesn't include, so it is loaded
 * lazily and only in development or App Store builds. Requiring it in Expo Go
 * would throw at import time.
 */
function load(): HealthKit | null {
  if (hk !== undefined) return hk;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
    reason = 'Apple Health needs the Pacebook app from TestFlight or the App Store. It isn’t available in Expo Go.';
    return (hk = null);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod: HealthKit = require('@kingstinct/react-native-healthkit');
    if (!mod.isHealthDataAvailable()) {
      reason = 'Apple Health isn’t available on this device.';
      return (hk = null);
    }
    return (hk = mod);
  } catch {
    reason = 'Apple Health isn’t included in this build.';
    return (hk = null);
  }
}

export function healthUnavailableReason(): string | null {
  return load() ? null : reason;
}

const HEART_RATE = 'HKQuantityTypeIdentifierHeartRate' as const;
const DISTANCE = 'HKQuantityTypeIdentifierDistanceWalkingRunning' as const;
const ENERGY = 'HKQuantityTypeIdentifierActiveEnergyBurned' as const;
const WORKOUT = 'HKWorkoutTypeIdentifier' as const;
const ROUTE = 'HKWorkoutRouteTypeIdentifier' as const;

/**
 * Shows the Health permission sheet. iOS only shows it once; after that the
 * user changes access in Settings → Health → Data Access. Resolves true when
 * the request completed (not whether each type was allowed: iOS hides read
 * permissions from apps).
 */
export async function requestHealthAccess(): Promise<boolean> {
  const mod = load();
  if (!mod) return false;
  try {
    return await mod.requestAuthorization({ toShare: [WORKOUT, ROUTE, DISTANCE, ENERGY], toRead: [HEART_RATE] });
  } catch {
    return false;
  }
}

/** Writes a run to Health as a running workout with its distance, calories and route. */
export async function saveRunToHealth(run: Run, weightKg: number | null): Promise<boolean> {
  const mod = load();
  if (!mod || run.simulated) return false;
  const start = new Date(run.startedAt);
  const end = new Date(run.startedAt + run.elapsedMs);
  const kcal = runCalories(weightKg, run.distanceM);
  const quantities = [
    { quantityType: DISTANCE, quantity: run.distanceM, unit: 'm', startDate: start, endDate: end },
    ...(kcal ? [{ quantityType: ENERGY, quantity: kcal, unit: 'kcal', startDate: start, endDate: end }] : []),
  ];
  const workout = await mod.saveWorkoutSample(
    mod.WorkoutActivityType.running,
    quantities,
    start,
    end,
    { distance: run.distanceM, ...(kcal ? { energyBurned: kcal } : {}) },
    { HKIndoorWorkout: false },
  );
  const locations = run.segments.flat().map((p) => ({
    latitude: p.lat,
    longitude: p.lon,
    altitude: p.alt ?? 0,
    date: new Date(p.t),
    horizontalAccuracy: p.acc ?? 10,
    verticalAccuracy: p.alt != null ? 10 : -1,
    course: -1,
    speed: -1,
  }));
  if (locations.length > 1) await workout.saveWorkoutRoute(locations);
  return true;
}

/** Heart-rate readings (from a paired Apple Watch or other sensor) between two times. */
export async function readHeartRate(startMs: number, endMs: number): Promise<HrSample[] | null> {
  const mod = load();
  if (!mod) return null;
  const samples = await mod.queryQuantitySamples(HEART_RATE, {
    limit: 0,
    unit: 'count/min',
    ascending: true,
    filter: { date: { startDate: new Date(startMs), endDate: new Date(endMs) } },
  });
  return samples.map((s) => ({ t: s.startDate.getTime(), bpm: s.quantity }));
}
