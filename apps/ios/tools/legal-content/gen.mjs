#!/usr/bin/env node
/**
 * Văn bản pháp lý của app native = CHÍNH `native/src/lib/legal-content.ts`
 * (#527 1.3, dùng lại cho 8.3). RN giữ nó thành dữ liệu có cấu trúc, không đi
 * qua `i18n.ts`; native giữ y như vậy trong `ASCND/Resources/legal-content.json`
 * thay vì chép tay sang xcstrings — một bản chép tay của văn bản pháp lý là
 * một bản sẽ lệch.
 *
 *   node --experimental-strip-types apps/ios/tools/legal-content/gen.mjs          # ghi lại tệp
 *   node --experimental-strip-types apps/ios/tools/legal-content/gen.mjs --check  # đỏ nếu lệch RN
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const OUT = new URL('apps/ios/ASCND/Resources/legal-content.json', ROOT);
const { getLegal } = await import(new URL('native/src/lib/legal-content.ts', ROOT).href);

const doc = {};
for (const lang of ['vi', 'en', 'es']) doc[lang] = getLegal(lang);
const text = JSON.stringify(
  { source: 'native/src/lib/legal-content.ts — sinh bằng apps/ios/tools/legal-content/gen.mjs, đừng sửa tay', ...doc },
  null,
  1,
) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== text) {
    console.error('legal-content.json lệch native/src/lib/legal-content.ts — chạy lại gen.mjs (không sửa tay)');
    process.exit(1);
  }
  console.log('legal-content.json khớp RN (vi/en/es)');
} else {
  writeFileSync(OUT, text);
  console.log(`đã ghi ${OUT.pathname}`);
}
