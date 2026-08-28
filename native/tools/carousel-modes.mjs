/**
 * Hai chế độ của deck, và chiều cao bám theo nội dung thật.
 *
 * ── hai lỗi hoá ra là một ──
 *
 * Khoảng trống dọc lớn dưới mọi thẻ, và việc mở chi tiết một thẻ lại mở cả sáu:
 * cùng một nguyên nhân nhìn từ hai phía. Today giữ MỘT `heroOpen: boolean` và
 * truyền cho cả sáu thẻ, nên mở một là mở sáu; sáu trang cùng cao lên; và deck
 * lấy `Math.max(...heights)` làm chiều cao chung, nên trang ngắn nhất cũng phải
 * dành sẵn chiều cao của trang cao nhất.
 *
 * Sửa margin hay padding ở đây sẽ che được ảnh chụp và không chạm tới thứ gì.
 *
 * ── và vì sao khoá cử chỉ chứ không đo góc ──
 *
 * Một ngưỡng góc vẫn để lọt cú vuốt hơi lệch, và nó lọt đúng lúc tệ nhất: khi
 * người ta đang cuộn đọc. Khi chi tiết mở thì không có lý do nào để đổi thẻ, nên
 * pan bị TẮT hẳn — một trạng thái, không phải một phép đoán.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const DECK = 'src/components/ascnd/card-deck.tsx';
const TODAY = 'src/app/(tabs)/index.tsx';
const deck = strip(read(DECK));
const today = strip(read(TODAY));
const problems = [];

/* ── 1. chiều cao là của TRANG ĐANG XEM ── */
{
  if (/Math\.max\(0, \.\.\.heights/.test(deck) || /const tallest\b/.test(deck)) {
    problems.push(
      `${DECK}: chiều cao lấy max của mọi trang — mỗi trang phải dành sẵn chiều cao của trang CAO ` +
        'NHẤT, và đó chính là khoảng trống dọc. Bố cục phải mô tả trang đang nhìn',
    );
  }
  if (!/heights\[page\]/.test(deck)) {
    problems.push(`${DECK}: không lấy chiều cao theo trang đang xem (heights[page])`);
  }
  /* Che bằng lề âm là che triệu chứng. Lề âm ngang thì hợp lệ — nó huỷ padding
     của trang để deck chạm hai mép — nên chỉ chiều DỌC bị cấm. */
  if (/marginTop:\s*-|marginBottom:\s*-|top:\s*-\d/.test(deck)) {
    problems.push(`${DECK}: dùng lề âm dọc — đó là che khoảng trống, không phải sửa nó`);
  }
}

/* ── 2. trạng thái mở là một CHỈ SỐ, không phải một boolean dùng chung ── */
{
  if (/const \[heroOpen, setHeroOpen\] = useState\(false\)/.test(today)) {
    problems.push(
      `${TODAY}: trạng thái mở là một boolean DÙNG CHUNG — truyền cho cả sáu thẻ thì mở một là mở ` +
        'sáu, và sáu trang cùng cao lên. Phải là chỉ số của đúng thẻ đang mở',
    );
  }
  if (!/const \[expandedAt, setExpandedAt\] = useState<number \| null>/.test(today)) {
    problems.push(`${TODAY}: thiếu expandedAt — không có cách nào nói "thẻ NÀO đang mở"`);
  }
  const shared = (today.match(/detailOpen=\{heroOpen\}/g) ?? []).length;
  if (shared > 0) {
    problems.push(`${TODAY}: ${shared} thẻ vẫn nhận chung một cờ mở — mỗi thẻ phải so với chỉ số của chính nó`);
  }
}

/* ── 3. mở chi tiết thì KHOÁ vuốt ngang ── */
{
  if (!/\.enabled\(!locked\)/.test(deck)) {
    problems.push(
      `${DECK}: pan không bị tắt khi mở chi tiết — một ngưỡng góc vẫn để lọt cú vuốt hơi lệch, và ` +
        'nó lọt đúng lúc người ta đang cuộn đọc',
    );
  }
  if (!/expandedAt !== null/.test(deck)) {
    problems.push(`${DECK}: không đọc expandedAt — khoá phải đến từ TRẠNG THÁI, không từ phép đoán hướng`);
  }
  if (!/expandedAt=\{expandedAt\}/.test(today)) {
    problems.push(`${TODAY}: không truyền expandedAt xuống deck — deck không có cách nào biết để khoá`);
  }
}

/* ── 4. thẻ mới bắt đầu ở trạng thái mặc định ── */
{
  if (!/onPageChange=\{/.test(today)) {
    problems.push(`${TODAY}: deck không báo đổi trang — thẻ mới sẽ thừa hưởng trạng thái mở của thẻ cũ`);
  }
  const reset = today.match(/const onHeroPageChange = [\s\S]{0,300}?\n  \}, \[\]\);/)?.[0] ?? '';
  if (!/setExpandedAt\(null\)/.test(reset)) {
    problems.push(`${TODAY}: đổi trang không đóng chi tiết — thẻ mới chưa từng được mở, hiện nó ở trạng thái mở là kể một chuyện không xảy ra`);
  }
  if (!/scrollTo\(\{ y: 0/.test(reset)) {
    problems.push(`${TODAY}: đổi trang không đưa cuộn về đầu — vị trí cuộn của thẻ cũ là vị trí trong NỘI DUNG thẻ cũ`);
  }
  if (!/runOnJS\(settle\)/.test(deck)) {
    problems.push(`${DECK}: không báo trang đã chọn ra JS — báo theo từng frame sẽ chạy phép reset nhiều lần trong một cú vuốt`);
  }
}

/* ── 5. deck phải tới được bằng screen reader ──

   Cách duy nhất đổi trang là vuốt ngang, mà VoiceOver chiếm đúng cử chỉ đó để
   đi giữa các phần tử. Không có `adjustable`, người dùng screen reader bị khoá
   ở trang đầu: năm trong sáu chỉ số của họ không có đường nào tới — không lỗi,
   không cảnh báo, chỉ là năm màn hình biến mất với một nhóm người. */
{
  if (!/accessibilityRole="adjustable"/.test(deck)) {
    problems.push(`${DECK}: deck không phải "adjustable" — VoiceOver không có cách nào đổi trang`);
  }
  if (!/accessibilityActions=\{ADJUST\}/.test(deck) || !/onAccessibilityAction=/.test(deck)) {
    problems.push(`${DECK}: khai adjustable mà không nhận increment/decrement — nói được là điều chỉnh được rồi không làm gì`);
  }
  /* Vị trí phải nói bằng LỜI. Hàng chấm là thông tin thị giác thuần. */
  if (!/accessibilityValue=\{\{ min: 1, max: pages\.length, now: page \+ 1 \}\}/.test(deck)) {
    problems.push(`${DECK}: không nói vị trí trang qua accessibilityValue — hàng chấm không nói được điều đó`);
  }
  /* Và hàng chấm thì phải câm: sáu phần tử rỗng chắn đường tới nội dung. */
  const pipBlock = deck.match(/<View\s+style=\{styles\.pips\}[\s\S]{0,200}?>/)?.[0] ?? '';
  if (!/accessibilityElementsHidden/.test(pipBlock)) {
    problems.push(`${DECK}: hàng chấm không bị ẩn khỏi screen reader — sáu phần tử rỗng phải lướt qua trước khi tới nội dung`);
  }
}

/* ── 6. nhãn nói VIỆC, không nói lại tên ──

   Nhãn của mũi tên từng là chính tên chỉ số, nên screen reader đọc "Nước, nút"
   — một câu không cho biết bấm vào thì được gì. */
{
  const panel = strip(read('src/components/ascnd/hero-panel.tsx'));
  if (/accessibilityLabel=\{a11yDetail\}/.test(panel)) {
    problems.push('hero-panel.tsx: nhãn mũi tên lặp lại tên chỉ số — phải nói bước tiếp theo');
  }
  if (!/nHeroDetails/.test(panel)) {
    problems.push('hero-panel.tsx: nhãn mũi tên không dùng chuỗi hành động dùng chung');
  }
  /* Trạng thái đã nói bằng `expanded`; nói lại trong nhãn là VoiceOver đọc hai lần. */
  if (!/accessibilityState=\{\{ expanded: detailOpen \}\}/.test(panel)) {
    problems.push('hero-panel.tsx: mũi tên không khai accessibilityState.expanded — screen reader không biết nó đang mở hay đóng');
  }
}

/*
  Hàng chấm phải biến mất khi mở chi tiết, và phải biến mất CÓ CHUYỂN ĐỘNG.

  ── vì sao nó phải biến mất ──

  Hàng chấm nói "còn trang nữa, vuốt đi". Mở chi tiết thì vuốt bị khoá, nên nó
  đang quảng cáo một thao tác không dùng được — và đó không phải sai một chút:
  người dùng vuốt, không có gì xảy ra, và họ kết luận app hỏng chứ không kết
  luận rằng chế độ đã đổi.

  ── vì sao phải qua Expander, không phải một câu điều kiện ──

  Biến mất tức thì là một hàng 18 điểm bốc hơi ngay giữa lúc thẻ đang mở ra, và
  mắt đọc cú giật đó là một lỗi vẽ. `Expander` chạy chiều cao VÀ độ mờ trên cùng
  một shared value, nên hàng chấm mờ đi đúng lúc nó co lại — hai thứ rời nhau
  cho ra một hàng chấm mờ vẫn còn chiếm chỗ.

  Luật đọc HÀNH VI: không đủ khi `Expander` chỉ có mặt trong tệp, nó phải bọc
  đúng hàng chấm và mở theo đúng `!locked` — cùng biến điều khiển `pan.enabled`,
  nên khoá vuốt và ẩn chấm không thể lệch nhau.
*/
{
  const m = /<Expander open=\{([^}]*)\}>\s*\n\s*<View\s*\n\s*style=\{styles\.pips\}/.exec(deck);
  if (!m) {
    problems.push(
      'card-deck.tsx: hàng chấm không đi qua <Expander> — nó biến mất tức thì, hoặc tệ hơn, ở lại quảng cáo một cú vuốt đã bị khoá',
    );
  } else if (m[1].trim() !== '!locked') {
    problems.push(
      `card-deck.tsx: hàng chấm mở theo \`${m[1].trim()}\` chứ không phải \`!locked\` — khoá vuốt và ẩn chấm sẽ lệch nhau`,
    );
  }
}

/* ── 4. vị trí của một trang có ĐÚNG MỘT nguồn ──

   Hai lỗi đã ship từ chỗ này, cách nhau một commit, và không lỗi nào bộ chạy
   web thấy được — nên luật phải đọc mã.

   MỘT: cả vị trí, kể cả lúc đứng yên, nằm trong worklet —
   `(index - at.value) * (width || 1)`. `useAnimatedStyle` đóng băng lần chạy
   đầu, lúc `width` còn 0, nên `width || 1` cho ra một điểm và năm trang chồng
   khít lên nhau. Đó là lỗi người dùng gửi ảnh.

   HAI: bản sửa cho nó chia đôi vị trí thành `left: -page * width` (state React)
   cộng `-(at - page) * width` (worklet). Cộng lại đúng, nhưng cùng một `page`
   khi đó đi qua HAI đường ống không đồng bộ — vòng commit của React và luồng UI
   của Reanimated. Ngay lúc cú vuốt dừng, có những khung hình lệch nguyên một bề
   rộng màn hình. Trên web hai đường ống ấy gộp làm một, nên harness chạy XANH
   trên cả bản hỏng — đã thử.

   Luật vì thế nói cả hai phía cùng lúc: bố cục đặt trang bằng `index` và
   `width` THẬT, và worklet chỉ được đọc `at`. */
{
  const m = /const style = useAnimatedStyle\(\(\) => \(\{\s*transform: \[\{ translateX: ([^}]*) \}\],/.exec(deck);
  if (!m) {
    problems.push('card-deck.tsx: không tìm thấy style trượt của một trang');
  } else {
    const expr = m[1];
    if (!/\bat\.value\b/.test(expr)) {
      problems.push(`card-deck.tsx: style trượt không đọc \`at.value\` — deck sẽ không nhúc nhích`);
    }
    /* Bất cứ thứ gì KHÁC `at` trong biểu thức này đều là một nguồn thứ hai. */
    const names = [...expr.matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]);
    const stray = names.filter((n) => !['at', 'value', 'width', 'Math'].includes(n));
    if (stray.length) {
      problems.push(
        `card-deck.tsx: style trượt còn đọc \`${[...new Set(stray)].join(', ')}\` ngoài \`at\`. ` +
          'Vị trí một trang phải có ĐÚNG MỘT nguồn: thêm một biến của React vào đây là đưa cùng ' +
          'một con số qua hai đường ống không đồng bộ, và giữa cú vuốt chúng lệch nhau nguyên một ' +
          'bề rộng màn hình. Trên web hai đường ống gộp làm một nên bộ chạy KHÔNG thấy',
      );
    }
  }
  /* Và bố cục phải tự nó trải các trang ra: `left` theo `index`, `width` thật.
     Không có nó thì các trang trùng khít và chỉ transform mới tách được chúng —
     đúng trạng thái hỏng trong ảnh. */
  if (!/style=\{\[styles\.page, \{ left: index \* width, width \}, style\]\}/.test(deck)) {
    problems.push(
      'card-deck.tsx: trang không còn được đặt bằng `left: index * width` với `width` thật. ' +
        'Bố cục phải TỰ NÓ trải năm trang ra; nếu chỉ có transform làm việc đó thì mọi khung hình ' +
        'mà mapper chưa chạy là một khung hình năm trang chồng lên nhau',
    );
  }
  /* Và không có lớp bọc nào giữa sân khấu và các trang.
     Bản sửa hỏng bọc chúng trong một view `position: 'absolute'` không width
     không height, mà con tuyệt đối thì không đóng góp kích thước cho cha trong
     Yoga — khung của nó là 0 × 0. Trên iOS `hitTest:` không trả về subview nằm
     ngoài `bounds` của cha, nên mọi cú chạm vào thẻ hero rơi vào hư không.
     `react-native-web` không cắt hit-test như vậy, nên harness cũng mù ca này. */
  if (!/\{w > 0\s*\n?\s*\?\s*pages\.map\(/.test(deck)) {
    problems.push(
      'card-deck.tsx: các trang không còn là con TRỰC TIẾP của sân khấu. Một lớp bọc tuyệt đối ' +
        'không kích thước có khung 0 × 0 (con tuyệt đối không đóng góp kích thước cho cha), và ' +
        'trên iOS hitTest: không trả về subview nằm ngoài bounds của cha — mọi cú chạm vào thẻ ' +
        'hero sẽ rơi vào hư không, trong khi web vẫn chạy bình thường',
    );
  }
}

if (problems.length) {
  console.log('hai chế độ của deck CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hai chế độ của deck OK — chiều cao bám TRANG ĐANG XEM chứ không lấy max của mọi trang, nên không ' +
    'trang nào phải dành sẵn chiều cao của trang cao nhất; và không có lề âm dọc nào che chỗ đó. ' +
    'Trạng thái mở là một CHỈ SỐ: trước đây nó là một boolean dùng chung cho cả sáu thẻ, nên mở một ' +
    'là mở sáu — khoảng trống dọc và rò rỉ trạng thái là cùng một lỗi nhìn từ hai phía. Mở chi tiết ' +
    'thì pan bị TẮT hẳn theo trạng thái, không theo ngưỡng góc, vì một ngưỡng góc vẫn để lọt cú vuốt ' +
    'hơi lệch đúng lúc người ta đang cuộn đọc. Và vuốt sang thẻ khác thì thẻ mới bắt đầu ở mặc định: ' +
    'chi tiết đóng, cuộn về đầu, báo một lần khi cú vuốt DỪNG chứ không mỗi frame. Và vị trí một ' +
    'trang có ĐÚNG MỘT nguồn: bố cục trải các trang ra bằng `left: index * width` với width thật, ' +
    'worklet chỉ đọc `at`, và không có lớp bọc nào giữa sân khấu và các trang. Hai lỗi đã ship từ ' +
    'đúng chỗ này cách nhau một commit — năm trang chồng khít (width||1 chạy khi số đo còn 0) và ' +
    'deck nhảy giữa cú vuốt (cùng một `page` đi qua hai đường ống không đồng bộ) — và bộ chạy web ' +
    'MÙ với cả hai, nên luật này đọc mã',
);
