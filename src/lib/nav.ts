import { router, type Href } from 'expo-router';

/**
 * router.back() does nothing when the screen is the first history entry
 * (web refresh, deep link, the Record tab's redirect), so fall back to a
 * sensible screen instead of leaving a dead button.
 */
export function goBack(fallback: Href = '/') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}
