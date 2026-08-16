/**
 * What kind of stretch this person is in — the layer between the raw days and
 * anything that wants to act on them.
 *
 * ── the hole this fills ──
 *
 * The app could already tell you two things about consistency: the streak (how
 * many days in a row, right now) and `streakInDanger` (the run is alive, today
 * is empty, and their evening is running out). Both are about **today**. Neither
 * can tell the difference between:
 *
 *   · somebody who trains four days a week and missed Tuesday;
 *   · somebody who trained four days a week for a month and has managed one day
 *     in the last fortnight;
 *   · somebody who has been here five days and has no baseline at all.
 *
 * The streak reads all three as the same number. So every part of the app that
 * wanted to be gentler with the second person had nothing to ask.
 *
 * ── and the reason it is not simply "are they lapsing" ──
 *
 * The evidence on this is one-directional and worth stating plainly, because it
 * decides the whole shape of the file. Streak mechanics and reproachful
 * characters work through **introjected regulation** — pressure a person applies
 * to themselves out of guilt or shame. It buys short-term compliance and
 * predicts long-term maintenance *worse* than autonomous motivation does; the
 * effect of negative affect on carrying on at all is moderated by
 * self-compassion, which is precisely what an app is in no position to supply
 * by looking disappointed.
 *
 * So this answers **"what is hard right now"** and never "what did they fail to
 * do". Every state below is a description of a situation, and each one exists
 * because something downstream should behave differently in it — not because it
 * is a category of person.
 *
 * ── three guardrails, and they are the actual work ──
 *
 *   1. **A missed day is not a trend.** One gap inside an otherwise ordinary
 *      week is the most common thing that happens to anybody, and a system that
 *      reacts to it is a system that reacts constantly. Nothing is claimed
 *      unless the recent window falls short of the person's own baseline by
 *      more than `DROP_FRACTION` **of that baseline** — a proportion, so the
 *      rule reads the same for somebody who logs daily and somebody who logs
 *      twice a week.
 *   2. **A baseline has to exist first.** Under `MIN_HISTORY_DAYS` there is
 *      nothing to be below, and "they logged 2 of their first 5 days" is not
 *      evidence of anything. That case gets its own state and a confidence of
 *      `none`, and callers are expected to do less, not more.
 *   3. **It is measured against themselves.** Four days a week is excellent for
 *      one person and a collapse for another. There is no absolute threshold
 *      anywhere in this file, which is also why it cannot be tuned into a
 *      standard nobody was consulted about.
 */

/**
 * How much the app is entitled to act on what it thinks it knows.
 *
 * Not a score — a permission level. `none` means the honest move is to behave
 * exactly as it would for a stranger, and every caller is expected to have a
 * branch for it.
 */
export type Confidence = 'none' | 'low' | 'medium' | 'high';

/** Which way the recent window is going against the person's own baseline. */
export type Trend = 'up' | 'steady' | 'down';

/**
 * The situation, in the only vocabulary anything downstream hears.
 *
 * Deliberately short, and deliberately missing the obvious entries. There is no
 * `lazy`, because that is a judgement rather than an observation. There is no
 * `stalled` — plateaued progress despite steady work — because the app does not
 * yet have a progression signal honest enough to detect it, and a state nothing
 * can compute is a state that quietly means "sometimes".
 */
export type Situation =
  /** not enough history to have a baseline — the cold start */
  | 'settling_in'
  /** logging as usual, against their own normal */
  | 'steady'
  /** materially below their own baseline, and not because of one missed day */
  | 'slipping'
  /** back after a real gap — the most fragile moment there is */
  | 'returning'
  /** training load is running well ahead of what they are used to */
  | 'overreaching';

export interface UserState {
  situation: Situation;
  confidence: Confidence;
  /** share of the recent window with something logged, 0..1 */
  recent: number;
  /** the same over the baseline window — their own normal */
  baseline: number;
  trend: Trend | null;
  /** consecutive days with nothing logged, ending yesterday; 0 if today is logged */
  daysQuiet: number;
  /** why it came out this way — for the debug screen, never for users */
  because: string;
}

/** The window that counts as "lately". A week, so a weekly rhythm fits in it. */
export const RECENT_DAYS = 7;

/**
 * The window that counts as "their normal".
 *
 * Four weeks, matching the chronic window the training load already uses
 * (`readiness-engine.ts`) — two answers to "what is this person used to" on two
 * different periods would disagree in public.
 */
export const BASELINE_DAYS = 28;

/**
 * Below this much history, there is no baseline and nothing is claimed.
 *
 * Two weeks is the first point at which a seven-day window has anything to be
 * compared against. It is also roughly where a weekly pattern becomes visible
 * at all: one week of data cannot distinguish "trains at weekends" from
 * "stopped on Monday".
 */
export const MIN_HISTORY_DAYS = 14;

