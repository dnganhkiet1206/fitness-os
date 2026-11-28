# Report 12 — Owner Approval Queue

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: `native/ios-rewrite` @ `5e673df3` (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC).
Nothing in this queue was executed. Each item needs Kiệt's explicit approval before anyone acts on it. For each: reason, expected result, potential risks.

## A1 — Delete 28 proven-safe branches (after backup)
- **Reason:** W1 proved 28 branches contain no unique work (0 unique files or byte-identical to tip; all commits reachable elsewhere). Full table: Report 6 §6A (branch, SHA, evidence, PR refs).
- **Expected result:** Smaller branch list; no code or history lost (tips tagged/bundled first).
- **Risks:** Minimal — but a bundle/tag backup is mandatory before each deletion; one branch (`claude/main-cutover`) documents a join attempt in PR #723, so tag its join commit.
- **Approval needed:** Yes — delete list + backup method.

## A2 — Delete the 486-branch bulk merged set (after backup)
- **Reason:** 486 branches are fully contained in tip `5e673df3` (all changes merged). Precedent: 93 merged PRs already have no live head. Full list: Report 6 §6B.
- **Expected result:** Branch count drops from 549 to ~60; history preserved in the tip and in merge commits.
- **Risks:** Low but not zero at this scale — a single backup (bundle of all tips, or one archive tag per branch) is mandatory; a mistaken entry could destroy an unmerged fix that only looks merged. Recommend deleting in small batches with a re-check after each.
- **Approval needed:** Yes — bulk deletion + batching approach.

## A3 — Delete 14 superseded branches (only after owner word-diff check)
- **Reason:** W1 classifies 14 branches SUPERSEDED, but line-level survival of their changes was not verified (Report 6 §4.3, §8).
- **Expected result:** Same as A1/A2 for these 14, once confirmed.
- **Risks:** Medium — a superseded implementation may contain a line (a fix, a test, a doc) that the replacement dropped. Each needs a word-diff against its replacement before deletion.
- **Approval needed:** Yes — per-branch, after the word-diff is shown to Kiệt.

## A4 — Default branch: change `main` → `native/ios-rewrite` (or an alternative CI fix)
- **Reason:** Scheduled CI has 0 runs in full history because the default branch is `main`, which has no `.github/`; the system-check bot's schedule never fires (R2-OPS-01/L-7, SEC-17). This is the root cause of the dead safety net.
- **Expected result:** Scheduled workflows execute; the safety net works.
- **Risks:** Repo-wide: PR targets, CI triggers, any external integration pointing at `main`, and the old Lovable deploy (if any) all key off the default branch. **Do NOT change unilaterally** — Kiệt must decide the target branch and the migration order. Alternative (keep `main` default, move scheduled workflows) is acceptable if Kiệt prefers it.
- **Approval needed:** Yes — explicit branch choice + migration plan.

## A5 — Deploy: dedupe migration #1012 + 3 Edge Functions (`verify-purchase`, `store-webhook`, `admin-art`)
- **Reason:** Migration `20261124120000` merged but not deployed; the 3 functions are 404 on live probe 2026-11-28, cutting the purchase path and admin-art upload (SEC-16, P0-02/P1-06).
- **Expected result:** Purchase path works end-to-end (sandbox first); dedupe indexes live.
- **Risks:** Production deploy — migration touches indexes; function deploy needs Apple env + ASC products set first. Rollback: keep the previous function versions; migration is index-only (low risk).
- **Approval needed:** Yes — deploy + Apple secrets/products.

## A6 — RLS / policy / RPC changes (SEC-01–05, SEC-07, SEC-08, SEC-14)
- **Reason:** Server-side validation for reward keys, achievements, challenge claims, rank gates, readiness aggregates; scoping of `dm_can_message` / `community_blocked_between`; owner check on `body_checks.photo_id`; bounds on `dm_send` JSONB.
- **Expected result:** The 5 HIGH trust defects close; oracles close.
- **Risks:** Economy behavior changes — existing forged rows (if any) need an audit first; challenge/rank rules change user-visible outcomes. Migrations must be reviewed line by line.
- **Approval needed:** Yes — per-change, with the migration SQL shown before apply. Alternative (formal risk acceptance) also needs Kiệt's explicit record.

## A7 — Correct the shipped 30-day backup privacy claim (D-23 / AUD-01)
- **Reason:** App privacy text asserts 30-day backups while `pitr_enabled: false`. Either enable PITR or correct the text — the false claim must not stay shipped.
- **Expected result:** Public claims match reality.
- **Risks:** If PITR is enabled, cost + a restore drill are needed; if the text is corrected, users see a weaker claim. Both are better than a false claim.
- **Approval needed:** Yes — which path (enable PITR vs correct text).

