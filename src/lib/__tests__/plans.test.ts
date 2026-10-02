import {
  addDays,
  currentWeek,
  dayStart,
  getPlan,
  planFinished,
  planLengthDays,
  planSchedule,
  PLANS,
  recordRun,
  resolveWorkout,
  runMatchesSession,
  setSession,
  startForRace,
  unlinkRun,
  upNext,
  weekProgress,
} from '../plans';
import type { ActivePlan, Run } from '../types';
import { libraryWorkout } from '../workouts';

const START = new Date(2026, 0, 5).getTime(); // a Monday, local midnight
const at = (days: number, hour = 8) => addDays(START, days) + hour * 3_600_000;

function run(over: Partial<Run>): Run {
  return {
    id: 'r1',
    title: 'Run',
    notes: '',
    effort: null,
    startedAt: at(0),
    movingMs: 30 * 60_000,
    elapsedMs: 30 * 60_000,
    distanceM: 5000,
    elevationGainM: 0,
    segments: [],
    bestEfforts: {},
    ...over,
  };
}

const plan5k = getPlan('5k-beginner')!;
const active: ActivePlan = { planId: '5k-beginner', startDate: START, sessions: {} };

describe('plans', () => {
  it('has three plans that only reference library workouts', () => {
    expect(PLANS.map((p) => [p.id, p.weeks.length])).toEqual([
      ['5k-beginner', 8],
      ['10k', 8],
      ['half', 12],
    ]);
    for (const p of PLANS) {
      for (const w of p.weeks) {
        expect(w.length).toBeGreaterThanOrEqual(3);
        expect(w.length).toBeLessThanOrEqual(4);
        for (const s of w) if (s.kind === 'workout') expect(libraryWorkout(s.workoutId)).toBeDefined();
      }
      // Each plan ends with a race on its last day.
      const last = p.weeks[p.weeks.length - 1];
      expect(last[last.length - 1]).toMatchObject({ kind: 'race', day: 6 });
    }
  });

  it('works out dates from the start date or a race date', () => {
    expect(planLengthDays(plan5k)).toBe(7 * 7 + 6);
    const race = addDays(START, 55);
    expect(startForRace(plan5k, race)).toBe(START);
    const schedule = planSchedule(plan5k, active, at(0));
    expect(schedule).toHaveLength(24);
    expect(schedule[0]).toMatchObject({ key: '1-1', week: 1, date: START, state: 'today' });
    expect(schedule[1].date).toBe(addDays(START, 2));
    expect(schedule[23]).toMatchObject({ key: '8-3', date: race, state: 'upcoming' });
    expect(schedule[23].workout.name).toBe('5K race');
    expect(schedule[0].workout).toMatchObject({ id: 'plan-1-1', name: 'Easy run · 20 min', runType: 'easy' });
  });

  it('tracks the current week, today, the next session and weekly progress', () => {
    const now = at(9); // week 2, day 2: session 2-2
    let a = setSession(active, '2-1', 'done', 'r0', now);
    a = setSession(a, '1-1', 'skipped', undefined, now);
    const schedule = planSchedule(plan5k, a, now);
    expect(currentWeek(plan5k, a, now)).toBe(2);
    expect(currentWeek(plan5k, a, at(-3))).toBe(1);
    expect(currentWeek(plan5k, a, at(200))).toBe(8);
    expect(weekProgress(schedule, 2)).toEqual({ done: 1, total: 3 });
    expect(schedule.find((s) => s.key === '1-2')?.state).toBe('missed');
    const { today, next } = upNext(schedule, now);
    expect(today?.key).toBe('2-2');
    expect(next?.key).toBe('2-3');
    expect(upNext(schedule, at(10)).today).toBeNull();
    expect(planFinished(schedule)).toBe(false);
    expect(planFinished(planSchedule(plan5k, a, at(56)))).toBe(true);
  });

  it('resolves workouts from the library, custom list and plan sessions', () => {
    const custom = [{ id: 'wk-1', name: 'Mine', runType: 'easy' as const, items: [] }];
    expect(resolveWorkout('tempo-20', custom, null)?.name).toBe('20 min tempo');
    expect(resolveWorkout('wk-1', custom, null)?.name).toBe('Mine');
    expect(resolveWorkout('plan-8-3', [], active)?.name).toBe('5K race');
    expect(resolveWorkout('plan-8-3', [], null)).toBeUndefined();
    expect(resolveWorkout('plan-9-1', [], active)).toBeUndefined();
  });

  it('matches runs to sessions', () => {
    const schedule = planSchedule(plan5k, active, at(0));
    const easy20 = schedule[0];
    expect(runMatchesSession(easy20, run({ movingMs: 18 * 60_000 }))).toBe(true);
    expect(runMatchesSession(easy20, run({ movingMs: 10 * 60_000 }))).toBe(false);
    const fartlek = schedule.find((s) => s.session.kind === 'workout')!;
    expect(runMatchesSession(fartlek, run({ workoutId: 'fartlek-4x3' }))).toBe(true);
    expect(runMatchesSession(fartlek, run({ workoutId: 'tempo-20' }))).toBe(false);
    expect(runMatchesSession(fartlek, run({ type: 'intervals', distanceM: 6000 }))).toBe(true);
    expect(runMatchesSession(fartlek, run({ type: 'easy', distanceM: 6000 }))).toBe(false);
  });

  it('marks the session a saved run completes, and unmarks it when the run is deleted', () => {
    // Same day and long enough: the day's session is done.
    const a = recordRun(plan5k, active, run({ id: 'r1' }), undefined, at(0));
    expect(a.sessions['1-1']).toMatchObject({ status: 'done', runId: 'r1' });
    // A run on a rest day doesn't change anything.
    expect(recordRun(plan5k, active, run({ startedAt: at(1) }), undefined, at(1))).toBe(active);
    // Started from a session: that session, whatever the day.
    const b = recordRun(plan5k, active, run({ id: 'r2', startedAt: at(1), movingMs: 60_000 }), '1-2', at(1));
    expect(b.sessions['1-2']).toMatchObject({ status: 'done', runId: 'r2' });
    // A session already done isn't taken again.
    expect(recordRun(plan5k, a, run({ id: 'r3' }), undefined, at(0))).toBe(a);
    expect(unlinkRun(a, 'r1').sessions).toEqual({});
  });

  it('uses local calendar days', () => {
    expect(dayStart(at(3, 23))).toBe(addDays(START, 3));
  });
});
