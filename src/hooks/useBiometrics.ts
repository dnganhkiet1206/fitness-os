import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface BiometricSample {
  id: string;
  user_id: string;
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
  const since = new Date();
  since.setDate(since.getDate() - days);

  return useQuery({
    queryKey: ['biometric-history', user?.id, days],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date_time', since.toISOString())
        .order('date_time', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BiometricSample[];
    },
    enabled: !!user,
  });
}

export function useLatestBiometrics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['biometric-latest', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('biometric_samples')
        .select('*')
        .eq('user_id', user!.id)
        .order('date_time', { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] as BiometricSample | undefined;
    },
    enabled: !!user,
  });
}
