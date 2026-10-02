import { createServer } from 'node:http';
import { createRemoteJWKSet, jwtVerify } from 'jose';

import { createApp, utcDay } from './app.js';
import { openStore } from './store.js';

const env = process.env;
const required = (name) => {
  const v = env[name]?.trim();
  if (!v) {
    console.error(`Missing ${name}. See server/calorie-server/README.md.`);
    process.exit(1);
  }
  return v;
};
const int = (name, fallback) => {
  const n = Number.parseInt(env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const sessionSecret = required('SESSION_SECRET');
if (sessionSecret.length < 32) {
  console.error('SESSION_SECRET must be at least 32 characters (try: openssl rand -hex 32).');
  process.exit(1);
}

const config = {
  openaiKey: required('OPENAI_API_KEY'),
  sessionSecret,
  // Identity tokens from the iOS app carry the bundle ID as their audience.
  appleAudience: (env.APPLE_BUNDLE_ID ?? 'com.thisismasdouk.pacebook').split(',').map((s) => s.trim()),
  dailyLimit: int('DAILY_LIMIT', 30),
  globalDailyLimit: int('GLOBAL_DAILY_LIMIT', 3000),
  allowedModels: (env.ALLOWED_MODELS ?? 'gpt-4o-mini').split(',').map((s) => s.trim()),
  maxBodyBytes: 3_000_000,
  sessionDays: int('SESSION_DAYS', 90),
  trustProxy: env.TRUST_PROXY !== '0',
};

const appleKeys = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const verifyAppleToken = async (token) =>
  (await jwtVerify(token, appleKeys, { issuer: 'https://appleid.apple.com', audience: config.appleAudience, algorithms: ['RS256'] })).payload;

const store = openStore(env.DB_PATH ?? './data/pacebook.db');
const handler = createApp(config, { store, verifyAppleToken });

// Usage rows are only needed for today's limit; keep a week for troubleshooting.
const prune = () => store.prune(utcDay(Date.now() - 7 * 86_400_000));
prune();
setInterval(prune, 6 * 3600_000).unref();

const port = int('PORT', 8080);
const server = createServer(handler);
server.requestTimeout = 90_000;
server.listen(port, () => console.log(`Pacebook calorie server on :${port} (limit ${config.dailyLimit}/user/day, ${config.globalDailyLimit}/day total)`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
