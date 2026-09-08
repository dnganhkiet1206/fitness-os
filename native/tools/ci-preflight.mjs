/**
 * Máy này có chạy được TRỌN VẸN bộ kiểm không — hỏi trước, không đoán sau.
 *
 * ── vì sao bước này KHÔNG nằm trong `check.mjs` ──
 *
 * Trên máy của một người đang viết mã, thiếu PostgreSQL là chuyện bình thường
 * và `check.mjs` xử lý đúng: các bước cần cơ sở dữ liệu in "BỎ QUA phần hành vi"
 * rồi đi tiếp. Bắt họ dựng PostgreSQL để sửa một cái nút là một cái giá vô lý.
 *
 * Trên máy CI thì cùng hành vi ấy trở thành một lời nói dối. **Năm** bước bỏ
 * qua trong im lặng và vẫn thoát 0, nên dấu tích xanh trên một pull request nói
 * "tất cả đều xanh" trong khi năm bước trong đó chưa chạy một dòng SQL nào.
 * Không ai đọc log của một job đã xanh.
 *
 * Nên: cùng một bộ kiểm, hai ngữ cảnh, và chỗ khác nhau được nói ra ở đây chứ
 * không giấu vào một cờ `--strict` mà rồi ai đó sẽ bỏ đi cho job xanh lại.
 *
 * ── và vì sao có luật về QUYỀN ──
 *
 * Đo được, ở đúng máy này: `tools/acwr-consistency.mjs` chạy với một người dùng
 * không phải root thì
 *
 *     • không dựng được phép thử ACWR: không khởi động được PostgreSQL:
 *       Password: su: Authentication failure
 *
 * và thoát 1. Mười một trong mười bốn bước dùng cơ sở dữ liệu gọi `su postgres`
 * mà không có đường lui; ba bước còn lại (`awards-concurrency`,
 * `daily-log-concurrency`, `logged-day`) có `|| pg_ctl` nên chúng chạy được
 * dưới bất kỳ người dùng nào.
 *
 * Runner mặc định của GitHub chạy dưới `runner`, không phải root. Nên một
 * workflow ngây thơ sẽ ĐỎ vì một lý do không liên quan gì tới mã vừa sửa — đúng
 * cái mà phần đầu `check.mjs` đã cảnh báo về `tsconfig` và Playwright: *"the
 * check failing for a reason that has nothing to do with what it checks."*
 * Bước này nói ra điều đó bằng một câu, trước khi mất mười lăm phút.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

/* ── 1. PostgreSQL 16/15, ở một trong ba chỗ các bước kiểm thật sự tìm ── */
const PG_DIRS = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin'];
const PGBIN = PG_DIRS.find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
if (!PGBIN) {
  problems.push(
    'không có PostgreSQL. 14 bước dùng cơ sở dữ liệu — và 5 trong số đó BỎ QUA trong im lặng rồi vẫn '
    + `thoát 0, nên job sẽ xanh mà chưa chạy một dòng SQL nào. Các bước tìm initdb ở: ${PG_DIRS.join(', ')}`,
  );
} else {
  notes.push(`PostgreSQL: ${PGBIN}`);
}

/* ── 2. client `pg` — nửa còn lại của cùng điều kiện ──
   `acwr-consistency` bỏ qua khi THIẾU MỘT TRONG HAI, nên có PostgreSQL mà thiếu
   `pg` vẫn là một bước xanh rỗng. Nó là devDependency, tức `npm ci` là đủ — và
   `npm ci --omit=dev` thì không, đó chính là cái bẫy. */
if (!existsSync(path.join(NATIVE, 'node_modules', 'pg'))) {
  problems.push(
    'thiếu `node_modules/pg`. Nó là devDependency, nên `npm ci --omit=dev` sẽ cài thiếu nó '
    + 'và các bước dùng cơ sở dữ liệu bỏ qua trong im lặng',
  );
}

