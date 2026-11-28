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

/** Các hàm trừ hạn mức AI của `_shared/guard.ts`. Thêm cổng mới thì thêm tên vào đây. */
const QUOTA_GATES = ['claimCall', 'aiGate'];

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
  /* Xác thực phải đứng TRƯỚC mọi việc tốn kém. Đặt sau cổng hạn mức nghĩa là một
     người gọi vô danh tiêu được hạn mức của một tài khoản.

     Cổng hạn mức có hai tên: `claimCall` (bản đầu) và `aiGate` (`_shared/guard.ts`,
     mọi function AI dùng từ khi có trần token). Bản cũ của luật chỉ tìm `claimCall(`,
     nên sau khi các function chuyển sang `aiGate` nó không còn bắt được gì mà vẫn
     xanh (Master Audit 28/11, P1-03 / P3-03). Tìm cổng SỚM NHẤT trong cả hai tên. */
  const iAuth = code.indexOf('requireUser(');
  const gates = QUOTA_GATES.map((g) => [g, code.indexOf(`${g}(`)]).filter(([, i]) => i >= 0);
  const first = gates.sort((a, b) => a[1] - b[1])[0];
  if (first && iAuth > first[1]) {
    problems.push(`${fn}: requireUser đứng SAU ${first[0]} — người gọi vô danh tiêu được hạn mức`);
  }
  /* Và danh tính phải đến từ token, không từ body. Đây là IDOR ở dạng thẳng
     thắn nhất: một `user_id` gửi lên là một người dùng đọc dữ liệu người khác. */
  if (/(body|payload)\s*\??\.\s*(user_id|userId)\b/.test(code)) {
    problems.push(`${fn}: đọc user id từ body — danh tính phải lấy từ token đã xác thực`);
  }
}

/* ── danh sách cổng hạn mức còn khớp guard.ts ──
   Một cổng bị đổi tên mà luật không biết thì luật thứ tự ở trên lại mù như trước. */
{
  const guard = strip(read('_shared/guard.ts'));
  for (const g of QUOTA_GATES) {
    if (!new RegExp(`export async function ${g}\\(`).test(guard)) {
      problems.push(`_shared/guard.ts: không còn \`${g}\` — sửa QUOTA_GATES trong edge-auth.mjs cho khớp`);
    }
  }
}

/* ── config.toml nói gì về từng function ──
   Function không có mục `verify_jwt = false` thì nền tảng tự kiểm JWT: store-webhook
   (Apple gọi, không token) sẽ chết, và câu "verify_jwt tắt ở mọi function" của luật này
   hết đúng. Đếm theo thư mục, không ghi cứng một con số. */
{
  const toml = readFileSync(path.join(ROOT, 'supabase', 'config.toml'), 'utf8');
  for (const fn of fns) {
    const m = toml.match(new RegExp(`\\[functions\\.${fn}\\]([\\s\\S]*?)(?=\\n\\[|$)`));
    if (!m || !/verify_jwt\s*=\s*false/.test(m[1])) {
      problems.push(`${fn}: config.toml không có \`verify_jwt = false\` — thêm mục [functions.${fn}]`);
    }
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
    `cái cổng đã tắt: verify_jwt = false ở cả ${fns.length} (đếm theo thư mục, khớp config.toml), nên ` +
    'lớp kiểm duy nhất còn lại nằm trong code — một function mới quên requireUser sẽ mở thẳng ra ' +
    'internet mà không lỗi, không cảnh báo. ' +
    `Xác thực đứng TRƯỚC cổng hạn mức (${QUOTA_GATES.join(' / ')}) ở mọi chỗ (đặt sau thì người gọi vô danh tiêu được hạn mức của ` +
    'một tài khoản), không function nào đọc user id từ body, và requireUser kiểm cả sub, role lẫn ' +
    'aud — role nói token TỰ XƯNG là gì, aud nói nó được cấp CHO AI',
);
