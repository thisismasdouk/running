import { dailyCalories, dayKey, entriesOn, mealForTime, normaliseFood, scaleTotals, shiftDay, sumTotals, type FoodEntry } from '../food';
import { analyseFoodPhoto, buildFoodRequest, buildPlanFoodRequest, describeHttpError, FoodAiError, parseFoodResponse, parsePlanFoodStream, planError } from '../food-ai';

const entry = (day: string, kcal: number, at = 0): FoodEntry => ({
  id: `${day}-${kcal}`,
  day,
  at,
  meal: 'lunch',
  name: 'x',
  kcal,
  proteinG: 10,
  carbsG: 20,
  fatG: 5,
  source: 'manual',
});

const completion = (content: object | string) => ({
  choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content), refusal: null } }],
});

describe('food log', () => {
  it('works in local calendar days', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59).getTime())).toBe('2026-01-05');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2025-12-31', 1)).toBe('2026-01-01');
  });

  it('guesses the meal from the time', () => {
    const at = (h: number) => new Date(2026, 0, 5, h).getTime();
    expect(mealForTime(at(7))).toBe('breakfast');
    expect(mealForTime(at(13))).toBe('lunch');
    expect(mealForTime(at(16))).toBe('snack');
    expect(mealForTime(at(19))).toBe('dinner');
    expect(mealForTime(at(23))).toBe('snack');
  });

  it('totals a day and lists the last days with gaps as zero', () => {
    const log = [entry('2026-10-01', 500, 2), entry('2026-10-01', 300, 1), entry('2026-10-02', 800)];
    expect(entriesOn(log, '2026-10-01').map((e) => e.kcal)).toEqual([300, 500]);
    expect(sumTotals(entriesOn(log, '2026-10-01'))).toEqual({ kcal: 800, proteinG: 20, carbsG: 40, fatG: 10 });
    expect(dailyCalories(log, '2026-10-03', 4)).toEqual([
      { day: '2026-09-30', kcal: 0 },
      { day: '2026-10-01', kcal: 800 },
      { day: '2026-10-02', kcal: 800 },
      { day: '2026-10-03', kcal: 0 },
    ]);
  });

  it('scales portions and normalises stored entries', () => {
    expect(scaleTotals({ kcal: 401, proteinG: 21, carbsG: 30, fatG: 9 }, 1.5)).toEqual({ kcal: 602, proteinG: 32, carbsG: 45, fatG: 14 });
    expect(normaliseFood({ id: 'a', day: '2026-10-02', kcal: -5, meal: 'brunch' as never })).toMatchObject({ kcal: 0, meal: 'snack', name: 'Food', source: 'manual' });
    expect(normaliseFood({ day: '2026-10-02' })).toBeNull();
  });
});

describe('food AI', () => {
  it('builds a vision request with a strict JSON schema', () => {
    const body = buildFoodRequest('data:image/jpeg;base64,AAA', 'gpt-test', ' large portion ');
    expect(body.model).toBe('gpt-test');
    expect(body.response_format.json_schema.strict).toBe(true);
    const user = body.messages[1].content as { type: string; text?: string; image_url?: { url: string } }[];
    expect(user[0].text).toContain('"large portion"');
    expect(user[1].image_url?.url).toBe('data:image/jpeg;base64,AAA');
  });

  it('sums item estimates into the meal total', () => {
    const a = parseFoodResponse(
      completion({
        is_food: true,
        name: 'Pasta and salad',
        confidence: 'medium',
        notes: 'Assumes olive oil dressing.',
        items: [
          { name: 'Spaghetti bolognese', portion: '350 g', kcal: 520.4, protein_g: 28, carbs_g: 62, fat_g: 16 },
          { name: 'Side salad', portion: '1 bowl', kcal: 90, protein_g: 2, carbs_g: 6, fat_g: 7 },
          { name: 'Water', portion: '1 glass', kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 },
        ],
      }),
    );
    expect(a.kcal).toBe(610);
    expect(a.proteinG).toBe(30);
    expect(a.items).toHaveLength(2);
    expect(a.name).toBe('Pasta and salad');
  });

  it('explains photos without food, refusals and garbage', () => {
    expect(() => parseFoodResponse(completion({ is_food: false, name: '', items: [], confidence: 'low', notes: '' }))).toThrow(/No food/);
    expect(() => parseFoodResponse({ choices: [{ message: { content: null, refusal: 'Not allowed' } }] })).toThrow(/declined/);
    expect(() => parseFoodResponse(completion('nope'))).toThrow(FoodAiError);
  });

  it('maps HTTP errors to advice', () => {
    expect(describeHttpError(401, {}, false)).toMatch(/API key/);
    expect(describeHttpError(429, { error: { code: 'insufficient_quota' } }, false)).toMatch(/credit/);
    expect(describeHttpError(429, {}, false)).toMatch(/Too many/);
    expect(describeHttpError(503, {}, true)).toMatch(/trouble/);
  });

  it('sends the key only to OpenAI, never to a proxy', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return { ok: true, json: async () => completion({ is_food: true, name: 'Apple', items: [{ name: 'Apple', portion: '1', kcal: 95, protein_g: 0, carbs_g: 25, fat_g: 0 }], confidence: 'high', notes: '' }) };
    }) as unknown as typeof fetch;
    await analyseFoodPhoto('AAA', { apiKey: 'sk-test', proxyUrl: null, model: 'm' });
    await analyseFoodPhoto('AAA', { apiKey: 'sk-test', proxyUrl: 'https://proxy.example/estimate', model: 'm' });
    expect(calls[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0].headers.Authorization).toBe('Bearer sk-test');
    expect(calls[1].url).toBe('https://proxy.example/estimate');
    expect(calls[1].headers.Authorization).toBeUndefined();
    await expect(analyseFoodPhoto('AAA', { apiKey: null, proxyUrl: null, model: 'm' })).rejects.toThrow(/API key/);
  });
});

