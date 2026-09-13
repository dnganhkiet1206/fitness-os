/**
 * Chữ hạng hai phải đọc được qua CẢ CHỒNG, không phải qua một lớp.
 *
 * ── điều tôi tưởng đã biết, và đo ra thì ngược ──
 *
 * Bảng màu đo `mutedForeground` trên một MẶT THẺ — "a dark, still surface",
 * đúng chữ trong chú thích của nó. Phép đo ấy đúng cho app hiện tại, nơi trang
 * phẳng và thẻ đặc.
 *
 * Redesign đổi cả hai vế cùng lúc: trang có lớp sáng (`Screen aura`), và thẻ
 * trở nên trong suốt (bốn tầng `Material.glass`). Chữ giờ ngồi trên
 *
 *     trang → wash → lớp dập → mặt kính → (có thể một mặt kính nữa)
 *
 * và không phép đo nào trong repo tính chồng ấy. Đo ra:
 *
 *     `mutedForeground` trên kính primary phủ wash tím   4,37:1  ✗
 *     cùng chỗ, kính elevated                            3,53:1  ✗
 *     kính floating ĐẶT TRÊN một thẻ primary             3,25:1  ✗
 *
 * Hai diện mạo hỏng theo hai chiều NGƯỢC nhau, và đó là phần dễ đoán sai nhất:
 * trong phòng tối kính là ánh sáng cộng thêm nên tầng càng cao mặt càng sáng,
 * tiến lại gần chữ xám; trên giấy kính là độ đục nên tầng càng cao càng CHE
 * wash đi, và chữ lại dễ đọc hơn. Một người sửa bản tối cho đẹp rồi suy ra bản
 * sáng cũng thế sẽ suy ngược.
 *
 * ── đáp án đã có sẵn trong repo ──
 *
 * `glassMuted` (#c8ccd4 tối / #5c564b sáng) sinh ra đúng cho tình huống này ở
 * hai màn trợ lý, nơi `#828282` đo được 2,57:1 trên kính-trên-aura. Ở mọi chỗ
 * trên nó cho 6,77–11,21. Nên luật không đòi đổi token nào; nó đòi màn có wash
 * phải DÙNG token đúng — `useMuted()` trong `hooks/use-wash.tsx`.
 *
 * ── luật, một câu ──
 *
 * Với mỗi màn bật `aura`, mọi tầng kính nó có thể dùng phải giữ chữ hạng hai
 * ≥ 4,5:1 ở điểm xấu nhất. Nếu không thì hoặc hạ tầng, hoặc hạ wash, hoặc dùng
 * `glassMuted` — và luật nói ra cả ba lối.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/* ── các hằng THẬT, đọc ra khỏi nguồn ── */
