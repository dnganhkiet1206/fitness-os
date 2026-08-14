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
