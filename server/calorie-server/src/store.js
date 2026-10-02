import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Users and daily usage, in one SQLite file. Nothing about meals is stored:
 * photos pass straight through to OpenAI.
 */
export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      -- Sessions issued before this time are refused (sign-out everywhere, deletion).
      sessions_valid_after INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS usage (
      user_id TEXT NOT NULL,
      day TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day)
    );
  `);

  const q = {
    upsertUser: db.prepare('INSERT INTO users (id, created_at, sessions_valid_after) VALUES (?, ?, ?) ON CONFLICT(id) DO NOTHING'),
    getUser: db.prepare('SELECT id, created_at, sessions_valid_after FROM users WHERE id = ?'),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    deleteUsage: db.prepare('DELETE FROM usage WHERE user_id = ?'),
    used: db.prepare('SELECT count FROM usage WHERE user_id = ? AND day = ?'),
    usedAll: db.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM usage WHERE day = ?'),
    add: db.prepare('INSERT INTO usage (user_id, day, count) VALUES (?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET count = count + excluded.count'),
    prune: db.prepare('DELETE FROM usage WHERE day < ?'),
  };

  return {
    ensureUser(id, now = Date.now()) {
      // A new (or re-created) account only accepts sessions from now on, so a token kept from a deleted account stays dead.
      // Session times are whole seconds, so round down to the second.
      q.upsertUser.run(id, now, Math.floor(now / 1000) * 1000);
      return q.getUser.get(id);
    },
    getUser: (id) => q.getUser.get(id) ?? null,
    deleteUser(id) {
      q.deleteUsage.run(id);
      q.deleteUser.run(id);
    },
    usedToday: (id, day) => q.used.get(id, day)?.count ?? 0,
    usedByAll: (day) => q.usedAll.get(day).total,
    /**
     * Reserves one estimate if both the user's and the server's daily limits
     * allow it. Synchronous, so two requests can't both take the last slot.
     */
    reserve(id, day, perUser, global) {
      if ((q.used.get(id, day)?.count ?? 0) >= perUser) return 'user';
      if (q.usedAll.get(day).total >= global) return 'global';
      q.add.run(id, day, 1);
      return null;
    },
    /** Gives back a reserved estimate when OpenAI didn't produce one. */
    release: (id, day) => q.add.run(id, day, -1),
    /** Usage older than this day is no longer needed. */
    prune: (beforeDay) => q.prune.run(beforeDay),
    close: () => db.close(),
  };
}
