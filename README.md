# KUMO-WATASHI

A web app for transferring files temporarily between smartphones and PCs. Files aren't stored
permanently — a Transfer Session holds them in the cloud for a short window (1 minute by
default). Files move one-way, from an Uploader (sender) to a Downloader (receiver), via a QR code
or a one-time code. See [docs/spec.md](docs/spec.md) for the full spec.

A Vite+ monorepo made up of `apps/backend`, `apps/backend-worker`, `apps/frontend`, and
`packages/utils`. `apps/backend` is a runtime-agnostic Hono API, run on Cloudflare Workers by
`apps/backend-worker`; `apps/frontend` is a Vue 3 + Vuetify 4 client that talks to it over Hono
RPC (typed requests/responses, no manual shared-types package needed). `packages/utils` holds
runtime-agnostic code shared by both.

## Development

The frontend is served at `/` and the API at `/api` on the same origin, in development and in
production. Run both dev servers and open the frontend's URL; it proxies `/api` to the backend
(`localhost:8787`):

```bash
vp run dev-b   # backend
vp run dev-f   # frontend
```

In production, one Worker (`apps/backend-worker`) serves both: the API at `/api` and the frontend
build as static assets at `/`. It lists `frontend` as a workspace dependency, so `vp run -r build`
(or `vp run -t backend-worker#build`) builds the frontend once, before it; `deploy` builds the
frontend itself.

- Check everything is ready:

```bash
vp run ready
```

- Run all tests:

```bash
vp run -r test
```

- Build everything:

```bash
vp run -r build
```

## packages/utils

- Run format/lint/type checks:

```bash
vp run utils#check
```

- Run the tests:

```bash
vp run utils#test
```

## apps/backend

Runtime-agnostic routes and business logic. Run it through `apps/backend-worker`.

- Run format/lint/type checks:

```bash
vp run backend#check
```

- Run the tests:

```bash
vp run backend#test
```

## apps/backend-worker

Runs `apps/backend` on Cloudflare Workers, and serves the `apps/frontend` build from the same
Worker.

- Run format/lint/type checks:

```bash
vp run backend-worker#check
```

- Run the tests (D1/R2 implementations):

```bash
vp run backend-worker#test
```

- Debug locally (reloads on changes in `apps/backend` too):

```bash
vp run backend-worker#dev
```

`wrangler dev` runs against a local D1 emulation (`.wrangler/state`), separate from the `--remote`
database migrated during first-time setup below. Apply migrations there too before running for the
first time, and again any time a new migration file is added:

```bash
cd apps/backend-worker
npx wrangler d1 migrations apply kumo-watashi --local
```

- Build (frontend + dry-run Worker bundle):

```bash
vp run -t backend-worker#build
```

- Regenerate Workers binding types (after changing `wrangler.jsonc`'s bindings):

```bash
vp run backend-worker#cf-typegen
```

### First-time deploy setup

Transfer Sessions/files use D1 (metadata) + R2 (file bodies) for durability across Workers
isolates — see `src/dao/transfer.d1.ts` / `src/repository/file-blob-store.r2.ts`. `wrangler.jsonc`
is gitignored (this repo is public, and its D1 `database_id`/R2 `bucket_name` are this project's
own account-specific identifiers — see `.claude/skills/check-secrets`); copy the committed
template and fill in real values as you create each resource:

```bash
cd apps/backend-worker
cp wrangler.jsonc.example wrangler.jsonc

npx wrangler login                              # authenticate this machine

npx wrangler d1 create kumo-watashi             # copy the printed database_name/database_id into
                                                 # wrangler.jsonc's d1_databases[0]
npx wrangler d1 migrations apply kumo-watashi --remote

npx wrangler r2 bucket create <your-bucket-name>
# R2 requires a payment method on file even to stay within the free tier (10GB storage / 1M
# Class A + 10M Class B ops per month) — enable it first at
# https://dash.cloudflare.com → your account → R2 Object Storage → Enable R2
#
# then copy the bucket name into wrangler.jsonc's r2_buckets[0].bucket_name

npx wrangler secret put SESSION_SECRET          # paste a random value, e.g. `openssl rand -hex 32`
npx wrangler secret put TURNSTILE_SECRET_KEY    # secret half of your own Turnstile widget, below
```

Also set `wrangler.jsonc`'s `GOOGLE_CLIENT_ID` to your own OAuth client (Google Cloud Console →
APIs & Services → Credentials → OAuth client ID → Web application) — the template's value is a
placeholder, not a real default, since this project is OSS and shouldn't point every deployer at
the original author's client.

Turnstile (docs/spec.md section 9) gates Transfer Session creation with a bot check. Create your
own widget for your own domain(s) — Cloudflare dashboard → Turnstile → Add widget (managed mode),
or `wrangler turnstile widget create` — then set `wrangler.jsonc`'s `TURNSTILE_SITE_KEY` (public)
and `TURNSTILE_HOSTNAMES` (comma-separated, the app's domain(s)) to match, and the secret half via
`wrangler secret put TURNSTILE_SECRET_KEY` above. A widget is pinned to the domain(s) it was
registered for, so reusing the original author's wouldn't work even if you tried.

The frontend build also needs your own `VITE_GOOGLE_CLIENT_ID` and `VITE_TURNSTILE_SITE_KEY` in
`apps/frontend/.env` (see `apps/frontend/.env.example` — neither has a default, so Google Sign-In
/ Transfer creation won't work without them). No API URL is needed: the frontend calls `/api` on
its own origin.

No other setup is needed unless the D1 database or R2 bucket are ever recreated, in which case
update your local `wrangler.jsonc` and re-run the migration.

### Deploy

Builds the frontend, then deploys it and the API as one Worker:

```bash
vp run backend-worker#deploy
```

Prints the deployed URL (e.g. `https://kumo-watashi.<your-subdomain>.workers.dev`). On a new
deployment, add that URL to the OAuth client's authorized JavaScript origins in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials), and its hostname to
`wrangler.jsonc`'s `TURNSTILE_HOSTNAMES`.

## apps/frontend

- Run format/lint/type checks:

```bash
vp run frontend#check
```

- Run the tests:

```bash
vp run frontend#test
```

- Run the dev server (proxies `/api` to `vp run backend-worker#dev`):

```bash
vp run frontend#dev
```

- Build:

```bash
vp run frontend#build
```

- Preview the production build:

```bash
vp run frontend#preview
```
