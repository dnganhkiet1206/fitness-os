/**
 * Một truy vấn về HÔM NAY phải có người làm nó cũ đi.
 *
 *     node tools/today-fresh.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Chủ dự án: "thẻ hoạt động ở dashboard hiện dữ liệu từ việc log bị chậm, bắt
 * buộc phải refresh thì mới hiện".
 *
 * Đi đọc thì hai khoá nuôi thẻ ấy — `today_training_minutes` và
 * `today_active_kcal` — xuất hiện đúng MỘT lần mỗi cái trong cả kho, ở chỗ khai
 * báo. Không một lượt ghi nào làm chúng cũ đi. Chúng đọc `workout_sessions` của
 * hôm nay, tức đổi ngay khi một buổi tập được ghi, nhưng React Query thì không
 * biết điều đó — nó chỉ nạp lại lúc mount hoặc khi bị kéo. Mà dashboard đang MỞ
 * SẴN lúc buổi tập được ghi, nên "lúc mount" không bao giờ tới.
 *
 * ── vì sao không cửa nào bắt được ──
 *
 *   `tsc`             một khoá là một mảng chuỗi hợp lệ
 *   mọi luật màu      không liên quan
 *   `live.mjs`        chụp một màn hình MỚI MỞ, tức đúng cái ca duy nhất mà
 *                     lỗi này không xảy ra
 *
 * Cái cuối là chỗ đau: ảnh chụp không bao giờ thấy được lỗi này, vì mỗi ảnh là
 * một lần mount. Lỗi chỉ tồn tại ở màn hình ĐANG mở khi việc ghi xảy ra.
 *
 * ── luật, và vì sao nó hẹp đúng chỗ này ──
 *
 * Đo trước: cả kho khai báo 60 khoá, 14 khoá không ai làm mới. Mười hai trong
 * số đó nằm trên màn báo cáo mở-ra-là-nạp (`wr_*` của Tổng kết tuần, `sg_*` của
 * Mục tiêu, `grocery_meal_plan`) — mở lên là mount, mount là nạp, nên "không ai
 * làm mới" ở đó không phải lỗi. Một luật bắt cả 14 sẽ là một luật kêu 12 lần
 * oan, và một luật kêu oan là một luật bị tắt.
 *
 * Tiền tố `today_` là chỗ ranh giới tự nó rõ: cái tên ấy TUYÊN BỐ rằng câu trả
 * lời là một hàm của dữ liệu hôm nay, và dữ liệu hôm nay là thứ duy nhất trong
 * app này đổi ngay dưới chân một màn đang mở. Tám khoá mang tiền tố ấy; sáu cái
 * đã có người làm mới, hai cái không — đúng hai cái chủ dự án nhìn thấy.
 *
 * "Có người làm mới" tính cả hai kiểu, vì cả hai đều đúng việc:
 *
 *   - nằm trong `lib/today-keys.ts`, danh sách mà mọi lượt ghi map qua;
 *   - hoặc có một `invalidateQueries`/`setQueryData` gọi đích danh ở đâu đó —
 *     `today_water_logs` là ca ấy, và nó ĐÚNG: thứ duy nhất đổi nó là chính
 *     hai lượt ghi nước, và chúng tự gọi tên nó.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { NATIVE } from './lib/stack.mjs';

const LIST = 'src/lib/today-keys.ts';
const problems = [];

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx?$/.test(f));

/** Khoá được khai báo ở đâu: `queryKey: ['x', …]`. */
const declared = new Map();
/** Khoá được gọi đích danh ở một chỗ làm mới nào đó. */
const refreshed = new Set();

for (const rel of files) {
  if (rel === LIST) continue;
  const src = readFileSync(path.join(NATIVE, rel), 'utf8');
  for (const m of src.matchAll(/queryKey:\s*\[\s*'([A-Za-z0-9_-]+)'/g)) {
    if (!declared.has(m[1])) declared.set(m[1], rel);
  }
  for (const re of [
    /invalidateQueries\(\s*\{\s*queryKey:\s*\[\s*'([A-Za-z0-9_-]+)'/g,
    /removeQueries\(\s*\{\s*queryKey:\s*\[\s*'([A-Za-z0-9_-]+)'/g,
    /setQueryData\(\s*\[\s*'([A-Za-z0-9_-]+)'/g,
  ]) {
    for (const m of src.matchAll(re)) refreshed.add(m[1]);
  }
}

/* Danh sách trung tâm, đọc riêng — mọi lượt ghi map qua nó. */
const listSrc = readFileSync(path.join(NATIVE, LIST), 'utf8');
/* Chú thích bị xoá trước khi quét: tệp ấy KỂ LẠI lỗi bằng chính tên hai khoá,
   và một luật đọc cả chú thích sẽ xanh nhờ tài liệu. Cùng bài học
   `one-definition.mjs` và `date-field.mjs` đã ghi. */
const listBody = listSrc.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');
const inList = new Set([...listBody.matchAll(/\[\s*'([A-Za-z0-9_-]+)'/g)].map((m) => m[1]));

if (inList.size < 5) {
  problems.push(
    `${LIST} chỉ còn ${inList.size} khoá — danh sách trung tâm đã bị rút ruột hoặc viết lại theo hình `
      + 'dạng khác, nên luật này đang đọc một thứ không còn là danh sách. Sửa luật, đừng để nó xanh suông',
  );
}

const today = [...declared].filter(([k]) => k.startsWith('today_'));
if (!today.length) {
  problems.push(
    'không còn khoá nào mang tiền tố `today_` — quy ước đặt tên đã đổi, và luật này mất mục tiêu',
  );
}

for (const [key, where] of today) {
  if (inList.has(key) || refreshed.has(key)) continue;
  problems.push(
    `\`${key}\` (${where}) là một truy vấn về HÔM NAY mà KHÔNG AI làm nó cũ đi — không có trong `
      + `\`${LIST}\`, và không chỗ nào gọi đích danh nó trong \`invalidateQueries\`/\`setQueryData\`. `
      + 'Nghĩa là sau một lượt ghi, màn hình ĐANG MỞ giữ nguyên con số cũ cho tới khi người dùng tự kéo '
      + 'để làm mới. Ảnh chụp không thấy được điều này: mỗi ảnh là một lần mount, tức đúng ca duy nhất mà '
      + 'lỗi không xảy ra. Đây chính là hình dạng của lỗi "thẻ hoạt động hiện chậm"',
  );
}

if (problems.length) {
  console.error('truy vấn về hôm nay không ai làm mới:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `hôm nay còn tươi OK — ${today.length} khoá mang tiền tố \`today_\`, mỗi cái đều có người làm nó cũ đi: `
    + `${[...today].filter(([k]) => inList.has(k)).length} nằm trong \`${LIST}\` (danh sách mọi lượt ghi map `
    + `qua) và ${[...today].filter(([k]) => !inList.has(k)).length} được gọi đích danh ở chỗ ghi của riêng nó. `
    + 'Luật hẹp đúng ở tiền tố ấy có lý do đo được: cả kho khai báo '
    + `${declared.size} khoá và 14 khoá không ai làm mới, nhưng 12 trong số đó sống trên màn báo cáo `
    + 'mở-ra-là-mount — bắt cả 14 là kêu oan 12 lần, và một luật kêu oan là một luật bị tắt. Đây cũng là '
    + 'thứ `live.mjs` không bao giờ thấy: mỗi ảnh chụp là một lần mount',
);
