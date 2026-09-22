---
name: check-secrets
description: Scan for leaked GitHub/Cloudflare/Google credentials (API keys, tokens, client secrets, service account keys) before a git commit/push or a Cloudflare deploy. Use before committing, before pushing to GitHub, before `wrangler deploy`/`wrangler pages deploy`, or whenever asked to check for leaked secrets/credentials.
---

# Check for leaked secrets

Run this before anything that makes code more visible than it already is: a git commit, a push
to GitHub (especially a public repo), or a Cloudflare deploy (the built frontend bundle is
public the moment it's deployed). Covers GitHub, Cloudflare, and Google specifically, plus
generic credential shapes.

## Procedure

### 1. Decide the scope

- **Before a commit**: scan the staged diff (`git diff --cached`) and any new files being added.
- **Before a push**: scan every commit that hasn't been pushed yet
  (`git log -p origin/<branch>..HEAD`, or `git log -p --all` for a first push / new public repo —
  see docs/spec.md-style projects where nothing has been pushed before).
- **Before a Cloudflare deploy**: scan the built output that's about to go live —
  `apps/frontend/dist/**/*.{js,html}` for a frontend deploy, and `wrangler.jsonc`'s `vars`/
  `d1_databases`/`r2_buckets`/`kv_namespaces` blocks for a backend deploy. Anything in a Vite
  `VITE_*` env var or a `vars` entry is publicly downloadable/readable — never rely on "it's just
  a build artifact" to keep it private.

### 2. Grep for provider-specific credential shapes

```bash
# Google: API keys, OAuth client secrets, service account keys
grep -rniE "AIza[0-9A-Za-z_-]{35}|GOCSPX-[A-Za-z0-9_-]+|\"type\":\s*\"service_account\"" <scope>

# GitHub: personal access tokens, fine-grained PATs, OAuth/App/server-to-server tokens
grep -rniE "ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|gh[ousr]_[A-Za-z0-9]{20,}" <scope>

# Cloudflare: no fixed token prefix, so check by variable name instead
grep -rniE "CLOUDFLARE_API_TOKEN|CF_API_TOKEN|cloudflare.{0,20}(api.?key|global.?key)" <scope>

# Generic: private key blocks, and `xxx_key = "long-value"`-shaped assignments
grep -rniE "\-\-\-\-\-BEGIN (RSA|EC|OPENSSH|PGP|PRIVATE) KEY\-\-\-\-\-" <scope>
grep -rniE "(api|access|secret)[_-]?(key|token)[[:space:]]*[:=][[:space:]]*['\"][A-Za-z0-9_/+.-]{20,}" <scope>
```

Replace `<scope>` with the actual target: a directory (`apps/frontend/dist`), or pipe from
`git diff --cached` / `git log -p ...` instead of grepping files directly.

### 3. Check for secret-shaped files

```bash
git ls-files | grep -iE "\.env(\..*)?$|dev\.vars|credentials?\.|service.?account.*\.json|\.pem$|\.key$|\.p12$"
```

Anything here should not be tracked. `.env`, `.env.*` (except `.env.example`), and `.dev.vars` must
be in `.gitignore` — confirm with `git check-ignore -v <path>` if unsure.

### 4. Check Cloudflare-specific config

`wrangler.jsonc`'s `vars` block is committed to the repo and, once deployed, is also directly
readable via `wrangler deploy`'s own printed bindings table (and by anyone with API access to the
Worker) — so `vars` may only ever hold values that are safe to be fully public. Anything actually
secret must go through `wrangler secret put`, never `vars`. When in doubt about a specific value,
ask: "would this let someone impersonate the app or access an account if leaked?" — if yes, it
must not be in `vars` or committed anywhere.

### 5. Report

- If nothing is found: say so plainly — don't just silently proceed, since the person asking
  wants to hear the check actually ran.
- If something is found: **do not commit/push/deploy**. Remove it from the file. If it was
  already committed (even unpushed), the commit must be amended/redone before proceeding — for an
  unpushed commit this is safe to do locally; for anything already pushed or already deployed,
  treat the credential as compromised and tell the user it needs to be rotated (a new Google
  client secret / GitHub token / Cloudflare API token issued and the old one revoked), since
  removing it from future commits doesn't undo the exposure — rewriting already-pushed history is
  itself a destructive operation, so confirm with the user before doing that part.