/**
 * How far below their own baseline counts as a real drop — as a **fraction of
 * that baseline**, never as a fixed number of days.
 *
 * ── this started out absolute, and the tool caught it ──
 *
 * The first version compared `recent < baseline - 0.25`. That reads fine and it
 * quietly re-introduced the one thing this file says it does not have: an
 * absolute standard. Somebody who trains twice a week has a baseline near 0.29,
 * so `baseline - 0.25` sits at 0.04 — they could stop **entirely** for a week
 * and still be called steady, because a quarter of a day-per-day scale is most
 * of their whole rhythm. The rule was strict on daily loggers and blind to
 * everybody else, which is the opposite of measuring people against themselves.
 *
 * As a fraction it is one rule for every rhythm. 0.4 is set by the case it has
 * to survive: a perfect week with one day missed is 6/7 of baseline — a fall of
 * 0.143 — and a second missed day is 5/7, or 0.286. Both must stay quiet, so
 * the line goes above them, and it lands at a sentence somebody can check:
 * *less than 60% of what you normally do.*
 */
export const DROP_FRACTION = 0.4;

/** And the same fraction upward, so `trend` is symmetric rather than pessimistic. */
export const RISE_FRACTION = 0.4;

/**
 * The rate below which a quiet week means nothing at all.
 *
 * One log per recent window. Below that, the person's own normal is *less than
 * one event per week*, and a week containing none of them is not a signal —
 * there was never anything to expect in it. Detecting a drop in a rate under
 * one-per-window is not a strictness setting, it is arithmetic that cannot be
 * done, and a threshold picked any lower would be the app inventing a decline
 * for somebody logging exactly as often as they always have.
 */
export const MIN_BASELINE = 1 / RECENT_DAYS;

/**
 * A gap this long is an absence rather than a rest day.
 *
 * Three days is where the app's own comeback curve already starts
 * (`comebackMagnitude`) — the same number, because "how long is away" must not
 * have two answers.
 */
export const AWAY_DAYS = 3;

/**
 * How recently the return has to have happened to still be *the* thing about
 * today.
 *
 * Two days: the day they came back and the one after it. Past that they are
 * simply here again, and a companion still remarking on the fortnight they
 * missed is a companion dwelling on it.
 */
export const RETURN_FRESH_DAYS = 2;

/**
 * Load ratio above which training is running ahead of what the body is used to.
 *
 * 1.5 is the top of the band `acwrZone` already calls high — read from the
 * app's own answer rather than a second opinion typed here.
 */
export const OVERREACH_ACWR = 1.5;

