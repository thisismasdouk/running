import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { useColors } from '@/components/theme';
import { Button, Card, Chip } from '@/components/ui';
import { CHATGPT_USAGE_URL, getFreshSession, hasPlanAccess, listChatgptModels, loadSession, signOut, type ChatgptModel, type ChatgptSession } from '@/lib/chatgpt';
import { chatgptConfig, signInWithChatgpt } from '@/lib/chatgpt-auth';
import { confirm } from '@/lib/confirm';
import { updateProfile, useProfile } from '@/store';

/**
 * "Use your ChatGPT plan" in Food → AI settings: Continue with ChatGPT, the
 * signed-in account, the model for photo estimates, and sign out. Renders
 * nothing until OpenAI has issued a client ID (`extra.chatgpt.clientId`).
 */
export function ChatgptSettings({ onChange }: { onChange?: (planInUse: boolean) => void }) {
  const c = useColors();
  const profile = useProfile();
  const [session, setSession] = useState<ChatgptSession | null>(null);
  const [loadedModels, setModels] = useState<ChatgptModel[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const plan = hasPlanAccess(session);
  const models = plan ? loadedModels : [];

  const apply = useCallback(
    (next: ChatgptSession | null) => {
      setSession(next);
      onChange?.(hasPlanAccess(next));
    },
    [onChange],
  );

  useEffect(() => {
    loadSession(chatgptConfig).then(apply, () => apply(null));
  }, [apply]);

  // The model list belongs to the account, so it's reloaded when the account changes.
  const subject = session?.subject;
  useEffect(() => {
    if (!subject || !plan) return;
    let stale = false;
    getFreshSession(chatgptConfig)
      .then((fresh) => (fresh ? listChatgptModels(fresh.accessToken) : []))
      .then(
        (list) => !stale && setModels(list),
        () => !stale && setModels([]),
      );
    return () => {
      stale = true;
    };
  }, [subject, plan]);

  if (!chatgptConfig) {
    return __DEV__ ? (
      <Card>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          Continue with ChatGPT appears here once OpenAI has issued a client ID. Paste it into extra.chatgpt.clientId in app.json.
        </Text>
      </Card>
    ) : null;
  }

  const signIn = async (enablePlan = false) => {
    setBusy(true);
    setMessage('');
    try {
      const next = await signInWithChatgpt({ enablePlan });
      if (!next) return;
      apply(next);
      if (!hasPlanAccess(next)) setMessage('Signed in, but ChatGPT plan use wasn’t allowed. Photo estimates use Pacebook AI or your OpenAI key instead.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'ChatGPT sign-in couldn’t be completed.');
    } finally {
      setBusy(false);
    }
  };

  const leave = async () => {
    if (!(await confirm('Sign out of ChatGPT?', 'Photo estimates will use Pacebook AI or your OpenAI key, if you’ve set one up.', 'Sign out', true))) return;
    setBusy(true);
    const { revoked } = await signOut(chatgptConfig).catch(() => ({ revoked: false }));
    updateProfile({ chatgptModel: null });
    apply(null);
    setBusy(false);
    setMessage(revoked ? 'Signed out.' : 'Signed out on this phone. ChatGPT couldn’t be reached to confirm, so also disconnect Pacebook in ChatGPT settings.');
  };

  const selected = models.find((m) => m.slug === profile.chatgptModel)?.slug ?? models[0]?.slug;

  return (
    <Card style={{ gap: 12 }}>
      <Text style={[styles.title, { color: c.text }]}>Use your ChatGPT plan</Text>

      {!session ? (
        <>
          <Text style={{ color: c.muted, lineHeight: 20 }}>
            Estimate meal photos with usage included in your ChatGPT plan or credits balance, with no API key. Pacebook doesn’t charge for this,
            and it can’t see your ChatGPT conversations.
          </Text>
          <Button title="Continue with ChatGPT" onPress={() => signIn()} disabled={busy} />
        </>
      ) : (
        <>
          {plan && !profile.chatgptWelcomeSeen && (
            <View style={[styles.notice, { borderColor: c.border, backgroundColor: c.bg }]}>
              <Text style={{ color: c.text, fontWeight: '700' }}>You’re using your ChatGPT plan</Text>
              <Text style={{ color: c.muted, lineHeight: 20 }}>Eligible usage in this app uses your ChatGPT plan. Manage usage in your ChatGPT settings.</Text>
              <Button title="Got it" variant="secondary" onPress={() => updateProfile({ chatgptWelcomeSeen: true })} />
            </View>
          )}
          <Text style={{ color: c.text }}>
            Signed in{session.email ? ' as ' : ''}
            {session.email ? <Text style={{ fontWeight: '700' }}>{session.email}</Text> : null}
          </Text>
          {plan ? (
            <View style={styles.row}>
              <Text style={{ color: c.muted, flex: 1 }}>Using ChatGPT plan for photo estimates</Text>
              <Pressable onPress={() => Linking.openURL(CHATGPT_USAGE_URL)} hitSlop={8} accessibilityRole="link">
                <Text style={{ color: c.accent, fontWeight: '700' }}>Manage usage</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <Text style={{ color: c.muted, lineHeight: 20 }}>
                ChatGPT plan use isn’t turned on, so photo estimates use Pacebook AI or your OpenAI key below.
              </Text>
              <Button title="Use my ChatGPT plan" onPress={() => signIn(true)} disabled={busy} />
            </>
          )}
          {plan && models.length > 0 && (
            <View style={styles.chips}>
              {models.map((m) => (
                <Chip key={m.slug} label={m.name} selected={selected === m.slug} onPress={() => updateProfile({ chatgptModel: m.slug })} />
              ))}
            </View>
          )}
          <Button title="Sign out" variant="secondary" onPress={leave} disabled={busy} />
        </>
      )}

      {busy && <ActivityIndicator color={c.accent} />}
      {message ? <Text style={{ color: c.text, fontWeight: '600' }}>{message}</Text> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  notice: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
});
