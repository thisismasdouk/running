import { useState } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { Segment, TrackPoint } from '@/lib/types';
import { RouteShape } from './RouteShape';
import { useColors } from './theme';

type Props = { segments: Segment[]; style?: ViewStyle; live?: boolean; initial?: TrackPoint | null };

/** react-native-maps has no web implementation, so web draws the route shape without map tiles. */
export function RouteMap({ segments, style }: Props) {
  const c = useColors();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const hasRoute = segments.some((s) => s.length > 1);
  return (
    <View
      style={[styles.wrap, { backgroundColor: c.accentSoft }, style]}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
    >
      {hasRoute && size.width > 0 ? (
        <RouteShape segments={segments} width={size.width} height={size.height} strokeWidth={4} padding={24} />
      ) : (
        <Text style={{ color: c.muted }}>Waiting for GPS…</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
});
