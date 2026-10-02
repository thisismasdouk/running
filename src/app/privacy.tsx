import { ScrollView, StyleSheet, Text } from 'react-native';

import { useColors } from '@/components/theme';
import { Card } from '@/components/ui';

/**
 * The in-app privacy policy. Keep it in sync with docs/PRIVACY.md, which is
 * the version to host at the Privacy Policy URL given to the App Store.
 */
const SECTIONS: [title: string, body: string][] = [
  [
    'What Pacebook collects',
    'While you record a run, Pacebook uses your device location (GPS) to draw your route and measure distance, pace and elevation. You can also add a name, run titles, notes and an effort rating.',
  ],
  [
    'Where it is stored',
    'Everything is stored only on this device. Pacebook has no account, no server, no analytics and no advertising. Nothing you record is sent to us or to anyone else.',
  ],
  [
    'Location in the background',
    'Location is used only while a run is being recorded, including when the screen is locked so your run keeps recording. iPhone shows a blue location indicator and Android shows a notification the whole time. Pacebook stops using location when you finish or discard the run.',
  ],
  ['Deleting your data', 'Delete any run from its detail screen. Uninstalling Pacebook removes all of its data from the device.'],
  ['Children', 'Pacebook does not knowingly collect any personal information from anyone, including children.'],
  ['Changes', 'If this policy changes, the new version will be shown here and on the App Store listing.'],
];

export default function Privacy() {
  const c = useColors();
  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.content}>
      <Card style={{ gap: 16 }}>
        {SECTIONS.map(([title, body]) => (
          <Text key={title} style={[styles.body, { color: c.muted }]}>
            <Text style={[styles.title, { color: c.text }]}>{title}{'\n'}</Text>
            {body}
          </Text>
        ))}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
});
