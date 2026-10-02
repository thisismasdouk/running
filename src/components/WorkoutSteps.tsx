import { StyleSheet, Text, View } from 'react-native';

import { formatDistanceValue, formatDuration, formatPaceRange, formatPaceValue, distanceUnit } from '@/lib/format';
import { paceSecPerKm } from '@/lib/stats';
import type { FlatStep, Lap, StepKind, Units, Workout, WorkoutStep } from '@/lib/types';
import { estimateWorkout, formatTarget, isRepeat, KIND_LABELS, stepLabel } from '@/lib/workouts';
import { useColors, type Colors } from './theme';

/** "About 6.2 km · 45 min". */
export function estimateText(workout: Workout, units: Units): string {
  const est = estimateWorkout(workout);
  const minutes = Math.max(1, Math.round(est.ms / 60_000));
  return `About ${formatDistanceValue(est.distanceM, units, 1)} ${distanceUnit(units)} · ${formatTarget({ type: 'time', seconds: minutes * 60 })}`;
}

/** Work steps stand out; the easy parts are muted. */
export function stepColor(kind: StepKind, c: Colors): string {
  return kind === 'run' ? c.accent : kind === 'recover' ? c.good : c.muted;
}

function StepRow({ step, units, indent }: { step: WorkoutStep; units: Units; indent?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.step, indent && styles.indent]}>
      <View style={[styles.dot, { backgroundColor: stepColor(step.kind, c) }]} />
      <Text style={[styles.stepName, { color: c.text }]}>{KIND_LABELS[step.kind]}</Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.stepTarget, { color: c.text }]}>{formatTarget(step.target)}</Text>
        {step.pace && <Text style={{ color: c.muted, fontSize: 12 }}>{formatPaceRange(step.pace, units)}</Text>}
      </View>
    </View>
  );
}

/** A workout's steps as written, with repeat blocks grouped under "6 ×". */
export function WorkoutSteps({ workout, units }: { workout: Workout; units: Units }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      {workout.items.map((item, i) =>
        isRepeat(item) ? (
          <View key={i} style={[styles.block, { borderColor: c.border }]}>
            <Text style={[styles.repeat, { color: c.accent }]}>{item.repeat} ×</Text>
            {item.steps.map((s, j) => (
              <StepRow key={j} step={s} units={units} indent />
            ))}
          </View>
        ) : (
          <StepRow key={i} step={item} units={units} />
        ),
      )}
    </View>
  );
}

/**
 * Per-step results of a guided run: lap i is step i (the recorder marks a lap
 * at every step boundary). Laps past the last step were run after the workout.
 */
export function WorkoutResults({ steps, laps, units }: { steps: FlatStep[]; laps: Lap[]; units: Units }) {
  const c = useColors();
  const rows = Math.max(steps.length, laps.length);
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.row}>
        <Text style={[styles.head, { color: c.muted, flex: 1 }]}>Step</Text>
        <Text style={[styles.head, styles.num, { color: c.muted }]}>{distanceUnit(units)}</Text>
        <Text style={[styles.head, styles.num, { color: c.muted }]}>Time</Text>
        <Text style={[styles.head, styles.num, { color: c.muted }]}>Pace</Text>
      </View>
      {Array.from({ length: rows }, (_, i) => {
        const step = steps[i];
        const lap = laps[i];
        const muted = !step || step.kind !== 'run';
        return (
          <View key={i} style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cell, { color: muted ? c.muted : c.text, fontWeight: muted ? '400' : '700' }]} numberOfLines={1}>
                {step ? stepLabel(step) : 'After workout'}
              </Text>
              {step && <Text style={{ color: c.muted, fontSize: 11 }}>{formatTarget(step.target)}</Text>}
            </View>
            {lap ? (
              <>
                <Text style={[styles.cell, styles.num, { color: c.text }]}>{formatDistanceValue(lap.distanceM, units)}</Text>
                <Text style={[styles.cell, styles.num, { color: c.text }]}>{formatDuration(lap.movingMs)}</Text>
                <Text style={[styles.cell, styles.num, { color: c.muted }]}>
                  {formatPaceValue(lap.distanceM >= 20 ? paceSecPerKm(lap.distanceM, lap.movingMs) : 0, units)}
                </Text>
              </>
            ) : (
              <Text style={[styles.cell, { color: c.muted, width: 192, textAlign: 'right' }]}>Not run</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  indent: { paddingLeft: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  stepName: { flex: 1, fontSize: 15, fontWeight: '600' },
  stepTarget: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  block: { borderLeftWidth: 3, paddingLeft: 10, gap: 8, paddingVertical: 2 },
  repeat: { fontSize: 13, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center' },
  head: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  num: { width: 64, textAlign: 'right' },
  cell: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
