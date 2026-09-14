/**
 * Thẻ bài tập đã xong thì THU LẠI — và thu lại không được làm mất gì.
 *
 *     node tools/plan-collapse.mjs
 *
 * ── việc nó gác, và ai yêu cầu ──
 *
 * Chủ dự án chụp màn Plan sau khi tập xong: bốn thẻ, hai mươi ô nhập, sáu ô
 * tick đã tick hết, trải dài hơn hai màn hình. "Thẻ này sau khi hoàn thành thì
 * nên thu lại cho gọn tiện xem… nếu trùng chức năng thì loại bỏ 1 cái và giữ
 * cái còn lại mà tính năng đó VẪN GIỮ LẠI VÀ XÀI ĐƯỢC."
 *
 * Vế sau là chỗ luật này đứng. Thu gọn một màn có hai cách hỏng, và cả hai đều
 * im lặng:
 *
 *   1. dòng tóm tắt nói theo KẾ HOẠCH thay vì theo thứ đã làm;
 *   2. thân thẻ bị GỠ khỏi cây thay vì bị cắt, nên chữ đang gõ dở bay mất.
 *
 * ── (1) được CHẠY, không được dò ──
 *
 * Quyết định nằm trong `src/lib/set-summary.ts`, một hàm thuần, và luật này
 * biên dịch rồi gọi nó qua từng ca. Ca quan trọng nhất là ca thật trong ảnh:
 * Bench Press được giao 7,5 kg, ba hiệp đều ghi 10 kg. Một hàm đọc kế hoạch
 * vẫn "chạy được" — nó chỉ trả lời sai — nên phép thử phải so GIÁ TRỊ, và đó
 * là thứ một luật regex không làm được.
 *
 * Cũng vì thế hàm ấy cố ý không định dạng: hỏi nó một câu số học thì không
 * phải dựng một `i18n` giả và một bảng quy đổi lb để nghe câu trả lời.
 *
 * ── (2) là một câu hỏi về CẤU TRÚC ──
 *
 * `Expander` giữ thân nằm trong cây, bị cắt bởi một hộp cao 0 (xem chú thích
 * của chính nó: "The body stays mounted while closed"). Thay nó bằng
 * `{expanded ? … : null}` trông y hệt trên ảnh chụp — thẻ vẫn thu, vẫn gọn —
 * nhưng mọi ô nhập bị gỡ, nên một con số vừa gõ mà chưa lưu sẽ biến mất khi
 * thẻ đóng. Không ảnh nào, không tỉ số tương phản nào thấy được điều đó; chỉ
 * cây JSX thấy. Nên luật đọc cây bằng trình biên dịch TypeScript thật và hỏi:
 * `block.rows.map` có nằm DƯỚI một `<Expander>` không.
 */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

import { NATIVE } from './lib/stack.mjs';

const ts = createRequire(path.join(NATIVE, 'x.cjs'))('typescript');
const problems = [];

/* ── 1. chạy thật phần quyết định ────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'collapse-'));
mkdirSync(path.join(out, 'src'), { recursive: true });
writeFileSync(path.join(out, 'src', 'set-summary.ts'), readFileSync(path.join(NATIVE, 'src/lib/set-summary.ts'), 'utf8'));
execFileSync(
  process.execPath,
  [path.join(NATIVE, 'node_modules/typescript/bin/tsc'), 'src/set-summary.ts',
    '--ignoreConfig', '--outDir', out, '--rootDir', 'src', '--module', 'commonjs',
    '--target', 'es2020', '--skipLibCheck'],
  { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { summarizeSets } = createRequire(path.join(out, 'x.cjs'))(path.join(out, 'set-summary.js'));

const S = (w, r, d) => (d === undefined ? { weight: w, reps: r } : { weight: w, reps: r, durationSec: d });

const CASES = [
  {
    /* ĐÚNG ca trong ảnh: kế hoạch giao 7,5 kg, ba hiệp đều ghi 10. Một bản
       đọc kế hoạch vẫn trả về `uniform` — nhưng với 7,5. */
    why: 'ba hiệp giống nhau, nặng hơn kế hoạch',
    did: [S(10, 8), S(10, 8), S(10, 8)],
    want: { kind: 'uniform', sets: 3, reps: 8, weightKg: 10 },
  },
  {
    why: 'các hiệp KHÁC nhau — không bộ số nào đại diện được',
    did: [S(10, 8), S(12, 6), S(8, 10)],
    want: { kind: 'volume', sets: 3, volumeKg: 10 * 8 + 12 * 6 + 8 * 10 },
  },
  {
    why: 'cùng tạ nhưng khác reps vẫn là KHÁC nhau',
    did: [S(40, 12), S(40, 10)],
    want: { kind: 'volume', sets: 2, volumeKg: 40 * 12 + 40 * 10 },
  },
  {
    why: 'không tạ (hít xà): `uniform` với 0 kg, chỗ vẽ in "Không tạ"',
    did: [S(0, 12), S(0, 12)],
    want: { kind: 'uniform', sets: 2, reps: 12, weightKg: 0 },
  },
  {
    why: 'hiệp tính bằng THỜI GIAN không bao giờ vào nhánh "{n} × {reps}"',
    did: [S(0, 0, 60), S(0, 0, 60)],
    want: { kind: 'volume', sets: 2, volumeKg: 0 },
  },
  {
    why: 'một hiệp trống (chưa nhập gì) — reps 0 thì "3 × 0" là câu vô nghĩa',
    did: [S(0, 0)],
    want: { kind: 'volume', sets: 1, volumeKg: 0 },
  },
  {
    why: 'một hiệp duy nhất vẫn tóm tắt được',
    did: [S(40, 12)],
    want: { kind: 'uniform', sets: 1, reps: 12, weightKg: 40 },
  },
  { why: 'chưa hiệp nào xong thì không có gì để nói', did: [], want: null },
];

