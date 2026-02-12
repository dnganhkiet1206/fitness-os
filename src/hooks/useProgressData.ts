import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

// ---- Sleep history (7-day) ----
export function useSleepHistory(days = 7) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['sleep_history', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('sleep_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('waketime', since.toISOString())
        .order('waketime', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

// ---- Body measurements ----
export function useBodyMeasurements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['body_measurements', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('body_measurements')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: true })
        .limit(90);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUpsertBodyMeasurement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: {
      date: string;
      neck_cm?: number | null; shoulders_cm?: number | null; chest_cm?: number | null;
      waist_cm?: number | null; hips_cm?: number | null;
      bicep_left_cm?: number | null; bicep_right_cm?: number | null;
      thigh_left_cm?: number | null; thigh_right_cm?: number | null;
      calf_left_cm?: number | null; calf_right_cm?: number | null;
      body_fat_pct?: number | null; notes?: string;
    }) => {
      const { error } = await supabase.from('body_measurements').upsert({
        user_id: user!.id,
        ...m,
      }, { onConflict: 'user_id,date' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['body_measurements'] }),
  });
}

// ---- Progress photos ----
export function useProgressPhotos() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['progress_photos', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('progress_photos')
        .select('*')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useUploadProgressPhoto() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, pose, notes, date }: { file: File; pose: string; notes?: string; date?: string }) => {
      const dateStr = date || new Date().toISOString().split('T')[0];
      const ext = file.name.split('.').pop();
      const path = `${user!.id}/${dateStr}-${pose}-${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from('progress-photos')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('progress-photos').getPublicUrl(path);

      const { error } = await supabase.from('progress_photos').insert({
        user_id: user!.id,
        date: dateStr,
        photo_url: urlData.publicUrl,
        pose,
        notes: notes || '',
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress_photos'] }),
  });
}

export function useDeleteProgressPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, photo_url }: { id: string; photo_url: string }) => {
      // Extract path from URL
      const urlParts = photo_url.split('/progress-photos/');
      if (urlParts[1]) {
        await supabase.storage.from('progress-photos').remove([urlParts[1]]);
      }
      const { error } = await supabase.from('progress_photos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress_photos'] }),
  });
}

// ---- Weight history (reuse from useDashboardData but extended) ----
export function useWeightHistoryExtended(days = 90) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['weight_history_ext', user?.id, days],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('weight_logs')
        .select('*')
        .eq('user_id', user!.id)
        .gte('date', since.toISOString().split('T')[0])
        .order('date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}
