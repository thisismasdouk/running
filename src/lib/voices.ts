/*
 * Choosing a speech voice. Pure (no expo-speech import) so it can be unit
 * tested; lib/feedback.ts fetches the voices and speaks with the pick.
 *
 * expo-speech only reports quality 'Default' or 'Enhanced', and iOS Premium
 * voices come through as 'Default', so the identifier and name are checked too.
 */

/** The parts of expo-speech's Voice used here. */
export type VoiceInfo = { identifier: string; name: string; quality: string; language: string };

export type VoiceTier = 'Premium' | 'Enhanced' | 'Siri' | 'Standard';

/** Apple's novelty voices (Bells, Bubbles, Zarvox…) and the Eloquence set are the robotic ones. */
const NOVELTY = /com\.apple\.(speech\.synthesis\.voice\.|eloquence\.)|speech\.synthesis\.voice\.(Albert|Bad|Bahh|Bells|Boing|Bubbles|Cellos|Deranged|Good|Hysterical|Jester|Organ|Superstar|Trinoids|Whisper|Wobble|Zarvox)/i;

export function isNoveltyVoice(v: VoiceInfo): boolean {
  return NOVELTY.test(v.identifier);
}

export function voiceTier(v: VoiceInfo): VoiceTier {
  const id = v.identifier.toLowerCase();
  const name = v.name.toLowerCase();
  // Browsers' cloud voices ("Microsoft Aria Online (Natural)") are the web's best.
  if (id.includes('premium') || /natural|neural/.test(name)) return 'Premium';
  if (v.quality === 'Enhanced' || id.includes('enhanced')) return 'Enhanced';
  if (id.includes('siri') || name.includes('siri')) return 'Siri';
  return 'Standard';
}

const TIER_SCORE: Record<VoiceTier, number> = { Premium: 40, Enhanced: 30, Siri: 20, Standard: 0 };

/** "en_GB" / "en-gb" → "en-GB". */
export function normaliseLanguage(tag: string): string {
  const [lang, region] = tag.replace('_', '-').split('-');
  return region ? `${lang.toLowerCase()}-${region.toUpperCase()}` : lang.toLowerCase();
}

/**
 * The language to speak cues in. The cue text is English, so a non-English
 * device still gets an English voice; an English device keeps its accent.
 */
export function cueLanguage(deviceLocale: string | undefined): string {
  const tag = normaliseLanguage(deviceLocale || 'en-US');
  if (!tag.startsWith('en')) return 'en-US';
  return tag.includes('-') ? tag : 'en-US';
}

function score(v: VoiceInfo, lang: string): number {
  const vl = normaliseLanguage(v.language);
  // An exact accent match beats a better voice with another accent only within the same tier.
  // Android's network voices need a connection, which a run often doesn't have.
  return TIER_SCORE[voiceTier(v)] + (vl === lang ? 5 : 0) - (/network/i.test(v.identifier) ? 25 : 0);
}

/** Voices that can speak `lang` (any accent of the same language), best first. Novelty voices are left out. */
export function voicesForLanguage<V extends VoiceInfo>(voices: V[], lang: string): V[] {
  const base = lang.split('-')[0];
  return voices
    .filter((v) => normaliseLanguage(v.language).split('-')[0] === base && !isNoveltyVoice(v))
    .sort((a, b) => score(b, lang) - score(a, lang) || a.name.localeCompare(b.name));
}

/** The best voice for `lang`: Premium/Enhanced first, then a Siri voice, then whatever the platform has. */
export function pickVoice<V extends VoiceInfo>(voices: V[], lang: string): V | null {
  return voicesForLanguage(voices, lang)[0] ?? null;
}

/** Speech rate steps offered in settings. 1 is the platform's normal speed. */
export const SPEECH_RATES = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.2];

export function clampRate(rate: number): number {
  return Math.min(SPEECH_RATES[SPEECH_RATES.length - 1], Math.max(SPEECH_RATES[0], rate));
}
