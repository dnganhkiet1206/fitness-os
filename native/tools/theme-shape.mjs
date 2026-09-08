/**
 * Hai theme được phép khác MÀU. Chỗ chúng khác HÌNH DẠNG CÂY là một danh sách đóng.
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
 * ── nhưng luật KHÔNG phải "cấm lệch" ──
 *
 * Năm nhánh hiện có đều là quyết định hiệu năng có chủ ý, mỗi cái có lý do viết
 * ngay bên cạnh nó: trên giấy, ánh sáng môi trường và các mặt gradient là những
 * lớp `<Svg>` phủ kín màn hình mà không nhìn thấy được. Bắt chúng dựng ra để
 * cho "nhất quán" là trả tiền cho một hiệu ứng vô hình.
 *
 * Nên luật là: **tập hợp các chỗ được phép lệch là một danh sách ĐÓNG.** Thêm
 * một nhánh mới là một quyết định phải viết ra, không phải một dòng lọt vào.
 *
 * ── phân loại, và vì sao phải phân loại ──
 *
 * `m.lit` dùng để chọn MÀU (`color={m.lit ? a : b}`) không đổi hình dạng cây và
 * không liên quan gì tới luật này. Chỉ những chỗ DỰNG-HOẶC-KHÔNG mới tính. Gộp
 * cả hai lại sẽ đóng băng 30 chỗ vô hại và làm luật thành thứ người ta nới ra.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(NATIVE, process.env.THEME_SHAPE_ROOT ?? 'src');

/**
 * Các chỗ được phép dựng khác nhau giữa hai theme, và vì sao.
 *
 * Con số là SỐ NHÁNH đổi hình dạng trong tệp đó. Nó chỉ được đi xuống, hoặc đi
 * lên kèm một dòng lý do mới ở đây.
 */
const CHO_PHEP = new Map([
  ['components/ascnd/ambient-light.tsx', [1, 'trên giấy không có phòng tối nào để thắp: ba lớp <Svg> phủ kín màn hình, lấy mẫu lại mỗi khung hình cuộn, cho một hiệu ứng không đo được']],
  ['components/ascnd/glass-card.tsx', [1, 'mặt gradient chéo là mô hình của KÍNH; trên giấy một dải sáng-tối 8% là một vệt bẩn']],
  ['components/ascnd/readiness-gauge.tsx', [2, 'mép sáng và hào quang của vòng — giấy không phát sáng']],
  ['components/ascnd/assistant-aura.tsx', [2, 'khí quyển phòng tối tắt trên giấy']],
  ['components/ascnd/readiness-aura.tsx', [1, 'cùng lý do với assistant-aura']],
  ['components/ascnd/liquid-glass.tsx', [1, 'lớp wash của kính không tồn tại trên giấy']],
]);

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
    if (SHAPE.some((re) => re.test(l))) hits.push(i + 1);
  });
  if (hits.length) found.set(rel, hits);
}

const problems = [];
for (const [rel, hits] of found) {
  const allowed = CHO_PHEP.get(rel);
  if (!allowed) {
    problems.push(
      `${rel}: ${hits.length} nhánh dựng-hoặc-không theo theme (dòng ${hits.join(', ')}) — chưa có trong danh sách. ` +
        'Hai theme dựng hai cây khác nhau là ĐIỀU KIỆN đã sinh ra A9; thêm một chỗ như thế là một quyết định phải viết ra',
    );
  } else if (hits.length !== allowed[0]) {
    problems.push(
      `${rel}: có ${hits.length} nhánh (dòng ${hits.join(', ')}), danh sách ghi ${allowed[0]} — ` +
        (hits.length > allowed[0]
          ? 'một nhánh mới đã được thêm mà không ai quyết định'
          : 'một nhánh đã bỏ; sửa con số trong danh sách để nó thôi nói dối'),
    );
  }
}
if (!process.env.THEME_SHAPE_ROOT) {
  for (const [rel] of CHO_PHEP) {
    if (!found.has(rel)) problems.push(`${rel}: không còn nhánh nào — bỏ nó khỏi danh sách trong tools/theme-shape.mjs`);
  }
}

if (problems.length) {
  console.error('hình dạng cây theo theme:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
const total = [...found.values()].reduce((a, h) => a + h.length, 0);
console.log(`hình dạng cây theo theme: ${files.length} tệp · ${found.size} tệp được phép lệch, ${total} nhánh, mỗi tệp có lý do viết ra`);
