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
  // `ch:<tier>:<week>:<key>` — priced by the tier written into the key
  if (refKey.startsWith('ch:')) return CHALLENGE_REWARD[refKey.split(':')[1]]?.xp ?? 0;
  // a completed-collection reward — COLLECTIONS is defined lower in the file,
  // but this only reads it when called, long after the module has loaded
  if (refKey.startsWith('set:')) {
    return COLLECTIONS.find((c) => collectionRefKey(c.id) === refKey)?.rewardXp ?? 0;
  }
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
  { key: 'active', minLevel: 5, name: { vi: 'Năng động', en: 'Active' }, color: '#2bf5a8' },
  { key: 'prime', minLevel: 10, name: { vi: 'Sung sức', en: 'Prime' }, color: '#3ba6ff' },
  { key: 'peak', minLevel: 20, name: { vi: 'Đỉnh cao', en: 'Peak' }, color: '#b07de0' },
  { key: 'apex', minLevel: 35, name: { vi: 'Tối thượng', en: 'Apex' }, color: '#e08a3a' },
  { key: 'legend', minLevel: 55, name: { vi: 'Huyền thoại', en: 'Legend' }, color: '#ffd93d' },
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

/**
 * What finishing a weekly challenge is worth.
 *
 * It was worth nothing. A challenge fired a celebration, set `completed` and
 * paid no coins and no XP, while the daily quests beside it ran a closed loop
 * into the shop. Two reward systems, one of them ornamental — and the
 * ornamental one asks for the harder thing.
 *
 * ── the numbers, and how they were picked ──
 *
 * A challenge is roughly a week of holding a behaviour: five workouts, seven
 * nights logged, 50,000 steps. That is strictly harder than any daily quest,
 * whose best is 25 coins for one workout. So bronze pays about one workout,
 * gold about three.
 *
 * Measured against the whole economy rather than chosen by feel. A player
 * doing every daily quest and holding a full streak earns 700 a week; three
 * challenges add 155, which is +22%. The shop is 39 items and 8,530 coins, so
 * a perfect player goes from 12.2 weeks to 10.0 to own everything. The loop
 * keeps its length — that mattered more than the size of the reward, because
 * the shop running dry is the end of the loop, not the reward for finishing it.
 *
 * One table to change if the balance is wrong.
 */
export const CHALLENGE_REWARD: Record<string, { coins: number; xp: number }> = {
  bronze: { coins: 25, xp: 25 },
  silver: { coins: 50, xp: 50 },
  gold: { coins: 80, xp: 80 },
  platinum: { coins: 120, xp: 120 },
};

/**
 * The ledger key for a finished challenge.
 *
 * The tier is *in the key* rather than looked up, so `xpForRefKey` can price a
 * past claim without importing the challenge pool — which lives in a hook and
 * would drag React into this file. It also means a claim stays worth what it
 * was worth on the day it was earned, even if the table above changes later.
 */
export const challengeRefKey = (tier: string, weekStart: string, key: string) =>
  `ch:${tier}:${weekStart}:${key}`;

// ─── Shop ──────────────────────────────────────────────────────────────

/**
 * The outfit items are **Koa's own wardrobe** — the seven slots and their ten
 * ids each in `koa-flags.ts` (`KOA_ITEMS`), every one of which the figure
 * already draws. A shop outfit therefore names a `slot` and a `koaId`, and
 * wearing it is just `worn[slot] = koaId` (see `mascot-figure.tsx`): no lookup
 * table, and nothing sold that the character cannot show — which is what the
 * old `medal` / `belt` were, sitting in slots Koa does not have.
 *
 * The key is `<slot>_<id>`, so it is stable and readable and can never collide.
 */
export type OutfitSlot = 'head' | 'face' | 'top' | 'bottom' | 'shoes' | 'back' | 'hand'; // = KoaSlot

/** Freeform now — keys are `<slot>_<id>` for outfits and `stage_*` for stages. */
export type ShopItemKey = string;

/** Rarity, shown as a coloured border + badge. Also orders the grid. */
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';

