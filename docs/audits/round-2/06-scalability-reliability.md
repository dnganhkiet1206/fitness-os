# ASCND Round 2 — Scalability & Reliability

Tip: `native/ios-rewrite` @ `b19e9822`. All scale verdicts are **estimates** extrapolated from the team's own measurements plus code analysis. **No load test was run or permitted** against production, and no isolated load harness exists. Measured numbers and estimates are labeled separately throughout.

## 1. Scale verdicts

| Tier | Verdict | Binding constraints (first to bite, in order) |
|---|---|---|
| 1,000 actives | **Comfortable** | None expected. Every hot path is a `(user_id, …)` indexed lookup or 30-row cursor page. Search scans are small. |
| 10,000 actives | **Comfortable, watch items** | Search miss-queries past ~50k posts/recipes; `community_follow_suggestions` O(profiles) per empty-search load; AI spend linear in actives (per-user quotas only); exercise fetch still under cap unless library grows. |
| 100,000 actives | **Works, with user-visible degradation** | Full-scan search (AUD-09) + RLS initplan overhead (R2-OPS-02) on every filtered query; DM 500-cap (AUD-49); hot-post trigger serialization (AUD-51); exercise fetch vs row cap (AUD-05, if library + user rows grow); reconnect rebuild storms — sequential 14-request rebuilds × 2 days × N queued entries (AUD-50 + R2-SYNC-04); following-feed URL/truncation (AUD-27). |
| 1,000,000 registered | **Not ready** without search + index work | Recipe/post search ~seconds per miss query by linear extrapolation (ESTIMATE — Round 1: ~10 s at 1M); profile search + sort per query; suggestions unusable. Per-user data paths stay fine. **No sharding needed:** single Postgres serves this tier with trigram/FTS indexes + the query fixes + initplan wrapping (design judgment, not a measurement). Gating unknowns: Supabase plan/pooler/row-cap, region/latency — all NOT_VERIFIED. |

Registered users cost almost nothing (one `profiles` + one `community_profiles` row each). Active users drive feed reads, search, rebuilds, and AI calls. Storage: photo count uncapped (5 MiB/file cap only); Round 1's arithmetic (100k × 10 photos × ~500 KB ≈ 500 GB) is an ESTIMATE using an assumed average photo size — actual compressed sizes are unmeasured; plan/bucket quotas NOT_VERIFIED.

## 2. Measured vs estimated (separated)

