import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { formatDuration } from '@/lib/format';
import { HR_ZONES, type HeartRateSummary } from '@/lib/heartrate';
import { useColors } from './theme';
import { Stat } from './ui';

const HR_RED = '#EF4444';

/** Average and max heart rate, a heart-rate line over the run, and time in each zone. */
export function HeartRateCard({ hr }: { hr: HeartRateSummary }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const height = 90;
  const total = hr.zonesMs.reduce((a, b) => a + b, 0) || 1;
  const pts = hr.series;
  const t0 = pts[0]?.t ?? 0;
  const span = Math.max((pts[pts.length - 1]?.t ?? 0) - t0, 1);
  const lo = Math.min(...pts.map((p) => p.bpm)) - 5;
  const hi = Math.max(...pts.map((p) => p.bpm)) + 5;
  const x = (t: number) => ((t - t0) / span) * width;
  const y = (b: number) => height - 4 - ((b - lo) / (hi - lo)) * (height - 8);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.bpm).toFixed(1)}`).join('');

  return (
    <View style={{ gap: 14 }}>
      <View style={styles.stats}>
        <View style={{ flex: 1 }}>
          <Stat label="Avg heart rate" value={String(hr.avg)} unit="bpm" size="lg" />
        </View>
        <View style={{ flex: 1 }}>
          <Stat label="Max" value={String(hr.max)} unit="bpm" size="lg" />
        </View>
      </View>

      {pts.length > 1 && (
        <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 && (
            <Svg width={width} height={height}>
              <Path d={`${line}L${width},${height}L0,${height}Z`} fill={HR_RED} opacity={0.12} />
              <Path d={line} stroke={HR_RED} strokeWidth={2} fill="none" />
            </Svg>
          )}
        </View>
      )}

      <View style={{ gap: 8 }}>
        {HR_ZONES.map((z, i) => {
          const ms = hr.zonesMs[i] ?? 0;
          const pct = Math.round((ms / total) * 100);
          const lower = Math.round(z.from * hr.maxHr);
          const upper = i < HR_ZONES.length - 1 ? Math.round(HR_ZONES[i + 1].from * hr.maxHr) - 1 : null;
          return (
            <View key={z.name} style={styles.zoneRow}>
              <View style={{ width: 92 }}>
                <Text style={[styles.zoneName, { color: c.text }]}>{z.name}</Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>
                  {i === 0 ? `< ${Math.round(HR_ZONES[1].from * hr.maxHr)}` : upper ? `${lower}–${upper}` : `${lower}+`} bpm
                </Text>
              </View>
              <View style={[styles.zoneTrack, { backgroundColor: c.track }]}>
                <View style={{ width: `${pct}%`, height: '100%', backgroundColor: z.color, borderRadius: 4 }} />
              </View>
              <Text style={[styles.zoneTime, { color: c.muted }]}>{ms > 0 ? formatDuration(ms) : '—'}</Text>
            </View>
          );
        })}
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>From Apple Health · zones use a max heart rate of {hr.maxHr} bpm</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: 'row' },
  zoneRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  zoneName: { fontSize: 13, fontWeight: '700' },
  zoneTrack: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  zoneTime: { width: 52, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
