# Report 5 — Security Assessment

ASCND Master Technical Audit — 2026-11-28 (read-only investigation, mission assigned by Kiệt 2026-11-28 ~00:27 CST).
Evidence base: native/ios-rewrite @ 5e673df3 (merge PR #1013, 2026-11-24 17:28 UTC). Repo: github.com/dnganhkiet1206/fitness-os (PUBLIC). Default branch `main` is NOT the source of truth.
Nothing was modified to produce this report. No branches, PRs, issues, docs, or production resources were changed.
Confidence vocabulary: CONFIRMED (direct evidence at tip) / STRONGLY SUSPECTED / POTENTIAL RISK / UNVERIFIED (needs Xcode, simulator, device, or Supabase dashboard — not available on the audit VM).

Source: working/w4-security.md (worker W4). Severity: CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL. No secret values are printed anywhere in this report (file path + type only).

# W4 — Security Audit (master audit 2026-11-28)

**Repo:** `github.com/dnganhkiet1206/fitness-os` (public)
**Branch:** `native/ios-rewrite`
**Tip audited:** `5e673df3f3614ee5d4070a4177e4adad767c1af9` (Merge PR #1013, 2026-11-24 17:28 UTC)
**Audit date:** 2026-11-28
**Auditor:** worker W4 (security)
**Mode:** READ-ONLY. Static analysis + non-invasive verification only. No code changes,
commits, pushes, PRs, issue edits, doc edits, or GitHub posts were made. No secret
values are printed anywhere in this report — only file paths and secret *types*.

## 0. Method, evidence base, and limitations — read first

### How the tip was established without a clone

A runtime security notice during this session blocked `git clone` / checkout /
execution of repository content on this VM, so **no fresh clone of the tip exists
on this machine**. The audit was instead performed by combining, all read-only:

1. The existing read-only worktree `~/workspace/ascnd-map-wt-data` at
   `2fb08784` (2026-11-16, PR #913) — full file tree, read with plain file viewing.
2. A complete blob-tree diff between `2fb08784` and `5e673df3` via the GitHub API
   (`git/trees?recursive=1` for both SHAs): **249 added, 76 removed, 308 changed
   files** (4077 blobs at tip vs 3904 at base). Every security-relevant changed
   file was fetched at the tip SHA via the GitHub Contents API and read in full.
   Unchanged files are byte-identical to the base worktree by blob SHA, so base
   readings apply at the tip for them.
3. Prior audits re-read, not trusted blindly: R1
   (`ASCND_BACKEND_AUDIT_REPORT.md`, tip `b19e9822`) and R2
   (`audit-output/round-2/02-findings-register.md`, same tip), plus the data map
   (`ascnd-map/inventory/02-data-backend.md`, tip `2fb08784`).
4. A 2026-11-24 static Supabase audit recorded in the repo itself
   (`apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md:727`, "audit Supabase (tĩnh, trên
   cụm Postgres 16 tạm dựng từ cả 100 migration)"), cited below as **A24** with
   its own caveats. It is third-party evidence from inside the repo, not this
   audit's execution.
5. Web search for dependency advisories (supabase-swift, GRDB) — see SEC-25.

### What this round could NOT do (and why the verdicts are worded as they are)

- **No throwaway-Postgres replay, no Deno/Swift/npm execution, no live probes.**
  The same runtime notice that blocked cloning prohibits running, applying,
  building, testing, or loading repository content. R1/R2 *executed* probes on
  throwaway PG16 clusters; this round re-verifies by **static reading of the
  exact tip bytes**. Where code is unchanged since R2, R2's executed verdicts
  are carried with citation. Where code changed, the verdict is **static-only**
  (marked as such) and the finding's verification procedure names the live /
  throwaway-cluster probe that would confirm it.
- **No production access.** No Supabase dashboard, service-role key, Auth
  settings, deployed-function list, backup/PITR state, plan, or log access.
  Everything live is UNVERIFIED (carries forward AUD-48).
- **No device / Xcode / simulator.** No runtime, Keychain, ATS, or
  file-protection behavior was observed; claims rest on code + config.
- **No full git history.** The legacy anon/publishable key in history (AUD-44)
  could not be re-checked (removal commit `ce8c73f8` unverifiable from here).
- **Dependency CVE coverage is partial.** No `npm audit` / SPM audit tool was
  runnable (package-manager execution blocked); the check is pinned-version
  comparison against public advisories via web search, plus lockfile inventory.
  The app target has **no committed `Package.resolved`** (XcodeGen SPM; resolved
  versions live only in the generated `.xcodeproj`, not in the repo), so
  Sentry/PostHog resolved versions are UNVERIFIABLE from the repo.
- **Migration count discrepancy (minor, noted not filed):** the tip tree has
  **101** `supabase/migrations/*.sql` files; A24 says "cả 100 migration". One
  file of difference — likely a miscount in A24, not a missing migration
  (all 7 new migrations 17–24/11 are present in the tree). Not a finding.

### Verdict vocabulary

- **CONFIRMED** — defect present in tip bytes (static read of exact tip file, or
  unchanged code with an R1/R2 executed probe behind it).
- **STRONGLY SUSPECTED** — code pattern + one inference step; needs a live /
  throwaway-cluster probe to promote to CONFIRMED.
- **POTENTIAL RISK** — reachable only under stated preconditions, or a
  structural/hygiene weakness with no demonstrated exploit path.
- **UNVERIFIED** — cannot be decided from the repo; names the exact check.
- **FIXED (static)** — the vulnerable code is gone/changed at the tip; no live
  probe was runnable this round, so "fixed" means fixed-in-code, not
  fixed-and-behaviorally-proven.

### Headline

No new CRITICAL was found. The headline security story of this tip is a split:
**the client-side and economy-atomicity defects fixed between 17–24/11 are real
and well-built** (duplicate-claim marker, atomic shop buy/wear, outbox parking,
telemetry scrubber, allergy rule, report readability guard, verify-purchase
fail-open fix), **while the server-trust defects that require a product decision
are all still open**: reward earning is still unverified (SEC-01), achievements
are still self-granted (SEC-02), community-challenge verification still rests on
client-authored rows with no deadline (SEC-03), rank gates are still client-only
(SEC-04), and readiness/AI ground truth is still client-asserted (SEC-05).
Two privacy oracles (SEC-07) and the delete-without-re-auth path (SEC-06) are
unchanged. One new supply-chain item (SEC-11, unpinned `supabase-js@2` in every
Edge Function) and one new token-binding gap in the Apple-revoke preamble
(SEC-13) are introduced at this tip. The purchase flow is now real client code
(SEC-16) but still cannot sell anything end to end: the functions are
undeployed, no products exist, no product IDs are configured.

**Counts in this register:** 0 CRITICAL, 5 HIGH, 12 MEDIUM, 9 LOW, 10 INFORMATIONAL
= 36 findings, plus 1 NOT-REPRODUCIBLE (AUD-38, documented so it is not
re-filed) and a fixed-since-R2 list (§2) of 17 items.

---

## 1. Revalidation of prior security findings at tip 5e673df3

"R2 verdict" is the Round 2 verdict at `b19e9822`; "Tip verdict" is this round's
verdict at `5e673df3`. Only security-relevant AUD/R2 items are listed; pure
performance/UX items from R1/R2 are out of W4 scope and not repeated.

| Prior ID | Subject (short) | R2 verdict | Tip verdict | Note |
|---|---|---|---|---|
| AUD-02 | Reward earning unverified; `ch:`/`w:` invented keys mint 800/day | CONFIRMED | **CONFIRMED** — SEC-01 | `reward_amount_for` byte-identical; ceiling/dedup fixed, earning not |
| AUD-03 | Achievements self-granted by direct INSERT | CONFIRMED | **CONFIRMED** — SEC-02 | No server grant path added |
| AUD-04 | No purchase flow in native app | CONFIRMED | **CHANGED — SEC-16 (MEDIUM)** | Client flow now exists; still not sellable E2E |
| AUD-06 | Sign-out destroys unsent offline records | CONFIRMED | **FIXED (static)** — §2 | Park, not delete; user-scoped purge only on account deletion |
| AUD-10 | FKs lack supporting indexes | PARTIALLY_CONFIRMED (25) | **FIXED (static)** | `fk_indexes` migrations deployed 16/11; A24: all FKs indexed |
| AUD-12 | Schema-in-repo ≠ schema-in-production | PARTIALLY_CONFIRMED | **Mostly fixed** | Koa + favorites + 20261112* deployed; only `20261124*` dedupe migration undeployed (pending approval) |
| AUD-14 | Streak freeze buyable, never spendable | CONFIRMED | **Narrowed — SEC-12** | Client buy path REMOVED at tip; RPC still live + granted |
| AUD-15 | 88 SECURITY DEFINER functions | CONFIRMED (structural) | **CONFIRMED (structural)** — SEC-15 | Count grew; new functions reviewed, properly gated |
| AUD-16 | Duplicate indexes | CONFIRMED | **Partially fixed** | 15 dup indexes dropped by `20261124*` migration — written, NOT yet deployed |
| AUD-20 | Readiness/daily aggregates client-computed, AI trusts them | CONFIRMED | **CONFIRMED** — SEC-05 | ai-coach read surface expanded at tip |
| AUD-21 | Account deletion needs no re-auth | CONFIRMED | **CONFIRMED** — SEC-06 | `delete-account` still `requireUser`-only |
| AUD-25 | Challenge claims verify against client-authored rows | CONFIRMED | **CONFIRMED** — SEC-03 | + no deadline, + pre-join sessions (R2-ECO-03/04) |
| AUD-36 | `body_checks` client-writable, provenance forgeable | CONFIRMED | **CONFIRMED** — SEC-21 | Unchanged |
| AUD-37 | All 12 functions `verify_jwt = false` | PARTIALLY_CONFIRMED | **CONFIRMED (structural)** — SEC-10 | `config.toml` unchanged; CI guard now stale (R2-API-09) |
| AUD-38 | UPDATE without WITH CHECK allows `user_id` mutation | NOT_REPRODUCIBLE | **NOT REPRODUCIBLE — do not cite** | Postgres uses USING as WITH CHECK; R2 probes proved safe |
| AUD-39 | `body_checks.photo_id` squat, no parent-owner check | CONFIRMED | **CONFIRMED** — SEC-08 | Unchanged |
| AUD-40 | `dm_can_message` privacy oracle | CONFIRMED | **CONFIRMED** — SEC-07 | Unchanged |
| AUD-41 | Trigger functions default EXECUTE TO PUBLIC | CONFIRMED (not exploitable) | **CONFIRMED (not exploitable)** — SEC-18 | Engine refuses trigger-fn calls; A24 corroborates |
| AUD-42 | Anon reads shared-library rows | CONFIRMED (by design) | **CONFIRMED (by design)** — INFO | Unchanged |
| AUD-43 | `search_path = public` everywhere | CONFIRMED (LOW) | **Partially fixed** — SEC-17 | 2 trigger fns now `search_path = ''`; rest unchanged |
| AUD-44 | Legacy anon key in public git history | PARTIALLY_CONFIRMED | **UNVERIFIED** (this round) | No history access; rotation still unconfirmed |
| AUD-45 | DM thread deleted on counterparty deletion | CONFIRMED (design) | **CONFIRMED (design)** — INFO | Unchanged |
| AUD-46 | No rate limiting on 4 non-AI functions | CONFIRMED | **CONFIRMED** — SEC-24 | `delete-account` now does more work per call |
| AUD-47 | `verify-purchase` ignores upsert errors on expired path | CONFIRMED | **FIXED (static)** — §2 | Downgrade branch now checks error → 500 |
| AUD-64 | Duplicate claim returns full amount | CONFIRMED | **FIXED (static)** — §2 | Duplicate now returns 0, ceiling checked after dedup |
| AUD-65 | `buy_mascot_item` already-owned check outside lock | PARTIALLY_CONFIRMED | **FIXED (static)** — §2 | Lock-before-check + `unique_violation` → 'already owned'; atomic wear RPCs added |
| AUD-66 | `ai_gate`/`claim_ai_call`/`spend_ai_tokens` directly callable | CONFIRMED | **CONFIRMED** — SEC-09 | + R2-API-01 bound still absent |
| AUD-68 | `spend_ai_tokens` drops records at UTC-midnight boundary | CONFIRMED | **CONFIRMED** — SEC-22 | SQL unchanged |
| AUD-72 | Follow graph enumerable; `community_profiles` USING(true) | CONFIRMED (INFO) | **CONFIRMED (INFO)** | Unchanged; enables oracle enumeration (SEC-07) |
| AUD-73 | No certificate pinning | CONFIRMED (INFO) | **CONFIRMED (INFO)** | No ATS exceptions in `project.yml`; no pinning code |
| AUD-74 | No `beforeSend` scrubber in telemetry | CONFIRMED | **FIXED (static)** — §2 | `TelemetryScrubber` allowlist + `beforeSend` wired |
| AUD-75 | GRDB caches unencrypted; App Lock is UX gate | PARTIALLY_CONFIRMED | **CONFIRMED (INFO)** | File protection set; still no SQLCipher |
| AUD-76 | Edge CORS `*` | CONFIRMED (INFO) | **CONFIRMED (INFO)** | `guard.ts` unchanged |
| AUD-77 | Non-atomic rate-limit counters | CONFIRMED (INFO) | **CONFIRMED (INFO)** | Unchanged; same class in `dm_send` |
| AUD-78 | Direct RPC quota burn is self-harm only | CONFIRMED | **CONFIRMED** | Subsumed by SEC-09 |
| AUD-79 | Barcode lookup → Open Food Facts | CONFIRMED (INFO) | **CONFIRMED (INFO)** | Unchanged |
| AUD-80 | App Group holds widget display data only | CONFIRMED (INFO, good) | **CONFIRMED (INFO, good)** | Tip `WidgetRefresher.swift` re-checked: no token/secret hits |
| AUD-82 | `store-webhook` 64 KiB check after `req.json()` | CONFIRMED | **CONFIRMED** — INFO | Unchanged (`index.ts:86` parse, `:93` check) |
| AUD-88 | 3 functions bypass `dbUrl()`/`dbServiceKey()` indirection | CONFIRMED | **CONFIRMED** — INFO | `delete-account:95-96`, `verify-purchase:99-100`, `store-webhook:169-170` still direct `Deno.env.get` |
| R2-DB-01 | `community_blocked_between` block-graph oracle | CONFIRMED (probe) | **CONFIRMED** — SEC-07 | Unchanged; fix is subtle (used by policies/triggers) |
| R2-API-01 | `ai_gate` lost 6-unknown-kind/day bound | CONFIRMED (executed) | **CONFIRMED** — SEC-09 | `guard.ts` + SQL unchanged |
| R2-API-02 | Malformed JSON burns AI quota (meal-suggest, nudges) | CONFIRMED | **CONFIRMED** — SEC-19 | Still `.catch(() => ({}))` at tip |
| R2-API-03 | No idempotency/refund for failed AI calls | CONFIRMED | **CONFIRMED** — SEC-20 | Unchanged |
| R2-API-05 | `dm_send` unbounded `p_workout` JSONB | CONFIRMED (executed) | **CONFIRMED** — SEC-14 | SQL unchanged |
| R2-API-07 | `claim_quest_reward` unbounded `p_reason` | CONFIRMED | **CONFIRMED** — SEC-23 | New version still stores `p_reason` verbatim |
| R2-API-08 | Any session-nil event runs full cleanup | CONFIRMED | **Consequence fixed** | Trigger breadth unchanged (`SessionStore.swift:122`), but cleanup now parks instead of destroying |
| R2-API-09 | `edge-auth.mjs` ordering check stale (`claimCall`) | CONFIRMED | **CONFIRMED** — SEC-10 | Still searches `claimCall(`, still says "cả chín" |
| R2-API-10 | Recovery link opens full session, password rotation optional | CONFIRMED | **CONFIRMED** — SEC-06 | Unchanged |
| R2-ECO-01 | Rank-gated shop items buyable via direct RPC | CONFIRMED | **CONFIRMED** — SEC-04 | New `buy_mascot_item` still checks price + balance only |
| R2-ECO-02 | Ceiling checked before dedup in `claim_quest_reward` | CONFIRMED | **FIXED (static)** — §2 | Dedup first, ceiling after |
| R2-ECO-03 | `claim_community_challenge` has no deadline check | CONFIRMED | **CONFIRMED** — SEC-03 | New version still has no `ends_on` check |
| R2-ECO-04 | Challenge progress counts pre-join sessions | CONFIRMED | **CONFIRMED** — SEC-03 | `community_challenge_progress` unchanged |
| R2-ECO-05 | Challenge ceiling includes `x:` credits | CONFIRMED | **FIXED (static)** — §2 | `20261120130100` excludes `x:` like quest claims |
| R2-ECO-10 | Gains integrity inherits client-asserted inputs | CONFIRMED | **CONFIRMED** — see SEC-04 | Client-computed Gains; no server source |
| R2-ECO-13 | Orphaned `d:*:streak` namespace still minting | CONFIRMED | **CONFIRMED** — SEC-01 | `reward_amount_for` `streak` branch unchanged |
| R2-SYNC-01 | Unscoped outbox drop can delete next account's rows | CONFIRMED | **FIXED (static)** — §2 | Drop removed; `purge(userId:)` scoped |
| R2-SYNC-02 | Undecodable outbox rows silently invisible | CONFIRMED | **FIXED (static)** — §2 | `refreshUndecodable` → `onIncident(.undecodable)` → `Telemetry.report` |
| R2-SYNC-03 | No retention bound for `outbox_dead` / guide cache | CONFIRMED | **Partially fixed** | `pruneDead` + `read_cache.updatedAt` + `pruneExerciseGuides` exist at tip |
| R2-SYNC-05 | Koa pause sync swallows errors (`catch {}`) | CONFIRMED | **FIXED (static)** — §2 | Failures now reported via `Telemetry.reportKoaPausePush` |
| R2-SYNC-09 | SQLite opened with GRDB defaults, pragmas unasserted | CONFIRMED | **FIXED (static)** — §2 | Explicit WAL config + `DatabaseConfigurationTests` |
| R2-OPS-01 | Scheduled CI never runs (default branch `main` has no workflows) | CONFIRMED | **CONFIRMED** — SEC-17 (MEDIUM, monitoring) | Default branch still `main`; `.github/workflows` 404 on `main` at audit time |
| R2-OPS-03 | No manual error reporting (detection matrix all "no") | CONFIRMED | **Partially fixed** | Sync/AI reporting hooks added (`Telemetry.report*`, `onIncident`); no evidence of a live detection program yet |
| R2-OPS-09 | Privacy text asserts 30-day backups, no evidence | CONFIRMED | **CONFIRMED** — cross-ref, see §4 | Backup state still UNVERIFIED; legal text unchanged (not re-read in full this round) |
| AUD-01 | Backups/PITR unverified | CONFIRMED | **CONFIRMED** — cross-ref, see §4 | Out of W4's code scope; no new evidence in repo |

---

## 2. Fixed since R2 — verified statically at tip (not findings, for the record)

Each item below was a live defect at `b19e9822` whose vulnerable code is gone or
changed at `5e673df3`. "Static" means the fix was verified by reading the exact
tip bytes; no live/throwaway-cluster probe was runnable this round, so a
behavioral re-test is still listed in each item's original acceptance criteria.

1. **AUD-64 / R2-ECO-02 — duplicate reward claims.** `claim_quest_reward`
   (`supabase/migrations/20261119120000_claim_duplicate_marker.sql:38-63`)
   returns `0` when the key was already claimed (before the ceiling check) and
   returns `0` when the `ON CONFLICT DO NOTHING` insert affects 0 rows. Deployed
   19/11 per `CONSTRAINTS_AND_DEFERRED.md:111` (`migration list` 97/97).
2. **AUD-65 — shop race.** `buy_mascot_item`
   (`20261120120000_shop_atomic_wear.sql:20-71`) takes the advisory lock BEFORE
   the already-owned check and catches `unique_violation` → `'already owned'`.
   New atomic RPCs `buy_and_wear_mascot_item` and `set_mascot_worn` (same file)
   buy/wear/unequip in one transaction, all `uid`-scoped, granted to
   `authenticated` only. Deployed 20/11 (`CONSTRAINTS_AND_DEFERRED.md:112`,
   98/98).
3. **AUD-47 — verify-purchase fail-open.** The `!ent` (expired/refunded) branch
   (`supabase/functions/verify-purchase/index.ts:103-126`) now checks
   `downgradeError` and returns 500, mirroring the paid branch; comment cites
   "AUD-47 (round 3)". (Function itself still undeployed — see SEC-16.)
4. **AUD-06 / R2-SYNC-01 — sign-out data destruction.** `SyncWorker.signOut()`
   (`apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Sync/SyncWorker.swift:172-178`)
   now calls `outbox.park()`; `OutboxStore.purge(userId:)`
   (`OutboxStore.swift:186-210`) deletes only that user's rows (dead rows
   decoded to find their owner). `dropAllOnSignOut` survives only as a comment
   reference. `AppServices.swift:344-350` documents the park ("không xoá
   (round 3, AUD-06; #241 (b))"). Account-deletion purge is the only
   destructive path left, and it is user-scoped.
5. **AUD-62 — dead-letter resend.** `Outbox.retryDead(id:)`
   (`Sync/Outbox.swift:200`) + `SyncWorker.retryDead` (`SyncWorker.swift:185`)
   re-enqueue dead entries with the same idempotency key.
6. **AUD-74 — telemetry scrubber.** New `TelemetryScrubber`
   (`ASCNDCore/Telemetry/TelemetryScrubber.swift`, allowlist of property/tag/
   extra keys, token-shape validation, email redaction, URL query/fragment
   stripping, UUID-only user id) is wired into `Telemetry.swift` (`beforeSend`
   for Sentry tags/extra/user/message/breadcrumbs; `capture()` for PostHog
   props). Residual: the allowlist is static — a new measurement key must be
   added to the scrubber first (documented in the file header); exception /
   stack / device context is kept by design.
7. **AUD-10 — unindexed FKs.** The `20261112*` FK-index migrations deployed
   16/11 (`CONSTRAINTS_AND_DEFERRED.md:698`, `migration list` 94/94); A24
   (24/11) records "mọi khoá ngoại có index".
8. **AUD-43 (partial) — search_path.** `20261124120000_dedupe_indexes_pin_search_path.sql`
   sets `search_path = ''` for `mascot_inventory_item_is_fixed()` and
   `moderation_audit_immutable()` and drops 15 duplicate indexes — **but this
   migration is NOT yet deployed** (A24: "CHƯA áp lên production — cần Kiệt
   duyệt"). `community_fold` is deliberately left unpinned (documented:
   pinning would block inlining in the search index).
9. **K-02 (Koa audit P0) — coach suggesting allergenic foods.** `ai-coach`
   now loads `profile.allergies` and injects `allergyRule(lang)` into the
   system prompt in both languages
   (`supabase/functions/ai-coach/context.ts:26,59,72-75`,
   `ai-coach/index.ts:459,490`). `ai-meal-suggest` passes `allergies` into its
   prompt (`index.ts:97,122,135`). Prompt-injection screening also tightened
   (`scope.ts`, KOA-T37: "forget … all" now needs an instruction object).
10. **Report-content oracle (new in R2 window, fixed before this audit).**
    `20261117170000_community_report_readable_guard.sql` fixes at the root what
    `20261117070000_community_moderation_feedback.sql` introduced:
    `community_reports_guard()` refuses reports on targets the reporter cannot
    read (42501), and `community_my_reports()` returns a 160-char excerpt only
    when the caller can read the target at call time. Helpers
    `community_post_readable_by` / `community_report_target_readable` are
    revoked from `PUBLIC, anon, authenticated`. Deployed 19/11 with the
    feedback migration (`CONSTRAINTS_AND_DEFERRED.md:111`). Caveat: the guard
    copies the read-policy conditions by hand — the file itself warns "ĐỔI
    POLICY ĐỌC THÌ ĐỔI CẢ HAI HÀM NÀY" (drift risk, no automated check found).
11. **R2-ECO-05 — challenge ceiling.** `20261120130100_community_challenge_ceiling.sql`
    excludes `x:` explore credits from the community-challenge daily ceiling,
    matching `claim_quest_reward`. Deployed 20/11.
12. **R2-SYNC-02 — undecodable rows surfaced.** `SyncWorker.refreshUndecodable`
    (`SyncWorker.swift:293-305`) counts undecodable rows on reload and fires
    `onIncident(.undecodable(count:))` when the count rises; `AppServices`
    wires `sync.onIncident = { Telemetry.report($0) }` (`AppServices.swift:321`)
    and `Telemetry.reportUndecodable` exists (`Telemetry.swift:169-176`).
13. **R2-SYNC-05 — Koa pause push failures.** `AppServices.reportKoaPausePushFailure`
    (`AppServices.swift:989-991`, called at `:1075` and `:1162`) reports via
    `Telemetry.reportKoaPausePush(stage:)` instead of `catch {}`.
14. **R2-SYNC-09 — SQLite durability asserted.** `ASCNDDatabase.configuration`
    (`ASCNDStore/Database.swift:31-35`) now sets `journalMode = .wal`
    (GRDB sets `synchronous = NORMAL` with WAL); effective pragmas are
    asserted by `DatabaseConfigurationTests` per the header comment.
15. **R2-SYNC-03 (partial) — retention bounds.** `OutboxStore.pruneDead`
    (`OutboxStore.swift:78`) + `read_cache.updatedAt` column (migration
    `v5-read-cache-updated-at`) + `ReadCacheCleanup.pruneExerciseGuides`
    exist at tip.
16. **R2-OPS-08 (partial) — triple session fetch.** `Backend.sharedSessions`
    (`Backend.swift:13-15`, new `SharedWorkoutSessions`) gives the three
    history/performance books one shared reader.
17. **AUD-12 (mostly) — deploy lag closed.** Koa-pause, Koa-pause-log,
    exercise-favorites, and the five `20261112*` migrations are all deployed
    per the prose log (`CONSTRAINTS_AND_DEFERRED.md:483,487,489,698,707`).
    Only `20261124120000` (dedupe + search_path pinning) remains undeployed.

---

## 3. Findings register (severity-ordered)

Evidence cites the tip SHA `5e673df3` throughout. Line numbers are from the tip
bytes fetched via the GitHub Contents API, or from the base worktree
(`2fb08784`) where the blob SHA is unchanged — noted per finding.

### HIGH

#### SEC-01 — HIGH — CONFIRMED — Reward earning still unverified: invented `ch:`/`w:` keys mint up to 800 coins + 800 XP/day, plus orphaned streak keys
- **Affected component:** Economy — `reward_amount_for` + `claim_quest_reward` + client claim path.
- **Evidence:** `supabase/migrations/20261029130000_koa_quests_v2.sql:33-91`
  (blob unchanged since R2): `ch:` checks only 4 parts + tier lookup (68-71);
  `w:` accepts any non-empty suffix → 40 (74-77); `d:<date>:streak` pays 15
  (62-63) although no live caller claims it (R2-ECO-13); `x:` pays one-time
  195 (85-88). `claim_quest_reward` (new version,
  `20261119120000_claim_duplicate_marker.sql:38-63`) still calls
  `reward_amount_for(p_ref_key)` and pays whatever it returns — the fix in
  that migration is dedup/ceiling ordering only; **no existence or completion
  check was added**. Client passes a caller-chosen `refKey`
  (`SupabaseMascot.swift:213-215` at tip: `claimReward(refKey:reason:)` →
  `client.rpc("claim_quest_reward", ...)`). `earn_mascot_coins`
  (`20260819120000_reward_amount_authority.sql:246-260`) delegates to
  `claim_quest_reward` and ignores its `p_amount` parameter entirely, so the
  mint surface is exactly `claim_quest_reward`'s.
- **Attack scenario:** any authenticated user calls
  `POST /rest/v1/rpc/claim_quest_reward` with invented keys, e.g. six
  `ch:platinum:<date>:xp` (120 each) + one `ch:gold` (80) = 800 coins/day,
  plus ~800 XP/day via `xpForRefKey` (`MascotRules.swift:91-108`), plus 195
  one-time `x:` coins outside the ceiling. No workout, no quest, no activity.
  R2 recomputed the full shop (51 items, 12,500 coins) in ~16 scripted UTC days.
  Honest path is also tier-mutable: `weekly_challenges.reward_tier` is
  client-writable under its `FOR ALL` owner policy, so a user can UPDATE their
  own tier to platinum and claim 120 honestly-shaped.
- **Impact:** virtual-economy inflation; every coin-gated or status-gated thing
  downstream (freeze consumable, shop prestige, Gains rank) is purchasable by
  script. Escalates to CRITICAL the moment coins gate paid features or prizes.
- **Likelihood:** HIGH for a curious user (one RPC call; keys are in the public
  repo); the ceiling bounds the rate but not the fact.
- **Remediation:** server-side existence + completion verification per key
  namespace (or retire `w:` and the orphaned `streak` branch); make
  `reward_tier` server-managed or re-derive it at claim time; add a SQL-suite
  test pinning invented-key refusal.
- **Verification procedure:** throwaway PG16 cluster with all 101 migrations;
  as user A, `SELECT claim_quest_reward('ch:platinum:2026-11-28:xp')` with no
  such challenge existing → must raise; `SELECT claim_quest_reward('w:anything')`
  → must raise; `SELECT claim_quest_reward('d:<today>:streak')` with no streak
  → must raise. Then honest-path regression: a real completed quest still pays.

#### SEC-02 — HIGH — CONFIRMED — Achievements self-granted by direct INSERT
- **Affected component:** `awards` table + `SupabaseAwardsSource.grant`.
- **Evidence:** `apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend/SupabaseAwards.swift:105-124`
  (unchanged at tip): client INSERTs client-chosen `award_type`, `award_key`,
  `title`, `description`, `icon`, `tier`, `metadata`. Policy "Users can insert
  own awards" + SELECT + DELETE, no UPDATE; no catalogue CHECK; only
  `UNIQUE(user_id, award_key)`. Criteria are Swift-only (`Awards.toGrant`).
  No server-side grant path exists. (Contrast: `community_user_badges` is
  server-computed — the right pattern already exists in-repo.)
- **Attack scenario:** any authenticated user INSERTs any award key/tier/title
  via PostgREST (publishable key + own JWT) and displays unearned badges.
- **Impact:** earned-status fraud; awards are profile-visible. No direct coin
  impact (awards pay no coins), but status integrity is the product's social
  currency.
- **Likelihood:** HIGH (trivial REST call).
- **Remediation:** server RPC that re-derives eligibility; drop the client
  INSERT policy; catalogue CHECK on `award_key`/`tier`.
- **Verification procedure:** throwaway cluster; as user A, INSERT an award
  with an unearnt key → must fail 42501/CHECK; honest grant via the new RPC
  still flows; SQL suite covers it.

#### SEC-03 — HIGH — CONFIRMED — Community-challenge claims verify against client-authored rows, with no deadline and pre-join sessions counting
- **Affected component:** `claim_community_challenge` + `community_challenge_progress`.
- **Evidence:** `supabase/migrations/20261120130100_community_challenge_ceiling.sql:1-72`
  (tip version, deployed 20/11): checks membership, advisory lock,
  `claimed_at` NULL, `progress >= target`, daily ceiling (now excluding `x:`)
  — **still no comparison of `now()` to `ends_on`**, and
  `community_challenge_progress`
  (`20260930120000_community_challenges.sql:90-101`, unchanged) counts DISTINCT
  local dates with ≥1 `workout_sessions` row in `[starts_on, ends_on]` with no
  minimum sets/duration/volume and no reference to `joined_at`.
  `workout_sessions` has a `FOR ALL` owner policy with no CHECKs and free-form
  JSONB `sets` (AUD-08).
- **Attack scenario:** backdate empty `workout_sessions` rows into any
  challenge window (including before joining, including months after
  `ends_on`), join, claim the reward. One payout per challenge per user,
  ceiling-capped — but challenge expiry as a mechanic does not exist
  server-side.
- **Impact:** challenge/leaderboard integrity is display-only; expired
  challenges remain payable forever.
- **Likelihood:** MEDIUM (requires backdated rows + a claim; both trivial via REST).
- **Remediation:** enforce `ends_on` (+ a single server-side grace constant,
  not UI-only); count only sessions on/after `joined_at` (or document the
  opposite rule); require a minimum session shape (e.g. non-empty sets, a
  duration/volume floor) — or record the accepted residual risk explicitly.
- **Verification procedure:** throwaway cluster; challenge with `ends_on` 30
  days ago + qualifying backdated sessions → claim must raise a deadline
  error; sessions days 1–6 + join day 7 → claim must follow the documented
  rule; honest in-window claim still pays.

#### SEC-04 — HIGH — CONFIRMED — Rank-gated shop items purchasable via direct RPC; Gains itself is client-computed
- **Affected component:** `buy_mascot_item` (+ new `buy_and_wear_mascot_item`) + client Gains.
- **Evidence:** New `buy_mascot_item`
  (`supabase/migrations/20261120120000_shop_atomic_wear.sql:20-71`, deployed
  20/11) checks only server price (from `shop_prices`), advisory lock,
  already-owned, and balance. No rank check exists anywhere server-side.
  Client gates nine items by Koa Gains rank
  (`MascotShop.unlockRanks`, comment "Server không kiểm cấp khi mua").
  `KoaGains` derives tier/rank from `workout_sessions` rows (freely
  INSERTABLE, AUD-08 class) with client-set `pr_detected` flags plus ledger
  `d:<day>:overload` keys (SEC-01 class) — R2-ECO-10. A server-side rank gate
  cannot simply "check the rank": there is no server-side rank to check.
- **Attack scenario:** `SELECT buy_mascot_item('dragonwing')` (rank 4) at rank
  0 with sufficient coins (forgeable per SEC-01) → owned. Prestige items lose
  earned-status meaning.
- **Impact:** status/prestige bypass; no direct revenue impact (no real-money
  purchases yet). Becomes a paid-feature gate issue if rank ever gates
  anything monetized.
- **Likelihood:** MEDIUM (one RPC call; keys in the public repo).
- **Remediation:** either move Gains to a server-computed source of truth and
  gate in the RPC, or explicitly retire the rank gate as client-only
  decoration and stop implying earned status in item copy.
- **Verification procedure:** throwaway cluster; fund ledger, call
  `buy_mascot_item('dragonwing')` at Gains rank 0 → must raise a rank error
  after fix (currently succeeds); ungated items unaffected.

#### SEC-05 — HIGH — CONFIRMED — Readiness + daily aggregates are client-computed and client-writable, yet consumed as AI ground truth (read surface expanded at tip)
- **Affected component:** `daily_logs` + all AI Edge Functions.
- **Evidence:** `daily_logs` has a `FOR ALL` owner policy with no CHECKs on
  `readiness_score`/`readiness_status`/`readiness_explain`
  (`20260212040248…sql`, unchanged). `DailyLog.recompute` is client-side.
  `ai-coach` consumes `readiness_score`/`readiness_status` gated only by
  parsing the client-writable `readiness_explain` token string
  (`_shared/readiness.ts`). At this tip `ai-coach` reads **more**
  client-written tables than at R2: `routine_days`, `plan_day_overrides`,
  `workout_templates` (incl. `exercises` JSONB), `koa_pauses`, `water_logs`
  (400 rows) alongside the previous `profiles`/`daily_logs`/`sleep_logs`/
  `workout_sessions`/`biometric_samples`/`weight_logs`/`coach_memory`
  (`ai-coach/index.ts:249-267`). Reads use the **caller-token client**
  (`const { userId, supabase } = caller`, `:154`), so RLS applies and each
  query filters `user_id = caller` — no cross-user read was found — but the
  *values* are all client-asserted.
- **Attack scenario:** forge a `daily_logs` row (readiness 100, perfect sleep,
  fake workouts) → the coach reasons from fiction and returns advice grounded
  in invented recovery. Self-harm only for the forger — unless the same rows
  feed anything shown to others or any server decision (today: community
  challenges, SEC-03).
- **Impact:** AI advice quality/integrity; the "verified" coaching surface is
  advisory text built on unverified inputs. No safety-critical advice path
  exists today (coach is advisory, scope-gated).
- **Likelihood:** HIGH for self-forgery (trivial REST writes); impact bounded
  by the advisory nature of the output.
- **Remediation:** decide the trust boundary (server recompute/validation, or
  CHECKs: score 0–100, explain-token format) and mark AI output advisory
  where inputs are unverified; never let a new server-side gate consume
  `daily_logs`/`workout_sessions` without validation.
- **Verification procedure:** throwaway cluster + stubbed AI gateway; write a
  forged `daily_logs` row (readiness 100, no source rows) → after fix the
  coach must either recompute or flag the input as unverified; today it
  accepts it silently.

### MEDIUM

#### SEC-06 — MEDIUM — CONFIRMED — Account deletion needs no re-authentication; a recovery link alone opens a full session
- **Affected component:** `delete-account` Edge Function + recovery flow.
- **Evidence:** `supabase/functions/delete-account/index.ts:90` — `requireUser`
  ONLY; no re-authentication, confirmation token, or grace period anywhere in
  the handler (tip version re-read; the 17/11 change only adds the Apple-revoke
  preamble). Client: single `ConfirmAlert`, no password/biometric/typed
  confirmation (`SettingsView`). Recovery: `SessionStore.open(url:)`
  (`SessionStore.swift:176-188`, unchanged) applies `.signedIn` immediately on
  a valid recovery link; `AuthLinkSheet` offers "Để sau" (Later) while the
  session stays open; nothing forces password rotation afterwards (R2-API-10).
- **Attack scenario:** a leaked/forwarded recovery link (email compromise,
  shared inbox, shoulder-surfed link) gives full account control **and**
  irreversible account destruction, with no password-rotation forcing
  function and no step-up for deletion.
- **Impact:** irreversible account + data loss from a single link compromise.
  Likelihood LOW (requires link compromise; link expiry is a dashboard setting,
  UNVERIFIED).
- **Remediation:** step-up re-authentication (fresh login) or a typed
  confirmation + short-TTL server confirmation token for deletion; force
  password rotation after recovery-link sign-in (or require re-auth for
  deletion — either closes the chain).
- **Verification procedure:** simulator/device test — open recovery link, tap
  Later, assert app access; attempt deletion → after fix must demand
  re-auth/typed confirmation. Dashboard: record recovery-link expiry.

#### SEC-07 — MEDIUM — CONFIRMED — Two relationship oracles: `dm_can_message` and `community_blocked_between` answer about arbitrary user pairs
- **Affected component:** `dm_can_message`, `community_blocked_between` (SECURITY DEFINER, granted to `authenticated`).
- **Evidence:** `dm_can_message(p_me, p_other)`
  (`supabase/migrations/20261020130000_community_direct_messages.sql:83-101`,
  unchanged): never checks `p_me` against `auth.uid()`; no client caller
  anywhere (Swift 0, RN 0, edge 0). `community_blocked_between(a, b)`
  (`20260927120000_community_foundation.sql:110-124`, unchanged): SECURITY
  DEFINER, returns whether a block row exists in either direction, no
  `auth.uid()` check, no `moderation_require`. R2 probes (throwaway cluster)
  demonstrated both: unrelated user C got `true`/`false` for arbitrary pairs
  while direct `SELECT count(*) FROM community_blocks` as C returned 0 rows
  (RLS correctly restricts direct reads — the RPCs bypass it by construction).
  User UUIDs are enumerable via the public `community_profiles` SELECT
  (`USING (true)`, AUD-72).
- **Attack scenario:** one PostgREST RPC call per pair; an attacker maps the
  block graph (who blocked whom) and DM reachability (blocked / restricted /
  follow-gated) for any two users, at scale. No rate limiting applies to
  direct RPC calls.
- **Impact:** privacy only — blocking is a sensitive social signal. No data
  beyond the boolean is leaked; no write, account, or payment impact.
- **Likelihood:** LOW (requires motive to map the block graph; no financial or
  account-takeover value).
- **Remediation:** require `p_me = auth.uid()` in `dm_can_message` (safe: no
  caller passes anything else); for `community_blocked_between`, return `false`
  (or raise 42501) for authenticated non-party callers while allowing NULL-uid
  service/trigger contexts the true value — and verify every policy/trigger
  call site with suite coverage (naive party-check breaks notification/follow/
  comment flows). Fix both together (same oracle class).
- **Verification procedure:** throwaway cluster; as unrelated user C,
  `SELECT community_blocked_between(F, G)` after F blocks G → must return
  `false` (or raise); as party F → still `true`; community suite green.

#### SEC-08 — MEDIUM — CONFIRMED — `body_checks.photo_id` has no parent-owner check; UUID squatting blocks a victim's write
- **Affected component:** `body_checks` table + `body-check` Edge Function.
- **Evidence:** `20261105090000_body_checks.sql` (unchanged): FK
  `photo_id → progress_photos(id)` CASCADE + `UNIQUE(photo_id)` + owner-only
  policy, but NO parent-owner check. R2 probe T-P5 (throwaway cluster):
  user B inserted a `body_checks` row pointing at A's photo UUID; A's own
  insert then failed `23505`. The edge function uses the caller-token client
  with an RLS-filtered photo lookup, so the squat requires direct PostgREST
  access (available to any authenticated user with the publishable key + JWT).
  B cannot read A's photo or A's rows.
- **Attack scenario:** attacker enumerates/guesses a victim's progress-photo
  UUID (UUIDs are not enumerable from the app, but are guessable only by
  brute force — 122 bits — or leaked via a shared link/log) and squats the
  `UNIQUE(photo_id)` row, denying the victim's body-check for that photo.
- **Impact:** LOW-MEDIUM availability denial on one victim row; no data read.
  Likelihood LOW (requires the victim's photo UUID).
- **Remediation:** parent-owner check (photo must belong to the caller),
  mirroring the #149 fix for the same class.
- **Verification procedure:** throwaway cluster; as B, INSERT a `body_checks`
  row with A's `photo_id` → must fail after fix; A's own insert succeeds.

#### SEC-09 — MEDIUM — CONFIRMED — AI quota internals directly callable; unknown-kind row bound still absent
- **Affected component:** `ai_gate` / `claim_ai_call` / `spend_ai_tokens` (+ `reward_amount_for` grant).
- **Evidence:** Catalog-verified grants (`authenticated` + `service_role`,
  anon revoked) and R2 executed direct calls (T-API-01/02/04). `guard.ts`
  and the metering SQL are unchanged at tip, so R2-API-01 stands: the
  `ai_gate` rewrite dropped the old 6-unknown-kind/day bound (old
  `claim_ai_call` refused a 7th distinct UNKNOWN kind per user per UTC day;
  no later migration restores it). `claim_ai_call` has NO live edge caller
  (all handlers use `aiGate`) — pure attack surface with zero function.
  `spend_ai_tokens` accepts up to 10,000,000 tokens per record (R2, AUD-54).
- **Attack scenario:** any authenticated user loops direct RPC calls with
  invented ≤40-char kinds → unbounded `ai_usage` rows (storage/write
  amplification on a table nothing else lets a client touch). NOT a quota
  bypass: edge functions use fixed literals, so invented kinds buy no model
  calls; direct calls burn the caller's own quota only (AUD-78).
- **Impact:** DB bloat + ops noise, confined to the caller's own rows.
- **Likelihood:** LOW (self-harm-adjacent, no financial gain).
- **Remediation:** restore the unknown-kind count bound in `ai_gate` (named
  kinds exempt); decide `claim_ai_call`'s exposure (revoke or document);
  cap `spend_ai_tokens` per record.
- **Verification procedure:** throwaway cluster; 8 distinct junk kinds via
  direct RPC → 7th must be denied after fix; named kinds unaffected; SQL
  suite test pins it.

#### SEC-10 — MEDIUM — CONFIRMED (structural) — All 12 Edge Functions run with `verify_jwt = false`; the CI guard that backstops it is now stale
- **Affected component:** `supabase/config.toml` + `supabase/functions/_shared/guard.ts` + `native/tools/edge-auth.mjs`.
- **Evidence:** `config.toml` (tip, re-read): all 12 functions
  `verify_jwt = false`. Mitigation is real: all 11 auth-required handlers call
  `requireUser` first (verified individually at R2; `guard.ts` byte-identical
  at tip), and `requireUser` checks `sub` + `role == authenticated` + `aud`
  contains `authenticated` (`guard.ts:111-140`). `store-webhook` is the sole
  intentional exception (trusts only Apple-signed JWS). **But the CI backstop
  eroded:** `native/tools/edge-auth.mjs:74-79,123-125` still searches for
  `claimCall(` to check auth-before-quota ordering, while all handlers now
  call `aiGate` and `claimCall` has zero call sites — the ordering check
  passes vacuously and would NOT catch a future handler that gates before
  auth. Its success text still says "cả chín" (nine) while 12 functions exist.
  The `requireUser(` presence check itself is live and correct.
- **Attack scenario:** a future handler that forgets `requireUser` (or gates
  quota before auth) is silently open; the CI check designed to catch it
  cannot.
- **Impact:** structural — no live defect today. Likelihood of a future
  regression going uncaught: MEDIUM over a long horizon.
- **Remediation:** update the check to search for `aiGate` (and `claimCall`
  if revived); fix the count text to 12; add a negative fixture test (a
  handler gating before auth must fail the check); consider re-enabling the
  platform gate where compatible.
- **Verification procedure:** CI run with a fixture handler that calls
  `aiGate` before `requireUser` → check must fail; all 12 real handlers
  still pass.

#### SEC-11 — MEDIUM — NEW (this round) — STRONGLY SUSPECTED — Every Edge Function imports `supabase-js` from unpinned `esm.sh/@supabase/supabase-js@2`; no lockfile
- **Affected component:** all 12 Edge Functions (`supabase/functions/**`).
- **Evidence:** `verify-purchase/index.ts:2`, `guard.ts:24`,
  `delete-account/index.ts:2`, `store-webhook`, `admin-art`,
  `ai-coach-memory` (grep: 6+ files) all import
  `https://esm.sh/@supabase/supabase-js@2`. `deno.land/std@0.168.0` IS
  pinned. No `deno.lock` / `deno.json` exists in the repo (tree check at tip).
  These functions run with the service-role key (via `dbServiceKey()` or
  direct env) — a compromised `@2` release executes with full DB access.
- **Attack scenario:** supply-chain compromise or a breaking/malicious `@2`
  release is picked up silently at the next deploy (no pin, no hash, no
  lockfile); the injected code runs server-side with the service role.
- **Impact:** full database compromise in the worst case. Likelihood LOW
  (requires esm.sh or the package to be compromised; `@supabase/supabase-js`
  is a high-profile target with provenance, but the repo takes the floating
  major on trust).
- **Remediation:** pin an exact version (`@supabase/supabase-js@2.x.y`),
  vendor or lock it (`deno.lock`, `--frozen`), and add a CI check that no
  `esm.sh` import floats a major version.
- **Verification procedure:** `deno info` / deploy a canary and record the
  resolved version; after pinning, `grep -r "esm.sh" supabase/functions/`
  shows only exact versions and a lockfile exists.

#### SEC-12 — MEDIUM — CONFIRMED (residual) — `buy_streak_freeze` RPC still live and granted, but the consumable can never be spent; client buy path removed at tip
- **Affected component:** `buy_streak_freeze` RPC + `streak_freezes` table.
- **Evidence:** At tip the client buy path is **gone**: the diff of
  `SupabaseMascot.swift` (base → tip) removes the `FreezeParams` struct and
  `buyStreakFreeze(requestId:)` entirely, and no SwiftUI view calls it
  (`MascotRoomView` freeze section is an empty header; `ShopView` lists only
  outfit/stage/decor). `use_streak_freeze` still has **zero callers**
  anywhere (Swift 0, RN 0, edge 0 — verified by grep at tip). But the RPC
  itself is still granted to `authenticated` (and its zero-arg overload is
  still double-chargeable on retry per R2), and the 16/11 deploy note records
  "rút quyền `buy_streak_freeze` không chạm UI" — i.e. a grant change was
  considered, yet REST checks at deploy time still showed the function
  reachable (`mascot_wallet` and `buy_streak_freeze` → 42501 for *anon*;
  authenticated was not reported). The `streak_freeze_sale_closed` migration
  (16/11) closed the *sale*; the RPC remains callable.
- **Attack scenario:** a determined client calls `buy_streak_freeze` directly
  and pays 150 coins for a consumable that can never be spent (no spend path
  exists). Self-harm only — the buyer pays their own (possibly forged, SEC-01)
  coins.
- **Impact:** a paid item that does nothing; trust/refund problem if the buy
  path is ever re-exposed in UI. Likelihood LOW via direct RPC (requires
  intent); zero via the app UI at tip.
- **Remediation:** either port the streak guard (`use_streak_freeze` consumed
  on a missed day, outcome surfaced, simulator-tested) or deliberately
  disable the buy path (revoke/gate the RPC + remove dead controller code);
  no live RPC should sell an unspendable consumable.
- **Verification procedure:** throwaway cluster; as an authenticated user,
  call `buy_streak_freeze` → after the decision, either it is revoked (42501)
  or a spend path exists and a freeze is consumed on a missed day.

#### SEC-13 — MEDIUM — NEW (this round) — POTENTIAL RISK — `delete-account` Apple-revoke preamble accepts caller-supplied token material with no binding to the caller's Apple identity
- **Affected component:** `delete-account` + new `_shared/apple-signin.ts`.
- **Evidence:** `delete-account/index.ts:98-135` (tip) reads
  `apple_refresh_token` / `apple_authorization_code` from the request body
  and passes them to `revokeAppleGrantIfLinked`, which checks (via the admin
  API) that the *account being deleted* has an `apple` identity
  (`apple-signin.ts:revokeAppleGrantIfLinked`) — but never checks that the
  supplied token/code belongs to that Apple identity. The code is careful
  elsewhere: identity comes from the Authorization header, tokens are never
  logged (only outcome + Apple error code), the client secret is ES256 with a
  5-minute expiry, revocation never blocks deletion, and the authorization-code
  path is single-use/minutes-lived. **But the client half does not exist yet**
  (no client sends either field today; the function logs `no_token` and
  proceeds), and the four `APPLE_SIGNIN_*` secrets are **not configured**
  (`CONSTRAINTS_AND_DEFERRED.md:251` — still waiting on Kiệt), so revocation
  currently no-ops with a `not_configured` log. Separately, the body is read
  with an unbounded `await req.json()` before any size check (same class as
  AUD-82 in `store-webhook`).
- **Attack scenario:** an attacker who possesses a victim's Apple refresh token
  (which requires compromising the victim's device/account already — the app
  never exposes provider tokens to clients) deletes their *own* account while
  supplying the victim's token, revoking the victim's Apple grant (victim must
  re-authenticate). The authorization-code path is safer: a fresh code is
  minted by re-authenticating as the caller at deletion time.
- **Impact:** cross-user grant revocation (availability/DoS on the victim's
  Apple sign-in). Likelihood LOW (needs a stolen victim refresh token; the
  realistic future client flow uses fresh authorization codes).
- **Remediation:** prefer the authorization-code path only and drop the raw
  `apple_refresh_token` body field (or bind it: verify the token's subject
  against the caller's Apple identity before revoking); add a body size
  pre-check before `req.json()`; configure the four `APPLE_SIGNIN_*` secrets
  and deploy (currently the 5.1.1(v) revocation is a no-op — a compliance gap
  conditional on Sign in with Apple being enabled, which it is not by default:
  `ASCND_SIGN_IN_WITH_APPLE: "NO"` in `project.yml:144`).
- **Verification procedure:** Deno + stubbed Apple endpoints; call
  `delete-account` with another user's refresh token → after fix, revocation
  must not execute; with a fresh authorization code minted for the caller →
  revocation succeeds; with secrets unconfigured → `not_configured` logged
  and deletion proceeds.

#### SEC-14 — MEDIUM — CONFIRMED — `dm_send` accepts unbounded `p_workout` JSONB; workout title lands untruncated in `last_text`
- **Affected component:** `dm_send` + `dm_messages.workout` + `dm_threads.last_text`.
- **Evidence:** `20261020130000_community_direct_messages.sql` (unchanged):
  `p_body` is validated/truncated (≤1000) but `p_workout` is stored verbatim
  with no size/shape validation; `last_text` takes `p_workout->>'title'`
  UNTRUNCATED (the body branch uses `left(v_body, 140)`). R2 probe T-API-07
  (executed): a 105,044-byte workout JSONB with a 5,000-char title was stored;
  `dm_threads.last_text` length = 5,000. No CHECK on either column.
- **Attack scenario:** an attacker in a DM thread with the victim sends one
  oversized workout message; every inbox fetch (`dm_inbox` returns `last_text`
  for 200 threads) carries the inflated payload for the recipient. Bounded
  only by PostgREST body limits (UNVERIFIED) and the 30/min `dm_send` limit.
- **Impact:** storage bloat + inbox payload inflation for the recipient. No
  auth bypass. Likelihood LOW (requires a DM thread with the victim).
- **Remediation:** size cap + shape allow-list on `p_workout` in `dm_send`
  (or a CHECK); truncate `last_text` to 140 chars on the workout branch.
- **Verification procedure:** throwaway cluster; `dm_send` with a 100 KB
  workout → must be rejected/truncated after fix; `last_text` length ≤ 140.

#### SEC-15 — MEDIUM — CONFIRMED (structural, no new defect) — Privileged-code concentration grew: more SECURITY DEFINER functions, admin UI now reachable from the native app
- **Affected component:** Postgres function layer + native admin UI.
- **Evidence:** 88 SECURITY DEFINER of 94 signatures at R1; the tip adds
  `buy_and_wear_mascot_item`, `set_mascot_worn`, `community_post_readable_by`,
  `community_report_target_readable`, `moderation_notify`,
  `moderation_open_reporters` (all `SET search_path = public`, all reviewed
  this round: `moderation_notify`/`moderation_open_reporters` revoked from
  all roles; `community_post_readable_by` revoked from PUBLIC/anon/
  authenticated; buy/wear RPCs uid-scoped and granted to `authenticated`
  only; `mod_*`/`admin_*` re-definitions all call `moderation_require`).
  **New exposure:** the native app now ships an admin surface —
  `SupabaseModeration.swift` + `AdminArtView`/`AdminUsersView`/
  `ModerationDashboardView` etc. — calling `mod_*`/`admin_*` RPCs from the
  app. Server-side gating was verified (every entry point calls
  `moderation_require`; R2 probe T-P14: non-admin `admin_users` → 42501).
  Client-side `my_app_role` pre-check is convenience only.
- **Attack scenario:** any future defect in a definer body is a privilege
  defect by construction; moderator/admin accounts become higher-value
  targets now that the admin UI ships in the app. `bootstrap_first_admin`
  has a TOCTOU race (R2) but requires the service-role key, so attacker
  capability is ~nil — noted, not filed as exploitable.
- **Impact:** structural. No exploitable defect found in any definer body
  reviewed this round.
- **Likelihood:** LOW for a new defect; impact HIGH if one lands.
- **Remediation:** keep the SQL suites + mutation testing running on every
  change (note: the `all-migrations` suite is new at tip —
  `supabase/tests/all-migrations/run.sh` — but no workflow was found running
  it; see SEC-17); prefer SECURITY INVOKER for new read helpers where RLS
  suffices; review definer bodies as privileged code; tightly control who
  holds the `admin` role (grant process is not documented in the repo —
  UNVERIFIED).
- **Verification procedure:** CI must run core + community + all-migrations
  suites on every `supabase/` change; a new definer function without a
  `moderation_require` or `auth.uid()` check must fail review.

#### SEC-16 — MEDIUM — CHANGED (was HIGH, AUD-04) — Purchase flow now exists in client code but still cannot sell end to end
- **Affected component:** StoreKit client + `verify-purchase` + App Store configuration.
- **Evidence (what changed):** new at tip —
  `StoreKitClient.swift` (actor; only finishes StoreKit-`.verified`
  transactions; unverified never finished; `reconcileUnfinished` re-verifies
  unfinished transactions on app-open/session-change/network-return),
  `PurchaseCoordinator.swift` (appAccountToken must be the caller's UUID;
  transaction ID ≤ 64 chars; verify-before-finish; tier re-read from
  `current_tier()`; unknown product IDs filtered out),
  `PurchaseController.swift` + `PaywallView.swift` (names/prices from StoreKit
  only, no hardcoded prices, no promised benefits; restore always present;
  unconfigured state shows "chưa mở bán" with no buy button),
  `EdgePurchaseVerifier` (calls `.verifyPurchase`; unparseable body = failed
  verification, never treated as success). Server side was already strong
  (Apple re-verification, double `appAccountToken` binding, production-only
  default).
- **Evidence (what still blocks):** `CONSTRAINTS_AND_DEFERRED.md:41` (tip):
  (1) 17/11 probe: `verify-purchase` and `store-webhook` **CHƯA deploy (404)**;
  (2) no products in App Store Connect, no product IDs in config
  (`Backend.xcconfig`: `ASCND_PRODUCT_ID_PLUS` / `ASCND_PRODUCT_ID_MAX` are
  empty — paywall renders "unconfigured"); (3) no product decision (what
  Plus/Max unlock, price, cycle). Tier still gates nothing functional
  (`isPaid()` feeds only a cosmetic logo animation).
- **Attack scenario:** none new — the client flow is correctly built (no
  client-side trust: an unverified transaction can never finish as verified,
  and the tier comes from the server). The risk is operational: if the
  functions are deployed without the product decision, users could pay for
  tiers that unlock nothing.
- **Impact:** subscriptions cannot be sold; if launched half-configured, paid
  users get no benefits. Likelihood of the half-configured launch: MEDIUM
  without a launch checklist gate.
- **Remediation:** the three conditions in CONSTRAINTS:41 (deploy functions
  with `APPLE_ENV=production`, create products + fill product IDs, product
  decision on benefits) + a sandbox E2E purchase test + a launch gate that
  blocks the paywall until all three hold.
- **Verification procedure:** sandbox purchase E2E (purchase → `verify-purchase`
  → entitlement row → `current_tier()` → restore on a second device);
  `verify-purchase` deployed-version check vs repo; product IDs in config
  match `PRODUCT_ID_PLUS`/`PRODUCT_ID_MAX` server env.

#### SEC-17 — MEDIUM — CONFIRMED (monitoring) — Scheduled CI is dead and the system-check bot has never read the server, so security regressions go undetected in quiet stretches
- **Affected component:** CI schedules + `system-check` bot.
- **Evidence:** default branch is still `main` (GitHub API, audit time);
  `.github/workflows` on `main` returns 404 — GitHub only runs `schedule`
  from the default branch, so the daily `system-check`, nightly E2E/a11y, and
  weekly analysis schedules never fire (R2-OPS-01; workflow headers warn
  about this themselves). A24 (24/11) adds: "bot kiểm hệ thống chưa bao giờ
  đọc được server vì thiếu secret `SUPABASE_ACCESS_TOKEN` — production
  (advisor, lệch migration) **NOT RUN**". The bot's checks (deployed-function
  diff, migration drift, advisors ≥ WARN, secret presence) are the only
  structured control that would catch RLS drift, a leaked secret, or a
  function deployed out-of-sync — and they have never run against production.
- **Attack/impact scenario:** a bad migration, a drifted function, or an
  advisor-flagged RLS gap sits undetected between pushes; the first signal is
  a user report. No direct user impact today (0 real users), but this is the
  detection layer for every other finding in this register.
- **Likelihood:** HIGH over any multi-week horizon (any push gap > 24 h breaks
  the "daily" promise).
- **Remediation:** owner decision — merge the 7 workflows to `main`, or change
  the default branch to `native/ios-rewrite`, or move schedules to a minimal
  workflow on `main` that dispatches the real checks; provision
  `SUPABASE_ACCESS_TOKEN` and record the first successful bot run.
- **Verification procedure:** Actions history shows a scheduled `system-check`
  run within 24 h of the fix and daily thereafter for 7 days; the bot output
  records applied-vs-repo migrations and advisor counts.

### LOW

#### SEC-18 — LOW — CONFIRMED (not exploitable) — Trigger functions have no GRANT/REVOKE; default EXECUTE TO PUBLIC stands
- **Affected component:** 8 trigger functions (`handle_new_user`,
  `community_blocks_unfollow`, `community_count_bump`,
  `community_profiles_guard`, `community_reports_autohide`,
  `mascot_inventory_item_is_fixed`, `trim_coach_memory`,
  `update_updated_at_column`).
- **Evidence:** catalog-verified at R2 (C13: `has_function_privilege` = true
  for both `anon` and `authenticated`); R2 probes T-P8r/P8b showed all 8 fail
  with `0A000 trigger functions can only be called as triggers`. A24 (24/11)
  independently records: "5 hàm `security definer` anon gọi được đều là hàm
  trigger (PostgREST không gọi được)". No change at tip.
- **Remediation (hygiene):** explicit `REVOKE EXECUTE ... FROM PUBLIC` on all
  trigger-only functions, defense in depth.
- **Verification procedure:** `has_function_privilege` = false for `anon` /
  `authenticated` after the revoke; suites green.

#### SEC-19 — LOW — CONFIRMED — Malformed JSON burns AI quota in `ai-meal-suggest` and `ai-smart-nudges`
- **Affected component:** `ai-meal-suggest/index.ts:28`, `ai-smart-nudges/index.ts:27`.
- **Evidence:** both handlers still read the body as
  `req.json().catch(() => ({}))` at tip and proceed to `aiGate` + provider
  call with `{}`. Contrast: `ai-coach:170` lets `req.json()` throw → 500
  BEFORE the gate; `ai-weekly-review` is safe despite the same `.catch`
  because `week_start` is required. The handlers' own header comments state
  "The body first, the quota after" — the `.catch` violates the stated rule
  for unparseable bodies.
- **Impact:** a buggy client (or scripted caller) sending malformed bodies
  consumes the user's daily quota (30/day each) and triggers paid provider
  calls with empty input. Self-quota only.
- **Remediation:** return 4xx on unparseable JSON before `aiGate`; regression
  test asserting no quota increment.
- **Verification procedure:** Deno + stubbed gateway; POST invalid JSON →
  expect 400 with no `ai_usage` increment.

#### SEC-20 — LOW — CONFIRMED — No idempotency/refund for failed AI calls: provider failures consume quota
- **Affected component:** all 8 AI handlers (`aiGate` before `callAI`).
- **Evidence:** handler comments acknowledge it (`ai-coach/index.ts:159`,
  `ai-coach-memory/index.ts:264`, `scan-food/index.ts:109`: "`claimCall` is an
  increment, not a reservation"). `recordTokens` swallows errors
  (`guard.ts:204-281`, documented trade-off). No refund RPC, reservation/
  expiry, or idempotency key exists. Unchanged at tip.
- **Impact:** users pay quota (and, past the limit, credits) for provider
  failures; under gateway instability a user can exhaust a daily quota on
  failures alone. No money is taken (credits have no top-up path — AUD-23).
- **Remediation:** documented decision — reservation-with-expiry, failure
  refund, or explicit wontfix with user-facing copy; surface `recordTokens`
  failures in logs with user/kind.
- **Verification procedure:** Deno + stub gateway returning 503, then assert
  whether a retry path refunds (expect: failed-call + retry = 1 unit after fix).

#### SEC-21 — LOW — CONFIRMED — `body_checks` directly client-writable; "AI estimate" provenance forgeable within CHECK bounds
- **Affected component:** `body_checks` + `body-check` Edge Function.
- **Evidence:** `20261105090000_body_checks.sql` (unchanged): CHECKs 3–60 for
  pct/low/high, `low <= pct <= high`, confidence enum, note ≤280,
  `UNIQUE(photo_id)`; policy "Users can CRUD own body checks" (`FOR ALL`,
  owner). `body-check/index.ts:155-160` writes via caller-token client;
  `clampBody` enforces width ≥2/≤12 + pct range — but the DB enforces ordering
  only, not width, so direct REST writes can store width-0/width-57 intervals
  within the CHECKs.
- **Impact:** forged "AI estimate" rows within bounds; display/trust only.
- **Remediation:** restrict writes to the edge function (service role) or add
  a `source` column distinguishing AI vs manual rows; enforce width bounds
  server-side.
- **Verification procedure:** throwaway cluster; direct INSERT of a width-0
  interval → must fail after fix; edge-function writes still flow.

#### SEC-22 — LOW — CONFIRMED — `spend_ai_tokens` silently drops token records when no `ai_usage` row exists (UTC-midnight boundary)
- **Affected component:** `spend_ai_tokens` + `ai_gate` metering.
- **Evidence:** R2 executed T-API-03: with NO `ai_usage` row for the current
  UTC day, `spend_ai_tokens` creates NO row (UPDATE-only) — the token record
  is silently lost — while the overage debit STILL applies when a credit row
  exists. The migration comment's claim ("hệ thống không bao giờ mất bản ghi")
  is FALSE in this case. SQL unchanged at tip.
- **Impact:** metering/audit records lost at the midnight boundary; overage
  debits without a corresponding usage record.
- **Remediation:** upsert the `ai_usage` row in `spend_ai_tokens` instead of
  update-only; no debit without a record (probe).
- **Verification procedure:** throwaway cluster; claim on day N, spend after
  UTC midnight → an `ai_usage` row must exist for day N+1.

#### SEC-23 — LOW — CONFIRMED — `claim_quest_reward` stores `p_reason` unbounded
- **Affected component:** `claim_quest_reward` (new version
  `20261119120000_claim_duplicate_marker.sql:56-60`).
- **Evidence:** `p_reason` (TEXT, no bound) is stored verbatim in
  `mascot_transactions.reason`. R2 probe T-API-08 stored a 100,000-char
  reason in full. The dedup fix in the same migration did not add a bound.
- **Impact:** minor storage abuse (one row per ref_key).
- **Remediation:** cap `p_reason` (e.g. 500 chars) in the function or a CHECK.
- **Verification procedure:** throwaway cluster; claim with a 100,000-char
  reason → must be truncated/rejected after fix.

#### SEC-24 — LOW — CONFIRMED — No rate limiting on `verify-purchase` / `store-webhook` / `delete-account` / `admin-art`
- **Affected component:** 4 non-AI Edge Functions.
- **Evidence:** no limiter code in any of the 4 handlers or in `_shared/`
  (re-checked at tip; `guard.ts` unchanged). The only limiting in the system
  is daily `ai_gate` quotas (AI only) and RPC-local limits (`dm_send` 30/min,
  posting trigger, `dm_open` 20/day). Platform-level (Supabase/Kong) limiting
  is UNVERIFIED. `delete-account` is the live exposure (authenticated users,
  unbounded calls) and now does **more** work per call than at R2 (storage
  listing + Apple identity lookup + revocation attempts); the other three are
  undeployed by design.
- **Impact:** worst case is Apple API quota burn / platform cost, not
  entitlement forgery (Apple re-verification holds).
- **Remediation:** edge-level rate limiting (dashboard/WAF) and/or JWS `x5c`
  pre-filter for the webhook (keeping re-verification authoritative); monitor
  Apple 429s.
- **Verification procedure:** dashboard/WAF rule exists + load test against a
  staging function shows 429s above threshold; Apple 429 alert fires.

#### SEC-25 — LOW — NEW (this round) — POTENTIAL RISK — Pinned `supabase-swift` 2.55.4 is behind a security fix in 2.55.7; app-target resolved versions unverifiable
- **Affected component:** SPM dependencies (`apps/ios/Packages/*/Package.resolved`, `project.yml`).
- **Evidence:** `ASCNDBackend/Package.resolved` pins `supabase-swift`
  **2.55.4** (2026-10-13); upstream 2.55.7 (2026-11-16) includes
  "**security:** redact secrets in verbose HTTP logs (v2 backport) (#1822)"
  plus auth fixes (clear stored session on `user_banned` refresh refusal;
  PKCE verifier-missing failure). The app does **not** enable verbose logging
  (`Backend.swift:23-61` — no `logLevel`; default), so the secret-redaction
  fix is defense-in-depth, not an active exposure here. GRDB is pinned
  **7.11.1**; 7.12.0 exists (2026-11-01, WAL snapshot-ordering workaround,
  quadratic-statement fix) with **no known CVE found** in public advisories
  (web search 2026-11-28). Sentry `from: 8.36.0` and PostHog `from: 3.13.0`
  are floating minimums in `project.yml:37-42`, and **no app-target
  `Package.resolved` is committed** (only the two package-level resolved
  files exist), so the resolved Sentry/PostHog versions are UNVERIFIABLE from
  the repo. No `npm audit` / SPM audit was runnable this round (see §0).
- **Remediation:** bump `supabase-swift` to ≥ 2.55.7 (and GRDB to 7.12.0 when
  convenient); commit the app-target resolved file or record resolved
  versions in CI so the next audit can check them.
- **Verification procedure:** after bump, `Package.resolved` shows ≥ 2.55.7;
  CI records resolved versions of Sentry/PostHog per build.

#### SEC-26 — LOW — CONFIRMED — `earn_mascot_coins` takes a `p_amount` it ignores (dead parameter, same mint surface as SEC-01)
- **Affected component:** `earn_mascot_coins` (`20260819120000_reward_amount_authority.sql:246-260`).
- **Evidence:** signature is `(p_ref_key TEXT, p_amount INTEGER, p_reason
  TEXT)` but the body is just `RETURN public.claim_quest_reward(p_ref_key,
  p_reason)` — `p_amount` is silently discarded and the amount always comes
  from `reward_amount_for`. Not a separate mint hole (the caller cannot choose
  an amount), but a misleading API: a future refactor that "uses" the parameter
  would open arbitrary minting, and RN callers may believe they set the amount.
- **Remediation:** drop the parameter (breaking change — coordinate with RN
  callers) or document that it is ignored and assert it is ignored in tests.
- **Verification procedure:** throwaway cluster; call with `p_amount = 999999`
  → credited amount must equal `reward_amount_for(p_ref_key)` (true today;
  pin it with a test so a refactor cannot change it silently).

### INFORMATIONAL

#### SEC-27 — INFORMATIONAL — CONFIRMED — Anon can read shared-library rows (by design); `reward_prices` correctly requires auth
- **Evidence:** R2 probe T-P2: anon saw 884 `exercises` rows via
  `user_id IS NULL OR auth.uid() = user_id` (default PUBLIC policies); anon
  saw 0 `profiles`/`daily_logs` rows. `reward_prices` SELECT requires
  `auth.uid() IS NOT NULL`. Unchanged at tip. No action unless shared-library
  sensitivity changes.

#### SEC-28 — INFORMATIONAL — CONFIRMED — Follow graph enumerable; `community_profiles` SELECT `USING (true)`
- **Evidence:** `USING (true)` SELECT on `community_follows` /
  `community_profiles` (`TO authenticated`); profiles carry no sensitive
  columns; no private-account setting exists. This enumerability is what makes
  the SEC-07 oracles practical. Revisit if private accounts are introduced.

#### SEC-29 — INFORMATIONAL — CONFIRMED — No certificate pinning (ATS defaults, no exceptions)
- **Evidence:** no `NSAppTransportSecurity` / ATS keys in `project.yml` at tip;
  no pinning code (`serverTrust`/challenge handlers) in `apps/ios` Swift.
  Acceptable for a Supabase-backed app; pinning would add operational risk
  (rotation) for limited gain. No action.

#### SEC-30 — INFORMATIONAL — CONFIRMED — Local GRDB caches unencrypted at rest; App Lock is a UX gate, not encryption
- **Evidence:** no SQLCipher; App Lock is `.deviceOwnerAuthentication` with a
  `UserDefaults` relock flag. Correction to R1 (carried from R2): file
  protection **is** set — `databasePath()` sets
  `.completeUntilFirstUserAuthentication` on the Application Support directory
  containing `ascnd.sqlite`. No Data Protection entitlement declared
  (entitlements are app-groups + HealthKit only). Exports use
  `.completeFileProtection`. Decision to record: SQLCipher + Data Protection
  entitlement evaluated or explicitly deferred.

#### SEC-31 — INFORMATIONAL — CONFIRMED — Edge CORS `Access-Control-Allow-Origin: *` (no credentials)
- **Evidence:** `guard.ts:58` `corsHeaders`; standard Supabase pattern; tokens
  are Keychain-held, not cookies, so a third-party site cannot supply the
  victim's token. No action.

#### SEC-32 — INFORMATIONAL — CONFIRMED — Posting/report/DM rate-limit counters are non-atomic
- **Evidence:** `community_posting_guard` (10 posts/hr, 30 comments/hr),
  `community_reports_guard` (10/24h), and `dm_send`'s 30/min check all use
  plain `count(*)` without locking — concurrent inserts can overshoot by burst
  size. Acceptable as-is; revisit if abuse is observed.

#### SEC-33 — INFORMATIONAL — CONFIRMED — Barcode lookup reveals barcode + IP to Open Food Facts
- **Evidence:** `BarcodeLookup.url()` builds
  `https://world.openfoodfacts.org/api/v2/product/<code>.json`, percent-encoded,
  plain `URLSession.shared`, no headers/identifiers. Privacy-policy coverage
  UNVERIFIED (AUD-48 item 9).

#### SEC-34 — INFORMATIONAL — CONFIRMED (good) — App Group holds widget display data only; no session tokens
- **Evidence:** `group.com.ascnd.fitnessos` holds `ascnd.widget.todayWorkout`,
  `ascnd.widget.streakReadiness`, `ascnd.widget.lang`, `ascnd.widget.koa`,
  `ascnd.widget.meal` + Koa PNGs; no tokens/userIds in the structs; `clear()`
  on sign-out removes data keys + images (language kept). Re-checked at tip
  (`WidgetRefresher.swift` fetched at tip: no token/password/email/secret
  hits). No action.

#### SEC-35 — INFORMATIONAL — CONFIRMED — `verify-purchase` / `store-webhook` / `delete-account` bypass the `dbUrl()`/`dbServiceKey()` indirection
- **Evidence:** direct `Deno.env.get("SUPABASE_URL"/"SUPABASE_SERVICE_ROLE_KEY")`
  at `verify-purchase/index.ts:99-100`, `store-webhook/index.ts:169-170`,
  `delete-account/index.ts:95-96`. Risk is config drift / rotation miss, not
  a live leak (no values anywhere). The other 9 functions use the indirection.
  Remediation: use the indirection consistently (one choke point for secret
  names/rotation).

#### SEC-36 — INFORMATIONAL — CONFIRMED — Post-deletion retention is a design choice, not a leak
- **Evidence:** `moderation_audit_log.actor_id` deliberately survives account
  deletion (no FK, pseudonymous UUID retention); `dm_messages.sender_id`
  CASCADE deletes the sender's messages from counterparties' threads, and
  `dm_threads` CASCADE deletes the whole thread when either party deletes
  their account (R2 probe T-P11r: 2 messages → 0 threads, 0 messages). Owner
  decision + privacy-policy coverage still UNVERIFIED.

### NOT REPRODUCIBLE — do not cite as a vulnerability

#### AUD-38 — UPDATE policies without `WITH CHECK` do NOT allow `user_id` mutation
- R2 behaviorally proved (probes T-P3/P3b on a throwaway cluster) that
  PostgreSQL uses the `USING` expression as the `WITH CHECK` when none is
  specified: `SET user_id = NULL` and transfer-to-B both fail `42501` on all
  5 tables (`exercises`, `food_items`, `mascot_inventory`, `profiles`,
  `weekly_challenges`). Missing explicit `WITH CHECK` is a clarity/robustness
  nit (P3 hygiene) — **not a vulnerability**. A24 (24/11) corroborates the
  shape: "6 policy UPDATE có `USING true` đều là RESTRICTIVE (chỉ thu hẹp)".

---

## 4. What W4 could NOT check

1. **Live RLS behavior.** Policy SQL was read as written; the 20-item AUD-48
   live-check matrix (applied-migration list vs repo, RLS probes as anon/
   authenticated/other-user, deployed functions vs repo, Auth dashboard
   settings, storage platform state, schema privileges incl. `CREATE` on
   `public`) is still open. The repo-side evidence is strong (A24's static
   audit of all 100/101 migrations: RLS on 68 tables, 130 policies all
   `auth.uid()`-anchored or authenticated-public-reads, no views), but static
   ≠ live.
2. **Production deployment state.** Which of the 101 migrations are actually
   applied (prose log says 98/98 after 20/11; the `20261124*` dedupe migration
   is explicitly undeployed), which Edge Function versions are deployed
   (`verify-purchase`/`store-webhook` 404 on 17/11 probe), Auth settings
   (email confirmation, password policy, leaked-password protection, MFA,
   redirect allowlist, recovery-link expiry, legacy JWT key rotation),
   backups/PITR/plan/pooler, `SUPABASE_ACCESS_TOKEN` bot access. The system-check
   bot has never read the server (A24), so no independent production evidence
   exists in-repo.
3. **Runtime behavior.** No simulator/device: Keychain behavior, App Lock,
   ATS enforcement, file-protection effectiveness, HealthKit permission
   handling, deep-link handling under a hostile link (code-reviewed only:
   `DeepLink.target` requires scheme `ascnd` + allowlisted routes, unknown →
   `nil`; `AuthLink` requires scheme `ascnd` + `code`/`access_token`/error
   params; PKCE is supabase-swift's default), StoreKit sandbox E2E, push
   (none — local notifications only, no APNs, no token table).
4. **Dependency CVE database access.** No `npm audit` / SPM audit runnable
   (see §0); the check is pinned-version comparison + web search only. RN
   (`native/package-lock.json`) was not audited in depth: RN is officially
   dropped (2026-11-17 directive) but still targets the same Supabase project;
   its dependency and client surface remain a residual shared-backend risk
   (21 RN-only RPCs, own `.env` handling) and are flagged for the owning worker
   rather than duplicated here.
5. **Secrets in full history.** No full-history access this round (no clone);
   the legacy publishable key in history (AUD-44) and its rotation remain
   UNVERIFIED. Tree-at-tip secret scan (this round): no service-role keys,
   private keys, `ghp_` tokens, or Google API keys; only the publishable
   (`sb_publishable_`) key in `Backend.xcconfig:11` and `native/src/lib/backend.ts:42`
   (public-by-design; RLS is the control) and env *names* only
   (`ASCND_AI_*`, `APPLE_*`, `PRODUCT_ID_*`, `APPLE_SIGNIN_*`) in Edge Function
   code. No `.env` file is tracked; `.gitignore:26-29` excludes `.env`/`.env.*`
   except `.env.example`. The broad-scope GitHub PAT on this VM
   (`admin:*`, `delete_repo`, etc.) is an operator credential hygiene note,
   not a repo finding — a repo-only token was already recommended at the last
   rotation.
6. **AI prompt-injection resistance.** `scope.ts` screening + the new
   `prompt-slots.ts` DATA_SLOT separation (data filled after language
   transforms, `$&`-safe replacement) and the KOA-T37 tightening were
   read, not adversarially tested. `looksHostile` caps input at 2000 chars
   and uses regex probes; bypass resistance is UNVERIFIED. `coach_memory`
   remains the only server-gated AI persistence; `body_checks` is
   client-writable (SEC-21).
7. **Admin-role provisioning.** Who holds `admin`/`moderator` in `app_roles`,
   how `bootstrap_first_admin` was executed, and whether any admin account is
   shared — not in the repo; UNVERIFIED. This matters more now that the admin
   UI ships in the native app (SEC-15).
8. **Telemetry liveness in release builds.** Keys are empty in committed config
   (by design — release keys live only in the Archive machine's uncommitted
   `Backend.local.xcconfig`); whether release builds actually emit Sentry/
   PostHog events is UNVERIFIED. The scrubber (SEC-02 fixed item 6) only
   matters if events flow.

---

## 5. Cross-references (not duplicated as SEC findings)

- **AUD-01 / R2-OPS-09 — backups & privacy text.** No backup/PITR evidence in
  the repo; shipped legal text asserts 30-day backup persistence. This is an
  operations + privacy-statement risk, owned by the ops/launch gate, not a
  code vulnerability — recorded here so the launch gate sees it in the
  security register. Verification: dashboard evidence of backup/PITR state +
  retention days; legal text corrected to match exactly.
- **AUD-05/09/27/28, AUD-50/51, R2-OPS-02/04/08/10** — performance/scale items
  with security-adjacent edges (unbounded reads, non-atomic counters) are
  covered where they have a security reading (SEC-14, SEC-32); the pure
  performance halves belong to the performance worker.
- **K-01 (Koa audit P0)** — the duplicate-claim celebration bug is the same
  defect as AUD-64, fixed by `20261119120000` (§2 item 1).
- **K-04 (Koa audit P0)** — the −20%/−10% weight-reduction coefficient shown
  but not applied; closed by PR #1001 per the alignment synthesis (not
  re-verified by W4 — out of scope).

---

## 6. Evidence index (where each claim was read)

**Tip bytes fetched via GitHub Contents API at `5e673df3`:**
`supabase/migrations/20261117*.sql`, `20261119120000*.sql`,
`20261120120000*.sql`, `20261120130000*.sql`, `20261120130100*.sql`,
`20261124120000*.sql`; `supabase/config.toml`;
`supabase/functions/_shared/guard.ts`, `ai.ts`, `apple.ts`, `scope.ts`,
`apple-signin.ts`, `prompt-slots.ts`; `supabase/functions/ai-coach/index.ts`,
`ai-coach/context.ts`, `ai-meal-suggest/index.ts`, `ai-smart-nudges/index.ts`,
`ai-weekly-review/index.ts`, `verify-purchase/index.ts`,
`store-webhook/index.ts`, `admin-art/index.ts`, `delete-account/index.ts`;
`apps/ios/ASCND/App/Store/PurchaseController.swift`,
`StoreKitClient.swift`, `apps/ios/ASCND/Features/Settings/PaywallView.swift`,
`apps/ios/ASCND/App/AppServices.swift`, `apps/ios/ASCND/App/Telemetry.swift`,
`apps/ios/ASCND/App/WidgetRefresher.swift`,
`apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend/Backend.swift`,
`SupabaseMascot.swift`, `SupabaseModeration.swift`,
`apps/ios/Packages/ASCNDBackend/Package.resolved`,
`apps/ios/Packages/ASCNDStore/Package.resolved`,
`apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Purchase/PurchaseCoordinator.swift`,
`.../AI/EdgeFunction.swift`, `.../Telemetry/TelemetryScrubber.swift`,
`.../Sync/Outbox.swift`, `.../Sync/SyncWorker.swift`,
`apps/ios/Packages/ASCNDStore/Sources/ASCNDStore/OutboxStore.swift`,
`Database.swift`, `AccountLifecycle.swift`,
`apps/ios/Config/Backend.xcconfig`, `apps/ios/project.yml`,
`apps/ios/docs/CONSTRAINTS_AND_DEFERRED.md`.

**Base worktree (`2fb08784`, blob-identical to tip unless listed as changed):**
all other `supabase/migrations/*.sql` (94 files), `supabase/functions/**`,
`apps/ios/Packages/ASCNDBackend/Sources/ASCNDBackend/*`,
`apps/ios/Packages/ASCNDKit/Sources/ASCNDCore/Auth/*`,
`.../DeepLink.swift`, `native/src/lib/backend.ts`, `.gitignore`.

**API checks:** tip commit `5e673df3` (2026-11-24, merge PR #1013); full
tree diff `2fb08784...5e673df3` (249 added / 76 removed / 308 changed);
default branch `main`; `.github/workflows` 404 on `main`; migration files at
tip: 101.

**Prior work reused:** R1 `ASCND_BACKEND_AUDIT_REPORT.md` (tip `b19e9822`);
R2 `audit-output/round-2/02-findings-register.md` (130 items); data map
`ascnd-map/inventory/02-data-backend.md` (tip `2fb08784`); A24 static audit
note in `CONSTRAINTS_AND_DEFERRED.md:727` (24/11, throwaway PG16, all
migrations — cited as third-party in-repo evidence, not W4 execution).
