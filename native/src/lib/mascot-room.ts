import type { AppLang } from './i18n';

/**
 * Mascot room economy catalog: daily quests that pay coins, and the shop
 * of outfits (worn by the mascot) + gym gear (placed in the room scene).
 * Structure only — everything renders code-drawn (SVG) in mascot-scene.
 */

// ─── Quests ────────────────────────────────────────────────────────────

export type QuestKey = 'meal' | 'workout' | 'water' | 'sleep' | 'steps';

export interface QuestDef {
  key: QuestKey;
  coins: number;
  /** Buddy XP granted alongside the coins (XP is never spendable) */
  xp: number;
  name: Record<AppLang, string>;
}

export const DAILY_QUESTS: QuestDef[] = [
  { key: 'meal', coins: 10, xp: 10, name: { vi: 'Ghi 1 bữa ăn', en: 'Log a meal' } },
  { key: 'workout', coins: 25, xp: 30, name: { vi: 'Hoàn thành 1 buổi tập', en: 'Complete a workout' } },
  { key: 'water', coins: 15, xp: 15, name: { vi: 'Đạt mục tiêu nước', en: 'Hit your water target' } },
  { key: 'sleep', coins: 15, xp: 15, name: { vi: 'Ghi giấc ngủ', en: 'Log your sleep' } },
  { key: 'steps', coins: 10, xp: 12, name: { vi: 'Đi 5.000 bước', en: 'Walk 5,000 steps' } },
];

/** Coins/XP for each completed weekly challenge (claimed on the room page) */
export const WEEKLY_BONUS_COINS = 40;
export const WEEKLY_BONUS_XP = 40;

/** Daily streak bonus: grows with the streak, capped so it stays a treat */
export const streakCoins = (streak: number) => Math.min(5 + streak * 2, 25);
export const STREAK_XP = 15;

/**
 * Buddy XP is derived from the claim ledger, not stored: every claimed
 * ref_key maps back to the XP its quest grants. Purchases (buy:*) grant
 * none, so spending coins never lowers the level.
 */
export const xpForRefKey = (refKey: string): number => {
  if (refKey.startsWith('w:')) return WEEKLY_BONUS_XP;
  const m = refKey.match(/^d:\d{4}-\d{2}-\d{2}:(.+)$/);
  if (!m) return 0;
  if (m[1] === 'streak') return STREAK_XP;
  return DAILY_QUESTS.find((q) => q.key === m[1])?.xp ?? 0;
};

export const LEVEL_XP = 120;
export const levelFromXp = (xp: number) => Math.floor(xp / LEVEL_XP) + 1;

// ─── Rank ladder ─────────────────────────────────────────────────────────
// Levels alone are a flat number; ranks give the climb an identity and a
// next thing to chase. Each rank re-skins the buddy's badge + level card.

export interface RankDef {
  key: string;
  /** First level that belongs to this rank */
  minLevel: number;
  name: Record<AppLang, string>;
  /** Accent used for the badge / progress on the level card */
  color: string;
}

export const RANKS: RankDef[] = [
  { key: 'rookie', minLevel: 1, name: { vi: 'Tập sự', en: 'Rookie' }, color: '#8b93a4' },
  { key: 'active', minLevel: 5, name: { vi: 'Năng động', en: 'Active' }, color: '#20b684' },
  { key: 'prime', minLevel: 10, name: { vi: 'Sung sức', en: 'Prime' }, color: '#3e86ea' },
  { key: 'peak', minLevel: 20, name: { vi: 'Đỉnh cao', en: 'Peak' }, color: '#b07de0' },
  { key: 'apex', minLevel: 35, name: { vi: 'Tối thượng', en: 'Apex' }, color: '#e08a3a' },
  { key: 'legend', minLevel: 55, name: { vi: 'Huyền thoại', en: 'Legend' }, color: '#e8ba30' },
];

/** Highest rank whose minLevel the buddy has reached */
export const rankForLevel = (level: number): RankDef => {
  let out = RANKS[0];
  for (const r of RANKS) if (level >= r.minLevel) out = r;
  return out;
};

