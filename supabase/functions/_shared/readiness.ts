/**
 * What a stored readiness row does and does not say, for the functions that
 * describe one to a model.
 *
 * ── the rule ──
 *
 * Readiness is **composite training capacity**: HRV, resting heart rate, sleep
 * and training load, weighted over whichever of those could be measured.
 * Training load is a full dimension of it, so a red or a green can be built
 * from training load and nothing else. When that happens the score is real and
 * the app has measured *nothing* about how the person recovered.
 *
 * Measured on PostgreSQL 16.13, in all six timezones — a heavy 28-day base and
 * one small session in the last week:
 *
 *     45 · red · acwr 0.01 · explain "load:45"
 *
 * A model handed `{readiness: 45, readiness_status: "red"}` and nothing else
 * has no way to tell that from a red built on a 150-minute night, and the
 * advice for the two is opposite: one person needs to train more.
 *
 * ── why this file exists ──
 *
 * The app's canonical predicate is `hasRecoverySignal` in
 * `native/src/lib/readiness-i18n.ts`, and Deno cannot import from `native/src`.
 * So the rule exists twice by force — the same position `asleepMinutes` is in,
 * one directory over, and for the same reason.
 *
 * What it must not do is exist *four* times. Three functions need it, and
 * `_shared` is where the other cross-function rules already live.
 * `tools/readiness-confidence.mjs` lifts the source of the function below out
 * of this file, compiles it beside the native predicate, and drives both over
 * the same inputs — hostile tokens included. A drift is a red detector, not a
 * comment claiming the two agree.
 *
 * Block-bodied deliberately: Chain AC lost a round to an extraction regex
 * over-running an expression-bodied arrow.
 *
 * ── what the boolean means, and what it does not ──
 *
 * `true` says a recovery component was **measured**. It says nothing about
 * whether recovery was good or bad — that is what the score and the readings
 * are for. `false` says the app has no recovery reading for that day, so
 * nothing about the person's recovery may be claimed from readiness alone.
 *
 * Absent, empty or unparseable is `false`. A row nobody can read is not
 * evidence that recovery was measured.
 */
export const recoveryMeasured = (explain: string | null | undefined): boolean => {
  if (!explain) return false;
  return explain.split("|").some((p) => {
    const [key, scoreStr] = p.split(":");
    return (key === "hrv" || key === "rhr" || key === "sleep") && !Number.isNaN(Number(scoreStr));
  });
};