## A8 — Reward-trust: fix vs formal risk acceptance (B-3 / L-2)
- **Reason:** The 5 HIGH trust defects (A6) can be fixed (P0-03) or formally accepted. Leaving them implicit is the worst option.
- **Expected result:** A recorded decision with scope + review date, either way.
- **Risks:** Acceptance leaves the economy forgeable; fixing costs a migration cycle and an economy audit.
- **Approval needed:** Yes — fix or accept, in writing.

## A9 — Mascot system: Option A / B / C (pending since 21/11)
- **Reason:** The mascot-system research (10 docs, branch `agent/c/koa-mascot-system`, #527 comment 7069678295) recommends Option B; Kiệt has not chosen. Claude's independent review is also still pending via #527.
- **Expected result:** A chosen option + Phase 0 decisions, unblocking 50–100 consistent Koa poses.
- **Risks:** Choosing wrong costs rework across poses/wardrobe (70 wardrobe items are drawn for one-segment limbs). Option B's biggest unknown is wardrobe rework scope.
- **Approval needed:** Yes — option choice + Phase 0 decisions.

## A10 — Code removals (legacy RN files, dead code, stale headers)
- **Reason:** RN duplication (`readiness-engine.ts`, `session-load.ts`, `koa-*.ts`), dead code flagged in audits, stale `CHƯA DEPLOY` headers on Koa-pause migrations.
- **Expected result:** Smaller, less confusing tree.
- **Risks:** RN is kept deliberately (frozen reference); a removal could delete the only copy of a behavior or a test fixture. Each removal needs a file list + a grep proving zero callers.
- **Approval needed:** Yes — per file/batch, with the zero-caller evidence.

## A11 — CI/workflow changes (scheduled CI, branch protection, CodeQL replacement)
- **Reason:** Scheduled CI dead (A4), no branch protection (P0-06), CodeQL removed 11/04 with no SAST replacement, E2E label gate skipping everything, `swiftlint`/`periphery` effectively advisory.
- **Expected result:** CI that actually runs, gates that actually gate.
- **Risks:** Required checks can block merges if flaky; a new SAST adds pipeline time. Changes must be validated on a test PR first.
- **Approval needed:** Yes — workflow edits + required-check set.

## A12 — Documentation updates (banners/addenda, ADR-04)
- **Reason:** 23 doc-vs-code discrepancies (Report 7): root AGENTS.md still points at dropped RN (D-01); no ADR-04 for the 17/11 directive (D-02); MIGRATION_STATUS/parity docs need superseded/historical banners (D-04/D-05); R1+R2 reports are workspace-only (D-21).
- **Expected result:** Docs match reality; history preserved (banners/addenda, never deletions or rewrites of historical docs).
- **Risks:** Minimal — wording changes only; AGENTS.md wording needs Kiệt's sign-off since agents follow it.
- **Approval needed:** Yes — wording for AGENTS.md + ADR-04; banners can proceed once approved.

## A13 — Recovery triage: 7 RECOVERY_REQUIRED branches
- **Reason:** 7 branches hold substantive unique work needing a decision: bench/curl finalize (#895/#896 deferred), append/pr golden vectors (#358/#360 — files absent from tip), progress mocks, PRODUCT.md docs. Full detail: Report 6 §4.2.
- **Expected result:** Each branch is recovered (cherry-picked/merged), explicitly deferred with a reason, or documented as abandoned.
- **Risks:** Ignoring them loses finished work; recovering blindly reintroduces deferred/failed work (bench/curl were deferred for a reason).
- **Approval needed:** Yes — per-branch disposition (recover / defer / abandon).

## Standing items still awaiting Kiệt (from prior missions, unchanged)
- **A7 (17/11 #527 list):** outbox park retention limit (14d vs 30d, delete vs dead-letter).
- **A2 (17/11):** what Plus/Max unlock.
- **A3 (17/11):** community placement (own tab vs inside Progress) + admin location.
- **A4 (17/11):** AI workout/meal-plan flow design.
- **A5 (15/11):** `implement_clash` — drill real holes in plates vs exempt bar–plate pairs (432 overlapping triangle pairs at frame 0).
- **A6:** "Medium Grip" library-name migration.
- **Readiness plan (I4, 17/11):** the detailed 5-step plan still awaits Kiệt's approval/edit.
- **Koa face (22/11):** code-drawn reference — mouth (solid D vs thin smile) + blush (wide flat vs small round) choice still pending; push + #527 post only after approval.
- **Video #2 pick** (shortlist 14/10): MIRROR / BOWFLEX / F45 / SOULCYCLE — no re-pitch, listed for completeness.
