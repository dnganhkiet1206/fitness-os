/*
  Một nút cao dưới 44 điểm phải có `hitSlop` bù lại.

  ── vì sao ──

  44 điểm là sàn của Apple, và nó không phải con số cho đẹp: nó là bề rộng trung
  bình của đầu ngón tay. Dưới mức đó thì người dùng bấm trượt, và họ không kết
  luận "nút nhỏ quá" mà kết luận "app không ăn".

  `hitSlop` mở rộng vùng chạm mà không đổi hình vẽ, nên một nút 30 điểm với
  `hitSlop={8}` là 46 điểm khi chạm và vẫn 30 điểm khi nhìn. Đó là cách đúng để
  có một glyph nhỏ. Thiếu nó thì con số vẽ CHÍNH LÀ vùng chạm.

  ── vì sao cần đo bằng công cụ ──

  Không có gì trên màn hình nói cho biết. Nút vẫn vẽ ra, vẫn bấm được khi ngón
  tay đặt đúng giữa, và người kiểm thử ngồi bàn giấy với con trỏ chuột thì không
  bao giờ trượt. Tìm ra `AiMealSuggest` cao 40 là nhờ quét DOM, không nhờ nhìn.
*/
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = globSync('src/**/*.tsx', { cwd: NATIVE }).sort();
const FLOOR = 44;

/*
  Nợ đã biết, và danh sách này CHỈ ĐƯỢC NGẮN ĐI.

  Luật ra đời khi soát trang dinh dưỡng, và nó tìm ra mười bốn chỗ trên tám tệp
  — cùng một lỗi, khắp app. Sửa hết trong một lượt là đụng vào tám màn hình
  không ai yêu cầu, nên hai chỗ thuộc trang dinh dưỡng được sửa ngay và phần còn
  lại nằm đây.

  Cùng cách `motion.mjs` mang bảng ngoại lệ của nó: một danh sách hữu hạn, viết
  ra, và mỗi lần ai đó sửa một chỗ thì xoá một dòng. Cái nó chặn là chỗ THỨ
  mười lăm — một nút mới cao 38 điểm sẽ đỏ ngay, thay vì lặng lẽ nhập vào đám
  đông.

  Cách sửa rẻ nhất thường không phải nâng chiều cao (dễ phá nhịp của hàng chứa
  nó) mà là `hitSlop`: nó đổi vùng chạm mà không đổi một điểm ảnh nào khi nhìn.
*/
const NỢ = new Set([
  'src/app/(tabs)/index.tsx::resetBtn',
  'src/app/(tabs)/index.tsx::syncButton',
  'src/app/(tabs)/progress.tsx::addBtn',
  'src/app/(tabs)/progress.tsx::rangeBtn',
  'src/app/log-meal.tsx::customAddBtn',
  'src/app/mascot-room.tsx::claimBtn',
  'src/app/mascot-room.tsx::freezeBuy',
  'src/app/water.tsx::customBtn',
  'src/components/ascnd/day-plan.tsx::emptyBtn',
  'src/components/ascnd/muscle-grid.tsx::libToggle',
  'src/components/ascnd/shop/shop-grid.tsx::claimBtn',
]);
/*
  Nợ của LUẬT 2 — nút chỉ có icon, đo được nhưng chưa sửa.

  Ghi kèm con số đo được chứ không chỉ ghi tên, vì con số mới là thứ nói nó tệ
  đến đâu: 20 điểm ở `grocery` là một nút gần như không bấm trúng, còn 42 ở
  `food-cards` chỉ thiếu hai. Sửa là nâng `hitSlop` — không đổi một điểm ảnh nào
  khi nhìn — nhưng mỗi chỗ cần liếc xem nó có nằm cạnh một nút khác không, và
  đó là một lượt riêng chứ không phải một phép thay chuỗi hàng loạt.
*/
const ICON_NỢ = [];
const đãGặp = new Set();
const problems = [];

for (const f of files) {
  const src = readFileSync(path.join(NATIVE, f), 'utf8');

  /* Chiều cao khai báo tường minh của từng style. */
  const h = new Map();
  for (const m of src.matchAll(/(\w+):\s*\{[^{}]*?\bheight:\s*(\d+)[^{}]*?\}/g)) {
    h.set(m[1], Number(m[2]));
  }
  if (!h.size) continue;

  /* Mỗi thẻ bấm được: gom thuộc tính tới dấu `>` cuối dòng. */
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/<(Pressable|PressScale|TouchableOpacity|TouchableHighlight)\b/.test(lines[i])) continue;
    let tag = '';
    for (let j = i; j < Math.min(lines.length, i + 16); j++) {
      tag += lines[j] + '\n';
      if (/>\s*$/.test(lines[j])) break;
    }
    if (/hitSlop/.test(tag)) continue;
    for (const m of tag.matchAll(/styles\.(\w+)/g)) {
      const tall = h.get(m[1]);
      if (tall !== undefined && tall < FLOOR) {
        const key = `${f}::${m[1]}`;
        if (NỢ.has(key)) { đãGặp.add(key); continue; }
        problems.push(
          `${f}:${i + 1}: nút dùng \`styles.${m[1]}\` cao ${tall} điểm, dưới sàn ${FLOOR} và không có hitSlop bù lại`,
        );
      }
    }
  }
}

