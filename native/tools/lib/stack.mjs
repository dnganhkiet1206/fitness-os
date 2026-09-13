/**
 * Chồng vật liệu của một màn, tính một lần cho mọi luật hỏi tới nó.
 *
 * ── vì sao nó là một tệp riêng ──
 *
 * `glass-stack.mjs` dựng phép tính "trang → hai vũng sáng ở đỉnh → lớp dập →
 * mặt kính" để đo CHỮ. `sleep-ramp.mjs` rồi cần đúng chồng ấy để đo MÀU CỘT,
 * vì một cột biểu đồ cũng nằm trên chính mặt kính đó.
 *
 * Chép sang là cách `live-world.mjs` đã ghi lại hậu quả bằng chữ của nó: "một
 * luật, hai bản, và bản chép sai theo cách không gì báo". Ở đây bản chép sẽ
 * còn im lặng hơn — hai luật cùng xanh trong khi đo hai cái nền khác nhau, và
 * không ai biết cái nào đúng.
 *
 * Mọi hằng ở đây đều ĐỌC RA khỏi nguồn, không gõ lại: đổi `AURA_DIM` trong
 * `screen.tsx` thì cả hai luật cùng đổi theo, hoặc cùng nổ.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const readNative = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
export const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const num = (src, name, where) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
  if (!m) throw new Error(`không đọc được ${name} thật từ ${where} — luật gọi tới đây đã lạc mục tiêu`);
  return Number(m[1]);
};

const auraSrc = strip(readNative('src/components/ascnd/readiness-aura.tsx'));
const screenSrc = strip(readNative('src/components/ascnd/screen.tsx'));
export const AURA_ALPHA = num(auraSrc, 'AURA_ALPHA', 'readiness-aura.tsx');
export const PAPER_ALPHA = num(auraSrc, 'PAPER_ALPHA', 'readiness-aura.tsx');
export const AURA_DIM = num(screenSrc, 'AURA_DIM', 'screen.tsx');

/** Bảng màu THẬT, biên dịch từ `palette.ts` chứ không đọc bằng regex. */
let cached = null;
export function loadPalette() {
  if (cached) return cached;
  const out = mkdtempSync(path.join(os.tmpdir(), 'stack-'));
  mkdirSync(path.join(out, 'src'), { recursive: true });
  writeFileSync(path.join(out, 'src', 'palette.ts'), readNative('src/constants/palette.ts'));
  execFileSync(
    process.execPath,
    [path.join(NATIVE, 'node_modules/typescript/bin/tsc'), 'src/palette.ts',
      '--ignoreConfig', '--outDir', out, '--rootDir', 'src', '--module', 'commonjs',
      '--target', 'es2020', '--skipLibCheck'],
    { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  cached = createRequire(path.join(out, 'x.cjs'))(path.join(out, 'palette.js'));
  return cached;
}

export const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
export const lum = (r) => {
  const q = r.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
};
export const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
export const overC = (c, bg, a) => c.map((v, i) => Math.round(a * v + (1 - a) * bg[i]));
export const over = (fg, bg, a) => overC(hex(fg), bg, a);
/** `rgba(r,g,b,a)` → [[r,g,b], a] */
export const rgba = (s) => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(s);
  if (!m) return null;
  return [[+m[1], +m[2], +m[3]], m[4] === undefined ? 1 : Number(m[4])];
};
export const toHex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');

/** Màn nào bật `aura`, và với hai sắc nào. */
export function auraScreens() {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
    cwd: NATIVE, encoding: 'utf8',
  }).split('\n').filter((f) => /\.tsx$/.test(f));
  const screens = [];
  for (const f of files) {
    for (const m of strip(readNative(f)).matchAll(/aura=\{\[\s*'(\w+)'\s*,\s*'(\w+)'\s*\]\}/g)) {
      screens.push({ file: f, tints: [m[1], m[2]] });
    }
  }
  return screens;
}

/**
 * Nền TRANG sau khi phủ hai vũng sáng và lớp dập.
 *
 * ── trên GIẤY hai vũng là TRẮNG, không phải màu tint ──
 *
 * `readiness-aura.tsx` viết `const paint = paper ? c.card : (tint ?? ...)`, kèm
 * lý do đã đo: trên nền gần đen hai vũng CỘNG sáng, còn trên `#f7f4ef` thì
 * `rgba(tint, 0.5)` không rọi màu lên giấy mà NHUỘM giấy và làm tối đi — đúng
 * thứ bản thiết kế cấm.
 *
 * `glass-stack.mjs` composite màu tint cho cả hai diện mạo ngay từ bản đầu, nên
 * số liệu bản sáng của nó là của một cái wash chưa bao giờ tồn tại. Sai theo
 * chiều KHẮT KHE hơn thực tế — wash tím tối hơn wash trắng, mà chữ trên giấy
 * là chữ mực — nên nó chưa bao giờ cho lọt cái gì. Nhưng một luật đo một thứ
 * app không làm là một luật sẽ chặn nhầm một thiết kế đúng, và sẽ dạy người
 * đọc một con số sai.
 */
export function washFor(theme, tints) {
  const { palettes } = loadPalette();
  const p = palettes[theme];
  const lit = theme === 'dark';
  const a = lit ? AURA_ALPHA : PAPER_ALPHA;
  const first = lit ? p[tints[0]] : p.card;
  const second = lit ? p[tints[1]] : p.card;
  let wash = over(first, hex(p.background), a);
  wash = over(second, wash, a * 0.85);
  return over(lit ? '#000000' : p.background, wash, AURA_DIM);
}

/**
 * Mặt của một tầng kính đặt trên `wash`.
 *
 * Tầng NỔI đo ở điểm xấu nhất của nó — trên một thẻ `primary`, không trên
 * trang trần: một segmented nằm trong thẻ, một sheet nằm trên nội dung.
 */
export function faceFor(theme, tints, tier) {
  const { materials } = loadPalette();
  const m = materials[theme];
  const wash = washFor(theme, tints);
  const g = rgba(m.glass[tier].bg);
  if (!g) return null;
  const base = tier === 'floating' || tier === 'elevated'
    ? overC(rgba(m.glass.primary.bg)[0], wash, rgba(m.glass.primary.bg)[1])
    : wash;
  return overC(g[0], base, g[1]);
}
