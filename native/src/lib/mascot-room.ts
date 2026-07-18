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
  name: Record<AppLang, string>;
}

export const DAILY_QUESTS: QuestDef[] = [
  { key: 'meal', coins: 10, name: { vi: 'Ghi 1 bữa ăn', en: 'Log a meal' } },
  { key: 'workout', coins: 25, name: { vi: 'Hoàn thành 1 buổi tập', en: 'Complete a workout' } },
  { key: 'water', coins: 15, name: { vi: 'Đạt mục tiêu nước', en: 'Hit your water target' } },
  { key: 'sleep', coins: 15, name: { vi: 'Ghi giấc ngủ', en: 'Log your sleep' } },
  { key: 'steps', coins: 10, name: { vi: 'Đi 5.000 bước', en: 'Walk 5,000 steps' } },
];

/** Coins for each completed weekly challenge (claimed on the room page) */
export const WEEKLY_BONUS_COINS = 40;

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
  | 'mirror'
  | 'plant'
  | 'neon_sign';

export interface ShopItem {
  key: ShopItemKey;
  type: 'outfit' | 'gym';
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
  { key: 'barbell', type: 'gym', price: 180, name: { vi: 'Đòn tạ', en: 'Barbell' } },
  { key: 'dumbbell_rack', type: 'gym', price: 220, name: { vi: 'Giá tạ đơn', en: 'Dumbbell rack' } },
  { key: 'plant', type: 'gym', price: 120, name: { vi: 'Cây xanh', en: 'Plant' } },
  { key: 'mirror', type: 'gym', price: 260, name: { vi: 'Gương tập', en: 'Gym mirror' } },
  { key: 'neon_sign', type: 'gym', price: 400, name: { vi: 'Đèn neon ASCND', en: 'ASCND neon sign' } },
];

export const getShopItem = (key: string): ShopItem | undefined =>
  SHOP_ITEMS.find((i) => i.key === key);
