# Report 11 — Prioritized Remediation Roadmap

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: `native/ios-rewrite` @ `5e673df3` (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC).
Nothing in this roadmap was implemented — every item is a proposal for Kiệt's approval (see Report 12). Finding IDs trace to Report 5 (SEC-xx), Report 9 / R1–R2 (AUD-xx, R2-xxx), Koa audit (K-xx), and worker files in `working/`.

## P0 — Critical (security, data integrity, or production risks — do first)

### P0-01 — Backups/PITR: verify or correct the public claim
- **Finding:** AUD-01 / B-1 / L-1 / L-10 / D-23. `pitr_enabled: false, backups: []` (record 12/11, no newer evidence) vs shipped privacy text asserting 30-day backups.
- **Action:** Owner decision first: either enable + verify PITR/backups (dashboard: backup settings, restore test on a non-production copy) or correct the privacy sentence in-app and in the store listing. Do not leave the false claim shipped.
- **Systems:** Supabase dashboard (owner access required). **Dependencies:** Kiệt's decision; dashboard access. **Risk of implementation:** Low (config + text). **Complexity:** Low. **Verification:** dashboard screenshot/record of PITR enabled + a restore drill; privacy text grep shows no 30-day claim unless true.

### P0-02 — Deploy the purchase path: 3 Edge Functions + Apple env + ASC products
- **Finding:** SEC-16 / AUD-04. Client StoreKit 2 + paywall merged (#920, 2026-11-20) but `verify-purchase`, `store-webhook`, `admin-art` still 404 on fresh probe 2026-11-28. Product IDs empty in `Backend.xcconfig`.
- **Action:** Deploy the 3 functions; set `ASCND_PRODUCT_ID_PLUS`/`MAX` + 4 Apple secrets; create Plus/Max products in App Store Connect; decide what Plus/Max unlock (owner decision A2, pending since 17/11); run the `verify-purchase` induced-DB-error staging test (B-6).
- **Systems:** Supabase deploy, App Store Connect, `Backend.xcconfig`. **Dependencies:** Apple Developer Program ($99/yr if not held); Kiệt's Plus/Max decision. **Risk:** Medium (money path — test in sandbox first). **Complexity:** Medium. **Verification:** live probe returns 401 (not 404) for all three; sandbox purchase completes end-to-end and tier flips via `current_tier()`.

### P0-03 — Close the reward-trust defects, or formally accept the risk
- **Finding:** SEC-01–05 / AUD-02 / AUD-03 / B-3 / L-2. Invented reward keys mint 800 coins + 800 XP/day; self-granted achievements; challenge claims on client-authored rows; rank gates bypassable by direct RPC; client-computed readiness consumed as AI ground truth.
- **Action:** Server-side validation for reward keys, achievement grants, challenge claims (deadline + membership window), rank-gated purchases, and readiness aggregates (recompute or sign server-side). If Kiệt accepts the risk instead, record the acceptance explicitly with scope + review date — do not leave it implicit.
- **Systems:** `supabase/migrations/*`, Edge Functions, `apps/ios` (client assertions). **Dependencies:** P0-02 deploy pipeline (same functions); Kiệt's accept-or-fix decision. **Risk:** Medium (migration + RPC changes touch the economy). **Complexity:** High. **Verification:** attempt each exploit from the SEC finding's attack scenario against staging; all fail; existing economy data audited for forged rows.

### P0-04 — Dashboard verification sprint (one session, owner access)
- **Finding:** W3 §10 checklist. Most urgent single item: which migration is live — `20261117070000` (introduced `community_my_reports` report-excerpt oracle) vs `20261117170000` (fixed it same day). Also: applied migration list, function versions, secrets, providers, backup/PITR, storage policies, logs.
- **Action:** Kiệt (or an agent with dashboard access) runs the 6 SQL queries + 12 dashboard checks in Report 4 §10 and records results. Nothing here needs code.
- **Systems:** Supabase dashboard. **Dependencies:** dashboard access. **Risk:** None (read-only). **Complexity:** Low. **Verification:** written record of live migration list + function versions, filed under `docs/audits/`.

### P0-05 — Fix scheduled CI (default-branch decision)
- **Finding:** R2-OPS-01 / L-7. Scheduled CI 0 runs in full history; default branch still `main`, which has no `.github/`; the system-check bot's schedule never fires, so security regressions go undetected (SEC-17).
- **Action:** Owner decision: change default branch to `native/ios-rewrite` (with CI references updated) or move the scheduled workflows to run from `main`. Do NOT change the default branch unilaterally — it is a repo-wide decision (Report 12 A4).
- **Systems:** GitHub repo settings, `.github/workflows/`. **Dependencies:** Kiệt's decision. **Risk:** Medium (affects all CI triggers). **Complexity:** Low. **Verification:** a scheduled run executes and appears in Actions history within 24h of the change.

### P0-06 — Branch protection on `native/ios-rewrite` (and `main`)
- **Finding:** W1 §1 + W5 §2. No branch protection or rulesets on either branch; no enforced required checks; CI green is advisory only.
- **Action:** Require PR + green `gate`/`check` on the exact head before merge (matching the existing merge discipline: merge commit, no squash, no force-push); block force-pushes and direct pushes to `native/ios-rewrite`.
- **Systems:** GitHub repo settings. **Dependencies:** P0-05 (CI must actually run for required checks to be meaningful). **Risk:** Low. **Complexity:** Low. **Verification:** a test PR cannot merge with a red check; direct push to the branch is rejected.

## P1 — High (reliability, security, or release blockers)

### P1-01 — Account deletion: require re-authentication (SEC-06 / AUD-21)
Delete-without-re-auth + recovery-link chain. Add step-up auth before `delete-account` executes; re-check the recovery-link session scope. Medium complexity; verify by attempting deletion with a recovery-link-only session.

### P1-02 — Close the two relationship oracles (SEC-07)
`dm_can_message` and `community_blocked_between` answer about arbitrary user pairs. Scope both RPCs to the caller. Medium complexity; verify by querying about a third-party pair as an unprivileged caller.

### P1-03 — `verify_jwt=false` backstop: refresh the CI guard (SEC-10)
All 12 Edge Functions run with `verify_jwt = false`; the CI guard that backstops it is now stale. Re-verify the guard covers all current functions, or move auth into the gateway. Low–medium complexity.

### P1-04 — Apple-revoke token binding (SEC-13)
`delete-account` Apple-revoke preamble accepts caller-supplied token material with no binding to the caller's Apple identity. Bind the token to the authenticated Apple identity (or drop the preamble path). Medium complexity; verify by submitting another user's token material.

### P1-05 — Repair the E2E gate (W5 §2.3)
Last 100 E2E runs 100% skipped (label gate); last executed run 11-18 all failed; last success 11-09. Fix the label gate + the 11-18 failures; make E2E a required check once green. Medium complexity.

### P1-06 — Deploy the dedupe migration #1012 (merged, not deployed)
`20261124120000_dedupe_indexes_pin_search_path.sql` (15 duplicate indexes dropped, search_path pinned on 2 triggers). Deploy + verify via migration list. Low complexity; depends on P0-04's deploy pipeline.

### P1-07 — Prove error reporting is alive (R2-OPS-03 / AUD-58)
Sentry/PostHog keys exist in CI; sync-incident captures exist in code; liveness UNVERIFIED. Trigger a test event from a release build and confirm it lands in the dashboard. Low complexity; needs a Mac/release build.

### P1-08 — Motion Kit CI: cover all 8 exercises + USDZ hash check (W5 §5)
`validate` covers only 2/8 exercises; bench excluded; no USDZ hash check between kit output and app bundle. Extend coverage; add the hash check. Medium complexity.

### P1-09 — K-25: composed feedback vocabulary for chat/celebrations
The single still-open Koa finding (no PR). Small, well-scoped; assign an owner. Low complexity.

### P1-10 — Doc hygiene (no deletions — banners/addenda only)
D-01 root AGENTS.md still directs agents to dropped RN; D-02 ADR-04 for the 17/11 directive; D-03 ADR-0003 amendment; D-04 MIGRATION_STATUS superseded banner; D-05 parity HISTORICAL banners; D-21 commit R1+R2 reports under `docs/audits/`. Low complexity; needs Kiệt's wording sign-off for AGENTS.md.

## P2 — Medium (architecture, testing, maintainability, performance)

- **P2-01** — `AppServices.swift` decomposition (2.084 lines, 68 factories): split by domain behind the same facade; keep the single choke point. High complexity; verify by no behavior change + CI green.
- **P2-02** — Edge Function test coverage: 10/12 functions have zero Deno tests; add tests per function, starting with `ai-coach`, `verify-purchase`, `delete-account`. Medium complexity.
- **P2-03** — AI quota idempotency + refunds (SEC-19/20/22): malformed JSON burns quota; provider failures consume quota; `spend_ai_tokens` drops records at UTC-midnight boundary. Medium complexity.
- **P2-04** — RLS hardening batch: `body_checks.photo_id` owner check (SEC-08), `dm_send` unbounded JSONB (SEC-14), `community_profiles` SELECT `USING (true)` follow-graph enumeration (SEC-28), posting/report/DM rate-limit atomicity (SEC-32). Medium complexity.
- **P2-05** — Pin `supabase-js@2` in Edge Functions (SEC-11) + upgrade `supabase-swift` 2.55.4 → 2.55.7 (SEC-25). Low complexity.
- **P2-06** — Wire the 2 JS test files + SQL perf scripts into CI; replace removed CodeQL with a SAST (SEC-17, W5 §6). Low–medium complexity.
- **P2-07** — Fix the system-check wait loop (no retry; run 45092658941 died on a GitHub API timeout, skipping its report). Low complexity.
- **P2-08** — HealthKit 30-day permission handling: use `getEarliestAuthorizedSampleDate` (from #918) + B7 migration for the `limitedHistory` column; readiness/streak must not silently miscompute on limited history. Medium complexity; needs Xcode 27 + iOS 27 device test (A1, pending since 17/11).
- **P2-09** — Readiness upgrades (night HRV, respiratory rate, cardio load, sleep regularity) before Apple Health 27.3 ships early December — the plan from 17/11 (I4) is still waiting on Kiệt's approval. High complexity; needs the plan-first approval.
- **P2-10** — Competitor P1 items from C10 (adaptive plan generator, grounded coach, AI meal plan, Koa-in-work, social groups, recap) — only after P0/P1 above.

## P3 — Low (optimization, non-critical debt)

- **P3-01** — Execute approved branch cleanup (Report 12 A1–A3) after backup + approval.
- **P3-02** — INFO findings SEC-27–36 (follow-graph enumeration docs, ATS/pinning note, GRDB at-rest note, CORS `*`, barcode IP disclosure, App Group data scope). Document-or-fix each; none blocks launch.
- **P3-03** — Fix the three still-open traps in code at tip: `ai-coach/context.ts:45` compares `"lb"` vs stored `"lbs"`; `KoaGains.swift:8` claims gains "cannot be forged"; `edge-auth.mjs` still checks `claimCall(`; Koa-pause migrations still carry stale `CHƯA DEPLOY` headers (W6 §4.1/§4.2).
- **P3-04** — Competitor P2/P3 items from C10 (depth, polish, investigate/defer: realtime, camera form check, paywall experiments).
- **P3-05** — Commit R1+R2 audit reports under `docs/audits/` (D-21) so history is discoverable in-repo, not workspace-only.
