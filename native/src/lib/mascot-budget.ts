/**
 * How often Koa is allowed to appear — and the answer is: less than he could.
 *
 * ── the thing that kills a mascot ──
 *
 * Not being ugly. Being *expected*. Habituation is adaptive desensitisation to a
 * familiar stimulus, and it is what makes banner blindness: after enough
 * repetitions in the same place, the brain files the thing as noise and stops
 * routing it to attention at all. The research on it is blunt about the
 * mechanism, and blunter about animation — a thing that moves on its own,
 * without the user having asked, is read by the brain as an advertisement.
 *
 * That is exactly what a peek is: an animated character appearing unprompted
 * over a card. It survives being wonderful only by being **rare**. Five
 * celebrations in one evening do not make somebody five times as pleased; they
 * teach them, in one evening, that the koala is wallpaper.
 *
 * ── where the numbers come from ──
 *
 * Frequency capping is a solved problem in messaging, and the consensus number
 * is small: three a day is the usual cap, and past three to five people start
 * switching things off. A peek is gentler than a push — it only happens inside
 * an app somebody has open — so this is not the same tax. But the failure mode
 * is identical and the cure is the same one, so the cap is three.
 *
 * ── and the exceptions are the point ──
 *
 * A cap that drops the best moment of the day is a worse policy than no cap.
 * Two things get through it:
 *
 *   - **the first of the day**, which is inside the cap anyway and is the one
 *     that says the day has started;
 *   - **the one that finishes all five**, once, because that is the only event
 *     here that is genuinely rare and genuinely earned. Everything else is one
 *     of five things that happen most days.
 *
 * The cooldown has no exception. Two characters climbing over two cards inside
 * the same breath is not two celebrations, it is a glitch — and somebody
 * catching up on a day's logging in one sitting would otherwise trigger four.
 */

export interface PeekBudget {
  /** the local date these counts belong to */
  day: string;
  /** performances already given today */
  count: number;
  /** when the last one started, ms since epoch; 0 = none */
  lastAt: number;
  /** the all-five moment has already been celebrated today */
  setCelebrated: boolean;
}

export const freshBudget = (day: string): PeekBudget => ({
  day,
  count: 0,
  lastAt: 0,
  setCelebrated: false,
});

/**
 * Three, from the messaging literature's own cap.
 *
 * There are five quests, so this is deliberately less than "one per thing you
 * did": the app is choosing not to react to everything, which is what makes the
 * reactions mean anything.
 */
export const PEEK_DAILY_CAP = 3;

/**
 * No second performance inside this window, ever.
 *
 * Long enough that a burst of catching-up produces one show rather than four;
 * short enough that two genuinely separate moments an hour apart both get one.
 */
export const PEEK_COOLDOWN_MS = 45_000;

export interface PeekAsk {
  now: number;
  today: string;
  /** this completion is the fifth of five */
  finishesSet: boolean;
}

/**
 * May Koa come up, and what the budget looks like afterwards.
 *
 * Returns the next budget whether or not the answer is yes, so the caller stores
 * one thing either way — a rationing rule that needs the caller to remember to
 * write back only on success is a rule that will eventually not be written back.
 */
export function allowPeek(b: PeekBudget, ask: PeekAsk): { allow: boolean; next: PeekBudget } {
  // A new day is a clean sheet, including the all-five exception.
  const budget = b.day === ask.today ? b : freshBudget(ask.today);

  const spend = (): { allow: boolean; next: PeekBudget } => ({
    allow: true,
    next: {
      ...budget,
      count: budget.count + 1,
      lastAt: ask.now,
      setCelebrated: budget.setCelebrated || ask.finishesSet,
    },
  });

  if (budget.lastAt > 0 && ask.now - budget.lastAt < PEEK_COOLDOWN_MS) {
    return { allow: false, next: budget };
  }
  if (budget.count < PEEK_DAILY_CAP) return spend();
  if (ask.finishesSet && !budget.setCelebrated) return spend();
  return { allow: false, next: budget };
}

/**
 * How many performances this budget still allows on a given day.
 *
 * The one number both rules below are written in terms of. A budget belonging
 * to some other day is a clean sheet — that is `allowPeek`'s first line, and
 * saying it once here is what keeps the merge from having to re-derive it.
 */
export function peeksLeft(b: PeekBudget, today: string): number {
  if (b.day !== today) return PEEK_DAILY_CAP;
  return Math.max(0, PEEK_DAILY_CAP - b.count);
}

