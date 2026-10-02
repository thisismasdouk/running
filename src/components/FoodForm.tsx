import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { MEALS, scaleTotals, type FoodItem, type Meal, type Totals } from '@/lib/food';
import { useColors } from './theme';
import { Button, Card, Chip } from './ui';

export type FoodDraft = Totals & { name: string; meal: Meal; items?: FoodItem[] };

const PORTIONS = [
  { label: '½×', factor: 0.5 },
  { label: '¾×', factor: 0.75 },
  { label: '1×', factor: 1 },
  { label: '1¼×', factor: 1.25 },
  { label: '1½×', factor: 1.5 },
  { label: '2×', factor: 2 },
];

const toNum = (s: string) => {
  const n = Number(s.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

/**
 * Name, meal, calories and macros for a food log entry. When the entry came
 * from a photo, the AI's estimate can be scaled for a bigger or smaller
 * portion, and each recognised item is listed.
 */
export function FoodForm({ initial, onSave, saveTitle = 'Save' }: { initial: FoodDraft; onSave: (d: FoodDraft) => void; saveTitle?: string }) {
  const c = useColors();
  const [name, setName] = useState(initial.name);
  const [meal, setMeal] = useState<Meal>(initial.meal);
  const [factor, setFactor] = useState(1);
  const base: Totals = { kcal: initial.kcal, proteinG: initial.proteinG, carbsG: initial.carbsG, fatG: initial.fatG };
  const [fields, setFields] = useState(() => toFields(base));

  const pickPortion = (f: number) => {
    setFactor(f);
    setFields(toFields(scaleTotals(base, f)));
  };

  const kcal = toNum(fields.kcal);
  const save = () =>
    onSave({
      name: name.trim() || 'Food',
      meal,
      kcal,
      proteinG: toNum(fields.proteinG),
      carbsG: toNum(fields.carbsG),
      fatG: toNum(fields.fatG),
      ...(initial.items ? { items: initial.items.map((i) => (factor === 1 ? i : { ...i, ...scaleTotals(i, factor) })) } : {}),
    });

  const input = (key: keyof typeof fields, label: string, unit: string) => (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <View style={[styles.inputRow, { borderColor: c.border, backgroundColor: c.bg }]}>
        <TextInput
          value={fields[key]}
          onChangeText={(v) => setFields((f) => ({ ...f, [key]: v.replace(/[^0-9.,]/g, '') }))}
          keyboardType="decimal-pad"
          style={[styles.input, { color: c.text }]}
          placeholder="0"
          placeholderTextColor={c.muted}
          accessibilityLabel={label}
          selectTextOnFocus
        />
        <Text style={{ color: c.muted, fontWeight: '600' }}>{unit}</Text>
      </View>
    </View>
  );

  return (
    <View style={{ gap: 12 }}>
      <Card style={{ gap: 14 }}>
        <View style={styles.field}>
          <Text style={[styles.label, { color: c.muted }]}>Food</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Porridge with banana"
            placeholderTextColor={c.muted}
            style={[styles.nameInput, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
            accessibilityLabel="Food name"
          />
        </View>
        <View style={styles.chips}>
          {MEALS.map((m) => (
            <Chip key={m.key} label={m.label} selected={meal === m.key} onPress={() => setMeal(m.key)} />
          ))}
        </View>
        {initial.items && (
          <View style={styles.field}>
            <Text style={[styles.label, { color: c.muted }]}>Portion compared with the photo</Text>
            <View style={styles.chips}>
              {PORTIONS.map((p) => (
                <Chip key={p.label} label={p.label} selected={factor === p.factor} onPress={() => pickPortion(p.factor)} />
              ))}
            </View>
          </View>
        )}
        {input('kcal', 'Calories', 'kcal')}
        <View style={styles.macros}>
          {input('proteinG', 'Protein', 'g')}
          {input('carbsG', 'Carbs', 'g')}
          {input('fatG', 'Fat', 'g')}
        </View>
      </Card>

      {initial.items && initial.items.length > 0 && (
        <Card style={{ gap: 10 }}>
          <Text style={[styles.cardTitle, { color: c.text }]}>What’s on the plate</Text>
          {initial.items.map((item, i) => (
            <View key={i} style={styles.item}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '600' }}>{item.name}</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  {item.portion ? `${item.portion} · ` : ''}P {Math.round(item.proteinG * factor)} g · C {Math.round(item.carbsG * factor)} g · F{' '}
                  {Math.round(item.fatG * factor)} g
                </Text>
              </View>
              <Text style={{ color: c.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{Math.round(item.kcal * factor)} kcal</Text>
            </View>
          ))}
        </Card>
      )}

      <Button title={saveTitle} onPress={save} disabled={kcal <= 0 && !name.trim()} />
    </View>
  );
}

function toFields(t: Totals) {
  return { kcal: t.kcal ? String(t.kcal) : '', proteinG: t.proteinG ? String(t.proteinG) : '', carbsG: t.carbsG ? String(t.carbsG) : '', fatG: t.fatG ? String(t.fatG) : '' };
}

const styles = StyleSheet.create({
  field: { gap: 6, flex: 1 },
  label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  nameInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
  inputRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, gap: 6 },
  input: { flex: 1, paddingVertical: 10, fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'], minWidth: 0 },
  macros: { flexDirection: 'row', gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
