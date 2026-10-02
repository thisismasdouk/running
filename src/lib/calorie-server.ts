import type { Profile } from './types';

/**
 * The Pacebook calorie server (server/calorie-server): people sign in with
 * Apple, get a daily allowance of photo estimates, and the OpenAI key stays
 * on the server. This file is the plain HTTP side; the Apple sign-in itself
 * is in calorie-server-auth.ts.
 */

export type ServerSession = {
  /** The server the session belongs to; a session is never sent to another server. */
  base: string;
  token: string;
  expiresAt: number;
};

export type ServerUsage = { dailyLimit: number; usedToday: number; resetsAt: number };

export class ServerError extends Error {
  /** The session is no longer accepted and the person has to sign in again. */
  signInRequired: boolean;
  constructor(message: string, signInRequired = false) {
    super(message);
    this.signInRequired = signInRequired;
  }
}

/** `expo.extra.calorieServer.url` from app.json, or null when the app ships without a server. */
export function readServerConfig(extra: unknown): string | null {
  const url = (extra as { calorieServer?: { url?: unknown } } | null | undefined)?.calorieServer?.url;
  return typeof url === 'string' && /^https:\/\/[^\s/]+/.test(url.trim()) ? normaliseBase(url) : null;
}

export const normaliseBase = (url: string) => url.trim().replace(/\/+$/, '');

/**
 * The calorie server photo estimates should use, or null for "my own OpenAI
 * key". An address typed in settings wins over the one the app ships with.
 */
export function serverBase(profile: Pick<Profile, 'aiUseOwnKey' | 'aiProxyUrl'>, configured: string | null): string | null {
  if (profile.aiUseOwnKey) return null;
  const typed = profile.aiProxyUrl?.trim();
  return typed ? normaliseBase(typed) : configured;
}

export const estimateUrl = (base: string) => `${normaliseBase(base)}/v1/estimate`;

/** The usable session for this server, or null if there's none or it has expired. */
export function sessionFor(session: ServerSession | null, base: string | null, now = Date.now()): ServerSession | null {
  if (!session || !base || session.base !== normaliseBase(base) || session.expiresAt <= now) return null;
  return session;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ServerError('Couldn’t reach the Pacebook AI server. Check your internet connection.');
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string } } | null;
  if (!res.ok) {
    const code = body?.error?.code;
    throw new ServerError(body?.error?.message ?? `The Pacebook AI server answered ${res.status}.`, code === 'sign_in_required' || res.status === 401);
  }
  return body as T;
}

/** Trades a Sign in with Apple identity token for a session on the server. */
export async function createServerSession(base: string, identityToken: string, nonce: string): Promise<{ session: ServerSession; usage: ServerUsage }> {
  const body = await request<{ token: string; expiresAt: number } & ServerUsage>(`${normaliseBase(base)}/v1/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identityToken, nonce }),
  });
  return {
    session: { base: normaliseBase(base), token: body.token, expiresAt: body.expiresAt },
    usage: { dailyLimit: body.dailyLimit, usedToday: body.usedToday, resetsAt: body.resetsAt },
  };
}

export const fetchUsage = (session: ServerSession) =>
  request<ServerUsage>(`${session.base}/v1/usage`, { headers: { Authorization: `Bearer ${session.token}` } });

/** Deletes the person's account on the server (their Apple user ID and daily counts). */
export const deleteServerAccount = (session: ServerSession) =>
  request<void>(`${session.base}/v1/account`, { method: 'DELETE', headers: { Authorization: `Bearer ${session.token}` } });
