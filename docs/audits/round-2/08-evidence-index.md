# ASCND Round 2 — Evidence Index

Tip: `native/ios-rewrite` @ `b19e9822d46ea4ed85e0189c587711d6660210b2`. Every finding in `02-findings-register.md` traces to at least one entry below. Working papers (full inventories, probe logs, flow summaries) live in `~/workspace/goals/ascnd-fitness-app/hidden_files/round2-work/`: `db-security.md` (272 lines), `backend-auth.md` (457 lines), `sync-ios.md` (1381 lines), `economy.md` (480 lines), `perf-ops.md` (531 lines). Round 1 baseline: `~/workspace/goals/ascnd-fitness-app/files/ASCND_BACKEND_AUDIT_REPORT.md` (776 lines); Round 1 working papers: `~/workspace/goals/ascnd-fitness-app/hidden_files/backend-audit-work/`.

## 1. Evidence by finding

### Round 1 revalidations (AUD-01..AUD-88)

| ID | Verdict | Primary evidence (file:line / catalog / probe) | Working paper |
|---|---|---|---|
| AUD-01 | CONFIRMED | Absence grep (backup/PITR/RPO/RTO/drill); `legal-content.json:485` (R2-OPS-09) | perf-ops §2 |
| AUD-02 | CONFIRMED | `20261029130000_koa_quests_v2.sql:33-91`; `SupabaseMascot.swift:177-183`; `MascotRules.swift:91-108`; T-STATIC-01..03 | economy §2 |
| AUD-03 | CONFIRMED | `SupabaseAwards.swift:105-124`; policy in `20260212052623...sql`; `Awards.toGrant` | economy §2 |
| AUD-04 | CONFIRMED | 0 `StoreKit` in `apps/ios` Swift; `EdgeFunction.swift:24-25`; `TodayExtras.swift:414,961`; `CONSTRAINTS_AND_DEFERRED.md:40` | economy §2 + sync-ios §2.3 |
| AUD-05 | CONFIRMED | `SupabaseExerciseSource.exercises()`; 873 tuples; T-OPS-14 | perf-ops §2 |
| AUD-06 | CONFIRMED | `Outbox.swift:179-186`; `OutboxStore.swift:137-145`; `SyncWorker.swift:111-121`; `AppServices.swift:322-323`; `SessionStore.swift:117-133`; `GRDBWorkoutStore.swift:103-118` | sync-ios §2.2 |
| AUD-07 | PARTIAL | `AI-TRIEN-KHAI.md` (manual pushes); no deploy workflow; `PRE_RELEASE.md` stale ref | backend-auth §5 |
| AUD-08 | CONFIRMED | `20260212040248` JSONB columns; probe T-P9 | db-security §2 |
| AUD-09 | CONFIRMED | `20260930220000:90-93` (4× fold); 0 GIN/FTS/trigram (T-OPS-10) | perf-ops §2 |
| AUD-10 | PARTIAL | Catalog C10: 25 unindexed FKs (27 strict) | db-security §2 |
| AUD-11 | CONFIRMED | Name grep: RN types only / RN-only; 0 Swift/edge refs | db-security §2 |
| AUD-12 | PARTIAL | Headers CHƯA DEPLOY vs prose deploy log 86/86 + 87/87 | perf-ops §2 |
| AUD-13 | PARTIAL | `core/run.sh` + `community/run.sh` split; T-API-10 + T-M1 (88/88 strict apply) | backend-auth §5 |
| AUD-14 | CONFIRMED | `SupabaseMascot.swift:201-208`; `MascotRoom.swift:386-405`; 0 spend callers; `MascotRoomView.swift:850` empty MARK; `MascotShop.swift:219-224`; `CONSTRAINTS_AND_DEFERRED.md:480` | economy §2 + sync-ios §2.3 |
| AUD-15 | CONFIRMED | Catalog C3: 88 DEFINER / 94 signatures | db-security §2 |
| AUD-16 | CONFIRMED | Catalog C11: 7 exact-duplicate groups (incl. `weight_logs`) + 13 near-duplicate | db-security §2 |
| AUD-17 | CONFIRMED | Catalog C9: 9 tables; probe T-P15 | db-security §2 |
| AUD-18 | CONFIRMED | 0 `REFERENCES public.profiles`; `mascot_inventory.equipped` vs `community_profiles.mascot_id` | db-security §2 |
| AUD-19 | CONFIRMED | `20260212040248…sql:79-83`; counter triggers; no reconciliation job | db-security §2 |
| AUD-20 | CONFIRMED | `DailyLog.recompute` (566 lines); `FOR ALL` policy; `ai-coach/index.ts:356-358`; `_shared/readiness.ts` | economy §2 |
| AUD-21 | CONFIRMED | `delete-account/index.ts:78` (180-line handler); `SettingsView` ConfirmAlert | backend-auth §5 |
| AUD-22 | CONFIRMED | Free-TEXT enums; probes T-P10 (`sex='zzz'`, `weight_kg=-5`) | db-security §2 |
| AUD-23 | CONFIRMED | 0 INSERT into `ai_credits` (repo-wide grep); T-API-02/03 | backend-auth §5 |
| AUD-24 | PARTIAL | `quality-gate.yml` → `check.mjs` guards (CI-enforced); Swift `ReadinessEngine`/streak uncovered | backend-auth §5 |
| AUD-25 | CONFIRMED | `20260930120000:90-101,147+`; `FOR ALL` on `workout_sessions` | economy §2 |
| AUD-26 | PARTIAL | `20261007130000…sql:109-111` (documented); `community_restrictions.created_by`, `community_review_requests.decided_by` undocumented; probe T-P12r; catalog C5 (92 FKs / 3 SET NULL) | db-security §2 |
| AUD-27 | CONFIRMED | `SupabaseCommunity.followees()` unbounded; per-page refetch; URL `IN()` | perf-ops §2 |
| AUD-28 | CONFIRMED | `SupabaseMascotSource.ledger()` unbounded/unordered; `MascotWallet` client sum | perf-ops §2 |
| AUD-29 | CONFIRMED | `SupabaseWeightLog.swift:41`; `SupabaseMeasurementLog.swift:21`; `SupabaseRemoteWriter.swift:131-238`; `StateWriter.swift:78,130-133` | sync-ios §2.2 |
| AUD-30 | CONFIRMED | Absence grep (retention/archival/partitioning/soft-delete); 40-row `coach_memory` trim only | db-security §2 |
| AUD-31 | CONFIRMED | `moderation_audit_log` only (append-only, zero policies, `REVOKE ALL`) | db-security §2 |
| AUD-32 | CONFIRMED | `ProgressPhotos.swift:280-297` (row first, `try?` removeObject); `SupabaseProgressPhotos.swift:71,85` | db-security §2 |
| AUD-33 | CONFIRMED | 56 `console.*` sites, 14 files; `admin-art` 0 (T-OPS-12) | perf-ops §2 |
| AUD-34 | CONFIRMED | `SupabaseRemoteWriter.swift:104-113`; `MealLog.swift:355-389`; `MealDiary.swift:139` | economy §2 |
| AUD-35 | CONFIRMED | `SupabaseWeightLog.swift:40-65` (`_ = try?`); `HealthSync.swift:204-231` (better sibling) | sync-ios §2.2 |
| AUD-36 | CONFIRMED | `20261105090000_body_checks.sql`; `body-check/index.ts:155-160`; `clampBody` width rule | economy §2 |
| AUD-37 | PARTIAL | `supabase/config.toml` (12× `verify_jwt=false`); `requireUser` in 11 handlers; `edge-auth.mjs` in `check.mjs:233,539` | backend-auth §5 |
| AUD-38 | NOT_REPRODUCIBLE | Probes T-P3/P3b (all 5 tables `42501`; controls succeed); T-P4; catalog sweep | db-security §2 |
| AUD-39 | CONFIRMED | `20261105090000_body_checks.sql` (no parent-owner check); probe T-P5 | db-security §2 |
| AUD-40 | CONFIRMED | `20261020130000…sql:83-101`; probes T-P6 + T-API-06 | db-security §2, backend-auth §6 |
| AUD-41 | CONFIRMED | 8 functions, no grant/revoke; catalog C13; probes T-P8r/P8b (`0A000`) | db-security §2 |
| AUD-42 | CONFIRMED | Probe T-P2 (anon 884 / 0 / 0) | db-security §2 |
| AUD-43 | CONFIRMED | Catalog C3: 91 pinned, 3 unpinned (all invoker, low-risk) | db-security §2 |
| AUD-44 | PARTIAL | Commit `3beafaca` (+`.env`, 3 keys); 210-char `sb_publishable_` key; `ce8c73f8` absent from shallow clone; `.gitignore:26-29` | db-security §2 |
| AUD-45 | CONFIRMED | CASCADE graph; probe T-P11r (2 messages → 0/0) | db-security §2 |
| AUD-46 | CONFIRMED | No limiter in 4 handlers or `_shared/`; 3 of 4 NOT_DEPLOYED_BY_DESIGN | backend-auth §5 |
| AUD-47 | CONFIRMED | `verify-purchase/index.ts` `!ent` branch (unchecked upsert) vs success branch (500) | backend-auth §5 |
| AUD-48 | CONFIRMED | 16 checks open + 4 Round 2 extensions; see `04-production-verification.md` | perf-ops §2 |
| AUD-49 | CONFIRMED | `SupabaseDMSource.messages()`: oldest-first `LIMIT 500`, no cursor | perf-ops §2 |
| AUD-50 | CONFIRMED | `DailyLog.swift:147-182,484-503,523-545`; `AppServices.swift:291-293`; R2-OPS-05 extension | sync-ios §2.2, perf-ops §3 |
| AUD-51 | CONFIRMED | 2 synchronous post-row UPDATEs per interaction + notify work | perf-ops §2 |
| AUD-52 | CONFIRMED | `HealthKitSource.swift:125-143,204-235`; `HealthData.swift:249-254`; 0 `HKAnchoredObjectQuery` | sync-ios §2.2 |
| AUD-53 | CONFIRMED | OFFSET paging (throws past 50 pages); `recentItems` unindexed scan | perf-ops §2 |
| AUD-54 | CONFIRMED | `_shared/ai.ts` (3×3×20 s; vision 3×3×45 s ≈ 405 s); no budget/queue/backpressure | backend-auth §5 |
| AUD-55 | CONFIRMED | Index `(created_at DESC, useful_score DESC)` vs sort `(useful_score DESC, created_at DESC)` | perf-ops §2 |
| AUD-56 | CONFIRMED | Only BG task `CommunityAlerts` (`ASCNDApp.swift:153-155`); `project.yml` identifiers; no `sync.kick()` | sync-ios §2.2 |
| AUD-57 | PARTIAL | No alerting; schedule dead (R2-OPS-01); bot covers more than advisors; 73+114 warnings unaddressed | perf-ops §2 |
| AUD-58 | CONFIRMED | Empty keys in `Backend.xcconfig`; `Telemetry` no-ops; keys only on Archive machine | perf-ops §2 |
| AUD-59 | CONFIRMED | 0 Realtime greps; no publication SQL; fetch-on-appear + pull-to-refresh | sync-ios §2.2 |
| AUD-60 | PARTIAL | 0 `pg_cron`/`cron.schedule` hits; dashboard cron NOT_VERIFIED | backend-auth §5 |
| AUD-61 | PARTIAL | 59 granted to `authenticated`, 29 Swift-called; probe T-P14 (`42501`); `community_request_review` no-caller | db-security §2 |
| AUD-62 | CONFIRMED | `Outbox.swift:127-170`; `ConnectionBanner.swift:80-111` (count + dismiss only); no resend symbol | sync-ios §2.2 |
| AUD-63 | PARTIAL | No `fetched_at`; `TemplateSnapshot.fetchedAt` + 30-min gate unconsumed; no `.source` consumers | sync-ios §2.2 |
| AUD-64 | CONFIRMED | `20261029130000:134-138`; dead 23505 branches (`KoaWeek`, `WeeklyChallenges`); T-API-08 | economy §2, backend-auth §6 |
| AUD-65 | PARTIAL | `20260815120000:83-84` check outside lock at line 89; race unexecuted (T-ECO-06 BLOCKED) | economy §2 |
| AUD-66 | CONFIRMED | Catalog grants (T-API-11); direct calls (T-API-01/02/04); `claim_ai_call` no live caller | backend-auth §5 |
| AUD-67 | PARTIAL | `StallRecovery` 25 s covers invoke/RPC/PostgREST; `SupabaseCoachStream` on `.shared`, no timeout | backend-auth §5 |
| AUD-68 | CONFIRMED | T-API-03 executed (0 rows; debit 10,000 → 7,000) | backend-auth §5 |
| AUD-69 | CONFIRMED | `ai-coach-memory/index.ts` (3 sequential writes; drop/confirm failures `console.error` only) | backend-auth §5 |
| AUD-70 | CONFIRMED | 3 functions return `toolArgs` verbatim; no client magnitude clamping; T-TS-01..20 contrast | backend-auth §5 |
| AUD-71 | CONFIRMED | `prevWeekRes` unused (line 52); double workout read; 4× `select("*")` | backend-auth §5 |
| AUD-72 | CONFIRMED | `USING (true)` SELECT on follows/profiles; no sensitive columns | db-security §2 |
| AUD-73 | CONFIRMED | No ATS exceptions in `project.yml`; no pinning code | db-security §2 |
| AUD-74 | CONFIRMED | `Telemetry.swift:70-96,117-120`; no `beforeSend`/scrub; ~30 call sites audited | sync-ios §2.2 |
| AUD-75 | PARTIAL | No SQLCipher (true); file protection IS set (`AppServices.swift:1622-1626`); no Data Protection entitlement | db-security §2 |
| AUD-76 | CONFIRMED | `_shared/guard.ts` `corsHeaders` (`*`, no credentials) | db-security §2 |
| AUD-77 | CONFIRMED | `community_posting_guard`, `community_reports_guard` (plain `count(*)`); `dm_send` 30/min same pattern | db-security §2 |
| AUD-78 | CONFIRMED | T-API-01/02 (caller-keyed rows); fixed literals in edge functions | backend-auth §5 |
| AUD-79 | CONFIRMED | `BarcodeLookup.swift:37-40`; `ScanBarcodeView.lookup()` plain session | db-security §2 |
| AUD-80 | CONFIRMED | App Group keys audited; no tokens/userIds; `clear()` on sign-out | db-security §2 |
| AUD-81 | CONFIRMED | `date_trunc('day', now())` (`:125`) vs `d:` window (+1/−2 local days) | economy §2 |
| AUD-82 | CONFIRMED | `store-webhook/index.ts:86` parse before `:93` size check | backend-auth §5 |
| AUD-83 | CONFIRMED | Style eras; 0 enums; `water_logs` triple dates; `'Khác'` default | db-security §2 |
| AUD-84 | CONFIRMED | `source_id` FK-less polymorphic; probe T-P13r (`23505`) | db-security §2 |
| AUD-85 | CONFIRMED | `image_source` CHECK (`20261002120000…sql:68`); 2 overloads; uncommented ALTER | db-security §2 |
| AUD-86 | CONFIRMED | `Database.swift:28-83` (4 tables, JSON blobs, no FKs/indexes) | sync-ios §2.2 |
| AUD-87 | CONFIRMED | `DailyLog.swift:408-418` (no txn API); `HealthSync.swift:71-202` (two-phase handling) | sync-ios §2.2 |
| AUD-88 | CONFIRMED | Direct `Deno.env.get` in `verify-purchase:100`, `store-webhook`, `delete-account:84` (3 of 12) | backend-auth §5 |

