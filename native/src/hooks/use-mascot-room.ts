import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { buyRefKey, getShopItem, xpForRefKey, type ShopItem } from '@/lib/mascot-room';
import { useAuth } from './use-auth';

/**
 * While TEST_UNLOCK_ALL is on, the whole mascot economy lives in
 * AsyncStorage on-device: the Supabase tables (mascot_transactions /
 * mascot_inventory) come from a migration that hasn't been applied to
 * the temporary Lovable project yet, and testing must not depend on it.
 * Flip the flag off and every hook below goes back to Supabase.
 */
const LOCAL_TX_KEY = 'ascnd_test_mascot_tx';
const LOCAL_INV_KEY = 'ascnd_test_mascot_inventory';

interface LocalTx {
  amount: number;
  ref_key: string;
}
interface LocalInv {
  item_key: string;
  equipped: boolean;
}

async function readLocal<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

async function writeLocal(key: string, rows: unknown[]) {
  await AsyncStorage.setItem(key, JSON.stringify(rows));
}

/**
 * Wallet = the full transaction ledger reduced client-side: balance and
 * the set of claimed ref_keys (drives quest "claimed" state). One query
 * feeds both. The UNIQUE(user_id, ref_key) constraint makes claims
 * idempotent server-side no matter what the UI shows.
 */
export function useMascotWallet() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_wallet', user?.id],
    enabled: !!user,
    queryFn: async () => {
      let rows: LocalTx[];
      if (TEST_UNLOCK_ALL) {
        rows = await readLocal<LocalTx>(LOCAL_TX_KEY);
      } else {
        const { data, error } = await supabase
          .from('mascot_transactions')
          .select('amount, ref_key')
          .eq('user_id', user!.id);
        if (error) throw error;
        rows = data ?? [];
      }
      return {
        balance: rows.reduce((s, r) => s + r.amount, 0),
        // Buddy XP is re-derived from claimed ref_keys, so quests grant XP
        // alongside coins and purchases never lower the level
        xp: rows.reduce((s, r) => s + xpForRefKey(r.ref_key), 0),
        claimed: new Set(rows.map((r) => r.ref_key)),
      };
    },
  });
}

/** Consecutive days with a daily_logs row, ending today or yesterday —
 *  same rule as the streak awards in use-extras. */
export function useDailyStreak() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_streak', user?.id, localDateStr()],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('daily_logs')
        .select('date')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(35);
      const dates = (data ?? []).map((d) => d.date);
      if (dates.length === 0) return 0;
      const todayStr = localDateStr();
      const y = new Date();
      y.setDate(y.getDate() - 1);
      if (dates[0] !== todayStr && dates[0] !== localDateStr(y)) return 0;
      let streak = 1;
      for (let i = 1; i < dates.length; i++) {
        const diff =
          (parseLocalDate(dates[i - 1]).getTime() - parseLocalDate(dates[i]).getTime()) / 86400000;
        if (Math.round(diff) === 1) streak++;
        else break;
      }
      return streak;
    },
  });
}

export function useMascotInventory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_inventory', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<LocalInv[]> => {
      if (TEST_UNLOCK_ALL) return readLocal<LocalInv>(LOCAL_INV_KEY);
      const { data, error } = await supabase
        .from('mascot_inventory')
        .select('item_key, equipped')
        .eq('user_id', user!.id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Claim a quest/bonus reward (idempotent via ref_key) */
export function useClaimReward() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ refKey, amount, reason }: { refKey: string; amount: number; reason: string }) => {
      if (TEST_UNLOCK_ALL) {
        const rows = await readLocal<LocalTx>(LOCAL_TX_KEY);
        if (rows.some((r) => r.ref_key === refKey)) return; // already claimed
        rows.push({ amount, ref_key: refKey });
        await writeLocal(LOCAL_TX_KEY, rows);
        return;
      }
      const { error } = await supabase.from('mascot_transactions').insert({
        user_id: user!.id,
        amount,
        reason,
        ref_key: refKey,
      });
      // duplicate = already claimed elsewhere; treat as success
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] }),
  });
}

const SAME_SLOT_POOL = ['headband', 'cap', 'sunglasses', 'medal', 'belt'] as const;

/** Buy a shop item: inventory row first (unique blocks re-buys), then the
 *  spend row. Outfits auto-equip on purchase. */
export function useBuyItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: ShopItem) => {
      if (TEST_UNLOCK_ALL) {
        // Local test economy: free, instant, no Supabase needed
        let rows = await readLocal<LocalInv>(LOCAL_INV_KEY);
        if (!rows.some((r) => r.item_key === item.key)) {
          if (item.type === 'outfit' && item.slot) {
            const slotKeys = SAME_SLOT_POOL.filter((k) => getShopItem(k)?.slot === item.slot);
            rows = rows.map((r) =>
              slotKeys.includes(r.item_key as (typeof SAME_SLOT_POOL)[number])
                ? { ...r, equipped: false }
                : r,
            );
          }
          // New purchases go in equipped/placed right away, but stay
          // toggleable from the shop (gym gear + upgrades can be removed).
          rows.push({ item_key: item.key, equipped: true });
          await writeLocal(LOCAL_INV_KEY, rows);
        }
        return;
      }
      const { error: invError } = await supabase.from('mascot_inventory').insert({
        user_id: user!.id,
        item_key: item.key,
        equipped: true,
      });
      if (invError) throw invError;
      const { error: txError } = await supabase.from('mascot_transactions').insert({
        user_id: user!.id,
        amount: -item.price,
        reason: `buy ${item.key}`,
        ref_key: buyRefKey(item.key),
      });
      if (txError) throw txError;
      // Wearing the new piece unequips others in the same slot
      if (item.type === 'outfit' && item.slot) {
        await unequipSameSlot(user!.id, item.key, item.slot);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] });
      qc.invalidateQueries({ queryKey: ['mascot_inventory', user?.id] });
    },
  });
}

async function unequipSameSlot(userId: string, keepKey: string, slot: string) {
  const sameSlotKeys = SAME_SLOT_POOL.filter(
    (k) => k !== keepKey && getShopItem(k)?.slot === slot,
  );
  if (sameSlotKeys.length === 0) return;
  await supabase
    .from('mascot_inventory')
    .update({ equipped: false })
    .eq('user_id', userId)
    .in('item_key', sameSlotKeys);
}

/** Toggle wearing an owned outfit (one per slot) */
export function useToggleEquip() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemKey, equipped }: { itemKey: string; equipped: boolean }) => {
      const item = getShopItem(itemKey);
      if (TEST_UNLOCK_ALL) {
        let rows = await readLocal<LocalInv>(LOCAL_INV_KEY);
        if (equipped && item?.slot) {
          const slotKeys = SAME_SLOT_POOL.filter(
            (k) => k !== itemKey && getShopItem(k)?.slot === item.slot,
          );
          rows = rows.map((r) =>
            slotKeys.includes(r.item_key as (typeof SAME_SLOT_POOL)[number])
              ? { ...r, equipped: false }
              : r,
          );
        }
        rows = rows.map((r) => (r.item_key === itemKey ? { ...r, equipped } : r));
        await writeLocal(LOCAL_INV_KEY, rows);
        return;
      }
      const { error } = await supabase
        .from('mascot_inventory')
        .update({ equipped })
        .eq('user_id', user!.id)
        .eq('item_key', itemKey);
      if (error) throw error;
      if (equipped && item?.slot) await unequipSameSlot(user!.id, itemKey, item.slot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mascot_inventory', user?.id] }),
  });
}
