import * as AppleAuthentication from 'expo-apple-authentication';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { createServerSession, deleteServerAccount, readServerConfig, sessionFor, type ServerSession, type ServerUsage } from './calorie-server';
import { deleteServerSession, getServerSession, setServerSession } from './secrets';

/** The calorie server this build ships with (`expo.extra.calorieServer.url`), or null. */
export const configuredServerUrl = readServerConfig(Constants.expoConfig?.extra);

/** Sign in with Apple exists on iOS 13+ only. */
export async function appleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

/** The saved session for this server, or null (none, expired, or for another server). */
export async function loadServerSession(base: string | null): Promise<ServerSession | null> {
  const saved = await getServerSession().catch(() => null);
  const usable = sessionFor(saved, base);
  if (saved && !usable) await deleteServerSession().catch(() => {});
  return usable;
}

/**
 * Signs in with Apple and opens a session on the calorie server. Only an
 * opaque Apple user ID reaches the server: no name or email is requested.
 * Resolves null if the person cancels.
 */
export async function signInToServer(base: string): Promise<{ session: ServerSession; usage: ServerUsage } | null> {
  // The server checks that Apple's token carries SHA-256 of this one-time value, so a token can't be replayed.
  const nonce = Crypto.randomUUID() + Crypto.randomUUID();
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
  let credential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: hashed });
  } catch (e) {
    if ((e as { code?: string })?.code === 'ERR_REQUEST_CANCELED') return null;
    throw e;
  }
  if (!credential.identityToken) throw new Error('Apple didn’t return a sign-in token. Try again.');
  const result = await createServerSession(base, credential.identityToken, nonce);
  await setServerSession(result.session);
  return result;
}

export const signOutOfServer = () => deleteServerSession();

/** Deletes the account on the server, then forgets the session on this phone. */
export async function deleteServerAccountAndSignOut(session: ServerSession): Promise<void> {
  await deleteServerAccount(session);
  await deleteServerSession();
}
