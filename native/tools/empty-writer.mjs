/**
 * Một cột chỉ được ghi bằng HẰNG SỐ RỖNG là một màn hình tắt vĩnh viễn.
 *
 *     node tools/empty-writer.mjs
 *
 * ── lỗi nó sinh ra để sửa, và ai tìm ra nó ──
 *
 * Chủ dự án hỏi ô báo đau nằm ở đâu. Nó không nằm ở đâu cả:
 *
 *     ghi   `use-fitness-data.ts`  `pain_flags: []`  ← gõ cứng, mọi buổi tập
 *     đọc   `today-widgets-2.tsx`  lọc `pain_0_10 > 0`
 *     đọc   `weekly-review.tsx`    lọc `pain_0_10 >= 5`
 *     nhập  — không có màn nào —
 *
 * Nên hai tính năng đã tắt từ ngày chúng ra đời: hàng cảnh báo đau trên thẻ Tập
 * luyện, và một lời khuyên trong Tổng kết tuần. Chúng dựng được, không lỗi, chỉ
 * là mảng chúng lọc không bao giờ có phần tử.
 *
 * ── vì sao `activity.mjs` không bắt được ──
 *
 * Luật ấy canh đúng lớp này và ghi rõ hình dạng: *"a screen reading a column
 * with no writer… It typechecks, it renders, it is simply always zero."* Nhưng
 * nó hỏi "cột này có ai GHI không", và ở đây câu trả lời là CÓ. Người ghi tồn
 * tại; nó chỉ luôn ghi một mảng rỗng.
 *
 * Một dòng `pain_flags: []` thoả mọi câu hỏi về nguồn gốc mà vẫn không mang
 * thông tin nào. Đó là vùng mù nằm giữa "không ai ghi" và "có người ghi".
 *
 * ── luật ──
 *
 * Trong một lệnh `.insert(...)`/`.update(...)` của Supabase, một trường được
 * gán một hằng rỗng — `[]` hoặc `{}` — là đỏ. Không phải vì giá trị ấy sai, mà
 * vì nó là dấu hiệu duy nhất trong mã của một đường dữ liệu chưa nối: nếu cột
 * ấy thật sự luôn rỗng thì nó không cần được ghi, và nếu nó không luôn rỗng thì
 * chỗ này đang chặn mất dữ liệu.
 *
 * `null` KHÔNG bị bắt, và đó là một phân biệt có ý nghĩa mà repo này đã ghi lại
 * nhiều lần: `0`/`[]` nói "đã xảy ra và bằng không", `null` nói "không đo
 * được". Một cột được ghi `null` có chủ đích là một lời khai trung thực; một
 * cột được ghi `[]` là một lời hứa rằng dữ liệu sẽ tới.
 *
 * ── vì sao không cửa nào khác bắt được ──
 *
 *   `tsc`              `[]` hợp kiểu với `Json | null`
 *   `dead-schema.mjs`  hỏi BẢNG có ai đọc/ghi không, không hỏi từng cột
 *   `activity.mjs`     hỏi cột có ai ghi không — ở đây là có
 *   `live.mjs`         chụp một màn hình mà phần ấy không hiện; không hiện
 *                      trông y hệt như "hôm nay không có gì để hiện"
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { NATIVE } from './lib/stack.mjs';

/**
 * Những chỗ ghi rỗng CÓ CHỦ ĐÍCH, mỗi chỗ kèm lý do.
 *
 * Cùng khuôn `COMPOSED` của `motion.mjs`: một ngoại lệ chỉ đáng tin khi nó
 * phải viết ra lý do, và một lý do chỉ đáng tin khi có ai đó kiểm rằng thứ nó
 * mô tả còn tồn tại — nên phần cuối tệp này bắt lỗi cả một ngoại lệ đã mồ côi.
 *
 * Ranh giới giữa "rỗng vì chưa nối" và "rỗng vì đúng là rỗng" không đo được từ
 * mã, nên nó phải do người viết khai. Cái luật làm được là bắt người ta KHAI.
 */
const DELIBERATE = {
  'src/hooks/use-health-sync.ts': {
    sets: 'một buổi chạy nhập từ đồng hồ KHÔNG có set nào, và mảng rỗng ấy là thứ '
      + '`lib/session-load.ts` dựa vào để trả `null` thay vì 0 — nhờ thế buổi ấy bị loại khỏi cả hai vế '
      + 'của tỉ lệ cấp/mạn thay vì kéo trung bình xuống như một buổi tốn-không-gì. Chú thích ngay trên '
      + 'lệnh ghi gọi đúng tên: "the honest values, not placeholders"',
  },
};

