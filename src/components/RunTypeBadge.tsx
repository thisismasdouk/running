import { StyleSheet, Text, View } from 'react-native';

import { runTypeLabel } from '@/lib/runs';
import type { RunType } from '@/lib/types';

/** One hue per run type; readable on both light and dark cards. */
export const RUN_TYPE_COLORS: Record<RunType, string> = {
  easy: '#16A34A',
  long: '#2563EB',
  tempo: '#EA580C',
  intervals: '#9333EA',
  race: '#DC2626',
  recovery: '#0D9488',
};

export function RunTypeBadge({ type }: { type: RunType }) {
  const color = RUN_TYPE_COLORS[type];
  return (
    <View style={[styles.badge, { borderColor: color, backgroundColor: `${color}1F` }]}>
      <Text style={[styles.text, { color }]}>{runTypeLabel(type).toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  text: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
});
