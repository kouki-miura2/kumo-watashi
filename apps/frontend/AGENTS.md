# apps/frontend

- Vue 3 (Composition API, `<script setup>`).
- Vuetify 4 for UI components and theming.
- vue-router for routing (`src/router`).
- Pinia for state management, one store per domain (`src/stores`).
- API access goes through a Hono RPC client (`hc<AppType>()`), built from a type-only import of `apps/backend`'s `AppType`. This gives full request/response type inference without a shared types package or manually written DTOs.
- TypeScript is pinned to `^6.x` here, independent of the workspace catalog's `^7.x`: `vue-tsc`/Vue Language Tools can't type-check `.vue` SFCs against TypeScript 7's native compiler yet (no public Program API). Re-sync to the catalog once vue-tsc supports it.
