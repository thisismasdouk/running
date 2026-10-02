import { useEffect } from 'react';
import { View } from 'react-native';

import { useColors } from '@/components/theme';
import { goBack } from '@/lib/nav';

/**
 * Where "Sign in with ChatGPT" redirects to (pacebook://auth/callback). The
 * sign-in itself is finished by the screen that started it; on Android the
 * redirect also arrives here as a deep link, so this only steps back to that
 * screen instead of showing "unmatched route".
 */
export default function AuthCallback() {
  const c = useColors();
  useEffect(() => {
    goBack('/food/settings');
  }, []);
  return <View style={{ flex: 1, backgroundColor: c.bg }} />;
}
