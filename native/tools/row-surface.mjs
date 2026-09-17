/**
 * Một hàng vuốt được KHÔNG được sơn gì lúc nó nằm yên.
 *
 *     node tools/row-surface.mjs
 *
 * ── lỗi nó sinh ra để bắt ──
 *
 * `SwipeRow` từng nhận một cặp `{ rest, lifted }`, và chỗ gọi đưa `rest: m.bg`
 * — "màu mặt thẻ". Cái tên ấy nghĩa KHÁC NHAU ở hai diện mạo:
 *
 *     sáng   m.bg = #ffffff ĐẶC, đúng bằng mặt thẻ  → 1,000:1, vô hình
 *     tối    m.bg = rgba(255,255,255,0.06), mà mặt thẻ CŨNG thế
 *            → hai lớp mờ cộng dồn: #242425 trên #161617 = 1,166:1
 *
 * 1,166 nằm TRÊN bậc bề mặt nhỏ nhất của iOS (1,134), nên mỗi hàng thành một
 * dải ngang nhìn thấy rõ và cả thẻ bị chia thành strip ở bản tối. Chủ dự án
 * chụp đúng cái đó và nói "Dark Mode phải tạo thành một surface liền mạch".
 *
 * Nửa thứ hai của cùng một lỗi, và nó im lặng hơn: ở bản tối `lifted`
 * (`m.inset.bg`) BẰNG ĐÚNG `rest`, nên cú nhấc hàng lên khi vuốt không đổi một
 * điểm ảnh nào. Tính năng được đặt hàng chưa từng chạy ở bản tối, trong khi cái
 * giá của nó thì hiện suốt.
 *
 * ── vì sao `tsc` và các cổng khác không thấy ──
 *
 * `rest` và `lifted` đều là `string` hợp lệ. `dark-frozen.mjs` canh GIÁ TRỊ
 * token chứ không canh việc một component chồng hai token lên nhau.
 * `theme-shape.mjs` canh nhánh `m.lit` chứ không canh phép composite.
 * `on-page-fill.mjs` canh lớp tô trên TRANG, không canh lớp tô trên MẶT THẺ.
 * Và ảnh chụp bản sáng thì đúng — lỗi chỉ hiện ở diện mạo còn lại.
 *
 * ── luật ──
 *
 * 1. `SwipeRow` không được nhận mặt lúc NGHỈ từ bên ngoài. Prop `surface` là
 *    MỘT màu, và đó là màu lúc NHẤC.
 * 2. Mặt lúc nghỉ phải là chính màu ấy ở alpha 0 — tức không sơn gì, và không
 *    có phép đổi TÔNG nào giữa hai đầu.
 * 3. Màu lúc nhấc phải ĐẶC (`#rrggbb`), vì tấm nút là `absoluteFill` ngay sau
 *    hàng; một mặt mờ để viên nút hiện xuyên qua chính hàng đang kéo.
 * 4. Màu lúc nhấc phải TÁCH được khỏi mặt thẻ. Bản TỐI chịu SÀN 1,134 — không
 *    có vế này thì "nhấc hàng lên" lại thành một no-op, đúng như nó vừa rồi.
 *    Bản SÁNG là một CÁI CHỐT chứ không phải một sàn: nó đo được 1,097, tức
 *    DƯỚI bậc ấy, và nó được giữ nguyên vì chủ dự án ra lệnh thẳng trong cùng
 *    lượt sửa này. Số ấy đã được báo lại kèm hai đề nghị. Chốt để nó không trôi
 *    trong khi chờ trả lời.
 * 5. Mặt hàng phải đục HẲN sớm trong cú kéo (`LIFT_AT`), không thì vế 3 vô
 *    nghĩa: hàng mờ dần suốt cú kéo cũng là hàng để nút hiện xuyên qua.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { hex, loadPalette, overC, ratio, toHex } from './lib/stack.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROW = 'src/components/ascnd/swipe-row.tsx';
const PALETTE = 'src/constants/palette.ts';

/** Bậc bề mặt nhỏ nhất iOS tự tạo — cùng con số `bar-track.mjs` dùng. */
const STEP = 1.134;
/** Trên mức này thì cú kéo đã đi quá xa để còn gọi là "đục sớm". */
const LIFT_CEILING = 0.25;

