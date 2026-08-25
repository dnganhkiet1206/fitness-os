/**
 * The one operation nobody can undo.
 *
 * ── the primary question this chain started from ──
 *
 * Can a request authenticated as B delete A? **No**, and the reason is stronger
 * than a check: `delete-account` never calls `req.json()` at all. There is no
 * body to trust. Driven through the real handler as B with `userId`, `user_id`,
 * `id`, `sub`, `account`, `target` and `email` all naming A — eight bodies —
 * every one deletes **B** and leaves A's account and files untouched.
 *
 * The auth matrix is the other half: no token, a garbage token and the
 * **publishable anon key** all return 401 having performed **zero** privileged
 * actions. That matters more here than anywhere else in the project, because
 * the client this function builds is the service role.
 *
 * ── deletion coverage, measured rather than listed ──
 *
 * The function deletes storage first and then `auth.users`, and lets foreign
 * keys take everything else. That is only true while every table actually
 * cascades, and chains I–O added migrations since it was written. Rebuilt on
 * PostgreSQL 16.13 from all 29 migrations, seeded A and B across **every**
 * user-owned table by introspection — 31 tables with `user_id`, plus the three
 * that reach `auth.users` through a parent — then deleted A's auth row:
 *
 *     A rows: 31 tables → 0        child tables → 0
 *     B rows: 31 tables → 31       ALPHA markers anywhere → NONE
 *
 * Rule F keeps that true: every table carrying `user_id` must acquire an
 * `ON DELETE CASCADE` foreign key to `auth.users`, whether inline or by a later
 * `ALTER TABLE`. Both forms are counted because both are used — 20 inline, 23
 * altered — and a rule that saw only the first would report eleven tables that
 * are perfectly fine.
 *
 * ── the two things that were wrong, and they are the same thing ──
 *
 * The function already knew the hardest part: photos are removed before the
 * auth row, so a failure in between leaves somebody's pictures destroyed and
 * their account standing. It answers that with `partial: true`, and the app
 * has a sentence for it. **The flag just did not survive every exit.**
 *
 * **A thrown failure lost it.** Every error the two APIs *return* carried
 * `partial`; one they *throw* — a dropped connection, the ordinary way these
 * fail — fell to the outer `catch`, which had no flag at all. Measured:
 *
 *     deleteUser throws after the photos are gone
 *     → {"error":"network dropped"}     → app: "nothing has been deleted"
 *     → photos actually gone: true
 *
 * **And a lost response turned into an accusation.** This reply is the most
 * likely in the app to go missing — it is the last thing before signing out.
 * The person taps again; the access token is still valid, because `getClaims`
 * verifies a signature and an expiry, not whether the subject still exists; the
 * call runs the whole way down and GoTrue answers 404:
 *
 *     1st call → 200 {"ok":true}       account and photos gone
 *     2nd call → 500 partial:false     app: "nothing has been deleted"
 *
 * Both halves false, on the one screen where that is least recoverable.
 *
 * ── what these rules cannot tell you ──
 *
 * `HANDLER-AND-SCHEMA-PROVEN`, `REAL-SUPABASE-UNVERIFIED`. The handler, the
 * identity guard and the cascade topology are real. Supabase Auth, Storage and
 * Deno are stand-ins: no account has been deleted on a real project, and
 * nothing here says what GoTrue does in production.
 */
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'delacct-'));
try {
  const fnDir = path.join(out, 'fn');
  mkdirSync(fnDir, { recursive: true });
  copyFileSync(path.join(REPO, 'supabase/functions/delete-account/index.ts'), path.join(fnDir, 'delete-account.ts'));
  copyFileSync(path.join(REPO, 'supabase/functions/_shared/guard.ts'), path.join(fnDir, 'guard.ts'));
  for (const f of ['delete-account.ts', 'guard.ts']) {
    const p = path.join(fnDir, f);
    writeFileSync(
      p,
      readFileSync(p, 'utf8')
        .replace('https://deno.land/std@0.168.0/http/server.ts', './shim-serve.js')
        .replace('https://esm.sh/@supabase/supabase-js@2', './shim-sb.js')
        .replaceAll('"../_shared/guard.ts"', '"./guard.ts"'),
    );
  }
  writeFileSync(
    path.join(fnDir, 'shim-serve.js'),
    `let h = null; module.exports = { serve: (x) => { h = x; }, __handler: () => h, __reset: () => { h = null; } };\n`,
  );

  /* Supabase Auth admin + Storage, with the faults this test injects and a log
     of every privileged action so the final state can be inspected. */
  writeFileSync(
    path.join(fnDir, 'shim-sb.js'),
    `const world = { users: new Set(), files: {}, log: [], fail: {}, tokens: {}, latency: 0,
                     throwDeleteUser: null, throwRemove: null };
     const wait = (ms) => (ms ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
     function createClient(url, key, opts) {
       const isAdmin = key === 'SERVICE_ROLE_KEY';
       return {
         from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
         rpc: async () => ({ data: true, error: null }),
         auth: {
           async getClaims(t) {
             const c = world.tokens[t];
             return c ? { data: { claims: c }, error: null } : { data: null, error: { message: 'bad token' } };
           },
           admin: {
             async deleteUser(id) {
               await wait(world.latency);
               world.log.push({ op: 'deleteUser', id, isAdmin });
               if (world.throwDeleteUser) throw new Error(world.throwDeleteUser);
               if (world.fail.deleteUser) return { error: { message: world.fail.deleteUser } };
               /* GoTrue's answer for a subject that is not there. */
               if (!world.users.has(id)) {
                 return { error: Object.assign(new Error('User not found'), { status: 404, code: 'user_not_found' }) };
               }
               world.users.delete(id);
               delete world.files[id];
               return { error: null };
             },
           },
         },
         storage: {
           from: (bucket) => ({
             async list(prefix, opts) {
               await wait(world.latency);
               world.log.push({ op: 'list', prefix, isAdmin });
               if (world.fail.list) return { data: null, error: { message: world.fail.list } };
               const all = world.files[prefix] || [];
               return { data: all.slice(0, (opts && opts.limit) || 100).map((n) => ({ name: n })), error: null };
             },
             async remove(paths) {
               await wait(world.latency);
               world.log.push({ op: 'remove', paths, isAdmin });
               if (world.throwRemove) throw new Error(world.throwRemove);
               if (world.fail.remove) return { error: { message: world.fail.remove } };
               for (const p of paths) {
                 const uid = p.slice(0, p.indexOf('/'));
                 const name = p.slice(p.indexOf('/') + 1);
                 world.files[uid] = (world.files[uid] || []).filter((n) => n !== name);
               }
               return { error: null };
             },
           }),
         },
       };
     }
     module.exports = { createClient, __world: world };\n`,
  );

  try {
    execFileSync(
      'npx',
      ['tsc', path.join(fnDir, 'delete-account.ts'), path.join(fnDir, 'guard.ts'),
        '--outDir', fnDir, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--ignoreConfig'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch { /* Deno globals have no types here — emitted anyway. */ }
  for (const f of readdirSync(fnDir).filter((f) => f.endsWith('.js') && !f.startsWith('shim-'))) {
    const p = path.join(fnDir, f);
    writeFileSync(p, readFileSync(p, 'utf8').replace('require("./guard.ts")', 'require("./guard.js")'));
  }

  writeFileSync(
    path.join(out, 'run.cjs'),
    `const path = require('path');
     const FN = path.join(__dirname, 'fn');
     const sb = require(path.join(FN, 'shim-sb.js'));
     const ss = require(path.join(FN, 'shim-serve.js'));
     const W = sb.__world;
     const A = 'aaaaaaaa-1111-1111-1111-111111111111';
     const B = 'bbbbbbbb-2222-2222-2222-222222222222';
     global.Deno = { env: { get: (k) => ({ SUPABASE_URL: 'http://x', SUPABASE_ANON_KEY: 'ANON',
       SUPABASE_SERVICE_ROLE_KEY: 'SERVICE_ROLE_KEY' }[k]) } };
     const quiet = () => { console.log = () => {}; console.error = () => {}; };
     const real = console.log;

     function reset(over) {
       W.users = new Set([A, B]);
       W.files = { [A]: ['a1.jpg', 'a2.jpg'], [B]: ['b1.jpg'] };
       W.log = []; W.fail = {}; W.latency = 0; W.throwDeleteUser = null; W.throwRemove = null;
       W.tokens = { tokA: { sub: A, role: 'authenticated', aud: 'authenticated' }, tokB: { sub: B, role: 'authenticated', aud: 'authenticated' },
                    anonTok: { role: 'anon' } };
       Object.assign(W, over || {});
     }
     async function call(token, body) {
       ss.__reset();
       delete require.cache[require.resolve(path.join(FN, 'delete-account.js'))];
       require(path.join(FN, 'delete-account.js'));
       const h = new Map();
       if (token) h.set('authorization', 'Bearer ' + token);
       const res = await ss.__handler()({ method: 'POST',
         headers: { get: (k) => h.get(k.toLowerCase()) ?? null }, json: async () => body || {} });
       return { status: res.status, body: JSON.parse(await res.text()) };
     }

     (async () => {
       quiet();
       const o = {};

       /* ── A. the body can never choose the account ── */
       o.cross = [];
       for (const body of [{ userId: A }, { user_id: A }, { id: A }, { sub: A },
                           { account: A }, { target: A }, { email: 'alpha@x' },
                           { userId: A, user_id: A, id: A, sub: A }]) {
         reset();
         const r = await call('tokB', body);
         o.cross.push({
           status: r.status,
           deleted: W.log.filter((l) => l.op === 'deleteUser').map((l) => l.id),
           aAlive: W.users.has(A),
           aFiles: (W.files[A] || []).length,
         });
       }

       /* ── B. identity at the door ── */
       o.auth = {};
       for (const [label, tok] of [['none', null], ['bad', 'garbage'], ['anon', 'anonTok'],
                                   ['a', 'tokA'], ['b', 'tokB']]) {
         reset();
         const r = await call(tok, {});
         o.auth[label] = { status: r.status, adminActions: W.log.length,
                           aAlive: W.users.has(A), bAlive: W.users.has(B) };
       }

       /* ── C. every failure says truthfully whether anything was destroyed ── */
       o.partial = {};
       for (const [label, over] of [
         ['listFails', { fail: { list: 'boom' } }],
         ['removeFails', { fail: { remove: 'boom' } }],
         ['deleteUserFails', { fail: { deleteUser: 'boom' } }],
         ['removeThrows', { throwRemove: 'network dropped' }],
         ['deleteUserThrows', { throwDeleteUser: 'network dropped' }],
       ]) {
         reset(over);
         const r = await call('tokA', {});
         o.partial[label] = { status: r.status, partial: r.body.partial,
                              filesGone: (W.files[A] || []).length === 0,
                              aAlive: W.users.has(A),
                              leaksInternal: /network dropped|boom/.test(JSON.stringify(r.body)) };
       }

       /* ── D. it converges when retried ── */
       reset({ fail: { deleteUser: 'boom' } });
       const p1 = await call('tokA', {});
       W.fail = {};
       const p2 = await call('tokA', {});
       o.retry = { first: p1.status, second: p2.status, aAlive: W.users.has(A) };

       reset();
       const d1 = await call('tokA', {});
       const d2 = await call('tokA', {});
       o.twice = { first: d1.status, second: d2.status, bAlive: W.users.has(B) };

       reset({ latency: 5 });
       const [c1, c2] = await Promise.all([call('tokA', {}), call('tokA', {})]);
       o.concurrent = { statuses: [c1.status, c2.status].sort(), bAlive: W.users.has(B), aAlive: W.users.has(A) };

       console.log = real;
       console.log(JSON.stringify(o));
     })();\n`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'run.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A ── */
  const B_ID = 'bbbbbbbb-2222-2222-2222-222222222222';
  want(
    r.cross.every((c) => c.deleted.length === 1 && c.deleted[0] === B_ID),
    'thân yêu cầu CHỌN ĐƯỢC tài khoản bị xoá: ' +
      JSON.stringify(r.cross.map((c) => c.deleted)) +
      ' — gọi với tư cách B kèm userId/user_id/id/sub/account/target/email của A. ' +
      'Đây là hàm duy nhất trong dự án mà làm sai chỗ này là KHÔNG THỂ CỨU cho người bị',
  );
  want(
    r.cross.every((c) => c.aAlive && c.aFiles === 2),
    `tài khoản hoặc ảnh của A bị đụng tới: ${JSON.stringify(r.cross.map((c) => [c.aAlive, c.aFiles]))}`,
  );

  /* ── B ── */
  want(
    r.auth.none.status === 401 && r.auth.bad.status === 401 && r.auth.anon.status === 401,
    `không token / token rác / KHOÁ ANON ra ${r.auth.none.status}/${r.auth.bad.status}/${r.auth.anon.status} thay vì 401`,
  );
  want(
    r.auth.none.adminActions === 0 && r.auth.bad.adminActions === 0 && r.auth.anon.adminActions === 0,
    'một lời gọi không được xác thực vẫn chạm tới service role — client dựng trong hàm này CHÍNH LÀ service role',
  );
  want(r.auth.a.status === 200 && !r.auth.a.aAlive && r.auth.a.bAlive, 'A xoá chính mình không thành, hoặc B bị cuốn theo');
  want(r.auth.b.status === 200 && !r.auth.b.bAlive && r.auth.b.aAlive, 'B xoá chính mình không thành, hoặc A bị cuốn theo');

  /* ── C ── */
  want(
    r.partial.listFails.partial === false && r.partial.listFails.aAlive,
    `hỏng ở bước liệt kê tệp mà vẫn báo partial=${r.partial.listFails.partial} — lúc đó chưa có gì bị phá`,
  );
  want(
    r.partial.removeFails.partial === true,
    'hỏng khi XOÁ tệp mà báo partial=false — remove xoá được cái nào hay cái đó rồi mới báo lỗi',
  );
  for (const label of ['deleteUserFails', 'deleteUserThrows']) {
    const x = r.partial[label];
    want(
      x.partial === true && x.filesGone,
      `${label}: ảnh đã bị xoá sạch nhưng phản hồi nói partial=${x.partial}. App sẽ hiện "KHÔNG có gì bị xoá" ` +
        'trong khi mọi tấm ảnh tiến trình của người đó đã mất vĩnh viễn — đúng câu mà cờ partial được thêm vào để tránh',
    );
  }
  want(
    Object.values(r.partial).every((x) => !x.leaksInternal),
    'một phản hồi lỗi trả nguyên câu nội bộ ra ngoài: ' +
      JSON.stringify(Object.entries(r.partial).filter(([, x]) => x.leaksInternal).map(([k]) => k)),
  );

  /* ── D ── */
  want(
    r.retry.first === 500 && r.retry.second === 200 && !r.retry.aAlive,
    `thử lại sau một lần hỏng dở dang không hội tụ: ${JSON.stringify(r.retry)}`,
  );
  want(
    r.twice.first === 200 && r.twice.second === 200,
    `gọi xoá hai lần ra ${r.twice.first}/${r.twice.second} — lần thứ hai phải là 200. ` +
      'Phản hồi này là thứ dễ mất nhất trong app (việc cuối cùng trước khi đăng xuất), và token vẫn hợp lệ ' +
      'sau khi tài khoản đã mất vì getClaims chỉ kiểm chữ ký và hạn. Bản đã ship trả 500 partial:false, ' +
      'mà app hiện thành "KHÔNG có gì bị xoá" — cả hai vế đều sai',
  );
  want(r.twice.bAlive, 'gọi xoá lần hai đụng tới tài khoản khác');
  want(
    r.concurrent.statuses.join(',') === '200,200' && !r.concurrent.aAlive && r.concurrent.bAlive,
    `hai lời gọi xoá đồng thời ra ${JSON.stringify(r.concurrent)}`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   F — the cascade the function relies on instead of a hand-written table list
   ───────────────────────────────────────────────────────────────────────── */
{
  const dir = path.join(REPO, 'supabase', 'migrations');
  const sql = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8')).join('\n');

  const owned = new Set();
  const inline = new Set();
  for (const m of sql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)?\s+(?:public\.)?"?(\w+)"?\s*\(([\s\S]*?)\n\);/gi)) {
    const [, name, body] = m;
    if (!/\buser_id\b/.test(body)) continue;
    owned.add(name);
    if (/user_id[^,]*REFERENCES\s+auth\.users\s*\(\s*id\s*\)[\s\S]{0,80}?ON DELETE CASCADE/i.test(body)) {
      inline.add(name);
    }
  }
  /* Both forms are counted because both are used — 20 tables declare the key
     inline and 23 gain it from a later `ALTER TABLE`. A rule that saw only the
     first would report eleven perfectly correct tables as broken, which is how
     a detector teaches people to ignore it. */
  const altered = new Set();
  for (const m of sql.matchAll(/ALTER TABLE(?: ONLY)?\s+(?:public\.)?"?(\w+)"?([\s\S]*?);/gi)) {
    const [, name, body] = m;
    if (/FOREIGN KEY\s*\(\s*user_id\s*\)\s*REFERENCES\s+auth\.users\s*\(\s*id\s*\)[\s\S]*?ON DELETE CASCADE/i.test(body)) {
      altered.add(name);
    }
  }
  const uncovered = [...owned].filter((t) => !inline.has(t) && !altered.has(t)).sort();
  if (owned.size < 31) {
    problems.push(`chỉ thấy ${owned.size} bảng mang user_id — luật này không còn đọc đúng chỗ (đo trên DB thật: 31)`);
  }
  if (uncovered.length > 0) {
    problems.push(
      `bảng mang user_id mà KHÔNG có khoá ngoại ON DELETE CASCADE tới auth.users: ${uncovered.join(', ')}. ` +
        'delete-account cố ý không giữ danh sách bảng viết tay — nó xoá auth.users và để khoá ngoại lo phần còn ' +
        'lại — nên một bảng không cascade là dữ liệu của người đã yêu cầu được xoá còn nằm lại, trong im lặng',
    );
  }

  /* And the function must still be the kind of function that can rely on it. */
  const fn = readFileSync(path.join(REPO, 'supabase/functions/delete-account/index.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  if (/req\.json\(\)/.test(fn)) {
    problems.push(
      'delete-account đã bắt đầu đọc thân yêu cầu — sức mạnh của hàm này là KHÔNG CÓ thân nào để tin. ' +
        'Nếu nay cần một trường thì danh tính vẫn phải chỉ đến từ JWT, và luật A ở trên phải được mở rộng',
    );
  }
  if (!/requireUser\(req\)/.test(fn)) {
    problems.push('delete-account không còn lấy danh tính từ requireUser — JWT là nguồn duy nhất được phép');
  }
}

if (problems.length) {
  console.log('xoá tài khoản còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'xoá tài khoản OK — CHẠY THẬT handler delete-account. Tám thân yêu cầu khác nhau đặt tên A ' +
    '(userId/user_id/id/sub/account/target/email) gọi với tư cách B: lần nào cũng xoá ĐÚNG B, tài khoản và ' +
    'ảnh của A nguyên vẹn — hàm này không hề gọi req.json(), nên không có thân nào để tin. Không token / ' +
    'token rác / KHOÁ ANON đều 401 với KHÔNG một hành động service-role nào. Mọi lối thoát lỗi nói đúng sự ' +
    'thật về việc đã phá gì: hỏng khi liệt kê → partial=false, hỏng khi xoá tệp → partial=true, và hỏng ở ' +
    'deleteUser — dù API TRẢ VỀ lỗi hay NÉM lỗi — đều partial=true sau khi ảnh đã mất (bản đã ship để lối ' +
    'ném rơi xuống catch ngoài cùng không mang cờ nào, nên app hiện "KHÔNG có gì bị xoá" trong khi mọi tấm ' +
    'ảnh đã mất vĩnh viễn), và không phản hồi nào trả câu lỗi nội bộ ra ngoài. Thử lại sau một lần hỏng dở ' +
    'dang hội tụ về 200; gọi xoá hai lần ra 200/200 và hai lời gọi đồng thời cũng vậy (bản đã ship trả 500 ' +
    'partial:false cho lần thứ hai — phản hồi này là thứ dễ mất nhất trong app, và token vẫn hợp lệ sau khi ' +
    'tài khoản đã mất). Và 31 bảng mang user_id đều có khoá ngoại ON DELETE CASCADE tới auth.users, 20 khai ' +
    'ngay trong CREATE TABLE và 23 thêm bằng ALTER TABLE về sau',
);
