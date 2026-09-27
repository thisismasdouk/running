import type { TrackPoint } from './types';

/*
 * Simulated GPS for the web demo, where a sandboxed preview or a desktop
 * browser has no real location. It feeds the same pipeline as real fixes,
 * so the whole record → pause → resume → finish → save flow can be tried.
 * Never used on native builds.
 */

/** Hyde Park, London: used when there's no known position to start from. */
export const DEFAULT_ORIGIN = { lat: 51.5073, lon: -0.1657 };
/** About 5:30 per km. */
export const SIM_PACE_SEC_PER_KM = 330;
const LAP_M = 2000;
const M_PER_DEG_LAT = 111_320;

/**
 * Position `d` metres along a slightly wobbly loop that starts and ends at
 * `origin` (same shape idea as the sample runs in sample.ts).
 */
export function loopPosition(origin: { lat: number; lon: number }, d: number, lapM = LAP_M): { lat: number; lon: number; alt: number } {
  const theta = (d / lapM) * 2 * Math.PI;
  const r = lapM / (2 * Math.PI) / M_PER_DEG_LAT;
  const rx = r / Math.cos((origin.lat * Math.PI) / 180);
  const wobble = 1 + 0.05 * Math.sin(theta * 5);
  return {
    // The loop's centre sits west of the origin so theta = 0 is the origin itself.
    lat: origin.lat + r * wobble * Math.sin(theta),
    lon: origin.lon - rx + rx * wobble * Math.cos(theta),
    alt: 30 + 8 * Math.sin(theta),
  };
}

/**
 * Emits one fix per second. The simulated runner only moves while
 * `isMoving()` is true (i.e. while recording), and stands still otherwise.
 * Returns a function that stops the simulation.
 */
export function startSimulator(
  origin: { lat: number; lon: number } | null | undefined,
  isMoving: () => boolean,
  onFix: (p: TrackPoint) => void,
): () => void {
  const from = origin ?? DEFAULT_ORIGIN;
  let d = 0;
  const tick = () => {
    if (isMoving()) {
      // Pace drifts a little, like a real runner.
      const pace = SIM_PACE_SEC_PER_KM * (1 + 0.06 * Math.sin(d / 400) + (Math.random() - 0.5) * 0.04);
      d += 1000 / pace;
    }
    const pos = loopPosition(from, d);
    onFix({ lat: pos.lat, lon: pos.lon, alt: pos.alt + (Math.random() - 0.5) * 0.6, t: Date.now(), acc: 4 + Math.random() * 3 });
  };
  tick();
  const id = setInterval(tick, 1000);
  return () => clearInterval(id);
}
