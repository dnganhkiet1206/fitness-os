/**
 * Gộp nút chỉnh sửa vào nút cài đặt mà không đánh mất cái đích nào.
 *
 * ── vì sao tệp này tồn tại ──
 *
 * Một nút mang HAI việc là thứ dễ hỏng theo kiểu không ai nhận ra: người sau
 * đọc `onPress` thấy nó mở một hàng nút ra, kết luận rằng đây là một công tắc,
 * và gỡ nhánh `router.push('/settings')` đi cho gọn. Màn hình vẫn chạy, không
 * lỗi nào, không cảnh báo nào — chỉ là một lối vào Cài đặt lặng lẽ biến mất.
 *
 * Và ở app này nhánh ấy là lối vào DUY NHẤT. Bản đầu của tệp này tin vào một
 * chú thích ở `index.tsx` nói rằng Settings còn là tab thứ năm, rồi đi đòi cái
 * tab ấy phải tồn tại — chạy lên thì đỏ, vì `app-tabs.tsx` nói thẳng ngược lại
 * và chỉ dựng bốn Trigger. Câu chú thích kia đã thôi đúng và không ai sửa.
 *
 * Nó không vô hại: nó được đọc, được tin, và được đưa cho người dùng như một
 * dữ kiện khi hỏi họ nên gộp hai nút kiểu nào. Nên luật canh luôn cả điều đó —
 * lời khẳng định sai không được mọc lại — và canh nhánh push như thứ nó thật
 * sự là: đường duy nhất tới một màn hình.
 *
 * ── và vế trình đọc màn hình ──
 *
 * Mắt đọc được nút chỉnh sửa vừa trượt ra. Trình đọc màn hình thì không — nó
 * chỉ có cái nhãn. Một nút đọc lên là "Cài đặt" ở cả hai trạng thái là một nút
 * nói dối đúng một nửa số lần bấm, nên nhãn phải đổi theo trạng thái và
 * `expanded` phải được khai.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');

const TODAY = 'src/app/(tabs)/index.tsx';
const REVEAL = 'src/components/ascnd/tool-reveal.tsx';
/* Thanh tab thật nằm ở đây; `(tabs)/_layout.tsx` chỉ dựng lại component này. */
const TABS_IMPL = 'src/components/app-tabs.tsx';

/** Đọc `onPress` của nút bánh răng ra khỏi khối JSX của nó. */
function gearPress(src) {
  const at = src.indexOf('accessibilityState={{ expanded: toolsOpen }}');
  if (at < 0) return null;
  const m = /onPress=\{\(\) => \{([\s\S]*?)\n\s*\}\}>/.exec(src.slice(at));
  return m ? m[1] : null;
}

