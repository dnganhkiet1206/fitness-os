/**
 * Lối vào chế độ sắp xếp: đúng MỘT, và neo vào VỊ TRÍ chứ không vào một mục.
 *
 * ── điều người dùng yêu cầu, nói bằng chữ của họ ──
 *
 * *"cho dù người dùng có chỉnh bất cứ thẻ nào nó vẫn nằm ở đây"*. Đó là một
 * ràng buộc thật và nó có một cách hỏng cụ thể: neo cái nút vào mục Sức khoẻ
 * (`group.id === 'health'`) thì hôm nào người dùng xoá hoặc đổi thứ tự mục ấy,
 * nút Sửa biến mất khỏi dashboard — và lúc đó KHÔNG còn đường nào vào chế độ
 * sắp xếp, vì nó vừa được dời khỏi góc trên. Người dùng mất luôn khả năng sắp
 * xếp lại, không kèm một lỗi nào.
 *
 * Nên luật đòi cái cổng là VỊ TRÍ (`gi === 0`), và cấm nó đọc bất cứ thứ gì
 * thuộc về danh tính của mục.
 *
 * ── và đúng một lối vào ──
 *
 * Một nút cho mỗi mục là bốn nút Sửa làm cùng một việc trên một màn hình. Còn
 * để sót bản cũ ở góc trên thì có hai nút giống nhau ở hai chỗ xa nhau, và cái
 * ở góc trên chỉ hiện ra khi cuộn về đỉnh.
 *
 * ── Cài đặt ──
 *
 * Avatar từng mang hai việc, vì nút Sửa nấp sau nó. Nút ấy đi rồi thì việc thứ
 * nhất không còn gì để làm, và một cú chạm thừa đứng chắn trước màn hình DUY
 * NHẤT không có lối vào nào khác — `app-tabs.tsx` chỉ dựng bốn Trigger. Luật
 * giữ cả hai vế đó, và giữ luôn lời cảnh báo về câu chú thích cũ từng nói
 * ngược lại.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const TODAY = 'src/app/(tabs)/index.tsx';
const TABS_IMPL = 'src/components/app-tabs.tsx';

/** Đọc biểu thức quyết định mục nào được nút Sửa. */
function gate(src) {
  const m = /action=\{\s*([\s\S]*?)\s*\?\s*\(/.exec(src);
  return m ? m[1] : null;
}

function judge(today) {
  const bad = [];

  /* ── 1. cổng là VỊ TRÍ, không phải danh tính của mục ──────────────────── */
  const g = gate(today);
  if (g === null) {
    bad.push('không đọc được cổng của nút Sửa — nó không còn nằm trên hàng tiêu đề mục nào');
  } else {
    if (!/^\w+ === 0$/.test(g)) {
      bad.push(
        `cổng của nút Sửa là \`${g}\` chứ không phải một phép so VỊ TRÍ — người dùng có quyền xoá, đổi tên ` +
          'và đổi thứ tự mục, nên neo vào một mục cụ thể là neo vào thứ họ làm biến mất được, và hôm đó ' +
          'không còn đường nào vào chế độ sắp xếp',
      );
    }
    if (/group\b|\.id\b|title/.test(g)) {
      bad.push(`cổng của nút Sửa đọc thuộc tính của mục (\`${g}\`) — nó phải chỉ đọc chỉ số vị trí`);
    }
  }

  /* ── 2. đúng MỘT lối vào ──────────────────────────────────────────────── */
  const entries = [...today.matchAll(/setEditMode\(true\)/g)].length;
  if (entries !== 1) {
    bad.push(
      `có ${entries} chỗ bật chế độ sắp xếp, phải đúng 1 — hai nút giống nhau ở hai chỗ xa nhau (một trong ` +
        'số đó chỉ hiện khi cuộn về đỉnh) là hai lời mời cho cùng một việc',
    );
  }
  if (/<EditLayoutButton/.test(today.slice(today.indexOf('styles.headerButtons')))) {
    bad.push('nút Sửa vẫn còn ở hàng nút góc trên — nó đã được dời xuống hàng tiêu đề mục');
  }

  /* ── 3. nhãn HIỆN ngắn, tách khỏi nhãn cho trình đọc màn hình ─────────── */
  /*
    `a11yEditLayout` là "Sắp xếp lại bảng điều khiển" — đúng cho tai, quá dài
    cho một hàng tiêu đề. Ngược lại, để trình đọc màn hình chỉ nghe "Sửa" là bỏ
    rơi nó: nó đọc từng phần tử rời nhau, không thấy tiêu đề mục bên trái.
  */
  if (!/label=\{i18n\.editLayout\}/.test(today) || !/a11yLabel=\{i18n\.a11yEditLayout\}/.test(today)) {
    bad.push(
      'nút Sửa không tách nhãn hiện khỏi nhãn trợ năng — mắt thấy cả tiêu đề mục bên trái nên "Sửa" là đủ, ' +
        'còn trình đọc màn hình đọc từng phần tử rời nhau nên nó cần câu đầy đủ',
    );
  }

  /* ── 4. vùng chạm vẫn đủ sàn 44 của Apple ────────────────────────────── */
  /*
    Chữ 13 điểm cao khoảng 18. Không có `padding` (padding sẽ đẩy hàng tiêu đề
    cao lên và làm hỏng nhịp dọc), nên `hitSlop` phải bù đủ phần còn thiếu.
  */
  const slop = /hitSlop=\{\{ top: (\d+), bottom: (\d+)/.exec(today);
  if (!slop) {
    bad.push('nút Sửa không có hitSlop — chữ cao ~18 điểm, dưới sàn 44 của Apple');
  } else if (18 + Number(slop[1]) + Number(slop[2]) < 44) {
    bad.push(
      `hitSlop dọc của nút Sửa chỉ đưa vùng chạm lên ${18 + Number(slop[1]) + Number(slop[2])} điểm, cần ≥44`,
    );
  }

  /* ── 5. avatar về một chạm ───────────────────────────────────────────── */
  if (/accessibilityState=\{\{ expanded: toolsOpen \}\}/.test(today) || /toolsOpen/.test(today)) {
    bad.push(
      'avatar vẫn mang cơ chế mở-ra-trước — nút Sửa đã đi khỏi góc trên, nên việc thứ nhất không còn gì để ' +
        'làm và nó chỉ còn là một cú chạm thừa trước Cài đặt',
    );
  }
  if (!/router\.push\('\/settings'\)/.test(today)) {
    bad.push("avatar không còn `router.push('/settings')`");
  }

  return bad;
}

const today = read(TODAY);
const problems = judge(today);

/* ── 6. Cài đặt vẫn không có lối vào nào khác, và mã đừng nói ngược lại ─── */
const settingsIsTab = /<NativeTabs\.Trigger[^>]*name="settings"/.test(read(TABS_IMPL));
/* Bóc trích dẫn `*"…"*` trước khi so — chú thích sửa sai trích lại đúng câu cũ
   để nói vì sao nó sai, và không bóc thì luật bắt người ta xoá bằng chứng. */
const claims = today.replace(/\*"[\s\S]*?"\*/g, '');
if (!settingsIsTab && /(fifth tab|tab thứ năm|second way in)/.test(claims)) {
  problems.push(
    `${TODAY}: vẫn còn khẳng định Settings là một tab, trong khi ${TABS_IMPL} chỉ dựng bốn Trigger. Câu ấy ` +
      'đã một lần được tin và dùng làm căn cứ cho một quyết định thiết kế',
  );
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'neo nút Sửa vào mục Sức khoẻ thay vì vị trí',
    mutate: (s) => s.replace('gi === 0 ? (', "group.id === 'health' ? ("),
    expect: /không phải một phép so VỊ TRÍ|đọc thuộc tính của mục/,
  },
  {
    name: 'cho MỌI mục một nút Sửa',
    mutate: (s) => s.replace('gi === 0 ? (', 'true ? ('),
    expect: /không phải một phép so VỊ TRÍ/,
  },
  {
    name: 'gộp hai nhãn làm một (trình đọc màn hình chỉ nghe "Sửa")',
    mutate: (s) => s.replace('a11yLabel={i18n.a11yEditLayout}', 'a11yLabel={i18n.editLayout}'),
    expect: /không tách nhãn hiện khỏi nhãn trợ năng/,
  },
  {
    name: 'bỏ hitSlop (vùng chạm tụt xuống ~18 điểm)',
    mutate: (s) => s.replace(/hitSlop=\{\{ top: \d+, bottom: \d+, left: \d+, right: \d+ \}\}\n\s*/, ''),
    expect: /không có hitSlop/,
  },
  {
    name: 'thêm một lối vào thứ hai',
    mutate: (s) => s.replace('setEditMode(true);', 'setEditMode(true); setEditMode(true);'),
    expect: /chỗ bật chế độ sắp xếp, phải đúng 1/,
  },
];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(today);
  if (broken === today) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = judge(broken);
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}
if (judge(today).length !== 0) selfFail.push(`phép kiểm đỏ ngay trên BẢN THẬT: ${judge(today).join('; ')}`);

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('lối vào chế độ sắp xếp sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'lối vào chế độ sắp xếp OK — đúng MỘT nút Sửa, và nó neo vào VỊ TRÍ (`gi === 0`) chứ không vào danh tính ' +
    'của mục: người dùng có quyền xoá, đổi tên và đổi thứ tự mục, nên neo vào mục Sức khoẻ là neo vào thứ ' +
    'họ làm biến mất được — và hôm đó không còn đường nào vào chế độ sắp xếp, vì nút cũ ở góc trên đã bị ' +
    'dời đi. Nhãn tách đôi: mắt thấy tiêu đề mục ngay bên trái nên "Sửa" là đủ, còn trình đọc màn hình đọc ' +
    'từng phần tử rời nhau nên nó nghe câu đầy đủ. Vùng chạm đạt sàn 44 bằng `hitSlop` chứ không bằng ' +
    '`padding`, vì padding sẽ đẩy hàng tiêu đề cao lên và làm hỏng nhịp dọc của trang. Avatar về một chạm ' +
    'vào Cài đặt — màn hình ấy không có lối vào nào khác, nên một cú chạm thừa đứng trước nó là một cú ' +
    `chạm thừa trong cả app. ${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật`,
);
