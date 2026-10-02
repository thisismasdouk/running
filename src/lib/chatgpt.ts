import { deleteChatgptSession, getChatgptSession, setChatgptSession } from './secrets';

/**
 * "Sign in with ChatGPT" (developers.openai.com/siwc): the token side of the
 * OAuth flow, with no UI. Pacebook is a public client: authorization code
 * with PKCE, no client secret. The client ID is issued by OpenAI and read
 * from app config (`extra.chatgpt.clientId` in app.json).
 *
 * With the ChatGPT plan scopes granted, the access token can call the
 * Responses API and the usage counts against the person's ChatGPT plan.
 */

export const CHATGPT_ISSUER = 'https://auth.openai.com';
/** The `resource` sent on authorize, code exchange and refresh. */
export const CHATGPT_RESOURCE = 'https://api.openai.com/v1';
export const IDENTITY_SCOPES = ['openid', 'profile', 'email'];
/** The scope that lets requests use the person's ChatGPT plan. A valid ID token alone doesn't. */
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const PLAN_SCOPES = ['offline_access', 'resource.invoke', PLAN_SCOPE];
export const CHATGPT_MODELS_URL = 'https://api.openai.com/v1/models';
/** Where people review and limit each app's use of their plan. */
export const CHATGPT_USAGE_URL = 'https://chatgpt.com/#settings';

/**
 * Client IDs that belong to someone else and must never be used here: the
 * open-source registration entry point and the Codex app's own client.
 */
const FORBIDDEN_CLIENT_IDS = ['dynamic_agent_client', 'app_EMoamEEZ73f0CkXaXp7hrann'];

/** Refresh this long before the access token expires. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

export type ChatgptConfig = { clientId: string; redirectUri: string };

export type ChatgptSession = {
  /** The client the tokens were issued to; a session from another client ID is never reused. */
  clientId: string;
  issuer: string;
  subject: string;
  email: string | null;
  /** Kept only to send as `id_token_hint` when signing in again. */
  idToken: string;
  accessToken: string;
  refreshToken: string | null;
  scopes: string[];
  /** Unix ms. */
  expiresAt: number;
  savedAt: number;
};

export type Discovery = { authorizationEndpoint: string; tokenEndpoint: string; revocationEndpoint: string | null };

type TokenBody = { access_token?: string; refresh_token?: string; id_token?: string; expires_in?: number; scope?: string };

export class ChatgptAuthError extends Error {
  /** True when the saved sign-in can't be used any more and the person has to sign in again. */
  signInRequired: boolean;
  constructor(message: string, signInRequired = false) {
    super(message);
    this.signInRequired = signInRequired;
  }
}

/** Reads `extra.chatgpt` from app config. Null until OpenAI has issued a client ID. */
export function readChatgptConfig(extra: unknown): ChatgptConfig | null {
  const raw = (extra as { chatgpt?: { clientId?: unknown; redirectUri?: unknown } } | null | undefined)?.chatgpt;
  const clientId = typeof raw?.clientId === 'string' ? raw.clientId.trim() : '';
  const redirectUri = typeof raw?.redirectUri === 'string' ? raw.redirectUri.trim() : '';
  if (!clientId || !redirectUri) return null;
  if (FORBIDDEN_CLIENT_IDS.includes(clientId)) return null;
  return { clientId, redirectUri };
}

export const hasPlanAccess = (session: Pick<ChatgptSession, 'scopes'> | null) => !!session?.scopes.includes(PLAN_SCOPE);

let discovery: Promise<Discovery> | null = null;

