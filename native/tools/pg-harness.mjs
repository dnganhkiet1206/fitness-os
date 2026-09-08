/**
 * Mọi bước kiểm dựng PostgreSQL phải chạy được dưới BẤT KỲ người dùng nào.
 *
 * ── lỗi này có hình dạng gì ──
 *
 * `initdb` và `pg_ctl` từ chối chạy dưới root. Nên một bước kiểm dựng cụm dữ
 * liệu riêng phải hạ quyền — và mười bốn bước ở đây làm đúng thế, bằng
 * `su postgres -c "…"`.
 *
 * Nhưng `su` chỉ chạy được KHI ĐANG LÀ root. Dưới một người dùng thường nó đòi
 * mật khẩu và hỏng với `su: Authentication failure`, và bước kiểm thoát 1 với
 * một câu không nói gì về thứ nó đang kiểm — đúng cái phần đầu `check.mjs` cảnh
 * báo: *"the check failing for a reason that has nothing to do with what it
 * checks."*
 *
 * Runner mặc định của GitHub chạy dưới `runner`. Máy của phần lớn người viết mã
 * cũng không phải root. Nên "chạy được" ở đây không phải một sự tiện lợi.
 *
 * ── vì sao `|| pg_ctl` là câu trả lời SAI ──
 *
 * Đề xuất đầu tiên là thêm một đường lui: thử `su`, hỏng thì gọi thẳng. Nó sai
 * theo đúng chiều nguy hiểm — dưới root, đường lui sẽ chạy `initdb` bằng root
 * và nhận một lỗi KHÁC ("cannot be run as root"), tức đổi một lỗi rõ ràng lấy
 * một lỗi khó đọc hơn.
 *
 * Điều kiện là QUYỀN, nên phép rẽ phải là quyền:
 *
 *     const asPg = sh('id -u postgres').code === 0 && process.getuid() === 0;
 *     const run = (c) => (asPg ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
 *
 * Và `chown` phải nằm TRONG nhánh ấy: dưới người dùng thường nó không có quyền,
 * còn thư mục thì đã thuộc về chính người đang chạy.
 *
 * ── một con số tôi từng nói sai ──
 *
 * Vòng trước tôi đếm bằng `grep -c "su postgres"` trừ đi số dòng có `||`, ra
 * "11/14 không có đường lui". Sai: ba trong số đó (`economic-integrity`,
 * `quest-lifecycle`, `streak-freeze`) đã có nhánh quyền đúng từ trước. Con số
 * thật là **8**. Một phép đếm chữ không phải một phép đo hành vi — và đó là lý
 * do bước này hỏi cấu trúc chứ không đếm chuỗi.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

/** Bóc comment mà giữ nguyên số dòng — một khối bị xoá hẳn làm lệch mọi số sau nó. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* Trừ chính mình: các luật dưới đây là những chuỗi chứa `initdb`,
   `su postgres -c "` và `chown postgres:postgres`, nên tệp này khớp mọi mẫu nó
   đi tìm. Một bước kiểm báo lỗi về chính nó là một bước kiểm không ai đọc nữa. */
const SELF = path.basename(fileURLToPath(import.meta.url));
const files = readdirSync(TOOLS).filter((f) => f.endsWith('.mjs') && f !== SELF).sort();
const starters = [];

