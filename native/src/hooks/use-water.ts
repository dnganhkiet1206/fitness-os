import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

import { supabase } from '@/integrations/supabase/client';
import { OFFLINE_WRITE_KEY, type OfflineWrite } from '@/lib/offline-write';
import { offlineNow } from '@/lib/offline';
import { localDateStr } from '@/lib/local-date';
import { useAuth } from './use-auth';

const today = () => localDateStr();

/**
 * A logged mouthful of water, as the two queries that show it see it.
 *
 * `today_water` is the day's total and `today_water_logs` is the list; a tap
 * changes both, and both are patched before the network is asked. Adding water
 * is the most-tapped button in the app and the round trip was the only reason
 * it ever felt like it had not registered.
 */
type WaterLog = { id: string; amount_ml: number; logged_at: string };

async function patchWater(
  qc: ReturnType<typeof useQueryClient>,
  userId: string | undefined,
  dateStr: string,
  edit: (logs: WaterLog[]) => WaterLog[],
) {
  const totalKey = ['today_water', userId, dateStr];
  const logsKey = ['today_water_logs', userId, dateStr];

  // Offline the write is paused, never fails, and so is never rolled back —
  // the patch would sit in the persisted cache as water nobody drank. See
  // `@/lib/offline`.
  if (offlineNow()) return { totalKey, logsKey, prevTotal: undefined, prevLogs: undefined };
  // or a refetch already in flight lands after this and undoes it
  await Promise.all([
    qc.cancelQueries({ queryKey: totalKey }),
    qc.cancelQueries({ queryKey: logsKey }),
  ]);

  const prevTotal = qc.getQueryData<number>(totalKey);
  const prevLogs = qc.getQueryData<WaterLog[]>(logsKey);

  if (prevLogs) {
    const next = edit(prevLogs);
    qc.setQueryData(logsKey, next);
    // The total is re-derived from the list rather than nudged by the delta, so
    // the two cannot end up telling different stories about the same tap.
    qc.setQueryData(
      totalKey,
      next.reduce((n, l) => n + Number(l.amount_ml), 0),
    );
  }
  return { totalKey, logsKey, prevTotal, prevLogs };
}

type WaterCtx = Awaited<ReturnType<typeof patchWater>>;

function rollbackWater(qc: ReturnType<typeof useQueryClient>, ctx?: WaterCtx) {
  if (!ctx) return;
  if (ctx.prevLogs !== undefined) qc.setQueryData(ctx.logsKey, ctx.prevLogs);
  if (ctx.prevTotal !== undefined) qc.setQueryData(ctx.totalKey, ctx.prevTotal);
}

export function useTodayWater() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_water', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('amount_ml')
        .eq('user_id', user!.id)
        .eq('date', dateStr);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + Number(r.amount_ml), 0);
    },
  });
}

export function useAddWater() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dateStr = today();

  const m = useMutation<void, Error, OfflineWrite, WaterCtx>({
    /*
      Through the durable queue, so a glass logged without signal is still a
      glass tomorrow.

      `mutationKey` is what makes this survive: React Query pauses a mutation it
      cannot send and writes it to AsyncStorage, but on the next launch it needs
      a `mutationFn` to hand the variables back to — and functions do not
      serialise. The key is how it finds the one registered in `offline-write`.

      No `mutationFn` here on purpose. Declaring one would work today and stop
      working the moment the app restarts, because the local function is not
      what comes back from storage; the default is. One definition, one
      behaviour, whether it runs now or in an hour.
    */
    mutationKey: [...OFFLINE_WRITE_KEY],
    onMutate: (w) =>
      patchWater(queryClient, user?.id, dateStr, (logs) => [
        // Newest first, matching the query's own order. The id is a placeholder
        // — the refetch replaces the row wholesale, and nothing keys off it in
        // the moment it exists.
        {
          id: `optimistic-${Date.now()}`,
          amount_ml: w.kind === 'water' ? w.amountMl : 0,
          logged_at: new Date().toISOString(),
        },
        ...logs,
      ]),
    onError: (_e, _vars, ctx) => rollbackWater(queryClient, ctx),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today_water', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['today_water_logs', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['water_week', user?.id] });
    },
  });

  /*
    The call sites still say `mutate(ml)`.

    The *variables* have to be a plain serialisable object — that is the whole
    point, since they are what gets written to storage and read back by a
    process that has forgotten this component, this user and this date. But
    making every caller assemble one would push a detail of the persistence
    layer into six screens, and the one that assembled it slightly differently
    would be the one that silently stopped resuming.
  */
  return {
    ...m,
    /*
      `options` is forwarded, and that is not decoration.

      The wrapper used to take only the millilitres, which meant no caller could
      pass an `onError` even if it wanted to — and none did. All three water
      buttons are optimistic, so a refused write rolled the patch back and said
      nothing: the ring ticked up, then dropped again on its own. A convenience
      wrapper that removes the ability to report failure is how a screen ends up
      with no error path "by design".
    */
    mutate: (
      amountMl: number,
      options?: Parameters<typeof m.mutate>[1],
    ) => {
      if (!user) return;
      m.mutate(
        {
          kind: 'water',
          userId: user.id,
          amountMl,
          date: dateStr,
          at: new Date().toISOString(),
        },
        options,
      );
    },
  };
}

/** Undo the most recent water entry today (web: minus button) */
export function useRemoveLastWater() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const dateStr = today();
  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not signed in');
      const { data: last, error: findError } = await supabase
        .from('water_logs')
        .select('id')
        .eq('user_id', user.id)
        .eq('date', dateStr)
        .order('logged_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;
      if (!last) return;
      const { error } = await supabase.from('water_logs').delete().eq('id', last.id);
      if (error) throw error;
    },
    onMutate: () => patchWater(queryClient, user?.id, dateStr, (logs) => logs.slice(1)),
    onError: (_e, _vars, ctx) => rollbackWater(queryClient, ctx),
    onSuccess: () => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['today_water', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['today_water_logs', user?.id, dateStr] });
      queryClient.invalidateQueries({ queryKey: ['water_week', user?.id] });
    },
  });

}

/** Today's individual water entries — the detail list on the Water screen */
export function useTodayWaterLogs() {
  const { user } = useAuth();
  const dateStr = today();
  return useQuery({
    queryKey: ['today_water_logs', user?.id, dateStr],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('water_logs')
        .select('id, amount_ml, logged_at')
        .eq('user_id', user!.id)
        .eq('date', dateStr)
        .order('logged_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Daily water totals over the last 7 days for the trend chart */
export function useWaterWeek() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['water_week', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const fromStr = localDateStr(from);
      const { data, error } = await supabase
        .from('water_logs')
        .select('date, amount_ml')
        .eq('user_id', user!.id)
        .gte('date', fromStr);
      if (error) throw error;
      const byDate = new Map<string, number>();
      for (const r of data ?? []) {
        byDate.set(r.date, (byDate.get(r.date) ?? 0) + Number(r.amount_ml));
      }
      const days: { date: string; total: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = localDateStr(d);
        days.push({ date: key, total: byDate.get(key) ?? 0 });
      }
      return days;
    },
  });
}