**Measured (team's own numbers, in migration headers / perf scripts — NOT re-measured here, no PG available):**

- `community_find_recipes` at 5k recipes: 2 ms hit, 53 ms miss (one-fold applied).
- `community_search_profiles` folded-column change: one condition 283 ms → 11 ms at the measured scale.
- `perf_find_recipes.sh` / `perf_search_profiles.sh` exist as manual measurement harnesses at 50k rows; not run in CI, no pass/fail thresholds (R2-OPS-10). Recorded outcomes live only in migration-header comments.
- STORED-column rewrite of `community_profiles`: 420 ms at 50k rows (from migration comment).
- `native-perf-audit.mjs` static scan: `XANH (0 lỗi)`, exit 0 (T-OPS-07, executed this round — a static scan, not a runtime measurement).

**Estimates (linear extrapolation + code analysis — labeled ESTIMATE):**

- Search latency at 100k/1M rows (AUD-09): ~1 s at 100k recipes, ~10 s at 1M; profile search ~180 ms at 1M + sort, per query.
- Reconnect storms: 20-entry drain ≈ 280 sequential requests minimum, ~560 if sessions are backdated (AUD-50 + R2-SYNC-04 arithmetic from code).
- AI permitted volume at 100k actives × per-user quotas: millions of calls/day by construction (AUD-54) — a billing control gap, not a measured spend.
- Storage arithmetic above (ESTIMATE).

## 3. Query efficiency, indexes, pooling, pagination, payloads

- **Index inventory (grep-verified):** 72 explicit `CREATE [UNIQUE] INDEX` statements; catalog count 158 indexes (Round 1, incl. PK/unique-implied). **Zero** `USING GIN` / `USING GiST`, zero `CREATE EXTENSION`, zero trigram/FTS usage in SQL (only a comment deferring pg_trgm). No index exists on any JSONB column.
- **RLS initplan (R2-OPS-02):** 232 bare `auth.uid()` occurrences, 0 wrapped as `(select auth.uid())`. Every RLS-filtered query re-evaluates the JWT claim per row. Advisor-flagged (`auth_rls_initplan` among 114 performance warnings, bot first run 28/10, unaddressed).
- **Feed policy cost:** `community_posts` SELECT policy evaluates `community_blocked_between` (PK point lookups, cheap per row) plus an `EXISTS` over `community_follows` (PK lookup) **per candidate row**, on top of the initplan issue. At 30 rows/page this is fine; the cost is per-*scanned* row before LIMIT — which is why the useful-feed sort (AUD-55) and the following-feed `IN()` list (AUD-27) matter more than the policy itself.
- **Unindexed FKs (AUD-10):** 25 (27 strict) — full scans on user-scoped reads + slow cascade deletes.
- **Duplicate indexes (AUD-16):** 7 exact-duplicate groups + 13 near-duplicate groups — write amplification, storage, planner noise.
- **Connection pooling:** no pooler configuration exists in the repo (zero mentions of pgBouncer/Supavisor/`max_connections`/pool modes). The app never opens a Postgres connection — all traffic is REST via one shared client — so client-side connection exhaustion is not a credible first bottleneck. Server-side pooler/plan/connection limits are NOT_VERIFIED.
- **PostgREST row cap:** no `PGRST_DB_MAX_ROWS` config in repo; live cap NOT_VERIFIED. All unbounded-read findings are conditional on the live cap (default 1,000 on Supabase). The cap's *existence* as a silent-truncation mechanism is the risk; the exact number must be confirmed live.
- **Pagination inventory (re-verified):** feed/comments correct (keyset cursors, 30/page); inbox `LIMIT 100` no cursor; DMs oldest-first `LIMIT 500` no cursor (AUD-49); `dm_inbox` RPC `LIMIT 200` no cursor; progress photos OFFSET-paged 200/page loading all pages; history/performance/training 90-day windows unbounded (R2-OPS-08); exercises/ledger/followees unbounded (AUD-05/27/28); search RPCs server-capped at 30 (cost is the scan); notifications `LIMIT 100` no cursor.
- **Payload sizes (from code, not network):** exercise fetch ≈ 873 rows × 10 columns incl. 3 name localizations + `search_text` on every `load()`/`refresh()`; DailyLog rebuild fetches full `sets` JSONB for 7d + 28d windows (twice, overlapping); `ai-coach` reads up to 60 sessions × `sets` for 8-week progress plus `select("*")` on profiles/daily_logs/sleep_logs; image payloads capped at 4M base64 chars (~3 MB) server-side, 5 MiB + JPEG 0.6 client-side for progress photos. No payload-size telemetry exists.
- **Contention:** economy serialization via per-user advisory locks (9 call sites) is deliberate, single-user blast radius. Post-row UPDATE serialization via triggers is AUD-51 (2 synchronous UPDATEs per interaction + notify work; magnitude unmeasured). No counter sharding, no deferred aggregation, no background aggregation jobs. No lock-wait or deadlock monitoring.
- **Local DB perf:** GRDB tables tiny by design; no indexes beyond PKs/uniques — appropriate. `read_cache` stores whole-list JSON snapshots (exercise library ≈ 873 rows serialized per save) — write cost on every refresh, acceptable on-device, unmeasured. No startup-time or memory measurement exists (R2-OPS-10).
- **Startup / repeated requests:** launch constructs `AppServices` whole; each tab/book refreshes on appear/foreground. Overlapping 90-day session fetches from three books (R2-OPS-08) and per-page followee refetches (AUD-27) are the concrete repeated-request wastes. No request coalescing/dedup layer beyond SwiftUI task scoping. No startup measurement — no claim is made about launch time.

## 4. Edge latency and AI cost shape (code-derived, NOT measured)

- **Per-call fan-out:** `ai-coach` = 8 parallel PostgREST reads + quota claim + streaming provider call; `ai-smart-nudges` = 4 reads + claim + 1 provider call; `ai-weekly-review` = 5 reads (incl. `select("*")` month of `daily_logs` + week of `sleep_logs`) + claim + 1 provider call. All non-streaming functions return full JSON only after generation completes — zero bytes until then (R2-OPS-04).
- **Provider failover:** up to 3 providers, per provider up to 3 attempts on 503 only (0.6 s / 1.2 s delays), 20 s header timeout per attempt (45 s minimum for vision). Worst-case time-to-first-byte well over 60 s on the 503 path; vision ≈405 s worst case (AUD-54 expansion). Arithmetic upper bounds from code, **not** measured latency.
- **Quotas are per-user only** (coach 60/day, meal-suggest 30, nudges 30, body-check 20 default). No aggregate budget, no queue, no backpressure, no concurrency cap (AUD-54). Provider-side limits and plan NOT_VERIFIED.
- **Quota claim precedes work;** a client-side timeout abort does not un-claim the call (R2-API-03, R2-OPS-04).
- **Apple verification:** 2 fetches per usable transaction id, no rate limiting on the webhook (AUD-46). Latency is Apple-API-bound; no measurement exists.

## 5. Reliability & disaster recovery

- **Backups/PITR:** no evidence in repo (AUD-01, CONFIRMED as repo-absence). No backup config, PITR toggle record, RPO/RTO statement, restore procedure, restore-drill record, or backup-status check in the system-check bot. Production status NOT_VERIFIED. Shipped privacy text asserts 30-day backup persistence (R2-OPS-09).
- **Rollback:** none. Forward-only migrations, no down migrations, no rollback doc, no compensating-migration procedure. All index builds non-concurrent (platform constraint: `db push` is transactional). One ACCESS EXCLUSIVE rewrite migration exists (`display_name_folded` STORED column). A bad migration can only be undone by authoring a new one under pressure, against an unverified backup.
- **Failure handling (client):** strong for the offline/record path (outbox, idempotency, OCC, stall recovery, 3-state reachability with active probing). Weak for the online-only surface: community/DM/AI/economy/photos fail immediately offline with no queue; `StateWriter` intents memory-only; sign-out destroys the unsent queue (AUD-06 — the single most consequential client-side data-loss path).
- **Reconciliation:** none server-side. Denormalized aggregates have no reconciliation job, materialized view, or CHECK tying them to sources (AUD-19). No scheduled jobs exist at all (no `pg_cron`, no scheduled functions — grep-verified zero; dashboard cron NOT_VERIFIED). The only periodic work is client-driven (BGAppRefresh notification check) and CI-driven (system-check bot, push-triggered only — R2-OPS-01).
- **Incident response:** no incident doc, no on-call, no severity playbook, no status plan, no runbook of any kind in repo. The system-check bot is the closest thing to incident detection and it is batch/daily-by-design (and currently push-only).
- **Single points of failure:** one Supabase project (one Postgres, one PostgREST, one Auth, one Storage; no failover, no read replica, no multi-region story); manual deploys on one machine (R2-OPS-06); telemetry keys on one machine's uncommitted file. Acceptable pre-launch; must be a conscious decision, not an accident.

## 6. Observability (installed ≠ active ≠ alerting)

| Layer | Installed? | Active/verified? | Alerting? |
|---|---|---|---|
| Sentry (crash) | Yes — SDK wired, `tracesSampleRate 0.2`, dSYM upload phase | **NOT_VERIFIED.** Keys empty in committed config; release keys only on the Archive machine. No manual `capture` calls (R2-OPS-03). dSYM upload warns-never-fails. | No — bot reports new issues in batch (push-triggered). No Sentry alert rules in repo. |
| PostHog (funnel) | Yes — fixed event enum, 31 events, no PII/health data, no replay | **NOT_VERIFIED** (same key caveat). Bot queries `$exception` but nothing sends it — vacuous. | No. |
| Edge function logs | `console.error` only (56 sites, 14 files; `admin-art` zero) | Retention NOT_VERIFIED. No structured logging, request ids, error tracking, or metrics. | No. |
| DB health | Advisors via bot only | Bot first run (28/10): 73 security + 114 performance warnings, unaddressed, no triage record. No `pg_stat_statements`, connection/bloat/lock monitoring. | No. |
| Deploy/drift | System-check bot: migration diff, function code diff, liveness probe, secret presence | Bot logic verified in repo; **bot output NOT_VERIFIED**; schedule dead (R2-OPS-01) — push-triggered only. | Change-only comments on #527. Not paging, not latency-sensitive. |
| Uptime/latency | None | No health-endpoint monitoring, uptime checker, p95 tracking, or Sentry transactions/spans. Client reachability probing is UX, not monitoring. | No. |
| Client error reporting | None beyond auto-crash | Sync/rebuild/HealthKit/AI/purchase failures are device-local only. `rebuildAfterWrite` failures discarded by a `Void` callback. | No. |

**Detection matrix — can operators detect…?** Failed sync: **no.** Reward abuse: **no** (only the 800/day ceiling; no anomaly detection, no audit trail outside moderation). Purchase failures: **no.** DB errors: **no.** Auth failures: **no.** Latency degradation: **no.** Data growth: **no.** Migration failures: **partially** (bot drift check, push-triggered, after the fact). HealthKit import failures: **no.** Failed AI calls: **partially** (console logs within retention; quota tables show usage, not failures). See R2-OPS-03.

## 7. What to fix, in scale order

| Before | Fix | Findings |
|---|---|---|
| Any external beta | Backups + restore drill; #241 decision; scheduled CI; privacy-claim evidence | AUD-01, AUD-06, R2-OPS-01, R2-OPS-09 |
| Public launch | Error reporting live + verified; CI release build + key/dSYM gates; rollout/rollback plan | R2-OPS-03, R2-OPS-06, AUD-58 |
| 10k → 100k actives | Search indexes + one-fold; FK indexes; initplan wrapping; bounded reads; rebuild coalescing; DM pagination | AUD-09, AUD-10, R2-OPS-02, AUD-05/27/28, AUD-50, AUD-49 |
| 100k → 1M | Follow-suggestion rework; hot-post contention plan (if observed); aggregate AI budget; retention + scheduling | AUD-09, AUD-51, AUD-54, AUD-30, AUD-60 |
| Ongoing | EXPLAIN-shape gates; perf baselines; advisor triage; deploy log discipline | R2-OPS-10, AUD-57, R2-OPS-11 |

*End of scalability & reliability.*
