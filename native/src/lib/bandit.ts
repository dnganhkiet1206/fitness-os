/**
 * Which thing to bring up, learned from whether bringing it up ever worked.
 *
 * ── the problem with a fixed order ──
 *
 * Koa picks one gap to mention and the order was a constant:
 * `['workout', 'meal', 'sleep', 'water']`. Written by me, for everybody, for
 * ever. It is a reasonable guess and it is a guess — for the person who never
 * once acts on a training nudge but always drinks when reminded, it is the
 * wrong sentence every single day, and nothing about the app ever notices.
 *
 * ── what the big recommenders actually do ──
 *
 * Not a rule, and not a model of what you *should* want. They treat every
 * placement as a **bandit**: several things could be shown, each has an unknown
 * chance of working for this person, and every impression is both a use and an
 * experiment. Thompson sampling is the standard answer and is the one used for
 * send-time and message selection in production notification systems: keep a
 * belief about each option, draw a sample from each belief, show the winner.
 * Options that keep working get drawn more; options that have never been tried
 * keep a wide belief and therefore keep getting a turn.
 *
 * That last property is the reason it is this and not "show whatever has the
 * best average". An average over two observations is not knowledge, and an
 * algorithm that treats it as knowledge locks itself into its first accident.
 *
 * ── the honest limits of doing it here ──
 *
 * **The base-rate trap.** Water is easy and a workout is hard, so "did they do
 * it after I mentioned it" rewards water no matter what the mention achieved.
 * With no control group there is no separating persuasion from ease, and
 * pretending otherwise would be the kind of metric-chasing that makes software
 * quietly hostile. Two things keep it honest: the prior below is the editorial
 * order, so the app starts by saying what matters rather than what converts,
 * and `CAP` limits how far evidence can move it. Koa can learn that you respond
 * to water. It cannot learn to stop mentioning training.
 *
 * **It is small data.** A handful of observations a week, on one device, for one
 * person. That is why the posterior is a Beta over integer counts — exact,
 * cheap, no library — rather than anything with a learning rate in it.
 */

/** Wins and losses as Beta parameters, both ≥ 1 (the prior is the +1). */
export interface Arm {
  alpha: number;
  beta: number;
}

/**
 * How much total evidence one arm may accumulate before it is halved.
 *
 * Halving is what makes this a model of a person rather than of their past:
 * somebody who ignored every meal nudge in January and logs religiously now
 * should not be carrying January around. It also bounds the confidence, which
 * is what stops a learned preference from becoming a rule (see the base-rate
 * note above).
 */
export const CAP = 40;

export const newArm = (priorWins = 1, priorLosses = 1): Arm => ({
  alpha: priorWins,
  beta: priorLosses,
});

/**
 * Fold one outcome in.
 *
 * Halving on overflow keeps both parameters integers, which is what lets
 * `sampleBeta` stay exact — see there.
 */
export function reward(arm: Arm, win: boolean): Arm {
  let { alpha, beta } = arm;
  if (win) alpha += 1;
  else beta += 1;
  if (alpha + beta > CAP) {
    alpha = Math.max(1, Math.round(alpha / 2));
    beta = Math.max(1, Math.round(beta / 2));
  }
  return { alpha, beta };
}

/** The belief's centre — for display and for tests, never for choosing. */
export const mean = (arm: Arm): number => arm.alpha / (arm.alpha + arm.beta);

/**
 * One draw from Beta(α, β), for integer α and β.
 *
 * Exact, and short enough to be obviously right: a Gamma(k, 1) variate for
 * integer k is the sum of k exponentials, an exponential is `−ln U`, and
 * `X / (X + Y)` with X ~ Gamma(α), Y ~ Gamma(β) is Beta(α, β) by definition.
 * No Marsaglia–Tsang, no normal variates, nothing to get subtly wrong — which
 * matters, because a sampler that is *nearly* right produces plausible numbers
 * and a silently biased app.
 *
 * `tools/personalize.mjs` checks it against the analytic mean and variance
 * rather than taking the paragraph above on trust.
 */
export function sampleBeta(arm: Arm, rnd: () => number): number {
  const gamma = (k: number) => {
    let s = 0;
    for (let i = 0; i < k; i++) {
      // `1 - rnd()` so a generator that can return exactly 0 never yields −∞
      s -= Math.log(1 - rnd());
    }
    return s;
  };
  const x = gamma(arm.alpha);
  const y = gamma(arm.beta);
  return x + y === 0 ? 0.5 : x / (x + y);
}

