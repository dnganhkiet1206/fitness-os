# Round 3 — Test report

All results below were executed; nothing is reported as passing without a run.

## SQL (PostgreSQL 16.x throwaway clusters, repo harness)

| Suite | Result |
|---|---|
| `supabase/tests/core/run.sh` | ✓ all labels green, incl. new K1–K4 (reward keys), E1c (freeze sale closed), FK1 (FK indexes), W1–W5 (wallet) |
| `supabase/tests/core/reverse.py` | **91/91** mutation cases red at the right label (88 before + K1, K3, K3b, K3c, E1c, W2, W5) |
| `supabase/tests/community/run.sh` | ✓ incl. new FK1 (community tables) |
| `supabase/tests/community/b_reverse.py` | 534/535 — the failing case C17 is **pre-existing**: same result on a clean checkout of `origin/native/ios-rewrite`; it depends on wall-clock time (UTC+7 day boundary) → R3-TEST-01 |
| Full 92-migration replay (core stub + all migrations) | ✓ applies; used for the FK/RLS/PK catalog checks (0 tables without RLS, 0 without PK) |

Environment note: macOS needs `LANG/LC_ALL=en_US.UTF-8` and `PG_BIN=/opt/homebrew/opt/postgresql@16/bin` for the harness.

## Swift (`swift test`, macOS)

| Package | Result |
|---|---|
| ASCNDKit | 2204 tests ✓ (outbox park/resend/scoping/purge rewritten; compact wallet equality added) |
| ASCNDStore | 78 tests ✓ (parked rows survive, purge scoped incl. `outbox_dead`, late-write fence) |
| ASCNDBackend | 50 tests ✓ (wallet DTO decode) |

## App / Simulator

- `xcodebuild build` scheme `ASCND` ✓ (project generated without the embedded Watch target; this Mac lacks the watchOS 26.5 runtime — R3-OPS-01).
- iPhone 17 Pro simulator, UI-test fake backend: app launches, Today renders, Koa room shows the seeded 250 coins through `mascot_wallet` (fake implements it).

## NOT RUN

- Any migration on a real Supabase project (needs Kiệt's approval per migration).
- `verify-purchase` with an induced DB error (no Deno/Supabase runtime with a DB here); `deno check` fails on a pre-existing `apple.ts` typing error.
- Sign-out → offline → sign-in park/resend on the simulator end-to-end (covered by Core + Store tests only; the fake backend has no offline toggle).
- Real iPhone, Watch app.
