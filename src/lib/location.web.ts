import type { TrackPoint } from './types';
import type { AccessResult } from './location';

export type { Access, AccessResult } from './location';

/*
 * Web implementation of location.ts on the browser Geolocation API.
 * expo-location's web shim throws when navigator.permissions is missing,
 * waits forever on an unanswered prompt, ignores Permissions Policy and
 * drops watch errors, so this talks to the browser directly.
 */

export const LOCATION_TASK = 'stride-run-location';
export const supportsBackgroundUpdates = false;
export const canOpenSettings = false;

const BLOCKED = 'Location is blocked in this embedded preview.';
let cached: TrackPoint | null = null;

const toPoint = (p: GeolocationPosition): TrackPoint => ({
  lat: p.coords.latitude,
  lon: p.coords.longitude,
  alt: p.coords.altitude ?? null,
  t: p.timestamp,
  acc: p.coords.accuracy ?? null,
});

const geo = (): Geolocation | undefined => (typeof navigator !== 'undefined' ? navigator.geolocation : undefined);

/** True when a Permissions Policy (e.g. an iframe without allow="geolocation") forbids location. */
function blockedByPolicy(): boolean {
  try {
    const doc = globalThis.document as unknown as {
      permissionsPolicy?: { allowsFeature?: (f: string) => boolean };
      featurePolicy?: { allowsFeature?: (f: string) => boolean };
    };
    const policy = doc?.permissionsPolicy ?? doc?.featurePolicy;
    return policy?.allowsFeature?.('geolocation') === false;
  } catch {
    return false;
  }
}

async function queryPermission(): Promise<PermissionState | null> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    return status?.state ?? null;
  } catch {
    return null;
  }
}

function errorResult(err: GeolocationPositionError): AccessResult {
  if (err.code === err.PERMISSION_DENIED) {
    return /policy/i.test(err.message) ? { access: 'unavailable', message: BLOCKED } : { access: 'denied' };
  }
  if (err.code === err.TIMEOUT) return { access: 'unavailable', message: 'Timed out waiting for a location fix.' };
  return { access: 'unavailable', message: 'This device could not determine its location.' };
}

/**
 * Confirms access with a real position request, because permissions.query
 * can say "granted" while a Permissions Policy still blocks every call.
 */
export async function getAccess(ask: boolean): Promise<AccessResult> {
  const g = geo();
  if (!g) return { access: 'unavailable', message: "This browser can't share its location." };
  if (blockedByPolicy()) return { access: 'unavailable', message: BLOCKED };
  if (!ask) {
    const state = await queryPermission();
    if (state === 'denied') return { access: 'denied' };
    if (state === 'prompt') return { access: 'undetermined' };
  }
  return new Promise((resolve) => {
    g.getCurrentPosition(
      (pos) => {
        cached = toPoint(pos);
        resolve({ access: 'granted' });
      },
      (err) => resolve(errorResult(err)),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  });
}

export async function startBackgroundUpdates(): Promise<void> {
  throw new Error('Background location is not available on web');
}

export async function stopBackgroundUpdates(): Promise<void> {}

export async function watchPosition(onFix: (p: TrackPoint) => void, onError: (message: string) => void): Promise<() => void> {
  const g = geo();
  if (!g) throw new Error("This browser can't share its location.");
  const id = g.watchPosition(
    (pos) => {
      cached = toPoint(pos);
      onFix(cached);
    },
    (err) => onError(errorResult(err).message ?? 'Location access was turned off.'),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
  );
  return () => g.clearWatch(id);
}

export async function lastKnownPosition(): Promise<TrackPoint | null> {
  if (cached && Date.now() - cached.t < 60_000) return cached;
  return null;
}

export function openSettings() {}