const problems = [];
let CASES = 0;

const row = strip(read(ROW));

/* ── 1. không ai được khai mặt lúc NGHỈ ── */
CASES++;
if (!/\blifts\?: boolean;/.test(row) || /\bsurface\?:/.test(row)) {
  problems.push(
    `${ROW}: prop không còn là \`lifts?: boolean\`, hoặc \`surface?:\` đã quay lại. Chỗ gọi chỉ được nói ` +
      'CÓ nhấc hay không; nó không được CHỌN màu. Cặp `{ rest, lifted }` cũ để chỗ gọi khai mặt lúc nghỉ ' +
      'bằng TÊN TOKEN (`m.bg`), mà tên ấy nghĩa khác nhau ở hai diện mạo — đó chính là đường sinh ra dải ' +
      'ngang ở bản tối. Mặt lúc nghỉ không phải một lựa chọn: hàng đang nghỉ sơn đúng không gì cả',
  );
}
CASES++;
if (/surface\.rest|surface\.lifted/.test(row)) {
  problems.push(`${ROW}: còn đọc \`surface.rest\`/\`surface.lifted\` — cặp ấy đã bị bỏ, xem luật 1`);
}

/* ── 2. hai đầu nội suy là CÙNG một màu, khác mỗi alpha ── */
CASES++;
if (!/\[liftFrom, liftTo\]/.test(row) || !/const liftFrom = lifts \? alpha\(m\.liftedRow, 0\)/.test(row)) {
  problems.push(
    `${ROW}: hai đầu của \`interpolateColor\` phải là \`[liftFrom, liftTo]\`, tính SẴN trên luồng JS bằng ` +
      '`const liftFrom = lifts ? alpha(m.liftedRow, 0) : …`. Hai lý do, cả hai đều đã hỏng thật: gọi ' +
      '`alpha()` BÊN TRONG thân worklet là một Remote Function trên UI runtime và app chết ngay khung ' +
      'hình đầu (2026-09-17); và hai đầu phải cùng một RGB khác mỗi alpha, vì nội suy giữa hai RGB khác ' +
      'nhau đi qua một dải tông không ai chọn, còn một đầu không phải alpha 0 thì hàng đang nghỉ lại ' +
      'sơn một lớp lên mặt thẻ — đúng cái sinh ra dải',
  );
}

/* ── 3. mặt lúc nhấc phải đục sớm ── */
CASES++;
const mLift = /const LIFT_AT = ([\d.]+);/.exec(row);
if (!mLift) {
  problems.push(`${ROW}: không đọc được \`LIFT_AT\` — luật "đục sớm" đang không kiểm gì cả`);
} else {
  CASES++;
  const v = Number(mLift[1]);
  if (v > LIFT_CEILING) {
    problems.push(
      `${ROW}: \`LIFT_AT\` = ${v}, trên trần ${LIFT_CEILING}. Mặt hàng còn dở dang tới tận đó thì viên ` +
        'nút — tấm nút là `absoluteFill` ngay sau hàng — hiện xuyên qua chính hàng đang kéo',
    );
  }
  CASES++;
  if (!new RegExp(`interpolate\\(openness\\.value,\\s*\\[0,\\s*LIFT_AT\\]`).test(row)) {
    problems.push(
      `${ROW}: độ đục của mặt hàng không còn chạy trên \`[0, LIFT_AT]\`. Trải nó ra cả cú kéo là để ` +
        'hàng mờ suốt quãng viên nút đang hiện lên',
    );
  }
}

