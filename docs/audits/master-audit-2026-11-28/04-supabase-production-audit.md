# Report 4 — Supabase Production Audit

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w3-supabase.md (worker W3). Fresh edge-function probe 2026-11-28 included. Dashboard-only items are marked UNVERIFIED, not assumed.

# W3 — Supabase PRODUCTION Audit (master audit 2026-11-28)

**Worker:** W3 (Supabase PRODUCTION audit) · **Date:** 2026-11-28 ~00:30–01:30 CST
**Repo:** `github.com/dnganhkiet1206/fitness-os` (public) · **Branch:** `native/ios-rewrite`
**Tip audited:** `5e673df3` (2026-11-24) · **Project:** `guqmbqtgxqleuwajvwvg.supabase.co`
**Mode:** READ-ONLY. No Supabase writes, migrations, RLS changes, deploys, restores, or config
changes. No code changes, commits, pushes, PRs, issue edits, or GitHub posts. No secret values
are recorded anywhere in this file (key names and paths only).

**Reused and re-verified (not redone from zero):** R1 `ASCND_BACKEND_AUDIT_REPORT.md`
(88 findings, tip `b19e9822`); R2 `audit-output/round-2/` (130 findings, 11 launch-blocking,
same tip); `beta-gate-decisions.md`; `mustdo-queue/item1-supabase-verification.md`
(W1 live probe, 2026-11-17, tip `50a81ee7`); `ascnd-map/inventory/02-data-backend.md`
(tip `2fb08784`, 2026-11-16).

## 0. Method and limitations — read first

### How the tip was inspected

A fresh `git clone --depth 1 --branch native/ios-rewrite` of the repo was **started and then
stopped mid-flight**: an execution-risk check flagged the clone operation, and per that check
the partially-downloaded checkout under `/tmp/w3/repo` was **not opened, not executed, not
read, and not used again** (the background clone process was terminated). All tip evidence
below comes instead from:

1. The pre-existing read-only worktree `~/workspace/ascnd-map-wt-data` at tip `2fb08784`
   (2026-11-16) — plain file reads only, no execution of repo code, no git operations
   inside it after the flag.
2. **GitHub API tree comparisons** (`git/trees/<sha>?recursive=1`, blob-SHA diff) between
   R2 tip `b19e9822`, `2fb08784`, and audit tip `5e673df3` — this establishes byte-identical
   vs changed files without a checkout.
3. **GitHub API contents reads** (`contents/<path>?ref=5e673df3`, base64-decoded as text) for
   every file that changed between `2fb08784` and `5e673df3` under `supabase/`, plus
   `Backend.xcconfig`, `PurchaseController.swift`, `StoreKitClient.swift`,
   `EdgeFunction.swift`, and `.github/workflows/sql-community.yml`.
4. **Fresh live probes** (2026-11-28 ~00:35 CST) against the production project with the
   publishable/anon key only, using exactly the W1 method (controls included): `POST {}`
   to edge functions, `GET ?select=*&limit=1` on tables, `POST {}` to no-arg RPCs.
   No mutation RPC was called; no service-role key was used or sought.

### What this audit could NOT do (same as R1/R2, unchanged)

- **No SQL against production, no dashboard access, no service-role key, no second user
  account.** Applied-migration state, live RLS behavior, backups/PITR, plan/pooler/row-cap,
  Auth dashboard settings, deployed function versions, secret presence, storage policies,
  and provider settings are all **UNVERIFIED** unless a live probe below proves otherwise.
  A probe proves an endpoint exists and its handler runs; it does **not** prove the deployed
  code matches the repo at tip.
- **No PostgreSQL on this VM for a fresh full-chain replay** (R1/R2 did that at `b19e9822`
  with 0 failures on PG16). Counts below are repo-text counts unless marked catalog-verified
  from R1/R2. Where R1/R2 catalog numbers and my text counts differ, both are shown.
- **No Xcode/simulator/Mac.** Native-client claims are code reads only.

### Classification used in this file

- **CONFIRMED** — directly observed in repo text at tip, or demonstrated by the live probe.
- **STRONGLY SUSPECTED** — observed pattern + one inference step, or repo evidence whose live
  half is unproven but consistent.
- **POTENTIAL RISK** — a real hazard with bounded blast radius or a design choice whose
  failure mode is unhandled.
- **UNVERIFIED** — dashboard / live-DB / second-account evidence required; exact check given.

---

## 1. Project status + access limitations

| Item | Value / status |
|---|---|
| Project ref | `guqmbqtgxqleuwajvwvg` — `supabase/config.toml:1` (`project_id`), unchanged since R1 |
| Project URL | `https://guqmbqtgxqleuwajvwvg.supabase.co` — `apps/ios/Config/Backend.xcconfig:10`
  (`ASCND_SUPABASE_HOST`), verified identical at tip `5e673df3` via API contents read.
  (`Backend.xcconfig` changed 11-16→tip, but the host line did not.) |
| Anon/publishable key | Present in `Backend.xcconfig` (`ASCND_SUPABASE_KEY`); value **not recorded** here.
  Used only for the read-only probes in §6. Key still valid at probe time (gateway
  accepted it; see §6). Whether the key value rotated 11-16→tip was not checked and
  does not affect any finding. |
| Service-role key | Not in repo (R1 secret scan; no new secret material observed in files read at tip).
  Never used, never sought. |
| Auth health (live probe 2026-11-28) | `GET /auth/v1/health` with apikey header → **200**
  `{"version":"v2.199.0","name":"GoTrue"}` (W1 saw v2.198.0 on 11-17 — GoTrue bumped
  one patch, platform-side). Without the header → 401 (expected). |
| Dashboard | Inaccessible to this worker. All dashboard-only items §9. |
| Staging project | No evidence of one in repo (single project ref everywhere). UNVERIFIED whether
  one exists outside the repo (AUD-07 live half). |
| Default branch / scheduled CI | Default branch is still **`main`** (GitHub API, 2026-11-28). `main` still has
  **0 workflows** (API tree read). See §8 / W3-13. |

### Verifiable from outside vs dashboard-only

| Verifiable from outside (done in this audit) | Dashboard / live-DB only (UNVERIFIED) |
|---|---|
| Edge-function existence + handler liveness (401 vs 404) | Deployed function **versions** vs repo tip |
| Table/RPC existence in the PostgREST schema cache (200/401 vs 404) | Applied-migration list (`supabase_migrations.schema_migrations`) |
| Auth `/health` version | Backup / PITR state + retention + restore drill |
| Repo text: migrations, policies, functions, triggers, config | Live RLS behavior as a second user; `CREATE` on `public` for anon/authenticated |
| Workflow files present on `native/ios-rewrite` | Secret/env presence (names only); `APPLE_ENV` class |
| | Storage bucket list + storage policies as enforced live |
| | Auth provider settings, redirect allowlist, password/leaked-password/MFA settings |
| | Plan / pooler / `PGRST_DB_MAX_ROWS` / region; Realtime publications |
| | Live row counts (dead tables, `ai_credits` balances); service-key holders/rotation |

---

## 2. Database inventory (repo text at tip `5e673df3`)

Base = 94 migrations at `2fb08784` (text counts run on the pre-existing worktree) + delta
from the 7 new migrations (each read in full). R1/R2 catalog numbers at `b19e9822` shown
for comparison; no full-chain replay was run in this round.

