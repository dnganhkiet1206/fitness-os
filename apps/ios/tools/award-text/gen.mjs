#!/usr/bin/env node
/**
 * Tên + mô tả huy chương của app native = CHÍNH `AWARD_TEXT` trong
 * `native/src/lib/gamification-i18n.ts` (#527 — màn Huy chương). Chép máy vào
 * `ASCND/Resources/award-text.json`, không chép tay sang xcstrings.
 *
 *   node --experimental-strip-types apps/ios/tools/award-text/gen.mjs          # ghi lại tệp
 *   node --experimental-strip-types apps/ios/tools/award-text/gen.mjs --check  # đỏ nếu lệch RN (chạy trong native/tools/check.mjs)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = new URL('../../../../', import.meta.url);
const OUT = new URL('apps/ios/ASCND/Resources/award-text.json', ROOT);
const { AWARD_TEXT } = await import(new URL('native/src/lib/gamification-i18n.ts', ROOT).href);

/**
 * Chỗ app cố ý khác RN, có lý do (sinh lại không làm mất).
 * - `workouts_100` tiếng Việt: RN để "Centurion" (tiếng Anh) trong bản tiếng Việt → "100 Buổi Tập"
 *   (đợt soát giao diện 01/11, 5b75b9fe; trước 04/11 sửa tay trong tệp JSON nên `--check` đỏ).
 * - `steps_10k` tiếng Việt: RN để "10K Steps" (tiếng Anh) → "10K Bước", như "Hai Vạn Bước" (04/11).
 */
const OVERRIDES = {
  steps_10k: { title: { vi: '10K Bước' } },
  workouts_100: { title: { vi: '100 Buổi Tập' } },
};

/**
 * Tên tiếng Việt và tiếng Tây Ban Nha viết hoa chữ đầu câu như phần còn lại của app ("Huy chương",
 * "Tập luyện"); RN viết hoa từng chữ (04/11, #802, Kiệt giao E quyết). Tiếng Anh giữ Title Case như RN.
 * Từ viết tắt hay có số ("PR", "10K", "5x") giữ nguyên.
 */
const sentence = (s) =>
  s
    .split(' ')
    .map((w, i) => (i === 0 || /\d/.test(w) || w === w.toUpperCase() ? w : w.charAt(0).toLocaleLowerCase() + w.slice(1)))
    .join(' ');

const awards = {};
for (const key of Object.keys(AWARD_TEXT).sort()) {
  const { desc } = AWARD_TEXT[key];
  const title = { ...AWARD_TEXT[key].title, ...(OVERRIDES[key]?.title ?? {}) };
  awards[key] = {
    title: { vi: sentence(title.vi), en: title.en, es: sentence(title.es) },
    desc: { vi: desc.vi, en: desc.en, es: desc.es },
  };
}
const text = JSON.stringify(
  { source: 'native/src/lib/gamification-i18n.ts AWARD_TEXT — sinh bằng apps/ios/tools/award-text/gen.mjs (tên vi/es viết hoa chữ đầu câu, ngoại lệ ghi trong gen.mjs), đừng sửa tay', awards },
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
