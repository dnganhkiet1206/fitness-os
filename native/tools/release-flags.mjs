/**
 * Cờ TEST_* trong `src/lib/dev-flags.ts` không được còn bật khi đóng bản release.
 *
 * ── vì sao gate này tồn tại ──
 *
 * `TEST_UNLOCK_ALL` tắt toàn bộ kinh tế của app khi còn bật: mọi mascot mở
 * khoá (kể cả bản pro), đồ trong shop miễn phí, celebration mở khoá bị nuốt.
 * Một bản build lên tay người dùng mà cờ này còn `true` là một bản release
 * tặng miễn phí toàn bộ nội dung trả phí — không crash, không test nào đỏ,
 * chỉ có doanh thu bay.
 *
 * ── vì sao gate chỉ chặn ở chế độ release ──
 *
 * Trên nhánh dev cờ này CỐ Ý bật: `tools/live.mjs` và các cổng kinh tế đo với
 * cờ bật (`live.mjs:4337` — "Bản dựng đang bật TEST_UNLOCK_ALL"). Tắt cờ trên
 * dev là một quyết định của chủ dự án, không phải của cổng. Nên:
 *
 *   - `node tools/release-flags.mjs`                    → luôn xanh trên dev,
 *     chỉ liệt kê cờ nào đang bật để ai đọc log cũng thấy.
 *   - `ASCND_RELEASE=1 node tools/release-flags.mjs`    → đỏ (exit 1) nếu bất
 *     kỳ `TEST_*` nào còn `true`. Chạy trước mọi bước đóng bản release.
 *   - `node tools/release-flags.mjs --release`          → tương đương.
 *
 * Parser đọc file thật bằng regex (bóc comment trước). Nếu không tìm thấy
 * một `export const TEST_*` nào, gate đỏ: nghĩa là parser mù, không phải
 * "không còn cờ nào" — một gate không nhìn thấy gì là gate hỏng.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const raw = readFileSync(path.join(NATIVE, 'src/lib/dev-flags.ts'), 'utf8');
/** Bóc chú thích, giữ nguyên độ dài (#164). */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, (c, p) => p + ' '.repeat(c.length - p.length));

const flags = [...code.matchAll(/export\s+const\s+(TEST_\w+)\s*=\s*(true|false)/g)].map(
  (m) => ({ name: m[1], on: m[2] === 'true' }),
);

const releaseMode = process.env.ASCND_RELEASE === '1' || process.argv.includes('--release');

if (flags.length === 0) {
  console.error(
    'cờ release HỎNG\n  - không tìm thấy export const TEST_* nào trong src/lib/dev-flags.ts — parser mù?',
  );
  process.exit(1);
}

const on = flags.filter((f) => f.on);
const state = flags.map((f) => `${f.name}=${f.on ? 'true' : 'false'}`).join(', ');

if (releaseMode && on.length > 0) {
  console.error(
    `cờ release HỎNG\n` +
      on.map((f) => `  - ${f.name} còn true — tắt trước khi đóng bản release (${state})`).join('\n'),
  );
  process.exit(1);
}

console.log(
  `cờ release OK — ${flags.length} cờ TEST_* (${state}); ` +
    (releaseMode
      ? 'chế độ release: mọi cờ đã tắt'
      : 'chế độ dev: đang liệt kê, không chặn (chạy với ASCND_RELEASE=1 để chặn)'),
);
