/**
 * Every pill is made of the same material, and it is not a drop shadow.
 *
 * ── what a shadow cannot do here ──
 *
 * The page is `#070708`. The obvious way to lift a control off it is a drop
 * shadow, and that is what I reached for first: black under a dark pill on a
 * nearly black page. Measured on a rendered screenshot, the pixels immediately
 * outside a pill came back `[9,9,9]` — identical to the page. Black on black
 * separates nothing, and the four `shadow*` props were not even drawn on web,
 * so the harness could not have told me either way.
 *
 * ── what does work is the material ──
 *
 * The assistant's state pill — the one that says "waiting for today's data" —
 * is a `LiquidGlass`: a dark blur, a lit top edge, and a shade falling to the
 * bottom right. That is what makes a surface read as raised on a dark page, and
 * it is a *material*, not a shadow. Every pill in the app now uses it, tinted
 * by the thing it contains: its glyph's colour, or the colour of the service it
 * opens.
 *
 * ── what this rule is actually protecting ──
 *
 * Two failures, and neither one looks like a bug in review.
 *
 * Somebody replaces the glass with a flat fill and a border, because that is
 * cheaper and looks nearly the same in a diff — and the pills go back to lying
 * flat on the page. Or somebody adds a `shadow*` recipe on top, because pills
 * should have shadows, and it costs a compositing pass to draw nothing.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/**
 * Every screen with pills: bao nhiêu pill kính, và nguồn sáng của chúng là gì.
 *
 * ── vì sao cột thứ ba tồn tại ──
 *
 * Luật này từng đòi mọi pill "được thắp bằng chính thứ nó chứa: màu glyph của
 * nó". Nửa đầu của câu ấy — **phải có một `tint`** — là thật, và nó là nửa
 * được ĐO: pill dùng `material="blur"`, thứ đã bỏ mép sáng và bóng đổ trong
 * lòng kính, nên lớp wash theo tint là nguồn sáng CUỐI CÙNG nhấc nó khỏi trang
 * `#070708`. Gỡ tint là trả pill về nằm bẹt — đúng chế độ hỏng mà phép đo ảnh
 * chụp ([9,9,9]) được làm ra để chặn.
 *
 * Nửa sau — "tint phải là màu của glyph" — là một khẳng định thẩm mỹ, không
 * kèm số nào, và cái giá của nó đọc được ngay trên một hàng: bốn viên cạnh
 * nhau, bốn hue khác nhau, cho bốn thứ mà cái NHÃN đã nói rõ là gì.
 *
 * Luật mới do đó CHẶT HƠN bản cũ: pill vẫn phải có nguồn sáng, VÀ pill điều
 * hướng phải dùng đúng MỘT nguồn trung tính. Bản cũ cho phép bốn hue; bản này
 * không.
 *
 * `music-launch` được miễn có tên: màu ở đó là màu của DỊCH VỤ (Apple Music,
 * Spotify), tức là danh tính chứ không phải trang trí — nó nói cho người dùng
 * biết nút mở cái gì trước khi họ đọc chữ.
 */
/* `c.primary`, không còn `colors.primary`: bảng màu đọc lúc chạy, và `c` là
   bảng của theme đang bật — xem `constants/theme.ts`. */
const NEUTRAL = 'c.primary';
const USERS = [
  ['src/app/(tabs)/index.tsx', 1, 'bốn nút log trên Today (một chỗ render, lặp qua danh sách)', NEUTRAL],
  /*
    Tab Tập luyện không còn pill kính nào, và đó là chủ ý.

    Ba pill ở đây (tiến bộ, thư viện, ghi buổi tập) là một phần của cái đã bị
    gỡ: năm đích đến ngang hàng nhau ở một phần ba trên của trang, không cái
    nào nói nên bấm cái nào. Nay tab có đúng MỘT nút đặc — "Bắt đầu buổi tập"
    trong khối Hôm nay — còn hai cánh cửa còn lại là hàng kiểu Cài đặt ở đáy
    trang. Một pill kính là để NHẤC một nút khỏi nền; ở cuối trang, sau hai
    danh sách, không có gì cần nhấc.

    Luật vẫn giữ nguyên hiệu lực ở hai tệp còn lại. Gỡ mục này ra là một quyết
    định, không phải một lần nới lỏng — nếu tab mọc lại pill kính, nó phải quay
    vào danh sách này.
  */
  ['src/components/ascnd/music-launch.tsx', 1, 'hai chip nhạc (một chỗ render)', null],
];