### New findings (R2-*)

| ID | Severity | Primary evidence | Working paper |
|---|---|---|---|
| R2-DB-01 | P3 | `20260927120000:110-124`; grant replay (catalog C13); probe T-P7; sweep of other definer bodies | db-security §3 |
| R2-API-01 | P2 | `20260818120000:96-111` vs `20260825120000` rewrite; T-API-01 (8 junk kinds → 8 rows) | backend-auth §6 |
| R2-API-02 | P2 | `req.json().catch(()=>({}))` in 2 handlers vs 6 safe handlers; header comments | backend-auth §6 |
| R2-API-03 | P2 | `aiGate` before `callAI` in all 8 handlers; handler comments; `recordTokens` swallow | backend-auth §6 |
| R2-API-05 | P3 | `dm_send` in `20261020130000`; T-API-07 (105,044 bytes; `last_text` 5,000) | backend-auth §6 |
| R2-API-06 | P3 | `EdgeFunction.swift:52-62` string-sniffing; `AuthView.readableError`; mixed server error shapes | backend-auth §6 |
| R2-API-07 | P3 | `20261029130000` unbounded `p_reason`; T-API-08 (100,000 chars stored) | backend-auth §6 |
| R2-API-08 | P3 | `SessionStore.swift:117-128,57`; `dropAllOnSignOut` count discarded | backend-auth §6 |
| R2-API-09 | P3 | `edge-auth.mjs` searches `claimCall(`; 0 call sites; handlers use `aiGate`; "cả chín" text | backend-auth §6 |
| R2-API-10 | P3 | `SessionStore.open(url:)`; `AuthLinkSheet` "Để sau"; no forced rotation | backend-auth §6 |
| R2-SYNC-01 | P2 | `OutboxStore.swift:137-145` (unscoped DELETE); `AccountLifecycle.swift:28-30`; `AppServices.swift:322-323`; `SessionStore.swift:209-220,117-133` | sync-ios §3 |
| R2-SYNC-02 | P3 | `OutboxStore.swift:47-66,107-131`; 0 production callers of `undecodableIds()` | sync-ios §3 |
| R2-SYNC-03 | P3 | Only `DELETE FROM outbox_dead` is the sign-out wipe (`:141`); `exercise-guide:` rows never pruned | sync-ios §3 |
| R2-SYNC-04 | P2 | `AppServices.swift:291-294`; `WidgetRefresher.swift:54-72`; `WidgetSync.swift:39-65` | sync-ios §3 |
| R2-SYNC-05 | P3 | `AppServices.swift:835-965` (`catch {}` at `:889-901,938-947`); `KoaPause.swift:139-147`; no sign-out cleanup of `koa.pause*` | sync-ios §3 |
| R2-SYNC-06 | P3 | `HealthSync.swift:78-129` (fail-fast) vs `:133-201` (partial-tolerant) | sync-ios §3 |
| R2-SYNC-07 | P3 | `SupabaseRemoteWriter.swift:158-205`; `SleepLog.swift:153-164`; `BiometricLog.swift:120-133`; `20260817120000:50-59,71,108` | sync-ios §3 |
| R2-SYNC-08 | P3 | `OutboxStore.swift:149-150` comment vs `SyncWorker.swift:44-45` `@MainActor`; `SyncWorker.persist :183-195` | sync-ios §3 |
| R2-SYNC-09 | P3 | `Database.swift:15-19` (`DatabaseQueue(path:)` no `Configuration`); 0 pragma/config greps | sync-ios §3 |
| R2-ECO-01 | P2 | `MascotShop.swift:84-89` ("Server không kiểm cấp khi mua"); `20260815120000:63+` (price + balance only) | economy §3 |
| R2-ECO-02 | P3 | `20261029130000:121-136` (ceiling before `ON CONFLICT DO NOTHING`) | economy §3 |
| R2-ECO-03 | P3 | `20260930120000:147+` (no `ends_on` comparison); grace display-only | economy §3 |
| R2-ECO-04 | P3 | `20260930120000:90-101` (no `joined_at` reference) | economy §3 |
| R2-ECO-05 | P3 | `20261029130000:122-129` (excludes `x:`) vs `20260930120000` ceiling block (sums all) | economy §3 |
| R2-ECO-06 | P3 | `MascotRules.swift:91-108` (`xpForRefKey` returns 0 for `cc:`/`x:`/overload) | economy §3 |
| R2-ECO-07 | P3 | `WorkoutSession.swift` vs `SessionRevisionMerge`/`SessionDetail.swift:125-128` vs `LastPerformance.swift:182-198`; 135-lb worked example | economy §3 |
| R2-ECO-08 | P3 | `MealLog.swift:355-389`; `MealDiary.swift:139`; 3×100.4 example | economy §3 |
| R2-ECO-09 | P3 | `ai-coach/index.ts:341` (`"lb"` vs stored `"lbs"`); `WeightUnit.swift`; `Onboarding.swift:373` | economy §3 |
| R2-ECO-10 | P3 | `KoaGains.swift` header claim; `KoaGainsSync.days:442` (`pr_detected`); `KoaGainsSync.mark` (overload keys) | economy §3 |
| R2-ECO-11 | P3 | `KoaDust.swift:84-87` (limit 60, no ORDER); `KoaGainsSync.query` contrast (ORDER + 2000) | economy §3 |
| R2-ECO-12 | P3 | `20261029140000_koa_room_clean.sql:13-55` (±1 day window, no dust check) | economy §3 |
| R2-ECO-13 | P3 | `MascotRoom.swift:348,355` (uncalled); `20261029130000:62-63` (pays 15); `MascotRules.swift:106` | economy §3 |
| R2-OPS-01 | P1 | `git ls-tree origin/main` (empty); `origin/main` tip `234f6b80`; public API `default_branch: main`; workflow header warnings | perf-ops §3 |
| R2-OPS-02 | P2 | 232 bare `auth.uid()` / 0 wrapped (grep); `SYSTEM_CHECK.md` advisor record (114 warnings) | perf-ops §3 |
| R2-OPS-03 | P1 | 1 capture hit (Debug-only, `Telemetry.swift:82`); 0 spans; 31 funnel-only events; `Void` callback discarding rebuild errors; 0 `pg_stat` | perf-ops §3 |
| R2-OPS-04 | P2 | `StallRecovery.swift:17-28` (25 s); `Backend.swift:20-30`; `_shared/ai.ts` (20 s/45 s, 3×3 failover); `NetworkFailure.swift:7-11` (offline classification) | perf-ops §3 |
| R2-OPS-06 | P2 | `TESTFLIGHT-CHECKLIST.md` (manual Archive; keys on one machine); no fastlane/`xcodebuild archive`/ASC API; `MARKETING_VERSION 0.1.0` | perf-ops §3 |
| R2-OPS-07 | P2 | `parse_test.ts` only test file; 0 `deno test` in workflows; RN-gate shims; workflow trigger analysis | perf-ops §3 |
| R2-OPS-08 | P3 | Triple 90-day fetches; `dm_inbox` LIMIT 200; notifications LIMIT 100; `select("*")` sites | perf-ops §3 |
| R2-OPS-09 | P2 | `legal-content.json:485` (30-day sentence); zero backup evidence (AUD-01) | perf-ops §3 |
| R2-OPS-10 | P3 | Perf scripts threshold-free + unrun; `native-perf-audit.mjs` static-only (T-OPS-07); 0 budgets | perf-ops §3 |
| R2-OPS-11 | P3 | `CONSTRAINTS_AND_DEFERRED.md:472,476,477,478` (Koa entry 4×); ad-hoc version mentions; no runbook | perf-ops §3 |

