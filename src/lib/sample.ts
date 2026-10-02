import { progressSeries } from './geo';
import { dayKey, type FoodEntry, type Meal } from './food';
import { DEFAULT_MAX_HR, summariseHeartRate, type HrSample } from './heartrate';
import { lapsFromMarks } from './laps';
import { buildRun } from './runs';
import type { Lap, Run, RunType, Segment, Shoe } from './types';

/** The shoe the sample runs were "run" in; added and removed along with them. */
export const SAMPLE_SHOE: Shoe = { id: 'sample-shoe', name: 'Sample trainers', retired: false, addedAt: 0 };

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

/** Laps as if Lap had been pressed every `everyM` metres. */
function lapsEvery(run: Run, everyM: number): Lap[] {
  const samples = progressSeries(run.segments);
  const marks = [];
  let next = everyM;
  for (const p of samples) {
    if (p.d >= next) {
      marks.push({ distanceM: p.d, movingMs: p.t });
      next += everyM;
    }
  }
  const end = samples[samples.length - 1];
  return lapsFromMarks(marks, { distanceM: end.d, movingMs: end.t });
}

/** Watch-style readings every 5 s: a warm-up climb, then drift with effort. */
function sampleHeartRate(run: Run, seed: number, base: number) {
  const rand = rng(seed * 7);
  const end = run.startedAt + run.movingMs;
  const samples: HrSample[] = [];
  for (let t = run.startedAt; t <= end; t += 5000) {
    const warm = Math.min(1, (t - run.startedAt) / 480_000);
    const drift = ((t - run.startedAt) / 3_600_000) * 8;
    samples.push({ t, bpm: 95 + (base - 95) * warm + drift + 6 * Math.sin((t - run.startedAt) / 140_000) + (rand() - 0.5) * 4 });
  }
  return summariseHeartRate(samples, run.startedAt, end, DEFAULT_MAX_HR) ?? undefined;
}

/** Average heart rate each run type settles at, for the sample data. */
const SAMPLE_HR = { easy: 142, long: 148, tempo: 164, intervals: 158, race: 172, recovery: 132 } as const;

const SAMPLE_TYPES: RunType[] = ['easy', 'tempo', 'intervals', 'long', 'easy', 'recovery', 'long', 'easy', 'long', 'intervals', 'tempo', 'easy', 'race'];

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
    const type = SAMPLE_TYPES[i];
    return {
      ...run,
      id: `sample-${i}`,
      notes: i === 0 ? 'Crisp morning, felt strong on the last km.' : i === 2 ? '5 × 800 m with the Lap button.' : '',
      effort: 3 + (i % 6),
      type,
      // Older runs predate the shoe, like a real log would.
      ...(i < 10 ? { shoeId: SAMPLE_SHOE.id } : {}),
      // As if a watch was worn for the more recent runs.
      ...(i < 8 ? { heartRate: sampleHeartRate(run, i + 1, SAMPLE_HR[type]) } : {}),
      ...(type === 'intervals' ? { laps: lapsEvery(run, 800) } : type === 'tempo' ? { laps: lapsEvery(run, 2000) } : {}),
    };
  });
}

/** A few days of logged meals, loaded with the sample runs. */
export function sampleFood(now = Date.now()): FoodEntry[] {
  const meals: [daysAgo: number, hour: number, meal: Meal, name: string, kcal: number, p: number, c: number, f: number, ai: boolean][] = [
    [0, 7, 'breakfast', 'Porridge with banana and honey', 420, 12, 78, 8, true],
    [0, 12, 'lunch', 'Chicken wrap and side salad', 610, 38, 55, 24, true],
    [0, 16, 'snack', 'Greek yoghurt with berries', 180, 15, 20, 4, false],
    [1, 8, 'breakfast', 'Scrambled eggs on toast', 450, 24, 34, 24, true],
    [1, 13, 'lunch', 'Tuna pasta salad', 640, 34, 72, 22, true],
    [1, 19, 'dinner', 'Salmon, rice and broccoli', 720, 42, 70, 26, true],
    [1, 21, 'snack', 'Dark chocolate', 160, 2, 12, 11, false],
    [2, 7, 'breakfast', 'Overnight oats', 390, 16, 58, 10, false],
    [2, 13, 'lunch', 'Burrito bowl', 780, 36, 92, 28, true],
    [2, 20, 'dinner', 'Spaghetti bolognese', 820, 40, 96, 26, true],
    [3, 12, 'lunch', 'Falafel and hummus plate', 690, 22, 74, 32, true],
    [3, 19, 'dinner', 'Chicken stir-fry with noodles', 760, 44, 88, 22, true],
    [4, 8, 'breakfast', 'Bagel with peanut butter', 480, 16, 60, 18, false],
    [4, 19, 'dinner', 'Margherita pizza (half)', 900, 36, 104, 34, true],
    [5, 13, 'lunch', 'Lentil soup and bread', 520, 24, 80, 10, true],
    [6, 19, 'dinner', 'Steak, potatoes and green beans', 850, 52, 60, 40, true],
  ];
  return meals.map(([daysAgo, hour, meal, name, kcal, p, c, f, ai], i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - daysAgo);
    d.setHours(hour, 10 + i, 0, 0);
    return { id: `sample-food-${i}`, day: dayKey(d.getTime()), at: d.getTime(), meal, name, kcal, proteinG: p, carbsG: c, fatG: f, source: ai ? 'ai' : 'manual' };
  });
}
