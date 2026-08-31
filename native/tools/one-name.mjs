/*
  Một khái niệm, một tên — và bản tiếng Việt không được lẫn tiếng Anh.

  ── lỗi này trông như thế nào ──

  Trên MỘT màn hình tạo thực đơn, người dùng đọc được ba tên cho cùng một thứ:

    tiêu đề    "Tạo Meal Plan"       ← i18n.ts
    ô nhập     "Tên plan"            ← i18n.ts
    bước đầu   "Tạo kế hoạch ăn"     ← native-strings.ts

  Và thẻ rỗng ở tab Dinh dưỡng tự mâu thuẫn trong ba dòng liền nhau: thân bài
  giải thích "Thực đơn là vài ngày ăn được viết sẵn…", còn nút bên dưới nó ghi
  "Tạo kế hoạch ăn".

  ── vì sao nó xảy ra ──

  App có HAI bảng chuỗi, `i18n.ts` và `native-strings.ts`, và cả hai cùng vẽ lên
  một màn. Mỗi bảng có từ vựng riêng, không ai đối chiếu, và không có gì hỏng để
  ai đó nhận ra.

  ── vì sao cần công cụ ──

  Không có lỗi, không có cảnh báo, không có điểm ảnh sai. Màn hình dựng đúng như
  thiết kế và chỉ đơn giản là nói ba thứ tiếng cùng lúc. Người viết mỗi chuỗi
  đều thấy chuỗi của mình hợp lý; chỉ người ĐỌC CẢ MÀN mới thấy vấn đề.
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const problems = [];

/*
  Bảng nào là bảng tiếng Việt — xác định theo VÙNG, không theo dấu.

  Bản đầu của luật này nhận diện câu tiếng Việt bằng cách tìm dấu. Nó bỏ lọt
  đúng trường hợp tệ nhất: một chuỗi trong bảng Việt mà TOÀN tiếng Anh —
  `mealPlanTitle: 'Meal Plan'` — vì không có dấu nào để tìm. Tức luật mù đúng
  chỗ lỗi nặng nhất.

  Cả hai tệp đều khai báo `const vi = {` và `const en = {`, nên vùng của bảng
  Việt đọc được thẳng từ cấu trúc. Thứ tự hai bảng khác nhau giữa hai tệp
  (i18n.ts để vi trước, native-strings.ts để en trước), nên phải tìm mốc chứ
  không đếm.
*/
const vùngVi = (src) => {
  const lines = src.split('\n');
  const mở = lines.findIndex((l) => /^const vi\b/.test(l));
  if (mở < 0) return null;
  let đóng = lines.length;
  for (let i = mở + 1; i < lines.length; i++) {
    if (/^\};?/.test(lines[i]) || /^} as const/.test(lines[i])) { đóng = i; break; }
  }
  return [mở, đóng];
};

/*
  Từ KHÔNG được xuất hiện trong bảng tiếng Việt, kèm từ thay thế.

  ── từ chuẩn đã đổi một lần, và ghi lại ở đây ──

  Vòng đầu chọn "thực đơn" vì nó là nhãn của tab và là từ trong câu định nghĩa.
  Chủ sản phẩm đổi lại thành "kế hoạch ăn", và lý do đúng: thứ này là BẢY NGÀY
  có ô bữa, tức một kế hoạch — còn "thực đơn" là danh sách món của một bữa hoặc
  một quán. Cái tên phải mô tả thứ nó làm.

  Luật không quan tâm từ nào được chọn; nó chỉ ép rằng chỉ có MỘT từ. Đổi từ
  chuẩn là sửa hai dòng dưới đây, và luật sẽ chỉ ra mọi chỗ còn sót.
*/
const CẤM = [
  [/\bmeal plans?\b/i, 'kế hoạch ăn'],
  [/\bshopping list\b/i, 'danh sách đi chợ'],
  [/\bthực đơn\b/i, 'kế hoạch ăn'],
];

for (const f of ['src/lib/i18n.ts', 'src/lib/native-strings.ts']) {
  const src = read(f);
  const vùng = vùngVi(src);
  if (!vùng) { problems.push(`${f}: không tìm thấy bảng \`const vi\``); continue; }
  const [mở, đóng] = vùng;
  const lines = src.split('\n');
  for (let i = mở + 1; i < đóng; i++) {
    const m = /^\s*(\w+): '([^']*)',?\s*$/.exec(lines[i]);
    if (!m) continue;
    const [, key, text] = m;
    for (const [bad, thay] of CẤM) {
      const hit = bad.exec(text);
      if (hit) {
        problems.push(
          `${f}:${i + 1}: \`${key}\` — chuỗi trong bảng TIẾNG VIỆT chứa "${hit[0]}", phải là "${thay}": "${text.slice(0, 44)}"`,
        );
      }
    }
  }
}

if (problems.length) {
  console.log('một khái niệm nhiều tên — CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'một khái niệm một tên OK — trong BẢNG tiếng Việt không chuỗi nào còn gọi kế hoạch ăn là "meal plan" hay ' +
    '"thực đơn", và không chuỗi nào gọi danh sách đi chợ là "shopping list". Bảng tiếng Anh không bị ' +
    'đụng tới: luật khoanh vùng theo `const vi` chứ không theo dấu, nên nó thấy cả một chuỗi TOÀN tiếng Anh nằm nhầm bảng',
);
