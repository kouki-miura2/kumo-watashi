/**
 * App-wide limits and tunable values: every cap, size, duration and count the app enforces or
 * depends on, in one place. Single source of truth for the `docs/spec.md` "参照 > リミット値" table —
 * one entry per table row, referenced there as `LIMITS.<name>`. Values may change during
 * development or operation: change them here only, and update the spec table in the same change.
 *
 * Imported by both `apps/frontend` (to validate and show the limit in the UI) and `apps/backend`
 * (to enforce it in the API), so the two can never disagree.
 *
 * Conventions for each entry:
 * - Name it after what it limits, with the unit as a suffix: `...Bytes`, `...Px`, `...Days`,
 *   `...Minutes`, `...MaxLength` (characters, counted with `charLength`), a plain noun for a count.
 * - Write the value in its readable form (`300 * 1024 * 1024`, not `314572800`).
 * - JSDoc: what it limits, the unit, where it's checked (UI / API / both), and "Provisional." if
 *   the spec marks it 暫定値.
 */
export const LIMITS = {
  // Examples — replace with the app's own entries:
  // /** Max length (characters) of a display name. Checked in both the UI and the API. */
  // nameMaxLength: 20,
  // /** Storage quota per user, in bytes (300 MB). Checked in the API on upload. */
  // userStorageBytes: 300 * 1024 * 1024,
  // /** Number of items loaded per page in lists (newest first). Provisional. */
  // listPageSize: 50,
} as const
