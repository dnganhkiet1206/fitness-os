/**
 * The one thing in this app that spends real coins on a client's say-so.
 *
 * ── what the audit found, and did not find ──
 *
 * Almost everything here was already right, and that is worth stating because
 * the rules below exist to keep it that way rather than to describe a wreck.
 * Measured against a cluster rebuilt from every migration in this directory:
 * `buy_streak_freeze()` accepts **no** arguments in any forged shape, the price
 * comes from `shop_prices`, the balance floor holds at 149 / 150 / 0, the hold
 * cap holds at two, 100 concurrent buyers against a 150-coin wallet produce
 * exactly one purchase, 100 concurrent spenders on one day produce exactly one
 * spend and **zero** exceptions, and RLS refuses every cross-account write
 * including one to your own row.
 *
 * ── the one defect ──
 *
 * The purchase was not idempotent. `buy_streak_freeze` minted its own ledger
 * key — `'freeze:' || gen_random_uuid()` — so nothing on the server could tell
 * a retry from a second purchase, and a client cannot tell "committed, answer
 * lost" from "never happened". From a 500-coin wallet, 100 runs of 100:
 *
 *     mua → mất phản hồi → thử lại   bal=200  debits=2  freezes=2
 *
 * One intention, charged twice, on the only 150-coin item in the app. The hold
 * cap bounds it at two and the person does end up holding the second freeze, so
 * it is a P3 rather than a mint — but it is still money for nothing asked for.
 *
 * The fix uses the constraint that was already there: the ledger has carried
 * `UNIQUE(user_id, ref_key)` since 20260718120000, which *is* an idempotency
 * key, and was only failing to act as one because the key was random. See
 * 20260820120000.
 *
 * ── the invariant nobody had written down ──
 *
 * `FREEZE_MAX` and the freeze window are load-bearing on each other. The guard
 * walks back at most `FREEZE_MAX` days from the device's local yesterday, and
 * the server refuses anything older than `CURRENT_DATE - 3` — where
 * `CURRENT_DATE` is UTC and the device's date can be a day behind it. Measured
 * across nine timezones and every hour of the day, `p_date - CURRENT_DATE` lands
 * in exactly `[-3, +1]`: the window is the right size **and has no slack at
 * either end**. Raise the cap to three and the oldest rescue starts raising
 * `freeze window` at a red toast for everybody west of Greenwich. Rule W below
 * is that relation, executable, so it cannot be broken by editing one side.
 */
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const notes = [];
const out = mkdtempSync(path.join(tmpdir(), 'zfreeze-'));
const want = (ok, m) => { if (!ok) problems.push(m); };
const sh = (c) => { try { return { status: 0, stdout: execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; } catch (e) { return { status: e.status ?? 1, stdout: (e.stdout || '') + (e.stderr || '') }; } };

const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
/* Derived from the temp directory, so two runs on one machine cannot land on
   the same port — see the data_directory assertion below for the case where one
   does anyway. */
/* Below the ephemeral range (32768-60999 on Linux): a port inside it can be
   taken by any outbound socket, and under a full `check.mjs` run there are
   many. Standalone this file was green and inside the suite it failed with
   "khong khoi dong duoc PostgreSQL" — bisected to the parent commit, where it
   failed identically, so it is the port and not the change. */
const PORT = 25000 + (Math.abs([...path.basename(out)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) | 0, 7)) % 400);
const DATA = path.join(out, 'pg');
function stopCluster() {
  if (!PGBIN || !existsSync(DATA)) return;
  /* Through `su postgres`, because `pg_ctl` refuses to run as root and a plain
     call leaves the postmaster holding the port for the next run. */
  const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
  const cmd = `${PGBIN}/pg_ctl -D ${DATA} stop -m immediate`;
  sh(asPg ? `su postgres -c ${JSON.stringify(cmd)} 2>/dev/null` : `${cmd} 2>/dev/null`);
}

