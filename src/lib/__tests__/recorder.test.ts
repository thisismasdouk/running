// jest.mock calls are hoisted above these imports by babel-jest.
import { __resetRecorder, currentLap, currentPace, currentSplit, movingMs, recorder, type RecorderEvent } from '../recorder';
import type { TrackPoint } from '../types';
import { straightRun } from '@/test/helpers';
import { haversine, totalDistance } from '../geo';

const mockStore = new Map<string, string>();
jest.mock('@/store/storage', () => ({
  kv: {
    get: (k: string) => mockStore.get(k) ?? null,
    set: (k: string, v: string) => mockStore.set(k, v),
    remove: (k: string) => mockStore.delete(k),
  },
}));

/** Stationary fixes at `at`, one per second from `start` for `seconds`. */
function standStill(at: TrackPoint, start: number, seconds: number): TrackPoint[] {
  return Array.from({ length: seconds }, (_, i) => ({ ...at, t: start + (i + 1) * 1000 }));
}

beforeEach(() => {
  mockStore.clear();
  __resetRecorder();
});

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

  it('emits a split event with split and total times on each whole km', () => {
    const events: RecorderEvent[] = [];
    recorder.on((e) => events.push(e));
    recorder.start(0);
    const pts = straightRun(2100, 300);
    for (let i = 0; i < pts.length; i += 10) recorder.addPoints(pts.slice(i, i + 10), pts[i].t);
    const splits = events.filter((e) => e.type === 'split');
    expect(splits.map((e) => e.type === 'split' && e.index)).toEqual([1, 2]);
    const second = splits[1];
    if (second.type !== 'split') throw new Error();
    // 5:00/km, fixes once a second: each split takes about 300 s.
    expect(second.splitMs / 1000).toBeCloseTo(300, -1);
    expect(second.movingMs / 1000).toBeCloseTo(600, -1);
    expect(recorder.get().lastSplit?.index).toBe(2);
  });

  it('reports the split in progress', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(1500, 300));
    const split = currentSplit(recorder.get(), 450_000);
    expect(split.index).toBe(2);
    expect(split.distanceM).toBeCloseTo(500, 0);
    expect(split.ms / 1000).toBeCloseTo(150, -1);
  });

  it('reports live pace from recent points', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(400, 300));
    expect(currentPace(recorder.get())).toBeCloseTo(300, 0);
  });

  it('keeps live pace after a resume instead of blanking it', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(400, 300));
    recorder.pause(120_000);
    recorder.resume(200_000);
    recorder.addPoints(straightRun(3, 300, { start: 200_000 }));
    expect(currentPace(recorder.get())).toBeGreaterThan(0);
  });

  it('drops fixes from before a resume, even with a skewed clock', () => {
    recorder.start(0);
    const first = straightRun(100, 300);
    recorder.addPoints(first);
    recorder.pause(40_000);
    // A late delivery of an old fix while paused, then resume.
    recorder.resume(41_000);
    recorder.addPoints([{ ...first[first.length - 1] }]);
    expect(recorder.get().segments[1]).toHaveLength(0);
    // A GPS clock running 10 s behind the device clock still records.
    recorder.addPoints(straightRun(20, 300, { start: 31_500 }).map((p) => ({ ...p, lat: p.lat + 0.01 })));
    expect(recorder.get().segments[1].length).toBeGreaterThan(1);
  });

  it('starts a new segment after a long gap instead of a straight line', () => {
    recorder.start(0);
    recorder.addPoints(straightRun(100, 300));
    const later = straightRun(100, 300, { start: 200_000 }).map((p) => ({ ...p, lat: p.lat + 0.005 }));
    recorder.addPoints(later);
    const s = recorder.get();
    expect(s.segments).toHaveLength(2);
    // ~550 m jump across the gap is not counted.
    expect(s.distanceM).toBeCloseTo(200, -1);
  });

  it('persists the in-progress run and can flush it on demand', () => {
    recorder.start(0);
    expect(mockStore.has('recorder')).toBe(true);
    recorder.addPoints(straightRun(50, 300));
    recorder.flush();
    const saved = JSON.parse(mockStore.get('recorder')!);
    expect(saved.segments[0].length).toBe(recorder.get().segments[0].length);
    recorder.finish(20_000);
    expect(mockStore.has('recorder')).toBe(false);
  });

  describe('auto-pause', () => {
    beforeEach(() => {
      recorder.autoPause = true;
    });

    it('stops the clock while standing still and resumes on moving off', () => {
      const events: string[] = [];
      recorder.on((e) => events.push(e.type));
      recorder.start(0);
      const run1 = straightRun(300, 300); // 90 s
      recorder.addPoints(run1, 90_000);
      const stop = run1[run1.length - 1];
      recorder.addPoints(standStill(stop, stop.t, 60), 150_000);
      let s = recorder.get();
      expect(s.autoPaused).toBe(true);
      expect(events).toEqual(['autopause']);
      // Moving time froze at the moment the runner stopped.
      expect(Math.abs(movingMs(s, 150_000) - 90_000)).toBeLessThanOrEqual(2000);
      expect(s.distanceM).toBeCloseTo(300, -1);

      // Off again, heading north from where they stopped.
      const run2 = straightRun(300, 300, { start: 151_000 }).map((p) => ({ ...p, lat: p.lat + stop.lat }));
      recorder.addPoints(run2, 241_000);
      s = recorder.get();
      expect(s.autoPaused).toBe(false);
      expect(events).toEqual(['autopause', 'autoresume']);
      expect(s.segments.length).toBe(2);
      // Only the running time counts: ~90 s + ~90 s, not the minute standing.
      expect(movingMs(s, 241_000) / 1000).toBeCloseTo(180, -1);
      expect(s.distanceM).toBeGreaterThan(560);
      // The metres run while auto-resume was deciding are kept, and the saved track agrees with the live total.
      expect(s.distanceM).toBeCloseTo(totalDistance(s.segments), 3);
      expect(s.distanceM).toBeGreaterThan(300 + haversine(stop, run2[run2.length - 1]) - 5);
    });

    it('does nothing when the setting is off', () => {
      recorder.autoPause = false;
      recorder.start(0);
      const run1 = straightRun(100, 300);
      recorder.addPoints(run1);
      recorder.addPoints(standStill(run1[run1.length - 1], run1[run1.length - 1].t, 30), 60_000);
      expect(recorder.get().autoPaused).toBe(false);
      expect(movingMs(recorder.get(), 60_000)).toBe(60_000);
    });

    it('a manual pause clears auto-pause', () => {
      recorder.start(0);
      const run1 = straightRun(100, 300);
      recorder.addPoints(run1);
      recorder.addPoints(standStill(run1[run1.length - 1], run1[run1.length - 1].t, 20), 50_000);
      expect(recorder.get().autoPaused).toBe(true);
      recorder.pause(60_000);
      expect(recorder.get().autoPaused).toBe(false);
      expect(recorder.get().status).toBe('paused');
    });
  });

  describe('laps', () => {
    it('records lap boundaries and reports the lap in progress', () => {
      const events: RecorderEvent[] = [];
      recorder.on((e) => events.push(e));
      recorder.start(0);
      const pts = straightRun(1000, 300);
      recorder.addPoints(pts.filter((p) => p.t <= 120_000));
      const first = recorder.lap(120_000);
      expect(first?.index).toBe(1);
      expect(first?.movingMs).toBe(120_000);
      expect(first?.distanceM).toBeCloseTo(400, -1);
      expect(events.filter((e) => e.type === 'lap')).toHaveLength(1);

      recorder.addPoints(pts.filter((p) => p.t > 120_000 && p.t <= 180_000));
      const live = currentLap(recorder.get(), 180_000);
      expect(live.index).toBe(2);
      expect(live.ms).toBe(60_000);
      expect(live.distanceM).toBeCloseTo(200, -1);
    });

    it('ignores a double tap and presses while paused or idle', () => {
      expect(recorder.lap(0)).toBeNull();
      recorder.start(0);
      recorder.addPoints(straightRun(200, 300));
      expect(recorder.lap(60_000)).not.toBeNull();
      expect(recorder.lap(60_400)).toBeNull();
      recorder.pause(70_000);
      expect(recorder.lap(80_000)).toBeNull();
      expect(recorder.get().lapMarks).toHaveLength(1);
    });

    it('lap times are moving time, excluding pauses', () => {
      recorder.start(0);
      recorder.addPoints(straightRun(300, 300));
      recorder.pause(90_000);
      recorder.resume(200_000);
      const lap = recorder.lap(230_000);
      expect(lap?.movingMs).toBe(120_000);
    });

    it('finishing closes the last lap and returns all laps', () => {
      recorder.start(0);
      const pts = straightRun(1000, 300);
      recorder.addPoints(pts.filter((p) => p.t <= 150_000));
      recorder.lap(150_000);
      recorder.addPoints(pts.filter((p) => p.t > 150_000));
      const result = recorder.finish(300_000);
      expect(result.laps).toHaveLength(2);
      expect(result.laps[0].movingMs + result.laps[1].movingMs).toBe(300_000);
      expect(result.laps[0].distanceM + result.laps[1].distanceM).toBeCloseTo(1000, 0);
    });

    it('a run without Lap presses has no laps', () => {
      recorder.start(0);
      recorder.addPoints(straightRun(500, 300));
      expect(recorder.finish(150_000).laps).toEqual([]);
    });

    it('keeps laps across a reload', () => {
      recorder.start(0);
      recorder.addPoints(straightRun(300, 300));
      recorder.lap(60_000);
      const saved = mockStore.get('recorder');
      __resetRecorder();
      if (saved) mockStore.set('recorder', saved);
      expect(recorder.get().lapMarks).toHaveLength(1);
    });
  });

  describe('workouts', () => {
    const workout = {
      id: 'w',
      name: '2 × 400 m',
      runType: 'intervals' as const,
      steps: [
        { kind: 'run' as const, target: { type: 'distance' as const, metres: 400 }, rep: 1, reps: 2 },
        { kind: 'recover' as const, target: { type: 'time' as const, seconds: 60 }, rep: 1, reps: 2 },
        { kind: 'run' as const, target: { type: 'distance' as const, metres: 400 }, rep: 2, reps: 2 },
      ],
    };

    it('marks a lap at each step boundary and announces each step', () => {
      const events: RecorderEvent[] = [];
      recorder.on((e) => events.push(e));
      recorder.start(0, false, workout);
      // 400 m at 4:00/km takes 96 s.
      const pts = straightRun(1000, 240);
      for (let i = 0; i < 100; i++) recorder.addPoints([pts[i]], pts[i].t);
      expect(recorder.get().lapMarks).toHaveLength(1);
      expect(recorder.get().lapMarks[0].distanceM).toBeCloseTo(400, 6);
      expect(recorder.get().lapMarks[0].movingMs).toBeCloseTo(96_000, -2);
      // The 60 s recovery ends on the clock, between fixes.
      recorder.tick(156_500);
      expect(recorder.get().lapMarks).toHaveLength(2);
      expect(recorder.get().lapMarks[1].movingMs).toBeCloseTo(156_000, -2);
      for (let i = 100; i < pts.length; i++) recorder.addPoints([pts[i]], pts[i].t);
      const cues = events.flatMap((e) => (e.type === 'workout' ? [e.cue] : []));
      expect(cues.filter((c) => c.type !== 'last100')).toEqual([{ type: 'step', index: 1 }, { type: 'step', index: 2 }, { type: 'done' }]);
      expect(events.some((e) => e.type === 'lap')).toBe(false);

      const result = recorder.finish(pts[pts.length - 1].t);
      expect(result.workout?.id).toBe('w');
      // Three steps plus what was run after the workout ended.
      expect(result.laps).toHaveLength(4);
      expect(result.laps[0].distanceM).toBeCloseTo(400, 6);
      expect(result.laps[1].movingMs).toBeCloseTo(60_000, -2);
      expect(result.laps[2].distanceM).toBeCloseTo(400, 6);
    });

    it('Lap skips to the next step', () => {
      const events: RecorderEvent[] = [];
      recorder.on((e) => events.push(e));
      recorder.start(0, false, workout);
      recorder.addPoints(straightRun(100, 240));
      recorder.lap(30_000);
      expect(recorder.get().lapMarks).toHaveLength(1);
      expect(events.filter((e) => e.type === 'workout').map((e) => e.type === 'workout' && e.cue)).toEqual([{ type: 'step', index: 1 }]);
    });

    it('free runs are unchanged', () => {
      recorder.start(0);
      recorder.addPoints(straightRun(1000, 240));
      recorder.tick(500_000);
      expect(recorder.get().workout).toBeNull();
      expect(recorder.get().lapMarks).toEqual([]);
    });
  });
});
