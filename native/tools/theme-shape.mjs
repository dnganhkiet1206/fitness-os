/**
 * Hai theme được phép khác MÀU. Chúng KHÔNG được dựng hai cây khác nhau.
 *
 * ── vì sao luật này tồn tại ──
 *
 * A9: app thoát khi chạm vùng vòng tròn sẵn sàng sau khi đổi tab rồi quay lại.
 * Nguyên nhân gốc, chốt trên máy thật ngày 2026-09-08: bản tối dựng lớp
 * kính/lớp phủ, bản sáng bỏ lớp ấy đi — hai theme đi hai ĐƯỜNG DỰNG khác nhau.
 *
 * Đo được, đổi `prefers-color-scheme` ngay trên màn đang mở (bộ chạy web,
 * commit f7a3341): Hôm nay 1.073 → 1.031 node, Dinh dưỡng 611 → 545, Trợ lý
 * 1.066 → 1.024. Chiều đi một phía — bản sáng GỠ cây con và không thêm cái nào.
 *
 * Trên kiến trúc mới của React Native, mỗi cây con bị gỡ là một component view
 * trả về pool tái sử dụng. Đó là điều kiện đã sinh ra A9.
 *
 * ── luật từng là "danh sách đóng", nay là "cấm" ──
 *
 * Bản đầu cho phép tám nhánh lệch, mỗi nhánh một lý do hiệu năng. Lý do lớn
 * nhất trong số đó — "ba lớp `<Svg>` phủ kín màn hình được lấy mẫu lại mỗi
 * khung hình cuộn" của `ambient-light` — đã được ĐO ngày 09/09 và nó SAI: một
 * `<Svg>` chứa ba `<Rect>`, mọi prop là hằng ở phạm vi module, lớp ấy nằm
 * ngoài ScrollView, và `MutationObserver` gắn vào đúng nó đếm được **0 lần DOM
 * bị chạm qua 181 khung hình cuộn thật**. Phần "── on cost ──" ở đầu chính tệp
 * ấy đã nói đúng như thế từ đầu; chú thích tiếng Việt bên dưới nó thì không.
 *
 * Khi lý do đắt nhất hoá ra không đắt, "danh sách đóng" hết chỗ đứng. Cả tám
 * nhánh nay đã hết, và giá thật là vài node trong suốt cộng một lần raster
 * tĩnh — `assistant-aura` còn không trả cả cái đó, vì `moving={… && m.lit}`
 * làm animation của nó không khởi động ở bản sáng.
 *
 * ── phân loại, và vì sao phải phân loại ──
 *
 * `m.lit` dùng để chọn MÀU (`color={m.lit ? a : b}`) không đổi hình dạng cây và
 * không liên quan gì tới luật này. Chỉ những chỗ DỰNG-HOẶC-KHÔNG mới tính. Gộp
 * cả hai lại sẽ đóng băng 30 chỗ vô hại và làm luật thành thứ người ta nới ra.
 *
 * Và phép phân loại ấy nay chia đôi cách xử lý: hai dạng ĐẦU là cổng dựng thật
 * — luôn đỏ, không danh sách nào cứu được. Dạng THỨ BA là một cờ dẫn xuất mà
 * luật không đọc được mục đích, nên nó đi qua `CO_MAU`, nơi mỗi mục đã được
 * đọc bằng mắt và ghi ra nó dùng để làm gì.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(NATIVE, process.env.THEME_SHAPE_ROOT ?? 'src');

/**
 * ── 2026-09-09: KHÔNG CÒN CỔNG DỰNG NÀO, và luật siết theo ──
 *
 * Danh sách này từng là "các chỗ được phép dựng khác nhau giữa hai theme": 6
 * tệp, 8 nhánh. Cả tám nay đã hết — `readiness-gauge`, `ambient-light`,
 * `glass-card`, `liquid-glass`, `assistant-aura` đều dựng cùng số node ở hai
 * theme và bản sáng tô rỗng.
 *
 * Nên luật đổi hình: một CỔNG DỰNG thật (`if (!m.lit) return null` hoặc
 * `{m.lit ? (` mở một cây con) nay **luôn đỏ, không có ngoại lệ**. Không còn
 * cách nào thêm một chỗ lệch mà chỉ cần ghi thêm một dòng vào đây.
 *
 * Thứ còn lại trong bảng này là chuyện khác hẳn: một CỜ DẪN XUẤT
 * (`const paper = !m.lit`) mà regex thứ ba bắt vì nó **cố ý đoán về phía im
 * lặng** — nó không đọc được cờ ấy dùng để làm gì. Cả ba mục dưới đây đã được
 * đọc bằng mắt và cả ba chỉ chọn MÀU hoặc ĐỘ MỜ, không dựng thêm hay bớt một
 * node nào. Chúng ở đây để luật thôi báo nhầm, không phải để cho phép lệch.
 *
 * Con số là số cờ trong tệp đó. Thêm một cờ mới là phải đọc nó rồi ghi ra đây.
 */
