# ASCND Round 2 — Test Plan

Tip: `native/ios-rewrite` @ `b19e9822`. 167 test cases created. **No test is claimed passed without execution.** "EXECUTED_FAIL" means the executed behavior demonstrated the defect — the system failed, not the test.

## 1. Status summary

| Status | Count | Workers |
|---|---|---|
| EXECUTED_PASS | 64 | db-security 25, backend-auth 27, economy 3, perf-ops 9, sync-ios 0 |
| EXECUTED_FAIL (defect reproduced) | 14 | db-security 9, backend-auth 5, others 0 |
| BLOCKED | 27 | db-security 2, backend-auth 4, economy 18, perf-ops 3, sync-ios 0 primary (5 cases carry an additional BLOCKED production leg) |
| NOT_EXECUTED | 39 | db-security 1, backend-auth 4, sync-ios 12, economy 8, perf-ops 14 |
| SPECIFICATION_ONLY | 23 | sync-ios 12, economy 6, perf-ops 5 |
| **Total** | **167** | |

## 2. Environments — read first (discrepancy disclosed, not harmonized)

- **PostgreSQL:** the db-security and backend-auth workers executed SQL behavior tests on throwaway PostgreSQL 16.15 clusters (disposable, synthetic users only, fixed UUIDs, `*.example.test`/`@test.local` addresses, role simulation via `SET ROLE` + `request.jwt.claim.sub` GUC — the repo suites' own pattern). The economy, perf-ops, and sync-ios workers reported **no PostgreSQL binaries on the VM** (apt lock held by a system process) and marked SQL behavior tests BLOCKED/NOT_EXECUTED. Both accounts are reported as documented; the coordinator did not re-run either environment. Where a verdict rests on unexecuted SQL behavior, the register says so.
- **Swift:** no Swift toolchain existed for any worker. **Zero Swift tests were executed in Round 2.** All Swift behavior claims rest on code reading. The repo's 267–276 Swift test files and the `ios.yml` CI suites were NOT run here; CI results at tip are NOT_VERIFIED from this audit.
- **Deno/Supabase runtime:** no Deno or Supabase runtime on the VM. Edge-function handler behavior tests are BLOCKED with isolated alternatives (Deno + stubbed gateway/DB).
- **Devices/simulators:** none. All simulator/device cases are SPECIFICATION_ONLY or NOT_EXECUTED. Kiệt's per-commit simulator QA is the natural vehicle.
- **Production:** no credentials, no access. Every production-mutation case is BLOCKED — PRODUCTION MUTATION PROHIBITED, each with an isolated alternative. Every production read-only check is NOT_VERIFIED — ACCESS UNAVAILABLE (see `04-production-verification.md`).
- **Dependencies:** `npm audit` blocked (403 `policy_denied`, reproduced); no SPM tooling. No dependency-vulnerability conclusion is drawn.
- **Deviations disclosed:** the db-security worker's merged-stub cluster lacked `created_at` on the core stub's `auth.users` (first replay attempt failed at `20261007220000:52` on this stub gap; fixed with the community stub's columns; real Supabase `auth.users` has `created_at`). The backend-auth worker independently hit the same stub artifact (87/88 with the core-only stub; 88/88 with the faithful stub). Three db-security probe attempts were flawed and invalidated (P3-weekly 0-row UPDATE, P18 wrong signature, P8 DO-block parse failure) — superseded by corrected runs; none of their outputs is cited as evidence. All clusters/fixtures were disposable and cleaned up; no repo file was modified.

## 3. Test cases by worker

### 3.1 Database & security (db-security) — 37 cases

Environment: disposable PG 16.15 cluster, merged stub, tip `b19e9822`, synthetic users A/B/C/D/E/F/G/M/U. 53 valid behavior assertions executed (33 secure-behavior-observed, 20 defect-demonstrated) across the probe rows below.

| ID | Objective / finding | Expected | Actual | Status |
|---|---|---|---|---|
| T-S1 | Core SQL suite passes | Exit 0 | Exit 0, 0 ERROR/FATAL | EXECUTED_PASS |
| T-S2 | Community SQL suite passes | Exit 0 | Exit 0, incl. "TẤT CẢ 22 KỊCH BẢN… ĐÚNG", 0 ERROR/FATAL | EXECUTED_PASS |
| T-M1 | All 88 migrations apply in order on one cluster | 0 failures | 0 failures (after stub fix) | EXECUTED_PASS |
| T-C1..C13 | Catalog inventory (13 groups: tables, policies, functions, search_path, indexes, FKs, CHECKs, triggers, views, updated_at, unindexed FKs, duplicate indexes, JSONB, privilege matrix) | Match inventory | All match (incl. corrections to Round 1) | EXECUTED_PASS |
| T-P1 | Cross-user RLS isolation | 0 rows / 0 affected | 0 / 0 / 0 | EXECUTED_PASS |
| T-P2 | Anon: shared rows visible, owner rows hidden (AUD-42) | Shared ≥1, owner 0 | 884 / 0 / 0 | EXECUTED_FAIL (INFO, by design) |
| T-P3/P3b | AUD-38 `user_id` mutation on 5 tables | Blocked or succeeds | All blocked `42501`; controls succeed | EXECUTED_PASS (NOT_REPRODUCIBLE) |
| T-P4 | `mascot_inventory` trigger protection | user_id/item_key blocked, equipped succeeds | Exactly so (`P0001`) | EXECUTED_PASS |
| T-P5 | AUD-39 photo squat | B blocked | B INSERT succeeded; A's failed `23505` | EXECUTED_FAIL |
| T-P6 | AUD-40 oracle | Raise or caller-only | `false` / `true` — oracle works | EXECUTED_FAIL |
| T-P7 | R2-DB-01 oracle | No leak | RPC `true`; direct SELECT 0 rows | EXECUTED_FAIL |
| T-P8r/P8b | AUD-41 direct trigger-function calls (both roles) | Engine blocks or privilege denies | All 8: `0A000` | EXECUTED_PASS (exploitability corrected) |
| T-P9 | AUD-08 JSONB shape/FK absence | Accepted (no validation) | All accepted | EXECUTED_FAIL |
| T-P10 | AUD-22 CHECK absence | Accepted | Accepted | EXECUTED_FAIL |
| T-P11r | AUD-45 DM cascade | Thread + messages gone | 1 thread + 2 messages → 0/0; E lost own message | EXECUTED_FAIL |
| T-P12r | AUD-26 dangling refs | Rows survive with dangling UUIDs | Both survive; `created_by`/`actor_id` dangle | EXECUTED_FAIL (narrowed scope) |
| T-P13r | AUD-84 kind-blind UNIQUE | Blocked `23505` | Blocked `23505 already shared` | EXECUTED_PASS (rigidity confirmed) |
| T-P14 | Admin/mod gating + revoked helpers (AUD-61) | `42501` all | `42501` all | EXECUTED_PASS |
| T-P15 | AUD-17 `updated_at` behavior | Exercises unchanged, profiles advanced | Exactly so | EXECUTED_FAIL (control passed) |
| T-P17 | Anon RPC closure | Permission denied | `42501` both | EXECUTED_PASS |
| T-P18r | Followers-only visibility | 0 unfollowed, 1 followed | 0 / 1 exactly | EXECUTED_PASS |
| T-PX | RPC-only / server-authoritative writes | RLS violation | `42501` all | EXECUTED_PASS |
| T-SWIFT | Swift unit/UI tests (276 test files) | — | — | NOT_EXECUTED (no toolchain) |
| T-PROD | Production RLS/grant/secret verification | — | — | BLOCKED (no credentials; isolated alternative: throwaway-cluster probes) |
| T-DEP | Dependency vulnerability scan | Report or blocker | `npm audit` 403 `policy_denied`; no SPM tooling | BLOCKED (no conclusion drawn) |

### 3.2 Backend & auth (backend-auth) — 40 cases

Environment: throwaway PG 16.15 cluster (`/var/tmp/r2pg`, port 54399), faithful stub, all 88 migrations; Node v24.22.1 type-stripping for TS helpers (verbatim line-range extractions into `/tmp/r2ts/`, no retyping).

| ID | Objective / finding | Expected | Actual | Status |
|---|---|---|---|---|
| T-API-01 | Unknown-kind bound in `ai_gate` (R2-API-01) | 7th unknown kind `denied`, ≤6 rows | All 8 → `ok`, 8 rows; shape checks intact | EXECUTED_FAIL |
| T-API-02 | Named limits + overage transitions (AUD-23) | 60 `ok`, 1 `denied`, then `overage` | Exactly so | EXECUTED_PASS |
| T-API-03 | `spend_ai_tokens` with no usage row (AUD-68) | Row created or spend refused | 0 rows; credits 10,000 → 7,000 (debit, record lost) | EXECUTED_FAIL |
| T-API-04 | Grants: anon denied; wrapper; fold; trigger-fn calls (AUD-66) | Anon denied; wrapper/fold work; trigger fns fail safely | Exactly so (`0A000`, not permission denied) | EXECUTED_PASS |
| T-API-05 | `handle_new_user` conflict behavior | (Hypothesis) trigger conflict breaks signup | Setup failed on FK; signup succeeded — conflict nearly unreachable | EXECUTED_PASS (honest negative) |
| T-API-06 | Relationship oracles (R2-API-04 → R2-DB-01/AUD-40) | Non-party probes refused | Full oracle (`false`/`true`/`true`) | EXECUTED_FAIL |
| T-API-07 | `dm_send` workout bounds (R2-API-05) | Rejected/truncated; `last_text` ≤140 | 105,044-byte workout stored; `last_text` 5,000 | EXECUTED_FAIL |
| T-API-08 | `claim_quest_reward` duplicate + `p_reason` (AUD-64/R2-API-07) | 2nd claim distinguishable; reason bounded | Both returned 35; 1 row; reason 100,000 chars | EXECUTED_FAIL |
| T-API-09 | Review-request dedup (honest negative) | 2nd call fails/no-ops; 1 row | Unique violation; 1 row | EXECUTED_PASS (no finding) |
| T-API-10 | Strict full-chain migration apply (AUD-13) | All apply | 88/88 OK (87/88 with core-only stub — stub artifact) | EXECUTED_PASS |
| T-API-11 | Final catalog inventory | Exact counts | 94 signatures, 88 DEFINER, 6 invoker; grants 60/26/8 | EXECUTED_PASS |
| T-TS-01..05 | `clampItems` bounds (scan-food; AUD-70 contrast) | Drop/keep/truncate/cap per code | All 5 as specified | EXECUTED_PASS (5) |
| T-TS-06..09 | `clampBody` bounds (body-check; AUD-70 contrast) | Null/null; widened range; 280-char note | All 4 as specified | EXECUTED_PASS (4) |
| T-TS-10..14 | `localDate`/`oneOf`/`toolArgs`/`tokensOf` | Nulls/denials per code | All 5 as specified | EXECUTED_PASS (5) |
| T-TS-15..20 | `cleanParse`/`readContext` (ai-log-parse) | Drop/cap per code | All 6 as specified | EXECUTED_PASS (6) |
| T-STATIC-01 | Static contract/enumeration checks (AUD-37/71/23, R2-API-09) | Complete enumerations | All completed with file:line citations | EXECUTED_PASS (static) |
| T-SWIFT-01 | Sign-out races + cleanup breadth (client) | Local sign-out despite network failure | — | NOT_EXECUTED (no toolchain; simulator) |
| T-SWIFT-02 | Refresh-failure → outbox discard? (R2-API-08) | Per #241 decision | — | NOT_EXECUTED |
| T-SWIFT-03 | Account-switch isolation | No leakage; no new-user data deleted | — | NOT_EXECUTED |
| T-SWIFT-04 | Recovery-link Later flow (R2-API-10) | Per decision | — | NOT_EXECUTED |
| T-LIVE-01 | Malformed-JSON quota burn (R2-API-02) | 4xx before gate; no increment | — | BLOCKED (no Deno/runtime; isolated alternative specified) |
| T-LIVE-02 | coach-memory partial failure (AUD-69) | Atomic or compensated | — | BLOCKED (same) |
| T-LIVE-03 | Failed-call quota refund (R2-API-03) | 1 unit total (if refunding) | — | BLOCKED (same) |
| T-PROD-01 | Any production-mutation probe | — | — | BLOCKED — PRODUCTION MUTATION PROHIBITED |

### 3.3 Offline sync & iOS native (sync-ios) — 24 cases, 0 executed

All synthetic data (fake UUIDs `user-a`/`user-b`/`u1`, synthetic payloads, fixture HealthKit samples). 5 cases carry an additional BLOCKED production-mutation leg with an isolated alternative (T-F01, T-F02, T-F08, T-F09, T-NEW-07); the primary status below reflects the executable (isolated/fake) leg.

**The 10 §2F scenarios:**

| ID | Scenario | Status | Code-path evidence / expectation |
|---|---|---|---|
| T-F01 | Offline workout creation (record → commit → pending overlay → replay) | SPECIFICATION_ONLY (E2E) + repo leg NOT_EXECUTED | `commitFinish` single transaction; `PendingSessions` overlay; `SyncWorker` kick on regain; `ignoreDuplicates` upsert. Exactly one server row; overlay lifecycle correct; no loss across kill. Production leg BLOCKED. |
| T-F02 | Prolonged-offline reconnect (burst drain, ordering, amplification) | SPECIFICATION_ONLY + counting leg NOT_EXECUTED | 20 mixed entries; strict `seq` order; zero duplicates; counts match the AUD-50/R2-SYNC-04 model (14/day/attempt, ×2 days, +4/entry widget). Production leg BLOCKED. |
| T-F03 | Interrupted sync (lost response / kill mid-send) | Repo leg NOT_EXECUTED; E2E leg SPECIFICATION_ONLY | `inFlight` memory-only; idempotency contract; settled-only deletion. Every id applies exactly once logically despite re-sends. |
| T-F04 | Retried sync (transient failures, backoff, budget exhaustion, head-of-line) | Repo leg NOT_EXECUTED; timing leg SPECIFICATION_ONLY | 1s/2s/4s backoff, 4 sends then dead; permanent → 1 send then dead; offline never exhausts; HOL bounds. |
| T-F05 | Duplicate events (double enqueue, double replay, double tap) | Repo leg NOT_EXECUTED; UI leg SPECIFICATION_ONLY | Id-guarded enqueue; `INSERT OR IGNORE`; `DayAlreadyLogged` guard. One row/apply in all three legs. |
| T-F06 | Termination during sync (kill mid-drain/persist/enqueue) | Repo leg NOT_EXECUTED; kill-harness leg SPECIFICATION_ONLY | Commit-before-ack; `reload()` exclusion; persist-failure retry. No loss/duplication in any kill phase. |
| T-F07 | Account switch with unsynced data (A→B) | SPECIFICATION_ONLY + repo leg NOT_EXECUTED + R2-SYNC-01 leg | A's rows dead/dropped, never sent; B's row survives and drains; no cross-account leakage. Current code predicted to FAIL leg (4) in the delayed-cleanup interleaving. |
| T-F08 | Sign-out with pending outbox (AUD-06 reproduction) | SPECIFICATION_ONLY (destructive — fixture only) | Current: confirm copy silent; all rows gone; nothing syncs. Post-fix: per #241. Production leg BLOCKED. |
| T-F09 | Conflicting local/server updates (two-device + revision merge) | SPECIFICATION_ONLY (isolated backend) | LWW silent / merge preserves / skip on delete; sleep concurrency count (R2-SYNC-07). Production leg BLOCKED. |
| T-F10 | Partial health import (one part fails; crash mid-import) | Repo leg NOT_EXECUTED; HealthKit leg SPECIFICATION_ONLY | `.incomplete` names the part; written parts persist; next sync heals without duplicates; bio-failure leg per R2-SYNC-06. |

**Finding-linked and supplementary cases:**

| ID | Finding | Status | Objective |
|---|---|---|---|
| T-NEW-01 | R2-SYNC-01 | NOT_EXECUTED | B's row survives A's delayed cleanup (full spec in register) |
| T-NEW-02 | R2-SYNC-02 | NOT_EXECUTED | Undecodable row is surfaced |
| T-NEW-03 | R2-SYNC-03 | SPECIFICATION_ONLY | Dead/guide storage stays bounded |
| T-NEW-04 | R2-SYNC-04 | NOT_EXECUTED | ≤4 widget selects per drain |
| T-NEW-05 | R2-SYNC-05 | SPECIFICATION_ONLY | Failed pause push observable + retried |
| T-NEW-06 | R2-SYNC-06 | NOT_EXECUTED | Bio failure doesn't block sleep/workout import |
| T-NEW-07 | R2-SYNC-07 | SPECIFICATION_ONLY (isolated DB; BLOCKED on production) | Two-writer sleep dedup |
| T-NEW-08 | R2-SYNC-08 | SPECIFICATION_ONLY (Instruments) | Main-thread drain cost budget |
| T-NEW-09 | R2-SYNC-09 | NOT_EXECUTED | Assert effective SQLite pragmas |
| T-NEW-35 | AUD-35 | NOT_EXECUTED | Interleaved weight writes end newest-dated; failure surfaces |
| T-NEW-52 | AUD-52 | SPECIFICATION_ONLY | Second consecutive sync issues ~0 upserts |
| T-NEW-59 | AUD-59 | SPECIFICATION_ONLY | DM from device B appears on A without manual refresh (expected: FAIL today) |
| T-NEW-63 | AUD-63 | SPECIFICATION_ONLY | Each cached screen shows staleness after failed refresh (expected: FAIL on all 11 namespaces) |
| T-NEW-74 | AUD-74 | NOT_EXECUTED | Ported RN scrub tests (expected: FAIL — no scrubber exists) |

Repo test inventory (all NOT_EXECUTED here): 267 Swift test files under `apps/ios/Packages/*/Tests/`; sync-relevant suites include `SyncTests`, `SyncVectorTests`, `SyncWorkerTests`, `SyncWorkerFuzzTests`, `OutboxStoreTests`, `OutboxAccountFenceTests`, `AccountLifecycleTests`, `GRDBWorkoutStoreTests`, `HealthSyncTests`, `HealthGoldenTests`, `RemoteWriterTests`, `StallRecoveryTests`. Notable gaps (no test file found): background drain, Realtime, StoreKit, undecodable-row surfacing, widget-refresh coalescing, Koa pause failure observability, SQLite pragma assertions, main-thread persistence cost. Whether CI was green at tip is NOT_VERIFIED.

### 3.4 Fitness, economy & purchases (economy) — 35 cases

| ID | Objective / finding | Status | Notes |
|---|---|---|---|
| T-STATIC-01 | Swift shop prices == SQL `shop_prices` (51 items) | EXECUTED_PASS | Zero diffs; totals both 12,500 (excl. freeze 150) |
| T-STATIC-02 | Swift displayed reward/XP values == SQL `reward_prices` | EXECUTED_PASS | All spot-checks match; one documented display-only divergence (RN legacy `streakCoins`) |
| T-STATIC-03 | Final SQL price state at tip | EXECUTED_PASS | `shop_prices` 52 keys / 12,650; `reward_prices` 26 keys |
| T-ECO-01 | Invented `ch:platinum` keys mint to 800; 7th raises (AUD-02) | BLOCKED | Full executable SQL in working paper Appendix A |
| T-ECO-02 | Invented `w:` keys mint 40 each; 20 = 800 (AUD-02) | BLOCKED | Same |
| T-ECO-03 | `d:` malformed/old-date/streak claims (AUD-02, R2-ECO-13) | BLOCKED | Same |
| T-ECO-04 | All 7 `x:` keys pay 195 outside ceiling; duplicates no-op (AUD-02) | BLOCKED | Same |
| T-ECO-05 | Duplicate claim returns amount, no 2nd row; forged `earn_mascot_coins` amount ignored (AUD-64, AUD-02) | BLOCKED | Same |
| T-ECO-06 | Concurrent duplicate `buy_mascot_item` → raw 23505 vs friendly error (AUD-65) | BLOCKED | Same |
| T-ECO-07 | Duplicate claim on full-ceiling day raises (R2-ECO-02) | BLOCKED | Same |
| T-ECO-08 | Concurrent same-key claims (10 sessions) → 1 row; ceiling race → exactly 800 (AUD-02) | BLOCKED | Same |
| T-ECO-09 | `buy_streak_freeze` same-UUID retry → one debit; zero-arg retry → double charge (AUD-14) | BLOCKED | Same |
| T-ECO-10 | `use_streak_freeze` concurrent same-day → one true, one false (AUD-14) | BLOCKED | Same |
| T-ECO-11 | `clean_koa_room` duplicate-day + ±1-day window + out-of-window raise (R2-ECO-12) | BLOCKED | Same |
| T-ECO-12 | `claim_community_challenge`: fabricated sessions pay (AUD-25); 12b pre-join (R2-ECO-04); 12c post-`ends_on` (R2-ECO-03); 12d ceiling incl. `x:` (R2-ECO-05) | BLOCKED | Same |
| T-ECO-13 | Direct `awards` INSERT with invented key/tier succeeds (AUD-03) | BLOCKED | Same |
| T-ECO-14 | Direct `daily_logs` forged readiness write succeeds (AUD-20) | BLOCKED | Same |
| T-ECO-15 | Direct `body_checks` INSERT width-0/width-57 succeeds (AUD-36) | BLOCKED | Same |
| T-ECO-16 | Rank-gated buy `buy_mascot_item('dragonwing')` at rank 0 succeeds (R2-ECO-01) | BLOCKED | Same |
| T-ECO-17 | Forged sessions + overload keys inflate Gains (R2-ECO-10; SQL half) | BLOCKED | Same |
| T-ECO-18 | Ledger-vs-balance consistency across a scripted day; no negative-balance path | BLOCKED | Same |
| T-SWIFT-01 | `xpForRefKey` namespace table (R2-ECO-06) | NOT_EXECUTED | No Swift toolchain |
| T-SWIFT-02 | Three volume definitions on 3×5×135 lb (R2-ECO-07) | NOT_EXECUTED | Same |
| T-SWIFT-03 | Meal 3×100.4 kcal total-vs-sum (R2-ECO-08) | NOT_EXECUTED | Same |
| T-SWIFT-04 | `KoaDust` with 61 cleans, newest last (R2-ECO-11) | NOT_EXECUTED | Same |
| T-SWIFT-05 | `KoaGains.compute` over forged history (R2-ECO-10; Swift half) | NOT_EXECUTED | Same |
| T-SWIFT-06 | AUD-34 client meal sequence (entry without items) | NOT_EXECUTED | Same |
| T-EDGE-01 | `ai-coach` prompt `weight_unit` with `units_weight='lbs'` (R2-ECO-09) | NOT_EXECUTED | Deno unverified; static check only |
| T-EDGE-02 | `body-check` `clampBody` boundary table | NOT_EXECUTED | Same |
| T-PUR-01 | Sandbox Plus purchase with `appAccountToken` → tier + row (AUD-04) | SPECIFICATION_ONLY | No device/credentials |
| T-PUR-02 | Same transaction id replayed by a different user → refused (AUD-04) | SPECIFICATION_ONLY | Same |
| T-PUR-03 | Tokenless transaction → refused (AUD-04) | SPECIFICATION_ONLY | Same |
| T-PUR-04 | Restore on fresh install → same row, no duplicate (AUD-04) | SPECIFICATION_ONLY | Same |
| T-PUR-05 | Sandbox refund → webhook → tier free, `expires_at` null (AUD-04) | SPECIFICATION_ONLY | Same |
| T-PUR-06 | Renewal/expiry/grace + late/duplicate webhook → idempotent (AUD-04) | SPECIFICATION_ONLY | Same |

All production-mutation equivalents of T-ECO-* are BLOCKED — PRODUCTION MUTATION PROHIBITED (counted as a class, not individually).

### 3.5 Performance, reliability & operations (perf-ops) — 31 cases

| ID | Test | Status | Notes |
|---|---|---|---|
| T-OPS-01 | SQL community suite | NOT_EXECUTED | No PG; Round 1 phase 9: EXIT 0 (cited only). Note: db-security worker DID execute both suites this round (T-S1/T-S2) — see §2 environment discrepancy. |
| T-OPS-02 | SQL core suite | NOT_EXECUTED | Same |
| T-OPS-03 | Mutation suites | NOT_EXECUTED | Same (+ long runtime) |
| T-OPS-04 | Swift tests (276 files) | NOT_EXECUTED | No toolchain; CI results NOT_VERIFIED |
| T-OPS-05 | Perf harnesses (50k rows) | NOT_EXECUTED | No PG; team's header numbers cited only |
| T-OPS-06 | EXPLAIN probes (incl. R2T-02 initplan) | NOT_EXECUTED | No PG; SQL specified in R2-OPS-02 |
| T-OPS-07 | `native-perf-audit.mjs` static scan | EXECUTED_PASS | `XANH (0 lỗi)`, exit 0 |
| T-OPS-08 | Migration ordering + duplicate prefixes | EXECUTED_PASS | 88 files, zero duplicate prefixes |
| T-OPS-09 | Destructive DDL scan | EXECUTED_PASS | Zero hits |
| T-OPS-10 | Index/GIN/FTS/extension + `auth.uid()` inventory | EXECUTED_PASS | 72 indexes; 0 GIN/GiST; 232 bare `auth.uid()` / 0 wrapped |
| T-OPS-11 | Default-branch workflow absence | EXECUTED_PASS | `main` has no `.github/`; schedules cannot fire |
| T-OPS-12 | Edge logging inventory | EXECUTED_PASS | 56 sites, 14 files; `admin-art` 0 |
| T-OPS-13 | Sentry manual-capture + span inventory | EXECUTED_PASS | 1 capture hit (Debug-only); 0 spans |
| T-OPS-14 | Seed-row counts | EXECUTED_PASS | 873 exercise + 413 food tuples |
| T-OPS-15 | Worktree integrity | EXECUTED_PASS | Clean, tip unchanged |
| T-OPS-16 | Restore drill | BLOCKED | No access + production mutation prohibited; throwaway-project alternative specified |
| T-OPS-17 | System-check bot live run | BLOCKED | Needs tokens; read-only, blocked on access only |
| T-OPS-18 | Maestro E2E (13 flows) + a11y audit | NOT_EXECUTED | No macOS/simulator; nightly schedule dead |
| T-OPS-19 | RN quality gate (`check.mjs`) | NOT_EXECUTED | `node_modules` not installed; legacy surface |
| T-OPS-20 | Deno test (`parse_test.ts`) | NOT_EXECUTED | No Deno; no CI runner (R2-OPS-07) |
| R2T-01 | Scheduled-run existence (R2-OPS-01) | SPECIFICATION_ONLY | Requires fix + 7 days of Actions history |
| R2T-02 | Initplan behavior on isolated cluster (R2-OPS-02) | NOT_EXECUTED | Folded into T-OPS-06 in the worker's count; listed here for traceability, not double-counted |
| R2T-03a | Dead-letter Sentry reporting (R2-OPS-03) | NOT_EXECUTED | No toolchain/simulator; hook doesn't exist |
| R2T-03b | Rebuild-failure reporting hook (R2-OPS-03) | SPECIFICATION_ONLY | Requires hook to be built |
| R2T-04 | Slow-provider AI timeout (R2-OPS-04) | NOT_EXECUTED | No simulator/toolchain |
| R2T-05 | Drain coalescing counts (AUD-50/R2-OPS-05) | NOT_EXECUTED | No toolchain |
| R2T-06 | Release-binary verification gate (R2-OPS-06) | SPECIFICATION_ONLY | Requires CI release job |
| R2T-07 | Deno suite in CI (R2-OPS-07) | NOT_EXECUTED | No Deno, no CI access |
| R2T-08 | 90-day fetch consolidation (R2-OPS-08) | SPECIFICATION_ONLY | Requires fix + test |
| R2T-09 | Privacy-claim vs backup-reality (R2-OPS-09) | BLOCKED | Dashboard access unavailable (read-only) |
| R2T-10 | EXPLAIN-shape regression (R2-OPS-10) | NOT_EXECUTED | No PG |
| R2T-11 | Deploy-log reconstruction (R2-OPS-11) | SPECIFICATION_ONLY | Requires process + post-fix deploy |

Count reconciliation: the worker logged 31 cases (R2T-02 counted inside T-OPS-06). The table above lists 32 rows with R2T-02 shown for traceability; the §1 totals use 31 for this worker (167 total).

## 4. What was NOT tested (honesty statement)

- **Zero Swift tests executed** (no toolchain). The repo's Swift suites (267–276 files, ~2,368 test matches, ~8,400 assertions) were not run; CI green-ness at tip is NOT_VERIFIED.
- **Zero edge-function handler executions** (no Deno/Supabase runtime). Handler behavior rests on code-path analysis + 20 executed TS helper extractions.
- **Zero production checks** (no access). See `04-production-verification.md`.
- **Zero load tests** (not permitted against production; no isolated load harness exists).
- **Zero dependency scans with a conclusion** (`npm audit` 403; no SPM tooling).
- **Concurrency behavior** of AUD-65, AUD-77, trigger counters (AUD-51), and `dm_send` rate limits was not executed (parallel-session tests not run).
- **PostgREST-layer behavior** (function exposure of trigger functions, row-cap truncation) inferred from SQL semantics, not executed against PostgREST.

## 5. Rerun instructions (for the team / CI)

1. **SQL suites + full-chain apply:** `supabase/tests/core/run.sh` and `supabase/tests/community/run.sh` on throwaway PG16 clusters (executed this round: T-S1/T-S2/T-M1/T-API-10 — re-run on any migration change). Add the single full-chain CI job (AUD-13).
2. **Behavior probes:** re-run T-P1..T-PX and T-API-01..11 scripts from the working papers on any PG16 throwaway cluster with the faithful stub (core stub + `auth.users.email/created_at`). Economy T-ECO-01..18 specs are fully written in the economy working paper, Appendix A — run them on the first available PG environment; they are the highest-value unexecuted cases (reward minting, award forgery, freeze idempotency).
3. **Swift:** `swift test` on macOS CI (`ios.yml`) + simulator runs for T-F01..T-F10, T-NEW-*, T-SWIFT-* (both workers' sets), R2T-03a/04/05. Kiệt's per-commit simulator QA covers the simulator legs.
4. **Deno:** install pinned Deno; `deno test supabase/functions/` (R2T-07); Deno + stubbed gateway for T-LIVE-01..03.
5. **Production checks:** owner-only, read-only, per `04-production-verification.md`. Never run behavior probes against production.

## 6. Critical untested invariants (from code reading — each needs a test; none is asserted failing)

- PostgREST row-cap truncation behavior on the three unbounded reads (no test simulates a capped response).
- DailyLog rebuild under concurrent writers beyond the scripted OCC unit tests (no integration test against real Postgres + PostgREST).
- Trigger-counter correctness under concurrent likes (SQL suites are sequential).
- Search-perf regression (no threshold; R2-OPS-10).
- Restore procedure (no drill; AUD-01).
- Telemetry liveness in Release builds (no automated check).
- Offline→sign-out queue destruction is specified behavior pending #241 (the *decision* is the gap, not the test).
- Coverage: unmeasured (zero mentions of coverage/codecov in any workflow). Coverage is unknown, not zero — do not cite a number.
- Flakiness: no evidence either way (no retry logic, no flake quarantine, no tracking in workflows).

*End of test plan.*
