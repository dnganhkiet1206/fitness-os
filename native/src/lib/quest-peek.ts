import { useSyncExternalStore } from 'react';

import type { QuestKey } from '@/lib/mascot-room';

/**
 * Which card Koa should come up behind, right now.
 *
 * A module-level store rather than context, for the same reason
 * `use-mascot-emotion` uses one: the thing that *fires* a peek is a watcher
 * mounted once at the root, and the things that *render* one are widgets several
 * levels down a scroll view. A store lets the two find each other without
 * threading a prop through every card on the dashboard.
 *
 * The signal is a counter, not a boolean. A boolean cannot express "again": two
 * quests finishing a second apart would set `true` twice and the second would be
 * indistinguishable from the first, so the second card would never move. Every
 * firing increments, and a card compares the number it last played.
 */
export interface QuestPeek {
  /** monotonic — a card plays when this changes and the key is its own */
  n: number;
  quest: QuestKey | null;
  coins: number;
  /** when it was fired, so a stale one is not performed to an empty room */
  at: number;
}

/**
 * How long a fired peek waits for somebody to come back and see it.
 *
 * ── the moment this fixes ──
 *
 * The commonest way to finish the meal quest is to log a meal — from the
 * **Nutrition tab**. The peek plays over a card on Today, which at that instant
 * is a screen nobody is looking at. The performance happened; the audience was
 * on another page. That is not a rare edge, it is the main path.
 *
 * So a peek fired off-screen is held rather than thrown away, and plays when
 * Today is next in front of the person — which reads as the dashboard reacting
 * to what you just did, and is arguably better than the original.
 *
 * Five minutes because a celebration has to still be *about* something. Come
 * back an hour later and the moment has passed; the peek is dropped rather than
 * staged for a meal nobody remembers logging.
 */
export const PEEK_DEFER_MS = 5 * 60_000;

let state: QuestPeek = { n: 0, quest: null, coins: 0, at: 0 };
const listeners = new Set<() => void>();

export function peekAt(quest: QuestKey, coins: number, now = Date.now()) {
  state = { n: state.n + 1, quest, coins, at: now };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
const snapshot = () => state;

export function useQuestPeek(): QuestPeek {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * The firing number for one card, and what it was worth.
 *
 * `CardPeek` wants "has my card been asked to play, and how many times", which
 * is what `signal` is: the counter when the current peek is for this quest, and
 * 0 otherwise. A card that is not the subject sees 0 for ever and never mounts a
 * single animation.
 *
 * `coins` rides along so the reward can be shown at the moment it is earned
 * rather than only in a wallet somewhere else. It drops back to 0 as soon as
 * another quest takes the stage, which is why `CardPeek` latches it — a number
 * that vanished halfway through its own exit would look like a glitch.
 *
 * `visible` is the screen saying whether anybody is actually here. An unfocused
 * host returns 0 and plays nothing; when focus comes back the signal goes from
 * 0 to n, which is a change, so the performance happens then instead — see
 * `PEEK_DEFER_MS`.
 */
export function usePeekSignal(quest: QuestKey, visible: boolean): { signal: number; coins: number } {
  const peek = useQuestPeek();
  const mine = peek.quest === quest && visible && Date.now() - peek.at < PEEK_DEFER_MS;
  return { signal: mine ? peek.n : 0, coins: mine ? peek.coins : 0 };
}
