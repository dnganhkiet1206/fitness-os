import { useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '@/hooks/use-auth';
import { localDateStr } from '@/lib/local-date';
import type { StreakState } from '@/hooks/use-mascot-room';
import { PROGRESS_DAYS, UNKNOWN_STATE, userStateFrom, type SessionLike, type UserState } from '@/lib/user-state';

/**
 * What kind of stretch this person is in, read from what the app already has.
 *
 * ── this deliberately subscribes to nothing ──
 *
 * Same shape and same reason as `useKoaContext`: it reads the React Query
 * **cache** and mounts no observer. The regression that shape exists for is on
 * record — an earlier companion hook called `useDailyStreak()` directly, and
 * opening a screen that had no use for the streak started six queries so that a
 * koala could have an opinion.
 *
 * The cost of reading the cache is that a screen which never fetched the streak
 * gets `UNKNOWN_STATE`. That is the correct trade and the correct value:
 * `settling_in` with confidence `none` is exactly "the app is not entitled to
 * an opinion here", which is true both of a brand-new account and of a screen
 * that has not read anything. Every caller has to have that branch anyway.
 *
 * ── and the acwr is read the same way ──
 *
 * `daily_logs.acwr` is `null` for anybody without enough load history, and
 * `null` is passed through as `null` rather than being folded to zero. The
 * training card was carrying exactly that `?? 0` and it reported every user
 * with thin data as detrained.
 *
 * ── why the memo is not decoration ──
 *
 * `userStateFrom` walks up to `STREAK_WINDOW` dates and builds a Set from them.
 * That is nothing once; the problem is *how often*. This is reached through
 * `useKoaContext`, which the home-screen figure, the medal engine and the quest
 * watcher all call — and the figure re-renders on wallet changes, inventory
 * changes, quest changes and every held-emotion transition. Four hundred date
 * parses on each of those, on the phone, for an answer that changes when a day
 * is logged.
 *
 * The dependency is the cached object itself. React Query hands back the same
 * reference until something actually refetches, so identity is exactly the
 * question "has the data changed" — which makes this a real cache and not a
 * hope.
 */
export function useUserState(): UserState {
  const qc = useQueryClient();
  const { user } = useAuth();
  const today = localDateStr();

  const streak = qc.getQueryData<StreakState>(['mascot_streak', user?.id, today]);
  const log = qc.getQueryData<{ acwr?: number | string | null }>(['daily_log', user?.id, today]);
  /*
    The eight-week session window, read from the cache on the same terms as
    everything else here.

    `PROGRESS_DAYS` is `TREND_WEEKS * 7`, which is exactly the window the
    training card already fetches on Today — so on the screen where the
    companion lives this is warm, and on a screen that never asked for it the
    value is `undefined` and no progression claim is made. Picking any other
    number would have meant a second query for the same eight weeks.
  */
  const sessions = qc.getQueryData<SessionLike[]>(['workout_sessions', user?.id, PROGRESS_DAYS]);

  const raw = log?.acwr;
  const acwr = raw == null ? null : Number(raw);

  return useMemo(() => {
    if (!streak) return UNKNOWN_STATE;
    return userStateFrom({
      loggedDates: streak.loggedDates ?? [],
      today,
      acwr: acwr != null && Number.isFinite(acwr) ? acwr : null,
      sessions,
    });
  }, [streak, acwr, sessions, today]);
}