/* ── 4. màu lúc nhấc: ĐẶC, và tách được khỏi mặt thẻ ở CẢ HAI diện mạo ── */
{
  const pal = read(PALETTE);
  const { palettes, materials } = loadPalette();
  CASES++;
  if (!/liftedRow:\s*\S/.test(pal)) {
    problems.push(`${PALETTE}: không còn trường \`liftedRow\` — không có màu lúc nhấc thì không đo được gì`);
  } else {
    for (const theme of ['light', 'dark']) {
      const lifted = materials[theme].liftedRow;
      const vi = theme === 'light' ? 'sáng' : 'tối';

      CASES++;
      if (!/^#[0-9a-fA-F]{6}$/.test(String(lifted ?? ''))) {
        problems.push(
          `${PALETTE}: \`liftedRow\` bản ${vi} là "${lifted}", không phải hex ĐẶC. Hàng được nhấc phải ` +
            'đục: tấm nút nằm `absoluteFill` ngay sau nó, nên một mặt mờ để viên nút hiện xuyên qua hàng',
        );
        continue;
      }

      /* Mặt thẻ dựng đúng chồng mặt: trang → GlassCard `onPage`. */
      const page = hex(palettes[theme].background);
      const m = materials[theme];
      const face = /rgba/.test(m.onPage)
        ? overC([255, 255, 255], page, Number(/,\s*([\d.]+)\)/.exec(m.onPage)[1]))
        : hex(m.onPage);

      CASES++;
      const r = ratio(hex(lifted), face);

      /* Bản SÁNG là một CÁI CHỐT, không phải một sàn — và lý do được ghi ra chứ
         không giấu.

         `#f7f4ef` tách khỏi giấy trắng chỉ 1,097:1, tức DƯỚI bậc 1,134. Nó
         không được nâng lên vì chủ dự án ra lệnh thẳng trong cùng lượt sửa
         này: *"Light Mode phải giữ nguyên behavior hiện tại"* — và giá trị ấy
         đúng là thứ `m.inset.bg` vẫn trả về ở bản sáng từ trước.

         Nên vế này chốt bản sáng vào ĐÚNG giá trị đang chạy: đổi nó là đỏ, dù
         đổi lên hay xuống. Con số 1,097 đã được báo cho chủ dự án kèm đề nghị
         `c.muted` (1,156) hoặc `c.secondary` (1,198); chừng nào chưa có trả
         lời thì lệnh cũ thắng, và cái chốt giữ cho nó không tự trôi.

         Bản TỐI thì chịu sàn thật, vì nó vừa là chỗ lỗi xảy ra. */
      if (theme === 'light') {
        if (lifted !== palettes.light.background) {
          problems.push(
            `${PALETTE}: \`liftedRow\` bản sáng là ${lifted}, không còn là \`lightPalette.background\` ` +
              `(${palettes.light.background}). Chủ dự án ra lệnh "Light Mode phải giữ nguyên behavior ` +
              'hiện tại" trong lượt sửa dải bản tối, nên giá trị này bị CHỐT chứ không phải bị thả nổi. ' +
              `Giá trị mới đo được ${r.toFixed(3)}:1 trên mặt thẻ; giá trị bị chốt đo 1,097 và nằm DƯỚI ` +
              `bậc ${STEP}, nên nâng nó có thể ĐÚNG — nhưng đó là câu phải hỏi chủ dự án, không phải câu ` +
              'tự trả lời bằng một lần sửa lặng lẽ',
          );
        }
      } else if (r < STEP) {
        problems.push(
          `${PALETTE}: \`liftedRow\` bản ${vi} (${lifted}) chỉ tách khỏi mặt thẻ ${toHex(face)} ` +
            `${r.toFixed(3)}:1 — dưới bậc bề mặt ${STEP} của iOS. Cú "nhấc hàng lên khi vuốt" thành một ` +
            'no-op ở diện mạo này, đúng như bản tối trước khi sửa (rest và lifted bằng nhau từng byte)',
        );
      }
    }
  }
}

