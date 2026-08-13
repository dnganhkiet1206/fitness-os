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
}

let state: QuestPeek = { n: 0, quest: null, coins: 0 };
const listeners = new Set<() => void>();

export function peekAt(quest: QuestKey, coins: number) {
  state = { n: state.n + 1, quest, coins };
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
 * The firing number for one card, or 0.
 *
 * `CardPeek` wants "has my card been asked to play, and how many times", which
 * is what this returns: the counter when the current peek is for this quest, and
 * 0 otherwise. A card that is not the subject sees 0 for ever and never mounts a
 * single animation.
 */
export function usePeekSignal(quest: QuestKey): number {
  const peek = useQuestPeek();
  return peek.quest === quest ? peek.n : 0;
}