/**
 * The budget to carry forward when the stored one and the in-memory one
 * disagree.
 *
 * ── the rule the old comment described, now actually implemented ──
 *
 * `loadPersonalModel` chose between them with
 *
 *     live.day === stored.day && live.count > stored.count ? live : stored
 *
 * and called it *"whichever spent more of today"*. It is that, but only on the
 * branch where the two agree about which day it is. When they do not, storage
 * won unconditionally — and storage can be **older**. Measured against an
 * independent count of what is left:
 *
 *     bộ nhớ { hôm nay, 3 }  ổ đĩa { hôm qua, 0 }  → merge lấy ổ đĩa → còn 3 lượt
 *     bộ nhớ { hôm nay, 2 }  ổ đĩa { day:'', 0 }   → merge lấy ổ đĩa → còn 3 lượt
 *
 * Three performances already given come back unspent. The second pair is the
 * reachable one: `fresh()` starts at `freshBudget('')`, so a blank blob on disk
 * is what a sign-out used to leave behind.
 *
 * So the comparison is on **what is left**, which is the quantity the rule was
 * always about, and the stricter side wins. Ties keep storage, because on a tie
 * the two describe the same amount of spending and storage is the one that
 * survives a restart.
 *
 * Whole objects, never field-by-field: taking the count from one and the
 * timestamp from the other would build a state neither device was ever in — a
 * cooldown that has expired against a count that has not.
 */
export function mergeBudget(live: PeekBudget, stored: PeekBudget, today: string): PeekBudget {
  return peeksLeft(live, today) < peeksLeft(stored, today) ? live : stored;
}

/**
 * A stored budget, made safe to do arithmetic on.
 *
 * ── what a corrupt blob bought ──
 *
 * `loadPersonalModel` takes `parsed.budget ?? base.budget` and `allowPeek` then
 * compares it against the cap. `count < PEEK_DAILY_CAP` is true for ever when
 * `count` is negative, so one truncated write is an unlimited day. Measured, in
 * fifty consecutive asks:
 *
 *     count: -999999  →  50 màn diễn        (trần là 3)
 *     count: null     →   3                 (ép về 0, đúng)
 *     count: "5"      →   0                 (chặt hơn, chấp nhận được)
 *     lastAt: 1e300   →   0                 (tắt hẳn tới khi sang ngày)
 *
 * Every field is coerced to the type the arithmetic assumes, and anything that
 * is not a real number becomes the **conservative** value rather than the
 * generous one: an unreadable count is a spent count, not a free one. The day
 * is the one exception — an unusable day is left as the empty string, which
 * `allowPeek` reads as "some other day" and answers with a clean sheet, exactly
 * as it does for yesterday.
 */
export function normaliseBudget(raw: unknown, fallbackDay: string): PeekBudget {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return freshBudget(fallbackDay);
  const b = raw as Partial<Record<keyof PeekBudget, unknown>>;
  const count = Number(b.count);
  const lastAt = Number(b.lastAt);
  return {
    day: typeof b.day === 'string' ? b.day : '',
    /* Not finite, or negative — both mean "this is not a count". The cap is the
       safe answer: it costs at most one day of quiet, where the other direction
       costs an unlimited one. */
    count: Number.isFinite(count) && count >= 0 ? Math.floor(count) : PEEK_DAILY_CAP,
    lastAt: Number.isFinite(lastAt) && lastAt >= 0 ? lastAt : 0,
    setCelebrated: b.setCelebrated === true,
  };
}

/**
 * Whether the "everything is done" line is worth saying right now.
 *
 * ── why this needed a rule at all ──
 *
 * Praise had no memory, so it was said on every render for the rest of the day:
 * finish the five by two in the afternoon and Koa congratulates you every single
 * time you open the app until midnight. The tenth time is not encouragement, it
 * is the sound a machine makes.
 *
 * Once a day — but *sticky within the session it appears in*. Suppressing it the
 * instant it is recorded would make the sentence flash and vanish while somebody
 * is reading it, which is worse than repeating it. So: it holds for as long as
 * the app stays open, and the next launch that day is quiet.
 *
 * @param praisedOn the day it was last said, from storage
 * @param thisSession it has already been said since the app opened
 */
export function allowPraise(
  praisedOn: string | null,
  today: string,
  thisSession: boolean,
): boolean {
  return thisSession || praisedOn !== today;
}
