import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fireCelebration } from '@/components/awards/AwardCelebration';

export interface Award {
  id: string;
  user_id: string;
  award_type: string;
  award_key: string;
  title: string;
  description: string;
  icon: string;
  tier: 'bronze' | 'silver' | 'gold' | 'platinum';
  earned_at: string;
  metadata: Record<string, any>;
}

// All possible award definitions
export const AWARD_DEFINITIONS = [
  // Streak awards
  { key: 'streak_3', type: 'streak', title: 'Khởi Đầu 🔥', desc: 'Ghi log 3 ngày liên tiếp', icon: 'flame', tier: 'bronze' as const, requirement: 3 },
  { key: 'streak_7', type: 'streak', title: 'Tuần Vàng', desc: 'Ghi log 7 ngày liên tiếp', icon: 'flame', tier: 'silver' as const, requirement: 7 },
  { key: 'streak_14', type: 'streak', title: 'Kiên Trì', desc: 'Ghi log 14 ngày liên tiếp', icon: 'flame', tier: 'gold' as const, requirement: 14 },
  { key: 'streak_30', type: 'streak', title: 'Thép Đã Tôi', desc: 'Ghi log 30 ngày liên tiếp', icon: 'flame', tier: 'platinum' as const, requirement: 30 },
  
  // Workout milestones
  { key: 'first_workout', type: 'first_workout', title: 'Bước Đầu', desc: 'Hoàn thành buổi tập đầu tiên', icon: 'dumbbell', tier: 'bronze' as const },
  { key: 'workouts_10', type: 'volume_milestone', title: '10 Buổi Tập', desc: 'Hoàn thành 10 buổi tập', icon: 'dumbbell', tier: 'silver' as const, requirement: 10 },
  { key: 'workouts_50', type: 'volume_milestone', title: '50 Buổi Tập', desc: 'Hoàn thành 50 buổi tập', icon: 'dumbbell', tier: 'gold' as const, requirement: 50 },
  { key: 'workouts_100', type: 'volume_milestone', title: 'Centurion', desc: 'Hoàn thành 100 buổi tập', icon: 'dumbbell', tier: 'platinum' as const, requirement: 100 },
  
  // PR
  { key: 'first_pr', type: 'pr', title: 'Kỷ Lục Mới!', desc: 'Đạt PR đầu tiên', icon: 'trophy', tier: 'silver' as const },
  { key: 'pr_5', type: 'pr', title: '5x PR', desc: 'Đạt 5 PR', icon: 'trophy', tier: 'gold' as const, requirement: 5 },
  
  // Weekly completion
  { key: 'weekly_complete_1', type: 'weekly_complete', title: 'Tuần Hoàn Hảo', desc: 'Hoàn thành 100% workout trong 1 tuần', icon: 'calendar', tier: 'silver' as const },
  { key: 'weekly_complete_4', type: 'weekly_complete', title: 'Tháng Xuất Sắc', desc: 'Hoàn thành 100% workout 4 tuần liên tiếp', icon: 'calendar', tier: 'gold' as const, requirement: 4 },
  
  // Calorie/nutrition
  { key: 'calorie_goal_7', type: 'calorie_goal', title: 'Ăn Đúng Tuần', desc: 'Đạt mục tiêu calories 7 ngày liên tiếp', icon: 'target', tier: 'silver' as const, requirement: 7 },
  
  // Sleep
  { key: 'sleep_streak_7', type: 'sleep_streak', title: 'Ngủ Ngon 7 Ngày', desc: 'Ngủ đủ giấc 7 ngày liên tiếp', icon: 'moon', tier: 'silver' as const, requirement: 7 },
  
  // Steps
  { key: 'steps_10k', type: 'steps_goal', title: '10K Steps', desc: 'Đạt 10,000 bước trong 1 ngày', icon: 'footprints', tier: 'bronze' as const },
  
  // Protein
  { key: 'protein_streak_7', type: 'protein_streak', title: 'Protein Master', desc: 'Đạt mục tiêu protein 7 ngày liên tiếp', icon: 'beef', tier: 'silver' as const, requirement: 7 },
];

export function useAwards() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['awards', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('*')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Award[];
    },
    enabled: !!user,
  });
}

export function useRecentAwards(limit = 3) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['awards-recent', user?.id, limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('awards')
        .select('*')
        .eq('user_id', user!.id)
        .order('earned_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Award[];
    },
    enabled: !!user,
  });
}

