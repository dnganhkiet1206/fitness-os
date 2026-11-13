# ASCND Round 2 — Production Verification

Tip: `native/ios-rewrite` @ `b19e9822`. **No Supabase/production access existed during this audit** (no credentials, no service keys, no dashboard, no CI history access). This file is the §8 verification matrix: every production check that matters, its exact procedure, its status, and what would close it.

**Headline: 0 of 20 items verified. All are BLOCKED or NOT_VERIFIED — ACCESS UNAVAILABLE.** Nothing in this report set marks any staging/production state verified from repo code alone. No production behavior is inferred from repo code anywhere.

## 1. Verification matrix (§8)

Status vocabulary: `VERIFIED` (evidence in hand) / `BLOCKED` (cannot run — access or prohibition) / `NOT_VERIFIED — ACCESS UNAVAILABLE` (read-only check, needs credentials) / `NOT_APPLICABLE`.

| # | Check (Round 1 AUD-48 item + Round 2 extensions) | Procedure (read-only unless noted) | Status | Blocker / what closes it |
|---|---|---|---|---|
| 1 | Applied-migration list vs repo + `pg_dump --schema-only` diff | `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version`; diff `pg_dump --schema-only` against a fresh 88-migration apply | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs DB access (read-only). Closes AUD-12's live half. |
| 2 | RLS behavior probes as a second user | As user B: SELECT/UPDATE/DELETE A's rows; `USING (true)` SELECTs; `community_posts` visibility; `dm_*` rules | BLOCKED | Needs a second live account + credentials. Isolated alternative executed (T-P1, T-P18r, T-PX on throwaway clusters) — proves the *repo chain*, not live state. |
| 3 | `CREATE` privilege on `public` for `anon`/`authenticated` | `SELECT has_schema_privilege('anon','CREATE', 'public')`, same for `authenticated` | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs DB access. Gates AUD-43 exploitability. |
| 4 | PostgREST exposure of unrevoked trigger functions | `POST /rest/v1/rpc/update_updated_at_column` (and the other 7) as anon + authenticated; observe error shape | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs live endpoint access. SQL-layer behavior proven (`0A000`, T-P8r/P8b); PostgREST surfacing unconfirmed. |
| 5 | Auth dashboard settings | Email confirmation, password policy, leaked-password protection, MFA, redirect allowlist, legacy JWT rotation | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs dashboard access. |
| 6 | Realtime publications | Dashboard → Database → Replication: which tables are published | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs dashboard access. A publication with no client subscriber would still be dead surface (AUD-59). |
| 7 | `storage.objects` RLS state | Dashboard / SQL: policies on `storage.objects` for the 3 buckets (`progress-photos`, `exercise-media`, `art-library`) | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs dashboard/DB access. |
| 8 | Deployed function versions + secret presence + `APPLE_ENV` | Dashboard → Edge Functions: deployed list + versions; secret presence (names only, never values); `APPLE_ENV` value class (production vs sandbox) | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs dashboard access. Gates AUD-04/AUD-47/AUD-88 live halves. The system-check bot diffs deployed code vs repo — its output is also NOT_VERIFIED (see item 17). |
| 9 | Privacy-policy coverage | Photos/health data to AI provider, barcode lookups (Open Food Facts), post-deletion UUID retention, DM cascade deletion (AUD-45), barcode + IP disclosure (AUD-79) | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs the published policy text + owner/legal review. Partly answerable from `legal-content.json` (in repo) — but the *published* policy and the *operational* facts behind it need live evidence. |
| 10 | Service-role key rotation/storage/holders | Who holds the service-role key, where stored, rotation history | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs owner account access. Never print key values. |
| 11 | Backup/PITR status + restore drill (AUD-01) | Dashboard → Database → Backups: PITR toggle + retention; restore to a **throwaway** project, verify row counts + app read smoke test, record RPO/RTO | BLOCKED | Needs dashboard access + a throwaway project. **Never restore over production.** This is the single most urgent check; it has survived two audit rounds unverified. |
| 12 | Plan/pooler/row-cap | Supabase plan, pooler mode/limits, `PGRST_DB_MAX_ROWS` effective value, region | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs dashboard access. Gates all unbounded-read findings (AUD-05/27/28) and the 1M scale verdict. |
| 13 | Sentry/PostHog liveness in release builds | Sentry: events for the release version; PostHog: events from release builds; confirm keys baked into the Release binary | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs Sentry/PostHog access + a release build. See also item 19. |
| 14 | Staging project existence | `supabase projects list` (second project?); any staging ref outside the repo | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs account access. Gates AUD-07's "no staging" half. |
| 15 | `ai_credits` live balances | Read-only: `SELECT count(*), sum(tokens_remaining) FROM ai_credits` | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs DB access. Would change AUD-23 if manual top-ups exist. |
| 16 | `weekly_reviews` / `habit_nudges` / `scan_history` / `wearable_sources` live row counts | Read-only `SELECT count(*)` per table | NOT_VERIFIED — ACCESS UNAVAILABLE | Needs DB access. Gates AUD-11 (drop vs document). |
| 17 | System-check bot output + scheduled-run history (NEW — R2-OPS-01) | Actions history: `system-check` runs with `event=schedule`; bot's latest issue update (#527) with advisor/drift/liveness results | BLOCKED | Needs authenticated GitHub API access (PAT expired 2026-10-30; all authenticated `gh` calls return 401). Public API reads show only that `main` has no workflows. |
| 18 | E2E/a11y nightly runs existence (NEW — R2-OPS-01) | Actions history: `ios-e2e` / `ios-a11y` runs with `event=schedule` | BLOCKED | Same as item 17. Prediction from repo evidence: zero scheduled runs ever. |
| 19 | Telemetry-key presence in release builds (NEW — R2-OPS-06) | Release binary's Info.plist: Sentry DSN / PostHog key non-empty; dSYM upload success in Sentry for the release version | BLOCKED | Needs a release build + Sentry access. The release gate (R2T-06) must assert this. |
| 20 | Backup/retention evidence for the privacy claim (NEW — R2-OPS-09) | Same evidence as item 11, diffed against `legal-content.json:485` wording ("may persist for up to 30 days") | BLOCKED | Same as item 11. Launch-blocking: privacy-policy accuracy. |

