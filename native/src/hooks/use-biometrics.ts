import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';

export interface BiometricSample {
  id: string;
  date_time: string;
  source: string;
  hr_bpm: number | null;
  hrv_rmssd_ms: number | null;
  spo2_pct: number | null;
  vo2max_mlkgmin: number | null;
  resp_rate_rpm: number | null;
  confidence: number | null;
  notes: string | null;
}

export function useBiometricHistory(days = 14) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['biometric_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', since.toISOString())
        .order('date_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BiometricSample[];
    },
  });
}

export interface BiometricInput {
  hr_bpm?: number | null;
  hrv_rmssd_ms?: number | null;
  spo2_pct?: number | null;
  vo2max_mlkgmin?: number | null;
  resp_rate_rpm?: number | null;
}

export function useLogBiometrics() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: BiometricInput) => {
      const { error } = await supabase.from('biometric_samples').insert({
        user_id: user!.id,
        source: 'manual',
        confidence: 0.7,
        hr_bpm: values.hr_bpm ?? null,
        hrv_rmssd_ms: values.hrv_rmssd_ms ?? null,
        spo2_pct: values.spo2_pct ?? null,
        vo2max_mlkgmin: values.vo2max_mlkgmin ?? null,
        resp_rate_rpm: values.resp_rate_rpm ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['biometric_history', user?.id] });
    },
  });
}
