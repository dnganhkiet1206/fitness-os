/**
 * A workout that reached the server must reach the projection. (BUG-105)
 *
 * ── the bug ──
 *
 * `use-health-sync` wrote `workout_sessions`, then two `daily_logs` upserts for
 * its own columns — each `if (error) throw error` — and only then the recompute
 * loop. A failure in either health-column write threw **after** the workout rows
 * were on the server and **before** anything rebuilt their days, so the app's two
 * proxies for *"did this person work out?"* disagreed. Measured with a workout
 * nine days old:
 *
 *     bảng workout_sessions     : 1
 *     daily_logs.workout_count  : null
 *     chuỗi ngày tính ngày này  : không
 *
 * And it never repaired: `getRecentWorkouts()` imports seven days, so the next
 * sync's `touchedDays` no longer names that day.
 *
 * ── what this file runs ──
 *
 * The **real `writeHealthSync`**, against a **real PostgreSQL 16.13** built from
 * every migration, with the health-column upserts forced to fail at the
 * transport — which is what an RLS refusal or a dropped connection looks like
 * from the app's side. The rule is in `lib/` precisely so it can be executed
 * here instead of asserted about; a line-number check would prove nothing.
 *
 * The oracle reads `workout_sessions` and never `daily_logs`, so a projection
 * that agrees with itself cannot pass.
 *
 * If PostgreSQL or the `pg` client is missing this **skips loudly**.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

/* ─────────────────────────────────────────────────────────────────────────
   RULE A — structural. Comments are stripped first, so an ordering described
   in prose cannot satisfy any of it (break 9).
   ───────────────────────────────────────────────────────────────────────── */
{
  const hook = strip(read('src/hooks/use-health-sync.ts'));
  const lib = strip(read('src/lib/health-sync-write.ts'));

  /* A1 — the hook writes sources, then hands the projection to one rule. */
  const wIdx = hook.indexOf(".from('workout_sessions')");
  const pIdx = hook.indexOf('writeHealthSync({');
  want(wIdx > 0, 'use-health-sync không còn ghi workout_sessions — bộ dò lạc mục tiêu, đừng tin phần còn lại');
  want(
    pIdx > wIdx,
    'lệnh ghi phép chiếu không còn nằm SAU lệnh ghi workout_sessions — thứ tự này chính là BUG-105',
  );

  /* A2 — and the hook no longer does the projection work itself, which is what
     made it untestable and let the ordering rot. */
  want(
    !/recomputeDailyLog\s*\(/.test(hook),
    'use-health-sync gọi lại recomputeDailyLog trực tiếp — phần dựng lại phải đi qua writeHealthSync, ' +
      'nếu không thì không có gì chạy được nó trong Node và thứ tự lại chỉ còn là một dòng chú thích',
  );

  /* A3 — the two health-column writes record instead of throwing. This is the
     fix itself; `throw` there is BUG-105 restored (breaks 1–3). */
  const measuredBlock = lib.match(/if \(Object\.keys\(measured\)[\s\S]*?\n  \}/)?.[0] ?? '';
  const stepBlock = lib.match(/if \(stepDays\.length[\s\S]*?\n  \}/)?.[0] ?? '';
  for (const [name, block] of [['hôm nay', measuredBlock], ['bù bước chân', stepBlock]]) {
    want(
      /failures\.push\(/.test(block) && !/throw/.test(block),
      `lệnh ghi cột sức khoẻ "${name}" lại NÉM thay vì ghi nhận — một cột của health sync hỏng ` +
        'sẽ lại huỷ phần dựng lại của một buổi tập đã ghi thành công (BUG-105)',
    );
  }

  /* A4 — per-day isolation (break 4). */
  /* Anchored on the loop BODY, not on its iterable expression: the first
     version matched `for (const day of touchedDays(...)` verbatim, so ANY edit
     to that expression tripped this rule instead of the rule it belonged to,
     and a break reported red for the wrong reason. */
  const loop = lib.match(/for \(const day of [\s\S]*?\n  \}/)?.[0] ?? '';
  want(
    /try \{/.test(loop) && /catch/.test(loop) && /recomputeDailyLog/.test(loop),
    'vòng dựng lại không còn cô lập lỗi theo từng ngày — một ngày hỏng sẽ kéo theo mọi ngày sau nó',
  );

  /* A5 — and it still fails. The fix is "do not let one failure cancel
     unrelated work", not "stop reporting". */
  want(
    /if \(failures\.length > 0\)[\s\S]{0,120}?throw new Error/.test(lib),
    'writeHealthSync không còn ném khi có lỗi — mục tiêu là không để một lỗi huỷ việc khác, ' +
      'KHÔNG phải biến mọi lỗi thành thành công; onError phải vẫn nổ',
  );

  /* A6 — the source-side facts every behavioural case rests on (breaks 6, 7). */
  const upsert = hook.match(/from\('workout_sessions'\)[\s\S]{0,700}?\);/)?.[0] ?? '';
  want(
    /volume_load:\s*0\b/.test(upsert) && /sets:\s*\[\]/.test(upsert),
    'buổi tập từ đồng hồ không còn ghi volume_load: 0 và sets: [] — tonnage bịa ra cho một buổi chạy ' +
      'phá đúng cái tỉ lệ mà thẻ tập luyện tồn tại để đáng tin (N6 trong sổ)',
  );
  want(
    /onConflict:\s*'user_id,external_id'/.test(upsert),
    'buổi tập từ đồng hồ không còn upsert theo (user_id, external_id) — mỗi lần đồng bộ lại sẽ chèn thêm bản sao',
  );
  /* The payload itself. `writeHealthSync` does not write workout_sessions and
     the hook cannot be loaded in Node, so this upsert is reachable only
     structurally — which means the rule has to name what it carries, not just
     the options object after it. */
  want(
    /upsert\(\s*\n?\s*workouts\.map\(/.test(upsert),
    'lệnh upsert workout_sessions không còn nhận workouts.map(...) — buổi tập từ đồng hồ sẽ ' +
      'không bao giờ tới bảng, và workout_count vĩnh viễn là 0 cho người chỉ tập bằng đồng hồ',
  );

  /* A7 — the logged-day predicate this whole chain depends on is untouched. */
  const streak = strip(read('src/lib/streak.ts'));
  want(
    /LOGGED_DAY_FILTER\s*=\s*\n?\s*'kcal\.gt\.0,workout_count\.gt\.0,sleep_duration_min\.gt\.0,supplement_taken\.gt\.0'/.test(streak),
    'LOGGED_DAY_FILTER đã đổi — Chain AF không được phép đụng vào nó, và mọi kết luận ở đây giả định nó nguyên vẹn',
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RULE B — behavioural
   ───────────────────────────────────────────────────────────────────────── */
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const PGCLIENT = path.join(NATIVE, 'node_modules', 'pg');

if (!PGBIN || !existsSync(PGCLIENT)) {
  console.log(
    'đồng bộ buổi tập: BỎ QUA phần hành vi — không có PostgreSQL hoặc client pg.\n' +
      '  Phần cấu trúc đã chạy. Một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
  );
} else {
  const out = mkdtempSync(path.join(tmpdir(), 'wsync-'));
  const PORT = 20000 + (Array.from(out).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 41));
  const DATA = path.join(out, 'pg');
  const sh = (cmd) => {
    try { return { code: 0, text: execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { return { code: e.status ?? 1, text: (e.stdout || '') + (e.stderr || '') }; }
  };
  const stopPg = () => sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null`);

  try {
    mkdirSync(DATA, { recursive: true });
    sh(`chmod 755 ${out} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    sh(`su postgres -c "${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust"`);
    const started = sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} -o '-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA} -c max_connections=200' -l ${DATA}/log -w -t 60 start"`);
    if (started.code !== 0) throw new Error(`không khởi động được PostgreSQL: ${started.text.slice(0, 300)}`);

    const psql = (sql, db = 'postgres') => {
      const f = path.join(out, 'q.sql');
      writeFileSync(f, sql);
      return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
    };
    /* Break 10: talking to a leftover postmaster whose data directory is gone
       measures a different database entirely. Chain Z lost three break-tests to
       exactly that, so this is an assertion and not a comment. */
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).text.trim();
    if (live !== DATA) throw new Error(`nói chuyện với cluster KHÁC: ${live} != ${DATA}`);

    psql('CREATE DATABASE app;');
    psql(
      'CREATE SCHEMA IF NOT EXISTS auth;' +
      ' CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT \'{}\'::jsonb, created_at timestamptz DEFAULT now());' +
      ' CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting(\'request.jwt.claim.sub\', true), \'\')::uuid $x$;' +
      ' CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting(\'request.jwt.claim.role\', true), \'\'), \'anon\') $x$;' +
      ' CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;' +
      ' DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
      ' DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
      ' DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;' +
      ' GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;',
      'app',
    );
    for (const m of execFileSync('bash', ['-lc', `ls ${path.join(ROOT, 'supabase', 'migrations')}/*.sql | sort`], { encoding: 'utf8' }).trim().split('\n')) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${m} 2>/dev/null`);
    }
    psql("INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x') ON CONFLICT DO NOTHING;", 'app');

    const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
    try {
      execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
        '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* unmapped @/ raises TS2307; the emit is still written */ }
    for (const rel of LIB) {
      const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
      writeFileSync(js, readFileSync(js, 'utf8')
        .replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`)
        .replace(/require\("\.\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")')
        .replace(/require\("\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")'));
    }
    writeFileSync(path.join(out, 'sb.cjs'), 'let c = null; module.exports = { get supabase() { return c; }, _use: (x) => { c = x; } };');
    writeFileSync(path.join(out, 'shim.cjs'), SHIM(PORT, PGCLIENT));
    writeFileSync(path.join(out, 'drive.cjs'), DRIVER());

    for (const TZ of ['America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'America/Denver', 'America/Phoenix', 'Asia/Ho_Chi_Minh']) {
      const today = execFileSync('node', ['-e', "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
        { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
      const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
        cwd: out, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000,
        env: { ...process.env, TZ, WS_TODAY: today },
      });
      const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
      if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 300)}`);

      want(r.sanity.injectorWorks,
        `${TZ}: bộ tiêm lỗi KHÔNG làm lệnh ghi cột sức khoẻ hỏng — mọi ca dưới đây sẽ vô nghĩa (${JSON.stringify(r.sanity)})`);

      for (const c of r.cases) {
        want(c.ok, `${TZ} · ${c.label}: ${c.why}`);
      }
    }
  } catch (e) {
    problems.push(`không dựng được phép thử đồng bộ buổi tập: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('đồng bộ buổi tập — bất biến hỏng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'đồng bộ buổi tập OK — CHẠY THẬT writeHealthSync trên PostgreSQL 16.13 dựng từ toàn bộ migration, ở SÁU ' +
    'múi giờ, với lệnh ghi cột sức khoẻ bị ép hỏng ngay tại tầng truyền. Một buổi tập đã ghi thành công ' +
    'VẪN tới được daily_logs.workout_count kể cả khi cả hai lệnh ghi steps/active_* đều hỏng — bản đã ship ' +
    'ném ở đó và bỏ luôn vòng dựng lại, nên buổi tập ở ngày -9 nằm trong bảng mà chuỗi ngày không tính, ' +
    'vĩnh viễn, vì getRecentWorkouts chỉ nhập bảy ngày. Một ngày dựng hỏng KHÔNG kéo theo ngày khác. ' +
    'Và hàm VẪN NÉM sau khi đã cứu được mọi thứ cứu được, nên onError vẫn nổ — mục tiêu là không để một ' +
    'lỗi huỷ việc khác, không phải biến lỗi thành thành công. Buổi tập từ đồng hồ giữ volume_load 0 và ' +
    'acwr null; external_id không nhân đôi; buổi tập ghi hỏng không đẻ ra phép chiếu ma; chéo tài khoản sạch.',
);

function SHIM(PORT, PGCLIENT) {
  return String.raw`const { Client, types } = require(${JSON.stringify(PGCLIENT)});
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
const q = (i) => '"' + String(i).replace(/"/g, '""') + '"';
class B {
  constructor(c, t, fail) { this.c = c; this.t = t; this.fail = fail; this.cols = '*'; this.f = []; this.o = []; this.l = null; }
  select(c) { if (this.mode) { this.ret = c || '*'; return this; } this.cols = c || '*'; return this; }
  eq(c, v) { this.f.push([c, '=', v]); return this; }
  gte(c, v) { this.f.push([c, '>=', v]); return this; }
  lt(c, v) { this.f.push([c, '<', v]); return this; }
  lte(c, v) { this.f.push([c, '<=', v]); return this; }
  order(c, o) { this.o.push(q(c) + (o && o.ascending === false ? ' DESC' : ' ASC')); return this; }
  limit(n) { this.l = n; return this; }
  insert(p) { this.mode = 'insert'; this.p = p; return this; }
  update(p) { this.mode = 'update'; this.p = p; return this; }
  upsert(p, o) { this.mode = 'upsert'; this.p = p; this.conf = o && o.onConflict; return this; }
  maybeSingle() { this.s = 'maybe'; return this; }
  single() { this.s = 'one'; return this; }
  _w(v) { if (!this.f.length) return ''; return ' WHERE ' + this.f.map(([c, op, x]) => { v.push(x); return q(c) + ' ' + op + ' $' + v.length; }).join(' AND '); }
  async _run() {
    /* Fault injection at the transport, which is what an RLS refusal or a
       dropped connection looks like from the app's side: {data:null,error}. */
    if (this.fail && this.fail(this.t, this.mode, this.p)) {
      return { data: null, error: { code: '42501', message: 'ép hỏng: cột sức khoẻ' } };
    }
    const v = []; let sql;
    if (this.mode === 'insert' || this.mode === 'upsert') {
      const rows = Array.isArray(this.p) ? this.p : [this.p];
      const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
      sql = 'INSERT INTO public.' + q(this.t) + ' (' + cols.map(q).join(',') + ') VALUES ' +
        rows.map((r) => '(' + cols.map((c) => { v.push(r[c] === undefined ? null : r[c]); return '$' + v.length; }).join(',') + ')').join(',');
      if (this.mode === 'upsert') {
        const keys = (this.conf || 'id').split(',').map((x) => x.trim());
        sql += ' ON CONFLICT (' + keys.map(q).join(',') + ') DO UPDATE SET ' +
          cols.filter((c) => !keys.includes(c)).map((c) => q(c) + ' = EXCLUDED.' + q(c)).join(',');
      }
    } else if (this.mode === 'update') {
      const cols = Object.keys(this.p);
      sql = 'UPDATE public.' + q(this.t) + ' SET ' + cols.map((c) => { v.push(this.p[c]); return q(c) + ' = $' + v.length; }).join(',') + this._w(v);
    } else {
      sql = 'SELECT ' + (this.cols === '*' ? '*' : this.cols.split(',').map((c) => q(c.trim())).join(',')) +
        ' FROM public.' + q(this.t) + this._w(v) +
        (this.o.length ? ' ORDER BY ' + this.o.join(',') : '') + (this.l != null ? ' LIMIT ' + Number(this.l) : '');
    }
    if (this.ret) sql += ' RETURNING ' + (this.ret === '*' ? '*' : this.ret.split(',').map((c) => q(c.trim())).join(','));
    let res;
    try { res = await this.c.query(sql, v); }
    catch (e) { return { data: null, error: { code: e.code, message: e.message } }; }
    const rows = res.rows;
    if (this.s === 'one') return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    if (this.s === 'maybe') return rows.length > 1 ? { data: null, error: { code: 'PGRST116', message: 'many' } } : { data: rows[0] ?? null, error: null };
    if (this.mode && !this.ret) return { data: null, error: null };
    return { data: rows, error: null };
  }
  then(a, b) { return this._run().then(a, b); }
}
async function conn() {
  const c = new Client({ host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'app' });
  await c.connect();
  return c;
}
module.exports = { client: (c, fail) => ({ from: (t) => new B(c, t, fail) }), conn };`;
}

/* No backticks inside — String.raw, and one stray backtick silently ends it. */
function DRIVER() {
  return String.raw`
const { client, conn } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { writeHealthSync } = require('./lib/health-sync-write.js');
const { streakFrom, STREAK_WINDOW } = require('./lib/streak.js');
const A = '11111111-1111-1111-1111-111111111111';
const BB = '22222222-2222-2222-2222-222222222222';
const TZ = process.env.TZ;
const out = { cases: [] };

(async () => {
  const admin = await conn();
  const c = await conn();
  const q = (s, p) => admin.query(s, p || []);
  const D0 = process.env.WS_TODAY;
  const at = async (d, h) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [d, h, TZ])).rows[0].t;
  const shift = async (d, n) => (await q('SELECT ($1::date + $2::int)::text d', [d, n])).rows[0].d;
  const wipe = () => q('DELETE FROM workout_sessions; DELETE FROM daily_logs; DELETE FROM sleep_logs;');

  /* fail every daily_logs upsert whose payload names ONLY health columns —
     which is exactly the two writes BUG-105 was about */
  const healthOnly = (t, mode, p) => {
    if (t !== 'daily_logs' || mode !== 'upsert') return false;
    const rows = Array.isArray(p) ? p : [p];
    return rows.every((r) => Object.keys(r).every((k) =>
      k === 'user_id' || k === 'date' || k === 'steps' || k === 'active_kcal' || k === 'active_minutes'));
  };
  const use = (fail) => sb._use(client(c, fail));

  const watchRow = (iso, ext, u) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,sets,template_name,source,external_id) " +
    "VALUES ($1,$2,0,'[]'::jsonb,'Chạy bộ · 30′','apple_health',$3) ON CONFLICT (user_id,external_id) DO NOTHING",
    [u || A, iso, ext]);

  const state = async (day, uid) => {
    const row = (await q('SELECT workout_count, volume_load, acwr FROM daily_logs WHERE user_id=$1 AND date=$2', [uid || A, day])).rows[0];
    const sessions = (await q("SELECT count(*)::int n FROM workout_sessions WHERE user_id=$1 AND (date_time AT TIME ZONE $3)::date = $2::date", [uid || A, day, TZ])).rows[0].n;
    const dates = (await q("SELECT date::text FROM daily_logs WHERE user_id=$1 AND (kcal>0 OR workout_count>0 OR sleep_duration_min>0 OR supplement_taken>0) ORDER BY date DESC LIMIT " + STREAK_WINDOW, [uid || A])).rows.map((r) => r.date);
    return {
      sessions,
      workout_count: row ? Number(row.workout_count) : null,
      volume_load: row ? Number(row.volume_load) : null,
      acwr: row && row.acwr != null ? Number(row.acwr) : null,
      streakCountsDay: dates.includes(day),
    };
  };
  const add = (label, ok, why) => out.cases.push({ label, ok, why });

  /* sanity — the injector must actually break the write it claims to */
  {
    await wipe();
    use(healthOnly);
    let threw = null;
    try { await writeHealthSync({ userId: A, today: D0, measured: { steps: 8000 }, stepDays: [], bio: null, sleep: null, workouts: [] }); }
    catch (e) { threw = e.message; }
    const row = (await q('SELECT steps FROM daily_logs WHERE user_id=$1 AND date=$2', [A, D0])).rows[0];
    out.sanity = { injectorWorks: !row && threw != null, threw };
  }

  /* ── A: everything succeeds ── */
  {
    await wipe(); use(null);
    const iso = await at(D0, '07:00');
    await watchRow(iso, 'a1');
    await writeHealthSync({ userId: A, today: D0, measured: { steps: 8000 }, stepDays: [], bio: null, sleep: null, workouts: [{ date_time: String(iso) }] });
    const s = await state(D0);
    add('A · mọi thứ thành công', s.workout_count === 1 && s.streakCountsDay,
      'workout_count=' + s.workout_count + ' chuỗi tính ngày=' + s.streakCountsDay);
  }

  /* ── B + C: THE CRITICAL TEST. Both health-column writes fail; the workout
     is nine days old, i.e. beyond any later import window. ── */
  {
    await wipe(); use(healthOnly);
    const d9 = await shift(D0, -9);
    const iso = await at(d9, '07:00');
    await watchRow(iso, 'b1');
    let threw = null;
    try {
      await writeHealthSync({
        userId: A, today: D0,
        measured: { steps: 8000, active_kcal: 300 },
        stepDays: [{ date: await shift(D0, -1), steps: 5000 }],
        bio: null, sleep: null, workouts: [{ date_time: String(iso) }],
      });
    } catch (e) { threw = e.message; }
    const s = await state(d9);
    add('B+C · CẢ HAI lệnh ghi cột sức khoẻ hỏng, buổi tập 9 ngày trước',
      s.sessions === 1 && s.workout_count === 1 && s.streakCountsDay === true,
      'bảng=' + s.sessions + ' workout_count=' + s.workout_count + ' chuỗi tính ngày=' + s.streakCountsDay);
    add('B+C · và hàm VẪN báo lỗi', threw != null && /chưa xong/.test(threw || ''),
      'ném=' + JSON.stringify((threw || '').slice(0, 80)));
    add('B+C · buổi tập từ đồng hồ giữ tonnage 0 và acwr null',
      s.volume_load === 0 && s.acwr === null, 'volume=' + s.volume_load + ' acwr=' + s.acwr);
  }

  /* ── D: one day's rebuild fails, the others must still run ── */
  {
    await wipe(); use(null);
    const dA = await shift(D0, -3);
    const dB = await shift(D0, -1);
    await watchRow(await at(dA, '07:00'), 'd1');
    await watchRow(await at(dB, '07:00'), 'd2');
    /* make the FIRST day unbuildable by hiding a source table only while that
       day is read — simplest faithful version: hide it, run, restore, then
       assert the later day still got built. touchedDays sorts oldest-first, so
       dA is attempted first. */
    let threw = null;
    const orig = c.query.bind(c);
    let hits = 0;
    c.query = async (text, params) => {
      /* HARNESS: keyed on the DAY ARGUMENT, not on a timestamp. The first
         version matched the meal read's window start, whose text form is the
         UTC instant — at UTC+7 local midnight falls on the previous UTC date,
         so the injector never fired in Asia/Ho_Chi_Minh and case D reported a
         false pass there. recomputeDailyLog's first query is the daily_logs
         token read, and it carries the plain date string. */
      if (typeof text === 'string' && text.includes('daily_logs') && text.includes('SELECT')
          && params && String(params[1] ?? '') === dA) {
        hits++; throw Object.assign(new Error('ép hỏng: ngày cũ'), { code: '42501' });
      }
      return orig(text, params);
    };
    try {
      await writeHealthSync({ userId: A, today: D0, measured: {}, stepDays: [], bio: null, sleep: null,
        workouts: [{ date_time: String(await at(dA, '07:00')) }, { date_time: String(await at(dB, '07:00')) }] });
    } catch (e) { threw = e.message; }
    c.query = orig;
    const sA = await state(dA); const sB = await state(dB);
    add('D · một ngày dựng hỏng, ngày kia vẫn dựng',
      hits > 0 && sB.workout_count === 1,
      'ngày cũ workout_count=' + sA.workout_count + ' ngày mới workout_count=' + sB.workout_count + ' (lần ép hỏng=' + hits + ')');
    add('D · và ngày hỏng được kể tên trong lỗi',
      threw != null && String(threw).includes(dA), 'ném=' + JSON.stringify(String(threw || '').slice(0, 110)));
  }

  /* ── E: no workout written → no phantom projection ── */
  {
    await wipe(); use(null);
    await writeHealthSync({ userId: A, today: D0, measured: {}, stepDays: [], bio: null, sleep: null, workouts: [] });
    const s = await state(D0);
    add('E · không có buổi tập nào → không có phép chiếu ma',
      s.sessions === 0 && (s.workout_count === null || s.workout_count === 0) && s.streakCountsDay === false,
      'bảng=' + s.sessions + ' workout_count=' + s.workout_count + ' chuỗi=' + s.streakCountsDay);
  }

  /* ── F: duplicate external_id ── */
  {
    await wipe(); use(null);
    const iso = await at(D0, '07:00');
    await watchRow(iso, 'dup'); await watchRow(iso, 'dup');
    await writeHealthSync({ userId: A, today: D0, measured: {}, stepDays: [], bio: null, sleep: null, workouts: [{ date_time: String(iso) }] });
    const s = await state(D0);
    add('F · external_id trùng không nhân đôi', s.sessions === 1 && s.workout_count === 1 && s.volume_load === 0,
      'bảng=' + s.sessions + ' workout_count=' + s.workout_count + ' volume=' + s.volume_load);
  }

  /* ── G/H: a late workout converges on ITS OWN day, not today ── */
  {
    await wipe(); use(null);
    const d5 = await shift(D0, -5);
    const iso = await at(d5, '07:00');
    await watchRow(iso, 'g1');
    await writeHealthSync({ userId: A, today: D0, measured: {}, stepDays: [], bio: null, sleep: null, workouts: [{ date_time: String(iso) }] });
    const late = await state(d5); const todayRow = await state(D0);
    add('G/H · buổi tập muộn dựng vào ĐÚNG ngày của nó',
      late.workout_count === 1 && late.streakCountsDay && (todayRow.workout_count === null || todayRow.workout_count === 0),
      'ngày -5 workout_count=' + late.workout_count + ' · hôm nay workout_count=' + todayRow.workout_count);
  }

  /* ── J: cross-account ── */
  {
    await wipe(); use(null);
    const iso = await at(D0, '07:00');
    await watchRow(iso, 'j1', BB);
    await writeHealthSync({ userId: A, today: D0, measured: {}, stepDays: [], bio: null, sleep: null, workouts: [{ date_time: String(iso) }] });
    const sA = await state(D0, A); const sB = await state(D0, BB);
    add('J · chéo tài khoản', (sA.workout_count === 0 || sA.workout_count === null) && sB.sessions === 1,
      'A workout_count=' + sA.workout_count + ' · B bảng=' + sB.sessions);
  }

  await c.end(); await admin.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
