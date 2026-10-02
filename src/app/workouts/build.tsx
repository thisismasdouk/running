import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useColors } from '@/components/theme';
import { Button, Card, Chip } from '@/components/ui';
import { estimateText } from '@/components/WorkoutSteps';
import { confirm } from '@/lib/confirm';
import { formatPaceValue, paceUnit } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { resolveWorkout } from '@/lib/plans';
import { METRES_PER_MILE } from '@/lib/stats';
import type { StepTarget } from '@/lib/types';
import { buildWorkout, formatTarget, NEW_WORKOUT, stepTarget, toSimpleForm, workoutSummary, type SimpleWorkout } from '@/lib/workouts';
import { deleteWorkout, newWorkoutId, saveWorkout, useActivePlan, useProfile, useWorkouts } from '@/store';

const WARMUP_OPTIONS = [0, 5, 10, 15];
const MAX_REPEATS = 20;
/** Defaults when switching a step between distance and time. */
const DEFAULT_TARGET: Record<StepTarget['type'], StepTarget> = {
  distance: { type: 'distance', metres: 400 },
  time: { type: 'time', seconds: 180 },
};
const DEFAULT_PACE = { min: 300, max: 315 };

export default function BuildWorkout() {
  const { id, from } = useLocalSearchParams<{ id?: string; from?: string }>();
  const custom = useWorkouts();
  const active = useActivePlan();
  // Editing one of your own, customising a copy of another, or starting fresh.
  const editing = id ? custom.find((w) => w.id === id) : undefined;
  const source = editing ?? (from ? resolveWorkout(from, custom, active) : undefined);
  const base = source ? toSimpleForm(source) : null;
  const initial: SimpleWorkout = base ? { ...base, name: editing ? base.name : `${base.name} (custom)` } : NEW_WORKOUT;
  // Keyed so the form starts from the workout it edits.
  return <Builder key={editing?.id ?? from ?? 'new'} initial={initial} editingId={editing?.id} createdAt={editing?.createdAt} />;
}

