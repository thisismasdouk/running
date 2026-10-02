import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useColors, type Colors } from '@/components/theme';
import { Button, Card, ProgressBar, SectionTitle } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { formatShortDate } from '@/lib/format';
import { currentWeek, getPlan, planFinished, planSchedule, PLANS, weekProgress, type ScheduledSession, type SessionState, type TrainingPlan } from '@/lib/plans';
import type { ActivePlan } from '@/lib/types';
import { workoutSummary } from '@/lib/workouts';
import { leavePlan, useActivePlan } from '@/store';

/** The plan being followed, week by week, or the plans to choose from. */
export default function Plans() {
  const active = useActivePlan();
  const plan = getPlan(active?.planId);
  if (active && plan) return <ActivePlanView plan={plan} active={active} />;
  return <PlanPicker />;
}

function PlanPicker() {
  const c = useColors();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Text style={{ color: c.muted, lineHeight: 20 }}>
        Pick a goal and a start date (or your race date). Today’s session shows on Home, and runs you save tick sessions off by
        themselves.
      </Text>
      {PLANS.map((p) => (
        <Pressable key={p.id} accessibilityRole="button" onPress={() => router.push({ pathname: '/plans/[id]', params: { id: p.id } })}>
          {({ pressed }) => (
            <Card style={{ gap: 6, opacity: pressed ? 0.8 : 1 }}>
              <View style={styles.row}>
                <Text style={[styles.planName, { color: c.text }]}>{p.name}</Text>
                <Ionicons name="chevron-forward" size={20} color={c.muted} />
              </View>
              <Text style={{ color: c.accent, fontWeight: '700', fontSize: 13 }}>{p.level}</Text>
              <Text style={{ color: c.muted, lineHeight: 20 }}>{p.description}</Text>
            </Card>
          )}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const STATE_LABELS: Record<SessionState, string> = { done: 'Done', skipped: 'Skipped', missed: 'Missed', today: 'Today', upcoming: '' };

function stateIcon(state: SessionState, c: Colors): { name: keyof typeof Ionicons.glyphMap; color: string } {
  switch (state) {
    case 'done':
      return { name: 'checkmark-circle', color: c.good };
    case 'skipped':
      return { name: 'remove-circle-outline', color: c.muted };
    case 'missed':
      return { name: 'alert-circle-outline', color: c.warn };
    case 'today':
      return { name: 'play-circle', color: c.accent };
    default:
      return { name: 'ellipse-outline', color: c.border };
  }
}

function ActivePlanView({ plan, active }: { plan: TrainingPlan; active: ActivePlan }) {
  const c = useColors();
  const schedule = useMemo(() => planSchedule(plan, active), [plan, active]);
  const week = currentWeek(plan, active);
  const thisWeek = weekProgress(schedule, week);
  const done = schedule.filter((s) => s.state === 'done').length;
  const finished = planFinished(schedule);

  const leave = async () => {
    const ok = await confirm(
      finished ? 'Finish this plan?' : 'Leave plan?',
      'Your runs are kept. The plan and its ticked-off sessions are removed.',
      finished ? 'Finish' : 'Leave',
      !finished,
    );
    if (ok) leavePlan();
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Card style={{ gap: 10 }}>
        <Text style={[styles.planName, { color: c.text }]}>{plan.name} plan</Text>
        <Text style={{ color: c.muted }}>
          {finished ? 'Plan complete 🎉' : `Week ${week} of ${plan.weeks.length} · this week ${thisWeek.done}/${thisWeek.total}`}
          {active.raceDate ? ` · race ${formatShortDate(active.raceDate)}` : ''}
        </Text>
        <ProgressBar value={done / schedule.length} />
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {done} of {schedule.length} sessions done
        </Text>
      </Card>

      {plan.weeks.map((_, w) => {
        const n = w + 1;
        const sessions = schedule.filter((s) => s.week === n);
        const p = weekProgress(schedule, n);
        return (
          <View key={n} style={{ gap: 8 }}>
            <View style={styles.row}>
              <SectionTitle>Week {n}</SectionTitle>
              <Text style={{ color: n === week ? c.accent : c.muted, fontWeight: '700' }}>
                {n === week ? 'This week · ' : ''}
                {p.done}/{p.total}
              </Text>
            </View>
            <Card style={n === week ? { gap: 4, borderColor: c.accent } : { gap: 4 }}>
              {sessions.map((s) => (
                <SessionRow key={s.key} s={s} />
              ))}
            </Card>
          </View>
        );
      })}

      <Button title={finished ? 'Finish plan' : 'Leave plan'} onPress={leave} variant={finished ? 'primary' : 'secondary'} style={{ marginTop: 12 }} />
    </ScrollView>
  );
}

function SessionRow({ s }: { s: ScheduledSession }) {
  const c = useColors();
  const icon = stateIcon(s.state, c);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/workouts/[id]', params: { id: s.workout.id, session: s.key } })}
      style={({ pressed }) => [styles.session, { opacity: pressed ? 0.6 : 1 }]}
    >
      <Ionicons name={icon.name} size={22} color={icon.color} />
      <View style={{ flex: 1 }}>
        <Text style={[styles.sessionName, { color: s.state === 'skipped' ? c.muted : c.text }]} numberOfLines={1}>
          {s.workout.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
          {formatShortDate(s.date)}
          {s.session.kind === 'workout' ? ` · ${workoutSummary(s.workout)}` : ''}
        </Text>
      </View>
      {STATE_LABELS[s.state] ? <Text style={{ color: icon.color, fontSize: 12, fontWeight: '700' }}>{STATE_LABELS[s.state]}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  planName: { fontSize: 20, fontWeight: '800' },
  session: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6 },
  sessionName: { fontSize: 15, fontWeight: '600' },
});
