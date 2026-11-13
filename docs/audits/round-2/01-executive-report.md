# ASCND Round 2 — Executive Report

## Full-Spectrum Engineering & Production Audit

| Field | Value |
|---|---|
| Repository | `github.com/dnganhkiet1206/fitness-os` (public) |
| Branch / tip audited | `native/ios-rewrite` @ `b19e9822d46ea4ed85e0189c587711d6660210b2` |
| Audit date | 2026-11-11 / 2026-11-12 (UTC) |
| Standard | Native iOS app (`apps/ios/`, SwiftUI + ASCNDKit) is the standard per Kiệt's 2026-11-11 decision. React Native code/docs are legacy context only. |
| Round 1 baseline | `ASCND_BACKEND_AUDIT_REPORT.md` (88 findings AUD-01..AUD-88, same tip) |
| Access | Repository read-only. **No Supabase/production access existed.** Every production check is NOT_VERIFIED — ACCESS UNAVAILABLE. No production behavior is inferred from repo code anywhere in this report set. |
| Modification | **None.** No code, migration, config, secret, CI, or Supabase setting was modified. See §11. |

---

## 1. Overall verdict

**The Round 1 findings are real, and almost nothing has changed since Round 1.**

Round 2 revalidated all 88 Round 1 findings with fresh evidence at the same tip: **72 CONFIRMED, 15 PARTIALLY_CONFIRMED, 1 NOT_REPRODUCIBLE, 0 FIXED_AND_VERIFIED.** Not one Round 1 finding was fixed — expected, since the tip is unchanged, but stated plainly because it is the single most important fact in this report: every Round 1 risk is still live, and Round 2 found **42 additional findings** (0 P0, 2 P1, 12 P2, 28 P3), including two new launch-blocking operational defects that Round 1 did not catch: the scheduled CI system-check **never runs** (R2-OPS-01) and the app has **zero manual error reporting** (R2-OPS-03).

The architecture verdict from Round 1 stands: Supabase + PostgREST + RPCs + Edge Functions + the GRDB outbox is suitable for ASCND, and **no platform migration or rewrite is justified**. The strongest subsystems — the outbox/sync core, the economy RPCs, the purchase/entitlement server half, the SQL suites + mutation testing, the community moderation architecture — remain strong. The problems are the same three as in Round 1, now with sharper evidence and wider blast radius:

1. **No verified recovery path** (AUD-01, AUD-07) — plus a shipped privacy sentence asserting 30-day backups with zero operational evidence behind it (R2-OPS-09).
2. **Silent data loss on session end** (AUD-06) — scope expanded: destruction fires on *every* session end, including involuntary token loss, and a new unscoped-delete defect can destroy the *next* account's rows (R2-SYNC-01). Owner decision #241 is still pending.
3. **Client-asserted gamification truth + no monetization** (AUD-02/03/04/14/25) — reward arithmetic recomputed at tip: **800 coins + ~800 XP/day forgeable, +195 one-time `x:` coins, the full 51-item shop (12,500 coins) in ~16 scripted days**. One correction softens the picture: streak freezes are **unreachable via the app UI** at tip (dead buy path), though the buy RPC remains directly callable and freezes remain unspendable (AUD-14).

**Beta readiness: NO-GO until the P0 conditions in §7 are met** (same conditions as Round 1, unchanged because nothing was fixed). **Public launch readiness: NO — not as-is, and not close.** The release gate in `07-release-gate.md` lists 11 launch-blocking items; 4 of them are new in Round 2.

Two honest corrections to Round 1 are reported as prominently as the confirmations: AUD-38 (UPDATE policies allowing `user_id` mutation) is **NOT_REPRODUCIBLE** — PostgreSQL reuses `USING` as `WITH CHECK`, and all 5 tables behaviorally block the mutation; and AUD-41 (unrevoked trigger functions) is **not exploitable** — the engine refuses direct calls with `0A000`. Both are downgraded to P3 hygiene. Neither changes the overall verdict.

---

## 2. Finding counts

### 2.1 Round 1 revalidation (88 findings)

| Verdict | Count | IDs |
|---|---|---|
| CONFIRMED | 72 | AUD-01, 02, 03, 04, 05, 06, 08, 09, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 39, 40, 41, 42, 43, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 58, 59, 62, 64, 66, 68, 69, 70, 71, 72, 73, 74, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88 |
| PARTIALLY_CONFIRMED | 15 | AUD-07, 10, 12, 13, 24, 26, 37, 44, 57, 60, 61, 63, 65, 67, 75 |
| NOT_REPRODUCIBLE | 1 | AUD-38 |
| FIXED_AND_VERIFIED | 0 | — |
| NOT_VERIFIABLE / SUPERSEDED / NEW_EVIDENCE_REQUIRED | 0 | — |

