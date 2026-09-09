/**
 * Ánh sáng môi trường trên GIẤY: nâng bằng trắng, trong một dải ĐO ĐƯỢC.
 *
 *     node tools/paper-ambient.mjs
 *
 * ── luật vật lý mà cả hai hệ aura đều vi phạm ở bản sáng ──
 *
 * Một lớp phủ có độ mờ trên nền GẦN ĐEN thì CỘNG độ sáng: bốn vũng của
 * `assistant-aura.tsx` nâng trang lên tới 1,125:1, và đó là ánh sáng rọi ra.
 * Cùng bốn màu ấy trên giấy #f7f4ef thì composite đi XUỐNG — tím ra #eedff1,
 * lơ ra #e8f0f0 — tức chúng không rọi sáng mà NHUỘM MÀU và làm tối đi. Hạ độ
 * mờ không sửa được: hướng đã sai, chỉ còn ít hơn.
 *
 * ── và cái trần thì phải được nói ra, không được ước ──
 *
 * TRẮNG ĐẶC (α = 1) trên giấy chỉ nâng được **1,097:1**. Đó là toàn bộ quãng
 * còn lại phía trên tờ giấy, và nó THẤP HƠN đỉnh 1,125:1 mà bản tối đạt được.
 * Nên "làm cho bản sáng có aura mạnh như bản tối" là một việc không thể, bất
 * kể chọn màu gì — và đó chính là lúc người ta bắt đầu thêm màu để bù. Luật
 * này tồn tại để chặn đúng bước ấy.
 *
 * ── dải ──
 *
 *     dưới 1,03  không ai thấy — một lớp không nhìn thấy vẫn tốn một lớp
 *     1,05       đích hiện tại, dùng 46% quãng còn lại
 *     trên 1,08  đòi α > 0,85, tức một đốm trắng đặc chứ không phải ánh sáng
 *
 * Con số đọc NGƯỢC ra khỏi nguồn rồi tính lại trên bảng màu thật, nên sửa một
 * hằng trong tệp aura sẽ đổi kết quả ở đây.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const out = mkdtempSync(path.join(tmpdir(), 'paper-ambient-'));
execFileSync(
  'npx',
  ['tsc', 'src/constants/palette.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { palettes } = await import(pathToFileURL(path.join(out, 'palette.js')).href);

const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
function lum(hex) {
  const h = hex.replace('#', '');
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map(lin);
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const contrast = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const rgb = (h) => [0, 2, 4].map((i) => parseInt(h.replace('#', '').slice(i, i + 2), 16));
const over = (fg, a, bg) => {
  const f = rgb(fg);
  const b = rgb(bg);
  return '#' + f.map((v, i) => Math.round(v * a + b[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
};
const r3 = (v) => Math.round(v * 1000) / 1000;

const PAPER = palettes.light.background;
const WHITE = palettes.light.card;
const FLOOR = 1.03;
const CEIL = 1.08;
/** Trần vật lý: trắng đặc trên giấy. Không phải một lựa chọn. */
const MAX = contrast(WHITE, PAPER);

const problems = [];

/** Mọi đỉnh độ mờ mà bản SÁNG dùng cho một lớp ánh sáng môi trường. */
const peaks = [];

/* `assistant-aura.tsx` — bốn vũng, mỗi vũng một `peakLight`. */
{
  const src = read('src/components/ascnd/assistant-aura.tsx');
  const found = [...src.matchAll(/id: '(\w+)'[^\n]*peakLight: ([\d.]+)/g)];
  if (!found.length) {
    problems.push(
      'src/components/ascnd/assistant-aura.tsx: không đọc được `peakLight` nào — ' +
        'hoặc bốn vũng đã bỏ nhánh giấy, hoặc neo của luật này hỏng. Cả hai đều phải xem, ' +
        'chứ không được để luật báo xanh trên một thứ nó không còn đo',
    );
  }
  for (const m of found) peaks.push([`assistant-aura ${m[1]}`, Number(m[2])]);

  /* Và màu của nhánh giấy phải là mặt thẻ, không phải một màu tín hiệu. */
  if (!/const colour = paper \? c\.card :/.test(src)) {
    problems.push(
      'src/components/ascnd/assistant-aura.tsx: nhánh giấy không còn tô bằng `c.card` — ' +
        'trên giấy một lớp phủ MÀU không rọi sáng, nó nhuộm màu và làm tối đi',
    );
  }
}

