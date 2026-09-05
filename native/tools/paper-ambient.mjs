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
*/
{
  const src = read('src/components/ascnd/assistant-aura.tsx');
  if (!/\{m\.lit \? \(\s*<>\s*<AuraFigure/.test(src)) {
    problems.push(
      'src/components/ascnd/assistant-aura.tsx: `AuraFigure` và các lớp bụi không còn được đóng cổng ' +
        '`m.lit` — trên giấy đó là một thân người mờ và bốn mặt phẳng bụi NEON, tức đúng vệt lavender ' +
        'mà bản QA máy thật bác bỏ',
    );
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
