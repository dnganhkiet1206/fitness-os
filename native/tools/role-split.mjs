/**
 * Một màu tách làm HAI VAI VẼ phải giữ đúng MỘT NGHĨA. Cả hai vế đều phải giữ.
 *
 *     node tools/role-split.mjs
 *
 * ── vì sao chỉ hai màu trong bảng được tách ──
 *
 * Trần chroma của sRGB phụ thuộc SẮC, và mỗi sắc có đỉnh ở một độ sáng khác
 * nhau. Với bốn macro cộng vàng sẵn sàng, đo ra:
 *
 *     protein 17°   đỉnh C 0,240 ở L 0,60   ← ngay tại sàn chữ
 *     fat     248°  đỉnh C 0,175 ở L 0,65   ← gần sàn chữ
 *     fiber   161°  C còn tăng tới L 0,75   ← bị sàn chữ cắt
 *     carbs   57°   C còn tăng tới L 0,75   ← bị sàn chữ cắt
 *     vàng    95°   C còn tăng tới L 0,80   ← bị sàn chữ cắt
 *
 * Protein và fat được màu đẹp nhất của mình miễn phí, nên chúng không tách.
 *
 * Ba sắc còn lại đều bị cắt, nhưng chỉ HAI cái hỏng, và lý do đo được: một màu
 * lục bị làm tối vẫn là lục, còn một màu cam hay vàng bị làm tối là NÂU và
 * Ô-LIU. Danh tính của sắc ấm phụ thuộc độ sáng theo cách danh tính của lục thì
 * không. Nên fiber ở 63% chroma bản tối vẫn được giữ, còn carbs ở 79% thì
 * không — đây là lỗi về TÊN MÀU, không phải về độ tương phản, và một luật đo
 * riêng tương phản sẽ không bao giờ thấy nó.
 *
 * Tách vai vì thế là một phép sửa GAMUT, không phải một sở thích, và bảng
 * `PAIRS` dưới đây là danh sách đóng của những sắc đã chứng minh cần nó.
 *
 * ── bốn tính chất, áp cho TỪNG cặp ──
 *
 *  1. Vai ĐỒ HOẠ không được tô CHỮ. Nó ở 3:1; đặt một dòng chữ lên đó là hạ
 *     dưới sàn đọc, và không ai nhìn thấy điều đó cho tới khi nó ra máy thật.
 *
 *  2. Vai CHỮ không được tô những chỗ CHỈ có thể là hình — `stopColor` của một
 *     gradient, `color` của một `<ProgressBar>`. Đó là lý do phép tách tồn tại;
 *     một chỗ như thế còn dùng vai chữ nghĩa là phép tách đã bị lùi lại.
 *
 *  3. Hai vai phải là MỘT MÀU: cùng sắc, khác độ sáng. Nếu chúng lệch sắc thì
 *     phép tách đã thành TÁCH NGHĨA — người dùng sẽ thấy vàng và hổ phách là
 *     hai thứ khác nhau — và bản thiết kế cấm đúng điều đó.
 *
 *  4. Ở bản TỐI hai vai phải bằng nhau từng ký tự. Ràng buộc sinh ra phép tách
 *     chỉ có trên giấy; một giá trị tối khác đi là một thay đổi bản tối lọt qua
 *     mà không ai quyết định.
 *
 * Tính chất 1 và 2 đọc từ nguồn; 3 và 4 biên dịch bảng màu rồi ĐO.
 *
 * ── giới hạn đã biết, ghi ra thay vì giấu ──
 *
 * Tính chất 2 chỉ canh hai hình dạng chắc chắn là hình. Một `backgroundColor`
 * có thể là chấm, có thể là nền một viên có chữ, nên nó KHÔNG ở đây: một luật
 * báo thừa ở chỗ mơ hồ sẽ bị người ta tắt đi, và lúc ấy hai chỗ chắc chắn ở
 * trên cũng mất theo. `tools/live.mjs` và ảnh chụp iOS là chỗ bắt phần còn lại.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { codeMask } from './lib/code-mask.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Danh sách ĐÓNG các cặp đã tách vai.
 *
 * `sàn` là ngưỡng tương phản mà vai chữ phải giữ trên mặt thẻ. Cả hai cặp dùng
 * 4,5 — nhưng nó là một trường chứ không phải hằng số, vì nếu một ngày có một
 * vai chữ chỉ dùng cho chữ LỚN (sàn 3:1 theo WCAG), luật này phải nói được
 * điều đó thay vì báo đỏ sai.
 */
const PAIRS = [
  { text: 'readinessYellow', graphic: 'readinessYellowGraphic', sàn: 4.5 },
  { text: 'metricOrange', graphic: 'metricOrangeGraphic', sàn: 4.5 },
];

const problems = [];

function tsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) tsFiles(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/**
 * Bỏ chú thích, giữ chuỗi — ở đây `codeMask` là ĐÚNG công cụ, khác ba lần trước.
 *
 * `frozen-surface.mjs`, `sleep-ramp.mjs` và `koa-boundary.mjs` đều bị `codeMask`
 * cắn vì thứ chúng săn nằm TRONG chuỗi (`id: 'midLeft'`). Ở đây thứ cần đọc là
 * `c.readinessYellowGraphic` và `stopColor={…}` — định danh và JSX, không bao
 * giờ là nội dung một chuỗi. Nên xoá trắng chuỗi không mất gì, và nó tránh được
 * việc đọc một mã màu viết trong một chuỗi ví dụ.
 */
const blank = (src) => {
  const mask = codeMask(src);
  let out = '';
  for (let i = 0; i < src.length; i++) out += mask[i] ? src[i] : src[i] === '\n' ? '\n' : ' ';
  return out;
};

const lineAt = (src, i) => src.slice(0, i).split('\n').length;

/** Thân `{ … }` bắt đầu tại `open`, khớp ngoặc. */
function body(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (!depth) return src.slice(open, i + 1);
    }
  }
  return src.slice(open);
}

/** Một style có dấu hiệu của CHỮ. `...type.X` là bộ chữ của app. */
const TYPOGRAPHIC = /\.\.\.type\.\w+|fontSize:|fontWeight:|lineHeight:|fontVariant:|letterSpacing:/;