/** The rank being climbed toward, or null once at the top */
export const nextRank = (level: number): RankDef | null =>
  RANKS.find((r) => r.minLevel > level) ?? null;

// ─── Daily energy ─────────────────────────────────────────────────────────
// The five things a buddy "feeds" on each day. Energy is derived live from
// real logs (never from claims), so the character visibly mirrors the day.

export const ENERGY_SIGNALS: QuestKey[] = ['meal', 'workout', 'water', 'sleep', 'steps'];

export const questRefKey = (dateStr: string, key: QuestKey) => `d:${dateStr}:${key}`;
/**
 * The claim key for a weekly bonus.
 *
 * **The shape is `w:<challenge row id>`, and it cannot change.** These keys
 * are already written into `mascot_transactions` for real users, and the
 * claimed/not-claimed state of every weekly bonus is looked up by exact
 * string match — a new shape would show every past claim as unclaimed and let
 * it be claimed again.
 *
 * This used to read `(weekStart, challengeKey) => \`w:${weekStart}:${challengeKey}\``,
 * which is not what the screen writes and never was: nothing imported it,
 * and `mascot-room.tsx` built its own key inline. A helper describing a
 * format the database does not contain is worse than none — anyone who used
 * it to test `claimed.has(...)` would have got `false` for every row. The
 * screen calls this now, so the two cannot drift apart again.
 *
 * The row id is enough on its own: `weekly_challenges` rows are per user and
 * per week already, so the week is in the id rather than in the key.
 */
export const weeklyRefKey = (challengeId: string | number) => `w:${challengeId}`;
export const buyRefKey = (itemKey: string) => `buy:${itemKey}`;

// ─── Shop ──────────────────────────────────────────────────────────────

export type OutfitSlot = 'head' | 'eyes' | 'neck' | 'waist';

export type ShopItemKey =
  | 'headband'
  | 'cap'
  | 'sunglasses'
  | 'medal'
  | 'belt'
  | 'yoga_mat'
  | 'dumbbell_rack'
  | 'barbell'
  | 'kettlebell'
  | 'bench'
  | 'punching_bag'
  | 'treadmill'
  | 'mirror'
  | 'plant'
  | 'neon_sign'
  | 'floor_wood'
  | 'floor_neon'
  | 'wall_led'
  | 'wall_frames'
  | 'stage_night'
  | 'stage_sunset'
  | 'stage_champion';

export interface ShopItem {
  key: ShopItemKey;
  type: 'outfit' | 'gym' | 'upgrade' | 'stage';
  /** Outfits in the same slot are mutually exclusive when equipped */
  slot?: OutfitSlot;
  price: number;
  name: Record<AppLang, string>;
}

export const SHOP_ITEMS: ShopItem[] = [
  // Outfits — worn by the mascot
  { key: 'headband', type: 'outfit', slot: 'head', price: 100, name: { vi: 'Băng đô', en: 'Headband' } },
  { key: 'cap', type: 'outfit', slot: 'head', price: 200, name: { vi: 'Nón lưỡi trai', en: 'Cap' } },
  { key: 'sunglasses', type: 'outfit', slot: 'eyes', price: 150, name: { vi: 'Kính đen', en: 'Sunglasses' } },
  { key: 'medal', type: 'outfit', slot: 'neck', price: 300, name: { vi: 'Huy chương', en: 'Medal' } },
  { key: 'belt', type: 'outfit', slot: 'waist', price: 250, name: { vi: 'Đai lực sĩ', en: 'Lifting belt' } },
  // Stage skins — reskin the whole showcase behind the buddy. The highest
  // owned tier is applied automatically (aurora is the free default).
  { key: 'stage_night', type: 'stage', price: 300, name: { vi: 'Sân khấu Đêm', en: 'Night Stage' } },
  { key: 'stage_sunset', type: 'stage', price: 500, name: { vi: 'Sân khấu Hoàng hôn', en: 'Sunset Stage' } },
  { key: 'stage_champion', type: 'stage', price: 800, name: { vi: 'Sân khấu Vô địch', en: 'Champion Stage' } },
];

export const getShopItem = (key: string): ShopItem | undefined =>
  SHOP_ITEMS.find((i) => i.key === key);
