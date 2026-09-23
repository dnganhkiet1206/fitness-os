/**
 * Đổi hình dạng một thứ ĐƯỢC PERSIST mà quên bump `CACHE_BUSTER`.
 *
 *     node tools/cache-shape.mjs
 *
 * ── lỗi nó sinh ra để chặn, và nó đã ném trên máy chủ dự án ──
 *
 * Cache React Query được ghi xuống AsyncStorage (`ascnd_rq_cache`) và hydrate
 * lại lúc khởi động. Thứ hydrate lại là JSON do một BẢN APP KHÁC ghi — có thể
 * là bản trước khi một hợp đồng đổi hình dạng.
 *
 * `ExerciseGuide` đổi hai lần: `mediaUrl: string | null` thành
 * `media: MediaState`, rồi thêm `muscles` và `equipmentKey`. `CACHE_BUSTER`
 * không được bump ở cả hai lượt. Máy đã mở màn hướng dẫn trước đó vì thế giữ
 * trên đĩa một object KHÔNG có `muscles`, và:
 *
 *     Cannot read property 'map' of undefined
 *     exercise-guide.tsx (355:31)
 *
 * Màn hướng dẫn không mở được. Không phải một con số sai hay một ô trống — một
 * cú ném, ngay lúc người ta đang tập.
 *
 * ── vì sao TypeScript không bắt được, và vì sao cổng cũng không ──
 *
 * Kiểu chỉ tồn tại lúc biên dịch. Ở tầng chạy, `data` của React Query là thứ
 * `JSON.parse` trả về, và không gì kiểm nó. Mọi luật khác trong kho này đọc mã
 * hoặc chạy hàm trên dữ liệu MỚI DỰNG — không luật nào dựng ra một chiếc máy
 * đã chạy bản cũ.
 *
 * ── nên luật này GHIM HÌNH DẠNG, không đọc hành vi ──
 *
 * Nó lấy danh sách tên trường của mỗi hợp đồng được persist, sắp lại, băm, và
 * so với một giá trị ghim ở ngay dưới. Đổi một trường → băm đổi → ĐỎ. Lúc ấy
 * người sửa buộc phải làm hai việc cùng nhau: bump `CACHE_BUSTER`, và cập nhật
 * cái ghim ở đây. Hai thao tác ấy nằm trong cùng một commit, nên chúng không
 * trôi khỏi nhau được.
 *
 * Luật KHÔNG tự bump hộ. Bump là một quyết định — nó vứt cache của mọi người
 * dùng, tức một lần tải lại toàn bộ — nên nó phải do người viết chọn, và cái
 * đỏ ở đây là chỗ họ được hỏi.
 *
 * ── vì sao chỉ một hợp đồng, không phải tất cả ──
 *
 * Ghim mọi truy vấn sẽ đỏ mỗi lần ai đó thêm một cột vào một màn nào đó, kể cả
 * khi cột ấy chỉ được đọc qua `?? []` và không chỗ nào `.map` lên nó. Một luật
 * kêu oan là một luật bị tắt.
 *
 * Nên danh sách dưới đây là những hợp đồng có ĐÚNG hai tính chất: được persist,
 * và có một trường mà chỗ vẽ gọi thẳng một phương thức lên (`.map`, `.length`,
 * `new Set(...)`) nên thiếu nó là NÉM chứ không phải hiện sai. Thêm một hợp
 * đồng vào đây là một quyết định, giống hệt việc bump.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');

const problems = [];
let CASES = 0;

/**
 * Hợp đồng được persist, và giá trị ghim của nó.
 *
 * `buster` là giá trị `CACHE_BUSTER` phải có ở lượt ghim NÀY. Nó nằm đây chứ
 * không chỉ ở `query-client.ts` vì đó là thứ buộc hai thao tác vào nhau: đổi
 * hình dạng mà không bump thì `fields` lệch, còn bump mà không đổi hình dạng
 * thì `buster` lệch. Không cách nào sửa một nửa rồi đi tiếp.
 */
const PINNED = [
  {
    file: 'src/hooks/use-exercise-guide.ts',
    name: 'ExerciseGuide',
    /* sha256 của tên các trường, sắp theo alphabet, nối bằng `,` */
    fields: 'e62269dd1187df7be13b5c1f6d7f4e5efc5dc53ae6b7edb097e5052ac0e1fe83',
    buster: 'v3',
  },
];

/**
 * Tên các trường của một `interface`, theo thứ tự alphabet.
 *
 * Cắt bằng ĐẾM NGOẶC chứ không dò tới `}` đầu tiên: mỗi trường ở hợp đồng này
 * có một khối chú thích dài phía trên, và `muscles` mang một kiểu inline
 * `{ key: MuscleArtKey; label: string }[]` — một phép dò ngây thơ dừng ngay ở
 * dấu `}` của nó.
 */
