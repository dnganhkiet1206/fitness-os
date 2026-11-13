# Round 3 — Remaining risks and next steps

## Remaining risks (ranked)

1. **AUD-01 — no restorable backup** (`pitr_enabled: false`, `backups: []`). One bad migration or manual delete has no undo. Owner: enable PITR / paid plan, or at minimum a scheduled `pg_dump` (needs a DB credential as a CI secret) + a recorded restore drill. Fix or correct the "30 days" privacy sentence (R2-OPS-09).
2. **Round 3 migrations not deployed.** Until Kiệt approves and they are applied, production still has the forgeable `w:`/`ch:` keys, the open freeze sale, the missing indexes. Order: `reward_key_shapes` → `streak_freeze_sale_closed` → `fk_indexes` (+ community) → `mascot_wallet`. Each is additive/replace-only; rollback = re-apply the previous function definition / `DROP INDEX` / `GRANT`.
3. **R2-OPS-01 / R2-OPS-03 — operational blindness**: scheduled workflows never run (default branch `main` has none — needs an owner decision, agents must not touch `main`); no manual error reporting for sync/AI/DB failures.
4. **R3-SEC-02 / AUD-03 / AUD-25 — client-asserted completion**: daily quests, achievements and challenge progress are verified against client-written rows. Bounded (window + 800/day ceiling, keys now validated) but not proven. Award grant RPC (AUD-03) is the next economy item.
5. **R3-DATA-01** — in-progress workout state (`workout_day`) still dropped on session end.
6. **Scale items** — AUD-09 (no trigram/FTS index for search), AUD-05 (exercise library ~873 rows near `max_rows`), AUD-27 (following feed `IN()` list), AUD-50 (rebuild amplification on reconnect).
7. **R3-TEST-01** — time-dependent C17 reverse case can turn CI red in the evening (UTC).

## Next steps (recommended order)

1. Kiệt: approve deploy of the 4 migrations; decide PITR / backups; pick option for scheduled CI (beta-gate sheet §5).
2. AUD-03 award grant RPC (server re-derives eligibility from server rows, client INSERT policy dropped).
3. R2-OPS-03 manual error reporting (sync dead entries, rebuild failures, AI errors → Sentry with tags).
4. AUD-05 explicit paging of the exercise library + loud failure on truncation.
5. AUD-09 `pg_trgm` GIN on folded columns + one-fold `find_posts`; measure with the existing `perf_*.sh`.
6. R3-DATA-01 keep `workout_day` per owner across session end (same pattern as the outbox).
7. R3-TEST-01 pin the clock in the C17 case.
