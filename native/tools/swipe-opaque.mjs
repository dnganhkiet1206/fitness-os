/**
 * Hàng vuốt được phải ĐỤC. Lớp trước trong suốt thì nút hiện xuyên qua nó.
 *
 *     node tools/swipe-opaque.mjs
 *
 * ── lỗi nó sinh ra để chặn ──
 *
 * `ReanimatedSwipeable` dựng tấm nút là `absoluteFill` nằm SAU hàng; hàng là
 * lớp trước trượt đè lên, và nút được lộ ra bằng HÌNH HỌC. Phép ấy chỉ đúng khi
 * lớp trước đục. Nếu hàng trong suốt thì suốt cú kéo viên nút hiện xuyên qua
 * chính hàng — trên màn *Buổi tập đã ghi* nó cho ra hai cái icon thùng rác
 * chồng lên nhau, một của hàng và một của nút.
 *
 * Không gì bắt được: `tsc` thấy hai style hợp lệ, mọi luật màu đo tương phản
 * của nút trên nền của NÓ (và đạt), còn ảnh chụp trạng thái đóng thì hoàn toàn
 * bình thường — hàng chỉ phản bội ở GIỮA một cú kéo, thứ không có trong bộ ảnh
 * nào. `todo-card.tsx` đã gặp và đã ghi ("hàng vuốt được phải có NỀN ĐẶC");
 * `sessions.tsx` thì mắc lại y hệt, vì bài học nằm trong chú thích của một tệp
 * khác chứ không nằm trong một luật.
 *
 * ── vì sao là một DANH SÁCH CHỐT, không phải một phép suy ──
 *
 * Con của `<SwipeRow>` là JSX bất kỳ; truy ngược từ đó ra "nền có đục không"
 * cần hiểu cả cây style, và một luật đoán sai ở đây sẽ kêu oan rồi bị tắt. Nên
 * nó làm việc rẻ và chắc: ĐẾM xem những tệp nào dựng `<SwipeRow>`, và đòi mỗi
 * tệp có một câu trả lời đã được ghi. Một chỗ vuốt MỚI xuất hiện thì luật đỏ và
 * bắt người thêm nó phải trả lời — đó chính là khoảnh khắc lỗi này sinh ra.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Mỗi chỗ dựng `<SwipeRow>`, và mặt ĐỤC của nó là cái gì.
 *
 * `face` là chuỗi phải có mặt trong tệp — tên style hoặc component mang nền.
 * `why` là câu in ra khi nó biến mất, nên nó phải nói được người đọc cần làm gì.
 */
const HOSTS = {
  'src/components/ascnd/todo-card.tsx': {
    face: 'styles.rowSwipe',
    why: '`rowSwipe` là nền đặc (`m.bg`, chính mặt thẻ To-do) mà hàng đặt lên. Chú thích cạnh nó đã ghi '
      + 'nguyên văn: "hàng vuốt được phải có NỀN ĐẶC, không thì viên thuốc đỏ phía dưới hiện xuyên qua '
      + 'trong lúc kéo"',
  },
  'src/app/sessions.tsx': {
    face: 'sessionList.rowFace',
    why: '`rowFace` là `blend(m.ink, c.background, GROUP_TINT)` — cùng màu mắt đang thấy nhưng ĐỤC. '
      + '`SessionRow` không có nền riêng, nó ngồi trên lớp tint 6% trong suốt của `group`, nên bỏ '
      + '`rowFace` ra là viên nút đỏ lại hiện xuyên qua hàng',
  },
  'src/app/(tabs)/index.tsx': {
    face: '<GlassCard',
    why: 'ở chế độ sắp xếp dashboard, con của `<SwipeRow>` là một widget, và mọi widget dựng trên '
      + '`GlassCard` — thứ mang `backgroundColor: m.bg`. Nếu một widget nào đó thôi dùng `GlassCard` thì '
      + 'nó mất luôn mặt đục và nút xoá sẽ hiện xuyên qua nó',
  },
};

const problems = [];

const found = sources(path.join(NATIVE, 'src'))
  .filter((p) => /<SwipeRow\b/.test(strip(readFileSync(p, 'utf8'))))
  .map((p) => path.relative(NATIVE, p))
  .sort();

const known = Object.keys(HOSTS).sort();

