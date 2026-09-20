# utils

Shared runtime utilities used by `apps/backend` and `apps/frontend`.

- `date` — date formatting (`formatDate`) and calculation (`addDays`, `addMonths`, `addYears`, `startOfDay`, `endOfDay`, `isSameDay`, `diffInDays`) helpers, built on the native `Date` API only.
- `logger` — `createLogger()`, a thin wrapper over `console.*` with level filtering and an optional prefix.

## Development

- Run the unit tests:

```bash
vp test
```

- Build the package:

```bash
vp pack
```
