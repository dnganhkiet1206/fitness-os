#!/usr/bin/env node
/**
 * Golden cho cửa hàng Koa (#527) — `lib/mascot-room.ts` + `app/shop.tsx` @ fac9ac2.
 *
 * `SHOP_ITEMS`, `RARITY`, `SHOP_CATEGORIES`, `COLLECTIONS`, `CONSUMABLES`,
 * `conflictingKeys`, `wearGroup`, `activeStageKey`, `collectionProgress`,
 * `levelFromXp` là mã RN biên dịch (`build.sh`). Phần lọc / sắp lưới của màn
 * không export: chép NGUYÊN VĂN `inCategory` + `items` (`shop.tsx:146-160`) và
 * hai lần chặn của `buyItem` (`:213-226`).
 *
 *   node gen-shop.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/shop-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const M = require('./out/mascot-room.js');

let seed = 7311;
const rnd = (n) => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return Math.floor(seed / 65536) % n;
};

const keys = M.SHOP_ITEMS.map((i) => i.key);

// shop.tsx:146-160
function gridItems(tab, cat, owned) {
  const inCategory = (it) => cat === 'all' || (cat === 'special' ? !!it.special : it.category === cat);
  return M.SHOP_ITEMS.filter((it) =>
    tab === 'closet'
      ? it.type === 'outfit' && owned.has(it.key) && inCategory(it)
      : it.type === tab && (tab !== 'outfit' || inCategory(it)),
  )
    .sort((a, b) => M.RARITY[a.rarity].order - M.RARITY[b.rarity].order || a.price - b.price)
    .map((i) => i.key);
}

// shop.tsx:213-226 — trước khi gọi RPC (bỏ TEST_UNLOCK_ALL, offline riêng)
function buyGate(item, level, balance) {
  if (item.unlockLevel && level < item.unlockLevel) return 'locked';
  if (balance < item.price) return 'poor';
  return 'ok';
}

const tabs = ['stage', 'outfit', 'closet'];
const cats = ['all', ...M.SHOP_CATEGORIES.map((c) => c.id)];
const states = [];
for (let i = 0; i < 120; i++) {
  const owned = new Set(keys.filter(() => rnd(3) === 0));
  const equipped = new Set([...owned].filter(() => rnd(2) === 0));
  const xp = [0, 119, 120, 1079, 1080, 1199, 1680, 2280, 2400, 5000][rnd(10)];
  const balance = [0, 59, 60, 150, 199, 400, 650, 799, 800, 5000][rnd(10)];
  const level = M.levelFromXp(xp);
  const grids = {};
  for (const t of tabs) for (const c of t === 'stage' ? ['all'] : cats) grids[`${t}/${c}`] = gridItems(t, c, owned);
  states.push({
    owned: [...owned],
    equipped: [...equipped],
    xp,
    level,
    balance,
    activeStage: M.activeStageKey(equipped),
    grids,
    collections: M.COLLECTIONS.map((c) => M.collectionProgress(c, owned)),
    gates: Object.fromEntries(M.SHOP_ITEMS.map((it) => [it.key, buyGate(it, level, balance)])),
  });
}

process.stdout.write(
  JSON.stringify(
    {
      items: M.SHOP_ITEMS,
      consumables: M.CONSUMABLES,
      rarity: M.RARITY,
      categories: M.SHOP_CATEGORIES,
      collections: M.COLLECTIONS,
      conflicts: Object.fromEntries([...keys, 'streak_freeze', 'nope'].map((k) => [k, M.conflictingKeys(k)])),
      groups: Object.fromEntries([...keys, 'streak_freeze', 'nope'].map((k) => [k, M.wearGroup(k)])),
      states,
    },
    null,
    1,
  ) + '\n',
);
