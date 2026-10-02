import { useMemo, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Polyline } from 'react-native-svg';

import { bounds } from '@/lib/geo';
import type { Segment } from '@/lib/types';
import { useColors } from './theme';

type Props = {
  segments: Segment[];
  width: number;
  height: number;
  strokeWidth?: number;
  padding?: number;
  /** Line colour; the accent by default. */
  color?: string;
  background?: string;
};

/** Thumbnails don't need every fix; a long run has thousands. */
const MAX_POINTS = 400;

/**
 * Draws a route as a plain line, without map tiles. Used for feed
 * thumbnails and wherever a native map isn't available (web).
 */
export function RouteShape({ segments, width, height, strokeWidth = 3, padding = 12, color, background }: Props) {
  const c = useColors();
  const lines = useMemo(() => {
    const b = bounds(segments);
    if (!b) return [];
    // Scale longitude by cos(latitude) so shapes aren't stretched away from the equator.
    const kx = Math.cos(((b.minLat + b.maxLat) / 2) * (Math.PI / 180));
    const spanX = Math.max((b.maxLon - b.minLon) * kx, 1e-9);
    const spanY = Math.max(b.maxLat - b.minLat, 1e-9);
    const scale = Math.min((width - padding * 2) / spanX, (height - padding * 2) / spanY);
    const offX = (width - spanX * scale) / 2;
    const offY = (height - spanY * scale) / 2;
    const total = segments.reduce((n, seg) => n + seg.length, 0);
    const step = Math.max(1, Math.ceil(total / MAX_POINTS));
    return segments.map((seg) =>
      seg
        .filter((_, i) => i % step === 0 || i === seg.length - 1)
        .map((p) => ({ x: offX + (p.lon - b.minLon) * kx * scale, y: offY + (b.maxLat - p.lat) * scale })),
    );
  }, [segments, width, height, padding]);
  const polylines = useMemo(() => lines.map((pts) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')), [lines]);

  const first = lines[0]?.[0];
  const lastSeg = lines[lines.length - 1];
  const last = lastSeg?.[lastSeg.length - 1];

  return (
    <View style={{ width, height, backgroundColor: background ?? c.accentSoft }}>
      <Svg width={width} height={height}>
        {polylines.map((points, i) => (
          <Polyline
            key={i}
            points={points}
            fill="none"
            stroke={color ?? c.accent}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {first && <Circle cx={first.x} cy={first.y} r={strokeWidth + 1.5} fill={c.good} stroke="#fff" strokeWidth={1.5} />}
        {last && <Circle cx={last.x} cy={last.y} r={strokeWidth + 1.5} fill={c.danger} stroke="#fff" strokeWidth={1.5} />}
      </Svg>
    </View>
  );
}

/** RouteShape that fills its container's width. */
export function FluidRouteShape({ segments, height }: { segments: Segment[]; height: number }) {
  const [width, setWidth] = useState(0);
  return (
    <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && <RouteShape segments={segments} width={width} height={height} />}
    </View>
  );
}