const problems = [];
const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE, encoding: 'utf8',
}).split('\n').filter((f) => /\.tsx?$/.test(f));

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/.*$/gm, (m) => ' '.repeat(m.length));

/** Thân của một lời gọi `.insert(` / `.update(` / `.upsert(`, cắt theo ngoặc cân bằng. */
function* writes(src) {
  for (const m of src.matchAll(/\.(insert|update|upsert)\(/g)) {
    let i = m.index + m[0].length;
    let d = 1;
    while (i < src.length && d > 0) {
      if (src[i] === '(') d++;
      else if (src[i] === ')') d--;
      i++;
    }
    yield { op: m[1], body: src.slice(m.index, i), at: m.index };
  }
}

let scanned = 0;
let waived = 0;
for (const rel of files) {
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));
  for (const w of writes(src)) {
    scanned++;
    for (const f of w.body.matchAll(/(\w+):\s*(\[\s*\]|\{\s*\})\s*[,}]/g)) {
      if (DELIBERATE[rel]?.[f[1]]) { waived++; continue; }
      const line = src.slice(0, w.at).split('\n').length;
      problems.push(
        `${rel}:${line} \`.${w.op}(…)\` ghi \`${f[1]}: ${f[2]}\` — một hằng RỖNG gõ cứng. `
          + 'Cột ấy sẽ không bao giờ có phần tử nào, nên mọi màn đọc nó đều tắt vĩnh viễn: dựng được, '
          + 'không lỗi, và không bao giờ có gì để hiện. Đó đúng hình dạng của `pain_flags`, thứ hai màn '
          + 'đã lọc suốt từ ngày chúng ra đời. Nếu cột thật sự luôn rỗng thì đừng ghi nó; nếu không thì '
          + 'nối nốt đường dữ liệu. Muốn khai "không đo được" thì `null` mới là chữ đúng — `[]` nói '
          + '"đã xảy ra và bằng không"',
      );
    }
  }
}

/* Một lý do sống lâu hơn thứ nó mô tả thì nó chỉ còn là một câu sai nằm trong
   tệp — cùng phép gác mà `motion.mjs` đặt cho `COMPOSED`. */
for (const [rel, fields] of Object.entries(DELIBERATE)) {
  if (!files.includes(rel)) {
    problems.push(`DELIBERATE còn ghi ${rel} nhưng tệp đó không còn — xoá mục ấy đi`);
    continue;
  }
  const src = strip(readFileSync(path.join(NATIVE, rel), 'utf8'));
  for (const field of Object.keys(fields)) {
    if (!new RegExp(`${field}:\\s*(\\[\\s*\\]|\\{\\s*\\})`).test(src)) {
      problems.push(
        `DELIBERATE còn ghi \`${rel}\` ghi rỗng \`${field}\` nhưng không còn nữa — xoá dòng ngoại lệ đi`,
      );
    }
  }
}

if (!scanned) {
  problems.push(
    'không tìm thấy một lệnh `.insert`/`.update`/`.upsert` nào — cách gọi cơ sở dữ liệu đã đổi, và luật '
      + 'này mất mục tiêu. Đọc lại chú thích đầu tệp rồi sửa hoặc xoá nó, đừng để nó xanh suông',
  );
}

if (problems.length) {
  console.error('một cột chỉ được ghi bằng hằng rỗng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `người ghi rỗng OK — quét ${scanned} lệnh ghi cơ sở dữ liệu, không lệnh nào gán một hằng \`[]\` hay `
    + `\`{}\` cho một cột (${waived} chỗ được miễn kèm lý do). ` +
      'Đây là vùng mù nằm GIỮA hai luật đã có: `dead-schema` hỏi cả BẢNG có ai dùng '
    + 'không, `activity` hỏi một cột có ai GHI không — và `pain_flags` trả lời "có" cho cả hai trong khi '
    + 'hai màn đọc nó đã tắt vĩnh viễn. `null` không bị đụng tới, vì "không đo được" là một lời khai '
    + 'trung thực còn `[]` là một lời hứa rằng dữ liệu sẽ tới',
);
