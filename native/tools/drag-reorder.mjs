/**
 * Kéo thả đổi thứ tự: phép tính vị trí đích, và phép ghi thứ tự mới.
 *
 * ── hai chỗ dễ sai, và cả hai đều im lặng ──
 *
 * **Một: ngưỡng lấy nửa bước của hàng NÀO.** Thẻ nhóm cao khác nhau — một nhóm
 * ba widget cao gấp đôi nhóm một widget. Lấy nửa chiều cao của hàng ĐANG KÉO
 * là cách viết tự nhiên nhất và nó sai: kéo một thẻ cao xuống qua một thẻ
 * thấp, ngón tay phải đi quá cả cái thẻ thấp rồi thứ tự mới đổi, và mắt đọc ra
 * là "kéo không ăn". Phải lấy nửa bước của hàng SẮP bị vượt qua.
 *
 * **Hai: hoán đổi thay vì cắt-chèn.** `moveGroup` (hai nút mũi tên) hoán đổi
 * hai ô liền kề, và dùng lại nó cho kéo-thả thì kéo A xuống cuối sẽ đổi A với
 * D và để B, C đứng yên — trong khi suốt cú kéo, mắt vừa nhìn thấy B và C dịch
 * lên. Kết quả không khớp với hoạt hoạ vừa chạy.
 *
 * Cả hai đều cho ra một danh sách "có thứ tự nào đó", nên không có gì đỏ. Vì
 * thế tệp này TRÍCH hai hàm ấy ra khỏi mã thật rồi chạy chúng.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const DRAG = 'src/components/ascnd/drag-reorder.tsx';
const CONFIG = 'src/hooks/use-widget-config.ts';
const TODAY = 'src/app/(tabs)/index.tsx';

/** Dựng lại `target(f, shift, h)` từ chính mã nguồn. */
function buildTarget(src) {
  const m = /const target = useCallback\(\s*\(f: number, shift: number, h: number\[\]\) => \{([\s\S]*?)\n    \},\s*\[count, gap\],\s*\);/.exec(src);
  if (!m) return null;
  const body = m[1].replace(/'worklet';/, '').replace(/: number/g, '').replace(/\bk: number\b/g, 'k');
  return new Function('f', 'shift', 'h', 'count', 'gap', body);
}

