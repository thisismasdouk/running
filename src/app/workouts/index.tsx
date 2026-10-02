import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RunTypeBadge } from '@/components/RunTypeBadge';
import { useColors } from '@/components/theme';
import { Button, Card, SectionTitle } from '@/components/ui';
import { estimateText } from '@/components/WorkoutSteps';
import type { Workout } from '@/lib/types';
import { LIBRARY, workoutSummary } from '@/lib/workouts';
import { useProfile, useWorkouts } from '@/store';

export default function Workouts() {
  const c = useColors();
  const custom = useWorkouts();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="New workout" onPress={() => router.push('/workouts/build')} hitSlop={8}>
              <Ionicons name="add" size={26} color={c.accent} />
            </Pressable>
          ),
        }}
      />
      <SectionTitle>Your workouts</SectionTitle>
      {custom.length > 0 ? (
        custom.map((w) => <WorkoutRow key={w.id} workout={w} />)
      ) : (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.muted, lineHeight: 20 }}>
            Build your own: a warm-up, a set of repeats with recovery, and a cool-down. Pacebook talks you through each step.
          </Text>
          <Button title="New workout" onPress={() => router.push('/workouts/build')} variant="secondary" />
        </Card>
      )}
      <SectionTitle>Library</SectionTitle>
      {LIBRARY.map((w) => (
        <WorkoutRow key={w.id} workout={w} />
      ))}
    </ScrollView>
  );
}

function WorkoutRow({ workout }: { workout: Workout }) {
  const c = useColors();
  const { units } = useProfile();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: workout.id } })}>
      {({ pressed }) => (
        <Card style={{ gap: 6, opacity: pressed ? 0.8 : 1 }}>
          <View style={styles.head}>
            <Text style={[styles.name, { color: c.text }]} numberOfLines={1}>
              {workout.name}
            </Text>
            <RunTypeBadge type={workout.runType} />
          </View>
          <Text style={{ color: c.muted }}>{workoutSummary(workout)}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>{estimateText(workout, units)}</Text>
        </Card>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { flex: 1, fontSize: 17, fontWeight: '700' },
});