export function useGrantAward() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (award: { award_type: string; award_key: string; title: string; description: string; icon: string; tier: string; metadata?: Record<string, any> }) => {
      const { error } = await supabase.from('awards').insert({
        user_id: user!.id,
        ...award,
        metadata: award.metadata ?? {},
      });
      // Ignore unique constraint violations (already earned)
      if (error && !error.message.includes('duplicate')) throw error;
      // Return whether it was newly granted (no duplicate error)
      return !error;
    },
    onSuccess: (isNew, variables) => {
      if (isNew) {
        fireCelebration({
          title: variables.title,
          description: variables.description,
          icon: variables.icon,
          tier: variables.tier,
        });
      }
      qc.invalidateQueries({ queryKey: ['awards'] });
      qc.invalidateQueries({ queryKey: ['awards-recent'] });
    },
  });
}

// Hook that checks and auto-grants awards based on current data
export function useCheckAwards() {
  const { user } = useAuth();
  const grantAward = useGrantAward();
  const { data: existingAwards } = useAwards();

  const checkAndGrant = async () => {
    if (!user || !existingAwards) return;
    
    const earned = new Set(existingAwards.map(a => a.award_key));

    // Check streak (daily_logs with consecutive dates)
    const { data: logs } = await supabase
      .from('daily_logs')
      .select('date')
      .eq('user_id', user.id)
      .order('date', { ascending: false })
      .limit(35);

    if (logs && logs.length > 0) {
      let streak = 1;
      const today = new Date().toISOString().split('T')[0];
      const dates = logs.map(l => l.date);
      
      // Check if today or yesterday is logged
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yStr = yesterday.toISOString().split('T')[0];
      
      if (dates[0] === today || dates[0] === yStr) {
        for (let i = 1; i < dates.length; i++) {
          const prev = new Date(dates[i - 1]);
          const curr = new Date(dates[i]);
          const diffDays = (prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
          if (Math.round(diffDays) === 1) {
            streak++;
          } else {
            break;
          }
        }
      }

      const streakAwards = [
        { key: 'streak_3', req: 3 },
        { key: 'streak_7', req: 7 },
        { key: 'streak_14', req: 14 },
        { key: 'streak_30', req: 30 },
      ];

      for (const sa of streakAwards) {
        if (streak >= sa.req && !earned.has(sa.key)) {
          const def = AWARD_DEFINITIONS.find(d => d.key === sa.key)!;
          await grantAward.mutateAsync({
            award_type: def.type,
            award_key: def.key,
            title: def.title,
            description: def.desc,
            icon: def.icon,
            tier: def.tier,
            metadata: { streak },
          });
        }
      }
    }

    // Check workout milestones
    const { count: workoutCount } = await supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if (workoutCount !== null) {
      if (workoutCount >= 1 && !earned.has('first_workout')) {
        const def = AWARD_DEFINITIONS.find(d => d.key === 'first_workout')!;
        await grantAward.mutateAsync({ award_type: def.type, award_key: def.key, title: def.title, description: def.desc, icon: def.icon, tier: def.tier });
      }
      const milestones = [
        { key: 'workouts_10', req: 10 },
        { key: 'workouts_50', req: 50 },
        { key: 'workouts_100', req: 100 },
      ];
      for (const m of milestones) {
        if (workoutCount >= m.req && !earned.has(m.key)) {
          const def = AWARD_DEFINITIONS.find(d => d.key === m.key)!;
          await grantAward.mutateAsync({ award_type: def.type, award_key: def.key, title: def.title, description: def.desc, icon: def.icon, tier: def.tier, metadata: { count: workoutCount } });
        }
      }
    }

    // Check PRs
    const { count: prCount } = await supabase
      .from('workout_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('pr_detected', true);

    if (prCount !== null) {
      if (prCount >= 1 && !earned.has('first_pr')) {
        const def = AWARD_DEFINITIONS.find(d => d.key === 'first_pr')!;
        await grantAward.mutateAsync({ award_type: def.type, award_key: def.key, title: def.title, description: def.desc, icon: def.icon, tier: def.tier });
      }
      if (prCount >= 5 && !earned.has('pr_5')) {
        const def = AWARD_DEFINITIONS.find(d => d.key === 'pr_5')!;
        await grantAward.mutateAsync({ award_type: def.type, award_key: def.key, title: def.title, description: def.desc, icon: def.icon, tier: def.tier, metadata: { count: prCount } });
      }
    }

    // Check steps goal
    if (logs && logs.length > 0) {
      const { data: todayLog } = await supabase
        .from('daily_logs')
        .select('steps')
        .eq('user_id', user.id)
        .eq('date', new Date().toISOString().split('T')[0])
        .maybeSingle();

      if (todayLog && (todayLog.steps ?? 0) >= 10000 && !earned.has('steps_10k')) {
        const def = AWARD_DEFINITIONS.find(d => d.key === 'steps_10k')!;
        await grantAward.mutateAsync({ award_type: def.type, award_key: def.key, title: def.title, description: def.desc, icon: def.icon, tier: def.tier, metadata: { steps: todayLog.steps } });
      }
    }
  };

  return { checkAndGrant };
}
