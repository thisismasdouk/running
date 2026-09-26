import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { ACCENT, useIsDark } from '@/components/theme';
import { defineLocationTask } from '@/lib/tracking';

// Background location fixes are delivered to this task, which has to be
// registered as soon as the bundle loads, before any screen renders.
defineLocationTask();

export default function RootLayout() {
  const dark = useIsDark();
  const base = dark ? DarkTheme : DefaultTheme;
  return (
    <ThemeProvider value={{ ...base, colors: { ...base.colors, primary: ACCENT } }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerBackTitle: 'Back' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="record" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="run/[id]" options={{ title: 'Run' }} />
        <Stack.Screen name="edit/[id]" options={{ title: 'Save Run', presentation: 'modal' }} />
      </Stack>
    </ThemeProvider>
  );
}