/*
  ── luật 2: nút CHỈ CÓ ICON, thứ luật 1 không đo nổi ──

  Luật trên chỉ nhìn `styles.X` có khai `height`. Một nút mà con duy nhất là một
  `<Icon size={N}/>` và bản thân nó không có style nào thì KHÔNG có chiều cao
  nào để đọc — nên nó lọt hoàn toàn, dù có `hitSlop` hay không.

  Đó là hình dạng của nút chia sẻ trên thẻ huy chương: glyph 14 với
  `hitSlop={8}`, tức **30 điểm**, thiếu mười bốn so với sàn. Người dùng báo
  "nhấn chia sẻ thì không ra bất cứ thông tin gì cả" — và chính lời ghi ở đầu
  tệp này mô tả đúng chuyện đó: dưới sàn thì người ta bấm trượt và kết luận "app
  không ăn".

  Và `hitSlop` KHÔNG còn là tấm vé miễn như ở luật 1: ở đây nó được CỘNG vào rồi
  so với sàn. Có hitSlop mà tổng vẫn 38 thì vẫn là một nút bấm trượt.
*/
for (const f of files) {
  const src = readFileSync(path.join(NATIVE, f), 'utf8');
  const h = new Map();
  for (const m of src.matchAll(/(\w+):\s*\{[^{}]*?\bheight:\s*(\d+)[^{}]*?\}/g)) h.set(m[1], Number(m[2]));
  for (const m of src.matchAll(
    /<(PressScale|Pressable|TouchableOpacity|TouchableHighlight)([^>]*?)>\s*<Icon\b([^>]*?)\/>\s*<\/\1>/gs,
  )) {
    const [, , attrs, icon] = m;
    /*
      Nhường cho luật 1 chỉ khi luật 1 THẬT SỰ đo được.

      Bản đầu bỏ qua mọi thẻ có `style={`, và ba chỗ lọt ngay: chúng viết
      `style={[styles.x, …]}` với `styles.x` không khai `height` nào — nên luật 1
      không thấy chiều cao, luật 2 đã nhường, và không luật nào đo. Đúng cái lỗ
      mà luật 2 sinh ra để bịt.

      Nay chỉ nhường khi có một `styles.X` mà `X` CÓ chiều cao khai tường minh.
    */
    const named = [...attrs.matchAll(/styles\.(\w+)/g)].map((x) => x[1]);
    if (named.some((n) => h.has(n))) continue;
    const size = /size=\{(\d+)\}/.exec(icon);
    if (!size) continue;
    const slop = /hitSlop=\{(\d+)\}/.exec(attrs);
    const total = Number(size[1]) + 2 * Number(slop?.[1] ?? 0);
    if (total >= FLOOR) continue;
    const line = src.slice(0, m.index).split('\n').length;
    const key = `${f}::icon@${line}`;
    const debtKey = ICON_NỢ.find((d) => d.file === f && d.total === total);
    if (debtKey) { đãGặp.add(`${debtKey.file}::${debtKey.total}`); continue; }
    problems.push(
      `${f}:${line}: nút chỉ có icon — glyph ${size[1]} + hitSlop ${slop?.[1] ?? 0}×2 = ${total} điểm, ` +
        `dưới sàn ${FLOOR}. Luật 1 không thấy nó vì nó không có style nào mang \`height\``,
    );
    void key;
  }
}

/* Một dòng nợ đã được trả thì phải xoá khỏi danh sách, không thì nó che mất
   lần tái phạm sau ở đúng chỗ đó. */
for (const d of ICON_NỢ) {
  if (!đãGặp.has(`${d.file}::${d.total}`)) {
    problems.push(
      `\`${d.file}\` (${d.total} điểm) đã được sửa hoặc đổi số — xoá/cập nhật dòng đó trong ICON_NỢ`,
    );
  }
}
for (const key of NỢ) {
  if (!đãGặp.has(key)) {
    problems.push(`\`${key}\` đã được sửa nhưng còn nằm trong danh sách nợ — xoá dòng đó khỏi tap-target.mjs`);
  }
}

if (problems.length) {
  console.log('vùng chạm CÓ LỖI:\n');
  for (const p of [...new Set(problems)].slice(0, 60)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `vùng chạm OK — không nút MỚI nào dưới ${FLOOR} điểm mà thiếu \`hitSlop\`, và không nút CHỈ-ICON mới nào ` +
    `có glyph + hitSlop×2 dưới ${FLOOR} — luật 2 cộng hitSlop vào rồi so với sàn, chứ không coi nó là vé miễn ` +
    `như luật 1. Còn ${NỢ.size} chỗ nợ ở luật 1 và ${ICON_NỢ.length} ở luật 2, và hai danh sách đó chỉ được ngắn đi. ` +
    '44 là bề rộng trung bình của đầu ngón tay; dưới mức đó người dùng bấm trượt và họ kết luận "app ' +
    'không ăn" chứ không kết luận "nút nhỏ quá" — và không có gì trên màn hình nói cho biết, vì nút ' +
    'vẫn vẽ ra và con trỏ chuột thì không bao giờ trượt',
);
