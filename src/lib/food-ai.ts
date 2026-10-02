import { estimateUrl } from './calorie-server';
import type { FoodItem, Totals } from './food';
import { sumTotals } from './food';

/**
 * Calorie estimates from a meal photo, using an OpenAI vision model and a
 * strict JSON schema.
 *
 * The app never ships an API key. Requests go one of three ways:
 *  - with "Sign in with ChatGPT", to the Responses API with the person's
 *    OAuth access token, so usage counts against their ChatGPT plan;
 *  - straight to Chat Completions with a key the user entered on their own
 *    device (kept in the iOS Keychain / Android Keystore);
 *  - to the Pacebook calorie server (server/calorie-server), which holds
 *    the key, after the person signs in with Apple there.
 * Only the photo and an optional note are sent.
 */

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
/** The only endpoint ChatGPT plan requests may use. */
export const RESPONSES_URL = 'https://api.openai.com/v1/responses';

export type FoodAnalysis = Totals & {
  name: string;
  items: FoodItem[];
  confidence: 'low' | 'medium' | 'high';
  notes: string;
};

export type AiConfig = {
  apiKey: string | null;
  /** The calorie server's base address, used with `serverToken`. */
  proxyUrl: string | null;
  serverToken?: string | null;
  model: string;
  /** Set when signed in with ChatGPT with plan use allowed; the request then uses the plan and nothing else. */
  chatgpt?: { accessToken: string; model: string } | null;
};

const ITEM_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'portion', 'kcal', 'protein_g', 'carbs_g', 'fat_g'],
  properties: {
    name: { type: 'string', description: 'Food name, e.g. "Grilled chicken breast"' },
    portion: { type: 'string', description: 'Estimated amount, e.g. "150 g" or "1 cup"' },
    kcal: { type: 'number' },
    protein_g: { type: 'number' },
    carbs_g: { type: 'number' },
    fat_g: { type: 'number' },
  },
};

export const FOOD_SCHEMA = {
  name: 'meal_estimate',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['is_food', 'name', 'items', 'confidence', 'notes'],
    properties: {
      is_food: { type: 'boolean', description: 'False if the photo does not show food or drink.' },
      name: { type: 'string', description: 'Short name for the whole meal, e.g. "Chicken salad with bread"' },
      items: { type: 'array', items: ITEM_SCHEMA },
      confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      notes: { type: 'string', description: 'One short sentence on assumptions, e.g. hidden oil or portion size.' },
    },
  },
} as const;

const SYSTEM_PROMPT =
  'You are a nutritionist estimating the calories in a meal photo for a runner\'s food diary. ' +
  'Identify each distinct food or drink, estimate its portion from visual cues (plate size, cutlery, hands, packaging), ' +
  'and give realistic calories and macros for that portion, including likely cooking oil, butter and sauces. ' +
  'When unsure, give your best single estimate rather than a range, and lower the confidence. ' +
  'If the image shows no food or drink, set is_food to false and return no items.';

/** The Chat Completions request body for one photo, as a JPEG data URL. */
export function buildFoodRequest(imageDataUrl: string, model: string, note?: string) {
  const text = note?.trim() ? `Estimate this meal. The person adds: "${note.trim()}"` : 'Estimate this meal.';
  return {
    model,
    temperature: 0.2,
    max_tokens: 900,
    response_format: { type: 'json_schema', json_schema: FOOD_SCHEMA },
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'auto' } },
        ],
      },
    ],
  };
}

/**
 * The Responses API request for one photo on the person's ChatGPT plan. Plan
 * requests must set `store: false` and `stream: true`, carry the prompt as
 * `instructions`, and leave out `temperature` and output-token limits.
 */
export function buildPlanFoodRequest(imageDataUrl: string, model: string, note?: string) {
  const text = note?.trim() ? `Estimate this meal. The person adds: "${note.trim()}"` : 'Estimate this meal.';
  return {
    model,
    instructions: SYSTEM_PROMPT,
    input: [
      {
        role: 'user',
        content: [
          { type: 'input_text', text },
          { type: 'input_image', image_url: imageDataUrl, detail: 'auto' },
        ],
      },
    ],
    text: { format: { type: 'json_schema', ...FOOD_SCHEMA } },
    store: false,
    stream: true,
  };
}

