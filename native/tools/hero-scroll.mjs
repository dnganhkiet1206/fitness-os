/**
 * Bốn thứ về hero khi cuộn, và cả bốn đều là lỗi đã xảy ra trên máy thật.
 *
 * Không có cái nào bộ chạy web thấy được: chúng chỉ hiện ra khi có một ngón tay
 * thật kéo trên một màn hình thật, và cả bốn lần đều là người dùng báo.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const TODAY = 'src/app/(tabs)/index.tsx';
const DECK = 'src/components/ascnd/card-deck.tsx';
const today = strip(read(TODAY));
const deck = strip(read(DECK));
const problems = [];
const num = (src, name) => {
  const m = src.match(new RegExp(`const ${name}\\s*=\\s*([0-9.]+)`));
  return m ? Number(m[1]) : null;
};

/* ── 1. deck phải NUỐT cú dọc khi đang thu lại ──

   Lịch sử: chỗ này từng có `failOffsetY` để nhường cú cuộn dọc thật cho trang,
   và một vòng chỉnh số để cú vuốt hơi xiên không bị giết ("mở thẻ phụ thì không
   vuốt sang thẻ khác được"). Cả hai đều là chữa triệu chứng: chừng nào còn một
   ngưỡng nhường thì "vuốt sang thẻ" và "cuộn trang" vẫn tranh nhau cùng một cử
   chỉ, và một cú vuốt ngang của người thật thì luôn võng xuống.

   Bất biến bây giờ: ngưỡng kích hoạt trên CẢ HAI trục, không có ngưỡng nhường
   nào. Mọi cú kéo trong vùng deck thuộc về pan — ngang thì đổi trang, dọc thì
   không có gì xảy ra. Khoá này chỉ áp khi thu lại; `enabled(!locked)` trả mọi
   cử chỉ về ScrollView khi chi tiết mở, nên tấm chi tiết vẫn cuộn được. */
{
  if (/\.failOffsetY\(/.test(deck)) {
    problems.push(
      `${DECK}: deck còn nhường cú dọc bằng failOffsetY — "vuốt sang thẻ" và "cuộn trang" lại tranh nhau ` +
        'cùng một cử chỉ, và một cú vuốt ngang của người thật thì luôn võng xuống',
    );
  }
  const ax = /\.activeOffsetX\(\[-(\w+), \1\]\)/.exec(deck);
  const ay = /\.activeOffsetY\(\[-(\w+), \1\]\)/.exec(deck);
  if (!ax || !ay) {
    problems.push(`${DECK}: thiếu ngưỡng kích hoạt trên cả hai trục — cú kéo dọc sẽ lọt xuống ScrollView`);
  } else if (ax[1] !== ay[1]) {
    problems.push(
      `${DECK}: hai trục dùng hai ngưỡng khác nhau (${ax[1]} / ${ay[1]}) — deck sẽ giành quyền sớm ở trục này ` +
        'và muộn ở trục kia, tức là vẫn còn một khe cho ScrollView chen vào',
    );
  }
  /*
    Nuốt cú dọc KHÔNG có nghĩa là để nó dịch deck.

    Câu "đi dọc thì không có gì xảy ra, vì chỗ này chỉ đọc translationX" từng
    được viết ra ở đây như một lẽ hiển nhiên. Nó sai: một cú kéo dọc của người
    thật vẫn có `translationX` khác 0 — bàn tay rung — nên `onUpdate` dịch cả
    deck theo từng điểm ngang đó và vòng tròn RUNG theo ngón tay. Đo được: kéo
    dọc 14 bước, x của ring nhảy 69 → 67 → 68. Người dùng báo "ring cứ giật
    giật", và nó do đúng thay đổi đã bỏ `failOffsetY` sinh ra.

    Nên trục phải được CHỐT một lần rồi giữ: `axis` chốt ở khung hình đầu tiên
    có di chuyển thật, `onUpdate` thoát sớm khi trục là dọc, và `onEnd` không
    cho một cú dọc quyết định deck dừng ở trang nào.

    Đây không phải phép đoán góc theo từng khung hình — quyết định xảy ra MỘT
    lần, giống hệt cách UIScrollView khoá hướng.
  */
  if (!/const axis = useSharedValue\(0\)/.test(deck)) {
    problems.push(`${DECK}: không chốt trục cú chạm — rung tay ngang khi kéo dọc sẽ dịch cả deck`);
  }
  if (!/if \(axis\.value === 2\) return;/.test(deck)) {
    problems.push(`${DECK}: onUpdate không thoát sớm khi trục là dọc — vòng tròn rung theo ngón tay`);
  }
  if (!/if \(axis\.value !== 1\) return;/.test(deck)) {
    problems.push(`${DECK}: onEnd không loại cú dọc — một cú kéo dọc vẫn quyết định deck dừng ở trang nào`);
  }
  if (!/axis\.value = 0;/.test(deck)) {
    problems.push(`${DECK}: không đặt lại trục ở onBegin — cú chạm sau thừa hưởng trục của cú trước`);
  }

  /* Và khoá chỉ được áp khi thu lại: mở chi tiết ra thì tấm cao hơn cả màn hình
     và không cuộn được là không đọc được. */
  if (!/\.enabled\(!locked\)/.test(deck)) {
    problems.push(`${DECK}: pan không tắt theo !locked — mở chi tiết ra sẽ không cuộn xuống đọc được`);
  }
}

/* ── 2. hộp chứa không có gì để chứa thì không được vẽ ──

   Ở chế độ tập trung mọi thứ trong tấm bị ẩn, nhưng tấm vẫn vẽ blur, bo góc và
   padding — một tấm kính rỗng ruột dưới vòng tròn. Người dùng mô tả nó là "một
   mảnh của màn hình khác lọt vào". */
{
  const at = today.indexOf('styles.sheet');
  const before = at > 0 ? today.slice(Math.max(0, at - 200), at) : '';
  if (at < 0) problems.push(`${TODAY}: không tìm thấy tấm nội dung`);
  else if (!/!heroOpen/.test(before)) {
    problems.push(
      `${TODAY}: tấm nội dung vẽ cả khi chi tiết đang mở — ruột nó đã bị ẩn, nên còn lại là một hộp ` +
        'kính rỗng. Một hộp chứa không có gì để chứa thì không phải một hộp chứa',
    );
  }
}

/* ── 3. hero phải phản hồi từ pixel đầu tiên ──

   Mốc mờ bắt đầu ở 0. Bắt đầu muộn thì suốt phần lớn quãng cuộn vòng tròn đứng
   y nguyên và cú cuộn không có phản hồi nào. */
{
  const m = today.match(/opacity: interpolate\(\s*scrollY\.value,\s*\[([^\]]*)\]/);
  if (!m) problems.push(`${TODAY}: không tìm thấy phép mờ của hero`);
  else {
    const first = m[1].split(',')[0].trim();
    if (first !== '0') {
      problems.push(
        `${TODAY}: hero bắt đầu mờ ở ${first} chứ không phải 0 — cú cuộn không có phản hồi nào cho tới mốc đó`,
      );
    }
  }
}

/* ── 4. đổi chế độ phải đưa trang về đầu ──

   Thu lại gỡ cả dashboard ra khỏi cây, chiều cao nội dung co đột ngột, và
   ScrollView kẹp vị trí cuộn về mốc gần nhất còn hợp lệ. Người dùng thấy một cú
   trôi mình không ra lệnh. */
{
  const at = today.indexOf('const toggleHero');
  const body = at < 0 ? '' : today.slice(at, at + 320);
  if (!/scrollTo\(\s*\{\s*y:\s*0/.test(body)) {
    problems.push(
      `${TODAY}: toggleHero không đưa trang về đầu — chiều cao nội dung đổi đột ngột thì ScrollView ` +
        'sẽ tự kẹp vị trí cuộn, và cú trôi đó đọc ra như một lỗi',
    );
  }
}

/*
  Nội dung không được phụ thuộc vào một hiệu ứng VÀO để nhìn thấy được.

  Tấm nội dung mọc ngay ở lần render đầu, nên `entering` của nó chạy đúng lúc
  luồng JS nghẹt nhất: sáu trang hero cùng đo, dữ liệu ngày vừa về, vòng tròn bắt
  đầu đếm. Layout animation của Reanimated đặt giá trị đầu (opacity 0) rồi mới
  chạy — khung hình bắt đầu bị bỏ lỡ thì cái CÒN LẠI là giá trị đầu, và Koa với
  các nút ghi nằm đó, chiếm chỗ, vô hình. Đúng như đã báo: mở thẻ chỉ số rồi đóng
  lại mới thấy chúng, vì lần đó là dựng lại trên một luồng đã rảnh.

  Một hiệu ứng vào là TRANG TRÍ. Ở lần dựng đầu không có chuyển cảnh nào để làm
  mềm, nên nó phải im lặng — chỉ chạy khi có thứ để làm mềm thật.
*/
{
  const m = /style=\{styles\.sheet\}\s*\n\s*entering=\{([^}]*)\}/.exec(today);
  if (!m) {
    problems.push(`${TODAY}: không đọc được hiệu ứng vào của tấm nội dung`);
  } else if (!/\?/.test(m[1])) {
    problems.push(
      `${TODAY}: tấm nội dung chạy entering ngay lần dựng đầu — nếu khung hình đầu bị bỏ lỡ thì nội dung ` +
        'đứng lại ở opacity 0 và Koa không bao giờ hiện ra',
    );
  }
}

/*
  Lớp phủ phải TỐI DẦN ở mép trên.

  Một tấm đen phẳng `absoluteFill` có mép, và mép đó là một đường ngang cứng vắt
  qua màn hình ngay trên Koa — đúng thứ đã bị bắt lỗi hai lần ("thẻ vẫn còn bị
  cắt ngang", "vết cắt đầy nè"). Nên phải là hai lớp: một dải chuyển cao CỐ ĐỊNH
  ở trên rồi mới tới phần đặc, và phần đặc phải bắt đầu ĐÚNG dưới dải đó.

  Cố định theo điểm chứ không theo phần trăm: tấm này cao bao nhiêu tuỳ số thẻ
  người dùng bật, và một dải chuyển theo phần trăm sẽ đổi độ dốc theo cấu hình
  dashboard.
*/
{
  const fade = /scrimBand:[^}]*height: (SCRIM_FADE|\d+)/.exec(today);
  const body = /scrimBody:\s*\{[\s\S]*?top: SCRIM_FADE,[\s\S]*?bottom: 0,/.exec(today);
  if (!fade) problems.push(`${TODAY}: lớp phủ không có dải chuyển cao cố định ở mép trên`);
  if (!body) problems.push(`${TODAY}: phần đặc của lớp phủ không nối liền ngay dưới dải chuyển`);
  if (/scrimBand:[^}]*height: '\d+%'/.test(today)) {
    problems.push(`${TODAY}: dải chuyển tính theo phần trăm — độ dốc sẽ đổi theo số thẻ người dùng bật`);
  }

  /*
    Lớp phủ phải đậm dần theo CÙNG quãng với blur và với phép mờ của hero.

    Blur làm mất NÉT, không làm giảm SÁNG: vòng tròn là một nét dày, bão hoà,
    phát sáng, và làm mờ nó xong vẫn còn nguyên một vệt xanh chói nằm sau các nút
    ghi. Thứ giết được vệt đó là một lớp TỐI, không phải thêm blur. Nhưng một lớp
    tối ở mức đó lúc chưa cuộn thì thành hộp đen đặt trên nền, vì lúc đó phía sau
    chẳng có gì sáng để dập.

    Ba thứ phải đi trên cùng một quãng [HERO_HOLD, cover]; lệch nhau thì hero mờ
    xong mà lớp phủ vẫn nhạt, và người dùng thấy hai chuyển động rời nhau.
  */
  /* Cắt ĐÚNG thân `scrimFade` rồi mới soi, chứ không quét một cửa sổ ký tự sau
     tên nó: `sheetBlur` nằm ngay dưới và cũng nội suy trên cùng quãng đó, nên
     một cửa sổ rộng sẽ bắt được câu của hàng xóm và báo xanh cả khi hàm này đã
     bị đổi sang quãng khác. Đó là luật đọc CHỮ chứ không đọc hành vi. */
  const fadeBody = (() => {
    const at = today.indexOf('const scrimFade');
    if (at < 0) return '';
    const end = today.indexOf('const sheetBlur', at);
    return today.slice(at, end < 0 ? at + 600 : end);
  })();
  if (!/opacity: interpolate\(\s*scrollY\.value,\s*\[HERO_HOLD, cover\]/.test(fadeBody)) {
    problems.push(
      `${TODAY}: lớp phủ không đậm dần theo quãng [HERO_HOLD, cover] — blur một mình không dập được vệt sáng của vòng tròn`,
    );
  }
  /*
    Tấm nội dung KHÔNG được đọc ra như một cái thẻ.

    Hai góc bo cộng một mép ngang là ba cạnh của một hình chữ nhật, và mắt tự
    khép cạnh thứ tư: người xem thấy một TẤM đặt lên hero chứ không thấy trang
    tiếp tục chảy xuống. Vuốt qua lại thì tấm đó đứng im trong khi nội dung dưới
    nó đổi, và chỗ nối đọc ra như hai màn hình ghép lại.

    Mép ngang thì không cần một điểm ảnh viền nào để tồn tại: `BlurView` là
    `absoluteFill`, nên chỗ nó bắt đầu là một hàng mà phía trên sắc nét và phía
    dưới nhoè. Nó phải được che bằng ĐÚNG `SCRIM_FADE` mà lớp phủ dùng — một
    hằng số chi phối cả hai thì chúng không thể lệch nhau.
  */
  if (/sheet:\s*\{[\s\S]*?borderTop(Left|Right)Radius/.test(today)) {
    problems.push(`${TODAY}: tấm nội dung bo góc trên — cộng với mép ngang là ba cạnh của một cái thẻ`);
  }
  /* Đọc HÀNH VI: có một `BlurView` nằm trong `MaskedView` hay không. Bản đầu
     của luật này khớp tên biến `sheetBlur`, nên nó đỏ ngay khi độ mờ kính thôi
     chạy theo cuộn — một thay đổi không hề đụng tới việc che mép. Lần thứ mười
     hai trong repo này.

     Và bản thứ hai vẫn còn một con số: nó tìm `BlurView` trong 1600 ký tự kể từ
     `<MaskedView`. Đó là một NGÂN SÁCH KÝ TỰ, không phải một quan hệ — thêm một
     dải tắt ở đáy mặt nạ là đủ đẩy `BlurView` ra khỏi cửa sổ, và luật đỏ lên vì
     một thay đổi cũng không hề đụng tới việc che mép. Cùng một lỗi, đo bằng một
     cái thước khác.

     Nên giờ nó đọc đúng cái nó muốn nói: cắt ra từng khối `<MaskedView>` …
     `</MaskedView>` và hỏi có khối nào CHỨA một `BlurView` có `intensity` hay
     không. Không có số nào để vượt qua, và nó còn chặt hơn bản cũ — một
     `BlurView` tình cờ nằm sau một `MaskedView` không liên quan không còn tính
     là đã được che. */
  const masked = (() => {
    let from = 0;
    for (;;) {
      const open = today.indexOf('<MaskedView', from);
      if (open === -1) return false;
      const close = today.indexOf('</MaskedView>', open);
      if (close === -1) return false;
      if (/<A?BlurView[^>]*intensity=/.test(today.slice(open, close))) return true;
      from = close + 1;
    }
  })();
  if (!masked) {
    problems.push(`${TODAY}: blur của tấm không được che mép trên — chỗ nó bắt đầu là một đường kẻ ngang`);
  }
  if (!/maskBody: \{[^}]*top: SCRIM_FADE,/.test(today)) {
    problems.push(`${TODAY}: mặt nạ blur không kết thúc ở SCRIM_FADE — blur và lớp phủ tắt dần trên hai quãng khác nhau`);
  }

  /* Và nó phải được ĐEO VÀO khối phủ, không chỉ tồn tại.

     Gỡ `scrimFade` khỏi JSX thì TypeScript im lặng — một biến không dùng không
     phải lỗi kiểu — và luật ở trên vẫn xanh vì hàm vẫn còn nguyên đó, nội suy
     đúng quãng, và không điều khiển cái gì cả. Một luật chứng minh thứ gì đó
     TỒN TẠI chứ không chứng minh nó được DÙNG là một luật đọc chữ. */
  if (!/style=\{\[StyleSheet\.absoluteFill, scrimFade\]\}/.test(today)) {
    problems.push(`${TODAY}: scrimFade không được đeo vào khối phủ — lớp phủ đứng yên một mức`);
  }
  /* Hai lớp nằm chung một khối có độ mờ riêng, mà độ mờ áp lên TỪNG lớp con —
     chồng một điểm là một hàng bị nhân đôi độ tối, đúng cái vệt nó sinh ra để
     tránh. Cả hai đều là số nguyên nên kề sát là kín. */
  if (/top: SCRIM_FADE - \d/.test(today)) {
    problems.push(`${TODAY}: hai lớp phủ chồng lên nhau trong một khối có độ mờ chung — hàng chồng bị nhân đôi độ tối`);
  }
}

/*
  Hàng nút trên đầu phải GHIM, và ghim thì kéo theo ba nghĩa vụ.

  ── vì sao ghim ──

  Nó từng là con đầu của ScrollView, nên nó vừa mờ đi vừa TRÔI LÊN cùng nội
  dung — hai chuyển động cho một thứ, và cái trôi là cái mắt bám. Kiểu của Apple
  (Music, Settings) là bar đứng yên rồi tự mờ tại chỗ.

  ── ba nghĩa vụ ──

  1. Chỗ nó từng chiếm phải được trả lại bằng `paddingTop`, không thì vòng tròn
     chui lên nằm dưới các nút.

  2. `opacity: 0` KHÔNG tắt cảm ứng. Một nút vô hình vẫn nuốt cú bấm, và ở đây
     nó nằm đúng trên vòng tròn — người dùng bấm vào ring, không có gì xảy ra,
     và không có gì trên màn hình giải thích được. Phải có cổng `pointerEvents`.

  3. Phép mờ và cổng chạm phải đọc CÙNG một ngưỡng. Hai con số riêng thì có một
     dải cuộn mà hàng nút đã vô hình nhưng vẫn ăn chạm — đúng lỗi ở (2), chỉ
     hẹp hơn nên khó tìm hơn.
*/
{
  if (!/styles\.headerBar/.test(today)) {
    problems.push(`${TODAY}: hàng nút trên đầu không ghim — nó sẽ trôi theo trang thay vì mờ tại chỗ`);
  }
  if (!/headerBar:\s*\{[^}]*position: 'absolute'/.test(today)) {
    problems.push(`${TODAY}: headerBar không phải absolute — nó vẫn chiếm chỗ trong dòng chảy`);
  }
  /*
     Cổng chạm: hỏi TÍNH CHẤT, không hỏi cơ chế.

     Bản trước ghim đúng một hình dạng — `pointerEvents={barGone ? 'none' : …}`,
     tức một prop JSX lái bằng React state. Nó đỏ lên khi cổng ấy được chuyển
     vào chính worklet đang tính độ mờ, một thay đổi làm bất biến CHẶT HƠN chứ
     không lỏng đi: `barGone` là state, và ghi state từ trình xử lý cuộn nghĩa
     là dựng lại cả màn Today mỗi lần vượt ngưỡng — ở cả hai chiều, giữa đà cuộn.

     Đó là lần thứ mười bốn ở repo này một luật đo cách viết thay vì đo điều
     muốn nói. Nên giờ nó nhận cả hai đường, và với đường mới nó đòi thêm được
     một điều mà đường cũ không chứng minh nổi: cổng chạm và độ mờ phải sinh ra
     từ CÙNG MỘT giá trị. */
  const topBarBlock = (() => {
    const i = today.indexOf('const topBar = useAnimatedStyle(');
    if (i === -1) return '';
    const j = today.indexOf('\n  });', i);
    return j === -1 ? today.slice(i) : today.slice(i, j);
  })();
  const gateByProp = /pointerEvents=\{barGone \? 'none' :/.test(today);
  const gateByStyle = /pointerEvents:/.test(topBarBlock);
  if (!gateByProp && !gateByStyle) {
    problems.push(
      `${TODAY}: hàng nút mờ đi mà không tắt cảm ứng — một nút vô hình nằm đúng trên vòng tròn vẫn nuốt cú bấm`,
    );
  }
  if (!/paddingTop: insets\.top \+ 12 \+ TOP_BAR_H/.test(today)) {
    problems.push(`${TODAY}: không bù lại chỗ hàng nút từng chiếm — nội dung sẽ chui lên nằm dưới các nút`);
  }
  /*
    Độ mờ kính KHÔNG được chạy theo cuộn.

    `intensity` không phải một prop native animate được: mỗi khung hình
    Reanimated phải cấu hình lại `UIVisualEffectView` bên dưới, và ở đây nó còn
    nằm trong một `MaskedView` nên mặt nạ phải trộn lại theo. Sáu mươi lần một
    giây trong suốt cú cuộn — người dùng báo "cuộn hơi giật nhẹ".

    Cảm giác "càng cuộn càng dày" do LỚP PHỦ kể, và độ mờ của một lớp màu gần
    như miễn phí so với việc dựng lại một hiệu ứng kính.
  */
  if (/intensity: interpolate\(/.test(today)) {
    problems.push(
      `${TODAY}: độ mờ kính chạy theo cuộn — mỗi khung hình phải dựng lại UIVisualEffectView, đó là thứ đắt nhất trên đường cuộn`,
    );
  }
  if (!/const SHEET_BLUR = \d+;/.test(today)) {
    problems.push(`${TODAY}: không có hằng số độ mờ kính — nó phải là MỘT con số, không phải một phép nội suy`);
  }

  /* Cùng một ngưỡng cho phép mờ và cho cổng chạm. */
  const fades = [...today.matchAll(/interpolate\(scrollY\.value, \[0, ([A-Z_0-9]+)\], \[1, 0\]/g)].map((m) => m[1]);
  if (gateByStyle) {
    /*
       Đường mới chứng minh được nhiều hơn "hai ngưỡng bằng nhau": nó chứng minh
       chỉ có MỘT. Độ mờ và cổng chạm phải đọc cùng một biến cục bộ trong cùng
       worklet, nên không có hai con số để mà lệch. */
    const named = /const (\w+) = interpolate\(scrollY\.value, \[0, [A-Z_0-9]+\], \[1, 0\]/.exec(topBarBlock);
    if (!named) {
      problems.push(
        `${TODAY}: cổng chạm nằm trong style động nhưng phép mờ không đặt tên cho giá trị — không có gì để hai bên cùng đọc`,
      );
    } else {
      const v = named[1];
      const usedByOpacity = new RegExp('opacity: ' + v + '\\b').test(topBarBlock);
      const usedByGate = new RegExp('pointerEvents: [^\\n]*\\b' + v + '\\b').test(topBarBlock);
      if (!usedByOpacity || !usedByGate) {
        problems.push(
          `${TODAY}: độ mờ và cổng chạm không cùng đọc \`${v}\` — hai phép tính riêng thì có một dải cuộn ` +
            'mà hàng nút đã vô hình nhưng vẫn ăn chạm',
        );
      }
    }
  } else {
    const gate = /contentOffset\.y >= ([A-Z_0-9]+)/.exec(today);
    if (!gate) {
      problems.push(`${TODAY}: cổng chạm không đọc ngưỡng nào`);
    } else if (!fades.includes(gate[1])) {
      problems.push(
        `${TODAY}: cổng chạm dùng ngưỡng \`${gate[1]}\` khác ngưỡng của phép mờ (${fades.join(', ') || 'không đọc được'}) — ` +
          'sẽ có một dải cuộn mà hàng nút đã vô hình nhưng vẫn ăn chạm',
      );
    }
  }
}

if (problems.length) {
  console.log('hero khi cuộn CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hero khi cuộn OK — cú vuốt ngang hơi xiên không bị giết (ngưỡng bỏ cuộc theo chiều dọc LỚN HƠN ' +
    'ngưỡng giành quyền theo chiều ngang, và pan thất bại là vĩnh viễn cho cú chạm đó); tấm nội dung ' +
    'không vẽ khi ruột nó đã bị ẩn, nên không còn một hộp kính rỗng dưới vòng tròn; hero bắt đầu mờ ' +
    'từ pixel cuộn ĐẦU TIÊN nên cú cuộn luôn có phản hồi; và đổi chế độ thì đưa trang về đầu, vì ' +
    'chiều cao nội dung đổi đột ngột sẽ khiến ScrollView tự kẹp vị trí và cú trôi đó đọc ra như lỗi. ' +
    'Cả bốn đều do người dùng báo từ máy thật — bộ chạy web không thấy được thứ nào',
);