export interface UserStateInput {
  /**
   * Dates with something logged, `YYYY-MM-DD`, newest first — exactly what
   * `useDailyStreak` already holds. Order is not relied on; duplicates are
   * harmless.
   */
  loggedDates: string[];
  /** today, `YYYY-MM-DD` */
  today: string;
  /**
   * Acute-to-chronic training load, or `null` when it could not be computed.
   *
   * `null` is a real answer and is treated as one: `?? 0` here would report
   * everybody with thin biometrics as detrained, which is the exact mistake the
   * training card was carrying.
   */
  acwr?: number | null;
}

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` → days before `today`. Negative for the future. */
function daysBefore(date: string, today: string): number {
  const a = Date.parse(`${date}T00:00:00Z`);
  const b = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.NaN;
  return Math.round((b - a) / DAY_MS);
}

/**
 * Confidence from how much history there is.
 *
 * A ladder rather than a formula, because the thing being graded is not
 * continuous: it is "can a seven-day window be compared to anything", and the
 * answer changes at recognisable places — no baseline, one baseline window,
 * a full one.
 */
function confidenceFrom(historyDays: number): Confidence {
  if (historyDays < MIN_HISTORY_DAYS) return 'none';
  if (historyDays < BASELINE_DAYS) return 'low';
  if (historyDays < BASELINE_DAYS * 2) return 'medium';
  return 'high';
}

/**
 * Read the situation.
 *
 * Pure: no clock, no storage, no query. Everything it needs is in the argument,
 * which is what lets `tools/user-state.mjs` run a year of days through it.
 */
export function userStateFrom(input: UserStateInput): UserState {
  const { loggedDates, today, acwr = null } = input;

  /* Distinct, in-range, not in the future. A future-dated row is not a thing
     the app writes, but a device with a wrong clock can produce one, and
     counting it would inflate the recent window with a day that has not
     happened. */
  const offsets = new Set<number>();
  for (const d of loggedDates) {
    const n = daysBefore(d, today);
    if (Number.isNaN(n) || n < 0) continue;
    offsets.add(n);
  }

  const within = (days: number) => {
    let n = 0;
    for (const o of offsets) if (o < days) n++;
    return n;
  };

  /* How far back the record goes. `oldest + 1` because a single row today is
     one day of history, not zero. */
  const oldest = offsets.size ? Math.max(...offsets) : -1;
  const historyDays = oldest < 0 ? 0 : oldest + 1;
  const confidence = confidenceFrom(historyDays);

  const recent = within(RECENT_DAYS) / RECENT_DAYS;
  /* Divided by how much baseline actually exists, not by 28. Somebody twenty
     days in who logged all twenty has a baseline of 1.0, not 0.71 — dividing by
     a window they have not lived through yet would manufacture a decline out of
     being new. */
  const baselineSpan = Math.min(BASELINE_DAYS, Math.max(historyDays, RECENT_DAYS));
  const baseline = within(BASELINE_DAYS) / baselineSpan;

  /* Days with nothing logged, counting back from yesterday. Today is excluded
     on purpose: a day still in progress is not a day they missed, and counting
     it would make every morning look like the start of an absence. */
  let daysQuiet = 0;
  if (!offsets.has(0)) {
    while (!offsets.has(daysQuiet + 1) && daysQuiet < BASELINE_DAYS) daysQuiet++;
  }

  /* The gap they came back from: the run of empty days immediately before the
     most recent logged day. Only interesting while that return is fresh.

     ── the guard that turned out not to be needed, and why it is not here ──

     This carried an extra line resetting the gap when the run reached the end
     of the record — the worry being that somebody's *first ever* log has
     nothing before it, and reading that emptiness as a fortnight away would
     welcome back a brand-new user.

     `tools/user-state.mjs` proved the line dead: the loop stops at `oldest`,
     and `oldest` is by definition a logged day, so the only way to walk past it
     is for the newest and oldest log to be the same single day — in which case
     the loop never runs and the gap is already zero. Two real things cover the
     worry instead: a person with one log has one day of history, so
     `MIN_HISTORY_DAYS` returns `settling_in` before this is read at all; and
     somebody whose record genuinely is "logged once three weeks ago, logged
     again today" **was** away for three weeks, which is the right answer.

     Kept as a note rather than as code, because a guard that cannot fire is not
     protection — it is a claim the next reader has to disprove again. */
  const lastLogged = offsets.size ? Math.min(...offsets) : null;
  let gapBefore = 0;
  if (lastLogged != null) {
    let k = lastLogged + 1;
    while (!offsets.has(k) && k <= oldest) {
      gapBefore++;
      k++;
    }
  }

  const trend: Trend | null =
    confidence === 'none'
      ? null
      : recent > baseline * (1 + RISE_FRACTION)
        ? 'up'
        : recent < baseline * (1 - DROP_FRACTION)
          ? 'down'
          : 'steady';

  const base = { recent, baseline, trend, daysQuiet };

  /* ── 1. no baseline, no claims ──
     First, and unconditionally. Everything below compares against a normal, and
     for this person there is not one yet. */
  if (confidence === 'none') {
    return {
      ...base,
      situation: 'settling_in',
      confidence: 'none',
      because: `mới có ${historyDays} ngày dữ liệu, chưa đủ ${MIN_HISTORY_DAYS} để có "bình thường của chính họ"`,
    };
  }

  /* ── 2. back after a real absence ──
     Above `slipping` deliberately. Somebody who was away a fortnight and logged
     yesterday *is* below their baseline — that is arithmetic, not news — and
     the situation that matters about them is that they came back. Reading them
     as slipping would aim the gentler handling at the wrong moment entirely. */
  if (
    lastLogged != null &&
    lastLogged <= RETURN_FRESH_DAYS &&
    gapBefore >= AWAY_DAYS
  ) {
    return {
      ...base,
      situation: 'returning',
      confidence,
      because: `vắng ${gapBefore} ngày rồi ghi lại cách đây ${lastLogged} ngày`,
    };
  }

  /* ── 3. training ahead of what the body is used to ──
     Ranked above `slipping` because the two can be true at once and this one
     has an action attached: somebody whose load ratio is 1.7 does not need
     encouragement to do more. `null` stays out — see `UserStateInput.acwr`. */
  if (acwr != null && acwr >= OVERREACH_ACWR) {
    return {
      ...base,
      situation: 'overreaching',
      confidence,
      because: `tỉ lệ tải cấp tính/mạn tính ${acwr.toFixed(2)} ≥ ${OVERREACH_ACWR}`,
    };
  }

  /* ── 4. materially below their own normal ──
     `trend === 'down'` already carries `DROP_FRACTION`, so neither one missed
     day nor two can reach here. `MIN_BASELINE` is the other half: somebody
     whose normal is under one log a week has no expectation for a quiet week to
     violate. */
  if (trend === 'down' && baseline >= MIN_BASELINE) {
    return {
      ...base,
      situation: 'slipping',
      confidence,
      because:
        `tuần này ${(recent * 100) | 0}% số ngày, nền của chính họ ${(baseline * 100) | 0}% — ` +
        `dưới ${((1 - DROP_FRACTION) * 100) | 0}% nhịp thường ngày`,
    };
  }

  return {
    ...base,
    situation: 'steady',
    confidence,
    because: `tuần này ${(recent * 100) | 0}% số ngày, nền ${(baseline * 100) | 0}% — không lệch đủ để nói gì`,
  };
}

/**
 * The state for somebody the app knows nothing about.
 *
 * Not an empty object: callers branch on `situation`, and handing them
 * `undefined` would make "not read yet" and "nothing to say" the same value —
 * the mistake this repository keeps finding in its own code.
 */
export const UNKNOWN_STATE: UserState = {
  situation: 'settling_in',
  confidence: 'none',
  recent: 0,
  baseline: 0,
  trend: null,
  daysQuiet: 0,
  because: 'chưa đọc được dữ liệu',
};
