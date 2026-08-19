import { useSyncExternalStore } from 'react';

import type { CelebrationAward } from '@/components/ascnd/award-celebration';
import { onUserScopedReset } from '@/lib/user-scoped-reset';

/**
 * Single shared queue for full-screen celebrations (award medals and
 * mascot unlocks). Both sources push here so the host shows exactly one
 * at a time — a workout that earns a medal *and* unlocks a mascot plays
 * them in sequence instead of stacking two modals.
 *
 * ── it belonged to the person, and nothing was clearing it ──
 *
 * A medal is the most personal thing this app produces. The queue holds it in
 * module scope until the host has room to play it, and `clearUserScopedStorage`
 * never touched it because it has no AsyncStorage key — `tools/auth-lifecycle.mjs`
 * walks `USER_KEYS`, so a store that persists nothing was outside every rule
 * that exists. Run against the real modules and the real reset seam:
 *
 *     ALPHA earns a medal and unlocks a mascot
 *     SIGNED_OUT → runUserScopedResets()
 *     BRAVO signs in → head: {"kind":"award","award":{"title":"ALPHA 100 buổi tập"}}
 *
 * And the second half is worse than the first. `enqueueMascot` refuses a
 * duplicate by id, so BRAVO genuinely unlocking `koa_gold` matched ALPHA's
 * leftover entry and produced **no row at all** — the queue BRAVO was shown
 * held ALPHA's two celebrations and neither of BRAVO's. One person is shown a
 * stranger's achievement; the other loses their own.
 */

export type CelebrationItem =
  | { kind: 'award'; id: number; award: CelebrationAward }
  | { kind: 'mascot'; id: number; mascotId: string };

let queue: CelebrationItem[] = [];
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function enqueueAward(award: CelebrationAward) {
  queue = [...queue, { kind: 'award', id: ++seq, award }];
  emit();
}

export function enqueueMascot(mascotId: string) {
  // Guard against the same unlock being queued twice
  if (queue.some((q) => q.kind === 'mascot' && q.mascotId === mascotId)) return;
  queue = [...queue, { kind: 'mascot', id: ++seq, mascotId }];
  emit();
}

export function dequeueCelebration() {
  queue = queue.slice(1);
  emit();
}

/**
 * Nothing queued here outlives the account that earned it.
 *
 * `seq` is deliberately left running: it is only a React key, and the queue is
 * empty by the time this returns, so there is nothing for a restarted counter
 * to collide with — and a counter that restarts is one more way to produce two
 * items with the same key.
 */
onUserScopedReset(() => {
  queue = [];
  emit();
});

/** The celebration currently at the front of the queue (or undefined) */
export function useCelebrationHead(): CelebrationItem | undefined {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => queue[0],
    () => queue[0],
  );
}
