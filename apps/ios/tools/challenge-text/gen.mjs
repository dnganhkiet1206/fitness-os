#!/usr/bin/env node
/**
 * Tên thử thách tuần của app native = CHÍNH `CHALLENGE_TEXT` trong
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

const titles = {};
for (const key of Object.keys(CHALLENGE_TEXT).sort()) {
  const t = CHALLENGE_TEXT[key].title;
  titles[key] = { vi: t.vi, en: t.en, es: t.es };
}
const text = JSON.stringify(
  { source: 'native/src/lib/gamification-i18n.ts CHALLENGE_TEXT — sinh bằng apps/ios/tools/challenge-text/gen.mjs, đừng sửa tay', titles },
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
