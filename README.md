# Prompt Forge

A small web app that analyzes something you give it (a photo, a topic, a weak
prompt, a job posting, or messy notes) and generates a ready-to-use prompt.

## How it's structured

- `server.js` — Express backend. Holds your real Anthropic API key and
  exposes one endpoint per mode: `/api/photo`, `/api/research`, `/api/fix`,
  `/api/resume`, `/api/notes`. It builds the system prompt for each mode and
  calls the Claude API.
- `public/index.html` — the frontend. Calls your backend's `/api/*` routes,
  never Anthropic directly, so your key is never exposed to the browser.

## Run it locally

1. Install Node.js 18 or later.
2. Install dependencies:
   ```
   npm install
   ```
3. Copy the example environment file and add your real key:
   ```
   cp .env.example .env
   ```
   Then open `.env` and set `ANTHROPIC_API_KEY` to a key from
   https://console.anthropic.com/settings/keys
4. Start the server:
   ```
   npm start
   ```
5. Open http://localhost:3000 in your browser.

## Deploying it for real

Any host that runs a Node.js server works. Two easy options:

**Render / Railway / Fly.io** (simplest — this app is already shaped for it)
1. Push this folder to a GitHub repo.
2. Create a new "Web Service" (Render) or equivalent, point it at the repo.
3. Set the build command to `npm install` and start command to `npm start`.
4. Add `ANTHROPIC_API_KEY` as an environment variable in the host's dashboard
   — never commit your real `.env` file to git.
5. Deploy. You'll get a live URL like `https://prompt-forge.onrender.com`.

**Vercel** (needs a small tweak)
Vercel runs serverless functions rather than a long-lived Express server. To
deploy there, each route in `server.js` would move into its own file under
an `/api` folder (e.g. `api/research.js`) using Vercel's function format.
Worth doing once you're past the prototype stage and want Vercel's free tier
and instant previews.

## Before you open this up publicly

- **Rate limiting is already on** (`express-rate-limit`), capped at 20
  requests/hour per IP by default. Adjust `RATE_LIMIT_PER_HOUR` in `.env` as
  you learn your real usage and costs.
- **Add a domain + HTTPS** — most hosts above include free HTTPS on their
  default subdomain; add a custom domain once you're ready to launch.
- **Consider gating heavier use behind a free signup** once you have real
  traffic, both to control API costs and to start building a user list.
- **Watch your Anthropic usage dashboard** for the first week after launch
  so a cost spike doesn't surprise you.

## Adding more modes later

Each mode follows the same shape: a backend route that builds a system
prompt and calls `callClaude()`, plus a frontend panel that posts its fields
to that route and renders the result with `renderOutput()`. Follow the
pattern of any existing mode (e.g. `/api/fix` is the simplest one) to add a
new one.
