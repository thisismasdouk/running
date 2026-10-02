import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { distanceUnit, formatDistanceValue, formatDuration, formatElevation, formatPaceValue, paceUnit } from '@/lib/format';
import { runTypeLabel, runTypeOf } from '@/lib/runs';
import { paceSecPerKm } from '@/lib/stats';
import type { Run, Units } from '@/lib/types';
import { RouteShape } from './RouteShape';
import { ACCENT } from './theme';

export type CardStyle = 'orange' | 'dark' | 'light';

export const CARD_STYLES: { key: CardStyle; label: string }[] = [
  { key: 'orange', label: 'Orange' },
  { key: 'dark', label: 'Dark' },
  { key: 'light', label: 'Light' },
];

const PALETTES: Record<CardStyle, { bg: string; fg: string; muted: string; line: string; routeBg: string }> = {
  orange: { bg: ACCENT, fg: '#FFFFFF', muted: 'rgba(255,255,255,0.75)', line: '#FFFFFF', routeBg: 'rgba(255,255,255,0.14)' },
  dark: { bg: '#111114', fg: '#FFFFFF', muted: '#A1A1AA', line: ACCENT, routeBg: '#1E1E23' },
  light: { bg: '#FFFFFF', fg: '#18181B', muted: '#71717A', line: ACCENT, routeBg: '#FFF1EA' },
};

/** Card size in points; exported as a 1080 × 1350 (4:5) image. */
export const CARD_W = 320;
export const CARD_H = 400;

type Props = { run: Run; units: Units; variant: CardStyle };

/** The image shared to social apps: route, headline stats and the app's name. */
export const ShareCard = forwardRef<View, Props>(function ShareCard({ run, units, variant }, ref) {
  const p = PALETTES[variant];
  const hasRoute = run.segments.some((s) => s.length > 1);
  const date = new Date(run.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const stat = (label: string, value: string, unit?: string) => (
    <View style={{ flex: 1 }}>
      <Text style={[styles.statLabel, { color: p.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: p.fg }]}>
        {value}
        {unit ? <Text style={[styles.statUnit, { color: p.muted }]}> {unit}</Text> : null}
      </Text>
    </View>
  );

  return (
    // collapsable={false} keeps the view in the native tree so it can be captured on Android.
    <View ref={ref} collapsable={false} style={[styles.card, { backgroundColor: p.bg }]}>
      <View>
        <Text style={[styles.title, { color: p.fg }]} numberOfLines={1}>
          {run.title}
        </Text>
        <Text style={[styles.date, { color: p.muted }]}>
          {date} · {runTypeLabel(runTypeOf(run))}
        </Text>
      </View>

      <View style={[styles.route, { backgroundColor: p.routeBg }]}>
        {hasRoute ? (
          <RouteShape segments={run.segments} width={CARD_W - 40} height={160} strokeWidth={4} padding={18} color={p.line} background="transparent" />
        ) : (
          <Text style={{ color: p.muted, fontWeight: '600' }}>No GPS route</Text>
        )}
      </View>

      <View style={styles.big}>
        <Text style={[styles.bigValue, { color: p.fg }]}>{formatDistanceValue(run.distanceM, units)}</Text>
        <Text style={[styles.bigUnit, { color: p.muted }]}>{distanceUnit(units)}</Text>
      </View>
      <View style={styles.row}>
        {stat('Pace', formatPaceValue(paceSecPerKm(run.distanceM, run.movingMs), units), paceUnit(units))}
        {stat('Time', formatDuration(run.movingMs))}
        {stat('Elev', formatElevation(run.elevationGainM, units))}
      </View>

      <Text style={[styles.brand, { color: p.fg }]}>PACEBOOK</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  card: { width: CARD_W, height: CARD_H, padding: 20, justifyContent: 'space-between', overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '800' },
  date: { fontSize: 13, fontWeight: '600', marginTop: 2 },
  route: { height: 160, borderRadius: 16, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  bigValue: { fontSize: 50, fontWeight: '900', fontVariant: ['tabular-nums'], letterSpacing: -1 },
  bigUnit: { fontSize: 22, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8 },
  statLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  statValue: { fontSize: 18, fontWeight: '800', fontVariant: ['tabular-nums'] },
  statUnit: { fontSize: 12, fontWeight: '600' },
  brand: { fontSize: 13, fontWeight: '900', letterSpacing: 3, textAlign: 'right' },
});
