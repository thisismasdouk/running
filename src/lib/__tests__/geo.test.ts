import { acceptPoint, elevationGain, haversine, thin, totalDistance } from '../geo';
import { straightRun } from '@/test/helpers';

describe('haversine', () => {
  it('measures one degree of latitude', () => {
    expect(haversine({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -1);
  });

  it('is zero for the same point', () => {
    expect(haversine({ lat: 51.5, lon: -0.1 }, { lat: 51.5, lon: -0.1 })).toBe(0);
  });
});

describe('acceptPoint', () => {
  const p = { lat: 0, lon: 0, alt: null, t: 0, acc: 5 };

  it('rejects inaccurate fixes', () => {
    expect(acceptPoint(undefined, { ...p, acc: 80 })).toBe(false);
  });

  it('rejects out-of-order fixes', () => {
    expect(acceptPoint({ ...p, t: 1000 }, { ...p, t: 1000 })).toBe(false);
  });

  it('rejects teleports but accepts running speed', () => {
    // ~111 m in 1 s is a GPS jump; ~4 m in 1 s is a run.
    expect(acceptPoint(p, { ...p, lat: 0.001, t: 1000 })).toBe(false);
    expect(acceptPoint(p, { ...p, lat: 0.00004, t: 1000 })).toBe(true);
  });
});

describe('distance and elevation', () => {
  it('sums segments without bridging the pause gap', () => {
    const a = straightRun(1000, 300);
    // Second segment starts 5 km further north; the gap must not be counted.
    const b = straightRun(1000, 300).map((pt) => ({ ...pt, lat: pt.lat + 0.045, t: pt.t + 1_000_000 }));
    expect(totalDistance([a, b])).toBeCloseTo(2000, 0);
  });

  it('ignores altitude jitter below the threshold', () => {
    const jitter = straightRun(500, 300, { alt: (d) => 50 + (Math.round(d) % 2) });
    expect(elevationGain([jitter])).toBe(0);
    const hill = straightRun(500, 300, { alt: (d) => 50 + d / 10 });
    expect(elevationGain([hill])).toBeGreaterThan(45);
  });

  it('thins close points but keeps the ends', () => {
    const seg = straightRun(100, 300, { stepS: 1 }); // ~3.3 m apart
    const out = thin(seg, 10);
    expect(out.length).toBeLessThan(seg.length);
    expect(out[0]).toBe(seg[0]);
    expect(out[out.length - 1]).toBe(seg[seg.length - 1]);
  });
});
