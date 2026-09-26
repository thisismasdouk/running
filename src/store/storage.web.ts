/** Web fallback: SQLite on web needs extra server headers, so use localStorage instead. */
export const kv = {
  get: (key: string) => globalThis.localStorage?.getItem(key) ?? null,
  set: (key: string, value: string) => globalThis.localStorage?.setItem(key, value),
  remove: (key: string) => globalThis.localStorage?.removeItem(key),
};
