import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RunTypeBadge } from '@/components/RunTypeBadge';
import { useColors } from '@/components/theme';
import { Button, Card, Empty, SectionTitle } from '@/components/ui';
import { estimateText, WorkoutSteps } from '@/components/WorkoutSteps';
import { confirm } from '@/lib/confirm';
import { formatShortDate } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { getPlan, planSchedule, resolveWorkout } from '@/lib/plans';
import { useRecorder } from '@/lib/recorder';
import { toSimpleForm, workoutSummary } from '@/lib/workouts';
import { deleteWorkout, setSessionStatus, useActivePlan, useProfile, useWorkouts } from '@/store';

export default function WorkoutDetail() {
  const c = useColors();
  const { id, session } = useLocalSearchParams<{ id: string; session?: string }>();
  const custom = useWorkouts();
  const active = useActivePlan();
  const rec = useRecorder();
  const { units } = useProfile();
  const workout = resolveWorkout(id, custom, active);
  // The plan session this was opened from, if any.
  const scheduled = useMemo(() => {
    const plan = getPlan(active?.planId);
    return session && active && plan ? planSchedule(plan, active).find((s) => s.key === session) : undefined;
  }, [active, session]);

  if (!workout) {
    return (
      <>
        <Stack.Screen options={{ title: 'Workout' }} />
        <Empty title="Workout not found" body="It may have been deleted, or the plan it belonged to was left." />
      </>
    );
  }

  const own = custom.some((w) => w.id === workout.id);
  const busy = rec.status !== 'idle';

  const start = () =>
    router.push({ pathname: '/record', params: { workout: workout.id, ...(scheduled ? { session: scheduled.key } : {}) } });

  const remove = async () => {
    if (!(await confirm('Delete workout?', `"${workout.name}" will be deleted. Runs you did with it keep their results.`, 'Delete', true))) return;
    deleteWorkout(workout.id);
    goBack('/workouts');
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: workout.name,
          headerRight: own
            ? () => (
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <Pressable
                    accessibilityLabel="Edit workout"
                    onPress={() => router.push({ pathname: '/workouts/build', params: { id: workout.id } })}
                    hitSlop={8}
                  >
                    <Ionicons name="create-outline" size={22} color={c.accent} />
                  </Pressable>
                  <Pressable accessibilityLabel="Delete workout" onPress={remove} hitSlop={8}>
                    <Ionicons name="trash-outline" size={22} color={c.danger} />
                  </Pressable>
                </View>
              )
            : undefined,
        }}
      />

      <View style={{ gap: 6 }}>
        <Text style={[styles.title, { color: c.text }]}>{workout.name}</Text>
        <RunTypeBadge type={workout.runType} />
        {workout.description ? <Text style={{ color: c.muted, lineHeight: 20 }}>{workout.description}</Text> : null}
        <Text style={{ color: c.text, fontWeight: '600' }}>{workoutSummary(workout)}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{estimateText(workout, units)}</Text>
      </View>

      {scheduled && (
        <Card style={{ gap: 12 }}>
          <View style={styles.row}>
            <Text style={[styles.sessionTitle, { color: c.text }]}>
              Week {scheduled.week} · {formatShortDate(scheduled.date)}
            </Text>
            <Text style={{ color: scheduled.state === 'done' ? c.good : scheduled.state === 'missed' ? c.warn : c.muted, fontWeight: '700' }}>
              {{ done: 'Done ✓', skipped: 'Skipped', missed: 'Missed', today: 'Today', upcoming: 'Coming up' }[scheduled.state]}
            </Text>
          </View>
          {scheduled.state === 'done' || scheduled.state === 'skipped' ? (
            <Button title={scheduled.state === 'done' ? 'Mark as not done' : 'Undo skip'} onPress={() => setSessionStatus(scheduled.key, null)} variant="secondary" />
          ) : (
            <View style={styles.buttons}>
              <Button title="Skip" onPress={() => setSessionStatus(scheduled.key, 'skipped')} variant="secondary" style={{ flex: 1 }} />
              <Button title="Mark as done" onPress={() => setSessionStatus(scheduled.key, 'done')} variant="secondary" style={{ flex: 1 }} />
            </View>
          )}
        </Card>
      )}

      <SectionTitle>Steps</SectionTitle>
      <Card>
        <WorkoutSteps workout={workout} units={units} />
      </Card>

      <Button title="Start workout" onPress={start} disabled={busy} style={{ marginTop: 8 }} />
      {busy && <Text style={[styles.hint, { color: c.muted }]}>Finish the run in progress first.</Text>}
      <Text style={[styles.hint, { color: c.muted }]}>
        Voice cues and a buzz at every step. Lap skips to the next step. Each step is saved as a lap.
      </Text>
      {workout.builtIn && !scheduled && toSimpleForm(workout) && (
        <Button
          title="Customise a copy"
          onPress={() => router.push({ pathname: '/workouts/build', params: { from: workout.id } })}
          variant="secondary"
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sessionTitle: { fontSize: 16, fontWeight: '700' },
  buttons: { flexDirection: 'row', gap: 12 },
  hint: { textAlign: 'center', fontSize: 13, lineHeight: 18 },
});
