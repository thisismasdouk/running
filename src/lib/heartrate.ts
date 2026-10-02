/** One heart-rate reading, as Apple Health stores them (a watch records one every few seconds). */
export type HrSample = { t: number; bpm: number };

export type HeartRateSummary = {
  /** Time-weighted average, bpm. */
  avg: number;
  max: number;
  /** Milliseconds spent in each of the five zones. */
  zonesMs: number[];
  /** The max heart rate the zones were computed against. */
  maxHr: number;
  /** Thinned readings for the chart. */
  series: HrSample[];
};

/** Zones as a fraction of max heart rate, the common five-zone model. */
export const HR_ZONES = [
  { name: 'Zone 1', label: 'Recovery', from: 0, color: '#94A3B8' },
  { name: 'Zone 2', label: 'Endurance', from: 0.6, color: '#3B82F6' },
  { name: 'Zone 3', label: 'Tempo', from: 0.7, color: '#22C55E' },
  { name: 'Zone 4', label: 'Threshold', from: 0.8, color: '#F59E0B' },
  { name: 'Zone 5', label: 'Max', from: 0.9, color: '#EF4444' },
];

export const DEFAULT_MAX_HR = 190;

/** A reading counts until the next one, but never for longer than this. */
const MAX_HOLD_MS = 15_000;
const MAX_SERIES = 300;

export function zoneOf(bpm: number, maxHr: number): number {
  const f = bpm / maxHr;
  for (let i = HR_ZONES.length - 1; i > 0; i--) if (f >= HR_ZONES[i].from) return i;
  return 0;
}

/** Summarises the readings that fall inside a run, or null if there are none. */
export function summariseHeartRate(samples: HrSample[], startMs: number, endMs: number, maxHr: number): HeartRateSummary | null {
  const inRun = samples.filter((s) => s.t >= startMs && s.t <= endMs && s.bpm > 25 && s.bpm < 250).sort((a, b) => a.t - b.t);
  if (inRun.length === 0) return null;
  const zonesMs = HR_ZONES.map(() => 0);
  let weighted = 0;
  let total = 0;
  let max = 0;
  inRun.forEach((s, i) => {
    const next = inRun[i + 1]?.t ?? endMs;
    const dt = Math.max(1000, Math.min(next - s.t, MAX_HOLD_MS));
    weighted += s.bpm * dt;
    total += dt;
    max = Math.max(max, s.bpm);
    zonesMs[zoneOf(s.bpm, maxHr)] += dt;
  });
  const step = Math.ceil(inRun.length / MAX_SERIES);
  const series = inRun.filter((_, i) => i % step === 0).map((s) => ({ t: s.t, bpm: Math.round(s.bpm) }));
  return { avg: Math.round(weighted / total), max: Math.round(max), zonesMs, maxHr, series };
}

/** Rough running energy cost: about 1 kcal per kg of body weight per km. */
export function runCalories(weightKg: number | null | undefined, distanceM: number): number | null {
  if (!weightKg || weightKg <= 0) return null;
  return Math.round(weightKg * (distanceM / 1000) * 1.036);
}
