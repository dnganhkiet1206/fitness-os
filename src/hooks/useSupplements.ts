import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export function useSupplements() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['supplements', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('supplements')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useAddSupplement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sup: { name: string; category: string; dose_text: string; timing: string; notes: string }) => {
      const { error } = await supabase.from('supplements').insert({
        user_id: user!.id,
        name: sup.name,
        category: sup.category,
        dose_text: sup.dose_text,
        timing: sup.timing,
        notes: sup.notes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements', user?.id] }),
  });
}

export function useUpdateSupplement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string; name?: string; category?: string; dose_text?: string; timing?: string; notes?: string }) => {
      const { error } = await supabase.from('supplements').update(fields).eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements', user?.id] }),
  });
}

export function useDeleteSupplement() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('supplements').delete().eq('id', id).eq('user_id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['supplements', user?.id] }),
  });
}
