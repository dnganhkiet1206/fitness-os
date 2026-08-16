import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr, localDayRangeISO } from '@/lib/local-date';
import { todayKeys } from '@/lib/today-keys';
import { useAuth } from './use-auth';

const today = () => localDateStr();
/**
 * The local day as two absolute instants, for the `timestamptz` columns.
 *
 * Every window below used to be built as `` `${dateStr}T00:00:00` `` — a date
 * string with no zone — and Postgres reads one of those in the *server's* zone,
 * which is UTC. At UTC+7 that makes "today" run from 07:00 this morning to
 * 06:59 tomorrow in local terms: a meal eaten at six, a biometric sample taken
 * at six, and — worst of all — a night whose `waketime` is before seven all
 * fall outside the day they belong to. Waking before 7am is not an edge case.
 *
 * The damage was not only a missing card. `daily_logs` is rebuilt by
 * `daily-log-service`, which already used this helper, so the dashboard's sleep
 * card and the readiness score computed from the same night disagreed. And
 * `useTodayMeals` feeds `use-mascot.tsx`, which is what decides whether the
 * "log a meal" quest paid out — so an early breakfast silently cost coins and
 * XP.
 *
 * `localDayRangeISO` was written when this same bug was found in the nutrition
 * diary and fixed there only. `tools/check.mjs` now fails the build on a bare
 * date string next to a `timestamptz` filter, so it cannot be fixed in one
 * place and left in another again.
 */

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user!.id)
        .single();
      if (error) throw error;
      return data;
    },
  });
}

export function useDailyLog() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['daily_log', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useTodaySleep() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_sleep', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const day = localDayRangeISO(dateStr);
      const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('waketime', day.start)
        .lt('waketime', day.end)
        .order('waketime', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useRecentWorkouts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['recent_workouts', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workout_sessions')
        .select('*')
        .eq('user_id', user!.id)
        .order('date_time', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTodayBiometrics() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_bio', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const day = localDayRangeISO(dateStr);
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', day.start)
        .lt('date_time', day.end)
        .order('date_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/*
  ── `useNudges` and `useWearables` are gone, and this is why ──

  Both read tables — `habit_nudges` and `wearable_sources` — that **no code in
  this app has ever written to**. Neither was a feature waiting to be finished;
  they were two queries fired on every Today open against tables that are empty
  for every account.

  `nudges` was worse than idle: it sat in `todayKeys`, so *every* write — a meal,
  a workout, a night's sleep, a weigh-in — invalidated it and refetched an empty
  table. And `NudgesCard` returned `null` unconditionally, because a filter over
  no rows is always empty, so the toggle for it in the widget settings switched
  a card on that could not appear.

  `wearable_sources` was worse still, because it did not merely show nothing: it
  made the biometrics card print *"chưa kết nối"* in red beside HRV and resting
  heart rate that Apple Health had just supplied. That card now reads the
  `source` column on the reading itself, which is the thing it was pretending to
  look up.

  The tables are left in the schema — dropping one is irreversible and keeping an
  empty table costs nothing — and `tools/dead-schema.mjs` records them as known
  and unused, so a *new* table nobody wired up will fail the suite.
*/

/** Recent nights for the Sleep Insights screen (deep/REM/light breakdown) */
export function useSleepHistory(days = 7) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sleep_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - days);
      const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('waketime', from.toISOString())
        .order('waketime', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useInvalidateToday() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  /* The list is `lib/today-keys.ts`, shared with the mutation callbacks in
     `use-nutrition` that cannot call a hook. It used to be written out twice,
     and the two copies had already drifted twice — the second time it left the
     streak stale after the first log of the day. */
  return () => {
    /*
      ── the day is read when the refresh runs, not when the hook rendered ──

      This closed over a `const dateStr = today()` from the hook body. Every
      query above may do that, because a query *key* has to hold still across
      the renders of a day and React Query re-keys itself on the next render.
      This is not a query: it is the callback a write fires afterwards to bring
      the screen up to date.

      An app left open crosses midnight. The first log after that invalidated
      **yesterday's** keys — so the new day's totals, rings and streak sat on
      screen as they were, showing nothing logged, while the row was already in
      the database. The one moment the refresh exists for is the one it missed.
    */
    for (const key of todayKeys(user?.id, today())) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };
}

// Native-only addition: today's meal entries for the Nutrition tab
export function useTodayMeals() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_meals', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const day = localDayRangeISO(dateStr);
      const { data, error } = await supabase
        .from('meal_entries')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', day.start)
        .lt('date_time', day.end)
        .order('date_time', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
