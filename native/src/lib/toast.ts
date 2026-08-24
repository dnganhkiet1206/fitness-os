import { useSyncExternalStore } from 'react';

import { failureKeyFor } from '@/lib/error-copy';

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
  /**
   * An i18n key to show INSTEAD of `message`, set by `toast.fail` when the
   * thrown thing was written by PostgreSQL or GoTrue rather than by this app.
   *
   * The key rather than the sentence, because this store is module-level and
   * the language lives in React context — `NeonToastHost` resolves it. Same
   * split as `readiness-i18n.ts`, and the reason switching language mid-session
   * re-words a toast that is still on screen.
   */
  failureKey?: string;
}

let current: ToastData | null = null;
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function showToast(kind: ToastKind, message: string, failureKey?: string) {
  current = { id: ++seq, kind, message, failureKey };
  emit();
}

/** sonner-style helpers, mirroring the web's toast.success(...) calls */
export const toast = {
  success: (message: string) => showToast('success', message),
  error: (message: string) => showToast('error', message),
  warning: (message: string) => showToast('warning', message),
  info: (message: string) => showToast('info', message),
  /**
   * A thrown error, shown as a sentence rather than as SQL.
   *
   * Every `onError` uses this instead of `toast.fail(e)`, which put
   * *duplicate key value violates unique constraint "daily_logs_user_id_date_key"*
   * in front of somebody who had tapped Save twice. `failureKeyFor` returns
   * `null` for an error the app wrote itself — those are already sentences for
   * a person and are shown unchanged.
   */
  fail: (err: unknown) => {
    const key = failureKeyFor(err);
    const raw = err instanceof Error ? err.message : String(err ?? '');
    showToast('error', key ? '' : raw, key ?? undefined);
  },
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
