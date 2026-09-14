/**
 * Bộ chọn ngày của hệ thống đi qua ĐÚNG MỘT cửa.
 *
 *     node tools/date-field.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Mười chỗ trong năm tệp gọi `<DateTimePicker>` với `themeVariant="dark"` GÕ
 * CỨNG. Đây là một component NATIVE: cờ ấy bảo UIKit tô nó bằng bảng màu chế
 * độ tối — chữ sáng trên nền mờ — và app thì có bản sáng. Trên máy thật, viên
 * nang ngày trong sheet "Nhập số đo" hiện ra là chữ TRẮNG trên nền XÁM NHẠT,
 * giữa một trang giấy. Chủ dự án chụp lại và hỏi.
 *
 * ── vì sao không cửa nào bắt được ──
 *
 * Mọi luật màu của kho này đọc `StyleSheet` của React Native:
 *
 *   `text-color`, `same-color`, `ink-alpha`, `palette`, `role-split`
 *
 * `themeVariant` không phải một màu. Nó là một chỉ thị gửi sang UIKit, và màu
 * thật do hệ điều hành chọn ở phía bên kia — nên không có gì để đo trong mã.
 * `tsc` thấy một literal hợp lệ. Và `live.mjs` không thấy vì trên web gói này
 * dựng ra một `<input type="date">` của trình duyệt, không phải cái viên nang
 * ấy: đây là một trong số ít thứ **chỉ máy thật mới lộ**.
 *
 * ── luật ──
 *
 * 1. Chỉ `components/ascnd/date-field.tsx` được import
 *    `@react-native-community/datetimepicker`. Mười chỗ gõ cùng một hằng là
 *    mười chỗ sẽ lệch nhau; một cửa thì diện mạo được quyết một lần.
 *
 * 2. Cửa ấy phải THẬT SỰ theo diện mạo — `themeVariant` lấy từ `m.lit`, không
 *    phải một chuỗi. Một cửa duy nhất mà vẫn gõ cứng thì nó chỉ gom lỗi lại
 *    một chỗ chứ không sửa gì.
 *
 * 3. Và nó phải truyền `accentColor`. Ở dạng `compact`, UIDatePicker vẽ ngày
 *    thành một viên nang tô bằng TINT của app — cái màu nói "bấm được". Bỏ
 *    trống thì iOS dùng lơ mặc định của hệ thống, tức một màu không thuộc bảng
 *    màu nào của app này.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { NATIVE } from './lib/stack.mjs';

const DOOR = 'src/components/ascnd/date-field.tsx';
const PKG = '@react-native-community/datetimepicker';
const problems = [];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx?$/.test(f));

/* Chú thích được xoá trước khi quét: tệp cửa KỂ LẠI lỗi bằng chính chuỗi
   `themeVariant="dark"`, và một luật đỏ vì tài liệu sẽ bị tắt đi. Cùng bài học
   `one-definition.mjs` đã ghi. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));

let outside = 0;
for (const rel of files) {
  if (rel === DOOR) continue;
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));
  if (src.includes(PKG)) {
    outside++;
    problems.push(
      `${rel} import thẳng \`${PKG}\` — chỉ \`${DOOR}\` được làm thế. ` +
        'Mỗi chỗ gọi trực tiếp là một chỗ phải tự nhớ truyền `themeVariant`, và mười chỗ như thế ' +
        'đã cùng gõ cứng `"dark"` trên một app CÓ bản sáng',
    );
  }
  if (/themeVariant\s*=/.test(src)) {
    problems.push(
      `${rel} tự đặt \`themeVariant\` — diện mạo của bộ chọn ngày được quyết ở \`${DOOR}\`, một lần`,
    );
  }
}

const door = strip(readFileSync(path.join(NATIVE, DOOR), 'utf8'));
if (!door.includes(PKG)) {
  problems.push(`${DOOR} không còn import \`${PKG}\` — cửa đã dời, sửa luật này chứ đừng để nó canh một tệp trống`);
} else {
  if (!/themeVariant=\{[^}]*\bm\.lit\b/.test(door)) {
    problems.push(
      `${DOOR}: \`themeVariant\` không đọc từ \`m.lit\` — một cửa duy nhất mà vẫn gõ cứng thì nó gom ` +
        'lỗi lại một chỗ chứ không sửa gì. Đây đúng là hình dạng của lỗi vừa xảy ra',
    );
  }
  if (!/accentColor=\{/.test(door)) {
    problems.push(
      `${DOOR}: thiếu \`accentColor\` — ở dạng compact, UIDatePicker tô viên nang ngày bằng TINT của ` +
        'app, và bỏ trống thì iOS dùng lơ mặc định của hệ thống, một màu không thuộc bảng màu nào của app này',
    );
  }
}

if (problems.length) {
  console.error('bộ chọn ngày có hai cửa:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `bộ chọn ngày OK — quét ${files.length} tệp: không tệp nào ngoài \`${DOOR}\` import ` +
    `\`${PKG}\` hay tự đặt \`themeVariant\` (${outside} vi phạm), và cửa ấy lấy diện mạo từ \`m.lit\` ` +
    'cộng một `accentColor` của app. Luật này canh một thứ KHÔNG đo được trong mã — `themeVariant` là ' +
    'chỉ thị gửi sang UIKit, màu do hệ điều hành chọn ở phía bên kia — nên năm luật màu của kho đều ' +
    'không có thẩm quyền, và `live.mjs` cũng không thấy vì trên web gói này dựng ra một `<input>` của ' +
    'trình duyệt. Đây là một trong số ít thứ chỉ máy thật mới lộ',
);