for (const f of found) {
  if (known.includes(f)) continue;
  problems.push(
    `${f}: một chỗ dựng \`<SwipeRow>\` MỚI mà luật này chưa biết. Tấm nút nằm SAU hàng, nên hàng ở đây `
      + 'phải có nền ĐỤC — nếu không, viên nút sẽ hiện xuyên qua nó suốt cú kéo, và chỉ giữa một cú kéo mới '
      + 'thấy. Kiểm bằng mắt rồi thêm tệp này vào `HOSTS` kèm tên cái mặt đục của nó',
  );
}
for (const f of known) {
  if (found.includes(f)) continue;
  problems.push(
    `${f}: không còn dựng \`<SwipeRow>\`. Nếu cú vuốt bị gỡ thật thì gỡ tệp này khỏi \`HOSTS\`; nếu không `
      + 'thì đây là lỗi, và luật đang canh một chỗ không tồn tại',
  );
}
for (const f of found) {
  const spec = HOSTS[f];
  if (!spec) continue;
  if (!strip(readFileSync(path.join(NATIVE, f), 'utf8')).includes(spec.face)) {
    problems.push(`${f}: không còn \`${spec.face}\`. ${spec.why}`);
  }
}

/* Và `blend()` phải TRẢ VỀ màu đục. Một `rowFace` gọi `alpha()` nhầm sẽ đọc
   như đã sửa mà không sửa gì cả. */
const pal = readFileSync(path.join(NATIVE, 'src/constants/palette.ts'), 'utf8');
if (!/export function blend\(/.test(pal)) {
  problems.push(
    'src/constants/palette.ts: không còn `blend()`. `sessions.tsx` dựa vào nó để có một màu ĐỤC bằng đúng '
      + 'cái mắt đang thấy; không có nó thì chỗ ấy hoặc dùng `alpha()` (vẫn trong suốt, không sửa gì) hoặc '
      + 'gõ thẳng một mã màu (trôi khỏi bảng màu ở lần sửa theme sau)',
  );
} else {
  const face = /rowFace:\s*\{\s*backgroundColor:\s*(\w+)\(/.exec(
    strip(readFileSync(path.join(NATIVE, 'src/components/ascnd/session-row.tsx'), 'utf8')),
  );
  if (!face) {
    problems.push('src/components/ascnd/session-row.tsx: không đọc được `rowFace` — đọc lại bằng mắt rồi sửa luật');
  } else if (face[1] !== 'blend') {
    problems.push(
      `src/components/ascnd/session-row.tsx: \`rowFace\` dùng \`${face[1]}()\`, không phải \`blend()\`. `
        + '`alpha()` cho ra một lớp MỜ, và một lớp mờ không che được tấm nút nằm dưới — đó đúng là lỗi '
        + 'đang được sửa',
    );
  }
}

if (problems.length) {
  console.error('hàng vuốt được mà không đục — nút sẽ hiện xuyên qua nó:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `hàng vuốt đục OK — ${found.length} chỗ dựng \`<SwipeRow>\` và cả ${found.length} đều có một mặt ĐỤC đã `
    + `ghi tên (${found.map((f) => `${path.basename(f)} → ${HOSTS[f].face}`).join(' · ')}). Tấm nút là `
    + '`absoluteFill` nằm SAU hàng nên nút được lộ ra bằng hình học, và phép ấy chỉ đúng khi lớp trước đục; '
    + 'lớp trước trong suốt thì viên nút hiện xuyên qua chính hàng — hai cái icon thùng rác chồng nhau trên '
    + 'màn Buổi tập đã ghi, đo được trên bản dựng. Không luật nào khác bắt được: `tsc` thấy style hợp lệ, '
    + 'luật màu đo nút trên nền của NÓ và đạt, còn ảnh chụp trạng thái ĐÓNG thì hoàn toàn bình thường — '
    + 'hàng chỉ phản bội ở GIỮA một cú kéo. Đây là một DANH SÁCH CHỐT chứ không phải một phép suy, vì con '
    + 'của `<SwipeRow>` là JSX bất kỳ: một chỗ vuốt MỚI làm luật ĐỎ và bắt người thêm nó phải trả lời, đúng '
    + 'khoảnh khắc lỗi này sinh ra',
);
