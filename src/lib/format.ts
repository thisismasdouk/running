import { METRES_PER_MILE } from './stats';
import type { Units } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** 3725000 → "1:02:05", 65000 → "1:05". */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "5.02" in km or miles, without the unit. */
export function formatDistanceValue(metres: number, units: Units, digits = 2): string {
  const v = units === 'metric' ? metres / 1000 : metres / METRES_PER_MILE;
  return v.toFixed(digits);
}

export const distanceUnit = (units: Units) => (units === 'metric' ? 'km' : 'mi');
export const paceUnit = (units: Units) => (units === 'metric' ? '/km' : '/mi');

export function formatDistance(metres: number, units: Units, digits = 2): string {
  return `${formatDistanceValue(metres, units, digits)} ${distanceUnit(units)}`;
}

/** Pace given in seconds per km, rendered per km or mile as "5:07". "–:––" when unknown. */
export function formatPaceValue(secPerKm: number, units: Units): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > 60 * 60) return '–:––';
  const s = Math.round(units === 'metric' ? secPerKm : secPerKm * (METRES_PER_MILE / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function formatPace(secPerKm: number, units: Units): string {
  return `${formatPaceValue(secPerKm, units)} ${paceUnit(units)}`;
}

export function formatElevation(metres: number, units: Units): string {
  return units === 'metric' ? `${Math.round(metres)} m` : `${Math.round(metres * 3.28084)} ft`;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

/** "Mon 5 Jan" style, for plan schedules. */
export function formatShortDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/** A pace band given in seconds per km: "4:30–4:45 /km". */
export function formatPaceRange(range: { min: number; max: number }, units: Units): string {
  return `${formatPaceValue(range.min, units)}–${formatPaceValue(range.max, units)} ${paceUnit(units)}`;
}
