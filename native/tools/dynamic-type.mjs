/**
 * Chữ đi theo cỡ chữ hệ thống — trừ số nằm trong một hình, thứ có trần.
 *
 * ── điều tôi tưởng là lỗi, và nó không phải ──
 *
 * Tôi báo với người dùng rằng app "gõ cứng 28/22/18/17/15/13/11 nên người chỉnh
 * cỡ chữ hệ thống không nhận được gì". **Sai.** `<Text>` của React Native mặc
 * định `allowFontScaling` là true, và không tệp nào trong `src/` tắt nó. Toàn
 * bộ chữ đã đi theo Dynamic Type từ trước.
 *
 * Luật này giữ đúng điều đó: nó CẤM ai đó tắt scale, chứ không đòi thêm gì.
 *
 * ── lỗi thật, và nó ở chiều ngược lại ──
 *
 * Không có trần. Con số ở giữa vòng tròn không phải chữ trong một bố cục biết
 * co giãn — nó là một hình vẽ có chữ số bên trong, nằm trong hộp cứng theo
 * ĐƯỜNG KÍNH của vòng. Ở cỡ chữ trợ năng lớn nhất của iOS, `fontSize: 60` vượt
 * cả lỗ trong của vòng 264 điểm và đè lên chính nét vòng. Chữ to ra ở đó không
 * đọc được hơn; nó chồng lên đồ hoạ.
 *
 * `tools/type-scale.mjs` đã ghi đúng ngoại lệ này cho SÀN 11 điểm: *"numerals
 * drawn inside a shape — graphics with a glyph in them, not text in a layout.
 * Raising those does not improve legibility, it overflows the circle they sit
 * in."* Luật này là cùng lập luận, nhìn từ đầu kia của thang.
 *
 * ── vì sao trần chứ không phải cờ tắt ──
 *
 * `allowFontScaling={false}` bỏ rơi hẳn người đặt cỡ chữ lớn. Trần 1.6 vẫn cho
 * họ một con số lớn hơn — 60 thành 96 điểm — chỉ là nó dừng trước khi tràn.
 * Nên luật đòi TRẦN và CẤM cờ tắt; hai vế, và vế thứ hai là vế dễ mất khi ai đó
 * gặp một chỗ tràn rồi với tay tới cái công tắc gần nhất.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (e.endsWith('.tsx')) out.push(path.relative(NATIVE, p));
  }
  return out;
}
const files = walk(path.join(NATIVE, 'src'));
const problems = [];

/* ── 1. không ai được tắt scale ─────────────────────────────────────────── */
for (const f of files) {
  const code = strip(read(f));
  const off = /allowFontScaling=\{false\}|allowFontScaling={\s*false\s*}/.exec(code);
  if (off) {
    problems.push(
      `${f}: tắt \`allowFontScaling\`. Đó là bỏ rơi hẳn người đặt cỡ chữ lớn — nếu một chỗ bị tràn thì ` +
        'câu trả lời là một TRẦN (`maxFontSizeMultiplier`), thứ vẫn cho họ chữ to hơn, chứ không phải một ' +
        'công tắc',
    );
  }
}

/* ── 2. số trong một hình phải có trần, và trần đó là MỘT con số ────────── */
const CONST = 'src/constants/ascnd.ts';
const decl = /export const RING_TEXT_MAX_SCALE = ([\d.]+);/.exec(read(CONST));
if (!decl) {
  problems.push(`${CONST}: không còn \`RING_TEXT_MAX_SCALE\` — luật này mất chỗ bám`);
}
const CAP = decl ? Number(decl[1]) : null;
if (CAP !== null && (CAP <= 1 || CAP > 2)) {
  problems.push(
    `${CONST}: trần ${CAP} vô lý. ≤1 là tắt scale bằng đường vòng (người đặt cỡ chữ lớn không được gì); ` +
      '>2 thì số 60 điểm thành hơn 120 và tràn khỏi lỗ trong của vòng 264 điểm',
  );
}

/**
 * Nơi có số đọc TRONG một hình, và số ấy phải mang trần.
 *
 * Liệt kê theo TÊN chứ không dò theo mẫu: một vòng tròn mới xuất hiện thì phải
 * có người đưa nó vào đây và nói ra vì sao, giống cách `type-scale.mjs` liệt kê
 * các ngoại lệ của nó.
 */
