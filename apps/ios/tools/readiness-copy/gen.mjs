#!/usr/bin/env node
/**
 * Câu chữ của thẻ sẵn sàng (#527 Phase 4/9) = CHÍNH `native/src/lib/readiness-i18n.ts`
 * — lời khuyên theo `readiness_recommendation` (`READINESS_RECO`) và nhãn / mức
 * của từng chiều trong `readiness_explain`. Chép máy vào
 * `ASCND/Resources/readiness-copy.json`, không chép tay sang xcstrings.
 *
 * Nhãn và mức không được export ở RN, nên đọc ra qua CHÍNH `readinessExplainText`
 * trên một token một chiều ở ba mức (10 / 50 / 90 → low / mid / high).
 *
 *   node --experimental-strip-types apps/ios/tools/readiness-copy/gen.mjs          # ghi lại tệp
 *   node --experimental-strip-types apps/ios/tools/readiness-copy/gen.mjs --check  # đỏ nếu lệch RN
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const OUT = new URL('apps/ios/ASCND/Resources/readiness-copy.json', ROOT);
const R = await import(new URL('native/src/lib/readiness-i18n.ts', ROOT).href);
const LANGS = ['vi', 'en', 'es'];

const reco = {};
for (const key of Object.keys(R.READINESS_RECO).sort()) {
  reco[key] = Object.fromEntries(LANGS.map((l) => [l, R.READINESS_RECO[key][l]]));
}
const factors = {};
for (const key of ['hrv', 'rhr', 'sleep', 'load']) {
  const f = { label: {}, low: {}, mid: {}, high: {} };
  for (const lang of LANGS) {
    for (const [bucket, score] of [['low', 10], ['mid', 50], ['high', 90]]) {
      const text = R.readinessExplainText(`${key}:${score}`, lang); // "Label: impact (score)"
      const m = /^(.*): (.*) \((\d+)\)$/.exec(text);
      if (!m || m[3] !== String(score)) throw new Error(`unexpected explain text: ${text}`);
      f.label[lang] = m[1];
      f[bucket][lang] = m[2];
    }
  }
  factors[key] = f;
}
const text = JSON.stringify(
  { source: 'native/src/lib/readiness-i18n.ts — sinh bằng apps/ios/tools/readiness-copy/gen.mjs, đừng sửa tay', reco, factors },
  null,
  1,
) + '\n';

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(OUT, 'utf8');
  } catch {}
  if (current !== text) {
    console.error('readiness-copy.json lệch native/src/lib/readiness-i18n.ts — chạy lại gen.mjs (không sửa tay)');
    process.exit(1);
  }
  console.log(`readiness-copy.json khớp RN (${Object.keys(reco).length} lời khuyên, 4 chiều, vi/en/es)`);
} else {
  writeFileSync(OUT, text);
  console.log(`đã ghi ${OUT.pathname}`);
}
