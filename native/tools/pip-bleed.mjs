/**
 * Chấm đang sáng phải VẼ TRỌN trong hộp mà bố cục dành cho nó.
 *
 * ── lỗi có thật mà tệp này tồn tại vì nó ──
 *
 * Đã bị báo kèm ảnh: *"nút khi sáng lên vẫn bị che một chút"*. Chỉ cái đang
 * sáng, và chỉ một chút — đó là toàn bộ hình dạng của lỗi, và nó chỉ đúng với
 * một nguyên nhân.
 *
 * `Pip` đánh dấu trang đang xem bằng `transform: scale(1.25)`. Một transform
 * KHÔNG đụng tới bố cục — đó là lý do nó được chọn, và `tools/motion.mjs` cấm
 * cách còn lại (animate `width`) — nhưng hệ quả là hộp bố cục vẫn đúng `DOT`
 * điểm trong khi thứ vẽ ra lớn hơn 25%.
 *
 * Bình thường không sao: một hình vẽ tràn khỏi hộp của nó vẫn hiện đủ. Trừ khi
 * có ai đó CẮT. Và ở đây có: hàng chấm nằm trong `Expander`, thứ chạy chiều cao
 * thật để mở/đóng, nên hộp của nó là `overflow: 'hidden'` cao ĐÚNG bằng chiều
 * cao đo được của nội dung — 8 điểm padding cộng 6 điểm chấm, bằng 14. Chấm
 * sáng trải từ 7,25 xuống 14,75. Ba phần tư điểm cuối bị cắt.
 *
 * Bốn chấm mờ vẽ vừa hộp nên không hề gì; phía TRÊN chấm sáng còn 8 điểm
 * padding để nở vào nên cũng không hề gì. Đúng một cạnh, đúng một chấm.
 *
 * ── vì sao luật này không phải "phải có paddingBottom" ──
 *
 * Vì đó là ghim một CÁCH VIẾT, và cách viết không phải thứ đang hỏng. Thứ đang
 * hỏng là một BẤT BIẾN HÌNH HỌC: phần vẽ ra của chấm sáng phải nằm trong hộp
 * mà `Expander` sẽ cắt. Nên tệp này lấy các hằng số THẬT ra khỏi mã nguồn —
 * `DOT`, `PIP_LIT`, `PIP_BLEED`, cùng `paddingTop`/`paddingBottom` của hàng, kể
 * cả khi chúng là biểu thức — rồi TÍNH lấy hai mép và so.
 *
 * Nhờ thế nó cũng bắt được ca sẽ thật sự xảy ra lần sau: ai đó nâng `PIP_LIT`
 * lên cho cái chấm rõ hơn. Nếu `PIP_BLEED` còn là phép tính thì hàng tự nới ra
 * và luật xanh; nếu ai đó thay nó bằng một con số gõ tay thì luật đỏ ngay,
 * trước khi lỗi kịp lên tới máy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const DECK = 'src/components/ascnd/card-deck.tsx';
const EXPANDER = 'src/components/ascnd/expander.tsx';
const TOKENS = 'src/constants/ascnd.ts';

/** `spacing` thật, không phải một bản chép. */
function spacingTokens() {
  const m = /export const spacing = (\{[\s\S]*?\}) as const;/.exec(read(TOKENS));
  if (!m) throw new Error(`không đọc được spacing từ ${TOKENS}`);
  return new Function(`return ${m[1].replace(/\/\/[^\n]*/g, '')};`)();
}

/**
 * Đo hàng chấm bằng cách CHẠY chính các biểu thức trong mã nguồn.
 *
 * Ba khai báo và một khối style được trích nguyên văn rồi đánh giá cạnh nhau,
 * nên `PIP_BLEED` được tính đúng như lúc chạy thật kể cả khi nó là
 * `Math.ceil(...)`, và `paddingTop: spacing.sm` phân giải qua token thật.
 */
function measure(src, spacing) {
  const grab = (name) => {
    const m = new RegExp(`const ${name} = ([^;]+);`).exec(src);
    if (!m) throw new Error(`không tìm thấy hằng số \`${name}\` trong ${DECK}`);
    return `const ${name} = ${m[1]};`;
  };
  const pips = /\n  pips: (\{[\s\S]*?\n  \}),/.exec(src) ?? /\n  pips: (\{[^}]*\}),/.exec(src);
  if (!pips) throw new Error(`không tìm thấy style \`pips\` trong ${DECK}`);
  const body = pips[1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  const litScale = /interpolate\(t, \[0, 1\], \[([^,]+), 1\]\)/.exec(src);
  if (!litScale) throw new Error(`không tìm thấy phép phóng to của \`Pip\` trong ${DECK}`);

  return new Function(
    'spacing',
    `${grab('DOT')}${grab('PIP_LIT')}${grab('PIP_BLEED')}
     const pips = ${body};
     return {
       dot: DOT,
       /* Lấy từ CHỖ VẼ, không từ hằng số: nếu Pip thôi dùng PIP_LIT thì hai
          con số rời nhau và bất biến này phải đo con số đang thật sự vẽ. */
       lit: ${litScale[1]},
       top: pips.paddingTop ?? 0,
       bottom: pips.paddingBottom ?? 0,
     };`,
  )(spacing);
}

const problems = [];
const spacing = spacingTokens();
const deck = read(DECK);

