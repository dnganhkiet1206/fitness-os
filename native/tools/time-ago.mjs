/**
 * `timeAgo` (src/lib/time-ago.ts): "3 giờ trước" cho bài và bình luận cộng đồng.
 *
 * ── vì sao gate này tồn tại ──
 *
 * Viết tay bằng bốn chuỗi i18n chứ không bằng `Intl.RelativeTimeFormat`
 * (Hermes không bảo đảm có API ấy). Nghĩa là mỗi chuỗi là một hợp đồng:
 * `nCmMinAgo`/`nCmHourAgo`/`nCmDayAgo` PHẢI chứa `{n}` — không thì feed hiện
 * " phút trước" thiếu số, hoặc tệ hơn là "{n} phút trước" nguyên xi. Và
 * `nCmJustNow` KHÔNG được chứa `{n}`: `timeAgo` trả nó thẳng không replace.
 *
 * ── chạy thật ──
 *
 * Gate import từ điển thật (`native-strings.ts`) cho cả hai ngôn ngữ, và
 * chạy THẬT `timeAgo` qua các biên: 7 ngày (còn "N ngày trước"), 8 ngày (đổi
 * sang ngày tháng), tương lai (về "vừa xong", không số âm), ISO hỏng (chuỗi
 * rỗng chứ không phải "Invalid").
 *
 * `timeAgo` import `getLocale` từ `@/lib/i18n` — alias Node không giải được
 * nên gate dựng harness từ source thật, chỉ thay dòng import bằng stub có
 * đúng mapping đã kiểm (`vi → vi-VN`, `en → en-US`). Thân hàm chạy là thân
 * hàm thật, không copy lại logic.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* ── 1. từ điển thật: hợp đồng {n} ── */
const { nativeStrings } = await import(
  pathToFileURL(path.join(NATIVE, 'src/lib/native-strings.ts')).href
);
const WITH_N = ['nCmMinAgo', 'nCmHourAgo', 'nCmDayAgo'];
for (const lang of ['vi', 'en']) {
  const d = nativeStrings[lang];
  if (!d) {
    problems.push(`native-strings.ts: thiếu từ điển ${lang} — gate mù?`);
    continue;
  }
  for (const k of WITH_N) {
    if (typeof d[k] !== 'string' || !d[k].includes('{n}')) {
      problems.push(`native-strings ${lang}.${k} = ${JSON.stringify(d[k])} — thiếu {n}, feed sẽ hiện thiếu số`);
    }
  }
  if (typeof d.nCmJustNow !== 'string' || d.nCmJustNow.includes('{n}')) {
    problems.push(
      `native-strings ${lang}.nCmJustNow = ${JSON.stringify(d.nCmJustNow)} — timeAgo trả thẳng không replace, {n} sẽ hiện nguyên xi`,
    );
  }
}

/* ── 2. chạy thật timeAgo qua biên ── */
const src = readFileSync(path.join(NATIVE, 'src/lib/time-ago.ts'), 'utf8');
const harness = src.replace(
  /import\s*\{\s*getLocale\s*\}\s*from\s*['"]@\/lib\/i18n['"]\s*;/,
  `const getLocale = (lang) => ({ vi: 'vi-VN', en: 'en-US' })[lang] ?? 'en-US'; // stub đúng mapping thật của lib/i18n.ts`,
);
if (harness === src) {
  problems.push('src/lib/time-ago.ts: không tìm thấy dòng import getLocale — harness mù?');
}
const harnessPath = path.join(os.tmpdir(), 'ascnd-time-ago-harness.ts');
writeFileSync(harnessPath, harness);
const { timeAgo } = await import(pathToFileURL(harnessPath).href);
if (typeof timeAgo !== 'function') {
  console.error('time-ago HỎNG\n  - harness không export timeAgo — gate mù?');
  process.exit(1);
}

const NOW = new Date('2026-10-02T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();
const cases = [
  // [đầu vào, lang, kỳ vọng, vì sao]
  [ago(0), 'vi', 'vừa xong', 'ngay bây giờ'],
  [ago(30_000), 'en', 'just now', 'dưới 1 phút'],
  [ago(60_000), 'vi', '1 phút trước', 'đúng 1 phút'],
  [ago(59 * 60_000), 'en', '59m ago', 'sát biên giờ'],
  [ago(60 * 60_000), 'vi', '1 giờ trước', 'đúng 1 giờ'],
  [ago(23 * 3600_000), 'en', '23h ago', 'sát biên ngày'],
  [ago(24 * 3600_000), 'vi', '1 ngày trước', 'đúng 1 ngày'],
  [ago(7 * 86400_000), 'en', '7d ago', 'biên 7 ngày: còn "N ngày trước"'],
  [ago(8 * 86400_000), 'vi', null, 'biên 8 ngày: đổi sang ngày tháng'],
  [ago(30 * 86400_000), 'en', null, 'xa: ngày tháng, không "30d ago"'],
  [new Date(NOW + 3600_000).toISOString(), 'vi', 'vừa xong', 'tương lai: không số âm'],
  ['không-phải-ngày', 'vi', '', 'ISO hỏng: chuỗi rỗng, không "Invalid"'],
  ['', 'en', '', 'ISO rỗng: chuỗi rỗng'],
];
let behavior = 0;
for (const [iso, lang, want, why] of cases) {
  behavior++;
  const got = timeAgo(iso, nativeStrings[lang], lang, NOW);
  if (want === null) {
    if (!got || got.includes('{n}') || /ngày trước|d ago/.test(got)) {
      problems.push(`timeAgo(${why}): được ${JSON.stringify(got)} — quá 7 ngày phải là ngày tháng`);
    }
  } else if (got !== want) {
    problems.push(`timeAgo(${why}, ${lang}): được ${JSON.stringify(got)}, muốn ${JSON.stringify(want)}`);
  }
  if (got.includes('{n}')) problems.push(`timeAgo(${why}): còn {n} chưa thay — ${JSON.stringify(got)}`);
}

if (problems.length) {
  console.error(`time-ago HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `time-ago OK — hợp đồng {n} của 4 chuỗi × 2 ngôn ngữ xanh, timeAgo thật qua ${behavior} ca biên (7/8 ngày, tương lai, ISO hỏng)`,
);