/*
  ── và trên giấy, KHÍ QUYỂN của phòng tối phải tắt hẳn ──

  Bốn vũng đã chuyển sang nâng bằng trắng, nhưng `assistant-aura.tsx` còn hai
  lớp nữa dựng cho một căn phòng tối: một thân người được rọi sáng, và bốn mặt
  phẳng BỤI neon (`#22e6ff`, `#b45cff`, `#2bf5a8`, `#ffd9b3`). Chúng cộng ánh
  sáng vào nền gần đen; trên giấy, một lớp phủ 12% tối hơn giấy là một vệt bẩn,
  và bụi tím nhân với vài chục hạt chính là "ảnh hưởng lavender" mà ảnh chụp
  máy thật chỉ ra.

  Không hạ độ mờ — tắt. Một vệt bẩn mờ hơn vẫn là một vệt bẩn.

  ── 09/09: điều phải đúng KHÔNG đổi, cách đạt được nó thì đổi ──

  Bản trước bắt đúng một chuỗi: `{m.lit ? (<><AuraFigure`. Cổng ấy nay đã bỏ,
  vì nó là một cổng DỰNG — hai theme dựng hai cây khác nhau là điều kiện đã
  sinh ra A9 (`docs/SO-GHI-LOI.md`). Nhưng thứ luật này bảo vệ — trên giấy
  KHÔNG được có thân người và bụi neon — vẫn nguyên giá trị: nó là một phát
  hiện từ ảnh chụp máy thật, không phải một sở thích.

  Nên luật thôi kiểm CÚ PHÁP và kiểm CHUỖI DẪN tới chỗ tô, cả bốn mắt xích:

    1. cả hai chỗ gọi nhận `lit={m.lit}`,
    2. cả hai component đặt `lit ? null : HIDDEN` lên style gốc của nó,
    3. `HIDDEN` thật sự là `opacity: 0`,
    4. và `moving` của chúng bị `m.lit` chặn, để bản sáng không chạy hoạt hoạ
       cho thứ không ai thấy.

  Bốn mắt xích ấy mạnh hơn cú pháp cũ: bản cũ chỉ thấy CÓ một cái cổng, không
  thấy cổng ấy có nối tới chỗ vẽ hay không.
*/
{
  const src = read('src/components/ascnd/assistant-aura.tsx');
  const need = [
    [/<AuraFigure[^>]*\blit=\{m\.lit\}/, '`AuraFigure` không nhận `lit={m.lit}`'],
    [/<DustField[^>]*\blit=\{m\.lit\}/, 'các lớp bụi không nhận `lit={m.lit}`'],
    [/<AuraFigure[^>]*\bmoving=\{[^}]*\bm\.lit\b/, '`AuraFigure` vẫn chạy hoạt hoạ ở bản sáng (`moving` không bị `m.lit` chặn)'],
    [/<DustField[^>]*\bmoving=\{[^}]*\bm\.lit\b/, 'các lớp bụi vẫn chạy hoạt hoạ ở bản sáng'],
    [/const HIDDEN = \{ opacity: 0 \}/, '`HIDDEN` không còn là `opacity: 0`'],
    [/styles\.figure,[^\]]*\blit \? null : HIDDEN/, '`AuraFigure` không tắt theo `lit` ở style gốc'],
    [/styles\.dust,[^\]]*\blit \? null : HIDDEN/, 'lớp bụi không tắt theo `lit` ở style gốc'],
  ];
  for (const [re, what] of need) {
    if (!re.test(src)) {
      problems.push(
        `src/components/ascnd/assistant-aura.tsx: ${what} — trên giấy đó là một thân người mờ và bốn ` +
          'mặt phẳng bụi NEON, tức đúng vệt lavender mà bản QA máy thật bác bỏ. Chúng được DỰNG ở cả hai ' +
          'theme (điều kiện A9), nên thứ giữ cho giấy sạch là chuỗi `lit` → `HIDDEN`, không phải một cổng dựng',
      );
    }
  }
}

