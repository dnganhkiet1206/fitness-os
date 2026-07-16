import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './use-auth';

const today = () => new Date().toISOString().split('T')[0];

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
      const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('waketime', `${dateStr}T00:00:00`)
        .lt('waketime', `${dateStr}T23:59:59.999`)
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
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', `${dateStr}T00:00:00`)
        .lt('date_time', `${dateStr}T23:59:59.999`)
        .order('date_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useReadinessTrend() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['readiness_trend', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date, readiness_score, readiness_status')
        .eq('user_id', user!.id)
        .gte('date', sevenDaysAgo.toISOString().split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(d => ({
        day: new Date(d.date).toLocaleDateString('vi-VN', { weekday: 'short' }),
        score: Number(d.readiness_score) || 0,
        status: (d.readiness_status as 'green' | 'yellow' | 'red') || 'yellow',
      }));
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
    queryClient.invalidateQueries({ queryKey: ['today_bio', user?.id, dateStr] });
    queryClient.invalidateQueries({ queryKey: ['readiness_trend', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['nudges', user?.id] });
    queryClient.invalidateQueries({ queryKey: ['today_meals', user?.id, dateStr] });
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
      const { data, error } = await supabase
        .from('meal_entries')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', `${dateStr}T00:00:00`)
        .lt('date_time', `${dateStr}T23:59:59.999`)
        .order('date_time', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}
