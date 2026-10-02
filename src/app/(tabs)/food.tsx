import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Rect } from 'react-native-svg';

import { useColors } from '@/components/theme';
import { Card, SectionTitle } from '@/components/ui';
import { notice } from '@/lib/confirm';
import { dailyCalories, dayKey, dayTime, entriesOn, MEALS, shiftDay, sumTotals, type FoodEntry, type Meal } from '@/lib/food';
import { setPendingPhoto } from '@/lib/food-draft';
import { getMealPhoto } from '@/lib/food-photo';
import { runCalories } from '@/lib/heartrate';
import { useFood, useProfile, useRuns } from '@/store';

function dayLabel(day: string): string {
  const today = dayKey(Date.now());
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return new Date(dayTime(day)).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

const fmt = (n: number) => Math.round(n).toLocaleString();

export default function Food() {
  const c = useColors();
  const food = useFood();
  const runs = useRuns();
  const profile = useProfile();
  const [today, setToday] = useState(() => dayKey(Date.now()));
  const [day, setDay] = useState(today);
  // Tabs stay mounted, so coming back to the tab after midnight moves on to the new day.
  useFocusEffect(
    useCallback(() => {
      const now = dayKey(Date.now());
      if (now !== today) {
        setToday(now);
        setDay(now);
      }
    }, [today]),
  );
  const [busy, setBusy] = useState(false);

  const entries = useMemo(() => entriesOn(food, day), [food, day]);
  const totals = useMemo(() => sumTotals(entries), [entries]);
  const runKm = useMemo(() => runs.filter((r) => dayKey(r.startedAt) === day).reduce((s, r) => s + r.distanceM, 0), [runs, day]);
  const burned = runCalories(profile.weightKg, runKm) ?? 0;
  const budget = profile.calorieGoal + (profile.eatBackRuns ? burned : 0);
  const left = budget - totals.kcal;
  const week = useMemo(() => dailyCalories(food, day, 7), [food, day]);

  const snap = async (source: 'camera' | 'library', meal?: Meal) => {
    if (busy) return;
    setBusy(true);
    try {
      const photo = await getMealPhoto(source);
      if (photo === 'denied') {
        await notice('Camera access needed', 'Allow camera access for Pacebook in Settings, or pick a photo from your library instead.');
        return;
      }
      if (!photo) return;
      setPendingPhoto(photo);
      router.push({ pathname: '/food/add', params: { mode: 'photo', day, ...(meal ? { meal } : {}) } });
    } catch (e) {
      await notice('Couldn’t open the photo', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const manual = (meal?: Meal) => router.push({ pathname: '/food/add', params: { mode: 'manual', day, ...(meal ? { meal } : {}) } });

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable accessibilityLabel="Food settings" onPress={() => router.push('/food/settings')} hitSlop={8} style={{ marginRight: 16 }}>
              <Ionicons name="settings-outline" size={22} color={c.accent} />
            </Pressable>
          ),
        }}
      />

      <View style={styles.dayNav}>
        <Pressable accessibilityLabel="Previous day" onPress={() => setDay(shiftDay(day, -1))} hitSlop={10}>
          <Ionicons name="chevron-back" size={24} color={c.accent} />
        </Pressable>
        <Text style={[styles.dayTitle, { color: c.text }]}>{dayLabel(day)}</Text>
        <Pressable accessibilityLabel="Next day" onPress={() => day < today && setDay(shiftDay(day, 1))} hitSlop={10} disabled={day >= today}>
          <Ionicons name="chevron-forward" size={24} color={day >= today ? c.border : c.accent} />
        </Pressable>
      </View>

      <Card style={{ gap: 14 }}>
        <View style={styles.summary}>
          <Ring value={budget > 0 ? totals.kcal / budget : 0} over={left < 0}>
            <Text style={[styles.ringValue, { color: left < 0 ? c.danger : c.text }]}>{fmt(Math.abs(left))}</Text>
            <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{left < 0 ? 'kcal over' : 'kcal left'}</Text>
          </Ring>
          <View style={{ flex: 1, gap: 8 }}>
            <SummaryRow icon="flag-outline" label="Goal" value={fmt(profile.calorieGoal)} />
            <SummaryRow icon="restaurant-outline" label="Eaten" value={fmt(totals.kcal)} />
            <SummaryRow
              icon="flame-outline"
              label={profile.weightKg ? 'Runs' : 'Runs (set weight)'}
              value={burned ? `${profile.eatBackRuns ? '+' : ''}${fmt(burned)}` : '0'}
              onPress={profile.weightKg ? undefined : () => router.push('/profile')}
            />
          </View>
        </View>
        <View style={styles.macros}>
          <Macro label="Protein" grams={totals.proteinG} color="#3B82F6" kcalPerG={4} total={totals.kcal} />
          <Macro label="Carbs" grams={totals.carbsG} color="#F59E0B" kcalPerG={4} total={totals.kcal} />
          <Macro label="Fat" grams={totals.fatG} color="#A855F7" kcalPerG={9} total={totals.kcal} />
        </View>
      </Card>

      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => snap('camera')} style={[styles.snap, { backgroundColor: c.accent, opacity: busy ? 0.6 : 1 }]}>
          <Ionicons name="camera" size={22} color="#fff" />
          <Text style={styles.snapText}>Snap a meal</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Photo from library" onPress={() => snap('library')} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="images-outline" size={22} color={c.accent} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add manually" onPress={() => manual()} style={[styles.iconBtn, { backgroundColor: c.card, borderColor: c.border }]}>
          <Ionicons name="create-outline" size={22} color={c.accent} />
        </Pressable>
      </View>

      {MEALS.map((m) => {
        const list = entries.filter((e) => e.meal === m.key);
        const kcal = sumTotals(list).kcal;
        return (
          <Card key={m.key} style={{ gap: 10 }}>
            <View style={styles.mealHead}>
              <Ionicons name={m.icon} size={18} color={c.accent} />
              <Text style={[styles.mealTitle, { color: c.text }]}>{m.label}</Text>
              <Text style={{ color: c.muted, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{kcal ? `${fmt(kcal)} kcal` : ''}</Text>
              <Pressable accessibilityLabel={`Add to ${m.label}`} onPress={() => manual(m.key)} hitSlop={8}>
                <Ionicons name="add-circle-outline" size={24} color={c.accent} />
              </Pressable>
            </View>
            {list.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </Card>
        );
      })}

      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <WeekChart days={week} goal={profile.calorieGoal} selected={day} onSelect={setDay} />
      </Card>
    </ScrollView>
  );
}

function SummaryRow({ icon, label, value, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.summaryRow}>
      <Ionicons name={icon} size={16} color={c.muted} />
      <Text style={{ color: onPress ? c.accent : c.muted, flex: 1, fontWeight: '600' }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: '800', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </Pressable>
  );
}

function Macro({ label, grams, color, kcalPerG, total }: { label: string; grams: number; color: string; kcalPerG: number; total: number }) {
  const c = useColors();
  const pct = total > 0 ? Math.min(100, Math.round(((grams * kcalPerG) / total) * 100)) : 0;
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <Text style={{ color: c.muted, fontSize: 12, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: c.text, fontWeight: '800', fontSize: 16 }}>
        {fmt(grams)} g <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>{pct}%</Text>
      </Text>
      <View style={[styles.macroTrack, { backgroundColor: c.track }]}>
        <View style={{ width: `${pct}%`, height: '100%', backgroundColor: color }} />
      </View>
    </View>
  );
}

function EntryRow({ entry }: { entry: FoodEntry }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={() => router.push(`/food/${entry.id}`)} style={({ pressed }) => [styles.entry, { opacity: pressed ? 0.6 : 1 }]}>
      {entry.photoUri ? (
        <Image source={{ uri: entry.photoUri }} style={styles.thumb} contentFit="cover" />
      ) : (
        <View style={[styles.thumb, { backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }]}>
          <Ionicons name={entry.source === 'ai' ? 'sparkles' : 'restaurant-outline'} size={18} color={c.accent} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: '600' }} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          P {entry.proteinG} g · C {entry.carbsG} g · F {entry.fatG} g{entry.source === 'ai' ? ' · AI estimate' : ''}
        </Text>
      </View>
      <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{fmt(entry.kcal)}</Text>
    </Pressable>
  );
}

