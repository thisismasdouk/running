import * as Location from 'expo-location';
import { Linking, Platform } from 'react-native';

import { kv } from '@/store/storage';

import type { TrackPoint } from './types';

/*
 * Native location access. location.web.ts implements the same functions with
 * the browser Geolocation API; tracking.ts only talks to this interface.
 */

export const LOCATION_TASK = 'stride-run-location';
const ASKED_ALWAYS_KEY = 'askedAlwaysLocation';

export type Access =
  /** Precise location is allowed and location services are on. */
  | 'granted'
  /** Allowed, but only approximate location (iOS "Precise: Off", Android "Approximate"). */
  | 'approximate'
  | 'denied'
  /** Never asked yet. */
  | 'undetermined'
  /** Location services are switched off for the whole device. */
  | 'services-off'
  /** This environment can't provide location at all (e.g. a sandboxed web preview). */
  | 'unavailable';

export type AccessResult = { access: Access; canAskAgain?: boolean; message?: string };

export const toPoint = (l: Location.LocationObject): TrackPoint => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude ?? null,
  t: l.timestamp,
  acc: l.coords.accuracy ?? null,
});

/** Can the OS keep delivering fixes to a background task? Web can't. */
export const supportsBackgroundUpdates = true;
/** Whether "Open Settings" can take the user to this app's settings. */
export const canOpenSettings = true;

/** Reads (or, with `ask`, requests) foreground location access. Never asks for "Always". */
export async function getAccess(ask: boolean): Promise<AccessResult> {
  const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
  if (perm.status === 'undetermined') return { access: 'undetermined', canAskAgain: perm.canAskAgain };
  if (perm.status !== 'granted') return { access: 'denied', canAskAgain: perm.canAskAgain };
  if (!(await Location.hasServicesEnabledAsync())) return { access: 'services-off' };
  // Approximate fixes are hundreds of metres wide and would all be rejected by the recorder.
  if (perm.ios?.accuracy === 'reduced' || perm.android?.accuracy === 'coarse') return { access: 'approximate' };
  return { access: 'granted' };
}

/**
 * iOS only: offer "Always" once, when the user starts their first run. Runs
 * keep recording with the phone locked either way (background location mode
 * plus the blue indicator), so a refusal is fine.
 */
async function offerAlwaysOnce() {
  if (Platform.OS !== 'ios') return;
  try {
    // expo-location only remembers in memory that it asked, so after a relaunch a
    // "While Using" user reads as undetermined again. iOS won't re-prompt and the
    // request would just wait out its timeout, delaying Start. Remember it here.
    if (kv.get(ASKED_ALWAYS_KEY)) return;
    const bg = await Location.getBackgroundPermissionsAsync();
    if (bg.status !== 'undetermined') {
      kv.set(ASKED_ALWAYS_KEY, '1');
      return;
    }
    if (!bg.canAskAgain) return;
    kv.set(ASKED_ALWAYS_KEY, '1');
    await Location.requestBackgroundPermissionsAsync();
  } catch {
    // Expo Go and some configurations can't ask; foreground access is enough.
  }
}

/**
 * Starts OS-managed location updates delivered to LOCATION_TASK (defined in
 * tracking-task.ts). With only foreground permission this still works while
 * the phone is locked: Android runs a foreground service with a notification,
 * iOS uses the location background mode. Throws where that isn't available
 * (e.g. Expo Go), and the caller falls back to a foreground watcher.
 */
export async function startBackgroundUpdates(): Promise<void> {
  await offerAlwaysOnce();
  if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) return;
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    activityType: Location.ActivityType.Fitness,
    pausesUpdatesAutomatically: false,
    showsBackgroundLocationIndicator: true,
    foregroundService: {
      notificationTitle: 'Stride is recording your run',
      notificationBody: 'Tap to return to your run.',
      notificationColor: '#FC4C02',
    },
  });
}

export async function stopBackgroundUpdates(): Promise<void> {
  try {
    if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) await Location.stopLocationUpdatesAsync(LOCATION_TASK);
  } catch {
    // Task was never registered.
  }
}

/** Foreground-only position watcher. Resolves to an unsubscribe function. */
export async function watchPosition(onFix: (p: TrackPoint) => void, onError: (message: string) => void): Promise<() => void> {
  const sub = await Location.watchPositionAsync(
    { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
    (l) => onFix(toPoint(l)),
    (reason) => onError(reason || 'Lost the GPS signal'),
  );
  return () => sub.remove();
}

/** A recent cached position to centre the map on. Not proof of a live fix. */
export async function lastKnownPosition(): Promise<TrackPoint | null> {
  try {
    const last = await Location.getLastKnownPositionAsync({ maxAge: 60_000, requiredAccuracy: 100 });
    return last ? toPoint(last) : null;
  } catch {
    return null;
  }
}

export function openSettings() {
  Linking.openSettings().catch(() => {});
}
