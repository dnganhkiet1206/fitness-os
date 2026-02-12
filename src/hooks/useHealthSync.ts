import { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isHealthAvailable, requestHealthPermissions, syncLatestBiometrics } from '@/lib/health-connect';
import { toast } from 'sonner';

const AUTO_SYNC_KEY = 'health_last_auto_sync';
const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes

export function useHealthSync() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [available, setAvailable] = useState(false);
  const [checking, setChecking] = useState(true);
  const autoSyncAttempted = useRef(false);

  // Check availability
  useEffect(() => {
    isHealthAvailable().then(ok => {
      setAvailable(ok);
      setChecking(false);
    }).catch(() => setChecking(false));
  }, []);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const granted = await requestHealthPermissions();
      if (!granted) throw new Error('Health permissions denied');

      const data = await syncLatestBiometrics();
      if (!data) throw new Error('No health data available');

      const { error } = await supabase.from('biometric_samples').insert({
        user_id: user.id,
        hr_bpm: data.hr_bpm,
        hrv_rmssd_ms: data.hrv_rmssd_ms,
        spo2_pct: data.spo2_pct,
        vo2max_mlkgmin: data.vo2max_mlkgmin,
        resp_rate_rpm: data.resp_rate_rpm,
        source: data.source,
        date_time: data.date_time,
        confidence: data.confidence,
      });

      if (error) throw error;

      // Mark auto-sync timestamp
      localStorage.setItem(AUTO_SYNC_KEY, Date.now().toString());

      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['biometric-history'] });
      queryClient.invalidateQueries({ queryKey: ['biometric-latest'] });
      const source = data.source === 'apple_health' ? 'Apple Health' : 'Health Connect';
      toast.success(`Đồng bộ từ ${source} thành công!`);
    },
    onError: (err: Error) => {
      if (err.message === 'Health permissions denied') {
        toast.error('Vui lòng cấp quyền truy cập dữ liệu sức khỏe');
      } else if (err.message === 'No health data available') {
        // Silent for auto-sync
      } else {
        toast.error('Đồng bộ thất bại: ' + err.message);
      }
    },
  });

  // Auto-sync on app open (when native + available + not synced recently)
  useEffect(() => {
    if (autoSyncAttempted.current || checking || !available || !user) return;
    autoSyncAttempted.current = true;

    const lastSync = parseInt(localStorage.getItem(AUTO_SYNC_KEY) ?? '0', 10);
    if (Date.now() - lastSync > AUTO_SYNC_INTERVAL_MS) {
      console.log('[HealthSync] Auto-syncing on app open...');
      syncMutation.mutate();
    }
  }, [checking, available, user]); // eslint-disable-line react-hooks/exhaustive-deps

  const sync = useCallback(() => {
    syncMutation.mutate();
  }, [syncMutation]);

  return {
    available,
    checking,
    syncing: syncMutation.isPending,
    sync,
  };
}
