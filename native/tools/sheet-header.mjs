/**
 * Mọi màn dạng sheet đều có một lối ra NHÌN THẤY được, và cùng một cái đầu.
 *
 * ── lỗi có thật ──
 *
 * Tám route khai `presentation: 'modal'` và một nắm `<Modal>` component, mỗi
 * cái tự dựng phần đầu của mình. Phần lớn dựng ra đúng một thứ — một
 * `<Text style={styles.title}>` và không gì khác — nghĩa là phần lớn sheet
 * trong app KHÔNG CÓ lối ra nào nhìn thấy được. Chúng đóng bằng cách vuốt
 * xuống, mà đó là cử chỉ người ta hoặc biết hoặc không, và trên màn hình không
 * có gì nói ra điều đó.
 *
 * Số còn lại thì bất đồng về mọi thứ: `form-sheet` đặt tiêu đề bên TRÁI,
 * `log-meal` căn GIỮA; nút đóng 34 điểm ở chỗ này, 36 ở chỗ kia, 40 ở chỗ nữa;
 * `weight-goal-dialog` dùng mũi tên quay lại.
 *
 * ── và HAI tệp mắc cùng một lỗi, độc lập với nhau ──
 *
 * Cả `weight-goal-dialog` lẫn `workout-builder` cân tiêu đề bằng cách dùng lại
 * style của chính cái nút bên kia — nên cả hai vẽ ra một đĩa tròn xám ĐẶC ở góc
 * phải, cùng cỡ, cùng màu, cùng hình dạng với một cái nút, và bấm vào không có
 * gì xảy ra. Không lỗi nào báo, tsc sạch, mọi luật khác xanh.
 *
 * Hai lần cùng một sai sót không phải hai lần bất cẩn — nó là dấu hiệu rằng
 * việc ấy không nên được làm bằng tay lần thứ ba.
 *
 * ── luật ──
 *
 * 1. Mọi route khai `presentation: 'modal'`/`'fullScreenModal'` trong
 *    `_layout.tsx` phải dựng `<SheetHeader>` — hoặc nằm trong danh sách miễn
 *    trừ KÈM LÝ DO ở ngay dưới đây.
 * 2. Không tệp nào được dựng lại phần đầu ấy bằng tay: một hàng ngang có nút
 *    đóng và một tiêu đề là công việc của `SheetHeader`.
 * 3. Không chỗ trống cân tiêu đề nào được mang `backgroundColor` — đó chính là
 *    cái đĩa giả, và nó là lỗi duy nhất ở đây mà chỉ ảnh chụp mới thấy.
 * 4. `SheetHeader` phải BẮT BUỘC có `onClose`: một sheet không có lối ra là
 *    đúng thứ tệp này tồn tại để chặn.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const HEADER = 'src/components/ascnd/sheet-header.tsx';
const LAYOUT = 'src/app/_layout.tsx';

/**
 * Màn dạng modal KHÔNG dùng `SheetHeader`, và vì sao.
 *
 * Thêm tên vào đây là một quyết định — nó phải là một câu trả lời được, không
 * phải một cách làm bước này xanh lại.
 */
const EXEMPT = {
  'scan-barcode':
    'toàn màn camera: không có tiêu đề, không có nền để đặt một hàng đầu lên, và ' +
    'lối ra là nút huỷ nằm trên khung ngắm',
  'scan-food':
    'cùng lý do với scan-barcode',
};

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

const problems = [];

/* ── 0. tệp phải tồn tại và phải đúng hình dạng ─────────────────────────── */
let header = '';
try {
  header = read(HEADER);
} catch {
  problems.push(`${HEADER}: không tồn tại — mọi luật dưới đây không kiểm được gì`);
}

