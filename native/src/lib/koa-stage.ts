import { useSyncExternalStore } from 'react';

import { holdEmotion } from '@/hooks/use-mascot-emotion';
import { decide, outranks, type KoaContext, type KoaDecision } from '@/lib/koa-decide';
import type { KoaEvent } from '@/lib/koa-event';

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

let current: KoaReaction | null = null;
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
  const decision = decide(event, ctx);

  if (seen.has(event.id)) {
    return { ...decision, shouldReact: false, because: 'sự kiện này đã xử lý rồi' };
  }
  seen.add(event.id);
  /* Bounded: this is a session-lived set and the ids are short, but a person
     who leaves the app open for a week should not accumulate for ever. */
  if (seen.size > 200) seen.delete(seen.values().next().value as string);

  if (!decision.shouldReact) return decision;

  /* The collision rule is `outranks`, kept in the pure module so a test can
     play two events arriving together and read which one won. */
  const live = current ? { intensity: current.decision.intensity, at: current.at } : null;
  if (!outranks(live, decision.intensity, now)) {
    return { ...decision, shouldReact: false, because: 'một phản ứng lớn hơn đang diễn' };
  }

  current = { n: ++seq, event, decision, at: now };
  /* The renderer is the emotion channel that already exists — the held emotion
     is overridden for `hold` ms and then returns by itself. Koa's brain does
     not touch a single transform. */
  holdEmotion(decision.emotion, decision.hold);
  emit();
  return decision;
}

/** Testing, and the debug screen's reset. */
export function resetKoaStage() {
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
