import { Redirect } from 'expo-router';

/** Placeholder for the Record tab; pressing the tab opens /record instead. */
export default function Start() {
  return <Redirect href="/record" />;
}
