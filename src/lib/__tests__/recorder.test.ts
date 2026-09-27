// jest.mock calls are hoisted above these imports by babel-jest.
import { __resetRecorder, currentPace, movingMs, recorder } from '../recorder';
import { straightRun } from '@/test/helpers';

jest.mock('@/store/storage', () => {
  const m = new Map<string, string>();
  return { kv: { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => m.set(k, v), remove: (k: string) => m.delete(k) } };
});


beforeEach(() => __resetRecorder());

describe('recorder', () => {
  it('tracks distance and excludes paused time', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(500, 300));
    recorder.pause(150_000);
    recorder.resume(400_000);
    recorder.addPoints(straightRun(500, 300, { start: 400_000 }).map((p) => ({ ...p, lat: p.lat + 0.01 })));
    const s = recorder.get();
    expect(s.segments).toHaveLength(2);
    expect(s.distanceM).toBeCloseTo(1000, 0);
    expect(movingMs(s, 550_000)).toBe(300_000);

    const result = recorder.finish(550_000);
    expect(result.movingMs).toBe(300_000);
    expect(result.elapsedMs).toBe(550_000);
    expect(recorder.get().status).toBe('idle');
  });

  it('ignores points while paused', () => {
    recorder.start(0);
    recorder.pause(1000);
    recorder.addPoints(straightRun(100, 300));
    expect(recorder.get().distanceM).toBe(0);
  });

  it('fires a split callback on each whole km', () => {
    const splits: number[] = [];
    recorder.onSplit((d) => splits.push(Math.floor(d / 1000)));
    recorder.start(0);
    const pts = straightRun(2100, 300);
    for (let i = 0; i < pts.length; i += 10) recorder.addPoints(pts.slice(i, i + 10));
    expect(splits).toEqual([1, 2]);
  });

  it('reports live pace from recent points', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(400, 300));
    expect(currentPace(recorder.get())).toBeCloseTo(300, 0);
  });
});