for (const full of tsFiles(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, full);
  const raw = readFileSync(full, 'utf8');
  if (!PAIRS.some((p) => raw.includes(p.text))) continue;
  const src = blank(raw);

  for (const { text: TEXT, graphic: GRAPHIC } of PAIRS) {
  /* ── 1. vai ĐỒ HOẠ không tô chữ ───────────────────────────────────────── */

  /* 1a. trong một style lá: `color:` cùng ô với dấu hiệu chữ. */
  for (const m of src.matchAll(/(\w+):\s*\{/g)) {
    const open = src.indexOf('{', m.index);
    const b = body(src, open);
    if (/\w+:\s*\{/.test(b.slice(1))) continue; // nhóm, không phải lá
    if (!new RegExp(`color:\\s*[^,\\n}]*\\bc\\.${GRAPHIC}\\b`).test(b)) continue;
    if (!TYPOGRAPHIC.test(b)) continue;
    problems.push(
      `${rel}:${lineAt(src, m.index)}: style \`${m[1]}\` tô \`color\` bằng \`${GRAPHIC}\` và có dấu hiệu ` +
        'CHỮ (`...type.`/`fontSize`/`fontWeight`) — vai đồ hoạ ở 3:1, đặt chữ lên đó là dưới sàn đọc 4,5:1. ' +
        `Chữ dùng \`${TEXT}\``,
    );
  }

  /* 1b. gắn thẳng vào một `<Text>`: `<Text style={[…, { color: c.…Graphic }]}`. */
  for (const m of src.matchAll(/<Text\b[\s\S]{0,240}?>/g)) {
    if (!new RegExp(`color:\\s*[^,\\n}]*\\bc\\.${GRAPHIC}\\b`).test(m[0])) continue;
    problems.push(
      `${rel}:${lineAt(src, m.index)}: một \`<Text>\` nhận \`color\` là \`${GRAPHIC}\` ngay trong JSX — ` +
        `cùng lỗi với 1a, chỉ khác chỗ viết. Chữ dùng \`${TEXT}\``,
    );
  }

  /* ── 2. vai CHỮ không tô những chỗ CHỈ có thể là hình ──────────────────── */
  for (const [re, what] of [
    [new RegExp(`stopColor=\\{[^}]*\\bc\\.${TEXT}\\b[^}]*\\}`, 'g'), 'một điểm dừng gradient (`stopColor`)'],
    [new RegExp(`<ProgressBar\\b[\\s\\S]{0,200}?color=\\{[^}]*\\bc\\.${TEXT}\\b[^}]*\\}`, 'g'), 'màu của một `<ProgressBar>`'],
  ]) {
    for (const m of src.matchAll(re)) {
      problems.push(
        `${rel}:${lineAt(src, m.index)}: ${what} dùng \`${TEXT}\` — chỗ này KHÔNG BAO GIỜ là chữ, nên nó ` +
          `đang trả thuế tương phản 4,5:1 mà nó không nợ, và đó chính là màu ô-liu phép tách sinh ra để ` +
          `bỏ đi. Dùng \`${GRAPHIC}\` (hoặc \`graphicOf(c, key)\` nếu khoá đi qua một bảng)`,
      );
    }
  }
  }
}

/* ── 3 + 4. hai vai, đo trên bảng màu thật ────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'role-split-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes, GRAPHIC_ROLE } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

const dec = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lch(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => dec(parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return { L, C: Math.hypot(A, B), H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}
const lum = (hex) => {
  const c = [0, 2, 4].map((i) => dec(parseInt(hex.replace('#', '').slice(i, i + 2), 16) / 255));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;

const CARD = palettes.light.card;
const lines = [];

for (const { text: TEXT, graphic: GRAPHIC, sàn } of PAIRS) {
  const lt = palettes.light[TEXT];
  const lg = palettes.light[GRAPHIC];
  if (!lt || !lg) {
    problems.push(
      `src/constants/palette.ts: cặp \`${TEXT}\`/\`${GRAPHIC}\` thiếu một vế ở bản sáng — ` +
        'neo của luật này hỏng, đừng tin kết quả',
    );
    continue;
  }
  const t = lch(lt);
  const g = lch(lg);

  /* Bảng phải THẬT SỰ nối hai vai — không có nó `graphicOf` trả về chính khoá cũ
     ở mọi chỗ đi qua một bảng, và luật 2 vẫn xanh trong khi màu không đổi. */
  if (GRAPHIC_ROLE?.[TEXT] !== GRAPHIC) {
    problems.push(
      `src/constants/palette.ts: \`GRAPHIC_ROLE.${TEXT}\` không trỏ tới \`${GRAPHIC}\` — ` +
        '`graphicOf` sẽ lặng lẽ trả về vai CHỮ ở mọi chỗ vẽ đi qua một bảng khoá (BMI, trạng thái ' +
        'sẵn sàng, MACRO_TINT), và phép tách chỉ còn đúng ở những chỗ gọi thẳng token',
    );
  }

  /* Sắc: cùng một màu. Dung sai theo chroma — một bước 8-bit lệch sắc nhiều hơn
     ở màu nhạt — cùng công thức `tools/koa-paper.mjs` đã đo và dùng. */
  const tol = Math.max(0.5, 0.07 / Math.min(t.C, g.C));
  if (Math.abs(t.H - g.H) > tol) {
    problems.push(
      `hai vai của \`${TEXT}\` lệch sắc ${r2(Math.abs(t.H - g.H))}° ` +
        `(chữ ${Math.round(t.H)}°, đồ hoạ ${Math.round(g.H)}°), quá dung sai ${r2(tol)}° — ` +
        'đó không còn là hai cường độ của MỘT màu mà là hai màu, và người dùng sẽ đọc chúng thành hai nghĩa',
    );
  }

  /* Độ sáng và sắc độ: vai đồ hoạ phải thật sự mua được điều nó sinh ra để mua. */
  if (!(g.L > t.L && g.C > t.C)) {
    problems.push(
      `vai đồ hoạ của \`${TEXT}\` là ${lg} (L ${r3(g.L)}, C ${r3(g.C)}) — không sáng hơn VÀ đậm sắc hơn ` +
        `vai chữ ${lt} (L ${r3(t.L)}, C ${r3(t.C)}). Nếu nó không mua thêm sắc độ thì nó là một token ` +
        'trùng lặp, và phép tách nên bị BỎ chứ không nên giữ một khoá không làm gì',
    );
  }

  /* Và mỗi vai phải ở đúng sàn của nó. Nền là mặt THẺ: cả hai vai vẽ trên thẻ,
     và thẻ trắng là nền khó hơn giấy ấm. */
  if (contrast(lt, CARD) < sàn) {
    problems.push(
      `vai chữ \`${TEXT}\` = ${lt} chỉ đạt ${r2(contrast(lt, CARD))}:1 trên mặt thẻ — dưới sàn chữ ${sàn}:1. ` +
        'Đó là vai phải đọc được; nếu nó cần sáng hơn thì thứ phải đổi là vai ĐỒ HOẠ',
    );
  }
  if (contrast(lg, CARD) < 3) {
    problems.push(
      `vai đồ hoạ \`${GRAPHIC}\` = ${lg} chỉ đạt ${r2(contrast(lg, CARD))}:1 trên mặt thẻ — ` +
        'dưới sàn đồ hoạ 3:1 (WCAG 2.2 SC 1.4.11). Một cái thanh không nợ 4,5:1, nhưng nó vẫn phải ' +
        'nhìn thấy được',
    );
  }

  /* Bản tối: một giá trị, không hai. */
  if (palettes.dark[TEXT] !== palettes.dark[GRAPHIC]) {
    problems.push(
      `bản TỐI có hai giá trị khác nhau cho \`${TEXT}\` (${palettes.dark[TEXT]} và ` +
        `${palettes.dark[GRAPHIC]}) — ràng buộc sinh ra phép tách chỉ có trên GIẤY. Một giá trị tối ` +
        'khác đi là một thay đổi bản tối lọt qua mà không ai quyết định',
    );
  }

  lines.push(
    `${TEXT}: chữ ${lt} (L ${r3(t.L)} · C ${r3(t.C)} · ${r2(contrast(lt, CARD))}:1) → ` +
      `đồ hoạ ${lg} (L ${r3(g.L)} · C ${r3(g.C)} · ${r2(contrast(lg, CARD))}:1), lệch sắc ` +
      `${r2(Math.abs(t.H - g.H))}°, +${Math.round((g.C / t.C - 1) * 100)}% sắc độ, bản tối một giá trị ` +
      `(${palettes.dark[TEXT]})`,
  );
}

if (problems.length) {
  console.log('vai chữ / vai đồ hoạ CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `vai chữ / vai đồ hoạ OK — ${PAIRS.length} cặp, mỗi cặp vẫn là MỘT màu ở hai cường độ vẽ; ` +
    'không chỗ chữ nào dùng vai đồ hoạ và không điểm dừng gradient hay thanh tiến độ nào còn dùng vai chữ:\n  ' +
    lines.join('\n  '),
);
