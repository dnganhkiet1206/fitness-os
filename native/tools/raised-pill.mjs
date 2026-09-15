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

import { hex, loadPalette, overC, ratio } from './lib/stack.mjs';

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
/* Cột thứ năm: pill ấy đứng trên cái gì. Xem luật 5 — chất liệu một mình đo ra
   gần đúng 1,00:1 so với TRANG, nên pill trên trang phải có mặt riêng; pill nằm
   trên một mặt thẻ thì không, và bắt nó mang `m.onPage` sẽ là một mặt trắng
   chồng lên một mặt trắng. */
const USERS = [
  ['src/app/(tabs)/index.tsx', 1, 'bốn nút log trên Today (một chỗ render, lặp qua danh sách)', NEUTRAL, 'page'],
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
  /* `card`, không phải `page`: `MusicLaunch` chỉ dựng ở hai chỗ — trong sheet
     `log-workout.tsx` (gốc tô `c.card`, xem `on-page-fill.mjs`) và trong tấm
     tuần ở `week-plan.tsx`. Cả hai đều có một mặt ở sau nó. */
  ['src/components/ascnd/music-launch.tsx', 1, 'hai chip nhạc (một chỗ render)', null, 'card'],
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

/* ── 5. và pill ĐỨNG TRÊN TRANG phải có mặt của riêng nó ──

   Mọi lập luận ở luật 1–3 đo trên trang `#070708`, và câu kết luận của chúng —
   "chiều sâu ở đây là việc của chất liệu" — đúng ở đó. Trên GIẤY thì không:
   một lớp blur làm sáng một trang vốn đã sáng cũng vẽ ra đúng không gì, y như
   bóng đen dưới pill tối. Cùng một chế độ hỏng, soi gương.

   Đo trên ảnh chụp máy của chủ dự án (bản sáng), mặt chip so với trang ngay
   cạnh: 1,056:1 và 1,028:1, còn nút Đồng bộ 1,105:1 — trong khi thẻ trắng của
   chính app tách ra 1,148:1 và pill tab đang chọn 1,317:1. Bốn chip là mặt
   nhạt nhất trang. Chủ dự án khoanh đỏ cả cụm: "4 thẻ này đang cùng màu".

   Luật 1 KHÔNG bắt được, và đó là điều đáng nói: `<LiquidGlass>` vẫn ở nguyên
   đó, `tint` vẫn được truyền, không ai gắn bóng đổ. Luật ấy hỏi pill được làm
   BẰNG GÌ; nó không hỏi kết quả có tách khỏi trang không. `on-page-fill.mjs`
   thì đo đúng câu đó nhưng chỉ nhìn element CÓ `backgroundColor` — một pill
   không khai nền nào là đúng vùng mù của nó.

   Tiền đề được CHẠY chứ không chép — và bản đầu của nó SAI, luật tự bắt được.
   Nó viết "hair composite lên trang thì dưới sàn 1,05", chạy ra 1,074 và 1,059,
   tức trên sàn. Hạ sàn cho luật xanh là gọt tiền đề cho vừa kết luận.

   Câu đúng là câu SO SÁNH, không cần một cái sàn tự chế: `m.aura.hair` — mặt
   duy nhất pill tự khai trước thay đổi này — phải là một bậc NHỎ HƠN `m.onPage`,
   vai mà chính kho này đã đặt tên cho "một khối đứng trên trang". 1,074 < 1,097
   trên giấy và 1,059 < 1,113 trong tối. Nếu một ngày hair thành bậc lớn hơn thì
   luật mất lý do tồn tại và phải tự nói ra, chứ không canh theo quán tính.

   Và phải nói rõ phép tính ấy là một MÔ HÌNH: nó không có lớp blur trong đó.
   Con số THẬT là ảnh chụp máy — 1,056 và 1,028 — thấp hơn cả mô hình, vì lớp
   wash tắt dần về 0 và blur làm sáng một trang vốn đã sáng. Mô hình chỉ đang nói
   TRẦN của thứ pill có thể tự đòi trước thay đổi này. Trần ấy vẫn dưới bậc có
   tên. */
const { palettes, materials } = loadPalette();
const comp = (v, ground) => {
  const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(v);
  if (!m) return hex(v);
  const to2 = (n) => Math.round(n).toString(16).padStart(2, '0');
  return overC(hex(`#${to2(+m[1])}${to2(+m[2])}${to2(+m[3])}`), ground, m[4] === undefined ? 1 : +m[4]);
};
/* Sàn của `on-page-fill.mjs`, dùng để canh chính `m.onPage` còn là một bậc. */
const FLOOR = 1.05;
const alone = {};
const withFill = {};
for (const t of ['light', 'dark']) {
  const page = hex(palettes[t].background);
  alone[t] = ratio(comp(materials[t].aura.hair, page), page);
  withFill[t] = ratio(comp(materials[t].onPage, page), page);
}
for (const t of ['light', 'dark']) {
  if (alone[t] >= withFill[t]) {
    problems.push(
      `tiền đề của luật 5 không còn đúng ở bản ${t}: mặt pill tự khai (\`m.aura.hair\`) nay đo ra ` +
        `${alone[t].toFixed(3)}:1 so với trang, tức KHÔNG còn nhỏ hơn bậc có tên \`m.onPage\` ` +
        `(${withFill[t].toFixed(3)}:1). Luật này đòi mượn vai ấy vì vai ấy là bậc lớn hơn — nếu điều ` +
        'đó hết đúng thì luật phải được đọc lại, không phải được giữ theo quán tính',
    );
  }
  if (withFill[t] < FLOOR) {
    problems.push(
      `\`m.onPage\` ở bản ${t} chỉ còn ${withFill[t].toFixed(3)}:1 so với trang — dưới sàn ${FLOOR}. ` +
        'Luật này bảo pill mượn vai ấy, nên vai ấy phải còn là một bậc',
    );
  }
}

/** Thân của một style trong bảng, đếm ngoặc chứ không dò tới `}` đầu tiên. */
const styleBody = (code, name) => {
  const at = code.search(new RegExp(`\\n\\s*${name}:\\s*\\{`));
  if (at < 0) return null;
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open, i + 1);
  }
  return null;
};

