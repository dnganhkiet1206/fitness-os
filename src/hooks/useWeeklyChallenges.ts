import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { fireCelebration } from '@/components/awards/AwardCelebration';

export interface WeeklyChallenge {
  id: string;
  user_id: string;
  week_start: string;
  challenge_key: string;
  title: string;
  description: string;
  icon: string;
  target_value: number;
  current_value: number;
  completed: boolean;
  completed_at: string | null;
  reward_title: string | null;
  reward_tier: string;
}

// Challenge templates that rotate weekly
export const CHALLENGE_POOL = [
  { key: 'workouts_5', title: '5 Buổi Tập', desc: 'Hoàn thành 5 buổi tập trong tuần', icon: 'dumbbell', target: 5, reward: 'Chiến Binh Tuần', tier: 'silver' },
  { key: 'workouts_3', title: '3 Buổi Tập', desc: 'Hoàn thành 3 buổi tập trong tuần', icon: 'dumbbell', target: 3, reward: 'Bước Đầu Tuần', tier: 'bronze' },
  { key: 'protein_7', title: 'Protein 7/7', desc: 'Đạt mục tiêu protein 7 ngày', icon: 'beef', target: 7, reward: 'Protein Master', tier: 'gold' },
  { key: 'steps_50k', title: '50K Bước', desc: 'Đi 50,000 bước trong tuần', icon: 'footprints', target: 50000, reward: 'Chân Thép', tier: 'silver' },
  { key: 'sleep_7', title: 'Ngủ Đủ 7/7', desc: 'Ngủ đủ giấc 7 ngày liên tiếp', icon: 'moon', target: 7, reward: 'Giấc Ngủ Vàng', tier: 'silver' },
  { key: 'log_7', title: 'Log 7/7', desc: 'Ghi log đầy đủ 7 ngày trong tuần', icon: 'target', target: 7, reward: 'Kỷ Luật Sắt', tier: 'gold' },
  { key: 'calories_5', title: 'Đúng Calo 5/7', desc: 'Đạt mục tiêu calories 5 ngày', icon: 'target', target: 5, reward: 'Ăn Chuẩn', tier: 'silver' },
  { key: 'water_7', title: 'Uống Đủ Nước 7/7', desc: 'Đạt mục tiêu nước 7 ngày', icon: 'droplets', target: 7, reward: 'Hydro Pro', tier: 'silver' },
];

function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// Pick 3 challenges for a given week (deterministic based on week)
function pickChallengesForWeek(weekStart: string): typeof CHALLENGE_POOL[number][] {
  const seed = weekStart.replace(/-/g, '');
  const num = parseInt(seed) % CHALLENGE_POOL.length;
  const picked: typeof CHALLENGE_POOL[number][] = [];
  for (let i = 0; i < 3; i++) {
    picked.push(CHALLENGE_POOL[(num + i) % CHALLENGE_POOL.length]);
  }
  return picked;
}

export function useWeeklyChallenges() {
  const { user } = useAuth();
  const weekStart = getWeekStart();

  return useQuery({
    queryKey: ['weekly-challenges', user?.id, weekStart],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('weekly_challenges')
        .select('*')
        .eq('user_id', user!.id)
        .eq('week_start', weekStart)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as WeeklyChallenge[];
    },
    enabled: !!user,
  });
}

export function useInitWeeklyChallenges() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const weekStart = getWeekStart();

  return useMutation({
    mutationFn: async () => {
      if (!user) return;
      // Check if already initialized
      const { count } = await supabase
        .from('weekly_challenges')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('week_start', weekStart);

      if ((count ?? 0) > 0) return; // Already initialized

      const challenges = pickChallengesForWeek(weekStart);
      const rows = challenges.map(c => ({
        user_id: user.id,
        week_start: weekStart,
        challenge_key: c.key,
        title: c.title,
        description: c.desc,
        icon: c.icon,
        target_value: c.target,
        current_value: 0,
        reward_title: c.reward,
        reward_tier: c.tier,
      }));

      const { error } = await supabase.from('weekly_challenges').insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-challenges'] });
    },
  });
}

export function useUpdateChallengeProgress() {
  const { user } = useAuth();
  const qc = useQueryClient();

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

      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      for (const ch of challenges) {
        let newValue = 0;

        if (ch.challenge_key.startsWith('workouts_')) {
          const { count } = await supabase
            .from('workout_sessions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .gte('date_time', weekStart)
            .lt('date_time', weekEndStr);
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
          newValue = (logs ?? []).filter(l => (l.sleep_duration_min ?? 0) >= 360).length;
        } else if (ch.challenge_key === 'protein_7') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('protein_g')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          // Assume target ~100g as a reasonable threshold
          newValue = (logs ?? []).filter(l => (Number(l.protein_g) || 0) >= 100).length;
        } else if (ch.challenge_key === 'calories_5') {
          const { data: logs } = await supabase
            .from('daily_logs')
            .select('kcal')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          // Count days where kcal > 0 (logged something)
          newValue = (logs ?? []).filter(l => (Number(l.kcal) || 0) > 500).length;
        } else if (ch.challenge_key === 'water_7') {
          const { data: logs } = await supabase
            .from('water_logs')
            .select('date, amount_ml')
            .eq('user_id', user.id)
            .gte('date', weekStart)
            .lt('date', weekEndStr);
          // Group by date and count days with >= 2000ml
          const byDate = new Map<string, number>();
          (logs ?? []).forEach(l => {
            byDate.set(l.date, (byDate.get(l.date) ?? 0) + l.amount_ml);
          });
          newValue = [...byDate.values()].filter(v => v >= 2000).length;
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
          fireCelebration({
            title: ch.reward_title,
            description: `Challenge hoàn thành: ${ch.title}`,
            icon: ch.icon,
            tier: ch.reward_tier,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['weekly-challenges'] });
    },
  });
}

export { getWeekStart };
