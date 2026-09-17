/**
 * Thẻ cân nặng KHÔNG ghi — và nó chỉ được phép không ghi chừng nào chỗ kia còn
 * ghi. Luật này canh cả hai vế.
 *
 *     node tools/weight-card.mjs
 *
 * ── vì sao luật này tồn tại ──
 *
 * Chủ dự án, hai lượt. Lượt đầu: *"vì phía trên đã có ghi cân nặng rồi, thẻ này
 * giờ chỉ dùng để hiện thông tin — ví dụ thay nút ghi bằng lịch sử thay đổi cân
 * nặng sau mỗi lần log"*. Lượt hai: *"tắt cái nút ghi đi không cho ghi nữa vì
 * đã nằm ở todo rồi"*.
 *
 * Nên thẻ Cân nặng nay là một thẻ CHỈ ĐỌC, và điều đó chỉ đúng đắn nhờ một sự
 * thật nằm ở tệp khác: `weight-entry.tsx` được tách ra để thẻ *Cần làm hôm nay*
 * ghi cân nặng ngay tại chỗ, và thẻ ấy nằm TRÊN cả dãy nhóm widget trong
 * `(tabs)/index.tsx`.
 *
 * Hai vế ấy hỏng theo hai hướng ngược nhau, và luật canh cả hai:
 *
 *   · Ai đó thấy một thẻ cân nặng không bấm được, tưởng là thiếu sót, và gắn
 *     lại một `onPress` hay một `<WeightEntry>` — **đi ngược yêu cầu tường
 *     minh của chủ dự án**, mà không gì trong repo phản đối.
 *   · Hoặc `TodoCard` thôi dựng `WeightEntry`, và lúc ấy app KHÔNG CÒN chỗ nào
 *     ghi cân nặng trên màn Hôm nay — **mà không màn hình nào báo lỗi**, vì
 *     không có gì hỏng: chỉ là không còn đường vào.
 *
 * `tsc` không bắt được: thêm hay bớt một `onPress` đều là mã hợp lệ. Ảnh chụp
 * không bắt được: cả hai thẻ vẫn vẽ ra đúng như thiết kế. Thứ mất đi là một
 * khả năng — hoặc một điều cấm — và những thứ ấy chỉ có luật mới canh được.
 *
 * ── bốn vế ──
 *
 * 1. `useLogWeight` còn ít nhất một chỗ GỌI ngoài tệp hook.
 * 2. `TodoCard` còn dựng `WeightEntry` — vế giữ cho câu "đã nằm ở todo rồi"
 *    còn đúng, và vì thế giữ cho vế 3 còn đúng đắn.
 * 3. Thẻ Cân nặng KHÔNG ghi: thân component không có `onPress`, không dựng
 *    `WeightEntry`, không gọi `useLogWeight`. Cả `onPress` cũng bị cấm, không
 *    chỉ lệnh ghi — một `PressScale` không làm gì vẫn co lại dưới ngón tay,
 *    tức vẫn HỨA một hành động rồi không làm gì cả.
 * 4. Lịch sử cắt từ chỉ số 1. `entries[0]` là con số lớn ở trên, nên
 *    `slice(0, …)` in một lần cân hai lần cách nhau hai mươi điểm.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

/** Bỏ chú thích khối, chú thích JSX và chú thích dòng — theo đúng thứ tự ấy. */
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ').replace(/\/\/[^\n]*/g, ' ');

