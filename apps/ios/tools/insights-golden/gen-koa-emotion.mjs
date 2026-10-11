#!/usr/bin/env node
/**
 * Golden cho Koa K4 (#527): `koaStateFor` (`lib/koa-emotion.ts`, biên dịch) và
 * `wornFrom` (`components/ascnd/mascot-figure.tsx`, chép NGUYÊN VĂN dưới đây)
 * trên `getShopItem` biên dịch của `lib/mascot-room.ts` @ fac9ac2.
 *
 * Chạy: sh build.sh && node gen-koa-emotion.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/koa-emotion-golden.json
 */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { koaStateFor } = require('./out/koa-emotion.js');
const { getShopItem, SHOP_ITEMS } = require('./out/mascot-room.js');

/* mascot-figure.tsx — nguyên văn */
function wornFrom(equipped) {
  if (!equipped) return {};
  const worn = {};
  for (const key of equipped) {
    const item = getShopItem(key);
    if (item?.type === 'outfit' && item.slot && item.koaId) {
      worn[item.slot] = item.koaId;
    }
  }
  return worn;
}

const EMOTIONS = ['idle', 'happy', 'sad', 'tired', 'sleep', 'celebrate', 'curl', 'wave', 'worry', 'proud', 'rested', 'oops', 'run', 'hat', 'coat', 'nope', ''];
const states = EMOTIONS.map((e) => ({ e, s: koaStateFor(e) }));

let seed = 527;
const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
const keys = SHOP_ITEMS.map((i) => i.key).concat(['streak_freeze', 'nope', 'hat_beanie', '']);
const worn = [];
for (let i = 0; i < 120; i++) {
  const eq = [];
  const n = rnd(9);
  for (let j = 0; j < n; j++) eq.push(keys[rnd(keys.length)]);
  worn.push({ equipped: [...new Set(eq)], worn: wornFrom(new Set(eq)) });
}
// `DEV_EMOTIONS` (`lib/mascot-emotion.ts`) — chép nguyên văn
const dev = ['idle', 'happy', 'sad', 'tired', 'sleep', 'celebrate', 'curl', 'wave', 'run'];
process.stdout.write(JSON.stringify({ states, worn, dev }) + '\n');
