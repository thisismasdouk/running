import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { getProfile } from '@/store';
import { splitAnnouncement } from './cues';
import { recorder } from './recorder';

/** Speaks `text` if voice cues are on. Mixes with (and ducks) music rather than stopping it. */
export function say(text: string) {
  if (!getProfile().audioCues) return;
  try {
    Speech.speak(text, { useApplicationAudioSession: false });
  } catch {
    // No speech engine (some browsers); cues are a nice-to-have.
  }
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
 * Split alerts and auto-pause cues. Mounted in the root layout so they keep
 * working whichever screen is showing (or if the app was relaunched mid-run).
 */
export function useRunFeedback() {
  useEffect(
    () =>
      recorder.on((e) => {
        const profile = getProfile();
        if (e.type === 'split') {
          if (profile.splitHaptics) buzz('split');
          say(splitAnnouncement(e, profile.units));
        } else if (e.type === 'autopause') {
          say('Auto paused.');
        } else if (e.type === 'autoresume') {
          say('Resumed.');
        }
      }),
    [],
  );
}
