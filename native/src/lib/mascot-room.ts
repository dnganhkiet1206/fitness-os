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

export const questRefKey = (dateStr: string, key: QuestKey) => `d:${dateStr}:${key}`;
export const weeklyRefKey = (weekStart: string, challengeKey: string) => `w:${weekStart}:${challengeKey}`;
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
  | 'wall_frames';

export interface ShopItem {
  key: ShopItemKey;
  type: 'outfit' | 'gym' | 'upgrade';
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
  // Gym gear — placed in the room
  { key: 'yoga_mat', type: 'gym', price: 80, name: { vi: 'Thảm tập', en: 'Yoga mat' } },
  { key: 'kettlebell', type: 'gym', price: 100, name: { vi: 'Tạ ấm', en: 'Kettlebell' } },
  { key: 'barbell', type: 'gym', price: 180, name: { vi: 'Đòn tạ', en: 'Barbell' } },
  { key: 'dumbbell_rack', type: 'gym', price: 220, name: { vi: 'Giá tạ đơn', en: 'Dumbbell rack' } },
  { key: 'bench', type: 'gym', price: 240, name: { vi: 'Ghế đẩy tạ', en: 'Weight bench' } },
  { key: 'punching_bag', type: 'gym', price: 320, name: { vi: 'Bao cát', en: 'Punching bag' } },
  { key: 'treadmill', type: 'gym', price: 480, name: { vi: 'Máy chạy bộ', en: 'Treadmill' } },
  { key: 'plant', type: 'gym', price: 120, name: { vi: 'Cây xanh', en: 'Plant' } },
  { key: 'mirror', type: 'gym', price: 260, name: { vi: 'Gương tập', en: 'Gym mirror' } },
  { key: 'neon_sign', type: 'gym', price: 400, name: { vi: 'Đèn neon ASCND', en: 'ASCND neon sign' } },
  // Room upgrades — permanently change the scene (floor_neon > floor_wood)
  { key: 'floor_wood', type: 'upgrade', price: 250, name: { vi: 'Sàn gỗ', en: 'Wooden floor' } },
  { key: 'wall_led', type: 'upgrade', price: 300, name: { vi: 'Dải đèn LED', en: 'LED strip' } },
  { key: 'wall_frames', type: 'upgrade', price: 350, name: { vi: 'Tranh động lực', en: 'Motivation frames' } },
  { key: 'floor_neon', type: 'upgrade', price: 550, name: { vi: 'Sàn neon pro', en: 'Pro neon floor' } },
];

export const getShopItem = (key: string): ShopItem | undefined =>
  SHOP_ITEMS.find((i) => i.key === key);
