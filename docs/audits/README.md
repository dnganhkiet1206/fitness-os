# Backend & Supabase audit reports

Read-only audit artifacts. No code was modified to produce them.

- **Audited tip:** `b19e9822` (`native/ios-rewrite`, Merge PR #868, 2026-11-10 13:22 CST).
  The branch has since moved on; findings are stated against the audited tip.
- **Standard:** the native iOS app (`apps/ios/`) is the source of truth (owner decision
  2026-11-11). React Native code is legacy context only.
- **Method:** repository inspection only. No Supabase/live-DB access existed, so every
  finding that needs the live project is marked UNVERIFIED in the reports.

## Round 1 — Full Backend & Supabase Architecture Audit (2026-11-11)

`round-1/ASCND_BACKEND_AUDIT_REPORT.md` — 10 phases, 12-section report.
88 findings: 1 CRITICAL, 11 HIGH, 34 MEDIUM, 23 LOW, 19 INFO.
Phase 9 verified on throwaway PG16 clusters: both SQL suites PASS, all 88 migrations
apply cleanly in order.

## Round 2 — Full-Spectrum Engineering & Production Audit (2026-11-11/12)

`round-2/01-executive-report.md` … `08-evidence-index.md`.
Revalidated all 88 Round 1 findings: 72 CONFIRMED, 15 PARTIALLY_CONFIRMED,
1 NOT_REPRODUCIBLE (AUD-38), 0 fixed. 42 new findings (0 P0, 2 P1, 12 P2, 28 P3).
167 test cases: 64 passed, 14 failed (defect reproductions), 27 blocked,
39 not runnable (no Swift toolchain), 23 specification-only.
Production verification: 0/20 items verified (no access).

## Beta gate decision sheet

`beta-gate-decisions.md` — the 6 owner-only decisions from the Round 2 release gate
(B-1..B-6, 0/6 pass), distilled to A/B/C choices. Posted for the owner; B picks up
work in the order listed there after the owner decides.

## Headline verdicts (both rounds agree)

- Supabase architecture is suitable for ASCND; no migration or rewrite needed.
- NOT safe for public launch as-is; limited closed beta only once the 6 P0 gate
  conditions pass (0/6 at the audited tip).
- Top risks: unverified backups/PITR (AUD-01); forgeable rewards, 800 coins + ~800 XP/day
  via invented RPC keys (AUD-02); no native purchase flow (AUD-04); streak freeze
  buyable but unspendable (AUD-14); sign-out destroys unsynced offline records,
  owner decision #241 still pending (AUD-06).