function sources(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

const CARD = 'src/components/ascnd/today-widgets.tsx';
const SHEET = 'src/app/log-weight.tsx';
const TODO = 'src/components/ascnd/todo-card.tsx';
const HOOKS = 'src/hooks/use-fitness-data.ts';
const problems = [];
const notes = [];

const code = strip(readFileSync(path.join(NATIVE, CARD), 'utf8'));

const at = code.indexOf('export function WeightCheckinCard');
if (at < 0) {
  problems.push(
    `${CARD}: không còn \`export function WeightCheckinCard\`. Thẻ đã được đổi tên hoặc dời đi, nên các vế `
      + 'dưới đây đang canh một component không tồn tại. Đọc lại bằng mắt rồi sửa luật, đừng để nó xanh suông',
  );
}
const body = at < 0 ? '' : code.slice(at, code.indexOf('\nexport function ', at + 1));

/* ── vế 1: lối ghi còn tồn tại ở ĐÂU ĐÓ trong app ── */
/*
  ── và đây là vế đã phải viết lại một lần ──

  Bản đầu là `grep -rl useLogWeight src` và nó XANH với ba tệp, trong đó hai tệp
  không gọi nó — chúng chỉ NHẮC TÊN nó trong chú thích ("`useLogWeight` upserts
  on (user_id, date)…"). Tức luật đang đếm những lời giải thích về một khả năng
  thay vì đếm chính khả năng ấy, và nó sẽ còn xanh nguyên sau khi lối ghi cuối
  cùng bị xoá, chừng nào hai đoạn chú thích kia còn nằm đó.

  Nên: đọc từng tệp, BỎ chú thích, rồi mới tìm — và tìm `useLogWeight(`, một cú
  gọi, không phải một cái tên. Cùng phép ấy dùng lại ở vế 3, nơi nó canh chiều
  ngược lại.
*/
const CALL = /\buseLogWeight\s*\(/;
const callers = sources(path.join(NATIVE, 'src'))
  .filter((p) => path.relative(NATIVE, p) !== HOOKS)
  .filter((p) => CALL.test(strip(readFileSync(p, 'utf8'))))
  .map((p) => path.relative(NATIVE, p));
if (callers.length === 0) {
  problems.push(
    'không còn tệp nào GỌI `useLogWeight`. Cân nặng là chỉ số duy nhất không có màn riêng để ghi — '
      + '`/biometrics` không nhận nó, `/log-measurement` không nhắc tới nó, bốn pill thao tác nhanh đi tới '
      + 'bữa ăn, buổi tập, giấc ngủ và chỉ số sinh học, còn màn Tiến trình chỉ đọc và XOÁ. Mất chỗ gọi này '
      + 'là app không ghi được cân nặng nữa, và không có gì báo lỗi vì không có gì hỏng',
  );
} else {
  notes.push(`gọi useLogWeight: ${callers.join(', ')}`);
}

const hooks = readFileSync(path.join(NATIVE, HOOKS), 'utf8');
if (!/export function useLogWeight\b/.test(hooks)) {
  problems.push(
    `${HOOKS}: không còn \`export function useLogWeight\`. Luật này đo số chỗ GỌI nó, nên nếu bản thân hook `
      + 'đổi tên thì phép đếm ở trên xanh suông trong khi không còn gì để đếm',
  );
}

/* ── vế 2: mệnh đề "đã nằm ở todo rồi" ──

   Lối ghi ĐÃ DỜI, và vế này dời theo. Trước đây dòng cân nặng của thẻ To-do
   bung một `<WeightEntry>` ngay tại chỗ; nay nó MỞ màn `/log-weight` — chiếc
   cân lớn. Điều phải giữ thì không đổi một chữ: từ màn Hôm nay vẫn phải có
   ĐÚNG MỘT lối ghi cân nặng, nếu không thì thẻ Cân nặng chỉ-đọc mất chỗ dựa.

   Nên vế này hỏi đúng ba câu, và cả ba đều phải đúng cùng lúc: dòng cân nặng
   của thẻ To-do trỏ tới `/log-weight`, màn ấy tồn tại, và nó ghi thật (qua
   `useWeightWrite`, chỗ đường ghi cũ được dời sang nguyên vẹn). */
const todo = strip(readFileSync(path.join(NATIVE, TODO), 'utf8'));
if (!/weight:\s*'\/log-weight'/.test(todo)) {
  problems.push(
    `${TODO}: dòng cân nặng của thẻ "Cần làm hôm nay" không còn trỏ tới \`/log-weight\`. Đây là LÝ DO thẻ `
      + 'Cân nặng được phép KHÔNG ghi — chủ dự án nói "tắt cái nút ghi đi không cho ghi nữa vì đã nằm ở '
      + 'todo rồi", và thẻ này chính là cái "todo" ấy. Cắt lối ấy đi thì màn Hôm nay không còn chỗ nào ghi '
      + 'cân nặng, và thẻ Cân nặng — vốn đã cố ý chỉ-đọc — không đỡ lại được',
  );
}
{
  let sheet = null;
  try {
    sheet = strip(readFileSync(path.join(NATIVE, SHEET), 'utf8'));
  } catch {
    problems.push(
      `${SHEET}: không còn tồn tại. Dòng cân nặng của thẻ To-do trỏ vào một màn không có — lối ghi duy `
        + 'nhất của màn Hôm nay dẫn tới hư không',
    );
  }
  if (sheet && !/useWeightWrite\s*\(/.test(sheet)) {
    problems.push(
      `${SHEET}: màn ghi cân nặng không gọi \`useWeightWrite()\`. Nó là màn DUY NHẤT còn ghi được cân nặng; `
        + 'không gọi đường ghi thì nó là một cái cân để ngắm',
    );
  }
}

/* ── vế 3: và thẻ Cân nặng thì KHÔNG được ghi ── */
const BANNED = [
  ['onPress', /\bonPress[=\s]/, 'một cú chạm. Kể cả khi nó không ghi gì: `PressScale` vẫn co lại dưới ngón '
    + 'tay, tức vẫn HỨA một hành động rồi không làm gì cả, và `accessibilityRole="button"` sẽ đọc cho '
    + 'VoiceOver một cái nút không tồn tại'],
  ['<WeightEntry>', /<WeightEntry\b/, 'ô nhập cân nặng — đúng thứ chủ dự án bảo tắt'],
  ['useLogWeight()', CALL, 'một lệnh ghi cân nặng'],
];
for (const [what, re, why] of BANNED) {
  if (body && re.test(body)) {
    problems.push(
      `${CARD}: \`WeightCheckinCard\` lại có \`${what}\` — ${why}. Chủ dự án yêu cầu TƯỜNG MINH: "tắt cái `
        + 'nút ghi đi không cho ghi nữa vì đã nằm ở todo rồi". Một thẻ cân nặng không bấm được trông như '
        + 'thiếu sót, nên đây là chỗ dễ bị "sửa" lại nhất — và không gì khác trong repo phản đối',
    );
  }
}
if (body && !/const\s+olderRows\s*=/.test(body)) {
  problems.push(
    `${CARD}: không còn \`olderRows\` — phần LỊCH SỬ, thứ thay cho cái nút, đã biến mất. Vế 3 cấm thẻ ghi; `
      + 'nếu nó cũng thôi hiện thông tin thì thẻ chẳng còn việc gì',
  );
}

/* ── vế 4: lịch sử không in lại con số lớn ── */
const slice = /entries\.slice\(\s*(\d+)/.exec(body ?? '');
if (body && !slice) {
  problems.push(
    `${CARD}: không còn \`entries.slice(…)\`. Danh sách lịch sử — thứ thay cho cái nút — đã được viết lại `
      + 'bằng cách khác. Đọc lại bằng mắt rồi sửa luật',
  );
} else if (slice && slice[1] !== '1') {
  problems.push(
    `${CARD}: lịch sử cắt từ chỉ số ${slice[1]}, không phải 1. \`entries[0]\` CHÍNH LÀ con số lớn ở đầu thẻ, `
      + 'nên cắt từ 0 là in một lần cân hai lần — cùng giá trị, cùng chênh lệch, cách nhau hai mươi điểm',
  );
}

if (problems.length) {
  console.error('thẻ cân nặng: thẻ chỉ-đọc được VÌ chỗ khác còn ghi — một trong hai vế đang hỏng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'thẻ cân nặng OK — thẻ KHÔNG ghi, theo đúng yêu cầu, và bốn vế canh cả hai chiều hỏng: thẻ không có '
    + '`onPress`, không dựng `<WeightEntry>`, không gọi `useLogWeight` (cấm cả `onPress` chứ không chỉ lệnh '
    + 'ghi — một `PressScale` không làm gì vẫn hứa một hành động rồi nuốt lời), nhưng vẫn còn `olderRows` '
    + `nên nó vẫn làm việc của mình; \`TodoCard\` — cái "todo" mà chủ dự án nói tới — còn trỏ dòng cân nặng `
    + `tới \`/log-weight\`, màn ấy tồn tại và nó gọi \`useWeightWrite()\`; \`useLogWeight\` còn chỗ gọi `
    + `(${notes.join(' · ')}); và lịch sử cắt từ chỉ số 1 nên `
    + 'con số lớn không bị in lại ở hàng đầu. Vế đếm chỗ gọi quét cả `src/` chứ không riêng thẻ: dời lối ghi '
    + 'sang màn khác là hợp lệ — và nó ĐÃ dời, từ một ô bung ra trong dòng To-do sang một màn riêng — xoá '
    + 'hẳn thì không. '
    + 'Và nó BỎ CHÚ THÍCH rồi mới tìm, vì bản đầu (`grep -rl useLogWeight src`) xanh với ba tệp mà hai trong '
    + 'ba chỉ nhắc tên nó trong một đoạn giải thích',
);
