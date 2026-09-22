---
name: add-api-endpoint
description: Add a new API endpoint to apps/backend, following the app.ts -> service -> repository -> dao layering with co-located tests at every layer. Use when adding, wiring, or scaffolding a new backend route/endpoint, or when asked how a backend endpoint should be structured.
---

# Add a backend API endpoint

`apps/backend` request handling is strictly layered (see `apps/backend/AGENTS.md`):

```
route (src/app.ts) -> service (src/service/*.service.ts)
                    -> repository (src/repository/*.repository.ts)
                    -> dao (src/dao/*.interface.ts + *.memory.ts / *.d1.ts / *.node-pg.ts / ...)
```

- A **route** depends only on a service. No business logic or datastore access in `app.ts`.
- A **service** holds business logic, orchestrates one or more repositories, and is the only
  layer that decides outcomes like "not found" / validation. It knows nothing about HTTP.
- A **repository** maps a DAO's raw storage shape to a domain entity. No datastore access here
  either — that's the DAO's job.
- A **dao** is the only layer that talks to a datastore, behind an interface, so different
  runtimes (Workers vs Node) can swap in different concrete DAOs without touching
  service/repository/route code.

No route exists in this project yet, so there's no worked example to copy — follow the shape
below for the first one.

## Procedure

Build bottom-up — each layer's test needs the layer below it to already have an interface.
Replace `<name>` below with the resource name (e.g. `widget`).

### 1. DAO layer

- `src/dao/<name>.interface.ts` — the raw storage type (`<Name>Record`) and the `<Name>Dao`
  interface (the methods this endpoint needs, e.g. `findById`).
- `src/dao/<name>.memory.ts` — a concrete in-memory implementation (`create<Name>Dao`). Add a
  real implementation (`.d1.ts`, `.node-pg.ts`, ...) alongside it when/if a real datastore is
  needed.
- `src/dao/<name>.memory.test.ts` — co-located test for the concrete DAO.

### 2. Repository layer

- `src/repository/<name>.repository.ts` — the domain entity type (`<Name>`), the
  `<Name>Repository` interface, and `create<Name>Repository(dao)` mapping the DAO's raw record to
  the domain entity.
- `src/repository/<name>.repository.test.ts` — co-located test, using a hand-written fake
  `<Name>Dao` (not the real `.memory` implementation) so the test only exercises the repository's
  mapping logic.

### 3. Service layer

- `src/service/<name>.service.ts` — the response/view type the route will return (`<Name>View`),
  the `<Name>Service` interface, and `create<Name>Service(repository)` implementing the business
  logic and orchestration. Express "not found" / "invalid" as `null` or a thrown error — never an
  HTTP status here.
- `src/service/<name>.service.test.ts` — co-located test, using a hand-written fake
  `<Name>Repository`.

### 4. Route layer (`src/app.ts`)

- Add the new dependency to `AppDependencies` (e.g. `<name>Service: <Name>Service`).
- Add the route inside `createApp(...)`, calling only the service and translating its result to
  an HTTP response (status code, JSON body). No business logic in the route itself.
- Extend `src/app.test.ts` (already co-located with `app.ts`) with cases for the new route, using
  a hand-written fake `<Name>Service` — covering the success path, the "not found"/error path, and
  auth guard interaction if the route isn't excluded from it. `app.test.ts` currently mounts a
  throwaway `/test-route` purely to exercise the shared middleware (no real route exists yet) —
  once your route lands, test the middleware behavior through it instead and drop the throwaway
  one.

### 5. Wire real dependencies

- Update `src/worker.ts` and/or `src/server.ts` (whichever runtime(s) this project deploys) to
  construct the real dao -> repository -> service chain and pass it into `createApp`.

### 6. Validate

```bash
vp check   # format, lint, type check
vp test    # or: vp run backend#test
```

## Notes

- Every file has its test right next to it (`foo.ts` + `foo.test.ts`) — never a separate `test/`
  or `__tests__/` tree.
- Each layer's test fakes only the interface directly below it, not the real implementation, so
  layers stay independently testable. The DAO's own test is the only one that touches the real
  (in this case in-memory) implementation.
