# ASCND Round 3 — Remediation (executive summary)

| Field | Value |
|---|---|
| Branch | `claude/backend-round3` (from `native/ios-rewrite` @ `b19e9822`, base merged up to `4ebf6916`) |
| Date | 2026-11-12 |
| Inputs | Round 1 + Round 2 reports (`docs/audits/round-1`, `round-2` on `agent/c/backend-audits`), `beta-gate-decisions.md`, own reinvestigation of the code |
| Mode | **Remediation** (code + migrations + tests). Rounds 1–2 were read-only. |

## 1. Verdict

Round 3 fixed the data-loss path and three economy/integrity defects, added the missing FK
indexes and the server-side wallet, and reconfirmed (with execution) several Round 1/2
findings. Nothing was deployed: **no migration was applied to any Supabase project** — the
only active project (`ascnd`, `guqmbqtgxqleuwajvwvg`) is the live backend and repo rules
require Kiệt's per-migration approval. All SQL was executed on throwaway PostgreSQL 16 clusters
with the repo's own suites; all Swift was executed with `swift test` and on the iOS Simulator.

Beta gate after Round 3 (code side): **B-3, B-4, B-6 fixed in code; B-2 closed by option B**;
B-1 (backups) and B-5 (live checks) remain owner/dashboard work and are still open. Nothing
counts as "verified in production" until the migrations are deployed and checked live.

## 2. What changed

| ID | Problem | Fix | Evidence |
|---|---|---|---|
| **AUD-06**, R2-SYNC-01, R2-API-08 | Every session end (sign-out, expired/revoked token, account switch) deleted all unsent offline records; the delete was not scoped to the leaving user | Outbox **parks** entries per owner: `next()` only sends the signed-in user's lane, never kills other owners' entries; counts are owner-scoped; `purge(userId:)` only on confirmed account deletion. #241 resolved as option (b)/A | ASCNDKit 2204 ✓, ASCNDStore 78 ✓; tests rewritten for park/resend/scoping/purge |
| **AUD-02** (B-3, partial) | `w:<anything>` and `ch:<tier>:<date>:<key>` accepted invented keys → 800 coins/day | `w:` retired; `ch:` must be a recent ISO Monday, one of that week's 3 deterministic challenges (`WeeklyChallenges.pick`) or `koa_week`, with the canonical tier | `rpc_reward_keys` K1–K4 ✓; 4 reverse cases ✓ |
| **AUD-10** | 25 FKs without a leading index (RLS `user_id` scans, cascade scans on account delete) | 2 migrations (11 core + 14 community indexes) + guard test in both suites | `fk_indexes` FK1 ✓ (core + community) |
| **AUD-14** (B-2) | Freeze sold (150 coins) but never spendable | Option B: revoke `buy_streak_freeze` from `authenticated`; existing freezes untouched | `rpc_authority` E1c ✓ + reverse ✓ |
| **AUD-47** (B-6) | `verify-purchase` expired/refunded branch ignored upsert errors (fail-open) | Error checked → 500, like the paid branch | Code review; `deno check` error in `apple.ts` is pre-existing (identical without the change) |
| **AUD-05** | Exercise library (~873 rows) read in one unbounded request near PostgREST `max_rows`; truncation would be cached silently | Paged to the end (500/page, ordered by muscle_group, name, id); >20 pages throws instead of caching half a library | `LibraryPagingTests` (0–2500 rows, cap) ✓ |
| **R2-OPS-03** (partial) | Sync failures invisible to the team: dead entries / disk-write failures only on the user's screen; rebuild failures discarded | `SyncWorker.onIncident` → Sentry (`sync.dead`, `sync.local_write`, `sync.rebuild_failed`) with kind/reason/code tags, no payload/PII | `refusedEntryRaisesAnIncident` ✓; app builds. Live Sentry delivery NOT RUN (no DSN locally) |
| **AUD-28** | Wallet summed from an unbounded ledger read; silently wrong after PostgREST `max_rows` truncation (~3 months of use) | `mascot_wallet()` RPC: balance + XP per key class + recent/one-time claimed keys; app falls back to the old read on `PGRST202` so it works before/after deploy | `rpc_mascot_wallet` W1–W5 on a 1500-day ledger ✓; Swift compact-vs-full equality ✓; simulator Koa room shows seeded balance via RPC |

## 3. Reconfirmed by execution (no code change needed)

- **AUD-01** — `supabase backups list` (read-only): `pitr_enabled: false`, `backups: []`. No restorable backup exists. Owner decision (paid plan) — recorded in `CONSTRAINTS_AND_DEFERRED.md` §1.
- **AUD-37** — all 11 auth-required functions call `requireUser` (getClaims + role + aud) first; `store-webhook` unauthenticated by design.
- **AUD-87** — HealthKit import is idempotent (`user_id,external_id` upserts, water by id) and re-reads rolling windows, so a partial run is re-covered by the next. Residual: >7 days without a sync drops older workouts (AUD-52 territory).
- Economy RLS: no client INSERT/DELETE on `mascot_transactions`/`mascot_inventory`, item swap blocked by trigger, `entitlements` service-only.

## 4. New findings (R3)

| ID | Sev | Finding | Status |
|---|---|---|---|
| R3-TEST-01 | P3 | Community reverse case C17 (UTC+7 progress) is red between 17:00–24:00 UTC — reproduced on clean base | Open (test fix) |
| R3-DATA-01 | P3 | In-progress workout day (`workout_day`) is still deleted on session end | Open (next) |
| R3-DATA-02 | P2 | Wallet truncation (AUD-28 framed as correctness, not just scale) | Fixed |
| R3-OPS-01 | P3 | Local builds of scheme `ASCND` need the watchOS 26.5 runtime since #853 (embedded Watch app) | Open (doc/tooling) |
| R3-SEC-02 | P3 | Daily quest completion (`d:`) still client-asserted; bounded by window + ceiling | Accepted residual (see 03) |

Legacy gate checks (`native/tools/quest-lifecycle.mjs`, `economic-integrity.mjs`) were updated to the round-3 key rules (real keys of the week pay their tier; invented keys pay 0; ceiling measured with shape-valid keys), and accept `PG_BIN` so they run on macOS.

## 5. Environment & safety

- Supabase: only read-only CLI calls (`projects list`, `backups list`) against `guqmbqtgxqleuwajvwvg`. **No migration applied, no data or config changed, no deployment.**
- Production: same project; nothing written.
- Local: PostgreSQL 16 throwaway clusters (repo harness), iOS Simulator with the UI-test fake backend.
