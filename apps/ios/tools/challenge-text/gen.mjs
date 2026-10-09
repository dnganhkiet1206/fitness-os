#!/usr/bin/env node
/**
 * Chữ thử thách tuần của app native (tên, mô tả, phần thưởng) = CHÍNH `CHALLENGE_TEXT` trong
 * `native/src/lib/gamification-i18n.ts` (#527 Phase 7 — thẻ "Thưởng thử thách
 * tuần" của phòng linh vật). Chép máy vào `ASCND/Resources/challenge-text.json`,
 * không chép tay sang xcstrings.
 *
 *   node --experimental-strip-types apps/ios/tools/challenge-text/gen.mjs          # ghi lại tệp
 *   node --experimental-strip-types apps/ios/tools/challenge-text/gen.mjs --check  # đỏ nếu lệch RN
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const OUT = new URL('apps/ios/ASCND/Resources/challenge-text.json', ROOT);
const { CHALLENGE_TEXT } = await import(new URL('native/src/lib/gamification-i18n.ts', ROOT).href);

// Tên (phòng linh vật), mô tả + tên phần thưởng (màn thử thách tuần, hàng
// gieo vào `weekly_challenges` ghi bản tiếng Anh như RN).
const pick = (t) => ({ vi: t.vi, en: t.en, es: t.es });
const titles = {};
const descs = {};
const rewards = {};
for (const key of Object.keys(CHALLENGE_TEXT).sort()) {
  const c = CHALLENGE_TEXT[key];
  titles[key] = pick(c.title);
  descs[key] = pick(c.desc);
  rewards[key] = pick(c.reward);
}
const text = JSON.stringify(
  {
    source: 'native/src/lib/gamification-i18n.ts CHALLENGE_TEXT — sinh bằng apps/ios/tools/challenge-text/gen.mjs, đừng sửa tay',
    titles,
    descs,
    rewards,
  },
  null,
  1,
) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== text) {
    console.error('challenge-text.json lệch native/src/lib/gamification-i18n.ts — chạy lại gen.mjs (không sửa tay)');
    process.exit(1);
  }
  console.log(`challenge-text.json khớp RN (${Object.keys(titles).length} thử thách, vi/en/es)`);
} else {
  writeFileSync(OUT, text);
  console.log(`đã ghi ${OUT.pathname}`);
}