/** Dựng lại phép ghi thứ tự mới từ `moveGroupTo`. */
function buildMove(src) {
  const m = /const moveGroupTo = useCallback\([\s\S]*?setConfig\(\(prev\) => \{([\s\S]*?)\n      \}\);/.exec(src);
  if (!m) return null;
  return new Function('prev', 'from', 'to', m[1].replace(/: number/g, ''));
}

const drag = read(DRAG);
const problems = [];
const target = buildTarget(drag);
const move = buildMove(read(CONFIG));

if (!target) problems.push(`${DRAG}: không trích được phép tính vị trí đích`);
if (!move) problems.push(`${CONFIG}: không trích được moveGroupTo`);

/* ── 1. vị trí đích, với chiều cao KHÁC NHAU ─────────────────────────────── */
if (target) {
  const GAP = 16;
  /* Bốn nhóm: cao, thấp, thấp, cao. Đây đúng là hình dạng dashboard thật —
     Sức khoẻ nhiều widget, các nhóm khác một hai cái. */
  const H = [200, 60, 60, 200];
  const step = (k) => H[k] + GAP;
  const t = (f, shift) => target(f, shift, H, H.length, GAP);

  const CASES = [
    [0, 0, 0, 'không kéo thì không đổi chỗ'],
    /* Hàng CAO (200) kéo xuống qua hàng THẤP (60). Ngưỡng phải là 38 — nửa bước
       của hàng thấp — chứ không phải 108, nửa bước của chính nó. */
    [0, 37, 0, 'chưa quá nửa thẻ THẤP bên dưới thì chưa đổi'],
    [0, 39, 1, 'quá nửa thẻ THẤP bên dưới là đổi ngay, không phải nửa thẻ đang kéo'],
    /* Ngưỡng cho bậc thứ hai là 76 (một bước đã đi) + 38 = 114, không phải 76.
       Bảng này thoạt đầu ghi 110 → 2 và máy dò đỏ trên mã hoàn toàn đúng: tôi
       cộng nhầm, và phép cộng ấy chính là thứ đang được kiểm. */
    [0, 113, 1, 'chưa quá ngưỡng bậc hai (114) thì vẫn ở bậc một'],
    [0, 120, 2, 'quá ngưỡng bậc hai thì đi tiếp qua thẻ thấp thứ hai'],
    [0, 500, 3, 'kéo hết cỡ thì tới cuối danh sách'],
    [0, 5000, 3, 'không bao giờ vượt quá cuối danh sách'],
    /* Ngược lên: hàng cao ở cuối kéo lên qua hai hàng thấp. */
    [3, -37, 3, 'kéo lên chưa quá nửa thẻ trên thì chưa đổi'],
    [3, -39, 2, 'quá nửa thẻ trên là đổi'],
    [3, -200, 1, 'lên tiếp một bậc'],
    [3, -5000, 0, 'không bao giờ vượt quá đầu danh sách'],
    /* Hàng THẤP kéo xuống qua hàng CAO: ngưỡng nay là 108. */
    [2, 100, 2, 'thẻ thấp chưa qua nửa thẻ CAO bên dưới thì chưa đổi'],
    [2, 110, 3, 'qua nửa thẻ cao bên dưới thì đổi'],
  ];
  for (const [f, shift, want, what] of CASES) {
    const got = t(f, shift);
    if (got !== want) {
      problems.push(`${DRAG}: kéo hàng ${f} đi ${shift} điểm ra đích ${got}, phải là ${want} — ${what}`);
    }
  }
  /* Và bất biến chung: đích luôn nằm trong danh sách, với mọi quãng kéo. */
  for (let f = 0; f < H.length; f++) {
    for (let s = -1200; s <= 1200; s += 7) {
      const got = t(f, s);
      if (!Number.isInteger(got) || got < 0 || got >= H.length) {
        problems.push(`${DRAG}: kéo hàng ${f} đi ${s} điểm ra đích ${got} — ngoài danh sách`);
        break;
      }
    }
  }
  /* Số đo chưa về (mảng rỗng) không được ném và không được nhảy lung tung. */
  const cold = target(1, 300, [], 4, GAP);
  if (cold < 0 || cold >= 4) problems.push(`${DRAG}: khi chưa đo được chiều cao, đích ra ${cold}`);
}

/* ── 2. ghi thứ tự mới: CẮT-CHÈN, không hoán đổi ─────────────────────────── */
if (move) {
  const prev = { groups: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] };
  const ids = (r) => r.groups.map((g) => g.id).join('');
  const CASES = [
    [0, 3, 'bcda', 'kéo đầu xuống cuối thì ba hàng kia dịch LÊN — hoán đổi sẽ ra "dbca"'],
    [3, 0, 'dabc', 'kéo cuối lên đầu thì ba hàng kia dịch XUỐNG'],
    [1, 2, 'acbd', 'dời một bậc'],
    [2, 2, 'abcd', 'dời tới chính chỗ cũ thì không đổi gì'],
    [0, 9, 'abcd', 'đích ngoài danh sách thì không đổi gì'],
    [-1, 2, 'abcd', 'nguồn ngoài danh sách thì không đổi gì'],
  ];
  for (const [f, t2, want, what] of CASES) {
    const got = ids(move(prev, f, t2));
    if (got !== want) {
      problems.push(`${CONFIG}: moveGroupTo(${f}, ${t2}) ra "${got}", phải là "${want}" — ${what}`);
    }
  }
  /* Và nó không được sửa `prev` tại chỗ: config đi qua một store có so sánh
     tham chiếu, nên sửa tại chỗ là một lần ghi không ai nhận ra. */
  move(prev, 0, 3);
  if (ids(prev) !== 'abcd') problems.push(`${CONFIG}: moveGroupTo sửa thẳng vào object cũ`);
}

/* ── 3. dây nối và những chốt không được mất ─────────────────────────────── */
if (!/activateAfterLongPress\(\d+\)/.test(drag)) {
  problems.push(
    `${DRAG}: pan không còn chờ nhấn giữ — nó sẽ cướp mọi cú CUỘN đi qua thẻ nhóm, và trang thành không ` +
      'cuộn được trong chế độ sắp xếp',
  );
}
/* Bóc chú thích trước khi so: chính chú thích ở `drag-reorder.tsx` nói ra vì
   sao KHÔNG dùng `blocksExternalGesture`, nên không bóc thì luật đỏ trên bản
   đúng và bắt người ta xoá lời giải thích. */
