import { buildRun } from './runs';
import type { Run, Segment } from './types';

/** Tiny seeded PRNG so sample data is stable between reloads. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

/**
 * Synthesises a loop run around a park: a wobbly ellipse traced at a
 * varying pace with a gentle hill, one fix per second.
 */
export function sampleRun(startedAt: number, km: number, paceSecPerKm: number, seed: number): Run {
  const rand = rng(seed);
  const centre = { lat: 51.5073 + (rand() - 0.5) * 0.01, lon: -0.1657 + (rand() - 0.5) * 0.01 };
  const metres = km * 1000;
  const lapM = 2400 + rand() * 1600;
  const rx = lapM / (2 * Math.PI) / 111_320 / Math.cos((centre.lat * Math.PI) / 180);
  const ry = (lapM / (2 * Math.PI) / 111_320) * (0.6 + rand() * 0.5);
  const seg: Segment = [];
  let d = 0;
  let t = startedAt;
  while (d <= metres) {
    const theta = (d / lapM) * 2 * Math.PI;
    const wobble = 1 + 0.06 * Math.sin(theta * 5 + seed);
    seg.push({
      lat: centre.lat + ry * wobble * Math.sin(theta),
      lon: centre.lon + rx * wobble * Math.cos(theta),
      alt: 30 + 12 * Math.sin(theta) + rand() * 0.5,
      t,
      acc: 5,
    });
    // Pace drifts ±8% so splits and best efforts vary.
    const pace = paceSecPerKm * (1 + 0.08 * Math.sin(d / 1700 + seed) + (rand() - 0.5) * 0.04);
    const step = 1000 / pace; // metres per second
    d += step;
    t += 1000;
  }
  return buildRun({ startedAt, segments: [seg], movingMs: t - startedAt, elapsedMs: t - startedAt + 30_000 });
}

/** A few weeks of plausible training so the app can be explored without running first. */
export function sampleRuns(now = Date.now()): Run[] {
  const plan: [daysAgo: number, hour: number, km: number, pace: number][] = [
    [1, 7, 5.2, 318],
    [3, 18, 8.1, 334],
    [5, 7, 4.0, 300],
    [7, 9, 12.3, 345],
    [9, 7, 5.0, 312],
    [12, 18, 6.4, 325],
    [14, 9, 10.2, 340],
    [17, 7, 5.1, 322],
    [21, 9, 9.0, 342],
    [24, 12, 3.2, 305],
    [30, 8, 7.5, 338],
    [38, 8, 6.0, 330],
    [45, 8, 21.2, 352],
  ];
  return plan.map(([daysAgo, hour, km, pace], i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 5 + i * 3, 0, 0);
    const run = sampleRun(d.getTime(), km, pace, i + 1);
    return { ...run, id: `sample-${i}`, notes: i === 0 ? 'Crisp morning, felt strong on the last km.' : '', effort: 3 + (i % 6) };
  });
}
