/**
 * Rằng năm function AI đọc database qua MỘT chỗ phân giải, không đọc thẳng biến
 * nền tảng.
 *
 * ── vì sao có chuyện này ──
 *
 * Sáu function AI gọi `ai.gateway.lovable.dev`, và khoá của gateway nằm sẵn dưới
 * dạng secret trong project Lovable cũ. Lovable KHÔNG cho xem lại khoá, nên
 * deploy chúng sang project mới là không làm được — sẽ không có gì để đặt vào
 * LOVABLE_API_KEY.
 *
 * Đường còn lại: để chúng ở project cũ, trỏ vào database mới. Ba biến
 * `ASCND_DB_*` làm việc đó, mỗi cái có fallback về biến nền tảng, nên không đặt
 * gì thì mọi thứ chạy y như cũ.
 *
 * ── thứ luật này thật sự canh ──
 *
 * Một function đọc thẳng `Deno.env.get("SUPABASE_URL")` sẽ ĐỌC ĐÚNG project
 * chứa nó — tức project cũ, database cũ, thiếu 12 migration và không nhận thêm
 * dòng nào. Nó không lỗi, không cảnh báo: nó trả lời về cơ thể người dùng bằng
 * số liệu của sáu tháng trước. Đúng loại lỗi repo này tồn tại để chặn.
 *
 * Và cả BA biến phải đi cùng nhau. `requireUser` xác thực token của người gọi
 * bằng chính client đó; token do project mới cấp thì chỉ verify được ở project
 * mới. Dời URL mà giữ khoá cũ là mọi request đều 401.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIR = path.join(ROOT, 'supabase', 'functions');
const read = (f) => readFileSync(path.join(DIR, f), 'utf8');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|\s)\/\/.*$/, '$1')).join('\n');

const problems = [];

/* ── 1. không ai đọc thẳng biến nền tảng ── */
{
  const fns = readdirSync(DIR).filter((d) => d !== '_shared');
  const files = ['_shared/guard.ts', ...fns.map((d) => `${d}/index.ts`)];
  for (const f of files) {
    let code;
    try {
      code = strip(read(f));
    } catch {
      continue;
    }
    /* `delete-account`, `store-webhook` và `verify-purchase` KHÔNG gọi AI, nên
       chúng không có lý do rời khỏi project chứa database. Chúng được miễn — và
       việc miễn có tên, không phải một khoảng lặng. */
    if (/^(delete-account|store-webhook|verify-purchase)\//.test(f)) continue;
    for (const m of code.matchAll(/Deno\.env\.get\("(SUPABASE_(?:URL|ANON_KEY|SERVICE_ROLE_KEY))"\)/g)) {
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(
        `${f}:${line}: đọc thẳng ${m[1]} — nó luôn trỏ về project CHỨA function, tức database cũ. ` +
          'Dùng dbUrl()/dbAnonKey()/dbServiceKey() trong _shared/guard.ts',
      );
    }
  }
}

/* ── 2. ba phép phân giải phải có fallback ── */
{
  const guard = strip(read('_shared/guard.ts'));
  for (const [fn, own, platform] of [
    ['dbUrl', 'ASCND_DB_URL', 'SUPABASE_URL'],
    ['dbAnonKey', 'ASCND_DB_ANON_KEY', 'SUPABASE_ANON_KEY'],
    ['dbServiceKey', 'ASCND_DB_SERVICE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'],
  ]) {
    const m = guard.match(new RegExp(`export const ${fn} = \\(\\) => env\\("([^"]+)",\\s*"([^"]+)"\\)`));
    if (!m) problems.push(`_shared/guard.ts: thiếu ${fn}()`);
    else if (m[1] !== own || m[2] !== platform) {
      problems.push(
        `_shared/guard.ts: ${fn}() phân giải ${m[1]} → ${m[2]}, đáng lẽ ${own} → ${platform} — ` +
          'không có fallback thì một bản deploy bình thường (không đặt secret nào) sẽ hỏng',
      );
    }
  }
}

if (problems.length) {
  console.log('database của edge function CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'database của edge function OK — sáu function AI đọc database qua MỘT chỗ phân giải, không cái ' +
    'nào đọc thẳng biến nền tảng. Điều đó quan trọng vì biến nền tảng luôn trỏ về project CHỨA ' +
    'function: sáu cái này phải ở lại project Lovable cũ (khoá gateway nằm đó và Lovable không cho ' +
    'xem lại), nên đọc thẳng nghĩa là trả lời về cơ thể người dùng bằng database cũ — thiếu 12 ' +
    'migration, không nhận thêm dòng nào, và không một lỗi nào báo ra. Cả ba biến ASCND_DB_* đều có ' +
    'fallback về biến nền tảng, nên không đặt secret nào thì mọi thứ chạy y như cũ; và chúng đi cùng ' +
    'nhau vì requireUser xác thực token bằng chính client đó — dời URL mà giữ khoá cũ là 401 hết. ' +
    'Ba function không gọi AI được miễn có tên: chúng không có lý do rời khỏi project chứa database',
);