function judge(today) {
  const bad = [];

  /* ── 1. nút bánh răng vẫn tới được Cài đặt ────────────────────────────── */
  const press = gearPress(today);
  if (press === null) {
    bad.push(
      'không đọc được nút bánh răng, hoặc nó không còn khai `expanded` — trình đọc màn hình chỉ có cái ' +
        'nhãn, nên trạng thái mở/đóng phải được nói ra thành lời',
    );
  } else {
    if (!/router\.push\('\/settings'\)/.test(press)) {
      bad.push(
        "nút bánh răng không còn `router.push('/settings')` — cú chạm thứ hai mất đích, và lối vào Cài đặt " +
          'từ dashboard biến mất mà không có lỗi nào báo',
      );
    }
    /* Và nó phải MỞ RA trước khi đi: một nút vừa mở vừa đi ngay ở cú chạm đầu
       thì hàng nút hiện ra rồi màn hình đổi luôn — không ai kịp bấm cái bút. */
    if (!/setToolsOpen\(true\);?\s*\n\s*return;/.test(press)) {
      bad.push(
        'cú chạm đầu không dừng lại ở việc mở ra — nếu nó mở rồi đi tiếp luôn thì nút chỉnh sửa hiện ra ' +
          'đúng lúc màn hình rời đi, tức là nó chưa từng bấm được',
      );
    }
  }

  /* ── 2. nhãn đổi theo trạng thái ──────────────────────────────────────── */
  if (!/accessibilityLabel=\{\s*toolsOpen \?/.test(today)) {
    bad.push(
      'nhãn của nút bánh răng không đổi theo trạng thái — cùng một nút làm hai việc, nên một cái nhãn cố ' +
        'định nói sai đúng một nửa số lần bấm',
    );
  }

  /* ── 3. bề rộng lấy từ hằng số của chính cái nút ──────────────────────── */
  const w = /<ToolReveal open=\{toolsOpen\} width=\{(\w+)\}>/.exec(today);
  if (!w) {
    bad.push('nút chỉnh sửa không còn nằm trong `ToolReveal` — nó lại chiếm một ô cố định ở góc trên');
  } else if (w[1] !== 'TOP_BAR_H') {
    bad.push(
      `bề rộng mở ra là \`${w[1]}\` chứ không phải \`TOP_BAR_H\` — đó là cạnh của \`squareBtn\`, và hai bản ` +
        'sao sẽ lệch ngay lần đầu ai đó chỉnh một bên',
    );
  }

  /* ── 4. nút chỉnh sửa phải đứng TRƯỚC nút bánh răng ───────────────────── */
  /*
    Hàng căn phải, nên thứ tự nguồn quyết định bên nào mọc ra. Đảo lại thì hộp
    lớn dần nằm bên PHẢI nút bánh răng, và nút bánh răng bị đẩy sang trái đúng
    giữa hai cú chạm — cú thứ hai rơi vào chỗ trống.
  */
  const iReveal = today.indexOf('<ToolReveal');
  const iGear = today.indexOf('accessibilityState={{ expanded: toolsOpen }}');
  if (iReveal >= 0 && iGear >= 0 && iReveal > iGear) {
    bad.push(
      'nút chỉnh sửa nằm SAU nút bánh răng trong nguồn — hàng này căn phải, nên hộp lớn dần sẽ đẩy nút bánh ' +
        'răng sang trái đúng giữa hai cú chạm, và cú thứ hai rơi vào chỗ trống',
    );
  }

  return bad;
}

const today = read(TODAY);
const problems = judge(today);

/* ── 5. Cài đặt có mấy lối vào, và mã có nói đúng con số đó không ────────── */
/*
  ── luật này bắt đầu từ một câu SAI trong chú thích, và câu ấy đã lái một
     quyết định sản phẩm ──

  Bản đầu của luật đòi `name="settings"` trong thanh tab, vì chú thích ở
  `index.tsx` ghi *"It is also the fifth tab now, so this is a second way in
  rather than the only one"*. Chạy lên thì ĐỎ: `app-tabs.tsx` nói thẳng ngược
  lại — *"four tabs, and Settings is not one of them… It is reached from the
  Today header"*. Chú thích kia đã thôi đúng và không ai sửa.

  Nó không phải một câu chữ vô hại: nó được đọc, được tin, và được đưa cho
  người dùng như một dữ kiện khi hỏi họ nên gộp hai nút kiểu nào. Một chú thích
  lệch khỏi mã tệ hơn không có chú thích, đúng vì nó được tin.

  Nên luật canh cả hai chiều, và chiều thứ hai mới là chiều thật:

    · nếu Settings KHÔNG phải tab thì `index.tsx` không được nói rằng nó là —
      đây là chỗ mà lời khẳng định sai sẽ mọc lại;
    · và khi ấy nhánh push ở mục 1 là lối vào DUY NHẤT, nên nó không phải một
      tiện ích: mất nó là mất hẳn một màn hình khỏi app.
*/
const tabsSrc = read(TABS_IMPL);
const settingsIsTab = /<NativeTabs\.Trigger[^>]*name="settings"/.test(tabsSrc);
/*
  Bóc TRÍCH DẪN ra trước khi so. Repo này trích lời của một tệp khác bằng
  `*"…"*`, và chú thích sửa sai ở `index.tsx` trích lại đúng câu cũ để nói vì
  sao nó sai. Không bóc thì luật đỏ trên chính bản sửa — nó sẽ bắt người ta xoá
  bằng chứng thay vì xoá lời khẳng định.
*/
const claims = today.replace(/\*"[\s\S]*?"\*/g, '');
if (!settingsIsTab && /(fifth tab|tab thứ năm|second way in)/.test(claims)) {
  problems.push(
    `${TODAY}: vẫn còn khẳng định Settings là một tab, trong khi ${TABS_IMPL} nói ngược lại và chỉ dựng bốn ` +
      'Trigger. Câu ấy đã một lần được tin và dùng làm căn cứ cho một quyết định thiết kế',
  );
}
if (!settingsIsTab && !/router\.push\('\/settings'\)/.test(today)) {
  problems.push(
    `${TODAY}: Settings không phải tab VÀ header không còn push tới nó — không còn lối vào nào trong cả app`,
  );
}

/* ── 6. `ToolReveal` chạy chiều RỘNG, không phải một phép dịch ───────────── */
const reveal = read(REVEAL);
if (!/width: grow\.value \* w\.value/.test(reveal)) {
  problems.push(
    `${REVEAL}: không còn chạy chiều rộng thật — một \`translateX\` không đẩy được viên chuỗi ngày sang ` +
      'trái, nên nó hoặc đè lên viên ấy hoặc bắt để sẵn một cái hố rộng bằng một nút suốt lúc đóng',
  );
}
if (!/position: 'absolute', left: 0/.test(reveal)) {
  problems.push(
    `${REVEAL}: con trượt không còn neo ở \`left: 0\` — neo phải thì nó đứng yên trong lúc hộp lớn ra quanh ` +
      'nó, và cú mở đọc ra như một tấm rèm kéo ngang thay vì một nút trượt ra từ sau nút kia',
  );
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'gỡ nhánh vào Cài đặt (biến nút thành công tắc thuần)',
    mutate: (s) => s.replace("router.push('/settings');", 'setToolsOpen(false);'),
    expect: /không còn `router\.push/,
  },
  {
    name: 'mở ra rồi đi luôn ở cú chạm đầu',
    mutate: (s) => s.replace(/setToolsOpen\(true\);\s*\n\s*return;/, 'setToolsOpen(true);'),
    expect: /cú chạm đầu không dừng lại/,
  },
  {
    name: 'nhãn cố định (trình đọc màn hình nghe "Cài đặt" ở cả hai trạng thái)',
    mutate: (s) => s.replace(/accessibilityLabel=\{\s*toolsOpen \?[\s\S]*?\n\s*\}/, 'accessibilityLabel={i18n.a11ySettings}'),
    expect: /nhãn của nút bánh răng không đổi/,
  },
  {
    name: 'gõ cứng bề rộng thay vì TOP_BAR_H',
    mutate: (s) => s.replace('width={TOP_BAR_H}', 'width={44}'),
    expect: /bề rộng mở ra là/,
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
  console.log('gộp nút chỉnh sửa vào nút cài đặt sai:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'gộp nút chỉnh sửa OK — nút bánh răng mang hai việc và KHÔNG mất việc nào: cú chạm đầu chỉ mở nút chỉnh ' +
    "sửa ra rồi dừng (mở rồi đi tiếp luôn thì nút hiện ra đúng lúc màn hình rời đi), cú chạm thứ hai vẫn " +
    "`router.push('/settings')` — và ở app này đó là lối vào DUY NHẤT tới Cài đặt, không phải một tiện ích: " +
    '`app-tabs.tsx` chỉ dựng bốn Trigger và không có tab settings nào. Luật đọc chính tệp ấy thay vì tin chú ' +
    'thích, vì bản đầu của luật này đã tin một câu chú thích cũ nói ngược lại — và câu ấy đã được đưa cho ' +
    'người dùng như một dữ kiện khi hỏi họ chọn kiểu gộp. Nhãn đổi theo trạng thái và ' +
    '`expanded` được khai, vì mắt đọc được nút vừa trượt ra còn trình đọc màn hình thì chỉ có cái nhãn. Bề ' +
    'rộng mở ra lấy từ `TOP_BAR_H` — chính cạnh của squareBtn — chứ không gõ lại. Nút chỉnh sửa đứng TRƯỚC ' +
    'nút bánh răng trong nguồn và ToolReveal chạy chiều RỘNG thật với con trượt neo trái, nên chỗ trống mọc ' +
    'ra bên trái và nút bánh răng đứng yên giữa hai cú chạm liên tiếp. ' +
    `${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật`,
);