for (const [file, want, what, neutral] of USERS) {
  const code = strip(read(file));

  /* ── 1. it is made of the material, not of a fill and a border ── */
  const glasses = [...code.matchAll(/<LiquidGlass\b/g)].length;
  if (glasses < want) {
    problems.push(
      `${file} chỉ còn ${glasses} pill dùng <LiquidGlass>, chờ ${want} (${what}). Thay kính bằng một nền ` +
        'phẳng cộng viền trông gần như y hệt trong diff, và pill quay lại nằm bẹt trên nền — trên trang ' +
        '#070708 thì chất liệu mới là thứ nhấc được, không phải bóng đổ',
    );
  }

  /* ── 2. and each one is lit by what it holds ── */
  const tinted = [...code.matchAll(/<LiquidGlass[^>]*\btint=/g)].length;
  if (glasses > 0 && tinted < glasses) {
    problems.push(
      `${file}: ${glasses - tinted} pill kính không truyền \`tint\`. \`material="blur"\` đã bỏ mép sáng ` +
        'và bóng đổ trong lòng kính, nên lớp wash theo tint là nguồn sáng CUỐI CÙNG nhấc pill khỏi trang ' +
        '#070708 — gỡ nó là trả pill về nằm bẹt',
    );
  }

  /* ── 2b. và pill ĐIỀU HƯỚNG dùng đúng MỘT nguồn sáng trung tính ── */
  if (neutral) {
    const hues = [...code.matchAll(/<LiquidGlass[^>]*\btint=\{([^}]+)\}/g)].map((m) => m[1].trim());
    const stray = hues.filter((h) => h !== neutral);
    if (stray.length) {
      problems.push(
        `${file}: ${stray.length} pill điều hướng lấy hue riêng (${[...new Set(stray)].join(', ')}) thay vì ` +
          `\`${neutral}\`. Màu dành cho GIÁ TRỊ, không dành cho LỐI ĐI — cái nhãn đã nói pill đó là gì, ` +
          'nên hue ở bề mặt không thêm thông tin nào; nó chỉ tiêu mất sự kiềm chế. Màu ở lại trong glyph',
      );
    }
  }

  /* ── 3. nobody bolts a shadow back on ── */
  if (/shadowOpacity|shadowRadius|shadowOffset|boxShadow/.test(code)) {
    problems.push(
      `${file} thêm bóng đổ lên pill. Đo trên ảnh chụp: bóng đen dưới pill tối trên trang #070708 vẽ ra ` +
        'ĐÚNG KHÔNG GÌ — điểm ảnh ngay ngoài pill là [9,9,9], y hệt nền — nên đó là một lượt ghép hình ' +
        'để không được gì. Chiều sâu ở đây đến từ chất liệu kính: mép trên sáng và bóng đổ về góc dưới-phải',
    );
  }
}

/* ── 4. and the glass keeps its own recipe in one place ── */
{
  const lg = strip(read('src/components/ascnd/liquid-glass.tsx'));
  for (const [what, re] of [
    ['lớp blur', /<BlurView\b/],
    ['mép sáng', /lgEdge|lgLit/],
    ['bóng trong lòng kính', /lgShade/],
  ]) {
    if (!re.test(lg)) {
      problems.push(
        `LiquidGlass mất ${what} — đó là thứ làm mặt phẳng đọc ra là được nhấc lên, và mọi pill trong ` +
          'app giờ dựa vào nó',
      );
    }
  }
}

if (problems.length) {
  console.log('pill nổi CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

const total = USERS.reduce((n, u) => n + u[1], 0);
console.log(
  `pill nổi OK — ${total} pill trên ${USERS.length} màn đều dùng <LiquidGlass>, cùng chất liệu với pill ` +
    '"đang chờ dữ liệu hôm nay" bên trợ lý. Mỗi cái vẫn truyền `tint`, vì material="blur" đã bỏ mép sáng ' +
    'nên lớp wash là nguồn sáng cuối cùng nhấc pill khỏi nền — nhưng pill ĐIỀU HƯỚNG nay dùng đúng MỘT ' +
    'nguồn trung tính (c.primary) thay vì mỗi cái một hue: màu dành cho giá trị, không dành cho lối ' +
    'đi, và màu ở lại trong glyph. Hai chip nhạc được miễn có tên vì màu ở đó là danh tính dịch vụ. ' +
    'Không pill nào gắn thêm bóng đổ: đo trên ảnh chụp thì bóng đen dưới pill tối trên trang #070708 vẽ ' +
    'ra đúng không gì (điểm ảnh ngay ngoài pill là [9,9,9], y hệt nền), nên chiều sâu ở đây là việc của ' +
    'chất liệu chứ không phải của shadow',
);
