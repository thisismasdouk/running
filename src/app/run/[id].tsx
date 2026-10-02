import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ElevationChart, LapsTable, PaceChart, SplitsTable } from '@/components/charts';
import { RouteMap } from '@/components/RouteMap';
import { RunTypeBadge } from '@/components/RunTypeBadge';
import { useColors } from '@/components/theme';
import { Card, Empty, SectionTitle, Stat } from '@/components/ui';
import { WorkoutResults } from '@/components/WorkoutSteps';
import { confirm } from '@/lib/confirm';
import { distanceUnit, formatDateTime, formatDistanceValue, formatDuration, formatElevation, formatPace, formatPaceValue, paceUnit } from '@/lib/format';
import { progressSeries } from '@/lib/geo';
import { goBack } from '@/lib/nav';
import { paceSeries } from '@/lib/pace';
import { runTypeOf } from '@/lib/runs';
import { BEST_EFFORTS, computeSplits, paceSecPerKm, prsSetBy } from '@/lib/stats';
import { deleteRun, useProfile, useRun, useRuns, useShoes } from '@/store';

export default function RunDetail() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useRun(id);
  const runs = useRuns();
  const { units } = useProfile();

  const splits = useMemo(() => (run ? computeSplits(run.segments, units) : []), [run, units]);
  const samples = useMemo(() => (run ? progressSeries(run.segments) : []), [run]);
  const pace = useMemo(() => paceSeries(samples), [samples]);
  const shoes = useShoes();
  const prs = useMemo(() => (run ? new Set(prsSetBy(run, runs)) : new Set<string>()), [run, runs]);

  if (!run) {
    return <Empty title="Run not found" body="It may have been deleted." />;
  }

  const remove = async () => {
    if (!(await confirm('Delete run?', `"${run.title}" will be permanently deleted.`, 'Delete', true))) return;
    deleteRun(run.id);
    goBack();
  };

  const efforts = BEST_EFFORTS.filter((e) => run.bestEfforts[e.key] != null);
  const hasRoute = run.segments.some((s) => s.length > 1);
  const shoe = run.shoeId ? shoes.find((s) => s.id === run.shoeId) : undefined;
  const avgPace = paceSecPerKm(run.distanceM, run.movingMs);

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={{ paddingBottom: 48 }}>
      <Stack.Screen
        options={{
          title: run.title,
          headerRight: () => (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Pressable accessibilityLabel="Share run" onPress={() => router.push(`/share/${run.id}`)} hitSlop={8}>
                <Ionicons name="share-outline" size={22} color={c.accent} />
              </Pressable>
              <Pressable accessibilityLabel="Edit run" onPress={() => router.push(`/edit/${run.id}`)} hitSlop={8}>
                <Ionicons name="create-outline" size={22} color={c.accent} />
              </Pressable>
              <Pressable accessibilityLabel="Delete run" onPress={remove} hitSlop={8}>
                <Ionicons name="trash-outline" size={22} color={c.danger} />
              </Pressable>
            </View>
          ),
        }}
      />
      {hasRoute && <RouteMap segments={run.segments} style={styles.map} />}

      <View style={styles.body}>
        <View style={{ gap: 4 }}>
          <Text style={[styles.title, { color: c.text }]}>{run.title}</Text>
          <View style={styles.meta}>
            <RunTypeBadge type={runTypeOf(run)} />
            <Text style={{ color: c.muted }}>{formatDateTime(run.startedAt)}</Text>
          </View>
          {run.workoutName && (
            <View style={styles.meta}>
              <Ionicons name="barbell-outline" size={14} color={c.muted} />
              <Text style={{ color: c.muted }}>Workout: {run.workoutName}</Text>
            </View>
          )}
          {shoe && (
            <View style={styles.meta}>
              <Ionicons name="footsteps-outline" size={14} color={c.muted} />
              <Text style={{ color: c.muted }}>{shoe.name}</Text>
            </View>
          )}
          {run.simulated && <Text style={{ color: c.muted, fontWeight: '700' }}>Recorded with simulated GPS (demo)</Text>}
          {run.notes ? <Text style={[styles.notes, { color: c.text }]}>{run.notes}</Text> : null}
        </View>

        <Card style={styles.grid}>
          <View style={styles.cell}>
            <Stat label="Distance" value={formatDistanceValue(run.distanceM, units)} unit={distanceUnit(units)} size="lg" />
          </View>
          <View style={styles.cell}>
            <Stat label="Avg pace" value={formatPaceValue(avgPace, units)} unit={paceUnit(units)} size="lg" />
          </View>
          <View style={styles.cell}>
            <Stat label="Moving time" value={formatDuration(run.movingMs)} size="lg" />
          </View>
          <View style={styles.cell}>
            <Stat label="Elevation gain" value={formatElevation(run.elevationGainM, units)} size="lg" />
          </View>
          <View style={styles.cell}>
            <Stat label="Elapsed time" value={formatDuration(run.elapsedMs)} />
          </View>
          <View style={styles.cell}>
            <Stat label="Effort" value={run.effort ? `${run.effort}/10` : '—'} />
          </View>
        </Card>

        {splits.length > 0 && (
          <>
            <SectionTitle>Splits</SectionTitle>
            <Card>
              <SplitsTable splits={splits} units={units} />
            </Card>
          </>
        )}

        {pace.length > 1 && (
          <>
            <SectionTitle>Pace</SectionTitle>
            <Card>
              <PaceChart series={pace} avgPace={avgPace} units={units} />
            </Card>
          </>
        )}

        {run.workoutSteps && run.workoutSteps.length > 0 && (
          <>
            <SectionTitle>Workout</SectionTitle>
            <Card>
              <WorkoutResults steps={run.workoutSteps} laps={run.laps ?? []} units={units} />
            </Card>
          </>
        )}

        {!run.workoutSteps?.length && run.laps && run.laps.length > 0 && (
          <>
            <SectionTitle>Laps</SectionTitle>
            <Card>
              <LapsTable laps={run.laps} units={units} />
            </Card>
          </>
        )}

        {samples.some((s) => s.alt != null) && (
          <>
            <SectionTitle>Elevation</SectionTitle>
            <Card>
              <ElevationChart samples={samples} />
            </Card>
          </>
        )}

        {efforts.length > 0 && (
          <>
            <SectionTitle>Best efforts</SectionTitle>
            <Card style={{ gap: 10 }}>
              {efforts.map((e) => {
                const ms = run.bestEfforts[e.key]!;
                return (
                  <View key={e.key} style={styles.effortRow}>
                    <Text style={[styles.effortLabel, { color: c.text }]}>
                      {prs.has(e.key) ? '🏆 ' : ''}
                      {e.label}
                    </Text>
                    <Text style={{ color: c.muted, fontVariant: ['tabular-nums'] }}>{formatPace(ms / e.metres, units)}</Text>
                    <Text style={[styles.effortTime, { color: prs.has(e.key) ? c.accent : c.text }]}>{formatDuration(ms)}</Text>
                  </View>
                );
              })}
            </Card>
          </>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  map: { height: 280 },
  body: { padding: 16, gap: 12 },
  title: { fontSize: 26, fontWeight: '800' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notes: { fontSize: 15, lineHeight: 21, marginTop: 6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  cell: { width: '50%' },
  effortRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  effortLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  effortTime: { width: 72, textAlign: 'right', fontWeight: '700', fontVariant: ['tabular-nums'] },
});