**Coverage: 0/20 verified, 0/20 partially verified, 20/20 blocked or unverified.**

## 2. What was verified instead (isolated alternatives — and their limits)

The following were executed on isolated throwaway infrastructure. They prove the *repository* is self-consistent; they prove nothing about live state, and are labeled as such wherever cited:

- **Both SQL suites pass** (T-S1/T-S2) + **strict 88/88 full-chain migration apply** (T-M1/T-API-10) on throwaway PG16 clusters — proves the migration chain applies cleanly to stock PG16 with a faithful `auth` stub. Does NOT prove production applied the same chain (item 1).
- **53 behavior assertions** (T-P1..T-PX) + **11 PG behavior tests** (T-API-01..11) — prove RLS/grant/function behavior *of the repo chain*. Do NOT prove live RLS/grants/functions match (items 2/4/8).
- **20 TS helper executions** (T-TS-01..20) — prove clamp/parse/validation helper behavior from verbatim code extractions. Do NOT prove deployed function behavior (item 8).
- **Static inventories** (T-OPS-07..15, T-C1..C13, T-STATIC-01) — prove repo contents. Do NOT prove live contents.
- **Git-object + public-API reads** (T-OPS-11) — prove `main` has no workflows and the default branch is `main`. Do NOT prove Actions history (items 17/18).

## 3. Checks that must NEVER be run against production

Per the brief §1 safety rules (and re-stated here so this file is self-contained for whoever runs the matrix):

- No production writes, migrations, deploys, purchases, rewards, notifications, or load tests.
- No behavior probes that mutate live data (live quota burn, live delete, live webhook, live claims, live refunds) — use the isolated alternatives in `03-test-plan.md`.
- No restore over production — restore drills go to a throwaway project only.
- Never print secret values; record names/presence/rotation only.
- No credential or key material in any evidence file.

## 4. Minimum evidence package to close the matrix (owner runbook)

For the owner (Kiệt) or an agent with dashboard + GitHub access, in priority order:

1. **Backups (items 11 + 20):** Dashboard → Database → Backups. Record: plan, PITR on/off, retention days. Restore to a throwaway project; record RPO/RTO + verification (row counts + app read smoke test). Diff against `legal-content.json:485`; correct the text or file the evidence. *Closes AUD-01's production half + R2-OPS-09.*
2. **Schema drift (item 1):** applied-migration list + `pg_dump --schema-only` diff vs fresh apply. Record gaps. *Closes AUD-12's live half.*
3. **Functions (item 8):** deployed list + versions + secret presence (names only) + `APPLE_ENV` class. Diff deployed code vs repo (or file the bot's diff output). *Closes AUD-04/47/88 live halves.*
4. **RLS/grants (items 2/3/4/7):** second-user probes (read-only + disposable test rows on a non-production project preferred; if run live, use a disposable test account and delete test rows afterward), schema privileges, PostgREST trigger-function exposure, storage policies. *Closes AUD-38/41/43 live halves.*
5. **Auth + plan (items 5/12/14):** Auth settings screenshot/export (no secrets), plan/pooler/row-cap/region, project list. *Closes AUD-07/48 halves.*
6. **Telemetry (items 13/19):** Sentry/PostHog release-build events + Info.plist key check + dSYM confirmation. *Closes AUD-58 + R2-OPS-03/06 verification.*
7. **CI history (items 17/18):** with a renewed PAT: Actions runs for `system-check`, `ios-e2e`, `ios-a11y` with `event=schedule`. *Confirms or refutes R2-OPS-01's "never ran" prediction.*
8. **Data checks (items 15/16/9/10):** `ai_credits` balances, dead-table row counts, privacy-policy coverage review, service-key holders/rotation (names only).

Record results in the repo (or the system-check bot) with dates + evidence links, without secrets. Re-run items 1/8/11/13 on every production deploy until the scheduled bot (R2-OPS-01) is restored.

## 5. Staging

No staging environment could be verified to exist (item 14). The repo contains a single project ref in all configs and a stale old ref in `native/docs/PRE_RELEASE.md`. **No staging behavior is marked verified anywhere in this report set.** If a staging project exists outside the repo, items 1/2/4/8/11/12 should be run against it first (staging soak), then promoted — that is the AUD-07 remediation.

*End of production verification.*
