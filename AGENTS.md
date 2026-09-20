# AGENTS.md

## Project Structure

Monorepo managed with pnpm workspaces (`apps/*`, `packages/*`).

- `apps/backend` — API server (Hono, deployable to Cloudflare Workers or as a standalone Node.js server)
- `apps/frontend` — Web client (Vue 3 + Vuetify 4)
- `packages/utils` — Shared runtime utilities (date/time helpers, logger)

## Conventions

- Co-location: `foo/bar.ts` + `foo/bar.test.ts`.
- Arrow functions everywhere (`const foo = (...) => {}`), no `function` declarations — one style repo-wide, including `packages/utils`, so there's no per-case judgment call.
- Favor less code: reach for a framework's built-in feature over a hand-rolled one, avoid speculative abstractions and shared packages "just in case", and don't introduce a layer until it earns its keep.
- API request/response types are not hand-shared: `apps/frontend` gets them from `apps/backend` via Hono RPC (see below), not from a separate types package.
- Runtime-agnostic shared code goes in `packages/utils`, not duplicated per app.

## apps/backend

- Hono, kept runtime-agnostic so the same app runs on Cloudflare Workers or a plain Node.js server — this lets on-premise / self-hosted projects start from the same codebase. Routes/middleware live in `src/app.ts` with no runtime-specific APIs; `src/worker.ts` is the Cloudflare Workers entrypoint (`wrangler dev` / `wrangler deploy`) and `src/server.ts` is the Node.js entrypoint (`@hono/node-server`, run with `node`). Pick and deploy only the entrypoint(s) a given project needs.
- Secrets: on Cloudflare Workers use `wrangler secret put`, never `.env` / commit `.dev.vars`. On Node.js use standard environment variables (`.env`, untracked) instead.
- Request handling is layered: route (`src/app.ts`) → service (`src/service/*.service.ts`) → repository (`src/repository/*.repository.ts`) → DAO (`src/dao/*.interface.ts` + concrete `*.memory.ts` / `*.d1.ts` / `*.node-pg.ts` / ...). A route depends only on a service; a service holds business logic and orchestrates one or more repositories, and is the only layer that decides "not found" / validation outcomes; a repository maps a DAO's raw storage shape to a domain entity; only the DAO layer talks to a datastore, and it does so behind an interface so the Workers and Node builds can swap in different DAOs without touching service/repository/route code. `src/{service,repository,dao}/sample.*`, wired to `GET /sample/:id` in `src/app.ts`, is a worked reference for this chain — build real routes the same way, then delete the sample files and route once they're no longer needed as a reference.
- `src/app.ts` exports the Hono app instance's type (`AppType`) for Hono RPC. This is the API contract — no hand-written request/response types.
- Audit logging: every request is logged at the default `"info"` level as a start/end pair of JSON lines (`{ timestamp, level, message: "request started" | "request completed", requestId, method, path, user, status, durationMs }` — `status`/`durationMs` only on the "completed" line, `user` being the authenticated user id or `"anonymous"`), joined by a per-request `requestId` (`c.set('requestId', ...)`, an 8-hex-char id from 4 random bytes — short enough to scan by eye, not a full UUID) since concurrent requests to the same method+path would otherwise be indistinguishable in the log stream. This middleware wraps the auth guard, so a rejected (401) request is logged too, not just successful ones, and it's on by default, not opt-in, so it can't be silently disabled by lowering the log level.
- Auth guard: off by default (free access). A project turns it on via `AppDependencies.auth.enabled`, at which point it applies to every route except the exact paths listed in `AppDependencies.auth.excludePaths`. The check itself follows the same interface-plus-swappable-implementation shape as the DAO layer, but lives outside the service/repository/DAO chain since it's a cross-cutting concern, not a data access one (`src/repository/auth-guard.interface.ts`); the bundled `auth-guard.header.ts` is a placeholder (treats a non-empty `Authorization` header as the user id) — projects add a real `AuthGuard` (JWT, API key, Cloudflare Access, ...) alongside it before turning the guard on.

## apps/frontend

- Vue 3 (Composition API, `<script setup>`).
- Vuetify 4 for UI components and theming.
- vue-router for routing (`src/router`).
- Pinia for state management, one store per domain (`src/stores`).
- API access goes through a Hono RPC client (`hc<AppType>()`), built from a type-only import of `apps/backend`'s `AppType`. This gives full request/response type inference without a shared types package or manually written DTOs.
- TypeScript is pinned to `^6.x` here, independent of the workspace catalog's `^7.x`: `vue-tsc`/Vue Language Tools can't type-check `.vue` SFCs against TypeScript 7's native compiler yet (no public Program API). Re-sync to the catalog once vue-tsc supports it.

## packages/utils

- Date/time helpers: shared date manipulation/formatting/parsing functions.
- Logger: a thin wrapper over `console.*` (log levels, prefixing, env-aware). Application code calls the logger, never `console.log` directly.

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
