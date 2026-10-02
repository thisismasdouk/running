import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { testVoice, useVoices } from '@/lib/feedback';
import type { Profile } from '@/lib/types';
import { clampRate, SPEECH_RATES, voiceTier } from '@/lib/voices';
import { updateProfile } from '@/store';
import { useColors } from './theme';
import { Button, Card } from './ui';

const speedWord = (rate: number) => (rate < 0.97 ? 'Slower' : rate > 1.03 ? 'Faster' : 'Normal');

/** Voice picker, speed and a test button for the spoken cues (You tab). */
export function VoiceSettings({ profile }: { profile: Profile }) {
  const c = useColors();
  const { loaded, voices, auto } = useVoices();
  const [open, setOpen] = useState(false);
  const chosen = profile.voiceId ? voices.find((v) => v.identifier === profile.voiceId) : undefined;
  const current = chosen ?? auto;
  const rate = clampRate(profile.speechRate);
  const rateIndex = SPEECH_RATES.findIndex((r) => Math.abs(r - rate) < 0.001);

  const choose = (voiceId: string | null) => {
    updateProfile({ voiceId });
    testVoice(voiceId, rate, profile.units);
  };
  const setRate = (i: number) => {
    const next = SPEECH_RATES[Math.max(0, Math.min(SPEECH_RATES.length - 1, i))];
    updateProfile({ speechRate: next });
  };

  let currentText = 'Loading voices…';
  if (loaded) {
    if (!current) currentText = 'System default';
    else currentText = chosen ? current.name : `Automatic · ${current.name}`;
  }

  return (
    <Card style={{ gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Voice: ${currentText}. ${open ? 'Hide' : 'Show'} voices`}
        onPress={() => setOpen(!open)}
        style={styles.row}
        disabled={loaded && voices.length === 0}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.text }]}>Voice</Text>
          <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
            {currentText}
            {current ? ` · ${voiceTier(current)}` : ''}
          </Text>
        </View>
        {voices.length > 0 && <Text style={{ color: c.accent, fontWeight: '700' }}>{open ? 'Done' : 'Change'}</Text>}
      </Pressable>

      {open && (
        <View style={[styles.list, { borderColor: c.border }]}>
          <VoiceRow
            title="Automatic"
            detail={auto ? `Best available: ${auto.name}` : 'Best available'}
            selected={!profile.voiceId || !chosen}
            onPress={() => choose(null)}
          />
          {voices.map((v) => (
            <VoiceRow
              key={v.identifier}
              title={v.name}
              detail={`${voiceTier(v)} · ${v.language}`}
              selected={chosen?.identifier === v.identifier}
              onPress={() => choose(v.identifier)}
            />
          ))}
        </View>
      )}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.text }]}>Speed</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>{speedWord(rate)}</Text>
        </View>
        <View style={styles.stepper}>
          <StepButton label="−" accessibilityLabel="Slower" onPress={() => setRate(rateIndex - 1)} />
          <Text style={[styles.rate, { color: c.text }]}>{rate.toFixed(2)}×</Text>
          <StepButton label="+" accessibilityLabel="Faster" onPress={() => setRate(rateIndex + 1)} />
        </View>
      </View>

      <Button title="Test voice" onPress={() => testVoice(profile.voiceId, rate, profile.units)} variant="secondary" />
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
        On iPhone, more natural voices can be downloaded in Settings → Accessibility → Spoken Content → Voices. Look for
        Enhanced or Premium ones, then pick them here.
      </Text>
    </Card>
  );
}

function VoiceRow({ title, detail, selected, onPress }: { title: string; detail: string; selected: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.voice, { borderColor: c.border }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600' }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>{detail}</Text>
      </View>
      {selected && <Ionicons name="checkmark" size={20} color={c.accent} />}
    </Pressable>
  );
}

function StepButton({ label, accessibilityLabel, onPress }: { label: string; accessibilityLabel: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.stepBtn, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  list: { borderTopWidth: StyleSheet.hairlineWidth },
  voice: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  rate: { fontSize: 16, fontWeight: '700', minWidth: 52, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
