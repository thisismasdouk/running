import type { FoodItem, Totals } from './food';
import { sumTotals } from './food';

/**
 * Calorie estimates from a meal photo, using OpenAI's Chat Completions API
 * with a vision model and a strict JSON schema.
 *
 * The app never ships an API key. Requests go either straight to OpenAI with
 * a key the user entered on their own device (kept in the iOS Keychain /
 * Android Keystore), or to a proxy server that adds the key (see
 * server/openai-proxy). Only the photo and an optional note are sent.
 */

export const DEFAULT_AI_MODEL = 'gpt-4o-mini';
export const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export type FoodAnalysis = Totals & {
  name: string;
  items: FoodItem[];
  confidence: 'low' | 'medium' | 'high';
  notes: string;
};

export type AiConfig = { apiKey: string | null; proxyUrl: string | null; model: string };

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

export class FoodAiError extends Error {}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);

/** Reads a Chat Completions response into an analysis, or throws a FoodAiError with a message for the user. */
export function parseFoodResponse(body: unknown): FoodAnalysis {
  const choice = (body as { choices?: { message?: { content?: string | null; refusal?: string | null } }[] })?.choices?.[0];
  const message = choice?.message;
  if (message?.refusal) throw new FoodAiError(`The AI declined: ${message.refusal}`);
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(message?.content ?? '');
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
  if (status === 401) return viaProxy ? 'The calorie server refused the request (401). Check its URL and token.' : 'OpenAI rejected the API key. Check it in Food → AI settings.';
  if (status === 429)
    return apiMessage?.code === 'insufficient_quota'
      ? 'Your OpenAI account is out of credit. Add credit at platform.openai.com/settings/organization/billing.'
      : 'Too many requests right now. Wait a moment and try again.';
  if (status === 404 || apiMessage?.code === 'model_not_found') return `The model isn’t available to this key. Pick another model in Food → AI settings.`;
  if (status === 400 && apiMessage?.message) return `OpenAI couldn’t read the photo: ${apiMessage.message}`;
  if (status >= 500) return 'The AI service is having trouble. Try again in a minute.';
  return apiMessage?.message ?? `Request failed (${status}).`;
}

/** Sends one photo for analysis. `base64Jpeg` is the image data without a data-URL prefix. */
export async function analyseFoodPhoto(base64Jpeg: string, config: AiConfig, note?: string, signal?: AbortSignal): Promise<FoodAnalysis> {
  const viaProxy = !!config.proxyUrl;
  if (!viaProxy && !config.apiKey) throw new FoodAiError('Add your OpenAI API key in Food → AI settings first.');
  const body = buildFoodRequest(`data:image/jpeg;base64,${base64Jpeg}`, config.model || DEFAULT_AI_MODEL, note);
  let res: Response;
  try {
    res = await fetch(viaProxy ? config.proxyUrl! : OPENAI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(viaProxy ? {} : { Authorization: `Bearer ${config.apiKey}` }) },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e;
    throw new FoodAiError('Couldn’t reach the AI service. Check your internet connection.');
  }
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new FoodAiError(describeHttpError(res.status, json, viaProxy));
  return parseFoodResponse(json);
}