| Object | Repo text, tip `5e673df3` | R1 catalog (`b19e9822`, 88 mig) / R2 correction |
|---|---|---|
| Migration files | **101** (94 + 7 new, 0 removed, 0 modified — see §3) | 88 |
| Tables (`public.*`, unique `CREATE TABLE`) | **68** (no new table in the 7 new migrations) | 67 → R2/map: 68 |
| Function names (unique, `CREATE [OR REPLACE] FUNCTION public.*`) | **102** (95 base + 7 new names) | 93 names / 94 signatures; R2: 95 names |
| Function definition lines (`CREATE FUNCTION` incl. redefinitions) | 123 base + 20 new-definition lines in the 7 new files | — |
| `SECURITY DEFINER` occurrences (repo text, incl. redefinitions) | 133 base; all 7 new function names are `SECURITY DEFINER` | 88 definer of 94 signatures (catalog) |
| Triggers (unique `CREATE TRIGGER` names) | **52** (none added in the 7 new migrations) | 52 |
| RLS `ENABLE ROW LEVEL SECURITY` statements | 69 lines, covering **68 unique tables** (one re-enable) | 67/67 enabled |
| RLS policies (`CREATE POLICY` lines) | **137** (none added in the 7 new migrations) | 124 table + 3 storage = 127 final after replay |
| Indexes (`CREATE [UNIQUE] INDEX` lines) | **102** explicit; minus 15 dropped by `20261124120000` → **87 net** if applied | 158 total incl. PK/unique auto-indexes (catalog) |
| `CREATE EXTENSION` | **0** | 0 |
| Views / materialized views | **0** | 0 |
| JSONB columns | 10 (R2 catalog correction of R1's 9) | 10 |
| Storage buckets (in SQL) | **3** — see §7 | 3 |

### Table inventory by domain (68 tables — unchanged since the map survey)

Identity/profile: `profiles`, `community_profiles`, `app_roles`, `body_measurements`,
`awards`. Exercise: `exercises`, `exercise_media`, `exercise_media_content`,
`exercise_guide_content`, `exercise_favorites`. Workouts: `workout_sessions`,
`workout_templates`, `routine_days`, `plan_day_overrides` (`day_overrides` in R1 naming).
Nutrition: `food_items`, `meal_entries`, `meal_entry_items`, `meal_plans`,
`meal_plan_items`, `grocery_items`, `scan_history`. Body/health: `daily_logs`,
`sleep_logs`, `water_logs`, `weight_logs`, `biometric_samples`, `supplements`,
`supplement_intake_logs`, `progress_photos`, `wearable_sources`, `body_checks`,
`habit_nudges`. AI: `ai_conversations`, `ai_messages`, `ai_usage`, `ai_credits`,
`coach_memory`. Economy: `mascot_inventory`, `mascot_transactions`, `reward_prices`,
`shop_prices`, `streak_freezes`, `koa_pauses`, `koa_pause_log`, `entitlements`,
`weekly_challenges`, `weekly_reviews`. Community (25): `community_profiles`,
`community_posts`, `community_comments`, `community_comment_mentions`, `community_likes`,
`community_saves`, `community_follows`, `community_blocks`, `community_mutes`,
`community_settings`, `community_notifications`, `community_challenges`,
`community_challenge_members`, `community_reports`, `community_restrictions`,
`community_review_requests`, `community_post_hides`, `community_post_tries`,
`community_art`, `moderation_audit_log`, `dm_threads`, `dm_messages`.

### Findings (database)

- **W3-DB-01 — CONFIRMED: no schema drift in repo text between R2 tip and audit tip
  except by addition.** Blob-SHA comparison `b19e9822 → 5e673df3` over `supabase/`
  shows 13 added migrations (6 from 11-12→11-16, 7 from 11-17→11-24) and **zero
  modifications to any existing migration file**. The migration chain is still
  append-only. (Changed non-migration files are listed in §5/§8.)
- **W3-DB-02 — CONFIRMED: no new tables, views, extensions, triggers, or policies in
  the 7 new migrations.** They only add/alter functions, add one column
  (`community_notifications.payload`, `20261117070000:52-53`), and drop duplicate
  indexes. Table count stays 68.
- **W3-DB-03 — UNVERIFIED: whether all 101 migrations are applied live.** Only
  `20261117070000` is indirectly evidenced live (new RPC `community_my_reports`
  exists in the PostgREST schema cache — §6). The other 6 new migrations add no
  tables and their new RPCs all require parameters, so they cannot be probed as anon
  (PostgREST returns PGRST202 for a parameterized RPC called with `{}` even when it
  exists). Exact check: `SELECT version FROM supabase_migrations.schema_migrations
  ORDER BY version DESC LIMIT 10;` on the dashboard SQL editor.
- **W3-DB-04 — Carried CONFIRMED (R1/R2, not re-executed):** 22→25 unindexed FKs
  (AUD-10, R2 count 25/27 strict) — partially addressed in repo by `20261112130000`
  + `20261112130100` (FK-index migrations, 11-12); live application UNVERIFIED
  (W1 item 4). No new unindexed FKs in the 7 new migrations (no new FKs at all).
- **W3-DB-05 — Carried CONFIRMED (AUD-08/19/20/22/30):** JSONB sets/programs without
  FK or shape CHECK; denormalized aggregates without reconciliation; core 2026-02
  schema without CHECKs; no retention/archival. Nothing in the 7 new migrations
  touches these.
- **W3-DB-06 — Carried CONFIRMED (AUD-11):** dead/legacy tables `scan_history`,
  `weekly_reviews`, `habit_nudges`, `wearable_sources` still have no native caller
  and no edge caller at tip. Live row counts UNVERIFIED (AUD-48 item 16).

---

## 3. Migration findings (101 files)

### 3.1 Ordering and history

- Timestamp prefixes are unique and ascending across all 101 files; no duplicate
  version prefix (same check R1/R2 ran at 88 files). No file was renamed or edited
  in place between `b19e9822` and `5e673df3` (blob-SHA proof, §2).
- 13 migrations added since R2 tip: `20261112120000_reward_key_shapes`,
  `20261112130000_fk_indexes`, `20261112130100_community_fk_indexes`,
  `20261112140000_streak_freeze_sale_closed`, `20261112150000_mascot_wallet`,
  `20261116120000_exercise_favorites_popularity` (all covered by the map survey +
  W1 probe), and the 7 below, which this audit read in full.
- Still forward-only: no down migrations, no rollback procedure (AUD-07, repo half
  CONFIRMED; staging half UNVERIFIED).

### 3.2 The 7 new migrations (2026-11-17 → 2026-11-24), each read in full

| # | Migration | Lines | What it does | Security reading |
|---|---|---|---|---|
| 1 | `20261117070000_community_moderation_feedback.sql` | 436 | Adds `community_notifications.payload jsonb` + `moderation` kind; new `moderation_notify()` + `moderation_open_reporters()` (both `SECURITY DEFINER`, revoked from PUBLIC/anon/authenticated); rewrites `mod_hide/restore/remove/dismiss/decide_appeal` + `mod_target` (adds `author_stats`, `restriction`); new `community_my_reports()` (definer, granted to `authenticated`) returning own reports + 160-char excerpt of the target | **Introduced a privacy oracle (W3-01)** — see below. Otherwise sound: `moderation_require()` gating kept, notify calls wrapped in `EXCEPTION WHEN OTHERS THEN NULL` so a notify failure cannot fail a moderation decision (deliberate; see W3-10). |
| 2 | `20261117170000_community_report_readable_guard.sql` | 153 | New `community_post_readable_by()` + `community_report_target_readable()` (definer, revoked from all roles); `community_reports_guard()` trigger now refuses reports on unreadable targets (42501); `community_my_reports()` redefined so the excerpt is `''` when the caller cannot read the target at call time | **Fixes W3-01 at the root** (defense in depth: guard + read-time check). Correctly mirrors the two read policies; deliberately does NOT block reports on self-hidden/muted targets. Fail-closed for unknown visibility values (anything not `public` + not followed requires follow). |
| 3 | `20261119120000_claim_duplicate_marker.sql` | 74 | `claim_quest_reward()` rewritten: already-claimed key → return `0` immediately (before the ceiling check); race losers (`ROW_COUNT = 0`) also return `0` | **Fixes AUD-64 + K-01 (KOA-T01)** in repo. Ceiling unchanged (800/day, `x:` excluded). Does NOT verify completion — AUD-02 core unchanged (W3-03). |
| 4 | `20261120120000_shop_atomic_wear.sql` | 118 | `buy_mascot_item()` — advisory lock moved BEFORE the already-owned check; `unique_violation` → `'already owned'`; new `buy_and_wear_mascot_item(p_item_key, p_unequip)` and `set_mascot_worn(p_on, p_off)` (all definer, `authenticated` only) | **Fixes AUD-65** in repo. New RPCs are owner-scoped (`user_id = auth.uid()` throughout) and run in one transaction each. `set_mascot_worn` trusts the client's slot-conflict list (`p_off`) — server only sets what the client sends, on the caller's own rows (documented; residual: stale client slot map can leave two items equipped — see W3-06). |
| 5 | `20261120130000_wallet_claimed_keys.sql` | 50 | `mascot_wallet()` redefined: `claimed` set narrowed to keys the app actually queries (`welcome`, `x:`, `set:`, malformed/old `d:`/`ch:` keys, recent `d:` ≤7d / `ch:` ≤28d); `clean:`/`buy:`/`freeze:`/`cc:` no longer listed; balance + XP unchanged | Behaviour change, documented in-header. Client-visible `claimed` set shrinks — safe only if no client reads `claimed` for `clean:`/`buy:`/`freeze:`/`cc:` (header asserts the app reads dust via a separate query). Not verified against Swift at tip — W3-12 (POTENTIAL RISK). |
| 6 | `20261120130100_community_challenge_ceiling.sql` | 63 | `claim_community_challenge()` redefined: daily-ceiling sum now excludes `x:` keys, matching `claim_quest_reward` | **Fixes R2-ECO-05** in repo. Still no deadline check (R2-ECO-03, W3-04) and still counts pre-join sessions (R2-ECO-04) — both preserved verbatim. |
| 7 | `20261124120000_dedupe_indexes_pin_search_path.sql` | 88 | `pg_temp.drop_dup()` helper + 15 `drop_dup` calls (7 unique-dup, 8 regular-dup); pins `search_path = ''` on trigger functions `mascot_inventory_item_is_fixed()` and `moderation_audit_immutable()` (if present). Deliberately does NOT pin `community_fold` (SQL IMMUTABLE in a search index; pinning would block inlining) | Well-guarded: each drop runs only if the keep-index exists, is valid, and covers the same columns/predicate/opclass; otherwise NOTICE + skip — so a production/repo index-name skew cannot drop a live unique constraint. Covers all 7 exact-duplicate groups R2 catalogued (AUD-16, largely fixed in repo). `community_fold` non-pinning is a documented, reasoned exception (W3-05). |

### 3.3 Migration findings (numbered)

- **W3-MIG-01 — CONFIRMED:** the "CHƯA DEPLOY" header staleness R2 noted (AUD-12) is
  now partly resolved by evidence, not by editing the headers: W1 probed
  `exercise_favorites` (200 `[]`) and `mascot_wallet` (401) live on 11-17, proving
  `20261116120000` and `20261112150000` applied. The stale headers themselves were
  not corrected in the 7 new migrations (none touches them). **UNVERIFIED:** whether
  `20261112130000` / `20261112130100` (FK indexes) and `20261112140000` (freeze-sale
  REVOKE) applied live — exact checks are W1 §6 items D2–D3, still open.
- **W3-MIG-02 — CONFIRMED:** `20261112140000_streak_freeze_sale_closed.sql` (read at
  `2fb08784`) revokes `buy_streak_freeze()` and `buy_streak_freeze(uuid)` from
  PUBLIC/anon/authenticated and grants only to `service_role`. This is the beta-gate
  B-2 option B implementation. Live application UNVERIFIED (needs the
  `has_function_privilege` check).
- **W3-MIG-03 — POTENTIAL RISK:** `20261124120000` drops indexes by name with a
  keep-check, but the keep-check compares `indkey/indclass/indpred` text, not
  opclass ordering semantics for the DESC-kept variants — the header's claim
  ("B-tree scans both directions, so ASC and DESC serve the same queries") is true
  for plain B-tree ordering but the planner may still prefer a matching-direction
  index for `ORDER BY … DESC … LIMIT` in edge cases. Blast radius is a planner
  choice, not correctness. No action; note for the record.
- **W3-MIG-04 — CONFIRMED:** no migration in the 101 touches `auth.*` schema,
  `storage.*` (except bucket rows, §7), `pg_cron`, publications, or extensions.
  No scheduled DB jobs exist in repo (AUD-60, R2-OPS-01 context).

---

## 4. RLS findings

Carried baseline (R1 replay + R2 revalidation at `b19e9822`, **not re-executed** here —
no PG on this VM): RLS enabled on every table; 124 table policies + 3 on
`storage.objects` final after replay; 1 zero-policy table (`moderation_audit_log`,
deny-all by design); 14 `AS RESTRICTIVE` policies, all verified safe; 5 permissive
`USING (true)` SELECTs on public-by-design content; 0 views; no `FORCE RLS`.

### What changed at tip vs R2

- **No `CREATE POLICY`, `DROP POLICY`, `ALTER TABLE … ENABLE/DISABLE RLS` in any of
  the 7 new migrations** (grep-verified). The policy set at tip is therefore the
  R2 policy set, plus nothing. Every RLS finding below is either carried or arises
  from the new *functions* (which run as `SECURITY DEFINER` and therefore bypass RLS
  by construction).
- New definer helpers are all revoked from PUBLIC/anon/authenticated except
  `community_my_reports()` (granted to `authenticated` only, and it filters by
  `auth.uid()` internally — `20261117170000:127-153`).

### RLS findings table

| ID | Finding | Severity / class | Status at tip `5e673df3` |
|---|---|---|---|
| AUD-38 | UPDATE policies without `WITH CHECK` on `profiles`, `exercises`, `food_items`, `weekly_challenges` allow `user_id` mutation (publish a private row into the shared library / transfer to another user) | LOW, CONFIRMED (R1/R2) | **Still open** — no policy change in the 7 new migrations. |
| AUD-39 | `body_checks.photo_id` has no parent-owner check; knowing another user's photo UUID lets an attacker squat the `UNIQUE(photo_id)` row | LOW, CONFIRMED | **Still open** — no change. |
| AUD-40 | `dm_can_message(p_me, p_other)` never checks `p_me` against `auth.uid()` — privacy oracle on arbitrary pairs | LOW, CONFIRMED | **Still open** — function untouched since R2. |
| R2-DB-01 | `community_blocked_between(a, b)` callable by any authenticated user about any pair — block-graph oracle | P3, CONFIRMED | **Still open** — untouched. Note: the new `community_post_readable_by()` *calls* it internally but is itself revoked from all roles, so no new exposure. |
| AUD-41 | 8 trigger functions have no GRANT/REVOKE (default `EXECUTE TO PUBLIC`) | LOW, CONFIRMED (repo) | **Partially mitigated in repo**: `20261124120000:74-87` pins `search_path = ''` on 2 of them (`mascot_inventory_item_is_fixed`, `moderation_audit_immutable`). PostgREST exposure live UNVERIFIED (AUD-48 item 4). |
| AUD-43 | `search_path = public` on (nearly) all definer functions, not the strictest pin | LOW, CONFIRMED | **Partially mitigated**: 2 trigger functions now pinned to `''`; all 7 new functions still use `SET search_path = public` (consistent with the codebase convention). Exploitability still gates on `CREATE` on `public` for anon/authenticated — UNVERIFIED live. |
| W3-01 | `community_my_reports()` (20261117070000) returned a 160-char excerpt of ANY reported content via definer bypass, while the insert policy never checked read access — report-then-read oracle for follower-only / blocked-author posts | HIGH (repo), CONFIRMED | **Fixed in repo the same day** by `20261117170000` (guard at insert + excerpt suppressed when unreadable at read time). **Live version UNVERIFIED** — the function exists live (§6) but the probe cannot tell which of the two definitions is deployed. If production runs only the 11-17 07:00 version, the oracle is live. Exact check in §9. |
| W3-02 | `moderation_notify()` inserts into `community_notifications` with `actor_id = NULL` (system voice) and `kind = 'moderation'`; recipients cannot opt out via `community_notify_filter` (by design, documented) | INFO, CONFIRMED | As designed. No RLS issue: notifications are owner-scoped on read. |
| AUD-42 | Anon can read shared-library rows with `user_id IS NULL` (`exercises`, `food_items`, `exercise_guide_content`, `exercise_media`, `exercise_media_content`) via default-`TO PUBLIC` early policies | INFO, CONFIRMED | Still open by design (public library). |
| AUD-48 items 2/3/4/7 | Live RLS behavior, schema `CREATE` privilege, trigger-function PostgREST exposure, `storage.objects` RLS state | — | **UNVERIFIED** (0/20 production checks closed across R1+R2+W3; see §9). |

### SECURITY DEFINER posture (re-verified by text)

- All 7 new function names are `SECURITY DEFINER` with `SET search_path = public`
  (grep + full reads). The two helpers that must never be callable
  (`moderation_notify`, `moderation_open_reporters`, `community_post_readable_by`,
  `community_report_target_readable`) carry explicit
  `REVOKE EXECUTE … FROM PUBLIC, anon, authenticated`.
- Internal-only functions that R1/R2 verified as revoked stay revoked; no new
  migration grants anything to `anon` except nothing. `community_my_reports()` is
  the only new authenticated-callable function, and it is uid-scoped internally.
- **AUD-15 (structural, MEDIUM) stands:** ~95 definer functions concentrate product
  integrity in code that bypasses RLS. No new exploitable defect found in the 7 new
  bodies. Mitigation remains the SQL suites + mutation testing — now with CI jobs
  added (§8), whose actual runs are UNVERIFIED.

---

## 5. Auth findings

### 5.1 What was re-verified at tip

- **`supabase/functions/_shared/guard.ts` — UNCHANGED since R2** (blob SHA
  `6b1797fc…` identical at `2fb08784` and `5e673df3`; full read at the 11-16 copy).
  `requireUser()` still checks `sub` + `role == 'authenticated'` + `aud` contains
  `'authenticated'` (array-or-string aware) via `supabase.auth.getClaims(token)`
  on a client built with the anon key + the caller's forwarded token, so all
  queries stay RLS-governed. The file's own header documents the closed
  anon-key-as-user hole. **CONFIRMED.**
- **`supabase/config.toml` — UNCHANGED since R2** (blob SHA `8dea69d5…` identical).
  All 12 functions `verify_jwt = false`; comments record the reason per function
  (Apple webhook holds no user token; delete-account/admin-art need service role +
  self-check JWT). No platform backstop by design (AUD-37, LOW structural, stands).
- **No function trusts client-supplied user IDs.** All handlers use `requireUser`'s
  `userId`. `admin-art` double-checks `my_app_role() == admin` (R1-verified, file
  unchanged since R2).
- **Auth providers (Apple/Google), email confirmation, password policy,
  leaked-password protection, MFA, redirect allowlist, JWT-key rotation:** all
  dashboard-only, **UNVERIFIED** (AUD-48 item 5). Nothing in the repo changed on
  this between R2 and tip (no Auth migration exists in the 101).
- **Session handling (native client):** Keychain session + auto-refresh via
  supabase-swift (map inventory §4; `Backend.swift` changed 11-16→tip but the
  auth-storage path was not re-audited here — out of W3's Supabase scope except
  as noted). R2-API-08 (any session-nil event runs full cleanup incl. outbox
  discard) is a client finding, carried, not re-verified at tip.

### 5.2 `delete-account` — new Apple-grant revocation (CHANGED since R2)

- `supabase/functions/delete-account/index.ts` grew 180 → 230 lines (11-10→11-24;
  unchanged 11-16→tip). New: before destroying anything it calls
  `revokeAppleGrantIfLinked()` from the new `_shared/apple-signin.ts` (316 lines).
- **Identity still comes from the Authorization header, never from the body.**
  The body is read best-effort for exactly two fields (`apple_refresh_token`,
  `apple_authorization_code`); the helper first lists the user's identities via
  the admin API and proceeds only if one has `provider === 'apple'`
  (`apple-signin.ts:283-312`). The client half (re-authenticate with Apple inside
  the delete flow, send a fresh code) does **not exist yet** — recorded as
  follow-up in `CONSTRAINTS_AND_DEFERRED.md`; until then Apple-linked deletions
  log `no_token` and proceed.
- **W3-AUTH-01 — POTENTIAL RISK (low): revocation is best-effort and fail-open
  in two places, by documented design.** (a) If the admin identity lookup fails,
  the helper treats it as "no Apple identity" and returns silently
  (`apple-signin.ts:289-296`). (b) Any revocation failure returns an outcome and
  deletion continues. Consequence: a transient admin-API failure or an
  unconfigured `APPLE_SIGNIN_*` secret leaves the Apple grant standing after the
  account is gone, visible only in function logs. Acceptable per App Store
  guideline 5.1.1(v) intent (revocation retriable from logs), but there is no
  retry job and no alert — the log line is the only trace.
- **W3-AUTH-02 — POTENTIAL RISK (very low): client-supplied token material.**
  A caller can submit an arbitrary `apple_refresh_token` in the delete body; the
  server will present it to Apple with this project's client credentials. The
  token is only *revoked*, never used to authenticate as anyone, and revocation
  requires the token to have been issued for this project's `client_id` — so the
  worst case is revoking a token the caller already possesses (self-harm or a
  token the caller stole elsewhere). No identity confusion: the deleted account
  is always the header's user. No fix proposed; recorded for completeness.
- **W3-AUTH-03 — CONFIRMED (carried, AUD-21):** deletion still needs no
  re-authentication, confirmation token, or grace period (`delete-account`
  still gates on `requireUser` only; the Apple addition does not add step-up).
  Client confirmation is still a single alert (R2 evidence). The recovery-link
  issue (R2-API-10: a recovery link opens a full session usable without ever
  setting a new password) was **not re-verified at tip** — carried as open.
- **Account deletion cascade — CONFIRMED (carried, R1 script-verified):** every
  user-data table reaches `auth.users` by `ON DELETE CASCADE`; `delete-account`
  empties the `progress-photos` folder first (paged, 100/page), then
  `admin.auth.admin.deleteUser`, with a `partial: true` flag on failures after
  destruction began. `moderation_audit_log.actor_id` deliberately survives
  (pseudonymous UUID retention).

### 5.3 Auth-adjacent new surface: `apple-signin.ts` secrets

- Four **new** secret names (presence only, values never sought):
  `APPLE_SIGNIN_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`, `APPLE_SIGNIN_PRIVATE_KEY`,
  `APPLE_SIGNIN_CLIENT_ID` — a Sign-in-with-Apple key, **different** from the
  App Store Server API key in `_shared/apple.ts` (different key id, audience,
  `sub` = client id). If any is missing, revocation is skipped loudly and
  deletion proceeds. **UNVERIFIED:** whether these four secrets are configured
  in the dashboard (names-only check, §9).
- The ES256 `client_secret` construction (header `kid`, claims `iss` = Team ID,
  `aud` = `https://appleid.apple.com`, `sub` = client id, 300 s expiry; raw r‖s
  signature) matches Apple's documented shape; no defect found on read.

---

## 6. Edge Functions — inventory + fresh probe results

### 6.1 Inventory (12 deployable, unchanged count since R1)

`supabase/config.toml` unchanged: all 12 `verify_jwt = false`; auth enforced
in-handler via `_shared/guard.ts` except `store-webhook` (public by design, trusts
only Apple-signed JWS). `_shared/` gained 3 files since R2: `apple-signin.ts`
(§5.2), `prompt-slots.ts` (26 lines — prompt template slots; `forSpanish` moved
here from `ai.ts` so data substitution happens *after* language rewriting, fixing
user-data text being rewritten), `ai_slot_test.ts` + `apple-signin_test.ts` +
`scope_test.ts` + `ai-coach/context.ts` (+ tests) — test files, no runtime surface.

| Function | Purpose (from code) | Auth | Env deps (names only) | Changed since R2? |
|---|---|---|---|---|
| `ai-coach` (579 lines) | Streaming AI coach chat; scope-gated, readiness/sleep/water/progress context | `requireUser` + `aiGate` | `ASCND_AI_URL/KEY/MODEL…` (+ numbered fallbacks) | **Yes** — KOA-T33/T37: multi-number mismatch question, 31-day streak window, water from `water_logs`, today's plan from `routine_days`/`plan_day_overrides`/`workout_templates`, `koa_pauses` lookup; hostile-refusal text split out (`HOSTILE_REFUSAL`) |
| `ai-coach-memory` (417) | Coach long-term memory extraction/summary | `requireUser` + `aiGate` | AI env | No |
| `ai-log-parse` (77 + `parse.ts`) | NL log sentence → structured items | `requireUser` + `aiGate` | AI env | No |
| `ai-meal-suggest` (215) | AI meal suggestions | `requireUser` + `aiGate` | AI env | **Yes** — prompt-slots only (`DATA_SLOT` + `fillData`); no logic change |
| `ai-smart-nudges` (244) | AI habit nudges | `requireUser` + `aiGate` | AI env | **Yes** — prompt-slots only |
| `ai-weekly-review` (289) | AI weekly review | `requireUser` + `aiGate` | AI env | **Yes** — prompt-slots only |
| `body-check` (166) | AI body-fat estimate from a progress photo | `requireUser` + `aiGate` | AI env | No |
| `scan-food` (395) | AI food scan from photo/barcode context | `requireUser` + `aiGate` | AI env | No |
| `verify-purchase` (154) | Verifies App Store txn with Apple, upserts `entitlements` | None (transaction id + Apple re-verification; `appAccountToken` double-bound) | `APPLE_BUNDLE_ID/ENV/ISSUER_ID/KEY_ID/PRIVATE_KEY`, `PRODUCT_ID_PLUS/MAX` | **Yes** — AUD-47 fixed in repo (see §6.3) |
| `store-webhook` (225) | Apple Server Notifications (JWS) → upserts `entitlements` | None (JWS verification only; never trusts body) | Apple env | No |
| `delete-account` (230) | Deletes `progress-photos` objects, then `auth.admin.deleteUser` | `requireUser` | Platform service-role key (+ `ASCND_DB_*` overrides); `APPLE_SIGNIN_*` (new) | **Yes** — Apple-grant revocation (§5.2) |
| `admin-art` (124) | Admin-only upload to `community-art` + `admin_add_art` RPC | `requireUser` + `my_app_role() == admin` | Platform service-role key | No |

New read surface in `ai-coach` (KOA-T33): it now also reads `koa_pauses`,
`routine_days`, `plan_day_overrides`, `workout_templates` (in addition to the
previous `profiles`, `daily_logs`, `sleep_logs`, `workout_sessions`, `water_logs`,
`biometric_samples`) — all via the RLS-governed user client, owner-scoped
(`eq("user_id", userId)`), with bounded limits (32 daily-log rows, 400 water rows,
100 templates). No new privilege: the function runs as the caller, not service role.
**CONFIRMED, no defect found.**

### 6.2 Fresh probe results — 2026-11-28 ~00:35 CST (anon/publishable key only)

Method (W1, reused): `POST /functions/v1/<name>` with body `{}`, anon key as
`apikey` + `Authorization: Bearer`. Control: `w3-no-such-function` → 404
`{"code":"NOT_FOUND","message":"Requested function was not found"}`.
Interpretation (W1-validated): **401 `{"error":"Unauthorized"}`** = deployed —
`_shared/guard.ts:141` (`requireUser`) ran, i.e. the function exists and executes;
**404 NOT_FOUND identical to the control** = not deployed. A 401 here is *not* a
gateway block (all functions have `verify_jwt = false`).

| Function | Expected (per W1, 2026-11-21) | Observed 2026-11-28 | Verdict |
|---|---|---|---|
| `ai-coach` | 401 (deployed) | **401** `{"error":"Unauthorized"}` | DEPLOYED — unchanged |
| `ai-coach-memory` | 401 | **401** | DEPLOYED — unchanged |
| `ai-log-parse` | 401 | **401** | DEPLOYED — unchanged |
| `ai-meal-suggest` | 401 | **401** | DEPLOYED — unchanged |
| `ai-smart-nudges` | 401 | **401** | DEPLOYED — unchanged |
| `ai-weekly-review` | 401 | **401** | DEPLOYED — unchanged |
| `body-check` | 401 | **401** | DEPLOYED — unchanged |
| `delete-account` | 401 | **401** | DEPLOYED — unchanged |
| `scan-food` | 401 | **401** | DEPLOYED — unchanged |
| `admin-art` | 404 (undeployed) | **404** `NOT_FOUND` (identical to control) | **STILL UNDEPLOYED** |
| `store-webhook` | 404 (undeployed) | **404** `NOT_FOUND` (identical to control) | **STILL UNDEPLOYED** |
| `verify-purchase` | 404 (undeployed) | **404** `NOT_FOUND` (identical to control) | **STILL UNDEPLOYED** |
| `w3-no-such-function` (control) | 404 | **404** | Control valid |

**Result: 9/12 deployed, 3/12 undeployed — identical to W1 (2026-11-21). Nothing
changed in deployment status in 7 days.**

### 6.3 What the undeployed three now block (CHANGED since R2)

- **AUD-04 (HIGH) — client half now EXISTS, server half still missing.**
  The native app gained a real StoreKit client at tip: `StoreKitClient.swift`
  (107 lines, `import StoreKit`, `purchase(productID:appAccountToken:)`,
  `Transaction.currentEntitlements` / `Transaction.updates` /
  `Transaction.unfinished`) and `PurchaseController.swift` (120 lines) with
  `EdgePurchaseVerifier` calling `.verifyPurchase` (`EdgeFunction.swift:24`)
  via the shared `EdgeCaller` with body `{"transactionId": …}` and a
  fail-closed parse (`PurchaseVerification.parse` failure → verification failed,
  never treated as success). R2's "zero StoreKit code, zero `appAccountToken`,
  zero callers" is now **false in repo**. But `verify-purchase` still returns
  404 live, and `store-webhook` still 404 — so **no purchase can complete
  end-to-end today**: the client will call an endpoint that does not exist.
  The blocker moved from "no client" to "deploy the two functions + configure
  Apple env". Deploy + `APPLE_ENV` class remain UNVERIFIED (dashboard).
- **AUD-47 (MEDIUM) — FIXED in repo, still undeployed live.** `verify-purchase`
  changed between R2 tip and 11-16 (blob diff): the expired/refunded (`!ent`)
  branch now captures the upsert error and returns 500 `Could not save
  entitlement` instead of silently succeeding (`verify-purchase/index.ts:106-123`).
  The fail-open stale-paid-row path is closed in code. Live impact is nil until
  the function is deployed.
- **`admin-art` still undeployed** → no edge path uploads community art; admin
  art upload remains RN-console-only (map inventory §1.4). No native caller
  exists either (`AdminArtView.swift` exists in the app, but its upload path was
  not traced in this audit — flagged for the app worker, not verified here).

### 6.4 Edge-function findings (carried + new)

- **AUD-46 (LOW, carried):** no rate limiting on `verify-purchase` /
  `store-webhook` / `delete-account` / `admin-art` (AI functions have per-user
  daily quotas via `ai_gate`, fail-closed). Worst case is Apple-API quota burn,
  not entitlement forgery. Unchanged.
- **R2-API-02 (P2, carried, not re-verified at tip):** malformed JSON burns AI
  quota in `ai-meal-suggest` / `ai-smart-nudges`. The prompt-slot refactor does
  not touch quota-claim ordering. Carried as open.
- **R2-API-03 (P2, carried):** no idempotency/refund for failed AI calls.
  Unchanged.
- **AUD-66 (LOW, carried):** `spend_ai_tokens` / `ai_gate` / `claim_ai_call`
  directly callable by any authenticated user (self-harm only). Unchanged.
- **W3-EF-01 — CONFIRMED:** deployed-function **versions** are UNVERIFIED. The
  9 deployed functions return 401 from `requireUser`, which proves they run but
  not that they run the tip's code: `ai-coach`, `ai-meal-suggest`,
  `ai-smart-nudges`, `ai-weekly-review`, and `delete-account` all changed in
  repo since R2, and the probe cannot distinguish old from new deployed code.
  The system-check bot is supposed to diff deployed code vs repo — its output
  is itself UNVERIFIED (AUD-48 item 8; R2-OPS-01).
- **W3-EF-02 — STRONGLY SUSPECTED:** the 3 undeployed functions have *never*
  been deployed (vs deployed-then-removed) — no evidence either way in repo;
  dashboard Edge Functions list would settle it (W1 §5 item 12). UNVERIFIED.

### 6.5 RPC/table spot probes (same session, anon key)

| Probe | Observed | Verdict |
|---|---|---|
| `POST /rest/v1/rpc/community_my_reports` `{}` | **401** `42501 permission denied for function community_my_reports` | EXISTS live → migration `20261117070000` (or its `20261117170000` redefinition) has run. **Version (leaky vs fixed) UNVERIFIED** — see W3-01. |
| `POST /rest/v1/rpc/mascot_wallet` | 401 `42501` | Exists (W1: same). |
| `POST /rest/v1/rpc/current_tier` | 401 `42501` | Exists (W1: same). |
| `POST /rest/v1/rpc/exercise_popularity` | 401 `42501` | Exists (W1: same). |
| `POST /rest/v1/rpc/w3_no_such_rpc` (control) | 404 `PGRST202` | Control valid. |
| `GET /rest/v1/exercise_favorites?select=*&limit=1` | 200 `[]` | Exists (W1: same). |
| `GET /rest/v1/koa_pauses`, `koa_pause_log`, `community_reports`, `community_notifications` | 200 `[]` | All exist. |
| `GET /rest/v1/w3_no_such_table` (control) | 404 `PGRST205` | Control valid. |

New RPCs `buy_and_wear_mascot_item`, `set_mascot_worn`, `moderation_notify`,
`community_post_readable_by` all require parameters, so an anon `{}` probe is
inconclusive by construction (PGRST202 either way) and calling them would be a
mutation — **live existence UNVERIFIED** for those four.

---

## 7. Storage findings

Repo evidence only (W1 proved anon probes cannot distinguish real from nonexistent
buckets — both return identical responses — so no live bucket probe is meaningful
from outside; dashboard check §9 stands).

| Bucket | Public? | Limits (in SQL) | Upload path / policies in repo |
|---|---|---|---|
| `progress-photos` | **Private** (flipped `20260212183020:2`; created public `20260212045102:60`) | 5 MiB, JPEG only (`20260812120000_progress_photos_limits.sql:56-67`, enforced by `UPDATE storage.buckets` + a row-count guard that raises if ≠1 row matched) | Owner-scoped `storage.objects` policies: INSERT / SELECT / DELETE (`20260212045102:63-71`). Only bucket with storage policies in repo. Upload paths are server-pattern `<uid>/…` (R1). Deleted by `delete-account` (service role, paged 100/page). |
| `exercise-media` | **Public** (`20260924120000`, flipped public `20260926120000`) | 5 MiB (`20260924120000:65` update) | **No `storage.objects` policy in repo** for this bucket. No direct Swift Storage upload found (map §1.4); media URLs come via `exercise_media` rows. Public reads bypass RLS by bucket publicity. |
| `community-art` | **Public** (`20261002110000_art_library_bucket.sql:28`) | 1 MiB (`:36` update) | **No `storage.objects` policy in repo.** Upload only via `admin-art` edge function (service role + admin check) — which is **undeployed** (§6.2), so no upload path exists live today. App reads public URLs only. |

Findings:

- **W3-ST-01 — CONFIRMED:** the only `storage.objects` policies in the repo are
  the 3 for `progress-photos` (R1's "3 on storage.objects" — consistent; the
  earlier "art-library" name in R2's AUD-48 item 7 is a misnomer for
  `community-art`). Whether additional policies were added in the dashboard is
  UNVERIFIED.
- **W3-ST-02 — POTENTIAL RISK (low):** `exercise-media` and `community-art` have
  no storage policies in repo. For public buckets this is normal for *reads*,
  but any *write* path would be deny-all by default (safe direction) unless a
  dashboard policy exists. The risk is the reverse: if a dashboard policy was
  added loosely (e.g. public INSERT), the repo would not show it. Dashboard
  check §9.
- **W3-ST-03 — Carried (AUD-32, LOW):** photo row/object deletes are
  non-transactional pairs with an orphan window. Unchanged.
- **W3-ST-04 — Carried (AUD-05 context):** no per-user photo-count cap; at scale
  the bucket grows unboundedly. Plan/bucket quotas UNVERIFIED (dashboard).

---

## 8. Observability findings

| Area | Status at tip |
|---|---|
| Sentry (native crash/error) | Keys empty in committed config; fully OFF unless the Archive machine injects them (`Telemetry.swift`, R1 §4.5). Release-build liveness UNVERIFIED (AUD-48 items 13/19). No change at tip. |
| PostHog (funnel analytics) | Same as Sentry: keys from `Backend.local.xcconfig` (not committed); empty = disabled. Liveness UNVERIFIED. |
| Manual error reporting | **R2-OPS-03 (P1, launch-blocking) still open:** Sentry is crash-only; sync/AI/DB/auth/latency/HealthKit failures have no manual reporting path in code. Nothing in the 7 new migrations or the changed edge files adds reporting. |
| `system-check` bot (daily) | Workflow file **unchanged** 11-16→tip (blob SHA identical). It diffs deployed functions vs repo, migration drift, function liveness, advisors ≥ WARN, Sentry issues, PostHog (R1 §2). Its output is UNVERIFIED (AUD-48 item 17). |
| Scheduled CI | **R2-OPS-01 (P1) still open — CONFIRMED re-verified:** default branch is still `main` (API, 2026-11-28) and `main` still has **0 workflows** (API tree read). GitHub only runs `schedule` from the default branch, so `system-check` daily + E2E/a11y nightly can never have run on a schedule. Push/PR triggers on `native/ios-rewrite` still work. |
| SQL suites in CI | **AUD-13 FIXED in repo:** `.github/workflows/sql-community.yml` gained an `all-migrations` job (applies ALL migrations in filename order to one throwaway PG16 cluster; `supabase/tests/all-migrations/run.sh` + `stub.sql` are new files) and a `deno` job (`deno test` over `supabase/functions/`, pinned Deno 2.9.8 — fixes R2-OPS-07 in repo). **Whether these jobs have ever run green is UNVERIFIED** — needs Actions history (same R2-OPS-01 caveat; push/PR runs on `native/ios-rewrite` should exist, scheduled runs cannot). |
| New SQL tests at tip | `community_fk_indexes`, `community_report_guard`, `fk_indexes`, `rpc_koa_quests_dup`, `rpc_mascot_wallet`, `rpc_reward_keys`, `rpc_shop_atomic` test files added since R2 — the new migrations arrive with tests, which is the mitigation AUD-15 relies on. Whether CI runs them: see above. |
| Edge-function logs | `console.error` server-side only (R1 §4.4). No log-based alerting in repo. The Apple-revocation outcomes (`revoked` / `not_configured` / `no_token` / `failed`) are log-only (W3-AUTH-01). |
| `moderation_notify` failure swallowing | **W3-10 — POTENTIAL RISK:** every notify call sits in `EXCEPTION WHEN OTHERS THEN NULL` (`20261117070000`, 8 sites). By design a broken notification never fails a moderation decision — but the failure is then **invisible**: no log, no counter, no retry. If `moderation_notify` starts failing (e.g. a future `community_notifications` constraint change), authors/reporters silently stop hearing outcomes and nothing alerts. Suggest a `RAISE WARNING` / log line inside the exception handler (one-line change, no behavior change). |
| DB advisors / pg_cron | No `pg_cron` in repo (AUD-60). Advisors are checked by the system-check bot only (whose runs are UNVERIFIED). |

---

## 9. R1/R2 revalidation — status changes at tip `5e673df3`

Only items whose status changed or that this audit freshly evidenced are listed.
Everything else in R1 §9 / R2 §A–B stands as written.

| ID | R2 verdict | Status at tip `5e673df3` (this audit) |
|---|---|---|
| AUD-01 (CRITICAL) | CONFIRMED — backups/PITR unverified | **Still open, still the top item.** No backup/PITR evidence anywhere in repo at tip; no restore drill. UNVERIFIED (dashboard, §10 item 1). The shipped privacy text asserting 30-day backup persistence (`legal-content.json:485`, R2-OPS-09) still has zero operational evidence behind it. |
| AUD-02 (HIGH) | CONFIRMED — invented `ch:`/`w:` keys mint 800 coins + ~800 XP/day | **Still open — CONFIRMED.** `reward_amount_for` (`20261029130000_koa_quests_v2.sql:33-91`) is byte-identical since R2; `claim_quest_reward`'s rewrite changes only the duplicate path. The beta-gate decision (validate server-side vs formally accept) is still pending. |
| AUD-03 (HIGH) | CONFIRMED — achievements self-granted by INSERT | **Still open — CONFIRMED.** No server grant path added; `awards` table/policies untouched. |
| AUD-04 (HIGH) | CONFIRMED — no purchase flow in native app | **Changed: client half now EXISTS in repo** (StoreKit client + `EdgePurchaseVerifier` → `verify-purchase`, §6.3). **Server half still missing live** (`verify-purchase` + `store-webhook` 404). Beta-gate B-2/B-6 context changed accordingly: the remaining work is deploy + Apple env + sandbox E2E, not building the client. |
| AUD-06 (HIGH) / R2-SYNC-01 | CONFIRMED — sign-out destroys unsent offline records; unscoped delete | **Not re-verified at tip** (client code, out of W3's Supabase scope). Carried as open per beta-gate B-4. Note: the map survey (11-16) describes a *parking* behavior in `SyncWorker.signOut()` — this contradicts R2's `dropAllOnSignOut` reading and needs the app worker to reconcile; W3 does not adjudicate it. |
| AUD-07 (HIGH) | PARTIALLY_CONFIRMED — no staging, manual deploys, no rollback | **Still open.** Single project ref; no staging evidence; no rollback procedure. Deploys still manual (`supabase db push` / `functions deploy` per docs). |
| AUD-12 (MEDIUM) | PARTIALLY_CONFIRMED — schema-in-repo ≠ schema-in-production | **Narrowed:** `20261112150000` + `20261116120000` proven applied live (W1); `20261117070000` proven applied live (this audit, §6.5). The other 6 new migrations + the 11-12 FK-index/REVOKE migrations remain **UNVERIFIED live**. Stale "CHƯA DEPLOY" headers still uncorrected in repo. |
| AUD-13 (MEDIUM) | PARTIALLY_CONFIRMED — no CI job applies all migrations together | **FIXED in repo** — `all-migrations` job added to `sql-community.yml` (§8). Runs UNVERIFIED. |
| AUD-14 (HIGH) | CONFIRMED (narrowed: buy path UI-dead, RPC live) | **Mitigated in repo** — `20261112140000` revokes `buy_streak_freeze` from `authenticated` (beta-gate B-2 option B). Live application UNVERIFIED. |
| AUD-16 (MEDIUM) | CONFIRMED — duplicate/redundant indexes | **Largely FIXED in repo** — `20261124120000` drops 15 duplicate pairs covering all 7 exact-duplicate groups R2 catalogued (W3-MIG-03 caveat on DESC-kept variants). Live application UNVERIFIED; verify with `pg_stat_user_indexes` before treating as closed. |
| AUD-41 (LOW) | 8 trigger functions without GRANT/REVOKE | **Partially mitigated in repo** — 2 pinned to `search_path = ''` (§4). |
| AUD-43 (LOW) | `search_path = public` everywhere | **Partially mitigated** — same 2 pins; `community_fold` deliberately unpinned with a documented reason (W3-05). |
| AUD-47 (MEDIUM) | `verify-purchase` fail-open on expired/refunded path | **FIXED in repo** (§6.3). Live impact nil until deployed. Beta-gate B-6 can be closed on the code side; deployment still pending. |
| AUD-64 (LOW) | Duplicate claims return full amount | **FIXED in repo** — `20261119120000` returns 0 for duplicates (KOA-T01). |
| AUD-65 (LOW) | `buy_mascot_item` already-owned check outside the lock → raw 23505 | **FIXED in repo** — `20261120120000` (KOA-T18/T19). |
| R2-DB-01 (P3) | Block-graph oracle | **Still open.** |
| R2-ECO-03 (P3) | `claim_community_challenge` has no deadline check | **Still open — CONFIRMED** in the rewritten function (`20261120130100` has no `ends_on` check). |
| R2-ECO-04 (P3) | Challenge progress counts pre-join sessions | **Still open** (function `community_challenge_progress` untouched). |
| R2-ECO-05 (P3) | Challenge ceiling sum includes `x:` | **FIXED in repo** — `20261120130100`. |
| R2-ECO-13 (P3) | Orphaned `d:*:streak` namespace still minting | **Still open** (no caller, server still pays; `reward_amount_for` unchanged). |
| R2-OPS-01 (P1) | Scheduled CI never runs (default `main` has no workflows) | **Still open — CONFIRMED re-verified** (§8). |
| R2-OPS-03 (P1) | No manual error reporting | **Still open.** |
| R2-OPS-07 (P2) | Edge-function tests: one Deno test, no runner | **FIXED in repo** — `deno` job added (§8). Runs UNVERIFIED. |
| R2-OPS-09 (P2) | Privacy text asserts 30-day backup persistence without evidence | **Still open** (see AUD-01). |
| R2-OPS-11 (P3) | Deploy records exist only as prose (with duplicates) | **Still open.** No structured deploy log added at tip. |

### New W3 findings (summary — detail in the sections above)

| ID | Finding | Class |
|---|---|---|
| W3-01 | `community_my_reports` excerpt oracle introduced 11-17 07:00, fixed 11-17 17:00 in repo; **live version UNVERIFIED** | CONFIRMED (repo) / UNVERIFIED (live) |
| W3-02 | `moderation_notify` system notifications are un-mutable by recipients, by design | INFO |
| W3-03 | AUD-02 core (invented reward keys) unchanged by the duplicate-marker rewrite | CONFIRMED |
| W3-04 | `claim_community_challenge` still has no deadline check after its rewrite | CONFIRMED |
| W3-05 | `community_fold` deliberately left without `search_path` pin (inlining); reason documented and sound (only `pg_catalog` builtins) | POTENTIAL RISK (accepted-with-reason in repo) |
| W3-06 | `set_mascot_worn` / `buy_and_wear_mascot_item` trust the client's slot-conflict list; stale client state can leave two items equipped in one slot until the next wear/buy of that slot | POTENTIAL RISK |
| W3-10 | `moderation_notify` failures swallowed silently (8× `EXCEPTION WHEN OTHERS THEN NULL`, no log) | POTENTIAL RISK |
| W3-12 | `mascot_wallet()` `claimed` set narrowed; safe only if no client reads `claimed` for `clean:`/`buy:`/`freeze:`/`cc:` — not verified against Swift at tip | POTENTIAL RISK |
| W3-13 | Scheduled CI still dead: default branch `main`, 0 workflows on `main` (re-verified via API) | CONFIRMED |
| W3-AUTH-01 | Apple-grant revocation fail-open on identity-lookup failure / unconfigured secrets; log-only trace, no retry | POTENTIAL RISK (low) |
| W3-AUTH-02 | `delete-account` accepts arbitrary client-supplied Apple token material (revocation only; no identity confusion) | POTENTIAL RISK (very low) |
| W3-DB-03 | Live application of 6 of the 7 new migrations UNVERIFIED (no probeable surface) | UNVERIFIED |
| W3-EF-01 | Deployed versions of the 9 live functions UNVERIFIED (probe proves liveness, not version) | UNVERIFIED |
| W3-MIG-03 | Dedupe migration keeps DESC variants on a "B-tree scans both ways" claim; planner edge cases possible | POTENTIAL RISK (negligible) |

---

## 10. Dashboard-only checklist (for Kiệt — nothing here was verifiable by W3)

Same checklist as W1 §6, updated for tip `5e673df3`. Dashboard:
`https://supabase.com/dashboard/project/guqmbqtgxqleuwajvwvg`

1. **Backups/PITR (AUD-01, R2-OPS-09 — most urgent):** Database → Backups. Record:
   PITR on/off, retention days, last backup time. Restore to a **throwaway** project,
   record RPO/RTO + row counts + app read smoke test. Diff against
   `legal-content.json:485` ("backup có thể giữ tới 30 ngày") and correct the text
   or the setting — never restore over production.
2. **Applied migrations (W3-DB-03, AUD-12):** SQL Editor:
   `SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 15;`
   Expect the 7 versions `20261117070000`, `20261117170000`, `20261119120000`,
   `20261120120000`, `20261120130000`, `20261120130100`, `20261124120000` on top,
   plus the 11-12 five (`…12130000`, `…12130100`, `…12140000`, `…12150000`,
   `20261116120000`).
3. **W3-01 version check (do this before anything else in §10):** SQL Editor:
   `SELECT pg_get_functiondef('public.community_my_reports()'::regprocedure);`
   If the body contains `community_report_target_readable`, the fixed
   `20261117170000` version is live. If it contains the bare `left(p.caption, 160)`
   excerpt without that guard, the leaky `20261117070000` version is live and
   reporting on unreadable content must be treated as an active oracle until the
   newer migration is applied.
4. **FK indexes + freeze REVOKE (W1 D2–D3):**
   `SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname IN
   ('idx_exercises_user_id', …);`
   `SELECT has_function_privilege('authenticated','public.buy_streak_freeze(uuid)','execute'),
   has_function_privilege('authenticated','public.buy_streak_freeze()','execute');`
   (both must be false).
5. **RLS/policies live (AUD-38/40/41/43, R2-DB-01):** second-user probes (read-only,
   disposable test account); `SELECT has_schema_privilege('anon','CREATE','public')`
   and the same for `authenticated`; `POST /rest/v1/rpc/update_updated_at_column`
   as anon + authenticated; policies on `storage.objects` for the 3 buckets.
6. **Edge Functions (W3-EF-01/02, AUD-04/47):** Edge Functions list + deployed
   versions; confirm `admin-art`, `store-webhook`, `verify-purchase` absent (or
   present with a version, if deployed since 2026-11-28); secret presence, names
   only — AI: `ASCND_AI_URL`, `ASCND_AI_KEY`; Apple: `APPLE_BUNDLE_ID`,
   `APPLE_ENV` (**record production vs sandbox**), `APPLE_ISSUER_ID`,
   `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `PRODUCT_ID_PLUS`, `PRODUCT_ID_MAX`;
   Sign-in-with-Apple (new): `APPLE_SIGNIN_TEAM_ID`, `APPLE_SIGNIN_KEY_ID`,
   `APPLE_SIGNIN_PRIVATE_KEY`, `APPLE_SIGNIN_CLIENT_ID`. Never record values.
7. **Dedupe migration live (AUD-16):** `SELECT indexname FROM pg_indexes WHERE
   schemaname='public' AND indexname IN ('daily_logs_user_date_unique',
   'idx_daily_logs_user_date', 'awards_user_key_unique', …);` — the 15 dropped
   names should be gone *only if* the keep-indexes exist; also check
   `pg_stat_user_indexes` before treating AUD-16 as closed.
8. **Auth providers:** Authentication → Providers: Apple enabled? Service/Bundle
   ID match? Google enabled? Client ID/Secret filled? URL Configuration: Site URL
   + Redirect URLs include the `ascnd://` / PKCE flow.
9. **Storage:** Storage → confirm `progress-photos` (private), `exercise-media`
   (public), `community-art` (public); open each bucket's Policies and compare
   with §7 (only `progress-photos` has policies in repo).
10. **Plan/pooler/row-cap + Realtime + staging:** plan, pooler mode/limits,
    effective `PGRST_DB_MAX_ROWS`, region; Database → Replication (which tables
    are published); `supabase projects list` for a second (staging) project.
11. **Telemetry:** Sentry events for the release version; PostHog events from
    release builds; dSYM upload success for the release version.
12. **Data checks:** `SELECT count(*), sum(tokens_remaining) FROM ai_credits;`
    (AUD-23 — would change the "no top-up path" finding if manual top-ups exist);
    `SELECT count(*)` for `weekly_reviews`, `habit_nudges`, `scan_history`,
    `wearable_sources` (AUD-11).
13. **CI history (R2-OPS-01):** Actions history for `system-check`, `ios-e2e`,
    `ios-a11y` with `event=schedule` — expect zero; and push/PR runs of the new
    `all-migrations` + `deno` jobs on `native/ios-rewrite` — expect present and
    green, or file the failure.

## 11. Bottom line

- **Production is up and consistent with the repo at the probeable surface:**
  Auth 200 (GoTrue v2.199.0), 9/12 edge functions deployed (same 9 as 11-21),
  all spot-checked tables/RPCs present, no table missing.
- **The purchase path is still cut, but the blocker moved:** the native StoreKit
  client + `verify-purchase` caller now exist in repo (AUD-04 client half done);
  `verify-purchase` + `store-webhook` + `admin-art` are still 404 live. Deploy
  (plus Apple env + sandbox E2E) is now the single gating step.
- **The repo got materially safer in 11-17→11-24:** duplicate-claim minting (AUD-64),
  the shop race (AUD-65), the challenge-ceiling inconsistency (R2-ECO-05), the
  `verify-purchase` fail-open (AUD-47), the duplicate indexes (AUD-16), the
  all-migrations CI gap (AUD-13), the Deno-test gap (R2-OPS-07), and a same-day
  privacy-oracle introduction + fix (W3-01) — all fixed in repo. **None of these
  fixes is proven live** except `community_my_reports`' existence; the deployed
  versions of the 9 live functions are UNVERIFIED.
- **Still open and still the top risks:** backups/PITR + the 30-day privacy claim
  (AUD-01/R2-OPS-09, dashboard-only, no evidence anywhere); invented reward keys
  (AUD-02, decision still pending); achievements self-granted (AUD-03); no staging
  / manual deploys / no rollback (AUD-07); scheduled CI dead (R2-OPS-01,
  re-verified: default `main`, 0 workflows on `main`); no manual error reporting
  (R2-OPS-03); and the 20 production checks (AUD-48) still at 0/20 closed.
- **Single most urgent live question for Kiệt:** §10 item 3 — which version of
  `community_my_reports()` is deployed. It is a one-query check and it decides
  whether the 11-17 report-excerpt oracle is live right now.

*End of W3 report. All findings cite migration id / file path + line / function
name in the sections above. No secrets, keys, passwords, or tokens are recorded
in this file.*
