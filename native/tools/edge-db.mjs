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

/* ── 3. nhà cung cấp AI chỉ được biết ở MỘT chỗ ──

   Endpoint, khoá và tên model từng viết cứng trong sáu function. Cái giá không
   phải hôm nay mà là ngày đổi nhà cung cấp — Lovable chỉ là dàn xếp cho giai
   đoạn phát triển, khoá thật sẽ là khoá người dùng tự mua. Sáu bản sao nghĩa là
   sửa sáu file và tin rằng mình không sót cái nào, mà cái sót thì KHÔNG lỗi: nó
   lặng lẽ tiếp tục gọi và tính tiền vào tài khoản cũ. */
{
  const ai = strip(read('_shared/ai.ts'));
  for (const fn of ['aiUrl', 'aiKey', 'aiModel', 'aiVisionModel']) {
    if (!new RegExp(`export const ${fn} = `).test(ai)) {
      problems.push(`_shared/ai.ts: thiếu ${fn}()`);
    }
  }
  /* Mặc định phải là bản đang chạy. Một bản gom lại không được đổi hành vi hôm
     nay để đổi lấy sự tiện lợi ngày mai. */
  if (!/ai\.gateway\.lovable\.dev/.test(ai)) {
    problems.push('_shared/ai.ts: endpoint mặc định không còn là gateway đang dùng — bản gom lại đã đổi hành vi');
  }

  for (const d of readdirSync(DIR)) {
    if (d === '_shared') continue;
    let code;
    try {
      code = strip(read(`${d}/index.ts`));
    } catch {
      continue;
    }
    if (/lovable\.dev/.test(code)) {
      problems.push(`${d}/index.ts: viết cứng endpoint nhà cung cấp — dùng aiUrl() trong _shared/ai.ts`);
    }
    if (/Deno\.env\.get\("LOVABLE_API_KEY"\)/.test(code)) {
      problems.push(`${d}/index.ts: đọc thẳng LOVABLE_API_KEY — dùng aiKey(), thứ nhận cả khoá thay thế`);
    }
    /* Chỉ trong THÂN request gửi đi, và chỉ khi nó là một chuỗi.

       Bản đầu của luật này bắt `model:\s*"` ở bất kỳ đâu, và phá thử cho thấy
       nó lọt: sau khi gom lại, tên model nằm trong một template literal
       (`"model": "${aiModel()}"`), nên dấu nháy sau `model:` vẫn còn và luật
       vẫn thấy đúng thứ nó tìm. Nó đang khớp dấu câu chứ không khớp giá trị. */
    if (/["']?model["']?\s*:\s*["'][a-z0-9][^"'$]*["']/i.test(code)) {
      problems.push(`${d}/index.ts: viết cứng tên model — dùng aiModel() hoặc aiVisionModel()`);
    }
  }
}

/* ── 4. dự phòng nhà cung cấp ──

   Người dùng nói rõ: không phụ thuộc bất kỳ bên nào. Điều đó chỉ có nghĩa nếu
   phép chuyển bên biết KHI NÀO nên chuyển. */
{
  const ai = strip(read('_shared/ai.ts'));
  if (!/export async function callAI/.test(ai)) problems.push('_shared/ai.ts: thiếu callAI()');
  if (!/export function providers/.test(ai)) problems.push('_shared/ai.ts: thiếu danh sách nhà cung cấp');

  /* 402 và 429 là lỗi CỦA BÊN ĐÓ — hết credit, quá tải — nên chúng phải chuyển
     bên. Bỏ chúng ra khỏi danh sách là biến đúng hai tình huống mà dự phòng sinh
     ra để cứu thành hai lần trả lỗi cho người dùng. */
  const fault = ai.match(/const providerFault = [^;]*;/s)?.[0] ?? '';
  for (const code of ['402', '429', '408']) {
    if (!fault.includes(code)) {
      problems.push(`_shared/ai.ts: providerFault không tính ${code} — đó là lỗi CỦA nhà cung cấp, đúng lúc phải chuyển bên`);
    }
  }
  if (!/status >= 500/.test(fault)) problems.push('_shared/ai.ts: providerFault không tính 5xx');

  /* Và 400 thì KHÔNG được chuyển: gửi lại đúng cái yêu cầu sai sang bên thứ hai
     thì nó cũng từ chối, và ta vừa tiêu hai lượt để nhận hai lần cùng một câu. */
  if (/status === 400|status >= 400/.test(fault)) {
    problems.push('_shared/ai.ts: providerFault tính cả 400 — một yêu cầu sai thì bên nào cũng từ chối, chuyển bên chỉ tiêu thêm một lượt');
  }

  /* Không function nào được tự gọi fetch nữa: một chỗ tự gọi là một chỗ không có
     dự phòng, và nó không lỗi — nó chỉ hỏng vào đúng ngày bên kia hỏng. */
  for (const d of readdirSync(DIR)) {
    if (d === '_shared') continue;
    let code;
    try { code = strip(read(`${d}/index.ts`)); } catch { continue; }
    if (!/_shared\/ai\.ts/.test(code)) continue;
    if (/await fetch\(\s*aiUrl\(\)/.test(code) || /Bearer \$\{AI_KEY\}/.test(code)) {
      problems.push(`${d}/index.ts: tự gọi fetch tới nhà cung cấp — bỏ qua lớp dự phòng`);
    }
    if (!/if \(!\w+\) return opaque\(/.test(code)) {
      problems.push(`${d}/index.ts: không xử lý callAI trả null — "không có bên nào" khác với "một bên trả lỗi"`);
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
