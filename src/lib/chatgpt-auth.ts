import * as AuthSession from 'expo-auth-session';
import Constants from 'expo-constants';
import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import {
  CHATGPT_RESOURCE,
  ChatgptAuthError,
  getDiscovery,
  IDENTITY_SCOPES,
  loadSession,
  PLAN_SCOPES,
  readChatgptConfig,
  sessionFromTokens,
  validateIdToken,
  type ChatgptSession,
} from './chatgpt';
import { setChatgptSession } from './secrets';

/**
 * The interactive half of "Sign in with ChatGPT": opens OpenAI's sign-in page
 * in the system browser (ASWebAuthenticationSession on iOS, a Custom Tab on
 * Android) and exchanges the returned code. Tokens go to the device keychain.
 */

/**
 * The client OpenAI issued to Pacebook, from `extra.chatgpt` in app.json.
 * Null until a client ID is filled in, and on web, where there is no
 * keychain to hold the tokens.
 */
export const chatgptConfig = Platform.OS === 'web' ? null : readChatgptConfig(Constants.expoConfig?.extra);

const randomHex = (bytes: number) => Array.from(Crypto.getRandomBytes(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

/**
 * Runs the sign-in. Resolves null when the person closes the browser.
 * `enablePlan` asks for consent again, for someone who signed in earlier
 * without allowing ChatGPT plan use.
 */
export async function signInWithChatgpt({ enablePlan = false }: { enablePlan?: boolean } = {}): Promise<ChatgptSession | null> {
  const config = chatgptConfig;
  if (!config) throw new ChatgptAuthError('ChatGPT sign-in isn’t available in this build.');
  const discovery = await getDiscovery();
  const previous = await loadSession(config);

  // Fresh state, nonce and PKCE verifier for every attempt.
  const nonce = randomHex(32);
  const request = new AuthSession.AuthRequest({
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    responseType: AuthSession.ResponseType.Code,
    scopes: [...IDENTITY_SCOPES, ...PLAN_SCOPES],
    usePKCE: true,
    codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
    state: randomHex(32),
    ...(enablePlan ? { prompt: AuthSession.Prompt.Consent } : {}),
    extraParams: {
      resource: CHATGPT_RESOURCE,
      nonce,
      ...(previous ? { id_token_hint: previous.idToken, ...(previous.email ? { login_hint: previous.email } : {}) } : {}),
    },
  });

  const result = await request.promptAsync(discovery);
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  // expo-auth-session reports a missing or mismatched `state` as an error, so a code is only ever taken from a verified callback.
  if (result.type !== 'success') {
    const denied = result.type === 'error' && result.params?.error === 'access_denied';
    throw new ChatgptAuthError(denied ? 'Sign-in was cancelled at ChatGPT. Nothing was connected.' : 'ChatGPT sign-in couldn’t be completed. Try again.');
  }
  const { code, client_id: returnedClientId } = result.params;
  if (!code || (returnedClientId && returnedClientId !== config.clientId)) throw new ChatgptAuthError('ChatGPT sign-in couldn’t be verified. Try again.');

  let tokens: AuthSession.TokenResponse;
  try {
    tokens = await AuthSession.exchangeCodeAsync(
      {
        clientId: config.clientId,
        code,
        redirectUri: config.redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '', resource: CHATGPT_RESOURCE },
      },
      discovery,
    );
  } catch {
    throw new ChatgptAuthError('ChatGPT sign-in couldn’t be completed. Try again.');
  }

  const session = sessionFromTokens(
    { access_token: tokens.accessToken, refresh_token: tokens.refreshToken, id_token: tokens.idToken, expires_in: tokens.expiresIn, scope: tokens.scope },
    config,
    nonce,
  );
  // Re-authorising must come back as the same account before the saved credentials are replaced.
  if (enablePlan && previous) validateIdToken(session.idToken, { clientId: config.clientId, subject: previous.subject });
  await setChatgptSession(session);
  return session;
}