const dragCode = drag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
if (/blocksExternalGesture/.test(dragCode)) {
  problems.push(
    `${DRAG}: pan chặn cử chỉ ngoài — nó chặn ngay từ lúc ngón tay chạm xuống, tức chặn cả cú cuộn chưa bao ` +
      'giờ định kéo thứ gì',
  );
}
/* ── 4. tự cuộn khi kéo tới mép ─────────────────────────────────────────── */
/*
  Phải là một ĐỒNG HỒ KHUNG HÌNH. `onUpdate` của pan chỉ bắn khi ngón tay DI
  CHUYỂN, mà "giữ nguyên ngón tay ở sát mép dưới" là trạng thái phổ biến nhất
  của thao tác này — ở đó không có sự kiện nào, nên trang đứng im đúng lúc
  người dùng đang chờ nó chạy.

  Và nó phải có CỔNG: `tools/motion.mjs` miễn cho tệp này luật Reduce Motion
  (đóng băng cú cuộn là gỡ mất tính năng, không phải giảm chuyển động) và đổi
  lại bằng việc đòi đồng hồ tắt được. Luật ở đây canh vế còn lại: cổng ấy phải
  thật sự được bật/tắt theo cử chỉ.
*/
if (!/useFrameCallback\(/.test(dragCode)) {
  problems.push(
    `${DRAG}: tự-cuộn không chạy trên đồng hồ khung hình — \`onUpdate\` chỉ bắn khi ngón tay di chuyển, nên ` +
      'giữ yên ngón tay ở mép dưới sẽ không cuộn gì cả, đúng lúc người dùng đang chờ nó cuộn',
  );
}
for (const [what, re] of [
  ['bật khi bắt đầu kéo', /onScrolling\)\(true\)/],
  ['tắt khi thả', /onScrolling\)\(false\)/],
  ['gọi scrollTo', /scrollTo\(scrollRef, 0, next, false\)/],
  ['kẹp trong khoảng cuộn hợp lệ', /Math\.min\(Math\.max\(scrollY\.value \+ v, 0\), maxScroll\.value\)/],
]) {
  if (!re.test(dragCode)) problems.push(`${DRAG}: tự-cuộn mất mảnh "${what}"`);
}
/*
  Và quãng dịch phải tính trong HỆ TOẠ ĐỘ NỘI DUNG. `translationY` đo theo màn
  hình; khi tự-cuộn chạy, nội dung trôi dưới ngón tay đang đứng yên — không
  cộng phần đã cuộn thì thẻ tụt lại phía sau ngón tay và vị trí đích tính sai
  đúng bằng quãng đã cuộn.
*/
if (!/scrollY\.value - startScroll\.value/.test(dragCode)) {
  problems.push(
    `${DRAG}: quãng dịch không cộng phần trang đã cuộn — trong lúc tự-cuộn, thẻ sẽ tụt lại sau ngón tay và ` +
      'vị trí đích lệch đúng bằng quãng đã cuộn',
  );
}

