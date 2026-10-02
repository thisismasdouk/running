import {
  CHATGPT_ISSUER,
  ChatgptAuthError,
  getFreshSession,
  hasPlanAccess,
  listChatgptModels,
  loadSession,
  readChatgptConfig,
  sessionFromTokens,
  signOut,
  validateIdToken,
  type ChatgptSession,
} from '../chatgpt';
import { getChatgptSession, setChatgptSession } from '../secrets';

jest.mock('../secrets', () => {
  let saved: unknown = null;
  return {
    getChatgptSession: jest.fn(async () => saved),
    setChatgptSession: jest.fn(async (s: unknown) => {
      saved = s;
    }),
    deleteChatgptSession: jest.fn(async () => {
      saved = null;
    }),
  };
});

const config = { clientId: 'oaiapp_pacebook', redirectUri: 'pacebook://auth/callback' };
const NOW = 1_790_000_000_000;

const base64url = (text: string) => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jwt = (claims: Record<string, unknown>) => `e30.${base64url(JSON.stringify(claims))}.sig`;
const idToken = (over: Record<string, unknown> = {}) =>
  jwt({ iss: CHATGPT_ISSUER, aud: config.clientId, sub: 'user-1', email: 'zoë@example.com', nonce: 'n1', exp: NOW / 1000 + 600, ...over });

const session = (over: Partial<ChatgptSession> = {}): ChatgptSession => ({
  clientId: config.clientId,
  issuer: CHATGPT_ISSUER,
  subject: 'user-1',
  email: 'zoë@example.com',
  idToken: idToken(),
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  scopes: ['openid', 'chatgpt.tokens.use.direct'],
  expiresAt: NOW + 3_600_000,
  savedAt: NOW,
  ...over,
});

const DISCOVERY = {
  issuer: CHATGPT_ISSUER,
  authorization_endpoint: 'https://auth.openai.com/api/accounts/authorize',
  token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
  revocation_endpoint: 'https://auth.openai.com/api/accounts/oauth/revoke',
};

type Call = { url: string; body: URLSearchParams };

/** Serves the discovery document and answers every other request with `respond`. */
function mockFetch(respond: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  globalThis.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/.well-known/openid-configuration')) return { ok: true, status: 200, json: async () => DISCOVERY };
    const call = { url, body: new URLSearchParams(String(init?.body ?? '')) };
    calls.push(call);
    const { status, body } = respond(call);
    return { ok: status < 400, status, json: async () => body };
  }) as unknown as typeof fetch;
  return calls;
}

describe('ChatGPT sign-in config', () => {
  it('is off until a client ID is filled in', () => {
    expect(readChatgptConfig(undefined)).toBeNull();
    expect(readChatgptConfig({ chatgpt: { clientId: '', redirectUri: 'pacebook://auth/callback' } })).toBeNull();
    expect(readChatgptConfig({ chatgpt: config })).toEqual(config);
  });

  it('refuses client IDs that belong to other apps', () => {
    expect(readChatgptConfig({ chatgpt: { ...config, clientId: 'dynamic_agent_client' } })).toBeNull();
    expect(readChatgptConfig({ chatgpt: { ...config, clientId: 'app_EMoamEEZ73f0CkXaXp7hrann' } })).toBeNull();
  });
});

describe('ChatGPT ID token', () => {
  it('accepts a token for this client, nonce and time', () => {
    expect(validateIdToken(idToken(), { clientId: config.clientId, nonce: 'n1' }, NOW)).toEqual({ subject: 'user-1', email: 'zoë@example.com' });
  });

  it('rejects the wrong issuer, audience, nonce, expiry or account', () => {
    const check = (over: Record<string, unknown>, expected = {}) => () => validateIdToken(idToken(over), { clientId: config.clientId, nonce: 'n1', ...expected }, NOW);
    expect(check({ iss: 'https://evil.example' })).toThrow(ChatgptAuthError);
    expect(check({ aud: 'oaiapp_other' })).toThrow(ChatgptAuthError);
    expect(check({ nonce: 'replayed' })).toThrow(ChatgptAuthError);
    expect(check({ exp: NOW / 1000 - 60 })).toThrow(ChatgptAuthError);
    expect(check({}, { subject: 'user-2' })).toThrow(ChatgptAuthError);
    expect(() => validateIdToken('not-a-jwt', { clientId: config.clientId }, NOW)).toThrow(ChatgptAuthError);
  });

  it('turns a token response into a session and reads plan permission from the granted scopes', () => {
    const tokens = { access_token: 'a', refresh_token: 'r', id_token: idToken(), expires_in: 3600 };
    const withPlan = sessionFromTokens({ ...tokens, scope: 'chatgpt.tokens.use.direct email offline_access openid profile resource.invoke' }, config, 'n1', NOW);
    expect(withPlan).toMatchObject({ subject: 'user-1', clientId: config.clientId, expiresAt: NOW + 3_600_000 });
    expect(hasPlanAccess(withPlan)).toBe(true);
    expect(hasPlanAccess(sessionFromTokens({ ...tokens, scope: 'openid profile email' }, config, 'n1', NOW))).toBe(false);
    expect(() => sessionFromTokens({ id_token: idToken() }, config, 'n1', NOW)).toThrow(ChatgptAuthError);
  });
});

