/**
 * Điều kiện hết hiệu lực của sổ ghi lỗi, chạy lại mỗi lượt cổng.
 *
 *     node tools/ledger-live.mjs
 *
 * ── lỗi nó sinh ra để sửa ──
 *
 * `docs/SO-GHI-LOI.md` nhóm C là *"đã kiểm và KHÔNG phải lỗi — cấm sửa"*. Mục C1
 * kết luận `useToggleSupplement` không cần dựng lại `daily_logs`, và nó làm mọi
 * thứ một kết luận tốt phải làm: có bằng chứng, có phép đo giá phải trả, và có
 * sẵn điều kiện hết hiệu lực kèm đúng lệnh để kiểm lại —
 *
 *   > Nếu sau này có màn hình đọc hai cột đó thì mục này thành lỗi thật. Kiểm
 *   > bằng đúng lệnh grep trên trước khi kết luận.
 *
 * Điều kiện ấy đã xảy ra. `a63b566` siết định nghĩa "một ngày có ghi" và đưa
 * `supplement_taken` vào `LOGGED_DAY_FILTER` (`src/lib/streak.ts`), nay được đọc
 * bởi chuỗi ngày + huy chương (`use-extras.ts`) và phòng linh vật
 * (`use-mascot-room.ts`). Kết luận "cấm sửa" thành sai, và nằm đó thêm nhiều
 * tháng.
 *
 * **Một điều kiện không ai chạy thì không phải một điều kiện.** Trong kho này
 * thứ tương đương "có người chạy nó" là một bước trong `check.mjs` — nên điều
 * kiện ấy chuyển từ văn xuôi thành mã, ở đây.
 *
 * ── vì sao không luật nào khác bắt được ──
 *
 *   `dead-schema`   hỏi một BẢNG có ai dùng không
 *   `activity`      hỏi một CỘT có ai ghi không
 *   `empty-writer`  hỏi một lượt ghi có mang tin không
 *   `correctable`   hỏi một lượt xoá có dựng lại ngày không
 *
 * Cả bốn hỏi về MÃ. Chỗ hỏng ở đây là một khẳng định trong TÀI LIỆU mà tiền đề
 * của nó nằm trong mã — và tiền đề thì lặng lẽ đổi. Không luật nào của kho hỏi
 * "câu này còn đúng không".
 *
 * ── luật, hai vế ──
 *
 * Mục A14 sống chừng nào CẢ HAI còn đúng: có nơi đọc `supplement_taken` ngoài
 * tệp ghi ra nó, và `useToggleSupplement` vẫn không dựng lại ngày. Vế nào tắt
 * thì sổ phải được viết lại — vế một tắt thì mục về lại nhóm C, vế hai tắt thì
 * mục đóng. Cùng khuôn `muted-ground.mjs` và `motion.mjs`: một ngoại lệ phải
 * chết khi lý do của nó chết.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { NATIVE } from './lib/stack.mjs';

const problems = [];
const LEDGER = 'docs/SO-GHI-LOI.md';
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');

/*
  Đúng lệnh C1 dặn chạy, viết lại thành mã: ai đọc hai cột supplement ngoài chính
  tệp ghi ra chúng. `types.ts` là lược đồ sinh tự động, không phải một nơi đọc.

  ── một vòng gián tiếp phải đi hết, không được đi tắt ──

  Hai hook không nhắc `supplement_taken` bằng chữ. Chúng dùng `LOGGED_DAY_FILTER`,
  và cột nằm BÊN TRONG hằng ấy. Bản đầu của luật này đếm "tệp có nhắc
  `LOGGED_DAY_FILTER`" là một nơi đọc — và phép thử ngược bắt được ngay: bỏ
  `supplement_taken` ra khỏi hằng thì hai hook vẫn nhắc tên hằng, nên luật vẫn
  đếm đủ ba nơi đọc trong khi đã không còn nơi nào. Nó sẽ giữ A14 sống bằng một
  tiền đề đã chết — đúng cái bệnh nó sinh ra để chữa, lặp lại bên trong chính nó.

  Nên hằng được ĐỌC NỘI DUNG trước, và chỉ khi cột còn nằm trong đó thì người
  dùng hằng mới được tính.
*/
const streakSrc = stripComments(read('src/lib/streak.ts'));
const filterM = /LOGGED_DAY_FILTER\s*=\s*'([^']*)'/.exec(streakSrc);
if (!filterM) {
  problems.push(
    'src/lib/streak.ts: không đọc được nội dung `LOGGED_DAY_FILTER` — luật này dựa vào việc biết hằng ấy '
      + 'lọc theo cột nào. Hằng đã đổi hình; đọc lại bằng mắt rồi sửa luật',
  );
}
const filterHasSupp = !!filterM && /supplement_taken/.test(filterM[1]);

