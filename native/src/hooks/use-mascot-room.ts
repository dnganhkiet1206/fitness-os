import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { buyRefKey, getShopItem, type ShopItem } from '@/lib/mascot-room';
import { useAuth } from './use-auth';

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
      const { data, error } = await supabase
        .from('mascot_transactions')
        .select('amount, ref_key')
        .eq('user_id', user!.id);
      if (error) throw error;
      const rows = data ?? [];
      return {
        balance: rows.reduce((s, r) => s + r.amount, 0),
        claimed: new Set(rows.map((r) => r.ref_key)),
      };
    },
  });
}

export function useMascotInventory() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_inventory', user?.id],
    enabled: !!user,
    queryFn: async () => {
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

/** Buy a shop item: inventory row first (unique blocks re-buys), then the
 *  spend row. Outfits auto-equip on purchase. */
export function useBuyItem() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (item: ShopItem) => {
      const { error: invError } = await supabase.from('mascot_inventory').insert({
        user_id: user!.id,
        item_key: item.key,
        equipped: item.type === 'outfit',
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
  const sameSlotKeys = (['headband', 'cap', 'sunglasses', 'medal', 'belt'] as const).filter(
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
      const { error } = await supabase
        .from('mascot_inventory')
        .update({ equipped })
        .eq('user_id', user!.id)
        .eq('item_key', itemKey);
      if (error) throw error;
      const item = getShopItem(itemKey);
      if (equipped && item?.slot) await unequipSameSlot(user!.id, itemKey, item.slot);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mascot_inventory', user?.id] }),
  });
}
