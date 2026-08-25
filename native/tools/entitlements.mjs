/**
 * What somebody paid for, and nothing else.
 *
 * ── the four bugs this was written for ──
 *
 * The purchase chain was already built the right way round: the client's word
 * is never believed, the server asks Apple over TLS, and `entitlements` has no
 * write policy for any user role. What was wrong was everything *after* the
 * answer arrives.
 *
 * **1. A late notification cancelled a paying customer.** Every renewal mints a
 * new `transactionId`; only `originalTransactionId` names the subscription
 * across its life. Both handlers looked up the transaction the *event* named,
 * and Apple retries notifications for days — so one about last month's period
 * arriving after this month's renewal returned last month's period, expired,
 * and that got written down. Run against the real handlers:
 *
 *     1. webhook DID_RENEW cho kỳ 2        200  max exp=tương lai
 *     4. webhook CŨ của kỳ 1 tới muộn      200  free exp=null      ← đây
 *
 * Nothing re-checks, so the customer stayed downgraded until the next Apple
 * event — up to a month — or until they thought to press restore.
 *
 * **2. A missing environment variable cancelled everyone.** `tierFor` returned
 * `null` both for "not our product" and for "this server has no product ids
 * configured", and `null` was written down as `free`:
 *
 *     PRODUCT_ID_MAX chưa cấu hình  →  200  ghi được: free
 *
 * **3. Two unretryable failures returned 500,** so Apple resent them for days:
 * an `appAccountToken` that is not a uuid, and one naming an account that has
 * since been deleted. Neither answer changes on a retry.
 *
 * **4. A subscription with no `expiresDate` was granted for ever.**
 * `expires_at IS NULL` means *never expires* to `current_tier()`. That is right
 * for a lifetime purchase and catastrophic for a subscription whose expiry did
 * not come back, and nothing distinguished the two.
 *
 * ── how the rules work ──
 *
 * Rules A–F **run the real edge functions**: `store-webhook` and
 * `verify-purchase` are transpiled and driven against a scripted Apple, an
 * `entitlements` table that enforces uuid and foreign-key shape the way
 * Postgres does, and a `guard.ts` fed real claims. Nothing here greps for the
 * name of a fix.
 *
 * Rules G–H read the migration and the client, for the two invariants that are
 * statements about the schema rather than about a request.
 *
 * The cross-account boundary itself was measured separately on PostgreSQL
 * 16.13 and is recorded in the ledger: a second account cannot read, insert,
 * update or delete another's entitlement, and `current_tier()` answers `free`
 * for an expired row, a missing row and a signed-out caller.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ─────────────────────────────────────────────────────────────────────────
   Rules A–F — drive the real handlers
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'entl-'));
try {
  const fns = [
    '../supabase/functions/_shared/apple.ts',
    '../supabase/functions/_shared/guard.ts',
    '../supabase/functions/store-webhook/index.ts',
    '../supabase/functions/verify-purchase/index.ts',
  ];
  try {
    execFileSync(
      'npx',
      ['tsc', ...fns, '--ignoreConfig', '--outDir', out, '--module', 'commonjs',
        '--target', 'es2022', '--skipLibCheck', '--lib', 'es2022,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* These are Deno files: `Deno` is undeclared here and the imports are URLs
       and `.ts` paths. tsc says so and emits anyway; the requires are rewritten
       below and `Deno` is supplied by the driver. */
  }

  for (const rel of ['_shared/apple.js', '_shared/guard.js', 'store-webhook/index.js', 'verify-purchase/index.js']) {
    const p = path.join(out, rel);
    writeFileSync(
      p,
      readFileSync(p, 'utf8')
        .replace(/require\("https:\/\/deno\.land\/[^"]+"\)/g, 'require("../shim-serve.cjs")')
        .replace(/require\("https:\/\/esm\.sh\/[^"]+"\)/g, 'require("../shim-supabase.cjs")')
        .replace(/require\("(\.[^"]*?)\.ts"\)/g, 'require("$1.js")'),
    );
  }

  writeFileSync(
    path.join(out, 'shim-serve.cjs'),
    `let h = null; module.exports = { serve: (fn) => { h = fn; }, _take: () => h };`,
  );
  /* An `entitlements` table that refuses what Postgres refuses: a `user_id`
     that is not a uuid (22P02) and one naming no auth user (23503). */
  writeFileSync(
    path.join(out, 'shim-supabase.cjs'),
    `const rows = new Map();
     const users = new Set(['aaaaaaaa-1111-1111-1111-111111111111', 'bbbbbbbb-2222-2222-2222-222222222222']);
     const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
     const table = () => ({ upsert: async (v) => {
       if (!isUuid(v.user_id)) return { error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
       if (!users.has(String(v.user_id).toLowerCase())) return { error: { code: '23503', message: 'foreign key' } };
       rows.set(v.user_id, { ...v }); return { error: null };
     } });
     const M = {
       createClient: () => ({ from: table, auth: { getClaims: async () => ({ data: { claims: M._claims } }) } }),
       _rows: rows,
       _claims: { sub: 'aaaaaaaa-1111-1111-1111-111111111111', role: 'authenticated', aud: 'authenticated' },
       _setClaims: (c) => { M._claims = c; },
     };
     module.exports = M;`,
  );

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const A = 'aaaaaaaa-1111-1111-1111-111111111111';
     const B = 'bbbbbbbb-2222-2222-2222-222222222222';
     const P8 = require('crypto').generateKeyPairSync('ec', { namedCurve: 'P-256' })
       .privateKey.export({ type: 'pkcs8', format: 'pem' });
     let ENV = { SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon',
       APPLE_KEY_ID: 'K', APPLE_ISSUER_ID: 'I', APPLE_BUNDLE_ID: 'com.test', APPLE_PRIVATE_KEY: P8,
       PRODUCT_ID_PLUS: 'com.test.plus', PRODUCT_ID_MAX: 'com.test.max' };
     globalThis.Deno = { env: { get: (k) => ENV[k] } };

     const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
     const jws = (o) => b64u({ alg: 'ES256' }) + '.' + b64u(o) + '.sig';

     /** what Apple returns for one transaction id */
     const TX = new Map();
     /** what Apple says is CURRENT for a subscription (originalTransactionId) */
     const LATEST = new Map();
     globalThis.fetch = async (url) => {
       const u = String(url);
       const id = decodeURIComponent(u.split('/').pop());
       const nf = { status: 404, ok: false, json: async () => ({}), text: async () => 'nf' };
       if (u.includes('/inApps/v1/subscriptions/')) {
         const cur = LATEST.get(id);
         if (!cur) return nf;
         return { status: 200, ok: true, json: async () => ({ data: [{ lastTransactions: [
           { originalTransactionId: id, status: 1, signedTransactionInfo: jws(cur) }] }] }) };
       }
       const tx = TX.get(id);
       if (!tx) return nf;
       return { status: 200, ok: true, json: async () => ({ signedTransactionInfo: jws(tx) }) };
     };

     const serve = require('./shim-serve.cjs');
     const sb = require('./shim-supabase.cjs');
     const load = (r) => { delete require.cache[require.resolve(r)]; require(r); return serve._take(); };
     const post = (h, body, hd) => h({ method: 'POST', headers: { get: (x) => (hd || {})[x.toLowerCase()] ?? null }, json: async () => body });
     const notify = (t, tx) => ({ signedPayload: jws({ notificationType: t, data: { signedTransactionInfo: jws(tx) } }) });
     const tierOf = (id) => { const r = sb._rows.get(id); return r ? r.tier : null; };
     const foreverOf = (id) => { const r = sb._rows.get(id); return !!r && r.expires_at == null; };

     const DAY = 86400000, now = Date.now();
     const p1 = { transactionId: 'tx-1', originalTransactionId: 'orig-1', productId: 'com.test.max',
                  appAccountToken: A, expiresDate: now - 2 * DAY, type: 'Auto-Renewable Subscription' };
     const p2 = { transactionId: 'tx-2', originalTransactionId: 'orig-1', productId: 'com.test.max',
                  appAccountToken: A, expiresDate: now + 28 * DAY, type: 'Auto-Renewable Subscription' };

     (async () => {
       const o = {};
       TX.set('tx-1', p1); TX.set('tx-2', p2); LATEST.set('orig-1', p2);
       let webhook = load('./store-webhook/index.js');
       let verify = load('./verify-purchase/index.js');

       await post(webhook, notify('DID_RENEW', p2));
       o.afterRenewal = tierOf(A);
       await post(webhook, notify('DID_RENEW', p2));
       await post(webhook, notify('DID_RENEW', p2));
       o.afterDuplicates = tierOf(A);
       await post(webhook, notify('DID_RENEW', p1));
       o.afterLateOldPeriod = tierOf(A);
       await post(webhook, notify('EXPIRED', p1));
       o.afterLateExpired = tierOf(A);

       sb._setClaims({ sub: A, role: 'authenticated', aud: 'authenticated' });
       const v1 = await post(verify, { transactionId: 'tx-1' }, { authorization: 'Bearer t' });
       o.afterVerifyWithOldTxn = tierOf(A);
       o.verifyOldStatus = v1.status;

       /* the subscription really has lapsed: Apple now says period 1 is current */
       LATEST.set('orig-1', p1);
       await post(webhook, notify('EXPIRED', p1));
       o.afterRealExpiry = tierOf(A);
       LATEST.set('orig-1', p2);
       await post(webhook, notify('DID_RENEW', p2));

       /* refunded */
       const refunded = { ...p2, revocationDate: now - DAY };
       TX.set('tx-2', refunded); LATEST.set('orig-1', refunded);
       await post(webhook, notify('REFUND', refunded));
       o.afterRefund = tierOf(A);
       TX.set('tx-2', p2); LATEST.set('orig-1', p2);
       await post(webhook, notify('DID_RENEW', p2));

       /* cross-account: B sends A's transaction */
       sb._setClaims({ sub: B, role: 'authenticated', aud: 'authenticated' });
       const r = await post(verify, { transactionId: 'tx-2' }, { authorization: 'Bearer t' });
       o.crossAccountStatus = r.status;
       o.crossAccountGranted = tierOf(B);
       sb._setClaims({ sub: A, role: 'authenticated', aud: 'authenticated' });

       /* an anon key: a signed project token with no subject */
       sb._setClaims({ role: 'anon' });
       o.anonStatus = (await post(verify, { transactionId: 'tx-2' }, { authorization: 'Bearer anon' })).status;
       o.noAuthStatus = (await post(verify, { transactionId: 'tx-2' })).status;
       sb._setClaims({ sub: A, role: 'authenticated', aud: 'authenticated' });

       /* an appAccountToken that cannot name a row, and one naming nobody */
       const bad = { ...p2, transactionId: 'tx-b', originalTransactionId: 'orig-b', appAccountToken: 'not-a-uuid' };
       TX.set('tx-b', bad); LATEST.set('orig-b', bad);
       o.badTokenStatus = (await post(webhook, notify('DID_RENEW', bad))).status;
       const gone = { ...p2, transactionId: 'tx-c', originalTransactionId: 'orig-c',
                      appAccountToken: 'cccccccc-3333-3333-3333-333333333333' };
       TX.set('tx-c', gone); LATEST.set('orig-c', gone);
       o.deletedAccountStatus = (await post(webhook, notify('DID_RENEW', gone))).status;

       /* the server has no product ids */
       ENV = { ...ENV, PRODUCT_ID_PLUS: undefined, PRODUCT_ID_MAX: undefined };
       o.unconfiguredStatus = (await post(webhook, notify('DID_RENEW', p2))).status;
       o.tierAfterUnconfigured = tierOf(A);
       ENV = { ...ENV, PRODUCT_ID_PLUS: 'com.test.plus', PRODUCT_ID_MAX: 'com.test.max' };

       /* a subscription with no expiry, and a genuine lifetime purchase */
       const noExp = { transactionId: 'tx-e', originalTransactionId: 'orig-e', productId: 'com.test.max',
                       appAccountToken: A, type: 'Auto-Renewable Subscription' };
       TX.set('tx-e', noExp); LATEST.set('orig-e', noExp);
       await post(webhook, notify('DID_RENEW', noExp));
       o.subWithoutExpiry = tierOf(A);
       const lifetime = { ...noExp, transactionId: 'tx-f', originalTransactionId: 'orig-f', type: 'Non-Consumable' };
       TX.set('tx-f', lifetime); LATEST.set('orig-f', lifetime);
       await post(webhook, notify('DID_RENEW', lifetime));
       o.lifetimeForever = foreverOf(A) && tierOf(A) === 'max';

       console.log(JSON.stringify(o));
     })();`,
  );

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());

  const want = (ok, message) => {
    if (!ok) problems.push(message);
  };

  want(r.afterRenewal === 'max', `một webhook gia hạn hợp lệ không cấp quyền (nhận '${r.afterRenewal}')`);
  want(
    r.afterDuplicates === 'max',
    `cùng một webhook gửi ba lần làm đổi trạng thái (thành '${r.afterDuplicates}') — Apple gửi lại là chuyện thường, phải bất biến`,
  );
  want(
    r.afterLateOldPeriod === 'max' && r.afterLateExpired === 'max',
    `một webhook CŨ của kỳ trước tới muộn hạ người đang trả tiền xuống '${r.afterLateOldPeriod}'/'${r.afterLateExpired}' — ` +
      'mỗi lần gia hạn sinh transactionId MỚI, chỉ originalTransactionId mới gọi tên cả vòng đời gói; ' +
      'Apple thử lại nhiều ngày nên thông báo tháng trước tới sau lần gia hạn tháng này là chuyện bình thường, ' +
      'và không có gì kiểm lại sau đó',
  );
  want(
    r.afterVerifyWithOldTxn === 'max',
    `verify-purchase với một transactionId CŨ hạ chính người gọi xuống '${r.afterVerifyWithOldTxn}' — ` +
      'khôi phục mua hàng trả về cả lịch sử, nên client hoàn toàn có thể gửi id của kỳ đã qua',
  );
  want(r.afterRealExpiry === 'free', `gói đã hết hạn thật vẫn giữ '${r.afterRealExpiry}' — hạ cấp phải còn hoạt động`);
  want(r.afterRefund === 'free', `gói đã hoàn tiền vẫn giữ '${r.afterRefund}'`);
  want(
    r.crossAccountStatus === 403 && !r.crossAccountGranted,
    `B gửi transaction của A: HTTP ${r.crossAccountStatus}, B nhận '${r.crossAccountGranted}' — ` +
      'transaction id không phải bí mật, appAccountToken mới là thứ nói nó của ai',
  );
  want(
    r.anonStatus === 401 && r.noAuthStatus === 401,
    `khoá anon/không token vẫn qua được cổng (${r.anonStatus}/${r.noAuthStatus})`,
  );
  want(
    r.badTokenStatus === 200 && r.deletedAccountStatus === 200,
    `appAccountToken sai dạng trả ${r.badTokenStatus} và tài khoản đã xoá trả ${r.deletedAccountStatus} — ` +
      'Apple thử lại nhiều ngày với mọi mã không phải 2xx, mà không lần nào đổi được câu trả lời',
  );
  want(
    r.unconfiguredStatus === 500 && r.tierAfterUnconfigured === 'max',
    `server thiếu PRODUCT_ID_*: trả ${r.unconfiguredStatus} và ghi '${r.tierAfterUnconfigured}' — ` +
      '"không phải sản phẩm của mình" và "không biết sản phẩm của mình là gì" bị lẫn làm một, ' +
      'nên một biến môi trường bị đổi tên sẽ huỷ gói của MỌI người đang trả tiền ở lần thông báo gia hạn kế tiếp',
  );
  want(
    r.subWithoutExpiry === 'free',
    `gói thuê bao không có expiresDate được cấp '${r.subWithoutExpiry}' — ` +
      'expires_at NULL nghĩa là VĨNH VIỄN với current_tier(), nên một hồi đáp thiếu trường là một tài khoản max trọn đời',
  );
  want(
    r.lifetimeForever,
    'mua đứt trọn đời (Non-Consumable, không expiresDate) không còn được cấp vĩnh viễn — ' +
      'phép phân biệt đã đi quá tay và giờ chặn cả thứ đáng lẽ không hết hạn',
  );
} catch (e) {
  problems.push(`không dựng được phép thử quyền lợi: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule G — the table and the function, read from the migrations
   ───────────────────────────────────────────────────────────────────────── */
{
  const sql = strip(
    execFileSync('sh', ['-c', `cat ${path.join(ROOT, 'supabase/migrations')}/*.sql`], { encoding: 'utf8' }),
  );

  const at = sql.indexOf('CREATE TABLE IF NOT EXISTS public.entitlements');
  const ddl = at < 0 ? '' : sql.slice(at, sql.indexOf('current_tier', at));
  if (!ddl) {
    problems.push('không tìm thấy bảng entitlements trong migrations — luật này đã lạc mục tiêu');
  } else {
    if (!/ENABLE ROW LEVEL SECURITY/i.test(ddl)) {
      problems.push('entitlements không bật RLS');
    }
    /* One SELECT policy, and nothing that lets a client write its own tier. */
    for (const m of ddl.matchAll(/CREATE POLICY\s+"([^"]+)"\s+ON\s+public\.entitlements\s+FOR\s+(\w+)/gi)) {
      if (!/select/i.test(m[2])) {
        problems.push(
          `entitlements có policy ${m[2].toUpperCase()} "${m[1]}" — ` +
            'một client ghi được bảng này là một client tự cấp gói trả phí cho mình',
        );
      }
    }
    if (!/FOR SELECT USING \(auth\.uid\(\) = user_id\)/i.test(ddl)) {
      problems.push('entitlements không giới hạn SELECT theo auth.uid() — quyền lợi của người này đọc được bởi người khác');
    }
  }

  const ct = sql.slice(sql.indexOf('FUNCTION public.current_tier'));
  const body = ct.slice(0, ct.indexOf('$$;') + 3);
  if (!body) {
    problems.push('không tìm thấy current_tier() — luật này đã lạc mục tiêu');
  } else {
    if (!/expires_at IS NULL OR expires_at > now\(\)/i.test(body)) {
      problems.push(
        'current_tier() không kiểm expires_at — một gói đã hết hạn vẫn trả về bậc trả phí ' +
          'cho tới khi có webhook nào đó ghi đè, mà webhook thì có thể không bao giờ tới',
      );
    }
    if (!/auth\.uid\(\)/.test(body)) {
      problems.push('current_tier() không đọc auth.uid() — bậc phải thuộc về người gọi, không phải tham số');
    }
    if (/\bp_user_id\b|\buser_id uuid\b/i.test(body.split('AS $$')[0])) {
      problems.push('current_tier() nhận id người dùng làm tham số — bất kỳ ai cũng hỏi được bậc của người khác');
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule H — the client reads the tier, it never decides it
   ───────────────────────────────────────────────────────────────────────── */
{
  const hook = strip(readFileSync(path.join(NATIVE, 'src/hooks/use-entitlement.ts'), 'utf8'));
  if (!/from\('entitlements'\)/.test(hook)) {
    problems.push('use-entitlement không đọc bảng entitlements — nguồn sự thật đã đi chỗ khác');
  }
  if (!/expiresAt.*getTime\(\) <= Date\.now\(\)|new Date\(expiresAt\)/.test(hook)) {
    problems.push(
      'use-entitlement không tự kiểm hạn — webhook hạ cấp có thể tới muộn, và tới lúc đó ' +
        'màn hình vẫn mở khoá tính năng trả phí',
    );
  }
  if (!/tier: 'free'/.test(hook) || !/RANK\[tier\] >= RANK\[needed\]/.test(hook)) {
    problems.push('use-entitlement không còn rơi về free hoặc không còn so bậc theo thứ hạng');
  }
  /* And nothing anywhere may hand itself a tier from local state. */
  const files = execFileSync('git', ['ls-files', 'src'], { cwd: NATIVE, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && f !== 'src/hooks/use-entitlement.ts');
  for (const f of files) {
    let code;
    try {
      code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
    } catch {
      continue;
    }
    if (/AsyncStorage\.[gs]etItem\(\s*['"][^'"]*(tier|premium|entitle|subscri)/i.test(code)) {
      problems.push(
        `${f}: cất bậc trả phí vào AsyncStorage — trạng thái trên máy không bao giờ được là thứ mở khoá tính năng`,
      );
    }
  }
}

if (problems.length) {
  console.log('quyền lợi trả phí còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'quyền lợi trả phí OK — CHẠY THẬT hai edge function store-webhook và verify-purchase với một Apple giả lập: ' +
    'gia hạn cấp đúng bậc, cùng một webhook gửi ba lần không đổi gì, hết hạn thật và hoàn tiền đều hạ được cấp; ' +
    'một webhook CŨ của kỳ trước tới muộn KHÔNG còn hạ người đang trả tiền xuống free (bản đã ship thì có — ' +
    'mỗi lần gia hạn sinh transactionId mới, và Apple thử lại nhiều ngày), và verify-purchase với id kỳ cũ ' +
    'cũng vậy; B gửi transaction của A nhận 403 và không được gì; khoá anon và không token đều 401; ' +
    'appAccountToken sai dạng hoặc trỏ vào tài khoản đã xoá trả 200 thay vì bắt Apple thử lại nhiều ngày ' +
    'một câu hỏi không bao giờ đổi câu trả lời; server thiếu PRODUCT_ID_* thì TỪ CHỐI GHI và trả 500 ' +
    '(bản đã ship ghi free — một biến môi trường đổi tên là huỷ gói của mọi người đang trả tiền); ' +
    'gói thuê bao thiếu expiresDate không còn thành max trọn đời, còn mua đứt trọn đời thì vẫn trọn đời. ' +
    'Cộng với schema: entitlements bật RLS, chỉ có policy SELECT theo auth.uid(), không policy ghi nào; ' +
    'current_tier() đọc auth.uid() và kiểm expires_at; và client chỉ ĐỌC bậc, tự kiểm hạn, rơi về free',
);
