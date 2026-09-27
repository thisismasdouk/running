import { METRES_PER_MILE } from './stats';
import type { Units } from './types';

/*
 * Text for the spoken audio cues. Kept free of any speech API so it can be
 * unit tested; lib/feedback.ts does the speaking.
 */

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** 3725000 → "1 hour 2 minutes 5 seconds", 342000 → "5 minutes 42 seconds". */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (h) parts.push(plural(h, 'hour'));
  if (m) parts.push(plural(m, 'minute'));
  if (s || parts.length === 0) parts.push(plural(s, 'second'));
  return parts.join(' ');
}

const unitWord = (units: Units) => (units === 'metric' ? 'kilometre' : 'mile');

/** Pace given in seconds per km → "5 minutes 51 seconds per kilometre" (or per mile). */
export function spokenPace(secPerKm: number, units: Units): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return 'unknown';
  const perUnit = units === 'metric' ? secPerKm : secPerKm * (METRES_PER_MILE / 1000);
  return `${spokenDuration(perUnit * 1000)} per ${unitWord(units)}`;
}

export type SplitCue = { index: number; distanceM: number; movingMs: number; splitMs: number; splitM: number };

/** "3 kilometres. Time 17 minutes 42 seconds. Split pace …. Average pace …." */
export function splitAnnouncement(cue: SplitCue, units: Units): string {
  const splitPace = cue.splitM > 0 ? cue.splitMs / cue.splitM : 0;
  const avgPace = cue.distanceM > 0 ? cue.movingMs / cue.distanceM : 0;
  return [
    `${plural(cue.index, unitWord(units))}.`,
    `Time ${spokenDuration(cue.movingMs)}.`,
    `Split pace ${spokenPace(splitPace, units)}.`,
    `Average pace ${spokenPace(avgPace, units)}.`,
  ].join(' ');
}
