// Pacebook calorie server: a Cloudflare Worker that forwards meal-photo
// requests from the app to OpenAI, so the OpenAI key lives here as a secret
// and never inside the app.
//
// Secrets / variables (wrangler secret put …):
//   OPENAI_API_KEY   required
//   ALLOWED_MODELS   optional comma-separated list, default "gpt-4o-mini"
//
// Also bind a rate limiter (see wrangler.toml) so the endpoint can't be used
// to run up your OpenAI bill.

const MAX_BODY_BYTES = 3_000_000;

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    if (request.method !== 'POST') return json(405, { error: { message: 'POST only' } });
    if (env.RATE_LIMITER) {
      const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) return json(429, { error: { message: 'Too many requests', code: 'rate_limited' } });
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json(413, { error: { message: 'Photo too large' } });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return json(400, { error: { message: 'Invalid JSON' } });
    }

    // Only forward the shape the app sends: one system prompt, one user message
    // with text and an image, and a JSON schema response. Anything else is refused,
    // so the key can't be used as a general-purpose OpenAI endpoint.
    const allowed = (env.ALLOWED_MODELS ?? 'gpt-4o-mini').split(',').map((m) => m.trim());
    const okShape =
      allowed.includes(body?.model) &&
      Array.isArray(body?.messages) &&
      body.messages.length === 2 &&
      body.response_format?.type === 'json_schema' &&
      Array.isArray(body.messages[1]?.content) &&
      body.messages[1].content.some((p) => p?.type === 'image_url');
    if (!okShape) return json(400, { error: { message: 'Unsupported request' } });

    const upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({ ...body, max_tokens: Math.min(Number(body.max_tokens) || 900, 1200) }),
    });
    return new Response(upstream.body, { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  },
};
