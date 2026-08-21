/**
 * The readiness gate and the readiness calculator must mean the same thing. (BUG-107)
 *
 * ── the bug ──
 *
 * The gate read *"at least 3 days of any logs"* in its comment and something
 * narrower in its code: only biometrics and sleep could open it. Training load
 * is a fully scoreable dimension — `computeLoadScore` gives it a band and a
 * weight exactly like the other three — but it could not let anybody through.
 *
 * Measured on PostgreSQL 16.13 with the real engine, somebody who logs barbell
 * sessions for a fortnight and nothing else:
 *
 *     trước khi sửa : điểm null · acwr null
 *     sau khi sửa   : điểm 80   · acwr 1.14
 *
 * and with the score went `acwr`, which the training card and `suggestLoad`
 * both read.
 *
 * ── what this file runs ──
 *
 * The **real `recomputeDailyLog`** — which contains the gate — against a **real
 * PostgreSQL 16.13** built from every migration, in six timezones including
 * both DST days. The oracle is SQL over `workout_sessions`, `sleep_logs` and
 * `biometric_samples`; it never reads `daily_logs` and never calls
 * `computeReadiness`, so an engine that scores what it cannot measure cannot
 * agree with it.
 *
 * ── the two things the widened gate must still refuse ──
 *
 * **A watch-only workout.** `sessionLoad` is `null` for an import with an empty
 * `sets` array, so it never reaches `trainingLoad28d` and never opens the gate.
 * **A bare `daily_logs` row.** The sum is built from `workout_sessions`, so a
 * row the step sync created cannot open it either.
 *
 * This file asserts the gate uses the calculator's own predicate rather than a
 * fourth opinion about what counts. If PostgreSQL or `pg` is missing it
 * **skips loudly**.
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
   RULE A — structural. Comments are stripped first, so a predicate described
   in prose cannot satisfy any of it.
   ───────────────────────────────────────────────────────────────────────── */
{
  const svc = strip(read('src/lib/daily-log-service.ts'));
  const engine = strip(read('src/lib/readiness-engine.ts'));

  const gate = svc.match(/const hasEnoughData =[\s\S]*?;/)?.[0] ?? '';
  want(gate !== '', 'không tìm thấy hasEnoughData — bộ dò lạc mục tiêu, đừng tin phần còn lại');

  /* A1 — load is eligible, and by the calculator's OWN predicate. */
  want(
    /trainingLoad28d > 0/.test(gate),
    'cổng hasEnoughData không còn nhận tải tập đo được — người chỉ ghi buổi tập ' +
      'sẽ lại không có điểm sẵn sàng và không có acwr, dù tải của họ đo được rõ ràng (BUG-107)',
  );
  /* A2 — and it is the SAME predicate the calculator opens with. If the engine
     changes its mind about what it can score, this rule goes red until the gate
     is changed with it. */
  want(
    /if \(load28d <= 0\) return null;/.test(engine),
    'computeLoadScore không còn từ chối trên load28d <= 0 — cổng dùng chính vị từ đó, ' +
      'nên hai bên vừa thôi đồng ý về dân số và một trong hai phải đổi theo',
  );
  /* A3 — sleep and biometrics stay eligible. Widening must not narrow. */
  want(
    /bioHistory && bioHistory\.length >= 3/.test(gate) && /sleepLogs7d && sleepLogs7d\.length >= 3/.test(gate),
    'cổng không còn nhận sinh trắc hoặc giấc ngủ — mở rộng cho tải KHÔNG được thu hẹp hai đường cũ',
  );
  /* A4 — the gate is built from sources, never from the projection. */
  want(
    !/daily_logs/.test(gate) && !/workout_count/.test(gate),
    'cổng đọc daily_logs hoặc workout_count — một hàng do đồng bộ bước chân tạo ra sẽ mở được cổng, ' +
      'và đó là đúng lớp lỗi Chain AB và AC đã sửa ở chỗ khác',
  );
  /* A5 — watch semantics, which case E rests on. */
  const load = strip(read('src/lib/session-load.ts'));
  want(
    /if \(reps <= 0\) return null;/.test(load),
    'sessionLoad không còn trả null khi không đếm được reps — buổi tập từ đồng hồ sẽ mở được cổng ' +
      'và nhận một điểm sẵn sàng dựng từ một buổi chạy không đo được tải (Chain AD)',
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
      'America/Denver', 'Asia/Ho_Chi_Minh', 'Australia/Lord_Howe']) {
      const today = execFileSync('node', ['-e', "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
        { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
      const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
        cwd: out, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000,
        env: { ...process.env, TZ, RI_TODAY: today },
      });
      const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
      if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 300)}`);
      if (process.env.RI_DUMP) console.log(TZ, JSON.stringify(r.cases, null, 1));
      for (const c of r.cases) want(c.ok, `${TZ} · ${c.label}: ${c.why}`);
    }
  } catch (e) {
    problems.push(`không dựng được phép thử điểm sẵn sàng: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('điểm sẵn sàng — bất biến hỏng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'điểm sẵn sàng OK — CHẠY THẬT recomputeDailyLog trên PostgreSQL 16.13 dựng từ toàn bộ migration, ở SÁU ' +
    'múi giờ gồm cả ngày 23 và 25 giờ, chấm bằng oracle SQL đọc nguồn chứ không đọc daily_logs. Cổng và ' +
    'máy tính điểm dùng CHUNG một vị từ: tải đo được mở được cổng (bản đã ship từ chối, nên người chỉ ghi ' +
    'buổi tập không có điểm và không có acwr), còn giấc ngủ và sinh trắc vẫn mở được như cũ. Hai thứ cổng ' +
    'VẪN từ chối: buổi tập từ đồng hồ (sets rỗng → sessionLoad null) và một hàng daily_logs do đồng bộ bước ' +
    'chân tạo ra. Xoá buổi tập thì cổng đóng lại và điểm về null; RPE ngoài thang, reps âm và reps 0 đều ' +
    'không mở được cổng; chéo tài khoản sạch.',
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
const { recomputeDailyLog } = require('./lib/daily-log-service.js');
const A = '11111111-1111-1111-1111-111111111111';
const BB = '22222222-2222-2222-2222-222222222222';
const TZ = process.env.TZ;
const out = { cases: [] };

(async () => {
  const admin = await conn();
  const c = await conn();
  sb._use(client(c));
  const q = (s, p) => admin.query(s, p || []);
  const D0 = process.env.RI_TODAY;
  const at = async (d, h) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [d, h, TZ])).rows[0].t;
  const shift = async (d, n) => (await q('SELECT ($1::date + $2::int)::text d', [d, n])).rows[0].d;
  const wipe = () => q('DELETE FROM workout_sessions; DELETE FROM sleep_logs; DELETE FROM biometric_samples; DELETE FROM daily_logs;');

  const night = async (day, min, u) => q(
    'INSERT INTO sleep_logs (user_id,bedtime,waketime,asleep_min,quality) VALUES ($1,$2,$3,$4,8)',
    [u || A, await at(await shift(day, -1), '23:00'), await at(day, '07:00'), min === undefined ? 430 : min]);
  const bioRow = async (day, hr, sdnn) => q(
    "INSERT INTO biometric_samples (user_id,date_time,hr_bpm,hrv_sdnn_ms,source) VALUES ($1,$2,$3,$4,'manual')",
    [A, await at(day, '06:00'), hr === undefined ? 55 : hr, sdnn === undefined ? 60 : sdnn]);
  const lifted = async (day, rpe, reps) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,3000,$3,$4,'manual')",
    [A, await at(day, '18:00'), rpe === undefined ? 8 : rpe, JSON.stringify([{ reps: reps === undefined ? 50 : reps, weight_kg: 60 }])]);
  /* EXACTLY what use-health-sync writes: empty sets, tonnage 0 */
  const watch = async (day, ext) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,sets,source,external_id) VALUES ($1,$2,0,'[]'::jsonb,'apple_health',$3) ON CONFLICT (user_id,external_id) DO NOTHING",
    [A, await at(day, '07:00'), ext]);
  const stepOnly = (day) => q(
    'INSERT INTO daily_logs (user_id,date,steps) VALUES ($1,$2,7400) ON CONFLICT (user_id,date) DO UPDATE SET steps = EXCLUDED.steps', [A, day]);

  /* ── ORACLE: sources only, never daily_logs, never the engine ── */
  const oracle = async (day) => {
    const lo = await at(day, '00:00');
    const hi = await at(await shift(day, 1), '00:00');
    const todayBio = (await q(
      'SELECT hr_bpm, hrv_sdnn_ms, hrv_rmssd_ms FROM biometric_samples WHERE user_id=$1 AND date_time >= $2 AND date_time < $3 ORDER BY date_time DESC LIMIT 1',
      [A, lo, hi])).rows[0] || null;
    /* anchored at NOW, because recomputeDailyLog anchors its history windows
       there (new Date()); anchoring on the target day made an earlier version of
       this oracle report a false failure on every day that is not today */
    const hist = (await q(
      "SELECT hr_bpm, hrv_sdnn_ms, hrv_rmssd_ms FROM biometric_samples WHERE user_id=$1 AND date_time >= now() - interval '28 days'", [A])).rows;
    const nights7 = (await q(
      "SELECT count(*)::int n FROM sleep_logs WHERE user_id=$1 AND waketime >= now() - interval '7 days'", [A])).rows[0].n;
    const sleepRow = (await q(
      'SELECT asleep_min, bedtime, waketime FROM sleep_logs WHERE user_id=$1 AND waketime >= $2 AND waketime < $3 ORDER BY waketime DESC LIMIT 1',
      [A, lo, hi])).rows[0] || null;
    /* the session-RPE rule, in SQL — never the app helper */
    const load28 = Number((await q(
      "SELECT COALESCE(SUM(rpe*reps),0)::float t FROM (" +
      "  SELECT session_rpe::float rpe, (SELECT COALESCE(SUM((e->>'reps')::float),0) FROM jsonb_array_elements(sets) e) reps" +
      "  FROM workout_sessions WHERE user_id=$1 AND date_time >= now() - interval '28 days'" +
      ") x WHERE rpe BETWEEN 1 AND 10 AND reps > 0", [A])).rows[0].t);

    const usingSdnn = todayBio != null && todayBio.hrv_sdnn_ms != null;
    const fam = hist.map((b) => (usingSdnn ? b.hrv_sdnn_ms : b.hrv_rmssd_ms)).filter((v) => v != null);
    const hrvToday = todayBio == null ? null : (usingSdnn ? todayBio.hrv_sdnn_ms : todayBio.hrv_rmssd_ms);
    const sleepMin = sleepRow == null ? 0
      : (sleepRow.asleep_min != null && Number(sleepRow.asleep_min) > 0 ? Number(sleepRow.asleep_min)
        : Math.max(0, Math.round((Date.parse(sleepRow.waketime) - Date.parse(sleepRow.bedtime)) / 60000)));
    const canHrv = hrvToday != null && fam.length >= 5;
    const canRhr = todayBio != null && todayBio.hr_bpm != null && hist.filter((b) => b.hr_bpm != null).length >= 5;
    const canSleep = sleepMin > 0;
    const canLoad = load28 > 0;
    const present = [canHrv, canRhr, canSleep, canLoad].filter(Boolean).length;
    const gate = hist.length >= 3 || nights7 >= 3 || canLoad;
    return { canLoad, present, gate, expectScore: gate && present > 0, expectAcwr: canLoad && gate && present > 0 };
  };
  const actual = async (day, u) => {
    const r = (await q('SELECT readiness_score, readiness_status, acwr FROM daily_logs WHERE user_id=$1 AND date=$2', [u || A, day])).rows[0];
    if (!r) return { score: null, status: null, acwr: null, row: false };
    return { row: true, score: r.readiness_score == null ? null : Number(r.readiness_score),
      status: r.readiness_status, acwr: r.acwr == null ? null : Number(r.acwr) };
  };
  const add = (label, ok, why) => out.cases.push({ label, ok, why });
  const agrees = async (label, day) => {
    const e = await oracle(day); const a = await actual(day);
    const has = a.score != null;
    const hasAcwr = a.acwr != null;
    const ok = has === e.expectScore && hasAcwr === e.expectAcwr
      && (!has || (a.score >= 0 && a.score <= 100 && ['green','yellow','red'].includes(a.status)));
    add(label, ok, 'điểm=' + a.score + ' acwr=' + a.acwr + ' | oracle mong điểm=' + e.expectScore + ' acwr=' + e.expectAcwr + ' (present=' + e.present + ' cổng=' + e.gate + ')');
    return a;
  };

  /* A — no data */
  await wipe();
  await recomputeDailyLog(A, D0);
  { const a = await actual(D0); add('A · không có gì → null', a.score === null && a.acwr === null, 'điểm=' + a.score); }

  /* B — sleep only */
  await wipe(); for (const k of [0, 1, 2]) await night(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  { const a = await agrees('B · chỉ giấc ngủ (3 đêm) → có điểm', D0); add('B · và acwr vẫn null', a.acwr === null, 'acwr=' + a.acwr); }

  /* C — biometrics only */
  await wipe(); for (let k = 0; k <= 6; k++) await bioRow(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  await agrees('C · chỉ sinh trắc → có điểm', D0);

  /* D — workout only, measured load. THE FIX. */
  await wipe(); for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  { const a = await agrees('D · chỉ buổi tập ĐO ĐƯỢC → có điểm', D0);
    add('D · và acwr xuất hiện', a.acwr != null, 'acwr=' + a.acwr); }

  /* E — watch-only, nothing else. Must stay null. */
  await wipe(); for (let k = 0; k < 14; k += 2) await watch(await shift(D0, -k), 'e' + k);
  await recomputeDailyLog(A, D0);
  { const a = await actual(D0);
    add('E · CHỈ buổi tập từ đồng hồ → vẫn null', a.score === null && a.acwr === null,
      'điểm=' + a.score + ' acwr=' + a.acwr + ' — sets rỗng nên sessionLoad null, không mở được cổng'); }

  /* E2 — a bare daily_logs row must not open the gate either */
  await wipe(); for (let k = 0; k < 14; k++) await stepOnly(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  { const a = await actual(D0); add('E2 · chỉ hàng daily_logs do bước chân → vẫn null', a.score === null, 'điểm=' + a.score); }

  /* F — mixed */
  await wipe();
  for (let k = 0; k < 6; k++) { await night(await shift(D0, -k)); await bioRow(await shift(D0, -k)); }
  for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  await agrees('F · trộn đủ bốn', D0);

  /* G — workout deleted, gate falls back */
  await wipe(); for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k));
  await recomputeDailyLog(A, D0);
  const gBefore = await actual(D0);
  await q('DELETE FROM workout_sessions WHERE user_id=$1', [A]);
  await recomputeDailyLog(A, D0);
  { const a = await actual(D0);
    add('G · xoá buổi tập → cổng đóng lại, điểm về null',
      gBefore.score != null && a.score === null && a.acwr === null,
      'trước=' + gBefore.score + ' sau=' + a.score); }

  /* H — cross-account */
  await wipe(); for (let k = 0; k < 14; k += 2) await q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,3000,8,$3,'manual')",
    [BB, await at(await shift(D0, -k), '18:00'), JSON.stringify([{ reps: 50 }])]);
  await recomputeDailyLog(A, D0);
  { const a = await actual(D0); add('H · chéo tài khoản', a.score === null, 'điểm của A=' + a.score); }

  /* J — DST 23h/25h, workout-only so the new gate path is the one exercised */
  for (const date of [D0, '2026-03-08', '2026-11-01']) {
    await wipe();
    for (let k = 0; k < 14; k += 2) await lifted(await shift(date, -k));
    await recomputeDailyLog(A, date);
    await agrees('J · ' + date, date);
  }

  /* L — hostile numerics at the real persistence boundary */
  for (const [label, build] of [
    ['RPE 99', async () => { for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k), 99, 50); }],
    ['reps âm', async () => { for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k), 8, -50); }],
    ['reps 0', async () => { for (let k = 0; k < 14; k += 2) await lifted(await shift(D0, -k), 8, 0); }],
  ]) {
    await wipe(); await build();
    let threw = null;
    try { await recomputeDailyLog(A, D0); } catch (e) { threw = String(e.message).slice(0, 60); }
    const a = await actual(D0);
    add('L · ' + label + ' → tải không đo được, vẫn null',
      threw === null && a.score === null && a.acwr === null,
      'ném=' + threw + ' điểm=' + a.score + ' acwr=' + a.acwr);
  }

  await c.end(); await admin.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