const RINGS = [
  ['src/components/ascnd/readiness-gauge.tsx', 2, 'số điểm sẵn sàng và nhãn trạng thái, trong vòng HERO_RING'],
  ['src/components/ascnd/hero-panel.tsx', 2, 'HeroRing — số và chú thích, dùng chung cho bốn trang hero còn lại'],
];
for (const [f, want, what] of RINGS) {
  const code = strip(read(f));
  const n = [...code.matchAll(/maxFontSizeMultiplier=\{RING_TEXT_MAX_SCALE\}/g)].length;
  if (n < want) {
    problems.push(
      `${f}: chỉ ${n}/${want} chỗ mang trần phóng chữ (${what}). Không có trần thì ở cỡ chữ trợ năng lớn ` +
        'nhất con số tràn khỏi lỗ trong của vòng và đè lên chính nét vòng',
    );
  }
  const hard = [...code.matchAll(/maxFontSizeMultiplier=\{[\d.]+\}/g)].map((m) => m[0]);
  if (hard.length) {
    problems.push(
      `${f}: trần gõ tay (${hard.join(', ')}) thay vì \`RING_TEXT_MAX_SCALE\`. Hai vòng tròn với hai trần ` +
        'khác nhau là hai con số sẽ lệch nhau ngay lần đầu một trong hai được chỉnh',
    );
  }
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────── */
const gauge = read(RINGS[0][0]);
const SELF = [
  {
    name: 'gỡ trần khỏi số điểm (bản đã ship)',
    src: gauge,
    mutate: (s) => s.replace(/\n\s*maxFontSizeMultiplier=\{RING_TEXT_MAX_SCALE\}/, ''),
    check: (s) => {
      const n = [...strip(s).matchAll(/maxFontSizeMultiplier=\{RING_TEXT_MAX_SCALE\}/g)].length;
      return n < 2 ? [`chỉ ${n}/2 chỗ mang trần`] : [];
    },
    expect: /chỉ \d\/2 chỗ mang trần/,
  },
  {
    name: 'thay bằng trần gõ tay',
    src: gauge,
    mutate: (s) => s.replace('maxFontSizeMultiplier={RING_TEXT_MAX_SCALE}', 'maxFontSizeMultiplier={1.6}'),
    check: (s) => ([...strip(s).matchAll(/maxFontSizeMultiplier=\{[\d.]+\}/g)].length ? ['trần gõ tay'] : []),
    expect: /trần gõ tay/,
  },
  {
    name: 'tắt allowFontScaling ở một tệp',
    src: gauge,
    mutate: (s) => s.replace('<Text maxFontSizeMultiplier', '<Text allowFontScaling={false} maxFontSizeMultiplier'),
    check: (s) => (/allowFontScaling=\{false\}/.test(strip(s)) ? ['tắt allowFontScaling'] : []),
    expect: /tắt allowFontScaling/,
  },
];
const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(s.src);
  if (broken === s.src) { selfFail.push(`${s.name}: không đổi được gì`); continue; }
  const found = s.check(broken);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ nhưng không đúng chỗ dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
  if (s.check(s.src).length !== 0) selfFail.push(`${s.name}: phép kiểm đỏ ngay trên BẢN THẬT`);
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('Dynamic Type sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `Dynamic Type OK — quét ${files.length} tệp: không tệp nào tắt \`allowFontScaling\`, nên toàn bộ chữ đi ` +
    'theo cỡ chữ hệ thống đúng như HIG đòi (mặc định của React Native là true, và app này chưa từng tắt — ' +
    'điều tôi từng báo là "gõ cứng nên không scale" là SAI). Lỗi thật ở chiều ngược lại và đã được chặn: ' +
    `số đọc TRONG một hình mang trần ${CAP}× ở cả 2 nơi có vòng tròn, vì hộp của chúng cứng theo đường ` +
    'kính vòng — ở cỡ trợ năng lớn nhất, 60 điểm tràn khỏi lỗ trong của vòng 264 điểm và đè lên chính nét ' +
    'vòng, tức chữ to ra không đọc được hơn mà chồng lên đồ hoạ. Trần chứ không phải cờ tắt: người đặt cỡ ' +
    'chữ lớn VẪN được 96 điểm thay vì 60. Trần là MỘT hằng số dùng chung, không gõ tay ở từng vòng. ' +
    `${SELF.length} phép thử ngược đều đỏ đúng chỗ dự đoán và cả ba xanh trên bản thật. ` +
    'CHƯA ĐO trên máy: con số 1.6 chọn theo hình học của vòng, không theo một lần chụp ở AX5',
);