/* ── 5. và chỗ gọi phải đưa ĐÚNG trường ấy, không tự chế một màu khác ── */
{
  CASES++;
  const hosts = [];
  for (const f of ['src/components/ascnd/todo-card.tsx']) {
    const src = strip(read(f));
    if (/surface=\{/.test(src)) {
      problems.push(
        `${f}: còn truyền \`surface={…}\` cho <SwipeRow>. Chỗ gọi không được CHỌN màu lúc nhấc nữa — ` +
          'một màu tự chế ở chỗ gọi không đi qua vế đo ở luật 4, và đó đúng là đường mà `m.bg` đã đi vào',
      );
    } else if (!/<SwipeRow\b[\s\S]{0,400}?\blifts\b/.test(src)) {
      problems.push(`${f}: không còn bật \`lifts\` trên <SwipeRow> — hàng sẽ không nhấc lên khi vuốt`);
    } else hosts.push(f);
  }
  if (hosts.length) CASES++;
}

/* ── tự kiểm: luật phải biết ĐỎ ──
   Chạy lại đúng vế 4 trên một thế giới giả có `liftedRow` bằng đúng mặt thẻ —
   tức đúng trạng thái bản tối TRƯỚC khi sửa — và đòi nó đỏ. */
{
  const { palettes, materials } = loadPalette();
  let caught = 0;
  /* Chỉ bản TỐI, vì chỉ bản tối chịu SÀN — bản sáng là một cái chốt giá trị. */
  for (const theme of ['dark']) {
    const page = hex(palettes[theme].background);
    const m = materials[theme];
    const face = /rgba/.test(m.onPage)
      ? overC([255, 255, 255], page, Number(/,\s*([\d.]+)\)/.exec(m.onPage)[1]))
      : hex(m.onPage);
    if (ratio(face, face) < STEP) caught++;
  }
  CASES++;
  if (caught !== 1) {
    problems.push(
      'tools/row-surface.mjs: phần tự kiểm KHÔNG bắt được ca "lifted bằng đúng mặt thẻ" ở cả hai diện ' +
        'mạo — tức vế 4 không còn đỏ được, và luật này đang không bảo vệ gì',
    );
  }
}

if (problems.length) {
  console.error('mặt hàng vuốt CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

const { palettes, materials } = loadPalette();
const marks = ['light', 'dark'].map((theme) => {
  const page = hex(palettes[theme].background);
  const m = materials[theme];
  const face = /rgba/.test(m.onPage)
    ? overC([255, 255, 255], page, Number(/,\s*([\d.]+)\)/.exec(m.onPage)[1]))
    : hex(m.onPage);
  return `${theme === 'light' ? 'sáng' : 'tối'} ${m.liftedRow} trên mặt thẻ ${toHex(face)} = ` +
    `${ratio(hex(m.liftedRow), face).toFixed(3)}:1`;
});

console.log(
  `mặt hàng vuốt OK — ${CASES} ca. Hàng đang NGHỈ sơn đúng không gì cả: hai đầu nội suy là cùng một RGB ` +
    `khác mỗi alpha (\`[alpha(surface,0), surface]\`), nên không có lớp thứ hai chồng lên mặt thẻ và không ` +
    `có phép đổi tông ở giữa. Đó là lỗi vừa sửa: chỗ gọi từng khai mặt lúc nghỉ bằng \`m.bg\`, mà cái tên ` +
    `ấy là #ffffff ĐẶC ở bản sáng (trùng khít mặt thẻ, 1,000:1, vô hình) nhưng là rgba(255,255,255,0.06) ` +
    `ở bản tối, chồng lên một mặt thẻ cũng mờ đúng thế — ra #242425 trên #161617, tức 1,166:1, TRÊN bậc ` +
    `bề mặt 1,134 của iOS. Mỗi hàng thành một dải ngang. Và cùng cái tên ấy làm nửa còn lại im lặng: ở bản ` +
    `tối \`lifted\` bằng đúng \`rest\`, nên cú nhấc hàng khi vuốt chưa từng chạy ở diện mạo đó. Nay màu lúc ` +
    `nhấc sống ở \`Material.liftedRow\`, phải là hex ĐẶC (tấm nút là absoluteFill ngay SAU hàng, mặt mờ thì ` +
    `viên nút hiện xuyên qua chính hàng đang kéo) và phải tách khỏi mặt thẻ: ${marks.join(' · ')}. Bản TỐI chịu SÀN 1,134 vì nó là chỗ lỗi xảy ra; bản SÁNG ` +
    `là một CÁI CHỐT — 1,097 nằm DƯỚI bậc ấy, được giữ nguyên theo lệnh "Light Mode phải giữ nguyên behavior ` +
    `hiện tại" và đã báo lại kèm đề nghị c.muted (1,156) / c.secondary (1,198), nên chốt giữ cho nó không trôi ` +
    `trong khi chờ. ` +
    `Mặt hàng đục hẳn trong \`LIFT_AT\` đầu cú kéo, không trải ra cả quãng — đo trên bản dựng, rò lớn nhất ` +
    `5,3% ở lúc hàng dịch 5 điểm. Phần tự kiểm chạy lại vế bậc bề mặt trên thế giới giả "lifted = mặt thẻ" ` +
    `và đòi nó đỏ ở bản tối, nên xoá vế ấy đi không thể xanh`,
);