/* Luật chỉ có nghĩa khi có ai đó CẮT. Neo nó vào chỗ cắt, để nếu `Expander`
   thôi cắt thì luật này được xem lại chứ không âm thầm thừa ra. */
const expander = read(EXPANDER);
if (!/overflow: 'hidden'/.test(expander)) {
  problems.push(
    `${EXPANDER}: không còn \`overflow: 'hidden'\` — bất biến này tồn tại VÌ chỗ đó cắt; ` +
      'xem lại luật chứ đừng bỏ nó',
  );
}
if (!/<Expander[\s\S]{0,200}?styles\.pips/.test(deck)) {
  problems.push(`${DECK}: hàng chấm không còn nằm trong <Expander> — kiểm lại xem còn gì cắt nó không`);
}

/**
 * Hình học, tính từ các con số vừa lấy ra.
 *
 * `scale` nở quanh TÂM, nên chấm sáng ăn thêm `dot·(lit−1)/2` về mỗi phía.
 */
function verdict(m) {
  const rowH = m.top + m.dot + m.bottom;
  const centre = m.top + m.dot / 2;
  const half = (m.dot * m.lit) / 2;
  return { rowH, litTop: centre - half, litBottom: centre + half };
}

let m;
try {
  m = measure(deck, spacing);
} catch (e) {
  problems.push(e.message);
}

if (m) {
  const v = verdict(m);
  const r = (n) => Math.round(n * 100) / 100;
  if (v.litTop < 0) {
    problems.push(
      `chấm sáng vượt lên trên hộp: mép trên ở ${r(v.litTop)}, hộp bắt đầu ở 0 — ` +
        `bị cắt ${r(-v.litTop)} điểm ở ĐỈNH`,
    );
  }
  if (v.litBottom > v.rowH) {
    problems.push(
      `chấm sáng vượt xuống dưới hộp: mép dưới ở ${r(v.litBottom)}, hộp cao ${r(v.rowH)} — ` +
        `bị cắt ${r(v.litBottom - v.rowH)} điểm ở ĐÁY (đúng lỗi đã báo: chỉ chấm đang sáng, chỉ một chút)`,
    );
  }
}

/* ── phép tự kiểm ────────────────────────────────────────────────────────────
   Hai bản hỏng dựng từ chính mã nguồn đang chạy. Bản đầu là đúng thứ đã xuất
   xưởng; bản sau là ca sẽ thật sự xảy ra lần tới. */
const SELF = [
  {
    name: 'bỏ paddingBottom (bản đã xuất xưởng)',
    mutate: (s) => s.replace(/\n    paddingBottom: PIP_BLEED,/, ''),
    expect: /bị cắt 0\.75 điểm ở ĐÁY/,
  },
  {
    name: 'PIP_BLEED thành số gõ tay rồi nâng PIP_LIT',
    /* Phép tính là thứ bảo vệ; thay nó bằng một hằng số thì lần chỉnh sau sẽ
       im lặng làm hỏng lại. */
    mutate: (s) =>
      s
        .replace(/const PIP_BLEED = [^;]+;/, 'const PIP_BLEED = 1;')
        .replace(/const PIP_LIT = [^;]+;/, 'const PIP_LIT = 1.6;'),
    expect: /bị cắt .* điểm ở ĐÁY/,
  },
];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(deck);
  if (broken === deck) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  let found = [];
  try {
    const bm = measure(broken, spacing);
    const bv = verdict(bm);
    const r = (n) => Math.round(n * 100) / 100;
    if (bv.litTop < 0) found.push(`bị cắt ${r(-bv.litTop)} điểm ở ĐỈNH`);
    if (bv.litBottom > bv.rowH) found.push(`bị cắt ${r(bv.litBottom - bv.rowH)} điểm ở ĐÁY`);
  } catch (e) {
    selfFail.push(`${s.name}: bản hỏng không đo được — ${e.message}`);
    continue;
  }
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra báo: ${found.join('; ')}`);
  }
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}

if (problems.length) {
  console.log('chấm chỉ trang bị cắt:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const v = verdict(m);
const r = (n) => Math.round(n * 100) / 100;
console.log(
  `chấm chỉ trang OK — hằng số lấy THẬT ra khỏi card-deck.tsx (DOT ${m.dot}, phóng to ${m.lit}× đọc từ chính ` +
    `phép interpolate của Pip, padding ${m.top}/${m.bottom} phân giải qua token spacing thật), rồi TÍNH hai mép: ` +
    `chấm sáng trải ${r(v.litTop)}→${r(v.litBottom)} trong một hàng cao ${r(v.rowH)}, nên nó vẽ trọn trong hộp mà ` +
    'Expander sẽ cắt — phóng to bằng transform không nới hộp bố cục, và hộp ấy là overflow:hidden cao đúng ' +
    'chiều cao đo được, nên phần tràn ra bị cắt mất chứ không hiện; ' +
    'luật được neo vào chính chỗ cắt, nên nếu Expander thôi cắt thì nó đòi xem lại chứ không âm thầm thừa; ' +
    `${SELF.length} phép thử ngược — bỏ hẳn paddingBottom (đúng bản đã xuất xưởng, cắt 0,75 điểm) và thay phép ` +
    'tính bằng một số gõ tay rồi nâng độ phóng to — cả hai đều đỏ đúng ô đã dự đoán',
);
