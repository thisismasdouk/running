import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';

import { CARD_H, CARD_STYLES, CARD_W, ShareCard, type CardStyle } from '@/components/ShareCard';
import { useColors } from '@/components/theme';
import { Button, Chip, Empty } from '@/components/ui';
import { notice } from '@/lib/confirm';
import { gpxFileName, toGpx } from '@/lib/gpx';
import { shareImage, shareTextFile } from '@/lib/share';
import { useProfile, useRun } from '@/store';

export default function ShareRun() {
  const c = useColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const run = useRun(id);
  const { units } = useProfile();
  const [variant, setVariant] = useState<CardStyle>('orange');
  const [busy, setBusy] = useState<'image' | 'gpx' | null>(null);
  const card = useRef<View>(null);

  if (!run) return <Empty title="Run not found" body="It may have been deleted." />;

  const hasRoute = run.segments.some((s) => s.length > 1);

  const share = async (kind: 'image' | 'gpx') => {
    setBusy(kind);
    try {
      if (kind === 'image') {
        const uri = await captureRef(card, {
          format: 'png',
          width: 1080,
          height: Math.round((1080 * CARD_H) / CARD_W),
          result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
        });
        await shareImage(uri, run.title);
      } else {
        await shareTextFile(gpxFileName(run), toGpx(run), 'application/gpx+xml', 'com.topografix.gpx');
      }
    } catch (e) {
      await notice('Couldn’t share', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <View style={styles.preview}>
        <ShareCard ref={card} run={run} units={units} variant={variant} />
      </View>

      <View style={styles.chips}>
        {CARD_STYLES.map((s) => (
          <Chip key={s.key} label={s.label} selected={variant === s.key} onPress={() => setVariant(s.key)} />
        ))}
      </View>

      <Button
        title={busy === 'image' ? 'Preparing…' : Platform.OS === 'web' ? 'Download image' : 'Share image'}
        onPress={() => share('image')}
        disabled={busy != null}
      />
      {hasRoute && (
        <>
          <Button
            title={busy === 'gpx' ? 'Preparing…' : 'Export GPX file'}
            onPress={() => share('gpx')}
            variant="secondary"
            disabled={busy != null}
          />
          <Text style={[styles.hint, { color: c.muted }]}>
            GPX works with Strava (Upload activity → File), Garmin Connect, Komoot and most running apps.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  // Rounded on screen only; the exported image keeps square corners.
  preview: { alignSelf: 'center', borderRadius: 20, overflow: 'hidden' },
  chips: { flexDirection: 'row', gap: 8, justifyContent: 'center' },
  hint: { fontSize: 13, lineHeight: 18, textAlign: 'center' },
});
