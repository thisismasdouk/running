import { METRES_PER_MILE } from './stats';
import type { Units } from './types';

/*
 * Text for the spoken audio cues. Kept free of any speech API so it can be
 * unit tested; lib/feedback.ts does the speaking.
 *
 * Numbers are written out as words ("five minutes twenty-nine") rather than
 * "5:29": speech engines read clock-style tokens as times of day or digit by
 * digit, which is what made the old cues sound robotic.
 */

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** 29 → "twenty-nine", 342 → "three hundred and forty-two". Whole numbers up to 999,999. */
export function numberToWords(n: number): string {
  n = Math.max(0, Math.round(n));
  if (n < 20) return ONES[n];
  if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10]}` : '');
  if (n < 1000) {
    const rest = n % 100;
    return `${ONES[Math.floor(n / 100)]} hundred${rest ? ` and ${numberToWords(rest)}` : ''}`;
  }
  const rest = n % 1000;
  return `${numberToWords(Math.floor(n / 1000))} thousand${rest ? `${rest < 100 ? ' and' : ''} ${numberToWords(rest)}` : ''}`;
}

const count = (n: number, word: string) => `${numberToWords(n)} ${word}${n === 1 ? '' : 's'}`;
const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * How a runner would say a time: 329000 → "five minutes twenty-nine",
 * 305000 → "five minutes and five seconds", 42000 → "forty-two seconds",
 * 3725000 → "one hour, two minutes and five seconds".
 */
export function spokenDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h === 0 && m === 0) return count(s, 'second');
  if (h === 0) {
    if (s === 0) return count(m, 'minute');
    // "five minutes twenty-nine" is natural, "five minutes five" is not.
    return s >= 10 ? `${count(m, 'minute')} ${numberToWords(s)}` : `${count(m, 'minute')} and ${count(s, 'second')}`;
  }
  const parts = [count(h, 'hour')];
  if (m) parts.push(count(m, 'minute'));
  if (s) parts.push(count(s, 'second'));
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

const unitWord = (units: Units) => (units === 'metric' ? 'kilometre' : 'mile');

/** Seconds per km, given per km or per mile as a duration in ms (or NaN when unknown). */
function paceMsPerUnit(secPerKm: number, units: Units): number {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return NaN;
  return (units === 'metric' ? secPerKm : secPerKm * (METRES_PER_MILE / 1000)) * 1000;
}

/** Pace given in seconds per km → "five minutes fifty-one per kilometre" (or per mile). */
export function spokenPace(secPerKm: number, units: Units): string {
  const ms = paceMsPerUnit(secPerKm, units);
  if (Number.isNaN(ms)) return 'unknown';
  return `${spokenDuration(ms)} per ${unitWord(units)}`;
}

export type SplitCue = { index: number; distanceM: number; movingMs: number; splitMs: number; splitM: number };

/**
 * "One kilometre. Five minutes twenty-nine per kilometre. Total time five minutes twenty-nine."
 * From the second split on, the last split and the average are both given:
 * "Three kilometres. Last kilometre five minutes fifty-one. Average five minutes fifty-four per kilometre. Total time …"
 */
export function splitAnnouncement(cue: SplitCue, units: Units): string {
  const splitPace = cue.splitM > 0 ? cue.splitMs / cue.splitM : 0;
  const avgPace = cue.distanceM > 0 ? cue.movingMs / cue.distanceM : 0;
  const total = `Total time ${spokenDuration(cue.movingMs)}.`;
  const head = `${capitalise(count(cue.index, unitWord(units)))}.`;
  if (cue.index <= 1) return [head, `${capitalise(spokenPace(splitPace, units))}.`, total].join(' ');
  const last = paceMsPerUnit(splitPace, units);
  return [
    head,
    Number.isNaN(last) ? null : `Last ${unitWord(units)} ${spokenDuration(last)}.`,
    `Average ${spokenPace(avgPace, units)}.`,
    total,
  ]
    .filter(Boolean)
    .join(' ');
}

/** "Lap three. One minute fifty-two." */
export function lapAnnouncement(index: number, lapMs: number): string {
  return `Lap ${numberToWords(index)}. ${capitalise(spokenDuration(lapMs))}.`;
}

/** What "Test voice" says: a realistic first split. */
export const SAMPLE_CUE: SplitCue = { index: 1, distanceM: 1000, movingMs: 329_000, splitMs: 329_000, splitM: 1000 };