export const RARITY: Record<Rarity, { name: Record<AppLang, string>; color: string; order: number }> = {
  common: { name: { vi: 'Phổ thông', en: 'Common' }, color: '#2bf5a8', order: 0 },
  rare: { name: { vi: 'Hiếm', en: 'Rare' }, color: '#3ba6ff', order: 1 },
  epic: { name: { vi: 'Sử thi', en: 'Epic' }, color: '#b07de0', order: 2 },
  legendary: { name: { vi: 'Huyền thoại', en: 'Legendary' }, color: '#ffd93d', order: 3 },
};

/**
 * The category tabs under "Trang phục" — the icon row.
 *
 * `head`/`face`/`body`/`gear` are an item's home tab, grouped by slot. `special`
 * is not a home — it is a **second** shelf a seasonal item also shows on (the
 * `special` flag), so a Santa hat lives under both Đầu and Đặc biệt rather than
 * being pulled out of its slot.
 */
export type ShopCategory = 'head' | 'face' | 'body' | 'gear' | 'special';

export interface ShopItem {
  key: ShopItemKey;
  type: 'outfit' | 'stage';
  /** Outfits in the same slot are mutually exclusive when equipped */
  slot?: OutfitSlot;
  /** the id within `KOA_ITEMS[slot]` this outfit puts on the character */
  koaId?: string;
  /** the item's home tab, by slot (outfits only): head / face / body / gear */
  category?: ShopCategory;
  /** also shows on the Đặc biệt tab — the seasonal / themed pieces */
  special?: boolean;
  rarity: Rarity;
  price: number;
  /** set it belongs to, if any — see `COLLECTIONS` */
  collection?: string;
  /** locked until the buddy reaches this level */
  unlockLevel?: number;
  name: Record<AppLang, string>;
}

/** shorthand so the catalogue below stays one line per item */
const o = (
  slot: OutfitSlot,
  koaId: string,
  category: ShopCategory,
  rarity: Rarity,
  price: number,
  vi: string,
  en: string,
  extra: { collection?: string; unlockLevel?: number; special?: boolean } = {},
): ShopItem => ({
  key: `${slot}_${koaId}`,
  type: 'outfit',
  slot,
  koaId,
  category,
  rarity,
  price,
  name: { vi, en },
  ...extra,
});

