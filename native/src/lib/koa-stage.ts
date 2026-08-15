import { useSyncExternalStore } from 'react';

import { holdEmotion } from '@/lib/mascot-emotion';
import { decide, outranks, type KoaContext, type KoaDecision } from '@/lib/koa-decide';
import type { KoaEvent } from '@/lib/koa-event';
import { koaSeenAdd, koaSeenHas } from '@/lib/personal-model';

/**
 * The one door between what happened and what Koa does about it.
 *
 * ── why this is a store and not a hook ──
 *
 * The places that know something happened are not the places that draw. The
 * medal engine is a mutation callback, the freeze guard is an effect at the
 * root, the comeback is noticed inside a query function — none of them can
 * render a character, and threading a callback from each of them down to the
 * figure would be an event bus built out of props.
 *
 * So: a module-level slot with subscribers, the same shape `quest-peek` and
 * `use-mascot-emotion` already use. Ten lines of infrastructure, which is the
 * amount this needs.
 *
 * ── the two rules that keep it from becoming noise ──
 *
 * **Once each.** Every event carries an `id`, and an id seen before is dropped
 * on the floor. Without it, a medal granted once is re-announced on every
 * render that re-runs the grant path, and the character celebrates the same
 * hundred-day streak four times while somebody scrolls.
 *
 * **The bigger one wins, and the smaller one does not queue.** Two events
 * arriving together is the normal case, not the edge: finishing a workout can
 * grant a medal, cross a level and complete the day inside the same second.
 * Queueing them would produce four reactions in a row — the exact spam this
 * whole system is built to avoid. So a new event replaces a live reaction only
 * if it is *more* intense, and is otherwise discarded. Koa reacts to the
 * biggest thing that happened, once.
 */

export interface KoaReaction {
  /** monotonic, so a consumer can tell a repeat from a new one */
  n: number;
  event: KoaEvent;
  decision: KoaDecision;
  /** when it started, ms */
  at: number;
}

function remember(id: string) {
  seen.add(id);
  if (seen.size > 200) seen.delete(seen.values().next().value as string);
  koaSeenAdd(id);
}

let current: KoaReaction | null = null;
let clearTimer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const seen = new Set<string>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/**
 * Announce something that happened. Returns the decision, for the debug screen
 * and for callers that want to know whether it landed.
 *
 * @param id stable identity — `award:streak_30`, `pr:<session>`, `comeback:<date>`
 */
export function emitKoa(
  event: KoaEvent & { id: string },
  ctx: KoaContext,
  now = Date.now(),
): KoaDecision {
  /* Two layers, because they answer different questions. The in-memory set is
     the fast one and covers a render storm; the persisted one covers a
     relaunch, which is the case that welcomed the same person back twice in one
     morning. */
  if (seen.has(event.id) || koaSeenHas(event.id)) {
    return {
      ...decide(event, ctx),
      shouldReact: false,
      because: 'sự kiện này đã xử lý rồi',
    };
  }

  const decision = decide(event, ctx);

  /*
    ── nothing is marked handled until it has been ──

    The check and the record used to be one call, made before this line, and
    that quietly destroyed the moments it was meant to protect: a record earned
    while the character was off screen came back `shouldReact: false`, was filed
    as handled, and never played again — the id is persisted, so not on
    returning to the dashboard, not ever.

    A collision *is* recorded, and deliberately: the smaller of two things that
    happened in the same second has been answered by the bigger one, and
    replaying it later would be a celebration with nothing behind it.
  */
  if (!decision.shouldReact) return decision;

  const live = current ? { intensity: current.decision.intensity, at: current.at } : null;
  if (!outranks(live, decision.intensity, now)) {
    remember(event.id);
    return { ...decision, shouldReact: false, because: 'một phản ứng lớn hơn đang diễn' };
  }

  remember(event.id);
  current = { n: ++seq, event, decision, at: now };
  /* The renderer is the emotion channel that already exists — the held emotion
     is overridden for `hold` ms and then returns by itself. Koa's brain does
     not touch a single transform. */
  holdEmotion(decision.emotion, decision.hold);

  /*
    ── and the stage is cleared afterwards, which it was not ──

    The *face* returned by itself: `holdEmotion` owns a timer and the emotion
    channel expires on its own. The reaction sitting here did not, and one
    missing timer produced three separate faults, none of which look related
    from the outside:

      · the bubble showed the celebration line **for ever**, because the widget
        prefers a live reaction's words over the day's summary and the reaction
        was permanently live;
      · `gap` therefore stayed `null` for ever, so `noteAsked` never fired
        again — the bandit stopped learning the moment Koa first celebrated
        anything;
      · and the widget, seeing a sentence with no gap, recorded it as the day's
        praise, so the real "you finished everything" line was suppressed.

    A store whose entries never expire is a store that is always mid-event.
  */
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    clearTimer = null;
    current = null;
    emit();
  }, decision.hold);

  emit();
  return decision;
}

/** Testing, and the debug screen's reset. */
export function resetKoaStage() {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  current = null;
  seen.clear();
  emit();
}

const snapshot = () => current;
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The reaction currently on stage, or null. */
export function useKoaReaction(): KoaReaction | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
