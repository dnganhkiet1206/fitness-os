/**
 * Ghim khoá phiên bản của `src/lib/widget-heights.ts` (mirror `tools/cache-shape.mjs`).
 *
 * ── vì sao ──
 *
 * Chiều cao widget được persist (`ascnd-widget-heights-v2`) sống sót qua cập
 * nhật app. Đổi hình dạng của thứ được lưu — ngưỡng lọc (`v > 20 && v < 2000`),
 * chiều cao fallback, key của hero deck — mà không đổi khoá thì số cũ đội
 * lốt số mới: máy người dùng giữ khung đo sai và không có cách nào tự dọn
 * ngoài gỡ app. Nghĩa vụ này đã ghi trong comment ở widget-heights.ts:54
 * ("đổi hình dạng của thứ được lưu thì phải đổi khoá").
 *
 * ── luật, mirror cache-shape ──
 *
 * Ghim hai thứ vào `PINNED`:
 *   - `key`: giá trị `STORAGE_KEY` phải đúng;
 *   - `shape`: sha256 của mô tả chuẩn hoá (fallback, hero key, ngưỡng lọc).
 *
 * Đổi hình dạng mà không bump khoá → `shape` lệch → ĐỎ. Bump khoá mà không
 * cập nhật ghim → `key` lệch → ĐỎ. Hai thao tác buộc đi cùng một commit nên
 * không trôi khỏi nhau. Luật KHÔNG tự bump hộ: bump vứt số đo của mọi người
 * dùng, đó là một quyết định, và cái đỏ là chỗ người viết được hỏi.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const PINNED = {
  file: 'src/lib/widget-heights.ts',
  key: 'ascnd-widget-heights-v2',
  /* sha256 của "fallback=104;hero=hero-deck;min=20;max=2000" */
  shape: 'ba3281ac26e42f73ef812621ce85e4f559a95f6467fd99db17ef5b9fd11ca849',
};

const problems = [];
const src = readFileSync(path.join(NATIVE, PINNED.file), 'utf8');

const key = src.match(/const STORAGE_KEY\s*=\s*'([^']+)'/)?.[1];
if (key !== PINNED.key) {
  problems.push(
    `${PINNED.file}: STORAGE_KEY = ${JSON.stringify(key)}, ghim ${JSON.stringify(PINNED.key)} — ` +
      `bump khoá thì cập nhật PINNED.key ở tools/widget-height-version.mjs trong cùng commit`,
  );
}

const fallback = src.match(/FALLBACK_HEIGHT\s*=\s*(\d+)/)?.[1];
const hero = src.match(/HERO_DECK\s*=\s*'([^']+)'/)?.[1];
const bounds = src.match(/v\s*>\s*(\d+)\s*&&\s*v\s*<\s*(\d+)/);
const shapeDesc =
  fallback && hero && bounds ? `fallback=${fallback};hero=${hero};min=${bounds[1]};max=${bounds[2]}` : null;
if (!shapeDesc) {
  problems.push(`${PINNED.file}: không đọc được FALLBACK_HEIGHT/HERO_DECK/ngưỡng lọc — parser mù?`);
} else {
  const shape = createHash('sha256').update(shapeDesc).digest('hex');
  if (shape !== PINNED.shape) {
    problems.push(
      `${PINNED.file}: hình dạng thứ được persist đổi (${shapeDesc}) — bump STORAGE_KEY và cập nhật ` +
        `PINNED.shape ở tools/widget-height-version.mjs trong cùng commit`,
    );
  }
}

if (problems.length) {
  console.error(`phiên bản chiều cao widget HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(`phiên bản chiều cao widget OK — STORAGE_KEY ${PINNED.key}, hình dạng (${shapeDesc}) khớp ghim`);
