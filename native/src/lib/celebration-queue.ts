import { useSyncExternalStore } from 'react';

import type { CelebrationAward } from '@/components/ascnd/award-celebration';

/**
 * Single shared queue for full-screen celebrations (award medals and
 * mascot unlocks). Both sources push here so the host shows exactly one
 * at a time — a workout that earns a medal *and* unlocks a mascot plays
 * them in sequence instead of stacking two modals.
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