export class FoodAiError extends Error {
  /** What the error card should offer: ChatGPT usage settings, or signing in again. */
  action?: 'manage-usage' | 'sign-in' | 'server-sign-in';
  constructor(message: string, action?: 'manage-usage' | 'sign-in' | 'server-sign-in') {
    super(message);
    this.action = action;
  }
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Reads a Chat Completions response into an analysis, or throws a FoodAiError with a message for the user. */
export function parseFoodResponse(body: unknown): FoodAnalysis {
  const choice = (body as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] })?.choices?.[0];
  const message = choice?.message;
  if (message?.refusal) throw new FoodAiError(`The AI declined: ${message.refusal}`);
  return parseFoodJson(message?.content ?? '');
}

/** Reads the model's JSON answer into an analysis. */
function parseFoodJson(content: string): FoodAnalysis {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(content);
  } catch {
    throw new FoodAiError('The AI returned an unexpected answer. Try again, or add the meal by hand.');
  }
  if (data.is_food === false) throw new FoodAiError('No food found in that photo. Try a clearer shot of the plate.');
  const items: FoodItem[] = (Array.isArray(data.items) ? data.items : [])
    .map((raw: Record<string, unknown>) => ({
      name: typeof raw?.name === 'string' ? raw.name : 'Food',
      portion: typeof raw?.portion === 'string' ? raw.portion : '',
      kcal: num(raw?.kcal),
      proteinG: num(raw?.protein_g),
      carbsG: num(raw?.carbs_g),
      fatG: num(raw?.fat_g),
    }))
    .filter((i: FoodItem) => i.kcal > 0);
  if (items.length === 0) throw new FoodAiError('Couldn’t estimate that meal. Try a clearer photo or add it by hand.');
  const confidence = data.confidence === 'high' || data.confidence === 'low' ? data.confidence : 'medium';
  const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim() : items.map((i) => i.name).join(', ');
  return { name, items, confidence, notes: typeof data.notes === 'string' ? data.notes : '', ...sumTotals(items) };
}

/** A user-facing message for an HTTP error from OpenAI or the proxy. */
export function describeHttpError(status: number, body: unknown, viaProxy: boolean): string {
  const apiMessage = (body as { error?: { message?: string; code?: string } })?.error;
  // The calorie server writes its own messages for people (daily limit, busy, signed out).
  if (viaProxy && apiMessage?.message) return apiMessage.message;
  if (status === 401) return viaProxy ? 'Sign in again to use Pacebook AI.' : 'OpenAI rejected the API key. Check it in Food → AI settings.';
  if (status === 429)
    return apiMessage?.code === 'insufficient_quota'
      ? 'Your OpenAI account is out of credit. Add credit at platform.openai.com/settings/organization/billing.'
      : 'Too many requests right now. Wait a moment and try again.';
  if (status === 404 || apiMessage?.code === 'model_not_found') return `The model isn’t available to this key. Pick another model in Food → AI settings.`;
  if (status === 400 && apiMessage?.message) return `OpenAI couldn’t read the photo: ${apiMessage.message}`;
  if (status >= 500) return 'The AI service is having trouble. Try again in a minute.';
  return apiMessage?.message ?? `Request failed (${status}).`;
}

type StreamEvent = {
  type?: string;
  delta?: string;
  code?: string;
  message?: string;
  response?: {
    error?: { code?: string; message?: string } | null;
    output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  };
};

/**
 * Reads a streamed Responses API body (server-sent events) into an analysis.
 * Only `response.completed` counts as success: a usage limit can still fail a
 * response after text has started to arrive.
 */
export function parsePlanFoodStream(sse: string): FoodAnalysis {
  let text = '';
  let completed: StreamEvent['response'] | null = null;
  for (const line of sse.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    let event: StreamEvent;
    try {
      event = JSON.parse(line.slice(5));
    } catch {
      continue;
    }
    if (event.type === 'response.output_text.delta') text += event.delta ?? '';
    else if (event.type === 'response.completed') completed = event.response ?? {};
    else if (event.type === 'response.failed') throw planError(event.response?.error?.code ?? null, 0, event.response?.error?.message);
    else if (event.type === 'error') throw planError(event.code ?? null, 0, event.message);
    else if (event.type === 'response.incomplete') throw new FoodAiError('The AI stopped before finishing. Try again.');
  }
  if (!completed) throw new FoodAiError('The connection dropped before the estimate finished. Try again.');
  const parts = (completed.output ?? []).flatMap((item) => (item.type === 'message' ? (item.content ?? []) : []));
  const refusal = parts.find((p) => p.type === 'refusal')?.refusal;
  if (refusal) throw new FoodAiError(`The AI declined: ${refusal}`);
  const final = parts
    .filter((p) => p.type === 'output_text')
    .map((p) => p.text ?? '')
    .join('');
  return parseFoodJson(final || text);
}

