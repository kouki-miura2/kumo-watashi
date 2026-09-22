# KUMO-WATASHI

A web app for transferring files temporarily between smartphones and PCs. Files aren't stored
permanently — a Transfer Session holds them in the cloud for a short window (3 minutes by
default). Files move one-way, from an Uploader (sender) to a Downloader (receiver), via a QR code
or a one-time code. See [docs/spec.md](docs/spec.md) for the full spec.

A Vite+ monorepo made up of `apps/backend`, `apps/frontend`, and `packages/utils`. `apps/backend`
is a Hono API (deployable to Cloudflare Workers, or standalone as a Node.js server); `apps/frontend`
is a Vue 3 + Vuetify 4 client that talks to it over Hono RPC (typed requests/responses, no manual
shared-types package needed). `packages/utils` holds runtime-agnostic code shared by both.

## Development

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

Deployable to Cloudflare Workers or as a standalone Node.js server. Pick the runtime section(s) a given project needs.

Script naming: no suffix = common (runtime-agnostic) or Cloudflare Workers, `:node` suffix = Node.js.

### Common

- Run format/lint/type checks:

```bash
vp run backend#check
```

- Run the tests:

```bash
vp run backend#test
```

### Cloudflare Workers

- Debug locally:

```bash
vp run backend#dev
```

- Build (dry-run bundle):

```bash
vp run backend#build
```

- Regenerate Workers binding types (after changing `wrangler.jsonc`'s bindings):

```bash
vp run backend#cf-typegen
```

#### First-time deploy setup

Transfer Sessions/files use D1 (metadata) + R2 (file bodies) for durability across Workers
isolates — see `dao/transfer.d1.ts` / `repository/file-blob-store.r2.ts`. `wrangler.jsonc` is
gitignored (this repo is public, and its D1 `database_id`/R2 `bucket_name` are this project's own
account-specific identifiers — see `.claude/skills/check-secrets`); copy the committed template
and fill in real values as you create each resource:

```bash
cd apps/backend
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
```

Also set `wrangler.jsonc`'s `GOOGLE_CLIENT_ID` to your own OAuth client (Google Cloud Console →
APIs & Services → Credentials → OAuth client ID → Web application) — the template's value is a
placeholder, not a real default, since this project is OSS and shouldn't point every deployer at
the original author's client. No other setup is needed unless the D1 database or R2 bucket are
ever recreated, in which case update your local `wrangler.jsonc` and re-run the migration.

#### Deploy

```bash
vp run backend#deploy
```

Prints the deployed URL (e.g. `https://kumo-watashi-api.<your-subdomain>.workers.dev`) — this is
`VITE_API_BASE_URL` for the frontend build below.

### Node.js

- Debug locally (hot reload):

```bash
vp run backend#dev:node
```

- Build:

```bash
vp run backend#build:node
```

- Run the built bundle:

```bash
vp run backend#start:node
```

## apps/frontend

- Run format/lint/type checks:

```bash
vp run frontend#check
```

- Run the tests:

```bash
vp run frontend#test
```

- Run the dev server:

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

### Deploy (Cloudflare Workers static assets)

Served as its own Worker (`apps/frontend/wrangler.jsonc`, `assets.directory: ./dist`) — a
separate deployment from `apps/backend`, with no D1/R2/secret bindings of its own. `assets`'s
`not_found_handling: single-page-application` makes direct loads of routes like `/downloader`
fall back to `index.html` (Vue Router uses `createWebHistory()`), so there's no separate SPA
redirect file to maintain.

Build with `VITE_API_BASE_URL` pointing at the deployed backend from the step above and your own
`VITE_GOOGLE_CLIENT_ID` (see `.env.example` — there's no default, so Google Sign-In won't work
without it), then deploy:

```bash
cd apps/frontend
VITE_API_BASE_URL=https://kumo-watashi-api.<your-subdomain>.workers.dev \
VITE_GOOGLE_CLIENT_ID=<your-oauth-client-id>.apps.googleusercontent.com \
pnpm build
pnpm deploy
```

Prints the deployed URL (e.g. `https://kumo-watashi.<your-subdomain>.workers.dev`). Add that URL
to the OAuth client's authorized JavaScript origins in
[Google Cloud Console](https://console.cloud.google.com/apis/credentials).
