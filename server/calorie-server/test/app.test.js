import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, beforeEach, test } from 'node:test';

import { createApp, sanitiseEstimateRequest, sha256Hex } from '../src/app.js';
import { openStore } from '../src/store.js';

const NONCE = 'n'.repeat(32);
const config = {
  openaiKey: 'sk-server',
  sessionSecret: 's'.repeat(40),
  dailyLimit: 2,
  globalDailyLimit: 3,
  allowedModels: ['gpt-4o-mini'],
  maxBodyBytes: 100_000,
  sessionDays: 90,
  trustProxy: false,
};

let clock = Date.UTC(2026, 9, 2, 12);
let openai;
let openaiCalls;
let store;
let base;
let server;

// Apple's check is replaced: tokens look like "apple:<sub>:<nonce claim>".
const verifyAppleToken = async (token) => {
  const [kind, sub, nonce] = token.split(':');
  if (kind !== 'apple') throw new Error('bad token');
  return { sub, nonce };
};

const appRequest = (text = 'Estimate this meal.') => ({
  model: 'gpt-4o-mini',
  temperature: 0.2,
  max_tokens: 900,
  response_format: { type: 'json_schema', json_schema: { name: 'meal_estimate', strict: true, schema: {} } },
  messages: [
    { role: 'system', content: 'You are a nutritionist.' },
    { role: 'user', content: [{ type: 'text', text }, { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,AAAA', detail: 'auto' } }] },
  ],
});

const call = async (method, path, { body, token } = {}) => {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, json: text ? JSON.parse(text) : null };
};

const signIn = async (sub = 'user1') => (await call('POST', '/v1/session', { body: { identityToken: `apple:${sub}:${sha256Hex(NONCE)}`, nonce: NONCE } })).json.token;

before(async () => {
  store = openStore(':memory:');
  const handler = createApp(config, {
    store,
    verifyAppleToken,
    now: () => clock,
    log: {},
    fetch: async (url, init) => {
      openaiCalls.push({ url, init });
      return openai();
    },
  });
  server = createServer(handler);
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.close();
  store.close();
});

beforeEach(() => {
  clock += 86_400_000; // a fresh day for every test
  openaiCalls = [];
  openai = () => new Response(JSON.stringify({ choices: [{ message: { content: '{}' } }] }), { status: 200 });
});

test('signs in with Apple only when the nonce matches', async () => {
  const ok = await call('POST', '/v1/session', { body: { identityToken: `apple:a:${sha256Hex(NONCE)}`, nonce: NONCE } });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.dailyLimit, 2);
  assert.equal(ok.json.usedToday, 0);
  assert.ok(ok.json.token);

  const wrongNonce = await call('POST', '/v1/session', { body: { identityToken: `apple:a:${sha256Hex('x'.repeat(32))}`, nonce: NONCE } });
  assert.equal(wrongNonce.status, 401);
  const notApple = await call('POST', '/v1/session', { body: { identityToken: 'google:a:b', nonce: NONCE } });
  assert.equal(notApple.status, 401);
});

test('estimates need a session', async () => {
  assert.equal((await call('POST', '/v1/estimate', { body: appRequest() })).status, 401);
  assert.equal((await call('POST', '/v1/estimate', { body: appRequest(), token: 'nonsense' })).status, 401);
  assert.equal(openaiCalls.length, 0);
});

test('forwards with the server key and enforces the daily limit', async () => {
  const token = await signIn('limit');
  const first = await call('POST', '/v1/estimate', { body: appRequest(), token });
  assert.equal(first.status, 200);
  assert.equal(first.headers.get('x-pacebook-used'), '1');
  assert.equal(openaiCalls[0].init.headers.Authorization, 'Bearer sk-server');
  assert.equal((await call('POST', '/v1/estimate', { body: appRequest(), token })).status, 200);
  const third = await call('POST', '/v1/estimate', { body: appRequest(), token });
  assert.equal(third.status, 429);
  assert.equal(third.json.error.code, 'daily_limit');
  assert.equal(openaiCalls.length, 2);
  assert.equal((await call('GET', '/v1/usage', { token })).json.usedToday, 2);

  clock += 86_400_000; // next UTC day
  assert.equal((await call('POST', '/v1/estimate', { body: appRequest(), token })).status, 200);
});

test('caps everyone together with the server-wide limit', async () => {
  const a = await signIn('g1');
  const b = await signIn('g2');
  for (const t of [a, a, b]) assert.equal((await call('POST', '/v1/estimate', { body: appRequest(), token: t })).status, 200);
  const c = await signIn('g3');
  const res = await call('POST', '/v1/estimate', { body: appRequest(), token: c });
  assert.equal(res.status, 503);
  assert.equal(res.json.error.code, 'busy');
});

test('a failed OpenAI call does not use up an estimate', async () => {
  const token = await signIn('refund');
  openai = () => new Response(JSON.stringify({ error: { code: 'invalid_api_key', message: 'Incorrect API key provided' } }), { status: 401 });
  const res = await call('POST', '/v1/estimate', { body: appRequest(), token });
  assert.equal(res.status, 502);
  assert.doesNotMatch(res.json.error.message, /API key/);
  assert.equal((await call('GET', '/v1/usage', { token })).json.usedToday, 0);
});

test('refuses anything that is not a meal-photo request', async () => {
  const token = await signIn('shape');
  const bad = [
    { ...appRequest(), model: 'gpt-5-pro' },
    { ...appRequest(), messages: [{ role: 'user', content: 'Write me an essay' }] },
    { ...appRequest(), response_format: { type: 'text' } },
    (() => {
      const r = appRequest();
      r.messages[1].content[1].image_url.url = 'https://example.com/a.jpg';
      return r;
    })(),
  ];
  for (const body of bad) assert.equal((await call('POST', '/v1/estimate', { body, token })).status, 400);
  assert.equal(openaiCalls.length, 0);
  assert.equal((await call('GET', '/v1/usage', { token })).json.usedToday, 0);
});

test('rebuilds the forwarded body and caps the answer length', () => {
  const body = { ...appRequest(), max_tokens: 50_000, tools: [{ type: 'web_search' }], temperature: 5 };
  const clean = sanitiseEstimateRequest(body, ['gpt-4o-mini']);
  assert.equal(clean.max_tokens, 1200);
  assert.equal(clean.temperature, 1);
  assert.equal('tools' in clean, false);
});

test('rejects oversized photos', async () => {
  const token = await signIn('big');
  const res = await call('POST', '/v1/estimate', { body: appRequest('x'.repeat(200_000)), token });
  assert.equal(res.status, 413);
});

test('deleting the account removes the user and ends the session', async () => {
  const token = await signIn('gone');
  await call('POST', '/v1/estimate', { body: appRequest(), token });
  assert.equal((await call('DELETE', '/v1/account', { token })).status, 204);
  clock += 2000;
  assert.equal((await call('GET', '/v1/usage', { token })).status, 401);
  // Signing in again starts a fresh account.
  const again = await signIn('gone');
  assert.equal((await call('GET', '/v1/usage', { token: again })).json.usedToday, 0);
  assert.equal((await call('GET', '/v1/usage', { token })).status, 401);
});

test('limits sign-in attempts per address', async () => {
  let last;
  for (let i = 0; i < 12; i++) last = await call('POST', '/v1/session', { body: { identityToken: 'bad', nonce: NONCE } });
  assert.equal(last.status, 429);
});
