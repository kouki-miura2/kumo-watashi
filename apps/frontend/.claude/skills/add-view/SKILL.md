---
name: add-view
description: Add a new screen/view to apps/frontend - creating the view component, wiring it into the router, and adding server/UI state the Vue+Vuetify+vue-router way. Use when adding, wiring, or scaffolding a new frontend page/screen/route.
---

# Add a frontend view

`apps/frontend` is Vue 3 (`<script setup>`) + Vuetify 4 + vue-router, with server state through
TanStack Query and app-wide UI state through Pinia (see `apps/frontend/AGENTS.md`). A screen is
never just a `.vue` file — it's the view plus whatever composable/store it needs plus a route
table entry.

Worked references:

- `src/router/routes.ts` / `src/router/routes.test.ts` — the route table and its test.
- `src/views/UploaderView.vue` — a view driven by local component state plus the `notification`
  Pinia store directly (see `src/stores/notification.ts`); no view calls the API yet, so there's
  no TanStack Query composable to reference — follow step 2 below when the first one is needed.

`src/views/HomeView.vue` and `src/views/UploaderView.vue` are the app's real screens (not
scaffolding references) — see `docs/spec.md` section 2.4 for what the top page needs to show.

## Procedure

### 1. Decide what state the view needs

- **Server data** (API responses): a composable in `src/composables/` wrapping `useQuery`/
  `useMutation` — never call the API client inline in the component. See step 2.
- **Global UI state** shared app-wide (auth, theme, notifications, ...): a Pinia store in
  `src/stores/`, setup-function style. Only add a new store if an existing one
  (`src/stores/notification.ts`) doesn't already cover it — don't create a store for state that's
  local to this view.
- **Local/component state** (form inputs, modal open/closed): plain `ref()`/`reactive()` inside
  the view or a composable — doesn't need a store.

A view can need none, either, or both of the first two.

### 2. Add a query composable (only if the view needs server data)

- `src/composables/use<Name>Query.ts` — wraps `useQuery` (or `useMutation`), calling the Hono RPC
  `apiClient` from `src/api/client.ts`. Accept an optional `queryClient` param, passed through to
  `useQuery` as the second argument, purely so tests can run it outside a mounted app.
- `src/composables/use<Name>Query.test.ts` — co-located test: `vi.mock('../api/client.ts', ...)`,
  run the composable inside `effectScope().run(...)` with an explicit throwaway `QueryClient`
  (`retry: false`), and await state with `vi.waitFor(...)`.

### 3. Create the view

- `src/views/<Name>View.vue` — `<script setup lang="ts">`, Vuetify components for layout
  (`v-container`, `v-card`, ...). Pull data from the composable/store from steps 1–2; don't fetch
  or hold server data in the component itself.
- Don't destructure `props` or a `reactive()` object directly (breaks reactivity) — use
  `toRefs()`/`toValue()`.

### 4. Register the route

- Add `{ path: '/<path>', name: '<name>', component: () => import('../views/<Name>View.vue') }`
  to `src/router/routes.ts`. Keep the component import lazy (arrow function), matching the
  existing entries.
- Extend `src/router/routes.test.ts` with a case resolving the new path to the new route name
  (see the existing `resolves the uploader route` test). Use `router.resolve(...)`, not
  `router.push(...)` — `push` actually loads the lazy component, which drags in Vuetify's CSS and
  breaks under Node's module loader.

### 5. Link it from navigation (if the view should be reachable from the UI)

- `App.vue`'s app bar carries only the app title/icon now — no nav links. Navigation instead goes
  through the flow itself: `HomeView.vue`'s cards (`to="/uploader"`, `to="/downloader"`) are the
  entry points. Link a new view the same way, from whichever screen leads into it, rather than
  adding it to the app bar.

### 6. Validate

```bash
vp check   # format, lint, type check
vp test    # or: vp run frontend#test
```

Tests run in Node with no jsdom/happy-dom — don't mount the new view component to test it; the
composable, store, and router entry are tested directly instead (steps 2 and 4), and that's the
DOM-free ceiling for what this view can be unit-tested with. To see the screen itself, run
`vp run frontend#dev` and open it in a browser.

## Notes

- Every file has its test right next to it (`foo.ts` + `foo.test.ts` / `routes.ts` +
  `routes.test.ts`) — never a separate `test/` or `__tests__/` tree.
- API request/response types come from `apps/backend`'s `AppType` via Hono RPC — never hand-write
  a DTO for the response a composable consumes.
