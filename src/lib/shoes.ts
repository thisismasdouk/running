import { METRES_PER_MILE } from './stats';
import type { Run, Shoe, Units } from './types';

/** Most running shoes are worn out somewhere around here. */
export const SHOE_LIMIT_KM = 600;
export const SHOE_LIMIT_MI = 375;

export const shoeLimitM = (units: Units) => (units === 'metric' ? SHOE_LIMIT_KM * 1000 : SHOE_LIMIT_MI * METRES_PER_MILE);

/** Total distance per shoe id from the runs that used it. */
export function shoeDistances(runs: Run[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of runs) if (r.shoeId) m.set(r.shoeId, (m.get(r.shoeId) ?? 0) + r.distanceM);
  return m;
}

export const shoeWornOut = (distanceM: number, units: Units) => distanceM >= shoeLimitM(units);

/** Active shoes first (in the order added), then retired ones. */
export function sortShoes(shoes: Shoe[]): Shoe[] {
  return [...shoes].sort((a, b) => Number(a.retired) - Number(b.retired) || a.addedAt - b.addedAt);
}