/** A user-facing error for a failed ChatGPT plan request. Plan errors stop the estimate; no other billing path is tried. */
export function planError(code: string | null, status: number, detail?: string): FoodAiError {
  switch (code) {
    case 'subscription_sharing_usage_limit_exceeded':
      return new FoodAiError('Usage limit reached. Review your plan or this app’s limit in ChatGPT settings.', 'manage-usage');
    case 'subscription_sharing_user_not_eligible':
      return new FoodAiError('Your ChatGPT account can’t use its plan in Pacebook. Sign out in Food → AI settings to use an OpenAI key instead.');
    case 'subscription_sharing_usage_unavailable':
    case 'subscription_sharing_user_unavailable':
      return new FoodAiError('ChatGPT couldn’t check your plan just now. Try again in a minute.');
    case 'subscription_sharing_unsupported_capability':
      return new FoodAiError('That model can’t estimate photos on your ChatGPT plan. Pick another model in Food → AI settings.');
    case 'subscription_sharing_invalid_user':
      return new FoodAiError('ChatGPT didn’t accept your sign-in. Sign in again in Food → AI settings.', 'sign-in');
    case 'chatpass_v2_scope_not_authorized':
    case 'chatpass_v2_invalid_authorization_context':
    case 'subscription_sharing_route_not_supported':
      return new FoodAiError('ChatGPT plan use isn’t set up correctly for this app.');
  }
  if (status === 401) return new FoodAiError('ChatGPT didn’t accept your sign-in. Check the account in Food → AI settings.', 'sign-in');
  if (status === 403) return new FoodAiError('ChatGPT plan use isn’t allowed for this account or region.');
  if (status === 429) return new FoodAiError('Usage limit reached. Review your plan or this app’s limit in ChatGPT settings.', 'manage-usage');
  if (status >= 500) return new FoodAiError('ChatGPT plan use is unavailable right now. Try again in a minute.');
  return new FoodAiError(detail || (status ? `Request failed (${status}).` : 'The AI couldn’t finish the estimate. Try again.'));
}

async function analyseOnPlan(imageDataUrl: string, chatgpt: { accessToken: string; model: string }, note?: string, signal?: AbortSignal): Promise<FoodAnalysis> {
  let res: Response;
  try {
    res = await fetch(RESPONSES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${chatgpt.accessToken}` },
      body: JSON.stringify(buildPlanFoodRequest(imageDataUrl, chatgpt.model, note)),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new FoodAiError('Couldn’t reach the AI service. Check your internet connection.');
  }
  // The body is read once the stream has ended, then checked for `response.completed`.
  const raw = await res.text().catch(() => '');
  if (!res.ok) {
    // Before a stream opens, the error isn't always the standard API error object.
    let body: { error?: { code?: string; message?: string }; detail?: unknown } | null = null;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    throw planError(body?.error?.code ?? null, res.status, body?.error?.message ?? (typeof body?.detail === 'string' ? body.detail : undefined));
  }
  return parsePlanFoodStream(raw);
}

/** Sends one photo for analysis. `base64Jpeg` is the image data without a data-URL prefix. */
export async function analyseFoodPhoto(base64Jpeg: string, config: AiConfig, note?: string, signal?: AbortSignal): Promise<FoodAnalysis> {
  if (config.chatgpt) return analyseOnPlan(`data:image/jpeg;base64,${base64Jpeg}`, config.chatgpt, note, signal);
  const viaProxy = !!config.proxyUrl;
  if (!viaProxy && !config.apiKey) throw new FoodAiError('Add your OpenAI API key in Food → AI settings first.');
  const body = buildFoodRequest(`data:image/jpeg;base64,${base64Jpeg}`, config.model || DEFAULT_AI_MODEL, note);
  let res: Response;
  try {
    res = await fetch(viaProxy ? estimateUrl(config.proxyUrl!) : OPENAI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(viaProxy ? (config.serverToken ? { Authorization: `Bearer ${config.serverToken}` } : {}) : { Authorization: `Bearer ${config.apiKey}` }),
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new FoodAiError('Couldn’t reach the AI service. Check your internet connection.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const signedOut = viaProxy && (res.status === 401 || (json as { error?: { code?: string } } | null)?.error?.code === 'sign_in_required');
    throw new FoodAiError(describeHttpError(res.status, json, viaProxy), signedOut ? 'server-sign-in' : undefined);
  }
  return parseFoodResponse(json);
}
