/**
 * That the wash reaches zero before its rectangle does.
 *
 * ── the cut ──
 *
 * `ReadinessAura` paints radial gradients into a `Rect` that covers the top
 * `REACH` of the screen. A radial gradient in objectBoundingBox units is
 * transparent past its radius — but only past its radius. If the distance from
 * the gradient's centre to the rectangle's bottom edge is SHORTER than the
 * radius, the wash still has colour at the exact row where the rectangle stops,
 * and that is a hard horizontal line across the whole screen.
 *
 * Measured on the shipped build, at y = height × REACH: the column under the
 * second gradient's centre jumped 5 counts between adjacent rows; the column at
 * the left edge jumped 0. Which is why the first measurement — taken at the
 * left edge — reported no cut for a cut that was there. The arithmetic does not
 * have that problem.
 *
 * ── the rule ──
 *
 *   1 − cy  >  r
 *
 * for every radial gradient in the file. Nothing else needs measuring: if the
 * wash is already transparent by the time it reaches the bottom edge, there is
 * nothing left to cut.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'src/components/ascnd/readiness-aura.tsx';
const src = readFileSync(path.join(NATIVE, FILE), 'utf8').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
const problems = [];

const found = [...src.matchAll(/<RadialGradient[^>]*cy="(\d+(?:\.\d+)?)%"[^>]*r="(\d+(?:\.\d+)?)%"/g)];
if (found.length === 0) problems.push(`${FILE}: không tìm thấy RadialGradient nào — luật này đang canh một file đã đổi hình`);

for (const m of found) {
  const cy = Number(m[1]) / 100;
  const r = Number(m[2]) / 100;
  const room = 1 - cy;
  if (r >= room) {
    problems.push(
      `${FILE}: gradient cy=${m[1]}% r=${m[2]}% — khoảng cách từ tâm tới đáy hình chữ nhật là ` +
        `${room.toFixed(2)}, nhỏ hơn hoặc bằng bán kính ${r.toFixed(2)}. Lớp wash vẫn còn màu đúng ` +
        'lúc hình chữ nhật hết vẽ, và đó là một ĐƯỜNG NGANG CỨNG vắt qua màn hình',
    );
  }
}

if (problems.length) {
  console.log('mép lớp nền CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `mép lớp nền OK — ${found.length} gradient, mỗi cái đều tắt hẳn TRƯỚC khi hình chữ nhật của nó ` +
    'hết vẽ (1 − cy > r), nên không có đường ngang cứng nào ở y = height × REACH. Luật tính bằng số ' +
    'học thay vì đo pixel, vì phép đo pixel đầu tiên của tôi lấy ở mép trái — nơi gradient bên phải ' +
    'đã tắt — và báo "không có vết cắt" cho một vết cắt nhảy 5 count ở cột x=88%',
);