/* ── 3. quyền: `su postgres` có chạy được không ──
   Hỏi bằng cách THỬ, không bằng cách đọc uid: một container chạy dưới root thì
   được, một runner có sudo không mật khẩu cũng có thể được, và đoán sai theo
   chiều nào cũng dẫn tới một job đỏ vì lý do sai. */
let canSu = false;
try {
  execFileSync('su', ['postgres', '-c', 'true'], { stdio: 'ignore', timeout: 15000 });
  canSu = true;
} catch { /* không được thì thôi — câu trả lời nằm ở dưới */ }
if (PGBIN && !canSu) {
  problems.push(
    '`su postgres` không chạy được ở đây. 11 trong 14 bước dùng cơ sở dữ liệu gọi nó KHÔNG CÓ đường lui '
    + '(acwr-consistency, economic-integrity, error-copy, nutrition-averages, quest-lifecycle, '
    + 'readiness-anchor, readiness-confidence, readiness-integrity, streak-freeze, workload-volume, '
    + 'workout-sync-integrity) và sẽ hỏng với "su: Authentication failure" — một lỗi không nói gì về mã '
    + 'vừa sửa. Chạy job dưới root (`container:` của GitHub Actions mặc định là root), hoặc thêm `|| pg_ctl` '
    + 'cho 11 bước ấy như 3 bước kia đã có',
  );
} else if (canSu) {
  notes.push('su postgres: được');
}

/* ── 4. Playwright, và CẢ trình duyệt ──
   Hai chuyện khác nhau: `npm i playwright` cho thư viện, `playwright install`
   cho bản Chromium. Có cái đầu mà thiếu cái sau thì 6 bước hỏng ở lúc mở trình
   duyệt — muộn, sau khi đã dựng xong mọi thứ. */
let pw = null;
const roots = [path.join(NATIVE, 'node_modules')];
try { roots.push(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim()); } catch { /* bỏ qua */ }
for (const r of roots) {
  if (!existsSync(path.join(r, 'playwright'))) continue;
  try { pw = createRequire(path.join(r, 'x.cjs'))('playwright'); notes.push(`playwright: ${r}`); break; }
  catch { /* thư mục có mà nạp không được — thử chỗ tiếp theo */ }
}
if (!pw) {
  problems.push(`không nạp được playwright (đã tìm: ${roots.join(', ')}). 6 bước chạy trình duyệt sẽ hỏng`);
} else {
  const exe = (() => { try { return pw.chromium.executablePath(); } catch { return null; } })();
  if (!exe || !existsSync(exe)) {
    problems.push(
      'có thư viện playwright nhưng KHÔNG có bản Chromium — `playwright install --with-deps chromium` là '
      + 'một bước riêng, và thiếu nó thì 6 bước hỏng ở lúc mở trình duyệt, tức sau khi đã dựng xong mọi thứ',
    );
  } else {
    notes.push(`chromium: ${exe}`);
  }
}

/* ── 5. TypeScript, và tsconfig mà `check.mjs` phụ thuộc vào ── */
if (!existsSync(path.join(NATIVE, 'node_modules', 'typescript'))) {
  problems.push('thiếu `node_modules/typescript` — bước `tsc --noEmit` sẽ hỏng');
}
if (!existsSync(path.join(NATIVE, 'tsconfig.json'))) {
  problems.push('không có native/tsconfig.json — bộ kiểm phải chạy TỪ native/');
}

if (problems.length) {
  console.error('máy này KHÔNG chạy trọn vẹn được bộ kiểm:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(
    '\nMột bước bỏ qua trong im lặng còn tệ hơn một bước đỏ: dấu tích xanh nói "tất cả đều xanh" và '
    + 'không ai đọc log của một job đã xanh.',
  );
  process.exit(1);
}
console.log(`tiền kiểm CI OK — ${notes.join(' · ')}. Mọi bước chạy thật, không bước nào bỏ qua trong im lặng.`);
