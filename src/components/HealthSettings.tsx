import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { notice } from '@/lib/confirm';
import { healthUnavailableReason, requestHealthAccess } from '@/lib/health';
import { DEFAULT_MAX_HR } from '@/lib/heartrate';
import type { Profile } from '@/lib/types';
import { updateProfile } from '@/store';
import { useColors } from './theme';
import { Card } from './ui';

const LB_PER_KG = 2.20462;

/** Apple Health sync, plus the body numbers used for heart-rate zones and calories. */
export function HealthSettings({ profile }: { profile: Profile }) {
  const c = useColors();
  const unavailable = healthUnavailableReason();
  const imperial = profile.units === 'imperial';
  const maxHr = profile.maxHr ?? DEFAULT_MAX_HR;
  const weight = profile.weightKg == null ? null : Math.round(imperial ? profile.weightKg * LB_PER_KG : profile.weightKg);

  const toggle = async (on: boolean) => {
    if (!on) return updateProfile({ healthSync: false });
    if (unavailable) return notice('Apple Health', unavailable);
    await requestHealthAccess();
    updateProfile({ healthSync: true });
  };

  const setWeight = (v: number) => {
    const shown = Math.min(imperial ? 500 : 230, Math.max(imperial ? 66 : 30, v));
    updateProfile({ weightKg: imperial ? Math.round((shown / LB_PER_KG) * 10) / 10 : shown });
  };

  return (
    <Card style={{ gap: 18 }}>
      <View style={styles.setting}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.text }]}>Apple Health</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {unavailable ?? 'Save runs as workouts with their route, and show heart rate from your Apple Watch'}
          </Text>
        </View>
        <Switch
          value={profile.healthSync && !unavailable}
          onValueChange={toggle}
          disabled={!!unavailable && !profile.healthSync}
          trackColor={{ true: c.accent }}
          accessibilityLabel="Apple Health"
        />
      </View>
      {profile.healthSync && !unavailable && (
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
          To change what Pacebook can read or write, open Settings → Health → Data Access & Devices → Pacebook.
        </Text>
      )}

      <View style={styles.setting}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.text }]}>Max heart rate</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>Sets your heart-rate zones</Text>
        </View>
        <Stepper value={`${maxHr} bpm`} onMinus={() => updateProfile({ maxHr: Math.max(120, maxHr - 1) })} onPlus={() => updateProfile({ maxHr: Math.min(230, maxHr + 1) })} />
      </View>

      <View style={styles.setting}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: c.text }]}>Weight</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>For calories burned</Text>
        </View>
        {weight == null ? (
          <Pressable accessibilityRole="button" onPress={() => setWeight(imperial ? 154 : 70)} style={[styles.setBtn, { borderColor: c.border }]}>
            <Text style={{ color: c.accent, fontWeight: '700' }}>Set</Text>
          </Pressable>
        ) : (
          <Stepper value={`${weight} ${imperial ? 'lb' : 'kg'}`} onMinus={() => setWeight(weight - 1)} onPlus={() => setWeight(weight + 1)} />
        )}
      </View>
    </Card>
  );
}

function Stepper({ value, onMinus, onPlus }: { value: string; onMinus: () => void; onPlus: () => void }) {
  const c = useColors();
  return (
    <View style={styles.stepper}>
      <Pressable accessibilityRole="button" accessibilityLabel="Decrease" onPress={onMinus} style={[styles.stepBtn, { borderColor: c.border }]}>
        <Text style={[styles.stepText, { color: c.text }]}>−</Text>
      </Pressable>
      <Text style={[styles.value, { color: c.text }]}>{value}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Increase" onPress={onPlus} style={[styles.stepBtn, { borderColor: c.border }]}>
        <Text style={[styles.stepText, { color: c.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 20, fontWeight: '700' },
  value: { fontSize: 15, fontWeight: '700', minWidth: 64, textAlign: 'center', fontVariant: ['tabular-nums'] },
  setBtn: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
});
