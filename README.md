# Bloom It

Bloom It is a React + TypeScript MVP for personalized English speaking practice. It is designed for a free-tier deployment using **Cloudflare Pages + Pages Functions + Supabase PostgreSQL**.

## Implemented product flow

- Editorial, responsive landing page with Bloom It visual system.
- `/personalize` six-step intake with validation, back/edit flow, separate consent and free-text context.
- Deterministic, explainable curriculum engine in `src/lib/personalization.ts`.
- Structured catalogue and real sample lessons in `src/data/modules.ts`.
- `/plan` result page with priorities, reasons, workload estimates and preserved learner context.
- `/course` catalogue and functional lessons at `/lesson/:lessonId`.
- Local lesson completion tracking.
- `/privacy`, `/terms`, mobile navigation and not-found state.
- Future `PersonalizationProvider` interface; no LLM or paid AI API required.

## Persistence modes

The frontend supports two modes:

1. **Local mode** — default during local development. Intake, plan and progress use validated browser storage.
2. **Supabase mode** — enabled when `VITE_API_BASE_URL=/api` is set at build time. The frontend calls Cloudflare Pages Functions. Those functions validate the intake, run the deterministic engine server-side, save private records in Supabase and return a bearer access token for the current plan.

The browser never receives `SUPABASE_SERVICE_ROLE_KEY`. Supabase tables have RLS enabled and no direct `anon`/`authenticated` table access. The Pages Functions use the service role only from Cloudflare's server-side environment.

This MVP uses a random plan access token rather than a full learner account. The token is stored in the current browser so a learner can revisit the same plan. It is hashed before storage in Supabase, and plan reads require both the UUID and token. This prevents unauthenticated plan enumeration, but it is not a replacement for Supabase Auth when accounts are introduced.

## Repository structure

```text
src/                       React app, curriculum engine and UI
functions/api/             Cloudflare Pages Functions API
supabase/migrations/       Supabase schema, RLS and secure RPC
.env.example               Variable names only; no secrets
wrangler.toml              Cloudflare Pages configuration
vercel.json/netlify.toml   Alternative static-hosting fallbacks
```

## Local development

Requires Node.js 20+ (Node 24 is supported).

### Local browser-only mode

```bash
npm install
npm run dev -- --host 0.0.0.0
```

Open `http://localhost:5173`. With no `VITE_API_BASE_URL`, the app stays in local mode and does not need Supabase credentials.

### Access from outside WSL

1. Start Vite with `npm run dev -- --host 0.0.0.0`.
2. In Windows, try `http://localhost:5173`; WSL2 commonly forwards this automatically.
3. For another device, find the Windows LAN IP using `ipconfig` and open `http://WINDOWS-LAN-IP:5173`.
4. Allow Node/Vite through Windows Defender Firewall for a private network if prompted.
5. Do not expose a development server publicly; use Cloudflare Pages for public access.

## Checks

```bash
npm test
npm run check
npm run build
```

`npm run check` validates both the React app and the Cloudflare Functions. `npm run build` writes the static frontend to `dist/`.

## Cloudflare Pages + Supabase setup

### 1. GitHub

The intended repository is:

```text
https://github.com/ashar111/Bloomit
```

Push the project after reviewing the diff. Never commit `.env`, Supabase service-role keys or Cloudflare secrets.

### 2. Supabase project

1. Create or open a Supabase project at [supabase.com/dashboard](https://supabase.com/dashboard).
2. Open **SQL Editor**.
3. Run the complete migration:

```text
supabase/migrations/20251009000000_bloom_it_initial.sql
```

This creates:

- `learner_profiles`
- `intake_submissions`
- `learning_plans`
- `lesson_progress`
- `create_learning_submission(...)` secure server-only RPC

The migration enables RLS, revokes direct table access from `anon` and `authenticated`, and grants the RPC only to `service_role`.

4. Copy the project URL from Supabase settings. The service-role key is also in Supabase API settings, but it must be added only as a Cloudflare secret and never pasted into frontend code or Git.

### 3. Cloudflare Pages

1. Open **Workers & Pages** in Cloudflare.
2. Create a Pages project and connect the GitHub repository.
3. Configure:

```text
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

4. Add the following **production environment variables/secrets** in Pages → Settings → Environment variables:

```text
VITE_API_BASE_URL=/api
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=server-only-secret
ALLOWED_ORIGIN=https://YOUR_PROJECT.pages.dev
```

`SUPABASE_SERVICE_ROLE_KEY` must be stored as a secret. Do not prefix it with `VITE_`.

5. Redeploy after saving the variables.
6. After the first deployment, replace `ALLOWED_ORIGIN` with the exact final custom domain if you add one.

Cloudflare Pages automatically deploys the root `functions/` directory as Pages Functions. `wrangler.toml` is included for compatibility and local Pages workflows.

### Optional anti-spam protection

The API always includes a honeypot and best-effort per-isolate rate limit. For stronger public protection, create a Cloudflare Turnstile widget and configure:

```text
TURNSTILE_SECRET_KEY=server-only-secret
```

The current UI does not render a Turnstile widget yet, so leave this variable unset until the widget/site-key UI is added. Do not set only the secret without also sending a verified widget token.

## API contract

The Cloudflare Functions are:

```text
POST /api/create-plan
GET  /api/plan/:planId?token=...
POST /api/plan/:planId/progress
```

`POST /api/create-plan` accepts the validated intake and returns a plan plus a one-time bearer reference for that browser. The database stores only the SHA-256 hash of the token.

There is no public endpoint that lists learners or plans. A plan read requires both a valid UUID and matching bearer token. Progress writes perform the same authorization check.

## Free-tier and production limitations

- Cloudflare and Supabase quotas can change; verify current limits in their dashboards.
- Supabase free projects may pause after inactivity.
- Free Supabase projects do not replace an independent backup and recovery plan.
- The current bearer-token flow is suitable for MVP validation, not a complete account system.
- No email service, support inbox, billing, instructor system or LLM is configured.
- Before accepting real student data at scale, add Supabase Auth, deletion/retention controls, monitoring, backups, abuse controls, a support contact and a jurisdiction-reviewed privacy policy.
- Do not collect sensitive information in the free-text fields.

## Alternative static hosting

Cloudflare + Supabase is the recommended setup. Vercel and Netlify configs remain in the repository for frontend-only previews, but they do not automatically provide the Cloudflare Pages Functions environment described above.

## Before publishing

- Apply the Supabase migration and inspect its RLS policies.
- Set the exact production `ALLOWED_ORIGIN`.
- Configure `VITE_API_BASE_URL=/api` only in the Cloudflare Pages build environment.
- Verify create, reload, plan retrieval and lesson progress in the deployed environment.
- Replace the empty placeholder sitemap with the final absolute domain URLs.
- Add a real operator/support contact and have privacy/terms reviewed for the markets served.
