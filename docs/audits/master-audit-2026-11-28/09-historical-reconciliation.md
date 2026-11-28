# Report 9 — Historical Audit Reconciliation

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w6-docs-history.md §4–§5 (worker W6). Compares backend audit R1/R2 (130 findings), Koa audit (60 findings), beta/launch gates, and R3 findings against tip 5e673df3. Statuses: RESOLVED / PARTIALLY_RESOLVED / STILL_OPEN / REGRESSED / SUPERSEDED / NOT_REPRODUCIBLE / UNVERIFIED. "RESOLVED (code)" means present in code at tip, not runtime-verified.

## §4 — Historical findings reconciliation (tip `5e673df3`)

### §4.1 Backend R1 + R2 — 130 findings

Prior status is the R2 register verdict at tip `b19e9822` (12/11). "Now" is verified at tip `5e673df3` (24/11). Deploy state is from the CONSTRAINTS deploy log unless a migration file is cited; live-production behavior is UNVERIFIED throughout except where a probe is explicitly cited.

| ID | Sev | Prior (R2) | Now | Evidence |
|---|---|---|---|---|
| AUD-01 | CRITICAL | CONFIRMED | **STILL_OPEN** | R3 `supabase backups list` 12/11: `pitr_enabled: false`, `backups: []` (R3 §3, CONSTRAINTS:40). legal-content.json:485 still asserts 30-day backups (verified at tip). No restore drill, no PITR. Owner decision pending (B-1/L-1). |
| AUD-02 | HIGH | CONFIRMED | **PARTIALLY_RESOLVED** | `20261112120000_reward_key_shapes.sql` (PR #875, merged 13/11, deployed 16/11, `migration list` 94/94): `w:` retired (→ NULL), `ch:` shape-validated (ISO Monday, that week's 3 deterministic challenges or `koa_week`, canonical tier). Still client-asserted completion: `d:` (incl. `d:*:streak` = 15, R2-ECO-13) and `x:` (195 one-time) still pay without verification — R3-SEC-02, accepted residual in R3 docs, no Kiệt sign-off recorded. |
| AUD-03 | HIGH | CONFIRMED | **STILL_OPEN** | No award-grant RPC at tip; `SupabaseAwardsSource.grant` still client INSERT (no PR references it). R3 next step #2. |
| AUD-04 | HIGH | CONFIRMED | **PARTIALLY_RESOLVED** | Client half now exists: `Store/StoreKitClient.swift` + `PurchaseController.swift` + `Features/Settings/PaywallView.swift` (PR #920, merged 20/11, `13de1375`). Server half still cut: `verify-purchase`/`store-webhook` CHƯA deploy per CONSTRAINTS:41 (probe 17/11, no later deploy note); no ASC products; paywall shows "chưa mở bán". |
| AUD-05 | HIGH | CONFIRMED | **RESOLVED** (code) | R3 paging (500/page, ordered by muscle_group, name, id; >20 pages throws) + `LibraryPagingTests` (PR #875). |
| AUD-06 | HIGH | CONFIRMED | **RESOLVED** (code) | Outbox parks per owner: `Outbox.swift:241 park()`, `SyncWorker.swift:172 signOut()` returns parked count, `purge(userId:)` only on account deletion (PR #875; ASCNDKit 2204 ✓, ASCNDStore 78 ✓). #241 decided option (b)/A (CONSTRAINTS:696). Simulator E2E park/resend NOT RUN (R3 test report) — runtime verification pending. |
| AUD-07 | HIGH | PARTIALLY_CONFIRMED | **STILL_OPEN** | No staging project, manual deploys, no rollback procedure/runbook at tip. R2-OPS-11 still open. |
| AUD-08 | HIGH | CONFIRMED | **STILL_OPEN** | `workout_sessions.sets` / `workout_templates.exercises` still unvalidated JSONB, no FK to `exercises`. No migration. |
| AUD-09 | HIGH | CONFIRMED | **STILL_OPEN** | No GIN/FTS/trigram index at tip (no migration references pg_trgm/FTS); `find_posts` 4× fold unaddressed. R3 §6 lists it open. |
| AUD-10 | HIGH | PARTIALLY_CONFIRMED | **RESOLVED** | `20261112130000_fk_indexes.sql` + `20261112130100_community_fk_indexes.sql` (PR #875, deployed 16/11, 94/94) + guard tests in both suites. |
| AUD-11 | HIGH | CONFIRMED | **STILL_OPEN** | Dead tables (`scan_history`, `weekly_reviews`, `habit_nudges`, `wearable_sources`) not dropped; no migration. Live row counts UNVERIFIED. |
| AUD-12 | MED | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | Koa migrations deployed 03/11 (86/86) + 04/11 (87/87) per CONSTRAINTS. But both files still carry stale `CHƯA DEPLOY` headers at tip (verified: `20261103120000_koa_pauses.sql:2`, `20261104120000_koa_pause_log.sql:3`). R2-OPS-11 item (2) still open. |
| AUD-13 | MED | PARTIALLY_CONFIRMED | **RESOLVED** | `supabase/tests/all-migrations/` added (PR #925) + `all-migrations` job in `sql-community.yml`; full-chain apply now in CI config. |
| AUD-14 | HIGH | CONFIRMED | **RESOLVED** | `20261112140000_streak_freeze_sale_closed.sql` revokes `buy_streak_freeze` from `authenticated` (PR #875, deployed 16/11; REST anon → 42501 per CONSTRAINTS:698). Buy path closed (option B). |
| AUD-15 | MED | CONFIRMED | **STILL_OPEN** | Structural: 88 SECURITY DEFINER functions remain; mitigation is suites + revokes, ongoing. |
| AUD-16 | MED | CONFIRMED | **PARTIALLY_RESOLVED** | `20261124120000_dedupe_indexes_pin_search_path.sql` merged (PR #1012, `ed2a4d92`) removing 15 duplicate indexes — but **CHƯA deploy** per CONSTRAINTS:727 ("cần Kiệt duyệt"). |
| AUD-17 | MED | CONFIRMED | **STILL_OPEN** | Same 9 tables lack `updated_at` triggers; no migration. |
| AUD-18 | MED | CONFIRMED | **STILL_OPEN** | Three identity tables, no single aggregate; no consolidation. |
| AUD-19 | MED | CONFIRMED | **STILL_OPEN** | Denormalized aggregates with no reconciliation job. |
| AUD-20 | MED | CONFIRMED | **STILL_OPEN** | Readiness/daily aggregates still client-computed and client-writable, no server validation. |
| AUD-21 | MED | CONFIRMED | **STILL_OPEN** | No re-auth for deletion; #919 added Apple token revoke only. CONSTRAINTS:251: client sending a fresh Apple auth code on delete is still not done. |
| AUD-22 | MED | CONFIRMED | **STILL_OPEN** | 2026-02 core schema still lacks CHECK validation; no backfill migration. |
| AUD-23 | MED | CONFIRMED | **STILL_OPEN** | `ai_credits` still has no top-up path; StoreKit #920 sells subscriptions, not credits. |
| AUD-24 | MED | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | Drift guards run in `quality-gate.yml` on push (recent runs success 24/11). Swift `ReadinessEngine`/streak cross-implementation check still absent; RN golden vectors dropped 17/11 (#929) — the guard suite now covers a dropped side. |
| AUD-25 | MED | CONFIRMED | **STILL_OPEN** | Challenge progress still verifies against client-authored `workout_sessions` rows. |
| AUD-26 | MED | PARTIALLY_CONFIRMED | **STILL_OPEN** | `community_restrictions.created_by` / `community_review_requests.decided_by` still FK-less and undocumented; no migration. |
| AUD-27 | MED | CONFIRMED | **STILL_OPEN** | Following feed still re-fetches the full followee list into a URL `IN()` filter. R3 §6: deferred as too risky to bundle. |
| AUD-28 | MED | CONFIRMED | **RESOLVED** (code) | `20261112150000_mascot_wallet.sql` — server-side `mascot_wallet()` RPC (PR #875, deployed 16/11; REST anon → 42501); app uses it with fallback to the old read (`SupabaseMascot.swift:22-28,51-65`). |
| AUD-29 | MED | CONFIRMED | **PARTIALLY_RESOLVED** | StateWriter intents now persisted to GRDB (`StateIntentStore`, #930 per MAP_DATA). Multi-device silent LWW for day-keyed logs still stands. |
| AUD-30 | MED | CONFIRMED | **STILL_OPEN** | No retention/archival/partitioning/soft-delete. |
| AUD-31 | MED | CONFIRMED | **STILL_OPEN** | No audit trail outside community moderation. |
| AUD-32 | LOW | CONFIRMED | **UNVERIFIED** | Not re-checked at tip; no PR between 12–24/11 references photo-delete ordering. Needs a code re-read. |
| AUD-33 | MED | CONFIRMED | **PARTIALLY_RESOLVED** | R3 `SyncWorker.onIncident` → Sentry (`sync.dead`, `sync.local_write`, `sync.rebuild_failed`) with kind/reason/code, no PII (PR #875). Edge functions still console-logs only; no error-rate signal. |
| AUD-34 | LOW | CONFIRMED | **PARTIALLY_RESOLVED** | Rounding rule fixed: meal total = sum of rounded items (#923 per MAP_DATA). Meal + items still two non-transactional requests; no sum CHECK/trigger. |
| AUD-35 | LOW | CONFIRMED | **PARTIALLY_RESOLVED** | `profiles.weight_kg` write error now propagates to the caller instead of being swallowed (#926 per MAP_DATA). Conditional update / `weight_as_of` column still absent. |
| AUD-36 | LOW | CONFIRMED | **STILL_OPEN** | `body_checks` still directly client-writable; no `source` column / server-only write. |
| AUD-37 | LOW | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | All 11 auth-required functions still call `requireUser` first (R3 reconfirmed); `verify_jwt = false` everywhere by design (`config.toml` verified at tip). Residual: `edge-auth.mjs` stale (see R2-API-09). |
| AUD-38 | LOW | NOT_REPRODUCIBLE | **NOT_REPRODUCIBLE** | R2 disproved the exploit (PostgreSQL re-uses `USING` as `WITH CHECK`; probes T-P3/P3b). Closed; P3 hygiene only (explicit `WITH CHECK` not yet added). |
| AUD-39 | LOW | CONFIRMED | **STILL_OPEN** | No parent-owner check on `body_checks.photo_id`; no migration. |
| AUD-40 | LOW | CONFIRMED | **STILL_OPEN** | `dm_can_message` still does not check `p_me` vs `auth.uid()`; no migration. |
| AUD-41 | LOW | CONFIRMED | **PARTIALLY_RESOLVED** | Dedupe migration (PR #1012) pins `search_path = ''` for 2 trigger functions. Explicit `REVOKE EXECUTE` on the 8 trigger functions: no REVOKE lines found in that migration — still open as hygiene. |
| AUD-42 | INFO | CONFIRMED | **RESOLVED** (accepted) | Anon reads of shared-library rows are by design; no action. |
| AUD-43 | INFO/LOW | CONFIRMED | **PARTIALLY_RESOLVED** | 2 trigger functions pinned to `search_path = ''` (PR #1012); `community_fold` intentionally unpinned with a documented reason (inlining in the search index); the remaining ~89 functions still `search_path = public`. |
| AUD-44 | INFO | PARTIALLY_CONFIRMED | **UNVERIFIED** | Legacy publishable key in history (commit `3beafaca`); rotation/validity and removal commit unverified — no dashboard access. |
| AUD-45 | INFO | CONFIRMED | **STILL_OPEN** | Whole-thread deletion on counterparty account delete is still the behavior; owner decision + privacy-policy coverage not recorded. |
| AUD-46 | LOW | CONFIRMED | **STILL_OPEN** | No rate limiting on `verify-purchase`/`store-webhook`/`delete-account`/`admin-art`. |
| AUD-47 | MED | CONFIRMED | **RESOLVED** (code) | `verify-purchase/index.ts` `!ent` branch now checks the upsert error → 500 (verified in file at tip; PR #875). Staging test with induced DB error NOT RUN (R3 test report). |
| AUD-48 | MED | CONFIRMED | **PARTIALLY_RESOLVED** | Backups list done (R3, 12/11); migration lists recorded (94/94, 97/97, 98/98); function deploy versions partially recorded (ai-coach v29→v30, etc.). No consolidated 20-item written record; most items still open. |
| AUD-49 | MED | CONFIRMED | **STILL_OPEN** | DM history still oldest-first `LIMIT 500`, no cursor. |
| AUD-50 | MED | CONFIRMED | **RESOLVED** (code) | `DailyLog.readSources` now parallel via `withTaskGroup` (`DailyLog.swift:496-497`); drain coalesced into `rebuildAfterWrites(entries, ...)` + one `widgets.refresh()` per drain (`AppServices.swift:310-315`, #929). Measured drain counts not published. |
| AUD-51 | MED | CONFIRMED | **STILL_OPEN** | Hot-post trigger serialization unchanged; contention unmeasured. |
| AUD-52 | MED | CONFIRMED | **STILL_OPEN** | No `HKAnchoredObjectQuery`/persisted anchor in the tree (MAP_DATA 17/11 confirms full-window re-reads; no PR references anchors). |
| AUD-53 | LOW | CONFIRMED | **STILL_OPEN** | Awards water OFFSET scan + `recentItems` unindexed scan unchanged. |
| AUD-54 | MED | CONFIRMED | **STILL_OPEN** | Aggregate AI spend unbounded; no queue/backpressure; vision worst case ~405 s. |
| AUD-55 | MED | CONFIRMED | **STILL_OPEN** | Useful-feed index column order still reversed. |
| AUD-56 | MED | CONFIRMED | **STILL_OPEN** | No background outbox drain; only `.appRefresh(CommunityAlerts)` exists. |
| AUD-57 | MED | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | Bot runs on push (recent runs success 24/11) but schedule is dead (R2-OPS-01) and server checks never ran — missing `SUPABASE_ACCESS_TOKEN` (CONSTRAINTS:727). Advisor backlog (73 security + 114 perf, 28/10) untriaged. |
| AUD-58 | MED | CONFIRMED | **PARTIALLY_RESOLVED** | Telemetry keys wired into CI builds (PR #917, merged 17/11). Release-build telemetry liveness still UNVERIFIED (no release build + dashboard check). |
| AUD-59 | MED | CONFIRMED | **STILL_OPEN** | Realtime still not implemented; fetch-on-demand stands; product decision pending. |
| AUD-60 | MED | PARTIALLY_CONFIRMED | **STILL_OPEN** | No `pg_cron`/scheduled functions in repo; dashboard cron UNVERIFIED. |
| AUD-61 | MED | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | Native admin/moderation UI now exists (`AdminArtView`, `AdminAuditView`, `AdminUsersView`, `AdminUserView`, `Moderation*View` — added at tip). Whether granted RPCs now match callers (incl. `community_request_review`, which had no caller anywhere) is UNVERIFIED — not re-checked. |
| AUD-62 | LOW | CONFIRMED | **PARTIALLY_RESOLVED** | Retry-dead exists, undecodable rows counted + shown in WorkoutLab + incident, `outbox_dead`/`read_cache` pruned (30d/100) — #927 per MAP_DATA. Single-lane head-of-line blocking unchanged. |
| AUD-63 | LOW | PARTIALLY_CONFIRMED | **STILL_OPEN** | Read caches still have no TTL/staleness indication. |
| AUD-64 | LOW | CONFIRMED | **RESOLVED** | `20261119120000_claim_duplicate_marker.sql`: duplicate claims return 0, ceiling not consulted (PR #960, merged 19/11, deployed 19/11, `migration list` 97/97; app treats 0 as already-claimed). |
| AUD-65 | LOW | PARTIALLY_CONFIRMED | **RESOLVED** | `20261120120000_shop_atomic_wear.sql`: check moved inside the lock, `unique_violation` → 'already owned' (PR #967, merged 19/11, deployed 20/11, 98/98). |
| AUD-66 | LOW | CONFIRMED | **STILL_OPEN** | `spend_ai_tokens`/`ai_gate`/`claim_ai_call` still directly callable by any authenticated user; `claim_ai_call` still has no live edge caller. |
| AUD-67 | LOW | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | Coach stream now has `firstByteTimeout` + 60 s idle-after-first-byte watch (`SupabaseCoach.swift:113-130`, PR #961). Non-streaming AI calls still under the 25 s idle timeout (R2-OPS-04). |
| AUD-68 | LOW | CONFIRMED | **STILL_OPEN** | `spend_ai_tokens` still UPDATE-only (no upsert of the `ai_usage` row); no migration. |
| AUD-69 | LOW | CONFIRMED | **STILL_OPEN** | `ai-coach-memory` writes still non-transactional. |
| AUD-70 | LOW | CONFIRMED | **STILL_OPEN** | `ai-meal-suggest`/`ai-smart-nudges`/`ai-weekly-review` still return model output without plausibility/shape validation. |
| AUD-71 | LOW | CONFIRMED | **STILL_OPEN** | Wasted reads (`prevWeekRes` unused, double workout read, `select("*")`) still present; no PR references them. |
| AUD-72 | INFO | CONFIRMED | **RESOLVED** (accepted) | Public-by-design social reads; no action unless private accounts arrive. |
| AUD-73 | INFO | CONFIRMED | **RESOLVED** (accepted) | No certificate pinning; acceptable for a Supabase-backed app. |
| AUD-74 | INFO | CONFIRMED | **RESOLVED** (code) | `Telemetry/TelemetryScrubber.swift` + `TelemetryScrubberTests.swift` exist at tip (PR #928 per MAP_DATA). |
| AUD-75 | INFO | PARTIALLY_CONFIRMED | **PARTIALLY_RESOLVED** | File protection is set (R2 correction stands). SQLCipher / Data Protection entitlement decision still not recorded. |
| AUD-76 | INFO | CONFIRMED | **RESOLVED** (accepted) | CORS `*`, no credentials; standard pattern. |
| AUD-77 | INFO | CONFIRMED | **RESOLVED** (accepted) | Non-atomic rate-limit counters; note for moderation tuning. |
| AUD-78 | INFO | CONFIRMED | **RESOLVED** (accepted) | Direct RPC quota burn is self-harm only. |
| AUD-79 | INFO | CONFIRMED | **UNVERIFIED** | Barcode → OpenFoodFacts (barcode + IP revealed); privacy-policy coverage NOT_VERIFIED. |
| AUD-80 | INFO | CONFIRMED | **RESOLVED** (accepted) | App Group holds only widget display data; verified good. |
| AUD-81 | INFO | CONFIRMED | **STILL_OPEN** | UTC-day ceiling vs local-date claim keys; decision not recorded. |
| AUD-82 | INFO | CONFIRMED | **STILL_OPEN** | `store-webhook` 64 KiB check still after `req.json()` parse (no PR references the handler; function undeployed). |
| AUD-83 | INFO | CONFIRMED | **RESOLVED** (accepted) | Two schema style eras, zero enums; cosmetic. |
| AUD-84 | LOW | CONFIRMED | **STILL_OPEN** | `community_posts.source_id` polymorphism still undocumented; UNIQUE still kind-blind. |
| AUD-85 | INFO | CONFIRMED | **STILL_OPEN** | `image_source` CHECK, `buy_streak_freeze` overloads, uncommented price migration — cleanup not done. |
| AUD-86 | INFO | CONFIRMED | **RESOLVED** (accepted) | Local store is a JSON-blob key-value design; architecture fact. |
| AUD-87 | INFO | CONFIRMED | **RESOLVED** (accepted) | Health import non-transactional but reported + self-healing; R3 reconfirmed idempotent. |
| AUD-88 | INFO | CONFIRMED | **STILL_OPEN** | `verify-purchase` + `store-webhook` + `delete-account` still build the service client from `Deno.env.get` directly (verified in `verify-purchase/index.ts` at tip), bypassing the `dbUrl()`/`dbServiceKey()` indirection. |
| R2-DB-01 | P3 | NEW | **STILL_OPEN** | `community_blocked_between(a, b)` block-graph oracle still callable by any authenticated user about any pair; no fix migration. |
| R2-API-01 | P2 | NEW | **STILL_OPEN** | `ai_gate` still lacks the 6-unknown-kind/day bound (regression from the rewrite); no migration restores it. |
| R2-API-02 | P2 | NEW | **STILL_OPEN** | `ai-meal-suggest` / `ai-smart-nudges` still `.catch(()=>({}))` malformed JSON before the gate; no handler change. |
| R2-API-03 | P2 | NEW | **STILL_OPEN** | No idempotency/refund for failed AI calls; quota still claimed before `callAI`. |
| R2-API-05 | P3 | NEW | **STILL_OPEN** | `dm_send` still accepts unbounded `p_workout` JSONB; `last_text` still untruncated on the workout branch. |
| R2-API-06 | P3 | NEW | **STILL_OPEN** | No stable error contract; clients still classify by sniffing message strings. |
| R2-API-07 | P3 | NEW | **STILL_OPEN** | `claim_quest_reward` still stores `p_reason` unbounded (verified in `20261119120000_claim_duplicate_marker.sql` — `VALUES (..., p_reason, ...)` with no cap). |
| R2-API-08 | P3 | NEW | **RESOLVED** | Session-nil no longer destroys the queue: park per owner (see AUD-06). |
| R2-API-09 | P3 | NEW | **STILL_OPEN** | `native/tools/edge-auth.mjs` still searches for `claimCall(` (line 77) and its text still says "chín" (line 123) — verified at tip. Ordering check still passes vacuously. |
| R2-API-10 | P3 | NEW | **STILL_OPEN** | Recovery link still opens a full session ("Để sau" dismisses password rotation); no forcing function. |
| R2-SYNC-01 | P2 | NEW | **RESOLVED** | Unscoped delete removed; `purge(userId:)` owner-scoped (see AUD-06). |
| R2-SYNC-02 | P2 | NEW | **RESOLVED** (code) | Undecodable rows now counted + shown in WorkoutLab + incident (PR #927 per MAP_DATA). |
| R2-SYNC-03 | P3 | NEW | **RESOLVED** (code) | `outbox_dead`/`read_cache` pruned (30 days / 100 rows) — PR #927 per MAP_DATA. |
| R2-SYNC-04 | P2 | NEW | **RESOLVED** (code) | Widget refresh coalesced to once per drain (`AppServices.swift:310-315`, #929). |
| R2-SYNC-05 | P3 | NEW | **PARTIALLY_RESOLVED** | Koa pause push failures now report to Telemetry instead of `catch {}` (#929 per MAP_DATA). Still a UserDefaults path, not the outbox; no conflict signal. |
| R2-SYNC-06 | P3 | NEW | **STILL_OPEN** | HealthSync fail-fast first section vs partial-tolerant second section unchanged. |
| R2-SYNC-07 | P3 | NEW | **STILL_OPEN** | Sleep/biometrics read-then-decide replay can still create duplicate day rows across devices. |
| R2-SYNC-08 | P3 | NEW | **STILL_OPEN** | SyncWorker GRDB I/O still on MainActor (comment still claims otherwise); no Instruments evidence either way. |
| R2-SYNC-09 | P3 | NEW | **PARTIALLY_RESOLVED** | Explicit SQLite configuration (WAL + NORMAL) added (#927 per MAP_DATA). Effective-pragma test assertion not re-verified here. |
| R2-ECO-01 | P2 | NEW | **PARTIALLY_RESOLVED** | Shop now reads live Gains (`MascotShop.gains` from `AppServices.koaGainsNow`, PR #1000). Server-side rank gate still absent — no server-side Gains source exists. |
| R2-ECO-02 | P3 | NEW | **RESOLVED** | Duplicate claims return 0 before the ceiling check (see AUD-64 migration). |
| R2-ECO-03 | P3 | NEW | **STILL_OPEN** | `claim_community_challenge` still has no deadline check — verified in the rewritten function (`20261120130100_community_challenge_ceiling.sql` has no `ends_on` comparison). |
| R2-ECO-04 | P3 | NEW | **STILL_OPEN** | Pre-join sessions still count toward challenge progress; intent still undocumented. |
| R2-ECO-05 | P3 | NEW | **RESOLVED** | `20261120130100_community_challenge_ceiling.sql`: community ceiling now excludes `x:` (PR #980, deployed 20/11). |
| R2-ECO-06 | P3 | NEW | **RESOLVED** | XP table per ref_key documented + tests pin every namespace (#930 per MAP_DATA); no values changed. |
| R2-ECO-07 | P3 | NEW | **UNVERIFIED** | Three volume definitions: not re-checked at tip; no PR between 12–24/11 references volume definition. Needs a code re-read. |
| R2-ECO-08 | P3 | NEW | **RESOLVED** | Meal total = sum of rounded items (#923 per MAP_DATA). |
| R2-ECO-09 | P3 | NEW | **STILL_OPEN** | `ai-coach/context.ts:45` still `profile.units_weight === "lb" ? "lb" : "kg"` — verified at tip; stored value is `"lbs"`, so the coach prompt still always says kg. |
| R2-ECO-10 | P3 | NEW | **STILL_OPEN** | The false integrity claim is still in the code comment — `KoaGains.swift:8` still says "không thể 'mua' hay ghi sai" (verified at tip). Gains remain client-computed from forgeable rows; no server-side Gains. The header comment was never corrected. (The determinism half of the claim was never false; only the integrity half is open.) |
| R2-ECO-11 | P3 | NEW | **RESOLVED** (code) | `KoaDust.cleanQuery` now `order: created_at DESC, limit: 60` (verified in `KoaDust.swift:86-90`). |
| R2-ECO-12 | P3 | NEW | **STILL_OPEN** | `clean_koa_room` still charges 30 coins without checking dust and accepts ±1 day; no migration. |
| R2-ECO-13 | P3 | NEW | **STILL_OPEN** | `d:*:streak` still pays 15 coins + 15 XP — verified in `20261112120000_reward_key_shapes.sql` (`streak` branch kept) and `MascotRules.swift`. No live caller; still minting. |
| R2-OPS-01 | P1 | NEW | **STILL_OPEN** | Default branch still `main` (API-verified); `main` still has no `.github/workflows` (contents API 404; tip `234f6b80`, 2026-08-25); Actions API returned zero `event=schedule` runs. |
| R2-OPS-02 | P2 | NEW | **STILL_OPEN** | Bare `auth.uid()` still used in policies (no `(select auth.uid())` migration). |
| R2-OPS-03 | P1 | NEW | **PARTIALLY_RESOLVED** | Sync failures now reach Sentry (R3). AI / edge-function / HealthKit failures still do not; detection matrix still has "no" for those. |
| R2-OPS-04 | P2 | NEW | **PARTIALLY_RESOLVED** | Coach stream has its own timeout policy now (PR #961). Non-streaming AI calls still under the 25 s idle timeout; no dedicated AI timeout policy for them. |
| R2-OPS-06 | P2 | NEW | **STILL_OPEN** | Release still manual/single-machine; no CI release build, no TestFlight upload, no rollout/rollback plan. |
| R2-OPS-07 | P2 | NEW | **RESOLVED** (config) | `deno` job exists in `sql-community.yml:105-120` (`deno test supabase/functions/`, Deno v2.9.8 pinned). Push runs green. |
| R2-OPS-08 | P3 | NEW | **STILL_OPEN** | Triple 90-day session fetches, uncapped inbox/DM endpoints, `select("*")` stragglers unchanged. |
| R2-OPS-09 | P2 | NEW | **STILL_OPEN** | `legal-content.json:485` still asserts 30-day backups (verified at tip); no dashboard evidence. |
| R2-OPS-10 | P3 | NEW | **STILL_OPEN** | No performance budgets/regression gates; perf harnesses still manual and threshold-free. |
| R2-OPS-11 | P3 | NEW | **PARTIALLY_RESOLVED** | Deploy log still prose with annotated duplications; rollback runbook still absent. Progress: deploy entries now record `migration list` match counts (94/94, 97/97, 98/98) and the stale CHƯA DEPLOY headers for the R3 migrations were resolved by deployment — except the Koa-pause headers (AUD-12). |

**Backend tally (130): RESOLVED 32 · PARTIALLY_RESOLVED 25 · STILL_OPEN 68 · NOT_REPRODUCIBLE 1 · UNVERIFIED 4 · REGRESSED 0 · SUPERSEDED 0.**
Launch-blocking 11 (AUD-01, AUD-02, AUD-04, AUD-06, AUD-07, AUD-14, R2-OPS-01, R2-OPS-03, R2-OPS-06, R2-OPS-09, R2-SYNC-01): 3 RESOLVED in code (AUD-06, AUD-14, R2-SYNC-01), 3 PARTIALLY_RESOLVED (AUD-02, AUD-04, R2-OPS-03), 5 STILL_OPEN (AUD-01, AUD-07, R2-OPS-01, R2-OPS-06, R2-OPS-09).
Note on R2-ECO-10: counted as STILL_OPEN (the row above explains the reclassification; it is not double-counted elsewhere).

### §4.2 Koa audit — 60 findings (K-01..K-60, audit tip `2a904952`)

Prior status is the Koa audit (17–18/11). "Now" is verified at tip `5e673df3`. PR numbers are merged PRs unless marked OPEN. Code-merged ≠ simulator/device-verified: the only simulator verification recorded after the fixes is PR #1011 (T57/T04/T20). Findings whose acceptance criterion explicitly requires simulator/device/Instruments evidence are PARTIALLY_RESOLVED even when the code fix merged.

| ID | Pri | Prior | Now | Evidence |
|---|---|---|---|---|
| K-01 | P0 | Open | **RESOLVED** (code) | `20261119120000_claim_duplicate_marker.sql` (PR #960, merged 19/11, deployed 19/11, 97/97); app treats 0 as already-claimed (`KoaWeek.swift:158-179`, `ClaimGate`). |
| K-02 | P0 | Open | **RESOLVED** (code) | PR #955 (merged 18/11, `5e1f07bf`): `ai-coach` uses `allergyRule` + `buildProfileContext` from `context.ts` (verified in `ai-coach/index.ts:12,459,490` at tip). Live AI call after deploy NOT RUN. |
| K-03 | P0 | Open | **RESOLVED** (code) | PR #959 (merged 19/11, `1a0ef403`): `CoachQuickReply.swift:194` — unlogged meals no longer render as "0 / 2200 kcal" eaten. |
| K-04 | P0 | Gate | **RESOLVED** (code + sim) | PR #1001 (merged 23/11, `3899f82a`): `LighterSession.lighterWeight` applies `loadFactor` (0.8/0.9) with step-down rounding; `KoaWeekCoach.loadFactor(daysOff:)` verified at tip. PR #1011 simulator-checked the light-week line. Gate CLOSED. |
| K-05 | P1 | Open | **RESOLVED** (code) | PR #964 (merged 19/11): `.justClaimed` consumed on reload (`KoaWeek.swift:158-169` — reload returns nil, no second celebration); `TodayExtras.swift:873` — only fresh claims celebrate. |
| K-06 | P1 | Open | **RESOLVED** (code) | PR #961 (merged 19/11): SSE requires `[DONE]`, retry/stop, partial persistence (`SupabaseCoach.swift`). |
| K-07 | P1 | Open | **RESOLVED** (code) | PR #961: error classification now reads the response body (`SupabaseCoach.swift:140` — `EdgeFunction.classify(status:message: body)`). |
| K-08 | P1 | Open | **RESOLVED** (code) | PR #962 (merged 19/11): Ask Koa holds its place when the probe is unknown + re-probes when stale. |
| K-09 | P1 | Open | **RESOLVED** (code) | PR #961: `firstByteTimeout` + 60 s `idleAfterFirstByte` watch (`SupabaseCoach.swift:113-130`); 90 s mislabel fixed. End-to-end SSE timing on device NOT RUN. |
| K-10 | P1 | Open | **PARTIALLY_RESOLVED** | PR #966 (merged 19/11): figure-plan cache. Frame-time/CPU improvement NOT measured (Instruments NOT RUN). |
| K-11 | P1 | Open | **PARTIALLY_RESOLVED** | PR #966: scene clocks gated (60 fps + background stop). Energy/frame-rate NOT measured on device. |
| K-12 | P1 | Open | **PARTIALLY_RESOLVED** | PR #966: idempotent gaze/face/clock stepping. Multi-evaluation-per-timestamp behavior NOT verified by run. |
| K-13 | P1 | Gate | **RESOLVED** (decision) | PR #999 (merged 22/11): dead streak code removed. Kiệt decided 21/11: Koa does not worry about streaks (`KoaMood.swift:146` comment; `streakInDanger` symbol gone at tip). Gate CLOSED by removal. |
| K-14 | P1 | Open | **PARTIALLY_RESOLVED** | PR #968 (merged 19/11): Today face + line from one selector. Visual coherence across scripted states NOT simulator-verified (checklist V4/V5 NOT RUN). |
| K-15 | P1 | Open | **PARTIALLY_RESOLVED** | PR #965 (merged 19/11): storyboard haptics implemented (`KoaHapticPlayer.swift` added at tip). Haptic feel requires a real device — NOT RUN. |
| K-16 | P1 | Open | **RESOLVED** (code) | PR #964: retry classification (transient retries, permanent refusals not retried). |
| K-17 | P1 | Open | **RESOLVED** (code) | PR #964 + #984/#988 (ClaimGate): single-flight claim guards + claim retry UI. |
| K-18 | P1 | Open | **RESOLVED** | PR #967 (merged 19/11) + `20261120120000_shop_atomic_wear.sql` deployed 20/11 (98/98): lock-before-check, `unique_violation` → 'already owned', `buy_and_wear_mascot_item`. |
| K-19 | P1 | Open | **RESOLVED** | PR #967 + same migration: `set_mascot_worn` single-transaction RPC; app reloads on failure. |
| K-20 | P1 | Gate | **RESOLVED** (code + sim) | PR #1002 (merged 23/11, `4412aea9`): one week rule for Gains and coins (`KoaGains.swift:131,373-378` — 7th consecutive day counts for "full week", pause-adjusted). PR #1011 simulator-checked the card. Gate CLOSED. |
| K-21 | P2 | Open | **RESOLVED** (code) | PR #971 (merged 20/11): single Monday-start helper + strip dedup + Water rename. |
| K-22 | P2 | Open | **RESOLVED** (code) | PR #973 (merged 20/11): nil-library model + single trained-days source. |
| K-23 | P2 | Open | **RESOLVED** (code) | PR #971: week-coach card pause-aware + honest accept (`.progress`/`.steady` accept verified in `KoaWeekCoach.swift`; `paused` kind added). |
| K-24 | P2 | Open | **RESOLVED** (code) | PR #971: weekly challenges seed reliably, progress writes durable. |
| K-25 | P2 | Open | **STILL_OPEN** | No merged PR references KOA-T25 (composed sound+haptic+visual feedback for chat/celebrations). Not in PRs #955–#1014. |
| K-26 | P2 | Open | **PARTIALLY_RESOLVED** | PR #970 (merged 20/11): rest-screen pause clock freezes the performance. Pause/resume jump NOT device-verified (checklist V18 NOT RUN). |
| K-27 | P2 | Open | **PARTIALLY_RESOLVED** | PR #993 (merged 21/11): widget redraws when the rest image is missing; `staleDate` result tested. Live Activity beat-boundary updates on device NOT RUN. |
| K-28 | P2 | Open | **PARTIALLY_RESOLVED** | PR #971: audio infrastructure (diagnostics, Settings toggle, interruption handling). Audibility/mixing/route-change on device NOT RUN. |
| K-29 | P2 | Gate | **RESOLVED** (code + sim) | PR #1003 (merged 23/11, `7b2e4bf4`): expressions reachable — curl, coat, anger-face block (`KoaEmotion.swift` verified at tip). PR #1011 checked the T29 coat. Gate CLOSED. |
| K-30 | P2 | Open | **PARTIALLY_RESOLVED** | PR #971 + #973: cross-surface Koa state coherence (coach card emotion now follows the advice kind — `KoaWeekCoach.Kind.emotion`, verified at tip). Full cross-surface sweep NOT simulator-verified. |
| K-31 | P2 | Open | **RESOLVED** (code) | PR #978 (merged 21/11): `learn()` retries (queue ≤4, ≤3 tries) + quota gated before spend (CONSTRAINTS:721). Queue is in-memory — lost on full app close (documented limitation). |
| K-32 | P2 | Open | **RESOLVED** (code) | PR #977 (merged 20/11): unknown-kind memory facts now visible under "Khác" and individually deletable. |
| K-33 | P2 | Open | **RESOLVED** (code) | PR #978 + #992: coach context — 31-day streak, water by day, steps, all checks, today's plan (`today_plan`); `CoachStream` requires `checks`/`waterUnit`. Remainder (readiness components in context) explicitly not done per CONSTRAINTS:923 (gated by `readiness-confidence.mjs`). |
| K-34 | P2 | Open | **RESOLVED** (code) | PR #972 (merged 20/11): chat input intents, question handling, conflict replies, lb units. |
| K-35 | P2 | Open | **PARTIALLY_RESOLVED** | PR #970: overview block survives truncation + multiple blocks. Rendering NOT simulator-verified. |
| K-36 | P2 | Open | **RESOLVED** (code) | PR #972: answer + health disclaimer in one language (user's chat language when confidently detected). |
| K-37 | P2 | Open | **RESOLVED** (code) | PR #972: server prompt hygiene (Spanish via template slots, hostility filter narrowed, `CoachStream` defaults). Deployed 20/11 (`ai-coach` v29, CONSTRAINTS:712). |
| K-38 | P2 | Open | **RESOLVED** (code) | PR #970: coach history errors surfaced + delete confirmation. |
| K-39 | P2 | Open | **RESOLVED** (code) | PR #973: dual storyboard systems consolidated. |
| K-40 | P3 | Open | **RESOLVED** (code) | PR #975 + #982: shared line formatter, dead code removed (`TodayDayBlock.bubble()`, `TodayTube`). |
| K-41 | P3 | Open | **RESOLVED** (code) | PR #981 (merged 20/11): single source for prices/rules + CI check (Swift ↔ SQL). |
| K-42 | P3 | Open | **PARTIALLY_RESOLVED** | PR #974 (merged 20/11): `KoaReactionView` accessibility + Reduce Motion flash gate. VoiceOver pass NOT RUN on device. |
| K-43 | P3 | Open | **PARTIALLY_RESOLVED** | PR #990 (merged 22/11): rest screen follows Dynamic Type. AX3/AX5 clipping check NOT simulator-verified. |
| K-44 | P3 | Open | **PARTIALLY_RESOLVED** | PR #974: room color scheme + poke under Reduce Motion. Visual check NOT simulator-verified. |
| K-45 | P3 | Open | **PARTIALLY_RESOLVED** | PR #974: Dynamic Type + identifier sweep. AX3/AX5 clipping NOT simulator-verified. |
| K-46 | P3 | Open | **PARTIALLY_RESOLVED** | PR #974: touch targets, peek persistence, Canvas text equivalents. Thumb/VO pass NOT RUN. |
| K-47 | P3 | Open | **PARTIALLY_RESOLVED** | PR #983 (merged 21/11): a11y audit tests now fail over threshold + 5 new screens. Room/Shop/Rest/Reaction/Coach VoiceOver pass NOT RUN. |
| K-48 | P3 | Open | **PARTIALLY_RESOLVED** | PR #985 + #995: animation lifecycle (Today face tween, bounded waits, coalesced touches, cancelled sleep-then-act). Motion-judgment items (V6/V10) NOT simulator-verified. |
| K-49 | P3 | Open | **PARTIALLY_RESOLVED** | PR #994 (merged 21/11): shop-preview cache, journey O(N×M) scan removed, Today milestones computed once. Instruments/widget main-thread measurements NOT RUN. |
| K-50 | P3 | Open | **RESOLVED** (code) | PR #975: room-speech topic burn fixed; duplicate wavs removed (4 files deleted between tips: `koa-talk-7/8/9/10.wav`). |
| K-51 | P3 | Open | **RESOLVED** (code) | PR #975: welcome-grant fallback ledger read bounded + ordered. |
| K-52 | P3 | Open | **RESOLVED** (code) | PR #977: Gains history paginated (1000-row pages to the end, 50-page cap, `Loaded.truncated`); overload-read failure keeps old Gains. |
| K-53 | P3 | Open | **RESOLVED** (code) | PR #977: single economy error-phrase table (`SupabaseMascotEconomy.raisePhrases`) with tests reading `supabase/migrations/`; network tests for `cleanKoaRoom`. ERRCODE migration still not done (documented). |
| K-54 | P3 | Open | **RESOLVED** | PR #979/#980 (merged 20/11): economy edge sweep — app half (#979) + SQL half (#980: `20261120130000_wallet_claimed_keys.sql`, `20261120130100_community_challenge_ceiling.sql`, deployed 20/11). |
| K-55 | P3 | Open | **RESOLVED** (code) | PR #984 + #988: `ClaimGate` — one claim-state helper for all duplicate tracking. |
| K-56 | P3 | Gate | **RESOLVED** (decision) | PR #999 (merged 22/11): dead streak code removed (KOA-T13 + T56). Kiệt's decision: dead — remove, not restore. Streak-freeze sale also closed server-side (AUD-14). Gate CLOSED. |
| K-57 | P3 | Gate | **RESOLVED** (code + sim) | PR #1000 (merged 23/11, `a0c7c61a`): shop reads live Gains (`MascotShop.gains` from `AppServices.koaGainsNow`, verified at tip); rank restriction documented. PR #1011 simulator-checked "T57 Gains kẹt 0". Gate CLOSED. Server-side rank enforcement remains absent (see R2-ECO-01) — the gate as written (fix stale gains + decide on client-only enforcement) is closed; the server half is a separate open item. |
| K-58 | P3 | Open | **RESOLVED** (code) | PR #975: superseded decay mocks archived/banners. (Gallery files themselves not re-checked file-by-file; see D-10.) |
| K-59 | P3 | Open | **PARTIALLY_RESOLVED** | PR #974: localized rest/reaction cue titles + real ring duration. en/es rendering NOT simulator-verified. |
| K-60 | P3 | Open | **PARTIALLY_RESOLVED** | PR #977/#986/#989: `StreakMissed.missedDates` directly tested; `KoaWeek` with `paused` tested; journey milestones count as reminded; docs aligned for journey milestones. Still open per CONSTRAINTS:722: `KoaSceneData` tests + `KoaMomentFeed`/analytics cross-check in `KOA_ECOSYSTEM.md`. |

**Koa tally (60): RESOLVED 39 · PARTIALLY_RESOLVED 20 · STILL_OPEN 1 (K-25) · NOT_REPRODUCIBLE 0 · UNVERIFIED 0 · REGRESSED 0 · SUPERSEDED 0.**
**Koa decision gates (6/6 CLOSED):** T04 (#1001 + #1011 sim), T13 (#999, remove per Kiệt 21/11), T20 (#1002 + #1011 sim), T29 (#1003 + #1011 coat check), T56 (#999, remove), T57 (#1000 + #1011 sim). Caveat: "closed" means the decision was made and the code fix merged; runtime verification exists only where #1011 covered it (T04/T20/T57) and the T29 coat check.

### §4.3 Beta gate (B-1..B-6) and launch gate (L-1..L-11) — from `07-release-gate.md` (tip `b19e9822`, 0/6 beta, 0/11 launch)

| Gate | Was | Now | Evidence |
|---|---|---|---|
| B-1 Backups verified + restore drill | FAIL | **STILL_OPEN** | AUD-01. No PITR, no drill. |
| B-2 Streak freezes fixed or unsold | FAIL | **RESOLVED** (code + deploy) | AUD-14: sale revoked, deployed 16/11, REST 42501. Option B executed. |
| B-3 Reward keys validated or formally accepted | FAIL | **PARTIALLY_RESOLVED** | AUD-02: shape validation deployed 16/11; completion still client-asserted (R3-SEC-02). No signed-off residual-risk note by Kiệt in `CONSTRAINTS_AND_DEFERRED.md` found. |
| B-4 #241 decided; sign-out queue preserved or warn + sync-first | FAIL | **RESOLVED** (code) | #241 option (b)/A decided 12/11 (CONSTRAINTS:696); park implemented in #875. Simulator E2E park/resend NOT RUN (R3 test report). |
| B-5 AUD-48 live checks run and recorded | FAIL (0/20) | **PARTIALLY_RESOLVED** | Backups list done; migration lists recorded; several function versions recorded. No consolidated 20-item record exists. |
| B-6 `verify-purchase` fail-open fixed | FAIL | **RESOLVED** (code) | AUD-47: `!ent` branch → 500 (verified in file). Staging test with induced DB error NOT RUN. |
| L-1 Verified recovery path | FAIL | **STILL_OPEN** | AUD-01. |
| L-2 Reward trust boundary decided + implemented | FAIL | **PARTIALLY_RESOLVED** | Same as B-3. |
| L-3 Purchase flow shippable end-to-end (monetized) | FAIL | **PARTIALLY_RESOLVED** | Client half exists (#920); server functions undeployed; no ASC products; no product/price/term decision. Free-launch-without-monetization decision not recorded either. |
| L-4 Sign-out data loss resolved | FAIL | **RESOLVED** (code) | Same as B-4. |
| L-5 Staging + deploy gate + rollback | FAIL | **STILL_OPEN** | AUD-07. |
| L-6 Streak freezes decided + implemented | FAIL | **RESOLVED** | Same as B-2. |
| L-7 Scheduled CI runs on cadence | FAIL | **STILL_OPEN** | R2-OPS-01: zero scheduled runs (API-verified). |
| L-8 Error reporting live + verified | FAIL | **PARTIALLY_RESOLVED** | Sync incidents → Sentry (R3); AI/edge/HealthKit reporting absent; no synthetic-failure verification. |
| L-9 Release process automated + verified | FAIL | **STILL_OPEN** | R2-OPS-06. |
| L-10 Privacy text matches reality | FAIL | **STILL_OPEN** | R2-OPS-09: legal-content.json:485 unchanged. |
| L-11 Cross-account outbox delete scoped | FAIL | **RESOLVED** | R2-SYNC-01: unscoped delete removed. |

**Beta gate now: 3/6 resolved in code (B-2, B-4, B-6), 2 partial (B-3, B-5), 1 open (B-1). Launch gate now: 3/11 resolved in code (L-4, L-6, L-11), 3 partial (L-2, L-3, L-8), 5 open (L-1, L-5, L-7, L-9, L-10).** Neither gate passes: B-1 blocks beta; L-1/L-5/L-7/L-9/L-10 block launch. No gate criterion is counted as fully passing on code alone where its pass evidence requires a dashboard, simulator, or staging run that is NOT RUN.

### §4.4 Round 3 new findings (from `docs/audits/round-3/`)

| ID | Sev | Now | Evidence |
|---|---|---|---|
| R3-TEST-01 | P3 | **UNVERIFIED** | Community reverse case C17 (UTC+7 progress) red 17:00–24:00 UTC, pre-existing. No fix PR found; CI history for the case not re-checked. |
| R3-DATA-01 | P3 | **RESOLVED** | In-progress `workout_day` dropped on session end → fixed by PR #919 (merged 17/11, `f322e8d5`): `sessionEnded` parks `workout_day` per owner (MAP_DATA confirms). |
| R3-DATA-02 | P2 | **RESOLVED** | Wallet truncation → `mascot_wallet()` RPC (see AUD-28). |
| R3-OPS-01 | P3 | **UNVERIFIED** | Local builds need the watchOS 26.5 runtime since #853 (embedded Watch app). No Mac on this VM; cannot verify. |
| R3-SEC-02 | P3 | **PARTIALLY_RESOLVED** | Daily-quest completion still client-asserted; bounded by window + 800/day ceiling + shape-validated keys. Accepted as residual in R3 docs; no Kiệt sign-off recorded. |

### §4.5 Mascot-system research recommendation (21/11, `FINAL_RECOMMENDATION.md`)

| Item | Status | Evidence |
|---|---|---|
| Research (10 docs, ~2,900 lines; 8 phases) | **Delivered** | Branch `agent/c/koa-mascot-system`, commit `e96d7c2c`, docs-only, no PR; #527 comment 7069678295. |
| Recommendation: Option B (jointed core + Blender reference + gate; Bible + identity gate A1–A14; AI for ideation only) | **Pending Kiệt's choice** | MEMORY.md: still awaiting Kiệt's choice of Option A/B/C + Claude's independent review. No decision recorded at tip `5e673df3`. |
| Code-drawn Koa reference (jointed SVG) | **Pending clearance** | Renderable and self-checked; two face deviations flagged for Kiệt's eye (mouth/tongue, blush); not pushed until he clears it. |
| Duolingo internal/leaked documents | **Not pursued** (boundary held) | Research used lawfully public sources only, per Kiệt's repeated requests and C's declines (MEMORY.md 2026-11-21). |
| Cast direction (shark/eagle as main vs Koa main) | **Undecided** | Counter-proposal (Koa main, shark/eagle as side roles) awaits Kiệt's steer. |

---

## §5 — Summary for the parent agent

**What changed between R2 tip (`b19e9822`, 12/11) and this tip (`5e673df3`, 24/11): a lot of code, less verification.** 567 commits ahead; 102 migrations (was 88); 12 new migrations, 9 new Swift areas (StoreKit, native admin UI, 3D viewer, Koa room/weather), 2 new workflows (`motion-kit.yml`, `all-migrations` job), and ~40 Koa PRs merged. The backend R3 batch (#875) + Koa batches (#955–#1013) closed the sharpest code defects: sign-out data loss (AUD-06), freeze sale (AUD-14), duplicate-claim contract (K-01/AUD-64), reward-key shapes (AUD-02 partial), FK indexes (AUD-10), server wallet (AUD-28), exercise paging (AUD-05), `verify-purchase` fail-open (AUD-47), all 4 Koa P0s, and all 6 Koa decision gates.

**Counts (all at tip `5e673df3`):**
- Backend 130 findings: **32 resolved, 25 partially resolved, 68 still open, 1 not reproducible (AUD-38), 4 unverified**. No regressions found. Launch-blocking 11: 3 resolved in code, 3 partial, 5 open.
- Koa 60 findings: **39 resolved (code), 20 partially resolved (code merged, simulator/device/Instruments verification NOT RUN), 1 still open (K-25, no PR)**. All 6 decision gates closed.
- Beta gate: 3/6 code-resolved, 2 partial, 1 open (B-1 backups). Launch gate: 3/11 code-resolved, 3 partial, 5 open. **Neither gate passes.**
- R3 new findings: 2 resolved (R3-DATA-01, R3-DATA-02), 1 partial (R3-SEC-02), 2 unverified (R3-TEST-01, R3-OPS-01).
- Docs: 77 inventory rows; 3 ADRs (0001/0003 partially superseded, 0002 current); 23 doc-vs-code discrepancies (D-01..D-23), the sharpest being the shipped 30-day-backup privacy sentence vs `pitr_enabled: false` (D-23) and the root AGENTS.md still directing agents to use dropped RN as reference (D-01).

**Highest-value follow-ups (recommendations only):**
1. Kiệt decisions still owed: backups/PITR or correct the privacy sentence (B-1/L-1/L-10); scheduled-CI strategy (R2-OPS-01/L-7 — do not change the default branch unilaterally); reward-trust formal acceptance (B-3/L-2); mascot Option A/B/C (pending since 21/11).
2. Deploy pending: `20261124120000_dedupe_indexes_pin_search_path.sql` (#1012, merged, not deployed); `verify-purchase`/`store-webhook`/`admin-art` still undeployed (purchase path cut server-side).
3. Verification owed (needs Mac/simulator/device/dashboard — not this VM): simulator E2E for outbox park/resend (B-4), Koa visual/a11y/perf items (K-10–K-12, K-14/15, K-26–K-28, K-42–K-49, K-59), `verify-purchase` induced-DB-error staging test (B-6), AUD-48 live checks (B-5), release-build telemetry liveness (AUD-58).
4. Doc hygiene (no deletions — dated banners/addenda only): root AGENTS.md (D-01), ADR-04 for the 17/11 directive (D-02), ADR-0003 amendment (D-03), MIGRATION_STATUS superseded banner (D-04), parity HISTORICAL banners (D-05), bench-review addendum (D-09), commit R1+R2 reports under `docs/audits/` (D-21).
5. Single still-open Koa finding: K-25 (composed feedback vocabulary for chat/celebrations) — no PR.

**Caveats for the parent:** (a) "RESOLVED (code)" throughout §4 means present in code at tip, not runtime-verified; §4.2's PARTIALLY_RESOLVED rows are exactly the ones whose acceptance criteria need a run. (b) Deploy state rests on the CONSTRAINTS prose deploy log; a live `migration list` / function-version re-check is still owed (another worker's scope). (c) Two items I could not verify from this VM and marked UNVERIFIED rather than guessing: AUD-32 (photo-delete ordering), R2-ECO-07 (volume definitions), AUD-44 (key rotation), AUD-79 (barcode privacy coverage), R3-TEST-01, R3-OPS-01. (d) The `git clone` failed (disk space) — all verification is via GitHub API per-file reads; a local checkout would let a future worker re-verify the greps (e.g. AUD-52 anchors, R2-API-02 handler text) exhaustively.

## Appendix — Evidence index (traceable references)

- Tip: `5e673df3f3614ee5d4070a4177e4adad767c1af9` (merge #1013, 2026-11-24 17:28 UTC). Prior tip: `b19e9822` (merge #868, 2026-11-10).
- Key merges (all `gh pr view`, MERGED): #875 `983768f0` (R3: AUD-06/02/28/10/14/47, AUD-05); #917 `a50c0777` (telemetry keys in CI); #918 `aef7f870` (Health window iOS 27); #919 `f322e8d5` (workout_day park + Apple revoke); #920 `13de1375` (StoreKit 2 + paywall); #952 (Koa Week card removed from Today, 18/11); #955 `5e1f07bf` (K-02); #959 `1a0ef403` (K-03); #960 `b6e0a3a8` (K-01); #961–#968, #969–#975, #977–#980, #981–#999 (Koa T05–T60 batches, 19–22/11); #1000 `a0c7c61a` (K-57); #1001 `3899f82a` (K-04); #1002 `4412aea9` (K-20); #1003 `7b2e4bf4` (K-29); #1010 `663df487` (3D viewer DEMIC b1); #1011 `5be295c3` (Koa sim-check T57/T04/T20); #1012 `ed2a4d92` (dedupe indexes, NOT deployed); #1013 `5e673df3` (tip). OPEN at tip: #1009 (Standing Military Press), #1014 (light-week chip).
- Deploy log (CONSTRAINTS_AND_DEFERRED.md): 5 R3 migrations deployed 16/11 (`migration list` 94/94); exercise-favorites migration deployed 16/11; KOA-T01 + 2 community migrations deployed 19/11 (97/97); T18/T19 deployed 20/11 (98/98); T54 SQL deployed 20/11; ai-coach v29→v30 deployed 20/11; dedupe migration NOT deployed.
- Branches (API-verified): `main` @ `234f6b80` (2026-08-25, no `.github/workflows` — contents API 404); `claude/ios-fitness-rebuild-omgulr` @ `fac9ac2` (2026-10-04, frozen); default branch `main`.
- Actions API: zero `event=schedule` runs; recent push runs (quality-gate, motion-kit) `success` 24/11.
- Files read at tip (via contents API): ADRs 0001–0003, `WORKFLOW.md`, `MIGRATION_STATUS.md`, `CONSTRAINTS_AND_DEFERRED.md` (969 lines), `PRODUCT_DECISION_V1.md`, `PARITY_MATRIX.md` (head), `KOA_ECOSYSTEM.md`, `SYSTEM_CHECK.md`, `TELEMETRY.md`, `TESTFLIGHT-CHECKLIST.md`, R3 `01`–`03`, EVS docs (12), `spec/PRODUCT_CONTRACT.md`, `spec/QA_MATRIX.md` (head), `native/docs/OFFLINE-POLICY.md`, `COMMUNITY-BRIEF.md`, `supabase/config.toml`, `verify-purchase/index.ts`, migrations `20261112120000/12140000/12150000/19120000/20120000/20130000/20130100/24120000`, `20261103120000/20261104120000` (headers), `Outbox.swift`, `OutboxStore.swift`, `SyncWorker.swift`, `SessionStore.swift`, `SupabaseMascot.swift`, `SupabaseCoach.swift`, `KoaWeek.swift`, `KoaGains.swift`, `KoaMood.swift`, `KoaWeekCoach.swift`, `LighterSession.swift`, `MascotShop.swift`, `MascotRules.swift`, `CoachQuickReply.swift`, `DailyLog.swift`, `KoaDust.swift`, `KoaEmotion.swift`, `ai-coach/index.ts` + `context.ts`, `AppServices.swift` (greps), `TodayExtras.swift` (greps), `StoreKitClient.swift`, `PurchaseController.swift`, `legal-content.json` (:485), `edge-auth.mjs`, workflows `system-check.yml`, `sql-community.yml`, `motion-kit.yml`.
