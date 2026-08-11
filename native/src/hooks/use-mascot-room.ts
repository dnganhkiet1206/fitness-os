import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { localDateStr, parseLocalDate } from '@/lib/local-date';
import { offlineNow } from '@/lib/offline';
import {
  buyRefKey,
  conflictingKeys,
  getShopItem,
  xpForRefKey,
  type ShopItem,
  type ShopItemKey,
} from '@/lib/mascot-room';
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
      const { data, error } = await supabase
        .from('daily_logs')
        .select('date')
        .eq('user_id', user!.id)
        .order('date', { ascending: false })
        .limit(35);
      if (error) throw error;
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
      /* Through the function, not the table.

         `mascot_transactions` no longer takes client inserts at all — a POST to
         it with `amount: 999999` unlocked the whole shop for one request. The
         RPC clamps a claim to the economy's real maxima and keeps the `ref_key`
         idempotency, so a duplicate is still a no-op. */
      const { error } = await supabase.rpc('earn_mascot_coins', {
        p_ref_key: refKey,
        p_amount: amount,
        p_reason: reason,
      });
      // duplicate = already claimed elsewhere; treat as success
      if (error && !error.message.includes('duplicate')) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] }),
  });
}

/** Buy a shop item: inventory row first (unique blocks re-buys), then the
 *  spend row. The piece auto-equips, pushing off whatever it conflicts with. */
export function useBuyItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: ShopItem) => {
      if (TEST_UNLOCK_ALL) {
        // Local test economy: free, instant, no Supabase needed
        let rows = await readLocal<LocalInv>(LOCAL_INV_KEY);
        if (!rows.some((r) => r.item_key === item.key)) {
          // The new piece is worn/used at once, so its rivals switch off — the
          // other hat in its slot, or the stage that was showing.
          const conflicts = conflictingKeys(item.key);
          if (conflicts.length) {
            rows = rows.map((r) =>
              conflicts.includes(r.item_key as ShopItemKey) ? { ...r, equipped: false } : r,
            );
          }
          rows.push({ item_key: item.key, equipped: true });
          await writeLocal(LOCAL_INV_KEY, rows);
        }
        return;
      }
      /* One call, and the price is not ours to send.

         This used to insert the inventory row and *then* the spend row, so the
         item was owned before it was paid for — anything failing in between was
         a free item with no attacker involved. And `-item.price` was a number
         the client chose. `buy_mascot_item` looks the price up, locks the
         balance, and writes both rows in one transaction. */
      const { error: buyError } = await supabase.rpc('buy_mascot_item', {
        p_item_key: item.key,
      });
      if (buyError) throw buyError;
      // Wearing the new piece switches off whatever it conflicts with
      await unequipConflicts(user!.id, item.key);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] });
      qc.invalidateQueries({ queryKey: ['mascot_inventory', user?.id] });
    },
  });
}

/** Switch off everything that conflicts with `keepKey` — one outfit per slot,
 *  one stage at a time. See `conflictingKeys`. */
async function unequipConflicts(userId: string, keepKey: string) {
  const keys = conflictingKeys(keepKey);
  if (keys.length === 0) return;
  await supabase
    .from('mascot_inventory')
    .update({ equipped: false })
    .eq('user_id', userId)
    .in('item_key', keys);
}

/** Toggle wearing an owned item — one outfit per slot, one stage at a time. */
export function useToggleEquip() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ itemKey, equipped }: { itemKey: string; equipped: boolean }) => {
      if (TEST_UNLOCK_ALL) {
        let rows = await readLocal<LocalInv>(LOCAL_INV_KEY);
        if (equipped) {
          const conflicts = conflictingKeys(itemKey);
          if (conflicts.length) {
            rows = rows.map((r) =>
              conflicts.includes(r.item_key as ShopItemKey) ? { ...r, equipped: false } : r,
            );
          }
        }
        rows = rows.map((r) => (r.item_key === itemKey ? { ...r, equipped } : r));
        await writeLocal(LOCAL_INV_KEY, rows);
        return;
      }
      // The two writes touch disjoint rows — `conflictingKeys` excludes the key
      // being switched on — so they have no reason to queue behind each other.
      const [{ error }] = await Promise.all([
        supabase
          .from('mascot_inventory')
          .update({ equipped })
          .eq('user_id', user!.id)
          .eq('item_key', itemKey),
        equipped ? unequipConflicts(user!.id, itemKey) : Promise.resolve(),
      ]);
      if (error) throw error;
    },
    /**
     * The mascot changes clothes on the tap, not on the reply.
     *
     * Dressing is the one place in the app where the result of the tap *is* the
     * screen — you press "wear" to see it worn — and waiting a round trip to
     * find out reads as the button having missed. The cache already knows
     * everything needed to answer: which item, on or off, and which others come
     * off with it.
     *
     * The rule is the same one the server applies, and the same one the offline
     * `TEST_UNLOCK_ALL` branch above applies, so all three agree about what the
     * wardrobe looks like a moment from now.
     */
    onMutate: async ({ itemKey, equipped }) => {
      const key = ['mascot_inventory', user?.id];
      // See `@/lib/offline` — dressing Koa in something the server never heard
      // about is the same class of lie as logging water that was not drunk.
      if (offlineNow()) return { key, previous: undefined };
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<LocalInv[]>(key);
      if (previous) {
        const conflicts = equipped ? conflictingKeys(itemKey) : [];
        qc.setQueryData<LocalInv[]>(
          key,
          previous.map((r) =>
            r.item_key === itemKey
              ? { ...r, equipped }
              : conflicts.includes(r.item_key as ShopItemKey)
                ? { ...r, equipped: false }
                : r,
          ),
        );
      }
      return { key, previous };
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.previous) qc.setQueryData(ctx.key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['mascot_inventory', user?.id] }),
  });
}
