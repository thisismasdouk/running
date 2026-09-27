import { useEffect, useRef } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import type { Segment, TrackPoint } from '@/lib/types';
import { useColors, useIsDark } from './theme';

type Props = {
  segments: Segment[];
  style?: ViewStyle;
  /** Live mode: show the user's position and keep the camera on it. */
  live?: boolean;
  /** Where to centre the map before any route exists. */
  initial?: TrackPoint | null;
};

const toLatLng = (p: TrackPoint) => ({ latitude: p.lat, longitude: p.lon });

export function RouteMap({ segments, style, live, initial }: Props) {
  const c = useColors();
  const dark = useIsDark();
  const ref = useRef<MapView>(null);
  const all = segments.flat();
  const last = all[all.length - 1];

  useEffect(() => {
    if (live || all.length < 2) return;
    // Give the map a frame to lay out before fitting the route.
    const id = setTimeout(() => {
      ref.current?.fitToCoordinates(all.map(toLatLng), {
        edgePadding: { top: 40, right: 40, bottom: 40, left: 40 },
        animated: false,
      });
    }, 50);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, all.length]);

  useEffect(() => {
    if (live && last) {
      ref.current?.animateCamera({ center: toLatLng(last) }, { duration: 400 });
    }
  }, [live, last]);

  const start = all[0] ?? initial;

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        userInterfaceStyle={dark ? 'dark' : 'light'}
        showsUserLocation={live}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        initialRegion={
          start ? { ...toLatLng(start), latitudeDelta: 0.01, longitudeDelta: 0.01 } : undefined
        }
      >
        {segments.map((seg, i) =>
          seg.length > 1 ? (
            <Polyline key={i} coordinates={seg.map(toLatLng)} strokeColor={c.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
          ) : null,
        )}
        {!live && all[0] && <Marker coordinate={toLatLng(all[0])} pinColor="green" title="Start" />}
        {!live && last && all.length > 1 && <Marker coordinate={toLatLng(last)} pinColor="red" title="Finish" />}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
});
