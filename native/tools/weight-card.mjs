/**
 * Thẻ cân nặng được phép thôi là một cái biểu mẫu — vì có chỗ khác ghi. Luật
 * này canh chữ "vì".
 *
 *     node tools/weight-card.mjs
 *
 * ── vì sao luật này tồn tại ──
 *
 * Chủ dự án yêu cầu: *"vì phía trên đã có ghi cân nặng rồi, thẻ này giờ chỉ
 * dùng để hiện thông tin — ví dụ thay nút ghi bằng lịch sử thay đổi cân nặng
 * sau mỗi lần log"*.
 *
 * Câu ấy ĐÚNG, và nó đúng nhờ một lượt sửa khác: `weight-entry.tsx` được tách
 * ra để thẻ *Cần làm hôm nay* ghi cân nặng ngay tại chỗ, và thẻ ấy nằm TRÊN cả
 * dãy nhóm widget trong `(tabs)/index.tsx`. Bỏ ô nhập khỏi mặt thẻ Cân nặng là
 * an toàn **chính xác vì** lối ghi kia tồn tại.
 *
 * Nên thứ phải canh không phải cái thẻ — mà là **mệnh đề nó dựa lên**. Nếu
 * `TodoCard` thôi dựng `WeightEntry`, hoặc `useLogWeight` mất chỗ gọi cuối
 * cùng, thì đoạn chú thích trong `today-widgets.tsx` thành một lời giải thích
 * sai, và quyết định thiết kế ngồi trên nó mất cơ sở — **mà không màn hình nào
 * báo lỗi**, vì không có gì hỏng: chỉ là không còn đường vào.
 *
 * `tsc` không bắt được: gỡ một `<WeightEntry />` là mã hợp lệ. Ảnh chụp không
 * bắt được: cả hai thẻ vẫn vẽ ra đúng như thiết kế. Thứ mất đi là một khả năng,
 * và khả năng thì chỉ có luật mới canh được.
 *
 * ── năm vế ──
 *
 * 1. `useLogWeight` còn ít nhất một chỗ GỌI ngoài tệp hook.
 * 2. `TodoCard` còn dựng `WeightEntry` — đây là vế giữ cho câu "phía trên đã có
 *    ghi cân nặng rồi" còn đúng.
 * 3. Thẻ Cân nặng vẫn còn một đường mở ô nhập (`setEditing(true)` + dựng
 *    `WeightEntry`): lối thứ hai lùi lại một cú chạm, không biến mất.
 * 4. Ô nhập KHÔNG tự bung: `showLogger` là `editing` và chỉ `editing`. Thêm
 *    `todayWeight == null` vào là hai ô nhập cùng mở trên một trang, cho cùng
 *    một con số.
 * 5. Lịch sử cắt từ chỉ số 1. `entries[0]` là con số lớn ở trên, nên
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
  gọi, không phải một cái tên.
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

/* ── vế 2: mệnh đề "phía trên đã có ghi cân nặng rồi" ── */
const todo = strip(readFileSync(path.join(NATIVE, TODO), 'utf8'));
if (!/<WeightEntry\b/.test(todo)) {
  problems.push(
    `${TODO}: thẻ "Cần làm hôm nay" không còn dựng \`<WeightEntry>\`. Đây là LÝ DO thẻ Cân nặng được phép `
      + 'bỏ ô nhập khỏi mặt thẻ — chủ dự án nói "vì phía trên đã có ghi cân nặng rồi", và thẻ này chính là '
      + '"phía trên" ấy (nó nằm trước cả dãy nhóm widget trong `(tabs)/index.tsx`). Bỏ nó đi thì đoạn chú '
      + 'thích trong `today-widgets.tsx` thành một lời giải thích sai, và quyết định ngồi trên nó mất cơ sở',
  );
}

/* ── vế 3: thẻ còn đường mở ô nhập ── */
if (body && !/setEditing\(true\)/.test(body)) {
  problems.push(
    `${CARD}: \`WeightCheckinCard\` không còn chỗ nào gọi \`setEditing(true)\`. Nút ghi đã rời mặt thẻ theo `
      + 'đúng yêu cầu, nên cú chạm lên mặt thẻ LÀ lối vào còn lại của thẻ này. Gỡ nó đi thì thẻ thành '
      + 'chỉ-đọc thật, và lối ghi cân nặng của app tụt từ hai xuống một',
  );
}
if (body && !/<WeightEntry\b/.test(body)) {
  problems.push(
    `${CARD}: \`WeightCheckinCard\` không còn dựng \`<WeightEntry>\`. \`setEditing(true)\` ở trên khi ấy bật `
      + 'một trạng thái không vẽ ra gì',
  );
}

/* ── vế 4: ô nhập không tự bung ── */
const showLogger = /const\s+showLogger\s*=\s*([^;]+);/.exec(body ?? '');
if (body && !showLogger) {
  problems.push(
    `${CARD}: không còn \`const showLogger = …\`. Cái chốt quyết định thẻ mở ra ở dạng biểu mẫu hay dạng `
      + 'thông tin đã được viết lại. Đọc lại chỗ ấy bằng mắt rồi sửa luật',
  );
} else if (showLogger) {
  const expr = showLogger[1].trim();
  notes.push(`showLogger = ${expr}`);
  if (expr !== 'editing') {
    problems.push(
      `${CARD}: \`showLogger\` là \`${expr}\`, không phải \`editing\`. Bản cũ là `
        + '`editing || todayWeight == null`, tức mỗi ngày trước lần cân đầu tiên thẻ tự bung ô nhập — và từ '
        + 'khi `TodoCard` cũng dựng `WeightEntry`, đó là HAI ô nhập cùng mở trên một trang cho cùng một con '
        + 'số. Bất kỳ vế nào ngoài `editing` đều là một đường để nó tự bung trở lại',
    );
  }
}

/* ── vế 5: lịch sử không in lại con số lớn ── */
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
  console.error('thẻ cân nặng: thẻ bỏ được ô nhập VÌ có chỗ khác ghi — và chữ "vì" ấy đang hỏng:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'thẻ cân nặng OK — ô nhập đã rời mặt thẻ theo yêu cầu, và năm vế giữ cho LÝ DO của việc ấy còn đúng: '
    + `\`useLogWeight\` còn chỗ gọi (${notes.join(' · ')}), \`TodoCard\` — cái "phía trên" mà chủ dự án nói `
    + 'tới — còn dựng `WeightEntry`, thẻ Cân nặng vẫn còn `setEditing(true)` và vẫn dựng `WeightEntry` nên '
    + 'lối thứ hai chỉ lùi lại một cú chạm chứ không mất, ô nhập chỉ mở khi được chạm chứ không tự bung, và '
    + 'lịch sử cắt từ chỉ số 1 nên con số lớn không bị in lại ở hàng đầu. Vế đếm chỗ gọi quét cả `src/` chứ '
    + 'không riêng thẻ: dời lối ghi sang màn khác là hợp lệ, xoá hẳn thì không — cân nặng là chỉ số duy nhất '
    + 'không có màn riêng để ghi. Và nó BỎ CHÚ THÍCH rồi mới tìm, vì bản đầu (`grep -rl useLogWeight src`) '
    + 'xanh với ba tệp mà hai trong ba chỉ nhắc tên nó trong một đoạn giải thích',
);