function Builder({ initial, editingId, createdAt }: { initial: SimpleWorkout; editingId?: string; createdAt?: number }) {
  const c = useColors();
  const { units } = useProfile();
  const [f, setF] = useState<SimpleWorkout>(initial);
  const set = (patch: Partial<SimpleWorkout>) => setF((prev) => ({ ...prev, ...patch }));
  const preview = buildWorkout(f, editingId ?? 'preview', createdAt);

  const save = () => {
    const w = buildWorkout(f, editingId ?? newWorkoutId(), createdAt ?? Date.now());
    saveWorkout(w);
    if (editingId) goBack(`/workouts/${w.id}`);
    else router.replace({ pathname: '/workouts/[id]', params: { id: w.id } });
  };

  const remove = async () => {
    if (!editingId || !(await confirm('Delete workout?', 'Runs you did with it keep their results.', 'Delete', true))) return;
    deleteWorkout(editingId);
    router.dismissTo('/workouts');
  };

  // Pace is stored per km but stepped in 5 s of the runner's own unit.
  const paceStep = units === 'metric' ? 5 : 5 / (METRES_PER_MILE / 1000);
  const nudgePace = (end: 'min' | 'max', dir: 1 | -1) => {
    const pace = f.workPace ?? DEFAULT_PACE;
    const v = Math.max(120, Math.min(900, pace[end] + dir * paceStep));
    // Keep the band the right way round.
    const next = end === 'min' ? { min: v, max: Math.max(v, pace.max) } : { min: Math.min(v, pace.min), max: v };
    set({ workPace: next });
  };

  const input = [styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: editingId ? 'Edit Workout' : 'New Workout' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: c.muted }]}>Name</Text>
        <TextInput value={f.name} onChangeText={(name) => set({ name })} style={input} placeholder={preview.name} placeholderTextColor={c.muted} />

        <Text style={[styles.label, { color: c.muted }]}>Warm-up</Text>
        <MinutesChips value={f.warmupMin} onChange={(warmupMin) => set({ warmupMin })} />

        <Text style={[styles.label, { color: c.muted }]}>Main set</Text>
        <Card style={{ gap: 16 }}>
          <Row label="Repeats">
            <Stepper value={`${f.repeats} ×`} onMinus={() => set({ repeats: Math.max(1, f.repeats - 1) })} onPlus={() => set({ repeats: Math.min(MAX_REPEATS, f.repeats + 1) })} />
          </Row>
          <TargetEditor label="Run" value={f.work} onChange={(work) => set({ work })} />
          <Row label="Target pace">
            <Switch
              value={!!f.workPace}
              onValueChange={(on) => set({ workPace: on ? DEFAULT_PACE : undefined })}
              trackColor={{ true: c.accent }}
              accessibilityLabel="Target pace"
            />
          </Row>
          {f.workPace && (
            <>
              <Row label={`Fastest ${paceUnit(units)}`}>
                <Stepper value={formatPaceValue(f.workPace.min, units)} onMinus={() => nudgePace('min', -1)} onPlus={() => nudgePace('min', 1)} />
              </Row>
              <Row label={`Slowest ${paceUnit(units)}`}>
                <Stepper value={formatPaceValue(f.workPace.max, units)} onMinus={() => nudgePace('max', -1)} onPlus={() => nudgePace('max', 1)} />
              </Row>
            </>
          )}
          {f.repeats > 1 && (
            <>
              <View style={styles.chips}>
                <Text style={[styles.rowLabel, { color: c.text, marginRight: 4 }]}>Recover</Text>
                <Chip label="None" selected={!f.recover} onPress={() => set({ recover: null })} />
                <Chip label="Time" selected={f.recover?.type === 'time'} onPress={() => set({ recover: { type: 'time', seconds: 90 } })} />
                <Chip label="Distance" selected={f.recover?.type === 'distance'} onPress={() => set({ recover: { type: 'distance', metres: 200 } })} />
              </View>
              {f.recover && (
                <Row label="">
                  <Stepper
                    value={formatTarget(f.recover)}
                    onMinus={() => set({ recover: stepTarget(f.recover!, -1) })}
                    onPlus={() => set({ recover: stepTarget(f.recover!, 1) })}
                  />
                </Row>
              )}
            </>
          )}
        </Card>

        <Text style={[styles.label, { color: c.muted }]}>Cool-down</Text>
        <MinutesChips value={f.cooldownMin} onChange={(cooldownMin) => set({ cooldownMin })} />

        <Card style={{ gap: 4, marginTop: 20 }}>
          <Text style={{ color: c.text, fontWeight: '700' }}>{workoutSummary(preview)}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{estimateText(preview, units)}</Text>
        </Card>

        <Button title={editingId ? 'Save changes' : 'Save workout'} onPress={save} style={{ marginTop: 20 }} />
        {editingId && <Button title="Delete workout" onPress={remove} variant="secondary" style={{ marginTop: 12 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function MinutesChips({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // Keep an unusual stored value (from a copied workout) selectable.
  const options = WARMUP_OPTIONS.includes(value) ? WARMUP_OPTIONS : [...WARMUP_OPTIONS, value].sort((a, b) => a - b);
  return (
    <View style={styles.chips}>
      {options.map((m) => (
        <Chip key={m} label={m === 0 ? 'None' : `${m} min`} selected={value === m} onPress={() => onChange(m)} />
      ))}
    </View>
  );
}

function TargetEditor({ label, value, onChange }: { label: string; value: StepTarget; onChange: (t: StepTarget) => void }) {
  const c = useColors();
  return (
    <View style={{ gap: 10 }}>
      <View style={styles.chips}>
        <Text style={[styles.rowLabel, { color: c.text, marginRight: 4 }]}>{label}</Text>
        <Chip label="Distance" selected={value.type === 'distance'} onPress={() => value.type !== 'distance' && onChange(DEFAULT_TARGET.distance)} />
        <Chip label="Time" selected={value.type === 'time'} onPress={() => value.type !== 'time' && onChange(DEFAULT_TARGET.time)} />
      </View>
      <Row label="">
        <Stepper value={formatTarget(value)} onMinus={() => onChange(stepTarget(value, -1))} onPlus={() => onChange(stepTarget(value, 1))} />
      </Row>
    </View>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
      {children}
    </View>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  const c = useColors();
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} style={[styles.stepBtn, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel="Less">
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>−</Text>
      </Pressable>
      <Text style={[styles.value, { color: c.text }]}>{value}</Text>
      <Pressable onPress={onPlus} style={[styles.stepBtn, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel="More">
        <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 16, fontWeight: '700', minWidth: 80, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
