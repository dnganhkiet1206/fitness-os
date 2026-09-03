/**
 * Dấu hiệu ASCND trên đầu màn Today: đúng ảnh, đúng cỡ, và không bấm được.
 *
 * ── vì sao cần một bước kiểm cho một cái logo ──
 *
 * Cụm này lấy `assets/images/splash-icon.png` — dấu hiệu đã tách nền, do
 * `tools/make-app-icon.mjs` dựng ra từ `assets/brand/app-icon-source.png`. Ảnh
 * ấy là một ô VUÔNG có lề: nét chỉ chiếm 836×634 giữa 936×936.
 *
 * Nên `BOX = 37` trong `brand-lockup.tsx` không phải chiều cao người ta nhìn
 * thấy. Nó là con số để nét cao 25 điểm, dẫn từ tỉ lệ 634/936 = 0,677.
 *
 * Đó là một sự phụ thuộc VÔ HÌNH. Dựng lại icon với lề khác — hoàn toàn hợp lệ
 * với `make-app-icon.mjs`, không có gì báo — thì cụm chữ trên đầu trang đổi cỡ,
 * và không ai nhìn vào diff của một tệp .png mà thấy được điều đó. Bước này đo
 * lại tỉ lệ trên chính tệp ảnh, nên lần đổi ấy sẽ ĐỎ thay vì lặng lẽ.
 *
 * ── và ba luật rẻ hơn nhưng vẫn thật ──
 *
 * Logo phải là ẢNH CỦA APP, không phải một bản vẽ tay thứ hai (bài học
 * `macro-icon-style.mjs`: bản thứ hai luôn trôi khỏi bản gốc). Nó phải còn nằm
 * trên đầu màn Today. Và nó không được nhận cú chạm — nó nằm đè lên vòng sẵn
 * sàng, thứ mà cả màn hình dựa vào để mở ra.
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const Jimp = require('jimp-compact');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

const LOCKUP = 'src/components/ascnd/brand-lockup.tsx';
const TODAY = 'src/app/(tabs)/index.tsx';

/** Chiều cao nét mà cụm này được thiết kế quanh, tính bằng điểm. */
const INK_H = 25;
/** Sai số cho phép của chiều cao ấy — nửa điểm ở 3x là một điểm rưỡi thật. */
const INK_TOL = 1.5;

export function sourceRules(lockup, today) {
  const bad = [];
  const l = strip(lockup);
  const t = strip(today);

  const asset = /require\('([^']+)'\)/.exec(l)?.[1];
  if (!asset) bad.push(`${LOCKUP}: không require ảnh nào`);
  else if (!/splash-icon\.png$/.test(asset)) {
    bad.push(`${LOCKUP}: dùng \`${asset}\` chứ không phải dấu hiệu đã tách nền của app`);
  }

  /* Không có bản vẽ tay nào của chữ A: một logo có HAI bản thì bản thứ hai sẽ
     trôi, và không có gì báo vì cả hai đều dựng được. */
  if (/<Svg|<Path/.test(l)) {
    bad.push(`${LOCKUP}: có đường SVG vẽ tay — logo phải là ảnh của app, không phải bản vẽ lại`);
  }

  if (!/pointerEvents="none"/.test(l)) {
    bad.push(`${LOCKUP}: thiếu \`pointerEvents="none"\` — logo nằm đè lên vòng sẵn sàng và sẽ ăn mất cú chạm mở trang`);
  }
  if (!/resizeMode="contain"/.test(l)) {
    bad.push(`${LOCKUP}: thiếu \`resizeMode="contain"\` — phép tính cỡ dựa vào việc cả ô vuông được vừa vào hộp`);
  }

  if (!/<BrandLockup\s*\/>/.test(t)) bad.push(`${TODAY}: không còn dựng <BrandLockup />`);
  /* Ô bên trái từng là một `<View>` rỗng chỉ để đẩy hàng nút sang phải; nó vẫn
     phải giữ `flex: 1`, nếu không hàng nút trượt về giữa. */
  if (!/headerText: \{ flex: 1/.test(t)) bad.push(`${TODAY}: \`headerText\` mất \`flex: 1\` — hàng nút sẽ không còn ở mép phải`);
  return bad;
}

export function boxMath(lockup, ink) {
  const bad = [];
  const box = Number(/^const BOX = (\d+);/m.exec(strip(lockup))?.[1] ?? NaN);
  if (!Number.isFinite(box)) return [`${LOCKUP}: không đọc được hằng BOX`];

  /* `contain` trong một hộp vuông cạnh BOX: ảnh vuông vừa khít, nên nét cao
     đúng bằng tỉ lệ nét/ảnh nhân BOX. */
  const h = box * (ink.h / ink.size);
  const w = box * (ink.w / ink.size);
  const r1 = (v) => Math.round(v * 10) / 10;
  if (Math.abs(h - INK_H) > INK_TOL) {
    bad.push(
      `cỡ nét ra ${r1(h)} điểm chứ không phải ~${INK_H}: BOX=${box} nhân tỉ lệ nét ${ink.h}/${ink.size}. ` +
        'Hoặc ảnh vừa được dựng lại với lề khác, hoặc BOX bị sửa mà chú thích ở trên không theo',
    );
  }
  /* Nét phải nằm GIỮA ảnh. Lệch tâm thì hộp căn giữa sẽ đặt logo lệch khỏi
     trục của viên chuỗi ngày ở đầu kia hàng, và không phép tính nào bắt được. */
  const offX = Math.abs(ink.left - ink.right);
  const offY = Math.abs(ink.top - ink.bottom);
  if (offX > 2 || offY > 2) {
    bad.push(`nét không nằm giữa ảnh: lề trái/phải ${ink.left}/${ink.right}, trên/dưới ${ink.top}/${ink.bottom}`);
  }
  /* Phần tử CUỐI luôn là ghi chú số đo, không phải một lỗi — chỗ gọi `pop()`
     nó ra để in vào câu kết luận. */
  return [...bad, `nét cao ${r1(h)} điểm, rộng ${r1(w)} điểm ở BOX=${box}`];
}

