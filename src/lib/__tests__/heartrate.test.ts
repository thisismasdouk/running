import { runCalories, summariseHeartRate, zoneOf } from '../heartrate';

describe('heart rate', () => {
  it('maps bpm to zones by % of max', () => {
    expect(zoneOf(100, 200)).toBe(0);
    expect(zoneOf(120, 200)).toBe(1);
    expect(zoneOf(150, 200)).toBe(2);
    expect(zoneOf(170, 200)).toBe(3);
    expect(zoneOf(185, 200)).toBe(4);
  });

  it('time-weights the average and only counts readings inside the run', () => {
    const samples = [
      { t: -5000, bpm: 200 }, // before the start
      { t: 0, bpm: 120 },
      { t: 10_000, bpm: 160 },
      { t: 12_000, bpm: 180 },
      { t: 99_000, bpm: 210 }, // after the end
    ];
    const s = summariseHeartRate(samples, 0, 20_000, 200)!;
    // 120 × 10 s, 160 × 2 s, 180 × 8 s.
    expect(s.avg).toBe(Math.round((120 * 10 + 160 * 2 + 180 * 8) / 20));
    expect(s.max).toBe(180);
    expect(s.zonesMs).toEqual([0, 10_000, 0, 2_000, 8_000]);
    expect(s.series).toHaveLength(3);
  });

  it('caps long gaps between readings', () => {
    const s = summariseHeartRate([{ t: 0, bpm: 150 }, { t: 600_000, bpm: 150 }], 0, 600_000, 190)!;
    expect(s.zonesMs.reduce((a, b) => a + b, 0)).toBe(16_000);
  });

  it('returns null without readings', () => {
    expect(summariseHeartRate([], 0, 1000, 190)).toBeNull();
  });

  it('estimates calories from weight and distance', () => {
    expect(runCalories(70, 10_000)).toBe(725);
    expect(runCalories(null, 10_000)).toBeNull();
  });
});