if (header) {
  /* 4. lối ra là bắt buộc, không phải tuỳ chọn */
  if (!/\n  onClose: \(\) => void;/.test(header)) {
    problems.push(
      `${HEADER}: \`onClose\` không còn là prop BẮT BUỘC — một sheet không có lối ra là đúng ` +
        'thứ component này tồn tại để chặn',
    );
  }
  /* thanh kéo phải có thật, và phải không ăn chạm: nó quảng cáo một cú vuốt,
     bắt chạm ở đó là nuốt đúng cú vuốt ấy */
  if (!/grabber \?.*pointerEvents="none"/s.test(header)) {
    problems.push(`${HEADER}: thanh kéo không có \`pointerEvents="none"\` — nó sẽ nuốt cú vuốt xuống`);
  }
  const spacer = /\n  spacer: \{([^}]*)\}/.exec(header);
  if (!spacer) problems.push(`${HEADER}: không đọc được style chỗ trống cân tiêu đề`);
  else if (/backgroundColor/.test(spacer[1])) {
    problems.push(
      `${HEADER}: chỗ trống cân tiêu đề có \`backgroundColor\` — đó là cái đĩa tròn giả, và nay ` +
        'nó sẽ xuất hiện ở MỌI sheet cùng một lúc',
    );
  }
}

/* ── 1. mọi route modal đều dùng nó ─────────────────────────────────────── */
const layout = read(LAYOUT);
/* Tên route lấy từ chính `_layout.tsx`: hai dạng khai — `name="x"` kèm
   `presentation`, và một mảng tên map ra nhiều `Stack.Screen`. */
