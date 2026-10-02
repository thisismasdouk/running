import { useColorScheme } from 'react-native';

export const ACCENT = '#FC4C02';

const light = {
  accent: ACCENT,
  accentSoft: '#FFE9DF',
  bg: '#F4F4F5',
  card: '#FFFFFF',
  text: '#18181B',
  muted: '#71717A',
  border: '#E4E4E7',
  good: '#16A34A',
  warn: '#D97706',
  danger: '#DC2626',
  track: '#E4E4E7',
};

const dark: typeof light = {
  accent: ACCENT,
  accentSoft: '#3A1E12',
  bg: '#0B0B0D',
  card: '#18181B',
  text: '#F4F4F5',
  muted: '#A1A1AA',
  border: '#27272A',
  good: '#22C55E',
  warn: '#F59E0B',
  danger: '#F87171',
  track: '#27272A',
};

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === 'dark';
}
