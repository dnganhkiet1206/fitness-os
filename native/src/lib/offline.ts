import { onlineManager } from '@tanstack/react-query';

/**
 * Whether an optimistic update would be a lie right now.
 *
 * ── the bug this exists for ──
 *
 * Optimistic updates and offline writes do not mix, and putting the first in
 * without thinking about the second made the app worse than it was.
 *
 * React Query's default `networkMode: 'online'` *pauses* a mutation it cannot
 * send. Paused means `mutationFn` never runs — so `onError` never fires, so the
 * rollback never happens, so the optimistic patch stays. And the query cache is
 * persisted to AsyncStorage, so it stays across a restart too.
 *
 * Measured on the water screen, with the server holding exactly one 250 ml
 * entry: the total read 8.5 oz, the connection was cut, one tap on +8 took it
 * to 16.5 oz, and nothing was written. Reconnecting did not send it either —
 * still nothing after thirty seconds with `navigator.onLine` back to `true`.
 * The person is looking at water they did not drink and the app cannot tell
 * them otherwise.
 *
 * Before the optimistic updates, that tap simply did nothing. Unresponsive is
 * not good; claiming success is worse, because only one of the two leads
 * somebody to trust a number that is wrong.
 *
 * ── what this does, and what it deliberately does not ──
 *
 * It only suppresses the *patch*. The mutation is still fired, so if the
 * platform does resume paused mutations — the reconnect test above ran on web,
 * where NetInfo behaves differently from iOS, and this was not verified on a
 * device — the write still lands later and the refetch shows it. An arriving
 * entry is a pleasant surprise; a vanishing one is a bug report.
 *
 * ── what that reconnect test actually measured (#62, 2026-09-25) ──
 *
 * Not the app. Chromium's offline emulation fires `navigator.connection`
 * 'change' when it goes OFFLINE but only `window` 'online' when it comes back,
 * and NetInfo on web listens to 'change' alone whenever `navigator.connection`
 * exists. So the app saw the connection drop and never saw it return: the
 * offline banner stayed, `onlineManager` stayed offline, and nothing could
 * resume. With the 'change' a real browser fires, the paused water write is
 * sent exactly once — also after the app is closed offline and reopened
 * online (`live.mjs`, the #62 scenario). The premise "paused writes do not
 * resume" behind this function is therefore unproven either way on iOS, and
 * disproved on web; whether the patch should come back for QUEUED writes is
 * a separate decision (#66), not made here.
 *
 * No message is shown from here. `OfflineBanner` is already on screen whenever
 * this returns true, and it says the one thing there is to say. A toast on top
 * of a banner is the same sentence twice.
 *
 * ── the real fix, which this is not ──
 *
 * Writes made offline should survive and send themselves later. That needs the
 * mutation cache persisted and every mutation given a `mutationKey` with
 * `setMutationDefaults`, so React Query can rehydrate a function it did not
 * keep — about thirty call sites, and a wrong one silently stops resuming. Too
 * large to bolt onto a bug fix. This stops the app lying in the meantime.
 */
export const offlineNow = () => !onlineManager.isOnline();

/**
 * Thrown by `useOnlineMutation` for a write that must reach the server NOW and
 * could not — no connection when tapped, or the request never landed.
 *
 * A class rather than a `TypeError: Network request failed` passed through,
 * because the two need different sentences. `errOffline` promises *"it will go
 * through when you are back online"* — true for the queued writes in
 * `offline-write.ts`, and a lie for everything this is thrown for: nothing is
 * kept to send later. `classifyError` reads the `name`, so `error-copy.ts`
 * still imports nothing.
 */
export class OnlineOnlyError extends Error {
  constructor() {
    super('online-only');
    this.name = 'OnlineOnlyError';
  }
}
