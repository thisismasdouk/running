import { Link, router } from 'expo-router';
import { useMemo } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { RunCard } from '@/components/RunCard';
import { useColors } from '@/components/theme';
import { Button, Card, Empty, Stat } from '@/components/ui';
import { distanceUnit, formatDistanceValue, formatDuration } from '@/lib/format';
import { useRecorder } from '@/lib/recorder';
import { personalRecords, weeklySummaries, weekStreak } from '@/lib/stats';
import { useProfile, useRuns } from '@/store';

export default function Home() {
  const c = useColors();
  const runs = useRuns();
  const profile = useProfile();
  const rec = useRecorder();
  const units = profile.units;

  const week = useMemo(() => weeklySummaries(runs, 1)[0], [runs]);
  const streak = useMemo(() => weekStreak(runs), [runs]);
  const prCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const pr of personalRecords(runs)) m.set(pr.runId, (m.get(pr.runId) ?? 0) + 1);
    return m;
  }, [runs]);
  const goalPct = Math.min(1, week.distanceM / Math.max(profile.weeklyGoalM, 1));

  const header = (
    <View style={{ gap: 12, marginBottom: 12 }}>
      {rec.status !== 'idle' && (
        <Link href="/record" asChild>
          <Pressable style={[styles.banner, { backgroundColor: c.accent }]}>
            <Text style={styles.bannerText}>
              {rec.status === 'paused' ? '⏸ Run paused' : '● Recording'} · {formatDistanceValue(rec.distanceM, units)}{' '}
              {distanceUnit(units)} — tap to return
            </Text>
          </Pressable>
        </Link>
      )}
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
    </View>
  );

  return (
    <FlatList
      style={{ backgroundColor: c.bg }}
      contentContainerStyle={styles.list}
      data={runs}
      keyExtractor={(r) => r.id}
      ListHeaderComponent={header}
      ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
      renderItem={({ item }) => <RunCard run={item} units={units} prCount={prCounts.get(item.id) ?? 0} />}
      ListEmptyComponent={
        <Empty title="No runs yet" body="Lace up and record your first run. Your activities, splits and records will show up here.">
          <Button title="Start a run" onPress={() => router.push('/record')} style={{ marginTop: 12 }} />
        </Empty>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: 16, paddingBottom: 32 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  banner: { borderRadius: 12, padding: 12 },
  bannerText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});
