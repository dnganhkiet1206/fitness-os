import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { localDateStr, localDayRangeISO } from '@/lib/local-date';
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

export function useNudges() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['nudges', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('habit_nudges')
        .select('*')
        .eq('user_id', user!.id)
        .eq('enabled', true);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useWearables() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['wearables', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('wearable_sources')
        .select('*')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

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
  const dateStr = today();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['daily_log', user?.id, dateStr] });
    queryClient.invalidateQueries({ queryKey: ['today_sleep', user?.id, dateStr] });
    queryClient.invalidateQueries({ queryKey: ['recent_workouts', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['workout_sessions', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['today_bio', user?.id, dateStr] });
    // ReadinessTrendCard on Today reads useReadinessHistory (readiness_history);
    // readiness_trend is a legacy key with no live consumer — invalidate the
    // one the UI actually uses so the trend refreshes after a fresh log.
    queryClient.invalidateQueries({ queryKey: ['readiness_history', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['nudges', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['today_meals', user?.id, dateStr] });
    // The Nutrition tab's diary. Adding a query and not adding it here is
    // invisible until somebody logs a meal and the list they are looking at
    // does not change — which is exactly how this was found.
    queryClient.invalidateQueries({ queryKey: ['today_meals_detail', user?.id, dateStr] });
    queryClient.invalidateQueries({ queryKey: ['profile', user?.id] });
    // Lifetime workout/meal counters — drives mascot unlocks, so a fresh
    // log can pop the unlock celebration right away
    queryClient.invalidateQueries({ queryKey: ['mascot_unlock_stats', user?.id] });
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
