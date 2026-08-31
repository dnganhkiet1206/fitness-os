/**
 * Lần vẽ ĐẦU của một màn hình phải tức thì. Ở mọi màn, không riêng Today.
 *
 * ── lỗi đã sửa, và nó đã được báo từ máy thật ──
 *
 * `lib/entrance.ts` ghi lại nguyên văn:
 *
 *   "Reported twice from the device, on the two screens that stagger the most:
 *   Progress opens dim or blank and comes back only after switching tabs and
 *   switching back."
 *
 * Nguyên nhân: `rise(i)` là `FadeInDown` cộng một khoảng hoãn tới 600ms. Hiệu
 * ứng vào MOUNT view ở giá trị ĐẦU của nó — opacity 0 và một quãng dịch — nên
 * nếu khung hình trong quãng hoãn ấy bị rơi, thứ còn lại trên màn hình chính là
 * giá trị đầu: nội dung đã dựng, đã chiếm chỗ, và không nhìn thấy. Mà quãng ấy
 * trùng đúng lúc màn hình đang chạy truy vấn của nó.
 *
 * `useRise` là bản sửa: lần vẽ đầu trả về `undefined` nên không hiệu ứng nào
 * chạy, và cascade chỉ dành cho thứ mount vào một màn hình ĐÃ ở đó — đổi tab
 * con, thêm một thẻ, dữ liệu về. Lập luận đã có sẵn: "một hiệu ứng vào là TRANG
 * TRÍ, nên nó không bao giờ được là thứ quyết định nội dung có nhìn thấy hay
 * không."
 *
 * ── và vì sao đó cũng là cách iOS làm ──
 *
 * Một màn hình được đẩy vào đã có chuyển động rồi: cú trượt từ phải của
 * `UINavigationController`, thứ app này dùng nguyên bản (Stack không ghi đè
 * `animation`). iOS không rải nội dung theo bậc trong lúc trang đang trượt vào
 * — trang tới nơi NGUYÊN KHỐI. Chồng một cascade lên trên là hai chuyển động
 * kể hai câu chuyện về cùng một sự kiện.
 *
 * ── lỗ hổng che phủ mà tệp này lấp ──
 *
 * `tools/entrance-once.mjs` đã canh đúng luật này, nhưng chỉ cho `index.tsx`.
 * Trong lúc đó SÁU màn khác vẫn gọi `rise` trần — settings (11 hiệu ứng),
 * weekly-review (10), sleep-insights (3), grocery, meal-plans, supplements —
 * tổng cộng 27 cascade chạy ở lần vẽ đầu. Một luật đúng mà chỉ áp cho một tệp
 * là một luật đã bị vô hiệu ở 44 tệp còn lại.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ENTRANCE = 'src/lib/entrance.ts';
const problems = [];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/*
  Thân MỌI luật là một hàm, và phần tự kiểm ở cuối gọi lại đúng hàm này trên một
  thế giới hỏng — chép tay lại điều kiện vào phần tự kiểm thì xoá luật đi vẫn
  xanh, lỗi đã phải vá ở `rest-timer.mjs`, `drag-settle.mjs` và `spring-model.mjs`.
*/
function audit(W) {
  const out = [];

  /* ── 1. không màn nào nhập `rise` trần ────────────────────────────────────
     Đây là lỗi đã ship: `import { rise }` rồi `entering={rise(i)}` chạy ngay ở
     lần vẽ đầu. Cửa duy nhất là `useRise`. */
  let usingHook = 0;
  for (const f of W.files) {
    /* Chính tệp định nghĩa nó thì đương nhiên nhắc tên nó. */
    if (f.path === ENTRANCE) continue;
    if (/import \{[^}]*\brise\b[^}]*\} from '@\/lib\/entrance'/.test(f.src)) {
      out.push(
        `${f.path}: nhập \`rise\` trần từ '@/lib/entrance' — cascade sẽ chạy ở LẦN VẼ ĐẦU, và một khung ` +
          'hình rơi trong quãng hoãn để lại nội dung đã dựng nhưng vô hình. Đó là lỗi đã được báo hai ' +
          'lần từ máy thật (Progress mở ra mờ hoặc trắng). Dùng `useRise()`',
      );
    }
    if (/\buseRise\(\)/.test(f.src)) usingHook += 1;
  }

  /* Và luật trên chỉ có nghĩa nếu nó THẤY được gì. Không tìm ra màn nào dùng
     hook thì hoặc bộ quét hỏng, hoặc cả cơ chế đã bị gỡ — cả hai đều phải kêu
     thay vì báo xanh. Đây là chế độ hỏng `linked.mjs` gọi tên: "passing by
     measuring nothing". */
  if (usingHook < W.floor) {
    out.push(
      `chỉ ${usingHook} màn dùng \`useRise()\` — sàn là ${W.floor}. Bộ quét hỏng, hoặc cascade đã bị gỡ ` +
        'khỏi app; đừng tin kết quả "không màn nào nhập rise trần"',
    );
  }

  /* ── 2. hook phải THẬT SỰ bỏ lần vẽ đầu ───────────────────────────────────
     Nếu ai đó "đơn giản hoá" nó thành `rise(i)` thì mọi chỗ gọi trong app quay
     về đúng lỗi cũ cùng một lúc, và luật 1 vẫn xanh vì tên gọi không đổi. */
  if (!/return \(i: number\) => \(painted \? rise\(i\) : undefined\);/.test(W.entrance)) {
    out.push(
      `${ENTRANCE}: \`useRise\` không còn trả \`undefined\` ở lần vẽ đầu — cái tên vẫn thế nhưng mọi màn ` +
        'trong app quay lại cascade ngay khi mở, cùng một lúc',
    );
  }
  if (!/useState\(false\)/.test(W.entrance)) {
    out.push(`${ENTRANCE}: cờ "đã vẽ" không còn khởi tạo false`);
  }

  /* ── 3. lò xo của cascade nằm trong thang Apple ───────────────────────────
     `rise` là chuyển động chạy nhiều nhất trong app. Nó phải nói ra được mức
     nảy của mình như mọi lò xo khác — xem `constants/motion.ts`. */
  if (!/const RISE = spring\([\d.]+, BOUNCE\.smooth\);/.test(W.entrance)) {
    out.push(
      `${ENTRANCE}: lò xo cascade không còn là \`spring(duration, BOUNCE.smooth)\` — một cú ĐẾN thì dừng ` +
        'ở chỗ nó đến, không nhún một cái rồi mới yên, và `smooth` là ô Apple dành cho đúng việc ấy',
    );
  }

  /* ── 4. cú trượt màn hình vẫn là của hệ điều hành ─────────────────────────
     Thứ giống Apple nhất ở đây là thứ CỦA Apple: `UINavigationController` đẩy
     trang vào từ phải. Ghi đè `animation` trên Stack gốc là thay một chuyển
     động native bằng một bản mô phỏng, và không bản mô phỏng nào khớp được
     cử chỉ vuốt-để-quay-lại đi kèm nó. */
  if (/screenOptions=\{\{[^}]*\banimation:/.test(W.rootLayout)) {
    out.push(
      'src/app/_layout.tsx: Stack gốc ghi đè `animation` — cú đẩy màn hình đang là bản native của iOS, ' +
        'và thay nó bằng một hiệu ứng tự viết cũng làm hỏng cử chỉ vuốt từ mép để quay lại',
    );
  }

  return out;
}