Folded (not separate findings): R2-OPS-05 → AUD-50 (perf-ops §3, `DailyLog.swift:147-192,484-545`); R2-API-04 → R2-DB-01 + AUD-40 (backend-auth §6, T-API-06).

## 2. Inventory evidence (catalog-verified, throwaway clusters)

| Inventory | Value | Source |
|---|---|---|
| Migrations | 88 files, 11,277 lines; strict apply 88/88 OK (twice, independent workers) | T-M1, T-API-10 |
| Tables / columns | 67 / 595 | Catalog C1 |
| RLS coverage | 67/67 tables | Catalog C2 |
| Policies | 127 (124 + 3 storage) | Catalog C2 |
| Function signatures / names | 94 / 93 (88 SECURITY DEFINER, 6 invoker) | Catalog C3, T-API-11 |
| Grants | 60 auth+svc / 26 svc-only / 8 PUBLIC (all triggers) | T-API-11 |
| Triggers / indexes / FKs | 52 / 158 / 92 (88 CASCADE, 3 SET NULL, 1 RESTRICT) | Catalog C5/C6 |
| CHECKs / JSONB columns / enums / views / extensions | 83 / 10 / 0 / 0 / 0 | Catalog C7/C12 |
| Unindexed FKs | 25 (27 counting partial-index-only) | Catalog C10 |
| Duplicate index groups | 7 exact + 13 near-duplicate | Catalog C11 |
| Edge Functions | 12 + 9 `_shared` modules; all `verify_jwt=false` | backend-auth §1 |
| Swift files / Swift test files | 814 / 267 (packages) — 276 incl. app-level per perf-ops count | sync-ios App. A, perf-ops §1.9 |
| `auth.uid()` bare / wrapped | 232 / 0 | T-OPS-10 |
| `console.*` sites in edge functions | 56 sites, 14 files | T-OPS-12 |

