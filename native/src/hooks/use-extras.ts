import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { fireCelebration } from '@/components/ascnd/award-celebration';
import { useAppSettings } from '@/hooks/use-app-settings';
import { supabase } from '@/integrations/supabase/client';
import { AWARD_TEXT, CHALLENGE_TEXT } from '@/lib/gamification-i18n';
import { localDateStr, localDayRangeISO, parseLocalDate } from '@/lib/local-date';
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
        .select('id, award_key, title, description, icon, tier, earned_at')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Award catalog — structure/thresholds only. Display text lives in
 * gamification-i18n (AWARD_TEXT) keyed by `key`; the English string is
 * written to the DB as the canonical/history value.
 */
export const AWARD_DEFINITIONS = [
  { key: 'streak_3', type: 'streak', icon: 'flame', tier: 'bronze', requirement: 3 },
  { key: 'streak_7', type: 'streak', icon: 'flame', tier: 'silver', requirement: 7 },
  { key: 'streak_14', type: 'streak', icon: 'flame', tier: 'gold', requirement: 14 },
  { key: 'streak_30', type: 'streak', icon: 'flame', tier: 'platinum', requirement: 30 },
  { key: 'first_workout', type: 'first_workout', icon: 'dumbbell', tier: 'bronze' },
  { key: 'workouts_10', type: 'volume_milestone', icon: 'dumbbell', tier: 'silver', requirement: 10 },
  { key: 'workouts_50', type: 'volume_milestone', icon: 'dumbbell', tier: 'gold', requirement: 50 },
  { key: 'workouts_100', type: 'volume_milestone', icon: 'dumbbell', tier: 'platinum', requirement: 100 },
  { key: 'first_pr', type: 'pr', icon: 'trophy', tier: 'silver' },
  { key: 'pr_5', type: 'pr', icon: 'trophy', tier: 'gold', requirement: 5 },
  { key: 'steps_10k', type: 'steps_goal', icon: 'footprints', tier: 'bronze' },
] as const;

type AwardDef = (typeof AWARD_DEFINITIONS)[number];

/**
 * Award auto-grant engine — port of the web useCheckAwards. Run once per
 * app session (Today mount). Without this the native app never grants
 * awards; they only appeared when the web app happened to run.
 */
export function useCheckAwards() {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const queryClient = useQueryClient();
  const { data: existingAwards } = useAwards();

  const grant = async (def: AwardDef, metadata: Record<string, unknown> = {}) => {
    const text = AWARD_TEXT[def.key];
    const { error } = await supabase.from('awards').insert({
      user_id: user!.id,
      award_type: def.type,
      award_key: def.key,
      // English is the canonical/history value; native renders by key
      title: text.title.en,
      description: text.desc.en,
      icon: def.icon,
      tier: def.tier,
      metadata: metadata as Json,
    });
    // duplicate unique-violation = already earned elsewhere; ignore
    if (error && !error.message.includes('duplicate')) throw error;
    if (!error) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Fire the confetti overlay in the user's language
      fireCelebration({
        title: text.title[lang],
        description: text.desc[lang],
        icon: def.icon,
        tier: def.tier,
      });
    }
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
        const todayStr = localDateStr();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yStr = localDateStr(yesterday);
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
        .eq('date', localDateStr())
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
  return localDateStr(monday);
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
        .select('id, challenge_key, title, description, icon, current_value, target_value, completed')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/**
 * Challenge rotation — structure/thresholds only. Display text lives in
 * gamification-i18n (CHALLENGE_TEXT) keyed by `key`; English strings are
 * written to the DB as canonical/history values.
 */
const CHALLENGE_POOL = [
  { key: 'workouts_5', icon: 'dumbbell', target: 5, tier: 'silver' },
  { key: 'workouts_3', icon: 'dumbbell', target: 3, tier: 'bronze' },
  { key: 'protein_7', icon: 'beef', target: 7, tier: 'gold' },
  { key: 'steps_50k', icon: 'footprints', target: 50000, tier: 'silver' },
  { key: 'sleep_7', icon: 'moon', target: 7, tier: 'silver' },
  { key: 'log_7', icon: 'target', target: 7, tier: 'gold' },
  { key: 'calories_5', icon: 'target', target: 5, tier: 'silver' },
  { key: 'water_7', icon: 'droplets', target: 7, tier: 'silver' },
];

/** Pick 3 challenges for a given week (deterministic, same as web) */
function pickChallengesForWeek(weekStart: string) {
  const seed = weekStart.replace(/-/g, '');
  const num = parseInt(seed, 10) % CHALLENGE_POOL.length;
  const picked: (typeof CHALLENGE_POOL)[number][] = [];
  for (let i = 0; i < 3; i++) {
    picked.push(CHALLENGE_POOL[(num + i) % CHALLENGE_POOL.length]);
  }
  return picked;
}

/**
 * Seed this week's challenges if none exist — without this the native
 * app showed "no challenges" forever unless the web app ran first.
 */
export function useInitWeeklyChallenges() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const weekStart = getWeekStart();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const { count } = await supabase
        .from('weekly_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('week_start', weekStart);
      if ((count ?? 0) > 0) return;

      const rows = pickChallengesForWeek(weekStart).map((c) => {
        const t = CHALLENGE_TEXT[c.key];
        return {
          user_id: user.id,
          week_start: weekStart,
          challenge_key: c.key,
          // English canonical for the shared DB; native renders by key
          title: t.title.en,
          description: t.desc.en,
          icon: c.icon,
          target_value: c.target,
          current_value: 0,
          reward_title: t.reward.en,
          reward_tier: c.tier,
        };
      });
      const { error } = await supabase.from('weekly_challenges').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenges'] }),
  });
}

