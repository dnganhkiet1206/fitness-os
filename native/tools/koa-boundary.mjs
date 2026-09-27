/**
 * Koa có một RANH GIỚI, và nó không được tự ý bước ra khỏi đó.
 *
 *     node tools/koa-boundary.mjs
 *
 * ── lỗi này đến từ ảnh chụp máy thật ──
 *
 * Koa đứng đè lên thanh chọn của Tiến trình và lên thẻ Nước của Dinh dưỡng.
 * Không phải vì chỗ đậu sai: cả sáu chỗ đậu đều nằm trong ~42 điểm sát đáy
 * khung nhìn. Nó đè vì NỘI DUNG trôi tới chỗ nó, còn nó thì chỉ chờ "hết cuộn"
 * rồi hiện lại — không hỏi bên dưới đang có gì.
 *
 * Chú thích của `koa-companion.tsx` khẳng định dải ấy là "chỗ đã được dành
 * sẵn". Câu đó chỉ đúng khi trang đã cuộn hết: khoảng chừa nằm ở CUỐI NỘI
 * DUNG, không ở một điểm cố định trên khung nhìn.
 *
 * ── bốn tính chất ──
 *
 *  1. Mọi chỗ đậu phải nằm trong dải đáy. `rise` là phần figure nhô lên khỏi
 *     mép dưới, nên `rise ≤ 1` giữ Koa không bao giờ leo lên giữa trang. Một
 *     chỗ đậu mới với `rise: 3` là một con koala đứng giữa màn hình.
 *
 *  2. Lớp của Koa phải chừa đáy ĐÚNG BẰNG khoảng thanh tab. Hạ con số ấy là
 *     cho Koa đứng đè lên điều hướng.
 *
 *  3. Độ hiện phải nhân với `koaBandClear`. Chỉ đọc `tabBarVisible` là quay
 *     lại đúng lỗi trên: hiện lại bất kể bên dưới có gì.
 *
 *  4. Khi mờ hết thì phải THÔI nhận chạm. `opacity: 0` ở RN không tắt vùng
 *     chạm, nên một Koa vô hình vẫn nuốt cú bấm nhắm vào nút bên dưới nó.
 *
 * Ba tính chất đầu đọc từ nguồn; tính chất 4 cũng vậy. Không cái nào cần dựng
 * cây React, nên bước này chạy được ở mọi máy.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const COMPANION = 'src/components/ascnd/koa-companion.tsx';
const PERCH = 'src/lib/koa-perch.ts';
const BAND = 'src/lib/koa-band.ts';
const SCREEN = 'src/components/ascnd/screen.tsx';

const problems = [];

/**
 * Bỏ CHÚ THÍCH, giữ nguyên CHUỖI.
 *
 * ── vì sao không dùng thẳng `codeMask` ──
 *
 * `codeMask` đánh dấu 0 cho cả chú thích LẪN chuỗi, vì hai người dùng đầu tiên
 * của nó đều muốn bỏ qua chuỗi. Ở đây thì không: thứ cần đọc là `id: 'midLeft'`
 * và `rise: 0.92` — một nửa nằm trong chuỗi. Bản đầu của tệp này dùng
 * `codeMask` và phép thử đầu tiên báo "không đọc được chỗ đậu nào", vì mọi tên
 * chỗ đậu vừa bị xoá trắng.
 *
 * Đây là lần thứ BA cái bẫy ấy bắt được người trong repo này —
 * `frozen-surface.mjs` và `sleep-ramp.mjs` đã ghi lại hai lần trước. Câu hỏi
 * phải hỏi luôn là "tôi cần bỏ qua chú thích, hay bỏ qua cả chuỗi", và ở đây
 * câu trả lời là vế đầu.
 *
 * Nên tệp này không import `codeMask` nữa: nó tự quét, cùng một máy trạng thái
 * nhưng trả chuỗi lại nguyên vẹn và chỉ xoá trắng phần chú thích.
 */
function stripComments(src) {
  const out = [];
  let i = 0;
  const N = src.length;
  while (i < N) {
    const two = src.slice(i, i + 2);
    if (two === '//') {
      const j = src.indexOf('\n', i);
      const end = j < 0 ? N : j;
      out.push(' '.repeat(end - i));
      i = end;
      continue;
    }
    if (two === '/*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? N : j + 2;
      /* Giữ nguyên xuống dòng để số dòng không trôi. */
      out.push(src.slice(i, end).replace(/[^\n]/g, ' '));
      i = end;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < N && src[j] !== ch) {
        if (src[j] === '\\') j++;
        j++;
      }
      const end = Math.min(j + 1, N);
      out.push(src.slice(i, end));
      i = end;
      continue;
    }
    out.push(ch);
    i++;
  }
  return out.join('');
}