/**
 * The arms, best first, by one Thompson draw each.
 *
 * A full ranking rather than a single winner because the caller may find its
 * first choice does not apply today — the gap it wanted is already filled — and
 * "next best" should still come from the same draw rather than from a second
 * roll of the dice.
 */
export function rankArms<K extends string>(
  arms: Record<K, Arm>,
  rnd: () => number = Math.random,
): K[] {
  return (Object.keys(arms) as K[])
    .map((key) => ({ key, draw: sampleBeta(arms[key], rnd) }))
    .sort((a, b) => b.draw - a.draw)
    .map((d) => d.key);
}

/**
 * A seeded generator, so a test can assert on a *sequence* and a bug in the
 * ranking cannot hide behind randomness.
 *
 * mulberry32 — small, fast, and good enough for choosing which of five
 * sentences a koala says.
 */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Which asks are waiting for an answer, alongside the beliefs they will update.
 *
 * ── why the bookkeeping is here and not in the store ──
 *
 * Because it was in the store, and it was wrong. Attribution is the part of a
 * bandit that decides what it learns, and it is the part that looks like
 * plumbing — so it sat in a React module next to `AsyncStorage`, where nothing
 * could run a day through it and see the answer. The bug it hid: one pending
 * slot for the whole day, so a morning ask about meals was **overwritten** by an
 * evening ask about training. The meal that was then logged credited nothing,
 * and training took a loss for a day it had barely been mentioned. The model
 * learned the reverse of what happened, in the most ordinary shape of a day.
 *
 * Here, `tools/personalize.mjs` plays that exact day through and checks who got
 * the credit.
 */
export interface AskLedger<K extends string> {
  arms: Record<K, Arm>;
  /** the day each option was last put in front of the person */
  asked: Partial<Record<K, string>>;
}

/** Koa asked about `key` today. Idempotent — a re-render is not a second ask. */
export function noteAsk<K extends string>(l: AskLedger<K>, key: K, date: string): AskLedger<K> {
  if (l.asked[key] === date) return l;
  return { arms: l.arms, asked: { ...l.asked, [key]: date } };
}

/** They did it. Credits the ask only if it is the one still outstanding today. */
export function credit<K extends string>(l: AskLedger<K>, key: K, date: string): AskLedger<K> {
  if (l.asked[key] !== date) return l;
  const asked = { ...l.asked };
  delete asked[key];
  return { arms: { ...l.arms, [key]: reward(l.arms[key], true) }, asked };
}

/**
 * A new day: everything asked on an older day went unanswered, and that is a
 * miss.
 *
 * A learner that records only its successes convinces itself everything works,
 * and the failures are the half that makes the arithmetic mean anything.
 *
 * ── this line requires `asked ⊆ arms`, and the types are not what enforces it ──
 *
 * `reward(arms[k], false)` below assumes every key in `asked` names an arm. The
 * types say it does — `asked` is keyed by `K`, `arms` is total over `K` — and at
 * runtime both came out of one `JSON.parse`, which has never read them. Three
 * blobs put a key here that `arms` did not have: an unknown key, `asked` as a
 * string (which spreads into `{0:'n', 1:'o', …}`), and the app's own v1
 * `pending` migration, which copied `pending.quest` across without asking
 * whether it still named a quest. Each threw `Cannot destructure property
 * 'alpha' of 'arm'` — from a `useEffect` in `use-mascot`, so a red screen, and
 * before the save, so the bad key survived to do it again next launch.
 *
 * The precondition is now established where the state enters, by
 * `normaliseAsked` in `bandit-state.ts`, rather than re-checked here. There is
 * deliberately no guard on this line: a branch that nothing can reach is a
 * branch no rule can honestly prove, and this file's job is the arithmetic.
 */
export function settle<K extends string>(l: AskLedger<K>, today: string): AskLedger<K> {
  const stale = (Object.keys(l.asked) as K[]).filter((k) => l.asked[k] !== today);
  if (stale.length === 0) return l;
  const arms = { ...l.arms };
  const asked = { ...l.asked };
  for (const k of stale) {
    arms[k] = reward(arms[k], false);
    delete asked[k];
  }
  return { arms, asked };
}