describe('ChatGPT session', () => {
  it('never reuses a session issued to another client ID', async () => {
    await setChatgptSession(session({ clientId: 'oaiapp_someone_else' }));
    expect(await loadSession(config)).toBeNull();
    expect(await getChatgptSession()).toBeNull();
  });

  it('uses a fresh access token without calling OpenAI', async () => {
    await setChatgptSession(session());
    const calls = mockFetch(() => ({ status: 500 }));
    expect((await getFreshSession(config, NOW))?.accessToken).toBe('access-1');
    expect(calls).toHaveLength(0);
  });

  it('refreshes once near expiry and stores the rotated tokens together', async () => {
    await setChatgptSession(session({ expiresAt: NOW + 60_000 }));
    const calls = mockFetch(() => ({ status: 200, body: { access_token: 'access-2', refresh_token: 'refresh-2', expires_in: 3600, scope: 'openid chatgpt.tokens.use.direct' } }));
    const [a, b] = await Promise.all([getFreshSession(config, NOW), getFreshSession(config, NOW)]);
    expect(a?.accessToken).toBe('access-2');
    expect(b?.accessToken).toBe('access-2');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(DISCOVERY.token_endpoint);
    expect(Object.fromEntries(calls[0].body)).toEqual({ grant_type: 'refresh_token', client_id: config.clientId, refresh_token: 'refresh-1', resource: 'https://api.openai.com/v1' });
    expect(await getChatgptSession()).toMatchObject({ accessToken: 'access-2', refreshToken: 'refresh-2' });
  });

  it('asks for a new sign-in when the refresh token is no longer usable', async () => {
    await setChatgptSession(session({ expiresAt: NOW - 1 }));
    mockFetch(() => ({ status: 400, body: { error: 'invalid_grant' } }));
    await expect(getFreshSession(config, NOW)).rejects.toMatchObject({ signInRequired: true });
    expect(await getChatgptSession()).toBeNull();
  });

  it('keeps the saved tokens through a temporary failure', async () => {
    await setChatgptSession(session({ expiresAt: NOW - 1 }));
    mockFetch(() => ({ status: 503, body: null }));
    await expect(getFreshSession(config, NOW)).rejects.toMatchObject({ signInRequired: false });
    expect(await getChatgptSession()).toMatchObject({ refreshToken: 'refresh-1' });
  });

  it('revokes the refresh token and clears the device on sign-out', async () => {
    await setChatgptSession(session());
    const calls = mockFetch(() => ({ status: 200 }));
    expect(await signOut(config)).toEqual({ revoked: true });
    expect(calls[0].url).toBe(DISCOVERY.revocation_endpoint);
    expect(Object.fromEntries(calls[0].body)).toEqual({ token: 'refresh-1', token_type_hint: 'refresh_token', client_id: config.clientId });
    expect(await getChatgptSession()).toBeNull();
  });

  it('still signs out locally when revocation is not confirmed', async () => {
    await setChatgptSession(session());
    mockFetch(() => ({ status: 400 }));
    expect(await signOut(config)).toEqual({ revoked: false });
    expect(await getChatgptSession()).toBeNull();
  });

  it('lists the models meant for display, in the server’s order', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ models: [{ slug: 'b', display_name: 'B', visibility: 'list' }, { slug: 'hidden', visibility: 'hide' }, { slug: 'a', visibility: 'list' }] }),
    })) as unknown as typeof fetch;
    expect(await listChatgptModels('access-1')).toEqual([
      { slug: 'b', name: 'B' },
      { slug: 'a', name: 'a' },
    ]);
  });
});
