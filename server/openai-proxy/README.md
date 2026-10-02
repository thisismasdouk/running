# Pacebook calorie server (optional)

The Food tab's photo estimates call OpenAI. There are two ways to connect:

1. **Your own key, in the app** (fine for personal use): Food → ⚙︎ → *My OpenAI key*. The key is stored in the iOS Keychain / Android Keystore on that phone only.
2. **This proxy** (for an App Store release, so users don't need a key): a tiny Cloudflare Worker that holds the key as a secret and forwards only meal-photo requests.

Never put an OpenAI key in the app's source, `app.json` or an `EXPO_PUBLIC_` variable: anything bundled in the app can be extracted from it.

## Deploy

```bash
cd server/openai-proxy
npx wrangler login
npx wrangler secret put OPENAI_API_KEY     # paste the key at the prompt, not on the command line
npx wrangler deploy
```

Wrangler prints the URL, e.g. `https://pacebook-ai.<you>.workers.dev`. In the app: Food → ⚙︎ → *Calorie server* → paste the URL → *Save server*.

## Protecting it

- The worker only forwards requests shaped like the app's (one photo, a JSON schema response, an allowed model) and caps the response length.
- Rate limiting per IP is configured in `wrangler.toml`.
- Set a **monthly budget** on the OpenAI project the key belongs to.
- Anything shipped inside an app (a URL, a token) can be extracted, so the rate limit and budget are the real protection. For more, put user accounts or Apple App Attest in front of the worker.
- `ALLOWED_MODELS` (optional, comma-separated) changes which models may be used; the default is `gpt-4o-mini`.

## Privacy

If you run this server for other people, the App Store privacy label changes: meal photos are sent to a server you operate and on to OpenAI. Answer *Data Used to Track You: No*, and under *Data Linked to You / Not Linked* declare **Photos** (App Functionality, not linked to identity) and update `docs/PRIVACY.md`.
