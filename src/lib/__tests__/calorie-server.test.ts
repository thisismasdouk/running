import { createServerSession, estimateUrl, readServerConfig, serverBase, ServerError, sessionFor } from '../calorie-server';
import { analyseFoodPhoto, FoodAiError } from '../food-ai';

const json = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body });

describe('calorie server', () => {
  it('reads the server address from app config', () => {
    expect(readServerConfig({ calorieServer: { url: 'https://ai.example.com/' } })).toBe('https://ai.example.com');
    expect(readServerConfig({ calorieServer: { url: '' } })).toBeNull();
    expect(readServerConfig({ calorieServer: { url: 'http://ai.example.com' } })).toBeNull();
    expect(readServerConfig(undefined)).toBeNull();
  });

  it('picks the server unless the runner chose their own key', () => {
    const configured = 'https://ai.example.com';
    expect(serverBase({ aiUseOwnKey: false, aiProxyUrl: null }, configured)).toBe(configured);
    expect(serverBase({ aiUseOwnKey: false, aiProxyUrl: 'https://mine.example.com/' }, configured)).toBe('https://mine.example.com');
    expect(serverBase({ aiUseOwnKey: true, aiProxyUrl: 'https://mine.example.com' }, configured)).toBeNull();
    expect(serverBase({ aiUseOwnKey: false, aiProxyUrl: null }, null)).toBeNull();
    expect(estimateUrl('https://ai.example.com/')).toBe('https://ai.example.com/v1/estimate');
  });

  it('only reuses a session for the same server while it is valid', () => {
    const s = { base: 'https://ai.example.com', token: 't', expiresAt: 2000 };
    expect(sessionFor(s, 'https://ai.example.com/', 1000)).toBe(s);
    expect(sessionFor(s, 'https://other.example.com', 1000)).toBeNull();
    expect(sessionFor(s, 'https://ai.example.com', 3000)).toBeNull();
    expect(sessionFor(null, 'https://ai.example.com', 1000)).toBeNull();
  });

  it('trades an Apple token for a session', async () => {
    const calls: { url: string; body: string }[] = [];
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body) });
      return json(200, { token: 'tok', expiresAt: 5, dailyLimit: 30, usedToday: 2, resetsAt: 9 });
    }) as unknown as typeof fetch;
    const { session, usage } = await createServerSession('https://ai.example.com/', 'apple-jwt', 'nonce-1');
    expect(calls[0].url).toBe('https://ai.example.com/v1/session');
    expect(JSON.parse(calls[0].body)).toEqual({ identityToken: 'apple-jwt', nonce: 'nonce-1' });
    expect(session).toEqual({ base: 'https://ai.example.com', token: 'tok', expiresAt: 5 });
    expect(usage).toEqual({ dailyLimit: 30, usedToday: 2, resetsAt: 9 });

    globalThis.fetch = jest.fn(async () => json(401, { error: { code: 'apple_token_invalid', message: 'Apple sign-in couldn’t be verified.' } })) as unknown as typeof fetch;
    await expect(createServerSession('https://ai.example.com', 'x', 'y')).rejects.toBeInstanceOf(ServerError);
  });

  it('shows the server’s own messages and flags an expired sign-in', async () => {
    const config = { apiKey: null, proxyUrl: 'https://ai.example.com', serverToken: 'tok', model: 'm' };
    globalThis.fetch = jest.fn(async () =>
      json(429, { error: { code: 'daily_limit', message: 'You’ve used today’s 30 photo estimates. They reset at midnight UTC.' } }),
    ) as unknown as typeof fetch;
    await expect(analyseFoodPhoto('AAA', config)).rejects.toThrow(/today’s 30 photo estimates/);

    globalThis.fetch = jest.fn(async () => json(401, { error: { code: 'sign_in_required', message: 'Your sign-in has expired. Sign in again.' } })) as unknown as typeof fetch;
    const err = await analyseFoodPhoto('AAA', config).catch((e) => e);
    expect(err).toBeInstanceOf(FoodAiError);
    expect(err.action).toBe('server-sign-in');
  });
});