## 3. Verified-closed areas (investigated, no finding — do not re-flag)

- **SQL injection:** only `admin_add_art` uses `EXECUTE` (CONSTANT string, no user input); search RPCs escape LIKE wildcards. No injection surface.
- **SSRF:** `fetch()` only to env-configured AI URLs and constant Apple hosts with `encodeURIComponent`. No user-controlled URLs.
- **Direct ledger/entitlement writes:** SELECT-only policies + probes T-PX (`42501`).
- **IDOR (general):** all sampled RPCs correctly scoped to `auth.uid()`; only oracles are AUD-40 + R2-DB-01 (read-only).
- **`is_official` forgery:** guarded by `community_profiles_guard` trigger.
- **Storage path traversal:** server-side path patterns; `admin-art` validation verified in full.
- **`requireUser`:** sub + role + aud checks, fail-closed; all 11 auth-required functions call it.
- **Apple/Google sign-in nonces:** raw nonce to Supabase, SHA-256 to provider, per-request; session in Keychain.
- **INSERT policies:** 0 missing `WITH CHECK` (catalog check).
- **Community/DM/Koa policy sweep:** all INSERT/DELETE owner-scoped; DM tables SELECT-only + table-level REVOKE.
- **Secrets in repo:** no live keys (`sb_secret_`: 0; `BEGIN PRIVATE KEY`: 0; `ghp_`: 0; `AIza`: 0; long `eyJ`: 0; `sk-`: false positives only). Round 1's `sk-...` item RESOLVED.
- **`community_fold` grant:** deliberate + documented (generated-column evaluation). Cleared by two workers independently.
- **`handle_new_user` conflict:** nearly unreachable (T-API-05). Observation only.
- **`community_request_review` spam:** dedup enforced by partial unique index (T-API-09). Cleared.
- **`dm_open` existing-thread path:** design choice. Observation only.
- **`dm_send` silent 1000-char truncation:** documented UX behavior. Noted, not filed.
- **Storage buckets without policies (`exercise-media`, `community-art`):** deliberate + documented (service-role/dashboard-only uploads).
- **Block does not hide public posts:** product semantics (public = public); the *oracle* is the finding, not visibility.
- **Swift↔SQL price parity:** exact (51 items, T-STATIC-01..03).
- **`String(format:)` locale chain:** C locale — comma failure doesn't apply to the audited path; #527 Region test remains authoritative (economy §1.13).
- **`unlockLevel` dead data, `tzOffset` signs, `FitnessCalc` formulas:** checked, not filed (economy §1.13).