/** Recompute challenge progress from this week's logs (port of the web hook) */
export function useUpdateChallengeProgress() {
  const { user } = useAuth();
  const { lang } = useAppSettings();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      const weekStart = getWeekStart();

      const { data: challenges } = await supabase
        .from('weekly_challenges')
        .select('*')
        .eq('user_id', user.id)
        .eq('week_start', weekStart)
        .eq('completed', false);
      if (!challenges || challenges.length === 0) return;

      // parseLocalDate: a bare 'YYYY-MM-DD' parses as UTC midnight, which
      // localDateStr would render as Sunday in negative-offset timezones —
      // cutting the last day out of the challenge week
      const weekEnd = parseLocalDate(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = localDateStr(weekEnd);

      for (const ch of challenges) {
        let newValue = 0;

        if (ch.challenge_key.startsWith('workouts_')) {
          const { count } = await supabase
            .from('workout_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date_time', localDayRangeISO(weekStart).start)
            .lt('date_time', localDayRangeISO(weekEndStr).start);
          newValue = count ?? 0;
        } else if (ch.challenge_key === 'log_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('date')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = logs?.length ?? 0;
        } else if (ch.challenge_key === 'steps_50k') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('steps')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).reduce((sum, l) => sum + (l.steps ?? 0), 0);
        } else if (ch.challenge_key === 'sleep_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('sleep_duration_min')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (l.sleep_duration_min ?? 0) >= 360).length;
        } else if (ch.challenge_key === 'protein_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('protein_g')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (Number(l.protein_g) || 0) >= 100).length;
        } else if (ch.challenge_key === 'calories_5') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('kcal')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          newValue = (logs ?? []).filter((l) => (Number(l.kcal) || 0) > 500).length;
        } else if (ch.challenge_key === 'water_7') {
          const { data: logs } = await supabase
            .from('water_logs')
            .select('date, amount_ml')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          const byDate = new Map<string, number>();
          (logs ?? []).forEach((l) => {
            byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount_ml);
          });
          newValue = [...byDate.values()].filter((v) => v >= 2000).length;
        }

        const isCompleted = newValue >= ch.target_value;
        await supabase
          .from('weekly_challenges')
          .update({
            current_value: Math.min(newValue, ch.target_value),
            completed: isCompleted,
            completed_at: isCompleted ? new Date().toISOString() : null,
          })
          .eq('id', ch.id);

        if (isCompleted && ch.reward_title) {
          const t = CHALLENGE_TEXT[ch.challenge_key];
          const rewardTitle = t ? t.reward[lang] : ch.reward_title;
          const challengeTitle = t ? t.title[lang] : ch.title;
          const doneLabel = lang === 'vi' ? 'Hoàn thành thử thách' : 'Challenge complete';
          fireCelebration({
            title: rewardTitle,
            description: `${doneLabel}: ${challengeTitle}`,
            icon: ch.icon ?? 'trophy',
            tier: ch.reward_tier ?? 'bronze',
          });
        }
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weekly-challenges'] }),
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