## Not exploitable alone — flag anyway, this project treats them as sensitive

This project is a **public repo**, so the bar here is "would we rather not publish this,"
not just "can this alone grant access." None of the following let someone impersonate the app
or access the Cloudflare account by themselves, but flag them if found and ask before letting
them be committed/deployed:

- **Cloudflare Account ID**
- **Cloudflare Zone ID**
- **D1 `database_id`**
- **R2 `bucket_name`**

These don't match a generic regex (a `database_id` is just a UUID; a bucket name is just a
string) — and the actual values must never be written into this skill file itself (that would be
exactly the leak this section exists to prevent). Instead, read them fresh each time from the
local, gitignored `apps/backend/wrangler.jsonc` (`database_id`, `bucket_name`) and from
`npx wrangler whoami`'s printed Account ID, then grep `<scope>` for those literal values.

**How this project resolved the practical tension**: `wrangler.jsonc`'s `d1_databases[].database_id`
and `r2_buckets[].bucket_name` are exactly what `wrangler deploy` needs, so it can't be committed
in its working form while treating those values as unpublishable. `apps/backend/wrangler.jsonc` is
gitignored; `apps/backend/wrangler.jsonc.example` (placeholders, committed) is the template each
deployer copies and fills in locally — see README.md's "First-time deploy setup". If a future
change reintroduces one of the sensitive values into a _committed_ file (not the gitignored
`wrangler.jsonc` itself), that's exactly what this check should catch — don't assume the
`.example` pattern makes the grep in step 2 unnecessary.

## Not a secret, but still flag it if hardcoded as a default in committed source

- **Google OAuth Client ID** (`NNNNNNNNNN-xxxx.apps.googleusercontent.com`) — Google's own
  position is that the value itself isn't secret: it ships embedded in client-side JS by design
  (Sign-In can't function otherwise), and access control comes from the authorized-origins
  allowlist plus ID-token signature verification, not from hiding this value. So it's fine in the
  _actual, gitignored_ `wrangler.jsonc`/`.env` for a real deployment, and fine as a placeholder in
  `wrangler.jsonc.example`/`.env.example`.

  The thing to actually catch is different: **this repo is OSS**, so a real Client ID hardcoded
  as a fallback default _in committed source_ (`value ?? 'real-id-here'`, or a real value sitting
  in a committed `.example` file instead of a placeholder) would silently point every fork/clone
  at the original author's own Google Cloud project — not a credential leak, but a distinct
  "don't make forks inherit my identity" bug. Grep committed `.ts`/`.vue`/`.example`/`.jsonc`
  files for the literal pattern `apps.googleusercontent.com` and check whether the match is a
  real-looking ID (digits + hash) or an obvious placeholder like `<your-oauth-client-id>`.

  Don't treat this as a leak needing rotation — a Client ID isn't rotatable the way an API key
  is. The fix is removing the hardcoded default from source (require the env var, no fallback)
  and replacing the `.example` value with a placeholder, as `server.ts`/`stores/auth.ts` and
  `wrangler.jsonc.example` in this project already do.

## Context for this project

`docs/spec.md` and `apps/backend/AGENTS.md` establish most of this project's secret-handling
pattern: Cloudflare secrets via `wrangler secret put` (never `.dev.vars` committed), Node secrets
via an untracked `.env` (`apps/backend/.env.example` / `apps/frontend/.env.example` /
`apps/backend/.dev.vars.example` document what each entrypoint needs). Neither `GOOGLE_CLIENT_ID`
nor `VITE_GOOGLE_CLIENT_ID` has a real default anywhere in committed source — both throw/warn
loudly if unset rather than silently working with the original author's identity. The Cloudflare
resource identifiers are this project's own stricter addition on top of that baseline,
specifically because the repo is public — don't assume another project using this same skill
draws the line in the same place; check its own docs first.
