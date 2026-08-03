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