/*
  ── lớp wash của `liquid-glass.tsx` cũng phải tắt trên giấy ──

  Cho tới 09/09, điều này được bảo đảm bằng HÌNH DẠNG: bản sáng không dựng lớp
  wash, và `tools/glass-material.mjs` đếm node nên nó canh giúp.

  Nay hình dạng thôi đọc theme (điều kiện A9), và thứ giữ cho giấy sạch là một
  phép NHÂN. Phép đếm node không nhìn thấy một phép nhân — nên nếu không có
  bước này, một tính chất vốn có luật canh sẽ đổi thành một tính chất không ai
  canh, và đó là một cách âm thầm để mất chính thứ vừa sửa.

  Ba mắt xích: hệ số phải bằng 0 trên giấy, nó phải được nhân vào các `<Stop>`
  của lớp wash, và đỉnh wash phải còn là một con số thật (không phải 0 ở cả hai
  diện mạo, thứ sẽ làm bước này xanh vì lý do sai).
*/
{
  const src = read('src/components/ascnd/liquid-glass.tsx');
  const factor = /const washAt = m\.lit \? 1 : 0;/.test(src);
  if (!factor) {
    problems.push(
      'src/components/ascnd/liquid-glass.tsx: không còn `const washAt = m.lit ? 1 : 0` — ' +
        'lớp wash nay được DỰNG ở cả hai theme, nên thứ duy nhất giữ cho giấy không bị nhuộm là hệ số này',
    );
  }
  const stops = [...src.matchAll(/id=\{wash\}[\s\S]*?<\/RadialGradient>/g)][0]?.[0] ?? '';
  const peaks = [...stops.matchAll(/stopOpacity=\{([\d.]+)(?:\s*\*\s*(\w+))?\}/g)];
  const positive = peaks.filter(([, v]) => Number(v) > 0);
  if (!positive.length) {
    problems.push(
      'src/components/ascnd/liquid-glass.tsx: không đọc được đỉnh nào của lớp wash — ' +
        'bước này sẽ xanh vì lý do sai nếu để nguyên',
    );
  }
  for (const [, v, mul] of positive) {
    if (mul !== 'washAt') {
      problems.push(
        `src/components/ascnd/liquid-glass.tsx: \`stopOpacity={${v}${mul ? ` * ${mul}` : ''}}\` của lớp wash ` +
          'không nhân với `washAt` — trên giấy nó sẽ NHUỘM mặt thẻ, đúng thứ "thẻ hồng / oải hương / đào" mà bản QA máy thật bác bỏ',
      );
    }
  }
}

/* `readiness-aura.tsx` — một hằng cho cả hai vũng. */
{
  const src = read('src/components/ascnd/readiness-aura.tsx');
  const m = /const PAPER_ALPHA = ([\d.]+);/.exec(src);
  if (!m) {
    problems.push('src/components/ascnd/readiness-aura.tsx: không đọc được `PAPER_ALPHA` — neo của luật này hỏng');
  } else {
    peaks.push(['readiness-aura PAPER_ALPHA', Number(m[1])]);
  }
  if (!/const paint = paper \? c\.card :/.test(src)) {
    problems.push(
      'src/components/ascnd/readiness-aura.tsx: nhánh giấy không còn tô bằng `c.card` — ' +
        'đó là `rgba(state, 0.13)` trên giấy, đúng thứ bản thiết kế cấm',
    );
  }
}

