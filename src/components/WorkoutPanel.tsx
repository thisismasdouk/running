import { StyleSheet, Text, View } from 'react-native';

import { formatDuration, formatPaceRange } from '@/lib/format';
import { movingMs, type RecorderState, type RecorderWorkout } from '@/lib/recorder';
import type { Units } from '@/lib/types';
import { formatTarget, paceAdvice, stepLabel, stepStatus } from '@/lib/workouts';
import { useColors } from './theme';
import { ProgressBar } from './ui';
import { stepColor } from './WorkoutSteps';

/** "250 m" or "1.25 km" left in a distance step. */
function metresLeft(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.ceil(m)} m`;
}

const ADVICE = {
  'slow-down': { text: 'Slow down', key: 'warn' },
  'speed-up': { text: 'Speed up', key: 'warn' },
  'on-pace': { text: 'On pace', key: 'good' },
} as const;

/** The live workout panel on the Record screen: the step in progress, what's left of it and what's next. */
export function WorkoutPanel({ rec, now, units, livePace }: { rec: RecorderState; now: number; units: Units; livePace: number }) {
  const c = useColors();
  const w = rec.workout;
  if (!w) return null;
  const s = stepStatus(w.steps, rec.lapMarks, { distanceM: rec.distanceM, movingMs: movingMs(rec, now) });

  if (s.done || !s.step) {
    return (
      <View style={[styles.panel, { backgroundColor: c.accentSoft }]}>
        <Text style={[styles.step, { color: c.text }]}>Workout complete 🎉</Text>
        <Text style={{ color: c.muted }}>Keep going or press Finish when you’re ready.</Text>
      </View>
    );
  }

  const advice = paceAdvice(s.step, livePace);
  const left =
    s.remaining?.type === 'distance' ? metresLeft(s.remaining.metres) : formatDuration(Math.ceil((s.remaining?.ms ?? 0) / 1000) * 1000);
  return (
    <View style={[styles.panel, { backgroundColor: c.accentSoft }]} accessibilityLabel={`${stepLabel(s.step)}, ${left} left`}>
      <View style={styles.row}>
        <Text style={[styles.step, { color: s.step.kind === 'run' || s.step.kind === 'recover' ? stepColor(s.step.kind, c) : c.text }]}>
          {stepLabel(s.step)}
        </Text>
        <Text style={[styles.count, { color: c.muted }]}>
          Step {s.index + 1} of {s.total}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={[styles.left, { color: c.text }]}>
          {left}
          <Text style={[styles.leftUnit, { color: c.muted }]}> left</Text>
        </Text>
        {s.step.pace && (
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>Target {formatPaceRange(s.step.pace, units)}</Text>
            {advice && <Text style={[styles.advice, { color: c[ADVICE[advice].key] }]}>{ADVICE[advice].text}</Text>}
          </View>
        )}
      </View>
      <ProgressBar value={s.progress} color={stepColor(s.step.kind, c)} />
      {s.next && (
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Next: {stepLabel(s.next)} · {formatTarget(s.next.target)}
        </Text>
      )}
    </View>
  );
}

/** Before Start: which workout is about to be run. */
export function WorkoutPreview({ workout }: { workout: RecorderWorkout }) {
  const c = useColors();
  const first = workout.steps[0];
  return (
    <View style={[styles.panel, { backgroundColor: c.accentSoft }]}>
      <Text style={[styles.step, { color: c.text }]}>{workout.name}</Text>
      <Text style={{ color: c.muted }}>
        {workout.steps.length} step{workout.steps.length === 1 ? '' : 's'} · starts with {stepLabel(first).toLowerCase()}, {formatTarget(first.target)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { borderRadius: 16, padding: 12, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  step: { fontSize: 18, fontWeight: '800' },
  count: { fontSize: 13, fontWeight: '600' },
  left: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  leftUnit: { fontSize: 14, fontWeight: '600' },
  advice: { fontSize: 14, fontWeight: '800' },
});