export const SHOP_ITEMS: ShopItem[] = [
  // ── Đầu (head) ──
  o('head', 'band', 'head', 'common', 80, 'Băng đô thể thao', 'Sport Headband'),
  o('head', 'cap', 'head', 'common', 100, 'Nón lưỡi trai', 'Baseball Cap'),
  o('head', 'beanie', 'head', 'rare', 150, 'Nón len', 'Knit Beanie'),
  o('head', 'phones', 'head', 'rare', 200, 'Tai nghe', 'Headphones', { collection: 'runner' }),
  // ── Mặt (face) ──
  o('face', 'shades', 'face', 'common', 60, 'Kính đen', 'Sunglasses'),
  o('face', 'goggles', 'face', 'common', 80, 'Kính bơi', 'Swim Goggles'),
  o('face', 'mask', 'face', 'common', 60, 'Khẩu trang', 'Face Mask'),
  o('face', 'heart', 'face', 'rare', 150, 'Kính trái tim', 'Heart Glasses'),
  o('face', 'vr', 'face', 'epic', 350, 'Kính VR', 'VR Headset'),
  // ── Thân (top / bottom / shoes) ──
  o('top', 'tank', 'body', 'common', 100, 'Áo tank top', 'Tank Top', { collection: 'gym' }),
  o('top', 'tee', 'body', 'common', 80, 'Áo thun', 'T-Shirt'),
  o('top', 'hoodie', 'body', 'rare', 180, 'Áo hoodie', 'Hoodie'),
  o('top', 'jersey', 'body', 'rare', 160, 'Áo bóng đá', 'Jersey', { collection: 'runner' }),
  o('bottom', 'short', 'body', 'common', 80, 'Quần short', 'Shorts', { collection: 'gym' }),
  o('bottom', 'jogger', 'body', 'common', 100, 'Quần jogger', 'Joggers'),
  o('bottom', 'legging', 'body', 'rare', 150, 'Quần legging', 'Leggings', { collection: 'runner' }),
  o('bottom', 'camo', 'body', 'rare', 160, 'Quần rằn ri', 'Camo Pants'),
  o('shoes', 'sneaker', 'body', 'common', 100, 'Giày sneaker', 'Sneakers', { collection: 'gym' }),
  o('shoes', 'runner', 'body', 'rare', 200, 'Giày chạy bộ', 'Running Shoes', { collection: 'runner' }),
  o('shoes', 'glow', 'body', 'epic', 350, 'Giày phát sáng', 'Glow Kicks'),
  o('shoes', 'wing', 'body', 'legendary', 650, 'Giày có cánh', 'Winged Boots', { unlockLevel: 15 }),
  // ── Phụ kiện (back / hand) ──
  o('back', 'backpack', 'gear', 'common', 100, 'Ba lô', 'Backpack'),
  o('back', 'hydro', 'gear', 'rare', 180, 'Túi nước', 'Hydration Pack', { collection: 'runner' }),
  o('back', 'cape', 'gear', 'epic', 400, 'Áo choàng', 'Hero Cape'),
  o('hand', 'bottle', 'gear', 'common', 60, 'Bình nước', 'Water Bottle'),
  o('hand', 'dumbbell', 'gear', 'common', 80, 'Tạ tay', 'Dumbbell', { collection: 'gym' }),
  o('hand', 'towel', 'gear', 'common', 60, 'Khăn tập', 'Gym Towel'),
  o('hand', 'rope', 'gear', 'rare', 140, 'Dây nhảy', 'Jump Rope'),
  o('hand', 'trophy', 'gear', 'epic', 400, 'Cúp vàng', 'Gold Trophy', { unlockLevel: 10 }),
  // ── Đặc biệt (seasonal / themed) — each keeps its slot home *and* the
  //    Special shelf (special: true), so a Santa hat is under Đầu too. ──
  o('head', 'santa', 'head', 'rare', 150, 'Nón Noel', 'Santa Hat', { collection: 'xmas', special: true }),
  o('top', 'xmas', 'body', 'rare', 180, 'Áo len Noel', 'Xmas Sweater', { collection: 'xmas', special: true }),
  o('head', 'khanxep', 'head', 'rare', 150, 'Khăn xếp', 'Tet Turban', { collection: 'tet', special: true }),
  o('top', 'aodai', 'body', 'epic', 350, 'Áo dài', 'Ao Dai', { collection: 'tet', special: true }),
  o('head', 'witch', 'head', 'rare', 160, 'Nón phù thủy', 'Witch Hat', { collection: 'halloween', special: true }),
  o('top', 'ghost', 'body', 'rare', 180, 'Áo choàng ma', 'Ghost Cloak', { collection: 'halloween', special: true }),
  o('back', 'dragonwing', 'gear', 'legendary', 800, 'Cánh Rồng', 'Dragon Wings', { unlockLevel: 20, special: true }),
  // ── Stage skins — reskin the whole showcase behind the buddy. One is active
  //    at a time, chosen from the shop; none equipped is the free default. See
  //    `conflictingKeys` / `activeStageKey`. ──
  { key: 'stage_night', type: 'stage', rarity: 'rare', price: 300, name: { vi: 'Sân khấu Đêm', en: 'Night Stage' } },
  { key: 'stage_sunset', type: 'stage', rarity: 'epic', price: 500, name: { vi: 'Sân khấu Hoàng hôn', en: 'Sunset Stage' } },
  { key: 'stage_champion', type: 'stage', rarity: 'legendary', price: 800, name: { vi: 'Sân khấu Vô địch', en: 'Champion Stage' } },
];

export const getShopItem = (key: string): ShopItem | undefined =>
  SHOP_ITEMS.find((i) => i.key === key);

