/**
 * A write made in a basement arrives once, in order, and under the right name.
 *
 * ── the bugs this was written for ──
 *
 * The offline queue was already durable: `registerOfflineWrites` gives every
 * queued intention a `mutationFn` to come back to, and the mutation cache is
 * persisted, so a workout logged with no signal really does send itself later.
 * What it was not was *correct on the second attempt*.
 *
 * A retry is not a rare event here. React Query retries any failed request, and
 * "failed" includes the case where the server committed the row and the reply
 * never arrived — which is the ordinary shape of walking out of signal range.
 * Measured on PostgreSQL 16.13 with the app's own statements:
 *
 *     t                | count
 *     water            |     2      ← one 250 ml tap became 500 ml
 *     workout          |     2      ← one session counted twice by volume load,
 *     sleep            |     2        ACWR, readiness and the streak
 *     biometrics       |     2
 *
 * and the meal was worse than any of them. `entryId` made the entry idempotent
 * by primary key but the insert still *threw* on a repeat, and the throw is
 * before the items statement:
 *
 *     bua_an | mon_trong_bua | kcal_bua_an
 *          1 |             0 |         520
 *
 * a 520-kcal breakfast with no food in it, permanently.
 *
 * Then the order. `resumePausedMutations` fires the whole queue inside one
 * `Promise.all`, and an unscoped mutation's `canRun` returns `true`
 * unconditionally, so which write committed last was whichever the network
 * settled last. Two consequences, both measured: a weight typo corrected twice
 * offline resolves to a coin toss, and two same-day writes rebuilding
 * `daily_logs` at once — eleven reads then one upsert — lose one of each other:
 *
 *     thuc_te_da_an | vong_calo_hien_thi
 *              1200 |                500
 *
 * ── what the rules do, and what they refuse to do ──
 *
 * Rule A drives the **real** `@tanstack/query-core` and the **real**
 * `registerOfflineWrites`: it queues four writes with the network down, freezes
 * the client through `dehydrate` → JSON → `hydrate` into a fresh one (which is
 * what an app restart is), turns the network on and resumes. The double behind
 * `supabase` answers the first write slowest, so "they landed in order" can only
 * be true because they were *sent* in order.
 *
 * Rule D is the one place this file reads rather than runs, and it reads the
 * shape that cannot be exercised without a database: every insert-shaped write
 * names `id` as its conflict target and ignores duplicates.
 *
 * None of this is the account boundary. That is RLS, server-side, and Chain E
 * measured it: all eight statements replayed under a second account are refused
 * with 42501. Rule E only checks that the client does not knowingly try.
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

const SRC = 'src/lib/offline-write.ts';

/* ─────────────────────────────────────────────────────────────────────────
   Rules A–C — run the real queue
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'offlineq-'));
try {
  try {
    execFileSync(
      'npx',
      ['tsc', SRC, '--ignoreConfig', '--outDir', out, '--module', 'commonjs',
        '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway.
       The requires are rewritten to the doubles just below. */
  }

  const js = path.join(out, 'offline-write.js');
  writeFileSync(
    js,
    readFileSync(js, 'utf8')
      .replace('require("@/integrations/supabase/client")', 'require("./supabase.cjs")')
      .replace('require("@/lib/daily-log-service")', 'require("./noop.cjs")')
      .replace('require("@/lib/local-date")', 'require("./localdate.cjs")')
      .replace('require("@/lib/weight-sync")', 'require("./noop.cjs")'),
  );

  /*
    A supabase double that records the statements and can be told how to fail.
    `delay` is what gives rule A its teeth: without a per-write latency, four
    writes resolving instantly come back in order whether or not anything
    serialised them.
  */
  writeFileSync(
    path.join(out, 'supabase.cjs'),
    `const log = [];
     let plan = () => ({ error: null });
     let session = { data: { session: { user: { id: 'A' } } } };
     const table = (name) => {
       const call = (op) => (values, opts) => {
         const rows = Array.isArray(values) ? values : [values];
         const res = plan({ op, table: name, rows, opts });
         if (res.error) return Promise.resolve({ error: res.error });
         return new Promise((resolve) => setTimeout(() => {
           for (const r of rows) log.push({ op, table: name, id: r.id ?? null, user_id: r.user_id ?? null, opts });
           resolve({ error: null });
         }, res.delay ?? 0));
       };
       return { insert: call('insert'), upsert: call('upsert') };
     };
     module.exports = {
       supabase: { from: table, auth: { getSession: async () => session } },
       _log: log,
       _reset: () => { log.length = 0; plan = () => ({ error: null }); },
       _plan: (fn) => { plan = fn; },
       _signIn: (id) => { session = { data: { session: id ? { user: { id } } : null } }; },
     };`,
  );
  writeFileSync(
    path.join(out, 'noop.cjs'),
    'module.exports = { recomputeDailyLog: async () => {}, syncProfileWeight: async () => {} };',
  );
  writeFileSync(
    path.join(out, 'localdate.cjs'),
    "module.exports = { localDateStr: (d) => (d ?? new Date()).toISOString().slice(0, 10) };",
  );

  const core = path.join(NATIVE, 'node_modules/@tanstack/query-core');
  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const { QueryClient, onlineManager, dehydrate, hydrate } = require(${JSON.stringify(core)});
     const ow = require('./offline-write.js');
     const stub = require('./supabase.cjs');
     const A = 'A';
     const uid = (n) => '0f000000-0000-0000-0000-0000000000' + String(n).padStart(2, '0');
     const water = (n) => ({ kind: 'water', userId: A, rowId: uid(n), amountMl: n * 100, date: '2026-08-18', at: '2026-08-18T08:00:00Z' });
     const fresh = () => { const c = new QueryClient(); ow.registerOfflineWrites(c); return c; };
     const fire = (c, v) => c.getMutationCache().build(c, { mutationKey: ['offline-write'] }).execute(v).catch(() => {});
     const settle = () => new Promise((r) => setTimeout(r, 40));

     (async () => {
       const o = {};

       /* ── A. offline → persisted → app restart → replay, in order ── */
       stub._reset();
       stub._signIn(A);
       /* first write is slowest: concurrent replay lands it LAST */
       stub._plan(({ rows }) => ({ error: null, delay: 90 - Number(String(rows[0].id).slice(-2)) * 18 }));
       onlineManager.setOnline(false);
       let c = fresh();
       for (let i = 1; i <= 4; i++) fire(c, water(i));
       await settle();
       o.paused = c.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
       o.landedOffline = stub._log.length;
       const frozen = JSON.parse(JSON.stringify(dehydrate(c)));
       o.persisted = frozen.mutations.length;

       c = fresh();                 // a new process
       hydrate(c, frozen);
       onlineManager.setOnline(true);
       await c.resumePausedMutations();
       await settle();
       o.replayed = stub._log.map((l) => Number(String(l.id).slice(-2)));

       /* ── B. a permanent refusal is attempted once ── */
       stub._reset();
       let n = 0;
       stub._plan(() => { n++; return { error: Object.assign(new Error('rls'), { code: '42501' }) }; });
       c = fresh();
       await fire(c, water(9));
       o.attemptsPermanent = n;

       /* ── C. weather still retries, and still lands ── */
       stub._reset();
       let t = 0;
       stub._plan(() => { t++; return t < 3 ? { error: new Error('Network request failed') } : { error: null }; });
       c = fresh();
       c.setMutationDefaults(['offline-write'], { ...c.getMutationDefaults(['offline-write']), retryDelay: 1 });
       await fire(c, water(10));
       o.attemptsTransient = t;
       o.transientLanded = stub._log.length;

       /* ── E. a queued write does not go out under another account ── */
       stub._reset();
       stub._signIn('B');
       let sent = 0;
       stub._plan(() => { sent++; return { error: null }; });
       c = fresh();
       await fire(c, water(11));
       o.statementsUnderWrongAccount = sent;
       stub._signIn(A);

       console.log(JSON.stringify(o));
     })();`,
  );

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' });
  const r = JSON.parse(raw.trim().split('\n').pop());

  if (r.paused !== 4 || r.persisted !== 4 || r.landedOffline !== 0) {
    problems.push(
      `mất mạng: ${r.paused}/4 tạm dừng, ${r.persisted}/4 được lưu, ${r.landedOffline} đã gửi — ` +
        'hàng đợi ngoại tuyến không còn giữ được lệnh ghi qua một lần khởi động lại',
    );
  }
  if (r.replayed.length !== 4) {
    problems.push(
      `sau khi khởi động lại chỉ ${r.replayed.length}/4 lệnh ghi được gửi — ` +
        'phần còn lại là những thứ người dùng đã ghi và app đã quên',
    );
  } else if (r.replayed.join(',') !== '1,2,3,4') {
    problems.push(
      `hàng đợi phát lại theo thứ tự ${r.replayed.join(',')} chứ không phải thứ tự đã ghi 1,2,3,4 — ` +
        'hai lệnh ghi cùng ngày chạy song song: bản sửa cân nặng thứ hai có thể thua bản thứ nhất, ' +
        'và hai lần dựng lại daily_logs (11 lần đọc rồi một lần ghi) nuốt lẫn nhau — ' +
        'đo thật: ăn 1200 kcal, vòng calo hiện 500',
    );
  }
  if (r.attemptsPermanent !== 1) {
    problems.push(
      `một lệnh ghi bị RLS từ chối (42501) vẫn được gửi ${r.attemptsPermanent} lần — ` +
        'gửi lại không đổi được câu trả lời, chỉ giữ cả hàng đợi đứng sau nó trong lúc chờ',
    );
  }
  if (r.attemptsTransient < 2 || r.transientLanded !== 1) {
    problems.push(
      `mất mạng giữa chừng: gửi ${r.attemptsTransient} lần, ${r.transientLanded} lệnh ghi tới nơi — ` +
        'phân loại lỗi đã đi quá tay và giờ vứt luôn cả những lỗi chỉ là thời tiết',
    );
  }
  if (r.statementsUnderWrongAccount !== 0) {
    problems.push(
      `một lệnh ghi của tài khoản khác vẫn phát ra ${r.statementsUnderWrongAccount} câu lệnh — ` +
        'RLS sẽ từ chối (đo thật: 42501 cả tám câu), nhưng client không được biết mà vẫn gửi',
    );
  }
} catch (e) {
  problems.push(`không dựng được phép thử hàng đợi: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — every insert-shaped write is replay-safe by construction
   ───────────────────────────────────────────────────────────────────────── */
{
  const src = strip(read(SRC));

  /** Each `case '<kind>': { … }` body, by brace matching. */
  const cases = new Map();
  for (const m of src.matchAll(/case '(\w+)':\s*\{/g)) {
    let i = m.index + m[0].length - 1;
    let depth = 0;
    let end = i;
    for (; end < src.length; end++) {
      if (src[end] === '{') depth++;
      else if (src[end] === '}' && --depth === 0) break;
    }
    cases.set(m[1], src.slice(i, end + 1));
  }

  if (cases.size < 6) {
    problems.push(`chỉ đọc được ${cases.size} nhánh trong applyOfflineWrite — bộ dò lạc mục tiêu`);
  }

  /**
   * The two that are corrections rather than events: both upsert on a natural
   * key, which is a stronger guarantee than a minted id and is why they were
   * the only two already safe.
   */
  const BY_NATURAL_KEY = new Map([
    ['weight', 'user_id,date'],
    ['measurement', 'user_id,date'],
  ]);

  for (const [kind, body] of cases) {
    const natural = BY_NATURAL_KEY.get(kind);
    if (natural) {
      if (!body.includes(`onConflict: '${natural}'`)) {
        problems.push(
          `applyOfflineWrite '${kind}': không còn upsert theo khoá tự nhiên ${natural} — ` +
            'một bản sửa phát lại sẽ bị từ chối và con số SAI là con số sống sót',
        );
      }
      continue;
    }
    /* Everything else records an event, and an event replayed must be a no-op. */
    const writes = [...body.matchAll(/\.(insert|upsert)\(/g)].map((x) => x[1]);
    if (writes.length === 0) {
      problems.push(`applyOfflineWrite '${kind}': không tìm thấy lệnh ghi nào — bộ dò lạc mục tiêu`);
      continue;
    }
    if (writes.includes('insert')) {
      problems.push(
        `applyOfflineWrite '${kind}': còn dùng .insert() — gửi lại sau khi máy chủ đã ghi ` +
          'mà hồi đáp bị mất sẽ tạo dòng THỨ HAI (đo thật trên PostgreSQL 16.13: 2 dòng)',
      );
    }
    const guarded = (body.match(/IDEMPOTENT/g) ?? []).length;
    if (guarded < writes.length) {
      problems.push(
        `applyOfflineWrite '${kind}': ${writes.length} lệnh ghi nhưng chỉ ${guarded} lệnh dùng IDEMPOTENT — ` +
          'một lệnh ghi không được bảo vệ là một lần phát lại nhân đôi dữ liệu',
      );
    }
    if (!/\bid: w\.(rowId|entryId)\b/.test(body) && !/id: it\.id|\.\.\.it\b/.test(body)) {
      problems.push(
        `applyOfflineWrite '${kind}': không cấp id do client sinh — ` +
          'không có khoá thì ON CONFLICT không có gì để bám, và mỗi lần gửi lại là một dòng mới',
      );
    }
  }

  /* And the id has to be minted at the tap, not here: minting inside the
     handler produces a new one on every retry, which is no idempotency at all. */
  if (/randomUUID/.test(src)) {
    problems.push(
      'offline-write.ts tự sinh uuid — id phải được đúc tại chỗ bấm và đi theo biến của mutation, ' +
        'sinh ở đây thì mỗi lần gửi lại là một id khác và tính idempotent biến mất',
    );
  }

  /* The session guard, which turns a bare 42501 into a named refusal. */
  if (!/getSession\(\)/.test(src) || !/WrongAccountError/.test(src)) {
    problems.push(
      'applyOfflineWrite không đối chiếu phiên đang đăng nhập với userId của lệnh ghi — ' +
        'RLS vẫn chặn, nhưng lỗi hiện ra là một mã 42501 trần trong đường chạy không thuộc màn hình nào',
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule F — the queue is registered before anything can restore it
   ───────────────────────────────────────────────────────────────────────── */
{
  const qc = strip(read('src/lib/query-client.ts'));
  if (!/^registerOfflineWrites\(queryClient\);/m.test(qc)) {
    problems.push(
      'registerOfflineWrites không còn chạy ở phạm vi module của query-client.ts — ' +
        'PersistQueryClientProvider đọc lại bộ nhớ đệm ngay khi mount, và một lệnh ghi khôi phục ' +
        'trước khi hàm của nó tồn tại thì bị React Query vứt đi, không phân biệt được với ' +
        '"app quên mất buổi tập của tôi"',
    );
  }
  const layout = strip(read('src/app/_layout.tsx'));
  if (!/onSuccess=\{\(\)\s*=>\s*\{[\s\S]{0,120}resumePausedMutations\(\)/.test(layout)) {
    problems.push(
      '_layout.tsx không gọi resumePausedMutations trong onSuccess của PersistQueryClientProvider — ' +
        'lệnh ghi được khôi phục nhưng không ai bảo nó chạy tiếp',
    );
  }
}

if (problems.length) {
  console.log('hàng đợi ngoại tuyến còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hàng đợi ngoại tuyến OK — chạy THẬT @tanstack/query-core và registerOfflineWrites thật: ' +
    '4 lệnh ghi tạo lúc mất mạng đều tạm dừng, đều được lưu, không cái nào gửi đi; ' +
    'đóng băng qua dehydrate → JSON → hydrate vào một client MỚI (đúng nghĩa khởi động lại app) ' +
    'rồi bật mạng thì cả 4 gửi đúng thứ tự đã ghi — và con thoi trả lời lệnh ghi ĐẦU TIÊN chậm nhất, ' +
    'nên "đúng thứ tự" chỉ có thể đúng vì chúng được GỬI tuần tự (bỏ scope ra thì thứ tự đảo thành 4,3,2,1); ' +
    'lỗi vĩnh viễn (RLS 42501) chỉ gửi 1 lần thay vì 4, lỗi thời tiết vẫn gửi lại và vẫn tới nơi; ' +
    'lệnh ghi của tài khoản khác không phát ra câu lệnh nào. ' +
    'Và mọi nhánh ghi-sự-kiện đều upsert theo id do client đúc với ignoreDuplicates — ' +
    'bản đã ship dùng .insert() và đo thật trên PostgreSQL 16.13 cho 2 dòng nước, 2 buổi tập, ' +
    '2 đêm ngủ, 2 lần đo sinh trắc sau một lần phát lại, còn bữa ăn thì ném ở câu đầu nên ' +
    'để lại một bữa 520 kcal KHÔNG CÓ MÓN NÀO; hai nhánh sửa (cân nặng, số đo) vẫn upsert ' +
    'theo khoá tự nhiên user_id,date',
);
