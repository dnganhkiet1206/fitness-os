/**
 * Hydration is data loading. It is not authorization.
 *
 * ── the primary question this chain started from ──
 *
 * On a cold launch, can a persisted offline mutation be replayed before the
 * authenticated session is known, or under the wrong user?
 *
 * **No**, and every part of that is executed here rather than read. The rules
 * below build a real `QueryClient`, queue real writes through the real
 * `registerOfflineWrites`, dehydrate to JSON the way the persister does, hydrate
 * into a *fresh* client, and then look at **which statements reached the
 * network**. Nothing greps for a guard.
 *
 *     cold launch, session = A   →  2 statements, both owned by A
 *     cold launch, session = B   →  0 statements
 *     cold launch, session = null→  0 statements
 *     auth 300 ms late, then A   →  2 statements, both owned by A
 *
 * The middle two are the point: **the wrong user's write does not reach the
 * network at all.** Chain F proved PostgreSQL refuses it with 42501 if it ever
 * did; that server defence is untouched and independent. This is the client
 * half, and it is measured separately on purpose — two defences, two proofs.
 *
 * ── why the ordering outside the app is safe ──
 *
 * `PersistQueryClientProvider` sits *outside* `AuthProvider` in `_layout`, and
 * its `onSuccess` calls `resumePausedMutations()` as soon as the cache is read
 * back — before React knows who is signed in. That looks like a race and is
 * not one, for a reason worth writing down because nothing in this repo used to
 * state it: the guard at the top of `applyOfflineWrite` asks
 * `supabase.auth.getSession()`, and in @supabase/auth-js 2.110.6 that awaits
 * `initializePromise` before answering. It cannot report "signed out" merely
 * because the read from storage has not finished.
 *
 * Rule A pins that behaviour with a stand-in whose `getSession()` blocks for
 * 300 ms. If a future guard ever reads a session synchronously — off a React
 * context, off a module `let` — this rule goes red, because the answer with a
 * slow auth would stop matching the answer with a fast one.
 *
 * ── what was actually wrong ──
 *
 * One thing, in two shapes: `applyOfflineWrite` had no notion of a record it
 * *cannot* execute.
 *
 * **An unknown `kind` reported success.** The `switch` is exhaustive over the
 * TypeScript union, so there was no `default` — and what comes off the disk is
 * not typed. It was written by whichever build the person was running when they
 * went offline, which after a rollback or a restore is not this one. Measured:
 *
 *     kind: 'telepathy'  →  status: success, statements sent: 0
 *
 * The write was destroyed and recorded as done — strictly worse than a loud
 * failure, which would have left it in the queue.
 *
 * **A structurally broken record was retried as weather.** `variables` missing,
 * `null`, or a string threw a `TypeError`, which `permanentFailure` did not
 * recognise, so it was sent three more times across seven seconds of backoff —
 * holding the whole serialised queue behind it. Now: one attempt, refused.
 * Genuine network failure still gets its four.
 *
 * ── what these rules cannot tell you ──
 *
 * `COLD-LAUNCH-BEHAVIOUR-PROVEN-IN-QUERY-CORE`,
 * `DEVICE-COLD-LAUNCH-UNVERIFIED`. The `QueryClient`, the mutation cache, the
 * dehydrate/hydrate round trip and `registerOfflineWrites` are the real ones,
 * at the versions installed. Supabase and AsyncStorage are stand-ins, the app
 * has not been launched on an iPhone, and no process was really killed.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const out = mkdtempSync(path.join(tmpdir(), 'coldlaunch-'));
try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/offline-write.ts', 'src/lib/local-date.ts',
        '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway. */
  }
  const ow = path.join(out, 'offline-write.js');
  writeFileSync(
    ow,
    readFileSync(ow, 'utf8')
      .replace('require("@/integrations/supabase/client")', 'require("./shim-supabase.js")')
      .replace('require("@/lib/daily-log-service")', 'require("./shim-daily.js")')
      .replace('require("@/lib/local-date")', 'require("./local-date.js")')
      .replace('require("@/lib/weight-sync")', 'require("./shim-weight.js")'),
  );

  /* A stand-in Supabase whose auth timing the test controls, and whose
     PostgREST surface records every statement that left the client. */
  writeFileSync(
    path.join(out, 'shim-supabase.js'),
    `const state = { session: null, initMs: 0, network: [], fail: null };
     const wait = (ms) => new Promise((r) => setTimeout(r, ms));
     const table = (name) => {
       const record = (op) => async (rows) => {
         /* Descending latency, so "arrived in order" can only be true if the
            writes were actually serialised. With every call resolving at the
            same speed, a parallel queue passes an ordering test by luck — the
            same trap Chain F's harness was rewritten to close. */
         await wait(state.latency ? state.latency() : 1);
         state.network.push({ table: name, op, rows });
         return { data: null, error: state.fail ? state.fail(name) : null };
       };
       const api = {
         upsert: record('upsert'), insert: record('insert'),
         update: () => ({ eq: () => ({ eq: async () => ({ data: null, error: null }) }) }),
         select: () => api, eq: () => api, gt: () => api,
         limit: async () => ({ data: [], error: null }),
         maybeSingle: async () => ({ data: null, error: null }),
         single: async () => ({ data: null, error: null }),
       };
       return api;
     };
     module.exports = {
       __state: state,
       __reset(over = {}) {
         state.session = null; state.initMs = 0; state.network = []; state.fail = null; state.latency = null;
         Object.assign(state, over);
       },
       supabase: {
         from: table,
         auth: {
           /* Mirrors @supabase/auth-js 2.110.6: getSession() awaits the
              initialization promise before answering. */
           async getSession() {
             if (state.initMs) await wait(state.initMs);
             return { data: { session: state.session } };
           },
         },
       },
     };\n`,
  );
  writeFileSync(path.join(out, 'shim-daily.js'), 'module.exports = { recomputeDailyLog: async () => {} };\n');
  writeFileSync(path.join(out, 'shim-weight.js'), 'module.exports = { syncProfileWeight: async () => {} };\n');

  const core = path.join(NATIVE, 'node_modules', '@tanstack', 'query-core');
  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const { QueryClient, dehydrate, hydrate, onlineManager } = require(${JSON.stringify(core)});
     const sb = require('./shim-supabase.js');
     const { registerOfflineWrites, OFFLINE_WRITE_KEY, permanentFailure,
             UnusableWriteError, WrongAccountError } = require('./offline-write.js');

     const A = 'aaaaaaaa-1111-1111-1111-111111111111';
     const B = 'bbbbbbbb-2222-2222-2222-222222222222';
     const wait = (ms) => new Promise((r) => setTimeout(r, ms));
     const water = (u, ml, id) => ({ kind: 'water', userId: u, rowId: id, amountMl: ml, date: '2026-08-18', at: '2026-08-18T10:00:00Z' });
     const weight = (u, kg) => ({ kind: 'weight', userId: u, kg, date: '2026-08-18' });
     const o = {};

     /** Queue writes with no signal, then hand back the JSON the persister stores. */
     async function persist(writes, extraQueries) {
       onlineManager.setOnline(false);
       const c = new QueryClient();
       registerOfflineWrites(c);
       if (extraQueries) { c.setQueryData(['profile', A], { user_id: A }); }
       for (const w of writes) {
         c.getMutationCache().build(c, { mutationKey: [...OFFLINE_WRITE_KEY] }).execute(w).catch(() => {});
       }
       await wait(20);
       /* the persister's own default: only paused mutations are stored */
       const json = JSON.stringify(dehydrate(c, {
         shouldDehydrateMutation: (m) => m.state.isPaused,
         shouldDehydrateQuery: () => !!extraQueries,
       }));
       c.clear();
       return json;
     }

     /** A cold launch: fresh client, register, hydrate off disk, resume. */
     async function launch(json, opt = {}) {
       sb.__reset({ session: opt.session === undefined ? { user: { id: A } } : opt.session, initMs: opt.initMs || 0 });
       if (opt.latency) sb.__state.latency = opt.latency;
       onlineManager.setOnline(opt.online !== false);
       const c = new QueryClient();
       registerOfflineWrites(c);
       let threw = null;
       try { hydrate(c, JSON.parse(json)); } catch (e) { threw = e.constructor.name; }
       const paused = c.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
       c.mount();
       if (opt.concurrent) {
         await Promise.all(Array.from({ length: opt.concurrent }, () => c.resumePausedMutations().catch(() => {})));
       } else {
         for (let i = 0; i < (opt.resumes || 1); i++) await c.resumePausedMutations().catch(() => {});
       }
       await wait(60);
       c.unmount();
       const m = c.getMutationCache().getAll();
       return {
         threw, paused,
         net: sb.__state.network.length,
         owners: [...new Set(sb.__state.network.map((n) => n.rows && n.rows.user_id).filter(Boolean))],
         order: sb.__state.network.map((n) => n.rows.amount_ml != null ? 'w' + n.rows.amount_ml : 'k' + n.rows.weight_kg).join(','),
         status: m.map((x) => x.state.status).join(','),
         attempts: m.map((x) => x.state.failureCount).join(','),
         queries: c.getQueryCache().getAll().length,
       };
     }

     (async () => {
       const twoA = await persist([water(A, 250, 'r1'), water(A, 300, 'r2')]);

       /* ── A. identity: hydration is not authorization ── */
       const asA    = await launch(twoA, { session: { user: { id: A } } });
       const asB    = await launch(twoA, { session: { user: { id: B } } });
       const asNone = await launch(twoA, { session: null });
       const slowA  = await launch(twoA, { session: { user: { id: A } }, initMs: 300 });
       o.hydratedPaused = asA.paused;
       o.aNet = asA.net; o.aOwners = asA.owners.join(',');
       o.bNet = asB.net; o.bStatus = asB.status;
       o.noneNet = asNone.net; o.noneStatus = asNone.status;
       o.slowNet = slowA.net; o.slowOwners = slowA.owners.join(',');

       /* ── B. replay only when the network is there, and exactly once ── */
       o.offlineNet = (await launch(twoA, { online: false })).net;
       o.offlineStatus = (await launch(twoA, { online: false })).status;
       o.threeSequential = (await launch(twoA, { resumes: 3 })).net;
       o.threeConcurrent = (await launch(twoA, { concurrent: 3 })).net;

       /* ── C. order survives the disk ── */
       const mixed = await persist([water(A,1,'a'), weight(A,70), water(A,2,'b'), weight(A,71)]);
       /* first write slowest: in parallel they land 71,2,70,1 — reversed. */
       let n = 0;
       const descending = () => { n += 1; return Math.max(4, 40 - n * 8); };
       o.order = (await launch(mixed, { latency: (n = 0, descending) })).order;
       const noScope = JSON.stringify((() => { const x = JSON.parse(mixed); x.mutations.forEach((m) => delete m.scope); return x; })());
       o.orderNoScope = (await launch(noScope, { latency: (n = 0, descending) })).order;

       /* ── D. the session changing under a running replay ── */
       sb.__reset({ session: { user: { id: A } } });
       onlineManager.setOnline(true);
       const c = new QueryClient(); registerOfflineWrites(c);
       hydrate(c, JSON.parse(mixed));
       const running = c.resumePausedMutations().catch(() => {});
       await wait(3);
       sb.__state.session = { user: { id: B } };
       await running; await wait(40);
       o.midFlipOwners = [...new Set(sb.__state.network.map((n) => n.rows.user_id))].join(',');
       o.midFlipNet = sb.__state.network.length;

       /* ── E. records this build cannot perform ── */
       const one = await persist([water(A, 250, 'r1')]);
       const bend = (fn) => { const x = JSON.parse(one); fn(x); return JSON.stringify(x); };
       const unknownKind = await launch(bend((x) => { x.mutations[0].state.variables.kind = 'telepathy'; }));
       const nullVars    = await launch(bend((x) => { x.mutations[0].state.variables = null; }));
       const noVars      = await launch(bend((x) => { delete x.mutations[0].state.variables; }));
       const strVars     = await launch(bend((x) => { x.mutations[0].state.variables = 'nonsense'; }));
       const noOwner     = await launch(bend((x) => { delete x.mutations[0].state.variables.userId; }));
       const noKey       = await launch(bend((x) => { delete x.mutations[0].mutationKey; }));
       const otherKey    = await launch(bend((x) => { x.mutations[0].mutationKey = ['some-future-queue']; }));
       o.unknownKind = unknownKind.status + '/' + unknownKind.net + '/' + unknownKind.attempts;
       o.nullVars    = nullVars.status + '/' + nullVars.net + '/' + nullVars.attempts;
       o.noVars      = noVars.status + '/' + noVars.net;
       o.strVars     = strVars.status + '/' + strVars.net;
       o.noOwner     = noOwner.status + '/' + noOwner.net;
       o.noKey       = noKey.status + '/' + noKey.net;
       o.otherKey    = otherKey.status + '/' + otherKey.net;
       o.anyHydrateThrew = [unknownKind, nullVars, noVars, strVars, noOwner, noKey, otherKey]
         .some((r) => r.threw !== null);

       /* ── F. the classification the retry policy reads ── */
       o.permUnusable = permanentFailure(new UnusableWriteError('x'));
       o.permWrongAccount = permanentFailure(new WrongAccountError('x'));
       o.permRls = permanentFailure({ code: '42501' });
       o.permWeather = permanentFailure(new Error('fetch failed'));

       /* weather still gets its retries */
       sb.__reset({ session: { user: { id: A } } });
       onlineManager.setOnline(true);
       sb.__state.fail = () => ({ message: 'timeout' });
       const cw = new QueryClient(); registerOfflineWrites(cw);
       hydrate(cw, JSON.parse(one));
       await cw.resumePausedMutations().catch(() => {});
       await wait(120);
       o.weatherAttempts = cw.getMutationCache().getAll()[0].state.failureCount;
       o.weatherStatements = sb.__state.network.length;

       /* ── G. the same write replayed after a lost response ── */
       sb.__reset({ session: { user: { id: A } } });
       onlineManager.setOnline(true);
       for (let i = 0; i < 2; i++) {
         const q = new QueryClient(); registerOfflineWrites(q);
         hydrate(q, JSON.parse(one));
         await q.resumePausedMutations().catch(() => {});
         await wait(20);
       }
       o.lostResponseStatements = sb.__state.network.length;
       o.lostResponseSameId = sb.__state.network.every((n) => n.rows.id === sb.__state.network[0].rows.id);
       o.lostResponseIdempotent = sb.__state.network.every((n) => n.op === 'upsert');

       /* ── H. A's query cache next to A's mutation, launched as B ── */
       const withQueries = await persist([water(A, 250, 'r1')], true);
       const bLaunch = await launch(withQueries, { session: { user: { id: B } } });
       o.bWithQueriesNet = bLaunch.net;
       o.bSeesAQueries = bLaunch.queries;

       console.log(JSON.stringify(o));
     })();\n`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A ── */
  want(r.hydratedPaused === 2, `hydrat hoá không khôi phục đủ lệnh ghi đang treo: ${r.hydratedPaused}/2`);
  want(
    r.aNet === 2 && r.aOwners === 'aaaaaaaa-1111-1111-1111-111111111111',
    `khởi động lạnh với ĐÚNG chủ nhân không gửi được lệnh ghi của chính họ: ${r.aNet} câu, chủ ${r.aOwners}`,
  );
  want(
    r.bNet === 0,
    `lệnh ghi của A ĐÃ RA TỚI MẠNG dưới phiên của B: ${r.bNet} câu. Nạp lại từ đĩa là ĐỌC DỮ LIỆU, ` +
      'không phải cấp quyền. Chain F đã chứng minh PostgreSQL từ chối bằng 42501 — đó là lớp phòng ' +
      'thủ thứ hai, độc lập, và không thay được lớp này',
  );
  want(
    r.noneNet === 0,
    `lệnh ghi đã ra tới mạng khi CHƯA BIẾT ai đang đăng nhập: ${r.noneNet} câu`,
  );
  want(
    r.slowNet === 2 && r.slowOwners === 'aaaaaaaa-1111-1111-1111-111111111111',
    `khi phiên đăng nhập về CHẬM (300ms), kết quả khác với khi về nhanh: ${r.slowNet} câu, chủ ${r.slowOwners} ` +
      '— chốt danh tính phải ĐỢI phiên chứ không được đọc một biến đồng bộ. ' +
      'PersistQueryClientProvider nằm NGOÀI AuthProvider và gọi resumePausedMutations ngay khi đọc xong ' +
      'cache, nên thứ giữ cho việc đó an toàn là getSession() chờ initializePromise',
  );

  /* ── B ── */
  want(r.offlineNet === 0 && /pending/.test(r.offlineStatus), `mất mạng mà vẫn gửi: ${r.offlineNet} câu (${r.offlineStatus})`);
  want(
    r.threeSequential === 2 && r.threeConcurrent === 2,
    `gọi resume nhiều lần làm lệnh ghi chạy lại: tuần tự ${r.threeSequential}, đồng thời ${r.threeConcurrent} ` +
      '— phải là 2. Có BA chỗ gọi resume (focus, online, onSuccess của persister), nên chạy chồng nhau là chuyện thường',
  );

  /* ── C ── */
  want(r.order === 'w1,k70,w2,k71', `thứ tự hàng đợi không sống sót qua đĩa: ${r.order}`);
  want(
    r.orderNoScope === 'w1,k70,w2,k71',
    `thứ tự vỡ khi scope không có trong dữ liệu đã lưu: ${r.orderNoScope} — scope phải đến từ ` +
      'setMutationDefaults lúc đăng ký, nên một bản ghi cũ thiếu scope vẫn chạy nối tiếp',
  );

  /* ── D ── */
  want(
    r.midFlipOwners === 'aaaaaaaa-1111-1111-1111-111111111111',
    `phiên đổi sang B GIỮA lúc phát lại và có lệnh ghi chạy dưới danh nghĩa khác: chủ ${r.midFlipOwners}`,
  );

  /* ── E ── */
  want(
    r.unknownKind.startsWith('error/0') && r.unknownKind.endsWith('/1'),
    `một 'kind' build này KHÔNG BIẾT vẫn được coi là ${r.unknownKind.split('/')[0]} với ` +
      `${r.unknownKind.split('/')[1]} câu lệnh — bản đã ship trả về success: switch vét cạn theo KIỂU, ` +
      'nhưng thứ đọc từ đĩa không có kiểu, nên nó rơi khỏi đáy và React Query đọc undefined là "xong". ' +
      'Việc của người dùng bị xoá và app ghi nhận là đã làm',
  );
  want(
    r.nullVars.startsWith('error/0') && r.noVars.startsWith('error/0') &&
      r.strVars.startsWith('error/0') && r.noOwner.startsWith('error/0'),
    `bản ghi hỏng cấu trúc không bị từ chối sạch: null=${r.nullVars} thiếu=${r.noVars} ` +
      `chuỗi=${r.strVars} không-chủ=${r.noOwner}`,
  );
  want(
    r.unknownKind.endsWith('/1') && r.nullVars.endsWith('/1'),
    `một bản ghi KHÔNG BAO GIỜ chạy được vẫn bị thử lại như thời tiết: ` +
      `${r.unknownKind} / ${r.nullVars} — ba lần thử thừa qua bảy giây backoff, và vì cả hàng đợi ` +
      'dùng chung một scope thì mọi lệnh ghi phía sau đứng chờ chừng ấy',
  );
  want(r.noKey.startsWith('error/0') && r.otherKey.startsWith('error/0'), `mutationKey thiếu/lạ: ${r.noKey} / ${r.otherKey}`);
  want(!r.anyHydrateThrew, 'dữ liệu đã lưu hỏng làm hydrate NÉM — một bản ghi hỏng không được kéo sập cả lần khởi động');

  /* ── F ── */
  want(
    r.permUnusable === true && r.permWrongAccount === true && r.permRls === true && r.permWeather === false,
    `phân loại thất bại sai: unusable=${r.permUnusable} wrongAccount=${r.permWrongAccount} ` +
      `rls=${r.permRls} thời tiết=${r.permWeather}`,
  );
  want(
    r.weatherAttempts === 4 && r.weatherStatements === 4,
    `lỗi mạng thật không còn được thử lại: ${r.weatherAttempts} lần, ${r.weatherStatements} câu — ` +
      'đi ra khỏi vùng phủ sóng giữa chừng chính là thứ hàng đợi này tồn tại để chịu',
  );

  /* ── G ── */
  want(
    r.lostResponseStatements === 2 && r.lostResponseSameId && r.lostResponseIdempotent,
    `phát lại sau khi mất phản hồi không còn idempotent: ${r.lostResponseStatements} câu, ` +
      `cùng id=${r.lostResponseSameId}, upsert=${r.lostResponseIdempotent} — id do client tự sinh cộng ` +
      'ignoreDuplicates là thứ khiến một lần gõ 250 ml không thành 500',
  );

  /* ── H ── */
  want(
    r.bWithQueriesNet === 0,
    `cache truy vấn của A nằm cạnh lệnh ghi của A, khởi động dưới B, và lệnh ghi vẫn ra mạng: ${r.bWithQueriesNet}`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   I — one client, one registration, and the resume that hydration triggers
   ───────────────────────────────────────────────────────────────────────── */
{
  const layout = strip(read('src/app/_layout.tsx'));
  const qc = strip(read('src/lib/query-client.ts'));

  /* Two QueryClients hydrating one persisted cache would replay twice. */
  const built = [read('src/lib/query-client.ts'), read('src/app/_layout.tsx')]
    .join('\n')
    .match(/new QueryClient\(/g);
  if (!built || built.length !== 1) {
    problems.push(
      `có ${built ? built.length : 0} lần tạo QueryClient trong query-client.ts + _layout.tsx — ` +
        'hai client cùng nạp một cache đã lưu sẽ phát lại hai lần',
    );
  }
  /* Registration must precede any restore, which module scope is what buys. */
  if (!/^registerOfflineWrites\(queryClient\);$/m.test(qc)) {
    problems.push(
      'registerOfflineWrites không còn chạy ở phạm vi module cạnh chính client đó — một lệnh ghi ' +
        'được nạp lại trước khi hàm của nó tồn tại sẽ bị React Query vứt đi, và từ bên ngoài nhìn ' +
        'giống hệt "app quên mất buổi tập của tôi"',
    );
  }
  if (!/onSuccess=\{[\s\S]{0,120}resumePausedMutations\(\)/.test(layout)) {
    problems.push('resumePausedMutations không còn treo vào onSuccess của persister — hàng đợi chỉ chạy lại khi mạng đổi trạng thái');
  }
  /* Sign-out empties both caches; the mutation cache is the half that matters here. */
  if (!/queryClient\.clear\(\)/.test(qc)) {
    problems.push('clearPersistedCache không còn gọi queryClient.clear() — lệnh ghi đang treo của phiên trước sống sót trong bộ nhớ');
  }
}

if (problems.length) {
  console.log('vòng đời khởi động lạnh còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'khởi động lạnh OK — CHẠY THẬT QueryClient + registerOfflineWrites + applyOfflineWrite qua vòng ' +
    'dehydrate → JSON → hydrate vào một client MỚI, rồi đếm câu lệnh ra tới mạng: đúng chủ → 2 câu ' +
    'mang user_id của A; phiên là B → 0 câu; chưa biết ai → 0 câu; phiên về chậm 300ms → vẫn đúng 2 ' +
    'câu của A (chốt danh tính ĐỢI phiên, thứ khiến việc PersistQueryClientProvider nằm ngoài ' +
    'AuthProvider không thành cuộc đua). Mất mạng thì không gửi; ba lượt resume tuần tự và ba lượt ' +
    'đồng thời đều ra đúng 2; thứ tự w1,k70,w2,k71 sống sót qua đĩa KỂ CẢ khi scope bị xoá khỏi bản ' +
    'lưu; phiên đổi sang B giữa lúc phát lại không cho câu nào chạy dưới tên khác. Bản ghi build này ' +
    "không đọc được — 'kind' lạ, variables null/thiếu/chuỗi, thiếu userId, mutationKey lạ — đều bị " +
    'từ chối ở lần thử ĐẦU TIÊN với 0 câu lệnh (bản đã ship coi kind lạ là THÀNH CÔNG và xoá việc ' +
    'của người dùng trong im lặng), trong khi lỗi mạng thật vẫn giữ nguyên 4 lần thử; và phát lại ' +
    'sau khi mất phản hồi vẫn là upsert cùng một id do client sinh',
);
