import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatShortDate } from '@/lib/format';
import { currentWeek, getPlan, planFinished, planSchedule, upNext, weekProgress, type ScheduledSession } from '@/lib/plans';
import { workoutSummary } from '@/lib/workouts';
import { useActivePlan } from '@/store';
import { useColors } from './theme';
import { Card, LinkRow, SectionTitle } from './ui';

/** The active plan's schedule as of now; null when no plan is being followed. */
function usePlanToday() {
  const active = useActivePlan();
  // Tabs stay mounted, so "today" is re-read whenever the app comes back to the foreground.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setNow(Date.now());
    });
    return () => sub.remove();
  }, []);
  return useMemo(() => {
    const plan = getPlan(active?.planId);
    if (!active || !plan) return null;
    const schedule = planSchedule(plan, active, now);
    const week = currentWeek(plan, active, now);
    return { plan, schedule, week, progress: weekProgress(schedule, week), ...upNext(schedule, now), finished: planFinished(schedule) };
  }, [active, now]);
}

const openSession = (s: ScheduledSession) => router.push({ pathname: '/workouts/[id]', params: { id: s.workout.id, session: s.key } });

/** Home's "Today's session" card. Renders nothing without an active plan. */
export function TodaySession() {
  const c = useColors();
  const t = usePlanToday();
  if (!t) return null;

  if (t.finished) {
    return (
      <Pressable accessibilityRole="button" onPress={() => router.push('/plans')}>
        <Card style={{ gap: 4 }}>
          <Text style={[styles.title, { color: c.text }]}>{t.plan.name} plan complete 🎉</Text>
          <Text style={{ color: c.muted }}>Finish it and pick your next goal.</Text>
        </Card>
      </Pressable>
    );
  }

  // Today's session while it's still to do; otherwise the next one.
  const todo = t.today && (t.today.state === 'today' || t.today.state === 'missed') ? t.today : null;
  const shown = todo ?? t.next;
  const doneToday = t.today?.state === 'done';
  const heading = todo ? 'Today’s session' : doneToday ? 'Done for today ✓' : 'Rest day';

  return (
    <Pressable accessibilityRole="button" onPress={() => (shown ? openSession(shown) : router.push('/plans'))}>
      {({ pressed }) => (
        <Card style={{ gap: 8, opacity: pressed ? 0.85 : 1, ...(todo ? { borderColor: c.accent } : {}) }}>
          <View style={styles.row}>
            <Text style={[styles.title, { color: doneToday ? c.good : c.text }]}>{heading}</Text>
            <Text style={{ color: c.muted, fontWeight: '600', fontSize: 13 }}>
              Week {t.week} · {t.progress.done}/{t.progress.total}
            </Text>
          </View>
          {shown ? (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                {!todo && <Text style={{ color: c.muted, fontSize: 13 }}>Next · {formatShortDate(shown.date)}</Text>}
                <Text style={[styles.session, { color: c.text }]}>{shown.workout.name}</Text>
                {shown.session.kind === 'workout' && <Text style={{ color: c.muted, fontSize: 13 }}>{workoutSummary(shown.workout)}</Text>}
              </View>
              <Ionicons name={todo ? 'play-circle' : 'chevron-forward'} size={todo ? 36 : 20} color={todo ? c.accent : c.muted} />
            </View>
          ) : (
            <Text style={{ color: c.muted }}>No more sessions this plan.</Text>
          )}
        </Card>
      )}
    </Pressable>
  );
}

/** Progress tab's Training section: the plan and the workout library. */
export function TrainingSection() {
  const c = useColors();
  const t = usePlanToday();
  const done = t ? t.schedule.filter((s) => s.state === 'done').length : 0;
  return (
    <>
      <SectionTitle>Training</SectionTitle>
      <Card style={{ gap: 12 }}>
        <LinkRow
          icon="calendar-outline"
          title={t ? `${t.plan.name} plan` : 'Training plans'}
          detail={
            t
              ? t.finished
                ? `Complete · ${done}/${t.schedule.length} sessions`
                : `Week ${t.week} of ${t.plan.weeks.length} · ${done}/${t.schedule.length} sessions done`
              : '5K, 10K and half marathon'
          }
          onPress={() => router.push('/plans')}
        />
        <View style={[styles.divider, { backgroundColor: c.border }]} />
        <LinkRow icon="barbell-outline" title="Workouts" detail="Intervals, tempo and your own, with voice guidance" onPress={() => router.push('/workouts')} />
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  title: { fontSize: 18, fontWeight: '700' },
  session: { fontSize: 17, fontWeight: '700' },
  divider: { height: StyleSheet.hairlineWidth },
});
