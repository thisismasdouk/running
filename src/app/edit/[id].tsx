import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { useColors } from '@/components/theme';
import { Button, Card, Stat } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { distanceUnit, formatDistanceValue, formatDuration, formatPaceValue, paceUnit } from '@/lib/format';
import { paceSecPerKm } from '@/lib/stats';
import { deleteRun, updateRun, useProfile, useRun } from '@/store';

const EFFORT_LABELS = ['Easy', 'Easy', 'Moderate', 'Moderate', 'Moderate', 'Hard', 'Hard', 'Very hard', 'Very hard', 'Max effort'];

export default function EditRun() {
  const c = useColors();
  const { id, fresh } = useLocalSearchParams<{ id: string; fresh?: string }>();
  const run = useRun(id);
  const { units } = useProfile();
  const isNew = fresh === '1';
  const [title, setTitle] = useState(run?.title ?? '');
  const [notes, setNotes] = useState(run?.notes ?? '');
  const [effort, setEffort] = useState<number | null>(run?.effort ?? null);

  if (!run) return null;

  const save = () => {
    updateRun(run.id, { title: title.trim() || run.title, notes: notes.trim(), effort });
    if (isNew) router.replace(`/run/${run.id}`);
    else router.back();
  };

  const discard = async () => {
    if (!(await confirm('Discard run?', 'This run will be deleted and cannot be recovered.', 'Discard', true))) return;
    deleteRun(run.id);
    router.back();
  };

  const input = [styles.input, { color: c.text, backgroundColor: c.card, borderColor: c.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: isNew ? 'Save Run' : 'Edit Run', gestureEnabled: !isNew }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {isNew && (
          <Card style={styles.summary}>
            <Stat label="Distance" value={formatDistanceValue(run.distanceM, units)} unit={distanceUnit(units)} />
            <Stat label="Time" value={formatDuration(run.movingMs)} />
            <Stat label="Pace" value={formatPaceValue(paceSecPerKm(run.distanceM, run.movingMs), units)} unit={paceUnit(units)} />
          </Card>
        )}

        <Text style={[styles.label, { color: c.muted }]}>Title</Text>
        <TextInput value={title} onChangeText={setTitle} style={input} placeholder="Name your run" placeholderTextColor={c.muted} />

        <Text style={[styles.label, { color: c.muted }]}>How did it feel?</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[input, { minHeight: 90, textAlignVertical: 'top' }]}
          placeholder="Legs felt fresh, windy on the bridge…"
          placeholderTextColor={c.muted}
          multiline
        />

        <Text style={[styles.label, { color: c.muted }]}>
          Perceived effort{effort ? ` · ${effort}/10 ${EFFORT_LABELS[effort - 1]}` : ''}
        </Text>
        <View style={styles.effortRow}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const on = effort != null && n <= effort;
            return (
              <Pressable
                key={n}
                accessibilityLabel={`Effort ${n}`}
                onPress={() => setEffort(effort === n ? null : n)}
                style={[styles.effort, { backgroundColor: on ? c.accent : c.card, borderColor: on ? c.accent : c.border }]}
              >
                <Text style={{ color: on ? '#fff' : c.muted, fontWeight: '700' }}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        <Button title={isNew ? 'Save Run' : 'Save changes'} onPress={save} style={{ marginTop: 24 }} />
        {isNew && <Button title="Discard" onPress={discard} variant="secondary" style={{ marginTop: 12 }} />}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  summary: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 16 },
  effortRow: { flexDirection: 'row', gap: 4 },
  effort: { flex: 1, aspectRatio: 1, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', maxWidth: 44 },
});