/** Category tabs, in the order the icon row shows them (outfits only). */
export const SHOP_CATEGORIES: { id: ShopCategory; name: Record<AppLang, string> }[] = [
  { id: 'head', name: { vi: 'Đầu', en: 'Head' } },
  { id: 'face', name: { vi: 'Mặt', en: 'Face' } },
  { id: 'body', name: { vi: 'Thân', en: 'Body' } },
  { id: 'gear', name: { vi: 'Phụ kiện', en: 'Gear' } },
  { id: 'special', name: { vi: 'Đặc biệt', en: 'Special' } },
];

/**
 * A set of outfits; own them all and a one-off reward can be claimed
 * (ref_key `set:<id>`), which is what makes finishing a look worth it.
 */
export interface Collection {
  id: string;
  name: Record<AppLang, string>;
  itemKeys: string[];
  rewardCoins: number;
  rewardXp: number;
}

export const COLLECTIONS: Collection[] = [
  {
    id: 'gym',
    name: { vi: 'Bộ Gym', en: 'Gym Set' },
    itemKeys: ['head_band', 'top_tank', 'bottom_short', 'shoes_sneaker', 'hand_dumbbell'],
    rewardCoins: 120,
    rewardXp: 60,
  },
  {
    id: 'runner',
    name: { vi: 'Bộ Chạy Bộ', en: 'Runner Set' },
    itemKeys: ['head_phones', 'top_jersey', 'bottom_legging', 'shoes_runner', 'back_hydro'],
    rewardCoins: 180,
    rewardXp: 90,
  },
  {
    id: 'tet',
    name: { vi: 'Bộ Tết', en: 'Tet Set' },
    itemKeys: ['head_khanxep', 'top_aodai'],
    rewardCoins: 120,
    rewardXp: 60,
  },
  {
    id: 'xmas',
    name: { vi: 'Bộ Giáng Sinh', en: 'Christmas Set' },
    itemKeys: ['head_santa', 'top_xmas'],
    rewardCoins: 120,
    rewardXp: 60,
  },
  {
    id: 'halloween',
    name: { vi: 'Bộ Halloween', en: 'Halloween Set' },
    itemKeys: ['head_witch', 'top_ghost'],
    rewardCoins: 120,
    rewardXp: 60,
  },
];

export const collectionRefKey = (id: string) => `set:${id}`;

/** How many of a collection's items are owned, and whether it is complete. */
export const collectionProgress = (
  c: Collection,
  owned: Set<string>,
): { have: number; total: number; complete: boolean } => {
  const have = c.itemKeys.filter((k) => owned.has(k)).length;
  return { have, total: c.itemKeys.length, complete: have === c.itemKeys.length };
};

/**
 * The keys that must switch off when `key` is switched on.
 *
 * Two exclusion groups, derived from the catalogue rather than hand-listed so
 * they cannot drift as it grows: **one outfit per slot** (a second hat pushes
 * the first off), and **one stage at a time** (the room shows a single skin).
 * Anything with neither a slot nor the stage type conflicts with nothing.
 */
export const conflictingKeys = (key: string): ShopItemKey[] => {
  const item = getShopItem(key);
  if (!item) return [];
  if (item.type === 'stage') {
    return SHOP_ITEMS.filter((i) => i.type === 'stage' && i.key !== key).map((i) => i.key);
  }
  if (item.type === 'outfit' && item.slot) {
    return SHOP_ITEMS.filter(
      (i) => i.type === 'outfit' && i.slot === item.slot && i.key !== key,
    ).map((i) => i.key);
  }
  return [];
};

/**
 * Which stage skin the room should draw, from the equipped set — or `null` for
 * the free default.
 *
 * Once equipping enforces the one-stage rule this set holds at most one stage,
 * and the reduce is moot. It is a `reduce` on price rather than a `find` for
 * the transition only: a user who bought several stages under the old build
 * has them all flagged equipped, and picking the dearest keeps showing exactly
 * what they saw before until their first deliberate pick trims the set to one.
 */
export const activeStageKey = (equipped: Set<string>): ShopItemKey | null => {
  const stages = SHOP_ITEMS.filter((i) => i.type === 'stage' && equipped.has(i.key));
  if (stages.length === 0) return null;
  return stages.reduce((a, b) => (b.price > a.price ? b : a)).key;
};
