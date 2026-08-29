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

/*
  Ba luật đầu là một HÀM chứ không phải ba khối chạy thẳng, vì lý do y hệt luật
  4 ở dưới: phần tự kiểm phải gọi lại đúng thân luật này trên bản hỏng. Bản cũ
  chép tay lại ba biểu thức ấy vào phần tự kiểm, và một phép tự kiểm chép tay
  chỉ chứng minh được một tính chất của chuỗi đã sửa — xoá hẳn luật 1 đi thì cả
  tệp vẫn XANH, và vẫn in ra câu "chạm ra ngoài KHÔNG kết thúc quãng nghỉ" như
  thể vừa kiểm chứng xong. Đo được: xoá `if` của luật 1 → exit=0.
*/
const exitProblems = (timerSrc, panelSrc) => {
  const out = [];

  /* ── 1. không cử chỉ vô tình nào kết thúc quãng nghỉ ────────────────────── */
  /* Hình dạng của lỗi: một vùng chạm phủ kín nền có `onPress`. `absoluteFill`
     và `absoluteFillObject` là hai cách viết cùng một thứ; nền của modal cũng
     là một ứng viên vì nó chiếm cả màn hình. */
  const BACKDROP_PRESS =
    /<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Animated\.View)[^>]*(?:StyleSheet\.absoluteFill|styles\.backdrop)[^>]*onPress=/;
  const REVERSED =
    /<(?:Pressable|TouchableOpacity|TouchableWithoutFeedback|Animated\.View)[^>]*onPress=[^>]*(?:StyleSheet\.absoluteFill|styles\.backdrop)/;
  if (BACKDROP_PRESS.test(timerSrc) || REVERSED.test(timerSrc)) {
    out.push(
      `${TIMER}: nền phủ kín màn hình lại nhận \`onPress\`. Nghỉ là một khoảng THỜI GIAN và ` +
        'kết thúc sớm thì không hoàn tác được — điện thoại nằm trên ghế băng, chạm phải là ' +
        'chuyện thường, và mỗi lần chạm phải là mất luôn quãng nghỉ. Chỉ một quyết định mới ' +
        'được kết thúc nó',
    );
  }

  /* ── 2. …nhưng luôn còn một quyết định để đưa ra ────────────────────────── */
  /*
     Nửa này quan trọng hơn nửa trên. Bỏ lối thoát bằng cách chạm ra ngoài chỉ
     an toàn khi lối còn lại được CHỨNG MINH là còn đó; không thì thẻ thành một
     cái bẫy kín cho tới khi đồng hồ chạy hết.
  */
  const hasSkipButton =
    /<PressScale[\s\S]{0,400}?onPress=\{onSkip\}[\s\S]{0,200}?style=\{styles\.skip\}/.test(timerSrc) ||
    /<PressScale[\s\S]{0,400}?style=\{styles\.skip\}[\s\S]{0,200}?onPress=\{onSkip\}/.test(timerSrc);
  if (!hasSkipButton) {
    out.push(
      `${TIMER}: không còn nút "bỏ qua" nào gọi \`onSkip\`. Từ khi chạm ra ngoài thôi kết thúc ` +
        'quãng nghỉ, nút này là lối ra DUY NHẤT — mất nó là người dùng bị KẸT trong modal cho ' +
        'tới khi đồng hồ chạy hết',
    );
  }
  /* Và nút ấy phải nằm ngoài mọi câu điều kiện: một lối ra chỉ hiện trong vài
     trạng thái là một lối ra không có ở những trạng thái còn lại.

     ── luật này từng CHẾT, và đó mới là chuyện đáng ghi ──

     Bản cũ tìm hàng nút bằng `…<\/View>\s*\)` — hàng nút đóng lại rồi tới một
     dấu `)`. Tệp chưa bao giờ có hình dạng ấy: hàng nút đóng vào
     `</Animated.View>`. Nên `controls` luôn là chuỗi rỗng, `if (controls && …)`
     luôn sai, và luật chưa chạy lấy một lần. Đo được: nó không bắt được cả bản
     hỏng dựng đúng theo mô tả của chính nó.

     Cái làm nó chết ÂM THẦM là `?? ''` cộng với `controls &&`: "không tìm thấy
     chỗ để đọc" bị tính là "đọc xong, không có lỗi". Một luật mất điểm neo thì
     phải KÊU, không được xanh — nên bây giờ nó là một lỗi riêng. */
  const controls = /<View style=\{styles\.controls\}>([\s\S]*?)<\/View>/.exec(timerSrc)?.[1];
  if (controls === undefined) {
    out.push(
      `${TIMER}: không tìm thấy hàng nút \`<View style={styles.controls}>\` — luật "nút bỏ qua ` +
        'không nằm sau nhánh điều kiện" không còn gì để đọc. Một luật mất điểm neo phải kêu lên, ' +
        'không được im lặng rồi báo xanh',
    );
  } else if (/\?|&&/.test(controls.split('onPress={onSkip}')[0] ?? '')) {
    out.push(
      `${TIMER}: nút bỏ qua nằm sau một nhánh điều kiện — sẽ có trạng thái không có lối ra nào`,
    );
  }
  /* Android: không khai `onRequestClose` thì nút back cứng không làm gì, và đó
     lại là một trạng thái không lối ra trên nửa số máy. */
  if (!/onRequestClose=\{onSkip\}/.test(timerSrc)) {
    out.push(
      `${TIMER}: <Modal> không khai \`onRequestClose={onSkip}\` — trên Android nút back cứng sẽ ` +
        'không thoát được, tức là lại một lối ra bị bịt',
    );
  }

  /* ── 3. thẻ nói nó đang đếm để làm gì ───────────────────────────────────── */
  /*
     Một đồng hồ đếm ngược không nói nó chờ cái gì thì chỉ là một con số: bạn
     nhìn 1:27 rồi vẫn phải tự nhớ mình vừa xong set mấy. Đây không phải luật
     thẩm mỹ — `next` là dữ liệu, và nếu panel thôi truyền nó thì thẻ lặng lẽ
     quay về là một con số, không gì hỏng cả.
  */
  if (!/<RestTimer[\s\S]*?\bnext=\{/.test(panelSrc)) {
    out.push(
      `${PANEL}: không truyền \`next\` xuống <RestTimer> — thẻ nghỉ quay về chỉ còn một con số, ` +
        'và không gì hỏng để ai đó nhận ra',
    );
  }
  /* Nhưng nó chỉ được nói khi thật sự CÓ set kế tiếp. Ở set cuối cùng thì bịa
     một dòng "tiếp theo" là nói sai về một buổi tập đã xong. */
  if (!/\{next \?/.test(timerSrc)) {
    out.push(
      `${TIMER}: khối "tiếp theo" không được bọc trong \`{next ? … : null}\` — ở set cuối cùng ` +
        'nó sẽ hứa một bài tập không tồn tại',
    );
  }

  return out;
};
problems.push(...exitProblems(timer, panel));

/* ── 4. thẻ làm bằng bảng màu của app, không bằng số gõ tay ───────────────
   Người dùng báo "style của thẻ này nhìn hơi lạc quẻ so với toàn bộ app", và
   nguyên nhân đo được: nền thẻ là `rgba(18,18,22,0.96)` bo 26. App có ba nền
   tối — card #0e0e11, muted #161618, secondary #18181b — và giá trị ấy là cái
   thứ TƯ, lệch khỏi cả ba vừa đủ để không ai chỉ ra được. Rãnh vòng tròn cũng
   vậy: #1c1c21, trong khi `readiness-gauge` khai #17171c kèm câu "track color
   used by every web ring".

   Không có gì HỎNG khi một tấm dùng màu riêng — đó chính là lý do nó trôi. Mắt
   thấy trước khi lý trí gọi được tên, và tới lúc gọi được tên thì đã có bốn nền
   tối trong một app có ba. */
const ALLOWED = new Set([
  /* Nền mờ sau thẻ: cần alpha nên phải viết dạng rgba, và giá trị là đúng
     `colors.background` (#070708) chứ không phải một màu đen thứ hai. */
  'rgba(7,7,8,0.55)',
]);
/* Để ngoài khối vì phép tự kiểm ở cuối tệp dùng lại ĐÚNG hàm này. Một phép tự
   kiểm chép lại biểu thức của luật là một phép tự kiểm sẽ lệch khỏi luật. */
const handPicked = (src) => [
  ...new Set(
    [...src.matchAll(/'(rgba?\([^']*\))'|"(#[0-9a-fA-F]{3,8})"|'(#[0-9a-fA-F]{3,8})'/g)]
      .map((m) => m[1] ?? m[2] ?? m[3])
      .filter((v) => !ALLOWED.has(v)),
  ),
];
const GAUGE = 'src/components/ascnd/readiness-gauge.tsx';
const gauge = strip(read(GAUGE));
/* Thân luật là một HÀM, và phép tự kiểm ở cuối tệp gọi đúng hàm này trên bản
   hỏng. Viết lại điều kiện trong phần tự kiểm thì nó chỉ chứng minh được một
   tính chất của chuỗi đã sửa, không phải rằng luật còn ở đây: xoá luật đi, bản
   tự kiểm chép tay vẫn xanh. */
const paletteProblems = (timerSrc, gaugeSrc) => {
  const out = [];
  for (const v of handPicked(timerSrc)) {
    out.push(
      `${TIMER}: màu gõ tay \`${v}\` — thẻ phải làm bằng bảng màu của app (colors.*, glass.*). ` +
        'Một giá trị lệch vài phần trăm khỏi token không làm gì hỏng, nó chỉ làm tấm thẻ đọc ra ' +
        'như dán từ chỗ khác vào, và đó đúng là thứ đã bị báo',
    );
  }
  /* Và rãnh vòng tròn dùng CHUNG một token với thẻ sẵn sàng — hai vòng cạnh
     nhau trong một app không được là hai màu. */
  if (!/stroke=\{colors\.ringTrack\}/.test(timerSrc)) {
    out.push(`${TIMER}: rãnh vòng tròn không lấy từ \`colors.ringTrack\``);
  }
  if (!/const TRACK = colors\.ringTrack;/.test(gaugeSrc)) {
    out.push(
      `${GAUGE}: TRACK không còn lấy từ \`colors.ringTrack\` — ` +
        'câu "track color used by every web ring" lại thành một lời khẳng định không ai giữ',
    );
  }
  return out;
};
problems.push(...paletteProblems(timer, gauge));

/* ── tự kiểm ──────────────────────────────────────────────────────────────
   Mỗi luật ở trên có một bản hỏng, và bản hỏng là NGUỒN THẬT bị sửa đúng một
   chỗ — không phải một mẩu JSX viết riêng cho dễ bắt. Một luật chỉ xanh vì
   không tìm thấy gì thì không phải một luật.

   Quan trọng hơn: phần này gọi lại `exitProblems`/`paletteProblems`, tức là
   đúng thân luật đang chạy ở trên, nên xoá một luật đi là phần tự kiểm ĐỎ. Bản
   trước chép tay lại các biểu thức vào đây và vì thế mù với chính chuyện đó. */
{
  const fail = (name) => {
    console.error(`phép tự kiểm hỏng — bản "${name}" đáng lẽ phải bị bắt, đừng tin kết quả`);
    process.exit(1);
  };
  /* `which` chọn tệp nào bị làm hỏng; hai tệp còn lại giữ nguyên bản thật, nên
     mỗi ca chứng minh đúng một luật chứ không phải "có lỗi đâu đó". */
  const bad = (name, which, before, after, want) => {
    const src = { timer, panel, gauge }[which];
    if (!src.includes(before)) {
      console.error(`phép tự kiểm hỏng — không tìm thấy \`${before}\` để dựng bản "${name}"`);
      process.exit(1);
    }
    const b = src.replace(before, after);
    const found =
      which === 'timer'
        ? [...exitProblems(b, panel), ...paletteProblems(b, gauge)]
        : which === 'panel'
          ? exitProblems(timer, b)
          : paletteProblems(timer, b);
    if (!found.some((p) => want.test(p))) fail(name);
  };

  // 1 — nền phủ kín nhận onPress, cả hai thứ tự thuộc tính
  bad(
    'nền phủ kín có onPress',
    'timer',
    'style={styles.backdrop}>',
    'style={styles.backdrop}>\n<Pressable style={StyleSheet.absoluteFill} onPress={onSkip} />',
    /nền phủ kín/,
  );
  bad(
    'nền phủ kín có onPress, viết ngược thứ tự',
    'timer',
    'style={styles.backdrop}>',
    'style={styles.backdrop}>\n<Pressable onPress={onSkip} style={StyleSheet.absoluteFill} />',
    /nền phủ kín/,
  );
  // 2 — ba cách bịt lối ra còn lại
  bad('nút bỏ qua biến mất', 'timer', 'onPress={onSkip}', 'onPress={() => {}}', /lối ra DUY NHẤT/);
  /* Bản hỏng có hình dạng của một ý tưởng nghe rất hợp lý — "5 giây đầu chưa
     cho bỏ qua" — và đó đúng là cách một lối ra biến mất mà không ai thấy mình
     vừa gỡ nó. Rule 2a phải IM ở ca này (nút vẫn còn, vẫn gọi onSkip), nên nếu
     ca này đỏ thì đỏ vì đúng luật 2c chứ không phải vì lây từ luật khác. */
  bad(
    'nút bỏ qua bị bọc sau một điều kiện',
    'timer',
    '            <PressScale\n              accessibilityRole="button"\n              accessibilityLabel={i18n.nRdSkip}',
    '            {left !== null && (\n            <PressScale\n              accessibilityRole="button"\n              accessibilityLabel={i18n.nRdSkip}',
    /nằm sau một nhánh điều kiện/,
  );
  /* Và ca chứng minh luật không thể chết âm thầm lần nữa: đổi tên hàng nút thì
     nó mất điểm neo, và phải KÊU thay vì báo xanh. */
  bad(
    'hàng nút bị đổi tên, luật mất điểm neo',
    'timer',
    '<View style={styles.controls}>',
    '<View style={styles.buttonRow}>',
    /mất điểm neo/,
  );
  bad('nút back cứng của Android không làm gì', 'timer', 'onRequestClose={onSkip}', 'onRequestClose={undefined}', /back cứng/);
  // 3 — thẻ thôi nói nó đang chờ set nào
  bad('panel thôi truyền next', 'panel', 'next={', 'notNext={', /không truyền `next`/);
  bad('khối tiếp theo không có cổng', 'timer', '{next ?', '{true ?', /set cuối cùng/);
  /* 4 — mỗi bản là ĐÚNG giá trị đã từng nằm trong tệp, không phải một màu bịa
     ra cho dễ bắt: luật phải bắt được cái đã ship, không phải cái nó tự nghĩ. */
  bad(
    'nền thẻ về màu tối thứ tư',
    'timer',
    'backgroundColor: colors.card',
    "backgroundColor: 'rgba(18,18,22,0.96)'",
    /màu gõ tay `rgba\(18,18,22,0\.96\)`/,
  );
  bad('rãnh vòng tròn lệch khỏi thẻ sẵn sàng', 'timer', 'stroke={colors.ringTrack}', 'stroke="#1c1c21"', /rãnh vòng tròn/);
  bad(
    'thẻ sẵn sàng gõ lại hằng số của chính nó',
    'gauge',
    'const TRACK = colors.ringTrack;',
    "const TRACK = '#17171c';",
    /TRACK không còn lấy từ/,
  );
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
    'sự có set kế tiếp. Và thẻ được làm bằng bảng màu của app chứ không bằng số gõ tay — rãnh vòng ' +
    'tròn dùng chung `colors.ringTrack` với thẻ sẵn sàng, nên hai vòng cạnh nhau không còn là hai ' +
    'màu. Mười một bản hỏng đều bị bắt, mỗi bản là đúng giá trị đã từng nằm trong tệp — bộ chạy web mù ' +
    'với cả mười một vì nó không dựng được một quãng nghỉ đang chạy',
);