try {
  /* ════════════════════════════════════════════════════════════════════════
     W. the cap and the window, as one executable relation
     ════════════════════════════════════════════════════════════════════════ */
  const roomSrc = readFileSync(path.join(NATIVE, 'src/lib/mascot-room.ts'), 'utf8');
  const freezeMax = Number(roomSrc.match(/export const FREEZE_MAX\s*=\s*(\d+)/)?.[1]);
  const freezeSql = readdirSync(path.join(ROOT, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql')).sort()
    .map((f) => readFileSync(path.join(ROOT, 'supabase/migrations', f), 'utf8')).join('\n');
  /* The last definition wins, so read the last match rather than the first. */
  const backMatches = [...freezeSql.matchAll(/p_date\s*<\s*CURRENT_DATE\s*-\s*(\d+)/g)];
  const fwdMatches = [...freezeSql.matchAll(/p_date\s*>\s*CURRENT_DATE\s*\+\s*(\d+)/g)];
  const windowBack = backMatches.length ? Number(backMatches[backMatches.length - 1][1]) : NaN;
  const windowFwd = fwdMatches.length ? Number(fwdMatches[fwdMatches.length - 1][1]) : NaN;
  want(
    Number.isFinite(freezeMax) && Number.isFinite(windowBack) && Number.isFinite(windowFwd),
    `không đọc được FREEZE_MAX (${freezeMax}) hoặc cửa sổ ngày (−${windowBack}/+${windowFwd}) — luật W không kiểm gì cả`,
  );
  /* `useStreakGuard` only spends when the gap fits the drawer, so the oldest day
     it can ever send is `local_today - FREEZE_MAX`. The device's local date runs
     up to one day behind UTC, so the oldest `p_date - CURRENT_DATE` is
     `-(FREEZE_MAX + 1)`. Measured across nine timezones × 24 hours: exactly −3
     with FREEZE_MAX = 2. */
  want(
    freezeMax + 1 <= windowBack,
    `FREEZE_MAX=${freezeMax} không lọt cửa sổ lùi −${windowBack}: ngày cũ nhất mà useStreakGuard gửi được là ` +
      `local_today − ${freezeMax}, và ngày địa phương chạy sau UTC tới một ngày, nên p_date − CURRENT_DATE ` +
      `xuống tới −${freezeMax + 1}. use_streak_freeze sẽ ném "freeze window" cho ngày cũ nhất, ở mọi múi giờ ` +
      'phía tây — một cái toast đỏ trên đúng lần cứu quan trọng nhất. Hai con số này ràng buộc nhau; ' +
      'đổi một bên thì phải đổi bên kia',
  );
  want(
    windowFwd >= 1,
    `cửa sổ tiến +${windowFwd} quá hẹp: ngày địa phương chạy TRƯỚC UTC tới một ngày ở phía đông ` +
      '(Kiritimati, Chatham), nên hôm nay của họ là CURRENT_DATE + 1',
  );
  /* And it must not be loose either — a wide window is a retroactive rescue,
     which is the one thing a freeze must never be. */
  want(
    windowBack <= freezeMax + 1,
    `cửa sổ lùi −${windowBack} rộng hơn mức FREEZE_MAX=${freezeMax} cần (−${freezeMax + 1}) — ` +
      'mua freeze sau khi đã ngã không phải là lưới an toàn, và chuỗi ngày mất hết ý nghĩa nếu làm được',
  );

  /* ════════════════════════════════════════════════════════════════════════
     O. the streak, against an oracle that imports none of it
     ════════════════════════════════════════════════════════════════════════ */
  {
    const libOut = path.join(out, 'lib');
    try {
      execFileSync('npx', ['tsc', 'src/lib/streak.ts', 'src/lib/local-date.ts', '--ignoreConfig',
        '--outDir', out, '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020',
        '--skipLibCheck', '--lib', 'es2020,dom'], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* `@/` unmapped → TS2307; tsc emits anyway */ }
    for (const rel of ['streak.js', 'local-date.js']) {
      const p = path.join(libOut, rel);
      writeFileSync(p, readFileSync(p, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, x) => `require("../${x}")`));
    }
    const { streakFrom, missedDates, STREAK_WINDOW } = createRequire(import.meta.url)(path.join(libOut, 'streak.js'));

    /* Day arithmetic by UTC epoch on the date string — a different mechanism
       from the production `parseLocalDate` walk, so agreement is evidence. */
    const toN = (s) => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d) / 86400000; };
    const toS = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
    const oracle = (datesDesc, today, frozen) => {
      const T = toN(today);
      const logged = new Set(datesDesc.filter((d) => toN(d) <= T).map(toN));
      const covered = new Set([...logged, ...frozen.map(toN).filter((n) => n !== T)]);
      if (covered.size === 0) return { count: 0, loggedToday: false };
      const end = covered.has(T) ? T : covered.has(T - 1) ? T - 1 : null;
      if (end === null) return { count: 0, loggedToday: false };
      let count = 0;
      for (let n = end; covered.has(n); n--) count++;
      return { count, loggedToday: logged.has(T) };
    };
    const oracleMissed = (datesDesc, today, frozen) => {
      if (datesDesc.length === 0) return [];
      const T = toN(today);
      const covered = new Set([...datesDesc.map(toN), ...frozen.map(toN)]);
      const o = [];
      for (let i = 0, n = T - 1; i < STREAK_WINDOW && !covered.has(n); i++, n--) o.push(toS(n));
      return o.reverse();
    };
    let seed = 20260820;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let bad = 0, badMissed = 0, sample = null, sawFrozen = 0, sawFuture = 0;
    const TODAY = '2026-08-19', T = toN(TODAY);
    for (let t = 0; t < 1000; t++) {
      const days = new Set();
      for (let i = 0, n = Math.floor(rnd() * 30); i < n; i++) {
        /* A quarter of the runs carry a future-dated row — a phone whose clock
           is a day fast writes one, and `streakFrom` drops it by contract. */
        if (rnd() < 0.08) { days.add(T + 1 + Math.floor(rnd() * 40)); sawFuture++; }
        else days.add(T - Math.floor(rnd() * 40));
      }
      const frozen = [];
      for (let i = 0, n = Math.floor(rnd() * 3); i < n; i++) frozen.push(toS(T - Math.floor(rnd() * 5)));
      if (frozen.length) sawFrozen++;
      /* De-duplicated because `daily_logs` carries UNIQUE(user_id, date) — twice
         — so the production query cannot hand this function the same day more
         than once. Feeding duplicates would be testing a call that never
         happens; it also diverges, which is recorded in the ledger. */
      const datesDesc = [...days].sort((a, b) => b - a).map(toS);
      const got = streakFrom(datesDesc, TODAY, frozen);
      const wantS = oracle(datesDesc, TODAY, frozen);
      if (got.count !== wantS.count || got.loggedToday !== wantS.loggedToday) {
        bad++; if (!sample) sample = { datesDesc: datesDesc.slice(0, 8), frozen, got, want: wantS };
      }
      if (JSON.stringify(missedDates(datesDesc, TODAY, frozen)) !== JSON.stringify(oracleMissed(datesDesc, TODAY, frozen))) badMissed++;
    }
    want(sawFrozen > 100 && sawFuture > 20, `bộ sinh chưa chạm tới freeze (${sawFrozen}) hoặc hàng tương lai (${sawFuture}) — luật oracle xanh một cách rỗng`);
    want(bad === 0, `streakFrom lệch với oracle ĐỘC LẬP ở ${bad}/1000 trạng thái: ${JSON.stringify(sample)}`);
    want(badMissed === 0, `missedDates lệch với oracle ở ${badMissed}/1000 trạng thái`);
  }

  /* ════════════════════════════════════════════════════════════════════════
     C. the client mints one id per intention, not one per attempt
     ════════════════════════════════════════════════════════════════════════ */
  {
    const shimPkg = (rel, body) => {
      const dir = path.join(out, 'node_modules', rel);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
      writeFileSync(path.join(dir, 'index.js'), body);
    };
    shimPkg('@react-native-async-storage/async-storage',
      `const s=new Map(); const A={async getItem(k){return s.has(k)?s.get(k):null},async setItem(k,v){s.set(k,String(v))},async removeItem(k){s.delete(k)}};
       module.exports=A; module.exports.default=A;`);
    shimPkg('expo-crypto', `let n=0; exports.randomUUID=()=>'req-'+(++n);`);
    shimPkg('@tanstack/react-query', `
      exports.useMutation=(o)=>({ mutate:(v,cb)=>o.mutationFn(v).then((r)=>{o.onSuccess&&o.onSuccess(r);cb&&cb.onSuccess&&cb.onSuccess(r)})
        .catch((e)=>{cb&&cb.onError&&cb.onError(e)}), mutationFn:o.mutationFn });
      exports.useQuery=()=>({data:undefined});
      exports.useQueryClient=()=>({invalidateQueries(){}});`);
    shimPkg('react', `module.exports={useRef:(v)=>({current:v}),useMemo:(f)=>f(),useEffect:()=>{},useSyncExternalStore:(s,g)=>g(),useState:(v)=>[v,()=>{}]};`);

    const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
    try {
      execFileSync('npx', ['tsc', ...LIB, 'src/hooks/use-mascot-room.ts', '--ignoreConfig', '--outDir', out,
        '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* `@/` unmapped → TS2307 */ }
    for (const rel of [...LIB, 'src/hooks/use-mascot-room.ts']) {
      const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
      writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => {
        let r = path.relative(path.dirname(js), path.join(out, p));
        if (!r.startsWith('.')) r = './' + r;
        return `require(${JSON.stringify(r)})`;
      }));
    }
    mkdirSync(path.join(out, 'integrations/supabase'), { recursive: true });
    writeFileSync(path.join(out, 'integrations/supabase/client.js'), `
      const bus = require('../../cbus.js');
      exports.supabase = {
        rpc: async (fn, args) => { bus.calls.push({ fn, args }); return bus.fail ? { error: new Error('lost') } : { error: null }; },
        from: () => ({ select: () => ({ eq: () => ({ or: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }),
      };`);
    writeFileSync(path.join(out, 'hooks/use-auth.js'), `exports.useAuth = () => ({ user: { id: 'u1' } });`);
    writeFileSync(path.join(out, 'cbus.js'), `module.exports = { calls: [], fail: false };`);

    const driver = path.join(out, 'cdrive.cjs');
    writeFileSync(driver, `
const bus = require('./cbus.js');
const { useBuyFreeze } = require('./hooks/use-mascot-room.js');
const { runUserScopedResets } = require('./lib/user-scoped-reset.js');
const press = async () => { const m = useBuyFreeze(); try { await m.mutationFn(); } catch {} };
(async () => {
  const o = {};
  bus.fail = true;  await press(); await press(); await press();
  o.retryIds = bus.calls.map((c) => c.args && c.args.p_request_id);
  bus.calls.length = 0;
  bus.fail = false; await press();
  const okId = bus.calls[0] && bus.calls[0].args && bus.calls[0].args.p_request_id;
  bus.calls.length = 0;
  await press();
  o.afterSuccess = [okId, bus.calls[0] && bus.calls[0].args && bus.calls[0].args.p_request_id];
  bus.calls.length = 0;
  bus.fail = true;  await press();
  const aId = bus.calls[0].args.p_request_id;
  runUserScopedResets();                       // sign-out, the real seam
  bus.calls.length = 0;
  await press();
  o.acrossAccounts = [aId, bus.calls[0].args.p_request_id];
  o.sendsNoAmount = bus.calls.every((c) => !c.args || (!('p_amount' in c.args) && !('p_price' in c.args)));
  console.log('RESULT ' + JSON.stringify(o));
})().catch((e) => console.log('RESULT ' + JSON.stringify({ harnessError: String(e && e.stack || e) })));
`);
    const raw = execFileSync('node', [driver], { cwd: out, encoding: 'utf8', timeout: 60000 });
    const line = raw.split('\n').find((l) => l.startsWith('RESULT '));
    if (!line) throw new Error('bộ lái client không trả kết quả: ' + raw.slice(0, 300));
    const c = JSON.parse(line.slice(7));
    if (c.harnessError) throw new Error(c.harnessError);
    want(
      c.retryIds.length === 3 && new Set(c.retryIds).size === 1,
      `ba lần thử lại CÙNG MỘT ý định gửi ${new Set(c.retryIds).size} request id khác nhau (${JSON.stringify(c.retryIds)}) — ` +
        'id sinh bên trong mutationFn thì mỗi lần gọi là một id mới, tức là chính cái lỗi đang sửa viết lại bằng chữ khác: ' +
        'máy chủ không thể nhận ra lần thử lại, và người ta bị trừ 150 xu hai lần cho một lần bấm',
    );
    want(
      c.afterSuccess[0] && c.afterSuccess[1] && c.afterSuccess[0] !== c.afterSuccess[1],
      `lần mua SAU khi một lần mua đã thành công dùng lại id cũ (${JSON.stringify(c.afterSuccess)}) — ` +
        'hai lần mua cố ý là hai lần mua, và gộp chúng lại thì người ta trả tiền một lần mà chỉ nhận được một freeze',
    );
    want(
      c.acrossAccounts[0] !== c.acrossAccounts[1],
      `id đang treo của tài khoản trước SỐNG QUA đăng xuất (${JSON.stringify(c.acrossAccounts)}) — ` +
        'lần mua đầu tiên của B sẽ hội tụ vào dòng sổ của A: B không bị trừ tiền và vẫn có freeze',
    );
    want(c.sendsNoAmount, 'client vẫn gửi một khoản tiền hoặc một cái giá qua dây — máy chủ mới là nơi định giá');
  }

  /* ════════════════════════════════════════════════════════════════════════
     DB. everything else, on a real cluster
     ════════════════════════════════════════════════════════════════════════ */
  if (!PGBIN) {
    notes.push('không có PostgreSQL trên máy này — phần cơ sở dữ liệu KHÔNG được chạy, và nói rõ là không chạy');
  } else {
    mkdirSync(DATA, { recursive: true });
    const asPg = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
    if (asPg) sh(`chmod 755 ${out} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    const run = (c) => (asPg ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
    run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
    run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA} -c max_connections=300" -l ${DATA}/log start`);
    sh('sleep 2');
    const psql = (s, db = 'postgres') => { const f = path.join(out, 'q.sql'); writeFileSync(f, s); return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`); };
    if (psql('SELECT 1;').status !== 0) throw new Error('không khởi động được PostgreSQL');
    /*
      ── the cluster answering must be the cluster we just built ──

      It was not, and nothing said so. A run that ends in `problems` still goes
      through the `finally`, but if `pg_ctl stop` does not take, the postmaster
      keeps the port with its data directory deleted out from under it — and the
      NEXT run's `initdb` succeeds, its `pg_ctl start` quietly fails on the busy
      port, and `psql` connects to the corpse. Every rule then measures the
      previous run's database.

      That is how four break-tests here came back with the previous break's
      failure still in them, which reads exactly like a break with no teeth and
      is nothing of the kind. A detector silently pointed at the wrong database
      is worse than one that does not run, so this refuses to continue.
    */
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).stdout.trim();
    if (live !== DATA) {
      throw new Error(
        `cổng ${PORT} đang được giữ bởi một cluster KHÁC (data_directory=${live}, chờ ${DATA}) — ` +
          'một postmaster mồ côi từ lần chạy trước; mọi luật bên dưới sẽ đo nhầm cơ sở dữ liệu',
      );
    }
    psql('CREATE DATABASE zz;');
    psql(`CREATE SCHEMA IF NOT EXISTS auth;
      CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
      CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;
      CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;
      CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
      DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
      GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;`, 'zz');
    for (const m of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d zz -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
    }
    psql('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;', 'zz');
    const tables = Number(sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d zz -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`).stdout.trim());
    want(tables >= 30, `chỉ dựng được ${tables} bảng từ migrations — bộ dò hỏng, đừng tin phần cơ sở dữ liệu`);
    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    psql(`INSERT INTO auth.users (id,email) VALUES ('${A}','a@x'),('${B}','b@x') ON CONFLICT DO NOTHING;`, 'zz');

    const dbOut = spawnSync('node', [writeDbDriver(out, PORT, A, B, NATIVE)], { cwd: out, encoding: 'utf8', timeout: 900000 });
    const dline = (dbOut.stdout || '').split('\n').find((l) => l.startsWith('RESULT '));
    if (!dline) throw new Error('bộ lái CSDL không trả kết quả: ' + ((dbOut.stdout || '') + (dbOut.stderr || '')).slice(0, 500));
    const d = JSON.parse(dline.slice(7));
    if (d.harnessError) throw new Error(d.harnessError);

    /* baseline — an honest purchase must actually happen */
    want(d.honest === '350/1/1', `một lần mua hợp lệ không cho ra 350 xu / 1 chi / 1 freeze (${d.honest}) — hoặc đường thật đã đổi, hoặc bộ dò không còn lái nó`);

    /* 1. price authority */
    want(d.price === 150, `giá freeze trong shop_prices là ${d.price}, không phải 150`);
    want(d.forged.length === 0, `người gọi vẫn đặt được giá hoặc số lượng: ${JSON.stringify(d.forged)} — buy_streak_freeze chỉ được nhận một request id`);

    /* 2. identity from the JWT, not the body */
    want(d.anonBuy === 'not signed in', `một phiên KHÔNG có JWT vẫn mua được freeze (${d.anonBuy})`);
    want(d.anonUse === 'not signed in', `một phiên KHÔNG có JWT vẫn tiêu được freeze (${d.anonUse})`);
    want(d.nullId === 'missing request id', `request id NULL vẫn mua được (${d.nullId}) — không có id thì không có idempotency`);

    /* 3. cross-user isolation */
    want(d.rls.insertOther === 'refused' && d.rls.insertSelf === 'refused',
      `ghi thẳng vào streak_freezes không bị RLS chặn: ${JSON.stringify(d.rls)} — mọi lần ghi phải đi qua hai hàm SECURITY DEFINER`);
    want(d.rls.updateOther === 0 && d.rls.deleteOther === 0 && d.rls.selectOther === 0,
      `A đọc/sửa/xoá được freeze của B: ${JSON.stringify(d.rls)}`);
    want(d.rls.priceEdit === 0 && d.priceAfterEdit === 150, `bảng giá SỬA ĐƯỢC từ một phiên đã đăng nhập (giá còn ${d.priceAfterEdit})`);
    want(d.crossUserId === '350/1/1', `B dùng LẠI request id của A và không bị trừ tiền của chính B (${d.crossUserId}) — idempotency phải theo (user_id, ref_key)`);

    /* 4/16. balance safety */
    want(d.bal149 === '149/0/0', `149 xu vẫn mua được freeze 150 xu (${d.bal149})`);
    want(d.bal150 === '0/1/1', `đúng 150 xu không mua được (${d.bal150})`);
    want(d.bal0 === '0/0/0', `0 xu vẫn mua được (${d.bal0})`);
    want(d.negative === 0, `${d.negative} lượt để lại SỐ DƯ ÂM`);

    /* 5. atomic debit + freeze */
    want(d.atomic === 0, `${d.atomic}/40 lần mua để lại khoản chi và freeze KHÔNG khớp nhau — hai lần ghi phải đi cùng một transaction`);

    /* 6/12. same-day uniqueness and use-freeze idempotency */
    want(d.dupUse === 'true,false' , `tiêu freeze hai lần cùng một ngày cho ra ${d.dupUse} — lần hai phải là false`);
    want(d.dupUse100 === '1/1', `tiêu ×100 cùng ngày không dừng ở đúng một (${d.dupUse100})`);

    /* 7. FREEZE_MAX */
    want(d.capMsg === 'freeze limit' && d.capState === '200/2/2', `trần số freeze giữ được không còn là ${freezeMax} (${d.capMsg}, ${d.capState})`);

    /* 8. race protection, unchanged */
    want(d.raceDiff150 === '0/1/1', `100 người mua ĐỒNG THỜI với 150 xu không ra đúng một lần mua (${d.raceDiff150})`);
    want(d.raceDiff300 === '0/2/2', `100 người mua ĐỒNG THỜI với 300 xu không ra đúng hai lần mua (${d.raceDiff300})`);
    want(d.raceDiff149 === '149/0/0', `100 người mua ĐỒNG THỜI với 149 xu vẫn tiêu được tiền (${d.raceDiff149})`);
    want(d.raceUse === 'spent=1 held=1 true=1 ném=0',
      `100 người tiêu ĐỒNG THỜI cùng một ngày cho ra ${d.raceUse} — 20260817130000 biến cuộc đua thành false chứ không phải một ngoại lệ, ` +
        'và một ngoại lệ ở đây là một toast đỏ trên một lần khởi động mà mọi thứ đều đúng');

    /* 9/10/11/18. purchase idempotency */
    want(d.retrySeq === '350/1/1',
      `mua rồi THỬ LẠI cùng một request id cho ra ${d.retrySeq} — đúng ra 350/1/1. ` +
        'buy_streak_freeze tự sinh ref_key nên máy chủ không phân biệt được lần thử lại với một lần mua thứ hai; ' +
        'đo được 100/100 lần: 500 xu → 200 xu, hai khoản chi, hai freeze cho MỘT ý định',
    );
    want(d.retry10 === '350/1/1', `thử lại 10 lần cùng id cho ra ${d.retry10}`);
    want(d.raceSame500 === '350/1/1', `100 lời gọi ĐỒNG THỜI cùng một request id cho ra ${d.raceSame500} — đúng ra đúng một lần mua`);
    want(d.raceSame150 === '0/1/1', `100 lời gọi đồng thời cùng id với đúng 150 xu cho ra ${d.raceSame150}`);
    want(d.diffIds === '200/2/2', `hai request id KHÁC NHAU phải là hai lần mua (${d.diffIds})`);
    want(d.retryWhenFull === 'ok', `thử lại một id ĐÃ MUA khi ngăn kéo đã đầy bị từ chối (${d.retryWhenFull}) — kiểm idempotency phải đứng TRƯỚC kiểm trần`);

    /* 13/15. the date window */
    want(d.window === '+2:raise,+1:t,+0:t,-1:t,-2:t,-3:t,-4:raise,-30:raise',
      `cửa sổ ngày của use_streak_freeze đã đổi: ${d.window}`);

    /* 17. no coin minting */
    want(d.mint === '25/1', `một freeze đúc thêm xu: thưởng streak ×5 cùng ngày cho ra ${d.mint} — đúng ra 25 xu, một dòng`);
    want(d.mintForged === 25, `thưởng streak vẫn nhận giá của người gọi (${d.mintForged}) — Chain Y đã khoá chỗ này`);
    want(d.useCosts === '0/0', `TIÊU một freeze cũng lấy tiền (số dư/khoản chi = ${d.useCosts}) — tiền trả lúc MUA, tiêu thì miễn phí`);
  }
} catch (e) {
  problems.push(`không dựng được phép thử freeze: ${e.message}`);
} finally {
  stopCluster();
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('freeze chuỗi ngày còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  'freeze chuỗi ngày OK — ' + (PGBIN ? 'PostgreSQL THẬT dựng từ mọi migration' : 'KHÔNG có PostgreSQL (phần CSDL bị bỏ qua)') +
    ', CHẠY THẬT useBuyFreeze, và một oracle chuỗi ngày không import gì từ streak.ts. Lỗi đã sửa: ' +
    'buy_streak_freeze tự sinh ref_key mỗi lần gọi, nên MỘT ý định bị trừ tiền HAI lần khi phản hồi mất — ' +
    'đo được 100/100 lần, 500 xu thành 200. Nay người gọi mang một request id, ref_key là "freeze:<id>", và ' +
    'UNIQUE(user_id, ref_key) — cái ràng buộc vốn đã có từ 20260718120000 — chính là thẩm quyền idempotency: ' +
    '100 lời gọi đồng thời cùng id ra đúng một lần mua. Những thứ VỐN đã đúng và vẫn đúng: giá lấy từ ' +
    'shop_prices và không tham số nào của người gọi đổi được nó, danh tính từ JWT, RLS chặn mọi lần ghi chéo ' +
    'kể cả ghi cho chính mình, sàn số dư ở 149/150/0, khoản chi và freeze luôn đi cùng nhau, trần giữ 2, và ' +
    '20260817130000 biến cuộc đua thành false chứ không phải ngoại lệ ở 100 người tiêu đồng thời. Luật W ' +
    'buộc FREEZE_MAX và cửa sổ ngày vào nhau: lề đo được là ĐÚNG BẰNG 0 ở cả hai đầu.',
);
for (const n of notes) console.log(`  · ${n}`);

/* ────────────────────────────────────────────────────────────────────────── */
function writeDbDriver(out, PORT, A, B, NATIVE) {
  const p = path.join(out, 'dbdrive.cjs');
  writeFileSync(p, String.raw`
const pg = require(${JSON.stringify(path.join(NATIVE, 'node_modules/pg/lib/index.js'))});
const CFG = { host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'zz' };
const A = ${JSON.stringify(A)}, B = ${JSON.stringify(B)};
const RID = (n) => 'aaaaaaaa-0000-0000-0000-' + String(n).padStart(12, '0');
(async () => {
  const conn = async () => { const c = new pg.Client(CFG); await c.connect(); return c; };
  const admin = await conn();
  const seed = async (coins, held = 0, who = A) => {
    await admin.query('DELETE FROM public.streak_freezes');
    await admin.query('DELETE FROM public.mascot_transactions');
    if (coins) await admin.query("INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ($1,$2,'seed','seed:'||gen_random_uuid())", [who, coins]);
    for (let i = 0; i < held; i++) await admin.query('INSERT INTO public.streak_freezes (user_id) VALUES ($1)', [who]);
  };
  const st = async (u = A) => {
    const r = await admin.query("SELECT (SELECT COALESCE(SUM(amount),0)::int FROM public.mascot_transactions WHERE user_id=$1) a,(SELECT count(*)::int FROM public.mascot_transactions WHERE user_id=$1 AND amount<0) b,(SELECT count(*)::int FROM public.streak_freezes WHERE user_id=$1) c", [u]);
    return r.rows[0].a + '/' + r.rows[0].b + '/' + r.rows[0].c;
  };
  /* Every act inside ONE explicit transaction with SET LOCAL — outside one it
     is a no-op and every RLS conclusion would be worthless. */
  const call = async (c, uid, sql, params) => {
    try {
      await c.query('BEGIN'); await c.query('SET LOCAL ROLE authenticated');
      if (uid) await c.query("SET LOCAL request.jwt.claim.sub = '" + uid + "'");
      const r = await c.query(sql, params || []);
      await c.query('COMMIT');
      return { ok: true, v: r.rows[0] ? Object.values(r.rows[0])[0] : null };
    } catch (e) { await c.query('ROLLBACK').catch(() => {}); return { ok: false, e: e.message }; }
  };
  const err = (r) => (r.ok ? 'ok' : (r.e.match(/^(.*?)$/m) || [''])[0]);
  const pool = async (n) => { const cs = []; for (let i = 0; i < n; i++) cs.push(await conn()); return cs; };
  const close = (cs) => Promise.all(cs.map((c) => c.end()));
  const BUY = 'SELECT public.buy_streak_freeze($1)';
  const o = {};
  const c = await conn();

  await seed(500); await call(c, A, BUY, [RID(1)]); o.honest = await st();
  o.price = (await admin.query("SELECT price FROM public.shop_prices WHERE item_key='streak_freeze'")).rows[0].price;

  o.forged = [];
  for (const sql of ['SELECT public.buy_streak_freeze(150)', 'SELECT public.buy_streak_freeze(0)',
    "SELECT public.buy_streak_freeze(p_amount => 0)", "SELECT public.buy_streak_freeze(p_price => 0)",
    "SELECT public.buy_streak_freeze(p_count => 5)", "SELECT public.buy_streak_freeze(p_user_id => '" + B + "'::uuid)"]) {
    await seed(500);
    const r = await call(c, A, sql);
    if (r.ok) o.forged.push(sql);
  }

  await seed(500);
  o.anonBuy = err(await call(c, null, BUY, [RID(2)]));
  o.anonUse = err(await call(c, null, 'SELECT public.use_streak_freeze(CURRENT_DATE - 1)'));
  o.nullId = err(await call(c, A, 'SELECT public.buy_streak_freeze(NULL::uuid)'));

  await seed(500);
  await admin.query("INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ($1,500,'seed','seed:b')", [B]);
  await call(c, B, BUY, [RID(3)]);
  o.rls = {
    insertOther: (await call(c, A, "INSERT INTO public.streak_freezes (user_id) VALUES ('" + B + "')")).ok ? 'allowed' : 'refused',
    insertSelf: (await call(c, A, "INSERT INTO public.streak_freezes (user_id) VALUES ('" + A + "')")).ok ? 'allowed' : 'refused',
    updateOther: (await call(c, A, "UPDATE public.streak_freezes SET used_on=CURRENT_DATE WHERE user_id='" + B + "'")).ok ? Number((await admin.query("SELECT count(*)::int n FROM public.streak_freezes WHERE user_id=$1 AND used_on IS NOT NULL", [B])).rows[0].n) : -1,
    deleteOther: (await admin.query("SELECT count(*)::int n FROM public.streak_freezes WHERE user_id=$1", [B])).rows[0].n - 1,
    selectOther: Number((await call(c, A, "SELECT count(*)::int FROM public.streak_freezes WHERE user_id='" + B + "'")).v),
    priceEdit: 0,
  };
  await call(c, A, "DELETE FROM public.streak_freezes WHERE user_id='" + B + "'");
  o.rls.deleteOther = Number((await admin.query("SELECT count(*)::int n FROM public.streak_freezes WHERE user_id=$1", [B])).rows[0].n) - 1;
  await call(c, A, "UPDATE public.shop_prices SET price=0 WHERE item_key='streak_freeze'");
  o.priceAfterEdit = (await admin.query("SELECT price FROM public.shop_prices WHERE item_key='streak_freeze'")).rows[0].price;

  /* B reusing A's request id must be B's own purchase, on B's own coins. */
  await seed(500);
  await admin.query("INSERT INTO public.mascot_transactions (user_id,amount,reason,ref_key) VALUES ($1,500,'seed','seed:b')", [B]);
  await call(c, A, BUY, [RID(9)]);
  await call(c, B, BUY, [RID(9)]);
  o.crossUserId = await st(B);

  await seed(149); await call(c, A, BUY, [RID(4)]); o.bal149 = await st();
  await seed(150); await call(c, A, BUY, [RID(5)]); o.bal150 = await st();
  await seed(0);   await call(c, A, BUY, [RID(6)]); o.bal0 = await st();

  o.atomic = 0;
  for (let i = 0; i < 40; i++) {
    await seed(500);
    await call(c, A, BUY, [RID(200 + i)]);
    const r = (await admin.query("SELECT (SELECT count(*)::int FROM public.mascot_transactions WHERE user_id=$1 AND amount<0) d,(SELECT count(*)::int FROM public.streak_freezes WHERE user_id=$1) f", [A])).rows[0];
    if (r.d !== 1 || r.f !== 1) o.atomic++;
  }

  await seed(0, 2);
  const u1 = await call(c, A, 'SELECT public.use_streak_freeze(CURRENT_DATE - 1)');
  const u2 = await call(c, A, 'SELECT public.use_streak_freeze(CURRENT_DATE - 1)');
  o.dupUse = u1.v + ',' + u2.v;
  o.useCosts = (await st()).split('/').slice(0, 2).join('/');   // bal/debits — both must be 0
  await seed(0, 2);
  for (let i = 0; i < 100; i++) await call(c, A, 'SELECT public.use_streak_freeze(CURRENT_DATE - 1)');
  const uu = (await admin.query("SELECT count(*) FILTER (WHERE used_on IS NOT NULL)::int s, count(*) FILTER (WHERE used_on IS NULL)::int h FROM public.streak_freezes WHERE user_id=$1", [A])).rows[0];
  o.dupUse100 = uu.s + '/' + uu.h;

  await seed(500);
  await call(c, A, BUY, [RID(20)]); await call(c, A, BUY, [RID(21)]);
  o.capMsg = err(await call(c, A, BUY, [RID(22)]));
  o.capState = await st();
  o.retryWhenFull = err(await call(c, A, BUY, [RID(21)]));

  await seed(500); await call(c, A, BUY, [RID(30)]); await call(c, A, BUY, [RID(30)]); o.retrySeq = await st();
  await seed(500); for (let i = 0; i < 10; i++) await call(c, A, BUY, [RID(31)]); o.retry10 = await st();
  await seed(500); await call(c, A, BUY, [RID(32)]); await call(c, A, BUY, [RID(33)]); o.diffIds = await st();

  const win = [];
  await seed(0, 2);
  for (const off of [2, 1, 0, -1, -2, -3, -4, -30]) {
    await admin.query("UPDATE public.streak_freezes SET used_on=NULL WHERE user_id=$1", [A]);
    const r = await call(c, A, 'SELECT public.use_streak_freeze(CURRENT_DATE + ' + off + ')');
    win.push((off >= 0 ? '+' : '') + off + ':' + (r.ok ? (r.v ? 't' : 'f') : 'raise'));
  }
  o.window = win.join(',');

  await seed(0);
  for (let i = 0; i < 5; i++) await call(c, A, "SELECT public.claim_quest_reward('d:'||CURRENT_DATE||':streak','streak')");
  const mm = (await admin.query("SELECT COALESCE(SUM(amount),0)::int b, count(*)::int n FROM public.mascot_transactions WHERE user_id=$1 AND amount>0", [A])).rows[0];
  o.mint = mm.b + '/' + mm.n;
  await seed(0);
  o.mintForged = Number((await call(c, A, "SELECT public.earn_mascot_coins('d:'||CURRENT_DATE||':streak',300,'x')")).v);

  o.negative = 0;
  const raceBuy = async (n, coins, sameId) => {
    let last = '';
    for (let t = 0; t < 20; t++) {
      await seed(coins);
      const cs = await pool(n);
      await Promise.all(cs.map((cc, i) => call(cc, A, BUY, [sameId ? RID(500) : RID(600 + i)])));
      last = await st();
      if (Number(last.split('/')[0]) < 0) o.negative++;
      await close(cs);
    }
    return last;
  };
  o.raceSame500 = await raceBuy(100, 500, true);
  o.raceSame150 = await raceBuy(100, 150, true);
  o.raceDiff150 = await raceBuy(100, 150, false);
  o.raceDiff300 = await raceBuy(100, 300, false);
  o.raceDiff149 = await raceBuy(100, 149, false);

  {
    let k = '';
    for (let t = 0; t < 20; t++) {
      await seed(0, 2);
      const cs = await pool(100);
      const rs = await Promise.all(cs.map((cc) => call(cc, A, 'SELECT public.use_streak_freeze(CURRENT_DATE - 1)')));
      const s = (await admin.query("SELECT count(*) FILTER (WHERE used_on IS NOT NULL)::int s, count(*) FILTER (WHERE used_on IS NULL)::int h FROM public.streak_freezes WHERE user_id=$1", [A])).rows[0];
      k = 'spent=' + s.s + ' held=' + s.h + ' true=' + rs.filter((r) => r.ok && r.v === true).length + ' ném=' + rs.filter((r) => !r.ok).length;
      await close(cs);
    }
    o.raceUse = k;
  }

  await c.end(); await admin.end();
  console.log('RESULT ' + JSON.stringify(o));
})().catch((e) => console.log('RESULT ' + JSON.stringify({ harnessError: String(e && e.stack || e) })));
`);
  return p;
}
