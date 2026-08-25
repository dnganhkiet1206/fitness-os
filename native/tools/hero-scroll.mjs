/**
 * Bốn thứ về hero khi cuộn, và cả bốn đều là lỗi đã xảy ra trên máy thật.
 *
 * Không có cái nào bộ chạy web thấy được: chúng chỉ hiện ra khi có một ngón tay
 * thật kéo trên một màn hình thật, và cả bốn lần đều là người dùng báo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const TODAY = 'src/app/(tabs)/index.tsx';
const DECK = 'src/components/ascnd/card-deck.tsx';
const today = strip(read(TODAY));
const deck = strip(read(DECK));
const problems = [];
const num = (src, name) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
};

/* ── 1. một cú vuốt hơi xiên không được bị giết ──

   `failOffsetY` làm pan thất bại VĨNH VIỄN cho cú chạm đó. Đặt nó bằng ngưỡng
   ngang nghĩa là lệch dọc 13px trong lúc đi ngang 12px là mất cú vuốt — và khi
   phần chi tiết mở, tấm cao hơn hẳn nên tay ai cũng lệch. Người dùng báo: "mở
   thẻ phụ thì không vuốt sang thẻ khác được". */
{
  const x = num(deck, 'HYSTERESIS');
  const y = num(deck, 'GIVE_UP_Y');
  if (x === null || y === null) problems.push(`${DECK}: không đọc được HYSTERESIS/GIVE_UP_Y`);
  else if (y <= x) {
    problems.push(
      `${DECK}: GIVE_UP_Y (${y}) không lớn hơn HYSTERESIS (${x}) — một cú vuốt ngang hơi xiên sẽ bị ` +
        'bỏ hẳn trước khi kịp giành quyền, và pan thất bại là VĨNH VIỄN cho cú chạm đó',
    );
  }
}

/* ── 2. hộp chứa không có gì để chứa thì không được vẽ ──

   Ở chế độ tập trung mọi thứ trong tấm bị ẩn, nhưng tấm vẫn vẽ blur, bo góc và
   padding — một tấm kính rỗng ruột dưới vòng tròn. Người dùng mô tả nó là "một
   mảnh của màn hình khác lọt vào". */
{
  const at = today.indexOf('styles.sheet');
  const before = at > 0 ? today.slice(Math.max(0, at - 200), at) : '';
  if (at < 0) problems.push(`${TODAY}: không tìm thấy tấm nội dung`);
  else if (!/!heroOpen/.test(before)) {
    problems.push(
      `${TODAY}: tấm nội dung vẽ cả khi chi tiết đang mở — ruột nó đã bị ẩn, nên còn lại là một hộp ` +
        'kính rỗng. Một hộp chứa không có gì để chứa thì không phải một hộp chứa',
    );
  }
}

/* ── 3. hero phải phản hồi từ pixel đầu tiên ──

   Mốc mờ bắt đầu ở 0. Bắt đầu muộn thì suốt phần lớn quãng cuộn vòng tròn đứng
   y nguyên và cú cuộn không có phản hồi nào. */
{
  const m = today.match(/opacity: interpolate\(\s*scrollY\.value,\s*\[([^\]]*)\]/);
  if (!m) problems.push(`${TODAY}: không tìm thấy phép mờ của hero`);
  else {
    const first = m[1].split(',')[0].trim();
    if (first !== '0') {
      problems.push(
        `${TODAY}: hero bắt đầu mờ ở ${first} chứ không phải 0 — cú cuộn không có phản hồi nào cho tới mốc đó`,
      );
    }
  }
}

/* ── 4. đổi chế độ phải đưa trang về đầu ──

   Thu lại gỡ cả dashboard ra khỏi cây, chiều cao nội dung co đột ngột, và
   ScrollView kẹp vị trí cuộn về mốc gần nhất còn hợp lệ. Người dùng thấy một cú
   trôi mình không ra lệnh. */
{
  const at = today.indexOf('const toggleHero');
  const body = at < 0 ? '' : today.slice(at, at + 320);
  if (!/scrollTo\(\s*\{\s*y:\s*0/.test(body)) {
    problems.push(
      `${TODAY}: toggleHero không đưa trang về đầu — chiều cao nội dung đổi đột ngột thì ScrollView ` +
        'sẽ tự kẹp vị trí cuộn, và cú trôi đó đọc ra như một lỗi',
    );
  }
}

if (problems.length) {
  console.log('hero khi cuộn CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hero khi cuộn OK — cú vuốt ngang hơi xiên không bị giết (ngưỡng bỏ cuộc theo chiều dọc LỚN HƠN ' +
    'ngưỡng giành quyền theo chiều ngang, và pan thất bại là vĩnh viễn cho cú chạm đó); tấm nội dung ' +
    'không vẽ khi ruột nó đã bị ẩn, nên không còn một hộp kính rỗng dưới vòng tròn; hero bắt đầu mờ ' +
    'từ pixel cuộn ĐẦU TIÊN nên cú cuộn luôn có phản hồi; và đổi chế độ thì đưa trang về đầu, vì ' +
    'chiều cao nội dung đổi đột ngột sẽ khiến ScrollView tự kẹp vị trí và cú trôi đó đọc ra như lỗi. ' +
    'Cả bốn đều do người dùng báo từ máy thật — bộ chạy web không thấy được thứ nào',
);
