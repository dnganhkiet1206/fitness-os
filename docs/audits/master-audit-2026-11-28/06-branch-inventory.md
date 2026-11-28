# Report 6 — Complete Branch Inventory

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w1-branch-inventory.md (worker W1). 549 branches confirmed via full API pagination (pages 1–6, page 7 empty), cross-checked identical against `git ls-remote --heads`. NO branches were deleted; the deletion proposal in §6 requires Kiệt's explicit approval.

# W1 — Repo Identity + Full Branch Inventory

**Mission:** ASCND master technical audit, 2026-11-28 (read-only). **Worker:** W1.
**Repo:** `dnganhkiet1206/fitness-os` (PUBLIC). **Official app branch:** `native/ios-rewrite`.
**Tip at mission start (verified):** `5e673df3f3614ee5d4070a4177e4adad767c1af9` — 2026-11-24 11:28:39 -0600,
“Merge pull request #1013 from dnganhkiet1206/claude/no-rest-after-last-set”.
**Audit date:** 2026-11-28 ~00:30–07:00 CST (fetch 2026-11-28 06:29 UTC). `gh` auth as `dnganhkiet1206`.
**Method:** `gh api …/branches?per_page=100&page=N` pages 1–6 (100/100/100/100/100/49, page 7 empty) cross-checked
against `git ls-remote --heads origin` — **identical sets, 549 branches**. Per-branch ahead/behind, SHA, tip date,
unique-commit subjects and unique-file lists computed locally in a fresh `--filter=blob:none --no-checkout` clone
(`/tmp/w1-clone`, discarded scratch; the shared clone `~/workspace/ascnd-review` was NOT modified — its fetch refspec
only covers `agent/c/*`, `claude/ios-fitness-rebuild-omgulr` and `native/ios-rewrite`, so it could NOT be used for the
full inventory). PR state joined from a full paginated pull of all 615 PRs (`state=all`, pages 1–7, 100/100/100/100/100/100/15).
For every ahead>0 branch, each unique file was additionally compared blob-by-blob against the native tip
(`git rev-parse <ref>:<path>`, existence checked with `cat-file -e` — an earlier naive `rev-parse` pass was discarded
because `rev-parse` echoes a missing `<rev>:<path>` spec to stdout). No code, branch, PR or issue was changed.

## 1. Repository identity — VERIFIED

| Field | Value | Source |
|---|---|---|
| Full name | `dnganhkiet1206/fitness-os` | `gh api repos/dnganhkiet1206/fitness-os` |
| Repo ID | `1156734344` | same |
| Visibility | **public**, not a fork, not archived, not disabled | same |
| Created | 2026-02-13T01:43:44Z | same |
| Default branch | **`main`** (old Lovable web app — NOT the app branch) | same |
| Size (GitHub) | 1,438,723 KB (~1.37 GiB) | same |
| Last push (repo) | 2026-11-24T22:47:35Z | same |
| Tags | **0** | `…/tags?per_page=100` |
| Releases | **0** | `…/releases?per_page=100` |
| Submodules | **none** (`git ls-tree -r origin/native/ios-rewrite` has no `commit` entries) | local git |
| Branch protection, `main` | **NONE** — API returns 404 “Branch not protected” | `…/branches/main/protection` |
| Branch protection, `native/ios-rewrite` | **NONE** — API returns 404 “Branch not protected” | `…/branches/native/ios-rewrite/protection` |
| Rulesets | none | `…/rulesets` (empty) |
| Environments | none | `…/environments` (empty) |
| Deployments | none returned | `…/deployments?per_page=100` (empty) |
| Native tip files | 4,077 files (`apps` 2,036; `native` 986; `artifacts` 523; `supabase` 187; `.claude` 149; `marketing` 70; `docs` 51; `spec` 45; `.agents` 14; `.github` 11; root files 5) | `git ls-tree -r origin/native/ios-rewrite` |
| Main tip files | 217 files (old web app) | `git ls-tree -r origin/main` |

### 1.1 GitHub Actions workflows (9 listed by API)

| Workflow file | Name | State | Exists on `native/ios-rewrite` tip? | Exists on `main` tip? |
|---|---|---|---|---|
| `.github/workflows/codeql.yml` | CodeQL | active | **NO — file absent** | **NO — file absent** |
| `.github/workflows/ios-a11y.yml` | iOS A11y audit | active | yes | no (main has no `.github/workflows/` at all) |
| `.github/workflows/ios-analysis.yml` | iOS phân tích | active | yes | no |
| `.github/workflows/ios-e2e.yml` | iOS E2E | active | yes | no |
| `.github/workflows/ios.yml` | iOS | active | yes | no |
| `.github/workflows/motion-kit.yml` | Motion Kit | active | yes | no |
| `.github/workflows/quality-gate.yml` | Cổng chất lượng | active | yes | no |
| `.github/workflows/sql-community.yml` | Test SQL Cộng đồng | active | yes | no |
| `.github/workflows/system-check.yml` | Bot kiểm hệ thống | active | yes | no |

**Finding (CONFIRMED):** `codeql.yml` is an orphaned Actions listing — the file exists on NEITHER current tip
(`gh api …/contents/.github/workflows/codeql.yml?ref=main` and `?ref=native/ios-rewrite` both 404;
`git show origin/native/ios-rewrite:.github/workflows/codeql.yml` = “does not exist”). It presumably survives from an
older default-branch state. No workflow run can be using it from a current tip.

**Finding (CONFIRMED):** CI references `main` and broad branch patterns — it does NOT reference individual feature
branches by name. Push triggers on the native tip:
- `ios.yml`: `push.branches: ['native/**', main]`, paths `apps/ios/**`, `spec/vectors/**`.
- `quality-gate.yml`: `push.branches: ['claude/**', 'native/**', main]`, all PRs.
- `sql-community.yml`: `push.branches: ['claude/**', 'native/**', main]`, paths `supabase/**`.
- `motion-kit.yml`: `push.branches: ['claude/**', 'agent/**', 'native/**', main]`, paths `artifacts/exercise-visual-system/**`, `docs/exercise-visual-system/**`, `apps/ios/ASCND/Resources/ExerciseDemos/**`.
- `ios-analysis.yml`: `push.branches: ['native/ios-rewrite']` (Swift paths) + PRs.
- `system-check.yml`: `push.branches: ['native/ios-rewrite']` + schedule.
- `ios-a11y.yml` / `ios-e2e.yml`: schedule + `workflow_dispatch` + PRs with labels.
Deleting any `claude/*`, `agent/*` or feature branch therefore breaks NO workflow trigger (patterns still match the
remaining branches); only `main` and `native/ios-rewrite` are named, and neither is proposed for deletion.

**Finding (STRONGLY SUSPECTED — needs CI-owner confirmation):** four workflow files state that GitHub reads
`schedule` and `workflow_dispatch` definitions ONLY from the DEFAULT branch (`main`) — `ios-a11y.yml` (cron 04:15 UTC),
`ios-e2e.yml` (03:30 UTC), `ios-analysis.yml` (weekly Mon 02:00 UTC), `system-check.yml` (01:00 UTC) all carry this note
in their headers. `main` currently contains NO `.github/workflows/` directory at all (API 404), so the scheduled runs
have no definition to read from the default branch. The nightly E2E/A11y/system-check schedules are therefore
plausibly NOT running as documented. This is out of W1 scope to verify (no Actions-run inspection was in the brief),
flagged for the CI worker / Kiệt: either sync the workflow files to `main` or switch the default branch to
`native/ios-rewrite`.

## 2. Branch inventory — summary

- **Total branches: 549** (API pages 1–6 + empty page 7; `git ls-remote --heads` identical).
- By prefix: `claude/*` 350 · `agent/*` 188 (`agent/c` 84, `agent/a` 67, `agent/d` 37) · `devin/*` 3 · `fix/*` 2 ·
  `cursor/*` 2 · `landing/*` 1 · `worktree-lexical-noodling-finch` 1 · `main` 1 · `native/ios-rewrite` 1.
