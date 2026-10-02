export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export const MEALS: { key: Meal; label: string; icon: 'cafe-outline' | 'restaurant-outline' | 'pizza-outline' | 'nutrition-outline' }[] = [
  { key: 'breakfast', label: 'Breakfast', icon: 'cafe-outline' },
  { key: 'lunch', label: 'Lunch', icon: 'restaurant-outline' },
  { key: 'dinner', label: 'Dinner', icon: 'pizza-outline' },
  { key: 'snack', label: 'Snacks', icon: 'nutrition-outline' },
];

export type FoodItem = { name: string; portion: string; kcal: number; proteinG: number; carbsG: number; fatG: number };

export type FoodEntry = {
  id: string;
  /** Local calendar day, "YYYY-MM-DD". */
  day: string;
  /** When it was eaten (or logged). */
  at: number;
  meal: Meal;
  name: string;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  /** What the AI saw on the plate, if the entry came from a photo. */
  items?: FoodItem[];
  source: 'ai' | 'manual';
  /** A small copy of the meal photo kept by the app (native only). */
  photoUri?: string;
};

export type Totals = { kcal: number; proteinG: number; carbsG: number; fatG: number };

const pad = (n: number) => String(n).padStart(2, '0');

export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local noon of a day key, a safe timestamp for date arithmetic and formatting. */
export function dayTime(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getTime();
}

export function shiftDay(day: string, by: number): string {
  const d = new Date(dayTime(day));
  d.setDate(d.getDate() + by);
  return dayKey(d.getTime());
}

/** The meal someone is most likely logging at this time of day. */
export function mealForTime(ts: number): Meal {
  const h = new Date(ts).getHours();
  if (h >= 5 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

export function sumTotals(entries: Pick<FoodEntry, 'kcal' | 'proteinG' | 'carbsG' | 'fatG'>[]): Totals {
  return entries.reduce(
    (t, e) => ({ kcal: t.kcal + e.kcal, proteinG: t.proteinG + e.proteinG, carbsG: t.carbsG + e.carbsG, fatG: t.fatG + e.fatG }),
    { kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );
}

export function entriesOn(entries: FoodEntry[], day: string): FoodEntry[] {
  return entries.filter((e) => e.day === day).sort((a, b) => a.at - b.at);
}

/** Calories eaten on each of the `n` days ending at `lastDay`, oldest first. */
export function dailyCalories(entries: FoodEntry[], lastDay: string, n: number): { day: string; kcal: number }[] {
  const byDay = new Map<string, number>();
  for (const e of entries) byDay.set(e.day, (byDay.get(e.day) ?? 0) + e.kcal);
  return Array.from({ length: n }, (_, i) => {
    const day = shiftDay(lastDay, i - (n - 1));
    return { day, kcal: Math.round(byDay.get(day) ?? 0) };
  });
}

/** Scales a meal's numbers when the portion was bigger or smaller than the photo suggested. */
export function scaleTotals<T extends Totals>(t: T, factor: number): T {
  const r = (v: number) => Math.round(v * factor);
  return { ...t, kcal: r(t.kcal), proteinG: r(t.proteinG), carbsG: r(t.carbsG), fatG: r(t.fatG) };
}

export const newFoodId = (now = Date.now()) => `food-${now.toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Keeps entries saved by any version loadable: numbers present and non-negative. */
export function normaliseFood(raw: Partial<FoodEntry> | null | undefined): FoodEntry | null {
  if (!raw || typeof raw.id !== 'string' || typeof raw.day !== 'string') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
  return {
    id: raw.id,
    day: raw.day,
    at: typeof raw.at === 'number' ? raw.at : dayTime(raw.day),
    meal: MEALS.some((m) => m.key === raw.meal) ? (raw.meal as Meal) : 'snack',
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : 'Food',
    kcal: n(raw.kcal),
    proteinG: n(raw.proteinG),
    carbsG: n(raw.carbsG),
    fatG: n(raw.fatG),
    ...(Array.isArray(raw.items) ? { items: raw.items } : {}),
    source: raw.source === 'ai' ? 'ai' : 'manual',
    ...(raw.photoUri ? { photoUri: raw.photoUri } : {}),
  };
}
