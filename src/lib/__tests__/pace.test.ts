import { progressSeries } from '../geo';
import { paceRange, paceSeries } from '../pace';
import { straightRun } from '@/test/helpers';

describe('pace series', () => {
  it('gives a steady pace for an even run', () => {
    const series = paceSeries(progressSeries([straightRun(3000, 300)]));
    expect(series.length).toBeGreaterThan(100);
    expect(series[0].d).toBe(0);
    expect(series[series.length - 1].d).toBeCloseTo(3000, 0);
    for (const p of series) expect(p.pace).toBeCloseTo(300, 0);
  });

  it('follows a change of pace, smoothed over the window', () => {
    const first = straightRun(1000, 360);
    const second = straightRun(1000, 240, { start: first[first.length - 1].t }).map((p) => ({ ...p, lat: p.lat + first[first.length - 1].lat }));
    const series = paceSeries(progressSeries([[...first, ...second.slice(1)]]), 200);
    const at = (d: number) => series.reduce((best, p) => (Math.abs(p.d - d) < Math.abs(best.d - d) ? p : best)).pace;
    expect(at(500)).toBeCloseTo(360, 0);
    expect(at(1500)).toBeCloseTo(240, 0);
    // Halfway through the window across the change: in between.
    expect(at(1000)).toBeGreaterThan(250);
    expect(at(1000)).toBeLessThan(350);
  });

  it('excludes paused time between segments', () => {
    const a = straightRun(1000, 300);
    const b = straightRun(1000, 300, { start: a[a.length - 1].t + 600_000 }).map((p) => ({ ...p, lat: p.lat + 0.02 }));
    for (const p of paceSeries(progressSeries([a, b]))) expect(p.pace).toBeCloseTo(300, 0);
  });

  it('is empty for too little data', () => {
    expect(paceSeries([])).toEqual([]);
    expect(paceSeries(progressSeries([straightRun(20, 300)]))).toEqual([]);
  });

  it('pads an even run and caps walking breaks in the range', () => {
    expect(paceRange([{ d: 0, pace: 300 }, { d: 10, pace: 300 }])).toEqual({ fast: 285, slow: 315 });
    const range = paceRange([300, 300, 310, 290, 1200].map((pace, d) => ({ d, pace })))!;
    expect(range.slow).toBeLessThan(500);
    expect(paceRange([])).toBeNull();
  });
});
