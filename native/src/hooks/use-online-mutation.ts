import { useMutation, type DefaultError, type UseMutationOptions } from '@tanstack/react-query';

import { classifyError } from '@/lib/error-copy';
import { OnlineOnlyError, offlineNow } from '@/lib/offline';

/**
 * A write that is only worth making NOW: refuse out loud without a connection
 * instead of pausing in silence (#45).
 *
 * ── the bug this exists for ──
 *
 * React Query's default `networkMode: 'online'` *pauses* a mutation it cannot
 * send, and a paused mutation never calls `mutationFn`, so never `onError`.
 * Every Community write was one. Offline:
 *
 *   · Like and Save flipped at once (the optimistic patch) and stayed flipped:
 *     no rollback, no toast, and the persisted cache kept the lie across a
 *     restart;
 *   · Post, Follow, Join, Unblock sat on `isPending` for ever — a spinner on
 *     the Post button, and `disabled={follow.isPending}` greyed out EVERY
 *     Follow button on the search screen after one tap;
 *   · the privacy screen shows `setVis.variables` while pending, so the new
 *     default visibility read as saved when nothing had been sent.
 *
 * These are not queued on purpose — `offline-write.ts` is for logging one's
 * own training, which is still true hours later. A like, a follow, a comment
 * or a post is a social act in a moment, and replaying it hours later is the
 * wrong act. So the honest answer is the shop's: say so, and do nothing.
 *
 * ── what this does ──
 *
 *   · `networkMode: 'always'`, so the function runs and the failure path is
 *     the ordinary one — `onError`, rollback, `toast.fail` — at every call
 *     site that already handles a server refusal;
 *   · offline at the tap: skip `onMutate` (no optimistic patch to undo, no
 *     "done" haptic) and throw `OnlineOnlyError` before any request;
 *   · a request that never landed (NetInfo said online — a captive portal,
 *     a tunnel) becomes the same error, because `errOffline` promises to send
 *     it later and nothing here will.
 *
 * `tools/write-heard.mjs` checks that every mutation built on this has an
 * error path, since an error nobody hears is the pause again with extra steps.
 */
export function useOnlineMutation<TData = unknown, TError = DefaultError, TVariables = void, TContext = unknown>(
  options: UseMutationOptions<TData, TError, TVariables, TContext>,
) {
  const { mutationFn, onMutate } = options;
  return useMutation<TData, TError, TVariables, TContext>({
    ...options,
    networkMode: 'always',
    /* No context when skipped. `onError` and `onSettled` already receive
       `TContext | undefined` — React Query gives them `undefined` whenever
       `onMutate` itself threw — so a handler that reads the context has had
       to cope with this since before this wrapper. */
    onMutate: onMutate && ((vars, ctx) => (offlineNow() ? (undefined as TContext) : onMutate(vars, ctx))),
    mutationFn: async (vars, ctx) => {
      if (offlineNow()) throw new OnlineOnlyError();
      try {
        return await mutationFn!(vars, ctx);
      } catch (e) {
        if (classifyError(e) === 'offline') throw new OnlineOnlyError();
        throw e;
      }
    },
  });
}
