# Pacebook calorie server

Lets Pacebook users estimate meal photos **without their own OpenAI key**:

- People sign in with Apple in the app (Food → ⚙︎). The server checks Apple's signed token and gives the app a session.
- Each person gets a daily allowance of photo estimates (`DAILY_LIMIT`, 30 by default), and there's a ceiling for everyone together (`GLOBAL_DAILY_LIMIT`). Both reset at midnight UTC.
- Your OpenAI key stays on the server. The server only forwards meal-photo requests: one JPEG, the app's prompt, a JSON answer, an allowed model and a capped answer length.
- Photos are not stored. The database holds an Apple user ID (a random string, not the person's email), when the account was created, and daily counts.
- A failed OpenAI call doesn't use up an estimate, and the app can delete the account (App Store guideline 5.1.1(v)).

It's one small Node.js process with SQLite, run with Docker next to [Caddy](https://caddyserver.com), which gets the HTTPS certificate automatically.

## Run it on Hetzner

Any small Hetzner Cloud server is plenty, for example the smallest shared-vCPU type, which costs a few euros a month. If you already have a Hetzner server running Docker, put it there at no extra cost. Your OpenAI bill depends on use: each photo with `gpt-4o-mini` costs well under a cent.

1. **A server.** In the Hetzner Cloud console, create a server with Ubuntu, add your SSH key, and note its IPv4 address.
2. **A domain name.** At your DNS provider, add an **A record** such as `ai.yourdomain.com` pointing at that IP. Caddy needs it to get the HTTPS certificate.
3. **Firewall.** Allow ports 22, 80 and 443 (Hetzner Cloud → Firewalls, or `ufw allow 80,443/tcp`).
4. **Install Docker** on the server:
   ```bash
   ssh root@YOUR_SERVER_IP
   curl -fsSL https://get.docker.com | sh
   ```
5. **Copy this folder** to the server, from your PC in the project folder:
   ```bash
   scp -r server/calorie-server root@YOUR_SERVER_IP:/opt/pacebook-ai
   ```
   Or `git clone` the repository on the server and `cd server/calorie-server`.
6. **Configure it** on the server:
   ```bash
   cd /opt/pacebook-ai
   cp .env.example .env
   openssl rand -hex 32        # copy the output into SESSION_SECRET
   nano .env                   # set DOMAIN, OPENAI_API_KEY, SESSION_SECRET
   ```
   Type the OpenAI key into `.env` on the server only. Never put it in the app, in git or in a chat.
7. **Start it:**
   ```bash
   docker compose up -d --build
   curl https://ai.yourdomain.com/healthz      # → {"ok":true}
   ```
8. **Point the app at it:** put `https://ai.yourdomain.com` in `app.json` → `expo.extra.calorieServer.url` and make a new build. Or, for testing, paste the address in Food → ⚙︎ → *Pacebook AI server*.

**Updating:** copy the folder again (or `git pull`), then `docker compose up -d --build`. The database is in the `data` Docker volume, so it survives updates.

**Logs:** `docker compose logs -f app`.

**Already running a web server on ports 80/443** (nginx, Traefik, another Caddy)? Remove the `caddy` service from `docker-compose.yml`, publish the app with `ports: ["127.0.0.1:8080:8080"]`, and proxy your domain to `127.0.0.1:8080`. Allow request bodies of at least 4 MB.

## Settings (`.env`)

| Variable | Default | |
| --- | --- | --- |
| `DOMAIN` | | The HTTPS address, used by Caddy |
| `OPENAI_API_KEY` | | Required |
| `SESSION_SECRET` | | Required, 32+ characters (`openssl rand -hex 32`). Changing it signs everyone out |
| `APPLE_BUNDLE_ID` | `com.thisismasdouk.pacebook` | Only Apple sign-ins for this app are accepted |
| `DAILY_LIMIT` | `30` | Estimates per person per UTC day |
| `GLOBAL_DAILY_LIMIT` | `3000` | Estimates for everyone per UTC day, a cap on your OpenAI bill |
| `ALLOWED_MODELS` | `gpt-4o-mini` | Comma-separated |
| `SESSION_DAYS` | `90` | How long a sign-in lasts |

Also set a **monthly budget** on the OpenAI project the key belongs to (platform.openai.com → Settings → Limits).

## API

| | |
| --- | --- |
| `POST /v1/session` | `{ identityToken, nonce }` from Sign in with Apple. Returns `{ token, expiresAt, dailyLimit, usedToday, resetsAt }` |
| `GET /v1/usage` | `{ dailyLimit, usedToday, resetsAt }` |
| `POST /v1/estimate` | The app's Chat Completions request. Returns OpenAI's answer. `429 daily_limit` when today's allowance is used |
| `DELETE /v1/account` | Deletes the user and their counts |
| `GET /healthz` | `{ ok: true }` |

All but `/v1/session` and `/healthz` need `Authorization: Bearer <token>`.

## Develop

```bash
npm install
npm test
OPENAI_API_KEY=sk-... SESSION_SECRET=$(openssl rand -hex 32) npm start
```

Needs Node.js 22.13 or later, for the built-in `node:sqlite`.
