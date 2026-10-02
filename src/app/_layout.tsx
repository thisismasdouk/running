import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, StyleSheet, View } from 'react-native';

import { DialogHost } from '@/components/DialogHost';
import { ACCENT, useIsDark } from '@/components/theme';
import { useRunFeedback } from '@/lib/feedback';
import { recorder } from '@/lib/recorder';
import { unitLength } from '@/lib/stats';
import { resumeTrackingIfNeeded } from '@/lib/tracking';
import { useProfile } from '@/store';

// The background location task is defined in the app entry (index.ts), not
// here: route files aren't loaded when Android restarts the app headlessly.

export default function RootLayout() {
  const dark = useIsDark();
  const base = dark ? DarkTheme : DefaultTheme;
  const profile = useProfile();

  // Recorder settings live in the profile but are needed even when the Record screen isn't mounted.
  useEffect(() => {
    recorder.splitLength = unitLength(profile.units);
    recorder.autoPause = profile.autoPause;
  }, [profile.units, profile.autoPause]);

  useEffect(() => {
    // A run that was in progress when the app was killed or reloaded picks its GPS back up.
    resumeTrackingIfNeeded();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') recorder.flush();
    });
    return () => sub.remove();
  }, []);

  useRunFeedback();

  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: ACCENT } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={styles.root}>
        <Stack screenOptions={{ headerBackTitle: 'Back' }}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="record" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
          <Stack.Screen name="run/[id]" options={{ title: 'Run' }} />
          <Stack.Screen name="edit/[id]" options={{ title: 'Save Run', presentation: 'modal' }} />
          <Stack.Screen name="privacy" options={{ title: 'Privacy' }} />
        </Stack>
        {Platform.OS === 'web' && <DialogHost />}
      </View>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
