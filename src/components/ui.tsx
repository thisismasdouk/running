import Ionicons from '@expo/vector-icons/Ionicons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { useColors } from './theme';

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]}>{children}</View>;
}

export function SectionTitle({ children }: { children: ReactNode }) {
  const c = useColors();
  return <Text style={[styles.section, { color: c.text }]}>{children}</Text>;
}

type StatProps = { label: string; value: string; unit?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; align?: 'left' | 'center' };

export function Stat({ label, value, unit, size = 'md', align = 'left' }: StatProps) {
  const c = useColors();
  const fontSize = { sm: 16, md: 20, lg: 28, xl: 64 }[size];
  return (
    <View style={{ alignItems: align === 'center' ? 'center' : 'flex-start' }}>
      <Text style={[styles.statLabel, { color: c.muted }]}>{label}</Text>
      <Text style={[styles.statValue, { color: c.text, fontSize }]}>
        {value}
        {unit ? <Text style={{ fontSize: fontSize * 0.5, color: c.muted, fontWeight: '600' }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

type ButtonProps = {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  style?: ViewStyle;
  disabled?: boolean;
};

export function Button({ title, onPress, variant = 'primary', style, disabled }: ButtonProps) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.danger : c.card;
  const fg = variant === 'secondary' ? c.text : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'secondary' ? c.border : bg, opacity: disabled ? 0.5 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

/** A small selectable pill, for single-choice rows (run type, shoe, filters). */
export function Chip({ label, selected, onPress, color }: { label: string; selected: boolean; onPress: () => void; color?: string }) {
  const c = useColors();
  const on = color ?? c.accent;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: selected ? on : c.card, borderColor: selected ? on : c.border }]}
    >
      <Text style={[styles.chipText, { color: selected ? '#fff' : c.text }]}>{label}</Text>
    </Pressable>
  );
}

/** A tappable row with a title, a detail line and a chevron, for links inside a Card. */
export function LinkRow({ title, detail, onPress, icon }: { title: string; detail?: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole="link" onPress={onPress} style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : 1 }]}>
      {icon && <Ionicons name={icon} size={22} color={c.accent} />}
      <View style={{ flex: 1 }}>
        <Text style={[styles.linkTitle, { color: c.text }]}>{title}</Text>
        {detail ? <Text style={{ color: c.muted, fontSize: 13 }}>{detail}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={20} color={c.muted} />
    </Pressable>
  );
}

/** A thin progress bar, 0–1. */
export function ProgressBar({ value, color }: { value: number; color?: string }) {
  const c = useColors();
  return (
    <View style={[styles.track, { backgroundColor: c.track }]}>
      <View style={[styles.fill, { width: `${Math.min(1, Math.max(0, value)) * 100}%`, backgroundColor: color ?? c.accent }]} />
    </View>
  );
}

export function Empty({ title, body, children }: { title: string; body: string; children?: ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text>
      <Text style={[styles.emptyBody, { color: c.muted }]}>{body}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 16 },
  section: { fontSize: 18, fontWeight: '700', marginTop: 8, marginBottom: 8 },
  statLabel: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  statValue: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  button: { borderRadius: 999, paddingVertical: 14, paddingHorizontal: 24, alignItems: 'center', borderWidth: 1 },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  chipText: { fontSize: 14, fontWeight: '600' },
  link: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  linkTitle: { fontSize: 16, fontWeight: '600' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  empty: { alignItems: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyBody: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
