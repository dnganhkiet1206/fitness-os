# ASCND Round 2 — Release Gate

Tip: `native/ios-rewrite` @ `b19e9822`. This gate is the release decision record. Every criterion is pass/fail with named evidence. **A criterion passes only on the stated evidence — never on assertion, and never on repo code alone for production state.**

## 1. Gate summary

| Gate | Verdict |
|---|---|
| Limited closed beta (test accounts, disclosed risks) | **CONDITIONAL GO** — only after B-1..B-6 pass, or with explicit written acceptance of each failing criterion by Kiệt |
| External beta (real users, real workout data) | **NO-GO** — B-4 (#241) is the sharpest blocker: involuntary session loss destroys unsynced records with no warning |
| Public launch (free, no monetization) | **NO-GO** — 11 launch-blocking items open |
| Public launch (monetized) | **NO-GO** — additionally requires the purchase flow (AUD-04), award RPC (AUD-03), bounded reads, and monitoring |

## 2. Beta gate (B-1..B-6) — all must pass

| # | Criterion | Finding | Pass evidence | Status at tip |
|---|---|---|---|---|
| B-1 | Backups verified + restore drill recorded | AUD-01 | Dashboard backup/PITR evidence + throwaway-project restore record + RPO/RTO doc | **FAIL** — NOT_VERIFIED, no access |
| B-2 | Streak freezes fixed or unsold (decision + implementation) | AUD-14 | Guard ported + simulator-tested, OR buy path disabled (RPC gated + dead controller removed) | **FAIL** — open; buy unreachable via UI but RPC live, spend absent |
| B-3 | Reward keys validated or formally accepted as residual risk | AUD-02 | Invented-key RPC calls refused (suite test), OR signed-off residual-risk note in `CONSTRAINTS_AND_DEFERRED.md` | **FAIL** — 800/day forgeable, no decision recorded |
| B-4 | #241 decided; sign-out queue preserved or warn + sync-first | AUD-06 | Offline workout survives sign-out + sign-in and syncs, OR UI blocks sign-out until synced with explicit consent; involuntary session ends covered | **FAIL** — decision pending; destruction on every session end |
| B-5 | AUD-48 live checks run and recorded | AUD-48 | Written record for all 20 items in `04-production-verification.md` (or explicit per-item deferrals) | **FAIL** — 0 of 20 verified |
| B-6 | `verify-purchase` fail-open fixed | AUD-47 | `!ent` branch checks upsert error → 500; staging test with induced DB error | **FAIL** — open (mitigated: no caller, NOT_DEPLOYED_BY_DESIGN) |

Beta with real users' data before B-4 is the sharpest risk in this gate. If a test-account-only beta proceeds before B-1..B-6, the data-loss paths (AUD-06, R2-SYNC-01) and the unverified recovery path (AUD-01) must be explicitly disclosed to testers in writing.

## 3. Public launch gate (L-1..L-11) — all must pass

| # | Criterion | Finding | Pass evidence | Status at tip |
|---|---|---|---|---|
| L-1 | Verified recovery path (backups + drill + runbook) | AUD-01 | Same as B-1, plus backup status in the system-check bot | **FAIL** |
| L-2 | Reward trust boundary decided + implemented (or formally accepted) | AUD-02 | Same as B-3, plus `d:*:streak` namespace retired or restored (R2-ECO-13) | **FAIL** |
| L-3 | Purchase flow shippable end-to-end (monetized launch only; for free launch, explicit decision to launch without monetization) | AUD-04 | StoreKit flow + paywall + restore + `appAccountToken`; sandbox E2E (T-PUR-01..06) green; functions deployed, `APPLE_ENV=production` | **FAIL** — no client half exists |
| L-4 | Sign-out data loss resolved | AUD-06 | Same as B-4 | **FAIL** |
| L-5 | Staging + deploy gate + rollback procedure | AUD-07 | Staging project; deploy + smoke-test flow; rollback doc naming the decision-maker | **FAIL** |
| L-6 | Streak freezes decided + implemented | AUD-14 | Same as B-2 | **FAIL** |
| L-7 | Scheduled CI runs on cadence | R2-OPS-01 | 7 consecutive days of scheduled `system-check` + nightly E2E/a11y runs in Actions history | **FAIL** — schedules dead; `main` has no workflows |
| L-8 | Error reporting live + verified | R2-OPS-03 | Synthetic sync failure → Sentry event <5 min; synthetic AI timeout → classified event; detection matrix has no "no" for sync/AI/DB/latency; no PII in payloads | **FAIL** — zero manual reporting |
| L-9 | Release process automated + verified | R2-OPS-06 | CI Release build from tagged commit; key-presence gate; dSYM verified in Sentry; rollout/rollback doc with % + halt criteria + owner | **FAIL** — manual, single-machine, silent failure modes |
| L-10 | Privacy text matches operational reality | R2-OPS-09 | Dashboard backup evidence + legal text diff; AUD-01 updated with the same evidence | **FAIL** — claim unevidenced |
| L-11 | Cross-account outbox delete scoped | R2-SYNC-01 | `dropAllOnSignOut` scoped to the departing user (or drop removed per #241); interleaved-switch regression test green | **FAIL** — unscoped delete |

## 4. Launch-adjacent (must be fixed or explicitly accepted before launch)

| # | Item | Finding | Accept / fix evidence |
|---|---|---|---|
| A-1 | Award granting behind a server RPC | AUD-03 | Direct INSERT refused; honest grants flow; suite covers it — or written acceptance that badges are forgeable |
| A-2 | Bounded reads (exercises, followees, ledger) | AUD-05/27/28 | Paging/limits + loud cap failure — or written acceptance with the live row cap confirmed |
| A-3 | Monitoring + alerting + telemetry liveness | AUD-57/58, AUD-33 | Alerts fire on synthetic slow query/error; Sentry shows release-build events — or written acceptance of complaint-driven detection (not recommended) |
| A-4 | Account deletion re-auth | AUD-21 + R2-API-10 | Step-up or typed confirmation + recovery-link rotation decision — or written acceptance |
| A-5 | Timeout mismatch (AI calls) | R2-OPS-04 | Dedicated AI timeout policy + distinct failure classification — or written acceptance with the 25 s/45 s overlap documented |
| A-6 | Deno test job in CI | R2-OPS-07 | `deno test` job green on functions-only PRs — or written acceptance |
| A-7 | FK indexes + initplan wrapping scheduled | AUD-10, R2-OPS-02 | Migrations landed with suite verification, or a dated pre-100k plan recorded |
| A-8 | Search indexes + one-fold scheduled | AUD-09 | Same — dated pre-100k plan minimum |
| A-9 | Rebuild coalescing | AUD-50 + R2-SYNC-04 | Coalesced drain counts measured, or dated plan |
| A-10 | Rollback runbook | R2-OPS-11 (with L-5) | Runbook exists naming procedure + decider + freeze criteria |

## 5. Explicit non-gates (do not block launch; roadmap items)

AUD-08 (relational sets — L effort, versioned migration), AUD-11/61 (dead surface cleanup), AUD-15 (definer-surface hardening, ongoing), AUD-18 (identity consolidation), AUD-24 (rule consolidation), AUD-29/62 (conflict UX + resend path — product decisions), AUD-30/31 (retention + audit trail), AUD-52 (anchored queries), AUD-56 (background drain), AUD-59 (Realtime — product decision), AUD-60 (scheduling — product decision), AUD-63 (cache TTL), R2-SYNC-02/03/05/06/07/08/09, R2-ECO-02..12, R2-API-01/02/03/05/06/07/08/09/10 (P2/P3 hardening — fix on the roadmap; R2-API-01/02/03 before monetized/AI-heavy launch is recommended but not gated), R2-OPS-02/04/07/08/10/11 (see A-5..A-10 where launch-adjacent). AUD-38 is closed as NOT_REPRODUCIBLE (P3 hygiene only).

## 6. Gate rules

1. **Evidence, not assertion.** A criterion passes only on the named evidence, filed where the team can re-check it (repo, bot output, or dashboard export without secrets).
2. **No silent acceptance.** Any launch-adjacent item accepted without a fix needs a dated, written acceptance by Kiệt naming the residual risk. "We'll fix it later" without a date is not acceptance.
3. **Re-gate on change.** Any production deploy, migration, or function change after the gate passes requires re-verification of L-1, L-7, L-8, and the affected criteria.
4. **The competitive window does not waive the gate.** iOS 27.3's Health redesign (public release expected December 2026) compresses the schedule; it does not make launching blind, unbacked-up, and data-losing acceptable.
5. **Beta ≠ launch.** Passing the beta gate does not imply launch readiness. The launch gate is strictly harder.

## 7. Decision log

| Date | Decision | Decided by | Evidence |
|---|---|---|---|
| 2026-11-12 | Beta: NO-GO (conditional). Public launch: NO-GO. | Round 2 audit (coordinator) | This report set; 0 of 6 beta criteria pass; 0 of 11 launch criteria pass |
| — | #241 (outbox discard on sign-out) | **PENDING — Kiệt** | Still cited as pending in all four code comments at tip |
| — | Reward trust boundary (validate vs accept) | **PENDING — Kiệt** | No decision recorded in repo |
| — | Streak freezes (port guard vs disable buy) | **PENDING — Kiệt** | No decision recorded in repo |
| — | Default-branch strategy for scheduled CI | **PENDING — Kiệt** | Do not change unilaterally (R2-OPS-01) |
| — | Realtime (build vs fetch-on-demand contract) | **PENDING — Kiệt** | AUD-59 |
| — | Admin/moderation UI vs revoke grants | **PENDING — Kiệt** | AUD-61 |

*End of release gate.*
