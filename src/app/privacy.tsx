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
    'While you record a run, Pacebook uses your device location (GPS) to draw your route and measure distance, pace and elevation. You can also add a name, run titles, notes, an effort rating, your weight and max heart rate.',
  ],
  [
    'Where it is stored',
    'Everything you record is stored only on this device. Pacebook has no analytics and no advertising, and no account unless you choose Pacebook AI (below). Nothing you record is sent to us or to anyone else, except meal photos you choose to have estimated (below). When you share a run image or export a GPX file, it goes only to the app you pick.',
  ],
  [
    'Location in the background',
    'Location is used only while a run is being recorded, including when the screen is locked so your run keeps recording. iPhone shows a blue location indicator and Android shows a notification the whole time. Pacebook stops using location when you finish or discard the run.',
  ],
  ['Apple Health', 'If you turn on Apple Health in the You tab, Pacebook saves your runs to Health as workouts (with route and distance) and reads your heart rate for the time of each run to show heart-rate zones. Health data stays on your device, is never sent to us or anyone else, and is never used for advertising. You can turn access off at any time in Settings → Health → Data Access & Devices.'],
  ['Food log and AI photo estimates', 'The Food tab keeps a calorie and macro log on your device. If you use photo estimates, after you agree in the app the meal photo and any note you type are sent to OpenAI to estimate calories, and the answer comes back to your phone. They go one of three ways: on your ChatGPT plan if you signed in with ChatGPT, through Pacebook AI if you signed in with Apple, or directly with your own API key. Nothing else is sent: no runs, location, name or health data. Through the API (your key or Pacebook AI), OpenAI does not use the data to train its models by default and may keep it for up to 30 days to prevent abuse. On your ChatGPT plan, OpenAI handles the photo and note under the terms and data settings of your ChatGPT account (openai.com/policies). You can withdraw consent, sign out or remove your key at any time in Food settings, and you can always log food by hand without AI.'],
  ['Pacebook AI and Sign in with Apple', 'Pacebook AI is optional and lets you estimate meal photos without an OpenAI key. You sign in with Apple; Pacebook asks Apple for no name or email, only a random user identifier that Apple creates for Pacebook. Our server keeps that identifier, when your account was created and how many photo estimates you used each day (kept for a week), so it can apply the daily allowance. Each photo and note is passed straight to OpenAI and is not stored on our server. You can sign out or delete your Pacebook AI account at any time in Food settings; deleting it removes the identifier and usage counts from the server.'],
  ['Sign in with ChatGPT', 'Signing in is optional and happens on OpenAI’s own sign-in page; Pacebook never sees your ChatGPT password. If you choose Continue with ChatGPT in Food settings, OpenAI tells Pacebook your account identifier, name, email address and profile picture, and gives it sign-in tokens that let it send meal photos on your ChatGPT plan. Pacebook keeps only the identifier, the email address (to show which account is signed in) and the tokens, in this device’s keychain. They are never sent to us or anyone other than OpenAI, and they do not give Pacebook access to your ChatGPT conversations. Sign out in Food settings to end the session with OpenAI and remove the tokens from the device; you can also disconnect Pacebook and limit its usage in your ChatGPT settings.'],
  ['Deleting your data', 'Delete any run or food entry from its screen. Delete your Pacebook AI account in Food settings. Uninstalling Pacebook removes all of its data from the device.'],
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
