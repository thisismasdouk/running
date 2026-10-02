import type { ChatgptSession } from './chatgpt';

// Browsers have no keychain; the key stays in this browser's local storage only.
const OPENAI_KEY = 'pacebook:openai-api-key';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export async function getOpenAiKey(): Promise<string | null> {
  return storage()?.getItem(OPENAI_KEY) ?? null;
}

export async function setOpenAiKey(key: string): Promise<void> {
  storage()?.setItem(OPENAI_KEY, key);
}

export async function deleteOpenAiKey(): Promise<void> {
  storage()?.removeItem(OPENAI_KEY);
}

export const KEY_STORAGE_LABEL = 'this browser only';

// ChatGPT sign-in tokens must stay out of browser storage, so on web a
// sign-in lasts only until the page is reloaded. (The sign-in button itself
// is offered on iOS and Android only.)
let chatgptSession: ChatgptSession | null = null;

export async function getChatgptSession(): Promise<ChatgptSession | null> {
  return chatgptSession;
}

export async function setChatgptSession(session: ChatgptSession): Promise<void> {
  chatgptSession = session;
}

export async function deleteChatgptSession(): Promise<void> {
  chatgptSession = null;
}
