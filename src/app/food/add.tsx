import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { FoodForm, type FoodDraft } from '@/components/FoodForm';
import { useColors } from '@/components/theme';
import { Button, Card } from '@/components/ui';
import { dayKey, dayTime, mealForTime, MEALS, newFoodId, type Meal } from '@/lib/food';
import { analyseFoodPhoto, FoodAiError, type FoodAnalysis } from '@/lib/food-ai';
import { getPendingPhoto, setPendingPhoto } from '@/lib/food-draft';
import { keepMealPhoto } from '@/lib/meal-files';
import { goBack } from '@/lib/nav';
import { getOpenAiKey } from '@/lib/secrets';
import { saveFood, updateProfile, useProfile } from '@/store';

type Phase = 'idle' | 'consent' | 'setup' | 'analysing' | 'error' | 'done';

export default function AddFood() {
  const c = useColors();
  const params = useLocalSearchParams<{ mode?: string; day?: string; meal?: string }>();
  const profile = useProfile();
  const [openedAt] = useState(() => Date.now());
  const day = params.day ?? dayKey(openedAt);
  const [photo] = useState(() => (params.mode === 'photo' ? getPendingPhoto() : null));
  const meal: Meal = MEALS.some((m) => m.key === params.meal) ? (params.meal as Meal) : mealForTime(openedAt);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    async (withNote: string, justConsented = false) => {
      if (!photo) return;
      if (!profile.aiConsentAt && !justConsented) return setPhase('consent');
      const apiKey = profile.aiProxyUrl ? null : await getOpenAiKey();
      if (!profile.aiProxyUrl && !apiKey) return setPhase('setup');
      setPhase('analysing');
      abort.current?.abort();
      abort.current = new AbortController();
      try {
        const result = await analyseFoodPhoto(photo.base64, { apiKey, proxyUrl: profile.aiProxyUrl, model: profile.aiModel }, withNote, abort.current.signal);
        setAnalysis(result);
        setPhase('done');
      } catch (e) {
        if ((e as Error)?.name === 'AbortError') return;
        setError(e instanceof FoodAiError ? e.message : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`);
        setPhase('error');
      }
    },
    [photo, profile.aiConsentAt, profile.aiProxyUrl, profile.aiModel],
  );

  // Estimate straight away; the note box lets the runner re-run it with more context.
  const started = useRef(false);
  useEffect(() => {
    if (photo && !started.current) {
      started.current = true;
      void run('');
    }
  }, [photo, run]);

  const save = async (d: FoodDraft) => {
    const id = newFoodId();
    const photoUri = photo ? await keepMealPhoto(photo.uri, id) : undefined;
    saveFood({
      id,
      day,
      at: day === dayKey(Date.now()) ? Date.now() : dayTime(day),
      meal: d.meal,
      name: d.name,
      kcal: d.kcal,
      proteinG: d.proteinG,
      carbsG: d.carbsG,
      fatG: d.fatG,
      ...(d.items ? { items: d.items } : {}),
      source: analysis ? 'ai' : 'manual',
      ...(photoUri ? { photoUri } : {}),
    });
    setPendingPhoto(null);
    goBack('/food');
  };

  if (params.mode === 'photo' && !photo) {
    return (
      <View style={[styles.center, { backgroundColor: c.bg }]}>
        <Text style={{ color: c.muted }}>The photo is no longer available. Take it again from the Food tab.</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {photo && <Image source={{ uri: photo.uri }} style={styles.photo} contentFit="cover" />}

        {photo && phase === 'consent' && (
          <Card style={{ gap: 12 }}>
            <View style={styles.row}>
              <Ionicons name="sparkles" size={20} color={c.accent} />
              <Text style={[styles.title, { color: c.text }]}>Estimate calories with AI</Text>
            </View>
            <Text style={[styles.body, { color: c.muted }]}>
              To estimate this meal, the photo and any note you add are sent to OpenAI{profile.aiProxyUrl ? ' through your calorie server' : ''}.
              Nothing else is sent, and your food log stays on this phone. OpenAI doesn’t train its models on API data by default and may keep
              it for up to 30 days to prevent abuse.
            </Text>
            <Text style={[styles.body, { color: c.muted }]}>Estimates are a guide, not medical or dietary advice.</Text>
            <Button
              title="Agree and estimate"
              onPress={() => {
                updateProfile({ aiConsentAt: Date.now() });
                void run(note, true);
              }}
            />
            <Button title="Enter it myself" variant="secondary" onPress={() => setPhase('done')} />
          </Card>
        )}

        {photo && phase === 'setup' && (
          <Card style={{ gap: 12 }}>
            <Text style={[styles.title, { color: c.text }]}>Connect the AI</Text>
            <Text style={[styles.body, { color: c.muted }]}>
              Photo estimates use OpenAI. Add your own OpenAI API key (it stays on this phone) or a Pacebook calorie server address in Food
              settings, then come back to this photo.
            </Text>
            <Button title="Open AI settings" onPress={() => router.push('/food/settings')} />
            <Button title="Try again" variant="secondary" onPress={() => run(note)} />
            <Button title="Enter it myself" variant="secondary" onPress={() => setPhase('done')} />
          </Card>
        )}

        {phase === 'analysing' && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator color={c.accent} />
            <Text style={{ color: c.text, fontWeight: '600' }}>Looking at your meal…</Text>
          </Card>
        )}

        {phase === 'error' && (
          <Card style={{ gap: 12 }}>
            <Text style={[styles.title, { color: c.danger }]}>Couldn’t estimate</Text>
            <Text style={[styles.body, { color: c.text }]}>{error}</Text>
            <Button title="Try again" onPress={() => run(note)} />
            <Button title="Enter it myself" variant="secondary" onPress={() => setPhase('done')} />
          </Card>
        )}

        {analysis && phase === 'done' && (
          <Card style={{ gap: 6 }}>
            <View style={styles.row}>
              <Ionicons name="sparkles" size={16} color={c.accent} />
              <Text style={{ color: c.text, fontWeight: '700', flex: 1 }}>AI estimate · {analysis.confidence} confidence</Text>
            </View>
            {analysis.notes ? <Text style={[styles.body, { color: c.muted }]}>{analysis.notes}</Text> : null}
          </Card>
        )}

        {photo && (phase === 'done' || phase === 'error') && profile.aiConsentAt != null && (
          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.muted, fontSize: 13 }}>Anything the photo doesn’t show? Add it and re-estimate.</Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              placeholder="e.g. cooked in butter, large bowl, half eaten"
              placeholderTextColor={c.muted}
              style={[styles.note, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
              accessibilityLabel="Note for the AI"
            />
            <Button title="Re-estimate" variant="secondary" onPress={() => run(note)} disabled={!note.trim()} />
          </Card>
        )}

        {(!photo || phase === 'done') && (
          <FoodForm
            key={analysis ? `ai-${analysis.kcal}-${analysis.name}` : 'manual'}
            initial={
              analysis
                ? { name: analysis.name, meal, kcal: analysis.kcal, proteinG: analysis.proteinG, carbsG: analysis.carbsG, fatG: analysis.fatG, items: analysis.items }
                : { name: '', meal, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0 }
            }
            onSave={save}
            saveTitle="Add to log"
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 17, fontWeight: '800' },
  body: { fontSize: 14, lineHeight: 20 },
  note: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
