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
 * ── và vì sao KHÔNG còn luật về quyền ──
 *
 * Bản đầu của tệp này chặn khi `su postgres` không chạy được, vì mười một bước
 * kiểm gọi nó không có đường lui và sẽ hỏng với "su: Authentication failure"
 * dưới một người dùng thường.
 *
 * Con số ấy SAI. Nó đếm bằng `grep -c "su postgres"` trừ đi số dòng có `||`, và
 * ba tệp trong danh sách đã có nhánh quyền đúng từ trước. Con số thật là tám.
 * Một phép đếm chữ không phải một phép đo hành vi.
 *
 * Cả tám nay đã rẽ theo quyền, và cả mười bốn đã được CHẠY THẬT dưới một người
 * dùng thường. Nên điều kiện ấy không còn tồn tại, và một luật canh một điều
 * kiện đã hết là một luật chỉ còn chặn nhầm. `tools/pg-harness.mjs` giữ chỗ
 * ấy bằng một luật TĨNH, trong bộ kiểm, để một bước mới viết theo lối cũ bị bắt
 * ở đúng chỗ nó được viết ra.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
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

/* ── 3. Playwright, và CẢ trình duyệt ──
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

/* ── 4. cây làm việc phải GHI ĐƯỢC bởi người đang chạy ──

   Nhiều bước ghi vào chính cây nguồn: `typed-routes` viết
   `.expo/types/router.d.ts`, vài bước dùng `node_modules/.cache`. Nếu người
   chạy job không sở hữu cây thì chúng hỏng hàng loạt với `EACCES` — đo được ở
   máy này: 17 bước đỏ, và cả 17 đều là quyền ghi, không bước nào nói gì về mã.

   Trên một runner thật `actions/checkout` tạo cây thuộc chính người chạy, nên
   điều kiện này gần như luôn đúng. "Gần như luôn" là đúng lý do để hỏi ở đây:
   ngày nó sai, câu trả lời phải là một dòng chứ không phải mười bảy stack
   trace. */
{
  const probe = path.join(NATIVE, `.preflight-write-${process.pid}`);
  try {
    writeFileSync(probe, 'x');
    rmSync(probe, { force: true });
    notes.push('cây làm việc: ghi được');
  } catch (e) {
    problems.push(
      `không ghi được vào \`native/\` (${e.code ?? e.message}). Nhiều bước ghi vào chính cây nguồn — `
      + '`typed-routes` viết `.expo/types/router.d.ts` — nên chúng sẽ đỏ hàng loạt với EACCES, và không '
      + 'stack trace nào nói gì về mã vừa sửa. Người chạy job phải sở hữu cây đã checkout',
    );
  }
}

/* ── 4. TypeScript, và tsconfig mà `check.mjs` phụ thuộc vào ── */
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
