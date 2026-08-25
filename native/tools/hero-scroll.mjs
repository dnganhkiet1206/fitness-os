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

/* ── 1. một cú vuốt hơi xiên không được bị giết ──

   `failOffsetY` làm pan thất bại VĨNH VIỄN cho cú chạm đó. Đặt nó bằng ngưỡng
   ngang nghĩa là lệch dọc 13px trong lúc đi ngang 12px là mất cú vuốt — và khi
   phần chi tiết mở, tấm cao hơn hẳn nên tay ai cũng lệch. Người dùng báo: "mở
   thẻ phụ thì không vuốt sang thẻ khác được". */
{
  const x = num(deck, 'HYSTERESIS');
  const y = num(deck, 'GIVE_UP_Y');
  if (x === null || y === null) problems.push(`${DECK}: không đọc được HYSTERESIS/GIVE_UP_Y`);
  else if (y <= x) {
    problems.push(
      `${DECK}: GIVE_UP_Y (${y}) không lớn hơn HYSTERESIS (${x}) — một cú vuốt ngang hơi xiên sẽ bị ` +
        'bỏ hẳn trước khi kịp giành quyền, và pan thất bại là VĨNH VIỄN cho cú chạm đó',
    );
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