const routes = new Set();
for (const m of layout.matchAll(/name="([\w-]+)"\s*\n\s*options=\{\{\s*\n?\s*presentation: '(\w+)'/g)) {
  if (/[Mm]odal/.test(m[2])) routes.add(m[1]);
}
const block = /\(\s*\[([\s\S]*?)\] as const\s*\)\.map/.exec(layout);
if (block && /presentation: 'modal'/.test(layout.slice(block.index, block.index + 900))) {
  for (const m of block[1].matchAll(/'([\w-]+)'/g)) routes.add(m[1]);
}

/*
  Con số này là một KỲ VỌNG, không phải một ngưỡng an toàn.

  Bản trước viết `< 8` và nó không có răng: đổi một `presentation: 'modal'`
  thành một chữ khác làm bộ đọc mất đúng một route, còn 9 — vẫn qua. Một luật
  chỉ báo khi danh sách gần rỗng thì nó canh trường hợp app không còn sheet
  nào, chứ không canh trường hợp nó thôi đọc được cách khai.

  Bớt một sheet là một quyết định: hạ con số này trong cùng commit, và cú hạ ấy
  nhìn thấy được trong diff.
*/
const EXPECTED_ROUTES = 10;
if (routes.size !== EXPECTED_ROUTES) {
  problems.push(
    `${LAYOUT}: đọc ra ${routes.size} route dạng modal, chờ ${EXPECTED_ROUTES} ` +
      `(${[...routes].sort().join(', ') || 'không có'}) — hoặc cách khai đã đổi và bộ đọc này mù, ` +
      'hoặc app thật sự bớt/thêm một sheet và con số trên phải sửa theo trong cùng commit',
  );
}

for (const name of [...routes].sort()) {
  if (name in EXEMPT) continue;
  let src;
  try {
    src = read(`src/app/${name}.tsx`);
  } catch {
    problems.push(`src/app/${name}.tsx: khai là modal trong _layout nhưng không có tệp`);
    continue;
  }
  if (!/<SheetHeader\b/.test(src)) {
    problems.push(
      `src/app/${name}.tsx: màn dạng sheet mà không dựng <SheetHeader> — không có thanh kéo và ` +
        'không có nút đóng, tức không có lối ra nào NHÌN THẤY được',
    );
  }
}

/* ── 2 + 3. không ai dựng lại cái đầu ấy bằng tay ───────────────────────── */
/*
  ── dấu vết CHÍNH XÁC của cái đĩa giả, và vì sao bản đầu sai ──

  Bản đầu của luật này bắt "mọi `<View>` rỗng có nền". Nó đỏ 13 chỗ và 13 chỗ
  đều đúng luật: đường kẻ, dấu phân cách, lớp phủ, ruột nút chụp, thanh kéo của
  shop, ô nền của segment. Một `<View>` rỗng có nền là cách bình thường để vẽ
  một HÌNH — luật ấy cấm mất việc vẽ hình.

  Dấu vết thật hẹp hơn nhiều, và cả hai lần mắc lỗi đều mang đúng nó: hộp rỗng
  DÙNG LẠI style của một thứ BẤM ĐƯỢC trong cùng tệp. `<View style={styles.back} />`
  bên cạnh `<PressScale style={styles.back}>`; `<View style={styles.headerBtn} />`
  bên cạnh `<PressScale style={styles.headerBtn}>`. Đó không phải một cái hình —
  đó là một cái nút bị sao chép mà quên mất phần bấm được.

  Một đường kẻ không bao giờ là style của một cái nút, nên nó rơi ra khỏi lưới.
*/
for (const abs of walk(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, abs);
  if (rel === HEADER) continue;
  const src = readFileSync(abs, 'utf8');

  /* Những style đang được dùng cho một thứ BẤM ĐƯỢC trong tệp này. */
  const pressable = new Set();
  for (const m of src.matchAll(/<(?:PressScale|Pressable|TouchableOpacity)\b[^>]*?style=\{(?:\[)?styles\.(\w+)/gs)) {
    pressable.add(m[1]);
  }
  if (pressable.size === 0) continue;

  for (const m of src.matchAll(/<View style=\{styles\.(\w+)\} \/>/g)) {
    if (!pressable.has(m[1])) continue;
    /* ── và style ấy phải THẬT SỰ VẼ ra cái gì ──

       Mượn style của một nút mà style đó trong suốt thì không vẽ ra nút nào:
       `progress.tsx` có `historyDelete` rộng 22 điểm, không nền, dùng cho cả
       nút xoá lẫn chỗ trống căn hàng ở những dòng không xoá được. Đó là cách
       đúng để làm việc ấy, và bản trước của luật này phạt nó. */
    const st = new RegExp(`\\n  ${m[1]}: \\{([^}]*)\\}`).exec(src);
    if (!st || !/backgroundColor|borderWidth/.test(st[1])) continue;
    problems.push(
      `${rel}: \`<View style={styles.${m[1]}} />\` là một hộp RỖNG mượn style của một thứ bấm được ` +
        'trong cùng tệp — nó vẽ ra một cái nút y hệt, cùng cỡ cùng màu, và bấm vào không có gì xảy ra. ' +
        'Chỗ trống cân tiêu đề phải TRONG SUỐT, và tốt hơn là để <SheetHeader> lo',
    );
  }
}

if (problems.length) {
  console.error('đầu trang sheet CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `đầu trang sheet OK — ${routes.size - Object.keys(EXEMPT).length}/${routes.size} route dạng modal dựng ` +
    '<SheetHeader> (2 màn camera được miễn CÓ GHI LÝ DO: toàn màn ngắm, không có nền để đặt hàng đầu lên), ' +
    'nên mọi sheet đều có thanh kéo ở giữa và một nút đóng nhìn thấy được — trước đây phần lớn chúng chỉ có ' +
    'một dòng tiêu đề và lối ra duy nhất là một cú vuốt không ai nói cho bạn biết. `onClose` là prop BẮT ' +
    'BUỘC; thanh kéo không ăn chạm (nó quảng cáo cú vuốt nào thì không được nuốt cú vuốt ấy); và không tệp ' +
    'nào còn một `<View>` rỗng mang nền — hình dạng của cái đĩa tròn giả mà weight-goal-dialog và ' +
    'workout-builder đã ĐỘC LẬP mắc phải, mỗi cái một đĩa xám ở góc phải trông y như nút và bấm không có gì',
);
