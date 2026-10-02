import { haversine } from '../geo';
import { DEFAULT_ORIGIN, loopPosition, SIM_PACE_SEC_PER_KM, startSimulator } from '../simulator';
import type { TrackPoint } from '../types';

describe('simulator', () => {
  it('traces a loop that starts and ends at the origin', () => {
    const start = loopPosition(DEFAULT_ORIGIN, 0);
    expect(haversine(start, DEFAULT_ORIGIN)).toBeLessThan(0.01);
    expect(haversine(loopPosition(DEFAULT_ORIGIN, 2000), DEFAULT_ORIGIN)).toBeLessThan(0.5);
    // Roughly a 2 km loop, so the far side is a few hundred metres away.
    expect(haversine(loopPosition(DEFAULT_ORIGIN, 1000), DEFAULT_ORIGIN)).toBeGreaterThan(400);
  });

  it('emits accurate fixes at running speed only while moving', () => {
    jest.useFakeTimers();
    const fixes: TrackPoint[] = [];
    let moving = false;
    const stop = startSimulator(null, () => moving, (p) => fixes.push(p));
    jest.advanceTimersByTime(3000);
    expect(haversine(fixes[0], fixes[fixes.length - 1])).toBeLessThan(0.01);
    moving = true;
    const from = fixes.length - 1;
    jest.advanceTimersByTime(10_000);
    stop();
    const count = fixes.length;
    jest.advanceTimersByTime(5000);
    expect(fixes.length).toBe(count);
    const d = haversine(fixes[from], fixes[fixes.length - 1]);
    // 10 s at ~5:30/km is ~30 m.
    expect(d).toBeGreaterThan((10_000 / SIM_PACE_SEC_PER_KM) * 0.8);
    expect(d).toBeLessThan((10_000 / SIM_PACE_SEC_PER_KM) * 1.2);
    expect(fixes.every((p) => p.acc != null && p.acc < 10)).toBe(true);
    jest.useRealTimers();
  });
});
