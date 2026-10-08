#!/usr/bin/env node
/**
 * Tên + mô tả huy chương của app native = CHÍNH `AWARD_TEXT` trong
 * `native/src/lib/gamification-i18n.ts` (#527 — màn Huy chương). Chép máy vào
 * `ASCND/Resources/award-text.json`, không chép tay sang xcstrings.
 *
 *   node --experimental-strip-types apps/ios/tools/award-text/gen.mjs          # ghi lại tệp
 *   node --experimental-strip-types apps/ios/tools/award-text/gen.mjs --check  # đỏ nếu lệch RN
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const OUT = new URL('apps/ios/ASCND/Resources/award-text.json', ROOT);
const { AWARD_TEXT } = await import(new URL('native/src/lib/gamification-i18n.ts', ROOT).href);

const awards = {};
for (const key of Object.keys(AWARD_TEXT).sort()) {
  const { title, desc } = AWARD_TEXT[key];
  awards[key] = {
    title: { vi: title.vi, en: title.en, es: title.es },
    desc: { vi: desc.vi, en: desc.en, es: desc.es },
  };
}
const text = JSON.stringify(
  { source: 'native/src/lib/gamification-i18n.ts AWARD_TEXT — sinh bằng apps/ios/tools/award-text/gen.mjs, đừng sửa tay', awards },
  null,
  1,
) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== text) {
    console.error('award-text.json lệch native/src/lib/gamification-i18n.ts — chạy lại gen.mjs (không sửa tay)');
    process.exit(1);
  }
  console.log(`award-text.json khớp RN (${Object.keys(awards).length} huy chương, vi/en/es)`);
} else {
  writeFileSync(OUT, text);
  console.log(`đã ghi ${OUT.pathname}`);
}
