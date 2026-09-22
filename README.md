# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo, with `apps/backend`, `apps/frontend`, and
`packages/utils`. `apps/backend` is a Hono API (deployable to Cloudflare Workers or as a
standalone Node.js server), `apps/frontend` is a Vue 3 + Vuetify 4 client that talks to it through
Hono RPC (typed request/response, no hand-shared types package), and `packages/utils` holds
runtime-agnostic code shared by both.

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

- Deploy:

```bash
vp run backend#deploy
```

- Regenerate Workers binding types:

```bash
vp run backend#cf-typegen
```

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