describe('food AI on a ChatGPT plan', () => {
  const apple = { is_food: true, name: 'Apple', items: [{ name: 'Apple', portion: '1', kcal: 95, protein_g: 0, carbs_g: 25, fat_g: 0 }], confidence: 'high', notes: '' };
  const sse = (...events: object[]) => events.map((e) => `event: ${(e as { type: string }).type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  const completed = (content: object) => ({
    type: 'response.completed',
    response: { output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(content) }] }] },
  });

  it('builds a Responses request the plan route accepts', () => {
    const body = buildPlanFoodRequest('data:image/jpeg;base64,AAA', 'gpt-plan', 'half eaten') as Record<string, unknown>;
    expect(body).toMatchObject({ model: 'gpt-plan', store: false, stream: true });
    expect(body.instructions).toMatch(/nutritionist/);
    expect(body.text).toMatchObject({ format: { type: 'json_schema', name: 'meal_estimate', strict: true } });
    expect(body.input).toEqual([
      {
        role: 'user',
        content: [
          { type: 'input_text', text: 'Estimate this meal. The person adds: "half eaten"' },
          { type: 'input_image', image_url: 'data:image/jpeg;base64,AAA', detail: 'auto' },
        ],
      },
    ]);
    for (const unsupported of ['temperature', 'max_output_tokens', 'max_tokens', 'previous_response_id', 'user', 'metadata']) expect(body).not.toHaveProperty(unsupported);
  });

  it('counts a stream as done only at response.completed', () => {
    expect(parsePlanFoodStream(sse({ type: 'response.created' }, { type: 'response.output_text.delta', delta: '{"is' }, completed(apple))).kcal).toBe(95);
    expect(() => parsePlanFoodStream(sse({ type: 'response.output_text.delta', delta: JSON.stringify(apple) }))).toThrow(/dropped/);
    expect(() => parsePlanFoodStream(sse({ type: 'response.incomplete', response: {} }))).toThrow(FoodAiError);
  });

  it('points a usage limit at ChatGPT settings, even mid-stream', () => {
    const failed = { type: 'response.failed', response: { error: { code: 'subscription_sharing_usage_limit_exceeded' } } };
    expect(() => parsePlanFoodStream(sse({ type: 'response.output_text.delta', delta: '{' }, failed))).toThrow(/Usage limit/);
    expect(planError('subscription_sharing_usage_limit_exceeded', 429).action).toBe('manage-usage');
    expect(planError('subscription_sharing_invalid_user', 401).action).toBe('sign-in');
    expect(planError(null, 503).message).toMatch(/unavailable/);
    expect(planError(null, 403, 'Region not permitted').action).toBeUndefined();
  });

  it('sends only the sign-in token, to the Responses API, and never falls back to the key', async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    let status = 200;
    globalThis.fetch = jest.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, headers: init.headers as Record<string, string> });
      return { ok: status === 200, status, text: async () => (status === 200 ? sse(completed(apple)) : JSON.stringify({ detail: 'nope' })) };
    }) as unknown as typeof fetch;
    const config = { apiKey: 'sk-test', proxyUrl: 'https://proxy.example/estimate', model: 'm', chatgpt: { accessToken: 'oauth-token', model: 'gpt-plan' } };
    expect((await analyseFoodPhoto('AAA', config)).name).toBe('Apple');
    expect(calls[0].url).toBe('https://api.openai.com/v1/responses');
    expect(calls[0].headers.Authorization).toBe('Bearer oauth-token');
    status = 503;
    await expect(analyseFoodPhoto('AAA', config)).rejects.toThrow(/unavailable/);
    expect(calls).toHaveLength(2);
  });
});
