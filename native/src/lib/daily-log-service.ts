import { supabase } from '@/integrations/supabase/client';
import { localDayRangeISO } from './local-date';
import { computeReadiness } from './readiness-engine';
import type { ReadinessInput } from './types';

export async function recomputeDailyLog(userId: string, date: string) {
  // Local-day window as UTC instants for timestamptz columns
  const day = localDayRangeISO(date);
  // 1. Nutrition from meal_entries
  const { data: meals } = await supabase
    .from('meal_entries')
    .select('total_kcal, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g')
    .eq('user_id', userId)
    .gte('date_time', day.start)
    .lt('date_time', day.end);

  const kcal = meals?.reduce((s, m) => s + Number(m.total_kcal), 0) ?? 0;
  const protein_g = meals?.reduce((s, m) => s + Number(m.total_protein_g), 0) ?? 0;
  const carbs_g = meals?.reduce((s, m) => s + Number(m.total_carbs_g), 0) ?? 0;
  const fat_g = meals?.reduce((s, m) => s + Number(m.total_fat_g), 0) ?? 0;
  const fiber_g = meals?.reduce((s, m) => s + Number(m.total_fiber_g), 0) ?? 0;

  // 2. Training from workout_sessions
  const { data: workouts } = await supabase
    .from('workout_sessions')
    .select('volume_load')
    .eq('user_id', userId)
    .gte('date_time', day.start)
    .lt('date_time', day.end);

  const workout_count = workouts?.length ?? 0;
  const volume_load = workouts?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  // 3. Sleep from sleep_logs (sleep ending on this date)
  const { data: sleeps } = await supabase
    .from('sleep_logs')
    .select('bedtime, waketime, quality, light_min, deep_min, rem_min')
    .eq('user_id', userId)
    .gte('waketime', day.start)
    .lt('waketime', day.end)
    .limit(1)
    .order('waketime', { ascending: false });

  const sleep = sleeps?.[0];
  let sleep_duration_min = 0;
  let sleep_quality = 0;
  if (sleep) {
    const bed = new Date(sleep.bedtime).getTime();
    const wake = new Date(sleep.waketime).getTime();
    sleep_duration_min = Math.round((wake - bed) / 60000);
    sleep_quality = sleep.quality ?? 5;
  }

  // 4. Supplements adherence
  const { data: supplements } = await supabase
    .from('supplements')
    .select('id')
    .eq('user_id', userId);
  const supplement_planned = supplements?.length ?? 0;

  const { data: intakes } = await supabase
    .from('supplement_intake_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('taken', true)
    .gte('date_time', day.start)
    .lt('date_time', day.end);
  const supplement_taken = intakes?.length ?? 0;

  // 5. Readiness computation
  let readiness_score: number | null = null;
  let readiness_status: string | null = null;
  let readiness_explain = '';
  let readiness_recommendation = '';
  let acwr: number | null = null;

  // Get biometric data for today
  const { data: bio } = await supabase
    .from('biometric_samples')
    .select('hr_bpm, hrv_rmssd_ms')
    .eq('user_id', userId)
    .gte('date_time', day.start)
    .lt('date_time', day.end)
    .order('date_time', { ascending: false })
    .limit(1);

  // Get profile for sleep target
  const { data: profile } = await supabase
    .from('profiles')
    .select('sleep_target_hours')
    .eq('user_id', userId)
    .single();

  const sleepTargetMin = (profile?.sleep_target_hours ?? 8) * 60;

  // Get 28d history for HRV/RHR
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 28);
  const { data: bioHistory } = await supabase
    .from('biometric_samples')
    .select('hrv_rmssd_ms, hr_bpm, date_time')
    .eq('user_id', userId)
    .gte('date_time', thirtyDaysAgo.toISOString())
    .order('date_time', { ascending: true });

  const hrvHistory = (bioHistory ?? []).filter(b => b.hrv_rmssd_ms != null).map(b => Number(b.hrv_rmssd_ms));
  const rhrHistory = (bioHistory ?? []).filter(b => b.hr_bpm != null).map(b => Number(b.hr_bpm));

  // Get 7d and 28d training loads
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const { data: load7d } = await supabase
    .from('workout_sessions')
    .select('volume_load')
    .eq('user_id', userId)
    .gte('date_time', sevenDaysAgo.toISOString());

  const { data: load28d } = await supabase
    .from('workout_sessions')
    .select('volume_load')
    .eq('user_id', userId)
    .gte('date_time', thirtyDaysAgo.toISOString());

  const trainingLoad7d = load7d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;
  const trainingLoad28d = load28d?.reduce((s, w) => s + Number(w.volume_load), 0) ?? 0;

  // Get 7d sleep debt
  const { data: sleepLogs7d } = await supabase
    .from('sleep_logs')
    .select('bedtime, waketime')
    .eq('user_id', userId)
    .gte('waketime', sevenDaysAgo.toISOString());

  let sleepDebt7d = 0;
  if (sleepLogs7d && sleepLogs7d.length > 0) {
    const totalSleep = sleepLogs7d.reduce((s, sl) => {
      return s + (new Date(sl.waketime).getTime() - new Date(sl.bedtime).getTime()) / 60000;
    }, 0);
    const avgSleep = totalSleep / sleepLogs7d.length;
    sleepDebt7d = Math.max(0, sleepTargetMin - avgSleep);
  }

  // Check if enough data for readiness (at least 3 days of any logs)
  const hasEnoughData = (bioHistory && bioHistory.length >= 3) || (sleepLogs7d && sleepLogs7d.length >= 3);

  if (hasEnoughData) {
    const input: ReadinessInput = {
      hrv_today: bio?.[0]?.hrv_rmssd_ms ? Number(bio[0].hrv_rmssd_ms) : null,
      rhr_today: bio?.[0]?.hr_bpm ? Number(bio[0].hr_bpm) : undefined,
      sleep_min_lastnight: sleep_duration_min,
      sleep_target_min: sleepTargetMin,
      sleep_debt_7d_min: sleepDebt7d,
      training_load_7d: trainingLoad7d,
      training_load_28d: trainingLoad28d,
      soreness_today: undefined,
      illness_flag: false,
      pain_flag_max: undefined,
      hrv_history_28d: hrvHistory,
      rhr_history_28d: rhrHistory,
    };

    const result = computeReadiness(input);
    readiness_score = result.score;
    readiness_status = result.status;
    // Store language-neutral tokens; the UI localizes them at render so the
    // readiness text follows the user's language, not the compute-time one.
    readiness_explain = result.explainToken;
    readiness_recommendation = result.recommendationKey;
    acwr = result.acwr;
  }

  // 6. Upsert daily_log
  const { error } = await supabase
    .from('daily_logs')
    .upsert({
      user_id: userId,
      date,
      kcal,
      protein_g,
      carbs_g,
      fat_g,
      fiber_g,
      sleep_duration_min,
      sleep_quality,
      workout_count,
      volume_load,
      supplement_taken,
      supplement_planned,
      readiness_score,
      readiness_status,
      readiness_explain,
      readiness_recommendation,
      acwr,
    }, { onConflict: 'user_id,date' });

  if (error) console.error('recomputeDailyLog error:', error);
  return { error };
}
