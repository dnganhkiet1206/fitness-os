/**
 * Đồng hồ nghỉ: chỉ một QUYẾT ĐỊNH mới kết thúc nó, và luôn có một quyết định
 * để đưa ra.
 *
 * ── lỗi đã sửa ──
 *
 * Thẻ nghỉ có một `Pressable` phủ kín màn hình gọi thẳng `onSkip`. Lập luận
 * viết ngay cạnh nó là "với tay tới một nút nhỏ là ma sát thừa", và nó tính
 * nhầm cái giá của việc bấm nhầm.
 *
 * Nghỉ là một khoảng THỜI GIAN. Thứ duy nhất phá được nó là kết thúc sớm, và
 * không có cách nào hoàn tác: quãng nghỉ đã mất thì không lấy lại được. Điện
 * thoại nằm trên ghế băng giữa hai set, tay còn dính magie — chạm phải màn hình
 * là chuyện thường, và ở bản cũ mỗi lần chạm phải là mất luôn quãng nghỉ.
 *
 * Một cử chỉ VÔ TÌNH không được phép làm việc mà chỉ một QUYẾT ĐỊNH mới được
 * làm. Đó là luật thứ nhất.
 *
 * ── và cái bẫy mà bản sửa ấy tự mở ra ──
 *
 * Gỡ lối thoát bằng cách chạm ra ngoài đi thì "Bỏ qua" thành lối ra DUY NHẤT.
 * Nếu nút ấy biến mất — ai đó dọn giao diện, hoặc một nhánh điều kiện nào đó
 * không dựng nó — người dùng bị KẸT trong một modal cho tới khi đồng hồ chạy
 * hết. Trước bản sửa thì chạm bừa vẫn thoát được; sau bản sửa thì không.
 *
 * Nên hai luật này phải đi cùng nhau, và luật thứ hai là luật quan trọng hơn:
 * bỏ một lối ra chỉ an toàn khi lối còn lại được chứng minh là còn đó.
 *
 * Cả hai đều vô hình với bộ chạy web: `live.mjs` mở từng màn và bấm thử, nhưng
 * nó không dựng được một quãng nghỉ đang chạy, và "bấm ra ngoài rồi xem có
 * thoát không" là đúng thứ nó không làm.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
/* Chú thích bị bóc trước khi so: tệp này nhắc tới `Pressable` phủ kín màn hình
   trong chính đoạn văn giải thích vì sao nó bị gỡ. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const TIMER = 'src/components/ascnd/rest-timer.tsx';
const PANEL = 'src/components/ascnd/day-plan.tsx';
const problems = [];

const timer = strip(read(TIMER));
const panel = strip(read(PANEL));

/* ── 1. không cử chỉ vô tình nào kết thúc quãng nghỉ ──────────────────────── */
{
  /* Hình dạng của lỗi: một vùng chạm phủ kín nền có `onPress`. `absoluteFill`
     và `absoluteFillObject` là hai cách viết cùng một thứ; nền của modal cũng
     là một ứng viên vì nó chiếm cả màn hình. */
  const BACKDROP_PRESS =
    /<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Animated\.View)[^>]*(?:StyleSheet\.absoluteFill|styles\.backdrop)[^>]*onPress=/;
  const REVERSED =
    /<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Animated\.View)[^>]*onPress=[^>]*(?:StyleSheet\.absoluteFill|styles\.backdrop)/;
  if (BACKDROP_PRESS.test(timer) || REVERSED.test(timer)) {
    problems.push(
      `${TIMER}: nền phủ kín màn hình lại nhận \`onPress\`. Nghỉ là một khoảng THỜI GIAN và ` +
        'kết thúc sớm thì không hoàn tác được — điện thoại nằm trên ghế băng, chạm phải là ' +
        'chuyện thường, và mỗi lần chạm phải là mất luôn quãng nghỉ. Chỉ một quyết định mới ' +
        'được kết thúc nó',
    );
  }
}

/* ── 2. …nhưng luôn còn một quyết định để đưa ra ──────────────────────────── */
/*
   Nửa này quan trọng hơn nửa trên. Bỏ lối thoát bằng cách chạm ra ngoài chỉ an
   toàn khi lối còn lại được CHỨNG MINH là còn đó; không thì thẻ thành một cái
   bẫy kín cho tới khi đồng hồ chạy hết.
*/
{
  const hasSkipButton =
    /<PressScale[\s\S]{0,400}?onPress=\{onSkip\}[\s\S]{0,200}?style=\{styles\.skip\}/.test(timer) ||
    /<PressScale[\s\S]{0,400}?style=\{styles\.skip\}[\s\S]{0,200}?onPress=\{onSkip\}/.test(timer);
  if (!hasSkipButton) {
    problems.push(
      `${TIMER}: không còn nút "bỏ qua" nào gọi \`onSkip\`. Từ khi chạm ra ngoài thôi kết thúc ` +
        'quãng nghỉ, nút này là lối ra DUY NHẤT — mất nó là người dùng bị KẸT trong modal cho ' +
        'tới khi đồng hồ chạy hết',
    );
  }
  /* Và nút ấy phải nằm ngoài mọi câu điều kiện: một lối ra chỉ hiện trong vài
     trạng thái là một lối ra không có ở những trạng thái còn lại. */
  const controls = /<View style=\{styles\.controls\}>([\s\S]*?)<\/View>\s*\)/.exec(timer)?.[1] ?? '';
  if (controls && /\?|&&/.test(controls.split('onPress={onSkip}')[0] ?? '')) {
    problems.push(
      `${TIMER}: nút bỏ qua nằm sau một nhánh điều kiện — sẽ có trạng thái không có lối ra nào`,
    );
  }
  /* Android: không khai `onRequestClose` thì nút back cứng không làm gì, và đó
     lại là một trạng thái không lối ra trên nửa số máy. */
  if (!/onRequestClose=\{onSkip\}/.test(timer)) {
    problems.push(
      `${TIMER}: <Modal> không khai \`onRequestClose={onSkip}\` — trên Android nút back cứng sẽ ` +
        'không thoát được, tức là lại một lối ra bị bịt',
    );
  }
}