/*
  ── và THỨ TỰ giữa các vũng cũng là một phần của thiết kế ──

  Phép thử ngược đầu tiên của luật này KHÔNG cắn: hạ `auraState` từ 0,5 xuống
  0,12 thì `auraViolet` (0,37) trở thành vũng sáng nhất, tổng thể vẫn 1,035 —
  trên sàn, nên luật im. Nhưng bố cục đã LẬT: vũng trạng thái, thứ cả màn hình
  được dựng quanh, giờ mờ hơn một vũng phụ.

  Bốn đỉnh của bản sáng giữ đúng tỉ lệ của bản tối (1,000 / 0,741 / 0,519 /
  0,222) chính là để bố cục ánh sáng không đổi khi vật liệu đổi. Nên thứ tự ấy
  được kiểm, không chỉ độ lớn.
*/
{
  const aura = peaks.filter((p) => p[0].startsWith('assistant-aura'));
  if (aura.length > 1) {
    const state = aura.find((p) => p[0].includes('auraState'));
    const other = aura.filter((p) => !p[0].includes('auraState'));
    if (state && other.some((p) => p[1] >= state[1])) {
      problems.push(
        `vũng trạng thái (α ${state[1]}) không còn sáng nhất — ` +
          `${other.filter((p) => p[1] >= state[1]).map((p) => `${p[0]} α ${p[1]}`).join(', ')} bằng hoặc hơn nó. ` +
          'Bốn đỉnh giữ đúng tỉ lệ của bản tối để bố cục ánh sáng không đổi khi vật liệu đổi',
      );
    }
  }
}

/*
  Đỉnh SÁNG NHẤT quyết định lớp aura có tồn tại hay không; các vũng mờ hơn là
  tương quan trong bố cục, và một vũng phụ mờ dưới sàn vẫn đúng vai của nó.
*/
if (peaks.length) {
  const brightest = peaks.reduce((a, b) => (b[1] > a[1] ? b : a));
  const lift = contrast(over(WHITE, brightest[1], PAPER), PAPER);
  if (lift < FLOOR) {
    problems.push(
      `lớp nâng sáng nhất (${brightest[0]}, α ${brightest[1]}) chỉ nâng ${r3(lift)}:1 so với trang — ` +
        `dưới sàn ${FLOOR}:1, tức một lớp không ai nhìn thấy. Trần vật lý là ${r3(MAX)}:1 (trắng đặc), ` +
        'nên còn chỗ để đẩy — nhưng đẩy bằng ĐỘ SÁNG, không bằng màu',
    );
  }
  if (lift > CEIL) {
    problems.push(
      `lớp nâng sáng nhất (${brightest[0]}, α ${brightest[1]}) nâng ${r3(lift)}:1 — ` +
        `trên trần ${CEIL}:1. Ở mức ấy nó không còn là ánh sáng mà là một đốm trắng đặc nằm trên giấy`,
    );
  }
}

if (problems.length) {
  console.log('ánh sáng môi trường trên giấy CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

const brightest = peaks.reduce((a, b) => (b[1] > a[1] ? b : a));
console.log(
  `ánh sáng môi trường trên giấy OK — cả hai hệ aura nâng bằng \`card\` chứ không bằng màu; đỉnh sáng nhất ` +
    `(${brightest[0]}, α ${brightest[1]}) nâng trang ${r3(contrast(over(WHITE, brightest[1], PAPER), PAPER))}:1, ` +
    `trong dải ${FLOOR}–${CEIL}. Trần vật lý của giấy là ${r3(MAX)}:1 — thấp hơn đỉnh 1,125:1 của bản tối, ` +
    'nên bản sáng không bao giờ đuổi kịp, và đó là lý do không được bù bằng màu',
);
