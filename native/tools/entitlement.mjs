/**
 * That paying is the only way to become a paying customer.
 *
 * ── why this is the most dangerous file in the project ──
 *
 * Every failure mode here turns a paid app into a free one, and not one of them
 * shows up as a bug. The screens work. The purchase completes. The tier says
 * "max". Nobody files a report, because from the user's side nothing is wrong —
 * the only symptom is revenue that never arrives, and by the time that is
 * noticeable the hole has been open for months.
 *
 * ── the four ways in ──
 *
 * 1. **Trusting the client's receipt.** StoreKit on the device will happily
 *    report a purchase, and the device is exactly where somebody wanting a free
 *    subscription would interfere. The tier must be read from a table only the
 *    server writes.
 *
 * 2. **Verifying the transaction but not the buyer.** A transaction id is not a
 *    secret — it is in receipts, support threads, anyone's purchase history. If
 *    the server confirms with Apple that a transaction exists and stops there,
 *    one leaked id subscribes everybody who pastes it. `appAccountToken` is the
 *    only thing tying a purchase to a person, and comparing it to the
 *    authenticated user is the entire security of this flow.
 *
 * 3. **Believing the webhook.** `store-webhook` is a public unauthenticated URL
 *    because Apple's servers hold no user token. If it acts on the body it was
 *    sent, a forged POST grants whatever it claims.
 *
 * 4. **Checking expiry before revocation.** A refunded subscription can still
 *    carry a future `expiresDate`; Apple records the refund without rewriting
 *    when the period would have ended. Read expiry first and a refunded
 *    customer keeps the product they were paid back for.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const read = (p) => readFileSync(path.join(REPO, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
/*
  Comments *and* imports gone.

  A sabotage that replaced the `fetchTransaction(...)` call with the unverified
  hint passed the first version of this file, because the identifier was still
  sitting in the import statement at the top. That is the second time an unused
  import has satisfied a rule in this project — `tools/motion.mjs` carries the
  first — so here the imports are removed before anything is looked for, and
  every rule below asks about a *call* rather than a mention.
*/
const body = (s) => strip(s).replace(/^import[\s\S]*?from\s+["'][^"']+["'];$/gm, '');

const APPLE = 'supabase/functions/_shared/apple.ts';
const VERIFY = 'supabase/functions/verify-purchase/index.ts';
const HOOK = 'supabase/functions/store-webhook/index.ts';
const CLIENT = 'native/src/hooks/use-entitlement.ts';

const problems = [];

const sql = readdirSync(path.join(REPO, 'supabase', 'migrations'))
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(path.join(REPO, 'supabase', 'migrations', f), 'utf8'))
  .join('\n');

// ── 1: the table is server-owned ──
{
  const policies = [...sql.matchAll(/CREATE POLICY "([^"]+)"\s+ON public\.entitlements([\s\S]*?);/g)];
  for (const op of ['INSERT', 'UPDATE', 'DELETE']) {
    if (policies.some((m) => new RegExp(`\\bFOR (${op}|ALL)\\b`).test(m[2]))) {
      problems.push(`entitlements: có policy ${op} cho client — một lệnh REST là tự nâng cấp lên max`);
    }
  }
  if (!policies.some((m) => /\bFOR SELECT\b/.test(m[2]))) {
    problems.push('entitlements: không đọc được — app sẽ không biết ai đã trả tiền');
  }
}

