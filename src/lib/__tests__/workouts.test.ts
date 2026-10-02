import type { FlatStep, Workout } from '../types';
import {
  advanceWorkout,
  buildWorkout,
  estimateWorkout,
  flattenWorkout,
  formatTarget,
  LIBRARY,
  libraryWorkout,
  NEW_WORKOUT,
  normaliseWorkout,
  paceAdvice,
  stepLabel,
  stepStatus,
  stepTarget,
  toSimpleForm,
  workoutSummary,
  type StepCue,
} from '../workouts';

const intervals = libraryWorkout('intervals-6x400')!;

describe('workouts', () => {
  it('has the built-in library', () => {
    expect(LIBRARY.map((w) => w.id)).toEqual(['easy-5k', 'intervals-6x400', 'intervals-5x1k', 'fartlek-4x3', 'tempo-20', 'long-90']);
    expect(LIBRARY.every((w) => w.builtIn && flattenWorkout(w).length > 0)).toBe(true);
  });

  it('writes out repeat blocks in order with their rep numbers', () => {
    const steps = flattenWorkout(intervals);
    expect(steps).toHaveLength(1 + 6 * 2 + 1);
    expect(steps[0].kind).toBe('warmup');
    expect(steps[1]).toEqual({ kind: 'run', target: { type: 'distance', metres: 400 }, rep: 1, reps: 6 });
    expect(steps[2]).toMatchObject({ kind: 'recover', rep: 1, reps: 6 });
    expect(steps[11]).toMatchObject({ kind: 'run', rep: 6 });
    expect(steps[13].kind).toBe('cooldown');
    expect(steps.map(stepLabel).slice(0, 4)).toEqual(['Warm-up', 'Interval 1/6', 'Recover', 'Interval 2/6']);
    expect(stepLabel(flattenWorkout(libraryWorkout('tempo-20')!)[1])).toBe('Run');
  });

  it('formats targets and summaries', () => {
    expect(formatTarget({ type: 'distance', metres: 400 })).toBe('400 m');
    expect(formatTarget({ type: 'distance', metres: 5000 })).toBe('5 km');
    expect(formatTarget({ type: 'distance', metres: 21097.5 })).toBe('21.1 km');
    expect(formatTarget({ type: 'time', seconds: 90 })).toBe('90 s');
    expect(formatTarget({ type: 'time', seconds: 180 })).toBe('3 min');
    expect(formatTarget({ type: 'time', seconds: 150 })).toBe('2:30 min');
    expect(formatTarget({ type: 'time', seconds: 5400 })).toBe('1 h 30 min');
    expect(workoutSummary(intervals)).toBe('10 min warm-up · 6 × (400 m / 90 s) · 10 min cool-down');
    expect(workoutSummary(libraryWorkout('easy-5k')!)).toBe('5 km');
  });

  it('estimates distance and time', () => {
    const e = estimateWorkout(libraryWorkout('easy-5k')!);
    expect(e.distanceM).toBe(5000);
    expect(e.ms).toBe(5 * 330 * 1000);
    const t = estimateWorkout(libraryWorkout('long-90')!);
    expect(t.ms).toBe(90 * 60_000);
    expect(t.distanceM).toBeCloseTo((5400 / 330) * 1000, 0);
  });

  it('round-trips the builder form', () => {
    const w = buildWorkout({ ...NEW_WORKOUT, name: '  ' }, 'wk-1', 5);
    expect(w).toMatchObject({ id: 'wk-1', name: '6 × 400 m', runType: 'intervals', createdAt: 5 });
    expect(workoutSummary(w)).toBe(workoutSummary(intervals));
    expect(toSimpleForm(w)).toEqual({ ...NEW_WORKOUT, name: '6 × 400 m' });

    const tempo = buildWorkout(
      { name: 'Tempo', warmupMin: 0, repeats: 1, work: { type: 'time', seconds: 1200 }, workPace: { min: 270, max: 285 }, recover: null, cooldownMin: 5 },
      'wk-2',
    );
    expect(tempo.runType).toBe('tempo');
    expect(tempo.items).toHaveLength(2);
    expect(toSimpleForm(tempo)).toMatchObject({ warmupMin: 0, repeats: 1, workPace: { min: 270, max: 285 }, recover: null, cooldownMin: 5 });

    // Every library workout fits the simple builder, so each can be customised.
    for (const lib of LIBRARY) expect(toSimpleForm(lib)).not.toBeNull();
    const odd: Workout = { id: 'x', name: 'x', runType: 'easy', items: [{ kind: 'run', target: { type: 'time', seconds: 60 } }, { kind: 'run', target: { type: 'time', seconds: 60 } }] };
    expect(toSimpleForm(odd)).toBeNull();
  });

  it('steps builder values in sensible increments', () => {
    expect(stepTarget({ type: 'distance', metres: 400 }, 1)).toEqual({ type: 'distance', metres: 500 });
    expect(stepTarget({ type: 'distance', metres: 1000 }, 1)).toEqual({ type: 'distance', metres: 1500 });
    expect(stepTarget({ type: 'distance', metres: 1000 }, -1)).toEqual({ type: 'distance', metres: 900 });
    expect(stepTarget({ type: 'distance', metres: 100 }, -1)).toEqual({ type: 'distance', metres: 100 });
    expect(stepTarget({ type: 'time', seconds: 90 }, 1)).toEqual({ type: 'time', seconds: 105 });
    expect(stepTarget({ type: 'time', seconds: 600 }, 1)).toEqual({ type: 'time', seconds: 660 });
    expect(stepTarget({ type: 'time', seconds: 600 }, -1)).toEqual({ type: 'time', seconds: 570 });
  });

  it('drops malformed stored workouts', () => {
    expect(normaliseWorkout({ id: 'a', name: 'A', runType: 'easy', items: [] })).toBeNull();
    const w = normaliseWorkout({
      id: 'b',
      name: '',
      runType: 'easy',
      items: [{ kind: 'run', target: { type: 'distance', metres: 0 } }, { repeat: 3, steps: [{ kind: 'run', target: { type: 'time', seconds: 60 } }] }],
    });
    expect(w?.items).toHaveLength(1);
    expect(w?.name).toBe('Workout');
  });
});

