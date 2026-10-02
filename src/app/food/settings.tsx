import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Linking, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useColors } from '@/components/theme';
import { Button, Card, Chip, SectionTitle } from '@/components/ui';
import { confirm } from '@/lib/confirm';
import { DEFAULT_AI_MODEL } from '@/lib/food-ai';
import { deleteOpenAiKey, getOpenAiKey, KEY_STORAGE_LABEL, setOpenAiKey } from '@/lib/secrets';
import { updateProfile, useProfile } from '@/store';

const MODELS = [DEFAULT_AI_MODEL, 'gpt-4o', 'gpt-4.1-mini'];

const mask = (key: string) => (key.length > 10 ? `${key.slice(0, 3)}…${key.slice(-4)}` : '••••');

export default function FoodSettings() {
  const c = useColors();
  const profile = useProfile();
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [mode, setMode] = useState<'key' | 'proxy'>(profile.aiProxyUrl ? 'proxy' : 'key');
  const [proxy, setProxy] = useState(profile.aiProxyUrl ?? '');
  const [model, setModel] = useState(profile.aiModel);
  const [message, setMessage] = useState('');

  useEffect(() => {
    getOpenAiKey().then(setSavedKey, () => setSavedKey(null));
  }, []);

  const saveKey = async () => {
    const key = keyInput.trim();
    if (!/^sk-[A-Za-z0-9_-]{20,}$/.test(key)) {
      setMessage('That doesn’t look like an OpenAI key. Keys start with “sk-”.');
      return;
    }
    await setOpenAiKey(key);
    updateProfile({ aiProxyUrl: null });
    setSavedKey(key);
    setKeyInput('');
    setMessage('Key saved.');
  };

  const removeKey = async () => {
    if (!(await confirm('Remove API key?', 'Photo estimates will stop until you add a key again.', 'Remove', true))) return;
    await deleteOpenAiKey();
    setSavedKey(null);
    setMessage('Key removed.');
  };

  const saveProxy = () => {
    const url = proxy.trim();
    if (!/^https:\/\/[^\s/]+/.test(url)) {
      setMessage('Enter the server’s full https:// address.');
      return;
    }
    updateProfile({ aiProxyUrl: url });
    setMessage('Server saved. Photos now go through it.');
  };

  const pickMode = (m: 'key' | 'proxy') => {
    setMode(m);
    setMessage('');
    if (m === 'key') updateProfile({ aiProxyUrl: null });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionTitle>Daily goal</SectionTitle>
        <Card style={{ gap: 16 }}>
          <View style={styles.setting}>
            <Text style={[styles.label, { color: c.text }]}>Calories</Text>
            <View style={styles.stepper}>
              <Step label="−" onPress={() => updateProfile({ calorieGoal: Math.max(1000, profile.calorieGoal - 50) })} />
              <Text style={[styles.value, { color: c.text }]}>{profile.calorieGoal.toLocaleString()} kcal</Text>
              <Step label="+" onPress={() => updateProfile({ calorieGoal: Math.min(6000, profile.calorieGoal + 50) })} />
            </View>
          </View>
          <View style={styles.setting}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: c.text }]}>Add run calories</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>Calories burned running raise that day’s budget (needs your weight in the You tab)</Text>
            </View>
            <Switch value={profile.eatBackRuns} onValueChange={(eatBackRuns) => updateProfile({ eatBackRuns })} trackColor={{ true: c.accent }} accessibilityLabel="Add run calories" />
          </View>
        </Card>

        <SectionTitle>AI photo estimates</SectionTitle>
        <Card style={{ gap: 14 }}>
          <Text style={{ color: c.muted, lineHeight: 20 }}>
            Snap a meal and OpenAI estimates its calories and macros. Pacebook never includes an API key in the app: use your own key, or
            the address of a calorie server you run (see server/openai-proxy in the project).
          </Text>
          <View style={styles.chips}>
            <Chip label="My OpenAI key" selected={mode === 'key'} onPress={() => pickMode('key')} />
            <Chip label="Calorie server" selected={mode === 'proxy'} onPress={() => pickMode('proxy')} />
          </View>

          {mode === 'key' ? (
            <View style={{ gap: 10 }}>
              {savedKey ? (
                <View style={styles.setting}>
                  <Text style={{ color: c.text, flex: 1 }}>
                    Key <Text style={{ fontWeight: '700' }}>{mask(savedKey)}</Text> saved in {KEY_STORAGE_LABEL}
                  </Text>
                  <Pressable onPress={removeKey} hitSlop={8}>
                    <Text style={{ color: c.danger, fontWeight: '700' }}>Remove</Text>
                  </Pressable>
                </View>
              ) : null}
              <TextInput
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={savedKey ? 'Replace with a new key' : 'sk-…'}
                placeholderTextColor={c.muted}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                accessibilityLabel="OpenAI API key"
              />
              <Button title="Save key" onPress={saveKey} disabled={!keyInput.trim()} />
              <Pressable onPress={() => Linking.openURL('https://platform.openai.com/api-keys')}>
                <Text style={{ color: c.accent, fontWeight: '600' }}>Create a key at platform.openai.com →</Text>
              </Pressable>
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>
                Use a key from a project with a monthly budget limit. Each photo costs a fraction of a cent with {DEFAULT_AI_MODEL}. Never
                share your key in chats or screenshots.
              </Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <TextInput
                value={proxy}
                onChangeText={setProxy}
                placeholder="https://pacebook-ai.example.workers.dev/estimate"
                placeholderTextColor={c.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
                accessibilityLabel="Calorie server address"
              />
              <Button title="Save server" onPress={saveProxy} disabled={!proxy.trim()} />
            </View>
          )}
          {message ? <Text style={{ color: c.text, fontWeight: '600' }}>{message}</Text> : null}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={[styles.label, { color: c.text }]}>Model</Text>
          <View style={styles.chips}>
            {MODELS.map((m) => (
              <Chip
                key={m}
                label={m}
                selected={model === m}
                onPress={() => {
                  setModel(m);
                  updateProfile({ aiModel: m });
                }}
              />
            ))}
          </View>
          <TextInput
            value={model}
            onChangeText={setModel}
            onEndEditing={() => updateProfile({ aiModel: model.trim() || DEFAULT_AI_MODEL })}
            onBlur={() => updateProfile({ aiModel: model.trim() || DEFAULT_AI_MODEL })}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
            accessibilityLabel="Model name"
          />
          <Text style={{ color: c.muted, fontSize: 12 }}>Any OpenAI model that accepts images and structured outputs works.</Text>
        </Card>

        {profile.aiConsentAt && (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.muted, lineHeight: 20 }}>
              You agreed to send meal photos to OpenAI on {new Date(profile.aiConsentAt).toLocaleDateString()}.
            </Text>
            <Button title="Withdraw consent" variant="secondary" onPress={() => updateProfile({ aiConsentAt: null })} />
          </Card>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Step({ label, onPress }: { label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.stepBtn, { borderColor: c.border }]}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 12, paddingBottom: 48 },
  setting: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  label: { fontSize: 16, fontWeight: '600' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  value: { fontSize: 15, fontWeight: '700', minWidth: 86, textAlign: 'center', fontVariant: ['tabular-nums'] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
});
