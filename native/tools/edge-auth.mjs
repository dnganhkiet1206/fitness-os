/**
 * Mọi edge function đều tự kiểm token, vì nền tảng đã được bảo là đừng kiểm.
 *
 * ── vì sao luật này tồn tại ──
 *
 * `config.toml` đặt `verify_jwt = false` cho tất cả. Đó là chủ ý — cổng của nền
 * tảng chỉ biết "token này hợp lệ", còn app cần biết "token này của một NGƯỜI
 * DÙNG, không phải khoá anon, không phải khoá service" — và `store-webhook` thì
 * do Apple gọi, không mang token nào cả.
 *
 * Cái giá của chủ ý đó: lớp kiểm duy nhất còn lại nằm trong CODE. Một function
 * thứ mười được thêm vào mà quên `requireUser` sẽ mở thẳng ra internet, và nó
 * không lỗi, không cảnh báo, không khác gì một function đúng cho tới ngày ai đó
 * gọi nó bằng curl.
 *
 * Luật này là thứ thay cho cái cổng đã tắt.
 *
 * ── và một miễn trừ có TÊN ──
 *
 * `store-webhook` không xác thực người gọi, và nó đúng: nó không tin payload
 * chút nào, nó lấy transaction id rồi hỏi lại Apple qua TLS. Một POST giả mạo
 * chỉ đạt được một lỗi, hoặc một lần xác nhận lại thứ vốn đã đúng. Miễn trừ
 * được ghi tên ở đây kèm lý do, chứ không phải một khoảng lặng mà người sau
 * phải đoán.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(NATIVE, '..');
const DIR = path.join(ROOT, 'supabase', 'functions');
const read = (f) => readFileSync(path.join(DIR, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

/** Miễn trừ, kèm lý do. Thêm tên vào đây là một quyết định, không phải một chỗ trống. */
const NO_USER_TOKEN = {
  'store-webhook':
    'Apple gọi vào và không mang token người dùng. Nó không tin payload: lấy transaction id rồi ' +
    'hỏi lại Apple qua TLS, nên một POST giả mạo chỉ đạt được một lỗi hoặc một lần xác nhận lại ' +
    'thứ vốn đã đúng.',
};

const problems = [];
const fns = readdirSync(DIR).filter(
  (d) => d !== '_shared' && statSync(path.join(DIR, d)).isDirectory(),
);

for (const fn of fns) {
  let code;
  try {
    code = strip(read(`${fn}/index.ts`));
  } catch {
    problems.push(`${fn}: không có index.ts`);
    continue;
  }
  const authed = /requireUser\(/.test(code);
  if (NO_USER_TOKEN[fn]) {
    /* Miễn trừ hết hạn cũng là một lỗi: một lý do để lại cho code không còn làm
       việc đó nữa thì người sau đọc nó như vẫn đúng. */
    if (authed) {
      problems.push(`${fn}: nay có gọi requireUser — gỡ nó khỏi danh sách miễn trừ, lý do ghi ở đó đã hết đúng`);
    }
    continue;
  }
  if (!authed) {
    problems.push(
      `${fn}: không gọi requireUser, và verify_jwt đang tắt — function này mở thẳng ra internet. ` +
        'Nếu đó là chủ ý thì ghi tên nó vào NO_USER_TOKEN kèm lý do',
    );
    continue;
  }
  /* Xác thực phải đứng TRƯỚC mọi việc tốn kém. Đặt sau `claimCall` nghĩa là một
     người gọi vô danh tiêu được hạn mức của một tài khoản. */
  const iAuth = code.indexOf('requireUser(');
  const iClaim = code.indexOf('claimCall(');
  if (iClaim >= 0 && iAuth > iClaim) {
    problems.push(`${fn}: requireUser đứng SAU claimCall — người gọi vô danh tiêu được hạn mức`);
  }
  /* Và danh tính phải đến từ token, không từ body. Đây là IDOR ở dạng thẳng
     thắn nhất: một `user_id` gửi lên là một người dùng đọc dữ liệu người khác. */
  if (/(body|payload)\s*\??\.\s*(user_id|userId)\b/.test(code)) {
    problems.push(`${fn}: đọc user id từ body — danh tính phải lấy từ token đã xác thực`);
  }
}

/* ── requireUser kiểm đủ ba thứ ── */
{
  const guard = strip(read('_shared/guard.ts'));
  for (const [claim, why] of [
    ['sub', 'không có sub thì đó là khoá anon, không phải một người'],
    ['role', 'role phân biệt token người dùng với token service'],
    ['aud', 'aud nói token được cấp CHO AI — role nói nó tự xưng là gì, hai câu khác nhau'],
  ]) {
    /* Phải được DÙNG trong phép quyết định, không chỉ xuất hiện.

       Bản đầu chỉ tìm chữ `aud` ở bất kỳ đâu trong file. Gỡ nó khỏi câu `if`
       mà để lại dòng `const aud = ...` thì luật vẫn xanh — nó thấy cái tên và
       kết luận là có kiểm. Khớp chữ, không khớp việc; lần thứ chín. */
    if (!new RegExp(`if \\([^)]*\\b${claim}\\b`, 's').test(guard)) {
      problems.push(`_shared/guard.ts: requireUser không kiểm \`${claim}\` — ${why}`);
    }
  }
  if (!/Array\.isArray\(claims\?\.aud\)/.test(guard)) {
    problems.push(
      '_shared/guard.ts: `aud` không nhận dạng mảng — chuẩn JWT cho phép cả chuỗi lẫn mảng, và ' +
        'so sánh === trên một mảng thì luôn sai, cái sai đó chặn hết mọi người dùng thật',
    );
  }
}

if (problems.length) {
  console.log('xác thực edge function CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

const exempt = Object.keys(NO_USER_TOKEN);
console.log(
  `xác thực edge function OK — ${fns.length - exempt.length}/${fns.length} function tự kiểm token, ` +
    `và ${exempt.length} miễn trừ có GHI TÊN kèm lý do (${exempt.join(', ')}). Luật này thay cho một ` +
    'cái cổng đã tắt: verify_jwt = false ở cả chín, nên lớp kiểm duy nhất còn lại nằm trong code — ' +
    'một function thứ mười quên requireUser sẽ mở thẳng ra internet mà không lỗi, không cảnh báo. ' +
    'Xác thực đứng TRƯỚC claimCall ở mọi chỗ (đặt sau thì người gọi vô danh tiêu được hạn mức của ' +
    'một tài khoản), không function nào đọc user id từ body, và requireUser kiểm cả sub, role lẫn ' +
    'aud — role nói token TỰ XƯNG là gì, aud nói nó được cấp CHO AI',
);
