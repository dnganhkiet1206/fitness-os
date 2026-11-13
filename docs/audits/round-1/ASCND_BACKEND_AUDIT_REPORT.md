# ASCND — Full Backend & Supabase Architecture Audit

**Repository:** `github.com/dnganhkiet1206/fitness-os` (public)
**Branch audited:** `native/ios-rewrite`
**Tip SHA:** `b19e9822d46ea4ed85e0189c587711d6660210b2` (Merge PR #868, 2026-11-10 13:22 CST)
**Audit date:** 2026-11-11/12
**Standard applied:** the native iOS app (`apps/ios/`, SwiftUI + ASCNDKit) is the source of truth per the owner's decision of 2026-11-11. React Native (`native/`) code and docs are legacy context only and are labeled as such wherever cited.

## Method and limitations — read this first

This audit is **repository inspection only**. No Supabase credentials, service keys, or dashboard access existed on the audit machine, and the GitHub PAT on the VM expired 2026-10-30 (all authenticated calls return 401; only public reads were used). Every finding below is grounded in migrations, SQL, Edge Function code, Swift client code, configuration, or docs in the repository — **not** in live database verification. Anything that can only be confirmed against the live project (applied-migration state, RLS behavior at runtime, backups/PITR, plan/pooler settings, Auth dashboard settings, deployed function versions, telemetry liveness) is marked **UNVERIFIED** with the exact check that would confirm it.

**Verification actually performed (Phase 9, non-destructive, read-only):**

| Check | Result |
|---|---|
| Community SQL suite (`supabase/tests/community/run.sh`, 26 test files) on a throwaway PG16 cluster | **PASS** (exit 0), incl. seed idempotency check |
| Core SQL suite (`supabase/tests/core/run.sh`, 8 test files) on a throwaway PG16 cluster | **PASS** (exit 0) |
| All 88 migrations applied in filename order to a fresh PG16 cluster; catalog extracted and diffed against parser reconstruction | **0 failures**; catalog matched on all 67 tables/columns |
| Migration ordering / duplicate version prefixes | Pass — 88 files, no duplicates |
| Destructive DDL scan (`DROP TABLE/COLUMN`, `TRUNCATE`, unscoped `DELETE`) | None found; `DELETE`s are scoped trigger/function bodies only |
| Secret-value scan (filenames/counts only, values never read) | No service-role keys, private keys, `ghp_` tokens, or Google API keys in tree |
| Tracked credential files | Only `native/.env.example` |
| Swift tests (276 `*Test*.swift` files) | **Skipped** — no Swift toolchain on the audit VM |
| RN check gate (`native/tools/check.mjs`) | Skipped — dependencies not installed; legacy surface |
| Mutation testing (`b_reverse.py`/`reverse.py`) | Skipped — too long for the audit window; CI runs it, results unverified here |
| Supabase advisors | Could not perform — no live DB, no Supabase CLI |
| Dependency vulnerability audit | Could not perform — `npm audit` blocked by network policy (403); no SPM audit tool available |

**Classification key used throughout:** IMPLEMENTED / PARTIALLY IMPLEMENTED / NOT IMPLEMENTED / UNVERIFIED.
**Confidence key:** HIGH = directly observed in code/schema or on the verification cluster; MEDIUM = observed pattern plus one inference step; LOW = needs a live check.

No source code, migration, configuration, secret, or Supabase setting was modified. No secret values are printed in this report.

---

## 1. Executive Summary

ASCND's backend is a **Supabase-centered architecture executed with unusual discipline in the places the team chose to harden, and with deliberate client-trust trade-offs everywhere else** — trade-offs that are wider than their own documentation admits, and that stop being coherent the moment rewards, status, or money depend on them.

**What is genuinely good (evidence-backed):**

- **Row Level Security is enabled on all 67 tables**, with 124 table policies (+ 3 on `storage.objects`) that were verified by in-order replay of all 88 migrations. No table lacks RLS; no view exists to bypass it. The one zero-policy table (`moderation_audit_log`) is deny-all by design.
- **The coin economy is server-authoritative and race-correct**: no client write path to the ledger, server-side pricing, per-user advisory locks, idempotency keys, and a daily ceiling — with a documented history of measured fixes (the original mint-money hole, the `FOR UPDATE`-with-aggregate bug).
- **Purchase/entitlement verification trusts nothing from the client**: `verify-purchase` and `store-webhook` re-ask Apple's App Store Server API, bind `appAccountToken` twice, default to production-only, and resolve current subscription state so late notifications cannot downgrade.
- **The offline outbox is the strongest subsystem in the codebase**: durable-before-ack GRDB/SQLite queue, single-lane in-order replay, idempotency keys, per-account fencing, and JWT-aware retry classification.
- **The SQL test suites are real and they pass**: both suites (34 test files) were executed by this audit on throwaway PG16 clusters at the audited tip, and all 88 migrations apply cleanly in order. Mutation testing (`b_reverse.py`) exists in CI.
- **No secrets are committed.** The secret scan found no service-role keys, private keys, or tokens in the tree or in the history sampled; the one legacy anon JWT in old history is public-by-design material whose rotation is unverified.

**What is wrong (the honest list):**

1. **Recovery is unverified and the operational posture is fragile.** No backup/PITR evidence exists anywhere in the repo, there is no staging project, no migration rollback strategy, no monitoring/alerting, and deploys are manual pushes straight to the single production project. A bad migration or manual error may have no recovery path. This is the audit's only CRITICAL finding.
2. **Gamification truth is client-asserted.** Reward completion is never verified server-side, and the `ch:`/`w:` reward-key namespaces accept *invented* keys, so any authenticated user can mint the 800-coin/day ceiling plus matching XP with plain RPC calls and no activity. Achievements are self-granted by direct INSERT. The one server-verified reward path (community challenges) verifies against workout rows the client authors freely. The team documented this trade-off for quests; the unbounded-keyspace part is worse than documented.
3. **The monetization path is server-complete but client-absent.** There is zero StoreKit code, zero `appAccountToken`, and zero callers of `verify-purchase` in the native app — subscriptions cannot be sold end-to-end. Worse, the streak-freeze consumable *can* be bought (150 coins) but can never be spent: no native caller of `use_streak_freeze` exists. A paid item that does nothing is a trust and refund problem.
4. **Global-scale reads do not scale.** Community search RPCs are full-table scans with per-row text folding (`find_posts` folds 4×/row and never got the one-fold fix); the exercise fetch is unbounded at ~880 rows and sits near the PostgREST row cap; the following feed re-fetches the entire followee list per page into a URL `IN()` filter; 22 foreign keys lack supporting indexes; no search index (GIN/trigram/FTS) exists anywhere. Comfortable at 1k–10k actives; visible degradation at 100k; not ready at 1M.
5. **Schema and product have dead weight and drift risk.** Four tables are dead or legacy-only, the admin/moderation RPC surface has no native caller, denormalized aggregates (`daily_logs`, meal totals, post counters) have no reconciliation, business rules are duplicated across Swift/SQL/Edge Functions and held together only by drift-guard scripts whose CI enforcement is unverified, and two Koa migrations are marked undeployed while native code already reads those tables.
6. **Offline is partial in ways that lose data.** Signing out destroys unsent offline records (owner decision #241 still pending). State intents (supplement/grocery ticks) are memory-only. There is no background outbox drain. Multi-device conflicts are silent last-write-wins except for workout revisions.

**Overall assessment:** the architecture — one Supabase project, PostgREST + RPCs + Edge Functions, GRDB outbox, HealthKit import — is **suitable for ASCND and needs no migration or rewrite**. The problems are in *usage patterns and operational gaps*, not in the platform choice. The codebase shows a team that measures, documents trade-offs, and fixes measured holes; the remaining work is mostly finishing what was started (deploy the Koa migrations or gate the reads, port the streak guard, build the purchase flow, bound the reads, verify the backups) plus a small number of genuine hardening items (reward-key validation, award-grant RPC, search indexes, staging + rollback procedure).

**Finding counts (deduplicated across phases):** 1 CRITICAL, 11 HIGH, 34 MEDIUM, 23 LOW, 19 INFO. The full register is §9.

---

## 2. Actual Architecture Map

Verified implementation at tip `b19e9822`. (RN-era components are legacy context only.)

```
iPhone — native app (SwiftUI, apps/ios, 814 Swift files)
├── ASCND/Features/* — UI (16 features)
├── ASCNDKit/ASCNDCore — pure domain logic (no third-party deps):
│     readiness engine, streaks, awards evaluation, workout/meal models,
│     HealthKit import (HealthSync), DailyLog.recompute, outbox (SyncWorker)
├── ASCNDBackend — the ONLY Supabase talker:
│     ├── PostgREST .from() — direct table access to 50 tables
│     ├── RPC .rpc() — 29 functions called from Swift
│     ├── Edge Functions — 9 of 12 invoked from the client
│     └── Storage — progress-photos (private), community-art (read)
├── ASCNDStore — GRDB/SQLite: outbox, outbox_dead, workout_day, read_cache
├── HealthKit — snapshot/import → workout_sessions / sleep_logs /
│     biometric_samples / weight_logs / water_logs / daily_logs
└── Keychain session · Sentry/PostHog (keys EMPTY in committed config)
                        │
                        │  HTTPS + publishable key + user JWT (RLS enforced)
                        ▼
Supabase project guqmbqtgxqleuwajvwvg (dashboard-managed config — UNVERIFIED)
├── Postgres (PG16): 67 tables, 94 function signatures (88 SECURITY DEFINER),
│   52 triggers, 124 policies (+3 storage), 158 indexes, 3 buckets —
│   all defined by 88 migrations (11,277 lines), forward-only, no down migrations
├── Auth: email/password, Apple, Google · handle_new_user trigger creates profiles row
├── Storage: progress-photos (private, 5 MiB, JPEG) · exercise-media (public)
│   · community-art (public, admin-only upload via admin-art)
├── Edge Functions (Deno, 12 + 9 shared modules, ALL verify_jwt = false):
│     ├── 8 AI functions → Gemini/OpenAI-compatible gateway (ASCND_AI_* secrets,
│     │     provider failover, per-user daily quotas via ai_gate, token metering)
│     ├── verify-purchase + store-webhook → Apple App Store Server API → entitlements
│     ├── delete-account (service role, cascade) · admin-art (role-gated upload)
│     └── Auth re-checked in-handler via _shared/guard.ts requireUser
├── Realtime: NOT USED (zero subscriptions in the native client)
├── pg_cron / scheduled jobs: NONE in repo (UNVERIFIED in dashboard)
└── Backups / PITR / plan / pooler: UNVERIFIED (nothing in repo)

Legacy, co-resident (NOT the standard): native/ RN app + web-era code talk to
the SAME project via supabase-js with the same publishable key. Several tables
and 21 RPCs are RN-only. Schema changes must not break RN queries without an
owner decision — the RN app must be assumed live against this database until
the owner retires it.

CI / operations (repo-verified):
├── .github/workflows: ios.yml, quality-gate.yml, sql-community.yml (SQL suites
│   + mutation testing), system-check.yml (daily + on-push, read-only: deployed
│   functions vs repo, migration drift, function liveness, advisors ≥ WARN,
│   Sentry issues, PostHog), ios-a11y/analysis/e2e
├── supabase/tests: community/ (26 test files) + core/ (8 test files), each
│   runnable on a throwaway PG16 cluster via run.sh; mutation testing via
│   b_reverse.py / reverse.py
├── native/tools/*.mjs: ~15+ drift-guard checks asserting cross-layer agreement
│   (economy prices, readiness, health-sync conflict targets, AI bounds, ...)
│   — CI enforcement UNVERIFIED (see AUD-24)
└── Deploys: MANUAL (supabase db push / functions deploy per docs). No CI job
    deploys Supabase. No staging project in repo. No rollback procedure.
```

**Data-flow summary.** The client is the writer of record for almost all personal data: it computes readiness, streaks, awards, meal totals, and workout volume, then writes via PostgREST (direct table access under RLS) or the durable outbox. The server is the writer of record for exactly three things: money-like state (coin ledger via RPCs), entitlements (via Edge Functions + Apple), and community integrity (triggers + RPCs + moderation). AI functions read client-written aggregates as ground truth and return advisory output; only `coach_memory` and `body_checks` persist AI output, and only the former is server-gated. There is no server-side background processing, no caching layer, and no Realtime; freshness comes from foreground refresh, pull-to-refresh, and one 30-minute-minimum background notification check.

---
## 3. Database Audit

**Reconstruction method:** all 88 migrations read and applied in filename order to a throwaway PG16 cluster by this audit (0 failures); the resulting catalog was diffed against an independent parser reconstruction — exact match on all 67 tables and 595 columns. Counts below are catalog-verified. Live production state is UNVERIFIED (see AUD-12).

### 3.1 Schema-wide assessment

| Aspect | Assessment |
|---|---|
| Naming | Consistent `snake_case`, plural tables, `*_id` FKs, `*_at` timestamps, unit suffixes (`*_ml/_kg/_cm/_min`). Domain prefixes good (`community_*` 21 tables, `meal_*`, `koa_*`). Two SQL style eras (2026-02 uppercase types vs later lowercase) — cosmetic only. |
| Primary keys | Every table has a PK. 44 surrogate `uuid DEFAULT gen_random_uuid()`; 13 natural/composite (`user_id`, `(user_id, date)`, `(post_id, user_id)`, text keys for price tables, `bigint IDENTITY` for the audit log). No extension needed on PG13+. |
| Foreign keys | 100+ FKs. Every user-owned table ultimately FKs to `auth.users(id) ON DELETE CASCADE` — account deletion hard-cascades through the whole user graph. `ON DELETE`: CASCADE everywhere except 7× `SET NULL` and 1× `RESTRICT` (`community_posts.art_id`). No `ON UPDATE` actions (safe: immutable PKs). **22 FKs lack a supporting index (AUD-10).** |
| Unique constraints | 30+ uniques. Idempotency is taken seriously where it matters: `UNIQUE(user_id, ref_key)` on the coin ledger, partial unique on freeze `used_on`, `UNIQUE(user_id, external_id)` for HealthKit dedup, one-like/save/try per user, one thread per pair. Duplicate/near-duplicate uniques exist on `daily_logs`, `awards`, `weekly_reviews` (AUD-16). |
| CHECK constraints | 83, concentrated in 2026-07+ migrations (length limits, enums-as-CHECK, ranges, cross-column invariants). Nearly absent in the 2026-02 core schema: free-TEXT enums, unbounded numerics, unenforced temporal rules (AUD-22). |
| Enums / views | **Zero** `CREATE TYPE` and **zero** views/materialized views. All aggregation is client-side, edge-side, or denormalized columns. |
| Indexes | 158 total (72 explicit `CREATE INDEX`). Good coverage for community + `(user_id, time)` core-log patterns. Gaps: 22 unindexed FKs (AUD-10), no index for exercise/food orderings, reversed column order on the useful-feed index (AUD-28), duplicate/ASC-DESC pairs on 9 tables (AUD-16). **No GIN/GiST/FTS/trigram index exists; no index on any JSONB column** (AUD-09). |
| Data types | `NUMERIC` unbounded for all measures (no precision/scale except `body_checks.numeric(4,1)`); `INTEGER` counts/coins; `BIGINT` AI tokens; `TEXT` for everything textual incl. times-as-text; `BOOLEAN` with inconsistent defaults; `text[]` tags/cues; `JSONB` in 9 columns across 8 tables. `DATE` vs `TIMESTAMPTZ` principled, except `water_logs` carrying both `date` and `logged_at`. |
| JSONB usage | 9 columns. The critical ones are `workout_sessions.sets` and `workout_templates.exercises` — the entire set/program model lives in unvalidated JSONB with no FK to `exercises` (AUD-08). `community_posts.payload` is RPC-validated; `daily_logs` tokens are structured strings. No JSONB column is indexed. |
| Triggers | 52 distinct (51 public + 1 on `auth.users`): 18 `updated_at` maintainers covering only 18 of 28 `updated_at` columns (AUD-17), 1 signup trigger, ~33 community/economy behavior triggers (counters, notifications, guards, auto-hide, usefulness, audit immutability, coach-memory trim). |
| Functions | 94 signatures (93 names). **88 SECURITY DEFINER**, 6 invoker-rights. One live overload pair (`buy_streak_freeze()`/`(UUID)`). 36 functions never referenced by client code (trigger bodies + SQL-internal helpers); 21 referenced only by legacy RN; 29 by native Swift; 8 by edge functions. |
| RLS (presence) | ENABLED on all 67 tables. 124 policies on tables + 3 on `storage.objects`. `moderation_audit_log` has RLS on with zero policies (deny-all by design). Policy *correctness* is §4. |
| Retention / audit / soft-delete | **NOT IMPLEMENTED** as a schema concern. No `deleted_at`/`is_deleted`; no retention/archival/partitioning; no `pg_cron` cleanup. Only audit trail is `moderation_audit_log` (AUD-30, AUD-31). |
| Migration consistency | 88 forward-only files, no duplicate version prefixes, apply cleanly in order (verified). **No down migrations, no rollback procedure** (AUD-07). The `*_community_*` filename convention is load-bearing for the split test suites (AUD-13). Two Koa migrations marked CHƯA DEPLOY while native code reads the tables (AUD-12). |
| Historical retention | None. `ai_messages`, `biometric_samples`, `mascot_transactions`, `community_notifications`, `scan_history` grow unboundedly (AUD-30). Only retention control in the schema: `coach_memory` trimmed to 40/user by trigger. |

### 3.2 Table inventory by domain (67 tables, 595 columns)

RLS is ENABLED on every table. "Policies" counts final policies after in-order replay. Full per-column inventory is in the phase working papers (`hidden_files/backend-audit-work/phase1-2-discovery-schema.md`).

| Domain | Tables | Ownership / notes |
|---|---|---|
| Identity & profiles | `profiles` (25 cols, 1 pol.), `community_profiles` (9, 3), `app_roles` (4, 1) | Three identity tables, no single user aggregate (AUD-18). `profiles.id` surrogate is never referenced by any FK. Display name + mascot duplicated across `profiles`/`community_profiles`. |
| Exercise library | `exercises` (19, 4), `exercise_media` (10, 1), `exercise_media_content` (7, 1), `exercise_guide_content` (8, 1) | Shared (`user_id IS NULL`) + custom rows in one table. No FK from sets/programs into `exercises` (AUD-08). No search/order indexes (AUD-09). |
| Workout programs | `workout_templates` (8, 1), `routine_days` (7, 1), `day_overrides` (6, 1) | Programs are JSONB (`exercises` array); no relational program/set model (AUD-08). |
| Workout sessions & sets | `workout_sessions` (15, 1) | Sets are JSONB; `volume_load`/`pr_detected` client-computed and trusted; no CHECKs (AUD-08, AUD-22). HealthKit sessions carry empty sets, `volume_load = 0` by convention (comment, not constraint). |
| Weight / body | `weight_logs` (6, 1), `body_measurements` (18, 1), `body_checks` (10, 1) | One row per user/day (unique). `profiles.weight_kg` is a denormalized copy synced best-effort (AUD-35). `body_checks` has CHECKs mirroring AI clamps but is client-writable (AUD-36). |
| Sleep | `sleep_logs` (10, 1) | Provenance-aware (`external_id`, `source`); dedup windows enforced client-side + unique backstop. |
| Nutrition | `food_items` (25, 4), `meal_entries` (12, 1), `meal_entry_items` (9, 1), `meal_plans` (8, 1), `meal_plan_items` (9, 1), `grocery_items` (9, 1), `water_logs` (6, 1), `supplements` (8, 1), `supplement_intake_logs` (6, 1) | Meal totals denormalized on `meal_entries` with no sum check (AUD-19, AUD-34). `meal_type` free text in DB. `water_logs` has both `date` and `logged_at`. |
| Daily aggregates | `daily_logs` (25, 1) | Client-computed readiness + aggregates; token-based explain; OCC via `updated_at`. Three identical `(user_id, date)` indexes (AUD-16). No server validation (AUD-20). |
| Health integration | `biometric_samples` (16, 1), `wearable_sources` (legacy-only) | SDNN/RMSSD column split; `external_id` dedup. `wearable_sources` is legacy-RN-only, zero native use (AUD-11). |
| AI Coach | `ai_conversations` (5, 1), `ai_messages` (5, 1), `coach_memory` (7, 2), `ai_usage` (6, 1), `ai_credits` (3, 1) | `coach_memory` is server-write-only (strongest AI design). `ai_credits` has no top-up path (AUD-23). Messages unbounded, no retention. |
| XP / achievements | `awards` (11, 3), `weekly_challenges` (10, 1), `weekly_reviews` (dead) | Two badge systems: client-granted `awards` (AUD-03) vs server-computed `community_user_badges`. `weekly_reviews` referenced by no code (AUD-11). |
| Coins / rewards | `mascot_transactions` (8, 1), `mascot_inventory` (5, 2), `reward_prices` (4, 1), `shop_prices` (6, 1), `streak_freezes` (6, 1), `koa_pauses` + `koa_pause_log` (undeployed) | Best-engineered domain: append-only ledger, server pricing, advisory locks, idempotency. Reward *earning* unverified (AUD-02). |
| Purchases | `entitlements` (6, 1) | SELECT-only for owners; no client write path; latest-state only, no purchase history (AUD-04). |
| Community (21) | `community_posts/comments/likes/saves/follows/blocks/mutes/reports/hides/notifications/settings/challenges/challenge_members/post_tries/comment_mentions/review_requests/restrictions/profiles/art` | Most rigorously constrained domain: CHECKs, guards, triggers, audited admin RPCs. Counters denormalized via triggers (AUD-19). |
| Direct messages | `dm_threads` (8, 1), `dm_messages` (7, 1) | Participant-scoped RLS; RPC-mediated writes with rate limits. Sender delete cascades messages to the counterparty (design choice, AUD-45). |
| Moderation | `moderation_audit_log` (8, 0 policies) | Append-only via immutability triggers; deny-all; read only via `admin_audit`. |
| Preferences | Settings scattered across `profiles`, `community_settings` (13, 3), `meal_plans`, `supplements` | No single settings aggregate (AUD-18). |
| Dead / legacy-only | `scan_history`, `weekly_reviews`, `habit_nudges`, `wearable_sources` | Referenced by no native code and no edge function (AUD-11). `ai-weekly-review` never writes `weekly_reviews`. |

### 3.3 Relationships and integrity problems (summary)

- **Ownership model is consistent**: every user-owned table FKs (directly or via a parent) to `auth.users` with `ON DELETE CASCADE`, verified by script — account deletion hard-cascades through the whole user graph, with the deliberate exception of `moderation_audit_log.actor_id` (no FK, audit retention).
- **FK-less user references dangle on delete** (AUD-26): `dm_threads.started_by`/`last_sender`, `community_restrictions.created_by`, `community_review_requests.decided_by`, `app_roles.granted_by`, `moderation_audit_log.actor_id`/`target_id`, and polymorphic `community_posts.source_id` (RPC-enforced only, UNIQUE `(author_id, source_id)` with NULL-tolerant semantics).
- **Duplicated/conflicting sources of truth** (AUD-19, AUD-24): `daily_logs` aggregates vs source tables; meal totals vs item sums; `volume_load`/`pr_detected` vs `sets` JSONB; `profiles.weight_kg` vs `weight_logs`; post counters vs like/comment tables; display name/mascot in two profile tables; reward prices/XP in Swift + `reward_prices` + `challengeReward`; readiness rules in Swift + edge `_shared/readiness.ts`; streak/logged-day rule in three places. No reconciliation job, materialized view, or CHECK ties any aggregate to its source.
- **Normalization**: good in community and economy domains; weak in the workout/nutrition core, where JSONB blobs and denormalized totals replace relational structure (AUD-08).
- **Data ownership**: enforced by RLS owner-scoped policies on personal tables and by RPC gating on economy/entitlement tables. Gaps are in §4 (SEC-class findings), not in the schema shape.

---

## 4. Security Audit

**Method:** all 88 migrations replayed in order (DROP/CREATE POLICY, GRANT/REVOKE) to derive final policy/function state; all 12 edge functions read; native auth code read; secret scan over tree and sampled history. **Live RLS behavior is UNVERIFIED** — policy SQL was analyzed as written; the exact live checks are listed in §8.4/§9 (AUD-48).

### 4.1 Row Level Security — per-table verdict

| Check | Result |
|---|---|
| Tables with RLS enabled | **67/67** |
| Tables with zero policies | 1 — `moderation_audit_log`, intentional deny-all + `REVOKE ALL`, read only via `admin_audit` |
| Total policies (final, after replay) | 124 on tables + 3 on `storage.objects` = 127 |
| `AS RESTRICTIVE` policies | 14, all verified safe (AND-ed with owner-scoped permissive policies) |
| Permissive `USING (true)` SELECTs | 5, all `TO authenticated`, public-content-by-design reads (`community_profiles`, `community_follows`, `community_art`, `community_challenges`, `shop_prices`) — no private-account setting exists that they bypass |
| Views | **0** — no view-based RLS bypass surface |
| `FORCE RLS` / `DISABLE RLS` | None (normal for Supabase) |
| Default `TO PUBLIC` policies | ~Half of early-migration policies omit `TO` (default PUBLIC). Mostly benign: predicates require `auth.uid() = user_id` (NULL for anon → denied). Exception: anon CAN read shared-library rows with `user_id IS NULL` in `exercises`, `food_items`, `exercise_guide_content`, `exercise_media`, `exercise_media_content` (AUD-42, INFO). |
| Cross-user read/write via policies | **None found.** Owner-scoped predicates verified on all personal tables. Behavioral confirmation is UNVERIFIED (live check AUD-48). |

**Policy gaps found (all LOW, all with evidence in §9):**

- **AUD-38 (LOW):** UPDATE policies without `WITH CHECK` on `profiles`, `exercises`, `food_items`, `weekly_challenges` allow `user_id` mutation — a private exercise/food row can be published into the shared library (`SET user_id = NULL`) or transferred to another user. (`mascot_inventory` is protected against the same class by the `mascot_inventory_item_is_fixed` trigger.)
- **AUD-39 (LOW):** `body_checks.photo_id` has no parent-owner check (same class as fixed issue #149): knowing another user's photo UUID allows squatting the `UNIQUE(photo_id)` row and blocking their body-check write.
- **AUD-40 (LOW):** `dm_can_message(p_me, p_other)` never checks `p_me` against `auth.uid()` — a privacy oracle for block/restriction/DM-setting/follow metadata on arbitrary pairs.

### 4.2 SECURITY DEFINER functions

94 signatures (93 names); **88 SECURITY DEFINER** (catalog-verified). Every function that sets `search_path` sets it identically to `public` (117 occurrences, zero exceptions). Grant posture was derived from final GRANT/REVOKE per name.

- **Correctly hardened (verified, not re-flagged):** economy functions (server pricing, advisory locks, idempotency); admin/moderation RPCs (every entry point gated by `moderation_require()`, helpers revoked, bootstrap locked); `community_challenge_progress` revoked from all roles (internal only); `community_profiles_guard` forcing `is_official=false`; `claim_community_challenge` verifying membership/claimed/progress; share builders verifying ownership/visibility; `dm_*` RPCs verifying participation/blocks with rate limits; search functions escaping LIKE wildcards and re-checking blocks/visibility.
- **AUD-41 (LOW):** 8 trigger functions have no GRANT/REVOKE — default `EXECUTE TO PUBLIC` stands (5 are SECURITY DEFINER). PostgREST exposure of trigger functions is UNVERIFIED (live check: `POST /rest/v1/rpc/handle_new_user` as anon → expect 404/denial).
- **AUD-43 (LOW):** `search_path = public` everywhere is not the strictest pinning. Exploitability requires `CREATE` privilege on `public` for `authenticated`/`anon`, which is UNVERIFIED (live check AUD-48). The strictest form (`SET search_path = ''`) is recommended for new/changed functions.
- **AUD-15 (MEDIUM, structural):** 88 definer functions concentrate nearly all product integrity in code that bypasses RLS. No exploitable defect was found in the bodies reviewed, but any future defect in a definer body is a privilege defect by construction. The mitigation is the SQL test suites + mutation testing + revokes — all of which must keep running.

### 4.3 Secrets and API keys

- **Zero service-role keys, private keys, real JWTs, or `ghp_` tokens** found in the tree. The publishable/anon key ships in the app binary by design (commented as such: RLS is the control; the key is meant to ship). All other credentials are env names only (`ASCND_AI_*`, `APPLE_*`, `PRODUCT_ID_*`, platform-injected Supabase keys).
- **AUD-44 (INFO):** a legacy anon JWT exists in public git history (commit `3beafaca`, removed in `ce8c73f8`, 2026-08-25). Public-by-design material, but rotation/validity is UNVERIFIED.
- **No hardcoded credentials, no debug endpoints, no client-side privileged operations** found. The UI-test fake backend is `#if DEBUG`-gated at file and call-site level.
- Service-role key handling (rotation, storage, holders) is UNVERIFIED — dashboard/account-level check.

### 4.4 Edge Function security

All 12 functions have `verify_jwt = false` in `supabase/config.toml`; authentication is implemented in-handler via `_shared/guard.ts requireUser`, which checks `sub` + `role == authenticated` + `aud` contains `authenticated` (closing a prior anon-key-as-user hole). All 11 auth-required functions were verified to call `requireUser` first; `store-webhook` is intentionally public and trusts nothing in its body.

| Area | Verdict |
|---|---|
| Authentication / JWT validation | IMPLEMENTED in code; no platform backstop (AUD-37, LOW structural) |
| User authorization | IMPLEMENTED — no function trusts client-supplied user IDs; all use `requireUser`'s `userId`; `admin-art` double-checks `my_app_role() == admin` |
| Input validation | Strong in AI functions (shape/length/enum bounds, hostile-prompt screening before quota claim, `toolArgs` validation); `verify-purchase` validates txn id length; `admin-art` validates MIME vs magic bytes + server-generated paths |
| Rate limiting | AI functions: per-user daily quotas via `ai_gate` (fail-closed). `verify-purchase`/`store-webhook`/`delete-account`/`admin-art`: none (AUD-46, LOW — worst case is Apple API quota burn, not entitlement forgery) |
| Abuse prevention | Quotas + token metering for AI; posting/DM guards via triggers; no per-IP limiting anywhere (UNVERIFIED at platform level) |
| Error handling | Opaque error codes to clients; `console.error` server-side only (observability gap: AUD-33) |
| CORS | `Access-Control-Allow-Origin: *`, no credentials — standard Supabase pattern; any site can trigger a call but cannot supply the victim's token (INFO) |
| External API keys | Env-only; AI provider URL from env; no user-supplied URLs fetched (no SSRF) |
| Financial abuse | None found: entitlements re-verified with Apple; economy RPC-gated; `store-webhook` forgeries cannot grant entitlements |

### 4.5 Authentication implementation (native client)

- Single `SupabaseClient` (supabase-swift 2.55.3); session in **Keychain** with auto-refresh; no session token in `UserDefaults`, App Group, or GRDB (App Group holds only widget display data).
- Apple/Google sign-in: per-request nonces, SHA-256 to provider, raw to Supabase, state-verified. Deep links validated (`ascnd://` recovery flow). Account-switch/sign-out cleanup verified (fixes an RN-era leakage bug).
- App Lock: Face ID/Touch ID via `.deviceOwnerAuthentication`, content covered when backgrounded; the flag is a `UserDefaults` UX gate, not encryption (INFO).
- Transport: no ATS exceptions (HTTPS-only); no TLS bypass; **no certificate pinning** (INFO — acceptable for a Supabase-backed app).
- Telemetry: Sentry + PostHog fully OFF when keys empty; stated no-PII policy (UUID only); no explicit `beforeSend` scrubber in native code (INFO).
- Local data at rest: GRDB caches unencrypted (no SQLCipher, no file-protection flags); relies on iOS Data Protection defaults; no Data Protection entitlement declared (INFO).
- **Dashboard-side Auth settings are UNVERIFIED**: email confirmation, password policy, leaked-password protection, MFA, redirect allowlist, legacy JWT key rotation (live checks in AUD-48).

### 4.6 Storage buckets

Three buckets with server-side limits set by migration: `progress-photos` (private, 5 MiB, JPEG only, owner-scoped policies), `exercise-media` (public, 5 MiB), `community-art` (1 MiB, admin-only upload via `admin-art`). Upload paths are server-pattern `<uid>/…` from the session user id — no user-controlled segments, no traversal. Client resizes + compresses before upload. `storage.objects` RLS platform state is UNVERIFIED (live check). Photo row/object deletes are non-transactional pairs with an orphan window (AUD-32).

### 4.7 Account deletion

Mechanism verified by script: every user-data table reaches `auth.users` by `ON DELETE CASCADE` (directly, via `community_profiles`, or via a parent). `delete-account` empties the storage folder first (paged, 100/page), then `admin.auth.admin.deleteUser`, with a `partial: true` flag on failures after destruction began. Residual: no re-authentication step-up (AUD-21, MEDIUM); `moderation_audit_log.actor_id` deliberately survives (pseudonymous UUID retention, INFO); `dm_messages.sender_id` CASCADE deletes the user's messages from counterparties' threads (design choice, INFO).

---
## 5. Data Integrity

### 5.1 Critical operations — per-operation verdicts

| Operation | Atomic? | Transactions? | Idempotent? | Server-verified? | Race-safe? | Audit trail? | Verdict |
|---|---|---|---|---|---|---|---|
| Workout completion | Partial (single-row upsert atomic; session + day rebuild separate) | No (PostgREST has no client multi-statement txns; no wrapping RPC) | Yes (`id` + `ignoreDuplicates`) | **No** — zero CHECKs; sets/volume/PR/date all client-supplied | Partial (send-time re-read merge; residual window) | No | PARTIALLY IMPLEMENTED |
| XP awarding | N/A (derived) | N/A | Via ledger | **No** — XP is a pure client derivation over ledger rows | Via ledger | Via ledger | PARTIALLY IMPLEMENTED (inherits ledger risk) |
| Coin transactions | Yes (each RPC = 1 txn) | Yes (function-level) | Yes (unique ref_key, request-id, day-key) | Pricing yes; **earning no** | Yes (per-user advisory lock) | Yes (append-only ledger) | PARTIALLY IMPLEMENTED (AUD-02) |
| Achievement unlocking | N/A (single INSERTs) | No | Duplicates blocked by UNIQUE | **No** — client INSERTs any key/tier/title | N/A | Weak (client-supplied `earned_at`) | NOT IMPLEMENTED server-side (AUD-03) |
| Purchase verification | Yes | Yes (upsert) | Yes (convergent upsert) | **Yes** — Apple re-verification, double token binding | Yes | Weak (latest-state only) | IMPLEMENTED server-side; NOT IMPLEMENTED client-side (AUD-04) |
| Subscription entitlements | Yes | Yes | Yes | **Yes** — fresh Apple state on every write | Yes (order-independent) | **No** (no event log) | IMPLEMENTED server-side; NOT IMPLEMENTED end-to-end |
| Weight logging | No (log + profile sync separate) | No | Yes (`(user_id, date)` overwrite) | No (no CHECK; client bounds only) | No (read-then-decide; errors swallowed) | No (overwrite) | PARTIALLY IMPLEMENTED (AUD-35) |
| Nutrition logging | No (meal + items = 2 requests) | No | Yes (ids + `ignoreDuplicates`) | No (no CHECKs; totals client-computed) | Partial | No | PARTIALLY IMPLEMENTED (AUD-34) |
| Apple Health imports | No (multi-section, partial failure reported) | No | Yes (`external_id` upserts) | N/A (device data; provenance forgeable via REST) | Partial (dedup windows read-then-write; unique backstop) | No | PARTIALLY IMPLEMENTED |
| AI-generated persistence | Varies | No (`coach_memory` 3 writes non-transactional) | Yes (verbatim-id reconciliation; `UNIQUE(photo_id)`) | `coach_memory` yes (service-role only); `body_checks` bounded by CHECKs but client-writable | Yes (trim trigger; upserts) | Partial | PARTIALLY IMPLEMENTED |

**The systematic finding:** the architecture's *intent* is right — money and entitlements server-side, presentation client-side, AI behind functions — and the economy/entitlement halves execute it well. The systematic misplacement is **gamification truth**: quests, achievements, streaks, readiness, and the workout history they rest on are all client-asserted. That is coherent for a single-player log with cosmetic rewards, and the repo documents it as such in places. It stops being coherent the moment those signals gate something valuable, are shown to other users as earned status, or feed server-side reward decisions — all three of which are already partially true (community challenges read workout rows; awards/badges are profile-visible; coins buy the freeze consumable).

**Key integrity findings (detail in §9):**

- **AUD-02 (HIGH):** `claim_quest_reward` verifies only key *shape* + price, never completion — and `ch:`/`w:` namespaces accept invented keys. ~800 coins + ~800 XP/day forgeable via plain RPC calls; the whole 39-item shop (~8,530 coins) in ~11 scripted days with zero activity. Documented as a trade-off for quests; the unbounded-keyspace part is worse than documented. Escalates to CRITICAL if coins ever gate paid features or prizes.
- **AUD-03 (HIGH):** achievements self-granted — direct client INSERT with client-chosen key/title/tier and client-evaluated criteria; no RPC, trigger, or catalogue CHECK. The codebase already has the right pattern (`community_user_badges`, server-computed); `awards` does not use it.
- **AUD-20 (MEDIUM):** readiness score + daily aggregates are client-computed and client-writable with no server validation, yet consumed as ground truth by all AI functions. A forged `daily_logs` row makes the coach reason from fiction. (OCC via `updated_at` authenticates nothing.)
- **AUD-25 (MEDIUM):** the one server-verified reward (`claim_community_challenge`) verifies progress against freely authorable `workout_sessions` rows — verification-against-assertions, not verification-against-reality.
- **AUD-47 (MEDIUM):** `verify-purchase` ignores upsert errors on the expired/refunded path (fail-open: stale paid row may persist while the client is told `free`).
- **AUD-23 (MEDIUM):** `ai_credits` has no top-up path anywhere — the `overage` branch of `ai_gate` is dead; pay-as-you-go overage cannot work.
- **AUD-34/35 (LOW):** meal + items non-transactional with redundant unchecked totals; `profiles.weight_kg` sync best-effort with swallowed errors and a race.
- **Checked and closed (not re-flagged):** direct ledger minting, direct entitlement writes, client-priced shop, receipt trust, sandbox-grants-real-subscription, anon RPC execution, freeze double-spend/double-buy races, HealthKit import duplication, AI quota bypass via direct RPC (self-harm only), coach-memory prompt injection via stored facts.

### 5.2 Synchronization integrity

Covered in depth in §7. In short: the outbox replay is idempotent and duplicate-safe (client-generated ids, `ON CONFLICT` upserts, idempotency keys generated once at enqueue); HealthKit imports dedupe via `external_id` plain unique constraints (a measured fix — the original partial indexes could never serve as `ON CONFLICT` arbiters); `daily_logs` rebuilds use optimistic concurrency with retries. The gaps are sign-out queue destruction (AUD-06), silent last-write-wins on same-day scalar logs (AUD-29), and the residual read→write race in `SessionRevisionMerge`.

---

## 6. Backend Performance

### 6.1 Verdict per tier (evidence-grounded; tiers are not interchangeable)

| Tier | Verdict | Binding constraints |
|---|---|---|
| 1,000 active users | Comfortable | Every hot path is a `(user_id, …)` indexed lookup or a 30-row cursor page. Team measurements put search at single-digit ms at 5k–50k rows. |
| 10,000 active users | Comfortable, watch items | Search miss-queries strain past ~50k posts; `community_follow_suggestions` grows with profile count; AI spend grows linearly (quotas cap per-user, not aggregate). |
| 100,000 active users | Works, with user-visible degradation | Full-scan search (AUD-09); DM 500-cap (AUD-49); hot-post trigger serialization (AUD-51); exercise fetch vs row cap (AUD-05); reconnect rebuild storms (AUD-50). |
| 1,000,000 registered users | **Not ready** without search + index work | Profile search ~180 ms at 1M + sort per query; recipe/post search ~10 s at 1M (linear extrapolation of the team's own numbers); suggestions O(profiles × lookup). Per-user data stays fine — all failures are in **global** tables and unbounded client reads. No sharding needed: single Postgres serves this tier with FTS/trigram indexes + the query fixes in §11. Gating unknown: Supabase plan/pooler (UNVERIFIED). |

Registered users cost almost nothing (one `profiles` + one `community_profiles` row each). Active users drive feed reads, search, sync rebuilds, and AI calls.

### 6.2 Query efficiency — what the app actually issues

**Good patterns (IMPLEMENTED):** explicit column lists almost everywhere (only 2 `select("*")` sites, both low-risk); all personal reads filter `user_id` with covering indexes; feed uses keyset cursor pagination (30/page) with batched hydration (no per-post N+1); counts use `head: true`; DM writes go through checked RPCs with a 30/min rate limit; AI calls are quota-gated with token metering.

**Bad patterns (with evidence):**

- **AUD-05 (HIGH):** exercise fetch is unbounded — `SupabaseExerciseSource.exercises()` has no limit, fetches the whole shared library + user exercises on every `refresh()`, with no index for the `(muscle_group, name)` ordering. ~880 seed rows today, within ~13% of the PostgREST default 1,000-row cap (live cap UNVERIFIED). Past the cap, exercises silently vanish and the truncated list gets cached.
- **AUD-27 (MEDIUM):** following feed re-fetches the entire unbounded followee list on every page and passes it as a URL `IN()` filter — URL-length risk + silent truncation past the row cap.
- **AUD-28 (MEDIUM):** mascot balance computed client-side from a full unbounded ledger read; no server-side aggregate. Silent truncation past the row cap corrupts the displayed balance.
- **AUD-50 (MEDIUM):** every replayed outbox entry triggers a ~13-query DailyLog rebuild; reconnect bursts multiply this (~13N queries for N queued entries, sequential).
- **AUD-52 (MEDIUM):** HealthKit sync re-reads full windows (36h/7d/14d) every run with no `HKAnchoredObjectQuery`/persisted anchor — re-upserts identical samples every sync.
- **AUD-53 (LOW):** awards water scan pages `water_logs` with OFFSET up to 50 pages (50k rows) on every awards-screen load.
- **AUD-49 (MEDIUM):** DM history orders oldest-first with `LIMIT 500` and no cursor — threads over 500 messages show only the oldest; newest messages unreachable.
- **AUD-53 (LOW):** `recentItems` scans `meal_entry_items` ordered by `created_at` with no index and a per-row RLS `EXISTS` join.

### 6.3 The search problem (dominant scaling bottleneck)

Three SECURITY DEFINER search RPCs do full-table scans with per-row function evaluation:

| RPC | Pattern | Team's own measurements | Scaling |
|---|---|---|---|
| `community_search_profiles` | Full scan; `LIKE ANY` on folded name + handle prefix; sort, no early stop | 50k profiles: 8–30 ms warm | Linear; ~180 ms at 1M + sort. Only pg_trgm/GIN or FTS fixes the `% x%` branch. Extension decision explicitly deferred. |
| `community_find_recipes` | Full scan; one-fold optimization applied (#116); `LIKE ANY`, LIMIT 30 | 5k recipes: 2 ms hit, **53 ms miss** | Linear; miss queries scan everything. ~1 s at 100k, ~10 s at 1M (extrapolation). |
| `community_find_posts` | Full scan; `community_fold()` **4× per row** — one-fold fix never applied | None in migration | Worst of the three: ~4× the fold cost per row, same linear scan. |
| `community_follow_suggestions` | Full scan + correlated `count(*)` per profile + sort, LIMIT 10 | None | O(profiles × lookup). Unusable at 1M. |

Food search is additionally a double-sided `ilike` scan with no trigram index. Client debouncing limits query *rate*, not cost per query.

### 6.4 Connections, pooling, Realtime, contention

- **Connections:** the app never opens a Postgres connection — all traffic is PostgREST/REST via one shared `SupabaseClient`. No pooler configuration exists in the repo (zero mentions of pgBouncer/Supavisor); plan/pooler/connection limits are **UNVERIFIED** (dashboard check). Connection exhaustion is unlikely to be the first bottleneck (REST-only clients, no long-lived server processes) but cannot be ruled out.
- **Realtime:** **zero usage** — no channels, broadcast, or presence. No Realtime fan-out load at any tier; the cost is product behavior (DMs/inbox/feed update on view load / pull-to-refresh / 30-min background check only).
- **Edge concurrency:** no queue, no backpressure, no server-side concurrency cap beyond per-user daily quotas. Worst-case AI call latency ~180 s (3 providers × 3 attempts × 20 s header timeout, 503 path only). Aggregate AI spend is unbounded: quotas cap each user (e.g., 60 coach calls/day) but 100k actives × 60 = 6M calls/day is permitted by the code (AUD-54).
- **DB contention:** economy serialization via per-user advisory locks is deliberate and correct (single-user blast radius). Counter triggers (like/save/comment/try → 2–4 triggers updating the post row + notification inserts) serialize on hot post rows — invisible at 1k–10k actives, the first write-contention hotspot at 100k with viral posts. No counter sharding or deferred aggregation exists. No background aggregation jobs exist to move work off the request path.
- **Pagination inventory:** feed/comments correct (keyset cursors); inbox LIMIT 100 no cursor; DMs wrong-direction + capped; progress photos paged but loads all pages; history/performance/exercises/ledger/followees unbounded (rely on the PostgREST row cap); search RPCs capped server-side (cost is the scan, not the return).
- **Storage:** per-file limits enforced (5 MiB photos, 1 MiB art) + client compression; **no per-user photo-count cap**; photo row/object deletes are non-transactional pairs with an orphan window (AUD-32). At 100k actives × 10 photos × ~500 KB, ~500 GB — plan/bucket quotas UNVERIFIED.

---

## 7. Offline-First Assessment

**Classification: PARTIALLY IMPLEMENTED.** The offline core for personal record-keeping is genuinely durable — this is not cache-only and not online-only — but a large surface is online-only, there is no background sync, and there is no general multi-device merge. One-line version: *you can train, eat, drink, weigh, sleep-log, and plan offline and nothing is lost; you cannot do anything social, AI, economic, or photographic offline, and two devices editing the same day can clobber each other outside the workout-revision merge.*

| Item | Status | Evidence |
|---|---|---|
| Local database | IMPLEMENTED | One SQLite file via GRDB 7: `outbox`, `outbox_dead`, `workout_day`, `read_cache`. 4 migrations, never rewrite shipped ones. Account fencing inside every transaction; cross-account cleanup; TOCTOU-safe enqueue. |
| Read caching | IMPLEMENTED (no TTL) | 11 namespaces (templates, history, library, guides, profile, water, supplements, ...). Show-cache-then-refresh; no TTL, no staleness marker — failed refreshes leave arbitrarily old data shown as current. Meals/sleep/biometrics/community/DMs/economy NOT cached. |
| Offline workout recording | IMPLEMENTED | Full loop offline: day state in `workout_day` (14-day prune horizon), finish commits outbox + day state in one transaction, pending overlays on history/record views. |
| Pending operation queue | IMPLEMENTED | Durable single-lane outbox: commit-before-ack, in-order replay, idempotency keys generated once at enqueue, 4 failure classes, retry budgets (3 transient retries, 1s→30s backoff), dead-letter surfacing via banner. 17 record kinds covered. |
| Retry / recovery after termination | IMPLEMENTED (outbox) | `inFlight` is memory-only; app killed mid-send re-sends on next launch; replay is idempotent. Undecodable rows skipped, not queue-wedging. |
| Idempotent sync | IMPLEMENTED (covered kinds) | Upserts on `id`/`(user_id, date)` with `ignoreDuplicates`; deletes by `id + user_id`; meal = entry then items (lost response never yields entry without items). |
| Conflict handling / merge | PARTIALLY IMPLEMENTED | Workout revisions only (`SessionRevisionMerge` with `base` snapshots; residual read→write race documented). Everything else is silent last-write-wins. No conflict UI anywhere. |
| Multi-device reliability | PARTIALLY IMPLEMENTED | Safe against duplication (idempotency keys) and lost rebuilds (OCC on `daily_logs`); no general conflict detection. HealthKit multi-device dedupes by `external_id`; aggregates are last-writer-wins. |
| Background sync | NOT IMPLEMENTED | Foreground only. The only `BGAppRefresh` task checks notifications; it does not drain the outbox. |
| Offline community/DM/AI/economy/photos | NOT IMPLEMENTED | Online-only by design; direct writes bypass the outbox and fail immediately offline. |
| Sign-out data preservation | NOT IMPLEMENTED | **`dropAllOnSignOut()` deletes pending + dead queue rows** — unsent offline records destroyed on sign-out (AUD-06, HIGH; owner decision #241 pending). |
| State intents | Session-only by owner choice | `StateWriter` (supplement ticks, grocery checks): absolute values, coalescing, memory-only offline intents — app kill while offline loses them (AUD-29, MEDIUM). |
| Reachability | IMPLEMENTED, unusually careful | `NWPathMonitor` + active probing (HEAD `generate_204`, 204-only) + 3-state machine + stall recovery (25 s timeout, `flush()`, foreground reset). |

**Sync traces (verified in code):** outbox replay kicks on enqueue / network regain / foreground / sign-in; after each successful send, `DailyLog.rebuildAfterWrite` rebuilds affected days (~13 queries each). HealthKit sync re-reads fixed windows with no anchors; precedence rules (manual beats HealthKit within ±12h sleep / ±2h workout) are not merges. There is no delta sync, no version vectors, no "since" token for downloads — every screen re-reads server state plus local caches and pending overlays.

---

## 8. Reliability & Recovery

### 8.1 Configured vs verified vs unverified

| Capability | Status | Evidence / exact confirming check |
|---|---|---|
| Daily backups | **UNVERIFIED** | Nothing in repo. Dashboard → Database → Backups (plan-dependent; Free tier has none). Do not assume. |
| Point-in-time recovery | **UNVERIFIED** | Nothing in repo. Dashboard → Backups → PITR toggle + retention; requires Pro+ and explicit enablement. |
| Restore procedure / runbook | **NOT IMPLEMENTED** | No restore doc, RPO/RTO statement, or drill evidence anywhere (grep-verified). |
| Restore drill | **UNVERIFIED** | No evidence. A backup never restored is a hypothesis. |
| Migration rollback | **NOT IMPLEMENTED** | Zero down migrations; forward-only. Rollback = author a compensating migration under pressure; no documented procedure. |
| Staging environment | **NOT IMPLEMENTED** (in repo) | Single project ref in all configs; no staging ref/workflow. A second project could exist outside the repo — UNVERIFIED (`supabase projects list`). |
| Deploy separation / CI gate | **NOT IMPLEMENTED** | Manual `supabase db push` / `functions deploy`; no CI deploy job. |
| DB health monitoring | **NOT IMPLEMENTED** | No monitoring config/queries/alerts in repo. |
| Advisors | PARTIALLY IMPLEMENTED | System-check bot checks advisors ≥ WARN daily + on push; actual output UNVERIFIED. |
| Migration/drift monitoring | **IMPLEMENTED** | System-check bot compares repo migrations vs `schema_migrations`, deployed function code vs repo, function liveness. Read-only, daily + on push. Genuine control; its *results* are UNVERIFIED from the repo. |
| Client crash/error reporting | PARTIALLY IMPLEMENTED | Sentry wired; **keys empty in committed `Backend.xcconfig`** — production telemetry depends on uncommitted local config / EAS secrets. Live status UNVERIFIED (AUD-33). |
| Product analytics | PARTIALLY IMPLEMENTED | PostHog wired, same key caveat. UNVERIFIED live. |
| Edge function observability | PARTIALLY IMPLEMENTED | `console.error` + opaque codes only. No error tracking, structured logging, metrics, or alerting. Log retention plan-dependent — UNVERIFIED. |
| Incident recovery procedure | **NOT IMPLEMENTED** | No incident doc, on-call, severity playbook, or status plan. |
| Uptime/latency alerting | **NOT IMPLEMENTED** | Nothing in repo; function liveness checked daily by the bot (not alerting-grade). |

### 8.2 Migration risk

88 forward-only migrations with good discipline in other respects (never edit shipped migrations, mutation testing, throwaway-cluster CI suites). Risky DDL present: one `ADD COLUMN … GENERATED ALWAYS … STORED` rewriting `community_profiles` under an ACCESS EXCLUSIVE lock (measured 420 ms at 50k rows, grows with table size); **all `CREATE [UNIQUE] INDEX` statements are non-concurrent** (no `CONCURRENTLY` anywhere — a platform constraint, since `supabase db push` runs migrations transactionally; plan maintenance windows for large tables). No `DROP TABLE`/`DROP COLUMN`/`ALTER COLUMN TYPE`/`TRUNCATE` of user data. Destructive-DDL risk is low; **irreversible-data-loss risk comes from future data migrations landing without verified backups**.

### 8.3 What could cause permanent data loss

1. **Bad manual migration or dashboard edit + no verified backup/PITR** — the single most consequential gap (AUD-01). Low likelihood, total impact.
2. **Account deletion cascade** (by design, irreversible) — `delete-account` + FK cascades; a defect in identity resolution would destroy one user's entire history with no undo. The function is written carefully against exactly this.
3. **Sign-out drops the unsent outbox** (AUD-06) — bounded to one user's unsynced records, silent and total for those records.
4. **Storage orphan/delete ordering** — photo row/object deletes are non-transactional pairs (AUD-32).
5. **No retention policy cuts the other way** — nothing auto-deletes user data server-side (good for loss prevention, bad for unbounded growth).

### 8.4 Checks that require live access (consolidated)

All UNVERIFIED items across phases, with exact checks, are consolidated as AUD-48 in §9. The highest-priority live checks are: backup/PITR status + restore drill; applied-migration list vs repo; RLS behavior probes as a second user; deployed function versions + secret presence; `CREATE` privilege on `public` for `anon`/`authenticated`; Auth dashboard settings; PostgREST row cap; plan/pooler; Sentry/PostHog liveness in release builds; whether a staging project exists.

---
## 9. Findings Register

Severity guide: CRITICAL = exploitable now or data-loss risk with no recovery path; HIGH = exploitable now with bounded virtual-value impact, major functionality missing, or a scaling cliff; MEDIUM = integrity weakness with limited blast radius or a design gap needing a decision; LOW = minor/cosmetic/edge-case; INFO = observation, no action strictly required. Complexity: S = hours, M = days, L = weeks. IDs AUD-01…AUD-88 are this report's unified numbering (worker reports used per-phase IDs; the mapping is preserved in the working papers).

### 9.1 CRITICAL

**AUD-01 — CRITICAL — Reliability: backups/PITR unverified, no restore procedure, single project, manual deploys.**
- Description: No backup, PITR, restore-procedure, RPO/RTO, or restore-drill evidence exists anywhere in the repository. One Supabase project serves dev + production; deploys are manual `supabase db push` / `functions deploy` with no CI gate and no staging soak.
- Evidence: Grep-verified absence across repo; single project ref in `apps/ios/Config/Backend.xcconfig`, `supabase/config.toml`, `native/src/lib/backend.ts`; deploy docs describe manual pushes; no workflow deploys Supabase.
- Impact: A bad migration, manual dashboard error, or account compromise could destroy all user data with no known recovery path. Likelihood low, impact total.
- Reproduction: N/A (absence of evidence). Confirming check: Dashboard → Database → Backups (PITR toggle + retention); run a restore drill to a throwaway project.
- Remediation: Enable PITR (Pro plan) or confirm daily backups; document RPO/RTO + restore runbook; run and record a restore drill; add backup status to the system-check bot. Complexity: S–M. Confidence: HIGH (repo has no evidence); live state UNVERIFIED.

### 9.2 HIGH

**AUD-02 — HIGH — Integrity: reward completion never verified; `ch:`/`w:` key namespaces accept invented keys (bounded minting).**
- Description: `claim_quest_reward` verifies only key shape + server-side price, never that the quest/challenge/week was completed. The `ch:` branch checks only 4 parts + tier lookup (no existence check, no date validation); the `w:` branch accepts any non-empty suffix. The `d:` branch, by contrast, validates date window + known quest names.
- Evidence: `reward_amount_for` + `claim_quest_reward` in `20261029130000_koa_quests_v2.sql`; client claim path `SupabaseMascotEconomy.claimReward` → RPC with caller-chosen `refKey`. The trade-off is documented in migration headers ("server không xác minh việc đã làm") — but the unbounded-keyspace part is worse than documented.
- Impact: Any authenticated user mints up to the 800/day ceiling (~720 via `ch:platinum` keys + `w:` top-ups) indefinitely, with matching XP (~800 XP/day, ~6 levels/day). Whole 39-item shop (~8,530 coins) in ~11 scripted days with zero activity. Coins are cosmetic-only today (virtual-economy + status integrity); **escalates to CRITICAL if coins ever gate paid features or prizes**.
- Reproduction (by inspection): `POST /rest/v1/rpc/claim_quest_reward` with own JWT, `{"p_ref_key":"ch:platinum:2099-99-99:anything-1"}` → 120 coins. Repeat with distinct suffixes to the ceiling. No challenge row, workout, or weekly row needed.
- Remediation: Validate `ch:` keys against real state (weekly-challenge row exists, belongs to caller, `completed`, tier matches) or move claiming behind a server-verified RPC like `claim_community_challenge`; for `w:`, require the referenced row or retire the namespace (native client no longer uses `w:` — verify, then remove the branch). At minimum, validate `ch:` part 3 as a real date in a window. Complexity: M. Confidence: HIGH.

**AUD-03 — HIGH — Integrity: achievements self-granted by direct INSERT; criteria evaluated only in the client.**
- Description: `SupabaseAwardsSource.grant` INSERTs client-chosen `award_key`/`title`/`tier`/`icon`/`metadata` under an owner INSERT policy. No RPC, trigger, or catalogue CHECK constrains which awards exist. Only backstop: `UNIQUE(user_id, award_key)`.
- Evidence: `SupabaseAwards.swift:105-124`; policy "Users can insert own awards" (`20260212052623…`); criteria in Swift-only `Awards.toGrant`. Contrast: `community_user_badges` are computed server-side — the right pattern already exists.
- Impact: Any user grants themselves any badge/tier/title, including non-existent catalogue keys. Badges on profiles/community become meaningless as earned status.
- Reproduction: `POST /rest/v1/awards {"user_id":<own>,"award_type":"streak","award_key":"streak_365","tier":"platinum",...}` → 201.
- Remediation: Move granting behind a SECURITY DEFINER RPC that re-derives eligibility from source tables; drop the client INSERT policy; add a CHECK constraining `award_key`/`tier` to the catalogue. Complexity: M. Confidence: HIGH.

**AUD-04 — HIGH — Functionality: no purchase flow exists in the native app; subscriptions cannot be sold end-to-end.**
- Description: Zero StoreKit imports, zero `Product.purchase`, zero `appAccountToken`, zero callers of `verify-purchase` in `apps/ios` (only the enum case in `EdgeFunction.swift`). The server half (`verify-purchase`, `store-webhook`, `entitlements`) is genuinely strong and has no client counterpart. A legacy RN comment says the functions were never deployed (UNVERIFIED).
- Evidence: Repo-wide Swift grep (zero matches); `entitlements` migration: "Subscriptions are not built yet"; `CONSTRAINTS_AND_DEFERRED.md` row 40.
- Impact: Revenue feature is server-complete but unshippable: no paywall, no purchase, no restore; every account reads `free` via `current_tier()`. When StoreKit IS added, forgetting `appAccountToken` = every verification refused (safe default, launch footgun).
- Reproduction: `grep -rn "StoreKit\|appAccountToken" apps/ios --include="*.swift"` → no results.
- Remediation: Build the StoreKit 2 purchase/restore flow setting `appAccountToken = user id` on every purchase; call `verify-purchase` after purchase/restore; add a paywall reading `current_tier()`; test sandbox end-to-end; confirm the functions are deployed and `APPLE_ENV=production`. Complexity: L. Confidence: HIGH.

**AUD-05 — HIGH — Performance: exercise library fetch is unbounded (~880 rows, no limit) and re-runs on every screen load, near the PostgREST row cap.**
- Description: `SupabaseExerciseSource.exercises()` fetches the entire shared library + user exercises with no limit and no index for the `(muscle_group, name)` ordering; `load()` always calls `refresh()` after showing cache. No `PGRST_DB_MAX_ROWS` config exists in the repo.
- Evidence: `SupabaseExerciseSource.exercises()`; 872 rows counted in `20261018120000_food_exercise_library.sql` (883 after full apply incl. other seeds); `ExerciseLibrary.swift:470-494`.
- Impact: Once library + user exercises exceed the live row cap, exercises silently disappear from the picker — the server truncates, the client caches the truncated list. Live cap UNVERIFIED (confirm first).
- Reproduction: Add user exercises until total > live cap; open the picker; observe missing exercises with no error.
- Remediation: Add explicit paging or a `limit` + total-count check; add an index for the ordering; fail loudly on cap truncation instead of caching partial lists. Complexity: S–M. Confidence: HIGH (code); MEDIUM (cap behavior).

**AUD-06 — HIGH — Data loss: signing out destroys unsent offline records.**
- Description: `dropAllOnSignOut()` deletes pending + dead outbox rows. The count is returned "so it can be reported, if #241 chooses (c)" — owner decision #241 still pending.
- Evidence: `Outbox.dropAllOnSignOut()` + `OutboxStore.dropAllOnSignOut()`; comment citing pending decision #241.
- Impact: A user who logs offline workouts then signs out (or is signed out) loses them permanently, with at most a count returned for a report that may not exist.
- Reproduction: Log a workout offline (airplane mode) → sign out → pending queue is gone; sign back in → workout never syncs.
- Remediation: Decide #241: warn + offer "sync before signing out", or retain the queue per-account across sign-out (account fencing already exists to do this safely). Complexity: S–M. Confidence: HIGH.

**AUD-07 — HIGH — Reliability: no staging environment; manual deploys straight to production; no migration rollback strategy.**
- Description: Single project ref in all configs; no staging project, ref, or workflow in the repo; production application is a manual `supabase db push` with no recorded gate. Zero down migrations; rollback = author a compensating migration under pressure; no documented procedure. All `CREATE [UNIQUE] INDEX` statements are non-concurrent (platform constraint: `supabase db push` runs migrations transactionally); one migration rewrites `community_profiles` under an ACCESS EXCLUSIVE lock (STORED column, 420 ms at 50k rows per comment, grows with table size).
- Evidence: Config refs (§2); `20261001200000` STORED-column migration; grep: no `CONCURRENTLY`, no down-migration files, no rollback doc.
- Impact: Every migration/function deploy goes straight to production with no soak test; a bad push affects all users immediately; a bad migration can only be undone by writing a new one under pressure; future index builds on large tables block writes for the build duration.
- Reproduction: N/A (process absence). Confirming checks: `supabase projects list` (second project?); Dashboard deploy history.
- Remediation: Create a staging project; deploy + smoke-test there first (SQL suites + manual checklist) before production; document a rollback procedure (compensating migrations + decision tree); schedule index builds/rewrites in maintenance windows for large tables. Complexity: M. Confidence: HIGH (repo); live second project UNVERIFIED.
**AUD-08 — HIGH — Database: no relational set/program model; sets and programs live in unvalidated JSONB with no FK to `exercises`.**
- Description: `workout_sessions.sets` and `workout_templates.exercises` are free-form JSONB. No shape validation, no indexes, no FK: exercise references orphan silently on delete; `template_name` snapshots duplicate `workout_templates.name`; Apple Health sessions carry no sets and `volume_load = 0` by documented convention (a comment, not a constraint).
- Evidence: `20260212040248` core schema; table inventory §3.2. The seed test asserts library membership in SQL only for the seed.
- Impact: PR detection, volume aggregation, and per-exercise history are impossible in SQL; everything (including the `volume_load`/`pr_detected` columns the DB carries) is computed client-side and trusted. Integrity depends entirely on client discipline; the data cannot serve as evidence for server-side decisions (see AUD-25).
- Reproduction: Delete an `exercises` row referenced by a session's `sets` JSONB → the reference dangles with no error, no cascade, no constraint.
- Remediation: Introduce relational `workout_sets` / `template_exercises` tables with FKs to `exercises` (migrate JSONB → rows with a backfill; keep JSONB as a transition column if needed). This is the largest schema change in this report — plan it as a versioned migration with dual-write/read cutover, not a flag day. Complexity: L. Confidence: HIGH.

**AUD-09 — HIGH — Performance: community/food search is full-table scans with per-row folding; no search index anywhere.**
- Description: `community_search_profiles` (full scan + sort), `community_find_recipes` (full scan, one-fold applied, 53 ms miss at 5k rows measured), `community_find_posts` (full scan, `community_fold()` 4×/row — one-fold fix never applied), `community_follow_suggestions` (full scan + correlated count per profile + sort), and food search (double-sided `ilike` on `name`/`search_text`). No GIN/trigram/FTS/expression index exists on any searched column; the extension decision was explicitly deferred.
- Evidence: `20260930220000_community_find_posts.sql` (4× fold); `20261001150000/160000` (recipe measurements); `20261001200000` (profile measurements); `SupabaseFoodLibrary.searchFilter`; `pg_indexes` dump (158 indexes, none on searched columns).
- Impact: Search latency grows linearly with content. Extrapolating the team's own numbers: ~1 s at 100k recipes, ~10 s at 1M; profile search ~180 ms at 1M + sort, per query, × concurrent searchers. Miss queries (the common case) always scan everything.
- Reproduction: Seed 50k+ posts/profiles on a staging cluster; run miss queries; observe linear growth (team's `perf_*.sh` scripts exist for this).
- Remediation: Apply the one-fold pattern to `find_posts`; add pg_trgm GIN indexes on folded title/caption/name (or FTS vectors); restrict suggestion candidates (officials + recent posters via a posts index); keep client debouncing. Complexity: M. Confidence: HIGH.

**AUD-10 — HIGH — Database: 22 foreign keys lack a supporting index.**
- Description: Including `user_id` FKs on `exercises`, `meal_plans`, `supplements`, `workout_templates`, `habit_nudges`, all three `template_id` FKs, and both `food_item_id` FKs — verified against the ground-truth catalog (first-column index check; partial-index coverage noted where it exists).
- Evidence: Catalog query on the verification cluster; per-table inventory §3.2.
- Impact: Full scans on user-scoped reads; slow `auth.users`/template/food cascading deletes; worsens with growth. Delete-cascade scans on `auth.users` removal grow with every unindexed child FK.
- Reproduction: `EXPLAIN DELETE FROM auth.users WHERE id = …` on a populated staging cluster shows seq scans on the unindexed children.
- Remediation: Add the 22 indexes in one migration (verify each against the catalog first; drop nothing). Complexity: S. Confidence: HIGH.

**AUD-11 — HIGH — Database: dead/legacy tables in the live schema with no owner.**
- Description: `scan_history` and `weekly_reviews` are referenced by NO code at all (only RN generated types; `ai-weekly-review` never writes `weekly_reviews`); `habit_nudges` and `wearable_sources` are referenced only by legacy RN with zero native use.
- Evidence: Exhaustive name grep across Swift + edge functions + RN src; `ai-weekly-review/index.ts` writes nothing.
- Impact: Schema/RLS/policy surface with no owner; confusion about what is live; future developers (and auditors) cannot tell dead from dormant. Live row counts UNVERIFIED — confirm emptiness before dropping.
- Reproduction: `SELECT count(*) FROM weekly_reviews; SELECT count(*) FROM habit_nudges;` on the live DB (read-only).
- Remediation: Confirm zero live rows + zero external writers, then drop (or formally document as reserved) in a migration; remove the generated types. Complexity: S. Confidence: HIGH (no-caller); MEDIUM (live emptiness — UNVERIFIED).

**AUD-14 — HIGH — Functionality: streak freezes can be bought (150 coins) but never spent in the native app.**
- Description: `buy_streak_freeze(p_request_id)` is called from `SupabaseMascot.swift:201` (idempotent RPC, cap 2 held). No caller of `use_streak_freeze` exists anywhere in `apps/ios` (verified by grep for `use_streak_freeze`, `StreakGuard`, `spendFreeze`, `useFreeze`, `applyFreeze`); `MascotEconomy` has no spend method. The RN-era streak guard (`use-streak-guard.ts`) was never ported. Streak display reads `used_on`, which nothing ever sets. The RPC itself is race-correct (`FOR UPDATE SKIP LOCKED` + unique-violation → `false`).
- Evidence: Grep-verified absence in `apps/ios`; `20260817130000_freeze_race_returns_false.sql`; RN legacy file as context.
- Impact: Users pay 150 coins for a consumable that does nothing; streaks break on missed days despite held freezes. Paid-item-doesn't-work is a trust/refund issue, worse than a missing feature.
- Reproduction: Buy a freeze in the app (balance −150, row with `used_on = NULL`); miss a day; observe the streak breaks and the freeze row untouched.
- Remediation: Port the streak guard — on launch/day-settle, if yesterday is uncovered and a freeze is held, call `use_streak_freeze(yesterday)` and surface the outcome. No SQL change needed. Alternatively, stop selling freezes until the guard ships. Complexity: S–M. Confidence: HIGH.

### 9.3 MEDIUM

**AUD-12 — MEDIUM — Operations: schema-in-repo ≠ schema-in-production (known); Koa migrations undeployed while native code reads the tables.**
- Evidence: Migration headers `20261103120000`/`20261104120000` marked CHƯA DEPLOY; native code reads `koa_pauses`/`koa_pause_log` (with fallback); no deploy record exists in the repo for ANY migration. Impact: any finding in this report could be moot or understated live; fresh-apply schema may differ from production. Confirming check: `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version` + `pg_dump --schema-only` diff. Remediation: deploy the Koa migrations (or gate the reads), and record deploys (extend the system-check bot's migration comparison into a deploy log). Complexity: S. Confidence: HIGH (markers); UNVERIFIED (live state).

**AUD-13 — MEDIUM — Testing: no single CI test applies all 88 migrations together.**
- Evidence: `supabase/tests/core/run.sh` skips `*_community_*`; `supabase/tests/community/run.sh` applies only `*_community_*` onto stubs; the `*_community_*` filename convention is load-bearing and fragile. Note: THIS audit applied all 88 together on a throwaway cluster with 0 failures, so the chain is verified as of this tip — the gap is that CI does not. Impact: a migration referencing a core object from a community file (or vice versa) can break fresh deploys without CI noticing. Remediation: add a CI job that applies all 88 migrations to one throwaway cluster (the audit's procedure) on every `supabase/` change. Complexity: S. Confidence: HIGH.

**AUD-15 — MEDIUM — Security (structural): 88 of 94 function signatures are SECURITY DEFINER; nearly all product integrity bypasses RLS.**
- Evidence: Catalog-verified `pg_proc.prosecdef` count; function inventory §3.1. No exploitable defect was found in the definer bodies reviewed (see §4.2 verified-good list); the concern is concentration: any future defect in a definer body is a privilege defect by construction. Remediation: keep the SQL suites + mutation testing running on every change; prefer SECURITY INVOKER for new read helpers where RLS suffices; review definer bodies as privileged code. Complexity: ongoing. Confidence: HIGH.

**AUD-16 — MEDIUM — Database: duplicate/redundant indexes and unique constraints.**
- Evidence: `daily_logs` has THREE identical `(user_id, date)` indexes; duplicate UNIQUEs on `daily_logs`/`awards`/`weekly_reviews`; exact-duplicate index pairs on `scan_history`, `community_posts` (author), `exercise_media`; near-duplicate ASC/DESC pairs on 6 core log tables (B-trees scan backward, so DESC variants are redundant). Impact: write amplification, storage, planner noise. Remediation: drop redundant variants in one migration (verify with `pg_stat_user_indexes` first — live check). Complexity: S. Confidence: HIGH.

**AUD-17 — MEDIUM — Database: 9 tables carry `updated_at` with no maintaining trigger.**
- Evidence: `ai_credits`, `community_settings`, `entitlements`, `exercise_guide_content`, `exercise_media`, `exercise_media_content`, `exercises`, `koa_pause_log`, `koa_pauses` (trigger inventory vs `updated_at` columns). Impact: `updated_at` goes stale unless every writer sets it; sync/conflict logic reading it (incl. `daily_logs` OCC patterns) gets wrong answers. Remediation: add `update_updated_at_column` triggers (or drop the columns where meaningless). Complexity: S. Confidence: HIGH.

**AUD-18 — MEDIUM — Database: three identity tables, no single user aggregate; settings scattered.**
- Evidence: `auth.users` + `profiles` (surrogate `id` never referenced by any FK) + `community_profiles`; display name + mascot duplicated across `profiles`/`community_profiles`; settings across 4 tables. Impact: identity drift; every new user concept must choose among three homes. Remediation: designate one canonical profile aggregate; document which table owns each attribute; reconcile duplicates (long-term; do not merge tables without a migration plan). Complexity: L. Confidence: HIGH.

**AUD-19 — MEDIUM — Database: denormalized aggregates with no reconciliation.**
- Evidence: `daily_logs`, `meal_entries` totals, `workout_sessions.volume_load`, `profiles.weight_kg`, community post counters — no materialized view, reconciliation job, or CHECK tying any aggregate to its source. Impact: silent drift; AI functions and readiness read `daily_logs` as truth; counters desync after direct writes or trigger changes. Actual drift UNVERIFIED (needs live comparison queries). Remediation: add a periodic reconciliation check (bot query comparing aggregates to recomputation) + CHECKs where cheap (e.g., meal totals vs item sums via trigger). Complexity: M. Confidence: HIGH (structure); UNVERIFIED (actual drift).

**AUD-20 — MEDIUM — Integrity: readiness score + daily aggregates are client-computed and client-writable with no server validation.**
- Evidence: `DailyLog.recompute` (Swift) computes from 12 source reads and upserts `daily_logs` under a `FOR ALL` owner policy; no CHECKs/trigger validation on `readiness_score`/`readiness_status`/`readiness_explain`. Edge functions (`ai-coach`, `ai-smart-nudges`, `ai-weekly-review`) consume these as ground truth. OCC via `updated_at` authenticates nothing. Impact: a user (or buggy client build) can write arbitrary readiness scores/history; the coach/nudges/weekly review reason from fiction; two client builds computing readiness differently silently fork history. Self-only blast radius today. Reproduction: `PATCH /rest/v1/daily_logs?user_id=eq.<own>&date=eq.<today> {"readiness_score":100,...}` → accepted; coach reports perfect readiness. Remediation: decide the trust boundary — recompute/validate server-side (RPC/trigger), or add CHECK constraints (score 0–100, explain-token format) + treat client scores as advisory. Complexity: M. Confidence: HIGH.

**AUD-21 — MEDIUM — Security: account deletion needs no re-authentication or confirmation challenge.**
- Evidence: `delete-account/index.ts` — `requireUser` only; no password/biometric re-check, no confirmation token, no grace period. Client invokes directly. Impact: a stolen/valid access token = instant, total, irreversible account + photo deletion. Remediation: require step-up (fresh login / re-auth) or a typed-confirmation + short-TTL server confirmation token; consider grace-period soft delete; keep `partial` semantics. Complexity: M. Confidence: HIGH.

**AUD-22 — MEDIUM — Database: 2026-02 core schema has almost no CHECK validation.**
- Evidence: Free-TEXT enums (`sex`, `goal`, `meal_type`, `category`, `timing`, `type`, `source`, `provider`, `role`), unbounded numerics (`quality`, `session_rpe`, `weight_kg`, kcal/macros, HR/HRV/SpO2, `amount_ml`), unenforced temporal rules (`waketime > bedtime`, `end_date >= start_date`). 83 CHECKs exist but concentrate in 2026-07+ migrations. Impact: invalid data enters silently via REST; clients must validate everything; later migrations prove the team learned this — the core was never retrofitted. Remediation: backfill CHECKs on the core tables (ranges, enum allow-lists, temporal rules) in small migrations, verifying no existing rows violate them first. Complexity: M. Confidence: HIGH.

**AUD-23 — MEDIUM — Functionality: `ai_credits` has no top-up path; the `overage` branch of `ai_gate` is dead.**
- Evidence: `ai_credits` SELECT-only policy; only writer is `spend_ai_tokens` (debit). No top-up RPC, edge function, webhook, or client path credits tokens anywhere (grep-verified). `ai_gate` returns `overage` only when `tokens_remaining > 0`. Impact: pay-as-you-go overage cannot work — every user hits hard denial at call caps even if they would pay. Remediation: build the top-up path (purchase → credit RPC via `verify-purchase`/`store-webhook`, or admin grant RPC) or remove the overage branch and document hard caps as policy. Complexity: M. Confidence: MEDIUM (repo-complete; live manual top-ups would change this — UNVERIFIED).

**AUD-24 — MEDIUM — Architecture: business rules duplicated across client/SQL/edge, held together only by drift-guard scripts.**
- Evidence: Streak/logged-day rule (Swift + `ai-coach` inline `isLoggedDay` + SQL freeze window); readiness (Swift engine + `readiness.ts` parser + prompt rules); plausible bounds (Swift + `scan-food` + `parse.ts` + legacy `lib/plausible.ts`); reward prices/XP (Swift + `reward_prices` + `challengeReward`); water/sleep formatting (Swift + `_shared/*`). ~15 `native/tools/*.mjs` guards assert agreement; CI enforcement UNVERIFIED. Impact: silent drift = wrong prices, streaks, readiness inputs, bounds. The `ai-coach` `isLoggedDay` copy is most fragile (hand copy, no shared import possible across the boundary). Remediation: verify guards run in CI on every PR; consolidate where the boundary allows (server-computed predicates via RPC would eliminate client copies for reward-bearing rules — same direction as AUD-02). Complexity: M. Confidence: MEDIUM.

**AUD-25 — MEDIUM — Integrity: server-verified community challenge claims verify against client-authored workout rows.**
- Evidence: `claim_community_challenge` counts distinct workout days via `community_challenge_progress` over `workout_sessions`; rows are freely INSERTABLE by owners with arbitrary `date_time`/`sets`/`volume_load` and no CHECKs. Impact: fabricate N backdated sessions → claim any community challenge reward (bounded by the 800/day ceiling + challenge `reward_coins`). The one "verified" reward path inherits client trust. Remediation: cannot fully fix without workout provenance (consider counting only corroborated `source` rows, or explicitly document verification-against-assertions as accepted residual). Complexity: M (decision) / L (provenance). Confidence: HIGH.

**AUD-26 — MEDIUM — Database: FK-less user references become dangling UUIDs on account delete.**
- Evidence: `dm_threads.started_by`/`last_sender`, `community_restrictions.created_by`, `community_review_requests.decided_by`, `app_roles.granted_by`, `moderation_audit_log.actor_id`/`target_id` (deliberate, undocumented); polymorphic `community_posts.source_id` (RPC-enforced only). Impact: orphaned references in threads/restrictions/reviews/audit history after cascade delete; audit retention may be intentional but is undocumented. Remediation: document which retentions are intentional; add FKs (or explicit nulling triggers) for the rest. Complexity: S–M. Confidence: HIGH.
**AUD-27 — MEDIUM — Performance: following feed re-fetches the entire unbounded followee list on every page into a URL `IN()` filter.**
- Evidence: `SupabaseCommunity.followees()` (no limit); `CommunityFeed.load/loadMore` call it per page; `posts()` uses `.in("author_id", values: authors)`. Impact: large follow lists risk URL-length rejection; past the PostgREST row cap the author set silently truncates and followed authors vanish from the feed with no error. Remediation: server-side following feed (RPC joining follows inside Postgres) or cursor-paged followee fetch with a hard cap + UI affordance. Complexity: M. Confidence: HIGH.

**AUD-28 — MEDIUM — Performance: mascot balance computed client-side from the full unbounded transaction ledger.**
- Evidence: `SupabaseMascotSource.ledger()` (no limit/order); balance = client-side sum. No server-side balance column or aggregate RPC. Impact: read cost/payload grow forever per user; silent truncation past the row cap corrupts the displayed balance. Remediation: server-side balance (maintained column or `sum()` RPC) + paged ledger. Complexity: S–M. Confidence: HIGH.

**AUD-29 — MEDIUM — Sync: multi-device conflicts are silent last-write-wins (except workout revisions); state intents are memory-only.**
- Evidence: Overwrite upserts on `(user_id, date)` for weight/measurement/sleep/biometrics/day-overrides; `SessionRevisionMerge` covers workouts only (with a documented residual read→write race); `StateWriter` holds supplement/grocery intents in memory only (owner choice, documented). Impact: two devices (or device + HealthKit) editing the same day silently clobber each other with no conflict UI; offline ticks/checks vanish if the app is killed before reconnect. Remediation: extend the merge/OCC pattern to day-keyed logs or add `updated_at`-based conflict surfacing; persist state intents in GRDB (the outbox store already solves the hard parts) or disclose the session-only behavior in UI. Complexity: M. Confidence: HIGH.

**AUD-30 — MEDIUM — Database/operations: no retention, archival, partitioning, or soft-delete anywhere.**
- Evidence: Absence grep (`deleted_at`, `is_deleted`, `pg_cron`, retention); 89 CASCADE actions; unbounded growth tables (`ai_messages`, `biometric_samples`, `mascot_transactions`, `community_notifications`, `scan_history`). Only retention control: `coach_memory` 40-row trim. Impact: storage + backup growth without bound; no recovery from accidental delete; GDPR-style erasure is all-or-nothing by cascade. Remediation: define retention per table (e.g., notifications 90d, `ai_usage` 400d, `scan_history` 1y); implement as a scheduled job or batched cleanup RPC. Complexity: M. Confidence: HIGH.

**AUD-31 — MEDIUM — Database: no audit trail outside community moderation.**
- Evidence: Only `moderation_audit_log` (append-only, zero policies) records admin actions; profile/economy/entitlement/AI-quota changes leave no trail. Impact: disputes (coins, tier, bans) cannot be reconstructed from the DB. Remediation: append-only event log for entitlement/economy/admin mutations (the moderation pattern already exists — extend it). Complexity: M. Confidence: HIGH.

**AUD-33 — MEDIUM — Reliability: edge function observability is console logs only; retention unverified.**
- Evidence: `console.error` in all functions; no Sentry/structured logging/metrics/alerting in `supabase/functions` (grep-verified). Impact: production AI/store failures debuggable only within the plan's log retention; no error-rate alerting. Remediation: structured JSON logging + error-tracking hook, or confirm log retention + add a daily error-scan to the system-check bot. Complexity: S–M. Confidence: HIGH (repo); live retention UNVERIFIED.

**AUD-47 — MEDIUM — Integrity: `verify-purchase` ignores upsert errors on the expired/refunded path (fail-open).**
- Evidence: `verify-purchase/index.ts` — the `!ent` branch awaits the entitlements upsert without checking `error`, then returns `{tier:"free"}`; the success branch checks and returns 500. Impact: a transient DB failure during an expiry/refund write leaves the user entitled (fail-open) with the client told otherwise, until the next Apple event or restore. Low frequency, bounded harm. Remediation: check the upsert error in the `!ent` branch and return 500 on failure, mirroring the success branch. Complexity: S. Confidence: HIGH.

**AUD-48 — MEDIUM — Verification backlog: 11+ live checks gate the certainty of this entire report.**
- Description: The following cannot be settled from the repo and must be confirmed live (read-only checks; see §8.4): (1) applied-migration list vs repo + `pg_dump` diff; (2) RLS behavior probes as a second user (esp. `USING (true)` SELECTs, `community_posts` visibility, `dm_*` rules); (3) `CREATE` privilege on `public` for `anon`/`authenticated`; (4) PostgREST exposure of unrevoked trigger functions; (5) Auth dashboard settings (email confirmation, password policy, leaked-password protection, MFA, redirect allowlist, legacy JWT rotation); (6) Realtime publications; (7) `storage.objects` RLS state; (8) deployed function versions + secret presence + `APPLE_ENV`; (9) privacy-policy coverage (photos/health data to AI provider, barcode lookups, post-deletion UUID retention); (10) service-role key rotation/storage/holders; (11) backup/PITR status + restore drill (AUD-01); (12) plan/pooler/row-cap; (13) Sentry/PostHog liveness in release builds; (14) staging project existence; (15) `ai_credits` live balances; (16) `weekly_reviews`/`habit_nudges` live row counts. Remediation: run the checks; record results in the repo (or the system-check bot). Complexity: S. Confidence: N/A (verification gap by construction).

**AUD-49 — MEDIUM — Functionality/performance: DM history shows only the oldest 500 messages; no pagination.**
- Evidence: `SupabaseDMSource.messages()`: `order(created_at ASC).limit(500)`, no cursor. Impact: power users in long threads cannot see recent messages — a functional defect worsening monotonically with usage. Remediation: page newest-first with a keyset cursor (or oldest-first with jump-to-latest + backward paging). Complexity: S–M. Confidence: HIGH.

**AUD-50 — MEDIUM — Performance: every replayed outbox entry triggers a ~13-query DailyLog rebuild; reconnect bursts multiply this.**
- Evidence: `DailyLog.queries()` (12+ selects + OCC update × up to 3 attempts); `rebuildAfterWrite` per entry in `SupabaseRemoteWriter.afterWrite`. Impact: a user returning online with N queued entries causes ~13N+ queries sequentially before the queue drains; many users reconnecting at once (morning, post-outage) creates a correlated spike. Remediation: coalesce rebuilds per drain (rebuild each touched day once per batch, not once per entry); consider a server-side rebuild RPC. Complexity: M. Confidence: HIGH.

**AUD-51 — MEDIUM — Performance: like/save/comment/try triggers UPDATE the parent post row synchronously (hot-row serialization on viral posts).**
- Evidence: `community_count_bump`, `community_useful_bump`, notify/unnotify triggers on likes/saves/comments/tries. Impact: concurrent interactions on one popular post serialize on the row lock; throughput per post capped; HOT-update/index churn. Invisible at 1k–10k actives; first write-contention hotspot at 100k with viral posts. Remediation: accept until observed, then counter sharding, deferred aggregation, or batched score recompute. Complexity: M (when needed). Confidence: HIGH (mechanism); MEDIUM (when it bites).

**AUD-52 — MEDIUM — Performance: HealthKit sync re-reads full windows every run; no anchored queries.**
- Evidence: `HealthKitSource` uses `HKObjectQueryNoLimit`, windows 36h/7d/14d; no `HKAnchoredObjectQuery`, no persisted anchor; dedup by `external_id` upsert. Impact: wasted HealthKit + network + DB work every sync; grows with window sizes, not new data; hourly background delivery multiplies it. Remediation: persist `HKQueryAnchor`s per type, fetch deltas only; keep full-window as a repair path. Complexity: M. Confidence: HIGH.

**AUD-54 — MEDIUM — Cost/reliability: aggregate AI spend is unbounded; no queue/backpressure; worst-case call latency ~180 s.**
- Evidence: Per-user daily quotas only (`ai_gate`); `_shared/ai.ts`: 3 providers × 3 attempts × 20 s header timeout; no concurrency cap in repo. Impact: a usage spike or abuse wave within per-user quotas can run up a large provider bill and 429 legitimate users; long-tail calls hold function invocations. Remediation: aggregate budget alerting + provider-side rate limits; consider a queue for non-interactive AI (nudges, weekly review). Complexity: M. Confidence: MEDIUM (spend math exact; provider/plan limits UNVERIFIED).

**AUD-55 — MEDIUM — Performance: useful-feed index column order is reversed relative to the query's sort.**
- Evidence: Query orders `useful_score DESC, created_at DESC` (`SupabaseCommunity.posts`); index is `(created_at DESC, useful_score DESC)` (`20261007230000_community_useful.sql:128`). Impact: every "useful" feed page sorts instead of scanning in order; cost grows with the `useful_since` window. Remediation: add `(useful_score DESC, created_at DESC)` (possibly partial on the score threshold). Complexity: S. Confidence: HIGH.

**AUD-56 — MEDIUM — Sync: no background outbox drain; sync runs only while foregrounded.**
- Evidence: Only `BGAppRefresh` task is `CommunityAlerts` (notification check); `SyncWorker` kicks on foreground/enqueue/network only. Impact: queued workouts sit unsent until the user reopens the app; "synced" state lags reality after backgrounding. Remediation: add a background task draining the outbox (idempotency guarantees make this safe) or document the foreground-only contract. Complexity: M. Confidence: HIGH.

**AUD-57 — MEDIUM — Reliability: no DB health monitoring or alerting; advisors checked daily by bot only.**
- Evidence: No monitoring config/queries/alerts in repo; `system-check.mjs` reads advisors ≥ WARN daily. Impact: slow-query growth, connection pressure, bloat, and lock contention are discovered by user complaints, not alerts. Remediation: dashboard alerts (or scheduled advisor + `pg_stat_statements` review) + baselines; alert on function error rate. Complexity: S–M. Confidence: HIGH (repo); live dashboard config UNVERIFIED.

**AUD-58 — MEDIUM — Reliability: Sentry/PostHog keys empty in committed config; release-build telemetry liveness unverified.**
- Evidence: `Backend.xcconfig` — `ASCND_SENTRY_DSN =` (empty), PostHog empty; `Telemetry.swift` no-ops when unconfigured. Impact: the team may be flying blind on crashes/funnels in production while believing telemetry is on. Remediation: confirm the release pipeline injects keys; add a release-checklist item + a "telemetry live" check to the system-check bot (it already queries Sentry/PostHog APIs). Complexity: S. Confidence: HIGH (repo); live status UNVERIFIED.

**AUD-59 — MEDIUM — Functionality: Realtime NOT IMPLEMENTED; DMs/notifications/feeds are poll-based.**
- Evidence: Exhaustive grep — no `channel(`/`subscribe(` in native code; no publication SQL in repo. Dashboard publication UNVERIFIED. Impact: stale inboxes/feeds between polls; polling load; DM "realness" is UX-limited. (No Realtime load is a scaling benefit — see §6.4.) Remediation: only if live chat is required — design per-thread channels + broadcast RLS deliberately; do not assume it is free. Complexity: L (if built). Confidence: HIGH (code); UNVERIFIED (dashboard).

**AUD-60 — MEDIUM — Architecture: no server-side scheduling (no `pg_cron`, no scheduled edge functions, no DB jobs).**
- Evidence: Absence grep across migrations/functions/CI; `ai-smart-nudges`/`ai-weekly-review` cadence depends on client invocation; only on-device `BGAppRefresh` for community alerts. Dashboard cron UNVERIFIED. Impact: nudges/reviews don't happen unless the app asks; no server-driven retention/reconciliation/cleanup is possible without adding a scheduler. Remediation: add `pg_cron` (or scheduled functions) for retention/reconciliation/notification jobs when the product needs them; confirm no dashboard cron already exists first. Complexity: M. Confidence: HIGH (repo); UNVERIFIED (dashboard).

**AUD-61 — MEDIUM — Surface: admin/moderation RPC surface has no native caller (21 functions granted to `authenticated`, RN-only).**
- Evidence: Exhaustive function-name grep; native RPC inventory = 29 functions, none admin/mod; `admin_*`/`mod_*` + `earn_mascot_coins` + `use_streak_freeze` + `community_request_review` referenced only by legacy RN. Impact: either moderation/admin UI is missing in native, or 21 granted functions are dead-but-exposed surface. Product intent UNVERIFIED. Remediation: owner decision — build the native admin/moderation UI, or revoke the grants for functions with no native caller. Complexity: S (decision) / L (UI). Confidence: HIGH (no-caller); UNVERIFIED (intent).
### 9.4 LOW

Reproduction for all LOW findings is by code/SQL inspection unless stated; none requires live exploitation.

| ID | Category | Finding | Evidence | Impact | Recommended remediation | Cplx / Conf. |
|---|---|---|---|---|---|---|
| AUD-32 | Storage | Photo row/object deletes are non-transactional pairs; orphaned objects plausible. No trigger/hook deletes the Storage object on `progress_photos` row delete; client must delete both. | `SupabaseProgressPhotos.deleteRow` + `removeObject` (separate calls); no trigger on `progress_photos` delete; F-25. | Orphaned billable objects or rows pointing at missing objects after partial failure; private-photo retention exposure. | Fix a delete order + periodic orphan-reconciliation job; record the chosen order. | S / MEDIUM |
| AUD-34 | Integrity | Meal + items written in two non-transactional requests; totals stored redundantly with no sum check. | `SupabaseRemoteWriter` meal branch (two sequential upserts); `meal_entries.total_*` client-computed; no DB CHECK/trigger. | Transient partial visibility (meal without items) to concurrent readers; permanent totals/items divergence via partial failure or direct REST writes. Eventual consistency holds for the app's own replay. | Trigger/generated-column check reconciling totals, or compute totals in `DailyLog.recompute` from items. | M / HIGH |
| AUD-35 | Integrity | `profiles.weight_kg` sync is best-effort, non-atomic, errors swallowed, racy. | `SupabaseWeightLog.syncProfileWeight`: separate read-then-update; `_ = try?` on the profile write; no locking. Comment acknowledges staleness. | Stale profile weight feeds TDEE/coach advice with an old number. Self-only, small. | Conditional update (needs a `weight_as_of` column) or a trigger on `weight_logs`. | S / HIGH |
| AUD-36 | Integrity | `body_checks` is directly client-writable, so "AI estimate" provenance is forgeable within CHECK bounds. | Policy "Users can CRUD own body checks" (`20261105090000…`); `body-check` writes via caller token; CHECKs bound values (3–60%). | Fabricated/overwritten body-fat estimates without the AI ever seeing a photo. Self-data, bounded ranges; undermines "AI-measured" labeling only. | Restrict writes to the edge function (service role, like `coach_memory`) or add a `source` column distinguishing AI vs manual rows. | S / HIGH |
| AUD-37 | Security (structural) | All 12 edge functions run with `verify_jwt = false`; auth depends entirely on in-handler `requireUser`. | `supabase/config.toml` (all functions); all 11 auth-required handlers verified calling `requireUser` first. | No current hole — the risk is process: one future handler forgetting `requireUser` is silently open with no platform backstop. | Add a repo/CI check asserting every function except `store-webhook` calls `requireUser` first; consider re-enabling the platform gate where compatible. | S / HIGH |
| AUD-38 | Security (RLS) | UPDATE policies without `WITH CHECK` allow `user_id` mutation on 4 tables. | `profiles`, `exercises`, `food_items`, `weekly_challenges` UPDATE policies. | A private exercise/food row can be published into the shared library (`SET user_id = NULL`) or transferred to another user. (`mascot_inventory` is trigger-protected against the same class.) | Add `WITH CHECK (user_id = auth.uid())` (or `user_id IS NOT DISTINCT FROM` the old value) to the 4 policies. | S / HIGH |
| AUD-39 | Security (RLS) | `body_checks.photo_id` has no parent-owner check — UUID-squatting can block a victim's body-check write. | No parent-owner check in `20261105090000_body_checks.sql` (same class as fixed issue #149); `UNIQUE(photo_id)`. | Knowing another user's photo UUID allows squatting the row and blocking their write. | Add a parent-owner check (photo must belong to the caller), mirroring #149's fix. | S / HIGH |
| AUD-40 | Security (privacy) | `dm_can_message(p_me, p_other)` is a privacy oracle — `p_me` never verified against `auth.uid()`. | Function body; no `auth.uid()` check on `p_me`. | Any signed-in user can probe arbitrary pairs for block/restriction/DM-setting/follow metadata. | Require `p_me = auth.uid()` (or drop the parameter and use `auth.uid()`). | S / HIGH |
| AUD-41 | Security (privilege) | 8 trigger functions have no GRANT/REVOKE — default `EXECUTE TO PUBLIC` stands (5 SECURITY DEFINER). | Final GRANT/REVOKE replay per name; `NO STATEMENT` for 8 trigger functions. | PostgREST exposure UNVERIFIED — if callable, trigger bodies run with definer rights. Live check in AUD-48. | Explicitly `REVOKE EXECUTE ... FROM PUBLIC` (and from `authenticated`/`anon`) on all trigger-only functions. | S / HIGH (statements), MEDIUM (exploitability) |
| AUD-43 | Security (hardening) | `search_path = public` on all functions — not the strictest pinning. | 117 occurrences, zero exceptions. | Exploitability requires `CREATE` on `public` for `anon`/`authenticated` — UNVERIFIED (live check AUD-48). | Use `SET search_path = ''` (or `pg_catalog, pg_temp`) for new/changed functions; confirm schema privileges. | S / HIGH (setting), LOW (exploitability) |
| AUD-46 | Security (abuse) | No rate limiting on `verify-purchase` / `store-webhook` (deliberate); forged webhooks burn Apple API quota. | No auth/rate-limit/signature check in `store-webhook`; every usable txn id triggers 2 Apple API calls. Payload bounded (64 KiB). | Abuse = Apple API quota burn + log noise + DB upsert load. Cannot grant entitlements (re-verification). | Edge-level rate limiting (dashboard/WAF) and/or JWS `x5c` pre-filter (keeping re-verification authoritative); monitor Apple 429s. | S–M / HIGH |
| AUD-53 | Performance | Inefficient bounded reads: awards water scan (OFFSET up to 50k rows/load) + `recentItems` unindexed scan with per-row RLS join. | `SupabaseAwards.waterDates()` (OFFSET, 1000/page, ≤50 pages); `SupabaseMealLog.recentItems()` (no user filter, `order(created_at DESC)`, only `(meal_entry_id)` index, RLS `EXISTS` per row). | Quadratic OFFSET cost for long-tenure users; `recentItems` cost grows with the global items table. | Distinct-dates query / window-bounded read for water; two-step user-first filter (or covering index) for `recentItems`. | S–M / HIGH |
| AUD-62 | Sync | Head-of-line blocking in the single-lane outbox; dead letters have no resend path. | `Outbox.next()` head-only; dead surfaced in UI banner but no requeue control found. | One poisoned entry delays later entries until its retry budget exhausts; dead entries must be re-entered manually. | Skip-after-N-head-failures with reorder, or a "retry dead" action re-enqueueing with a fresh budget (same idempotency key). | M / HIGH (lane), MEDIUM (no-resend) |
| AUD-63 | Sync | Read caches have no TTL or staleness indication (11 namespaces). | `read_cache` overwrite-on-refresh only; no `fetched_at`. | Offline/stale data shown as if current after failed refreshes. | Add `fetched_at` + stale UI affordance for affected screens. | S / HIGH |
| AUD-64 | Integrity | `claim_quest_reward` returns the amount even on duplicate (no-op) claims; client 23505 branches for claims are dead. | `ON CONFLICT DO NOTHING` + unconditional `RETURN v_amount`; `KoaWeek`/`WeeklyChallenges` handle `.server(code:"23505")` for calls that can never raise it. | Client cannot distinguish fresh claim from replay; dead branches mislead future readers. No monetary effect. | Return a distinguishable result (amount + `claimed` boolean) and remove dead branches; or document the contract. | S / HIGH |
| AUD-65 | Integrity | `buy_mascot_item` already-owned check sits outside the advisory lock → concurrent duplicate buy surfaces raw 23505. | `EXISTS` check, then lock, then inserts (`20260815120000…`). Contrast `buy_streak_freeze` (checks inside the lock). | Raw constraint error instead of "already owned" on a rare race; no double charge (txn rolls back). | Move the check inside the lock or catch `unique_violation` → 'already owned'. | S / HIGH |
| AUD-66 | Integrity | `spend_ai_tokens` / `ai_gate` / `claim_ai_call` directly callable by any authenticated user. | `GRANT EXECUTE … TO authenticated`. | Self-only: a user can burn their own quota, drain their own credits, inflate their own usage. No cross-user effect; no benefit to the caller. | Accept and document (self-harm only), or restrict to `service_role` (trades RLS context — not recommended without care). | S / HIGH |
| AUD-67 | Reliability | No client-side timeouts on edge calls; server timeout covers headers only. | `SupabaseEdgeCaller` (no timeout); `SupabaseCoachStream` bare `URLRequest`; `callAI` header-only timeout (documented trade-off). | Hung provider bodies/streams hang the UI call until platform defaults intervene. | Explicit `timeoutIntervalForRequest` on coach stream + edge invocations; body-read timeout server-side when a real incident justifies it. | S / HIGH |
| AUD-68 | Integrity | `spend_ai_tokens` silently drops token records when no `ai_usage` row exists (UTC-midnight boundary). | Plain `UPDATE … WHERE day = today`; no row → no-op. Gate claim and spend can straddle UTC midnight. | Rare lost metering (under-counting). Narrow window, only at midnight UTC. | Upsert the `ai_usage` row in `spend_ai_tokens` instead of update-only. | S / MEDIUM |
| AUD-69 | Integrity | `ai-coach-memory` writes are non-transactional across drop/add/confirm; drop/confirm failures only logged. | Three sequential service-role writes; add failure → 500, drop/confirm failures → `console.error` only. | Drop-succeeds + add-fails = fact lost with a 500; confirm-fails = stale `last_confirmed` silently. Facts re-derivable from future conversations. | Wrap the three writes in a single RPC/transaction, or return partial-failure status for client retry. | S–M / HIGH |
| AUD-70 | Backend logic | `ai-meal-suggest` / `ai-smart-nudges` / `ai-weekly-review` return model output without plausibility/shape validation. | Unlike `scan-food` (`clampItems`) / `body-check` (`clampBody`), these return `toolArgs` verbatim (macros, nudge enums, review `score` unvalidated). | Implausible numbers reach the UI (e.g., 50,000 kcal suggestion, score 500). Advisory-only; nothing written without user action. Client clamping UNVERIFIED. | Server-side clamps mirroring `clampItems` (macro/kcal bounds, score 0–100, enum allow-lists). | S / HIGH |
| AUD-71 | Backend logic | Wasted reads in edge functions: `ai-weekly-review` fetches an unused 5th query; `ai-coach` reads `workout_sessions` twice + `select *` on `profiles` (also in 3 other functions). | `prevWeekRes` fetched, zero references; `workoutsRes` + `liftsRes`; `select("*")` on profiles. | One wasted round trip + over-fetch per call. Only mapped fields reach prompts (no leak). | Delete the dead query; merge into one 8-week query; select explicit profile columns. | S / HIGH |
| AUD-84 | Database | `community_posts.source_id` polymorphism undocumented: UNIQUE `(author_id, source_id)` with NULL-tolerant semantics; meaning varies by `kind`. | `share_workout` body (`source_id = p_session_id`); CHECK inventory. | Repost rules differ silently by kind; future kinds can misuse the column. | Document per-kind semantics in a comment + CHECK, or split into typed columns. | S / MEDIUM |

### 9.5 INFO

| ID | Category | Finding | Evidence | Note |
|---|---|---|---|---|
| AUD-42 | Security | Default `TO PUBLIC` policies; anon can read shared-library rows (`user_id IS NULL`). | Early-migration policies omitting `TO`; `exercises`/`food_items`/`exercise_guide_content`/`exercise_media*` shared rows. | Benign by design (public library); `reward_prices` correctly requires `auth.uid() IS NOT NULL`. No action. |
| AUD-44 | Security | Legacy anon JWT in public git history (commit `3beafaca`, removed `ce8c73f8` 2026-08-25). | History sample; names/lengths only recorded. | Public-by-design material; rotation/validity UNVERIFIED (check in AUD-48). |
| AUD-45 | Privacy | Post-deletion retention: `moderation_audit_log.actor_id` survives (deliberate, no FK); `dm_messages` deleted with sender (CASCADE). | FK inventory; `delete-account` cascade verification. | Design choices; confirm privacy-policy coverage (AUD-48). |
| AUD-72 | Security | Public-by-design social reads: follow graph enumerable by any signed-in user; `community_profiles` SELECT `USING (true)`. | Policy replay; table has no sensitive columns; no private-account setting exists to bypass. | No action unless private accounts are introduced — then re-audit. |
| AUD-73 | Security | No certificate pinning (ATS defaults, no exceptions). | `project.yml` (no ATS exceptions); default `URLSessionConfiguration`. | Acceptable for a Supabase-backed app. No action. |
| AUD-74 | Privacy | No explicit `beforeSend` scrubber in native telemetry; relies on SDK defaults + no-PII discipline. | `Telemetry.swift`; RN side has scrub tests. | Sentry SDK defaults don't capture bodies/headers. Consider porting the RN scrub tests. |
| AUD-75 | Security | Local GRDB caches unencrypted at rest; App Lock is a UX gate (UserDefaults flag), not encryption. | No SQLCipher/file-protection flags; no Data Protection entitlement. | Relies on iOS Data Protection defaults. Consider SQLCipher + file protection for health data at rest. |
| AUD-76 | Security | Edge CORS `Access-Control-Allow-Origin: *` (no credentials). | `_shared/guard.ts`. | Standard Supabase pattern; tokens are not cookies. No action. |
| AUD-77 | Integrity | Community posting/report rate-limit counters are non-atomic (trigger counts). | `community_posting_guard`, `community_reports_guard`. | Burst edge: a few extra posts/reports can slip through concurrent inserts. Acceptable; note for moderation tuning. |
| AUD-78 | Security | Direct RPC quota burn is self-harm only (`ai_gate`/`spend_ai_tokens` callable by users). | Grants; quota semantics. | No action (see AUD-66). |
| AUD-79 | Privacy | Barcode lookup hits Open Food Facts (barcode-only, percent-encoded path, no key/PII). | Swift grep: only non-Supabase host besides Google OAuth + test URLs. | Confirm privacy-policy coverage (AUD-48). |
| AUD-80 | Security | App Group container holds only widget display data (workout names, readiness score, Koa state) — no session tokens. | Grep-verified. | Good. No action. |
| AUD-81 | Integrity | Reward daily ceiling uses the UTC day while claim keys use local dates. | `claim_quest_reward`: `date_trunc('day', now())` vs key window +1/−2 local days. | Edge-of-day only; accept or compute in caller-local day (new trust input — not clearly better). |
| AUD-82 | Security | `store-webhook` 64 KiB check runs after `req.json()` parses the full body. | `store-webhook/index.ts`. | Platform body limits UNVERIFIED. Consider a streaming/length pre-check. |
| AUD-83 | Database | Two eras of schema style, zero enums: mixed `UUID`/`uuid`, `TIMESTAMPTZ` spellings, `date`+`logged_at` duplication in `water_logs`, Vietnamese default `'Khác'` in `grocery_items.category`. | Full migration read. | Cosmetic + onboarding friction. No action required. |
| AUD-85 | Database | `community_posts.image_source` CHECK allows only `'library'` (constant column); `buy_streak_freeze` retains two live overloads; `grocery_items.price` added by a 0-line uncommented migration. | Schema + function inventory. | Dead weight / API-surface duplication. Cleanup when convenient. |
| AUD-86 | Architecture | Local store is JSON-blob key-value, not a relational mirror (`outbox`/`read_cache`/`workout_day` hold opaque JSON). | `ASCNDStore/Database.swift`, `Outbox.swift`, `SyncWorker.swift`. | Architecture fact; offline truth rests on the outbox worker + row mappings (§7). No defect asserted. |
| AUD-87 | Integrity | Health import has no transaction; partial states possible but reported (`incomplete` error, per-part failures). | `HealthSync.run`. | Improvement over the RN predecessor; self-heals on next sync/rebuild. No action required. |
| AUD-88 | Backend logic | `verify-purchase` / `store-webhook` build the service client from platform env directly, ignoring the `dbUrl()`/`dbServiceKey()` indirection used by `ai-coach-memory`/`admin-art`. | Function sources; `guard.ts` documents the split-deployment scenario. | No effect in the current single-project deployment. Use the indirection consistently. |

**Findings NOT raised (checked, found closed — recorded so they are not re-flagged):** direct ledger minting; direct entitlement grants; client-priced shop; receipt trust; sandbox-grants-real-subscription; late-notification downgrade; anon RPC execution; anon-key edge bypass; freeze double-spend/double-buy; HealthKit import duplication; `is_official` forgery; account-switch leakage; ledger forging via INSERT; search/visibility bypasses; UI-test fake backend leaking into Release; Apple/Google nonce handling; storage path traversal; SSRF in edge functions; secrets in repo/history; RESTRICTIVE `USING (true)` policies; `earn_mascot_coins` amount forgery (fixed — amount ignored).

---
## 10. Architecture Scorecard

Scores are 0–10, grounded in the evidence in §§3–9. Unverified areas are marked rather than scored on assumption.

| Category | Score | Justification (evidence-grounded) |
|---|---|---|
| Database architecture | **6** | Consistent naming/PK/FK discipline, every table PK'd, cascade-complete deletion graph, good community-domain constraint design. Dragged down by: JSONB set/program model (AUD-08), 22 unindexed FKs (AUD-10), dead tables (AUD-11), duplicate indexes (AUD-16), no enums, no search indexing. |
| Database integrity | **5** | Economy + HealthKit idempotency are exemplary; but gamification/readiness truth is client-asserted (AUD-02/03/20/25), core CHECKs nearly absent (AUD-22), aggregates unreconciled (AUD-19), no audit trail outside moderation (AUD-31). |
| Security | **7** | RLS on 67/67 tables, no secrets committed, strong admin/purchase paths, verified-good list is long. Dragged down by: reward minting (AUD-02), `verify_jwt = false` structure (AUD-37), minor policy gaps (AUD-38/39/40/41), and the UNVERIFIED dashboard surface (AUD-48). |
| Authentication & authorization | **7** | Keychain sessions, per-request OAuth nonces, validated deep links, `requireUser` closing the anon bypass, role-gated admin RPCs. Dragged down by: no re-auth for deletion (AUD-21), no platform JWT backstop (AUD-37), dashboard Auth settings UNVERIFIED. |
| Backend logic | **6** | Edge functions are carefully built (validation, quotas, failover, opaque errors); economy/entitlement logic correctly placed. Dragged down by: gamification truth misplaced client-side, duplicated rules across three layers (AUD-24), dead query/duplicated reads (AUD-71), unvalidated AI outputs (AUD-70). |
| API design | **6** | Consistent PostgREST + RPC + function patterns; cursor pagination on feed/comments; explicit column lists. Dragged down by: unbounded reads (AUD-05/27/28), inconsistent error shapes (one message-sniffing branch depends on a Vietnamese string surviving unchanged), no versioning story, DM/inbox pagination defects. |
| Performance | **5** | Per-user paths are indexed, paged, and batched. Global paths are not: full-scan search (AUD-09), unbounded fetches (AUD-05/27/28), rebuild amplification (AUD-50), hot-post triggers (AUD-51). |
| Scalability | **5** | Fine to 10k actives on evidence; degradation at 100k; not ready at 1M without search/index work. Plan/pooler UNVERIFIED — the gating unknown. No sharding or migration needed; the fixes are indexes + bounded reads + one RPC. |
| Offline synchronization | **6** | The durable outbox core is excellent (commit-before-ack, idempotent, fenced, retry-budgeted). Dragged down by: sign-out data loss (AUD-06), large online-only surface, no background drain (AUD-56), silent LWW conflicts (AUD-29), session-only state intents, no cache TTL (AUD-63). |
| Reliability | **4** | The system-check bot is a real drift/migration/advisor/liveness control, and the SQL suites + mutation testing are genuine. But: no verified backups (AUD-01), no staging/rollback (AUD-07), no monitoring/alerting (AUD-57), logs-only function observability (AUD-33), telemetry liveness unverified (AUD-58). |
| Testing | **6** | Both SQL suites pass (verified by this audit on throwaway clusters); mutation testing exists; 276 Swift test files exist; drift guards exist. Dragged down by: no full-chain migration test in CI (AUD-13), Swift tests unrunnable here (toolchain), drift-guard CI enforcement UNVERIFIED, no live-behavior tests (RLS probes, restore drills). |
| Production readiness | **4** | The code is closer than the operations: purchases unshippable (AUD-04), a paid consumable that does nothing (AUD-14), no verified recovery path (AUD-01), no staging (AUD-07), Koa migrations undeployed while code reads the tables (AUD-12), telemetry unverified (AUD-58). Not safe for public launch as-is; safe for a limited beta once P0 is cleared (see §12). |

**Unverified (not scored):** live RLS behavior, live schema/drift state, backups/PITR, plan/pooler/row-cap, Auth dashboard settings, deployed function versions + secrets, Sentry/PostHog liveness, staging existence, actual aggregate drift, dependency vulnerabilities. See AUD-48.

---

## 11. Prioritized Remediation Roadmap

### P0 — Critical security or data-loss risks (before any public launch; before the next production deploy where noted)

| # | Item | Why it matters | What should change (files/objects) | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| P0-1 | Verify backups + run a restore drill (AUD-01) | Only CRITICAL finding: no known recovery path for the single production project. | Dashboard: confirm daily backups / enable PITR; document RPO/RTO + runbook; restore to a throwaway project and record it; add backup status to `system-check`. | Owner dashboard access. | Written evidence of a successful restore + RPO/RTO doc in repo. |
| P0-2 | Decide + fix streak freezes: port the spend guard or stop selling them (AUD-14) | Paid consumable that does nothing — trust/refund exposure from day one. | `apps/ios` (port `use_streak_freeze` call on day-settle + surface outcome) or disable `buy_streak_freeze` UI path. No SQL change needed. | None. | A held freeze is consumed on a missed day (simulator test), or freezes are no longer purchasable. |
| P0-3 | Validate `ch:`/`w:` reward keys or formally accept the residual (AUD-02) | Scripted minting of the full daily ceiling + XP with zero activity; escalates to CRITICAL if coins ever gate value. | `reward_amount_for` / `claim_quest_reward` (`20261029130000…` + new migration): existence + completion checks, or retire `w:`; at minimum real-date validation on `ch:`. | Owner decision on verification-vs-acceptance. | Invented-key RPC calls are refused (test in SQL suite), or a signed-off residual-risk note exists in `CONSTRAINTS_AND_DEFERRED.md`. |
| P0-4 | Preserve the outbox across sign-out, or warn + sync-first (AUD-06) | Silent destruction of unsent offline records. | `Outbox`/`OutboxStore.dropAllOnSignOut` + sign-out UI flow; owner decision #241. | Owner decision #241. | Offline-logged workout survives sign-out + sign-in and syncs; or the UI blocks sign-out until synced with explicit user consent. |
| P0-5 | Run the AUD-48 live checks that gate certainty (deploy state, RLS probes, function versions, Auth settings) | The repo may not match production (Koa migrations already prove drift is possible). | Read-only dashboard/SQL checks listed in AUD-48; record results. | Owner dashboard access. | Written record: applied-migration list matches repo (or gaps listed), RLS probes pass, deployed functions match repo, Auth settings confirmed. |
| P0-6 | Fix `verify-purchase` fail-open on the expired/refunded path (AUD-47) | Stale paid entitlement persists while the client is told `free`. | `supabase/functions/verify-purchase/index.ts` (`!ent` branch): check upsert error, return 500. | None (deploy after P0-5 confirms function deployment state). | Code review + staging test with induced DB error returns 500 and does not leave a stale row. |

### P1 — Important production reliability issues

| # | Item | Why it matters | What should change | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| P1-1 | Create a staging project + deploy gate + rollback procedure (AUD-07) | Every deploy currently goes straight to production with no soak and no undo. | Second Supabase project; deploy + smoke-test (SQL suites + checklist) before production; rollback doc (compensating migrations + decision tree). | Owner account access; P0-1 (backups) first. | A migration is deployed to staging, verified, then promoted; rollback doc exists and names the decision-maker. |
| P1-2 | Move achievement granting behind a server RPC (AUD-03) | Badges are profile-visible earned status, currently forgeable with one REST call. | New SECURITY DEFINER RPC re-deriving eligibility (pattern: `community_user_badges`); drop client INSERT policy; catalogue CHECK on `award_key`/`tier`. | AUD-02 decision (same trust-boundary conversation). | Direct INSERT of a non-earned award is refused; honest grants still flow; SQL suite covers it. |
| P1-3 | Add the 22 missing FK indexes (AUD-10) | Full scans on user-scoped reads + slow cascade deletes; cheapest high-impact fix in the report. | One migration adding the 22 indexes (verify against catalog first). | Maintenance window if tables are large (non-concurrent builds — see AUD-07). | `pg_indexes` shows all 22; `EXPLAIN` on cascade deletes uses index scans. |
| P1-4 | Bound the unbounded reads (AUD-05, AUD-27, AUD-28) | Silent truncation past the PostgREST row cap corrupts picker/feed/balance with no error. | Paging/limits + cap detection on exercises; server-side following-feed RPC (or capped followee fetch); server-side balance aggregate + paged ledger. | Confirm live row cap first (AUD-48). | No unbounded `.from()` fetch remains on those three paths; cap-truncation fails loudly. |
| P1-5 | Fix the `ch:`/`w:` + award trust boundary end-to-end (AUD-02, AUD-03, AUD-25) | The three reward paths share one trust decision; fixing one without the others leaves the hole open via the next path. | See P0-3, P1-2; document community-challenge verification as verification-against-assertions (or add provenance counting). | Owner decision on how much verification the product wants. | Documented trust boundary + tests for each reward path. |
| P1-6 | Deploy the Koa migrations or gate the reads (AUD-12) | Code reads tables whose migrations are marked undeployed — live behavior is undefined. | Deploy `20261103120000`/`20261104120000` via the P1-1 staging flow, or gate native reads on table existence. | P0-5 (deploy-state check), P1-1 (staging). | Applied-migration list includes both; or reads are gated with fallback verified. |
| P1-7 | Add DB monitoring + function observability + confirm telemetry (AUD-33, AUD-57, AUD-58) | The team is flying blind on slow queries, function errors, crashes, and funnels. | Dashboard alerts + `pg_stat_statements` review cadence; structured function logging; confirm release builds carry Sentry/PostHog keys; extend the system-check bot. | Owner dashboard access. | Alerts fire on a synthetic slow query/error; Sentry shows release-build events. |
| P1-8 | Add `WITH CHECK` to the 4 mutating UPDATE policies + `body_checks` parent-owner check + `dm_can_message` uid check (AUD-38/39/40) | Small, safe policy fixes closing real (if LOW-severity) holes. | One migration: `WITH CHECK` clauses, parent-owner check, `p_me = auth.uid()`. | SQL suite run after (policies are suite-covered). | Policy replay shows the fixes; suite green; probe calls denied as expected. |
| P1-9 | Decide the readiness trust boundary + add CHECKs (AUD-20) | AI functions treat client-written aggregates as ground truth. | CHECK constraints (score 0–100, explain-token format) at minimum; or server-side recompute/validation. | Owner decision. | Out-of-range readiness writes refused; decision recorded. |

### P2 — Performance and scalability improvements

| # | Item | Why it matters | What should change | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| P2-1 | Search indexes + one-fold fix (AUD-09) | The dominant scaling bottleneck; ~10 s miss queries at 1M rows by extrapolation. | pg_trgm GIN indexes (or FTS) on folded columns; one-fold pattern in `find_posts`; restrict suggestion candidates. | Migration window for index builds (AUD-07). | `perf_*.sh` measurements improve ≥10× at current scale; `EXPLAIN` shows index scans. |
| P2-2 | Coalesce DailyLog rebuilds per drain (AUD-50) | ~13N queries on reconnect bursts; correlated morning/post-outage spikes. | Rebuild each touched day once per outbox drain batch; consider a server-side rebuild RPC. | None. | Reconnect with N queued entries issues ~13×(distinct days) queries, not ~13N. |
| P2-3 | Useful-feed index order fix (AUD-55) + duplicate-index cleanup (AUD-16) | Sort-per-page + write amplification; both are one-migration fixes. | Add `(useful_score DESC, created_at DESC)`; drop redundant index/unique variants (verify with `pg_stat_user_indexes` first). | Index-build window. | Feed `EXPLAIN` shows index-ordered scan; duplicate list empty. |
| P2-4 | DM pagination (AUD-49) + inbox paging | Functional defect worsening monotonically; newest messages unreachable past 500. | Newest-first keyset cursor for DMs; cursor for notifications. | None. | 1,000-message thread shows newest messages; paging works both directions. |
| P2-5 | HealthKit anchored queries (AUD-52) | Full-window re-read + re-upsert every sync, hourly. | Persist `HKQueryAnchor`s per type; delta-only fetch; full-window as repair path. | None. | Second consecutive sync issues ~0 upserts with no new samples. |
| P2-6 | Hot-post contention plan (AUD-51) | First write-contention hotspot at 100k actives with viral posts. | Monitor first (lock waits on `community_posts`); then counter sharding / deferred aggregation / batched recompute if observed. | P1-7 monitoring. | Decision recorded with observed (or absent) contention evidence. |
| P2-7 | Retention policy + cleanup mechanism (AUD-30) | Unbounded growth on 5+ tables; no cleanup path exists. | Per-table retention decisions + scheduled cleanup (needs AUD-60 scheduler or a client-driven batched RPC). | AUD-60 decision. | Retention table documented; oldest rows past retention are gone on staging. |
| P2-8 | Backfill core CHECKs (AUD-22) + `updated_at` triggers (AUD-17) | Invalid data enters silently; stale timestamps mislead sync logic. | Small migrations: ranges/enum allow-lists/temporal rules (verify existing rows first); 9 `updated_at` triggers. | Row-violation pre-checks. | Invalid inserts refused; `updated_at` advances on all covered tables. |
| P2-9 | Background outbox drain (AUD-56) + cache TTL/staleness (AUD-63) | Sync lags reality after backgrounding; stale data shown as current. | Background task draining the outbox; `fetched_at` + stale affordance. | None. | Queued entries drain without foregrounding; stale caches show their age. |
| P2-10 | Aggregate AI budget controls (AUD-54) | Spend is unbounded in aggregate despite per-user quotas. | Budget alerting + provider-side limits; queue for non-interactive AI. | Owner billing access. | Alert fires at a test threshold; spend dashboard exists. |

### P3 — Long-term architecture improvements

| # | Item | Why it matters | What should change | Dependencies | Acceptance criteria |
|---|---|---|---|---|---|
| P3-1 | Relational set/program model (AUD-08) | The largest structural gap: analytics, integrity, and evidence all depend on client discipline over JSONB. | `workout_sets` / `template_exercises` tables with FKs; JSONB→rows backfill; dual-write cutover. | Owner + team planning; the most careful migration in this roadmap. | Sets/programs queryable in SQL; orphan refs impossible; PR/volume derivable server-side. |
| P3-2 | Reconciliation for denormalized aggregates (AUD-19) + audit trail extension (AUD-31) | Silent drift + unanswerable disputes. | Periodic reconciliation bot queries; append-only event log for entitlement/economy/admin mutations (extend the moderation pattern). | P1-7 monitoring (bot exists). | Reconciliation report runs on a schedule; a coin/tier dispute is answerable from the log. |
| P3-3 | Consolidate duplicated business rules (AUD-24) | Drift between Swift/SQL/edge copies is currently held together only by scripts. | Server-computed predicates via RPC for reward-bearing rules; verify drift guards in CI; single-source the rest where the boundary allows. | AUD-02/03/25 trust-boundary decisions. | Each rule has one authoritative implementation + tests; guards green in CI. |
| P3-4 | Identity/settings consolidation (AUD-18) | Three identity tables + scattered settings invite drift. | Canonical profile aggregate; documented attribute ownership; reconcile duplicates. Do NOT merge tables without a migration plan. | Owner decision. | Documented ownership map; no attribute written in two places. |
| P3-5 | Server-side scheduling (AUD-60) + Realtime decision (AUD-59) | Needed for retention, reconciliation, nudges, and live chat — if the product wants them. | `pg_cron` / scheduled functions; per-thread Realtime channels with broadcast RLS — designed deliberately, not assumed free. | Product decisions. | Jobs run on schedule with observability; or explicit decisions not to build recorded. |
| P3-6 | Drop dead tables + revoke dead RPC surface (AUD-11, AUD-61) | Dead schema/RPC surface confuses developers and widens the audit burden. | Confirm zero live rows/writers; drop tables; revoke grants for RN-only functions (or build the native admin UI). | Owner decisions; live checks (AUD-48). | Schema contains only live tables; granted RPC list matches callers. |
| P3-7 | Harden the definer surface over time (AUD-15, AUD-41, AUD-43) | 88 definer functions = the trusted computing base; keep it small and reviewed. | Revoke trigger-only functions; strict `search_path` on new/changed functions; prefer invoker rights for new read helpers; keep mutation testing green. | Ongoing. | No unrevoked trigger functions; new functions default to least privilege. |
| P3-8 | Build the purchase flow end-to-end (AUD-04) + `ai_credits` top-up (AUD-23) | Revenue + overage cannot work until the client half exists. | StoreKit 2 flow + paywall + restore + `appAccountToken`; top-up path via purchase/webhook; entitlement history. | Owner product decision; P0-5 function-deployment confirmation. | Sandbox purchase → entitlement write → tier-gated feature unlocks; overage purchasable. |
| P3-9 | Conflict handling beyond workouts (AUD-29) + resend path for dead letters (AUD-62) | Multi-device correctness + outbox recovery UX. | Merge/OCC for day-keyed logs or conflict surfacing; "retry dead" re-enqueue. | Product decisions on conflict UX. | Two-device same-day edits surface or merge instead of silent clobber; dead entries recoverable. |

---

## 12. Final Verdict

**1. Is the current Supabase architecture suitable for ASCND?**
Yes. One Supabase project + PostgREST + RPCs + Edge Functions + GRDB outbox fits a single-user fitness app with community and AI features. The architecture's intent — server-authoritative money/entitlements, client-side presentation, AI behind functions — is correct and mostly well executed. Nothing in this audit indicates the platform is the problem; every major finding is about usage patterns, missing pieces, or operations.

**2. Is it safe to launch publicly?**
Not as-is. The code is closer than the operations: no verified backups (AUD-01), no staging (AUD-07), a paid consumable that does nothing (AUD-14), scripted reward minting (AUD-02), and no purchase flow (AUD-04). It is safe for a **limited beta** once P0 is cleared (backups verified + restore drilled, freezes fixed or unsold, reward keys validated or formally accepted, sign-out queue preserved, live checks run). Public launch with monetization additionally requires P1 (staging, award RPC, bounded reads, monitoring) and P3-8 (the purchase flow itself).

**3. What are the three biggest risks?**
1. **No verified recovery path** (AUD-01 + AUD-07): single project, manual deploys, no staging, no rollback, backups unverified. One bad migration or manual error could destroy everything with no known undo.
2. **Client-asserted gamification truth + missing monetization** (AUD-02/03/04/14/25): rewards and achievements are forgeable, the one verified path trusts client-authored rows, subscriptions can't be sold, and a paid item doesn't work. This is simultaneously a trust problem, a revenue problem, and a refund problem.
3. **Global-scale read cliffs with no operational visibility** (AUD-09/05/27 + AUD-57/58/33): search and unbounded reads degrade linearly with content while monitoring, alerting, and telemetry liveness are all unverified — the team would learn about the cliff from user complaints.

**4. Can the current architecture reasonably scale to 100,000 users?**
Yes, with the P1/P2 fixes — specifically search indexes + the one-fold fix (P2-1), bounded reads (P1-4), the 22 FK indexes (P1-3), and rebuild coalescing (P2-2). Per-user data paths are already indexed and paged; all identified failures are in global tables and unbounded client reads, which single Postgres handles fine once indexed and bounded. As-is, expect user-visible degradation in search, DMs, and viral-post interactions at 100k actives. At 1M registered users the same fixes plus the follow-suggestion rework are required. The gating unknown is the Supabase plan/pooler (UNVERIFIED) — confirm it before promising anything at 1M.

**5. What must be fixed before launch?**
P0 in full: verified backups + restore drill (P0-1); streak freezes fixed or unsold (P0-2); reward-key validation or formal acceptance (P0-3); sign-out queue preservation (P0-4); the AUD-48 live checks (P0-5); the `verify-purchase` fail-open fix (P0-6). For a monetized launch, add P1-1 (staging), P1-2 (award RPC), P1-4 (bounded reads), P1-7 (monitoring), and P3-8 (purchase flow).

**6. What should NOT be rewritten?**
- The **outbox/sync core** (GRDB queue, idempotency, retry classification) — the strongest subsystem in the codebase; extend it (background drain, resend path), don't replace it.
- The **economy RPCs** (pricing, advisory locks, idempotency, ceilings) — genuinely correct; only the earning-verification boundary needs work.
- The **purchase/entitlement server half** (`verify-purchase`, `store-webhook`, `entitlements`) — trusts nothing, re-verifies with Apple, handles the hard cases; build the client half onto it.
- The **SQL test suites + mutation testing** — real, passing, and the main defense for the 88 definer functions; extend them (full-chain CI job), don't discard them.
- The **community moderation/trigger architecture** — the most rigorously constrained domain; its patterns (audited RPCs, guards, immutability triggers) are the template for fixing `awards`.
- **Supabase itself** — no finding in this audit justifies a platform migration; all scaling and integrity issues are fixable in place.

**7. Is a backend migration necessary? Explain with evidence.**
No. A migration is justified when the platform cannot meet the product's requirements; here the platform demonstrably can. The evidence: per-user queries are indexed and fast; the economy's hardest requirements (atomicity, serialization, idempotency) are already met with Postgres primitives (advisory locks, unique constraints, function-level transactions); the AI and purchase integrations run correctly as Edge Functions; the full 88-migration chain applies cleanly to stock PG16; and the scaling analysis shows single-Postgres viability to 1M registered users once search is indexed. The actual gaps — unverified backups, missing client flows, unbounded reads, unindexed FKs, client-asserted rewards — are all fixable without changing platforms, and changing platforms would re-open every one of them in a new stack while discarding the tested SQL surface. The correct investment is the P0–P2 roadmap above, not a rewrite. The one architectural change worth planning on a longer horizon is relational workout sets/programs (P3-1) — a schema evolution inside Postgres, not a migration away from it.

---

*End of report. Working papers (per-phase reports with full per-table/per-function inventories): `~/workspace/goals/ascnd-fitness-app/hidden_files/backend-audit-work/` — `phase1-2-discovery-schema.md`, `phase3-security.md`, `phase4-5-integrity-edge.md`, `phase6-7-8-perf-offline-rel.md`, `phase9-verification.md`. This audit was read-only; no source, migration, configuration, secret, or Supabase setting was modified.*
