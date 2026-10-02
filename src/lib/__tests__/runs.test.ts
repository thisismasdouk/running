import { lapsFromMarks } from '../laps';
import { buildRun, normaliseRun, runTypeOf } from '../runs';
import type { Run } from '../types';
import { straightRun } from '@/test/helpers';

describe('laps', () => {
  it('turns Lap presses into laps closed by the finish', () => {
    const laps = lapsFromMarks(
      [
        { distanceM: 400, movingMs: 90_000 },
        { distanceM: 800, movingMs: 185_000 },
      ],
      { distanceM: 1000, movingMs: 240_000 },
    );
    expect(laps).toEqual([
      { distanceM: 400, movingMs: 90_000 },
      { distanceM: 400, movingMs: 95_000 },
      { distanceM: 200, movingMs: 55_000 },
    ]);
  });

  it('has no laps without presses, and drops an empty final lap', () => {
    expect(lapsFromMarks([], { distanceM: 1000, movingMs: 1 })).toEqual([]);
    expect(lapsFromMarks([{ distanceM: 400, movingMs: 90_000 }], { distanceM: 400, movingMs: 90_300 })).toHaveLength(1);
  });
});

describe('runs', () => {
  it('stores laps only when there are some', () => {
    const rec = { startedAt: 0, segments: [straightRun(500, 300)], movingMs: 150_000, elapsedMs: 150_000 };
    expect(buildRun(rec).laps).toBeUndefined();
    expect(buildRun({ ...rec, laps: [] }).laps).toBeUndefined();
    expect(buildRun({ ...rec, laps: [{ distanceM: 500, movingMs: 150_000 }] }).laps).toHaveLength(1);
  });

  it('loads runs saved before types, laps and shoes existed', () => {
    const old = { id: 'a', title: 'Old', startedAt: 0, movingMs: 1, elapsedMs: 1, distanceM: 1, elevationGainM: 0, segments: [] } as unknown as Run;
    const run = normaliseRun(old);
    expect(run.notes).toBe('');
    expect(run.effort).toBeNull();
    expect(run.bestEfforts).toEqual({});
    expect(runTypeOf(run)).toBe('easy');
    expect(run.laps).toBeUndefined();
    expect(run.shoeId).toBeUndefined();
  });

  it('drops an unknown run type', () => {
    const run = normaliseRun({ ...buildRun({ startedAt: 0, segments: [], movingMs: 0, elapsedMs: 0 }), type: 'fartlek' as never });
    expect(runTypeOf(run)).toBe('easy');
  });
});
