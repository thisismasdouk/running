import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { distanceUnit, formatDistanceValue } from '@/lib/format';
import { useRecorder } from '@/lib/recorder';
import type { Units } from '@/lib/types';
import { useColors } from './theme';

/**
 * "Recording — tap to return" banner. Its own component so only it
 * re-renders on each GPS fix, not the whole feed underneath.
 */
export function RecordingBanner({ units }: { units: Units }) {
  const c = useColors();
  const rec = useRecorder();
  if (rec.status === 'idle') return null;
  // A plain Pressable, not <Link asChild>: Slot merges a style array into an
  // object with "0"/"1" keys, which crashes react-native-web.
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/record')}
      style={({ pressed }) => [styles.banner, { backgroundColor: c.accent, opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.text}>
        {rec.status === 'paused' ? '⏸ Run paused' : rec.autoPaused ? '⏸ Auto-paused' : '● Recording'} ·{' '}
        {formatDistanceValue(rec.distanceM, units)} {distanceUnit(units)} — tap to return
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { borderRadius: 12, padding: 12 },
  text: { color: '#fff', fontWeight: '700', textAlign: 'center' },
});
