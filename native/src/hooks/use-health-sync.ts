import { useMutation } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Alert } from 'react-native';

import { useAuth } from '@/hooks/use-auth';
import { useInvalidateToday } from '@/hooks/useTodayData';
import { supabase } from '@/integrations/supabase/client';
import {
  getLatestBiometrics,
  getTodaySteps,
  isHealthKitAvailable,
  requestHealthPermissions,
} from '@/lib/health';

/**
 * Pulls today's steps + latest biometrics from Apple Health and writes
 * them to the same tables the web app uses (biometric_samples inserts,
 * daily_logs.steps upsert), then refreshes the Today queries.
 */
export function useHealthSync() {
  const { user } = useAuth();
  const invalidate = useInvalidateToday();

  const sync = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');

      const granted = await requestHealthPermissions();
      if (!granted) throw new Error('Health access was not granted');

      const [bio, steps] = await Promise.all([getLatestBiometrics(), getTodaySteps()]);
      if (!bio && steps == null) {
        throw new Error('No health data found — open the Health app to confirm data exists');
      }

      if (bio) {
        const { error } = await supabase.from('biometric_samples').insert({
          user_id: user.id,
          hr_bpm: bio.hr_bpm,
          hrv_rmssd_ms: bio.hrv_rmssd_ms,
          spo2_pct: bio.spo2_pct,
          resp_rate_rpm: bio.resp_rate_rpm,
          source: bio.source,
          date_time: bio.date_time,
          confidence: bio.confidence,
        });
        if (error) throw error;
      }

      if (steps != null) {
        const dateStr = new Date().toISOString().split('T')[0];
        const { data: existing } = await supabase
          .from('daily_logs')
          .select('id')
          .eq('user_id', user.id)
          .eq('date', dateStr)
          .maybeSingle();
        if (existing) {
          await supabase.from('daily_logs').update({ steps }).eq('id', existing.id);
        } else {
          await supabase.from('daily_logs').insert({ user_id: user.id, date: dateStr, steps });
        }
      }

      return { steps, bio };
    },
    onSuccess: () => {
      invalidate();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (e: Error) => Alert.alert('Apple Health', e.message),
  });

  return { available: isHealthKitAvailable(), sync };
}