/** OpenAI's endpoints, from its OpenID Connect discovery document. */
export function getDiscovery(): Promise<Discovery> {
  discovery ??= (async () => {
    const res = await fetch(`${CHATGPT_ISSUER}/.well-known/openid-configuration`, { headers: { Accept: 'application/json' } });
    const doc = (await res.json().catch(() => null)) as Record<string, unknown> | null;
    if (!res.ok || doc?.issuer !== CHATGPT_ISSUER || typeof doc.authorization_endpoint !== 'string' || typeof doc.token_endpoint !== 'string') {
      throw new ChatgptAuthError('Couldn’t reach ChatGPT sign-in. Try again in a moment.');
    }
    return {
      authorizationEndpoint: doc.authorization_endpoint,
      tokenEndpoint: doc.token_endpoint,
      revocationEndpoint: typeof doc.revocation_endpoint === 'string' ? doc.revocation_endpoint : null,
    };
  })();
  discovery.catch(() => {
    discovery = null;
  });
  return discovery;
}

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const part = jwt.split('.')[1] ?? '';
  const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const bytes = atob(base64);
  const utf8 = decodeURIComponent(Array.from(bytes, (ch) => `%${ch.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''));
  return JSON.parse(utf8);
}

/**
 * Checks an ID token's claims: issuer, audience, expiry, nonce and subject.
 *
 * The signature isn't checked against OpenAI's JWKS: Pacebook has no backend
 * and React Native has no WebCrypto. The token is only ever accepted straight
 * from OpenAI's token endpoint over TLS in a PKCE exchange, where OpenID
 * Connect Core §3.1.3.7 allows TLS server validation in place of the
 * signature check. Never accept an ID token from any other source.
 */
export function validateIdToken(idToken: string, expected: { clientId: string; nonce?: string; subject?: string }, now = Date.now()) {
  let claims: Record<string, unknown>;
  try {
    claims = decodeJwtPayload(idToken);
  } catch {
    throw new ChatgptAuthError('ChatGPT sign-in returned an unreadable identity.');
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const ok =
    claims.iss === CHATGPT_ISSUER &&
    aud.includes(expected.clientId) &&
    typeof claims.exp === 'number' &&
    claims.exp * 1000 > now - 5000 &&
    typeof claims.sub === 'string' &&
    !!claims.sub &&
    (expected.nonce === undefined || claims.nonce === expected.nonce) &&
    (expected.subject === undefined || claims.sub === expected.subject);
  if (!ok) throw new ChatgptAuthError('ChatGPT sign-in couldn’t be verified. Try again.');
  return { subject: claims.sub as string, email: typeof claims.email === 'string' ? claims.email : null };
}

/** Builds the record to store from a code exchange. Throws unless the ID token checks out. */
export function sessionFromTokens(tokens: TokenBody, config: ChatgptConfig, nonce: string, now = Date.now()): ChatgptSession {
  if (!tokens.access_token || !tokens.id_token) throw new ChatgptAuthError('ChatGPT sign-in didn’t return a session. Try again.');
  const identity = validateIdToken(tokens.id_token, { clientId: config.clientId, nonce }, now);
  return {
    clientId: config.clientId,
    issuer: CHATGPT_ISSUER,
    subject: identity.subject,
    email: identity.email,
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token ?? null,
    scopes: (tokens.scope ?? '').split(' ').filter(Boolean),
    expiresAt: now + (tokens.expires_in ?? 3600) * 1000,
    savedAt: now,
  };
}

/** The saved sign-in, or null. A session issued to a different client ID is dropped, never reused. */
export async function loadSession(config: ChatgptConfig | null): Promise<ChatgptSession | null> {
  if (!config) return null;
  const session = await getChatgptSession().catch(() => null);
  if (!session) return null;
  if (session.clientId !== config.clientId || session.issuer !== CHATGPT_ISSUER) {
    await deleteChatgptSession().catch(() => {});
    return null;
  }
  return session;
}

const TERMINAL_REFRESH_ERRORS = ['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused'];

const errorCode = (body: unknown): string | null => {
  const error = (body as { error?: unknown } | null)?.error;
  if (typeof error === 'string') return error;
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' ? code : null;
};

async function refresh(session: ChatgptSession): Promise<ChatgptSession> {
  if (!session.refreshToken) {
    await deleteChatgptSession();
    throw new ChatgptAuthError('Your ChatGPT sign-in has expired. Sign in again in Food → AI settings.', true);
  }
  const { tokenEndpoint } = await getDiscovery();
  let res: Response;
  try {
    res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      // No `scope`, so the existing grant is kept.
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: session.clientId, refresh_token: session.refreshToken, resource: CHATGPT_RESOURCE }).toString(),
    });
  } catch {
    throw new ChatgptAuthError('Couldn’t reach ChatGPT to renew your sign-in. Check your internet connection.');
  }
  const body = (await res.json().catch(() => null)) as TokenBody | null;
  if (!res.ok || !body?.access_token) {
    const code = errorCode(body);
    if (code && TERMINAL_REFRESH_ERRORS.includes(code)) {
      await deleteChatgptSession();
      throw new ChatgptAuthError('Your ChatGPT sign-in has expired. Sign in again in Food → AI settings.', true);
    }
    // Anything else (network, 5xx, a misconfigured client) keeps the saved tokens.
    throw new ChatgptAuthError(code === 'invalid_client' ? 'ChatGPT sign-in isn’t set up correctly in this build.' : 'Couldn’t renew your ChatGPT sign-in. Try again in a moment.');
  }
  if (body.id_token) validateIdToken(body.id_token, { clientId: session.clientId, subject: session.subject });
  const now = Date.now();
  // The refresh token rotates: the access token, expiry, scopes and new refresh token are replaced together.
  const next: ChatgptSession = {
    ...session,
    accessToken: body.access_token,
    refreshToken: body.refresh_token ?? session.refreshToken,
    idToken: body.id_token ?? session.idToken,
    scopes: body.scope ? body.scope.split(' ').filter(Boolean) : session.scopes,
    expiresAt: now + (body.expires_in ?? 3600) * 1000,
    savedAt: now,
  };
  await setChatgptSession(next);
  return next;
}

let refreshing: Promise<ChatgptSession> | null = null;

/** The saved sign-in with an access token that's good to use, refreshing it first when it's about to expire. */
export async function getFreshSession(config: ChatgptConfig | null, now = Date.now()): Promise<ChatgptSession | null> {
  const session = await loadSession(config);
  if (!session || session.expiresAt - now > REFRESH_MARGIN_MS) return session;
  // One refresh at a time: two racing refreshes would each spend the same rotating token.
  refreshing ??= refresh(session).finally(() => {
    refreshing = null;
  });
  return refreshing;
}

/**
 * Signs out: ends the renewable session at OpenAI, then clears the tokens from
 * this device. `revoked` is false when OpenAI couldn't be told, in which case
 * the person can disconnect Pacebook in ChatGPT settings.
 */
export async function signOut(config: ChatgptConfig | null): Promise<{ revoked: boolean }> {
  const session = await loadSession(config);
  if (!session) return { revoked: true };
  let revoked = !session.refreshToken;
  if (session.refreshToken) {
    for (let attempt = 0; attempt < 3 && !revoked; attempt++) {
      try {
        if (attempt) await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
        const { revocationEndpoint } = await getDiscovery();
        if (!revocationEndpoint) break;
        const res = await fetch(revocationEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: session.refreshToken, token_type_hint: 'refresh_token', client_id: session.clientId }).toString(),
        });
        revoked = res.ok;
        if (res.status < 500) break;
      } catch {
        // Network failure: try again.
      }
    }
  }
  await deleteChatgptSession();
  return { revoked };
}

export type ChatgptModel = { slug: string; name: string };

/** The models this ChatGPT account can use, in the server's order. */
export async function listChatgptModels(accessToken: string): Promise<ChatgptModel[]> {
  const res = await fetch(CHATGPT_MODELS_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  const body = (await res.json().catch(() => null)) as { models?: { slug?: unknown; display_name?: unknown; visibility?: unknown }[] } | null;
  if (!res.ok || !Array.isArray(body?.models)) throw new ChatgptAuthError('Couldn’t load the models for your ChatGPT account.');
  return body.models
    .filter((m) => m.visibility === 'list' && typeof m.slug === 'string')
    .map((m) => ({ slug: m.slug as string, name: typeof m.display_name === 'string' ? m.display_name : (m.slug as string) }));
}