for (const f of files) {
  const raw = readFileSync(path.join(TOOLS, f), 'utf8');
  const src = strip(raw);
  /* "Dựng một cụm" = gọi initdb. Một tệp chỉ NHẮC tới initdb trong chú thích
     (như chính tệp này) không tính, vì chú thích đã bị bóc. */
  if (!/\$\{PGBIN\}\/initdb|\/initdb\b/.test(src) || !/pg_ctl/.test(src)) continue;
  starters.push(f);

  /* 1. có nhánh theo QUYỀN, và nó hỏi cả hai vế: đang là root, và có user postgres. */
  want(/process\.getuid/.test(src) && /id -u postgres/.test(src),
    `${f}: dựng PostgreSQL mà không rẽ theo quyền. Dưới một người dùng thường, \`su postgres\` hỏng với `
    + '"Authentication failure" và bước này thoát 1 vì một lý do không liên quan gì tới thứ nó kiểm');

  /*
    2. `su postgres -c "…"` viết thẳng — và chỗ này phải phân biệt, không cấm đều.

    Với lệnh DỪNG, dạng cũ `su postgres -c "pg_ctl … stop" || pg_ctl … stop` là
    an toàn ở cả hai chiều: dưới người dùng thường `su` hỏng rồi vế sau chạy;
    dưới root `su` chạy và vế sau không cần tới. Ba tệp dùng dạng ấy và cả ba đã
    được CHẠY THẬT dưới một người dùng thường — chúng xanh. Đổi chúng là churn
    không có lỗi nào đứng sau.

    Với `initdb` hay `pg_ctl … start` thì dạng ấy SAI theo đúng chiều nguy hiểm:
    dưới root, vế sau chạy initdb bằng root và nhận "cannot be run as root" —
    một lỗi khó đọc hơn cái nó thay thế.

    Nên luật là: một `su postgres` viết thẳng chỉ được phép khi nó DỪNG cụm và
    có đường lui ngay trên cùng dòng.
  */
  const bare = [];
  src.split('\n').forEach((line, i) => {
    if (!/su postgres -c ["']/.test(line)) return;
    const stopWithFallback = /stop -m/.test(line) && /\|\|/.test(line);
    if (!stopWithFallback) bare.push(i + 1);
  });
  want(bare.length === 0,
    `${f}:${bare.join(',')}: \`su postgres -c "…"\` viết thẳng cho một lệnh KHÔNG phải dừng-có-đường-lui. `
    + 'Dòng ấy chỉ chạy được dưới root, và dưới một người dùng thường nó làm hỏng cả bước kiểm');

  /* 3. `chown` phải nằm TRONG nhánh — dưới người dùng thường nó không có quyền,
        và một `chown` hỏng để lại thư mục dữ liệu ở chế độ initdb từ chối. */
  const chown = src.match(/^.*chown postgres:postgres.*$/m);
  if (chown) {
    /* Hỏi "dòng này CÓ ĐIỀU KIỆN không", không hỏi tên biến: ba tệp gọi cờ ấy
       là `asPostgres`, và một luật khớp tên sẽ báo nhầm chúng — nó đã báo nhầm,
       và đó là lý do dòng này hỏi cấu trúc. */
    want(/\bif \(|\?/.test(chown[0]),
      `${f}: \`chown postgres:postgres\` không nằm trong nhánh quyền — dưới người dùng thường nó hỏng, `
      + 'và thư mục dữ liệu ở lại đúng chế độ mà initdb từ chối');
  }

  /* 4. dọn dẹp: phải có lệnh dừng postmaster.
        Một postmaster mồ côi vẫn nhận kết nối sau khi thư mục dữ liệu đã bị xoá,
        và một bước kiểm sau đó có thể đo đúng cái xác ấy — `awards-concurrency`
        đã mất ba phép thử ngược vào chuyện này. */
  want(/pg_ctl[^\n]*stop/.test(src),
    `${f}: không dừng postmaster. Một tiến trình mồ côi vẫn nhận kết nối sau khi thư mục dữ liệu bị xoá, `
    + 'và bước kiểm chạy sau có thể đo nhầm nó');
}

/* 5. Bước này chỉ có nghĩa khi nó thật sự thấy các tệp ấy. Một luật quét ra 0
      mục tiêu là một luật xanh vĩnh viễn. */
want(starters.length >= 12,
  `chỉ thấy ${starters.length} bước kiểm dựng PostgreSQL — mong ít nhất 12. Nếu phép nhận diện thôi khớp thì `
  + 'luật này xanh mãi mãi mà không canh gì cả');

if (problems.length) {
  console.error('bộ khung PostgreSQL CÓ LỖI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `bộ khung PostgreSQL OK — ${starters.length} bước kiểm dựng cụm dữ liệu riêng, và cả ${starters.length} đều `
  + 'rẽ theo QUYỀN trước khi dựng cụm: `initdb` từ chối chạy dưới root nên root phải hạ quyền, '
  + 'còn người dùng thường thì `su` đòi mật khẩu nên phải chạy thẳng. Không phải `|| pg_ctl` — thử-rồi-lui sẽ '
  + 'chạy initdb bằng root ở lần thử thứ hai và đổi một lỗi rõ ràng lấy một lỗi khó đọc hơn. Dạng `su … || '
  + 'pg_ctl` vẫn được phép cho lệnh DỪNG, nơi nó an toàn ở cả hai chiều, và ba tệp dùng nó đã được chạy thật '
  + 'dưới một người dùng thường. `chown` nằm trong '
  + 'nhánh ấy, và mọi bước đều dừng postmaster: một tiến trình mồ côi vẫn nhận kết nối sau khi thư mục dữ liệu '
  + 'đã bị xoá, và bước chạy sau có thể đo nhầm nó.',
);
