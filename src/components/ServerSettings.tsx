import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { confirm } from '@/lib/confirm';
import { fetchUsage, normaliseBase, serverBase, ServerError, type ServerSession, type ServerUsage } from '@/lib/calorie-server';
import {
  appleSignInAvailable,
  configuredServerUrl,
  deleteServerAccountAndSignOut,
  loadServerSession,
  signInToServer,
  signOutOfServer,
} from '@/lib/calorie-server-auth';
import { updateProfile, useProfile } from '@/store';
import { useColors, useIsDark } from './theme';
import { Button } from './ui';

const host = (url: string) => url.replace(/^https:\/\//, '');

/** Pacebook AI: sign in with Apple on the calorie server and see today's allowance. */
export function ServerSettings() {
  const c = useColors();
  const dark = useIsDark();
  const profile = useProfile();
  const base = serverBase({ aiUseOwnKey: false, aiProxyUrl: profile.aiProxyUrl }, configuredServerUrl);
  const [editing, setEditing] = useState(false);
  const [address, setAddress] = useState(profile.aiProxyUrl ?? '');
  const [apple, setApple] = useState<boolean | null>(null);
  const [session, setSession] = useState<ServerSession | null>(null);
  const [usage, setUsage] = useState<ServerUsage | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    appleSignInAvailable().then(setApple);
  }, []);

  useEffect(() => {
    let live = true;
    loadServerSession(base).then(async (s) => {
      if (!live) return;
      setSession(s);
      setUsage(null);
      if (!s) return;
      try {
        const u = await fetchUsage(s);
        if (live) setUsage(u);
      } catch (e) {
        if (!live) return;
        if (e instanceof ServerError && e.signInRequired) {
          await signOutOfServer();
          setSession(null);
        }
      }
    });
    return () => {
      live = false;
    };
  }, [base]);

  const signIn = async () => {
    if (!base) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await signInToServer(base);
      if (result) {
        setSession(result.session);
        setUsage(result.usage);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await signOutOfServer();
    setSession(null);
    setUsage(null);
  };

  const deleteAccount = async () => {
    if (!session) return;
    const ok = await confirm(
      'Delete Pacebook AI account?',
      'This deletes your account on the Pacebook AI server: your Apple user ID and usage counts. Your food log on this phone is kept.',
      'Delete',
      true,
    );
    if (!ok) return;
    setBusy(true);
    try {
      await deleteServerAccountAndSignOut(session);
      setSession(null);
      setUsage(null);
      setMessage('Your Pacebook AI account was deleted.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveAddress = () => {
    const url = address.trim();
    if (url && !/^https:\/\/[^\s/]+/.test(url)) {
      setMessage('Enter the server’s full https:// address.');
      return;
    }
    updateProfile({ aiProxyUrl: url ? normaliseBase(url) : null });
    setEditing(false);
    setMessage('');
  };

  if (!base || editing) {
    return (
      <View style={{ gap: 10 }}>
        <Text style={{ color: c.muted, lineHeight: 20 }}>
          {configuredServerUrl
            ? `This build uses ${host(configuredServerUrl)}. Enter another address only to test your own server, or leave it empty.`
            : 'Enter the address of your Pacebook AI server (see server/calorie-server in the project).'}
        </Text>
        <TextInput
          value={address}
          onChangeText={setAddress}
          placeholder="https://ai.example.com"
          placeholderTextColor={c.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={[styles.input, { color: c.text, borderColor: c.border, backgroundColor: c.bg }]}
          accessibilityLabel="Pacebook AI server address"
        />
        <Button title="Save server" onPress={saveAddress} disabled={!address.trim() && !configuredServerUrl} />
        {message ? <Text style={{ color: c.text, fontWeight: '600' }}>{message}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 12 }}>
      {session ? (
        <>
          <Text style={{ color: c.text, lineHeight: 20 }}>
            Signed in with Apple.{' '}
            {usage ? `${usage.usedToday} of ${usage.dailyLimit} photo estimates used today.` : 'Photo estimates are ready.'}
          </Text>
          {usage && <Text style={{ color: c.muted, fontSize: 13 }}>Your allowance resets at {new Date(usage.resetsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}.</Text>}
          <View style={styles.row}>
            <Pressable onPress={signOut} hitSlop={8} disabled={busy}>
              <Text style={{ color: c.accent, fontWeight: '700' }}>Sign out</Text>
            </Pressable>
            <Pressable onPress={deleteAccount} hitSlop={8} disabled={busy}>
              <Text style={{ color: c.danger, fontWeight: '700' }}>Delete account</Text>
            </Pressable>
          </View>
        </>
      ) : apple ? (
        <>
          <Text style={{ color: c.muted, lineHeight: 20 }}>
            Sign in with Apple to estimate meal photos, no API key needed. Pacebook gets only an anonymous Apple ID, not your name or email.
          </Text>
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={dark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={999}
            style={styles.apple}
            onPress={() => !busy && signIn()}
          />
        </>
      ) : apple === false ? (
        <Text style={{ color: c.muted, lineHeight: 20 }}>Pacebook AI uses Sign in with Apple, which is on iPhone only. On this device, use your own OpenAI key.</Text>
      ) : null}
      <Pressable onPress={() => setEditing(true)} hitSlop={8}>
        <Text style={{ color: c.muted, fontSize: 12 }}>Server: {host(base)} · Change</Text>
      </Pressable>
      {message ? <Text style={{ color: c.text, fontWeight: '600' }}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  row: { flexDirection: 'row', gap: 24 },
  apple: { height: 48, width: '100%' },
});
