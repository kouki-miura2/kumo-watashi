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
- Data access follows the Repository pattern: request handlers depend only on repository interfaces, never directly on a datastore client (D1, KV, a Node DB driver, external API, etc.). Interfaces live under `src/repositories/*.interface.ts`; concrete DAO implementations live alongside them (e.g. `*.d1.ts`, `*.node-pg.ts`, `*.mock.ts`) and are wired up once per entrypoint, so the Workers and Node builds can use different DAOs behind the same interface. Each project adds its own DAOs behind these interfaces without touching handler code.
- `src/app.ts` exports the Hono app instance's type (`AppType`) for Hono RPC. This is the API contract — no hand-written request/response types.

## apps/frontend

- Vue 3 (Composition API, `<script setup>`).
- Vuetify 4 for UI components and theming.
- vue-router for routing (`src/router`).
- Pinia for state management, one store per domain (`src/stores`).
- API access goes through a Hono RPC client (`hc<AppType>()`), built from a type-only import of `apps/backend`'s `AppType`. This gives full request/response type inference without a shared types package or manually written DTOs.

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