describe('step engine', () => {
  const steps: FlatStep[] = [
    { kind: 'warmup', target: { type: 'time', seconds: 60 } },
    { kind: 'run', target: { type: 'distance', metres: 400 }, rep: 1, reps: 2 },
    { kind: 'recover', target: { type: 'time', seconds: 90 }, rep: 1, reps: 2 },
    { kind: 'run', target: { type: 'distance', metres: 400 }, rep: 2, reps: 2 },
  ];

  it('marks a time step boundary at exactly its target, interpolating distance', () => {
    const r = advanceWorkout(steps, [], { distanceM: 0, movingMs: 0 }, { distanceM: 200, movingMs: 80_000 });
    expect(r.marks).toEqual([{ distanceM: 150, movingMs: 60_000 }]);
    expect(r.cues).toEqual([{ type: 'step', index: 1 }]);
  });

  it('marks a distance step boundary at exactly its target, interpolating time', () => {
    const marks = [{ distanceM: 150, movingMs: 60_000 }];
    const r = advanceWorkout(steps, marks, { distanceM: 440, movingMs: 140_000 }, { distanceM: 640, movingMs: 160_000 });
    expect(r.marks).toEqual([{ distanceM: 550, movingMs: 151_000 }]);
    expect(r.cues).toEqual([{ type: 'last100', index: 1 }, { type: 'step', index: 2 }]);
  });

  it('crosses several boundaries in one go and finishes the workout', () => {
    const r = advanceWorkout(steps, [], { distanceM: 0, movingMs: 0 }, { distanceM: 2000, movingMs: 600_000 });
    expect(r.marks).toHaveLength(4);
    expect(r.cues.filter((c) => c.type !== 'last100')).toEqual<StepCue[]>([
      { type: 'step', index: 1 },
      { type: 'step', index: 2 },
      { type: 'step', index: 3 },
      { type: 'done' },
    ]);
    // Nothing more once every step is done.
    expect(advanceWorkout(steps, r.marks, { distanceM: 2000, movingMs: 600_000 }, { distanceM: 3000, movingMs: 900_000 }).marks).toEqual([]);
  });

  it('gives a halfway cue once for long steps', () => {
    const long: FlatStep[] = [{ kind: 'run', target: { type: 'time', seconds: 600 } }];
    expect(advanceWorkout(long, [], { distanceM: 0, movingMs: 299_000 }, { distanceM: 0, movingMs: 300_000 }).cues).toEqual([{ type: 'halfway', index: 0 }]);
    expect(advanceWorkout(long, [], { distanceM: 0, movingMs: 300_000 }, { distanceM: 0, movingMs: 301_000 }).cues).toEqual([]);
    // A 400 m rep is too short for "halfway".
    expect(advanceWorkout(steps, [{ distanceM: 0, movingMs: 60_000 }], { distanceM: 100, movingMs: 0 }, { distanceM: 250, movingMs: 0 }).cues).toEqual([]);
  });

  it('reports the step in progress and what is left', () => {
    const s = stepStatus(steps, [{ distanceM: 150, movingMs: 60_000 }], { distanceM: 450, movingMs: 120_000 });
    expect(s).toMatchObject({ index: 1, total: 4, done: false, distanceM: 300, ms: 60_000, remaining: { type: 'distance', metres: 100 }, progress: 0.75 });
    expect(s.next?.kind).toBe('recover');
    const t = stepStatus(steps, [{ distanceM: 0, movingMs: 60_000 }, { distanceM: 400, movingMs: 150_000 }], { distanceM: 450, movingMs: 180_000 });
    expect(t.remaining).toEqual({ type: 'time', ms: 60_000 });
    const done = stepStatus(steps, [1, 2, 3, 4].map((i) => ({ distanceM: i, movingMs: i })), { distanceM: 5, movingMs: 5 });
    expect(done).toMatchObject({ done: true, step: null, index: 4 });
  });

  it('compares live pace with the step target', () => {
    const step: FlatStep = { kind: 'run', target: { type: 'time', seconds: 60 }, pace: { min: 270, max: 285 } };
    expect(paceAdvice(step, 250)).toBe('slow-down');
    expect(paceAdvice(step, 300)).toBe('speed-up');
    expect(paceAdvice(step, 280)).toBe('on-pace');
    expect(paceAdvice(step, 0)).toBeNull();
    expect(paceAdvice(steps[1], 280)).toBeNull();
  });
});
