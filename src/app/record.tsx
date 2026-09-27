import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RouteMap } from '@/components/RouteMap';
import { useColors } from '@/components/theme';
import { Button, Stat } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { distanceUnit, formatDistanceValue, formatDuration, formatPaceValue, paceUnit } from '@/lib/format';
import { currentPace, movingMs, recorder, useRecorder } from '@/lib/recorder';
import { buildRun } from '@/lib/runs';
import { paceSecPerKm, unitLength } from '@/lib/stats';
import { currentPosition, requestPermissions, startTracking, stopTracking, type TrackingPermission } from '@/lib/tracking';
import type { TrackPoint } from '@/lib/types';
import { saveRun, useProfile } from '@/store';

const KEEP_AWAKE_TAG = 'run';

export default function Record() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const rec = useRecorder();
  const profile = useProfile();
  const units = profile.units;
  const [permission, setPermission] = useState<TrackingPermission | null>(null);
  const [here, setHere] = useState<TrackPoint | null>(null);
  const [, tick] = useState(0);

  // Ask for location access, and resume GPS if a run was already in progress.
  useEffect(() => {
    let alive = true;
    (async () => {
      const p = await requestPermissions();
      if (!alive) return;
      setPermission(p);
      if (p === 'denied') return;
      currentPosition().then((pos) => alive && setHere(pos));
      if (recorder.get().status === 'recording') await startTracking(p);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Re-render every second so the clock keeps moving between GPS fixes.
  useEffect(() => {
    if (rec.status !== 'recording') return;
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [rec.status]);

  useEffect(() => {
    if (rec.status === 'idle') return;
    activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [rec.status]);

  useEffect(() => {
    recorder.splitLength = unitLength(units);
    if (!profile.splitHaptics || Platform.OS === 'web') return;
    return recorder.onSplit(() => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    });
  }, [units, profile.splitHaptics]);

  const start = async () => {
    if (!permission || permission === 'denied') return;
    recorder.start();
    await startTracking(permission);
  };

  const pause = async () => {
    recorder.pause();
    await stopTracking();
  };

  const resume = async () => {
    if (!permission || permission === 'denied') return;
    recorder.resume();
    await startTracking(permission);
  };

  const finish = async () => {
    await stopTracking();
    const result = recorder.finish();
    if (result.distanceM < 10 && result.movingMs < 60_000) {
      router.back();
      return;
    }
    const run = buildRun(result);
    saveRun(run);
    router.replace({ pathname: '/edit/[id]', params: { id: run.id, fresh: '1' } });
  };

  const discard = async () => {
    if (!(await confirm('Discard run?', 'This run will be deleted and cannot be recovered.', 'Discard', true))) return;
    await stopTracking();
    recorder.discard();
    router.back();
  };

  const moving = movingMs(rec);
  const livePace = currentPace(rec);
  const avgPace = paceSecPerKm(rec.distanceM, moving);

  return (
    <View style={[styles.screen, { backgroundColor: c.bg }]}>
      <RouteMap segments={rec.segments} live initial={here} style={styles.map} />

      <View style={[styles.topBar, { top: insets.top + 8 }]}>
        {rec.status === 'idle' && (
          <Pressable
            accessibilityLabel="Close"
            onPress={() => router.back()}
            style={[styles.close, { backgroundColor: c.card }]}
          >
            <Ionicons name="chevron-down" size={24} color={c.text} />
          </Pressable>
        )}
        <View style={[styles.gps, { backgroundColor: c.card }]}>
          <View
            style={[
              styles.dot,
              { backgroundColor: permission === 'denied' ? c.danger : here || rec.segments.flat().length ? c.good : c.muted },
            ]}
          />
          <Text style={{ color: c.text, fontWeight: '600', fontSize: 13 }}>
            {permission === 'denied' ? 'No GPS access' : here || rec.segments.flat().length ? 'GPS ready' : 'Finding GPS…'}
          </Text>
        </View>
      </View>

      <View style={[styles.panel, { backgroundColor: c.card, paddingBottom: insets.bottom + 16 }]}>
        {permission === 'denied' ? (
          <View style={{ gap: 12, alignItems: 'center' }}>
            <Text style={[styles.denied, { color: c.text }]}>
              Stride needs location access to track your route, distance and pace.
            </Text>
            <Button title="Open Settings" onPress={() => Linking.openSettings()} />
          </View>
        ) : (
          <>
            <View style={styles.bigStat}>
              <Stat label="Time" value={formatDuration(moving)} size="xl" align="center" />
            </View>
            <View style={styles.statRow}>
              <Stat label="Distance" value={formatDistanceValue(rec.distanceM, units)} unit={distanceUnit(units)} size="lg" align="center" />
              <Stat label="Pace" value={formatPaceValue(livePace, units)} unit={paceUnit(units)} size="lg" align="center" />
              <Stat label="Avg pace" value={formatPaceValue(avgPace, units)} unit={paceUnit(units)} size="lg" align="center" />
            </View>
            {permission === 'foreground' && rec.status !== 'idle' && Platform.OS !== 'web' && (
              <Text style={[styles.hint, { color: c.muted }]}>
                Background location is off — keep Stride open while you run.
              </Text>
            )}
            <View style={styles.controls}>
              {rec.status === 'idle' && <RoundButton label="Start" onPress={start} color={c.accent} icon="play" disabled={!permission} />}
              {rec.status === 'recording' && <RoundButton label="Pause" onPress={pause} color={c.text} icon="pause" />}
              {rec.status === 'paused' && (
                <>
                  <RoundButton label="Discard" onPress={discard} color={c.danger} icon="trash" small />
                  <RoundButton label="Resume" onPress={resume} color={c.accent} icon="play" />
                  <RoundButton label="Finish" onPress={finish} color={c.good} icon="flag" small />
                </>
              )}
            </View>
          </>
        )}
      </View>
    </View>
  );
}

type RoundProps = {
  label: string;
  onPress: () => void;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  small?: boolean;
  disabled?: boolean;
};

function RoundButton({ label, onPress, color, icon, small, disabled }: RoundProps) {
  const c = useColors();
  const size = small ? 64 : 84;
  return (
    <View style={{ alignItems: 'center', gap: 6 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        disabled={disabled}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.4 : pressed ? 0.8 : 1,
        })}
      >
        <Ionicons name={icon} size={small ? 26 : 36} color={color === c.text ? c.card : '#fff'} />
      </Pressable>
      <Text style={{ color: c.muted, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  map: { flex: 1 },
  topBar: { position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  gps: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 16, marginTop: -24 },
  bigStat: { alignItems: 'center' },
  statRow: { flexDirection: 'row', justifyContent: 'space-around' },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center', marginTop: 4 },
  hint: { textAlign: 'center', fontSize: 13 },
  denied: { fontSize: 16, textAlign: 'center', lineHeight: 22 },
});