let onPage = 0;
for (const [file, , what, , ground] of USERS) {
  if (ground !== 'page') continue;
  onPage++;
  const code = strip(read(file));
  const styled = [...code.matchAll(/<LiquidGlass[^>]*\bstyle=\{styles\.(\w+)\}/g)].map((m) => m[1]);
  /* Đếm, không chỉ hỏi "có cái nào không". Phép phá thứ tư của luật này bọc
     style vào một mảng — `style={[styles.quickChip]}` — và chip biến mất khỏi
     tầm đo trong khi nút Đồng bộ vẫn giữ luật xanh. Một pill lọt khỏi biểu thức
     là một pill không ai đo, và nó im lặng y như một pill đúng. */
  const glasses = [...code.matchAll(/<LiquidGlass\b/g)].length;
  if (styled.length !== glasses) {
    problems.push(
      `${file}: ${glasses} pill kính nhưng chỉ đọc được mặt của ${styled.length} (${what}). Luật 5 đo ` +
        'qua `style={styles.X}`; pill dựng kiểu khác — mảng style, style nội tuyến, style truyền từ ' +
        'ngoài vào — thì không ai đo được nó có mặt riêng hay không',
    );
    continue;
  }
  for (const name of new Set(styled)) {
    const body = styleBody(code, name);
    if (body === null) {
      problems.push(`${file}: pill dùng \`styles.${name}\` nhưng không tìm thấy style ấy trong tệp`);
    } else if (!/backgroundColor:\s*m\.onPage/.test(body)) {
      problems.push(
        `${file}: \`${name}\` là pill đứng thẳng trên trang mà không có mặt của riêng nó. Chất liệu ` +
          `một mình đòi được nhiều nhất ${alone.light.toFixed(3)}:1 trên giấy và ` +
          `${alone.dark.toFixed(3)}:1 trong tối, còn ĐO TRÊN MÁY thì ra 1,056 và 1,028 — dưới bậc có ` +
          'tên. Dùng `m.onPage` (vai ấy do `on-page-fill.mjs` đặt ra ' +
          'sau đúng một lần khoanh đỏ như thế này), đừng chế một biểu thức mới',
      );
    }
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
    'chất liệu chứ không phải của shadow. VÀ pill đứng thẳng trên trang có mặt của riêng nó: câu ' +
    '"chiều sâu là việc của chất liệu" đo trên trang #070708 và trên GIẤY thì sai — đo ảnh chụp máy, ' +
    `bốn chip Today ra 1,056:1 và 1,028:1 so với trang, nhạt hơn mọi mặt khác trên cùng màn. ${onPage} ` +
    `pill trên trang nay mượn \`m.onPage\` (${withFill.light.toFixed(3)}:1 trên giấy, ` +
    `${withFill.dark.toFixed(3)}:1 trong tối), và tiền đề được chạy chứ không chép: mặt pill tự khai ` +
    `chỉ đòi được ${alone.light.toFixed(3)} và ${alone.dark.toFixed(3)}, vẫn dưới bậc có tên — bản đầu ` +
    'của tiền đề ấy viết sai và chính luật này bắt được',
);
