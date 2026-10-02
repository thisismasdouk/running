import Ionicons from '@expo/vector-icons/Ionicons';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useColors } from '@/components/theme';
import { Button, Card, Chip, Empty, SectionTitle } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { formatShortDate } from '@/lib/format';
import { goBack } from '@/lib/nav';
import { addDays, dayStart, daysBetween, getPlan, planLengthDays, sessionKey, sessionWorkout, startForRace } from '@/lib/plans';
import { startOfWeek } from '@/lib/stats';
import { getActivePlan, startPlan } from '@/store';

/** A plan's outline and the start (or race) date picker. */
export default function PlanSetup() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const plan = getPlan(id);
  const [today] = useState(() => dayStart(Date.now()));
  const [start, setStart] = useState(today);
  const [hasRace, setHasRace] = useState(false);
  const [race, setRace] = useState(() => (plan ? addDays(today, planLengthDays(plan)) : today));

  if (!plan) {
    return (
      <>
        <Stack.Screen options={{ title: 'Plan' }} />
        <Empty title="Plan not found" body="Pick one from the list of plans." />
      </>
    );
  }

  const startDate = hasRace ? startForRace(plan, race) : start;
  const behind = daysBetween(startDate, today);
  const nextMonday = addDays(startOfWeek(today), 7);

  const go = async () => {
    if (getActivePlan() && !(await confirm('Replace your plan?', 'Your current plan and its progress will be removed.', 'Replace', true))) return;
    startPlan(plan.id, startDate, hasRace ? race : undefined);
    goBack('/plans');
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `${plan.name} plan` }} />
      <View style={{ gap: 6 }}>
        <Text style={[styles.title, { color: c.text }]}>{plan.name}</Text>
        <Text style={{ color: c.accent, fontWeight: '700' }}>{plan.level}</Text>
        <Text style={{ color: c.muted, lineHeight: 20 }}>{plan.description}</Text>
      </View>

      <SectionTitle>When</SectionTitle>
      <Card style={{ gap: 14 }}>
        {!hasRace && (
          <>
            <DateStepper label="Start" value={start} onChange={setStart} min={today} />
            <View style={styles.chips}>
              <Chip label="Today" selected={start === today} onPress={() => setStart(today)} />
              <Chip label="Tomorrow" selected={start === addDays(today, 1)} onPress={() => setStart(addDays(today, 1))} />
              <Chip label="Next Monday" selected={start === nextMonday} onPress={() => setStart(nextMonday)} />
            </View>
          </>
        )}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowLabel, { color: c.text }]}>I have a race date</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>The plan is timed to end on race day</Text>
          </View>
          <Switch value={hasRace} onValueChange={setHasRace} trackColor={{ true: c.accent }} accessibilityLabel="I have a race date" />
        </View>
        {hasRace && <DateStepper label="Race day" value={race} onChange={setRace} min={addDays(today, 1)} weeks />}
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          {behind > 0
            ? `That race is only ${Math.ceil(daysBetween(today, race) / 7)} weeks away, so the plan starts ${formatShortDate(startDate)}: the first ${Math.ceil(behind / 7)} week${behind > 7 ? 's' : ''} will show as already past.`
            : `Starts ${formatShortDate(startDate)}, ends ${formatShortDate(addDays(startDate, planLengthDays(plan)))}.`}
        </Text>
      </Card>

      <Button title="Start plan" onPress={go} />

      <SectionTitle>Outline</SectionTitle>
      <Card style={{ gap: 10 }}>
        {plan.weeks.map((sessions, w) => (
          <View key={w} style={styles.week}>
            <Text style={[styles.weekLabel, { color: c.muted }]}>Wk {w + 1}</Text>
            <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>
              {sessions.map((s, i) => sessionWorkout(s, sessionKey(w + 1, i)).name).join(' · ')}
            </Text>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}

function DateStepper({ label, value, onChange, min, weeks }: { label: string; value: number; onChange: (d: number) => void; min: number; weeks?: boolean }) {
  const c = useColors();
  const move = (days: number) => onChange(Math.max(min, addDays(value, days)));
  const btn = (icon: keyof typeof Ionicons.glyphMap, days: number, a11y: string) => (
    <Pressable onPress={() => move(days)} style={[styles.stepBtn, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel={a11y}>
      <Ionicons name={icon} size={18} color={c.text} />
    </Pressable>
  );
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: c.text }]}>{label}</Text>
      <View style={styles.stepper}>
        {weeks && btn('play-back', -7, 'A week earlier')}
        {btn('chevron-back', -1, 'A day earlier')}
        <Text style={[styles.date, { color: c.text }]}>{formatShortDate(value)}</Text>
        {btn('chevron-forward', 1, 'A day later')}
        {weeks && btn('play-forward', 7, 'A week later')}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  title: { fontSize: 26, fontWeight: '800' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  rowLabel: { fontSize: 16, fontWeight: '600' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  date: { fontSize: 15, fontWeight: '700', minWidth: 96, textAlign: 'center' },
  week: { flexDirection: 'row', gap: 12 },
  weekLabel: { width: 40, fontWeight: '700', fontSize: 13, lineHeight: 20 },
});
