import * as SecureStore from 'expo-secure-store';

// Stored in the iOS Keychain / Android Keystore, never in the app's database or backups.
const OPENAI_KEY = 'openai-api-key';

export const getOpenAiKey = () => SecureStore.getItemAsync(OPENAI_KEY);
export const setOpenAiKey = (key: string) => SecureStore.setItemAsync(OPENAI_KEY, key);
export const deleteOpenAiKey = () => SecureStore.deleteItemAsync(OPENAI_KEY);
/** Where the key is kept, for the settings screen. */
export const KEY_STORAGE_LABEL = 'the device keychain';
