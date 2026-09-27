import type { Segment, TrackPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance between two points in metres. */
export function haversine(a: Pick<TrackPoint, 'lat' | 'lon'>, b: Pick<TrackPoint, 'lat' | 'lon'>): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fixes worse than this are too noisy to use. */
export const MAX_ACCURACY_M = 35;
/** ~13 m/s is faster than any human runs; anything above it is a GPS jump. */
export const MAX_SPEED_MPS = 13;

/**
 * Decides whether a new fix should be appended to a segment. It rejects
 * inaccurate fixes, out-of-order timestamps and implausible jumps.
 */
export function acceptPoint(prev: TrackPoint | undefined, next: TrackPoint): boolean {
  if (next.acc != null && next.acc > MAX_ACCURACY_M) return false;
  if (!prev) return true;
  const dt = (next.t - prev.t) / 1000;
  if (dt <= 0) return false;
  return haversine(prev, next) / dt <= MAX_SPEED_MPS;
}

export function segmentDistance(seg: Segment): number {
  let d = 0;
  for (let i = 1; i < seg.length; i++) d += haversine(seg[i - 1], seg[i]);
  return d;
}

export function totalDistance(segments: Segment[]): number {
  return segments.reduce((sum, s) => sum + segmentDistance(s), 0);
}

/**
 * Elevation gain with a hysteresis threshold, so GPS altitude jitter doesn't
 * add up to phantom climbing.
 */
export function elevationGain(segments: Segment[], threshold = 3): number {
  let gain = 0;
  for (const seg of segments) {
    let ref: number | null = null;
    for (const p of seg) {
      if (p.alt == null) continue;
      if (ref == null) {
        ref = p.alt;
      } else if (p.alt - ref >= threshold) {
        gain += p.alt - ref;
        ref = p.alt;
      } else if (ref - p.alt >= threshold) {
        ref = p.alt;
      }
    }
  }
  return gain;
}

/**
 * Cumulative (distance, moving time) samples across all segments. Pauses
 * contribute neither distance nor time.
 */
export type ProgressSample = { d: number; t: number; alt: number | null };

export function progressSeries(segments: Segment[]): ProgressSample[] {
  const out: ProgressSample[] = [];
  let d = 0;
  let t = 0;
  for (const seg of segments) {
    for (let i = 0; i < seg.length; i++) {
      if (i > 0) {
        d += haversine(seg[i - 1], seg[i]);
        t += seg[i].t - seg[i - 1].t;
      }
      out.push({ d, t, alt: seg[i].alt });
    }
  }
  return out;
}

export type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

export function bounds(segments: Segment[]): Bounds | null {
  let b: Bounds | null = null;
  for (const seg of segments) {
    for (const p of seg) {
      if (!b) b = { minLat: p.lat, maxLat: p.lat, minLon: p.lon, maxLon: p.lon };
      else {
        b.minLat = Math.min(b.minLat, p.lat);
        b.maxLat = Math.max(b.maxLat, p.lat);
        b.minLon = Math.min(b.minLon, p.lon);
        b.maxLon = Math.max(b.maxLon, p.lon);
      }
    }
  }
  return b;
}

/**
 * Drops points closer than `minGapM` to the previously kept one. Used to
 * keep stored routes small; start and end points are always kept.
 */
export function thin(seg: Segment, minGapM = 3): Segment {
  if (seg.length <= 2) return seg.slice();
  const out: Segment = [seg[0]];
  for (let i = 1; i < seg.length - 1; i++) {
    if (haversine(out[out.length - 1], seg[i]) >= minGapM) out.push(seg[i]);
  }
  out.push(seg[seg.length - 1]);
  return out;
}
