import type { Segment } from '@/lib/types';

/**
 * A straight run heading due north from the equator at a constant pace,
 * one fix per `stepS` seconds. 1° of latitude ≈ 111,195 m on our sphere.
 */
export function straightRun(metres: number, secPerKm: number, opts: { start?: number; stepS?: number; alt?: (d: number) => number } = {}): Segment {
  const { start = 0, stepS = 1, alt } = opts;
  const mPerDeg = (Math.PI / 180) * 6_371_000;
  const speed = 1000 / secPerKm;
  const seg: Segment = [];
  for (let s = 0; ; s += stepS) {
    const d = Math.min(metres, s * speed);
    seg.push({ lat: d / mPerDeg, lon: 0, alt: alt ? alt(d) : null, t: start + s * 1000, acc: 5 });
    if (d >= metres) break;
  }
  return seg;
}
