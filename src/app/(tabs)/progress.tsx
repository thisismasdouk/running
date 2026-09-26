import { Link } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { WeeklyBars } from '@/components/charts';
import { useColors } from '@/components/theme';
import { Card, Empty, SectionTitle, Stat } from '@/components/ui';
import { distanceUnit, formatDate, formatDistanceValue, formatDuration, formatElevation, formatPace } from '@/lib/format';
import { BEST_EFFORTS, paceSecPerKm, personalRecords, totals, weeklySummaries, weekStreak } from '@/lib/stats';
import { useProfile, useRuns } from '@/store';

type Range = 'month' | 'year' | 'all';
const RANGES: { key: Range; label: string }[] = [
  { key: 'month', label: 'This month' },
  { key: 'year', label: 'This year' },
  { key: 'all', label: 'All time' },
];

function rangeStart(range: Range): number {
  const d = new Date();
  if (range === 'all') return 0;
  return range === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1).getTime() : new Date(d.getFullYear(), 0, 1).getTime();
}

export default function Progress() {
  const c = useColors();
  const runs = useRuns();
  const { units } = useProfile();
  const [range, setRange] = useState<Range>('month');

  const weeks = useMemo(() => weeklySummaries(runs, 12), [runs]);
  const prs = useMemo(() => personalRecords(runs), [runs]);
  const streak = useMemo(() => weekStreak(runs), [runs]);
  const t = useMemo(() => {
    const from = rangeStart(range);
    return totals(runs.filter((r) => r.startedAt >= from));
  }, [runs, range]);

  if (runs.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, justifyContent: 'center' }}>
        <Empty title="Nothing to chart yet" body="Your weekly mileage, totals and personal records will appear after your first run." />
      </View>
    );
  }

  const avgWeek = weeks.reduce((s, w) => s + w.distanceM, 0) / weeks.length;

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Card style={{ gap: 12 }}>
        <View style={styles.row}>
          <Text style={[styles.cardTitle, { color: c.text }]}>Last 12 weeks</Text>
          {streak > 0 && <Text style={{ color: c.accent, fontWeight: '700' }}>🔥 {streak} wk streak</Text>}
        </View>
        <WeeklyBars weeks={weeks} units={units} />
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Averaging {formatDistanceValue(avgWeek, units, 1)} {distanceUnit(units)} per week
        </Text>
      </Card>

      <View style={[styles.segmented, { backgroundColor: c.track }]}>
        {RANGES.map((r) => (
          <Pressable
            key={r.key}
            onPress={() => setRange(r.key)}
            style={[styles.segment, range === r.key && { backgroundColor: c.card }]}
          >
            <Text style={{ color: range === r.key ? c.text : c.muted, fontWeight: '700', fontSize: 13 }}>{r.label}</Text>
          </Pressable>
        ))}
      </View>

      <Card style={styles.grid}>
        <View style={styles.cell}>
          <Stat label="Runs" value={String(t.runs)} size="lg" />
        </View>
        <View style={styles.cell}>
          <Stat label="Distance" value={formatDistanceValue(t.distanceM, units, 1)} unit={distanceUnit(units)} size="lg" />
        </View>
        <View style={styles.cell}>
          <Stat label="Time" value={formatDuration(t.movingMs)} size="lg" />
        </View>
        <View style={styles.cell}>
          <Stat label="Avg pace" value={formatPace(paceSecPerKm(t.distanceM, t.movingMs), units)} size="md" />
        </View>
        <View style={styles.cell}>
          <Stat label="Elevation" value={formatElevation(t.elevationGainM, units)} />
        </View>
        <View style={styles.cell}>
          <Stat label="Longest run" value={formatDistanceValue(t.longestM, units)} unit={distanceUnit(units)} />
        </View>
      </Card>

      <SectionTitle>Personal records</SectionTitle>
      <Card style={{ gap: 4 }}>
        {BEST_EFFORTS.map((e) => {
          const pr = prs.find((p) => p.key === e.key);
          const row = (
            <View style={[styles.prRow, { borderBottomColor: c.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.prLabel, { color: c.text }]}>{e.label}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {pr ? `${formatDate(pr.date)} · ${formatPace(pr.ms / e.metres, units)}` : 'Not yet — go get it!'}
                </Text>
              </View>
              <Text style={[styles.prTime, { color: pr ? c.accent : c.muted }]}>{pr ? formatDuration(pr.ms) : '—'}</Text>
            </View>
          );
          return pr ? (
            <Link key={e.key} href={`/run/${pr.runId}`} asChild>
              <Pressable>{row}</Pressable>
            </Link>
          ) : (
            <View key={e.key}>{row}</View>
          );
        })}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { fontSize: 18, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 16 },
  cell: { width: '50%' },
  prRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  prLabel: { fontSize: 16, fontWeight: '700' },
  prTime: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
});