/* ── 1. mọi chỗ đậu nằm trong dải đáy ────────────────────────────────────── */
{
  const src = stripComments(read(PERCH));
  const perches = [...src.matchAll(/id:\s*'(\w+)'[^}]*?rise:\s*([\d.]+)/g)];
  if (!perches.length) {
    problems.push(`${PERCH}: không đọc được chỗ đậu nào — neo của luật này hỏng, đừng tin kết quả`);
  }
  for (const m of perches) {
    const rise = Number(m[2]);
    /* `top = box.height − size × rise`, nên rise > 1 đẩy figure lên TRÊN mép
       dưới nhiều hơn chiều cao của chính nó — tức ra khỏi dải đáy. */
    if (rise > 1) {
      problems.push(
        `${PERCH}: chỗ đậu \`${m[1]}\` có rise ${rise} > 1 — nó nhô lên khỏi mép dưới hơn một thân figure, ` +
          'tức đã ra khỏi dải đáy và đứng vào vùng nội dung',
      );
    }
  }
}

/* ── 2. lớp chừa đáy đúng bằng khoảng thanh tab ───────────────────────────── */
{
  const src = stripComments(read(COMPANION));
  if (!/const BOTTOM_RESERVE = BottomTabInset;/.test(src)) {
    problems.push(
      `${COMPANION}: \`BOTTOM_RESERVE\` không còn là \`BottomTabInset\` — một con số tự chọn ở đây ` +
        'sẽ lệch khỏi khoảng mà các màn thật sự chừa, và Koa đứng đè lên điều hướng',
    );
  }
  if (!/bottom:\s*insets\.bottom \+ BOTTOM_RESERVE/.test(src)) {
    problems.push(`${COMPANION}: đáy của lớp không còn cộng \`BOTTOM_RESERVE\` — Koa sẽ đứng vào vùng thanh tab`);
  }
}

