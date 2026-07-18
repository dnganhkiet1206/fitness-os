import { useSyncExternalStore } from 'react';

/**
 * Lightweight global toast store (module-level, same pattern as the
 * steps-goal store). One toast at a time; a new one replaces the
 * current. The NeonToastHost in the root layout renders it.
 */

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
}

let current: ToastData | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(kind: ToastKind, message: string) {
  current = { id: ++seq, kind, message };
  emit();
}

/** sonner-style helpers, mirroring the web's toast.success(...) calls */
export const toast = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message),
  warning: (message: string) => showToast('warning', message),
  info: (message: string) => showToast('info', message),
};

/** Dismiss the current toast; pass an id to only dismiss that instance
 *  (so a stale auto-hide timer can't kill a newer toast). */
export function dismissToast(id?: number) {
  if (id != null && current?.id !== id) return;
  current = null;
  emit();
}

export function useCurrentToast(): ToastData | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
    () => current,
  );
}
