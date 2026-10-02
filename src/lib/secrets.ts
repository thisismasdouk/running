import * as SecureStore from 'expo-secure-store';

import type { ChatgptSession } from './chatgpt';

// Stored in the iOS Keychain / Android Keystore, never in the app's database or backups.
const OPENAI_KEY = 'openai-api-key';

export const getOpenAiKey = () => SecureStore.getItemAsync(OPENAI_KEY);
export const setOpenAiKey = (key: string) => SecureStore.setItemAsync(OPENAI_KEY, key);
export const deleteOpenAiKey = () => SecureStore.deleteItemAsync(OPENAI_KEY);
/** Where the key is kept, for the settings screen. */
export const KEY_STORAGE_LABEL = 'the device keychain';

// ChatGPT sign-in. Each token gets its own keychain item (they are long), and
// none of them leave this device in a backup or a transfer to a new phone.
const CHATGPT_SESSION = 'chatgpt-session';
const CHATGPT_TOKENS = { accessToken: 'chatgpt-access-token', refreshToken: 'chatgpt-refresh-token', idToken: 'chatgpt-id-token' } as const;
const DEVICE_ONLY = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

export async function getChatgptSession(): Promise<ChatgptSession | null> {
  const [meta, accessToken, refreshToken, idToken] = await Promise.all([
    SecureStore.getItemAsync(CHATGPT_SESSION, DEVICE_ONLY),
    SecureStore.getItemAsync(CHATGPT_TOKENS.accessToken, DEVICE_ONLY),
    SecureStore.getItemAsync(CHATGPT_TOKENS.refreshToken, DEVICE_ONLY),
    SecureStore.getItemAsync(CHATGPT_TOKENS.idToken, DEVICE_ONLY),
  ]);
  if (!meta || !accessToken || !idToken) return null;
  try {
    return { ...JSON.parse(meta), accessToken, refreshToken, idToken };
  } catch {
    return null;
  }
}

export async function setChatgptSession(session: ChatgptSession): Promise<void> {
  const { accessToken, refreshToken, idToken, ...meta } = session;
  await Promise.all([
    SecureStore.setItemAsync(CHATGPT_SESSION, JSON.stringify(meta), DEVICE_ONLY),
    SecureStore.setItemAsync(CHATGPT_TOKENS.accessToken, accessToken, DEVICE_ONLY),
    SecureStore.setItemAsync(CHATGPT_TOKENS.idToken, idToken, DEVICE_ONLY),
    refreshToken ? SecureStore.setItemAsync(CHATGPT_TOKENS.refreshToken, refreshToken, DEVICE_ONLY) : SecureStore.deleteItemAsync(CHATGPT_TOKENS.refreshToken, DEVICE_ONLY),
  ]);
}

export async function deleteChatgptSession(): Promise<void> {
  await Promise.all([CHATGPT_SESSION, ...Object.values(CHATGPT_TOKENS)].map((key) => SecureStore.deleteItemAsync(key, DEVICE_ONLY)));
}