function Ring({ value, over, children }: { value: number; over: boolean; children: ReactNode }) {
  const c = useColors();
  const size = 124;
  const stroke = 12;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const shown = Math.min(1, Math.max(0, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={StyleSheet.absoluteFill}>
        <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={c.track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={over ? c.danger : c.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circ * shown} ${circ}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        </Svg>
      </View>
      {children}
    </View>
  );
}

function WeekChart({ days, goal, selected, onSelect }: { days: { day: string; kcal: number }[]; goal: number; selected: string; onSelect: (d: string) => void }) {
  const c = useColors();
  const [width, setWidth] = useState(0);
  const height = 120;
  const max = Math.max(goal * 1.2, ...days.map((d) => d.kcal));
  const slot = width / days.length;
  const goalY = height - (goal / max) * height;
  const avg = days.filter((d) => d.kcal > 0);
  return (
    <View style={{ gap: 6 }}>
      <View style={{ height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {width > 0 && (
          <Svg width={width} height={height}>
            {days.map((d, i) => {
              const h = (d.kcal / max) * height;
              return (
                <Rect
                  key={d.day}
                  x={i * slot + slot * 0.2}
                  y={height - h}
                  width={slot * 0.6}
                  height={Math.max(h, 2)}
                  rx={4}
                  fill={d.kcal > goal ? c.danger : d.day === selected ? c.accent : c.border}
                  opacity={d.day === selected || d.kcal > goal ? 1 : 0.9}
                />
              );
            })}
            <Line x1={0} x2={width} y1={goalY} y2={goalY} stroke={c.muted} strokeDasharray="4 4" strokeWidth={1} />
          </Svg>
        )}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {days.map((d) => (
          <Pressable key={d.day} onPress={() => onSelect(d.day)} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: d.day === selected ? c.accent : c.muted, fontSize: 11, fontWeight: '700' }}>
              {new Date(dayTime(d.day)).toLocaleDateString(undefined, { weekday: 'narrow' })}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>
        Dashed line: {fmt(goal)} kcal goal{avg.length ? ` · average ${fmt(avg.reduce((s, d) => s + d.kcal, 0) / avg.length)} kcal on logged days` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  dayNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayTitle: { fontSize: 18, fontWeight: '800' },
  summary: { flexDirection: 'row', alignItems: 'center', gap: 18 },
  ringValue: { fontSize: 26, fontWeight: '900', fontVariant: ['tabular-nums'] },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  macros: { flexDirection: 'row', gap: 14 },
  macroTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  actions: { flexDirection: 'row', gap: 10 },
  snap: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 999, paddingVertical: 14 },
  snapText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  iconBtn: { width: 52, borderRadius: 26, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mealTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumb: { width: 44, height: 44, borderRadius: 10 },
});
