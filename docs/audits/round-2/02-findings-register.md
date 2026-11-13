# ASCND Round 2 — Findings Register

Tip: `native/ios-rewrite` @ `b19e9822`. Standard: native iOS app. All evidence gathered fresh in Round 2 at this tip; Round 1 claims were not trusted blindly.

**Verdict vocabulary (§3):** CONFIRMED / PARTIALLY_CONFIRMED / FIXED_AND_VERIFIED / NOT_REPRODUCIBLE / NOT_VERIFIABLE / SUPERSEDED / NEW_EVIDENCE_REQUIRED.
**Evidence scope (§4):** REPOSITORY_VERIFIED (behavior executed on an isolated cluster or enumerated from code) / REPOSITORY_ONLY (code reading) / CATALOG_VERIFIED (PostgreSQL catalog queries on a throwaway cluster) / NOT_VERIFIED — ACCESS UNAVAILABLE (production/live state).
**Test statuses (§5):** EXECUTED_PASS / EXECUTED_FAIL (system demonstrated the defect) / BLOCKED / NOT_EXECUTED / SPECIFICATION_ONLY. No test is claimed passed without execution.
**Release impact:** Beta = blocks a limited closed beta; Launch = blocks public launch. "—" means neither (fix on the roadmap, not a gate).

---

## Part A — Round 1 revalidation (AUD-01..AUD-88)

### AUD-01 — CRITICAL — Backups/PITR unverified, no restore procedure, single project, manual deploys

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED (absence) + NOT_VERIFIED (production). **Confidence:** HIGH (repo absence); live state UNVERIFIED.
- **Fresh evidence:** Grep re-verified: no backup config, PITR toggle record, RPO/RTO statement, restore procedure, restore-drill record, or backup-status check in the system-check bot. New in Round 2: shipped privacy text asserts 30-day backup persistence (`apps/ios/ASCND/Resources/legal-content.json:485`) with zero operational evidence — filed as R2-OPS-09.
- **Test cases:** T-OPS-16 (restore drill) — BLOCKED (no access; isolated alternative: owner restores to a throwaway project, records RPO/RTO). R2T-09 — BLOCKED (dashboard read-only check).
- **Acceptance criteria:** (1) Dashboard evidence of backup/PITR state + retention days recorded; (2) a restore drill to a throwaway project succeeds and RPO/RTO are documented; (3) backup status added to the system-check bot; (4) legal text matches the evidence exactly.
- **Release impact:** Beta: BLOCK. Launch: BLOCK. **Effort:** S–M.

### AUD-02 — HIGH — Reward completion never verified; `ch:`/`w:` namespaces accept invented keys