## 4. Evidence-scope classification (§4) — how to read this index

- **REPOSITORY_VERIFIED:** behavior executed on an isolated cluster, or exhaustively enumerated from code with counts. Cited for findings whose mechanism was demonstrated or fully enumerated.
- **CATALOG_VERIFIED:** PostgreSQL catalog queries on a throwaway cluster with all 88 migrations applied. Authoritative over static text counts where they disagree (deltas explained in the working papers).
- **REPOSITORY_ONLY:** code reading without execution (all Swift behavior; all edge-handler behavior). Stated plainly wherever it applies.
- **NOT_VERIFIED — ACCESS UNAVAILABLE:** production/live state. Never inferred from repo code. See `04-production-verification.md`.

## 5. No-modification verification

- All five audit worktrees verified at detached HEAD `b19e9822d46ea4ed85e0189c587711d6660210b2` with clean `git status` at the end of work (`~/workspace/round2-wt/{db-security,backend-auth,sync-ios,economy,perf-ops}`).
- Shared worktree `~/workspace/ascnd-review` never checked out or modified by any worker.
- Throwaway PostgreSQL clusters, `/tmp` extractions, and fixture data were disposable and cleaned up by the workers.
- No production system was accessed, written, deployed, or tested. No secret value was read, printed, or stored.

*End of evidence index.*
