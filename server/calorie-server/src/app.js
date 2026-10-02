import { createHash } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const SESSION_ISSUER = 'pacebook-calorie-server';

/** "2026-10-02" in UTC: daily limits reset at midnight UTC. */
export const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const nextUtcMidnight = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};
export const sha256Hex = (s) => createHash('sha256').update(s).digest('hex');

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * Only the request the app sends is forwarded: one system prompt, one user
 * message with text and a JPEG photo, and a JSON schema answer from an
 * allowed model. Everything else is refused, so the server's OpenAI key
 * can't be used as a general-purpose endpoint. The forwarded body is rebuilt
 * from these fields rather than passed through.
 */
export function sanitiseEstimateRequest(body, allowedModels) {
  const fail = () => {
    throw new HttpError(400, 'unsupported_request', 'Unsupported request.');
  };
  if (!body || typeof body !== 'object' || !allowedModels.includes(body.model)) fail();
  const [system, user] = Array.isArray(body.messages) && body.messages.length === 2 ? body.messages : fail();
  if (system?.role !== 'system' || typeof system.content !== 'string' || system.content.length > 4000) fail();
  if (user?.role !== 'user' || !Array.isArray(user.content) || user.content.length > 4) fail();
  let images = 0;
  for (const part of user.content) {
    if (part?.type === 'text' && typeof part.text === 'string' && part.text.length <= 2000) continue;
    if (part?.type === 'image_url' && typeof part.image_url?.url === 'string' && part.image_url.url.startsWith('data:image/jpeg;base64,')) {
      images++;
      continue;
    }
    fail();
  }
  if (images !== 1) fail();
  if (body.response_format?.type !== 'json_schema' || typeof body.response_format.json_schema !== 'object') fail();
  return {
    model: body.model,
    temperature: typeof body.temperature === 'number' ? Math.min(Math.max(body.temperature, 0), 1) : 0.2,
    max_tokens: Math.min(Number(body.max_tokens) || 900, 1200),
    response_format: { type: 'json_schema', json_schema: body.response_format.json_schema },
    messages: [
      { role: 'system', content: system.content },
      {
        role: 'user',
        content: user.content.map((p) => (p.type === 'text' ? { type: 'text', text: p.text } : { type: 'image_url', image_url: { url: p.image_url.url, detail: 'auto' } })),
      },
    ],
  };
}

/**
 * The HTTP handler. Dependencies are passed in so tests can replace Apple's
 * token check, OpenAI and the clock.
 *
 * Routes:
 *   POST   /v1/session   { identityToken, nonce } → { token, expiresAt, dailyLimit, usedToday, resetsAt }
 *   GET    /v1/usage     → { dailyLimit, usedToday, resetsAt }
 *   POST   /v1/estimate  a Chat Completions body from the app → OpenAI's answer
 *   DELETE /v1/account   deletes the user and their usage
 *   GET    /healthz
 */
