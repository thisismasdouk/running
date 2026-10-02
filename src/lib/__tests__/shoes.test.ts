import { shoeDistances, shoeLimitM, shoeWornOut, sortShoes } from '../shoes';
import type { Run, Shoe } from '../types';

const run = (distanceM: number, shoeId?: string) => ({ id: String(Math.random()), distanceM, shoeId }) as Run;
const shoe = (id: string, retired: boolean, addedAt: number): Shoe => ({ id, name: id, retired, addedAt });

describe('shoes', () => {
  it('adds up distance per shoe', () => {
    const m = shoeDistances([run(5000, 'a'), run(10_000, 'a'), run(3000, 'b'), run(4000)]);
    expect(m.get('a')).toBe(15_000);
    expect(m.get('b')).toBe(3000);
    expect(m.size).toBe(2);
  });

  it('warns past 600 km or 375 mi', () => {
    expect(shoeLimitM('metric')).toBe(600_000);
    expect(shoeWornOut(599_000, 'metric')).toBe(false);
    expect(shoeWornOut(600_000, 'metric')).toBe(true);
    expect(shoeWornOut(600_000, 'imperial')).toBe(false);
    expect(shoeWornOut(375 * 1609.344, 'imperial')).toBe(true);
  });

  it('lists active shoes before retired ones', () => {
    expect(sortShoes([shoe('old', true, 1), shoe('new', false, 3), shoe('mid', false, 2)]).map((s) => s.id)).toEqual(['mid', 'new', 'old']);
  });
});
