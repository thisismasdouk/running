import { useSyncExternalStore } from 'react';
import { Alert, Platform } from 'react-native';

export type DialogButton = { text: string; style?: 'default' | 'cancel' | 'destructive' };
export type DialogRequest = { title: string; message: string; buttons: DialogButton[]; resolve: (index: number) => void };

// On web, Alert.alert is a no-op and window.confirm is silently ignored in
// sandboxed iframes, so dialogs render in-app through <DialogHost />.
let pending: DialogRequest | null = null;
const listeners = new Set<() => void>();
let hostMounted = false;

const notify = () => listeners.forEach((l) => l());

export const dialogs = {
  get: () => pending,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  /** Called by DialogHost with the pressed button's index, or -1 when dismissed. */
  answer(index: number) {
    const req = pending;
    pending = null;
    notify();
    req?.resolve(index);
  },
  setHostMounted(mounted: boolean) {
    hostMounted = mounted;
  },
};

export const useDialog = () => useSyncExternalStore(dialogs.subscribe, dialogs.get, dialogs.get);

/** Shows a dialog on every platform and resolves to the pressed button's index (-1 if dismissed). */
export function showDialog(title: string, message: string, buttons: DialogButton[]): Promise<number> {
  if (Platform.OS === 'web') {
    if (!hostMounted) {
      // Fallback before the host exists; only yes/no maps onto window.confirm.
      if (buttons.length === 1) return Promise.resolve(0);
      return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ? buttons.length - 1 : -1);
    }
    return new Promise((resolve) => {
      pending?.resolve(-1);
      pending = { title, message, buttons, resolve };
      notify();
    });
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      buttons.map((b, i) => ({ text: b.text, style: b.style, onPress: () => resolve(i) })),
      { cancelable: true, onDismiss: () => resolve(-1) },
    );
  });
}

/** Yes/no prompt that also works on web. */
export async function confirm(title: string, message: string, confirmText: string, destructive = false): Promise<boolean> {
  const i = await showDialog(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmText, style: destructive ? 'destructive' : 'default' },
  ]);
  return i === 1;
}

/** One-button notice that also works on web. */
export async function notice(title: string, message: string): Promise<void> {
  await showDialog(title, message, [{ text: 'OK' }]);
}