- **R2 verdict:** CONFIRMED (arithmetic recomputed, scope expanded). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `reward_amount_for` (`20261029130000_koa_quests_v2.sql:33-91`): `ch:` checks only 4 parts + tier lookup (lines 68-71); `w:` accepts any non-empty suffix → 40 (74-77); `d:` validates date window +1/−2 days UTC + known quest names (51-65); `x:` branch added (85-88), excluded from ceiling. Client passes caller-chosen `refKey` (`SupabaseMascot.swift:177-183`). Recomputed at tip prices: **800 coins/day** (e.g. 6×`ch:platinum` 120 + 1×`ch:gold` 80) + **800 XP/day** (via `xpForRefKey`, `MascotRules.swift:91-108`); one-time +195 `x:` coins outside the ceiling; full shop (12,500 coins, 51 items — Round 1's "39 items/~8,530" is stale) in ~16 scripted UTC days.
- **Scope expansions (same ID, not new findings):** (a) honest path is tier-mutable — `weekly_challenges.reward_tier` is client-writable (`FOR ALL` owner policy), so a user can UPDATE own tier to platinum and the honest client claims 120; (b) the `d:*:streak` namespace has no live caller yet still pays (see R2-ECO-13); (c) `x:` keys forgeable one-time (195 coins, no completion check); (d) stale-ledger duplicate claims can fire a false level-up celebration (`MascotRoom.swift:366-380`, see AUD-64).
- **Test cases:** T-ECO-01..04 — BLOCKED (no PG on that worker; full executable SQL in the economy working paper, Appendix A).
- **Acceptance criteria:** (1) Invented-key RPC calls are refused (existence + completion checks, or `w:` retired); or (2) a signed-off residual-risk note exists in `CONSTRAINTS_AND_DEFERRED.md`; (3) SQL-suite test pins the behavior.
- **Release impact:** Beta: — (accept + disclose for test accounts). Launch: BLOCK (decision required). **Effort:** M.

### AUD-03 — HIGH — Achievements self-granted by direct INSERT; criteria client-only

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `SupabaseAwardsSource.grant` INSERTs client-chosen `award_type`/`award_key`/`title`/`description`/`icon`/`tier`/`metadata` (`SupabaseAwards.swift:105-124`, insert line 114). Policy "Users can insert own awards" + SELECT + DELETE, no UPDATE, no catalogue CHECK, only `UNIQUE(user_id, award_key)` (`20260212052623...sql`). Criteria Swift-only in `Awards.toGrant` (29 defs). No server-side grant path exists.
- **Test cases:** T-ECO-13 — BLOCKED (no PG).
- **Acceptance criteria:** (1) Direct INSERT of a non-earned award is refused (server RPC re-deriving eligibility; client INSERT policy dropped; catalogue CHECK on `award_key`/`tier`); (2) honest grants still flow; (3) SQL suite covers it.
- **Release impact:** Beta: —. Launch: BLOCK (monetized/status launch). **Effort:** M.

### AUD-04 — HIGH — No purchase flow in the native app; subscriptions cannot be sold end-to-end

- **R2 verdict:** CONFIRMED, with the required 5-way distinction. **Evidence scope:** REPOSITORY_VERIFIED for (1)–(3); NOT_VERIFIED for (4)–(5). **Confidence:** HIGH.
- **Fresh evidence:** (1) Backend verification code EXISTS and is strong: `verify-purchase/index.ts`, `store-webhook/index.ts`, `_shared/apple.ts`. (2) Native implementation DOES NOT exist: 0 `StoreKit` matches in `apps/ios` Swift, no `Product.purchase`, no `appAccountToken`, no paywall/restore UI, no App Store product ids; `project.yml` packages are Sentry/PostHog/SnapshotTesting only. (3) Client calls endpoint: NO — enum cases in `EdgeFunction.swift:24-25` never called; `SupabaseTier.current()` only reads `current_tier()`. Tier is read-only and gates nothing functional: `AppServices.isPaid()`'s only production caller feeds `BrandLockup(paid:)` — a cosmetic logo animation (`TodayExtras.swift:414,961`; `TodayTop.swift:15-40`). (4) Sandbox completes: NOT_VERIFIED — ACCESS UNAVAILABLE. (5) Production operational: NOT_VERIFIED — ACCESS UNAVAILABLE (deployment, `APPLE_ENV`, Apple credentials unknown). `current_tier()` reads `free` for every account without a server-side row. Constraint register agrees (`CONSTRAINTS_AND_DEFERRED.md:40`).
- **Test cases:** T-PUR-01..06 — SPECIFICATION_ONLY (sandbox purchase E2E spec).
- **Acceptance criteria:** (1) StoreKit 2 purchase/restore flow sets `appAccountToken = user id` on every purchase; (2) `verify-purchase` called after purchase/restore; (3) paywall reads `current_tier()`; (4) sandbox E2E passes; (5) functions confirmed deployed with `APPLE_ENV=production`.
- **Release impact:** Beta: —. Launch: BLOCK (any monetized launch). **Effort:** L.

### AUD-05 — HIGH — Exercise library fetch unbounded (~880 rows), re-runs every load, near the PostgREST row cap

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (code); MEDIUM (cap behavior — live cap NOT_VERIFIED).
- **Fresh evidence:** `exercises()` still unbounded; 873 seed tuples counted (`20261018120000_food_exercise_library.sql`; ±1 vs Round 1's 872, method note in working paper); no ordering index; `load()` always refetches + caches. No `PGRST_DB_MAX_ROWS` config in repo; live cap NOT_VERIFIED.
- **Test cases:** T-OPS-14 (seed counts) — EXECUTED_PASS. Row-cap truncation simulation — no test exists (critical untested invariant; see `03-test-plan.md` §6).
- **Acceptance criteria:** (1) Explicit paging or `limit` + total-count check; (2) index for the ordering; (3) cap truncation fails loudly instead of caching partial lists; (4) live row cap confirmed.
- **Release impact:** Beta: —. Launch: — (scale-gating; fix before library growth). **Effort:** S–M.

### AUD-06 — HIGH — Signing out destroys unsent offline records

- **R2 verdict:** CONFIRMED (P1; scope expanded). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `Outbox.dropAllOnSignOut()` (`Sync/Outbox.swift:179-186`) removes pending + dead + in-flight and returns the pending count "so it can be reported, if #241 chooses (c)"; `OutboxStore.dropAllOnSignOut()` (`OutboxStore.swift:137-145`) runs unscoped `DELETE FROM outbox` + `DELETE FROM outbox_dead` in one write transaction; `SyncWorker.signOut()` (`SyncWorker.swift:111-121`) cancels the drain, awaits settle, drops memory + disk. The call site discards the count: `_ = await sync.signOut()` (`AppServices.swift:322-323`). Confirmation copy says only "You'll need to sign in again." — no mention of unsent records. Owner decision #241 still cited as pending in all four comments. **Expansion:** destruction is NOT limited to voluntary sign-out — `SessionStore.apply` (`Auth/SessionStore.swift:117-133`) runs cleanups on every session end (expired refresh tokens, deleted accounts, password changes elsewhere, direct account switch). Additionally, `pruneDays` deletes logged day state after 14 days even if its outbox entry is still pending/dead (`GRDBWorkoutStore.swift:103-118`). Cross-references: R2-SYNC-01 (unscoped delete endangers the next account's rows), R2-API-08 (session-nil trigger breadth).
- **Test cases:** T-F08 — SPECIFICATION_ONLY (deliberately destructive; disposable fixture only; production leg BLOCKED).
- **Acceptance criteria:** (1) #241 decided and recorded; (2) offline-logged workout survives sign-out + sign-in and syncs, OR the UI blocks sign-out until synced with explicit user consent; (3) involuntary session ends do not trigger the same destruction without a retention decision; (4) the dropped count is surfaced if discard is ever chosen.
- **Release impact:** Beta: BLOCK. Launch: BLOCK. **Effort:** S–M.

### AUD-07 — HIGH — No staging environment; manual deploys; no migration rollback strategy

- **R2 verdict:** PARTIALLY_CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED (manual deploys, no rollback) + NOT_VERIFIED ("no staging"). **Confidence:** HIGH (repo); staging nonexistence NOT_VERIFIED.
- **Fresh evidence:** Manual deploys CONFIRMED: `native/docs/AI-TRIEN-KHAI.md` documents `supabase link --project-ref guqmbqtgxqleuwajvwvg` + `db push` + `functions deploy`; no deploy workflow exists in `.github/workflows/`; `CONSTRAINTS_AND_DEFERRED.md` records Kiệt-approved manual pushes with dry-run + `migration list` checks (86/86, 87/87). No rollback CONFIRMED in repo: no down-migrations, no `CONCURRENTLY`, no rollback docs/scripts. "No staging" only PARTIAL: single project ref everywhere, and `native/docs/PRE_RELEASE.md` references a STALE old ref `drqgonxrtmomgrftelih` (doc drift, minor) — but a staging project outside the repo cannot be excluded from here.
- **Test cases:** None executable from the repo; verification is AUD-48 items 1/14 (dashboard/project list) — BLOCKED.
- **Acceptance criteria:** (1) Staging project exists (or its nonexistence is confirmed and recorded); (2) deploy + smoke-test flow runs on staging before production; (3) rollback procedure documented (compensating migrations + decision tree).
- **Release impact:** Beta: —. Launch: BLOCK. **Effort:** M.

### AUD-08 — HIGH — No relational set/program model; sets/programs in unvalidated JSONB, no FK to `exercises`

- **R2 verdict:** CONFIRMED. **Evidence scope:** CATALOG_VERIFIED + behavior probes. **Confidence:** HIGH.
- **Fresh evidence:** `workout_sessions.sets` + `workout_templates.exercises` JSONB, no shape CHECK, no FK, no index; `template_name` snapshot; `volume_load`/`pr_detected` client-computed. Probe T-P9: ghost `exerciseId`, RPE 9999, and a bare-string `sets` all INSERT successfully. `share_workout` reads `sets` JSONB `exerciseId` strings without FK validation. **Correction:** 10 JSONB columns (not 9).
- **Test cases:** T-P9 — EXECUTED_FAIL (defect demonstrated).
- **Acceptance criteria:** (1) Relational `workout_sets` / `template_exercises` tables with FKs to `exercises`, migrated with dual-write/read cutover; (2) orphan refs impossible; (3) PR/volume derivable server-side.
- **Release impact:** Beta: —. Launch: — (long-term architecture). **Effort:** L.

### AUD-09 — HIGH — Community/food search is full-table scans with per-row folding; no search index

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** 4× fold in `find_posts` (`20260930220000_community_find_posts.sql:90-93`); zero GIN/FTS/trigram indexes (grep-verified: 0 `USING GIN/GiST`, 0 `CREATE EXTENSION`); suggestions correlated count; food double-`ilike`. Team's own measurements stand (recipe miss 53 ms at 5k rows; profile folded-column 283 ms → 11 ms).
- **Test cases:** T-OPS-10 (index inventory) — EXECUTED_PASS. T-OPS-05 (perf harnesses) — NOT_EXECUTED (no PG). R2T-10 (EXPLAIN-shape) — NOT_EXECUTED.
- **Acceptance criteria:** (1) One-fold pattern applied to `find_posts`; (2) pg_trgm GIN indexes (or FTS) on folded columns; (3) suggestion candidates restricted; (4) `perf_*.sh` measurements improve ≥10× at current scale with `EXPLAIN` showing index scans.
- **Release impact:** Beta: —. Launch: — (scale-gating; required before 100k–1M). **Effort:** M.

### AUD-10 — HIGH — Foreign keys lack a supporting index

- **R2 verdict:** PARTIALLY_CONFIRMED (count corrected). **Evidence scope:** CATALOG_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Unindexed-FK problem is real but the count is **25, not 22** (catalog C10, first-leading-column rule, PG16; partial indexes counted as covering): `community_blocks.blocked_id`, `community_likes.user_id`, `community_mutes.muted_id`, `community_notifications.{actor_id,challenge_id,comment_id,post_id}`, `community_post_hides.post_id`, `community_post_tries.user_id`, `community_posts.art_id`, `community_reports.{comment_id,post_id,reported_user_id}`, `community_review_requests.requester_id`, `exercises.user_id`, `habit_nudges.user_id`, `meal_entry_items.food_item_id`, `meal_plan_items.food_item_id`, `meal_plans.user_id`, `plan_day_overrides.template_id`, `routine_days.template_id`, `supplement_intake_logs.supplement_id`, `supplements.user_id`, `workout_sessions.template_id`, `workout_templates.user_id`. Delta (+3): `community_likes.user_id`, `community_post_tries.user_id` (PK starts with `post_id`), `community_posts.art_id` (RESTRICT + tiny parent — lowest priority). Caveat: `streak_freezes.user_id` and `community_comments.parent_id` are covered only by partial indexes — strictly, 27.
- **Test cases:** T-C10 (catalog group) — EXECUTED_PASS.
- **Acceptance criteria:** (1) All 25 (27 strict) indexes added in reviewed migrations; (2) `pg_indexes` shows all; (3) `EXPLAIN` on cascade deletes uses index scans; (4) SQL suites green.
- **Release impact:** Beta: —. Launch: — (do before scale). **Effort:** S.

### AUD-11 — HIGH — Dead/legacy tables in the live schema with no owner

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED (no-caller); live row counts NOT_VERIFIED. **Confidence:** HIGH (no-caller); MEDIUM (live emptiness).
- **Fresh evidence:** `scan_history`/`weekly_reviews` appear ONLY in RN generated types, no functional code; `habit_nudges` RN-only; `wearable_sources` RN-only. Zero Swift/edge references. Live row counts NOT_VERIFIED.
- **Test cases:** Live row-count check — BLOCKED (AUD-48 item 16).
- **Acceptance criteria:** (1) Zero live rows + zero external writers confirmed; (2) tables dropped (or formally documented as reserved) in a migration; (3) generated types removed.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-12 — MEDIUM — Schema-in-repo ≠ schema-in-production (known); Koa migrations undeployed while native code reads the tables

- **R2 verdict:** PARTIALLY_CONFIRMED (Round 1 correction). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (markers); live state NOT_VERIFIED.
- **Fresh evidence:** Headers still say CHƯA DEPLOY, but a prose deploy log in `CONSTRAINTS_AND_DEFERRED.md` claims both Koa migrations deployed (03/11 86/86 and 04/11 87/87) — Round 1's "no deploy record" is incorrect. Live state NOT_VERIFIED. See also R2-OPS-11 (prose log has duplicated entries; no structured deploy record).
- **Test cases:** T-OPS-08 (migration ordering) — EXECUTED_PASS. Live applied-migration list — BLOCKED (AUD-48 item 1).
- **Acceptance criteria:** (1) Applied-migration list includes both Koa migrations (or reads are gated with fallback verified); (2) stale CHƯA DEPLOY headers corrected; (3) deploys recorded in a structured log.
- **Release impact:** Beta: —. Launch: — (verify before launch). **Effort:** S.

### AUD-13 — MEDIUM — No single CI test applies all 88 migrations together

- **R2 verdict:** PARTIALLY_CONFIRMED (CI gap true; underlying risk absent at tip). **Evidence scope:** REPOSITORY_VERIFIED + executed. **Confidence:** HIGH.
- **Fresh evidence:** The CI claim is TRUE: `supabase/tests/core/run.sh` applies only NON-`*_community_*` migrations and `supabase/tests/community/run.sh` only `*_community_*` ones (both strict, `ON_ERROR_STOP=1`, run by `sql-community.yml`); `native/tools/*.mjs` full-chain loads `readdirSync` ALL `*.sql` but discard `psql` exit status (`2>/dev/null`, no `ON_ERROR_STOP`); `logged-day` only asserts tableCount ≥ 30. BUT the underlying risk is NOT present: **this round executed a strict full-chain apply — 88/88 OK** on PG 16.15 with a faithful stub (T-API-10, and independently T-M1 by the db-security worker). The one failure mode found (core-only stub lacking `auth.users.created_at`, breaking `20261007220000_community_report_trust.sql`) is a stub-fidelity artifact, not a migration bug. The `*_community_*` filename convention remains load-bearing for the split suites.
- **Test cases:** T-API-10 — EXECUTED_PASS. T-M1 — EXECUTED_PASS. T-S1/T-S2 (both suites) — EXECUTED_PASS.
- **Acceptance criteria:** (1) A CI job applies all 88 migrations to one throwaway cluster on every `supabase/` change; (2) green at tip.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-14 — HIGH — Streak freezes can be bought (150 coins) but never spent in the native app

- **R2 verdict:** CONFIRMED, with narrowed scope (see correction). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Buy path live at the RPC/controller layer: `SupabaseMascot.swift:201-208` → `buy_streak_freeze(p_request_id)`; `MascotRoom.buyFreeze` (`MascotRoom.swift:386-405`) with sticky request id, `canBuyFreeze` gating (balance ≥ `freezePrice = 150`, cap `freezeMax = 2`). Spend path dead: grep `use_streak_freeze`/`StreakGuard`/`spendFreeze`/`applyFreeze` in `apps/ios` Swift → zero callers; `MascotEconomy` has no spend method. Display reads `streak_freezes.used_on` (nothing sets it). RPC itself sound (race fix `20260817130000`, idempotency `20260820120000`; zero-arg form still double-chargeable on retry — documented). **Correction (new evidence):** the buy path is **unreachable via UI at tip** — `buyFreeze()` has no SwiftUI view caller; the freeze section in `MascotRoomView.swift:850` is an empty `// MARK: - Băng chuỗi` header; `ShopView` lists only `.outfit`/`.stage`/`.decor` — the `streak_freeze` consumable entry (`MascotShop.swift:219-224`) is in the separate `consumables` array no view renders; `CONSTRAINTS_AND_DEFERRED.md:480` (04/11): "Băng chuỗi giữ nguyên (code chết, không màn nào mua được)." Round 1's "users pay 150 coins for a consumable that does nothing" harm is therefore **not reachable through the app UI at tip**, but the dead-code + live-RPC combination remains: a determined client can call `buy_streak_freeze` directly. Follow-up condition: `use_streak_freeze` uses server `CURRENT_DATE` (UTC) vs local streak dates — matters only if a caller is added.
- **Test cases:** T-ECO-09/10 — BLOCKED (no PG).
- **Acceptance criteria:** (1) Either the streak guard is ported (held freeze consumed on a missed day, outcome surfaced, simulator-tested) OR the buy path is deliberately disabled (RPC revoked/gated + dead controller removed); (2) no live RPC sells an unspendable consumable.
- **Release impact:** Beta: — (decide before external beta). Launch: BLOCK (decision required). **Effort:** S–M.

### AUD-15 — MEDIUM — 88 of 94 function signatures are SECURITY DEFINER; nearly all product integrity bypasses RLS

- **R2 verdict:** CONFIRMED (structural risk; no exploitable defect found). **Evidence scope:** CATALOG_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** 88 SECURITY DEFINER of 94 signatures (catalog C3). No exploitable defect found in any definer body reviewed (all `admin_*`/`mod_*` gated via `moderation_require`; sampled RPCs correctly uid-scoped) except the two oracles (AUD-40 + new R2-DB-01). Mitigation is the SQL suites + mutation testing + revokes, not a code fix.
- **Test cases:** T-C3 (catalog group) — EXECUTED_PASS. T-S1/T-S2 (suites) — EXECUTED_PASS.
- **Acceptance criteria:** (1) SQL suites + mutation testing run on every change; (2) new read helpers prefer SECURITY INVOKER where RLS suffices; (3) definer bodies reviewed as privileged code.
- **Release impact:** Beta: —. Launch: — (ongoing). **Effort:** Ongoing.

### AUD-16 — MEDIUM — Duplicate/redundant indexes and unique constraints

- **R2 verdict:** CONFIRMED (expansion: `weight_logs` pair missed by Round 1). **Evidence scope:** CATALOG_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Catalog C11 exact-duplicate groups (7): `daily_logs (user_id,date)` ×3, `awards` ×2, `weekly_reviews` ×2, **`weight_logs` ×2 (expansion)**, `community_posts (author_id,created_at DESC)` ×2, `exercise_media` ×2, `scan_history` ×2. Plus 13 ASC/DESC-or-unique near-duplicate groups. The 2026-02-13 DESC `CREATE INDEX IF NOT EXISTS` variants are no-ops (name taken) — confirmed by "already exists, skipping" notices during replay.
- **Test cases:** T-C11 (catalog group) — EXECUTED_PASS.
- **Acceptance criteria:** (1) Redundant variants dropped in one migration (verify with `pg_stat_user_indexes` first — live check); (2) duplicate list empty; (3) suites green.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-17 — MEDIUM — 9 tables carry `updated_at` with no maintaining trigger

- **R2 verdict:** CONFIRMED (behaviorally proven). **Evidence scope:** CATALOG_VERIFIED + probe. **Confidence:** HIGH.
- **Fresh evidence:** Catalog C9: exactly the 9 Round 1 tables lack a maintaining trigger: `ai_credits`, `community_settings`, `entitlements`, `exercise_guide_content`, `exercise_media`, `exercise_media_content`, `exercises`, `koa_pause_log`, `koa_pauses`. Probe T-P15: `exercises.updated_at` stayed `2020-01-01` after an owner UPDATE; `profiles.updated_at` advanced (control).
- **Test cases:** T-P15 — EXECUTED_FAIL (defect demonstrated; control passed).
- **Acceptance criteria:** (1) `update_updated_at_column` triggers added (or columns dropped where meaningless); (2) `updated_at` advances on UPDATE for all covered tables (probe).
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-18 — MEDIUM — Three identity tables, no single user aggregate; settings scattered

- **R2 verdict:** CONFIRMED. **Evidence scope:** CATALOG_VERIFIED + code reading. **Confidence:** HIGH.
- **Fresh evidence:** `profiles.id` surrogate is never referenced by any FK (zero `REFERENCES public.profiles`); references go to `auth.users` / `community_profiles(user_id)`. Name duplicated (`profiles.name` vs `community_profiles.display_name`). Nuance: `profiles` has NO mascot column; the mascot duplication is `mascot_inventory.equipped` vs `community_profiles.mascot_id` (no Swift writer for `mascot_id` found). Settings scattered across `profiles`/`community_settings`/`meal_plans`/`supplements`.
- **Test cases:** None (architecture observation).
- **Acceptance criteria:** (1) One canonical profile aggregate designated; (2) documented attribute-ownership map; (3) no attribute written in two places.
- **Release impact:** Beta: —. Launch: —. **Effort:** L.

### AUD-19 — MEDIUM — Denormalized aggregates with no reconciliation

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (structure); actual drift UNVERIFIED.
- **Fresh evidence:** Meal totals (`meal_entries.total_kcal/protein/carbs/fat/fiber`, `20260212040248…sql:79-83`) with no sum CHECK/trigger; post counters via triggers (`community_count_bump` greatest-clamp, `community_try_count_bump`, `community_useful_bump`); no reconciliation job or materialized view. Coin ledger itself is the economy trail. Overlaps AUD-20/34/35 (other workers) — not duplicated.
- **Test cases:** Live drift comparison queries — BLOCKED (AUD-48).
- **Acceptance criteria:** (1) Periodic reconciliation check (bot query comparing aggregates to recomputation); (2) CHECKs where cheap (e.g., meal totals vs item sums via trigger).
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-20 — MEDIUM — Readiness score + daily aggregates client-computed/writable, no server validation

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `DailyLog.recompute` (`DailyLog.swift`, 566 lines; 12 source reads + OCC via `updated_at`, 3 attempts) computes everything client-side. `daily_logs` has `FOR ALL` owner policy, no CHECKs on `readiness_score`/`readiness_status`/`readiness_explain` (`20260212040248...sql`). Edge consumption: `ai-coach/index.ts:356-358` sends `readiness_score`/`readiness_status` gated by `recoveryMeasured(readiness_explain)` (`_shared/readiness.ts`, parses `hrv|rhr|sleep` tokens; absent/unparseable → false — the gate authenticates nothing, since the token string is itself client-writable). OCC authenticates nothing.
- **Test cases:** T-ECO-14 — BLOCKED (no PG).
- **Acceptance criteria:** (1) Trust boundary decided (server recompute/validation, or CHECKs: score 0–100, explain-token format + advisory treatment); (2) out-of-range writes refused or decision recorded.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-21 — MEDIUM — Account deletion needs no re-authentication or confirmation challenge

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH.
- **Fresh evidence:** Server: `delete-account/index.ts:78` — `requireUser` ONLY; no re-authentication, confirmation token, or grace period anywhere in the 180-line handler. Client: `SettingsView` — a single `ConfirmAlert`, small red destructive button, no password/biometric/typed confirmation. Compounding (new in this round): a recovery link opens a full session usable without setting a password — see R2-API-10. Live deployment NOT_VERIFIED.
- **Test cases:** T-LIVE/T-PROD behavior — BLOCKED (production mutation prohibited; isolated alternative: Deno + stub harness).
- **Acceptance criteria:** (1) Step-up required (fresh login / re-auth) or typed-confirmation + short-TTL server confirmation token; (2) grace-period soft delete considered; (3) `partial` semantics kept.
- **Release impact:** Beta: —. Launch: — (fix before public launch recommended). **Effort:** M.

### AUD-22 — MEDIUM — 2026-02 core schema has almost no CHECK validation

- **R2 verdict:** CONFIRMED (behaviorally proven). **Evidence scope:** CATALOG_VERIFIED + probes. **Confidence:** HIGH.
- **Fresh evidence:** Free-TEXT enums without CHECK (`profiles.sex`/`goal`, `meal_entries.meal_type`, `supplements.category`/`timing`, …); unbounded numerics; zero CHECKs on core tables at creation. Probes T-P10: `sex='zzz'`, `weight_kg=-5`, `total_kcal=-999`-class values accepted.
- **Test cases:** T-P10 — EXECUTED_FAIL (defect demonstrated).
- **Acceptance criteria:** (1) CHECKs backfilled on core tables (ranges, enum allow-lists, temporal rules) in small migrations, verifying no existing rows violate them first; (2) invalid inserts refused (probe).
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-23 — MEDIUM — `ai_credits` has no top-up path; the `overage` branch of `ai_gate` is dead

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED + executed. **Confidence:** HIGH (repo); live manual top-ups UNVERIFIED.
- **Fresh evidence:** Grep across migrations, functions, Swift, and RN: NO INSERT into `ai_credits` exists anywhere; only `ai_gate` reads it and `spend_ai_tokens` debits it; the only policy is SELECT-only. Executed T-API-02/T-API-03: with a manually inserted credit row, the overage path works exactly as designed (`ai_gate` → `overage`, `spend_ai_tokens` debits) — the branch is live code, dead by DATA. No purchase/top-up flow writes credits; `verify-purchase` writes `entitlements`, never `ai_credits`.
- **Test cases:** T-API-02 — EXECUTED_PASS (limits exact; overage live when credits exist). T-API-03 — EXECUTED_FAIL (AUD-68).
- **Acceptance criteria:** (1) Top-up path built (purchase → credit RPC via `verify-purchase`/`store-webhook`, or admin grant RPC) OR overage branch removed and hard caps documented as policy.
- **Release impact:** Beta: —. Launch: — (monetized launch). **Effort:** M.

### AUD-24 — MEDIUM — Business rules duplicated across client/SQL/edge, held together only by drift-guard scripts

- **R2 verdict:** PARTIALLY_CONFIRMED (CI enforcement now resolved in the guards' favor; uncovered remainder identified). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Duplication CONFIRMED. But Round 1's "CI enforcement UNVERIFIED" is now RESOLVED against the claim: drift guards ARE in CI — `quality-gate.yml` runs `node tools/check.mjs`, which includes `ai-coach.mjs`, `readiness-confidence.mjs`, `health-source.mjs`, `nutrition-averages.mjs`, `coach-memory.mjs`, `economy-authority.mjs`, plus executed shared-TS checks and Swift↔RN golden checks. The uncovered remainder: **Swift `ReadinessEngine` score and Swift streak/logged-day predicate have no cross-implementation drift check** (no tool reads Swift `ReadinessEngine` for value comparison; `readiness.mjs` executes the RN engine only). Note: the guards run in the legacy RN quality gate, not in any native gate — a native-only PR that drifts is not mechanically caught unless it also touches `native/`.
- **Test cases:** T-STATIC-01 (enumeration) — EXECUTED_PASS. T-OPS-19 (RN gate) — NOT_EXECUTED.
- **Acceptance criteria:** (1) Drift guards run in CI on every PR (verified in Actions history); (2) Swift readiness/streak values covered by a cross-implementation check; (3) each rule has one authoritative implementation + tests where the boundary allows.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-25 — MEDIUM — Server-verified community challenge claims verify against client-authored workout rows

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `community_challenge_progress` (`20260930120000_community_challenges.sql:90-101`) counts DISTINCT local dates with ≥1 `workout_sessions` row in `[starts_on, ends_on]`; no minimum sets/duration/volume; `workout_sessions` has `FOR ALL` owner policy, no CHECKs, free-form JSONB `sets`. Claim requires membership + advisory lock + `claimed_at` NULL + progress ≥ target + 800/day ceiling (`:147+`). Fresh nuances filed separately: no deadline check (R2-ECO-03), pre-join sessions count (R2-ECO-04), ceiling sum includes `x:` (R2-ECO-05).
- **Test cases:** T-ECO-12 — BLOCKED (no PG).
- **Acceptance criteria:** (1) Decision recorded: count only corroborated `source` rows, or explicitly document verification-against-assertions as accepted residual; (2) tests pin the chosen rule.
- **Release impact:** Beta: —. Launch: —. **Effort:** M (decision) / L (provenance).

### AUD-26 — MEDIUM — FK-less user references become dangling UUIDs on account delete

- **R2 verdict:** PARTIALLY_CONFIRMED (scope narrowed with two corrections). **Evidence scope:** CATALOG_VERIFIED + probe. **Confidence:** HIGH.
- **Fresh evidence:** (a) `dm_threads.started_by`/`last_sender` CANNOT dangle in practice (thread cascades via `user_a`/`user_b`; `started_by` has `CHECK IN (user_a, user_b)`). (b) `moderation_audit_log.actor_id` FK-lessness IS documented in-migration ("Không khoá ngoại…", `20261007130000…sql:109-111`); `app_roles.granted_by` also documented (`:38-39`) — Round 1 §3.3 "undocumented" is wrong for these two. **Genuinely undocumented dangling:** `community_restrictions.created_by` (no FK) and `community_review_requests.decided_by` (ADD COLUMN, no FK). Probe T-P12r: restriction row survives moderator deletion with dangling `created_by`. `target_id` is polymorphic by design. `community_posts.source_id` is AUD-84. **FK-count correction:** 92 FKs / 3 SET NULL (catalog C5), not "100+" / 7.
- **Test cases:** T-P12r — EXECUTED_FAIL (dangle demonstrated, narrowed scope).
- **Acceptance criteria:** (1) Intentional retentions documented; (2) FKs (or explicit nulling triggers) added for the rest.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-27 — MEDIUM — Following feed re-fetches the entire unbounded followee list on every page into a URL `IN()` filter

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `followees()` unbounded, refetched per page (`load` + `loadMore`), passed as URL `IN()` filter.
- **Test cases:** None executed; row-cap behavior untested (see §6 of the test plan).
- **Acceptance criteria:** (1) Server-side following feed (RPC joining follows inside Postgres) or cursor-paged followee fetch with hard cap + UI affordance; (2) live row cap confirmed.
- **Release impact:** Beta: —. Launch: — (scale-gating). **Effort:** M.

### AUD-28 — MEDIUM — Mascot balance computed client-side from the full unbounded transaction ledger

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `ledger()` unbounded/unordered; `MascotWallet` sums balance + XP + claimed-set from the full read.
- **Test cases:** None executed; row-cap behavior untested.
- **Acceptance criteria:** (1) Server-side balance (maintained column or `sum()` RPC) + paged ledger; (2) cap-truncation fails loudly.
- **Release impact:** Beta: —. Launch: — (scale-gating). **Effort:** S–M.

### AUD-29 — MEDIUM — Multi-device conflicts are silent last-write-wins (except workout revisions); state intents memory-only

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Overwrite upserts with no conflict detection on `weight_logs` (`SupabaseWeightLog.swift:41`, `onConflict: "user_id,date"`), `body_measurements` (`SupabaseMeasurementLog.swift:21`), `plan_day_overrides` (`SupabaseRemoteWriter.swift:131`), `routine_days` (`:137-139`), plus read-then-overwrite sleep/biometrics (`:158-205`). `SessionRevisionMerge` covers workouts only and its residual read→write race is still present: `sendMerged` (`:207-238`) reads, merges, then issues an unconditional `update … eq(id) + eq(user_id)` with no OCC token (window is send-time only; comment at `:202-206` documents it). No conflict UI exists anywhere. `StateWriter` intents memory-only (`StateWriter.swift:78`), `clear()` on sign-out (`:130-133`), flush only on regain. **Expansion:** Koa pause sync is also LWW per row key with server-wins pull — see R2-SYNC-05.
- **Test cases:** T-F09 — SPECIFICATION_ONLY (two-device + isolated backend; production leg BLOCKED).
- **Acceptance criteria:** (1) Merge/OCC pattern extended to day-keyed logs or `updated_at`-based conflict surfacing added; (2) state intents persisted in GRDB or session-only behavior disclosed in UI; (3) two-device test pins the contract.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-30 — MEDIUM — No retention, archival, partitioning, or soft-delete anywhere

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** No retention/archival/partitioning/soft-delete in any migration; only the `coach_memory` 40-row trim. "Retention" hits in migrations are prose comments.
- **Test cases:** None (absence).
- **Acceptance criteria:** (1) Retention defined per table; (2) scheduled cleanup implemented (needs AUD-60 scheduler or client-driven batched RPC); (3) oldest rows past retention gone on staging.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-31 — MEDIUM — No audit trail outside community moderation

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Only audit trail is `moderation_audit_log` (append-only triggers, zero policies, `REVOKE ALL`, read via `admin_audit`). No trail for profile/economy/entitlement/AI-quota changes.
- **Test cases:** None (absence).
- **Acceptance criteria:** (1) Append-only event log for entitlement/economy/admin mutations (extend the moderation pattern); (2) a coin/tier dispute is answerable from the log.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-32 — LOW — Photo row/object deletes are non-transactional pairs; orphaned objects plausible

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY (Swift behavior NOT_EXECUTED). **Confidence:** HIGH (code path).
- **Fresh evidence:** `ProgressPhotosBook.delete()` (`ASCNDCore/Body/ProgressPhotos.swift:280-297`) deletes the row first (must touch ≥1), then `try?` `removeObject` — failure swallowed → orphaned private Storage object, no retry/reconciliation. Upload path compensates (removes object if row insert fails, `:262-276`). `deleteRow`/`removeObject` in `SupabaseProgressPhotos.swift:71,85`. No trigger/hook deletes the object on row delete.
- **Test cases:** T-SWIFT (Swift tests) — NOT_EXECUTED (no toolchain).
- **Acceptance criteria:** (1) Fixed delete order recorded; (2) periodic orphan-reconciliation job; (3) swallowed failure surfaced or retried.
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity note:** P2 stands per worker.

### AUD-33 — MEDIUM — Edge function observability is console logs only; retention unverified

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (repo); live retention NOT_VERIFIED.
- **Fresh evidence:** 56 `console.*` sites, 14 files; `admin-art` has zero logging; no structured logging/metrics; retention NOT_VERIFIED. See also R2-OPS-03 (no manual error reporting anywhere).
- **Test cases:** T-OPS-12 (logging inventory) — EXECUTED_PASS.
- **Acceptance criteria:** (1) Structured JSON logging + error-tracking hook, or confirmed log retention + daily error-scan in the system-check bot; (2) error-rate signal exists.
- **Release impact:** Beta: —. Launch: — (fold into R2-OPS-03 program). **Effort:** S–M.

### AUD-34 — LOW — Meal + items written in two non-transactional requests; totals stored redundantly, no sum check

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `SupabaseRemoteWriter` meal branch (`SupabaseRemoteWriter.swift:104-113`): two sequential upserts (`meal_entries` then `meal_entry_items`, both `ignoreDuplicates: true`) — a failure between them leaves an entry without items. Totals client-computed (`MealLog.swift:355-389`); no DB CHECK/trigger; DDL has no constraints beyond FKs/defaults. Display uses stored `total_*` (`MealDiary.swift:139`). Distinct happy-path rounding divergence filed separately (R2-ECO-08).
- **Test cases:** Client sequence — NOT_EXECUTED (Swift, no toolchain); SQL-side partial-failure shape determined by the code.
- **Acceptance criteria:** (1) Trigger/generated-column check reconciling totals, or totals computed in `DailyLog.recompute` from items; (2) partial-failure state impossible or self-healing.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-35 — LOW — `profiles.weight_kg` sync is best-effort, non-atomic, errors swallowed, racy

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `SupabaseWeightLog.write` (`SupabaseWeightLog.swift:40-47`) upserts `weight_logs`, then calls `syncProfileWeight` (`:49-65`), which reads for any newer-dated row (`gt("date")`, `:54-60`) and, if none, updates `profiles.weight_kg` with `_ = try?` (`:62-64`) — errors swallowed, no locking, no conditional update, no `weight_as_of`. Two concurrent writes can interleave so an older weight overwrites a newer profile value; a failed profile write is invisible. The sibling in `HealthSync.importWeighIns` (`HealthSync.swift:204-231`) propagates its error into the `.incomplete` report — strictly better, and the pattern `syncProfileWeight` should match at minimum.
- **Test cases:** T-F09 (conflict leg) — SPECIFICATION_ONLY. T-NEW-35 — NOT_EXECUTED.
- **Acceptance criteria:** (1) Conditional update (needs a `weight_as_of` column) or a trigger on `weight_logs`; (2) interleaved writes end with the newest-dated value; (3) profile-write failure surfaces.
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity note:** P2 per worker.

### AUD-36 — LOW — `body_checks` directly client-writable; "AI estimate" provenance forgeable within CHECK bounds

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `20261105090000_body_checks.sql`: CHECKs 3–60 for pct/low/high, `low <= pct <= high`, confidence enum, note ≤280, `UNIQUE(photo_id)`; policy "Users can CRUD own body checks" (`FOR ALL`, owner). `body-check/index.ts:155-160` writes via caller-token client; `clampBody` enforces width ≥2/≤12 + pct range (pct outside [3,60] → null → `not_body`, rejected not clamped). DB enforces ordering only, not width — direct REST writes can store width-0/width-57 intervals within the CHECKs.
- **Test cases:** T-ECO-15 — BLOCKED (no PG).
- **Acceptance criteria:** (1) Writes restricted to the edge function (service role) or a `source` column distinguishing AI vs manual rows; (2) width bounds enforced server-side.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-37 — LOW — All 12 edge functions run with `verify_jwt = false`; auth depends entirely on in-handler `requireUser`

- **R2 verdict:** PARTIALLY_CONFIRMED (configuration true; mitigations real + CI-enforced; residual risk is guard erosion). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Configuration claim TRUE: all 12 functions `verify_jwt = false` in `supabase/config.toml`. Mitigation is REAL and CI-enforced: all 11 auth-required handlers call `requireUser` first (verified individually; only OPTIONS/method guards precede it); `store-webhook` is the sole intentional exception; `native/tools/edge-auth.mjs` runs in `check.mjs` TWICE (lines 233, 539) asserting `requireUser(`, no `body.user_id` reads, and sub/role/aud checks incl. array-form aud. Residual risk: the ordering check looks for `claimCall(` while handlers now call `aiGate`, so it passes vacuously, and its success text still says "cả chín" (nine) vs 12 functions — filed as R2-API-09. Structural risk remains (a future handler forgetting `requireUser` is silently open), but the current state is guarded.
- **Test cases:** T-STATIC-01 (enumeration) — EXECUTED_PASS.
- **Acceptance criteria:** (1) CI check asserting every function except `store-webhook` calls `requireUser` first — kept live (see R2-API-09); (2) platform gate re-enablement considered where compatible.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-38 — LOW — UPDATE policies without `WITH CHECK` allow `user_id` mutation on 4 tables

- **R2 verdict:** NOT_REPRODUCIBLE — Round 1's exploit claim is wrong. **Evidence scope:** Behaviorally proven on a throwaway cluster. **Confidence:** HIGH.
- **Fresh evidence:** All 5 UPDATE policies without explicit `WITH CHECK` (`exercises`, `food_items`, `mascot_inventory`, `profiles`, `weekly_challenges`, `USING (auth.uid() = user_id)`) BLOCK `user_id` mutation: PostgreSQL uses the `USING` expression as the `WITH CHECK` when none is specified, so the new row is re-checked against ownership. Probes T-P3/P3b: `SET user_id = NULL` and transfer-to-B all fail `42501` RLS violation on all 5 tables, while normal owner updates succeed (positive controls). `mascot_inventory` is additionally trigger-protected (T-P4). Catalog sweep: no permissive UPDATE policy lacks an `auth.uid()` owner check; all `USING (true)` UPDATE policies are RESTRICTIVE. An early probe artifact ("weekly transfer succeeded") was a 0-row UPDATE after a failed INSERT (missing `week_start` NOT NULL) — invalidated and re-run correctly (T-P3b). **Residual:** missing explicit `WITH CHECK` is a clarity/robustness nit — recommend adding explicit `WITH CHECK (auth.uid() = user_id)` as P3 hygiene, NOT a vulnerability. **Do not cite as a vulnerability.**
- **Test cases:** T-P3/P3b — EXECUTED_PASS (finding NOT_REPRODUCIBLE). T-P4 — EXECUTED_PASS.
- **Acceptance criteria:** (1) Explicit `WITH CHECK` clauses added as hygiene in a future migration (no urgency; behavior already safe).
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity:** P3 hygiene.

### AUD-39 — LOW — `body_checks.photo_id` has no parent-owner check; UUID-squatting blocks a victim's write

- **R2 verdict:** CONFIRMED (behaviorally proven). **Evidence scope:** REPOSITORY_VERIFIED + probe. **Confidence:** HIGH.
- **Fresh evidence:** `body_checks` (`20261105090000_body_checks.sql`) has FK `photo_id → progress_photos(id)` CASCADE + `UNIQUE(photo_id)` + owner-only policy, but NO parent-owner check. Probe T-P5: B inserted a `body_checks` row pointing at A's photo UUID; A's own insert then failed `23505` — victim's body-check for that photo is denied. Precision: the `body-check` edge function uses the caller-token client with `.upsert(..., {onConflict: "photo_id"})` and an RLS-filtered photo lookup, so the squat requires direct PostgREST access (available to any authenticated user with the publishable key + JWT). B cannot read A's photo or A's rows.
- **Test cases:** T-P5 — EXECUTED_FAIL (defect demonstrated).
- **Acceptance criteria:** (1) Parent-owner check added (photo must belong to the caller), mirroring #149's fix; (2) squat probe fails after fix.
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity note:** P2 stands.

### AUD-40 — LOW — `dm_can_message(p_me, p_other)` is a privacy oracle; `p_me` never verified against `auth.uid()`

- **R2 verdict:** CONFIRMED (behaviorally proven). **Evidence scope:** REPOSITORY_VERIFIED + probes. **Confidence:** HIGH.
- **Fresh evidence:** `dm_can_message(p_me, p_other)` (`20261020130000…sql:83-101`) never checks `p_me` vs `auth.uid()`; granted to `authenticated`; only SQL caller is `dm_open` with `(v_me, p_other)`; NO client caller anywhere (Swift 0, RN 0, edge 0). Probe T-P6: unrelated user C got `false` for a blocked pair and `true` for an unblocked pair. Independently reproduced by the backend-auth worker (T-API-06). Fix (require `p_me = auth.uid()`) is safe: no caller passes anything else. Same class as new R2-DB-01; fix together.
- **Test cases:** T-P6 — EXECUTED_FAIL. T-API-06 — EXECUTED_FAIL.
- **Acceptance criteria:** (1) `p_me = auth.uid()` required (or parameter dropped); (2) direct calls as a non-party fail; (3) `dm_open` still works (suite).
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-41 — LOW — 8 trigger functions have no GRANT/REVOKE; default `EXECUTE TO PUBLIC` stands

- **R2 verdict:** CONFIRMED, exploitability corrected. **Evidence scope:** CATALOG_VERIFIED + probes. **Confidence:** HIGH (statements); exploitability corrected to none at the SQL layer.
- **Fresh evidence:** The 8 functions with no grant/revoke (default EXECUTE TO PUBLIC) are exactly as Round 1 listed: `community_blocks_unfollow`, `community_count_bump`, `community_profiles_guard`, `community_reports_autohide`, `handle_new_user`, `mascot_inventory_item_is_fixed`, `trim_coach_memory`, `update_updated_at_column` (5 definer, 3 invoker). Catalog C13: `has_function_privilege` = true for BOTH `anon` and `authenticated`. **Correction:** direct calls are NOT exploitable — probes T-P8r/P8b show all 8 fail with `0A000 trigger functions can only be called as triggers` (PostgreSQL refuses to execute trigger-returning functions outside trigger context), for both roles. The `20261001190000_core_rpc_no_anon.sql` comment ("không gọi được qua RPC") is thus behaviorally supported at the SQL layer; PostgREST-layer behavior is NOT_VERIFIED but PostgREST would surface the same engine error. Residual: privilege hygiene only — REVOKE EXECUTE as defense in depth. Do not present as an exploitable privilege escalation.
- **Test cases:** T-P8r/P8b — EXECUTED_PASS (exploitability corrected). T-API-04 (partial) — EXECUTED_PASS.
- **Acceptance criteria:** (1) Explicit `REVOKE EXECUTE ... FROM PUBLIC` (and from `authenticated`/`anon`) on all trigger-only functions; (2) suites green.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-42 — INFO — Default `TO PUBLIC` policies; anon can read shared-library rows

- **R2 verdict:** CONFIRMED (INFO, by design). **Evidence scope:** Probe. **Confidence:** HIGH.
- **Fresh evidence:** Probe T-P2: anon saw 884 `exercises` rows (883-row seed + 1 shared fixture) via `user_id IS NULL OR auth.uid() = user_id` with default PUBLIC; anon saw 0 `profiles`/`daily_logs` rows. Same pattern via EXISTS for `exercise_guide_content`/`exercise_media`/`exercise_media_content`. `reward_prices` correctly requires `auth.uid() IS NOT NULL`. By design; INFO stands.
- **Test cases:** T-P2 — EXECUTED_FAIL (INFO, by design — anon visibility is the intended behavior).
- **Acceptance criteria:** None (no action). Revisit if shared-library sensitivity changes.
- **Release impact:** —. **Effort:** —.

### AUD-43 — INFO/LOW — `search_path = public` on all functions; not the strictest pinning

- **R2 verdict:** CONFIRMED (LOW). **Evidence scope:** CATALOG_VERIFIED. **Confidence:** HIGH (setting); LOW (exploitability).
- **Fresh evidence:** 91 functions pin `search_path = public`; 3 unpinned, all invoker-rights and low-risk (catalog C3): `community_fold` (pure/immutable, no table refs), `mascot_inventory_item_is_fixed` (trigger, NEW/OLD only), `moderation_audit_immutable` (trigger, revoked, RAISE only). Exploitability requires CREATE privilege on `public` for anon/authenticated — NOT_VERIFIED live; no schema grants exist in migrations.
- **Test cases:** T-C3 (catalog group) — EXECUTED_PASS. Live CREATE-privilege check — BLOCKED (AUD-48 item 3).
- **Acceptance criteria:** (1) `SET search_path = ''` for new/changed functions; (2) schema privileges confirmed live.
- **Release impact:** —. **Effort:** S.

### AUD-44 — INFO — Legacy anon JWT in public git history (commit `3beafaca`, removed `ce8c73f8`)

- **R2 verdict:** PARTIALLY_CONFIRMED (corrections: key format; removal unverifiable). **Evidence scope:** REPOSITORY_VERIFIED (history sample, shallow clone). **Confidence:** HIGH (addition); removal NOT_VERIFIED.
- **Fresh evidence:** Commit `3beafaca` (2026-02-12) added `.env` with 3 keys — confirmed in history. **Correction:** the publishable key value is 210 chars and does NOT start with `eyJ` → it is an `sb_publishable_`-format key, NOT a legacy anon JWT as Round 1 called it. Still public-by-design material; rotation/validity NOT_VERIFIED. The removal commit `ce8c73f8` is NOT present in this shallow clone (0 refs contain it) — removal unverifiable here. `.env` is NOT tracked at tip; `.gitignore:26-29` excludes `.env`/`.env.*` except `.env.example`. No key value is printed anywhere in this report set.
- **Test cases:** None (history inspection; full-history check needs a non-shallow clone — BLOCKED here).
- **Acceptance criteria:** (1) Rotation/validity confirmed via dashboard; (2) removal commit verified in full history.
- **Release impact:** —. **Effort:** S.

### AUD-45 — INFO — Post-deletion retention: `moderation_audit_log.actor_id` survives; `dm_messages` deleted with sender (CASCADE)

- **R2 verdict:** CONFIRMED (design choice; privacy-policy coverage NOT_VERIFIED). **Evidence scope:** Probe. **Confidence:** HIGH.
- **Fresh evidence:** `dm_messages.sender_id → auth.users` CASCADE deletes the sender's messages; `dm_threads.user_a/user_b → community_profiles` CASCADE deletes the WHOLE thread when either party deletes their account. Probe T-P11r: 2 messages from both senders → 0 threads, 0 messages after D's `auth.users` row was deleted — E lost their own sent message too. Design choice; privacy-policy coverage NOT_VERIFIED. **R2 severity note:** P2 stands per worker (recipient data loss on counterparty deletion).
- **Test cases:** T-P11r — EXECUTED_FAIL (cascade demonstrated).
- **Acceptance criteria:** (1) Owner decision recorded: is whole-thread deletion the intended privacy posture? (2) Privacy-policy coverage confirmed.
- **Release impact:** Beta: —. Launch: —. **Effort:** S (decision).

### AUD-46 — LOW — No rate limiting on `verify-purchase` / `store-webhook` / `delete-account` / `admin-art`

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH (code); platform-level limiting NOT_VERIFIED.
- **Fresh evidence:** No limiter code in any of the 4 handlers or in `_shared/`; the only limiting in the system is daily `ai_gate` quotas (AI functions only) and RPC-local limits (`dm_send` 30/min, posting trigger, `dm_open` 20/day). Platform-level (Supabase/Kong) limiting NOT_VERIFIED. Exposure note: 3 of the 4 (`verify-purchase`, `store-webhook`, `admin-art`) are NOT_DEPLOYED_BY_DESIGN; `delete-account` is the live exposure (authenticated users, unbounded calls — each call re-runs storage listing + deleteUser).
- **Test cases:** None (absence); platform-limit check — BLOCKED (AUD-48).
- **Acceptance criteria:** (1) Edge-level rate limiting (dashboard/WAF) and/or JWS `x5c` pre-filter for the webhook (keeping re-verification authoritative); (2) Apple 429s monitored.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-47 — MEDIUM — `verify-purchase` ignores upsert errors on the expired/refunded path (fail-open)

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH.
- **Fresh evidence:** `verify-purchase/index.ts` — the `!ent` branch awaits the entitlements upsert WITHOUT checking `error`, then returns `{tier:"free"}`; the success branch checks error → 500. A failed upsert on the expired/refunded path therefore leaves a STALE entitlement row (e.g., an old `pro` row) while the client is told `free` — the server-side tier (`current_tier`) and the client-visible tier disagree until the next successful write. Live exposure reduced: function has no client caller and is NOT_DEPLOYED_BY_DESIGN; production impact NOT_VERIFIED.
- **Test cases:** Staging test with induced DB error — BLOCKED (no runtime/access).
- **Acceptance criteria:** (1) `!ent` branch checks the upsert error and returns 500 on failure, mirroring the success branch; (2) staging test with induced DB error returns 500 and leaves no stale row.
- **Release impact:** Beta: —. Launch: BLOCK (P0-6; fix before any purchase flow ships). **Effort:** S.

### AUD-48 — MEDIUM — Verification backlog: 16 live checks gate the certainty of this entire report

- **R2 verdict:** CONFIRMED (backlog still open; Round 2 extends it to 20). **Evidence scope:** N/A (verification gap by construction). **Confidence:** N/A.
- **Fresh evidence:** All 16 live checks still open; none runnable here. Round 2 adds 4 more: (17) scheduled-run history (R2-OPS-01); (18) E2E/a11y nightly runs existence; (19) telemetry-key presence in release builds; (20) backup/retention evidence for the privacy claim (R2-OPS-09). Full matrix with procedures: `04-production-verification.md`.
- **Test cases:** All 20 items — BLOCKED / NOT_VERIFIED — ACCESS UNAVAILABLE.
- **Acceptance criteria:** (1) Written record: applied-migration list matches repo (or gaps listed), RLS probes pass, deployed functions match repo, Auth settings confirmed, backups evidenced, telemetry live; (2) results recorded in the repo or the system-check bot.
- **Release impact:** Beta: BLOCK (P0-5). Launch: BLOCK. **Effort:** S (owner access).

### AUD-49 — MEDIUM — DM history shows only the oldest 500 messages; no pagination

- **R2 verdict:** CONFIRMED (functional defect, not a slow query). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `messages()`: oldest-first `LIMIT 500`, no cursor. Index exists, so the defect is functional, not a slow query.
- **Test cases:** None executed (Swift behavior NOT_EXECUTED).
- **Acceptance criteria:** (1) Newest-first keyset cursor (or oldest-first with jump-to-latest + backward paging); (2) 1,000-message thread shows newest messages; paging works both directions.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-50 — MEDIUM — Every replayed outbox entry triggers a ~13-query DailyLog rebuild; reconnect bursts multiply this

- **R2 verdict:** CONFIRMED (count corrected, scope expanded; R2-OPS-05 folded into this ID's remediation). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `DailyLog.queries` (`DailyLog.swift:147-182`) issues 1 `existing` select + 12 source selects = **13 selects**, plus 1 insert/conditional-update = **14 requests per day per attempt**; `recompute` retries up to `rebuildAttempts = 3` (`:22,436`) on OCC contention, so up to 42 requests/day under contention. `rebuildDays` (`:523-545`) returns **2 days** (session day + today) for every workout-kind entry whose day ≠ today — doubling the per-entry cost to 28 requests before retries. `readSources` (`:484-503`) is **sequential** in native (comment: "RN gửi song song… ở đây tuần tự"), so latency also amplifies ~12× vs the parallel RN baseline. `afterWrite` runs this after **every** replayed entry (`AppServices.swift:291-293`), with no coalescing across a drain. **R2-OPS-05 extension (folded here, not double-counted):** `load7d` and `load28d` both fetch full `sets` JSONB over overlapping windows; `supplements` fetches all supplement ids with no date bound (`DailyLog.swift:147-192`); a 20-entry drain costs ~280 sequential requests minimum, ~560 if backdated. The same `afterWrite` also runs a full widget refresh — filed separately as R2-SYNC-04 (distinct mechanism/fix). Worst-case per workout entry: 28 rebuild + 4 widget = 32 requests, sequential, before OCC retries.
- **Test cases:** T-F02 — SPECIFICATION_ONLY + counting leg NOT_EXECUTED. R2T-05 (drain coalescing) — NOT_EXECUTED.
- **Acceptance criteria:** (1) A 20-entry drain touching 2 distinct days issues ≤ 2 day-rebuilds' worth of source reads after coalescing (counted via a recording `RowStore`); (2) `readSources` issues its 12 reads concurrently; (3) wall-clock drain time for the 20-entry fixture improves ≥3× vs the sequential baseline (measured); (4) OCC/retry semantics unchanged (existing `DailyLogRebuildTests` green).
- **Release impact:** Beta: —. Launch: — (fix (1)+(2) before 100k actives). **Effort:** M.

### AUD-51 — MEDIUM — Like/save/comment/try triggers UPDATE the parent post row synchronously (hot-row serialization)

- **R2 verdict:** CONFIRMED (mechanism; magnitude unmeasured). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (mechanism); MEDIUM (when it bites).
- **Fresh evidence:** Each interaction = 2 synchronous post-row UPDATEs (count + useful) + notify work. Contention magnitude unmeasured.
- **Test cases:** None (no concurrency test in SQL suites — suites are sequential; see test plan §6).
- **Acceptance criteria:** (1) Lock waits on `community_posts` monitored (needs R2-OPS-03 observability); (2) counter sharding / deferred aggregation / batched recompute if contention observed; (3) decision recorded with evidence.
- **Release impact:** Beta: —. Launch: —. **Effort:** M (when needed).

### AUD-52 — MEDIUM — HealthKit sync re-reads full windows every run; no anchored queries

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `HealthKitSource.snapshot` (`HealthKitSource.swift:125-143`) re-reads fixed windows on every run — `HealthData.windows` (`HealthData.swift:249-254`): sleep 36h, bio/workouts 7d, step history 14d; weights 30d / water 7d (`HealthIntake.swift:14-16`). Four `HKObjectQueryNoLimit` queries (`:204,218,226,235`); bio reads limit-1 ×4 types; steps use statistics queries (cheap). Grep `HKAnchoredObjectQuery|HKQueryAnchor`: zero code hits. No anchor persisted anywhere. Dedup entirely server-side (`UNIQUE(user_id, external_id)` upserts), so every sync re-upserts identical rows. Multiplication: foreground auto-sync (≥15 min) + hourly HealthKit background delivery (`:120`) + manual syncs.
- **Test cases:** T-NEW-52 — SPECIFICATION_ONLY (second consecutive sync with no new samples issues ~0 upserts). T-F10 — repo leg NOT_EXECUTED.
- **Acceptance criteria:** (1) `HKQueryAnchor`s persisted per type, deltas only; (2) full-window kept as repair path; (3) second consecutive sync issues ~0 upserts with no new samples.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-53 — MEDIUM → LOW — Inefficient bounded reads: awards water scan (OFFSET) + `recentItems` unindexed scan

- **R2 verdict:** CONFIRMED, with a failure-mode correction; severity LOW. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Water OFFSET paging confirmed; failure mode is *throw*, not silent truncation (correction to Round 1). `recentItems` unindexed scan confirmed.
- **Test cases:** None executed.
- **Acceptance criteria:** (1) Distinct-dates query / window-bounded read for water; (2) two-step user-first filter (or covering index) for `recentItems`.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-54 — MEDIUM — Aggregate AI spend unbounded; no queue/backpressure; worst-case call latency ~180 s

- **R2 verdict:** CONFIRMED + expansion (vision ≈405 s). **Evidence scope:** REPOSITORY_ONLY. **Confidence:** MEDIUM (spend math exact; provider/plan limits NOT_VERIFIED).
- **Fresh evidence:** Code-verified in `_shared/ai.ts`: 3 providers × 3 attempts × 20 s header timeout ≈ 180 s non-vision (matches Round 1); **vision is worse: 3×3×45 s ≈ 405 s** (+ 600/1200 ms retry delays) — expansion. No aggregate/global budget, no queue, no backpressure, no body-read timeout anywhere in `_shared/` or handlers. Per-call daily quotas bound COUNT, not spend: token spend per call is unbounded (only `max_tokens` on some calls) and `spend_ai_tokens` accepts up to 10,000,000 tokens per record. Live latency NOT_VERIFIED. See also R2-OPS-04 (client timeout mismatch).
- **Test cases:** None executed (live behavior BLOCKED).
- **Acceptance criteria:** (1) Aggregate budget alerting + provider-side rate limits; (2) queue for non-interactive AI (nudges, weekly review); (3) alert fires at a test threshold.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-55 — MEDIUM — Useful-feed index column order reversed relative to the query's sort

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Index `(created_at DESC, useful_score DESC)` vs query sort `(useful_score DESC, created_at DESC)` — exact mismatch.
- **Test cases:** R2T-10 (EXPLAIN-shape) — NOT_EXECUTED.
- **Acceptance criteria:** (1) `(useful_score DESC, created_at DESC)` index added (possibly partial on the score threshold); (2) feed `EXPLAIN` shows index-ordered scan.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-56 — MEDIUM — No background outbox drain; sync runs only while foregrounded

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** The only background task is `.backgroundTask(.appRefresh(CommunityAlerts.taskId))` (`ASCNDApp.swift:153-155`), whose handler only schedules the next refresh and checks notifications — never touches `SyncWorker`. `BGTaskSchedulerPermittedIdentifiers` lists only `com.ascnd.fitnessos.community-refresh`; `UIBackgroundModes` is `fetch` only. `didEnterBackground` only suspends the network monitor. HealthKit background delivery wakes the app for Health sync only (no `sync.kick()`). All outbox drain triggers are foreground/session events.
- **Test cases:** T-F02/T-F06 legs — SPECIFICATION_ONLY/NOT_EXECUTED. Background-task inventory — executed by grep.
- **Acceptance criteria:** (1) Background task draining the outbox (idempotency makes this safe) OR the foreground-only contract documented; (2) queued entries drain without foregrounding.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-57 — MEDIUM — No DB health monitoring or alerting; advisors checked daily by bot only

- **R2 verdict:** PARTIALLY_CONFIRMED (corrections: schedule dead; bot covers more than advisors). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (repo); live dashboard config NOT_VERIFIED.
- **Fresh evidence:** No alerting confirmed; but "daily bot checks" is wrong — the schedule never fires (R2-OPS-01: default branch `main` has no workflows); the bot runs push-triggered only and covers more than advisors (migration diff, function code diff, liveness probe, secret presence). Bot first run (28/10): 73 security + 114 performance advisor warnings, unaddressed, no triage record.
- **Test cases:** T-OPS-17 (bot live run) — BLOCKED (needs tokens).
- **Acceptance criteria:** (1) Dashboard alerts + `pg_stat_statements` review cadence + baselines; (2) alert on function error rate; (3) scheduled bot runs restored (R2-OPS-01); (4) advisor backlog triaged.
- **Release impact:** Beta: —. Launch: — (fold into R2-OPS-03 program). **Effort:** S–M.

### AUD-58 — MEDIUM — Sentry/PostHog keys empty in committed config; release-build telemetry liveness unverified

- **R2 verdict:** CONFIRMED (scope expands: zero manual error capture — R2-OPS-03). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (repo); release liveness NOT_VERIFIED.
- **Fresh evidence:** Keys empty in committed config; `Telemetry` no-ops without keys; release liveness NOT_VERIFIED. Release keys live only in the Archive machine's uncommitted `Backend.local.xcconfig` (per TESTFLIGHT-CHECKLIST.md, a claim, not evidence). No manual `capture` calls exist (R2-OPS-03).
- **Test cases:** Release-build telemetry check — BLOCKED (needs a release build + dashboard). R2T-06 — SPECIFICATION_ONLY.
- **Acceptance criteria:** (1) Release pipeline injects keys (verified, not assumed); (2) release-checklist item + "telemetry live" check in the system-check bot; (3) Sentry shows release-build events.
- **Release impact:** Beta: —. Launch: BLOCK (fold into R2-OPS-03/06 gates). **Effort:** S.

### AUD-59 — MEDIUM — Realtime NOT IMPLEMENTED; DMs/notifications/feeds are poll-based

- **R2 verdict:** CONFIRMED (precision correction: fetch-on-demand, not timer polling). **Evidence scope:** REPOSITORY_VERIFIED (code); dashboard NOT_VERIFIED. **Confidence:** HIGH (code).
- **Fresh evidence:** Grep `channel(` / `.subscribe(` / `postgres_changes` / `realtime` over `apps/ios` Swift: zero hits (the one `subscribe` hit is an RN comment). No `publication` SQL in migrations; no `realtime` section in `supabase/config.toml`. DM history loads on view appear + pull-to-refresh; inbox likewise; feeds load on appear/refresh. **Correction:** no interval-timer polling was found — freshness is fetch-on-appear + manual refresh + foreground reloads. The finding stands (no live updates; stale inboxes between visits), but "poll-based" should be read as "fetch-on-demand". Dashboard publication state NOT_VERIFIED.
- **Test cases:** T-NEW-59 — SPECIFICATION_ONLY (expected: FAIL — no channel; documents the gap).
- **Acceptance criteria:** (1) Only if live chat is required: per-thread channels + broadcast RLS designed deliberately; (2) otherwise, the fetch-on-demand contract documented as a product decision.
- **Release impact:** Beta: —. Launch: —. **Effort:** L (if built).

### AUD-60 — MEDIUM — No server-side scheduling (no `pg_cron`, scheduled functions, DB jobs)

- **R2 verdict:** PARTIALLY_CONFIRMED (repo scope confirmed; dashboard cron NOT_VERIFIED). **Evidence scope:** REPOSITORY_VERIFIED + NOT_VERIFIED. **Confidence:** HIGH (repo).
- **Fresh evidence:** Zero hits for `pg_cron`/`cron.schedule`/scheduled-function config in `supabase/` + `.github/`; no DB jobs; no maintenance jobs. Dashboard-configured cron would not appear in the repo and is NOT_VERIFIED — hence partial. No scheduled work exists in code; tier expiry is evaluated lazily by `current_tier` at read time.
- **Test cases:** Dashboard cron check — BLOCKED (AUD-48).
- **Acceptance criteria:** (1) Dashboard cron existence confirmed or ruled out; (2) `pg_cron` (or scheduled functions) added for retention/reconciliation/notification jobs when the product needs them.
- **Release impact:** Beta: —. Launch: —. **Effort:** M.

### AUD-61 — MEDIUM — Admin/moderation RPC surface has no native caller (21 functions granted, RN-only)

- **R2 verdict:** PARTIALLY_CONFIRMED (reconciled scope; two Round 1 errors corrected). **Evidence scope:** CATALOG_VERIFIED + caller analysis. **Confidence:** HIGH (no-caller); intent UNVERIFIED.
- **Fresh evidence:** Admin/mod surface is role-gated in-body (verified: all 7 `admin_*` + 12 `mod_*` call `moderation_require`; probe T-P14: non-admin `admin_users` → `42501 forbidden: admin role required`; revoked helpers → permission denied). Reconciled scope: 59 functions granted to `authenticated`; 29 called from Swift; the rest are edge-called (`ai_gate`, `spend_ai_tokens`, `claim_ai_call`, `my_app_role`, `admin_add_art` via `admin-art`), RN-called (19 admin/mod + `earn_mascot_coins` + `use_streak_freeze`), SQL-internal-but-granted (`community_blocked_between`, `reward_amount_for`, `dm_can_message`, `community_fold`), or no-caller. **Corrections:** Round 1's "21" count and its "RN-only" wording for `community_request_review` are wrong — that function has NO caller anywhere (Swift 0, RN 0, edge 0): dead-but-exposed. Note (not a finding): `bootstrap_first_admin` has a TOCTOU race — requires the service_role key, so attacker capability is ~nil; do not inflate.
- **Test cases:** T-P14 — EXECUTED_PASS.
- **Acceptance criteria:** (1) Owner decision: build the native admin/moderation UI, or revoke grants for functions with no native caller; (2) granted RPC list matches callers.
- **Release impact:** Beta: —. Launch: —. **Effort:** S (decision) / L (UI).

### AUD-62 — LOW — Head-of-line blocking in the single-lane outbox; dead letters have no resend path

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH (lane); MEDIUM (no-resend — absence verified by grep).
- **Fresh evidence:** `Outbox.next()` (`Outbox.swift:127-140`) examines only the head; `failed()` (`:155-170`) keeps a retryable head in place with `notBefore` backoff. Blocking is bounded but real: a transiently failing head holds the lane through up to 4 sends with 1s+2s+4s backoffs (≈7s minimum) plus up to 25s per send attempt under the `StallRecovery` timeout — a persistently slow-failing head can stall all later entries for ~2 minutes before exhausting to dead. Permanent failures and wrong-account heads unblock immediately. Offline heads wait indefinitely (correct). Dead-letter recovery: none. `ConnectionBanner.deadBar` shows a count and a dismiss (×) button only; its own comment states: "Chưa có màn danh sách / gửi lại … nên chỉ báo và cho tắt." No `retryDead`/`requeue`/resend symbol exists. Dead entries must be re-entered manually, and after the 14-day `workout_day` prune even the day context is gone.
- **Test cases:** T-F04 — repo leg NOT_EXECUTED; timing leg SPECIFICATION_ONLY.
- **Acceptance criteria:** (1) Skip-after-N-head-failures with reorder, or a "retry dead" action re-enqueueing with a fresh budget (same idempotency key); (2) dead entries recoverable without manual re-entry.
- **Release impact:** Beta: —. Launch: —. **Effort:** M. **R2 severity note:** P2 per worker.

### AUD-63 — LOW — Read caches have no TTL or staleness indication (11 namespaces)

- **R2 verdict:** PARTIALLY_CONFIRMED (mechanism partially exists for 1–2 namespaces; user-facing defect stands for all). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** The `read_cache` table has no `fetched_at` column and `ReadCacheTable` does pure overwrite-on-refresh with no TTL — confirmed. BUT: `TemplateSnapshot.fetchedAt` exists and a 30-min `ExerciseGuide` gate exists — unconsumed by UI. Decisively, **no view consumes `TodayController.source`**: grep for `.source` consumers in Today/Workout views returns nothing, so even the one provenance signal never reaches the user as a staleness indication. After a failed refresh, all 11 namespaces show arbitrarily old data as if current.
- **Test cases:** T-NEW-63 — SPECIFICATION_ONLY (simulator, airplane mode; expected: FAIL on all 11 namespaces today).
- **Acceptance criteria:** (1) `fetched_at` + stale UI affordance for affected screens; (2) each cached screen shows a staleness indication after a failed refresh.
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity:** P3.

### AUD-64 — LOW — `claim_quest_reward` returns the amount even on duplicate (no-op) claims; client 23505 branches dead

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED + executed (T-API-08). **Confidence:** HIGH.
- **Fresh evidence:** SQL: `ON CONFLICT DO NOTHING` + unconditional `RETURN v_amount` (`20261029130000_koa_quests_v2.sql:134-138`; same in `20260819120000`). Dead 23505 branches confirmed in `KoaWeek.swift:145-148`, `:160-163`, `WeeklyChallenges.swift:407-417`. `AppServices.swift:555-557` comment documents the behavior and works around it with per-device UserDefaults `seen` keys. Fresh consequence: `MascotRoomController.claim` (`MascotRoom.swift:366-380`) computes level-up from assumed `xpGain` after `reloadLedger()`, not from reloaded XP — a stale-ledger duplicate claim can fire a false level-up celebration. Related but distinct: ceiling-before-dedup filed as R2-ECO-02; unbounded `p_reason` filed as R2-API-07 (narrowed).
- **Test cases:** T-ECO-05 — BLOCKED (no PG). T-API-08 — EXECUTED_FAIL (both claims returned 35; 1 ledger row).
- **Acceptance criteria:** (1) Duplicate claims return a distinguishable result (amount + `claimed` boolean, 0, NULL, or a `duplicate` flag); (2) dead 23505 branches removed or the contract documented; (3) level-up computed from reloaded XP.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-65 — LOW — `buy_mascot_item` already-owned check sits outside the advisory lock → concurrent duplicate buy surfaces raw 23505

- **R2 verdict:** PARTIALLY_CONFIRMED (code-level confirmed; race manifestation unexecuted). **Evidence scope:** REPOSITORY_VERIFIED (code); concurrency behavior NOT_VERIFIED. **Confidence:** HIGH (code).
- **Fresh evidence:** `EXISTS` check at `20260815120000_economy_balance_lock.sql:83-84`, advisory lock at line 89 — the check is outside the lock, unlike `buy_streak_freeze` (checks inside lock). Two concurrent buys of the same unowned item can both pass the check; the second then fails on the inventory unique constraint. No double charge (transaction rolls back) — the defect is the raw 23505 surfacing instead of the friendly 'already owned' error.
- **Test cases:** T-ECO-06 — BLOCKED (no PG; concurrent manifestation unexecuted).
- **Acceptance criteria:** (1) Check moved inside the lock or `unique_violation` caught → 'already owned'; (2) concurrent duplicate buys yield exactly one inventory row + friendly error.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-66 — LOW — `spend_ai_tokens` / `ai_gate` / `claim_ai_call` directly callable by any authenticated user

- **R2 verdict:** CONFIRMED + expansion. **Evidence scope:** CATALOG_VERIFIED + executed. **Confidence:** HIGH.
- **Fresh evidence:** Catalog-verified grants (`auth+svc`, anon revoked — T-API-11) and executed direct calls as `authenticated` (T-API-01/02/04). Expansions: (a) `claim_ai_call` has NO live edge caller (legacy wrapper; all handlers use `aiGate`) — its direct exposure is pure attack surface with zero function; (b) the unknown-kind row-count bound was REGRESSED in the `ai_gate` rewrite — filed as R2-API-01.
- **Test cases:** T-API-01/02/04 — EXECUTED (see R2-API-01; T-API-04 EXECUTED_PASS). T-API-11 — EXECUTED_PASS.
- **Acceptance criteria:** (1) Accept and document (self-harm only), or restrict to `service_role` (trades RLS context — not recommended without care); (2) `claim_ai_call` exposure decided (revoke or document).
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-67 — LOW — No client-side timeouts on edge calls; server timeout covers headers only

- **R2 verdict:** PARTIALLY_CONFIRMED (blanket claim outdated; remaining hole real and narrow). **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH (code); Swift behavior NOT_EXECUTED.
- **Fresh evidence:** `StallRecovery.makeSession()` sets 25 s request timeout + stall-flush and backs the SupabaseClient (`Backend.swift:18`), covering `functions.invoke`, RPC, and PostgREST. The remaining hole: `SupabaseCoachStream` uses `URLSession.shared` by default (`SupabaseCoach.swift:18`) with a bare `URLRequest` and no timeout set → 60 s system default, no stall-flush — the streaming coach call (the longest-lived call in the app) is the one without protection. `probeAI` sets 8 s. See also R2-OPS-04 (25 s vs non-streaming AI).
- **Test cases:** T-SWIFT behavior — NOT_EXECUTED. R2T-04 — NOT_EXECUTED.
- **Acceptance criteria:** (1) Explicit `timeoutIntervalForRequest` on the coach stream + edge invocations (dedicated AI-call timeout policy per R2-OPS-04); (2) body-read timeout server-side when a real incident justifies it.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-68 — LOW — `spend_ai_tokens` silently drops token records when no `ai_usage` row exists (UTC-midnight boundary)

- **R2 verdict:** CONFIRMED (executed). **Evidence scope:** REPOSITORY_VERIFIED + executed. **Confidence:** HIGH.
- **Fresh evidence:** Executed T-API-03: `spend_ai_tokens` with NO `ai_usage` row for the current UTC day creates NO row (UPDATE-only) — the token record is silently lost — while the overage debit STILL applies when a credit row exists (10,000 → 7,000 with zero usage rows). The midnight-boundary mechanism is exactly this: gate claims on day N, provider response lands after UTC midnight on day N+1, `spend` targets day N+1 where no row exists. The migration comment's claim ("hệ thống không bao giờ mất bản ghi") is FALSE in this case.
- **Test cases:** T-API-03 — EXECUTED_FAIL (defect demonstrated).
- **Acceptance criteria:** (1) Upsert the `ai_usage` row in `spend_ai_tokens` instead of update-only; (2) no debit without a record (probe).
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-69 — LOW — `ai-coach-memory` writes non-transactional across drop/add/confirm; failures only logged

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH.
- **Fresh evidence:** Three sequential non-transactional writes via service role; drop failure → `console.error` ONLY (continues); add failure → 500 AFTER drop already applied; confirm failure → `console.error` ONLY. Parse failure is indistinguishable from "nothing changed". No retry/idempotency. Behavior test BLOCKED (needs live function + AI gateway).
- **Test cases:** T-LIVE-02 — BLOCKED (Deno + stubbed DB fault injection specified).
- **Acceptance criteria:** (1) Three writes wrapped in a single RPC/transaction, or partial-failure status returned for client retry; (2) drop-succeeds + add-fails no longer loses a fact silently.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-70 — LOW — `ai-meal-suggest` / `ai-smart-nudges` / `ai-weekly-review` return model output without plausibility/shape validation

- **R2 verdict:** CONFIRMED (client question RESOLVED: no clamping on magnitudes). **Evidence scope:** REPOSITORY_VERIFIED + executed helper tests. **Confidence:** HIGH.
- **Fresh evidence:** `ai-meal-suggest` returns `args.suggestions` verbatim, `ai-smart-nudges` returns `args.nudges` verbatim (prompt says ≤60 chars, unenforced), `ai-weekly-review` returns analysis verbatim (`score` unclamped). Client-side: NO clamping on magnitudes — `AIFood.suggestions()` drops only empty-name/kcal≤0, `rounded()` = JS.round with no upper bound, `WeeklyAnalysis` score = finite-only, `SmartNudges.parse()` untruncated with free-string `type`. Contrast (positive, executed T-TS-01..20): `scan-food`/`body-check`/`ai-log-parse` DO clamp/drop implausible output. The gap is confined to the three tool-call functions.
- **Test cases:** T-TS-01..20 — EXECUTED_PASS (20 helper executions; the contrast cases). Handler-level validation tests — BLOCKED (T-LIVE).
- **Acceptance criteria:** (1) Server-side clamps mirroring `clampItems` (macro/kcal bounds, score 0–100, enum allow-lists); (2) implausible outputs rejected/clamped in tests.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-71 — LOW — Wasted reads in edge functions

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `ai-weekly-review`: `prevWeekRes` fetched and NEVER referenced (grep-verified zero uses beyond destructuring, line 52). `ai-coach`: double workout read (`workout_sessions` 14 + `lifts` 60). `profiles select("*")` in 4 functions; `daily_logs`/`sleep_logs` `select("*")` in `ai-weekly-review`.
- **Test cases:** T-STATIC-01 (enumeration) — EXECUTED_PASS.
- **Acceptance criteria:** (1) Dead query deleted; (2) one 8-week query; (3) explicit profile columns.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-72 — INFO — Public-by-design social reads: follow graph enumerable; `community_profiles` SELECT `USING (true)`

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Follow graph enumerable via `USING (true)` SELECT on `community_follows`/`community_profiles` (`TO authenticated`); `community_profiles` has no sensitive columns; no private-account setting exists. INFO stands. Note: UUID enumerability via this surface is what makes the R2-DB-01/AUD-40 oracles practical.
- **Test cases:** None (design observation).
- **Acceptance criteria:** None unless private accounts are introduced — then re-audit.
- **Release impact:** —. **Effort:** —.

### AUD-73 — INFO — No certificate pinning (ATS defaults, no exceptions)

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** No ATS exceptions in `project.yml`; no pinning code (`serverTrust`/challenge handlers) — grep hits were false positives (e.g. `SpinningIcon`). Acceptable for a Supabase-backed app.
- **Test cases:** None.
- **Acceptance criteria:** None. No action.
- **Release impact:** —. **Effort:** —.

### AUD-74 — INFO — No explicit `beforeSend` scrubber in native telemetry; relies on SDK defaults + discipline

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `Telemetry.start` (`Telemetry.swift:70-96`) configures Sentry with `sendDefaultPii = false`, `tracesSampleRate = 0.2`, PostHog with screen views / lifecycle / replay disabled — and no `beforeSend`, `beforeBreadcrumb`, or scrub callback anywhere in `apps/ios` Swift (grep-verified). The fixed `Event` enum prevents free-form event names, but `capture(_:_:)` (`:117-120`) accepts an unrestricted `[String: String]` props dict — enforcement is by discipline. Audit of all ~30 call sites: props are counts, enum raw values, fixed keys — no email, name, health metric, or free text found, so current behavior is clean but unguarded. The RN side HAS a scrubber (`native/src/lib/telemetry-scrub.ts`, legacy) whose tests were never ported. Sentry SDK defaults are the only backstop for crash reports.
- **Test cases:** T-NEW-74 — NOT_EXECUTED (ported RN scrub tests; expected: FAIL — no scrubber exists).
- **Acceptance criteria:** (1) `beforeSend` allowlist ported + RN scrub tests ported; (2) lint/test asserting props keys; (3) synthetic PII/health values stripped in tests.
- **Release impact:** Beta: —. Launch: —. **Effort:** S. **R2 severity:** P3.

### AUD-75 — INFO — Local GRDB caches unencrypted at rest; App Lock is a UX gate, not encryption

- **R2 verdict:** PARTIALLY_CONFIRMED (correction: file protection IS set). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** No SQLCipher/encryption: true. App Lock is a UX gate: true (`AppLockController.swift`, `.deviceOwnerAuthentication`, UserDefaults relock pref). **Correction:** file protection IS set — `databasePath()` in `AppServices.swift:1622-1626` sets `.completeUntilFirstUserAuthentication` on the Application Support directory containing `ascnd.sqlite`. Round 1's "no file-protection flags" is wrong. No Data Protection entitlement declared (entitlements = app-groups + HealthKit only). `DataExportView.swift:245` uses `.completeFileProtection` for exports.
- **Test cases:** None (configuration inspection).
- **Acceptance criteria:** (1) SQLCipher + file protection considered for health data at rest (decision recorded); (2) Data Protection entitlement evaluated.
- **Release impact:** Beta: —. Launch: —. **Effort:** S–M.

### AUD-76 — INFO — Edge CORS `Access-Control-Allow-Origin: *` (no credentials)

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** CORS `Access-Control-Allow-Origin: *`, no credentials, in `_shared/guard.ts` `corsHeaders`; standard pattern; tokens are Keychain-held, not cookies. INFO stands.
- **Test cases:** None. **Acceptance criteria:** None. No action.
- **Release impact:** —. **Effort:** —.

### AUD-77 — INFO — Community posting/report rate-limit counters are non-atomic (trigger counts)

- **R2 verdict:** CONFIRMED (INFO; scope expanded to `dm_send`). **Evidence scope:** REPOSITORY_ONLY (concurrency overshoot NOT executed). **Confidence:** HIGH (code).
- **Fresh evidence:** `community_posting_guard` (10 posts/hr, 30 comments/hr) and `community_reports_guard` (10/24h) use plain `count(*)` without locking — concurrent inserts can overshoot by burst size; posting guard exempts moderators/admins. **Scope expansion (same class):** `dm_send`'s 30/min check is the identical non-atomic pattern (`20261020130000…sql`, count query before INSERT). Concurrency overshoot was NOT behaviorally executed (would need parallel sessions; low value) — static code evidence only.
- **Test cases:** None executed (parallel-session test not run; low value).
- **Acceptance criteria:** (1) Acceptable as-is; note for moderation tuning; (2) revisit if abuse observed.
- **Release impact:** —. **Effort:** —.

### AUD-78 — INFO — Direct RPC quota burn is self-harm only

- **R2 verdict:** CONFIRMED. **Evidence scope:** Executed. **Confidence:** HIGH.
- **Fresh evidence:** Direct `ai_gate`/`claim_ai_call` calls burn the CALLER's own quota (T-API-01/02 — rows keyed by `auth.uid()`); edge functions pass fixed literals, so invented kinds buy no model calls. Bounded by R2-API-01: the self-harm extends to unbounded ROW creation (storage/write amplification), still confined to the caller's own rows. No cross-user quota effect exists.
- **Test cases:** T-API-01/02 — EXECUTED (see R2-API-01/AUD-23).
- **Acceptance criteria:** None (see AUD-66). No action beyond R2-API-01.
- **Release impact:** —. **Effort:** —.

### AUD-79 — INFO — Barcode lookup hits Open Food Facts (barcode-only, percent-encoded, no key/PII)

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `BarcodeLookup.url()` (`ASCNDCore/Nutrition/BarcodeLookup.swift:37-40`) builds `https://world.openfoodfacts.org/api/v2/product/<code>.json`, percent-encoded excluding `/?#`; caller uses plain `URLSession.shared.data(from:)` with no headers/identifiers; barcode + IP revealed to Open Food Facts; privacy-policy coverage NOT_VERIFIED.
- **Test cases:** None. **Acceptance criteria:** (1) Privacy-policy coverage confirmed (AUD-48 item 9).
- **Release impact:** —. **Effort:** S.

### AUD-80 — INFO — App Group container holds only widget display data; no session tokens

- **R2 verdict:** CONFIRMED (INFO, good). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** App Group `group.com.ascnd.fitnessos` holds only widget display data: `ascnd.widget.todayWorkout`, `ascnd.widget.streakReadiness`, `ascnd.widget.lang`, `ascnd.widget.koa`, `ascnd.widget.meal` (meal names/kcal/entryId), plus Koa PNGs. No tokens/userIds in the structs. `clear()` on sign-out removes data keys + images (language key intentionally kept).
- **Test cases:** None. **Acceptance criteria:** None. No action.
- **Release impact:** —. **Effort:** —.

### AUD-81 — INFO — Reward daily ceiling uses the UTC day while claim keys use local dates

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `date_trunc('day', now())` in `claim_quest_reward` (`20261029130000_koa_quests_v2.sql:125`) vs `d:` key window +1/−2 local days in `reward_amount_for` (lines 60-61). Edge-of-day only. Note: `claim_community_challenge`'s ceiling also uses `date_trunc('day', now())` but sums ALL positive amounts including `x:` — the `x:` inconsistency is filed as R2-ECO-05.
- **Test cases:** BLOCKED (no PG; would need clock control).
- **Acceptance criteria:** (1) Accept, or compute in caller-local day (new trust input — not clearly better); (2) decision recorded.
- **Release impact:** —. **Effort:** S.

### AUD-82 — INFO — `store-webhook` 64 KiB check runs after `req.json()` parses the full body

- **R2 verdict:** CONFIRMED. **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH.
- **Fresh evidence:** `store-webhook/index.ts:86` parses the full body with `req.json()`; the `signed.length > MAX_PAYLOAD` (64 KiB) check runs at `:93`, AFTER the body is parsed and allocated. An oversized body is fully parsed before rejection. (The JWS itself is only unverified-decoded to find the transaction id; state is re-resolved via Apple — the parse-before-check is a resource-exhaustion shape, not an auth bypass.) Function is NOT_DEPLOYED_BY_DESIGN; live exposure NOT_VERIFIED.
- **Test cases:** None (handler execution BLOCKED).
- **Acceptance criteria:** (1) Streaming/length pre-check before parse; (2) platform body limits confirmed.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-83 — INFO — Two eras of schema style, zero enums

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** Two style eras (`UUID` 33× in 2026-02 core vs lowercase `uuid` later; `TIMESTAMPTZ` spellings), zero enums, `water_logs` has `date` + `logged_at` + `created_at`, Vietnamese default `'Khác'` in `grocery_items.category` (`20260212060013…sql:48`). Cosmetic + onboarding friction.
- **Test cases:** None. **Acceptance criteria:** None. No action required.
- **Release impact:** —. **Effort:** —.

### AUD-84 — LOW — `community_posts.source_id` polymorphism undocumented; UNIQUE kind-blind

- **R2 verdict:** CONFIRMED (behaviorally proven). **Evidence scope:** Probe. **Confidence:** HIGH.
- **Fresh evidence:** `community_posts.source_id` FK-less polymorphic uuid; `UNIQUE(author_id, source_id)` is kind-blind (NULL-tolerant); meaning varies by `kind`. Probe T-P13r: `share_recipe` on a UUID already shared via `share_workout` fails `23505 already shared` — the RPC's own check and the UNIQUE backstop are both kind-blind, so one source UUID can never be shared as two kinds.
- **Test cases:** T-P13r — EXECUTED_PASS (constraint enforced; design rigidity confirmed).
- **Acceptance criteria:** (1) Per-kind semantics documented in a comment + CHECK, or typed columns split.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

### AUD-85 — INFO — `image_source` CHECK allows only `'library'`; `buy_streak_freeze` two overloads; uncommented price migration

- **R2 verdict:** CONFIRMED (INFO). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `image_source` CHECK allows only `'library'` (`20261002120000…sql:68`); `buy_streak_freeze` two live overloads; grocery price migration `20260212060827…sql` is a single uncommented ALTER. Dead weight / API-surface duplication.
- **Test cases:** None. **Acceptance criteria:** Cleanup when convenient.
- **Release impact:** —. **Effort:** S.

### AUD-86 — INFO — Local store is JSON-blob key-value, not a relational mirror (observation)

- **R2 verdict:** CONFIRMED (observation; no defect asserted). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `Database.swift:28-83` — four tables, every payload column a `TEXT` JSON blob (`entry`, `dead`, `state`, `json`), primary keys/uniques only, no FKs, no secondary indexes, no JSON queries. `OutboxStore`'s own header states the design: one `Codable` per row, no second column mapping. Offline truth rests on the outbox worker + row mappings. Retention consequences filed separately as R2-SYNC-03.
- **Test cases:** None. **Acceptance criteria:** None (architecture fact).
- **Release impact:** —. **Effort:** —.

### AUD-87 — INFO — Health import has no transaction; partial states possible but reported (observation)

- **R2 verdict:** CONFIRMED (observation; no action required per Round 1, retained). **Evidence scope:** REPOSITORY_VERIFIED. **Confidence:** HIGH.
- **Fresh evidence:** `RowStore` (`DailyLog.swift:408-418`) exposes only `select/insert/update/upsert` — no transaction/batching API — so `HealthSync.run` (`HealthSync.swift:71-202`) cannot be atomic. Two-phase error handling confirmed: bio/sleep/workout writes share one `do/catch` that throws `.write` and aborts the run (`:78-129`); `daily_logs`/weigh-in/water/rebuild failures are collected per part and reported once as `.incomplete([String])` (`:133-201`). Partial states are possible but reported, and every write is an idempotent upsert so the next sync self-heals. One inconsistency filed separately as R2-SYNC-06 (fail-fast first section vs partial-tolerant second section).
- **Test cases:** T-F10 — repo leg NOT_EXECUTED; HealthKit leg SPECIFICATION_ONLY.
- **Acceptance criteria:** None (retained observation).
- **Release impact:** —. **Effort:** —.

### AUD-88 — INFO — `verify-purchase` / `store-webhook` build the service client from platform env directly, ignoring the indirection

- **R2 verdict:** CONFIRMED + expansion (3 of 12 functions). **Evidence scope:** REPOSITORY_ONLY. **Confidence:** HIGH.
- **Fresh evidence:** `verify-purchase/index.ts:100` and `store-webhook` use direct `Deno.env.get("SUPABASE_URL"/"SUPABASE_SERVICE_ROLE_KEY")`. **Expansion: `delete-account/index.ts:84` does the same** — 3 of 12 functions bypass the `dbUrl()`/`dbServiceKey()` indirection (which exists precisely so secret names/rotation have one choke point). The other 9, including `admin-art`, use the indirection. Risk is config drift/rotation miss, not a live secret leak (no values printed anywhere).
- **Test cases:** T-STATIC-01 (enumeration) — EXECUTED_PASS.
- **Acceptance criteria:** (1) All 12 functions use the indirection consistently.
- **Release impact:** Beta: —. Launch: —. **Effort:** S.

**Part A totals: 72 CONFIRMED, 15 PARTIALLY_CONFIRMED, 1 NOT_REPRODUCIBLE (AUD-38), 0 FIXED_AND_VERIFIED, 0 NOT_VERIFIABLE, 0 SUPERSEDED, 0 NEW_EVIDENCE_REQUIRED = 88.** (Note: the db-security working paper's summary counts line reads 27/4/1, but its own 32 verdict rows show 26 CONFIRMED / 5 PARTIALLY_CONFIRMED / 1 NOT_REPRODUCIBLE — AUD-61 is PARTIALLY_CONFIRMED in its row. The rows govern; the totals above follow the rows.)

---

## Part B — New Round 2 findings (42)

### R2-DB-01 — P3 — `community_blocked_between(a, b)` is a block-graph oracle callable by any authenticated user about any pair

- **Confidence:** HIGH (behaviorally proven). **Evidence scope:** CATALOG_VERIFIED + probe on a throwaway PG16 cluster; production NOT_VERIFIED. **Effort:** M (fix is subtle — naive fix breaks triggers/policies). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `community_blocked_between(a uuid, b uuid)` (`20260927120000_community_foundation.sql:110-124`) is SECURITY DEFINER, returns whether a block row exists in either direction, and contains **no `auth.uid()` check and no `moderation_require` call** — the only definer RPC (besides AUD-40's `dm_can_message`) with no caller-identity check that returns user-relationship data. Grant: `GRANT EXECUTE … TO authenticated` (catalog C13 confirms `authenticated` = true, `anon` = false). RLS contrast: `community_blocks` SELECT policy restricts reads to rows where the caller is a party; direct reads by a third party return 0 rows — the RPC bypasses that restriction by design of SECURITY DEFINER. User UUIDs are enumerable via the public `community_profiles` SELECT (`USING (true)`, AUD-72) and post author IDs. Sweep: all other definer bodies with no `auth.uid()`/no `moderation_require` were reviewed — the rest are triggers, revoked helpers, a pure price lookup, or delegations to checked functions.
- **User/business impact:** Privacy only. Blocking is a sensitive social signal. An attacker can determine whether any two users have blocked each other, at scale, despite RLS deliberately restricting direct reads. No data beyond the boolean is leaked; the function does not distinguish direction. No write, account, or payment impact.
- **Exploitability/likelihood:** Trivial (one PostgREST RPC call); likelihood LOW (requires motive to map the block graph; no financial or account-takeover value). No rate limiting applies to direct RPC calls.
- **Safe-environment exploitation (executed, probe T-P7):** synthetic users F, G, C; F blocks G; as unrelated C: `SELECT community_blocked_between(F, G)` → **`true`**; control: `SELECT count(*) FROM community_blocks` as C → **0 rows**.
- **Why the fix is subtle:** the function is called from RLS policies AND trigger bodies (`community_notify`, `community_comment_thread`, policy predicates) where neither argument is necessarily the caller and `auth.uid()` may be NULL (service_role/trigger contexts). A naive party check would break notification/follow/comment flows. Candidate fixes: (A, preferred) return `false` instead of raising when an authenticated non-party caller probes, allow NULL-uid contexts the true value, verify every call site with suite coverage; (B) split into an internal revoked helper + caller-checked RPC wrapper; (C) explicitly accept as LOW residual with documentation — a legitimate product call, but it must be explicit.
- **Test case:** T-P7 — EXECUTED_FAIL (oracle demonstrated). Regression test after fix: NOT_EXECUTED (no code changes permitted in this audit). Related: T-API-06 (backend-auth worker, independent reproduction of the same class via `dm_can_message` + this function).
- **Acceptance criteria:** (1) As unrelated authenticated user C, the call returns `false` (or raises `42501`) when F blocked G and C is neither party — verified by a new SQL-suite case; (2) as party F, the call still returns `true` after F blocks G; (3) community suite passes in full — no regression in policy/trigger call sites; (4) AUD-40 fix applied in the same change (same oracle class, safe fix); (5) no new `TO authenticated` grant on any internal helper introduced by the fix.
- **Merged here:** R2-API-04 (relationship oracles) — folded into this finding + AUD-40; not counted separately.

### R2-API-01 — P2 — `ai_gate` lost the 6-unknown-kind/day bound: unbounded `ai_usage` row creation (regression)

- **Confidence:** HIGH (executed). **Evidence scope:** REPOSITORY_VERIFIED (behavior executed on local PG 16.15; production NOT_VERIFIED). **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No (harden before public launch recommended).
- **Description:** `20260818120000_claim_ai_call_kind_shape.sql:96-111` — the old `claim_ai_call` refused a 7th distinct UNKNOWN kind per user per UTC day (named kinds exempt). `20260825120000_ai_token_metering.sql` — the `ai_gate` rewrite kept the kind-shape check (`^[a-z0-9-]{1,40}$`) but dropped the count bound entirely; grep finds no later migration restoring it. No other code enforces it.
- **User/business impact:** Any authenticated user can create unbounded `ai_usage` rows (≤40 chars each) via direct RPC — storage/write amplification on a table nothing else lets a client touch. NOT a quota bypass: edge functions use fixed literals, so invented kinds buy no model calls. Impact is DB bloat + ops noise, not inference spend.
- **Exploitability/likelihood:** Trivial (one PostgREST loop); likelihood LOW (self-harm-adjacent, no financial gain). P2, not higher: blast radius confined to the caller's own rows, row size capped.
- **Test case:** T-API-01 — EXECUTED_FAIL (defect reproduced): 8 distinct junk kinds all returned `ok` and created 8 rows; shape checks still hold (bad/null/41-char kinds → `denied`, no rows).
- **Acceptance criteria:** (1) Unknown-kind count bound restored in `ai_gate` (or equivalent) with named kinds exempt; (2) SQL-suite test asserting 7th unknown kind denied + named kinds unaffected; (3) `claim_ai_call` wrapper inherits the bound.

### R2-API-02 — P2 — Malformed JSON burns AI quota in `ai-meal-suggest` and `ai-smart-nudges`

- **Confidence:** HIGH (code-path analysis; handler execution BLOCKED — no Deno/Supabase runtime). **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** Both handlers read the body as `req.json().catch(()=>({}))` and proceed to `aiGate` + provider call with `{}`. Contrast: `ai-coach`, `scan-food`, `body-check` let `req.json()` throw → 500 BEFORE the gate (no quota burn); `ai-weekly-review` is safe despite the same `.catch` because `week_start` is required via `localDate` → 400; `ai-log-parse` is safe (empty text → early return before gate). The two affected handlers' own header comments state "The body first, the quota after" — the `.catch(()=>({}))` violates the stated rule for unparseable bodies.
- **User/business impact:** A buggy client (or scripted caller) sending malformed bodies consumes the user's daily quota (30/day each) and triggers paid provider calls with empty input. A broken client build can lock a user out of meal suggestions/nudges for the day.
- **Exploitability/likelihood:** Trivial to trigger accidentally (any JSON syntax error); MEDIUM for buggy clients, LOW for malice (self-quota only). P2 because it silently converts client bugs into quota loss + provider spend.
- **Test case:** T-LIVE-01 — BLOCKED (needs a runnable function; isolated alternative: Deno + stubbed gateway, POST invalid JSON, expect 400 with no `ai_usage` increment). Static code-path trace of all 8 AI handlers' body-read/gate orderings EXECUTED.
- **Acceptance criteria:** (1) Both handlers return 4xx on unparseable JSON before `aiGate`; (2) regression test with malformed body asserting no quota increment; (3) `ai-weekly-review`'s required-field guard kept as the pattern reference.

### R2-API-03 — P2 — No idempotency/refund for failed AI calls: provider failures consume quota

- **Confidence:** HIGH (code-path analysis; live behavior BLOCKED). **Evidence scope:** REPOSITORY_ONLY. **Effort:** M. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** All 8 AI handlers call `aiGate` (increment) BEFORE `callAI`. On provider failure (timeout, 5xx, malformed response), the increment stands; the client's retry costs another unit. Handler comments acknowledge this (`ai-coach/index.ts:146`, `ai-coach-memory/index.ts:264`, `scan-food/index.ts:109`: "`claimCall` is an increment, not a reservation"). `recordTokens` swallows errors, so even metering failures are silent. No refund RPC, no reservation/expiry, no idempotency key exists.
- **User/business impact:** Users pay quota (and, past the limit, credits) for failures that are the provider's fault. Under gateway instability, a user can exhaust a 10/day weekly-review quota on failures alone. Trust impact exceeds token cost.
- **Exploitability/likelihood:** Not exploitable for gain; likelihood of user harm MEDIUM whenever the gateway degrades. P2, not P1: quotas reset daily and no money is taken (credits have no top-up path — AUD-23).
- **Test case:** T-LIVE-03 — BLOCKED (needs live or stubbed gateway; isolated alternative: Deno + stub gateway returning 503, then assert whether a retry path refunds).
- **Acceptance criteria:** (1) Documented decision: reservation-with-expiry, failure refund, or explicit wontfix with user-facing copy; (2) if refunding: test proving failed-call + retry = 1 unit; (3) `recordTokens` failures surfaced in logs with user/kind (no silent swallow without a metric).

### R2-API-05 — P3 — `dm_send` accepts unbounded `p_workout` JSONB; workout title lands untruncated in `last_text`

- **Confidence:** HIGH (executed). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `dm_send` (`20261020130000_community_direct_messages.sql`) validates/truncates `p_body` (≤1000) but stores `p_workout` verbatim with no size/shape validation; `last_text` takes `p_workout->>'title'` UNTRUNCATED (the body branch uses `left(v_body, 140)`). `dm_messages.workout` has no CHECK; `dm_threads.last_text` has no length CHECK.
- **User/business impact:** Storage bloat per message (bounded only by PostgREST body limits, NOT_VERIFIED); oversized `last_text` renders in every inbox row fetch (`dm_inbox` returns `last_text` for 200 threads) — a single abusive message inflates inbox payloads for the recipient. No auth bypass.
- **Exploitability/likelihood:** Trivial; LOW (requires a DM thread with the victim; 30/min limit bounds volume).
- **Test case:** T-API-07 — EXECUTED_FAIL: a 105,044-byte workout JSONB with a 5,000-char title was stored; `dm_threads.last_text` length = 5,000. Empty-body/no-workout control correctly raised `empty`.
- **Acceptance criteria:** (1) `p_workout` size cap + shape allow-list enforced in `dm_send` or a CHECK; (2) `last_text` truncated to 140 chars on the workout branch; (3) suite test with oversized workout asserting rejection/truncation.

### R2-API-06 — P3 — No stable error contract: clients classify failures by sniffing server message strings

- **Confidence:** HIGH (code-verified both sides). **Evidence scope:** REPOSITORY_ONLY. **Effort:** M. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** Servers mix snake_case codes, English sentences, and Vietnamese sentences. `EdgeFunction.Failure.classify` (`EdgeFunction.swift:52-62`) decides `quotaExceeded` vs `rateLimited` by whether a 429 message contains `"hết lượt"` or `"quota"`, and `overloaded` vs `providerError` by whether a 5xx message contains `"ai_unavailable"`. `AuthView.readableError` similarly string-matches `localizedDescription`. Any server-side rewording (including localization of the Vietnamese quota sentence) silently misclassifies failures client-side.
- **User/business impact:** Wrong user-facing guidance and wrong retry behavior; silent breakage on any copy change. No data/security impact.
- **Test case:** SPECIFICATION_ONLY (contract conformance; static enumeration of all `json({error...})` sites EXECUTED).
- **Acceptance criteria:** (1) Published error-code enum covering quota/rate-limit/overload/auth/validation; (2) all 12 handlers emit `{error: <code>, ...}`; (3) Swift `classify` + `readableError` keyed on codes; (4) CI check asserting handlers only emit known codes.

### R2-API-07 — P3 — `claim_quest_reward` stores `p_reason` unbounded (narrowed: duplicate-return half is AUD-64)

- **Confidence:** HIGH (executed). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `20261029130000_koa_quests_v2.sql` — `p_reason` (TEXT, no bound) is stored verbatim. (The duplicate-claims-return-amount behavior observed in the same probe is AUD-64, already filed in Round 1; this finding owns only the unbounded-`reason` half. Coordinator narrowing applied to avoid double-counting.)
- **User/business impact:** Minor storage abuse (one row per ref_key): a 100,000-char reason stored in full.
- **Test case:** T-API-08 — EXECUTED_FAIL (two identical claims both returned 35; exactly 1 ledger row; 100,000-char `p_reason` stored in full).
- **Acceptance criteria:** (1) `p_reason` capped (e.g., 500 chars) in the function or a CHECK; (2) suite test asserting the bound.

### R2-API-08 — P3 — Any session-nil event runs full cleanup including silent discard of unsynced outbox data

- **Confidence:** MEDIUM (client code verified; supabase-swift refresh-failure event semantics NOT_VERIFIED; Swift behavior NOT_EXECUTED). **Evidence scope:** REPOSITORY_ONLY. **Effort:** M (needs Kiệt's #241 decision). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `SessionStore.apply` (`SessionStore.swift:117-128`): `ended = event == .signedOut || (previous != nil && session == nil && event != .initialSession)` — ANY transition to a nil session (explicit sign-out, token-refresh failure surfaced as signedOut, account deletion elsewhere, password change on another device per the code comment at `:57`) runs the single cleanup list, including `sync.signOut()` → `Outbox.dropAllOnSignOut()`, which destroys pending AND dead queue rows. `dropAllOnSignOut` RETURNS the dropped count "để có thể báo, nếu #241 chọn (c)" — but no UI surfaces it today. Distinct from AUD-06: this finding owns only the auth/session boundary trigger breadth + silent discard; outbox internals belong to AUD-06/R2-SYNC-01.
- **User/business impact:** Silent loss of unsynced workouts on events the user did not initiate. The #241 decision has been pending since the baseline; until it lands, the fail-closed local sign-out trades availability for data loss.
- **Exploitability/likelihood:** Not attacker-driven; LOW-MEDIUM (depends on refresh-failure frequency, unmeasured).
- **Test case:** T-SWIFT-02 — NOT_EXECUTED (simulator/device test: sign in, queue an offline workout, force a refresh-token failure, assert whether the entry survives or the user is told).
- **Acceptance criteria:** (1) Kiệt's #241 decision recorded; (2) implemented behavior matches it (preserve-on-refresh-failure OR user-visible discard notice); (3) simulator test proving the chosen behavior.

### R2-API-09 — P3 — `edge-auth.mjs` ordering check is stale: it looks for `claimCall`, handlers use `aiGate`

- **Confidence:** HIGH (code-verified). **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `native/tools/edge-auth.mjs` (runs in CI via `check.mjs` twice) asserts every function dir except `store-webhook` calls `requireUser(` — that check is live and correct. But its ORDERING check (quota claimed only after auth/body validation) searches for `claimCall(`; all handlers now call `aiGate` (`guard.ts`), and `claimCall` has no callers — so the ordering check passes vacuously and would NOT catch a future handler that gates before auth. Its success text still says "cả chín" (nine) while 12 functions exist. Cross-reference: AUD-37 revalidation.
- **User/business impact:** Guard erosion: the CI gate that should catch auth-ordering regressions cannot catch them. No live defect today (all handlers order correctly — verified individually).
- **Test case:** T-STATIC-01 — EXECUTED_PASS (static: zero `claimCall(` call sites vs `aiGate` in all 8 AI handlers).
- **Acceptance criteria:** (1) Check searches for `aiGate` (and `claimCall` if revived); (2) count text updated to 12; (3) negative fixture test in CI (handler gating before auth fails the check).

### R2-API-10 — P3 — Recovery links open a full session usable without ever setting a new password

- **Confidence:** HIGH (code-verified). **Evidence scope:** REPOSITORY_ONLY. **Effort:** S/M. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `SessionStore.open(url:)` applies `.signedIn` immediately on a valid recovery link; `AuthLinkSheet` offers "Để sau" (Later), dismissing the password form while the session stays open. Nothing forces password rotation afterward; the user can use the app (and, combined with AUD-21, delete the account) on the strength of the link alone, indefinitely until the session expires. Standard Supabase recovery behavior — filed because the combination with no-re-auth deletion makes a single leaked/forwarded recovery link sufficient for irreversible account destruction.
- **User/business impact:** Recovery-link compromise = full account control + irreversible deletion, with no password-rotation forcing function. Likelihood LOW (requires link compromise; links expire — expiry window is a Supabase setting, NOT_VERIFIED).
- **Test case:** T-SWIFT-04 — NOT_EXECUTED (simulator test: open recovery link, tap Later, assert app access + deletion availability).
- **Acceptance criteria:** (1) Decision: force rotation after recovery OR require re-auth for deletion (or both); (2) implemented + simulator-tested; (3) recovery-link expiry verified in project settings (needs access — currently NOT_VERIFIED).

### R2-SYNC-01 — P2 — Unscoped outbox drop on session cleanup can delete the NEXT account's pending rows

- **Confidence:** HIGH (mechanism verified in code; interleaving not executed). **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** Yes (data-loss class; cheap fix; evaporates if AUD-06/#241 removes the drop entirely).
- **Description:** `OutboxStore.dropAllOnSignOut()` (`OutboxStore.swift:137-145`) deletes the ENTIRE `outbox` and `outbox_dead` tables with no `userId` filter. `AccountLifecycle` carefully protects `workout_day`/`read_cache` during account switches with `except:` variants and documents ordering-independence (`AccountLifecycle.swift:28-30`) — but that does NOT extend to the outbox: `sessionEnded`'s `between()` closure runs `sync.signOut()` → unscoped delete (`AppServices.swift:322-323`). Two interleavings destroy B's rows: (a) direct switch A→B: B signs in, `sessionStarted(B)` opens the latch, B finishes a workout offline, then A's delayed `sessionEnded(next: B)` cleanup deletes it; (b) double cleanup: `SessionStore.signOut()` runs cleanups explicitly (`SessionStore.swift:209-220`) AND the resulting `.signedOut` auth event runs them again via `apply` (`:117-133`) — if the user signs back in and enqueues between the two runs, the second run deletes the new rows. The in-memory `Outbox.dropAllOnSignOut` (`Outbox.swift:179-186`) compounds it.
- **User/business impact:** Silent loss of unsynced records belonging to an innocent account; indistinguishable from AUD-06's loss, but striking users who did nothing wrong. Bounded to rows enqueued inside a narrow window.
- **Exploitability/likelihood:** Not exploitable (requires local account switching + fast enqueue). LOW; the double-cleanup variant (b) is the more reachable one.
- **Test case:** T-NEW-01 — NOT_EXECUTED (no Swift toolchain; specified against existing `OutboxStore`/`AccountLifecycle` fakes): interleaved switch + enqueue + delayed cleanup; B's entry must survive, A's must be removed. Code reading predicts B's entry GONE today.
- **Acceptance criteria:** (1) `dropAllOnSignOut` takes the departing user id and deletes only that user's rows (or the drop is removed per #241); (2) regression test with interleaved switch + enqueue + delayed cleanup asserts B's pending row survives on disk and drains after sign-in; (3) cleanup is idempotent w.r.t. a new session: running cleanups twice across a re-sign-in deletes zero rows belonging to the current session.

### R2-SYNC-02 — P2 — Undecodable outbox rows are silently invisible: no UI, no telemetry, no recovery

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No (recommend fixing before public launch; bounded, low-frequency).
- **Description:** `OutboxStore.load()` (`OutboxStore.swift:47-55`) decodes rows one by one and silently skips undecodable ones, leaving them on disk; `persist()` never touches them (`:107-131`). The listing API `undecodableIds()` (`:57-66`) has **zero production callers** (grep-verified: only `OutboxStoreTests.swift:98,104,127` call it). A row the user was told was "saved on device" can sit on disk forever, never sent, never counted in `pendingCount`, never bannered, never reported to telemetry. Triggers: downgrade after a newer build wrote a new schema, a corrupt write, or a future `Codable` change without migration.
- **User/business impact:** Silent, unbounded-delay data loss for affected rows; support-invisible (no counter, no log). Bounded to rows whose schema the current build cannot decode.
- **Exploitability/likelihood:** Not exploitable. LOW in steady state; MEDIUM across downgrades and schema-changing releases.
- **Test case:** T-NEW-02 — NOT_EXECUTED: in-memory DB with one valid + one corrupt-JSON row; valid row loads AND corrupt row is reported (count ≥ 1). Code reading predicts the corrupt row is reported NOWHERE in production code.
- **Acceptance criteria:** (1) `undecodableIds()` wired to a visible surface: count in diagnostics (WorkoutLab) + user-facing notice when count > 0, or a telemetry counter; (2) unit test seeds an undecodable row and asserts it is surfaced; (3) documented recovery path (upgrade / export / manual re-entry).

### R2-SYNC-03 — P3 — No retention or size bound for `outbox_dead` and per-exercise `read_cache` rows

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** The only `DELETE FROM outbox_dead` in production code is the sign-out wipe (`OutboxStore.swift:141`); `persist()` only ever appends. Dead letters accumulate for the lifetime of a sign-in — including full entry payloads (complete workout JSON) — with no cap, no age prune, and no user-facing list. Separately, `read_cache` rows under the `exercise-guide:` prefix (one per exercise × language) are never pruned or size-capped. Only `workout_day` has a prune (14 days). No VACUUM, no size accounting, no eviction policy anywhere in ASCNDStore.
- **User/business impact:** Slow, unbounded local storage growth; stale diagnostic payloads retained indefinitely (privacy hygiene); `load()` decodes the full dead list on every worker reload. Realistic magnitude small (KBs–MBs); hygiene, not a cliff.
- **Test case:** T-NEW-03 — SPECIFICATION_ONLY (no prune exists to execute against): seed 500 dead + 500 guide rows; prune; rows ≤ bound, pending untouched.
- **Acceptance criteria:** (1) `outbox_dead` bound (age and/or count, e.g. 30 days / 100 rows) enforced by a prune on load or sign-in; (2) `exercise-guide:` rows bounded with LRU/age eviction; (3) test seeds over-limit rows and asserts the prune keeps the bound without touching pending rows.

### R2-SYNC-04 — P2 — Widget refresh runs after EVERY replayed entry: 4 queries + timeline reload per entry, uncoalesced

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `SupabaseRemoteWriter`'s `afterWrite` (`AppServices.swift:291-294`) runs `DailyLog.rebuildAfterWrite` AND `widgets.refresh()` after each successfully sent entry. `WidgetRefresher.refresh` (`WidgetRefresher.swift:54-72`) calls `WidgetSync.payloads` (`WidgetSync.swift:39-65`), which issues 4 PostgREST selects plus the `plans`/`planStatus`/`week` closures, then writes App Group data and calls `WidgetCenter.shared.reloadAllTimelines()`. None coalesced across a drain: N entries cost 4N widget queries + N timeline reloads, on top of AUD-50's rebuild cost (combined worst case 32 requests per workout entry). Distinct from AUD-50: different code, different fix (debounce/coalesce per drain), different blast radius (WidgetKit timeline churn + battery).
- **User/business impact:** Reconnect-burst request amplification (correlated morning/post-outage spikes); redundant widget timeline reloads (battery + rendering churn). No correctness impact.
- **Test case:** T-NEW-04 — NOT_EXECUTED (counting-fake test): 5-entry drain; fixed expectation ≤ 4 selects, ≤ 1 reload. Code reading predicts 20 selects + 5 reloads.
- **Acceptance criteria:** (1) A drain of N entries issues widget-refresh selects ≤ 4 total (once per drain, or debounced), measured with a counting `RowStore`; (2) widgets show post-drain data within one refresh after the drain; (3) `reloadAllTimelines` ≤ once per drain.

### R2-SYNC-05 — P3 — Koa pause sync is a third, ad-hoc sync path with silently swallowed errors and no observability

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_ONLY. **Effort:** M. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** Koa pause state bypasses the outbox entirely. Local truth in UserDefaults (`koa.pause.<userId>`, `koa.pauselog.<userId>`, `koa.pauselog.synced.<userId>`, pending flag `koa.pause.pending.<userId>`; `AppServices.swift:835-965`). Push is fire-and-forget with empty catches: `pushKoaPause` (`:938-947`, `catch {}`) and `pushKoaPauseLog` (`:889-901`, `catch {}`) swallow ALL errors with no retry budget, no dead-letter, no banner, no telemetry. The pending flag clears only on success, and the pause-log diff compares against the last successfully pushed snapshot, so failed pushes do retry on the next `syncKoaPause(Log)` call — self-healing but invisible and unbounded in delay (sync runs only when `TodayExtras` invokes it and on pause edits). Pull is server-wins LWW per row key with a current-spell merge; two devices setting pauses concurrently resolve by LWW with no conflict signal. Pause keys are never cleared on sign-out (userId-suffixed, so no cross-account leak, but stale keys accumulate per account forever).
- **User/business impact:** LOW: pause state is display/scheduling state, not record data. Worst case is a late pause on a second device, or a silently unpushed edit until a later sync trigger. No record loss.
- **Test case:** T-NEW-05 — SPECIFICATION_ONLY (AppServices-level harness with a failing `RowStore`): failure observable; flag stays set; retry succeeds. Code reading predicts failure invisible, flag correctly stays set, retry succeeds.
- **Acceptance criteria:** (1) Push failures observable (counter/log/banner) instead of `catch {}`; (2) defined durability story (route through the outbox, or document UserDefaults+flag as the contract with a retry trigger inventory); (3) sign-out cleanup removes or documents retention of `koa.pause*` keys; (4) test with a failing `RowStore` asserts the pending flag stays set and the failure is observable.

### R2-SYNC-06 — P3 — HealthSync's first section is fail-fast while the second is partial-tolerant: one bad write discards independent imports

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `HealthSync.run` (`HealthSync.swift:71-202`) wraps bio + sleep + workout imports in ONE `do/catch` that throws `.write` and aborts the run (`:78-129`): a transient failure writing `biometric_samples` skips the sleep and workout imports for the entire run, even though they are independent. The second section does the opposite — per-part failure collection + `.incomplete` (`:133-201`). The inconsistency is undocumented. Recovery is automatic (next sync re-reads the same windows and upserts idempotently), so the cost is delay, not loss — except that a *persistently* failing first write blocks the other two imports indefinitely. Distinct from AUD-87 (atomicity); this is error-handling asymmetry within the non-atomic import.
- **User/business impact:** Delayed sleep/workout imports after transient bio failures; in the persistent case, sleep/workout data silently stops importing while steps/weight keep flowing. No data loss.
- **Test case:** T-NEW-06 — NOT_EXECUTED: fake `RowStore` failing only `biometric_samples`; sleep + workout rows still written, error names the bio part. Code reading predicts NOTHING written and a bare `.write` error.
- **Acceptance criteria:** (1) Bio/sleep/workout imports collect per-part failures like the second section (or the fail-fast choice is documented with a reason); (2) test with a `RowStore` failing only `biometric_samples` asserts sleep + workout rows are still written and the error is reported as a part failure.

### R2-SYNC-07 — P3 — Sleep/biometrics read-then-decide replay can create duplicate day rows across devices (no arbitrating unique for manual rows)

- **Confidence:** HIGH (mechanism + schema verified). **Evidence scope:** REPOSITORY_ONLY. **Effort:** M (needs a schema or protocol decision). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `sendSleep` (`SupabaseRemoteWriter.swift:158-181`) and `sendBiometrics` (`:182-205`) read-then-decide: find an overlapping/latest manual row, overwrite it by id; otherwise insert under a fixed per-touch id. The deciding read and the upsert are separate requests with no lock and no conditional write. Two devices logging sleep/biometrics for the same day concurrently can both read "no row" and insert distinct rows. Nothing arbitrates: manual rows carry NO `external_id`, and the only uniques are `UNIQUE(user_id, external_id)` (migration `20260817120000_health_import_conflict_target.sql:71,108`) — NULL `external_id` values never conflict (documented in that migration's own comments, `:50-59`). Single-device behavior is correct. Downstream, `DailyLog` picks one sleep and one latest bio row, so duplicates mostly hide — but history views and future aggregation see both.
- **User/business impact:** Duplicate sleep/biometric rows for the same day; mostly invisible today, confusing in history, latent integrity issue for future per-day aggregation. Bounded to multi-device same-day logging.
- **Test case:** T-NEW-07 — SPECIFICATION_ONLY (two-writer harness against an isolated database; production mutation prohibited): interleaved reads/upserts yield exactly one effective row per day under the chosen arbitration. Mechanism predicts 2 rows today.
- **Acceptance criteria:** (1) Defined arbitration for manual day rows (unique constraint, server-side merge, or documented accept-duplicates + reader dedup); (2) two-writer interleaving test yields exactly one effective row per day, or duplicates are visibly deduped by every reader.

### R2-SYNC-08 — P3 — SyncWorker's GRDB I/O runs on the MainActor despite the code comment claiming otherwise

- **Confidence:** MEDIUM (Swift executor semantics + code structure; runtime impact NOT_VERIFIED — no profiling evidence). **Evidence scope:** REPOSITORY_ONLY. **Effort:** S–M. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `OutboxStore`'s conformance comment (`OutboxStore.swift:149-150`) states "worker gọi chúng ngoài main actor". That is not true at tip: `SyncWorker` is `@MainActor` (`SyncWorker.swift:44-45`), and `OutboxStore`'s methods are synchronous functions satisfying `async` protocol requirements — calling them via `await` from MainActor-isolated code executes the GRDB work inline on the calling executor (no hop; GRDB's `DatabaseQueue.write/read` blocks the caller). Every drain step pays, on the main thread: full-queue JSON re-encode + a write transaction (`SyncWorker.persist`, `:183-195`, after EVERY send/failure), plus full-queue JSON decode on every `reload()` (`:166-181`). Queue sizes are normally small (cost normally negligible) but unbounded with queue length. No Instruments evidence exists either way; this is a code-review finding, not a measured jank bug.
- **User/business impact:** Potential main-thread stalls during large drains. Unmeasured; likely negligible at typical queue sizes. No correctness impact.
- **Test case:** T-NEW-08 — SPECIFICATION_ONLY (simulator + Instruments): 200-entry queue; per-persist main-thread cost < 16ms, or persistence off-main-thread.
- **Acceptance criteria:** (1) Either persistence moves off the MainActor with a test asserting drain steps don't execute on the main thread, OR an Instruments trace with a 200-entry queue shows main-thread SQLite/JSON time below an agreed budget (e.g. <16ms per persist) and the comment is corrected; (2) the stale comment is fixed either way.

### R2-SYNC-09 — P3 — SQLite is opened with GRDB/SQLite defaults: journal mode, durability, and busy behavior are unasserted

- **Confidence:** HIGH (absence of configuration verified); behavioral consequences NOT_VERIFIED. **Evidence scope:** REPOSITORY_ONLY. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `ASCNDDatabase.init(path:)` (`Database.swift:15-19`) calls `DatabaseQueue(path:)` with no `Configuration`. No code sets `journalMode`, `synchronous`, `busyMode`, `foreignKeysEnabled`, or `prepareDatabase` (grep-verified: zero hits). The outbox's central promise — commit-before-ack crash durability — rests on GRDB/SQLite defaults, unverified at runtime (no toolchain to read `PRAGMA journal_mode/synchronous`). SQLite's defaults are generally crash-safe, so this is most likely fine — but "most likely" is not an assertion. No integrity check (`PRAGMA integrity_check` / `quick_check`) on open, and no corruption-recovery path beyond per-row decode leniency.
- **User/business impact:** None known; the risk is unasserted durability assumptions for the most safety-critical file in the app. A durability regression would manifest as lost "saved on device" records after a crash.
- **Test case:** T-NEW-09 — NOT_EXECUTED (file-level test): open a temp-directory DB via `ASCNDDatabase(path:)`; assert effective `PRAGMA journal_mode` / `synchronous` values. Configuration does not exist; effective pragmas unknown.
- **Acceptance criteria:** (1) Explicit `Configuration` passed (journal mode + synchronous level chosen deliberately and documented); (2) test opens a real database file and asserts the effective pragmas; (3) crash-durability test (kill -9 mid-write loop, reopen, assert committed rows present) passes on CI or simulator.

### R2-ECO-01 — P2 — Rank/Gains-gated shop items purchasable via direct RPC; server checks price + balance only

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S (server-side rank check needs a Gains source of truth — a pure RPC-side gate on a client-supplied rank would be worthless, so the real fix is M/L if Gains must move server-side). **Beta-blocking:** No. **Launch-blocking:** No (cosmetic/status), but should be decided before launch — either enforce or drop the pretense.
- **Description:** Nine shop items are gated behind Koa Gains ranks in the client only. `MascotShop.unlockRanks` (`MascotShop.swift:84-89`) gates trophy (rank 2), wing (3), dragonwing (4), bonsai (1), mountain (2), board_gold (3), podium_marble (3), shelf_olympic (4), chandelier (5), with the code comment "Server không kiểm cấp khi mua". `buy_mascot_item` (`20260815120000_economy_balance_lock.sql:63+`) checks only price (from `shop_prices`) and balance (SUM of ledger). Any authenticated user can call the RPC directly with `p_item_key = 'dragonwing'` and buy it at rank 0, provided they have the coins — and coins are forgeable up to 800/day (AUD-02). The buyer still pays full price, so this is a prestige/status gate bypass, not a free-item bug. Gains itself is client-computed (R2-ECO-10), so a server-side gate cannot simply "check the rank" — there is no server-side rank to check.
- **User/business impact:** Prestige items lose their earned-status meaning; users who grind Gains see the gate bypassed by anyone with a REST client. No direct revenue impact (no real-money purchases exist yet).
- **Exploitability/likelihood:** Trivial (one RPC call; keys are in the public repo). Likelihood of casual exploitation: low; of a curious user trying it: moderate once the app has community visibility.
- **Test case:** T-ECO-16 — BLOCKED (no PG; spec in the economy working paper, Appendix A): fund ledger to 800 coins, call `buy_mascot_item('dragonwing')`, assert it SUCCEEDS despite Gains rank 0 today; after fix, must raise a rank error.
- **Acceptance criteria:** (1) Direct RPC purchase of a rank-gated item by a below-rank user is rejected with a specific error; (2) rank determination does not trust a client-supplied rank — either Gains moves to a server-computed source, or the gate is explicitly retired as client-only decoration and item descriptions stop implying earned status; (3) regression test in the SQL suite; (4) no change to ungated items.

### R2-ECO-02 — P3 — `claim_quest_reward` checks the ceiling before dedup: duplicate claims raise instead of converging idempotently

- **Confidence:** HIGH (code-determined). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `claim_quest_reward` (`20261029130000_koa_quests_v2.sql:121-136`) sums today's positive amounts and raises 'daily reward ceiling reached' if `v_today + v_amount > 800`, BEFORE the `ON CONFLICT DO NOTHING` insert. A duplicate claim of an already-paid key therefore raises once the day is full, instead of returning the amount as a no-op (as it does when the day is not full — AUD-64). Contrast `buy_streak_freeze`, which checks existence INSIDE the lock and returns the existing state. Consequence: lost-response retries fail — a client that claimed successfully but lost the response and retries gets an error indistinguishable from "ceiling genuinely reached". The client-side `seen`-key workaround is per-device, so a second device retrying hits the same wall.
- **User/business impact:** Minor UX: spurious "ceiling reached" errors on retries; no coin loss, no double-pay. Support confusion more than financial harm.
- **Test case:** T-ECO-07 — BLOCKED (no PG): fill a day to exactly 800, re-claim an already-paid key; assert current behavior raises; after fix, returns the amount without error and without a second ledger row.
- **Acceptance criteria:** (1) Re-claiming an already-paid key returns the amount and inserts no row regardless of ceiling state; (2) a genuinely new key still raises once the ceiling is reached; (3) concurrent duplicate claims still yield exactly one ledger row; (4) fix does not change ceiling sum semantics for new keys.

### R2-ECO-03 — P3 — `claim_community_challenge` has no deadline check: challenges claimable forever after `ends_on`

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `claim_community_challenge` (`20260930120000_community_challenges.sql:147+`) checks membership, advisory lock, `claimed_at` NULL, progress ≥ target, and the daily ceiling — but never compares `now()` to `ends_on`. The 7-day grace period in `community_challenges_overview` is display-only. A user who met the target during the window can claim months later; combined with AUD-25 (backdatable rows), a user can fabricate qualifying sessions and claim a long-ended challenge at any time. Blast radius is one `reward_coins` payout per challenge per user (ceiling-capped, `claimed_at` prevents double-claim) — but challenge expiry as a product mechanic does not exist server-side. Defense-in-depth note (not separately filed): the claim does `ON CONFLICT DO NOTHING` on the `cc:` ledger row then unconditionally sets `claimed_at` and returns `reward_coins` — if a `cc:<id>` row pre-existed without payment, the claim would mark claimed without paying. Unreachable via app paths (ledger INSERT policies dropped; only RPCs write), so INFO-level hardening only.
- **User/business impact:** Expired challenges remain payable; leaderboard/event integrity is display-only. Low financial impact (virtual coins, ceiling-capped).
- **Test case:** T-ECO-12c — BLOCKED (no PG): challenge with `ends_on` 30 days ago + qualifying backdated sessions; assert claim currently SUCCEEDS; after fix, must raise a deadline error.
- **Acceptance criteria:** (1) Claims after `ends_on` (+ any documented grace period, enforced server-side with the same value the UI shows) are rejected; (2) claims within the window unaffected; (3) grace rule is a single server-side constant, not a UI-only convention; (4) regression test covers post-deadline claim.

### R2-ECO-04 — P3 — Community challenge progress counts pre-join sessions; intent undocumented

- **Confidence:** HIGH (code-determined); intent MEDIUM (undocumented). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S (if the decision is to exclude pre-join sessions). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `community_challenge_progress` (`20260930120000_community_challenges.sql:90-101`) counts qualifying session dates in `[starts_on, ends_on]` with no reference to `community_challenge_members.joined_at`. A user who joins on the last day with 7 prior qualifying sessions instantly meets the target. This may be intended ("your week counts") or an oversight — no comment, doc, or test states the rule. Combined with AUD-25, a late joiner can backdate sessions into the window. This finding asks for a documented decision, not a presumed bug.
- **User/business impact:** Challenge fairness question. Low financial impact (ceiling-capped virtual coins).
- **Test case:** T-ECO-12b — BLOCKED (no PG): sessions days 1–6, join day 7, claim day 7; assert current behavior pays; after a decision, the test asserts the documented rule either way.
- **Acceptance criteria:** (1) Rule documented in the function comment AND product copy; (2) function implements the documented rule; (3) regression test pins the rule; (4) if pre-join sessions are excluded, the overview progress shown before joining uses the same rule.

### R2-ECO-05 — P3 — `claim_community_challenge` ceiling sum includes `x:` credits, inconsistent with `claim_quest_reward`

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `claim_quest_reward` explicitly excludes `x:` keys from both the ceiling check and sum (`20261029130000_koa_quests_v2.sql:122-129`). `claim_community_challenge` sums ALL positive amounts for the UTC day, including `x:` explore credits. A user who claims 195 coins of explore quests then a community challenge on the same UTC day has 195 coins of ceiling consumed in one path's accounting but not the other's. Small (max 195 coins, one-time per account) and fail-closed in the community path (stricter), but the two functions disagree about what "the daily ceiling" means.
- **Test case:** T-ECO-12d — BLOCKED (no PG): claim all 7 `x:` keys (195), fill to 605+ via `ch:`, claim a community challenge; assert current behavior raises while the equivalent quest path would allow 800 of non-`x:` credit.
- **Acceptance criteria:** (1) Both ceiling implementations share one definition (single helper function preferred); (2) `x:` exclusion rule identical in both; (3) regression test claims `x:` + community on the same day and asserts the documented behavior.

### R2-ECO-06 — P3 — XP/coin asymmetry across reward paths is undocumented: `cc:`, `x:`, and overload rows pay coins but 0 XP

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S (documentation) / M (if XP rules change). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `xpForRefKey` (`MascotRules.swift:91-108`) returns 0 for `cc:` (community challenge), `x:` (explore quests), `clean:`/`buy:`/`freeze:`/`welcome`, and `d:...:overload` (falls through to `dailyQuests` lookup; `overload` is not a daily-quest key). Meanwhile `w:`/`ch:`/`set:`/daily-quest `d:` rows pay both coins and XP. A user completing a community challenge levels up slower than one completing weekly challenges for the same effort, and explore quests (195 coins) grant no XP at all. Nothing states this asymmetry as a decision; the doc comment says only "Khoá lạ … không có XP" — but `cc:`/`x:`/overload are not unknown keys, they are first-class reward paths. This also makes AUD-02's XP arithmetic path-dependent.
- **User/business impact:** Level progression feels arbitrary across features; community/explore engagement is XP-invisible. No financial impact.
- **Test case:** T-SWIFT-01 — NOT_EXECUTED: unit test asserting `xpForRefKey` for each namespace against a documented XP table.
- **Acceptance criteria:** (1) Single documented XP table (code comment + product copy) covering every namespace; (2) `xpForRefKey` implements exactly that table; (3) unit tests pin every namespace; (4) if `cc:`/`x:`/overload should pay XP, values set deliberately.

### R2-ECO-07 — P3 — Three volume definitions diverge: stored `volume_load` need not equal recomputation from stored sets

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** M (pick one definition, migrate consumers). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** (a) `WorkoutSessionRecord.volumeLoad`: integer, floor(total+0.5) over **unrounded** `weightKg` × reps, warmups excluded — what gets stored. (b) `SessionRevisionMerge.volumeLoad` / `SessionDetail.swift:125-128`: integer over **round2-stored** weights. (c) `ExerciseInsights.performances` / `LastPerformance.swift:182-198`: **2dp** over round2-stored weights. Worked example — 3 sets × 5 reps × 135 lb (61.2349… kg): (a) 919 kg; (b) 918 kg; (c) 918.45 kg. Differences typically ≤1 kg per session but definitional, accumulating across a week in `WeeklyReview` volume sums, making "volume" ambiguous across screens.
- **User/business impact:** Small numeric inconsistencies across screens; users comparing totals see mismatches. No safety impact.
- **Test case:** T-SWIFT-02 — NOT_EXECUTED: 3×5×135 lb session; record all three values; after fix, all three agree under the single documented definition (or documented display rounding explains the difference).
- **Acceptance criteria:** (1) One documented volume definition applies to storage, merge, detail, and insights; (2) worked lb example pinned in tests; (3) existing stored values migrated or explicitly grandfathered with a documented cutover; (4) weekly sums use the same definition.

### R2-ECO-08 — P3 — Meal total vs item-sum rounding divergence on the happy path (no failure needed)

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** Distinct from AUD-34 (partial-failure non-transactionality). `MealLog.entry`/`totals` (`MealLog.swift:355-389`) computes entry totals as round(sum of unrounded item values), while each stored item row carries round(each item value). Display uses stored `total_*` and lists rounded item values. Example: 3 items of 100.4 kcal → items display 100+100+100 = 300, meal total displays round(301.2) = 301. The 1-kcal gap appears with zero failures, on the normal path, for any macro.
- **User/business impact:** Users summing displayed items get a different number than the displayed total; trust nit. Magnitude ~1 unit per meal.
- **Test case:** T-SWIFT-03 — NOT_EXECUTED: meal with 3 items of 100.4 kcal; assert stored total vs sum of stored item kcals.
- **Acceptance criteria:** (1) Either totals computed from rounded item values (sum-of-displayed = displayed total) or the rounding rule documented and the UI consistent with it; (2) rule identical for kcal/protein/carbs/fat; (3) `MealDiary.entryTotals` uses the same rule; (4) unit test pins the 3×100.4 example.

### R2-ECO-09 — P3 — `ai-coach` always tells users their weight unit is kg: `"lb"` vs `"lbs"` mismatch

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No (but cheap; fix before US beta).
- **Description:** `ai-coach/index.ts:341` builds the coach prompt with `weight_unit: profile.units_weight === "lb" ? "lb" : "kg"`. The stored value is `"lbs"`: Swift writes `"lbs"` (`WeightUnit.swift` — only exact `"lbs"` is lb; `Onboarding.swift:373` same rule). The comparison therefore never matches, and the coach prompt always says kg — even for lb-unit users. Only occurrence of `units_weight` in edge functions (grep 2026-11-11). Stored data unaffected (DB always kg; conversion client-side); only the coach's advisory text is wrong.
- **User/business impact:** Coach answers in the wrong unit for all lb users (US audience) on every coach interaction mentioning weight. Advisory text only; no stored-data corruption.
- **Test case:** T-EDGE-01 — NOT_EXECUTED (Deno availability not verified; static code-path check only): profile with `units_weight='lbs'` → `weight_unit === 'lb'`; `'kg'`/unknown → `'kg'`.
- **Acceptance criteria:** (1) Comparison matches the stored value (`"lbs"`), or the unit is normalized in one shared helper used by both Swift and edge code; (2) unit test covers `lbs`/`kg`/unknown; (3) no other edge function repeats the literal (grep-clean).

### R2-ECO-10 — P3 — Gains integrity inherits client-asserted inputs: forged sessions inflate Koa tier

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** L (server-side Gains) / S (document + accept). **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `KoaGains` derives tier/rank from `workout_sessions` rows (freely INSERTABLE by the owner, `FOR ALL` policy, no CHECKs — AUD-25 class) with client-set `pr_detected` flags (`KoaGainsSync.days`, line 442), plus ledger `d:<day>:overload` keys (claimable without verification — AUD-02 class) via `KoaGainsSync.mark`. The header comment claims "không thể mua hay ghi sai: hai máy cùng lịch sử ra cùng một số". The determinism claim is true; the integrity claim is false — two devices with the same *forged* history produce the same *inflated* number. Cosmetic/status impact only; does not mint coins directly.
- **User/business impact:** Koa tier/status forgeable; leaderboard-adjacent prestige unenforceable. No direct financial impact.
- **Test case:** T-ECO-17 — BLOCKED (no PG for the ledger half; Swift half NOT_EXECUTED): 7 forged sessions with `pr_detected: true` + 7 overload claims; assert Gains/tier inflate vs empty history.
- **Acceptance criteria:** (1) Either Gains gains a server-side source of truth (or server-side validation), or the header comment is corrected and the product explicitly treats Gains/tier as client-displayed status with no enforcement role; (2) no future server-side gate relies on client-computed Gains without validation; (3) decision recorded in the code comment.

### R2-ECO-11 — P3 — `KoaDust.cleanQuery` has limit 60 with no ORDER: with >60 paid cleans, a recent clean may be missed

- **Confidence:** MEDIUM (PostgREST row order without ORDER BY is unspecified; heap order usually approximates insertion order, so the failure needs >60 cleans AND an unfavorable plan). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `KoaDust.cleanQuery` (`KoaDust.swift:84-87`) selects `clean:*` ledger rows with `limit: 60` and no order clause. A user with >60 paid cleans may have the most recent clean fall outside the returned 60 rows, so the room shows dust despite a paid clean. No double charge: `clean_koa_room`'s EXISTS check converges. Display-only; requires sustained long-term use. The analogous `KoaGainsSync.query` correctly orders by `date_time DESC` with limit 2000.
- **User/business impact:** Long-term users (2+ months of daily cleans) may see dust after paying; minor trust nit; no coin loss.
- **Test case:** T-SWIFT-04 — NOT_EXECUTED: fake `RowStore` returning 61 `clean:*` rows in heap order with the newest last; assert state reflects the newest clean.
- **Acceptance criteria:** (1) Query orders by recency (`created_at DESC`) and the limit covers the dust window (21 days) with margin, or filters to the window; (2) test with >60 cleans pins the behavior; (3) same ORDER audit applied to `overloadQuery` (limit 2000, no order — fail-safe direction, pin it anyway).

### R2-ECO-12 — P3 — `clean_koa_room` charges 30 coins for any in-window date without checking dust; cleaning a non-today date does not clear today's display

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `clean_koa_room(p_day)` (`20261029140000_koa_room_clean.sql:13-55`): PRICE 30 constant; accepts any `p_day` within ±1 day of the UTC date; advisory lock + EXISTS check returns the balance without a second debit; otherwise debits 30. It never checks whether the room is actually dusty — cleaning a clean room costs 30 coins — and cleaning yesterday's/tomorrow's date does not clear today's dust display, because `KoaDust` keys dust state off the clean date. The honest client presumably always passes today; the RPC accepts the other two dates without comment.
- **User/business impact:** Users can waste 30 coins cleaning a clean room or the wrong date via a stale/buggy client or direct RPC. Small, capped (30 coins per date, 3 dates).
- **Test case:** T-ECO-11 — BLOCKED (no PG): (a) today's date twice → second call returns balance unchanged, one debit; (b) yesterday/tomorrow → each debits 30; (c) 2 days out → raises.
- **Acceptance criteria:** (1) Accepted-date rule documented (today-only vs ±1 day, and why); (2) either the RPC rejects cleaning when not dusty (needs server-side dust computation — L, probably not worth it) or the client disables the clean action when clean AND the RPC documents that it charges regardless; (3) regression test pins the date-window behavior.

### R2-ECO-13 — P3 — Orphaned streak-bonus namespace still minting: no live caller claims `d:*:streak`, yet the server pays 15 coins + 15 XP per key-date

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** `MascotRoomController.claimStreakBonus()` (`MascotRoom.swift:348`) has no app caller (tests only); `autoClaimStreak()` (line 355) is never called; `load()` comments that the 15-coin daily streak bonus was removed in Koa Ecosystem V2 (02/11). Yet `reward_amount_for` still pays `streak:max` = 15 for any in-window `d:<date>:streak` key (`20261029130000_koa_quests_v2.sql:62-63`), and `xpForRefKey` pays 15 XP (`MascotRules.swift:106`). AUD-02's class applied to a dead feature: 15 coins/day of additional forgeable surface, within the 800/day ceiling. Not a duplicate of AUD-02: AUD-02 covers the general unverified-claim defect; this is the specific dead-feature-still-minting fact with its own fix.
- **User/business impact:** None for honest users (no UI offers the bonus). 15 coins + 15 XP/day of additional forgeable surface for scripted claimants.
- **Test case:** T-ECO-03 — BLOCKED (no PG): claim `d:<today>:streak` via RPC with no streak activity; assert it currently pays 15; after retirement, must raise 'unknown reward'.
- **Acceptance criteria:** (1) Either the `streak` branch is removed from `reward_amount_for` with a regression test asserting rejection, or a live claim path is restored with a UI entry point and the same completion verification standard as other quests; (2) `xpForRefKey`'s streak branch matches the decision; (3) no dead claim code remains uncalled without a comment stating intent.

### R2-OPS-01 — P1 — Scheduled CI never runs: default branch `main` contains no workflows, so all schedules are dead

- **Confidence:** HIGH (git objects + public API + GitHub semantics + the files' own warnings). **Evidence scope:** REPOSITORY_VERIFIED (git objects) + public API read (default branch). Actions history NOT_VERIFIED. **Effort:** S (owner decision + one mechanical change). **Beta-blocking:** No (push cadence during beta provides coverage). **Launch-blocking:** Yes.
- **Description:** `git ls-tree origin/main .github/workflows/` → empty; `origin/main` tip `234f6b80` (2026-08-25, old Vite app, no `.github/` at all). GitHub public API: `"default_branch": "main"`. GitHub only runs `schedule` from workflows on the default branch — and three workflow files warn about this themselves (`system-check.yml`, `ios-e2e.yml`, `ios-a11y.yml` headers). Affected: `system-check.yml` daily 01:00 UTC; `ios-e2e.yml` nightly 03:30 UTC; `ios-a11y.yml` nightly 04:15 UTC; `ios-analysis.yml` weekly Monday 02:00 UTC. Push/PR triggers on `native/ios-rewrite` still work — the bot *does* run on push — so this is a cadence/coverage failure, not a total outage. In any quiet stretch with no pushes — exactly the stretch after a launch freeze or during a holiday — nothing checks production health, nothing runs E2E, and the first signal of a regression is a user report. E2E nightlies have likely *never* run.
- **User/business impact:** Silent monitoring gaps; regressions in E2E-covered flows can sit undetected between labeled PRs; advisor/Sentry/PostHog staleness grows with push gaps. No direct user impact today (0 users); operational blindness accumulating ahead of launch.
- **Exploitability/likelihood:** Not exploitable. Likelihood the gap bites: HIGH over any multi-week horizon (any push gap > 24 h breaks the "daily" promise).
- **Remediation options (owner decision — do not unilaterally change the default branch):** (a) merge the 7 workflows to `main`; (b) change the default branch to `native/ios-rewrite` (bigger blast radius); (c) move schedules to a minimal workflow on `main` that dispatches the real checks.
- **Test case:** R2T-01 — SPECIFICATION_ONLY: after the fix, list workflow runs via API for `system-check` with `event=schedule`; ≥1 scheduled run in 24 h; cadence holds 7 days.
- **Acceptance criteria:** (1) Actions history shows a scheduled `system-check` run within 24 h of the fix and daily thereafter for 7 consecutive days; (2) scheduled `ios-e2e` + `ios-a11y` runs appear nightly for 7 days (or a documented decision to drop nightlies, recorded in the workflow headers); (3) workflow headers' default-branch warnings removed or marked resolved with date + evidence link.

### R2-OPS-02 — P2 — RLS policies use bare `auth.uid()` everywhere: per-row re-evaluation on every filtered query (advisor `auth_rls_initplan`)

- **Confidence:** HIGH (pattern + advisor record); MEDIUM (magnitude — no `EXPLAIN ANALYZE`). **Evidence scope:** REPOSITORY_VERIFIED (grep + advisor record). Production query-plan impact NOT_VERIFIED. **Effort:** M (batched, suite-guarded). **Beta-blocking:** No. **Launch-blocking:** No — schedule before 100k actives; record the decision.
- **Description:** 232 occurrences of bare `auth.uid()` across `supabase/migrations/*.sql`; **0** occurrences of `(select auth.uid())`. Wrapping the stable JWT-claim lookup in a scalar subquery lets the planner evaluate it once per query (InitPlan) instead of once per row. The system-check bot's first run recorded `auth_rls_initplan` among 114 performance advisor warnings (`SYSTEM_CHECK.md`, 28/10, "chưa xử lý"). Every owner-scoped policy, the feed policy with per-row `EXISTS` checks, and every definer function body reading `auth.uid()` per row pays this. Systemic, low-grade tax; the cheapest broad perf win available — but policy rewrites are behavior-sensitive and must be batched by table family with per-batch suite runs, not one giant migration.
- **User/business impact:** Higher p50/p95 on all authenticated reads; wasted DB CPU compounding with AUD-09 scans. No functional impact. At 0–10k users likely imperceptible; at 100k+ a measurable contributor.
- **Test case:** R2T-02 — NOT_EXECUTED (no PG on that worker): throwaway PG16 cluster, ≥50k synthetic rows; `EXPLAIN (ANALYZE, BUFFERS)` a feed-page query before/after the wrapped-policy migration; InitPlan present post-fix; no regression; suites green.
- **Acceptance criteria:** (1) `auth_rls_initplan` advisor warnings = 0 on the live project (bot output); (2) `EXPLAIN ANALYZE` on 3 representative queries shows InitPlan evaluation on a staging/throwaway cluster with ≥50k rows; (3) community + core SQL suites + mutation suites green after the rewrite; (4) bare-`auth.uid()` grep count in *policies* = 0 (function bodies reviewed case-by-case).

### R2-OPS-03 — P1 — No manual error reporting anywhere: Sentry is crash-only, PostHog is funnel-only, operators cannot detect failures

- **Confidence:** HIGH (exhaustive greps + call-chain reading). **Evidence scope:** REPOSITORY_VERIFIED (code greps). Production event flow NOT_VERIFIED. **Effort:** M. **Beta-blocking:** No (beta cohort small, direct contact). **Launch-blocking:** Yes — do not launch without at least sync/AI/edge failure reporting live and verified.
- **Description:** (1) Grep `SentrySDK.capture` / `captureError` / `captureException` across app + packages (excluding Tests): exactly **one** hit — the Debug-only test message (`Telemetry.swift:82`). No production code reports any error to Sentry. (2) No custom transactions/spans — only `tracesSampleRate = 0.2`. (3) `Telemetry.Event` (31 cases) is exclusively funnel/product events; no failure, error, sync, or latency events exist. (4) `DailyLog.rebuildAfterWrite` returns `[DailyLogRebuildError]` but `SupabaseRemoteWriter`'s `afterWrite` callback is `(OutboxEntry) async -> Void` — rebuild failures are discarded by the call chain (by design, but no diagnostic consumer exists). (5) No `Logger`/`os_log` structured logging in production code. (6) PostHog `$exception`: the bot queries it but nothing sends it — the check is vacuous. (7) Edge side: console logs only (AUD-33), no error-rate signal. (8) No `pg_stat`, uptime, latency, or Auth-log monitoring. Detection matrix: failed sync **no**, reward abuse **no**, purchase failures **no**, DB errors **no**, auth failures **no**, latency **no**, data growth **no**, migration failures **partially** (bot drift check, push-triggered), HealthKit failures **no**, failed AI calls **partially** (console logs within retention).
- **User/business impact:** Mean-time-to-detect for backend/client failures is unbounded (complaint-driven). A broken sync or AI path could affect all users for days. Post-launch, this is the difference between a 1-hour incident and a 1-week incident.
- **Remediation:** A small, fixed error-reporting API (mirror `Telemetry.Event`'s fixed-enum discipline — no free-form strings, no PII/health data): report sync dead-letters + rebuild failures + HealthKit failures + edge-call failures (by function + failure class, no bodies) to Sentry as non-fatal events with sampling; Sentry breadcrumbs for sync drain start/finish; verify end-to-end with the Debug test hook + a staging/throwaway Sentry project. Server side: structured JSON logs with request ids + daily error-scan in the bot (AUD-33) — one detection program, not two.
- **Test cases:** R2T-03a — NOT_EXECUTED (simulator + throwaway Sentry project; poisoned entry → exactly one classified event, no payload/PII; current code predicts zero events). R2T-03b — SPECIFICATION_ONLY (reporting hook does not exist yet; failing `RowStore` → reporter invoked once per failed day; existing swallow behavior preserved).
- **Acceptance criteria:** (1) Synthetic sync failure produces a Sentry event visible within 5 minutes; (2) synthetic AI timeout produces a classified failure event (function + class, no prompt/body); (3) the detection matrix has no "no" remaining for failed sync, AI failures, DB errors, latency; (4) no PII/health values in any new event (payload review).

### R2-OPS-04 — P2 — Client/server timeout mismatch: 25 s idle timeout vs non-streaming AI calls that legitimately take longer

- **Confidence:** HIGH (timeout values + call paths + classification, all read); MEDIUM (real-world frequency — provider latency distribution NOT_VERIFIED). **Evidence scope:** REPOSITORY_VERIFIED (timeout arithmetic from code). Production behavior NOT_VERIFIED. **Effort:** S–M. **Beta-blocking:** No. **Launch-blocking:** No — fix or explicitly accept before opening AI to many users.
- **Description:** Client: `StallRecovery.requestTimeout = 25` s, `timeoutIntervalForRequest` on the dedicated session used by the shared `SupabaseClient` (`StallRecovery.swift:17-28`; `Backend.swift:20-30`). `timeoutIntervalForRequest` is an *idle* timeout (no bytes for 25 s → `-1001`). Server: `_shared/ai.ts` header timeout 20 s per attempt, up to 3 attempts per provider on 503, up to 3 providers — worst-case time-to-first-byte >60 s on the failover path; vision calls get `max(TIMEOUT_MS, 45_000)`. Non-streaming functions return full JSON — zero bytes until generation completes — so the full generation + failover time must fit in one 25 s idle window. `ai-coach` is EXEMPT (streams SSE over `URLSession.shared`, 60 s default). Classification: `.timedOut` is in `NetworkFailure.offlineCodes`, and `SupabaseEdgeCaller.failure` maps offline-classified errors to `.offline` — so a slow AI call surfaces as "offline" UX, and the quota claim is already spent. The 25 s timeout was tuned for PostgREST and is correct for REST; it is wrong for AI. The overlap is deterministic *when* the provider is slow — arithmetic, not a race.
- **User/business impact:** AI features appear broken/offline precisely when the provider is slow; quota burn on retries; misleading diagnostics. Bounded by per-user daily quotas; no data loss.
- **Test case:** R2T-04 — NOT_EXECUTED (simulator + controllable fake edge endpoint delaying first byte 30 s then 60 s): 30 s → success; 60 s → distinct timeout failure, not offline. Current code predicts abort at 25 s + offline classification.
- **Acceptance criteria:** (1) Vision AI call with 30–44 s server time-to-first-byte completes on device; (2) provider-side 503 failover within the new budget surfaces success, not "offline"; (3) genuine timeout surfaces a distinct AI-timeout message (not offline) and does not double-spend quota on a single user-visible retry beyond the documented claim policy; (4) PostgREST calls keep the 25 s policy (existing `StallRecoveryTests` still pass).

### R2-OPS-06 — P2 — Release process is manual and single-machine: no CI release build, no automated TestFlight upload, no staged rollout/rollback plan; telemetry keys live only on the Archive machine

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED (docs + workflows + scripts). Production release history NOT_VERIFIED. **Effort:** M (CI release-build + verification + smoke automation; L for full fastlane automation — recommend the M slice first). **Beta-blocking:** No (checklist + small cohort suffices). **Launch-blocking:** Yes.
- **Description:** `TESTFLIGHT-CHECKLIST.md`: Archive is hand-operated in Xcode; step 2 requires `Backend.local.xcconfig` on the Archive machine for Sentry/PostHog keys — the release build's telemetry depends on one machine's uncommitted file, with no verification step that keys were baked in. Build number auto-increments via script (good). dSYM upload is a build phase that warns-never-fails (missing sentry-cli/login → build still passes). No workflow builds Release, uploads to TestFlight, or runs a release smoke test (no fastlane, no `xcodebuild archive`, no App Store Connect API use). `MARKETING_VERSION 0.1.0`. No staged-rollout, phased-release, or rollback plan in any doc. Signing is explicitly out of CI. Two silent failure modes (keys missing → blind release; dSYM missing → unreadable crashes) and no automated verification that the shipped binary is the tested commit.
- **User/business impact:** A blind or mis-built release ships without detection; a bad release has no rehearsed rollback. Single-machine dependency = bus factor 1 for releases.
- **Test case:** R2T-06 — SPECIFICATION_ONLY: CI Release build; assert commit stamp matches the tag; release-gate on the binary; Info.plist telemetry keys non-empty; dSYM upload confirmed in Sentry. Gate must block a deliberately key-less build.
- **Acceptance criteria:** (1) CI job builds Release from the exact tagged commit and its artifact hash matches the submitted build (or submission is from the CI artifact); (2) release-gate check asserts Sentry/PostHog key presence in the Release binary's Info.plist (or records an explicit, dated decision to ship blind); (3) dSYM upload success verified in Sentry for the release version before rollout; (4) rollout/rollback doc exists with % schedule + halt criteria + owner. Minimum launch gate: (a) + (b) + (d).

### R2-OPS-07 — P2 — Edge-function tests: one Deno test file exists with no runner in any workflow; `_shared/*` coverage depends on legacy RN-gate shims invisible to native-only PRs

- **Confidence:** HIGH (file inventory + workflow triggers read). **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No — but the Deno job should exist before launch; handler tests for quota/claim paths before monetized launch.
- **Description:** `supabase/functions/ai-log-parse/parse_test.ts` (Deno test) is the **only** test file under `supabase/functions/`. Grep for `deno test` / `vitest` / `jest` across workflows + `supabase/`: zero. No workflow installs Deno or runs it. Behavioral coverage of edge handlers *does* exist — in the legacy RN gate (`native/tools/*.mjs` driving real handlers via Node shims, run in `quality-gate.yml`) — but `quality-gate.yml` is the RN gate; a native-only PR touching `supabase/functions/_shared/ai.ts` triggers `sql-community.yml` (SQL only) and possibly `ios.yml` (path-filtered out for `supabase/`-only changes) — the shim tests that actually exercise the changed handler may never run in the PR's own checks. The most privileged code in the system (quota gates, Apple verification, AI failover) has no runtime-native test execution in CI.
- **User/business impact:** Handler regressions (validation, quota, error-shape changes) can merge without any automated handler test running in the PR's own checks. Blast radius bounded by SQL suites + shims when the RN gate runs and is watched.
- **Test case:** R2T-07 — NOT_EXECUTED (no Deno, no CI access): `deno test supabase/functions/ai-log-parse/parse_test.ts` exit 0; new job runs and gates on a functions-only PR.
- **Acceptance criteria:** (1) CI job runs `deno test` on every `supabase/functions/**` change, green on the tip; (2) `parse_test.ts` passes in CI (currently: unknown — never run); (3) new tests cover claim-before-work ordering + `localDate`/`oneOf` validation; (4) no workflow depends on `deno.land` at test time without vendoring/pinning.

### R2-OPS-08 — P3 — Second tier of unbounded / repeated reads: triple 90-day session fetches, uncapped inbox/DM-list endpoints, `select("*")` stragglers

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No.
- **Description:** (1) Three books fetch the same 90-day `workout_sessions` window with overlapping columns and no limit: `SupabaseHistorySource.sessions`, `SupabasePerformanceSource.sessions`, `LastPerformance` via the same source — each with its own cache namespace, so one screen transition can re-fetch the same window (with full `sets` JSONB) three times. `SupabaseTrainingHistory.sessionTimes` adds a fourth overlapping read (dates only, cheap). Window-bounded (small for any plausible user); the waste is repeated requests + JSONB payload, not truncation risk. (2) `dm_inbox()` RPC `LIMIT 200`, no cursor; notifications `LIMIT 100`, no cursor; `SupabaseAwardsSource.earned()` unbounded (practically bounded by the catalogue); `SupabaseCoachMemoryStore.facts()` unbounded (practically bounded by the 40-row server trim). (3) `select("*")`: `SupabaseProfile.profile` (1 row) and `SupabaseProgressPhotos.rows` (200/page, all pages loaded) — small tables today, but `*` means every future column ships automatically. Edge `select("*")` sites (profiles/daily_logs/sleep_logs in 3 AI functions) are the larger payload concern.
- **User/business impact:** Extra requests + payload on common screens; future truncation/UX cliffs on inbox/DM lists as usage grows. No current user impact (0 users).
- **Test case:** R2T-08 — SPECIFICATION_ONLY: drive History + Performance + LastPerformance refresh for the same window; post-fix underlying session fetches = 1 (current code, by reading: 3).
- **Acceptance criteria:** (1) Opening History → Progress → Today issues ≤ 1 ninety-day session fetch per refresh cycle (counted via a recording source in tests); (2) zero `select("*")` in Swift + edge code, or each remaining site documented with a reason; (3) `dm_inbox` + notifications support cursor paging (or a dated decision records the 200/100 caps as accepted product limits with UI affordance when hit).

### R2-OPS-09 — P2 — Shipped privacy text asserts 30-day backup persistence with no operational evidence; if the plan has no backups, the statement is false

- **Confidence:** HIGH (claim text + absence verified). **Evidence scope:** REPOSITORY_VERIFIED (claim + absence). Production backup state NOT_VERIFIED. **Effort:** S (one dashboard check + one text correction if needed). **Beta-blocking:** No (beta users are test accounts; still, correct before any external beta). **Launch-blocking:** Yes — privacy-policy accuracy is a launch gate.
- **Description:** `apps/ios/ASCND/Resources/legal-content.json:485`, §6 "Retention and deletion": "Automatic infrastructure backups may persist for up to 30 days before being overwritten." The hedge ("may persist") softens but does not remove the factual presupposition that automatic infrastructure backups exist. No backup/PITR evidence exists anywhere in the repo (AUD-01). Supabase Free-tier projects have no backups (platform behavior — stated as the reason verification is urgent, not as a claim about this project's plan, which is NOT_VERIFIED). The same file is the in-app legal content users will read. Either backups exist (prove it, and AUD-01's production half starts to close) or they do not (correct the text before anyone relies on it — including the account-deletion story). The worst outcome is launching with the sentence unexamined in either direction.
- **User/business impact:** Misstated retention/deletion behavior in a privacy policy is a trust and regulatory risk disproportionate to its size. No functional impact.
- **Test case:** R2T-09 — BLOCKED (dashboard access unavailable; read-only check, blocked only on credentials): record plan, PITR toggle, backup retention days; diff against the legal wording; file the diff + correction.
- **Acceptance criteria:** (1) Dashboard evidence of backup/PITR state + retention days recorded; (2) legal text matches the evidence exactly (retention days, PITR vs daily snapshots, deletion semantics); (3) AUD-01's production half updated with the same evidence (single source of truth). Do not "fix" by deleting the sentence without understanding deletion semantics.

### R2-OPS-10 — P3 — No performance budgets, regression gates, or load evidence: perf harnesses are manual and threshold-free

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** M. **Beta-blocking:** No. **Launch-blocking:** No — but EXPLAIN-shape assertions should exist before the search-index work lands, so the improvement is provable.
- **Description:** `supabase/tests/community/perf_find_recipes.sh` + `perf_search_profiles.sh` are explicitly "measurement, not a pass/fail test" — not run in `run.sh`, not run in any workflow, no thresholds. `apps/ios/tools/native-perf-audit.mjs` is a static scan that "does not measure runtime"; this audit executed it: `native-perf-audit: XANH (0 lỗi)`, exit 0 (T-OPS-07). No startup-time, memory, frame-rate, payload-size, or API-latency budget exists in any doc, test, or workflow. No load/stress test exists or is permitted against production; no isolated load harness exists either. The SQL suites assert *correctness*, never *cost*: a query returning the right rows in 10 s passes. Performance is defended by code review + one-off manual measurement; nothing prevents a regression from merging silently.
- **User/business impact:** Silent perf regressions accumulate; scale cliffs arrive without warning. No immediate user impact.
- **Test case:** R2T-10 — NOT_EXECUTED (no PG): throwaway PG16 cluster, 50k synthetic posts/profiles; `EXPLAIN (COSTS OFF)` on the useful-feed query, following-feed query, `community_find_posts('zzz')`, `dm_inbox()`; shapes match the recorded baseline (search RPCs are *expected* seq scans until fixes land; the assertion is that the expectation is explicit and versioned).
- **Acceptance criteria:** (1) Perf scripts run in CI (or on a schedule — see R2-OPS-01) with results archived per commit; (2) `EXPLAIN`-shape assertions exist for ≥4 hot queries and fail if a seq scan appears where an index scan is expected; (3) 3 consecutive startup/memory baselines recorded for the E2E build. Keep thresholds out until baselines exist — a guessed threshold is worse than none.

### R2-OPS-11 — P3 — Deploy records exist only as prose (with duplicated entries); no structured deploy log, version map, or deploy-freeze/rollback runbook

- **Confidence:** HIGH. **Evidence scope:** REPOSITORY_VERIFIED. **Effort:** S. **Beta-blocking:** No. **Launch-blocking:** No — but the rollback runbook should exist before launch (fold into AUD-01/AUD-07 closure).
- **Description:** Deploy history lives in `CONSTRAINTS_AND_DEFERRED.md` as struck-through prose with dates, versions, and `migration list` match counts. The Koa-pause entry appears **4×** (lines 472, 476, 477, 478) with slight variations, annotated as a "lỗi gộp sổ" (merge duplication) — the log documents its own unreliability. Function versions are mentioned ad hoc with no complete version→SHA→date map. The system-check bot *does* diff deployed function code vs repo and applied vs repo migrations — the only structured control — but its output is NOT_VERIFIED and its schedule is dead (R2-OPS-01). No deploy-freeze window, no rollback runbook, no "who can deploy" record beyond "Kiệt duyệt trong chat" (good control, no durable record outside chat + prose). The team has working deploy *discipline* but no deploy *record* an incident responder can query in minutes.
- **User/business impact:** Slower incident response; higher risk of a wrong revert. No direct user impact today. P3 because the discipline exists and the scale is small — it becomes a P1 the first time a bad deploy needs reverting under pressure.
- **Test case:** R2T-11 — SPECIFICATION_ONLY (process test): after the next deploy, a second person reconstructs "what changed, at what SHA" from the log only; compare against the bot's diff; exact match, no chat archaeology.
- **Acceptance criteria:** (1) Every deploy after the fix has exactly one log row with all 7 fields (date, migration/function, version, SHA, approver, `migration list` result, verification note); (2) the two stale CHƯA DEPLOY headers corrected; (3) rollback runbook exists naming the compensating-migration procedure + who decides + freeze criteria; (4) duplicated Koa entries consolidated with a dated note (strike + annotate, don't delete).

**Folded, not counted separately:** R2-OPS-05 (rebuild amplification detail — mechanism + acceptance criteria folded into AUD-50's remediation in Part A); R2-API-04 (relationship oracles — folded into R2-DB-01 + AUD-40).

**Part B totals: P0: 0, P1: 2, P2: 12, P3: 28 = 42 new findings.**

---

## Combined totals

| Group | Count |
|---|---|
| Round 1 findings revalidated | 88 (72 CONFIRMED, 15 PARTIALLY_CONFIRMED, 1 NOT_REPRODUCIBLE, 0 FIXED_AND_VERIFIED) |
| New Round 2 findings | 42 (0 P0, 2 P1, 12 P2, 28 P3) |
| **Total tracked items** | **130** |
| Launch-blocking items | 11 (AUD-01, AUD-02-decision, AUD-04, AUD-06, AUD-07, AUD-14-decision, R2-OPS-01, R2-OPS-03, R2-OPS-06, R2-OPS-09, R2-SYNC-01) |
| Beta-blocking items | 2 (AUD-01, AUD-06) + AUD-48 live checks (B-5) |

*End of findings register.*