- Tip-date spread: 2026-10: 327 branches · 2026-11: 214 · 2026-08: 4 · 2026-03: 3 · 2026-07: 1.
- **Ahead/behind vs `native/ios-rewrite` (tip `5e673df3`):** ahead==0 (fully contained in tip): **513** · ahead 1–5: 27 ·
  ahead 6–14: 9 · ahead >14: 0. Max ahead is 14 commits (`landing/dark-premium-scroll-story`). Only 2 branches contain
  the tip (`behind==0`): `native/ios-rewrite` itself and `claude/light-week-summary-chip` (open PR #1014, 4 ahead).
- **PRs (all 615, `state=all`):** open **2** · merged **581** · closed-unmerged **32**. Base `native/ios-rewrite`: 591 ·
  base `main`: 6 · other bases (stacked chains): 18. Distinct PR head refs: 614; **521 live branches have ≥1 PR;**
  28 branches never had a PR; 93 PRs come from heads that no longer exist as branches — and all 93 were MERGED,
  i.e. merged branches have already been deleted in the past (precedent for the deletion proposal in §6).
- **Duplicate tip:** `agent/a/a40-workout-fence` and `claude/b-handoff-s0gs64` share tip SHA `d42d22b`
  (B handoff merged `a40` into itself).

### 2.1 Classification — counts and definitions used

Definitions (mission §4.2/§4.3 as briefed to W1): a branch is `STALE_SAFE_TO_DELETE` ONLY if ALL valuable changes are
integrated or explicitly unnecessary, no unique feature/fix/test/migration/doc remains, no open PR/issue/workflow/deployment
depends on it, and no active agent uses it. `MERGED` = ahead==0 with a merged PR (all commits reachable from the tip).
`SUPERSEDED` = the work was replaced by another branch / later evolution / an explicit decision (web/RN drop, revert).
`RECOVERY_REQUIRED` = substantive unique work not in the tip and no decision recorded. `UNCERTAIN` = evidence is insufficient
to place it in any other class without a code-level (word-diff) check.

| Classification | Count | Meaning in this report |
|---|---|---|
| PRIMARY | 3 | `native/ios-rewrite` (app), `main` (default branch), `claude/ios-fitness-rebuild-omgulr` (frozen forensic baseline `fac9ac2`). KEEP, never delete. |
| ACTIVE | 7 | Open PR or recent unmerged work with a pending decision/owner. KEEP. |
| MERGED | 486 | Ahead==0 + merged PR. All commits reachable from tip. Delete after backup. |
| STALE_SAFE_TO_DELETE | 28 | No unique commits/content remains (proven by ahead==0 or blob comparison). Delete after backup. |
| SUPERSEDED | 14 | Work replaced / explicitly unnecessary / reverted. Delete after owner word-diff confirmation + backup. |
| RECOVERY_REQUIRED | 7 | Substantive unique work not in tip, decision needed. KEEP until triaged. |
| UNCERTAIN | 4 | Cannot place without a deeper check. KEEP until investigated. |
| **Total** | **549** | |

## 3. Complete branch table (549 rows)

Columns: Branch | Latest Commit (SHA7 + date) | Ahead/Behind vs native tip | Unique Work | Dependencies (PRs) | Classification | Recommendation.
“Unique Work” for ahead==0 branches is “— contained” (every commit is an ancestor of `5e673df3`). For ahead>0 branches it
gives the blob-comparison result vs the tip (`diff` = file exists in tip with different content; `absent` = path not in tip;
`same` = byte-identical to tip) — see §4 for the full detail on those 36 branches.

| Branch | Latest Commit | Ahead/Behind | Unique Work | Dependencies | Classification | Recommendation |
|---|---|---|---|---|---|---|
| `agent/a/a-next-busy` | `d118b27` 2026-10-08 | +0/-1976 | — contained | #559 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a-next-dupes` | `487dc1e` 2026-10-08 | +0/-1965 | — contained | #560 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a-next-parity` | `feeaf48` 2026-10-08 | +0/-1979 | — contained | #558 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a-next-profile-reconnect` | `6304dc0` 2026-10-08 | +0/-1963 | — contained | #564 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a-next-widget-lang` | `710b5a4` 2026-10-08 | +0/-1972 | — contained | #561 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a22-template-write` | `b4d8622` 2026-10-05 | +0/-2763 | — contained | #435 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a23-bodyweight` | `46e2d83` 2026-10-05 | +0/-2768 | — contained | #434 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a24-manual-log` | `88005c4` 2026-10-05 | +0/-2757 | — contained | #436 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a25-insights` | `bb4316a` 2026-10-05 | +0/-2753 | — contained | #437 closed -> agent/a/a24-manual-log | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a26-library` | `db1f13c` 2026-10-05 | +0/-2749 | — contained | #438 closed -> agent/a/a25-insights | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a27-library-write` | `4534065` 2026-10-05 | +0/-2745 | — contained | #439 closed -> agent/a/a26-library | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a28-guide` | `4447250` 2026-10-05 | +0/-2739 | — contained | #440 closed -> agent/a/a27-library-write | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a29-change-password` | `c905bc7` 2026-10-05 | +0/-2732 | — contained | #441 closed -> agent/a/a28-guide | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a30-onboarding` | `cace70c` 2026-10-05 | +0/-2724 | — contained | #442 closed -> agent/a/a29-change-password | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a31-profile` | `9e76412` 2026-10-05 | +0/-2718 | — contained | #443 closed -> agent/a/a30-onboarding | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/a32-preferences` | `20a510b` 2026-10-07 | +0/-2230 | — contained | #444 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a33-reminders` | `ce2671e` 2026-10-07 | +0/-2222 | — contained | #445 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a34-session-detail` | `f5d250a` 2026-10-07 | +0/-2214 | — contained | #446 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a35-delete-reconcile` | `17139be` 2026-10-07 | +0/-2207 | — contained | #447 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a36-template-copy` | `fbbdab7` 2026-10-07 | +0/-2200 | — contained | #448 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a37-account-isolation` | `2ad06d0` 2026-10-07 | +0/-2191 | — contained | #449 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a38-workout-day-scope` | `5b2478d` 2026-10-07 | +0/-2183 | — contained | #460 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a39-workout-day-vectors` | `3ee6ec5` 2026-10-07 | +0/-2173 | — contained | #470 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a40-workout-fence` | `d42d22b` 2026-10-08 | +0/-2069 | — contained | #471 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a41-account-lifecycle` | `3fc5619` 2026-10-08 | +0/-2061 | — contained | #472 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a42-workout-day-guard` | `fb3b578` 2026-10-08 | +0/-2053 | — contained | #473 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/a46-startup-ordering` | `64eb5ad` 2026-10-08 | +0/-2039 | — contained | #476 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/adhoc-exercise` | `bf36d3f` 2026-10-05 | +0/-2778 | — contained | #416 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/adr-0003-sync` | `f0d6ede` 2026-10-05 | +0/-2862 | — contained | #240 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/append-sets` | `3c50c49` 2026-10-05 | +0/-2804 | — contained | #307 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/audit-fixes` | `31e3450` 2026-10-05 | +0/-2774 | — contained | #432 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/auth-session` | `0212a7d` 2026-10-05 | +0/-2856 | — contained | #245 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/backend-package` | `29ff3ba` 2026-10-05 | +0/-2858 | — contained | #243 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/backend-writer` | `cceae66` 2026-10-06 | +0/-2790 | — contained | #267 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/finish-hardening` | `17e9ec2` 2026-10-05 | +0/-2792 | — contained | #395 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/flow-recovery` | `a0a94cf` 2026-10-05 | +0/-2795 | — contained | #383 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/history` | `afeae6e` 2026-10-05 | +0/-2771 | — contained | #433 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/integration-workflow` | `006dc4b` 2026-10-07 | +0/-2239 | — contained | #231 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/ios-foundation` | `c2348c5` 2026-10-05 | +0/-2861 | — contained | #232 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/island-hardening` | `b2ef607` 2026-10-07 | +0/-2504 | — contained | #378 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/last-performance` | `a7a5fbc` 2026-10-05 | +0/-2801 | — contained | #349 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/lifecycle` | `7fd13a7` 2026-10-05 | +0/-2784 | — contained | #397 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/live-activity` | `84b60cb` 2026-10-05 | +0/-2853 | — contained | #252 closed -> agent/a/rest-controller | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/log-weight` | `db11fd8` 2026-10-09 | +0/-1885 | — contained | #576 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/native-improvements-ledger` | `59d857d` 2026-10-09 | +0/-1914 | — contained | #574 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/nutrition-supplements` | `1a6c819` 2026-10-09 | +0/-1918 | — contained | #570 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/nutrition-water` | `277046e` 2026-10-09 | +0/-1924 | — contained | #568 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/outbox-store` | `b437eee` 2026-10-05 | +2/-2855 | uniq=7 diff=5 absent=0 same=2 — .github/workflows/ios.yml; apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Sync/Outbox.swift; apps/ios/Packages/ASCNDKit/So | #250 closed -> agent/a/sync-core | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/a/personal-records` | `59f2408` 2026-10-05 | +0/-2807 | — contained | #298 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/plan-freshness` | `b515a75` 2026-10-05 | +0/-2788 | — contained | #396 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/porting-inventory` | `18954b9` 2026-10-05 | +0/-2780 | — contained | #402 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/reminder-sync` | `e1ec76f` 2026-10-09 | +0/-1910 | — contained | #573 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/remove-set` | `ce0bf67` 2026-10-06 | +0/-2716 | — contained | #415 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/rest-controller` | `c594611` 2026-10-05 | +0/-2856 | — contained | #251 closed -> agent/a/rest-timer-core | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/a/rest-lab` | `79dc0ce` 2026-10-05 | +1/-2851 | uniq=4 diff=4 absent=0 same=0 — apps/ios/ASCND/App/ASCNDApp.swift; apps/ios/ASCND/App/RestLabView.swift; apps/ios/ASCND/App/RootTabView.swift; apps/ios/ | #253 closed -> agent/a/live-activity | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/a/rest-timer-core` | `27910ca` 2026-10-05 | +0/-2858 | — contained | #238 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/session-lifecycle` | `511fed1` 2026-10-05 | +0/-2810 | — contained | #293 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/sync-core` | `b91e22f` 2026-10-05 | +1/-2857 | uniq=3 diff=2 absent=0 same=1 — apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Sync/Outbox.swift; apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Sync/RetryP | #242 closed -> agent/a/rest-timer-core | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/a/sync-worker` | `ad5ec5a` 2026-10-05 | +0/-2837 | — contained | #265 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/today-controller` | `b8e4e5f` 2026-10-05 | +0/-2813 | — contained | #290 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/today-plan` | `6986172` 2026-10-05 | +0/-2816 | — contained | #285 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-app` | `dd824e6` 2026-10-05 | +0/-2848 | — contained | #263 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-day` | `8a6ad8b` 2026-10-05 | +0/-2856 | — contained | #244 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-flow` | `35362b9` 2026-10-05 | +0/-2798 | — contained | #364 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-session` | `a917161` 2026-10-05 | +0/-2854 | — contained | #256 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-slice` | `34632c4` 2026-10-05 | +0/-2819 | — contained | #268 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/a/workout-store` | `df4f637` 2026-10-06 | +0/-2815 | — contained | #264 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/a11y-fixes` | `be28ddb` 2026-10-06 | +0/-2551 | — contained | #291 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/adhoc-exercise-ui` | `2abe8a3` 2026-10-07 | +0/-2473 | — contained | #411 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/append-vectors` | `25dcd21` 2026-10-05 | +1/-2864 | uniq=2 diff=0 absent=2 same=0 — native/tools/append-vectors.mjs; spec/vectors/append-set.json | #360 closed -> native/ios-rewrite | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `agent/c/apple-ts-typed-bytes` | `5ef2645` 2026-11-17 | +0/-364 | — contained | #934 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/async-states` | `d0ec931` 2026-10-05 | +2/-2859 | uniq=3 diff=3 absent=0 same=0 — apps/ios/ASCND/Resources/Localizable.xcstrings; apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem/DSAsyncState.swift; | #337 closed -> agent/c/ds-components | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/auth-lifecycle` | `eb966f6` 2026-10-05 | +0/-2816 | — contained | #365 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/auth-screen` | `8a94fd1` 2026-10-06 | +0/-2598 | — contained | #297 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/auth-ux` | `381930a` 2026-10-06 | +0/-2567 | — contained | #350 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/backend-audits` | `00d045c` 2026-11-12 | +1/-565 | uniq=11 diff=0 absent=11 same=0 — docs/audits/README.md; docs/audits/beta-gate-decisions.md; docs/audits/round-1/ASCND_BACKEND_AUDIT_REPORT.md; docs/audit | no PR ever | ACTIVE | KEEP — work/decision pending; do not delete. |
| `agent/c/bench-bottom-fix` | `96bba47` 2026-11-20 | +0/-182 | — contained | #891 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/bench-finalize` | `a51f0f8` 2026-11-15 | +9/-475 | uniq=15 diff=15 absent=0 same=0 — apps/ios/ASCND/Features/Exercises/ExerciseDemo3D.swift; apps/ios/ASCND/Features/Exercises/ExerciseDemo3DView.swift; apps | #896 closed -> native/ios-rewrite | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `agent/c/bench-press-360` | `cd0d569` 2026-11-13 | +0/-520 | — contained | #880 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/c52-ios-ci-gate` | `9c40392` 2026-10-05 | +1/-2857 | uniq=1 diff=1 absent=0 same=0 — .github/workflows/ios.yml | #519 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/ci-coverage` | `560b278` 2026-11-17 | +0/-400 | — contained | #925 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/client-hardening` | `0d91e64` 2026-11-17 | +0/-392 | — contained | #928 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/contract-handoff` | `36ac540` 2026-10-06 | +0/-2858 | — contained | #490 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/curl-finalize` | `57a42bc` 2026-11-15 | +6/-475 | uniq=9 diff=9 absent=0 same=0 — apps/ios/ASCND/Features/Exercises/ExerciseDemo3D.swift; apps/ios/ASCND/Features/Exercises/ExerciseDemo3DView.swift; apps | #895 closed -> native/ios-rewrite | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `agent/c/d32-negative-regression` | `8b54adf` 2026-10-08 | +0/-2036 | — contained | #507 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/dailylog-doc-golden` | `45be130` 2026-11-17 | +0/-342 | — contained | #935 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/data-correctness` | `68b6687` 2026-11-17 | +0/-397 | — contained | #923 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/design-tokens` | `c120c0f` 2026-10-04 | +0/-2863 | — contained | #236 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/di-gallery` | `4958afa` 2026-10-06 | +0/-2523 | — contained | #376 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/ds-components` | `74d22b1` 2026-10-06 | +0/-2654 | — contained | #260 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/ds-pass2` | `1431cd9` 2026-10-05 | +1/-2859 | uniq=1 diff=1 absent=0 same=0 — apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem/DSButton.swift | #341 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/ds-tokens-swift` | `6ac6c2d` 2026-10-06 | +0/-2857 | — contained | #259 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/equipment-expand` | `490ac3e` 2026-11-20 | +0/-184 | — contained | #899 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/error-visibility` | `e9f98c0` 2026-11-17 | +0/-405 | — contained | #917 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/finish-flow` | `531d6cf` 2026-10-05 | +2/-2849 | uniq=12 diff=12 absent=0 same=0 — apps/ios/ASCND/App/WorkoutSummaryView.swift; apps/ios/ASCND/Features/Workout/WorkoutView.swift; apps/ios/ASCND/Resources | #354 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/fix-c1-regressions` | `1c2aa17` 2026-10-06 | +0/-2568 | — contained | #269 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/fixture-matrix` | `e3d9cba` 2026-10-06 | +0/-2672 | — contained | #379 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/fixtures` | `62ee6f9` 2026-10-07 | +0/-2378 | — contained | #356 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/gate-fixes` | `3a425c4` 2026-10-04 | +0/-2863 | — contained | #234 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/harness-skip-clean` | `4cb116f` 2026-10-05 | +0/-2826 | — contained | #474 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/health-window-ios27` | `7019e10` 2026-11-17 | +0/-404 | — contained | #918 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/history-ui` | `053d674` 2026-10-07 | +0/-2433 | — contained | #375 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/i18n-audit` | `b9e3a2a` 2026-10-05 | +0/-2857 | — contained | #352 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/i18n-forensic` | `996f190` 2026-10-06 | +0/-2524 | — contained | #340 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/idempotency-tests` | `c117b18` 2026-10-05 | +0/-2863 | — contained | #363 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/interaction-tests` | `ce3897b` 2026-10-05 | +0/-2857 | — contained | #353 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/kit-honesty` | `d8fe442` 2026-11-17 | +0/-400 | — contained | #921 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/koa-audit-2026-11-17` | `657478c` 2026-11-17 | +1/-268 | uniq=2 diff=0 absent=2 same=0 — docs/audits/koa-2026-11-17/KOA_AUDIT_REPORT.md; docs/audits/koa-2026-11-17/KOA_TASKS.md | no PR ever | ACTIVE | KEEP — work/decision pending; do not delete. |
| `agent/c/koa-mascot-system` | `e96d7c2` 2026-11-21 | +1/-78 | uniq=17 diff=0 absent=17 same=0 — docs/audits/koa-mascot-system-2026-11-21/ASCND_KOA_AUDIT.md; docs/audits/koa-mascot-system-2026-11-21/CLAUDE_REVIEW_BRIE | no PR ever | ACTIVE | KEEP — work/decision pending; do not delete. |
| `agent/c/koa-t02-coach-allergies` | `7f97cae` 2026-11-17 | +0/-267 | — contained | #955 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/motion-kit-ci` | `12fda39` 2026-11-17 | +0/-331 | — contained | #889 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/motion-kit-gates` | `f4e0df1` 2026-11-19 | +0/-251 | — contained | #890 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/nav-polish` | `7628d45` 2026-10-06 | +0/-2511 | — contained | #338 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/nav-tests` | `44346c0` 2026-10-05 | +0/-2862 | — contained | #377 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/offline-status` | `1f7e441` 2026-10-06 | +0/-2566 | — contained | #391 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/parity-workout-fixes` | `5f7df4b` 2026-10-08 | +2/-2087 | uniq=2 diff=2 absent=0 same=0 — apps/ios/ASCND/Features/Workout/WorkoutView.swift; apps/ios/ASCND/Resources/Localizable.xcstrings | #526 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/perf-cleanup` | `a184a9a` 2026-10-05 | +0/-2857 | — contained | #355 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/pr-vectors` | `e048111` 2026-10-05 | +1/-2864 | uniq=2 diff=1 absent=1 same=0 — native/tools/pr-vectors.mjs; spec/vectors/personal-record.json | #358 closed -> native/ios-rewrite | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `agent/c/prev-row` | `daabfa1` 2026-10-06 | +0/-2568 | — contained | #348 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/preview-gallery` | `7e1dacb` 2026-10-07 | +0/-2553 | — contained | #343 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/probeai-per-function` | `4c71242` 2026-11-17 | +0/-382 | — contained | #932 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/progress-header` | `4099d6d` 2026-10-06 | +0/-2567 | — contained | #346 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/qa-matrix` | `b6b3e2f` 2026-10-05 | +0/-2863 | — contained | #361 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/reduce-motion-pass` | `93bd75a` 2026-10-06 | +0/-2521 | — contained | #392 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/reference-eval` | `6e685fb` 2026-11-15 | +0/-492 | — contained | #893 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/remove-koaweek-today` | `c64d4e9` 2026-11-18 | +0/-291 | — contained | #952 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/set-editor` | `d0c7c2a` 2026-10-06 | +0/-2565 | — contained | #318 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/settings-profile-shell` | `f39b556` 2026-10-07 | +0/-2566 | — contained | #394 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/small-fixes` | `f8b26a3` 2026-11-14 | +0/-487 | — contained | #898 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/squat-head-fix` | `caa4775` 2026-11-20 | +0/-159 | — contained | #892 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/state-consistency` | `22e5e0d` 2026-10-05 | +0/-2863 | — contained | #393 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/state-persistence` | `a874456` 2026-11-17 | +0/-392 | — contained | #930 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/storekit-purchase` | `2e52775` 2026-11-20 | +0/-158 | — contained | #920 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/summary-prod` | `3e86217` 2026-10-07 | +0/-2434 | — contained | #342 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/summary-screen` | `ce2243b` 2026-10-06 | +0/-2610 | — contained | #262 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/summary-seam` | `4daca0c` 2026-10-04 | +0/-2853 | — contained | #292 closed -> agent/c/summary-screen | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `agent/c/sync-bounds` | `bd2a07d` 2026-11-17 | +0/-362 | — contained | #927 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/sync-drain` | `1ff6a5a` 2026-11-17 | +0/-390 | — contained | #929 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/sync-reads` | `e3b62ee` 2026-11-17 | +0/-388 | — contained | #926 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/tab-shell` | `e663135` 2026-10-06 | +0/-2816 | — contained | #351 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/today-binding` | `2fdf60d` 2026-10-06 | +0/-2557 | — contained | #345 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/today-skeleton` | `5f39aa0` 2026-10-04 | +1/-2859 | uniq=7 diff=7 absent=0 same=0 — apps/ios/ASCND/Features/Today/TodayView.swift; apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem/DSButton.swift; apps | #284 closed -> agent/c/ds-components | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `agent/c/ui-consistency` | `b16a382` 2026-11-17 | +0/-400 | — contained | #922 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/week-strip` | `61da173` 2026-10-06 | +0/-2673 | — contained | #309 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-builder-ui` | `357f065` 2026-10-06 | +0/-2528 | — contained | #410 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-day-apple-revoke` | `0deeaf2` 2026-11-17 | +0/-400 | — contained | #919 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-day-retention` | `b07c2a7` 2026-11-17 | +0/-381 | — contained | #933 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-screen` | `5e4c1a4` 2026-10-06 | +0/-2627 | — contained | #287 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-set-states` | `5db32c0` 2026-10-06 | +0/-2572 | — contained | #389 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/workout-states` | `eed3e0a` 2026-10-07 | +0/-2434 | — contained | #288 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/c/xcstrings-gate` | `c16d274` 2026-10-06 | +0/-2860 | — contained | #261 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/a8-review-checklist` | `b3c5459` 2026-10-05 | +0/-2863 | — contained | #362 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/account-isolation-tests` | `2f5629b` 2026-10-05 | +0/-2832 | — contained | #390 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/adhoc-vectors` | `fa9f190` 2026-10-06 | +0/-2687 | — contained | #413 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/append-idempotency-props` | `1ce17a3` 2026-10-05 | +0/-2827 | — contained | #357 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/append-vectors` | `05c47c1` 2026-10-05 | +0/-2863 | — contained | #347 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/auth-lifecycle-vectors` | `f1da57d` 2026-10-05 | +0/-2829 | — contained | #381 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/community-moderation-admin` | `b640a39` 2026-11-17 | +0/-404 | — contained | #924 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/community-moderation-dashboard` | `ed61896` 2026-11-17 | +0/-280 | — contained | #916 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/d27-review` | `aeec2d2` 2026-10-05 | +0/-2755 | — contained | #492 closed MERGED 2026-10-05 -> agent/a/a46-startup-ordering | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/d28-contract-fix` | `25869c3` 2026-10-05 | +1/-2842 | uniq=2 diff=0 absent=2 same=0 — apps/ios/ASCND/Features/Workout/ExtraExerciseModels.swift; apps/ios/ASCND/Features/Workout/ExtraExerciseRow.swift | #493 closed -> agent/c/adhoc-exercise-ui | UNCERTAIN | KEEP — investigate before any deletion. |
| `agent/d/d30-integrity-matrix` | `f5233fc` 2026-10-08 | +0/-2030 | — contained | #496 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/d32-rest-timer-gate` | `7825a37` 2026-10-05 | +0/-2863 | — contained | #516 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/differential-runner` | `add0ef7` 2026-10-06 | +0/-2682 | — contained | #382 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/fix-admin-blank-screen` | `62d5190` 2026-11-18 | +0/-260 | — contained | #957 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/fix-mod-stale-iso` | `f314fbf` 2026-11-18 | +0/-261 | — contained | #956 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/gate-fixes-d` | `6ddf1de` 2026-10-06 | +0/-2855 | — contained | #239 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/history-vectors` | `112c1f5` 2026-10-06 | +0/-2687 | — contained | #414 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/moderation-e2e` | `ec24c93` 2026-11-17 | +0/-267 | — contained | #954 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/parity-drift-scanner` | `a5a2930` 2026-10-05 | +0/-2860 | — contained | #366 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/personal-record-vectors` | `22fbfa0` 2026-10-05 | +0/-2863 | — contained | #344 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/pr-backlog-classification` | `ad74455` 2026-10-05 | +1/-2864 | uniq=1 diff=0 absent=1 same=0 — PR-BACKLOG-CLASSIFICATION.md | no PR ever | UNCERTAIN | KEEP — investigate before any deletion. |
| `agent/d/qa-matrix` | `fe14e50` 2026-10-06 | +0/-2686 | — contained | #258 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/quicklog-redesign` | `6da1781` 2026-11-17 | +0/-293 | — contained | #951 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/readiness-dst-test-fix` | `951ad60` 2026-10-05 | +0/-2862 | — contained | #339 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/regression-harness` | `fe65592` 2026-10-07 | +0/-2373 | — contained | #308 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/remove-set-vectors` | `e47829a` 2026-10-06 | +0/-2687 | — contained | #412 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/run-real-rn` | `4b3f7db` 2026-10-05 | +0/-2858 | — contained | #504 closed MERGED 2026-10-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/shrink-ask-koa-card` | `74b9c45` 2026-11-17 | +0/-293 | — contained | #947 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/spec-workout-vectors` | `c2fd5c2` 2026-10-04 | +0/-2863 | — contained | #237 closed MERGED 2026-10-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/sync-vectors` | `d750e99` 2026-10-06 | +0/-2687 | — contained | #257 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/template-write-vectors` | `af99a61` 2026-10-05 | +0/-2862 | — contained | #409 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/today-controller-vectors` | `461fddf` 2026-10-06 | +0/-2687 | — contained | #380 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/trace-a19-a22` | `6609fff` 2026-10-07 | +0/-2379 | — contained | #494 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/trace-registry` | `98056b0` 2026-10-06 | +0/-2604 | — contained | #289 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/trace-registry-a6-a12` | `cc3d351` 2026-10-05 | +0/-2863 | — contained | #475 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/vector-runner-guard` | `807dbf8` 2026-10-06 | +0/-2688 | — contained | #359 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `agent/d/workout-session-vectors` | `d7a9728` 2026-10-04 | +0/-2861 | — contained | #286 closed MERGED 2026-10-06 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/3d-character-005` | `ca9f550` 2026-11-24 | +11/-15 | uniq=128 diff=33 absent=95 same=0 — apps/ios/ASCND/Features/Exercises/ExerciseDemo3D.swift; apps/ios/ASCND/Features/Exercises/ExerciseDemo3DView.swift; apps | no PR ever | ACTIVE | KEEP — work/decision pending; do not delete. |
| `claude/3d-data` | `287a212` 2026-11-17 | +0/-329 | — contained | #940 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/3d-military-press` | `ee9e1f5` 2026-11-23 | +1/-18 | uniq=46 diff=8 absent=38 same=0 — apps/ios/ASCND/Resources/ExerciseDemos/demo3d_index.json; apps/ios/ASCND/Resources/ExerciseDemos/standing_military_press | #1009 open -> native/ios-rewrite | ACTIVE | KEEP — work/decision pending; do not delete. |
| `claude/3d-mistake` | `202fc2c` 2026-11-17 | +0/-307 | — contained | #942 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/3d-slim` | `edce8b2` 2026-11-17 | +0/-332 | — contained | #939 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/3d-studio-look` | `edd4a3f` 2026-11-23 | +0/-14 | — contained | #1010 closed MERGED 2026-11-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/3d-tempo` | `261b21e` 2026-11-17 | +0/-326 | — contained | #941 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/a11y-fails` | `ea4db46` 2026-10-21 | +0/-1414 | — contained | #637 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/a11y-large-type` | `e45e3d2` 2026-10-27 | +0/-1143 | — contained | #669 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/a11y-round-2b` | `ef94912` 2026-11-03 | +0/-836 | — contained | #821 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ai-busy-notice` | `371097d` 2026-10-24 | +0/-1199 | — contained | #685 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ai-water-unit` | `1fae486` 2026-10-27 | +0/-1146 | — contained | #703 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/anatomical-rig` | `ad28038` 2026-11-14 | +0/-504 | — contained | #886 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/app-lock-export` | `a0359e5` 2026-11-04 | +0/-715 | — contained | #772 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ask-koa-siri` | `bd8d4e8` 2026-10-21 | +0/-1353 | — contained | #650 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/audit-r1` | `882e985` 2026-10-25 | +0/-1192 | — contained | #689 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/audit-r2` | `4fad8ab` 2026-10-26 | +0/-1189 | — contained | #690 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/auth-buttons-a` | `9b73897` 2026-10-23 | +0/-1264 | — contained | #667 closed MERGED 2026-10-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-batch1` | `098bf20` 2026-10-07 | +0/-2440 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-batch2` | `f41f257` 2026-10-07 | +0/-2382 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-batch3` | `16c5e0f` 2026-10-07 | +0/-2330 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-batch4` | `6490a4f` 2026-10-07 | +0/-2304 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-batch5` | `1d41c25` 2026-10-07 | +0/-2247 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-batch6` | `d074b71` 2026-10-07 | +0/-2246 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-handoff-followups` | `51980b9` 2026-10-08 | +0/-1990 | — contained | #551 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-handoff-s0gs64` | `d42d22b` 2026-10-08 | +0/-2069 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-health` | `4eee932` 2026-10-08 | +0/-2002 | — contained | #554 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-integration-wip` | `e733737` 2026-10-07 | +0/-2435 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-l10n-probe` | `f7c5ed7` 2026-10-07 | +3/-2196 | uniq=1 diff=0 absent=1 same=0 — apps/ios/Packages/ASCNDKit/Tests/ASCNDCoreTests/L10nProbeTests.swift | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-net-status` | `7105756` 2026-10-08 | +0/-2169 | — contained | #530 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-pause` | `dc622ea` 2026-10-08 | +0/-1996 | — contained | #550 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-plural-gate` | `0b99c60` 2026-10-08 | +0/-2166 | — contained | #529 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-readiness` | `d9a8af5` 2026-10-08 | +0/-2022 | — contained | #552 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-theme-lang` | `2b10538` 2026-10-08 | +0/-2165 | — contained | #533 closed -> claude/b-wiring | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-train-1` | `719e54e` 2026-10-08 | +8/-2137 | uniq=74 diff=45 absent=0 same=29 — apps/ios/ASCND/App/ASCNDApp.swift; apps/ios/ASCND/App/AppServices.swift; apps/ios/ASCND/App/ConnectionBanner.swift; apps | #539 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `claude/b-train-2` | `77dcccc` 2026-10-08 | +0/-2088 | — contained | #542 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-widgets` | `91f0615` 2026-10-08 | +0/-2012 | — contained | #553 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/b-wip-n3n4-qa` | `d67368d` 2026-10-16 | +0/-1598 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/b-wiring` | `d255f3d` 2026-10-08 | +0/-2169 | — contained | #528 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/backend-round3` | `47a3d72` 2026-11-13 | +0/-553 | — contained | #875 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/bedtime-size` | `1aedccd` 2026-11-04 | +0/-743 | — contained | #836 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/bench-final-review` | `2ba756a` 2026-11-13 | +0/-509 | — contained | #885 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/bluegrey-leftovers` | `6843b0e` 2026-10-20 | +0/-1446 | — contained | #629 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/body-check` | `d0943af` 2026-11-06 | +0/-688 | — contained | #843 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/bodyfat-to-measurements` | `2f0235d` 2026-11-09 | +0/-594 | — contained | #860 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/builder-redesign` | `bd9ed74` 2026-10-19 | +0/-1521 | — contained | #603 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/calorie-apply` | `64e80e7` 2026-11-09 | +0/-597 | — contained | #859 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/character-build-medium` | `57599f8` 2026-11-17 | +1/-287 | uniq=7 diff=7 absent=0 same=0 — artifacts/exercise-visual-system/characters/master_character_003/character_facts.json; artifacts/exercise-visual-system/ | no PR ever | UNCERTAIN | KEEP — investigate before any deletion. |
| `claude/character-ref-proportions` | `0446c2b` 2026-11-16 | +1/-421 | uniq=62 diff=61 absent=1 same=0 — artifacts/exercise-visual-system/characters/master_character_003/character_facts.json; artifacts/exercise-visual-system/ | no PR ever | ACTIVE | KEEP — work/decision pending; do not delete. |
| `claude/coach-chat-overscroll` | `3db80c0` 2026-10-18 | +0/-1556 | — contained | #595 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/coach-disclaimer-lang` | `6522941` 2026-10-21 | +0/-1357 | — contained | #648 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/codeql-timeout` | `ddc7b78` 2026-11-04 | +0/-772 | — contained | #830 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/community-confirm-dialogs` | `fd70e53` 2026-10-31 | +0/-954 | — contained | #768 closed MERGED 2026-11-01 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/community-deep-link` | `9797518` 2026-10-29 | +0/-995 | — contained | #749 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/core-test-gaps` | `b3b24e2` 2026-11-04 | +0/-731 | — contained | #838 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/custom-food` | `0529093` 2026-10-22 | +0/-1293 | — contained | #660 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/dark-old-colors` | `629cc6c` 2026-10-20 | +0/-1447 | — contained | #623 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/day-rollover` | `51cbcc6` 2026-10-24 | +0/-1222 | — contained | #676 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/dead-code-gd3` | `620765a` 2026-11-01 | +0/-945 | — contained | #771 closed MERGED 2026-11-01 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/debug-flow` | `82caa9a` 2026-10-22 | +0/-1281 | — contained | #664 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/demo3d-content-modules` | `5658586` 2026-11-20 | +0/-101 | — contained | #987 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/deploy-20261112` | `253550d` 2026-11-16 | +0/-415 | — contained | #913 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/display-audit` | `8eb3d1e` 2026-11-01 | +0/-948 | — contained | #770 closed MERGED 2026-11-01 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/dm-button` | `4fa14e5` 2026-10-20 | +0/-1415 | — contained | #633 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/e2e-budget` | `57d9d7b` 2026-11-03 | +0/-847 | — contained | #785 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/exercise-favorites` | `5bacbd5` 2026-11-16 | +0/-447 | — contained | #906 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/exercise-favorites-deployed` | `209249a` 2026-11-16 | +0/-427 | — contained | #912 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/exercise-favorites-sync` | `83db436` 2026-11-16 | +0/-432 | — contained | #908 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/exercise-search` | `f8bec25` 2026-11-15 | +0/-454 | — contained | #904 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/exercise-visual-system` | `c1c7c7c` 2026-11-12 | +0/-560 | — contained | #871 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/fiber-directions-focus` | `2b137ea` 2026-11-13 | +0/-513 | — contained | #884 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/fix-five-bugs` | `9c81777` 2026-10-21 | +0/-1361 | — contained | #646 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/food-exercise-library` | `72d7cc9` 2026-10-19 | +0/-1546 | — contained | #597 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/gd1-daily-plan` | `951fd73` 2026-10-21 | +0/-1380 | — contained | #641 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/gd2-progress` | `97f6ea5` 2026-10-21 | +0/-1377 | — contained | #642 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/gd3-areas` | `c164d91` 2026-10-21 | +0/-1365 | — contained | #645 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/gd3-four-areas` | `6bcaf07` 2026-10-21 | +2/-1373 | uniq=1 diff=0 absent=0 same=1 — apps/ios/docs/design/mocks/gd3-four-areas.html | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/google-signin` | `175dd38` 2026-10-23 | +0/-1272 | — contained | #666 closed MERGED 2026-10-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/guide-one-tap` | `1ffc746` 2026-11-13 | +0/-517 | — contained | #881 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/hai-nhanh-con-lai-cd1mx7` | `cf2eec1` 2026-08-04 | +0/-3988 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/health-type` | `affd324` 2026-10-21 | +0/-1344 | — contained | #651 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/helper-bones` | `ce4d0d6` 2026-11-15 | +0/-461 | — contained | #903 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ink-accent` | `f9c5440` 2026-11-12 | +0/-561 | — contained | #874 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/insight-hours` | `236e26c` 2026-10-24 | +0/-1217 | — contained | #677 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/insight-live` | `f0f2a55` 2026-10-22 | +0/-1321 | — contained | #656 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/insight-loading-compact` | `3a964a3` 2026-10-26 | +0/-1180 | — contained | #693 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/insight-signout` | `9727dfa` 2026-11-03 | +0/-843 | — contained | #811 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ios-e2e-maestro` | `292b656` 2026-10-27 | +0/-1109 | — contained | #700 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ios-fitness-rebuild-fiyl9k` | `513319c` 2026-08-01 | +1/-4132 | uniq=2 diff=2 absent=0 same=0 — native/src/components/ascnd/glass-card.tsx; native/src/constants/ascnd.ts | no PR ever | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `claude/ios-fitness-rebuild-omgulr` | `fac9ac2` 2026-10-04 | +0/-2864 | — contained | no PR ever | PRIMARY | KEEP — never delete. |
| `claude/koa-a11y-audit` | `f0309fe` 2026-11-03 | +0/-833 | — contained | #812 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-a11y-gate` | `cbddaf1` 2026-11-20 | +0/-110 | — contained | #983 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-analytics` | `b90495b` 2026-11-03 | +0/-889 | — contained | #804 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-anim-lifecycle` | `eaaa6d7` 2026-11-20 | +0/-121 | — contained | #985 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-arm-behind` | `0af8cb7` 2026-10-20 | +0/-1422 | — contained | #632 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-arm-joint` | `3239301` 2026-10-24 | +0/-1205 | — contained | #682 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-audit-sim-check` | `a052950` 2026-11-24 | +0/-9 | — contained | #1011 closed MERGED 2026-11-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-blink-lids` | `c40834c` 2026-11-21 | +0/-61 | — contained | #996 closed MERGED 2026-11-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-board-lift` | `1032998` 2026-11-23 | +0/-19 | — contained | #1007 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-breakage` | `1dd660e` 2026-11-07 | +0/-683 | — contained | #848 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-claim-flow` | `119c4ec` 2026-11-19 | +0/-239 | — contained | #964 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-claim-gate` | `dc71611` 2026-11-20 | +0/-123 | — contained | #984 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-claim-gate-2` | `efdbdd0` 2026-11-20 | +0/-97 | — contained | #988 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-clean-deployed` | `b76dbaf` 2026-10-29 | +0/-1001 | — contained | #746 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-coach-plan-readiness` | `cbe936c` 2026-11-21 | +0/-73 | — contained | #992 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-coach-server` | `a91cba9` 2026-11-20 | +0/-140 | — contained | #978 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-coach-stream` | `1ce83f2` 2026-11-19 | +0/-254 | — contained | #961 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-comeback-step` | `822b928` 2026-10-22 | +0/-1283 | — contained | #661 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-dead-streak` | `4ee532b` 2026-11-22 | +0/-51 | — contained | #999 closed MERGED 2026-11-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-drop-wave-run` | `5ce2971` 2026-10-19 | +0/-1498 | — contained | #606 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-dust-dev-card` | `a050ea6` 2026-10-29 | +0/-999 | — contained | #747 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-dust-scene` | `11ee7ce` 2026-11-08 | +0/-672 | — contained | #854 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-econ-sql` | `9f34cbd` 2026-11-20 | +0/-125 | — contained | #980 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-econ-sweep` | `4457270` 2026-11-20 | +0/-136 | — contained | #979 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-emotion-reach` | `cc33e62` 2026-11-22 | +0/-37 | — contained | #1003 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-engagement` | `5ee6cb0` 2026-11-09 | +0/-587 | — contained | #863 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-figure-perf` | `9d32d1b` 2026-11-19 | +0/-234 | — contained | #966 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-gains-rest` | `8b09a56` 2026-10-29 | +0/-1007 | — contained | #744 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-gym-fits` | `d160bfd` 2026-10-20 | +0/-1433 | — contained | #627 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-habit-quests` | `9630f48` 2026-10-18 | +0/-1552 | — contained | #596 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-lids-redraw` | `7177cea` 2026-11-21 | +0/-54 | — contained | #997 closed MERGED 2026-11-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-light-week-load` | `76f3bdd` 2026-11-22 | +0/-43 | — contained | #1001 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-line-formatter` | `48c557a` 2026-11-20 | +0/-131 | — contained | #982 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-log-rhythm` | `de57a51` 2026-11-12 | +0/-559 | — contained | #870 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-logging-mock` | `a7d8a1f` 2026-11-10 | +0/-580 | — contained | #866 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-meditate-eyes` | `4b61a95` 2026-10-20 | +0/-1437 | — contained | #625 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-moment-seen` | `32fbefe` 2026-11-20 | +0/-96 | — contained | #989 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-month-mock` | `fb15479` 2026-11-13 | +0/-551 | — contained | #877 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-month-recap` | `0744707` 2026-11-13 | +0/-542 | — contained | #879 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-new-poses` | `d0c754a` 2026-10-25 | +0/-1194 | — contained | #688 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-night` | `098758d` 2026-10-20 | +0/-1418 | — contained | #634 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-occlusion-decor` | `30edf06` 2026-11-04 | +0/-722 | — contained | #840 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-one-week-rule` | `8b0e1ac` 2026-11-22 | +0/-31 | — contained | #1002 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-optional-reactions` | `1c4354b` 2026-11-09 | +0/-617 | — contained | #857 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p2-batch1` | `a8f9217` 2026-11-19 | +0/-218 | — contained | #970 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p2-batch4` | `b9b54cf` 2026-11-19 | +0/-194 | — contained | #973 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p2-coach` | `56a02a3` 2026-11-19 | +0/-207 | — contained | #972 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p2-week` | `791c7fd` 2026-11-19 | +0/-199 | — contained | #971 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p3-a11y` | `c128a4a` 2026-11-19 | +0/-179 | — contained | #974 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p3-cleanup` | `2a313e0` 2026-11-19 | +0/-189 | — contained | #975 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-p3-economy` | `e42ad98` 2026-11-20 | +0/-144 | — contained | #977 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-peek` | `1bd3aea` 2026-10-19 | +0/-1478 | — contained | #616 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-phase1` | `1652d58` 2026-10-19 | +0/-1497 | — contained | #607 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-plead-blink` | `049df33` 2026-11-21 | +0/-59 | — contained | #998 closed MERGED 2026-11-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-price-contract` | `02918c9` 2026-11-20 | +0/-134 | — contained | #981 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-progress-face` | `362de91` 2026-10-29 | +0/-997 | — contained | #748 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-quests` | `ac7f979` 2026-10-29 | +0/-1008 | — contained | #743 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-quiet-talk` | `dcb251e` 2026-11-03 | +0/-832 | — contained | #810 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-rank-build` | `7d2808e` 2026-10-20 | +0/-1435 | — contained | #626 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-rank-curve` | `3005ec5` 2026-10-24 | +0/-1212 | — contained | #680 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-reminders` | `773f11a` 2026-10-19 | +0/-1475 | — contained | #617 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-render-caches` | `86dcc40` 2026-11-20 | +0/-81 | — contained | #994 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-repair` | `47bd9a6` 2026-11-06 | +0/-685 | — contained | #847 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-repair-neon` | `e21fe36` 2026-11-07 | +0/-676 | — contained | #851 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-repair-scenes` | `931cad4` 2026-11-07 | +0/-681 | — contained | #849 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-repair-stage` | `adccf2c` 2026-11-07 | +0/-677 | — contained | #850 closed MERGED 2026-11-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-rest-cleanup` | `8dc01fc` 2026-11-09 | +0/-617 | — contained | #856 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-rest-dynamic-type` | `22d0fac` 2026-11-21 | +0/-65 | — contained | #990 closed MERGED 2026-11-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-cleanup` | `2a88363` 2026-10-29 | +0/-1017 | — contained | #741 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-decor` | `a31f31f` 2026-10-29 | +0/-1011 | — contained | #742 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-decor-tall` | `7a38e9f` 2026-11-22 | +0/-28 | — contained | #1004 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-dust` | `2b526cf` 2026-10-29 | +0/-1003 | — contained | #745 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-health` | `f915780` 2026-10-24 | +0/-1212 | — contained | #681 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-polish` | `5f16dce` 2026-11-04 | +0/-699 | — contained | #842 closed MERGED 2026-11-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-redraw` | `658c5d8` 2026-11-04 | +0/-725 | — contained | #839 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-room-wander` | `00c000b` 2026-10-24 | +1/-1198 | uniq=2 diff=2 absent=0 same=0 — apps/ios/ASCND/Features/Mascot/KoaFigureView.swift; apps/ios/ASCND/Features/Mascot/MascotRoomView.swift | #687 closed -> native/ios-rewrite | UNCERTAIN | KEEP — investigate before any deletion. |
| `claude/koa-room-weather` | `1e39614` 2026-11-23 | +0/-25 | — contained | #1005 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-seams-tests` | `84e2580` 2026-11-20 | +0/-106 | — contained | #986 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-shelf-trophies` | `0cb6a5c` 2026-11-04 | +0/-758 | — contained | #832 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-shop-atomic` | `d3ab368` 2026-11-19 | +0/-228 | — contained | #967 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-shop-gains` | `170d8d5` 2026-11-22 | +0/-48 | — contained | #1000 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-snapshots` | `6e65af4` 2026-11-03 | +0/-871 | — contained | #809 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t01-claim-duplicate` | `1b66b57` 2026-11-19 | +0/-254 | — contained | #960 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t03-unlogged-nutrition` | `72c82bb` 2026-11-19 | +0/-257 | — contained | #959 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t08-ask-probe` | `3d298ce` 2026-11-19 | +0/-247 | — contained | #962 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t14-today-face` | `de95ce6` 2026-11-19 | +0/-227 | — contained | #968 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t15-haptics` | `0617407` 2026-11-19 | +0/-239 | — contained | #965 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t27-go-beat` | `14fd9bc` 2026-11-20 | +0/-90 | — contained | #993 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-t48-today-identity` | `26728c4` 2026-11-20 | +0/-86 | — contained | #995 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-train-loop` | `5800362` 2026-10-20 | +0/-1430 | — contained | #628 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-turn-clip` | `2b57b28` 2026-11-10 | +3/-588 | uniq=6 diff=4 absent=2 same=0 — apps/ios/ASCNDTests/__Snapshots__/KoaSnapshotTests/pullRunOutfits.dark.png; apps/ios/ASCNDTests/__Snapshots__/KoaSnapsho | #864 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `claude/koa-v2-360-mock` | `db79d80` 2026-11-08 | +0/-625 | — contained | #846 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-v2-audit` | `ca0c8c8` 2026-11-05 | +0/-696 | — contained | #844 closed MERGED 2026-11-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-v2-slice` | `654f6ef` 2026-11-05 | +0/-697 | — contained | #845 closed MERGED 2026-11-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-1` | `b65cd5c` 2026-10-19 | +0/-1498 | — contained | #608 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-audit` | `f05e269` 2026-10-29 | +0/-1021 | — contained | #739 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-back` | `16ed081` 2026-10-19 | +0/-1492 | — contained | #614 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-bottom` | `da0d405` 2026-10-19 | +0/-1494 | — contained | #612 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-face` | `5976291` 2026-10-19 | +0/-1496 | — contained | #610 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-fit` | `a345e12` 2026-10-29 | +0/-1018 | — contained | #740 closed MERGED 2026-10-29 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-hand` | `506da1f` 2026-10-19 | +0/-1491 | — contained | #615 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-head` | `94062b6` 2026-10-19 | +0/-1497 | — contained | #609 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-shoes` | `d69c9f9` 2026-10-19 | +0/-1493 | — contained | #613 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wardrobe-top` | `65c4aeb` 2026-10-19 | +0/-1495 | — contained | #611 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wave2` | `9f59838` 2026-10-20 | +0/-1424 | — contained | #630 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-wave3` | `a206eda` 2026-10-20 | +0/-1423 | — contained | #631 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-weather-day-check` | `36bc2af` 2026-11-23 | +0/-23 | — contained | #1006 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-week-lang` | `451a706` 2026-10-24 | +0/-1219 | — contained | #678 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-week-offline` | `acb9452` 2026-10-22 | +0/-1290 | — contained | #662 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-week-sheet` | `fb62e66` 2026-10-21 | +0/-1373 | — contained | #644 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-widget` | `db0b0a0` 2026-10-19 | +0/-1471 | — contained | #618 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/koa-widget-room` | `dacb5b7` 2026-10-19 | +0/-1468 | — contained | #619 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/land-signout-auth` | `4bcf093` 2026-10-17 | +0/-1593 | — contained | #577 closed MERGED 2026-10-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/large-titles` | `0c17781` 2026-11-12 | +0/-561 | — contained | #876 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ledger-3d-release` | `9567c37` 2026-11-20 | +0/-148 | — contained | #976 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ledger-799b-check` | `3b03b65` 2026-11-23 | +0/-16 | — contained | #1008 closed MERGED 2026-11-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ledger-deploy-1911` | `661e26d` 2026-11-19 | +0/-242 | — contained | #963 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ledger-deploy-2011` | `42550ec` 2026-11-19 | +0/-219 | — contained | #969 closed MERGED 2026-11-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ledger-plan-overrides` | `917fdf7` 2026-10-28 | +0/-1045 | — contained | #731 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/legal-text-accuracy` | `5071f7e` 2026-10-18 | +0/-1556 | — contained | #594 closed MERGED 2026-10-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/light-week-summary-chip` | `591ada0` 2026-11-24 | +4/-0 | uniq=4 diff=4 absent=0 same=0 — apps/ios/ASCND/App/WorkoutSummaryView.swift; apps/ios/ASCND/Features/Exercises/ExerciseCompareViews.swift; apps/ios/ASCN | #1014 open -> native/ios-rewrite | ACTIVE | KEEP — work/decision pending; do not delete. |
| `claude/link-gaps` | `0484aef` 2026-11-09 | +0/-599 | — contained | #858 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/main-cutover` | `9ba85f0` 2026-10-28 | +12/-1082 | uniq=0 diff=0 absent=0 same=0 | #723 closed -> main | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/manual-log-redesign` | `cfcecbc` 2026-10-19 | +0/-1531 | — contained | #601 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/meal-chips-fit` | `17b81ec` 2026-11-04 | +0/-766 | — contained | #827 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/meal-notify-action` | `eca65d1` 2026-11-03 | +0/-887 | — contained | #775 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/meal-three-taps` | `1003d93` 2026-10-22 | +0/-1314 | — contained | #657 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/meal-times` | `447c9fd` 2026-11-03 | +0/-872 | — contained | #774 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/meal-widget` | `d8410e3` 2026-11-03 | +0/-885 | — contained | #806 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/modular-3d-all` | `2f805b2` 2026-11-16 | +0/-420 | — contained | #911 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/modular-3d-curl` | `8cbcfef` 2026-11-16 | +0/-435 | — contained | #910 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/modular-equipment` | `96b83b2` 2026-11-16 | +0/-418 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/modular-scene` | `566a778` 2026-11-16 | +0/-410 | — contained | #914 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-audit` | `8c7d959` 2026-11-04 | +0/-748 | — contained | #835 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-kit-batch2` | `1a6b9a6` 2026-11-15 | +0/-482 | — contained | #900 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-kit-market` | `16ceea4` 2026-11-14 | +0/-493 | — contained | #894 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-kit-p1-p5` | `005cef7` 2026-11-14 | +0/-490 | — contained | #897 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-lab` | `db1a9c7` 2026-11-14 | +0/-495 | — contained | #888 closed MERGED 2026-11-14 -> native/ios-rewrite; #887 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/motion-perf` | `feb9833` 2026-10-21 | +0/-1414 | — contained | #638 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/muscle-gpu-timing` | `4c51915` 2026-11-17 | +0/-336 | — contained | #937 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/muscle-map-v2` | `76cbdc9` 2026-11-15 | +0/-450 | — contained | #905 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/muscle-metal` | `a40511b` 2026-11-17 | +0/-338 | — contained | #936 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/muscle-shader` | `2b4ba84` 2026-11-17 | +0/-402 | — contained | #931 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/muscle-shader-wip` | `1ba1a5e` 2026-11-16 | +0/-415 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/native-logging-input-design-1ziiu3` | `a334db3` 2026-07-25 | +0/-4288 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/no-rest-after-last-set` | `077f499` 2026-11-24 | +0/-1 | — contained | #1013 closed MERGED 2026-11-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/notify-rotate` | `40f10b9` 2026-11-03 | +0/-879 | — contained | #807 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/nutrition-redesign` | `dfc6a99` 2026-10-19 | +0/-1506 | — contained | #604 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/offline-sweep` | `1ae8edf` 2026-10-31 | +0/-952 | — contained | #769 closed MERGED 2026-11-01 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/onboarding-v2` | `490fa40` 2026-10-22 | +0/-1291 | — contained | #663 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/painted-fibers` | `b49d4f8` 2026-11-13 | +0/-514 | — contained | #883 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/parity-matrix-gd3` | `064e376` 2026-10-29 | +0/-995 | — contained | #750 closed MERGED 2026-11-01 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/pause-plan-reason` | `f5145ca` 2026-11-03 | +0/-870 | — contained | #805 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/pause-sheet-ax` | `f88eaf4` 2026-11-04 | +0/-745 | — contained | #834 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/plain-tap-areas` | `cc91f36` 2026-11-04 | +0/-759 | — contained | #833 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/plan-linked-logging` | `0bbee2c` 2026-10-23 | +0/-1260 | — contained | #668 closed MERGED 2026-10-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/press-tips` | `5e5fa4d` 2026-11-15 | +0/-473 | — contained | #901 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/product-decision-v1` | `4c84fd9` 2026-10-21 | +0/-1399 | — contained | #640 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/profile-rhythm` | `860aa5c` 2026-11-04 | +0/-773 | — contained | #828 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-a-motion` | `3887d37` 2026-10-22 | +0/-1295 | — contained | #659 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-a-rounded` | `c10a055` 2026-10-22 | +0/-1297 | — contained | #658 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-captions` | `75f356b` 2026-10-24 | +0/-1205 | — contained | #683 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-one-body-entry` | `4c6cb0f` 2026-11-12 | +0/-561 | — contained | #873 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-status` | `71566c2` 2026-10-21 | +0/-1351 | — contained | #649 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-status-colors` | `ec21dae` 2026-10-26 | +0/-1182 | — contained | #692 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/progress-status-mock` | `08cd00f` 2026-10-21 | +10/-1356 | uniq=2 diff=0 absent=2 same=0 — apps/ios/docs/design/apple-health-notes.md; apps/ios/docs/design/mocks/progress-status-words.html | no PR ever | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `claude/pull-to-refresh` | `bd993c2` 2026-10-26 | +0/-1185 | — contained | #691 closed MERGED 2026-10-26 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn` | `e3f8b23` 2026-10-12 | +1/-2169 | uniq=1 diff=0 absent=1 same=0 — PRODUCT.md | #531 closed MERGED 2026-10-08 -> native/ios-rewrite | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |
| `claude/quirky-babbage-4toxjn-ai` | `4e30392` 2026-10-09 | +0/-1905 | — contained | #572 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-awards` | `b37f433` 2026-10-08 | +0/-1935 | — contained | #563 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-backport-log` | `1b267ea` 2026-10-09 | +0/-1898 | — contained | #575 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-biometrics` | `cf5bf8c` 2026-10-08 | +0/-1946 | — contained | #562 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-builder` | `e88ec13` 2026-10-08 | +0/-2137 | — contained | #540 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-celebrate` | `07b08ad` 2026-10-08 | +0/-1928 | — contained | #567 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-challenges` | `48df38f` 2026-10-08 | +0/-1931 | — contained | #566 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-dayplan` | `3b723ab` 2026-10-08 | +0/-2125 | — contained | #547 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-edit-profile` | `a534e3b` 2026-10-08 | +0/-2082 | — contained | #555 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-exercises` | `2554b93` 2026-10-08 | +0/-2129 | — contained | #543 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-guide` | `d38f8af` 2026-10-08 | +0/-2128 | — contained | #544 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-insight` | `4608670` 2026-10-08 | +0/-2127 | — contained | #545 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-manual-log` | `eef7c14` 2026-10-08 | +0/-2143 | — contained | #538 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-mascot` | `0498e55` 2026-10-08 | +0/-1982 | — contained | #556 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-progress` | `69ad6b7` 2026-10-08 | +0/-2126 | — contained | #546 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-readiness` | `ead1d7e` 2026-10-08 | +0/-1955 | — contained | #557 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-reminders` | `765f0b0` 2026-10-08 | +0/-2169 | — contained | #532 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-session-detail` | `244e583` 2026-10-08 | +0/-2086 | — contained | #548 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-settings-account` | `4256b2e` 2026-10-08 | +0/-2085 | — contained | #549 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-trend` | `da02098` 2026-10-09 | +0/-1916 | — contained | #571 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-units` | `0926a36` 2026-10-08 | +0/-2169 | — contained | #534 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-units-b` | `0fa395e` 2026-10-08 | +0/-2154 | — contained | #535 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-units-c` | `1f36902` 2026-10-08 | +0/-2151 | — contained | #536 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-units-d` | `0f2ee35` 2026-10-08 | +0/-2147 | — contained | #537 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-week-plan` | `47c4439` 2026-10-08 | +0/-2130 | — contained | #541 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-weekly` | `62a8170` 2026-10-09 | +0/-1924 | — contained | #569 closed MERGED 2026-10-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/quirky-babbage-4toxjn-wiring` | `4dc91d6` 2026-10-08 | +0/-1933 | — contained | #565 closed MERGED 2026-10-08 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/readiness-consistency` | `0f295cd` 2026-10-19 | +0/-1500 | — contained | #605 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/readiness-fix` | `908b8ff` 2026-10-24 | +0/-1211 | — contained | #679 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/readiness-no-health` | `b5b8e01` 2026-10-20 | +0/-1418 | — contained | #635 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/register-ai-coach-deployed` | `55d10d9` 2026-10-21 | +0/-1359 | — contained | #647 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/register-gd1-gd2-merged` | `4397493` 2026-10-21 | +0/-1374 | — contained | #643 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/remove-koa-turn` | `01f20e9` 2026-11-10 | +0/-579 | — contained | #867 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/rerender-3-roles` | `6464e82` 2026-11-16 | +0/-443 | — contained | #907 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/room-rack-items` | `f2cc4ad` 2026-11-17 | +0/-295 | — contained | #945 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/run-outfit-snapshot` | `7cc1b4c` 2026-11-04 | +0/-733 | — contained | #837 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/settings-cleanup` | `3341028` 2026-11-01 | +0/-943 | — contained | #773 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/shared-branch-collab-g124l0` | `af7235b` 2026-10-13 | +0/-1761 | — contained | no PR ever | STALE_SAFE_TO_DELETE | Delete after backup (no unique content remains). |
| `claude/sheet-large-type` | `8f939c2` 2026-11-03 | +0/-833 | — contained | #814 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/shelf-chrome-olympic` | `f2bb137` 2026-11-08 | +0/-672 | — contained | #852 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/signout-timeout-test` | `a407afd` 2026-11-01 | +0/-943 | — contained | #776 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/signup-fix` | `34c6144` 2026-10-23 | +0/-1279 | — contained | #665 closed MERGED 2026-10-23 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/small-fixes-0411` | `9dc8217` 2026-11-04 | +0/-783 | — contained | #826 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/speech-auth-crash` | `8543ccc` 2026-10-21 | +0/-1414 | — contained | #639 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/squat-shoulder-twist` | `78a819f` 2026-11-16 | +0/-438 | — contained | #909 closed MERGED 2026-11-16 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/stable-checks` | `d51707f` 2026-11-03 | +0/-852 | — contained | #808 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/supabase-dedupe-indexes` | `b23c60f` 2026-11-24 | +0/-4 | — contained | #1012 closed MERGED 2026-11-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/support-site` | `0c7a84b` 2026-10-23 | +0/-1228 | — contained | #673 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tap-collapse-fast` | `83fccde` 2026-11-17 | +0/-286 | — contained | #953 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tellkoa-ai-edit` | `cf4f958` 2026-10-24 | +0/-1201 | — contained | #684 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tellkoa-portion-stepper` | `93d97b1` 2026-10-24 | +0/-1197 | — contained | #686 closed MERGED 2026-10-24 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/template-warmups` | `8cc5e2e` 2026-10-19 | +0/-1530 | — contained | #602 closed MERGED 2026-10-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tempo-calm` | `619f1a7` 2026-11-17 | +0/-304 | — contained | #943 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tempo-motion` | `c0ab3c3` 2026-11-17 | +0/-299 | — contained | #944 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/tips-columns` | `e66ed04` 2026-11-17 | +0/-290 | — contained | #949 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-ask-koa` | `3cc6e9a` 2026-10-22 | +0/-1330 | — contained | #654 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-card-order` | `c4c55f7` 2026-11-17 | +0/-293 | — contained | #948 closed MERGED 2026-11-18 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-day-card-type` | `e7d6e8e` 2026-11-03 | +0/-810 | — contained | #822 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-day-scenes` | `2d701c9` 2026-10-22 | +0/-1326 | — contained | #655 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-hit-region` | `5d4fc25` 2026-11-04 | +0/-759 | — contained | #831 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-insight-health` | `34429d3` 2026-10-21 | +0/-1336 | — contained | #653 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-no-workout-log` | `2557e53` 2026-10-21 | +0/-1338 | — contained | #652 closed MERGED 2026-10-22 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/today-root-swipe` | `6978630` 2026-10-21 | +0/-1416 | — contained | #636 closed MERGED 2026-10-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/trap-mock` | `e8e8f3a` 2026-11-15 | +0/-468 | — contained | #902 closed MERGED 2026-11-15 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/trapezius-neck` | `628b369` 2026-11-17 | +0/-334 | — contained | #938 closed MERGED 2026-11-17 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ui-decisions-802` | `d040ab3` 2026-11-04 | +0/-772 | — contained | #829 closed MERGED 2026-11-04 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/ui-small-fixes` | `e5b6d1d` 2026-11-12 | +0/-566 | — contained | #869 closed MERGED 2026-11-12 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/unify-body-charts` | `9dd53f1` 2026-11-09 | +0/-587 | — contained | #862 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/unify-buttons` | `2188e03` 2026-11-10 | +0/-586 | — contained | #861 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-account-delete` | `7f047d1` 2026-10-27 | +0/-1141 | — contained | #706 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-dead-row` | `2be512e` 2026-10-28 | +0/-1083 | — contained | #718 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-net-retry` | `4b8813d` 2026-10-27 | +0/-1097 | — contained | #714 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-nutrition` | `ccfc9fa` 2026-10-27 | +0/-1131 | — contained | #708 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-offline` | `3714339` 2026-10-27 | +0/-1106 | — contained | #710 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-perf` | `b54d925` 2026-10-27 | +0/-1136 | — contained | #707 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-seed-bodyweight` | `8ad948f` 2026-10-27 | +0/-1099 | — contained | #713 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-sim-recheck` | `fe00e4a` 2026-10-27 | +0/-1104 | — contained | #711 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-small` | `34d631a` 2026-10-27 | +0/-1127 | — contained | #709 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/v5-widget-lang` | `77879a5` 2026-10-27 | +0/-1102 | — contained | #712 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/viewer-navbar-inline` | `e7fd8b2` 2026-11-19 | +0/-257 | — contained | #958 closed MERGED 2026-11-19 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/voice-tap-isolation` | `f15c80b` 2026-10-28 | +0/-1047 | — contained | #730 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/warmup-entry` | `c2a16d2` 2026-11-13 | +0/-515 | — contained | #882 closed MERGED 2026-11-14 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/warnings-cleanup` | `92ba231` 2026-11-03 | +0/-836 | — contained | #820 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/warnings-cleanup-2` | `b043dce` 2026-11-03 | +0/-805 | — contained | #823 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/week-card-stack` | `2f33649` 2026-11-04 | +0/-706 | — contained | #841 closed MERGED 2026-11-05 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/week-day-strip` | `28bf492` 2026-11-13 | +0/-551 | — contained | #878 closed MERGED 2026-11-13 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/week-strip-type` | `e85e892` 2026-11-03 | +0/-833 | — contained | #815 closed MERGED 2026-11-03 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/widget-week` | `d1a8a97` 2026-10-27 | +0/-1144 | — contained | #705 closed MERGED 2026-10-27 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/widgets-planned` | `d4703ff` 2026-10-20 | +0/-1439 | — contained | #624 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/widgets-titanium` | `20c2d6e` 2026-10-20 | +0/-1465 | — contained | #620 closed MERGED 2026-10-20 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/workouts-ax-overflow` | `dc1ebeb` 2026-11-20 | +0/-88 | — contained | #991 closed MERGED 2026-11-21 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `claude/xp-large-type` | `b0d6d88` 2026-10-28 | +0/-1043 | — contained | #733 closed MERGED 2026-10-28 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `cursor/ux-glance-4095` | `619036f` 2026-11-09 | +0/-661 | — contained | #855 closed MERGED 2026-11-09 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `cursor/watch-companion-3479` | `f416698` 2026-11-09 | +0/-589 | — contained | #853 closed MERGED 2026-11-10 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `devin/1773158547-native-ios-capacitor` | `1a59646` 2026-03-10 | +0/-4446 | — contained | #1 closed MERGED 2026-03-10 -> main | MERGED | Delete after backup (all commits reachable from native tip). |
| `devin/1773163072-fix-review-comments` | `5acedf0` 2026-03-10 | +0/-4444 | — contained | #2 closed MERGED 2026-03-10 -> main | MERGED | Delete after backup (all commits reachable from native tip). |
| `devin/1773163525-ios-performance-optimization` | `35f548b` 2026-03-10 | +0/-4442 | — contained | #3 closed MERGED 2026-03-10 -> main | MERGED | Delete after backup (all commits reachable from native tip). |
| `fix/d347-canfinish-drift` | `6e376a6` 2026-10-06 | +0/-2602 | — contained | #450 closed MERGED 2026-10-07 -> native/ios-rewrite | MERGED | Delete after backup (all commits reachable from native tip). |
| `fix/d382-harness-skip` | `abd6647` 2026-10-05 | +1/-2827 | uniq=1 diff=1 absent=0 same=0 — apps/ios/Packages/ASCNDKit/Tests/ASCNDCoreTests/DifferentialHarness.swift | #451 closed -> native/ios-rewrite | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `landing/dark-premium-scroll-story` | `6ba55d6` 2026-10-23 | +14/-4441 | uniq=13 diff=0 absent=13 same=0 — bun.lockb; package.json; src/App.tsx; src/integrations/lovable/index.ts; src/integrations/supabase/client.ts; src/integr | #670 closed -> main | SUPERSEDED | Delete after owner word-diff confirmation + backup. |
| `main` | `234f6b8` 2026-08-25 | +11/-4441 | - — bun.lockb; package.json; src/App.tsx; src/integrations/lovable/index.ts; src/integrations/supabase/client.ts; src/integr | no PR ever | PRIMARY | KEEP — never delete. |
| `native/ios-rewrite` | `5e673df` 2026-11-24 | +0/-0 | — contained | no PR ever | PRIMARY | KEEP — never delete. |
| `worktree-lexical-noodling-finch` | `836f961` 2026-08-25 | +8/-4441 | uniq=8 diff=0 absent=8 same=0 — bun.lockb; native/PRODUCT.md; package.json; src/App.tsx; src/main.tsx; src/pages/MascotLab.tsx; tsconfig.app.json; tscon | #5 closed -> main | RECOVERY_REQUIRED | KEEP — triage decision needed first; do not delete. |

## 4. The 36 branches ahead of the tip — detailed evidence

Only 36 of 549 branches hold commits the tip does not have. Every other branch is fully contained (ahead==0).
“Tip check” = per-file blob comparison of the branch’s unique files against `native/ios-rewrite` tip `5e673df3`.

### 4.1 ACTIVE (7) — keep; work or decision pending

| Branch | SHA | Tip | Ahead | Unique files (tip check) | Evidence / status |
|---|---|---|---|---|---|
| `claude/3d-military-press` | `ee9e1f5` | 2026-11-23 | +1 | 46 files: 38 absent, 8 differ | **PR #1009 OPEN** → `native/ios-rewrite`: “Standing Military Press — họ press_overhead (chờ Kiệt duyệt động tác)”, QA 18/19. Awaiting Kiệt’s movement approval. |
| `claude/light-week-summary-chip` | `591ada0` | 2026-11-24 | +4 | 4 files, all differ | **PR #1014 OPEN** → `native/ios-rewrite`: chip “Buổi nhẹ”. Only branch besides the tip itself with behind==0 (contains the tip). |
| `claude/3d-character-005` | `ca9f550` | 2026-11-24 | +11 | 128 files: 95 absent, 33 differ | **No PR ever.** Newest tip in the repo (2026-11-24). Master character 005: `master_character.blend`, `character_005.usdz`, muscle atlas, `ExerciseDemoBlendShapes.swift` (baked blend shapes). In-progress 3D character work — do not delete. |
| `agent/c/koa-mascot-system` | `e96d7c2` | 2026-11-21 | +1 | 17 files, all absent | **No PR.** 10 mascot-system docs + PoC (`docs/audits/koa-mascot-system-2026-11-21/`). Posted to #527 as comment 7069678295; awaiting Kiệt’s Option A/B/C choice + Claude’s review. |
| `agent/c/koa-audit-2026-11-17` | `657478c` | 2026-11-17 | +1 | 2 files, both absent | **No PR.** Koa audit report + 60 task specs (`docs/audits/koa-2026-11-17/`), posted to #527 comment 6969768502. Reference docs with open decision gates. |
| `agent/c/backend-audits` | `00d045c` | 2026-11-12 | +1 | 11 files, all absent | **No PR.** Backend/Supabase audit reports rounds 1–2 + beta-gate decisions (`docs/audits/`). Reference docs; beta-gate decisions still parked with Kiệt. |
| `claude/character-ref-proportions` | `0446c2b` | 2026-11-16 | +1 | 62 files: 61 differ, 1 absent | **No PR.** Character 003 rebuild to Kiệt’s 16/11 photo proportions (head ~8.3, shoulders 0.30 H). “Chờ Kiệt duyệt, chưa xuất lại bài”. Awaiting approval. |

### 4.2 RECOVERY_REQUIRED (7) — keep; substantive unique work, needs a triage decision

| Branch | SHA | Tip | Ahead | Unique files (tip check) | Evidence / status |
|---|---|---|---|---|---|
| `agent/c/bench-finalize` | `a51f0f8` | 2026-11-15 | +9 | 15 files, all differ | **PR #896 closed unmerged.** Bench-press 3D finalization (ExerciseDemo3D*, `bench_press_animation.usdz`, catalog notes). Closed by deferring 3D Release until the pose is finalized — work parked, NOT integrated. |
| `agent/c/curl-finalize` | `57a42bc` | 2026-11-15 | +6 | 9 files, all differ | **PR #895 closed unmerged.** Dumbbell-curl finalization (same pattern as #896; “Curl: … APPROVED” note). Deferred with #896. |
| `agent/c/append-vectors` | `25dcd21` | 2026-10-05 | +1 | 2 files, **both absent from tip** | **PR #360 closed unmerged** (#322: append-set golden vectors). `native/tools/append-vectors.mjs` + `spec/vectors/append-set.json` exist NOWHERE on the tip — the golden-vector work never landed. |
| `agent/c/pr-vectors` | `e048111` | 2026-10-05 | +1 | 2 files: 1 absent (`spec/vectors/personal-record.json`), 1 differs | **PR #358 closed unmerged** (#321: Personal Record golden vectors). Same pattern as #360. |
| `claude/progress-status-mock` | `08cd00f` | 2026-10-21 | +10 | 2 files, both absent | **No PR ever.** Progress design mocks v1–v10 (`apps/ios/docs/design/mocks/progress-status-words.html`, `apple-health-notes.md`). Design reference; decide keep-or-drop. |
| `claude/quirky-babbage-4toxjn` | `e3f8b23` | 2026-10-12 | +1 | 1 file, absent | **PR #531 MERGED 2026-10-08 — but the branch has 1 later commit** adding root `PRODUCT.md`, which is absent from the tip. Trivial (1 docs file) but genuinely unmerged. |
| `worktree-lexical-noodling-finch` | `836f961` | 2026-08-25 | +8 | 8 files, all absent | **PR #5 closed unmerged → `main`.** “Add PRODUCT.md for ASCND (native/) via impeccable init”. Web files superseded, but `native/PRODUCT.md` is a docs file with no copy on the tip. |

### 4.3 SUPERSEDED (14) — delete after owner word-diff confirmation + backup

| Branch | SHA | Tip | Ahead | Evidence |
|---|---|---|---|---|
| `claude/koa-turn-clip` | `2b57b28` | 2026-11-10 | +3 | **PR #864 closed unmerged.** Fixed the turned Koa face clipping. Moot: tip commit `025a218c` (“revert(koa): drop the Koa V2 2.5D face turn — back to the pre-V2 face shift (#527)”) reverted the feature this fix targets. |
| `claude/b-train-1` | `719e54e` | 2026-10-08 | +8 | **PR #539 closed unmerged.** “Train” aggregation of B’s quirky-babbage branches (74 files; 29 byte-identical to tip, 45 evolved). Constituents demonstrably landed separately: WeightUnit via tip commits `7df771ab`, `961a2b16`, `fd1f3d80`; `OnboardingFlowView.swift` has 5+ tip commits (`b7a57cb9`, `943041b8`, …). |
| `agent/a/outbox-store` | `b437eee` | 2026-10-05 | +2 | **PR #250 closed → `agent/a/sync-core`** (stacked chain). Outbox feature landed via tip commits incl. `2085ea43` (“[A] ASCNDStore: outbox trên SQLite (GRDB 7)”), `1324b615` (sync bounds). |
| `agent/a/rest-lab` | `79dc0ce` | 2026-10-05 | +1 | **PR #253 closed → `agent/a/live-activity`** (stacked chain). RestLab files exist in tip in evolved form. |
| `agent/a/sync-core` | `b91e22f` | 2026-10-05 | +1 | **PR #242 closed → `agent/a/rest-timer-core`** (stacked chain). Sync/Outbox files exist in tip in evolved form. |
| `agent/c/async-states` | `d0ec931` | 2026-10-05 | +2 | **PR #337 closed → `agent/c/ds-components`** (stacked chain). DSAsyncState exists in tip in evolved form. |
| `agent/c/finish-flow` | `531d6cf` | 2026-10-05 | +2 | **PR #354 closed → `native/ios-rewrite`.** Finish→Summary→Today flow exists in tip in evolved form. |
| `agent/c/today-skeleton` | `5f39aa0` | 2026-10-04 | +1 | **PR #284 closed → `agent/c/ds-components`** (stacked chain). Today/DS files exist in tip in evolved form. |
| `agent/c/ds-pass2` | `1431cd9` | 2026-10-05 | +1 | **PR #341 closed.** `DSButton.swift` exists in tip in evolved form. |
| `agent/c/c52-ios-ci-gate` | `25869c3` | 2026-10-05 | +1 | **PR #519 closed.** Unique file is `.github/workflows/ios.yml` — the workflow EXISTS on the tip and is active; the branch’s addition landed via another route. |
| `fix/d382-harness-skip` | `abd6647` | 2026-10-05 | +1 | **PR #451 closed.** `DifferentialHarness.swift` exists in tip in evolved form. |
| `agent/c/parity-workout-fixes` | `c91ee0a0` | 2026-10-08 | +2 | **PR #526 closed unmerged** (noted in MEMORY: “#490 NO-GO — B/D refresh pending”; #526 unreviewed 7+ days). RN-parity work; parity was officially DROPPED 2026-11-17, so the remaining delta is explicitly unnecessary. |
| `claude/ios-fitness-rebuild-fiyl9k` | `513319c` | 2026-08-01 | +1 | **No PR.** 2 files under `native/src/` (RN). RN build officially DROPPED 2026-11-17 — explicitly unnecessary. |
| `landing/dark-premium-scroll-story` | `6ba55d6` | 2026-10-23 | +14 | **PR #670 closed unmerged → `main`.** 13 unique files, ALL old web app (`src/`, `bun.lockb`, `package.json`, `src/pages/MascotLab.tsx`). Web dropped 2026-11-17; current landing assets are the `marketing/` videos on the tip. |

### 4.4 UNCERTAIN (4) — keep; investigate before any deletion

| Branch | SHA | Tip | Ahead | Why uncertain |
|---|---|---|---|---|
| `claude/koa-room-wander` | `00c000b` | 2026-10-24 | +1 | **PR #687 closed unmerged.** “Koa đi lại trong phòng bằng những cú nhảy”. `MascotRoomView.swift`/`KoaFigureView.swift` exist in tip with heavy later history (room work continued via #1004/#1006–#1008), but no tip commit message mentions the wander/jump behavior — cannot confirm whether the behavior survives or was dropped. Needs a code-level check. |
| `claude/character-build-medium` | `57599f8` | 2026-11-17 | +1 | **No PR.** Character 003 build 2 “Khoẻ vừa” (Kiệt chose 17/11), “CHƯA render lại bài”. 7 files differ from tip. Likely superseded by `character-ref-proportions` / `3d-character-005`, but the `.blend` content differs and no decision is recorded — needs the 3D owner’s call. |
| `agent/d/d28-contract-fix` | `25869c3` | 2026-10-05 | +1 | **PR #493 closed → `agent/c/adhoc-exercise-ui`.** Unique files `ExtraExerciseModels.swift` / `ExtraExerciseRow.swift` are ABSENT from the tip — the target code was removed/refactored away, so the fix may be moot OR the contract alignment may still be missing. Cannot tell without a word-diff against the refactor. |
| `agent/d/pr-backlog-classification` | `ad74455` | 2026-10-05 | +1 | **No PR.** D-31: `PR-BACKLOG-CLASSIFICATION.md`, absent from tip. Process doc classifying legacy PRs; the classification was presumably consumed when the backlog was cleared, but no record confirms it. |

### 4.5 STALE_SAFE_TO_DELETE from the ahead>0 set (3) — delete after backup

| Branch | SHA | Tip | Ahead | Proof of no unique content |
|---|---|---|---|---|
| `claude/main-cutover` | `9ba85f0` | 2026-10-28 | +12 | **0 unique files.** Tip tree == merge-base tree. Its 12 commits are the 11 main commits + 1 join commit (“Đưa main sang ASCND native iOS…”). PR #723 closed unmerged. All 11 main commits still exist on `main`; the join commit is reconstructible and its attempt is documented in #723. |
| `claude/gd3-four-areas` | `6bcaf07` | 2026-10-21 | +2 | 1 unique file, **byte-identical to the tip** (`apps/ios/docs/design/mocks/gd3-four-areas.html`). No unique content. No PR ever. |
| `claude/b-l10n-probe` | `f7c5ed7` | 2026-10-07 | +3 | 1 unique file (`L10nProbeTests.swift`), absent from tip — but the commits say so explicitly: “[B] THỬ NGHIỆM (không merge)” — an experiment, explicitly not for merging. Explicitly unnecessary by its own author. |

## 5. `main` vs `native/ios-rewrite`

| Aspect | `main` | `native/ios-rewrite` |
|---|---|---|
| Role | Default branch; old Lovable web app | Official app branch (source of truth) |
| Tip SHA | `234f6b80b2646f84d41342108d48d56781adc30a` | `5e673df3f3614ee5d4070a4177e4adad767c1af9` |
| Tip date | 2026-08-25T15:15:02Z — “Thêm OTP phone login” (X-Lovable-Edit-ID: edt-4f3418b9-bf5b-45f8-9745-6b1688bee09e) | 2026-11-24T17:28:39Z — merge PR #1013 |
| Total commits | 360 | 4,790 |
| Files at tip | 217 | 4,077 |
| Merge-base | `374a00afe76e1190838678206a6288c6a4ef9a71` (shared) | same |
| Compare | behind native by 4,441 commits; ahead of native by **11 commits** | ahead of main by 4,441; behind by 11 |
| Branch protection | none | none |
| `.github/workflows/` | absent (404) | 8 files (all except CodeQL) |
| PRs targeting it | 6 total: #1, #2, #3 merged (Mar 2026, Devin Capacitor work); #5, #670, #723 closed unmerged; **0 open** | 591 total; 2 open (#1009, #1014) |
| CI references | yes — push triggers in `ios.yml`, `quality-gate.yml`, `sql-community.yml`, `motion-kit.yml` name `main`; scheduled runs are read from the default branch (see §1.1) | yes — primary CI target |

### 5.1 The 11 commits unique to `main` — all Lovable web-app work, no native value

| SHA | Date | Message | Files touched |
|---|---|---|---|
| `0c7c4a7` | 2026-07-19 | Work in progress | `bun.lockb` |
| `c375177` | 2026-07-19 | Changes | `src/App.tsx`, `src/pages/MascotLab.tsx` (added) |
| `b81f686` | 2026-07-19 | Changes | `tsconfig.app.json`, `tsconfig.json` |
| `5d52eda` | 2026-07-19 | Changes | `src/main.tsx` |
| `aa20ed6` | 2026-07-19 | Added mascot-lab page | `bun.lockb`, `src/App.tsx`, `src/main.tsx`, `src/pages/MascotLab.tsx`, `tsconfig.*` |
| `a1b48da` | 2026-07-19 | Work in progress | `bun.lockb`, `package.json` |
| `2b4c3fa` | 2026-07-19 | Lovable update | `bun.lockb`, `package.json` |
| `2554d7c` | 2026-08-25 | Work in progress | `src/integrations/supabase/client.ts`, `src/integrations/supabase/previewAuthStorage.ts` (added) |
| `e647e8b` | 2026-08-25 | Changes | `src/integrations/lovable/index.ts` |
| `180cce8` | 2026-08-25 | Changes | `src/lib/i18n.ts` |
| `234f6b8` | 2026-08-25 | Thêm OTP phone login | `src/integrations/lovable/index.ts`, `src/integrations/supabase/client.ts`, `src/integrations/supabase/previewAuthStorage.ts`, `src/lib/i18n.ts` |

Unique content in total: 11 files, all under the old web app (`src/*`, `bun.lockb`, `package.json`, `tsconfig.*`).
**No `supabase/` migrations, no `native/` or `apps/ios/` files, no `docs/` files** among them. The only feature-level content
is the OTP phone login (`previewAuthStorage.ts`) and the `MascotLab.tsx` web page — both web-only, superseded by the
2026-11-17 decision that the RN/web builds are dropped and native is the standard.

### 5.2 Verdict on `main`

- **Do NOT delete `main`.** It is the default branch, it is the only ref holding the 11 Lovable-era commits, and CI
  (push triggers + scheduled-run source) references it. Deleting the default branch would also break the default-branch
  assumptions of every scheduled workflow.
- **Recommendation (for Kiệt, not W1 to execute):** decide whether to switch the default branch to `native/ios-rewrite`
  (which would fix the scheduled-workflow problem in §1.1 and make the repo’s default match the real app), or to sync the
  8 workflow files onto `main`. Until that decision, `main` stays as PRIMARY. If the default branch is ever switched,
  `main` can be kept as a plain historical branch — its 11 commits are already preserved in the repo history either way.
- **PRs still targeting `main`:** none open. The last attempt, PR #723 (`claude/main-cutover`, the history-join cutover),
  was closed unmerged on 2026-10-28; the cutover happened by convention (native became the app branch) instead of by merge.

## 6. Deletion-proposal table (READ-ONLY — nothing was deleted)

Backup advised for EVERY row: before deleting, take a bundle (`git bundle create`) or a tag (`archive/<branch>-2026-11-28`)
of the branch tip. Deletion itself needs Kiệt’s explicit approval (per the 2026-11-28 mission note in MEMORY.md).
Order: (A) proven-safe individual branches, (B) the bulk merged set, (C) superseded branches pending a word-diff check.

### 6A. Proven safe — delete after backup (28 branches)

| Branch | SHA | Evidence | Unique commits | PR / issue refs | Consequences | Backup advised |
|---|---|---|---|---|---|---|
| `claude/main-cutover` | `9ba85f0` | 0 unique files; tip tree == merge-base tree | 12 (11 main commits + 1 join commit) | PR #723 closed unmerged | None — all commits reachable from `main` (+native); join attempt documented in #723 | Yes — tag the join commit |
| `claude/gd3-four-areas` | `6bcaf07` | 1 unique file, byte-identical to tip | 2 | No PR | None | Yes |
| `claude/b-l10n-probe` | `f7c5ed7` | 1 probe test file; commits marked “THỬ NGHIỆM (không merge)” | 3 | No PR | None — experiment, explicitly not for merging | Yes |
| `agent/a/a25-insights` | (see §3) | ahead==0, contained in tip | 0 | PR #437 closed → `agent/a/a24-manual-log` (stacked chain) | None — commits reachable from tip | Yes |
| `agent/a/a26-library` | (see §3) | ahead==0, contained in tip | 0 | PR #438 closed → `agent/a/a25-insights` | None | Yes |
| `agent/a/a27-library-write` | (see §3) | ahead==0, contained in tip | 0 | PR #439 closed → `agent/a/a26-library` | None | Yes |
| `agent/a/a28-guide` | (see §3) | ahead==0, contained in tip | 0 | PR #440 closed → `agent/a/a27-library-write` | None | Yes |
| `agent/a/a29-change-password` | (see §3) | ahead==0, contained in tip | 0 | PR #441 closed → `agent/a/a28-guide` | None | Yes |
| `agent/a/a30-onboarding` | (see §3) | ahead==0, contained in tip | 0 | PR #442 closed → `agent/a/a29-change-password` | None | Yes |
| `agent/a/a31-profile` | (see §3) | ahead==0, contained in tip | 0 | PR #443 closed → `agent/a/a30-onboarding` | None | Yes |
| `agent/a/live-activity` | (see §3) | ahead==0, contained in tip | 0 | PR #252 closed → `agent/a/rest-controller` | None | Yes |
| `agent/a/rest-controller` | (see §3) | ahead==0, contained in tip | 0 | PR #251 closed → `agent/a/rest-timer-core` | None | Yes |
| `agent/c/summary-seam` | (see §3) | ahead==0, contained in tip | 0 | PR #292 closed → `agent/c/summary-screen` | None | Yes |
| `claude/b-theme-lang` | (see §3) | ahead==0, contained in tip | 0 | PR #533 closed → `claude/b-wiring` | None | Yes |
| `claude/b-batch1` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-batch2` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-batch3` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-batch4` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-batch5` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-batch6` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-handoff-s0gs64` | (see §3) | ahead==0, contained in tip; shares tip `d42d22b` with `agent/a/a40-workout-fence` | 0 | No PR ever | None (twin branch keeps the same tip) | Yes |
| `claude/b-integration-wip` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/b-wip-n3n4-qa` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/hai-nhanh-con-lai-cd1mx7` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/modular-equipment` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/muscle-shader-wip` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None (WIP handover merged; tip note is a handover, not live work) | Yes |
| `claude/native-logging-input-design-1ziiu3` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |
| `claude/shared-branch-collab-g124l0` | (see §3) | ahead==0, contained in tip | 0 | No PR ever | None | Yes |

### 6B. Bulk merged set — delete after backup (486 branches)

| Scope | Evidence | Unique commits | PR refs | Consequences | Backup advised |
|---|---|---|---|---|---|---|
| ALL 486 branches classified MERGED in §3 (ahead==0 + merged PR) | Every commit on each branch is an ancestor of tip `5e673df3` (`git rev-list --left-right --count` = 0 ahead for all 486); each has ≥1 merged PR (581 merged PRs total in repo). No open PR touches any of them. No workflow names any of them (only `claude/**`, `agent/**`, `native/**`, `main` patterns). No deployments/environments exist. | 0 per branch | See §3 “Dependencies” column per branch (merged PR numbers) | None to history — deleting a ref whose commits are all reachable from `native/ios-rewrite` loses no objects; the PR number preserves traceability. Only loss is the branch NAME. | Yes — one `git bundle` of all 486 tips (or `archive/` tags) before the batch delete; delete in small batches and re-verify `git rev-list` counts after each batch. Precedent: 93 merged PRs already have no live head branch. |

### 6C. Superseded — propose only after an owner word-diff confirmation (14 branches)

For these, the files exist in the tip in evolved form, so line-level survival of each branch’s change is NOT yet proven.
Do NOT delete until the named owner confirms (by word-diff) that the change survives in the tip or is genuinely unneeded.

| Branch | SHA | Evidence | Unique commits | PR / issue refs | Consequences if deleted now | Backup advised |
|---|---|---|---|---|---|---|
| `claude/koa-turn-clip` | `2b57b28` | Feature reverted on tip (`025a218c`) | 3 | PR #864 closed | Low — fix targets reverted code | Yes |
| `claude/b-train-1` | `719e54e` | Constituents landed separately (WeightUnit `7df771ab`/`961a2b16`; OnboardingFlowView `b7a57cb9`…) | 8 | PR #539 closed | Low–medium — confirm no unique fix hides in the 45 differing files | Yes |
| `agent/a/outbox-store` | `b437eee` | Outbox landed (`2085ea43`, `1324b615`) | 2 | PR #250 closed (stacked) | Low — confirm by word-diff | Yes |
| `agent/a/rest-lab` | `79dc0ce` | RestLab files in tip, evolved | 1 | PR #253 closed (stacked) | Low — confirm by word-diff | Yes |
| `agent/a/sync-core` | `b91e22f` | Sync files in tip, evolved | 1 | PR #242 closed (stacked) | Low — confirm by word-diff | Yes |
| `agent/c/async-states` | `d0ec931` | DSAsyncState in tip, evolved | 2 | PR #337 closed (stacked) | Low — confirm by word-diff | Yes |
| `agent/c/finish-flow` | `531d6cf` | Finish flow in tip, evolved | 2 | PR #354 closed | Low — confirm by word-diff | Yes |
| `agent/c/today-skeleton` | `5f39aa0` | Today/DS files in tip, evolved | 1 | PR #284 closed (stacked) | Low — confirm by word-diff | Yes |
| `agent/c/ds-pass2` | `1431cd9` | DSButton in tip, evolved | 1 | PR #341 closed | Low — confirm by word-diff | Yes |
| `agent/c/c52-ios-ci-gate` | `25869c3` | `ios.yml` exists and is active on tip | 1 | PR #519 closed | Very low — the workflow file itself is the proof | Yes |
| `fix/d382-harness-skip` | `abd6647` | DifferentialHarness in tip, evolved | 1 | PR #451 closed | Low — confirm by word-diff | Yes |
| `agent/c/parity-workout-fixes` | `c91ee0a0` | RN parity dropped 2026-11-17 | 2 | PR #526 closed | Low — parity work is explicitly unnecessary | Yes |
| `claude/ios-fitness-rebuild-fiyl9k` | `513319c` | RN files only; RN dropped | 1 | No PR | Very low | Yes |
| `landing/dark-premium-scroll-story` | `6ba55d6` | Web-only files; web dropped; landing assets now `marketing/` videos | 14 | PR #670 closed → `main` | Low — only if a web landing page is ever wanted again; the branch is then the sole copy | Yes |

### 6D. Explicitly NOT proposed for deletion

- **PRIMARY (3):** `native/ios-rewrite`, `main`, `claude/ios-fitness-rebuild-omgulr` (`fac9ac2` frozen forensic baseline).
- **ACTIVE (7):** §4.1 — open PRs #1009/#1014 and pending decisions (Koa mascot options, 3D character 005, proportions approval, audit reference docs).
- **RECOVERY_REQUIRED (7):** §4.2 — bench/curl finalize (#895/#896 deferred), append/pr vectors (#358/#360), progress mocks, PRODUCT.md docs, worktree PRODUCT.md.
- **UNCERTAIN (4):** §4.4 — koa-room-wander, character-build-medium, d28-contract-fix, pr-backlog-classification.

## 7. Findings by confidence

### CONFIRMED

- Repo is `dnganhkiet1206/fitness-os`, ID 1156734344, public, default `main`, created 2026-02-13, ~1.37 GiB, 0 tags, 0 releases, no submodules, no branch protection on `main` or `native/ios-rewrite`, no rulesets/environments/deployments (API paths in §1).
- `native/ios-rewrite` tip is `5e673df3` (2026-11-24), matching the mission start tip.
- **549 branches exist** (API pp.1–6 + empty p.7 = `git ls-remote --heads`); the first-100-only view would have missed 449.
- 513 branches are fully contained in the tip (ahead==0); only 36 hold any unique commits; max ahead is 14.
- 615 PRs: 2 open (#1009 `claude/3d-military-press`, #1014 `claude/light-week-summary-chip`), 581 merged, 32 closed-unmerged; 6 targeted `main`, 591 targeted `native/ios-rewrite`.
- `main` holds exactly 11 unique commits (all Lovable web, Jul–Aug 2026, 11 web-only files); no migrations, no native files, no docs.
- `codeql.yml` is listed by the Actions API but exists on neither tip.
- Frozen baseline `claude/ios-fitness-rebuild-omgulr` tip is `fac9ac2` (2026-10-04), fully contained in the tip (ahead==0, behind 2,864).
- The 486 MERGED branches lose no git objects if deleted (ahead==0 ⇒ all commits reachable from the tip); 93 merged PRs already have no live head branch (past deletions happened).

### STRONGLY SUSPECTED

- Scheduled CI (nightly E2E 03:30 UTC, A11y 04:15 UTC, weekly iOS analysis, system-check 01:00 UTC) is plausibly NOT running, because GitHub reads schedule/workflow_dispatch definitions from the default branch `main`, which has no `.github/workflows/` directory. The workflow files themselves document this behavior in their headers. Needs an Actions-runs check to confirm (not done by W1).
- The Oct 4–8 stacked-chain branches (§4.3, 12 branches) had their features land via successor branches — supported by tip file history (Outbox `2085ea43`, WeightUnit `7df771ab`/`961a2b16`, OnboardingFlowView `b7a57cb9`) — but line-level proof per branch still needs a word-diff; hence SUPERSEDED, not STALE_SAFE_TO_DELETE.

### POTENTIAL RISK

- **No branch protection anywhere.** `native/ios-rewrite` and `main` are both unprotected (404 on the protection API). A force-push or accidental delete of the app branch is currently possible by anyone with push access. Recommend enabling protection on `native/ios-rewrite` at minimum (Kiệt’s decision; W1 took no action).
- **549 branches with no naming/retention discipline.** 486 merged branches are still live refs; without a periodic sweep the list will keep growing and the “which branch is real?” question will recur. The §6B bulk delete (after backup + approval) closes this.
- **Single-copy unique work on 7 RECOVERY branches** (notably `claude/3d-character-005` is ACTIVE, but bench/curl finalize and the two golden-vector branches hold the only copies of their files). Any branch cleanup that touches them before triage would destroy unmerged work.
- `main` as default branch while all real work targets `native/ios-rewrite` silently misdirects scheduled CI and any tooling that assumes “default = app”.

### UNVERIFIED

- Whether the scheduled workflow runs are actually failing/absent (no Actions-run listing was pulled; needs the CI worker or a direct runs check).
- Line-level survival of the 12 SUPERSEDED branches’ changes in the tip (word-diff per branch, §6C).
- Whether the Koa room “wander/jump” behavior survives in the tip (UNCERTAIN, §4.4).
- Whether the D-28 contract alignment survives the refactor that removed `ExtraExerciseModels.swift`/`ExtraExerciseRow.swift` (UNCERTAIN, §4.4).
- Whether `PR-BACKLOG-CLASSIFICATION.md` (D-31) was consumed when the PR backlog was cleared (UNCERTAIN, §4.4).

## 8. What W1 could NOT verify and why

1. **Open-issue dependencies per branch.** The brief requires “no open PR/issue/workflow/deployment depends on it” before STALE. Open PRs (2), workflows (patterns only, §1.1) and deployments (none) were checked for all branches; open *issues* were NOT cross-checked per branch (549 branches × issue search is infeasible in this window, and issue bodies reference branches inconsistently). Mitigation: the 28 STALE branches are all ≥5 weeks old with closed/no PRs and no unique content, so an issue dependency is unlikely — but Kiệt/owner should confirm for the 3 ahead>0 STALE branches (`main-cutover`, `gd3-four-areas`, `b-l10n-probe`) before deleting.
2. **Live CI / Actions run state.** No simulator/Xcode exists on this VM (per brief) and no Actions-run history was pulled; the scheduled-workflow finding in §1.1 is therefore STRONGLY SUSPECTED, not CONFIRMED.
3. **Device/simulator verification of any branch’s content.** Not possible on this VM; no such claim is made anywhere in this report.
4. **Whether any agent is actively using a branch right now.** Determined only by recency (tip dates) and open PRs; a local-only checkout by A/B/D cannot be seen from GitHub. The ACTIVE set is therefore conservative (recent + open PRs + known pending decisions).
5. **The shared clone’s sparse-checkout state.** `~/workspace/ascnd-review` was deliberately NOT modified; all full-history work happened in the scratch clone `/tmp/w1-clone` (blob:none, no checkout). The scratch clone still exists for re-verification and can be deleted at will.
6. **Exact SHAs for the 25 contained branches in §6A** are given as “(see §3)” rather than repeated — the §3 table is the authoritative per-branch record (SHA7 + date).

---
**End of W1 report.** All 549 branches inventoried; 36 hold unique commits; 486 merged + 28 stale proposed for deletion (after backup + Kiệt’s approval); 7 need recovery triage; 4 need investigation; 3 are primary and must stay.
