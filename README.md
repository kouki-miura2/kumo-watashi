# Vite+ Monorepo Starter

A starter for creating a Vite+ monorepo.

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

- Debug locally on the Cloudflare Workers runtime:

```bash
vp run backend#dev
```

- Debug locally on the Node.js runtime:

```bash
vp run backend#dev:node
```

- Run format/lint/type checks:

```bash
vp run backend#check
```

- Run the tests:

```bash
vp run backend#test
```

- Build (Workers dry-run bundle + Node bundle):

```bash
vp run backend#build
```

## apps/frontend

- Run the dev server:

```bash
vp run frontend#dev
```

- Run format/lint/type checks:

```bash
vp run frontend#check
```

- Build:

```bash
vp run frontend#build
```

- Preview the production build:

```bash
vp run frontend#preview
```
