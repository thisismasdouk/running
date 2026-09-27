import { Link } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDate, formatDistanceValue, distanceUnit, formatDuration, formatPace } from '@/lib/format';
import { paceSecPerKm } from '@/lib/stats';
import type { Run, Units } from '@/lib/types';
import { FluidRouteShape } from './RouteShape';
import { useColors } from './theme';
import { Card, Stat } from './ui';

export const RunCard = memo(function RunCard({ run, units, prCount }: { run: Run; units: Units; prCount: number }) {
  const c = useColors();
  return (
    <Link href={`/run/${run.id}`} asChild>
      <Pressable>
        <Card style={styles.card}>
          <View style={styles.head}>
            <Text style={[styles.title, { color: c.text }]} numberOfLines={1}>
              {run.title}
            </Text>
            {run.simulated && <Text style={[styles.badge, { color: c.muted }]}>SIMULATED (DEMO)</Text>}
            <Text style={{ color: c.muted, fontSize: 13 }}>{formatDate(run.startedAt)}</Text>
          </View>
          <View style={styles.stats}>
            <Stat label="Distance" value={formatDistanceValue(run.distanceM, units)} unit={distanceUnit(units)} />
            <Stat label="Pace" value={formatPace(paceSecPerKm(run.distanceM, run.movingMs), units)} size="sm" />
            <Stat label="Time" value={formatDuration(run.movingMs)} size="sm" />
          </View>
          {prCount > 0 && (
            <Text style={[styles.pr, { color: c.accent }]}>
              🏆 {prCount} personal record{prCount > 1 ? 's' : ''}
            </Text>
          )}
          {run.segments.some((s) => s.length > 1) && (
            <View style={styles.map}>
              <FluidRouteShape segments={run.segments} height={140} />
            </View>
          )}
        </Card>
      </Pressable>
    </Link>
  );
});

const styles = StyleSheet.create({
  card: { gap: 12 },
  head: { gap: 2 },
  title: { fontSize: 18, fontWeight: '700' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  pr: { fontWeight: '700' },
  badge: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  map: { borderRadius: 12, overflow: 'hidden' },
});
