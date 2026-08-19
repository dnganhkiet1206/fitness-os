import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { localDateStr } from '@/lib/local-date';
import { LOGGED_DAY_FILTER, missedDates, streakFrom, STREAK_WINDOW, type Streak } from '@/lib/streak';
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

/**
 * The streak, and whether today is already in it.
 *
 * The counting is `lib/streak.ts`, shared with the medal engine — the two used
 * to have a copy each and had already drifted. Here is only the fetching, and
 * the reason `loggedToday` rides along: the dates are in hand, so answering
 * "is today safe" costs nothing, while deriving it elsewhere from `useDailyLog`
 * would be a second definition of a day counting.
 */
export interface StreakState extends Streak {
  /**
   * Every day with a row, newest first — the same array the count is derived
   * from, kept rather than discarded.
   *
   * ── why it rides along instead of being fetched again ──
   *
   * `lib/user-state.ts` answers "what kind of stretch is this person in", and
   * the only raw material it needs is this list. It was already read here (up
   * to `STREAK_WINDOW` rows), used for one number, and thrown away — so a
   * second consumer would otherwise have meant a second identical query, on
   * every screen that wanted to know.
   *
   * The rule `useKoaContext` is built on applies to the whole companion layer:
   * **the app's awareness of somebody must not cost the app requests.** Keeping
   * the array is the cheap side of that trade; re-fetching it would be the
   * expensive one.
   */
  loggedDates: string[];
  /** days already covered by a spent freeze */
  frozen: string[];
  /** days between the last logged day and today that nothing covers yet */
  missed: string[];
  /** unspent freezes in the drawer */
  held: number;
}

export function useDailyStreak() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['mascot_streak', user?.id, localDateStr()],
    enabled: !!user,
    /* Longer than the app's one-minute default on purpose: this reads up to 400
       rows and the answer changes at most a handful of times a day — and now
       that `today-keys` invalidates it at the exact moment it *does* change,
       polling it every minute of use buys nothing. */
    staleTime: 1000 * 60 * 10,
    queryFn: async (): Promise<StreakState> => {
      /* Both reads in one query function, because a streak computed from days
         without the freezes that cover them is simply a wrong number — and two
         separate queries would show it, briefly, every time one resolved
         first. */
      const [logs, freezes] = await Promise.all([
        supabase
          .from('daily_logs')
          .select('date')
          .eq('user_id', user!.id)
          /* Only days this person logged — see `LOGGED_DAY_FILTER`. Both
             readers of the streak have to ask the same question, and this file
             and `use-extras` have already drifted apart twice. */
          .or(LOGGED_DAY_FILTER)
          .order('date', { ascending: false })
          .limit(STREAK_WINDOW),
        supabase.from('streak_freezes').select('used_on').eq('user_id', user!.id),
      ]);
      if (logs.error) throw logs.error;

      /* ── the freeze read is allowed to fail, and the streak is not ──

         `streak_freezes` arrives with a migration, and migrations reach
         production later than app builds do. Between those two moments the
         table simply does not exist, and throwing here would take the **whole
         streak** down with it — a number that has worked for months, removed
         from the header of everybody's dashboard, to report the absence of a
         feature nobody has yet.

         This is the one place the app's "empty is not failed" rule bends, and
         it bends the safe way: an unreadable freeze list is read as *no
         freezes*, which is exactly what every account has today. The streak
         count keeps coming from `daily_logs`, whose error still propagates, so
         nothing about the number itself is being guessed. */
      const dates = (logs.data ?? []).map((d) => d.date);
      const rows = freezes.error ? [] : freezes.data ?? [];
      const frozen = rows.map((r) => r.used_on).filter((d): d is string => !!d);
      const held = rows.filter((r) => !r.used_on).length;
      const today = localDateStr();

      return {
        ...streakFrom(dates, today, frozen),
        loggedDates: dates,
        frozen,
        missed: missedDates(dates, today, frozen),
        held,
      };
    },
  });
}

/**
 * Buy one, at the price the server looks up.
 *
 * No amount and no price crosses the wire — see `buy_streak_freeze`. The
 * mutation is what the button disables on, which is also the only thing
 * standing between a double tap and two purchases; the database's hold limit is
 * what makes that merely annoying rather than expensive.
 */
export function useBuyFreeze() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('buy_streak_freeze');
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mascot_wallet', user?.id] });
      qc.invalidateQueries({ queryKey: ['mascot_streak', user?.id] });
    },
  });
}

/** Spend one on a day that would otherwise break the run. */
export function useSpendFreeze() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (date: string) => {
      const { data, error } = await supabase.rpc('use_streak_freeze', { p_date: date });
      if (error) throw error;
      return data as boolean;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mascot_streak', user?.id] }),
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
      /* Through the function, and the function names its own price.

         `mascot_transactions` has taken no client inserts since
         20260810120000 — a POST with `amount: 999999` unlocked the whole shop
         for one request. What that left behind was the *amount*: the RPC
         bounded it to 300 and never asked what the key was worth, so measured
         against a real cluster, `earn_mascot_coins('d:<today>:meal', 300)`
         wrote **300** for a quest the catalogue prices at 10 — and every
         ref_key was accepted, `d:…:ghost` and `""` included.

         `claim_quest_reward` takes the key alone and looks the price up in
         `reward_prices`, the same shape `buy_mascot_item` has always used for
         spending. See 20260819120000.

         `amount` stays in the variables and is **not sent**: the room floats
         the coins off the scene on success and needs a number to draw. It is a
         label now, not an instruction. */
      const { error } = await supabase.rpc('claim_quest_reward', {
        p_ref_key: refKey,
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