The register (`02-findings-register.md`) carries one row per ID and governs in case of any discrepancy with this summary table.

Round 1 severity distribution (unchanged — no finding was re-severitied except AUD-38 → P3 hygiene and AUD-53 → LOW, both noted in the register): 1 CRITICAL, 11 HIGH, 34 MEDIUM, 23 LOW, 19 INFO.

### 2.2 New Round 2 findings (42 after 2 merges)

| Severity | Count | IDs |
|---|---|---|
| P0 | 0 | — |
| P1 | 2 | R2-OPS-01 (scheduled CI never runs), R2-OPS-03 (zero manual error reporting) |
| P2 | 12 | R2-API-01, R2-API-02, R2-API-03, R2-SYNC-01, R2-SYNC-02, R2-SYNC-04, R2-ECO-01, R2-OPS-02, R2-OPS-04, R2-OPS-06, R2-OPS-07, R2-OPS-09 |
| P3 | 28 | R2-DB-01; R2-API-05, 06, 07, 08, 09, 10; R2-SYNC-03, 05, 06, 07, 08, 09; R2-ECO-02..13; R2-OPS-08, 10, 11 |
| **Total** | **42** | |

Merges applied by the coordinator (no double-counting): R2-OPS-05 (rebuild amplification detail) folded into AUD-50's remediation; R2-API-04 (relationship oracles) merged into R2-DB-01 / AUD-40 cross-references. R2-API-07 is kept but narrowed to the unbounded `p_reason` half (the duplicate-return half is AUD-64). R2-API-08 is kept separate from AUD-06 (distinct session-nil trigger path).

### 2.3 Combined open findings

88 Round 1 findings (87 still open defects/observations + 1 non-reproduced) + 42 new = **130 tracked items**, of which **11 are launch-blocking** (see §7 and `07-release-gate.md`).

---

## 3. Test-case counts

167 test cases were created across the five domain workers. Statuses are truthful: nothing is claimed passed without execution.

