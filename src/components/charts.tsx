import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';

import { distanceUnit, formatDistanceValue, formatDuration, formatElevation, formatPaceValue, paceUnit } from '@/lib/format';
import type { ProgressSample } from '@/lib/geo';
import { paceRange, type PacePoint } from '@/lib/pace';
import { paceSecPerKm, type WeekSummary } from '@/lib/stats';
import type { Lap, Split, Units } from '@/lib/types';
import { useColors } from './theme';

/** Vertical bars of weekly distance, most recent week highlighted. */
export function WeeklyBars({ weeks, units, height = 120 }: { weeks: WeekSummary[]; units: Units; height?: number }) {
  const c = useColors();
  const max = Math.max(...weeks.map((w) => w.distanceM), 1);
  return (
    <View>
      <View style={[styles.bars, { height }]}>
        {weeks.map((w, i) => {
          const isLast = i === weeks.length - 1;
          return (
            <View key={w.weekStart} style={styles.barCol}>
              {isLast && w.distanceM > 0 && (
                <Text style={[styles.barValue, { color: c.accent }]}>{formatDistanceValue(w.distanceM, units, 1)}</Text>
              )}
              <View
                style={{
                  height: Math.max(3, (w.distanceM / max) * (height - 18)),
                  backgroundColor: isLast ? c.accent : w.distanceM > 0 ? c.muted : c.track,
                  borderRadius: 4,
                  width: '70%',
                  opacity: isLast ? 1 : 0.55,
                }}
              />
            </View>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {weeks.map((w, i) => (
          <Text key={w.weekStart} style={[styles.barLabel, { color: c.muted }]}>
            {(weeks.length - 1 - i) % 3 === 0
              ? new Date(w.weekStart).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
              : ''}
          </Text>
        ))}
      </View>
    </View>
  );
}

/** Table of splits with a bar showing relative speed (longer bar = faster). */
export function SplitsTable({ splits, units }: { splits: Split[]; units: Units }) {
  const c = useColors();
  const paces = splits.map((s) => s.paceSecPerKm).filter((p) => p > 0);
  const fastest = Math.min(...paces);
  const slowest = Math.max(...paces);
  const unit = units === 'metric' ? 'Km' : 'Mi';
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.splitRow}>
        <Text style={[styles.splitHead, { color: c.muted, width: 36 }]}>{unit}</Text>
        <Text style={[styles.splitHead, { color: c.muted, width: 56 }]}>Pace</Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.splitHead, { color: c.muted, width: 56, textAlign: 'right' }]}>Elev</Text>
      </View>
      {splits.map((s) => {
        // Map pace to 40–100% width: the fastest split gets the full bar.
        const t = slowest === fastest ? 1 : (slowest - s.paceSecPerKm) / (slowest - fastest);
        const partial = s.distanceM < (units === 'metric' ? 999 : 1609);
        return (
          <View key={s.index} style={styles.splitRow}>
            <Text style={[styles.splitCell, { color: c.text, width: 36 }]}>
              {partial ? formatDistanceValue(s.distanceM, units, 1) : s.index}
            </Text>
            <Text style={[styles.splitCell, { color: c.text, width: 56 }]}>{formatPaceValue(s.paceSecPerKm, units)}</Text>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <View
                style={{
                  height: 14,
                  borderRadius: 4,
                  width: `${40 + t * 60}%`,
                  backgroundColor: s.paceSecPerKm === fastest && splits.length > 1 ? c.accent : c.muted,
                  opacity: s.paceSecPerKm === fastest && splits.length > 1 ? 1 : 0.45,
                }}
              />
            </View>
            <Text style={[styles.splitCell, { color: c.muted, width: 56, textAlign: 'right' }]}>
              {s.elevationDeltaM >= 0 ? '+' : '−'}
              {formatElevation(Math.abs(s.elevationDeltaM), units)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Filled area chart of altitude against distance. */
export function ElevationChart({ samples, height = 100 }: { samples: ProgressSample[]; height?: number }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const pts = samples.filter((s) => s.alt != null) as { d: number; alt: number }[];
  if (pts.length < 2) return null;
  const maxD = pts[pts.length - 1].d || 1;
  const minA = Math.min(...pts.map((p) => p.alt));
  const maxA = Math.max(...pts.map((p) => p.alt));
  const span = Math.max(maxA - minA, 10);
  const x = (d: number) => (d / maxD) * width;
  const y = (a: number) => height - 4 - ((a - minA) / span) * (height - 8);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.alt).toFixed(1)}`).join('');
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <Path d={`${line}L${width},${height}L0,${height}Z`} fill={c.accent} opacity={0.15} />
          <Path d={line} stroke={c.accent} strokeWidth={2} fill="none" />
        </Svg>
      )}
    </View>
  );
}

/**
 * Smoothed pace against distance. The y axis is inverted so faster running
 * sits higher; a dashed line marks the average pace.
 */
export function PaceChart({ series, avgPace, units, height = 120 }: { series: PacePoint[]; avgPace: number; units: Units; height?: number }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const range = paceRange(series);
  if (!range || series.length < 2) return null;
  const { fast, slow } = range;
  const maxD = series[series.length - 1].d || 1;
  const x = (d: number) => (d / maxD) * width;
  // Paces beyond the slow cap are drawn at the bottom edge.
  const y = (p: number) => 4 + ((Math.min(p, slow) - fast) / (slow - fast)) * (height - 8);
  const line = series.map((p, i) => `${i ? 'L' : 'M'}${x(p.d).toFixed(1)},${y(p.pace).toFixed(1)}`).join('');
  const avgY = y(avgPace);
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.paceBody}>
        <View style={[styles.paceAxis, { height }]}>
          <Text style={[styles.axisLabel, { color: c.muted }]}>{formatPaceValue(fast, units)}</Text>
          <Text style={[styles.axisLabel, { color: c.muted }]}>{formatPaceValue(slow, units)}</Text>
        </View>
        <View style={{ flex: 1, height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={height}>
              <Path d={`${line}L${width},${height}L0,${height}Z`} fill={c.accent} opacity={0.15} />
              {avgPace > 0 && avgY > 0 && avgY < height && (
                <Line x1={0} x2={width} y1={avgY} y2={avgY} stroke={c.muted} strokeWidth={1} strokeDasharray="4 4" />
              )}
              <Path d={line} stroke={c.accent} strokeWidth={2} fill="none" />
            </Svg>
          )}
        </View>
      </View>
      <View style={styles.paceFoot}>
        <Text style={[styles.axisLabel, { color: c.muted }]}>
          {paceUnit(units)} · avg {formatPaceValue(avgPace, units)} (dashed)
        </Text>
        <Text style={[styles.axisLabel, { color: c.muted }]}>
          {formatDistanceValue(maxD, units, 1)} {distanceUnit(units)}
        </Text>
      </View>
    </View>
  );
}

/** Manual laps: distance, time and pace for each. */
export function LapsTable({ laps, units }: { laps: Lap[]; units: Units }) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.splitRow}>
        <Text style={[styles.splitHead, { color: c.muted, width: 36 }]}>Lap</Text>
        <Text style={[styles.splitHead, { color: c.muted, flex: 1 }]}>{distanceUnit(units)}</Text>
        <Text style={[styles.splitHead, { color: c.muted, width: 72, textAlign: 'right' }]}>Time</Text>
        <Text style={[styles.splitHead, { color: c.muted, width: 72, textAlign: 'right' }]}>Pace</Text>
      </View>
      {laps.map((lap, i) => (
        <View key={i} style={styles.splitRow}>
          <Text style={[styles.splitCell, { color: c.text, width: 36 }]}>{i + 1}</Text>
          <Text style={[styles.splitCell, { color: c.text, flex: 1 }]}>{formatDistanceValue(lap.distanceM, units)}</Text>
          <Text style={[styles.splitCell, { color: c.text, width: 72, textAlign: 'right' }]}>{formatDuration(lap.movingMs)}</Text>
          <Text style={[styles.splitCell, { color: c.muted, width: 72, textAlign: 'right' }]}>
            {formatPaceValue(lap.distanceM >= 20 ? paceSecPerKm(lap.distanceM, lap.movingMs) : 0, units)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  paceBody: { flexDirection: 'row', gap: 6 },
  paceAxis: { justifyContent: 'space-between', width: 40 },
  paceFoot: { flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 46 },
  axisLabel: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bars: { flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  barLabels: { flexDirection: 'row', marginTop: 6 },
  barLabel: { flex: 1, fontSize: 10, textAlign: 'center' },
  splitRow: { flexDirection: 'row', alignItems: 'center' },
  splitHead: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  splitCell: { fontSize: 15, fontVariant: ['tabular-nums'] },
});