/* ── 3. độ hiện phải hỏi cả dải có trống không ─────────────────────────────── */
{
  const src = stripComments(read(COMPANION));
  if (!/tabBarVisible\.value \* koaBandClear\.value/.test(src)) {
    problems.push(
      `${COMPANION}: độ hiện không nhân với \`koaBandClear\` — nó lại chỉ hỏi "đã ngừng cuộn chưa" ` +
        'chứ không hỏi "bên dưới có gì", tức Koa hiện lại ngay trên thứ vừa trôi tới chỗ nó',
    );
  }
  /* Và tín hiệu ấy phải được NUÔI, nếu không nó đứng yên ở 1 và luật trên vô nghĩa. */
  if (!/noteKoaBand\(/.test(stripComments(read(SCREEN)))) {
    problems.push(
      `${SCREEN}: không gọi \`noteKoaBand\` — \`koaBandClear\` sẽ đứng yên ở giá trị mặc định, ` +
        'nên phép nhân ở trên không đo gì cả',
    );
  }
  /*
    Và phải được ĐẶT LẠI khi đổi tab.

    Một màn không cuộn được thì không bắn `onScroll` lần nào, nên `koaBandClear`
    giữ nguyên câu trả lời của màn TRƯỚC — rời Tiến trình giữa trang (dải bận)
    sang một tab ngắn thì Koa biến mất ở đó mà không có gì để nhìn thấy.

    Luật này sống ở đây chứ không ở `tools/top-chrome.mjs`: tệp ấy dịch
    `tab-bar-visibility.ts` một mình và phải thay `@/lib/koa-band` bằng một vỏ,
    nên nó không thể canh được điều này.
  */
  if (!/resetKoaBand\(\);/.test(stripComments(read('src/lib/tab-bar-visibility.ts')))) {
    problems.push(
      'src/lib/tab-bar-visibility.ts: `resetTabBar` không gọi `resetKoaBand()` — đổi tab xong, dải của ' +
        'Koa vẫn giữ câu trả lời của màn trước, nên Koa biến mất trên một trang ngắn mà không có dấu hiệu gì',
    );
  }
  const band = stripComments(read(BAND));
  if (!/remaining <= reserve/.test(band)) {
    problems.push(`${BAND}: luật "còn lại ≤ khoảng chừa" không còn ở đó — đó là toàn bộ định nghĩa của "dải trống"`);
  }
}

/* ── 4. mờ hết thì thôi nhận chạm ─────────────────────────────────────────── */
{
  const src = stripComments(read(COMPANION));
  /*
    (Lịch sử) HAI vế, và vế thứ hai là vế phép thử ngược đã dạy.

    Bản đầu chỉ tìm biểu thức `pointerEvents: …` ở đâu đó trong tệp. Phép thử
    ngược — gỡ `animatedProps={touchable}` khỏi chính cái view, để nguyên khai
    báo `touchable` ở trên — vẫn XANH. Một luật chỉ hỏi "có khai báo không" thì
    không thấy được một khai báo không nối vào đâu cả, và đó là dạng hỏng dễ
    xảy ra nhất khi ai đó dọn JSX.
  */
  /*
    ── #152: MỘT nguồn cho chạm và trợ năng ──

    Hai nguồn cùng ngưỡng (một `useAnimatedProps` cho `pointerEvents`, một
    phản ứng cho `aria-hidden`) đã lệch nhau trên web: prop động kẹt ở 'none'
    trong khi Koa đã hiện — đọc được mà không chạm được. Nay luật đòi:
      1. một phản ứng trên `fade.value * surfaced.value <= X` đặt state;
      2. view của chỗ đậu đọc CHÍNH state ấy cho cả `pointerEvents` lẫn
         `aria-hidden`;
      3. không còn nguồn thứ hai nào cho `pointerEvents` của Koa.
  */
  const reacts = /useAnimatedReaction\(\s*\(\) => fade\.value \* surfaced\.value <= [\d.]+,[\s\S]{0,120}?runOnJS\(setA11yHidden\)\((\w+)\)/.test(src) && /\(\s*(\w+)\s*,\s*\w+\s*\)\s*=>\s*\{\s*if \(\1 !== \w+\) runOnJS\(setA11yHidden\)\(\1\)/.test(src);
  const view = src.match(/<Animated\.View\s+style=\{\[styles\.perch, style\]\}([\s\S]*?)>/)?.[1] ?? '';
  const touchFromState = /pointerEvents=\{a11yHidden \? 'none' : 'auto'\}/.test(view);
  const a11yFromState = /aria-hidden=\{a11yHidden\}/.test(view);
  const secondSource = /pointerEvents:\s*\(fade\.value/.test(src) || /animatedProps=\{/.test(view);
  if (!reacts || !touchFromState || !a11yFromState || secondSource) {
    problems.push(
      `${COMPANION}: chạm và trợ năng của Koa không đi theo MỘT nguồn (` +
        [
          reacts ? 'có phản ứng theo ngưỡng' : 'KHÔNG có phản ứng fade·surfaced ≤ X đặt setA11yHidden',
          touchFromState ? 'pointerEvents theo state' : 'pointerEvents KHÔNG theo state',
          a11yFromState ? 'aria-hidden theo state' : 'aria-hidden KHÔNG theo state',
          secondSource ? 'CÒN một nguồn thứ hai cho pointerEvents' : 'không nguồn thứ hai',
        ].join(', ') +
        ') — `opacity: 0` ở RN KHÔNG tắt vùng chạm (một Koa vô hình nuốt cú bấm), còn hai nguồn thì lệch nhau: đọc được mà không chạm được, hay ngược lại (#147, #152)',
    );
  }
}

if (problems.length) {
  console.log('ranh giới của Koa CÓ LỖI:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ranh giới của Koa OK — mọi chỗ đậu nằm trong dải đáy (rise ≤ 1); lớp chừa đúng `BottomTabInset` nên ' +
    'nó không đứng vào vùng thanh tab; độ hiện hỏi CẢ "đã ngừng cuộn" lẫn "dải dưới chân có trống", và tín ' +
    'hiệu thứ hai được nuôi từ `screen.tsx`; và khi mờ hết thì nó thôi nhận chạm VÀ rời cây trợ năng, theo MỘT state ' +
    '(#152), nên nó không cướp được cú bấm nào của nút bên dưới và không có Koa đọc được mà không chạm được',
);