| Status | Count | Meaning |
|---|---|---|
| EXECUTED_PASS | 64 | Executed; behavior matched the secure/correct expectation (includes 2 SQL suites, a full 88-migration replay, 13 catalog groups, 20 TS helper executions, static/inventory checks) |
| EXECUTED_FAIL | 14 | Executed; behavior demonstrated the defect (the *system* failed, not the test — successful defect reproductions, e.g. AUD-38's non-reproduction is counted as PASS; AUD-39/40, R2-DB-01, R2-API-01/03/06/07/08 probes are FAILs) |
| BLOCKED | 27 | Cannot run without access that does not exist (production, Deno/Supabase runtime, or PostgreSQL binaries on 3 of 5 workers) — each names an isolated alternative |
| NOT_EXECUTED | 39 | Specified against existing tests/fakes; blocked by missing Swift toolchain / environment |
| SPECIFICATION_ONLY | 23 | No test exists; fully specified for a Mac/simulator/CI run |
| **Total created** | **167** | |

Environment discrepancy, reported honestly and not harmonized: two workers executed SQL behavior tests on throwaway PostgreSQL 16.15 clusters; three workers had no PostgreSQL binaries on the VM (apt lock held by a system process) and marked SQL behavior tests BLOCKED/NOT_EXECUTED. No worker had a Swift toolchain — **zero Swift tests were executed in Round 2**; all Swift behavior claims rest on code reading. `npm audit` was blocked (403 `policy_denied`); no dependency-vulnerability conclusion is drawn. Full per-case log: `03-test-plan.md`.

---

## 4. Production verification coverage

**Coverage: 0 of 20 verification items verified. All are BLOCKED or NOT_VERIFIED — ACCESS UNAVAILABLE.**

Round 2 extends Round 1's 16-item AUD-48 backlog to 20 items (adding: scheduled-run history, telemetry-key presence in release builds, backup/retention evidence for the privacy claim, and Realtime publication state). None could be checked: no credentials, no dashboard, no service keys, no CI history access from the audit environment. The §8 verification matrix in `04-production-verification.md` lists every item with its exact check, its blocker, and the isolated alternative where one exists. **No staging/production state is marked verified from repo code alone anywhere in this report set.** The single most urgent production check remains the AUD-01 backup/PITR + restore drill — it has now survived two full audit rounds unverified.

---

## 5. Top 5 risks

1. **No verified recovery path, and the privacy text may be false (AUD-01, AUD-07, R2-OPS-09).** Single project, manual deploys, no staging, no rollback, no restore drill — and `legal-content.json:485` tells users backups "may persist for up to 30 days" with zero evidence in the repo that backups exist at all. One bad migration or manual error could destroy everything with no known undo; if the plan has no backups, a shipped legal sentence is inaccurate. *Launch-blocking.*
2. **Silent destruction of unsynced records on every session end (AUD-06, R2-SYNC-01, R2-API-08).** Sign-out — including involuntary session loss from expired tokens, deleted accounts, and password changes — deletes pending + dead outbox rows with a confirmation copy that never mentions unsent data, and the dropped count is discarded. A new unscoped-delete defect can delete the *next* account's rows during a switch. Owner decision #241 has been pending since the baseline. *Beta- and launch-blocking.*
3. **The economy is forgeable and monetization does not exist (AUD-02, AUD-03, AUD-25, AUD-04, R2-ECO-01, R2-ECO-10, R2-ECO-13).** 800 coins + ~800 XP/day via invented claim keys; self-granted achievements via direct INSERT; challenge claims verified against freely authorable workout rows; rank-gated shop items buyable via direct RPC; zero StoreKit, zero paywall, tier gating only a cosmetic logo animation. Coins are cosmetic-only today — this escalates to CRITICAL the moment coins gate paid features or prizes. *Launch-blocking (AUD-02/04 decisions).*
4. **Operational blindness (R2-OPS-01, R2-OPS-03, AUD-57, AUD-58, AUD-33).** The "daily" system check and nightly E2E/a11y schedules have likely *never* run — the default branch `main` contains no workflows at all. Sentry is crash-only (one Debug-only capture hit; no spans, no manual reporting); PostHog is funnel-only; rebuild failures are discarded by a `Void` callback; the detection matrix answers "no" for failed sync, AI failures, DB errors, auth failures, latency, and HealthKit failures. The team would learn about a production failure from user complaints, or not at all. *Launch-blocking.*
5. **Unmeasured scale cliffs with no performance gates (AUD-09, AUD-05/27/28, AUD-50 + R2-SYNC-04, R2-OPS-02, R2-OPS-10).** Full-scan search with per-row folding (no GIN/FTS/trigram index anywhere); unbounded reads near the unverified PostgREST row cap; a reconnect burst costs up to 32 sequential requests per workout entry (14/day rebuild × 2 days + 4 widget queries, before OCC retries); 232 bare `auth.uid()` RLS evaluations with 0 wrapped in InitPlan form; and no performance budget, regression gate, or load evidence anywhere — the perf harnesses are manual and threshold-free. Comfortable at 1k/10k actives; degraded at 100k; not ready at 1M without search + index work. *Scale-gating, not beta-blocking.*

---

## 6. What Round 2 corrected or narrowed in Round 1

Honest corrections (each detailed in the register):

- **AUD-38 NOT_REPRODUCIBLE** — `user_id` mutation is blocked by PostgreSQL semantics on all 5 tables (42501). Downgraded to P3 hygiene.
- **AUD-41 exploitability corrected** — direct calls to the 8 unrevoked trigger functions fail at the engine (`0A000`). Hygiene only.
- **AUD-14 narrowed** — freezes are buyable via direct RPC only; unreachable via UI (dead `buyFreeze()`, empty MARK section, unrendered consumables array); never spendable. The "users pay 150 coins" harm is not reachable in-app at tip; the dead-code + live-RPC combination still needs a decision.
- **AUD-10 count corrected** — 25 unindexed FKs (27 counting partial-index-only), not 22.
- **AUD-12 partially corrected** — a prose deploy log *does* exist (claims both Koa migrations deployed 03/11 86/86 and 04/11 87/87); headers are stale; live state NOT_VERIFIED.
- **AUD-13 risk absent** — strict 88/88 full-chain apply executed cleanly; the CI gap (no single CI job) is real, the underlying breakage risk is not present at tip.
- **AUD-24 partially resolved** — drift guards ARE in CI (`quality-gate.yml` → `check.mjs`); the uncovered remainder is Swift `ReadinessEngine` scores and Swift streak predicates.
- **AUD-26 narrowed** — `moderation_audit_log.actor_id` and `app_roles.granted_by` FK-lessness IS documented in-migration; genuinely undocumented are `community_restrictions.created_by` and `community_review_requests.decided_by`.
- **AUD-37 mitigations real + CI-enforced** — `requireUser` in all 11 auth-required handlers, checked twice in CI; residual risk is guard erosion (R2-API-09: ordering check looks for dead `claimCall`).
- **AUD-44 key format corrected** — `sb_publishable_`-format, not a legacy JWT; removal commit unverifiable in the shallow clone.
- **AUD-50 count corrected** — 14 requests/day/attempt, ×2 days for workouts, sequential reads; worst case 32/entry with widget refresh.
- **AUD-53 failure mode corrected** — water scan *throws* past 50 pages, not silent truncation; severity LOW.
- **AUD-57 partially corrected** — the bot is push-only (schedule dead, R2-OPS-01) and checks more than advisors.
- **AUD-59 precision** — fetch-on-appear + pull-to-refresh, not timer polling.
- **AUD-67 narrowed** — 25s StallRecovery covers invoke/RPC/PostgREST; the coach stream on `.shared` has no timeout (60s default).
- **AUD-75 corrected** — file protection IS set (`.completeUntilFirstUserAuthentication` on the DB directory).
- **AUD-02 arithmetic recomputed** — 800/day + 195 one-time; full 51-item shop (12,500 coins) in ~16 days (Round 1's "39 items/~8,530" is stale).
- **AUD-54 expanded** — vision worst-case ≈405s, not 180s.
- **AUD-88 expanded** — `delete-account` also bypasses the env indirection (3 of 12 functions).
- **Inventory corrections** — 92 FKs (not "100+"), 3 SET NULL (not 7), 10 JSONB columns (not 9), `weight_logs` duplicate unique pair (missed by Round 1).

---

## 7. Readiness

### Beta readiness: NO-GO (conditional)

A limited closed beta is safe **only once** the Round 1 P0 conditions are met — none were met at this tip:

| # | Condition | Finding | Status |
|---|---|---|---|
| B-1 | Backups verified + restore drill recorded | AUD-01 | NOT_VERIFIED — ACCESS UNAVAILABLE |
| B-2 | Streak freezes fixed or unsold (decision + implementation) | AUD-14 | Open — buy path dead in UI, RPC live, spend path absent |
| B-3 | Reward keys validated or formally accepted as residual risk | AUD-02 | Open — 800/day forgeable |
| B-4 | #241 decided; sign-out queue preserved or warn + sync-first | AUD-06 | Open — decision still pending; destruction on every session end |
| B-5 | AUD-48 live checks run and recorded | AUD-48 | Open — 0 of 20 verified |
| B-6 | `verify-purchase` fail-open fixed | AUD-47 | Open (mitigated: function has no caller, NOT_DEPLOYED_BY_DESIGN) |

Beta with real users' workout data before B-4 is the sharpest risk: involuntary session loss silently destroys unsynced records with no warning. If a beta proceeds before B-1..B-6, it should be a *test-account-only* beta with the data-loss paths explicitly disclosed to testers.

### Public launch readiness: NO

11 launch-blocking items (full gate in `07-release-gate.md`): AUD-01, AUD-02 (decision), AUD-04, AUD-06, AUD-07, AUD-14 (decision), R2-OPS-01, R2-OPS-03, R2-OPS-06, R2-OPS-09, R2-SYNC-01. Additionally, monetized launch requires the purchase flow (AUD-04), the award RPC (AUD-03), bounded reads (AUD-05/27/28), and monitoring (AUD-57/58, R2-OPS-03). The competitive window (iOS 27.3 Health redesign, public release expected December 2026) does not change these gates — launching blind, unbacked-up, and data-losing into that window is worse than launching late.

---

## 8. Architecture & scalability (summaries)

- **Architecture** (`05-architecture-review.md`): the layering is genuinely good — ASCNDBackend is the sole Supabase contact, ASCNDStore the sole GRDB contact, Core is protocol-bound and Linux-tested, feed hydration is batched, column lists are explicit almost everywhere. The single Supabase project is *the* SPOF; `AppServices` (1,766 lines) is the largest coupling surface; there is no API versioning story; business rules live in three places held together by drift guards that run in the legacy RN gate. Mermaid diagrams of the runtime, data, sync, and deploy topologies are in the architecture review.
- **Scalability & reliability** (`06-scalability-reliability.md`): comfortable at 1k/10k actives, degraded at 100k, not ready at 1M without search + index work — all estimates, no load test run or permitted. Reliability score is dragged down by the unverified recovery path, dead schedules, and zero error reporting. No sharding or migration is needed; the fixes are indexes + bounded reads + one RPC + operational controls.

---

## 9. Remediation priority (first 10, in order)

1. **Verify backups + run a restore drill; correct or evidence the 30-day privacy sentence** (AUD-01, R2-OPS-09) — S, owner dashboard access. Unblocks everything else.
2. **Decide #241 and stop silent outbox destruction; scope the delete to the departing user** (AUD-06, R2-SYNC-01, R2-API-08) — S–M, owner decision. Cheapest data-loss fix in the report.
3. **Fix the scheduled CI** (R2-OPS-01) — S, owner decision on default-branch strategy. Restores the "daily" system check and nightly E2E/a11y.
4. **Add manual error reporting** (R2-OPS-03) — M. Sync dead-letters, rebuild failures, AI/edge failures to Sentry; verify end-to-end before launch.
5. **Decide the reward trust boundary** (AUD-02, AUD-03, AUD-25, R2-ECO-01/13) — M, owner decision. Validate or formally accept; retire the orphaned `d:*:streak` namespace either way.
6. **Decide streak freezes: port the guard or disable the buy path** (AUD-14) — S–M.
7. **Create staging + deploy gate + rollback runbook** (AUD-07, R2-OPS-11) — M.
8. **Run the 20 production verification checks** (AUD-48 + extensions) — S, owner access. Closes the certainty gap for the whole report.
9. **Add the 25 missing FK indexes + wrap `auth.uid()` in InitPlan form** (AUD-10, R2-OPS-02) — S–M, batched with suite verification.
10. **Bound the unbounded reads + coalesce rebuilds** (AUD-05/27/28, AUD-50, R2-SYNC-04) — M. The largest client-driven DB amplification in the system.

Full roadmap with dependencies and acceptance criteria: `02-findings-register.md` (per finding) and `07-release-gate.md` (per gate).

---

## 10. Deliverables in this report set

1. `01-executive-report.md` — this file.
2. `02-findings-register.md` — all 88 revalidations + 42 new findings, each with evidence, test cases, acceptance criteria, severity, confidence, and release impact.
3. `03-test-plan.md` — all 167 test cases with truthful statuses, environments, and isolated alternatives for blocked cases.
4. `04-production-verification.md` — the §8 verification matrix (20 items, 0 verified) + per-check procedures.
5. `05-architecture-review.md` — architecture assessment with Mermaid diagrams.
6. `06-scalability-reliability.md` — scale tiers, reliability/DR, observability, and the detection matrix.
7. `07-release-gate.md` — beta and public-launch gates with pass/fail criteria.
8. `08-evidence-index.md` — every evidence citation indexed by finding, file, and test.

Working papers (per-domain evidence, full inventories, probe logs): `~/workspace/goals/ascnd-fitness-app/hidden_files/round2-work/` — `db-security.md`, `backend-auth.md`, `sync-ios.md`, `economy.md`, `perf-ops.md`.

---

## 11. No-modification statements (verified)

- **NO MODIFICATION — repository:** all five audit worktrees (`~/workspace/round2-wt/{db-security,backend-auth,sync-ios,economy,perf-ops}`) were verified at detached HEAD `b19e9822` with clean `git status` at the end of work; the shared `~/workspace/ascnd-review` worktree was never checked out or modified. No code, migration, config, secret, or CI file was changed.
- **NO MODIFICATION — production/Supabase:** no credentials existed and no Supabase dashboard, database, function, or storage object was accessed, written, deployed, or tested. No production writes, migrations, deploys, purchases, rewards, notifications, or load tests were performed.
- **NO MODIFICATION — secrets:** no secret value was read, printed, or stored. Secret-scan results report locations and counts only.

---

## 12. Limitations (read before relying on this report)

- **No Swift tests executed** (no toolchain on the audit VM). All Swift behavior claims rest on code reading; simulator/device behavior is asserted nowhere. Kiệt's per-commit simulator QA is the natural vehicle for the 39 NOT_EXECUTED and 23 SPECIFICATION_ONLY cases that need a Mac/simulator.
- **PostgreSQL behavior executed by 2 of 5 workers only.** Three workers had no PG binaries; their SQL behavior tests are BLOCKED with full executable specifications in the working papers. Where a verdict rests on unexecuted concurrency behavior (AUD-65, AUD-77), it is PARTIALLY_CONFIRMED or code-level, and says so.
- **Production state entirely unverified.** Live RLS, grants, function versions, Auth settings, plan/pooler/row-cap, backups, and telemetry liveness could all differ from the repo. The migration replay proves only that the repo chain is self-consistent.
- **Dependency vulnerabilities unscanned** (`npm audit` 403; no SPM tooling). Do not treat this domain as "scanned clean."
- **Scale numbers are estimates**, extrapolated from the team's own measurements. No load test was run or permitted.
- **Shallow-clone history limits** (AUD-44 removal commit unverifiable here).

---

*End of executive report.*
