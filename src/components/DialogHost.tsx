import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { dialogs, useDialog } from '@/lib/confirm';
import { useColors } from './theme';

/** Renders showDialog() requests on web, where native alerts don't exist. */
export function DialogHost() {
  const c = useColors();
  const req = useDialog();

  useEffect(() => {
    dialogs.setHostMounted(true);
    return () => dialogs.setHostMounted(false);
  }, []);

  if (!req) return null;
  return (
    <View style={styles.backdrop} accessibilityViewIsModal>
      <Pressable style={StyleSheet.absoluteFill} onPress={() => dialogs.answer(-1)} accessibilityLabel="Dismiss" />
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }]} accessibilityRole="alert">
        <Text style={[styles.title, { color: c.text }]}>{req.title}</Text>
        {req.message ? <Text style={[styles.message, { color: c.muted }]}>{req.message}</Text> : null}
        <View style={styles.buttons}>
          {req.buttons.map((b, i) => (
            <Pressable
              key={b.text}
              accessibilityRole="button"
              onPress={() => dialogs.answer(i)}
              style={({ pressed }) => [
                styles.button,
                {
                  backgroundColor: b.style === 'destructive' ? c.danger : b.style === 'cancel' ? c.track : c.accent,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
            >
              <Text style={{ color: b.style === 'cancel' ? c.text : '#fff', fontWeight: '700' }}>{b.text}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 1000,
  },
  card: { width: '100%', maxWidth: 360, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 10 },
  title: { fontSize: 18, fontWeight: '700' },
  message: { fontSize: 15, lineHeight: 21 },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  button: { borderRadius: 999, paddingVertical: 10, paddingHorizontal: 18 },
});