/* ── 3. thẻ nói nó đang đếm để làm gì ────────────────────────────────────── */
/*
   Một đồng hồ đếm ngược không nói nó chờ cái gì thì chỉ là một con số: bạn nhìn
   1:27 rồi vẫn phải tự nhớ mình vừa xong set mấy. Đây không phải luật thẩm mỹ —
   `next` là dữ liệu, và nếu panel thôi truyền nó thì thẻ lặng lẽ quay về là một
   con số, không gì hỏng cả.
*/
{
  if (!/<RestTimer[\s\S]*?\bnext=\{/.test(panel)) {
    problems.push(
      `${PANEL}: không truyền \`next\` xuống <RestTimer> — thẻ nghỉ quay về chỉ còn một con số, ` +
        'và không gì hỏng để ai đó nhận ra',
    );
  }
  /* Nhưng nó chỉ được nói khi thật sự CÓ set kế tiếp. Ở set cuối cùng thì bịa
     một dòng "tiếp theo" là nói sai về một buổi tập đã xong. */
  if (!/\{next \?/.test(timer)) {
    problems.push(
      `${TIMER}: khối "tiếp theo" không được bọc trong \`{next ? … : null}\` — ở set cuối cùng ` +
        'nó sẽ hứa một bài tập không tồn tại',
    );
  }
}

/* ── tự kiểm ──────────────────────────────────────────────────────────────
   Ba bản hỏng, mỗi bản đúng một lỗi trong ba lỗi trên. Một luật chỉ xanh vì
   không tìm thấy gì thì không phải một luật. */
{
  const cases = [
    [
      'nền phủ kín có onPress',
      '<Pressable style={StyleSheet.absoluteFill} onPress={onSkip} />',
      /nền phủ kín/,
    ],
    [
      'nút bỏ qua biến mất',
      timer.replace(/onPress=\{onSkip\}/g, 'onPress={() => {}}'),
      /lối ra DUY NHẤT/,
    ],
    [
      'khối tiếp theo không có cổng',
      timer.replace('{next ?', '{true ?'),
      /set cuối cùng/,
    ],
  ];
  for (const [name, src, want] of cases) {
    const found = [];
    const BACKDROP_PRESS =
      /<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Animated\.View)[^>]*(?:StyleSheet\.absoluteFill|styles\.backdrop)[^>]*onPress=/;
    if (BACKDROP_PRESS.test(src)) found.push('nền phủ kín màn hình lại nhận `onPress`');
    const ok =
      /<PressScale[\s\S]{0,400}?onPress=\{onSkip\}[\s\S]{0,200}?style=\{styles\.skip\}/.test(src) ||
      /<PressScale[\s\S]{0,400}?style=\{styles\.skip\}[\s\S]{0,200}?onPress=\{onSkip\}/.test(src);
    if (!ok) found.push('lối ra DUY NHẤT');
    if (!/\{next \?/.test(src)) found.push('ở set cuối cùng');
    if (!found.some((f) => want.test(f))) {
      console.error(`phép tự kiểm hỏng — bản "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
      process.exit(1);
    }
  }
}

if (problems.length) {
  console.error('đồng hồ nghỉ CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}

console.log(
  'đồng hồ nghỉ OK — chạm ra ngoài KHÔNG kết thúc quãng nghỉ (nền phủ kín không nhận onPress): ' +
    'nghỉ là một khoảng thời gian, kết thúc sớm không hoàn tác được, và điện thoại nằm trên ghế ' +
    'băng thì chạm phải là chuyện thường. Và vì thế lối ra còn lại được CHỨNG MINH là còn đó — ' +
    'nút "bỏ qua" gọi onSkip, không nằm sau nhánh điều kiện nào, cộng onRequestClose cho nút back ' +
    'cứng của Android; bỏ một lối ra chỉ an toàn khi lối kia còn nguyên, không thì thẻ thành cái ' +
    'bẫy kín cho tới khi đồng hồ chạy hết. Thẻ cũng nói nó đang chờ SET NÀO, và chỉ nói khi thật ' +
    'sự có set kế tiếp. Ba bản hỏng đều bị bắt — bộ chạy web mù với cả ba vì nó không dựng được ' +
    'một quãng nghỉ đang chạy',
);
