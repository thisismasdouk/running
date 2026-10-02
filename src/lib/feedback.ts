import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { getProfile } from '@/store';
import { lapAnnouncement, SAMPLE_CUE, splitAnnouncement } from './cues';
import { recorder } from './recorder';
import { cueLanguage, pickVoice, voicesForLanguage } from './voices';

/** Some browsers never fire `voiceschanged`, so don't wait on the voice list forever. */
const VOICES_TIMEOUT_MS = 2000;

const deviceLocale = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return undefined;
  }
};

export const CUE_LANGUAGE = cueLanguage(deviceLocale());

let voices: Speech.Voice[] | null = null;
let loading: Promise<Speech.Voice[]> | null = null;

/** The device's voices, fetched once. An empty answer isn't cached, so a later call can try again. */
export function loadVoices(): Promise<Speech.Voice[]> {
  if (voices) return Promise.resolve(voices);
  loading ??= Promise.race([
    Speech.getAvailableVoicesAsync(),
    new Promise<Speech.Voice[]>((resolve) => setTimeout(() => resolve([]), VOICES_TIMEOUT_MS)),
  ])
    .catch(() => [] as Speech.Voice[])
    .then((list) => {
      loading = null;
      if (list.length) voices = list;
      return list;
    });
  return loading;
}

/** The chosen voice if it's still installed, else the best one for the cue language. */
function resolveVoice(list: Speech.Voice[], voiceId: string | null): Speech.Voice | null {
  return (voiceId && list.find((v) => v.identifier === voiceId)) || pickVoice(list, CUE_LANGUAGE);
}

function speak(text: string, list: Speech.Voice[], voiceId: string | null, rate: number) {
  const voice = resolveVoice(list, voiceId);
  try {
    Speech.speak(text, {
      // Mix with (and duck) music rather than stopping it.
      useApplicationAudioSession: false,
      language: voice?.language ?? CUE_LANGUAGE,
      ...(voice ? { voice: voice.identifier } : {}),
      rate,
    });
  } catch {
    // No speech engine (some browsers); cues are a nice-to-have.
  }
}

/** Speaks `text` if voice cues are on, with the voice and speed from the profile. */
export function say(text: string) {
  if (!getProfile().audioCues) return;
  // The first cue waits for the voice list (a few ms); later ones speak straight away.
  const go = (list: Speech.Voice[]) => {
    const { voiceId, speechRate } = getProfile();
    speak(text, list, voiceId, speechRate);
  };
  if (voices) go(voices);
  else loadVoices().then(go);
}

/** "Test voice": speaks a sample split whether or not voice cues are on. */
export async function testVoice(voiceId: string | null, rate: number, units: Parameters<typeof splitAnnouncement>[1]) {
  const list = await loadVoices();
  Speech.stop().catch(() => {});
  speak(splitAnnouncement(SAMPLE_CUE, units), list, voiceId, rate);
}

/** Voices for the settings picker (best first) and the one Automatic would use. */
export function useVoices() {
  const [list, setList] = useState<Speech.Voice[] | null>(voices);
  useEffect(() => {
    let alive = true;
    loadVoices().then((l) => alive && setList(l));
    return () => {
      alive = false;
    };
  }, []);
  const options = list ? voicesForLanguage(list, CUE_LANGUAGE) : [];
  return { loaded: list != null, voices: options, auto: options[0] ?? null };
}

export function buzz(kind: 'split' | 'tick') {
  if (Platform.OS === 'web') return;
  const p =
    kind === 'split'
      ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      : Haptics.selectionAsync();
  p.catch(() => {});
}

/**
 * Split, lap and auto-pause cues. Mounted in the root layout so they keep
 * working whichever screen is showing (or if the app was relaunched mid-run).
 */
export function useRunFeedback() {
  useEffect(() => {
    // Fetch voices early so the first cue doesn't wait.
    loadVoices();
    return recorder.on((e) => {
      const profile = getProfile();
      if (e.type === 'split') {
        if (profile.splitHaptics) buzz('split');
        say(splitAnnouncement(e, profile.units));
      } else if (e.type === 'lap') {
        if (profile.splitHaptics) buzz('split');
        say(lapAnnouncement(e.index, e.movingMs));
      } else if (e.type === 'autopause') {
        say('Auto paused.');
      } else if (e.type === 'autoresume') {
        say('Resumed.');
      }
    });
  }, []);
}