/** Hộp bao của phần có nét trong một ảnh có kênh alpha. */
async function inkOf(rel) {
  const img = await new Promise((res, rej) =>
    Jimp.read(path.join(NATIVE, rel), (e, i) => (e ? rej(e) : res(i))),
  );
  const W = img.bitmap.width;
  const H = img.bitmap.height;
  if (W !== H) throw new Error(`${rel} không vuông (${W}×${H}) — phép tính cỡ giả định ảnh vuông`);
  let x0 = W;
  let y0 = H;
  let x1 = 0;
  let y1 = 0;
  img.scan(0, 0, W, H, function scan(x, y, idx) {
    if (this.bitmap.data[idx + 3] <= 16) return;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
  });
  return { size: W, w: x1 - x0 + 1, h: y1 - y0 + 1, left: x0, right: W - 1 - x1, top: y0, bottom: H - 1 - y1 };
}

/* Tự kiểm chạy trên nguồn MẪU — cùng lý do `glyph-collision.mjs` ghi lại: dựng
   lại lỗi bằng cách sửa tệp thật thì khi tệp thật đã hỏng, phép dựng lại không
   tìm thấy gì để sửa và công cụ báo sai chỗ. */
let SELF_TESTS = 0;
{
  const goodLockup = [
    "const MARK = require('../../../assets/images/splash-icon.png');",
    'const BOX = 37;',
    '<View style={styles.row} pointerEvents="none">',
    '<Image source={MARK} style={styles.mark} resizeMode="contain" />',
  ].join('\n');
  const goodToday = '<BrandLockup />\nheaderText: { flex: 1, minWidth: 0 },';
  const ink = { size: 936, w: 836, h: 634, left: 50, right: 50, top: 151, bottom: 151 };

  const cases = [
    ['nguồn đúng thì im', () => sourceRules(goodLockup, goodToday), false],
    ['đổi sang ảnh khác bị bắt', () => sourceRules(goodLockup.replace('splash-icon.png', 'icon.png'), goodToday), true],
    ['vẽ tay lại logo bị bắt', () => sourceRules(`${goodLockup}\n<Path d="M12 2" />`, goodToday), true],
    ['mất pointerEvents bị bắt', () => sourceRules(goodLockup.replace(' pointerEvents="none"', ''), goodToday), true],
    ['mất resizeMode bị bắt', () => sourceRules(goodLockup.replace(' resizeMode="contain"', ''), goodToday), true],
    ['Today thôi dựng logo bị bắt', () => sourceRules(goodLockup, goodToday.replace('<BrandLockup />', '')), true],
    ['headerText mất flex bị bắt', () => sourceRules(goodLockup, goodToday.replace('flex: 1', 'width: 10')), true],
    ['phép tính cỡ đúng thì im', () => boxMath(goodLockup, ink).filter((m) => !m.startsWith('nét cao')), false],
    ['BOX bị sửa bị bắt', () => boxMath(goodLockup.replace('BOX = 37', 'BOX = 25'), ink).filter((m) => !m.startsWith('nét cao')), true],
    ['ảnh dựng lại với lề khác bị bắt', () => boxMath(goodLockup, { ...ink, h: 900, top: 18, bottom: 18 }).filter((m) => !m.startsWith('nét cao')), true],
    ['nét lệch tâm bị bắt', () => boxMath(goodLockup, { ...ink, top: 250, bottom: 52 }).filter((m) => !m.startsWith('nét cao')), true],
  ];
  const wrong = cases.filter(([, fn, shouldFail]) => (fn().length > 0) !== shouldFail);
  if (wrong.length) {
    console.log(`tự kiểm hỏng — sai ở: ${wrong.map(([l]) => l).join(', ')}, đừng tin kết quả`);
    process.exit(2);
  }
  SELF_TESTS = cases.length;
}

const lockup = read(LOCKUP);
const asset = /require\('\.\.\/\.\.\/\.\.\/([^']+)'\)/.exec(strip(lockup))?.[1] ?? 'assets/images/splash-icon.png';
const ink = await inkOf(asset);
const math = boxMath(lockup, ink);
const note = math.pop();
const problems = [...sourceRules(lockup, read(TODAY)), ...math];

if (problems.length) {
  console.log('dấu hiệu thương hiệu CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `dấu hiệu thương hiệu OK — logo trên đầu Today là CHÍNH ảnh app dùng (${asset}), không phải bản vẽ lại; ` +
    `nét chiếm ${ink.w}×${ink.h} giữa ô ${ink.size}×${ink.size} và nằm đúng tâm, nên ${note}; ` +
    'một lần dựng lại icon với lề khác sẽ làm hỏng bước này thay vì lặng lẽ đổi cỡ logo; ' +
    `logo không nhận cú chạm (nó đè lên vòng sẵn sàng) và ô trái vẫn giữ flex:1 để hàng nút ở lại mép phải; ` +
    `${SELF_TESTS} ca tự kiểm chạy trên nguồn mẫu`,
);
