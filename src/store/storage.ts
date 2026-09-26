import Storage from 'expo-sqlite/kv-store';

/** Synchronous key-value storage backed by SQLite on device. */
export const kv = {
  get: (key: string) => Storage.getItemSync(key),
  set: (key: string, value: string) => Storage.setItemSync(key, value),
  remove: (key: string) => {
    Storage.removeItemSync(key);
  },
};