export function createApp(config, deps) {
  const { store, verifyAppleToken, fetch: fetchImpl = fetch, now = Date.now, log = console } = deps;
  const secret = new TextEncoder().encode(config.sessionSecret);
  const sessionAttempts = new Map();

  const send = (res, status, body, headers = {}) => {
    res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers });
    res.end(body === undefined ? '' : JSON.stringify(body));
  };

  async function readJson(req) {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > config.maxBodyBytes) throw new HttpError(413, 'too_large', 'Photo too large.');
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > config.maxBodyBytes) throw new HttpError(413, 'too_large', 'Photo too large.');
      chunks.push(chunk);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      throw new HttpError(400, 'invalid_json', 'Invalid JSON.');
    }
  }

  const clientIp = (req) => (config.trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';

  /** At most 10 sign-ins a minute from one address. */
  function limitSignIns(ip) {
    const t = now();
    const recent = (sessionAttempts.get(ip) ?? []).filter((x) => t - x < 60_000);
    if (recent.length >= 10) throw new HttpError(429, 'rate_limited', 'Too many sign-in attempts. Try again in a minute.');
    recent.push(t);
    sessionAttempts.set(ip, recent);
    if (sessionAttempts.size > 10_000) sessionAttempts.clear();
  }

  async function authenticate(req) {
    const header = String(req.headers.authorization ?? '');
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!token) throw new HttpError(401, 'sign_in_required', 'Sign in to use photo estimates.');
    let payload;
    try {
      ({ payload } = await jwtVerify(token, secret, { issuer: SESSION_ISSUER, algorithms: ['HS256'], currentDate: new Date(now()) }));
    } catch {
      throw new HttpError(401, 'sign_in_required', 'Your sign-in has expired. Sign in again.');
    }
    const user = typeof payload.sub === 'string' ? store.getUser(payload.sub) : null;
    if (!user || (payload.iat ?? 0) * 1000 < user.sessions_valid_after) throw new HttpError(401, 'sign_in_required', 'Your sign-in has expired. Sign in again.');
    return user;
  }

  const usage = (userId) => {
    const t = now();
    return { dailyLimit: config.dailyLimit, usedToday: store.usedToday(userId, utcDay(t)), resetsAt: nextUtcMidnight(t) };
  };

  async function createSession(req, res) {
    limitSignIns(clientIp(req));
    const { identityToken, nonce } = await readJson(req);
    if (typeof identityToken !== 'string' || typeof nonce !== 'string' || nonce.length < 16) {
      throw new HttpError(400, 'invalid_request', 'Missing Apple sign-in.');
    }
    let claims;
    try {
      claims = await verifyAppleToken(identityToken);
    } catch {
      throw new HttpError(401, 'apple_token_invalid', 'Apple sign-in couldn’t be verified. Try again.');
    }
    // The app asked Apple to embed SHA-256(nonce), so a token can only be used once, by the app that requested it.
    if (typeof claims.sub !== 'string' || !claims.sub || claims.nonce !== sha256Hex(nonce)) {
      throw new HttpError(401, 'apple_token_invalid', 'Apple sign-in couldn’t be verified. Try again.');
    }
    const userId = `apple:${claims.sub}`;
    store.ensureUser(userId, now());
    const issuedAt = Math.floor(now() / 1000);
    const expiresAt = (issuedAt + config.sessionDays * 86_400) * 1000;
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuer(SESSION_ISSUER)
      .setSubject(userId)
      .setIssuedAt(issuedAt)
      .setExpirationTime(expiresAt / 1000)
      .sign(secret);
    send(res, 200, { token, expiresAt, ...usage(userId) });
  }

  async function estimate(req, res) {
    const user = await authenticate(req);
    const body = sanitiseEstimateRequest(await readJson(req), config.allowedModels);
    const day = utcDay(now());
    const blocked = store.reserve(user.id, day, config.dailyLimit, config.globalDailyLimit);
    if (blocked === 'user') {
      throw new HttpError(429, 'daily_limit', `You’ve used today’s ${config.dailyLimit} photo estimates. They reset at midnight UTC.`);
    }
    if (blocked === 'global') throw new HttpError(503, 'busy', 'Photo estimates are busy today. Try again tomorrow, or add a meal by hand.');

    let upstream;
    let json = null;
    try {
      upstream = await fetchImpl(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.openaiKey}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      });
      json = await upstream.json().catch(() => null);
    } catch (e) {
      store.release(user.id, day);
      log.error?.('openai request failed', e?.message);
      throw new HttpError(502, 'upstream_unreachable', 'The AI service didn’t answer. Try again in a minute.');
    }
    if (!upstream.ok) {
      store.release(user.id, day);
      log.error?.('openai error', upstream.status, json?.error?.code ?? '', json?.error?.message ?? '');
      // A rejected key or exhausted credit is the server's problem, not the user's: don't echo OpenAI's wording about API keys.
      if (upstream.status === 400 && json?.error?.message) throw new HttpError(400, 'photo_rejected', `OpenAI couldn’t read the photo: ${json.error.message}`);
      throw new HttpError(502, 'upstream_error', 'The AI service is having trouble. Try again in a minute.');
    }
    const used = store.usedToday(user.id, day);
    send(res, 200, json, { 'X-Pacebook-Used': String(used), 'X-Pacebook-Limit': String(config.dailyLimit) });
  }

  async function route(req, res) {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    if (req.method === 'GET' && path === '/healthz') return send(res, 200, { ok: true });
    if (req.method === 'POST' && path === '/v1/session') return createSession(req, res);
    if (req.method === 'GET' && path === '/v1/usage') return send(res, 200, usage((await authenticate(req)).id));
    if (req.method === 'POST' && path === '/v1/estimate') return estimate(req, res);
    if (req.method === 'DELETE' && path === '/v1/account') {
      const user = await authenticate(req);
      store.deleteUser(user.id);
      return send(res, 204);
    }
    throw new HttpError(404, 'not_found', 'Not found.');
  }

  return async function handler(req, res) {
    try {
      await route(req, res);
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: { code: e.code, message: e.message } });
      log.error?.('unhandled', e);
      send(res, 500, { error: { code: 'server_error', message: 'Something went wrong.' } });
    }
  };
}
