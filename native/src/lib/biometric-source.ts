/**
 * Who produced today's readings — answered from the readings themselves.
 *
 * ── the claim the card could not support ──
 *
 * The biometrics card used to answer "connected?" by looking up
 * `wearable_sources`, a table **nothing in the app has ever written to**. So
 * the lookup came back empty for everybody and the header drew a red WifiOff
 * with *"chưa kết nối"* — printed two lines above the HRV and resting heart
 * rate that Apple Health had just supplied. One card, two contradictory
 * statements about the same reading.
 *
 * The honest answer was already in hand. Every row of `biometric_samples`
 * carries the `source` that wrote it: `use-health-sync.ts` and `lib/health.ts`
 * stamp `apple_health`, the offline writer stamps `manual`. A row exists
 * *because* something produced it, so the row is the evidence — there is
 * nothing to ask a second table about.
 *
 * ── why this is a function and not an inline ternary ──
 *
 * It is a rule with edges: `manual` is a real source and still not a
 * connection, an empty string is not a source at all, and a source this file
 * has never heard of is still worth naming rather than calling nothing. Those
 * are exactly the branches a reader nods past and a tool can run —
 * `tools/dead-schema.mjs` runs all of them.
 */

/** What the offline writer and the manual sheet stamp on a hand-typed row. */
export const MANUAL_SOURCE = 'manual';

/**
 * The label for the connection indicator, or `null` when nothing is connected.
 *
 * An unrecognised source is shown, not hidden. If a future importer starts
 * stamping rows, the card names it instead of quietly claiming there is no
 * connection — the failure this whole file exists to stop.
 */
export function connectedSourceLabel(source: string | null | undefined): string | null {
  const s = (source ?? '').trim();
  if (!s || s === MANUAL_SOURCE) return null;
  return s.replace(/_/g, ' ');
}