const files = walk(path.join(NATIVE, 'src')).map((p) => ({
  path: path.relative(NATIVE, p),
  src: strip(readFileSync(p, 'utf8')),
}));

const WORLD = {
  files,
  entrance: strip(read(ENTRANCE)),
  rootLayout: strip(read('src/app/_layout.tsx')),
  /* Sàn đặt dưới số hiện có một bậc: đủ để một lần gỡ nhầm làm bước này đỏ,
     không chặt tới mức một màn bị xoá cũng làm nó đỏ. */
  floor: 7,
};
problems.push(...audit(WORLD));

/* ── tự kiểm ─────────────────────────────────────────────────────────────── */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — thế giới "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  const broken = (name, patch, want) => {
    if (!audit({ ...WORLD, ...patch }).some((p) => want.test(p))) fail(name);
  };

  /* Bản ĐÃ SHIP: đúng dòng import mà sáu màn kia từng có. */
  broken(
    'một màn quay về nhập rise trần',
    { files: [{ path: 'src/app/settings.tsx', src: "import { rise } from '@/lib/entrance';" }] },
    /nhập `rise` trần/,
  );
  broken('không màn nào dùng hook nữa', { files: [{ path: 'src/app/x.tsx', src: 'const a = 1;' }] }, /sàn là/);
  broken(
    'useRise thôi bỏ lần vẽ đầu',
    { entrance: WORLD.entrance.replace(/return \(i: number\) => \(painted[^;]*;/, 'return (i: number) => rise(i);') },
    /không còn trả `undefined`/,
  );
  broken('cờ đã vẽ khởi tạo true', { entrance: WORLD.entrance.replace('useState(false)', 'useState(true)') }, /khởi tạo false/);
  broken(
    'lò xo cascade rời thang',
    { entrance: WORLD.entrance.replace(/const RISE = spring\([\d.]+, BOUNCE\.smooth\);/, 'const RISE = { damping: 26, stiffness: 180, mass: 1 };') },
    /không còn là `spring\(duration, BOUNCE\.smooth\)`/,
  );
  broken(
    'Stack gốc ghi đè cú đẩy native',
    { rootLayout: "<Stack screenOptions={{ headerShown: false, animation: 'fade' }}>" },
    /ghi đè `animation`/,
  );
}

if (problems.length) {
  console.error('hiệu ứng vào toàn app CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const hookUsers = files.filter((f) => /\buseRise\(\)/.test(f.src)).length;

console.log(
  `hiệu ứng vào toàn app OK — ${hookUsers} màn dùng \`useRise()\` và KHÔNG màn nào còn nhập \`rise\` trần. ` +
    'Bản đã ship có BẢY tệp nhập trần — settings (11 hiệu ứng), weekly-review (10), sleep-insights (3), ' +
    'grocery, meal-plans, supplements, và template-list.tsx (một component, nên một phép quét chỉ đi trong ' +
    'src/app/ không thấy nó) — tức 28 cascade chạy ở LẦN VẼ ĐẦU, mỗi cái hoãn tới 600ms trên một ' +
    'màn cũng đang chạy truy vấn; khung hình rơi trong quãng ấy để lại đúng giá trị đầu của `FadeInDown`, ' +
    'là nội dung đã dựng và vô hình. Lỗi đó đã được báo HAI LẦN từ máy thật. `entrance-once.mjs` canh đúng ' +
    'luật này nhưng chỉ cho một tệp, nên nó mù với sáu tệp kia. Hook được kiểm là thật sự bỏ lần vẽ đầu ' +
    '(đổi tên mà giữ hành vi cũ thì mọi màn hỏng cùng lúc), lò xo cascade nằm trong thang Apple ở ô ' +
    '`smooth` — một cú ĐẾN dừng ở chỗ nó đến — và cú đẩy màn hình vẫn là bản NATIVE của iOS: thứ giống ' +
    'Apple nhất ở đây là thứ của Apple, và thay nó cũng làm hỏng cử chỉ vuốt từ mép để quay lại',
);