// ── 2: the buyer is checked, not just the purchase ──
{
  const code = body(read(VERIFY));
  if (!/appAccountToken/.test(code)) {
    problems.push(
      `${VERIFY}: không kiểm appAccountToken — ` +
        'xác nhận giao dịch có thật mà không xác nhận nó của ai, thì một mã giao dịch rò rỉ là gói cho cả thiên hạ',
    );
  }
  if (!/!==\s*userId\.toLowerCase\(\)/.test(code)) {
    problems.push(`${VERIFY}: token của giao dịch không được so với người gọi đã xác thực`);
  }
  /* No token at all must be a refusal, not a pass. */
  if (!/if \(!token \|\|/.test(code)) {
    problems.push(
      `${VERIFY}: giao dịch không có appAccountToken phải bị từ chối — ` +
        'không có cách nào biết nó của ai, và "không biết" không phải là "của bạn"',
    );
  }
  if (!/fetchTransaction\(/.test(code)) {
    problems.push(`${VERIFY}: không hỏi Apple — chỉ tin những gì client gửi lên`);
  }
  if (!/SUPABASE_SERVICE_ROLE_KEY/.test(code)) {
    problems.push(`${VERIFY}: không ghi bằng service role — bảng không có policy ghi nên sẽ hỏng khi chạy thật`);
  }
}

// ── 3: the webhook is a signal, never a source ──
{
  const code = body(read(HOOK));
  if (!/fetchTransaction\(/.test(code)) {
    problems.push(
      `${HOOK}: không hỏi lại Apple — endpoint này công khai và không xác thực, ` +
        'tin vào thân request là ai POST cũng tự cấp gói được',
    );
  }
  if (!/appAccountToken/.test(code)) {
    problems.push(`${HOOK}: không lấy chủ sở hữu từ appAccountToken của Apple`);
  }
  /* The decode helper is named "unverified" so a reader cannot mistake it for a
     signature check. If that name disappears, the reason it is safe disappears
     with it. */
  const apple = read(APPLE);
  if (!/export function decodeJwsPayloadUnverified/.test(apple) || !/decodeJwsPayloadUnverified\s*[<(]/.test(code)) {
    problems.push(
      `${APPLE}: hàm giải mã JWS phải mang tên "Unverified" — ` +
        'nếu không, người đọc sau sẽ tưởng chữ ký đã được kiểm và bắt đầu tin vào nó',
    );
  }
}

// ── 4: revocation before expiry, and the tier mapping is server-side ──
{
  const code = body(read(APPLE));
  /* Scoped to the function that decides, because `revocationDate` also appears
     in the interface above it — and an `indexOf` over the whole file therefore
     always found the declaration first and never compared anything. */
  /* To the next top-level `export`, not to the first `\n}` — this function's
     return type is a multi-line object, so its signature closes a brace before
     the body has begun and a non-greedy match captured the signature alone. */
  const fn = code.match(/export function entitlementFrom[\s\S]*?(?=\nexport |$)/)?.[0] ?? '';
  const revoke = fn.indexOf('revocationDate');
  const expires = fn.indexOf('expiresDate && ');
  if (!fn) {
    problems.push(`${APPLE}: không tìm thấy entitlementFrom — luật này cần sửa lại chứ không phải bỏ đi`);
  }
  if (fn && revoke < 0) {
    problems.push(`${APPLE}: không kiểm revocationDate — người đã được hoàn tiền vẫn giữ gói`);
  } else if (expires >= 0 && revoke > expires) {
    problems.push(
      `${APPLE}: kiểm hạn dùng trước khi kiểm hoàn tiền — ` +
        'một gói đã hoàn tiền vẫn có expiresDate ở tương lai, nên thứ tự này giữ nguyên quyền lợi cho họ',
    );
  }
  if (!/Deno\.env\.get\("PRODUCT_ID_/.test(code)) {
    problems.push(`${APPLE}: ánh xạ product → tier không nằm ở server`);
  }
  if (/verifyReceipt/.test(code)) {
    problems.push(`${APPLE}: còn dùng verifyReceipt — Apple đã đánh dấu deprecated, dùng App Store Server API`);
  }
}

// ── 5: the client fails to free, and gates by rank ──
{
  const code = strip(read(CLIENT));
  if (!/RANK\[tier\] >= RANK\[needed\]/.test(code)) {
    problems.push(
      `${CLIENT}: cổng tính năng không so theo bậc — so bằng nhau thì người mua max sẽ trượt cổng plus`,
    );
  }
  if (!/q\.data\?\.tier \?\? 'free'/.test(code)) {
    problems.push(`${CLIENT}: lỗi hoặc chưa tải xong không rơi về 'free' — sai hướng này là app trả phí thành miễn phí`);
  }
  if (!/new Date\(expiresAt\)\.getTime\(\) <= Date\.now\(\)/.test(code)) {
    problems.push(`${CLIENT}: không tự kiểm hạn dùng — webhook đến muộn thì gói đã hết vẫn còn hiệu lực trên máy`);
  }
  /* Nothing in the app may read a tier from the device's own store state. */
  for (const f of readdirSync(path.join(NATIVE, 'src', 'hooks'))) {
    if (!f.endsWith('.ts') && !f.endsWith('.tsx')) continue;
    const h = strip(readFileSync(path.join(NATIVE, 'src', 'hooks', f), 'utf8'));
    if (/getCustomerInfo|purchaserInfo|getAvailablePurchases|isSubscribed\s*=/.test(h)) {
      problems.push(`native/src/hooks/${f}: đọc trạng thái mua từ thiết bị — đó là nơi người ta sửa để khỏi trả tiền`);
    }
  }
}

/**
 * The self-test.
 *
 * The buyer check is the one worth proving. The wrong version is not sloppy
 * code — it is a perfectly reasonable-looking function that asks Apple, gets a
 * real answer, and grants the subscription to the wrong person.
 */
const SELF = [
  ['xác minh giao dịch mà không xác minh người mua — bị bắt', () => {
    const bad = 'const tx = await fetchTransaction(id);\nif (!tx) return json({}, 404);\nawait grant(userId);';
    return !/appAccountToken/.test(bad);
  }],
  ['có so token — không bị bắt', () => {
    const good = 'if (!token || token !== userId.toLowerCase()) return json({}, 403);';
    return /appAccountToken|!==\s*userId\.toLowerCase\(\)/.test(good);
  }],
  ['cổng so bằng nhau — bị bắt', () => {
    const bad = 'has: (needed) => tier === needed';
    return !/RANK\[tier\] >= RANK\[needed\]/.test(bad);
  }],
  ['thứ tự hoàn tiền/hạn dùng', () => {
    const bad = 'if (tx.expiresDate && tx.expiresDate <= Date.now()) return null;\nif (tx.revocationDate) return null;';
    return bad.indexOf('revocationDate') > bad.indexOf('expiresDate && ');
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('luồng quyền lợi sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'luồng quyền lợi OK — entitlements chỉ đọc được từ client; verify-purchase hỏi Apple rồi so appAccountToken với người gọi; ' +
    'webhook công khai nhưng không tin thân request, luôn hỏi lại Apple; hoàn tiền được kiểm trước hạn dùng; ' +
    "client rơi về 'free' khi lỗi và so cổng theo bậc",
);
