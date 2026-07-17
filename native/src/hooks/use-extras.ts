import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from './use-auth';

export function useAwards() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['awards', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('id, award_key, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useRecentAwards(limit = 3) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['awards_recent', user?.id, limit],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('id, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Award catalog — verbatim from the web useAwards.ts */
const AWARD_DEFINITIONS = [
  { key: 'streak_3', type: 'streak', title: 'Khởi Đầu 🔥', desc: 'Ghi log 3 ngày liên tiếp', icon: 'flame', tier: 'bronze', requirement: 3 },
  { key: 'streak_7', type: 'streak', title: 'Tuần Vàng', desc: 'Ghi log 7 ngày liên tiếp', icon: 'flame', tier: 'silver', requirement: 7 },
  { key: 'streak_14', type: 'streak', title: 'Kiên Trì', desc: 'Ghi log 14 ngày liên tiếp', icon: 'flame', tier: 'gold', requirement: 14 },
  { key: 'streak_30', type: 'streak', title: 'Thép Đã Tôi', desc: 'Ghi log 30 ngày liên tiếp', icon: 'flame', tier: 'platinum', requirement: 30 },
  { key: 'first_workout', type: 'first_workout', title: 'Bước Đầu', desc: 'Hoàn thành buổi tập đầu tiên', icon: 'dumbbell', tier: 'bronze' },
  { key: 'workouts_10', type: 'volume_milestone', title: '10 Buổi Tập', desc: 'Hoàn thành 10 buổi tập', icon: 'dumbbell', tier: 'silver', requirement: 10 },
  { key: 'workouts_50', type: 'volume_milestone', title: '50 Buổi Tập', desc: 'Hoàn thành 50 buổi tập', icon: 'dumbbell', tier: 'gold', requirement: 50 },
  { key: 'workouts_100', type: 'volume_milestone', title: 'Centurion', desc: 'Hoàn thành 100 buổi tập', icon: 'dumbbell', tier: 'platinum', requirement: 100 },
  { key: 'first_pr', type: 'pr', title: 'Kỷ Lục Mới!', desc: 'Đạt PR đầu tiên', icon: 'trophy', tier: 'silver' },
  { key: 'pr_5', type: 'pr', title: '5x PR', desc: 'Đạt 5 PR', icon: 'trophy', tier: 'gold', requirement: 5 },
  { key: 'steps_10k', type: 'steps_goal', title: '10K Steps', desc: 'Đạt 10,000 bước trong 1 ngày', icon: 'footprints', tier: 'bronze' },
] as const;

type AwardDef = (typeof AWARD_DEFINITIONS)[number];

/**
 * Award auto-grant engine — port of the web useCheckAwards. Run once per
 * app session (Today mount). Without this the native app never grants
 * awards; they only appeared when the web app happened to run.
 */
export function useCheckAwards() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: existingAwards } = useAwards();

  const grant = async (def: AwardDef, metadata: Record<string, unknown> = {}) => {
    const { error } = await supabase.from('awards').insert({
      user_id: user!.id,
      award_type: def.type,
      award_key: def.key,
      title: def.title,
      description: def.desc,
      icon: def.icon,
      tier: def.tier,
      metadata: metadata as Json,
    });
    // duplicate unique-violation = already earned elsewhere; ignore
    if (error && !error.message.includes('duplicate')) throw error;
    if (!error) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const checkAndGrant = async () => {
    if (!user || !existingAwards) return;
    const earned = new Set(existingAwards.map((a) => a.award_key));
    const byKey = (key: string) => AWARD_DEFINITIONS.find((d) => d.key === key)!;
    let granted = false;

    try {
      // Streaks from consecutive daily_logs dates
      const { data: logs } = await supabase
        .from('daily_logs')
        .select('date')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(35);

      if (logs && logs.length > 0) {
        let streak = 1;
        const todayStr = new Date().toISOString().split('T')[0];
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = yesterday.toISOString().split('T')[0];
        const dates = logs.map((l) => l.date);
        if (dates[0] === todayStr || dates[0] === yStr) {
          for (let i = 1; i < dates.length; i++) {
            const diffDays =
              (new Date(dates[i - 1]).getTime() - new Date(dates[i]).getTime()) / 86400000;
            if (Math.round(diffDays) === 1) streak++;
            else break;
          }
        }
        for (const key of ['streak_3', 'streak_7', 'streak_14', 'streak_30'] as const) {
          const def = byKey(key);
          if ('requirement' in def && streak >= def.requirement && !earned.has(key)) {
            await grant(def, { streak });
            granted = true;
          }
        }
      }

      // Workout milestones
      const { count: workoutCount } = await supabase
        .from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id);
      if (workoutCount != null) {
        if (workoutCount >= 1 && !earned.has('first_workout')) {
          await grant(byKey('first_workout'));
          granted = true;
        }
        for (const key of ['workouts_10', 'workouts_50', 'workouts_100'] as const) {
          const def = byKey(key);
          if ('requirement' in def && workoutCount >= def.requirement && !earned.has(key)) {
            await grant(def, { count: workoutCount });
            granted = true;
          }
        }
      }

      // PRs
      const { count: prCount } = await supabase
        .from('workout_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('pr_detected', true);
      if (prCount != null) {
        if (prCount >= 1 && !earned.has('first_pr')) {
          await grant(byKey('first_pr'));
          granted = true;
        }
        if (prCount >= 5 && !earned.has('pr_5')) {
          await grant(byKey('pr_5'), { count: prCount });
          granted = true;
        }
      }

      // Steps 10k today
      const { data: todayLog } = await supabase
        .from('daily_logs')
        .select('steps')
        .eq('user_id', user.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();
      if (todayLog && (todayLog.steps ?? 0) >= 10000 && !earned.has('steps_10k')) {
        await grant(byKey('steps_10k'), { steps: todayLog.steps });
        granted = true;
      }
    } catch {
      // Award granting must never break the dashboard
    }

    if (granted) {
      queryClient.invalidateQueries({ queryKey: ['awards', user.id] });
      queryClient.invalidateQueries({ queryKey: ['awards_recent', user.id] });
    }
  };

  return { checkAndGrant, ready: !!existingAwards };
}

/** Monday of the current week (same logic as the web app) */
function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

export function useWeeklyChallenges() {
  const { user } = useAuth();
  const weekStart = getWeekStart();
  return useQuery({
    queryKey: ['weekly-challenges', user?.id, weekStart],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_challenges')
        .select('id, title, description, icon, current_value, target_value, completed')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroceryItems() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['grocery_items', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('id, name, quantity, checked, category')
        .eq('user_id', user!.id)
        .order('checked')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useGroceryMutations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['grocery_items', user?.id] });

  const add = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await supabase
        .from('grocery_items')
        .insert({ user_id: user.id, name, checked: false });
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      const { error } = await supabase.from('grocery_items').update({ checked }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      Haptics.selectionAsync();
      invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('grocery_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  return { add, toggle, remove };
}
