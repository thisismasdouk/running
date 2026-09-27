import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { Platform } from 'react-native';

import { recorder } from './recorder';
import type { TrackPoint } from './types';

export const LOCATION_TASK = 'stride-run-location';

const toPoint = (l: Location.LocationObject): TrackPoint => ({
  lat: l.coords.latitude,
  lon: l.coords.longitude,
  alt: l.coords.altitude ?? null,
  t: l.timestamp,
  acc: l.coords.accuracy ?? null,
});

/**
 * Must run at module scope when the JS bundle loads (it's imported from the
 * root layout), so the OS can wake the app and deliver fixes while it's in
 * the background or was killed.
 */
export function defineLocationTask() {
  if (Platform.OS === 'web' || TaskManager.isTaskDefined(LOCATION_TASK)) return;
  TaskManager.defineTask<{ locations: Location.LocationObject[] }>(LOCATION_TASK, async ({ data, error }) => {
    if (error || !data) return;
    recorder.addPoints(data.locations.map(toPoint));
  });
}

let watcher: Location.LocationSubscription | null = null;
let backgroundActive = false;

export type TrackingPermission = 'background' | 'foreground' | 'denied';

export async function requestPermissions(): Promise<TrackingPermission> {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== 'granted') return 'denied';
  if (Platform.OS === 'web') return 'foreground';
  try {
    const bg = await Location.requestBackgroundPermissionsAsync();
    return bg.status === 'granted' ? 'background' : 'foreground';
  } catch {
    // Expo Go and some platforms can't grant background location.
    return 'foreground';
  }
}

/**
 * Starts delivering GPS fixes to the recorder. Uses background updates
 * (with an Android foreground-service notification) when permitted, and
 * falls back to a foreground-only watcher otherwise. Safe to call repeatedly.
 */
export async function startTracking(permission: TrackingPermission): Promise<void> {
  if (permission === 'denied') return;
  if (permission === 'background') {
    try {
      if (!(await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK))) {
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
      backgroundActive = true;
      return;
    } catch {
      // Fall through to foreground tracking.
    }
  }
  if (!watcher) {
    watcher = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
      (l) => recorder.addPoints([toPoint(l)]),
    );
  }
}

export async function stopTracking(): Promise<void> {
  watcher?.remove();
  watcher = null;
  if (backgroundActive || Platform.OS !== 'web') {
    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK);
      }
    } catch {
      // Task was never registered.
    }
  }
  backgroundActive = false;
}

export async function currentPosition(): Promise<TrackPoint | null> {
  try {
    const last = await Location.getLastKnownPositionAsync();
    if (last) return toPoint(last);
    return toPoint(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  } catch {
    return null;
  }
}
