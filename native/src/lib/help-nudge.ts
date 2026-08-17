import AsyncStorage from '@react-native-async-storage/async-storage';

import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Whether to point at a help button that somebody has not pressed yet.
 *
 * ── the request, and the thing it must not become ──
 *
 * "Thi thoảng icon giải đáp đó sẽ hiện pop up ra và nhắc nhở người dùng bấm
 * vào nếu chưa hiểu." A hint that appears now and then, pointing at the `?`.
 *
 * The naive version of that is one of the worst things software does: a tip
 * that reappears forever because nothing is counting, on a card you see every
 * single morning. It stops being help on about the third showing and is an
 * obstacle by the tenth. So the counting is the feature here, not the hint.
 *
 * Three rules, and all three have to hold:
 *
 *   1. **Opening the help ends it, permanently.** The hint exists to get the
 *      button pressed. Pressed once, it has no remaining purpose — there is
 *      nothing left for it to teach.
 *   2. **At most three times, ever.** Somebody who has ignored it three times
 *      is not going to be persuaded by a fourth; they have decided, and the
 *      app does not get to keep asking.
 *   3. **At most once per app run.** Otherwise a hint that survives a tab
 *      switch reappears every time the card remounts, which within one session
 *      is not "thi thoảng" — it is nagging.
 *
 * Rule 3 is why `shownThisRun` is module scope and deliberately not persisted:
 * "this run" is exactly the lifetime of the module.
 */

const KEY = 'ascnd-help-nudge';

/** Rule 2 — the total budget, across the whole life of the install. */
export const NUDGE_LIMIT = 3;

interface State {
  /** how many times the hint has been shown */
  count: number;
  /** whether the help itself has been opened */
  opened: boolean;
}

const EMPTY: State = { count: 0, opened: false };

/** Rule 3 — which topics have already had their turn this app run. */
const shownThisRun = new Set<string>();

async function readAll(): Promise<Record<string, State>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, State>) : {};
  } catch {
    // A corrupt or unreadable entry means the hint may show again. That is the
    // right way to fail: an extra hint is a smaller cost than a broken card,
    // and rule 2 still caps it as soon as a write succeeds.
    return {};
  }
}

async function writeAll(all: Record<string, State>): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // nothing here is worth interrupting the screen for
  }
}

/**
 * Should `topic`'s hint show right now?
 *
 * Claims the run's single slot as a side effect when it answers yes, so two
 * cards mounting together cannot both decide to show one.
 */
export async function shouldNudge(topic: string): Promise<boolean> {
  if (shownThisRun.has(topic)) return false;
  const state = (await readAll())[topic] ?? EMPTY;
  if (state.opened || state.count >= NUDGE_LIMIT) return false;
  shownThisRun.add(topic);
  return true;
}

/** Count a hint that was actually put on screen. */
export async function noteNudged(topic: string): Promise<void> {
  const all = await readAll();
  const state = all[topic] ?? EMPTY;
  if (state.opened) return;
  all[topic] = { ...state, count: state.count + 1 };
  await writeAll(all);
}

/** The help was opened — rule 1, this topic is finished. */
export async function noteHelpOpened(topic: string): Promise<void> {
  const all = await readAll();
  all[topic] = { count: all[topic]?.count ?? 0, opened: true };
  shownThisRun.add(topic);
  await writeAll(all);
}

/** Test seam: forget which topics have had their turn this run. */
export function resetRun(): void {
  shownThisRun.clear();
}

/* "This run" ends at sign-out as far as a person is concerned. `ascnd-help-nudge`
   is deleted then, but this set is not, so the second account to use the phone
   in one launch was silently denied every hint the first account had already
   been shown. See `lib/user-scoped-reset.ts`. */
onUserScopedReset(resetRun);