function fieldsOf(src, name) {
  const at = src.search(new RegExp(`export interface ${name} \\{`));
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;
  const body = src.slice(open + 1, end)
    /* Chú thích ra trước: một dòng `* muscleGroup     ĐÃ LÀ NHÃN` trong khối
       văn xuôi trông y hệt một khai báo trường. */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
  /* Chỉ những khai báo ở ĐỘ SÂU 0 của thân interface. */
  const out = [];
  let d = 0;
  for (const line of body.split('\n')) {
    const at0 = d;
    for (const ch of line) {
      if (ch === '{') d++;
      else if (ch === '}') d--;
    }
    if (at0 !== 0) continue;
    const m = /^\s*(\w+)\??\s*:/.exec(line);
    if (m) out.push(m[1]);
  }
  return [...new Set(out)].sort();
}

const client = read('src/lib/query-client.ts');
const busterNow = /export const CACHE_BUSTER = '([^']+)';/.exec(client)?.[1] ?? null;

CASES++;
if (!busterNow) {
  problems.push(
    'src/lib/query-client.ts: không đọc được `CACHE_BUSTER` — luật này đang không kiểm gì cả, và ' +
      'một luật không đọc được thứ nó canh là một luật đã chết',
  );
}

for (const pin of PINNED) {
  CASES++;
  const fields = fieldsOf(read(pin.file), pin.name);
  if (!fields) {
    problems.push(
      `${pin.file}: không đọc được \`interface ${pin.name}\` — hoặc nó đã đổi tên, hoặc bộ cắt này mù. ` +
        'Cả hai đều nghĩa là hình dạng cache đang không được canh',
    );
    continue;
  }
  const got = createHash('sha256').update(fields.join(',')).digest('hex');
  if (got !== pin.fields) {
    problems.push(
      `${pin.file}: hình dạng của \`${pin.name}\` đã ĐỔI (băm ${got.slice(0, 16)}…, ghim ` +
        `${pin.fields.slice(0, 16)}…).\n    Trường hiện tại: ${fields.join(', ')}\n` +
        '    Hợp đồng này được ghi xuống AsyncStorage và hydrate lại từ đó, nên một máy đã chạy bản cũ sẽ ' +
        'dựng màn hình bằng hình dạng CŨ — và chỗ vẽ `.map` lên một trường không tồn tại thì NÉM, không ' +
        'phải hiện sai. Đã xảy ra: `g.muscles.map` ở `exercise-guide.tsx`, và màn hướng dẫn không mở được.\n' +
        `    Phải làm HAI việc trong cùng commit: bump \`CACHE_BUSTER\` (nay là '${busterNow}'), và cập ` +
        `nhật \`fields\` + \`buster\` của mục này thành '${got}'.`,
    );
    continue;
  }
  CASES++;
  if (busterNow !== pin.buster) {
    problems.push(
      `src/lib/query-client.ts: \`CACHE_BUSTER\` là '${busterNow}' nhưng mục \`${pin.name}\` ghim ` +
        `'${pin.buster}'. Hình dạng không đổi mà con số đổi nghĩa là một lượt bump chưa được ghi lại ở ` +
        'đây — lần sau hình dạng đổi thật, phép so sẽ đối chiếu với một con số đã cũ và không ai biết',
    );
  }
}

if (!problems.length) {
  console.log(
    `hình dạng cache OK — ${CASES} ca. ${PINNED.length} hợp đồng được persist có hình dạng GHIM cạnh ` +
      `\`CACHE_BUSTER\` (nay '${busterNow}'), nên đổi một trường mà quên bump là ĐỎ ở đây chứ không phải ` +
      'một cú ném trên máy người dùng. Lỗi nó sinh ra để chặn đã xảy ra thật: `ExerciseGuide` đổi hai lần ' +
      '(`mediaUrl` → `media`, rồi thêm `muscles`/`equipmentKey`) mà con số không được bump, nên máy đã mở ' +
      'màn hướng dẫn trước đó hydrate lại một object thiếu `muscles` và `g.muscles.map(…)` ném — màn ' +
      'hướng dẫn KHÔNG MỞ ĐƯỢC. TypeScript không thấy (kiểu chỉ có lúc biên dịch, còn `data` là thứ ' +
      '`JSON.parse` trả về) và không luật nào khác thấy (không luật nào dựng ra một máy đã chạy bản cũ). ' +
      'Luật KHÔNG tự bump hộ: bump vứt cache của mọi người dùng, nên đó là một quyết định, và cái đỏ ở ' +
      'đây là chỗ người viết được hỏi',
  );
}

if (problems.length) {
  console.error('hình dạng cache CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
