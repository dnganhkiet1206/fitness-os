/**
 * Một màn hình BIẾT ngày thì không được điều hướng đi mà bỏ ngày lại.
 *
 * ── lỗi sinh ra luật này ──
 *
 * Nhật ký bữa ăn học được cách mở một ngày đã qua (`/diary`). Cùng lúc ấy,
 * một vòng khác thêm cử chỉ vuốt cho thẻ bữa ăn, trong đó tấm "Thêm" gọi:
 *
 *     nav.push(`/log-meal?meal=${g.type}`)
 *
 * Dòng ấy đúng vào ngày nó được viết, vì khi đó nhật ký chỉ có hôm nay. Sau
 * khi hai vòng gặp nhau nó thành: vuốt Thêm trên Bữa trưa của thứ Ba sẽ ghi
 * một bữa trưa vào HÔM NAY. Không lỗi, không cảnh báo, và sai ở HAI ngày cùng
 * lúc — thứ Ba thiếu bữa người ta vừa định thêm, hôm nay mọc thêm một bữa
 * không ai ăn.
 *
 * Không một luật nào trong repo bắt được nó, và cả `tsc` lẫn `live.mjs` đều
 * xanh: `/log-meal?meal=lunch` là một URL hoàn toàn hợp lệ.
 *
 * ── vì sao luật này KHÔNG có danh sách miễn ──
 *
 * Cách dễ là bắt mọi lời gọi tới `/log-meal` phải mang `date=`, rồi miễn cho
 * năm lối vào vốn dĩ là hôm nay (bốn ô ghi bữa ở tab, hành động trên Hôm nay,
 * hai màn quét). Năm miễn trên tám chỗ thì cái lưới ấy gần như chỉ còn là danh
 * sách.
 *
 * Luật này tự giới hạn phạm vi thay vì miễn trừ: nó chỉ soi những tệp CÓ NGÀY
 * TRONG TAY. Một tệp không biết ngày nào thì không thể đánh rơi ngày; một tệp
 * biết mà vẫn đi tay không thì không có lý do nào đúng cả. Và nếu ngày mai ai
 * đó dạy cho `meal-log-actions.tsx` biết ngày, luật tự bật lên ở đó, không cần
 * ai nhớ sửa danh sách.
 *
 * ── đích đến được ĐỌC RA, không gõ tay ──
 *
 * Tập "màn nhận `?date=`" lấy từ chính `useLocalSearchParams<{ … date … }>`
 * trong `src/app/`. Gõ tay `['/log-meal']` là để lần sau ai thêm một màn nhận
 * ngày nữa thì luật im lặng với đúng màn mới ấy.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = process.env.DAY_CARRY_ROOT ?? 'src';

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ROOT], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

/** chú thích đi, chuỗi ở lại — tên route nằm trong chuỗi */
function stripComments(src) {
  let out = '';
  for (let i = 0; i < src.length; ) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < src.length && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (two === '/*') {
      while (i < src.length && src.slice(i, i + 2) !== '*/') { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch; i++;
      while (i < src.length) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === ch) { i++; break; }
        i++;
      }
      continue;
    }
    out += ch; i++;
  }
  return out;
}

const read = (f) => stripComments(readFileSync(path.join(NATIVE, f), 'utf8'));

/* ── 1. những màn THẬT SỰ nhận `?date=`, đọc từ nguồn ── */
const dateRoutes = new Set();
for (const f of files) {
  if (!/^src\/app\//.test(f)) continue;
  const src = read(f);
  const m = src.match(/useLocalSearchParams<\{([^}]*)\}>/);
  if (!m || !/\bdate\s*\??\s*:/.test(m[1])) continue;
  /* `src/app/foo.tsx` → `/foo`; `src/app/(tabs)/foo.tsx` → `/foo` */
  const route =
    '/' + f.replace(/^src\/app\//, '').replace(/\.tsx?$/, '').replace(/\([^)]*\)\//g, '').replace(/\/index$/, '');
  dateRoutes.add(route);
}
if (dateRoutes.size === 0) {
  console.error('mang ngày theo: không tìm thấy màn nào nhận `?date=` — bộ quét lạc mục tiêu, đừng tin kết quả');
  process.exit(1);
}

/* ── 2. một tệp có BIẾT ngày không ──
   Hai dấu hiệu, cả hai đều là "ngày đang nằm trong tay tệp này": nó tự so ngày
   (`isToday`), hoặc nó truyền một biến ngày xuống một hook có tham số ngày.
   Hook nào có tham số ấy thì đọc ra từ `src/hooks/`, không gõ tay. */
const datedHooks = new Set();
for (const f of files) {
  if (!/^src\/hooks\//.test(f)) continue;
  for (const m of read(f).matchAll(/export function (use\w+)\(\s*date\?\s*:\s*string/g)) {
    datedHooks.add(m[1]);
  }
}
if (datedHooks.size === 0) {
  console.error('mang ngày theo: không tìm thấy hook nào nhận `date?` — bộ quét lạc mục tiêu');
  process.exit(1);
}
const HOOK_CALL = new RegExp(`\\b(?:${[...datedHooks].join('|')})\\(\\s*[A-Za-z_$]`);

const problems = [];
let aware = 0;
let checked = 0;

for (const f of files) {
  const src = read(f);
  const dayAware = /\bisToday\b/.test(src) || HOOK_CALL.test(src);
  if (!dayAware) continue;
  aware++;

  /* Mọi lời gọi điều hướng trong tệp, lấy nguyên biểu thức trong ngoặc — nên
     một ternary `isToday ? A : B` được đọc như MỘT chỗ, đúng cách nó chạy. */
  for (const m of src.matchAll(/\bnav\.(?:push|replace)\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    let depth = 0;
    let end = open;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    const call = src.slice(open, end + 1);
    const hit = [...dateRoutes].find((r) => new RegExp(`['\`]${r}(\\?|['\`])`).test(call));
    if (!hit) continue;
    checked++;
    if (/\bdate=/.test(call)) continue;
    const line = src.slice(0, m.index).split('\n').length;
    problems.push(
      `${f}:${line}: đi tới \`${hit}\` mà KHÔNG mang \`date=\` — tệp này có ngày trong tay ` +
        `(${/\bisToday\b/.test(src) ? 'tự so `isToday`' : 'truyền ngày xuống hook'}), nên bỏ ngày lại ở đây ` +
        'nghĩa là thao tác trên một ngày đã qua sẽ ghi vào HÔM NAY — sai ở hai ngày cùng lúc, và không báo gì. ' +
        `Gọi: ${call.replace(/\s+/g, ' ').slice(0, 110)}`,
    );
  }
}

if (problems.length) {
  console.error('mang ngày theo:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `mang ngày theo OK — ${dateRoutes.size} màn nhận \`?date=\` (${[...dateRoutes].join(', ')}), đọc ra từ ` +
    `useLocalSearchParams chứ không gõ tay; ${datedHooks.size} hook có tham số ngày; ${aware} tệp CÓ ngày ` +
    `trong tay, và cả ${checked} lời điều hướng của chúng tới các màn ấy đều mang ngày theo. ` +
    'Luật không có danh sách miễn: tệp không biết ngày thì không thể đánh rơi ngày, và một tệp học được ' +
    'cách biết ngày sẽ tự bị soi mà không ai phải nhớ ghi thêm dòng nào',
);