for (const t of CASES) {
  const got = summarizeSets(t.did);
  if (JSON.stringify(got) !== JSON.stringify(t.want)) {
    problems.push(
      `tóm tắt sai — ${t.why}: mong ${JSON.stringify(t.want)}, nhận ${JSON.stringify(got)}`,
    );
  }
}

/* ── 2. thân thẻ phải bị CẮT, không bị GỠ ────────────────────────────────── */
const REL = 'src/components/ascnd/day-plan.tsx';
const src = readFileSync(path.join(NATIVE, REL), 'utf8');
const sf = ts.createSourceFile(REL, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

const tagOf = (el) => (ts.isJsxSelfClosingElement(el) ? el : el.openingElement).tagName.getText();

let rowsUnderExpander = false;
let sawRows = false;
const walk = (n, inExpander) => {
  if (ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n)) {
    const next = inExpander || tagOf(n) === 'Expander';
    ts.forEachChild(n, (ch) => walk(ch, next));
    return;
  }
  /* `block.rows.map(…)` — các hàng set của một bài. */
  if (
    ts.isCallExpression(n)
    && ts.isPropertyAccessExpression(n.expression)
    && n.expression.name.text === 'map'
    && /^block\.rows$/.test(n.expression.expression.getText(sf))
  ) {
    sawRows = true;
    if (inExpander) rowsUnderExpander = true;
  }
  ts.forEachChild(n, (ch) => walk(ch, inExpander));
};
walk(sf, false);

if (!sawRows) {
  problems.push(
    `${REL}: không còn thấy \`block.rows.map\` — thẻ bài tập đã được viết lại, nên phép kiểm cấu trúc `
      + 'bên dưới đang canh một thứ không tồn tại. Đọc lại chú thích đầu tệp này rồi sửa nó, đừng để nó xanh suông',
  );
} else if (!rowsUnderExpander) {
  problems.push(
    `${REL}: các hàng set KHÔNG nằm dưới \`<Expander>\` — nghĩa là thẻ thu lại bằng cách GỠ thân khỏi `
      + 'cây chứ không phải cắt nó. Trên ảnh chụp hai cách giống hệt nhau; khác nhau ở chỗ mọi `TextInput` '
      + 'bị gỡ theo, nên một con số vừa gõ mà chưa lưu biến mất khi thẻ đóng. Yêu cầu là "gọn", không phải "mất"',
  );
}

/* Và chỗ vẽ phải HỎI cái hàm ấy, chứ không tự quyết lại. */
if (!/summarizeSets\s*\(/.test(src)) {
  problems.push(
    `${REL}: không gọi \`summarizeSets\` — quyết định "một bộ số có đại diện được cả loạt không" quay `
      + 'về nằm giữa JSX, và mọi ca ở trên lập tức hết thẩm quyền',
  );
}

if (problems.length) {
  console.error('thu thẻ làm mất thứ nó không được làm mất:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `thu thẻ OK — CHẠY thật \`summarizeSets\` qua ${CASES.length} ca, gồm đúng ca trong ảnh chủ dự án gửi `
    + '(giao 7,5 kg, ba hiệp ghi 10 kg: dòng tóm tắt phải nói 10). Một bản đọc kế hoạch vẫn chạy được — nó '
    + 'chỉ trả lời sai — nên phép thử so GIÁ TRỊ chứ không dò chữ. Và cây JSX được đọc bằng trình biên dịch '
    + 'TypeScript thật để chắc các hàng set nằm DƯỚI `<Expander>`: thay nó bằng `{expanded ? … : null}` '
    + 'trông y hệt trên ảnh chụp nhưng gỡ mọi ô nhập, nên số vừa gõ chưa lưu sẽ bay mất khi thẻ đóng',
);
