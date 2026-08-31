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

/* Một dòng nợ đã được trả thì phải xoá khỏi danh sách, không thì nó che mất
   lần tái phạm sau ở đúng chỗ đó. */
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
  `vùng chạm OK — không nút MỚI nào dưới ${FLOOR} điểm mà thiếu \`hitSlop\`; còn ${NỢ.size} chỗ trong danh sách nợ, và danh sách đó chỉ được ngắn đi. ` +
    '44 là bề rộng trung bình của đầu ngón tay; dưới mức đó người dùng bấm trượt và họ kết luận "app ' +
    'không ăn" chứ không kết luận "nút nhỏ quá" — và không có gì trên màn hình nói cho biết, vì nút ' +
    'vẫn vẽ ra và con trỏ chuột thì không bao giờ trượt',
);