/* ── 5. cú nhấc và khe trống đều là LÒ XO ────────────────────────────────── */
/*
  iOS nhấc một hàng lên trước khi cho kéo, và các hàng khác GIÃN RA nhường chỗ.
  Đặt thẳng `scale` và dịch thẳng hàng bên cạnh thì đúng vị trí và không đọc ra
  như nhặt một vật lên — nó đọc ra như một ô trong bảng đổi giá trị.
*/
if (!/lift\.value = withSpring\(1,/.test(dragCode) || !/lift\.value = withSpring\(0,/.test(dragCode)) {
  problems.push(`${DRAG}: cú nhấc không chạy bằng lò xo ở cả hai chiều`);
}
if (!/return withSpring\(want, GAP_SPRING\);/.test(dragCode)) {
  problems.push(
    `${DRAG}: khe trống không giãn bằng lò xo — hàng bên cạnh sẽ NHẢY tới chỗ mới ở đúng khung hình vị trí ` +
      'đích đổi, và cái nhảy đó là khác biệt giữa "danh sách nhường chỗ" với "danh sách chớp sang trạng thái khác"',
  );
}
/* Nhưng khi THẢ thì phải snap: cây vừa dựng lại theo thứ tự mới, nên hàng đã ở
   đúng chỗ layout đặt. Chạy lò xo lúc ấy là bắt nó nhảy xuống rồi bò ngược lên. */
if (!/if \(f < 0 \|\| f === index\) return 0;/.test(dragCode)) {
  problems.push(
    `${DRAG}: khi thả, độ dịch không trả về 0 THẲNG — cây đã dựng lại theo thứ tự mới nên hàng đang ở đúng ` +
      'chỗ, và một lò xo lúc này là hoạt hoạ cho một chuyển động đã xảy ra rồi',
  );
}
/* ── 5b. tay nắm 3 gạch, và nó TRƯỢT VÀO như Apple Music ────────────────── */
/*
  Người dùng yêu cầu cả hai, và chúng là một: bản trước cho cả trang sắp xếp
  `FadeIn` một lượt — mờ cả trang đọc ra như trang vừa được TẢI LẠI, trong khi
  thứ vừa xảy ra là bạn đổi chế độ của một trang vẫn đang ở đó. Apple Music làm
  ngược: trang đứng yên, và những điều khiển MỚI trượt vào từ mép phải.

  Nên luật canh cả hai vế — có tay nắm, và trang KHÔNG mờ cả lượt.
*/
const todaySrc = read(TODAY);
/* Tay nắm sống ở CHỖ GỌI, trong chính hàng tiêu đề, cạnh nút xoá. Bản đầu neo
   nó tuyệt đối ở `right: 16` từ bên trong DragReorder và nó vẽ ĐÈ lên nút thùng
   rác — một component không được chen UI vào bố cục của thẻ nó đang bọc. */
if (/styles\.handle|position: 'absolute', right:/.test(dragCode)) {
  problems.push(
    `${DRAG}: DragReorder lại vẽ tay nắm vào bên trong thẻ — thẻ là nội dung của chỗ gọi, và neo tuyệt đối ` +
      'vào mép phải của nó đã một lần vẽ đè lên nút thùng rác',
  );
}
if (!/styles\.grip\b/.test(todaySrc) || !/styles\.gripLine/.test(todaySrc)) {
  problems.push(`${TODAY}: mất tay nắm ba vạch — không có gì nói cho người dùng biết thẻ này kéo được`);
}
/* Cả CỤM trượt vào cùng nhau. Bản trước cho riêng tay nắm trượt trong khi thùng
   rác hiện thẳng — hai thứ cạnh nhau chạy hai kiểu. */
if (!/<EditControls index=\{gi\}>/.test(todaySrc)) {
  problems.push(
    `${TODAY}: cụm điều khiển chế độ sửa không trượt vào cùng nhau — cho riêng tay nắm trượt trong khi nút ` +
      'xoá hiện thẳng là hai thứ cạnh nhau chạy hai kiểu',
  );
}
if (/styles\.editWrap\}\s*entering=/.test(todaySrc) || /<Animated\.View style=\{styles\.editWrap\}/.test(todaySrc)) {
  problems.push(
    `${TODAY}: trang sắp xếp vẫn mờ cả lượt khi vào chế độ — chuyển động phải nằm ở thứ vừa XUẤT HIỆN, ` +
      'không ở cả trang vốn đã ở đó',
  );
}
/* Hai mũi tên lên/xuống của NHÓM đã đi (Apple Music không có chúng), nên đường
   cho VoiceOver phải chuyển sang accessibility action — nếu không thì người
   dùng ấy mất hẳn khả năng đổi thứ tự nhóm. */
if (!/name: 'moveUp'/.test(todaySrc) || !/name: 'moveDown'/.test(todaySrc)) {
  problems.push(
    `${TODAY}: thẻ nhóm không còn accessibility action dời lên/xuống — hai mũi tên đã bị gỡ khỏi hàng tiêu ` +
      'đề, nên đây là đường DUY NHẤT còn lại cho người dùng VoiceOver',
  );
}
if (!/onAccessibilityAction=/.test(todaySrc)) {
  problems.push(`${TODAY}: khai action mà không xử lý — VoiceOver đọc ra một việc rồi bấm vào không có gì xảy ra`);
}

/* ── 5c. lớp kính ĐỤC lại khi nhấc lên ──────────────────────────────────── */
/*
  `GlassCard` cho thấy thứ nằm sau. Đứng yên thì thứ nằm sau là nền trang —
  đúng ý đồ. Lúc bị nhấc lên và kéo đi thì thứ nằm sau là MỘT TẤM THẺ KHÁC, và
  người dùng đọc được chữ của thẻ dưới xuyên qua thẻ đang cầm. iOS không bao
  giờ để thế: vật được nhấc lên nhận một chất liệu ĐẶC.
*/
if (!/styles\.solid/.test(dragCode)) {
  problems.push(
    `${DRAG}: thẻ đang kéo không có tấm đục luồn dưới — kính sẽ cho thấy chữ của thẻ nằm dưới nó xuyên qua ` +
      'thẻ đang cầm trên tay',
  );
}
if (!/opacity: from\.value === index \? lift\.value : 0/.test(dragCode)) {
  problems.push(
    `${DRAG}: tấm đục không đi theo \`lift\` — nó phải đặc lại CÙNG NHỊP với cú nhấc, và chỉ ở hàng đang ` +
      'được nhấc; bật ra tức thì hoặc áp cho mọi hàng đều đọc ra là một lỗi vẽ',
  );
}
if (!/borderRadius: SOLID_RADIUS/.test(dragCode)) {
  problems.push(`${DRAG}: tấm đục không bo cùng bán kính với thẻ — bốn góc lộ ra một mảng vuông đặc`);
}

/* Không bóng đổ và không opacity trên thẻ đang kéo — hai thứ đã được đo và ghi
   lại ở nơi khác trong repo này. */
if (/shadowOpacity|shadowRadius/.test(dragCode)) {
  problems.push(
    `${DRAG}: thẻ đang kéo mang bóng đổ — liquid-glass.tsx đã đo: trên nền #070708 thì "#070708 dưới ` +
      '#070708 là không có gì", tức một lượt vẽ đổi lấy không pixel nào',
  );
}

const today = read(TODAY);
if (!/onMove=\{moveGroupTo\}/.test(today)) {
  problems.push(
    `${TODAY}: danh sách kéo-thả không dùng \`moveGroupTo\` — \`moveGroup\` chỉ hoán đổi hai ô liền kề, nên ` +
      'kết quả sẽ không khớp với hoạt hoạ người dùng vừa nhìn thấy',
  );
}
/* Mũi tên của từng WIDGET còn nguyên — widget không kéo được, nên chúng vẫn là
   đường duy nhất ở đó. Mũi tên của NHÓM đã đi; đường của nhóm là accessibility
   action, và luật cho nó nằm ở `edit-entry.mjs`. */
for (const label of ['a11yMoveUp', 'a11yMoveDown']) {
  if (!new RegExp(`label=\\{i18n\\.${label}\\}`).test(today)) {
    problems.push(
      `${TODAY}: mất nút \`${label}\` — kéo-thả là lối NHANH, không phải lối thay thế; VoiceOver không có ` +
        '"nhấn giữ rồi trượt lên 120 điểm"',
    );
  }
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'lấy nửa bước của hàng ĐANG KÉO thay vì hàng sắp vượt qua',
    src: drag,
    build: buildTarget,
    mutate: (s) => s.replace('shift > acc + step(k + 1) / 2', 'shift > acc + step(f) / 2'),
    check: (fn) => (fn(0, 39, [200, 60, 60, 200], 4, 16) !== 1 ? ['ngưỡng sai'] : []),
    expect: /ngưỡng sai/,
  },
  {
    name: 'bỏ chốt cuối danh sách',
    src: drag,
    build: buildTarget,
    mutate: (s) => s.replace('while (k + 1 < count &&', 'while (k + 1 < 99 &&'),
    check: (fn) => {
      const got = fn(0, 5000, [200, 60, 60, 200], 4, 16);
      return got >= 4 ? ['vượt quá cuối danh sách'] : [];
    },
    expect: /vượt quá cuối/,
  },
  {
    name: 'tấm đục bật ra tức thì thay vì đặc lại theo cú nhấc',
    src: drag,
    build: (x) => x,
    mutate: (x) => x.replace('opacity: from.value === index ? lift.value : 0,', 'opacity: 1,'),
    check: (x) => (/opacity: from\.value === index \? lift\.value : 0/.test(x) ? [] : ['tấm đục không đi theo lift']),
    expect: /không đi theo lift/,
  },
  {
    name: 'gỡ tấm đục (nhìn xuyên thấy chữ của thẻ dưới)',
    src: drag,
    build: (x) => x,
    mutate: (x) => x.replace(/styles\.solid/g, 'styles.gone'),
    check: (x) => (/styles\.solid/.test(x) ? [] : ['thẻ đang kéo không có tấm đục luồn dưới']),
    expect: /không có tấm đục/,
  },
  {
    name: 'khe trống nhảy thẳng thay vì giãn bằng lò xo',
    src: drag,
    build: (x) => x,
    mutate: (x) => x.replace('return withSpring(want, GAP_SPRING);', 'return want;'),
    check: (x) => (/return withSpring\(want, GAP_SPRING\);/.test(x) ? [] : ['khe trống không giãn bằng lò xo']),
    expect: /khe trống không giãn/,
  },
  {
    name: 'bỏ đồng hồ khung hình (giữ yên ngón tay ở mép thì không cuộn)',
    src: drag,
    build: (x) => x,
    mutate: (x) => x.replace('useFrameCallback(', 'notAFrameClock('),
    check: (x) => (/useFrameCallback\(/.test(x) ? [] : ['tự-cuộn không chạy trên đồng hồ khung hình']),
    expect: /đồng hồ khung hình/,
  },
  {
    name: 'quên cộng phần trang đã cuộn vào quãng dịch',
    src: drag,
    build: (x) => x,
    mutate: (x) => x.replace(/scrollY\.value - startScroll\.value/g, '0'),
    check: (x) => (/scrollY\.value - startScroll\.value/.test(x) ? [] : ['quãng dịch không cộng phần đã cuộn']),
    expect: /không cộng phần đã cuộn/,
  },
  {
    name: 'ghi thứ tự bằng HOÁN ĐỔI thay vì cắt-chèn',
    src: read(CONFIG),
    build: buildMove,
    mutate: (s) =>
      s.replace(
        '        const [moved] = groups.splice(from, 1);\n        groups.splice(to, 0, moved);',
        '        [groups[from], groups[to]] = [groups[to], groups[from]];',
      ),
    check: (fn) => {
      const r = fn({ groups: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] }, 0, 3);
      const got = r.groups.map((g) => g.id).join('');
      return got !== 'bcda' ? [`ra "${got}" thay vì "bcda"`] : [];
    },
    expect: /thay vì "bcda"/,
  },
];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(s.src);
  if (broken === s.src) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const fn = s.build(broken);
  if (!fn) {
    selfFail.push(`${s.name}: không dựng lại được hàm từ bản hỏng`);
    continue;
  }
  const found = s.check(fn);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
  const real = s.build(s.src);
  if (real && s.check(real).length !== 0) selfFail.push(`${s.name}: phép kiểm đỏ ngay trên BẢN THẬT`);
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('kéo thả đổi thứ tự sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'kéo thả đổi thứ tự OK — hai hàm dễ sai nhất được TRÍCH ra khỏi mã thật rồi CHẠY. Phép tính vị trí đích ' +
    'chạy trên bốn thẻ CAO KHÁC NHAU (200/60/60/200, đúng hình dạng dashboard thật): ngưỡng để nhảy qua một ' +
    'hàng là nửa bước của hàng SẮP BỊ VƯỢT QUA, không phải của hàng đang kéo — lấy nhầm thì kéo một thẻ cao ' +
    'qua một thẻ thấp phải đi quá cả thẻ thấp mới đổi chỗ, và mắt đọc ra là "kéo không ăn". Quét hơn 1.300 ' +
    'quãng kéo: đích luôn là số nguyên trong danh sách, kể cả khi chiều cao chưa đo được. Phép ghi thứ tự là ' +
    'CẮT-CHÈN chứ không hoán đổi: kéo hàng đầu xuống cuối ra "bcda" — hoán đổi sẽ ra "dbca" và để hai hàng ' +
    'giữa đứng yên, tức kết quả không khớp với hoạt hoạ người dùng vừa nhìn thấy — và nó không sửa thẳng vào ' +
    'object cũ. Chốt chặn còn nguyên: pan chờ nhấn giữ (không thì nó cướp mọi cú cuộn đi qua thẻ nhóm), ' +
    'không chặn cử chỉ ngoài, dashboard đọc cùng `config.groups` nên thứ tự mới hiện ngay, và hai nút mũi ' +
    'tên vẫn còn vì một cú kéo là vô hình với VoiceOver. ' +
    `${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật`,
);
