import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, ScrollView, StyleSheet, Text, View } from 'react-native';

import { RecordingBanner } from '@/components/RecordingBanner';
import { RunCard } from '@/components/RunCard';
import { RUN_TYPE_COLORS } from '@/components/RunTypeBadge';
import { useColors } from '@/components/theme';
import { Button, Card, Chip, Empty, Stat } from '@/components/ui';
import { distanceUnit, formatDistanceValue, formatDuration } from '@/lib/format';
import { RUN_TYPES, runTypeLabel, runTypeOf } from '@/lib/runs';
import { personalRecords, weeklySummaries, weekStreak } from '@/lib/stats';
import type { Run, RunType } from '@/lib/types';
import { useProfile, useRuns } from '@/store';

const Separator = () => <View style={{ height: 12 }} />;

export default function Home() {
  const c = useColors();
  const runs = useRuns();
  const profile = useProfile();
  const units = profile.units;
  const [filter, setFilter] = useState<RunType | null>(null);
  const shown = useMemo(() => (filter ? runs.filter((r) => runTypeOf(r) === filter) : runs), [runs, filter]);

  const week = useMemo(() => weeklySummaries(runs, 1)[0], [runs]);
  const streak = useMemo(() => weekStreak(runs), [runs]);
  const prCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const pr of personalRecords(runs)) m.set(pr.runId, (m.get(pr.runId) ?? 0) + 1);
    return m;
  }, [runs]);
  const goalPct = Math.min(1, week.distanceM / Math.max(profile.weeklyGoalM, 1));
  const renderItem = useCallback(
    ({ item }: { item: Run }) => <RunCard run={item} units={units} prCount={prCounts.get(item.id) ?? 0} />,
    [units, prCounts],
  );

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      <RecordingBanner units={units} />
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={[styles.cardTitle, { color: c.text }]}>This week</Text>
          {streak > 0 && <Text style={{ color: c.accent, fontWeight: '700' }}>🔥 {streak}-week streak</Text>}
        </View>
        <View style={styles.row}>
          <Stat label="Distance" value={formatDistanceValue(week.distanceM, units, 1)} unit={distanceUnit(units)} size="lg" />
          <Stat label="Runs" value={String(week.runs)} size="lg" />
          <Stat label="Time" value={formatDuration(week.movingMs)} size="lg" />
        </View>
        <View>
          <View style={[styles.track, { backgroundColor: c.track }]}>
            <View style={[styles.fill, { width: `${goalPct * 100}%`, backgroundColor: c.accent }]} />
          </View>
          <Text style={{ color: c.muted, marginTop: 6, fontSize: 13 }}>
            {goalPct >= 1
              ? `Weekly goal of ${formatDistanceValue(profile.weeklyGoalM, units, 0)} ${distanceUnit(units)} smashed! 🎉`
              : `${formatDistanceValue(Math.max(0, profile.weeklyGoalM - week.distanceM), units, 1)} ${distanceUnit(units)} to your weekly goal`}
          </Text>
        </View>
      </Card>
      {runs.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="All" selected={filter == null} onPress={() => setFilter(null)} />
          {RUN_TYPES.map((t) => (
            <Chip
              key={t.key}
              label={t.label}
              selected={filter === t.key}
              color={RUN_TYPE_COLORS[t.key]}
              onPress={() => setFilter(filter === t.key ? null : t.key)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.list}
      data={shown}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={Separator}
      renderItem={renderItem}
      ListEmptyComponent={
        filter ? (
          <Empty title={`No ${runTypeLabel(filter).toLowerCase()} runs`} body="Set a run's type when you save or edit it.">
            <Button title="Show all runs" onPress={() => setFilter(null)} variant="secondary" style={{ marginTop: 12 }} />
          </Empty>
        ) : (
          <Empty title="No runs yet" body="Lace up and record your first run. Your activities, splits and records will show up here.">
            <Button title="Start a run" onPress={() => router.push('/record')} style={{ marginTop: 12 }} />
          </Empty>
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  chips: { gap: 8, paddingVertical: 2 },
  fill: { height: 8, borderRadius: 4 },
});