const auraSrc = strip(read('src/components/ascnd/readiness-aura.tsx'));
const screenSrc = strip(read('src/components/ascnd/screen.tsx'));
const num = (src, name, where) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([\\d.]+)`));
  if (!m) throw new Error(`không đọc được ${name} thật từ ${where} — luật này đã lạc mục tiêu`);
  return Number(m[1]);
};
const AURA_ALPHA = num(auraSrc, 'AURA_ALPHA', 'readiness-aura.tsx');
const PAPER_ALPHA = num(auraSrc, 'PAPER_ALPHA', 'readiness-aura.tsx');
const AURA_DIM = num(screenSrc, 'AURA_DIM', 'screen.tsx');

/* ── màn nào bật aura, và với sắc gì ── */
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx$/.test(f));
const screens = [];
for (const f of files) {
  for (const m of strip(read(f)).matchAll(/aura=\{\[\s*'(\w+)'\s*,\s*'(\w+)'\s*\]\}/g)) {
    screens.push({ file: f, tints: [m[1], m[2]] });
  }
}

/* ── bảng màu thật ── */
const out = mkdtempSync(path.join(os.tmpdir(), 'glass-stack-'));
mkdirSync(path.join(out, 'src'), { recursive: true });
writeFileSync(path.join(out, 'src', 'palette.ts'), read('src/constants/palette.ts'));
execFileSync(process.execPath,
  [path.join(NATIVE, 'node_modules/typescript/bin/tsc'), 'src/palette.ts',
    '--ignoreConfig', '--outDir', out, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] });
const { palettes, materials } = createRequire(path.join(out, 'x.cjs'))(path.join(out, 'palette.js'));

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lum = (r) => {
  const q = r.map((v) => v / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * q[0] + 0.7152 * q[1] + 0.0722 * q[2];
};
const ratio = (a, b) => {
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const overC = (c, bg, a) => c.map((v, i) => Math.round(a * v + (1 - a) * bg[i]));
const over = (fg, bg, a) => overC(hex(fg), bg, a);
/** `rgba(r,g,b,a)` → [[r,g,b], a] */
const rgba = (s) => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?/.exec(s);
  if (!m) return null;
  return [[+m[1], +m[2], +m[3]], m[4] === undefined ? 1 : Number(m[4])];
};

const FLOOR = 4.5;
let checked = 0;

for (const { file, tints } of screens) {
  for (const theme of ['dark', 'light']) {
    const p = palettes[theme];
    const m = materials[theme];
    const lit = theme === 'dark';
    const alphaA = lit ? AURA_ALPHA : PAPER_ALPHA;

    /* trang → hai vũng ở đỉnh → lớp dập */
    let wash = over(p[tints[0]], hex(p.background), alphaA);
    wash = over(p[tints[1]], wash, alphaA * 0.85);
    wash = over(lit ? '#000000' : p.background, wash, AURA_DIM);

    for (const tier of ['secondary', 'primary', 'floating', 'elevated']) {
      const g = m.glass[tier];
      const parsed = rgba(g.bg);
      if (!parsed) { problems.push(`${theme}.glass.${tier}.bg không phải rgba(): "${g.bg}"`); continue; }
      const [rgb, a] = parsed;
      /* Điểm xấu nhất của tầng NỔI là đặt trên một thẻ `primary`, không trên
         trang trần — một segmented nằm trong thẻ, một sheet nằm trên nội dung. */
      const base = tier === 'floating' || tier === 'elevated'
        ? overC(rgba(m.glass.primary.bg)[0], wash, rgba(m.glass.primary.bg)[1])
        : wash;
      const face = overC(rgb, base, a);
      const asHex = '#' + face.map((v) => v.toString(16).padStart(2, '0')).join('');
      const rMuted = ratio(hex(p.mutedForeground), face);
      const rGlass = ratio(hex(p.glassMuted), face);
      checked += 2;
      if (rMuted < FLOOR && rGlass < FLOOR) {
        problems.push(
          `${file} · ${theme} · tầng \`${tier}\` trên wash ${tints.join('+')}: mặt ra ${asHex}, ` +
            `CẢ HAI token chữ phụ đều trượt (mutedForeground ${rMuted.toFixed(2)}, glassMuted ${rGlass.toFixed(2)}, ` +
            `sàn ${FLOOR}). Hạ độ mờ của tầng, hạ wash, hoặc thôi đặt chữ phụ lên tầng ấy`,
        );
      } else if (rGlass < FLOOR) {
        problems.push(
          `${file} · ${theme} · tầng \`${tier}\`: \`glassMuted\` chỉ còn ${rGlass.toFixed(2)}:1 trên ${asHex}. ` +
            'Token dành riêng cho kính-trên-wash mà không đủ trên chính chỗ ấy thì nó thôi có nghĩa',
        );
      }
    }
  }
}

/* Màn có wash phải THẬT SỰ dùng token đúng — nếu không, phép đo ở trên chứng
   minh một thứ màn ấy không dùng. */
for (const { file } of screens) {
  const s = strip(read(file));
  if (!/useMuted\s*\(/.test(s)) {
    problems.push(
      `${file}: bật \`aura\` nhưng không gọi \`useMuted()\` — chữ hạng hai vẫn đang là ` +
        '`mutedForeground`, thứ chỉ được đo trên một mặt thẻ phẳng không wash',
    );
  }
}

if (!screens.length) {
  problems.push('không màn nào bật `aura` — bộ quét lạc mục tiêu, hoặc lớp sáng lại mất hết chỗ gọi');
}

if (problems.length) {
  console.error('chồng kính ăn chữ:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `chồng kính OK — ${screens.length} màn bật lớp sáng, ${checked} phép đo trên bảng màu THẬT (biên dịch ` +
    `rồi gọi) và trên đúng ba hằng đọc ra khỏi nguồn (AURA_ALPHA ${AURA_ALPHA} · PAPER_ALPHA ${PAPER_ALPHA} ` +
    `· AURA_DIM ${AURA_DIM}). Chồng được tính đủ: trang → hai vũng ở đỉnh → lớp dập → mặt kính, và tầng nổi ` +
    'còn cộng thêm một thẻ primary dưới nó. Hai diện mạo hỏng NGƯỢC chiều nhau — tối thì tầng càng cao mặt ' +
    'càng sáng lại gần chữ xám, sáng thì tầng càng cao càng che wash đi — nên không suy bên này ra bên kia được',
);
