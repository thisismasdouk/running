import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ShoeList } from '@/components/ShoeList';
import { useColors } from '@/components/theme';
import { Button, Card, SectionTitle, Stat } from '@/components/ui';
import { VoiceSettings } from '@/components/VoiceSettings';
import { confirm } from '@/lib/confirm';
import { distanceUnit, formatDistanceValue } from '@/lib/format';
import { SAMPLE_SHOE, sampleRuns } from '@/lib/sample';
import { totals, unitLength } from '@/lib/stats';
import type { Units } from '@/lib/types';
import { deleteRun, deleteShoe, saveRun, saveShoe, updateProfile, useProfile, useRuns } from '@/store';

export default function Profile() {
  const c = useColors();
  const profile = useProfile();
  const runs = useRuns();
  const { units } = profile;
  const all = useMemo(() => totals(runs), [runs]);
  const hasSamples = runs.some((r) => r.id.startsWith('sample-'));

  // The goal is stored in metres but adjusted in whole km/mi steps.
  const goalInUnits = Math.round(profile.weeklyGoalM / unitLength(units));
  const setGoal = (n: number) => updateProfile({ weeklyGoalM: Math.max(1, Math.min(300, n)) * unitLength(units) });
  // Snap the goal to a whole number of the new unit, so the goal shown here and the
  // "x to your weekly goal" remainder on Home add up.
  const setUnits = (u: Units) => {
    if (u === units) return;
    const goal = Math.max(1, Math.min(300, Math.round(profile.weeklyGoalM / unitLength(u))));
    updateProfile({ units: u, weeklyGoalM: goal * unitLength(u) });
  };

  const toggleSamples = async () => {
    if (hasSamples) {
      if (!(await confirm('Remove sample runs?', 'Your own runs are kept.', 'Remove', true))) return;
      runs.filter((r) => r.id.startsWith('sample-')).forEach((r) => deleteRun(r.id));
      deleteShoe(SAMPLE_SHOE.id);
    } else {
      saveShoe(SAMPLE_SHOE);
      sampleRuns().forEach(saveRun);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Card style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: c.accent }]}>
          <Text style={styles.avatarText}>{(profile.name.trim()[0] ?? 'R').toUpperCase()}</Text>
        </View>
        <TextInput
          value={profile.name}
          onChangeText={(name) => updateProfile({ name })}
          style={[styles.name, { color: c.text }]}
          placeholder="Your name"
          placeholderTextColor={c.muted}
        />
        <View style={styles.row}>
          <Stat label="Runs" value={String(all.runs)} align="center" />
          <Stat label="Total" value={formatDistanceValue(all.distanceM, units, 0)} unit={distanceUnit(units)} align="center" />
          <Stat label="Longest" value={formatDistanceValue(all.longestM, units, 1)} unit={distanceUnit(units)} align="center" />
        </View>
      </Card>

      <SectionTitle>Settings</SectionTitle>
      <Card style={{ gap: 18 }}>
        <View style={styles.setting}>
          <Text style={[styles.settingLabel, { color: c.text }]}>Units</Text>
          <View style={[styles.segmented, { backgroundColor: c.track }]}>
            {(['metric', 'imperial'] as Units[]).map((u) => (
              <Pressable
                key={u}
                onPress={() => setUnits(u)}
                style={[styles.segment, units === u && { backgroundColor: c.card }]}
              >
                <Text style={{ color: units === u ? c.text : c.muted, fontWeight: '700' }}>{u === 'metric' ? 'km' : 'mi'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.setting}>
          <Text style={[styles.settingLabel, { color: c.text }]}>Weekly goal</Text>
          <View style={styles.stepper}>
            <Stepper label="−" onPress={() => setGoal(goalInUnits - 1)} />
            <Text style={[styles.goal, { color: c.text }]}>
              {goalInUnits} {distanceUnit(units)}
            </Text>
            <Stepper label="+" onPress={() => setGoal(goalInUnits + 1)} />
          </View>
        </View>

        <Toggle
          label="Split alerts"
          detail={`Buzz at every ${units === 'metric' ? 'kilometre' : 'mile'}`}
          value={profile.splitHaptics}
          onChange={(splitHaptics) => updateProfile({ splitHaptics })}
        />
        <Toggle
          label="Voice cues"
          detail="Speak your time and pace at each split, and workout steps"
          value={profile.audioCues}
          onChange={(audioCues) => updateProfile({ audioCues })}
        />
        <Toggle
          label="Auto-pause"
          detail="Stop the clock while you're standing still"
          value={profile.autoPause}
          onChange={(autoPause) => updateProfile({ autoPause })}
        />
        <Toggle
          label="Countdown"
          detail="3-2-1 before recording starts"
          value={profile.countdown}
          onChange={(countdown) => updateProfile({ countdown })}
        />
      </Card>

      <SectionTitle>Voice</SectionTitle>
      <VoiceSettings profile={profile} />

      <SectionTitle>Shoes</SectionTitle>
      <ShoeList runs={runs} units={units} defaultShoeId={profile.defaultShoeId} />

      <SectionTitle>Try it out</SectionTitle>
      <Card style={{ gap: 12 }}>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          Load a few weeks of made-up runs to explore the feed, splits and records before your next outing.
        </Text>
        <Button title={hasSamples ? 'Remove sample runs' : 'Load sample runs'} onPress={toggleSamples} variant="secondary" />
      </Card>

      <SectionTitle>About</SectionTitle>
      <Card>
        <Pressable accessibilityRole="link" onPress={() => router.push('/privacy')} style={styles.link}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.settingLabel, { color: c.text }]}>Privacy</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>Your runs never leave this device</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={c.muted} />
        </Pressable>
      </Card>
    </ScrollView>
  );
}

function Toggle({ label, detail, value, onChange }: { label: string; detail: string; value: boolean; onChange: (v: boolean) => void }) {
  const c = useColors();
  return (
    <View style={styles.setting}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.settingLabel, { color: c.text }]}>{label}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{detail}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accent }} accessibilityLabel={label} />
    </View>
  );
}

function Stepper({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={[styles.stepBtn, { borderColor: c.border }]} accessibilityRole="button">
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  hero: { alignItems: 'center', gap: 12 },
  avatar: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  name: { fontSize: 22, fontWeight: '800', textAlign: 'center', minWidth: 160 },
  row: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch' },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingLabel: { fontSize: 16, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segmented: { flexDirection: 'row', borderRadius: 10, padding: 3 },
  segment: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepBtn: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  goal: { fontSize: 16, fontWeight: '700', minWidth: 60, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
