/**
 * The one door with no lock on it.
 *
 * `store-webhook` is the only handler in this project that anybody on the
 * internet can reach with no token at all — Apple's servers call it and they
 * hold none. So the invariant it has to keep is absolute:
 *
 *     an unauthenticated POST must never create, extend, downgrade or delete
 *     an entitlement on the strength of anything in its own body.
 *
 * It keeps that invariant, and this file proves it by driving the real handler
 * rather than by reading its header: a forged notification claiming another
 * account and a lifetime product produces a row containing Apple's answer, for
 * Apple's account, and nothing the body asked for. Rule B additionally proves
 * the ordering — no write is attempted before the Apple lookup returns.
 *
 * ── the six things that were wrong anyway ──
 *
 * **1. A free sandbox purchase bought a real subscription.** The transaction
 * lookup asked production and then, unconditionally, sandbox. A sandbox
 * transaction costs nothing and its buyer chooses `appAccountToken`, so it can
 * name any account. Measured against both real handlers:
 *
 *     webhook, sandbox-only transaction         200  {"tier":"max"}
 *     verify-purchase, sandbox-only transaction 200  {"tier":"max"}
 *     → row: max, hết hạn sau 365 ngày, chưa trả một đồng
 *
 * **2. Apple being down was recorded as "no such purchase".** A 500, a 429 or
 * a 503 came back as `null`, the same value a 404 produces, and the webhook
 * answered `200 {"ignored":"not found"}` — the code that tells Apple the
 * notification arrived, so it is never resent.
 *
 * **3. The same conflation downgraded paying customers.** With the subscription
 * lookup failing, `resolveEntitlementTransaction` fell back to the transaction
 * the *event* named — which is exactly the stale-period bug that lookup was
 * added to prevent. Against a subscription Apple says is active:
 *
 *     thông báo CŨ kỳ 1 tới muộn, Apple khoẻ      200  max/còn hạn
 *     thông báo CŨ kỳ 1 tới muộn, /subs trả 500   200  free/null   ← đây
 *
 * **4. The row and its contents came from different transactions.** The user
 * was taken from the transaction the notification named, the tier from the
 * subscription's current period. `appAccountToken` is per purchase, so those
 * two are not always the same person — and one person's subscription was
 * written onto another person's account.
 *
 * **5. Nothing bounded what this endpoint would read.** An 8 MiB `signedPayload`
 * was decoded and parsed in full, and any string at all was then spent on an
 * authenticated call against this app's App Store API rate limit.
 *
 * **6. Exception text was returned to the caller.** `Apple credentials not
 * configured` — the reply when the private key is missing — told a stranger the
 * state of this project's App Store setup for the price of one POST.
 *
 * ── how these rules work ──
 *
 * All of them **run the real edge functions**. `store-webhook`, `verify-purchase`
 * and `_shared/apple.ts` are transpiled and driven against a scripted Apple with
 * two separate environments and per-endpoint failure injection, and against an
 * `entitlements` table that refuses what Postgres refuses and records every
 * write attempt in order. Nothing here greps for the name of a fix.
 *
 * The database side — that no user token can insert, update or delete this
 * table, that `current_tier()` answers `free` for an expired row and for anon,
 * and that the tier CHECK holds — was measured separately on PostgreSQL 16.13
 * and is recorded in the ledger; `tools/entitlements.mjs` keeps the schema
 * rules that go with it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'stwh-'));
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
    /* Deno files: `Deno` is undeclared here and the imports are URLs and `.ts`
       paths. tsc says so and emits anyway; the requires are rewritten below and
       `Deno` is supplied by the driver. */
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

  /* An `entitlements` table that refuses what Postgres refuses, and that logs
     every write attempt with how many Apple calls had completed before it —
     which is what makes the ordering rule a measurement rather than a reading. */
  writeFileSync(
    path.join(out, 'shim-supabase.cjs'),
    `const rows = new Map();
     const log = [];
     const users = new Set(['aaaaaaaa-1111-1111-1111-111111111111', 'bbbbbbbb-2222-2222-2222-222222222222']);
     const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
     const table = (name) => ({ upsert: async (v) => {
       log.push({ at: M._clock(), table: name, value: { ...v } });
       if (!isUuid(v.user_id)) return { error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
       if (!users.has(String(v.user_id).toLowerCase())) return { error: { code: '23503', message: 'foreign key' } };
       rows.set(String(v.user_id).toLowerCase(), { ...v }); return { error: null };
     } });
     const M = {
       createClient: () => ({ from: table, auth: { getClaims: async () => ({ data: { claims: M._claims } }) } }),
       _rows: rows, _writes: log, _clock: () => 0,
       _reset: () => { rows.clear(); log.length = 0; },
       _claims: { sub: 'aaaaaaaa-1111-1111-1111-111111111111', role: 'authenticated', aud: 'authenticated' },
       _setClaims: (c) => { M._claims = c; },
     };
     module.exports = M;`,
  );

  /* A scripted Apple with two worlds. Which host answered is the whole point of
     rule C, so the mock keys everything on it, and `fail` lets one endpoint in
     one environment return a status without the others changing. */
  writeFileSync(
    path.join(out, 'apple.cjs'),
    `const PROD = 'https://api.storekit.itunes.apple.com';
     const SBOX = 'https://api.storekit-sandbox.itunes.apple.com';
     const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
     const jws = (o) => b64u({ alg: 'ES256', x5c: ['forged'] }) + '.' + b64u(o) + '.' + b64u({ s: 1 });
     const A = {
       tx: { production: new Map(), sandbox: new Map() },
       latest: { production: new Map(), sandbox: new Map() },
       fail: {}, calls: [], tick: 0, b64u, jws,
       reset() {
         A.tx = { production: new Map(), sandbox: new Map() };
         A.latest = { production: new Map(), sandbox: new Map() };
         A.fail = {}; A.calls = []; A.tick = 0;
       },
       notify(type, tx, extra = {}) {
         return { signedPayload: jws({
           notificationType: type, subtype: extra.subtype, notificationUUID: 'uuid-' + type,
           data: { bundleId: extra.bundleId ?? 'com.test', environment: extra.environment ?? 'Production',
                   signedTransactionInfo: tx === null ? undefined : jws(tx) } }) };
       },
       install() {
         globalThis.fetch = async (url, init) => {
           const u = String(url);
           const env = u.startsWith(SBOX) ? 'sandbox' : 'production';
           const kind = u.includes('/inApps/v1/subscriptions/') ? 'subscriptions' : 'transactions';
           const id = decodeURIComponent(u.split('/').pop());
           A.calls.push({ n: ++A.tick, env, kind, id });
           const code = A.fail[env + ':' + kind];
           if (code) return { status: code, ok: false, json: async () => ({}), text: async () => 'injected' };
           const nf = { status: 404, ok: false, json: async () => ({}), text: async () => 'not found' };
           if (kind === 'subscriptions') {
             const cur = A.latest[env].get(id);
             if (!cur) return nf;
             return { status: 200, ok: true, json: async () => ({ data: [{ lastTransactions: [
               { originalTransactionId: id, status: cur.status ?? 1, signedTransactionInfo: jws(cur.tx) }] }] }) };
           }
           const tx = A.tx[env].get(id);
           if (!tx) return nf;
           return { status: 200, ok: true, json: async () => ({ signedTransactionInfo: jws(tx) }) };
         };
       },
     };
     module.exports = A;`,
  );

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const A = 'aaaaaaaa-1111-1111-1111-111111111111';
     const B = 'bbbbbbbb-2222-2222-2222-222222222222';
     const P8 = require('crypto').generateKeyPairSync('ec', { namedCurve: 'P-256' })
       .privateKey.export({ type: 'pkcs8', format: 'pem' });
     const BASE = { SUPABASE_URL: 'https://x.test', SUPABASE_SERVICE_ROLE_KEY: 'svc', SUPABASE_ANON_KEY: 'anon',
       APPLE_KEY_ID: 'K', APPLE_ISSUER_ID: 'I', APPLE_BUNDLE_ID: 'com.test', APPLE_PRIVATE_KEY: P8,
       PRODUCT_ID_PLUS: 'com.test.plus', PRODUCT_ID_MAX: 'com.test.max' };
     let ENV = { ...BASE };
     globalThis.Deno = { env: { get: (k) => ENV[k] } };

     const Apple = require('./apple.cjs');
     Apple.install();
     const serve = require('./shim-serve.cjs');
     const sb = require('./shim-supabase.cjs');
     sb._clock = () => Apple.tick;
     const load = (r) => { delete require.cache[require.resolve(r)]; require(r); return serve._take(); };
     const webhook = load('./store-webhook/index.js');
     const verify = load('./verify-purchase/index.js');

     const post = async (h, body, hd) => {
       const res = await h({ method: 'POST',
         headers: { get: (x) => (hd || {})[x.toLowerCase()] ?? null },
         json: async () => { if (typeof body === 'symbol') throw new SyntaxError('bad json'); return body; } });
       let parsed = null; try { parsed = JSON.parse(await res.text()); } catch {}
       return { status: res.status, body: parsed };
     };
     const fresh = () => { Apple.reset(); Apple.install(); sb._reset(); ENV = { ...BASE }; };
     const row = (u) => sb._rows.get(u) ?? null;

     const DAY = 86400000, now = Date.now();
     const sub = (o) => ({ productId: 'com.test.max', type: 'Auto-Renewable Subscription', ...o });
     const p1 = sub({ transactionId: 'tx-1', originalTransactionId: 'orig-1', appAccountToken: A, expiresDate: now - 2 * DAY });
     const p2 = sub({ transactionId: 'tx-2', originalTransactionId: 'orig-1', appAccountToken: A, expiresDate: now + 28 * DAY });
     const healthy = () => { Apple.tx.production.set('tx-1', p1); Apple.tx.production.set('tx-2', p2);
       Apple.latest.production.set('orig-1', { tx: p2, status: 1 }); };
     const sbx = sub({ transactionId: 'sbx-1', originalTransactionId: 'sbx-orig', appAccountToken: B,
       expiresDate: now + 365 * DAY });
     const sandboxOnly = () => { Apple.tx.sandbox.set('sbx-1', sbx);
       Apple.latest.sandbox.set('sbx-orig', { tx: sbx, status: 1 }); };

     (async () => {
       const o = {};

       /* A — a forged body is not believed. The attacker names a real
          transaction and lies about everything else in it. */
       fresh(); healthy();
       const lie = sub({ transactionId: 'tx-2', originalTransactionId: 'orig-1',
                         appAccountToken: B, type: 'Non-Consumable', productId: 'com.test.max' });
       const rA = await post(webhook, Apple.notify('DID_RENEW', lie));
       o.forgedStatus = rA.status;
       o.forgedGaveForger = row(B) !== null;
       o.forgedWroteApplesAnswer = row(A) !== null && row(A).tier === 'max' && row(A).expires_at !== null;

       /* the same forgery when Apple has never heard of the transaction */
       fresh();
       const rA2 = await post(webhook, Apple.notify('DID_RENEW',
         sub({ transactionId: 'invented', originalTransactionId: 'invented', appAccountToken: B,
               expiresDate: now + 999 * DAY })));
       o.inventedStatus = rA2.status;
       o.inventedWrote = sb._writes.length;

       /* B — ordering: no write may be attempted before Apple has answered */
       fresh(); healthy();
       await post(webhook, Apple.notify('DID_RENEW', p2));
       o.appleCallsBeforeWrite = sb._writes.length ? sb._writes[0].at : -1;
       o.writesOnHealthyRenewal = sb._writes.length;

       /* C — a sandbox purchase is free, and must not become a real subscription */
       fresh(); sandboxOnly();
       const rC = await post(webhook, Apple.notify('DID_RENEW', sbx));
       o.sandboxDefaultStatus = rC.status;
       o.sandboxDefaultTier = row(B) ? row(B).tier : null;
       o.sandboxDefaultHosts = [...new Set(Apple.calls.map((c) => c.env))].join(',');

       fresh(); sandboxOnly();
       sb._setClaims({ sub: B, role: 'authenticated', aud: 'authenticated' });
       o.sandboxVerifyStatus = (await post(verify, { transactionId: 'sbx-1' }, { authorization: 'Bearer t' })).status;
       sb._setClaims({ sub: A, role: 'authenticated', aud: 'authenticated' });

       /* the same two faults through the authenticated door: Apple failing must
          not come back as "Transaction not found", and a caller whose named
          transaction is theirs but whose CURRENT period is not must be refused */
       fresh(); healthy();
       Apple.fail = { 'production:transactions': 500 };
       const rV = await post(verify, { transactionId: 'tx-2' }, { authorization: 'Bearer t' });
       o.verifyApple500Status = rV.status;
       o.verifyApple500Wrote = sb._writes.length;

       fresh();
       Apple.tx.production.set('tx-1', p1);
       Apple.latest.production.set('orig-1', { tx: sub({ transactionId: 'tx-2', originalTransactionId: 'orig-1',
         appAccountToken: B, expiresDate: now + 28 * DAY }), status: 1 });
       const rV2 = await post(verify, { transactionId: 'tx-1' }, { authorization: 'Bearer t' });
       o.verifyDivergedStatus = rV2.status;
       o.verifyDivergedWrote = sb._writes.length;

       /* and the opt-in still works, and says so in the row */
       fresh(); sandboxOnly(); ENV = { ...BASE, APPLE_ENV: 'production,sandbox' };
       await post(webhook, Apple.notify('DID_RENEW', sbx));
       o.sandboxOptInTier = row(B) ? row(B).tier : null;
       o.sandboxOptInStore = row(B) ? row(B).store : null;
       fresh(); sandboxOnly(); ENV = { ...BASE, APPLE_ENV: 'nonsense' };
       await post(webhook, Apple.notify('DID_RENEW', sbx));
       o.sandboxGarbageEnvTier = row(B) ? row(B).tier : null;

       /* D — Apple failing is not Apple saying no */
       fresh(); healthy();
       Apple.fail = { 'production:transactions': 500 };
       const rD = await post(webhook, Apple.notify('DID_RENEW', p2));
       o.txn500Status = rD.status;
       o.txn500Wrote = sb._writes.length;
       fresh(); healthy();
       Apple.fail = { 'production:transactions': 429 };
       o.txn429Status = (await post(webhook, Apple.notify('DID_RENEW', p2))).status;

       /* the one that costs a paying customer: a late notification for an old
          period, while the subscription lookup is the thing that is failing */
       fresh(); healthy();
       await post(webhook, Apple.notify('DID_RENEW', p2));
       o.payingBefore = row(A).tier;
       Apple.fail = { 'production:subscriptions': 500 };
       const rD3 = await post(webhook, Apple.notify('EXPIRED', p1));
       o.stale500Status = rD3.status;
       o.payingAfter500 = row(A).tier;
       Apple.fail = { 'production:subscriptions': 429 };
       await post(webhook, Apple.notify('EXPIRED', p1));
       o.payingAfter429 = row(A).tier;
       Apple.fail = {};
       /* and a healthy late notification still must not downgrade */
       await post(webhook, Apple.notify('EXPIRED', p1));
       o.payingAfterHealthyLate = row(A).tier;
       /* while a real expiry still must */
       Apple.latest.production.set('orig-1', { tx: p1, status: 2 });
       await post(webhook, Apple.notify('EXPIRED', p1));
       o.afterRealExpiry = row(A).tier;

       /* E — the row belongs to whoever owns the state being written into it */
       fresh();
       const p2b = sub({ transactionId: 'tx-2', originalTransactionId: 'orig-1', appAccountToken: B,
                         expiresDate: now + 28 * DAY });
       Apple.tx.production.set('tx-1', p1);
       Apple.latest.production.set('orig-1', { tx: p2b, status: 1 });
       await post(webhook, Apple.notify('DID_RENEW', p1));
       o.divergedWroteNamedAccount = row(A) !== null;
       o.divergedWroteCurrentOwner = row(B) !== null && row(B).tier === 'max';

       /* F — bounds on the only door with no lock */
       fresh(); sandboxOnly();
       const huge = Apple.b64u({ alg: 'ES256' }) + '.' + Buffer.from(
         JSON.stringify({ notificationType: 'X', pad: 'z'.repeat(2 * 1024 * 1024) })).toString('base64url') + '.s';
       const rF = await post(webhook, { signedPayload: huge });
       o.hugeStatus = rF.status;
       o.hugeAppleCalls = Apple.calls.length;
       fresh(); healthy();
       await post(webhook, Apple.notify('DID_RENEW', { ...p2, transactionId: 'x'.repeat(5000) }));
       o.longIdAppleCalls = Apple.calls.length;
       fresh(); healthy();
       await post(webhook, Apple.notify('DID_RENEW', { ...p2, transactionId: 'x'.repeat(64) }));
       o.legalIdAppleCalls = Apple.calls.length;
       fresh(); healthy();
       o.badJsonStatus = (await post(webhook, Symbol('not json'))).status;

       /* G — nothing about this server's insides comes back to a stranger */
       fresh(); healthy();
       ENV = { ...BASE, APPLE_PRIVATE_KEY: undefined };
       const rG = await post(webhook, Apple.notify('DID_RENEW', p2));
       o.credsMissingStatus = rG.status;
       o.credsMissingBody = JSON.stringify(rG.body ?? {});

       console.log(JSON.stringify(o));
     })();`,
  );

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  const want = (ok, message) => {
    if (!ok) problems.push(message);
  };

  /* A — the invariant the whole endpoint rests on */
  want(
    !r.forgedGaveForger && r.forgedWroteApplesAnswer,
    `một POST giả mạo tự khai appAccountToken khác và type "Non-Consumable" ` +
      `${r.forgedGaveForger ? 'ĐÃ cấp quyền cho người gửi' : 'không ghi được câu trả lời của Apple'} — ` +
      'endpoint này không có token nào cả, nên điều duy nhất giữ nó an toàn là KHÔNG TIN một chữ nào trong body',
  );
  want(
    r.inventedStatus === 200 && r.inventedWrote === 0,
    `một transaction bịa ra trả ${r.inventedStatus} và ghi ${r.inventedWrote} lần — phải là 200 và không ghi gì`,
  );

  /* B — ordering */
  want(
    r.writesOnHealthyRenewal === 1 && r.appleCallsBeforeWrite >= 1,
    `có lệnh ghi entitlements chạy sau ${r.appleCallsBeforeWrite} lần hỏi Apple — ` +
      'không một thay đổi quyền lợi nào được phép xảy ra TRƯỚC khi Apple trả lời, ' +
      'vì lời của người gửi không phải bằng chứng gì cả',
  );

  /* C — sandbox */
  want(
    r.sandboxDefaultTier === null && r.sandboxDefaultHosts === 'production',
    `một transaction CHỈ có ở sandbox vẫn cấp '${r.sandboxDefaultTier}' (đã hỏi: ${r.sandboxDefaultHosts}) — ` +
      'mua ở sandbox không mất một đồng nào và người mua tự chọn appAccountToken, ' +
      'nên đó là gói trả phí miễn phí cho bất kỳ ai có một bản TestFlight',
  );
  want(
    r.sandboxVerifyStatus === 404,
    `verify-purchase nhận transaction sandbox trả ${r.sandboxVerifyStatus} — cùng một lỗ, ở cửa còn lại`,
  );
  want(
    r.sandboxOptInTier === 'max' && r.sandboxOptInStore === 'apple-sandbox',
    `APPLE_ENV=production,sandbox không còn bật được sandbox ('${r.sandboxOptInTier}'/'${r.sandboxOptInStore}') — ` +
      'bản review THẬT SỰ mua ở sandbox, nên chặn cứng là chặn cả việc lên được store; ' +
      'phải bật được, và bật thì phải ghi lại là sandbox',
  );
  want(
    r.sandboxGarbageEnvTier === null,
    `APPLE_ENV rác vẫn cấp '${r.sandboxGarbageEnvTier}' — một biến môi trường gõ sai phải rơi về production, không phải mở cửa`,
  );

  /* D — Apple failing is not Apple saying no */
  want(
    r.txn500Status === 503 && r.txn429Status === 503 && r.txn500Wrote === 0,
    `Apple trả 500/429 khi tra transaction thì webhook đáp ${r.txn500Status}/${r.txn429Status} — ` +
      'mọi mã 2xx đều nói với Apple là "đã nhận", và Apple sẽ KHÔNG gửi lại; ' +
      'một lần Apple trục trặc là một lần gia hạn hoặc hoàn tiền mất hẳn',
  );
  want(
    r.payingBefore === 'max' && r.stale500Status === 503 &&
      r.payingAfter500 === 'max' && r.payingAfter429 === 'max',
    `một thông báo CŨ của kỳ trước tới muộn ĐÚNG LÚC Apple lỗi hạ người đang trả tiền xuống ` +
      `'${r.payingAfter500}'/'${r.payingAfter429}' — tra cứu subscription sinh ra chính là để chuyện đó không xảy ra, ` +
      'và nó hỏng hở: 404 (không phải gói thuê bao) và 500/429 (Apple không trả lời được) từng là cùng một giá trị null, ' +
      'nên khi không hỏi được thì nó quay về tin đúng cái transaction cũ trong thông báo',
  );
  want(
    r.payingAfterHealthyLate === 'max',
    `thông báo cũ tới muộn lúc Apple khoẻ vẫn hạ cấp ('${r.payingAfterHealthyLate}')`,
  );
  want(
    r.afterRealExpiry === 'free',
    `gói hết hạn thật vẫn giữ '${r.afterRealExpiry}' — hạ cấp phải còn hoạt động, nếu không thì luật trên chỉ là tắt tính năng`,
  );

  want(
    r.verifyApple500Status === 503 && r.verifyApple500Wrote === 0,
    `verify-purchase khi Apple lỗi trả ${r.verifyApple500Status} — 404 "Transaction not found" là một lời nói dối ` +
      'gửi thẳng người đang trả tiền sang bộ phận hỗ trợ, cho một sự cố sẽ tự hết sau vài phút',
  );
  want(
    r.verifyDivergedStatus === 403 && r.verifyDivergedWrote === 0,
    `verify-purchase: người gọi sở hữu transaction họ gửi nhưng KHÔNG sở hữu kỳ hiện tại, vẫn nhận ` +
      `${r.verifyDivergedStatus} và ghi ${r.verifyDivergedWrote} lần — cấp phép trên lần mua của người này ` +
      'rồi ghi xuống gói của người kia',
  );

  /* E — whose row */
  want(
    !r.divergedWroteNamedAccount && r.divergedWroteCurrentOwner,
    'khi transaction được thông báo gọi tên và kỳ HIỆN TẠI mang appAccountToken khác nhau, ' +
      `hàng ghi vào tài khoản ${r.divergedWroteNamedAccount ? 'bị gọi tên' : 'nào đó khác'} ` +
      `và chủ kỳ hiện tại ${r.divergedWroteCurrentOwner ? 'có' : 'KHÔNG'} nhận được gì — ` +
      'appAccountToken đặt theo từng lần mua, nên chủ hàng phải là chủ của trạng thái đang được ghi vào đó',
  );

  /* F — bounds */
  want(
    r.hugeStatus === 413 && r.hugeAppleCalls === 0 && r.longIdAppleCalls === 0 && r.legalIdAppleCalls >= 1,
    `body 2 MiB trả ${r.hugeStatus} và tốn ${r.hugeAppleCalls} lần gọi Apple, id 5000 ký tự tốn ${r.longIdAppleCalls} — ` +
      'đây là endpoint DUY NHẤT không có token; mỗi POST đổi lấy một lần gọi có ký vào App Store Server API, ' +
      'mà hạn mức của API đó là hạn mức chung của cả app — dùng cạn nó chính là cách kích hoạt hai lỗi ở trên',
  );
  want(
    r.badJsonStatus === 400,
    `body không phải JSON trả ${r.badJsonStatus} — 5xx bắt Apple gửi lại nhiều ngày một thứ không bao giờ parse được`,
  );

  /* G — no insides */
  want(
    r.credsMissingStatus === 500 && !/credential|Apple|APPLE_|key/i.test(r.credsMissingBody),
    `thiếu khoá riêng thì trả về ${r.credsMissingBody} — ` +
      'bất kỳ ai trên internet cũng POST được vào đây, và thông điệp ngoại lệ kể cho họ tình trạng cấu hình App Store của dự án',
  );
} catch (e) {
  problems.push(`không dựng được phép thử store-webhook: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('cửa không khoá của dự án còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'store-webhook OK — CHẠY THẬT store-webhook và verify-purchase với một Apple giả lập có HAI môi trường ' +
    'và tiêm lỗi theo từng endpoint. Bất biến chính: một POST không token, giả mạo appAccountToken của người khác ' +
    'và khai "Non-Consumable", ghi ra đúng câu trả lời của Apple cho đúng tài khoản của Apple — người gửi không nhận gì; ' +
    'và không một lệnh ghi nào chạy trước khi Apple trả lời. Sáu lỗi đã sửa: transaction CHỈ có ở sandbox ' +
    'không còn cấp gói thật ở cả hai handler (mua sandbox miễn phí và người mua tự chọn appAccountToken), ' +
    'nhưng APPLE_ENV vẫn bật được sandbox và khi bật thì ghi rõ store=apple-sandbox, còn APPLE_ENV gõ sai rơi về production; ' +
    'Apple trả 500/429 nay là 503 KHÔNG ghi gì thay vì 200 "not found" (2xx là lời nhắn "đã nhận", Apple sẽ không gửi lại nữa); ' +
    'một thông báo CŨ tới muộn đúng lúc Apple lỗi KHÔNG còn hạ người đang trả tiền xuống free, mà hết hạn thật thì vẫn hạ được; ' +
    'hàng entitlements thuộc về chủ của kỳ HIỆN TẠI chứ không phải chủ của transaction mà thông báo gọi tên; ' +
    'body 2 MiB trả 413 và id 5000 ký tự đều tốn 0 lần gọi Apple, còn id hợp lệ thì vẫn được hỏi; ' +
    'và thiếu khoá riêng không còn trả "Apple credentials not configured" cho người lạ',
);
