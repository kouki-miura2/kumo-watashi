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

- Run the tests:

```bash
vp run backend#test
```

- Build (Workers dry-run bundle + Node bundle):

```bash
vp run backend#build
```