const SOURCES = ['src/lib/streak.ts', 'src/hooks/use-extras.ts', 'src/hooks/use-mascot-room.ts'];
const readers = SOURCES.filter((rel) => {
  const src = stripComments(read(rel));
  if (/supplement_taken|supplement_planned/.test(src)) return true;
  return filterHasSupp && src.includes('LOGGED_DAY_FILTER');
});

const ledger = read(LEDGER);
const A14 = ledger.includes('### A14.');
const C1_EXPIRED = ledger.includes('HẾT HIỆU LỰC 2026-09-14, XEM **A14**');

/* Vế 1 — mục A14 chỉ đúng khi còn nơi đọc. */
if (readers.length === 0) {
  problems.push(
    `${LEDGER}: không còn nơi nào ngoài \`daily-log-service.ts\` đọc \`supplement_taken\`. Tiền đề của A14 `
      + 'đã tắt: mục ấy phải quay về nhóm C ("đã kiểm, KHÔNG phải lỗi"), kèm phép đo mới. Một mục ở nhóm A '
      + 'với tiền đề đã chết là một lời cấm không có lý do',
  );
} else if (!A14) {
  problems.push(
    `${LEDGER}: \`supplement_taken\` đang được đọc ở ${readers.join(', ')} — tức điều kiện hết hiệu lực mà `
      + 'C1 tự viết ra ĐÃ xảy ra — nhưng sổ không còn mục A14 nào ghi việc ấy. Đây đúng trạng thái mà luật '
      + 'này sinh ra để chặn: một kết luận "cấm sửa" sống lâu hơn tiền đề của nó',
  );
}

if (A14 && !C1_EXPIRED) {
  problems.push(
    `${LEDGER}: có A14 nhưng C1 không còn dấu hết hiệu lực. Hai mục đang nói ngược nhau về cùng một hàm, `
      + 'và người đọc sẽ tin mục nào họ gặp trước',
  );
}

/* Vế 2 — mục A14 đóng ngay khi hàm ấy dựng lại ngày. */
const lib = stripComments(read('src/hooks/use-library.ts'));
const toggle = lib.slice(lib.indexOf('export function useToggleSupplement'));
const end = toggle.indexOf('\nexport ', 1);
const body = end > 0 ? toggle.slice(0, end) : toggle;
if (!lib.includes('export function useToggleSupplement')) {
  problems.push(
    'src/hooks/use-library.ts: không còn `useToggleSupplement` — A14 canh một hàm không tồn tại. Đọc lại '
      + 'sổ bằng mắt rồi sửa cả hai',
  );
} else if (/recomputeDailyLog/.test(body)) {
  problems.push(
    `${LEDGER}: \`useToggleSupplement\` nay có gọi \`recomputeDailyLog\` — A14 đã được sửa nhưng sổ vẫn ghi `
      + 'là MỞ. Đóng mục ấy kèm phép đo giá thật (C1 đo được 11 truy vấn mỗi lần tích), đừng để một mục đã '
      + 'xong nằm trong nhóm "chưa chứng minh được cách sửa an toàn"',
  );
}

if (problems.length) {
  console.error('sổ ghi lỗi nói một điều mà mã không còn đỡ:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `điều kiện của sổ ghi lỗi OK — chạy lại đúng lệnh mục C1 tự dặn: \`supplement_taken\` nay có `
    + `${readers.length} nơi đọc ngoài tệp ghi ra nó (${readers.join(', ')}), nên mục ấy đã hết hiệu lực và `
    + 'được chuyển lên A14; và `useToggleSupplement` vẫn chưa dựng lại ngày, nên A14 còn MỞ. Chỗ hổng nó '
    + 'lấp không nằm trong mã: `dead-schema` hỏi một bảng có ai dùng không, `activity` hỏi một cột có ai ghi '
    + 'không, `empty-writer` hỏi một lượt ghi có mang tin không — cả ba hỏi về mã, còn thứ hỏng ở đây là một '
    + 'KẾT LUẬN trong tài liệu mà tiền đề nằm trong mã. C1 đã làm đúng mọi thứ: có bằng chứng, có giá, có '
    + 'sẵn điều kiện hết hiệu lực và đúng lệnh để kiểm lại. Vẫn sai, vì một điều kiện không ai chạy thì '
    + 'không phải một điều kiện',
);