const CO_MAU = new Map([
  ['components/ascnd/readiness-aura.tsx', [1, '`const paper = !m.lit` — chỉ chọn `paint`, `second` và `alpha`; thân hàm dựng y hệt số node ở hai theme']],
  ['components/ascnd/assistant-aura.tsx', [1, '`const paper = !m.lit` — chỉ chọn `colour` và `peak` của vũng sáng']],
  ['components/ascnd/liquid-glass.tsx', [1, '`const washAt = m.lit ? 1 : 0` — nhân vào `stopOpacity` của lớp wash; các node của wash dựng ở cả hai theme']],
  ['components/ascnd/dashboard-cards.tsx', [1, '`tileBg = (k) => m.lit ? null : alpha(graphicOf(c, k), 0.1)` — chỉ chọn MÀU NỀN của ô macro. '
    + 'Bốn ô dựng y hệt ở hai theme; bản tối nhận `null` và rơi về `m.inset.bg` như cũ. Nền tô chỉ có trên giấy vì phép đo '
    + 'ở `macroTile` chứng minh nền không vẽ được ô trên mặt thẻ #0e0e11 (1.015 → 1.077 khi alpha đi từ 0.2 lên 0.9), '
    + 'ràng buộc không tồn tại trên #ffffff']],
])

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(e)) files.push(p);
  }
})(ROOT);

const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));

/**
 * Một dòng có đổi HÌNH DẠNG cây không.
 *
 * `if (!m.lit) return null` — cả component biến mất.
 * `{m.lit ? (`             — một cây con JSX dựng-hoặc-không.
 * `const x = … m.lit …`    — một cờ dẫn xuất; tính là hình dạng vì nó gần như
 *                            luôn được dùng để gác JSX, và đoán ngược lại là
 *                            đoán về phía im lặng.
 * Mọi thứ khác (`color: m.lit ? a : b`) là MÀU, không tính.
 */
const SHAPE = [
  /if\s*\(\s*!\s*m\.lit\s*\)\s*return\s+null/,
  /* `{m.lit ? (` ở vị trí CON của JSX — một cây con dựng-hoặc-không.
     KHÔNG phải `color={m.lit ? a : b}`: dấu `=` ngay trước ngoặc nhọn nói đó là
     một thuộc tính, tức một MÀU. Bản đầu của luật này gộp cả hai và báo nhầm
     `awards.tsx` ba lần — ba dòng chọn sắc vàng theo diện mạo, không dựng thêm
     hay bớt một node nào. */
  /(^|[^=])\{\s*m\.lit\s*\?\s*\(\s*$/,
  /^\s*const\s+\w+\s*=\s*[^;]*\bm\.lit\b/,
];

const found = new Map();
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const lines = strip(readFileSync(f, 'utf8')).split('\n');
  const hits = [];
  lines.forEach((l, i) => {
    if (!/\bm\.lit\b/.test(l)) return;
    /* Hai dạng đầu là cổng DỰNG; dạng thứ ba là một cờ dẫn xuất. Phân biệt
       ngay lúc quét, vì hai loại đi hai đường xử lý khác nhau. */
    if (SHAPE[0].test(l) || SHAPE[1].test(l)) hits.push({ line: i + 1, gate: true });
    else if (SHAPE[2].test(l)) hits.push({ line: i + 1, gate: false });
  });
  if (hits.length) found.set(rel, hits);
}

const problems = [];
for (const [rel, hits] of found) {
  /* Cổng DỰNG thật: luôn đỏ. Không tra `CO_MAU` — không có ngoại lệ nào ở đây,
     và đó là điểm khác biệt so với bản trước 09/09. */
  const gates = hits.filter((h) => h.gate);
  if (gates.length) {
    problems.push(
      `${rel}: ${gates.length} CỔNG DỰNG theo theme (dòng ${gates.map((h) => h.line).join(', ')}) — ` +
        'hai theme dựng hai cây khác nhau là ĐIỀU KIỆN đã sinh ra A9. Không có danh sách cho phép nữa: ' +
        'dựng node ở CẢ HAI theme rồi tô rỗng ở bản không dùng (opacity 0 / màu trong suốt), ' +
        'và nếu nó có animation thì tắt bằng chính cổng `moving` của nó',
    );
  }
  /* Cờ dẫn xuất: đi qua danh sách, vì luật không đọc được nó dùng để làm gì. */
  const flags = hits.filter((h) => !h.gate);
  if (!flags.length) continue;
  const allowed = CO_MAU.get(rel);
  if (!allowed) {
    problems.push(
      `${rel}: ${flags.length} cờ dẫn xuất từ \`m.lit\` (dòng ${flags.map((h) => h.line).join(', ')}) — chưa có trong CO_MAU. ` +
        'Đọc xem cờ ấy dùng để chọn MÀU hay để gác JSX, rồi ghi ra một dòng lý do; ' +
        'nếu nó gác JSX thì đó là một cổng dựng và phải bỏ, không phải ghi vào danh sách',
    );
  } else if (flags.length !== allowed[0]) {
    problems.push(
      `${rel}: có ${flags.length} cờ (dòng ${flags.map((h) => h.line).join(', ')}), CO_MAU ghi ${allowed[0]} — ` +
        (flags.length > allowed[0]
          ? 'một cờ mới đã được thêm mà chưa ai đọc nó dùng để làm gì'
          : 'một cờ đã bỏ; sửa con số trong danh sách để nó thôi nói dối'),
    );
  }
}
if (!process.env.THEME_SHAPE_ROOT) {
  for (const [rel] of CO_MAU) {
    if (!found.has(rel)) problems.push(`${rel}: không còn cờ nào — bỏ nó khỏi CO_MAU trong tools/theme-shape.mjs`);
  }
}

if (problems.length) {
  console.error('hình dạng cây theo theme:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
const total = [...found.values()].reduce((a, h) => a + h.length, 0);
console.log(
  `hình dạng cây theo theme: ${files.length} tệp · 0 cổng dựng theo theme (cấm hẳn từ 09/09), ` +
    `${total} cờ dẫn xuất ở ${found.size} tệp, mỗi cờ đã đọc và ghi ra nó chọn MÀU gì`,
);
