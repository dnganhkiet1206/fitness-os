/**
 * Does `daily_logs` converge when several independent writers touch one day?
 *
 * Chain I proved the rebuild converges under a single writer and fixed the
 * lost-update race with a compare-and-set on `updated_at`. Chain S asks the
 * question that outlives that fix: **the app has several independent sources
 * that can each cause a rebuild** — a meal, a workout, a night, a health sync,
 * an offline replay — and CAS is a conflict *detector*, not a convergence
 * proof.
 *
 * ── how this file is different from every other rule in the suite ──
 *
 * It runs the **real `recomputeDailyLog`** against a **real PostgreSQL 16.13**
 * built from every migration, as the `authenticated` role with the caller's JWT
 * claim set, so RLS is in force. The only substitution is the supabase handle,
 * which becomes a PostgREST-shaped client over a real connection with
 * injectable latency — the algorithm is not reimplemented anywhere.
 *
 * The expected answer is an **independent SQL aggregate over the source
 * tables**. It never calls the app, so a bug in the projection cannot agree
 * with itself.
 *
 * If PostgreSQL or the `pg` client is not available this step **skips loudly**
 * rather than passing: a concurrency proof that quietly does nothing is worse
 * than no proof.
 *
 * ── the two bugs it was written for ──
 *
 * **1. A day the person trained was never rebuilt.** `getRecentWorkouts()`
 * imports seven days of sessions and `getLastNightSleep()` looks 36 hours back,
 * and the sync finished with `recomputeDailyLog(user.id, localDateStr())` —
 * today, and only today. Measured, with a run on day −2 and meals on −3, −1 and
 * today:
 *
 *     workout_sessions thật sự nằm ở: 2026-08-17
 *     daily_logs:  08-19 ✓  08-18 ✓  08-16 ✓  08-17 KHÔNG CÓ HÀNG NÀO
 *     ngày chuỗi đếm là hoạt động: 08-19, 08-18, 08-16
 *
 * Nothing repairs it, and `LOGGED_DAY_FILTER` reads `daily_logs` — so a day
 * somebody genuinely trained is invisible, the streak breaks at it, and the
 * medals granted from that streak are withheld.
 *
 * **2. The rebuild gave up silently and called it success.** `daily_logs` is
 * shared by column — health sync owns `steps`/`active_kcal`/`active_minutes`,
 * the rebuild owns the rest — but the CAS token is `updated_at`, moved by
 * `BEFORE UPDATE … FOR EACH ROW`. A steps-only upsert therefore bumps the token
 * while writing no projection at all. Three inside one read window and the
 * function **returned normally** having written nothing:
 *
 *     threw?   NO — resolved normally
 *     derived: kcal 500      oracle: kcal 1200
 *
 * ── a harness note, because it nearly produced two false findings ──
 *
 * `pg` parses `timestamptz` into a JS `Date`, which is millisecond precision,
 * and the CAS token is a microsecond column compared for exact equality. With
 * the default parser every compare-and-set in this file missed and the app
 * looked broken when the harness had thrown the precision away. PostgREST hands
 * the app a string and the app sends the same string back; `setTypeParser`
 * restores that. The second was sharing one `pg` client across concurrent
 * actors — `pg` serialises queries per connection, so "concurrent" was a
 * queue. Each actor gets its own connection.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];

/* ── is this machine able to answer the question at all? ── */
const PGBIN = (() => {
  for (const d of ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']) {
    if (existsSync(path.join(d, 'initdb'))) return d;
  }
  return null;
})();
let pgClientDir = null;
for (const d of [path.join(NATIVE, 'node_modules'), '/usr/lib/node_modules']) {
  if (existsSync(path.join(d, 'pg'))) { pgClientDir = d; break; }
}

if (!PGBIN || !pgClientDir) {
  console.log(
    'daily_logs đồng thời — BỎ QUA, và nói rõ là bỏ qua: ' +
      (!PGBIN ? 'không có PostgreSQL trên máy này. ' : '') +
      (!pgClientDir ? 'không có client `pg` (npm i pg). ' : '') +
      'Bước này CHẠY THẬT recomputeDailyLog trên một cơ sở dữ liệu thật; không có nó thì ' +
      'không có gì được chứng minh, và im lặng đi qua sẽ là một lời nói dối về mức độ đã kiểm.',
  );
  process.exit(0);
}

const PORT = 54399;
const DATA = path.join(tmpdir(), `pg-dailylog-${process.pid}`);
const out = mkdtempSync(path.join(tmpdir(), 'dlc-'));
const sh = (cmd) => spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });

function stopPg() {
  sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null || ${PGBIN}/pg_ctl -D ${DATA} stop -m immediate 2>/dev/null`);
  rmSync(DATA, { recursive: true, force: true });
}

try {
  /* ── a clean cluster, built from every migration ── */
  rmSync(DATA, { recursive: true, force: true });
  mkdirSync(DATA, { recursive: true });
  const asPostgres = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
  if (asPostgres) sh(`chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
  const run = (c) => (asPostgres ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
  run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
  run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}" -l ${DATA}/log start`);
  sh('sleep 2');

  const psql = (sqlText, db = 'postgres') => {
    const f = path.join(out, 'q.sql');
    writeFileSync(f, sqlText);
    return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
  };
  if (psql('SELECT 1;').status !== 0) throw new Error('không khởi động được PostgreSQL');
  psql('CREATE DATABASE dlc;');
  psql(
    `CREATE SCHEMA IF NOT EXISTS auth;
     CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
     CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;
     CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;
     CREATE SCHEMA IF NOT EXISTS extensions;
     CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
     DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
     DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
     DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
     GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;`,
    'dlc',
  );
  const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
  for (const m of migrations) {
    sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d dlc -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
  }
  psql('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;', 'dlc');
  const tableCount = Number(
    sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d dlc -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`).stdout.trim(),
  );
  if (tableCount < 30) throw new Error(`chỉ dựng được ${tableCount} bảng từ ${migrations.length} migration`);

  /* ── the real modules ── */
  const FILES = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  try {
    execFileSync('npx', ['tsc', ...FILES, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of FILES) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8')
      .replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`)
      /* the ONE substitution: the shared handle becomes the injected client */
      .replace(/require\("\.\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")'));
  }
  writeFileSync(path.join(out, 'sb.cjs'),
    `let c = null; module.exports = { get supabase() { return c; }, _use: (x) => { c = x; } };`);
  writeFileSync(path.join(out, 'shim.cjs'), SHIM(PORT, pgClientDir));
  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());

  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
    cwd: out, encoding: 'utf8', env: { ...process.env, NODE_PATH: pgClientDir }, maxBuffer: 64 * 1024 * 1024,
  });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  const want = (ok, message) => { if (!ok) problems.push(message); };

  /* the harness has to have moved something, or every assertion is vacuous */
  want(r.baselineOk, `mốc ban đầu đã sai (${r.baselineDetail}) — bộ dò hỏng, đừng tin phần còn lại`);

  want(
    r.lostUpdateConverged,
    `đua ghi-đè của Chain I quay lại: ghi chậm đè lên ảnh chụp mới (${r.lostUpdateDetail}) — ` +
      'compare-and-set trên updated_at là thứ chặn nó',
  );
  want(
    r.touchedDaysCovered,
    `một buổi tập đồng bộ từ đồng hồ nằm ở ngày ${r.staleDay} nhưng ngày đó KHÔNG được dựng lại ` +
      `(${r.staleDetail}) — getRecentWorkouts() lấy bảy ngày và getLastNightSleep() lùi 36 giờ, ` +
      'trong khi chỉ hôm nay được recompute; và không gì sửa lại ngày đó về sau',
  );
  want(
    r.streakSeesTrainingDay,
    `ngày ${r.staleDay} người dùng CÓ tập nhưng chuỗi không tính là ngày hoạt động ` +
      `(đếm: ${r.streakDays}) — LOGGED_DAY_FILTER đọc daily_logs, nên một buổi tập không được ` +
      'dựng vào ngày của nó là một ngày biến mất khỏi chuỗi, và huy chương theo chuỗi bị giữ lại',
  );
  want(
    r.exhaustionThrows,
    `thua CAS ba lần liên tiếp thì recomputeDailyLog TRẢ VỀ BÌNH THƯỜNG (${r.exhaustionDetail}) — ` +
      'ghi steps chỉ đụng cột của health sync nhưng vẫn đẩy updated_at (trigger BEFORE UPDATE), ' +
      'nên "ai thắng cũng đã đọc mới hơn ta" là sai, và ngày sai được báo là dựng xong',
  );
  want(
    r.deleteConverged,
    `xoá một bữa ăn rồi dựng lại không hội tụ (${r.deleteDetail})`,
  );
  want(
    r.rlsBlocked && r.bravoIntact,
    `ALPHA dựng lại được ngày của BRAVO (chặn: ${r.rlsBlocked}, BRAVO nguyên vẹn: ${r.bravoIntact})`,
  );
  want(
    r.idempotent,
    `chạy recompute nhiều lần cho ra kết quả khác nhau (${r.idempotentDetail})`,
  );
  want(
    r.permutationsRun >= 60 && r.permutationFailures === 0,
    `${r.permutationFailures}/${r.permutationsRun} thứ tự đồng thời KHÔNG hội tụ về phép chiếu SQL độc lập; ` +
      `ví dụ: ${JSON.stringify(r.permutationExample)}`,
  );
  want(
    r.randomRun >= 300 && r.randomFailures === 0,
    `${r.randomFailures}/${r.randomRun} trạng thái nguồn ngẫu nhiên KHÔNG khớp phép chiếu SQL độc lập; ` +
      `ví dụ: ${JSON.stringify(r.randomExample)}`,
  );
  want(
    r.touchedDaysRuleCases === r.touchedDaysRulePassed,
    `touchedDays sai ${r.touchedDaysRuleCases - r.touchedDaysRulePassed}/${r.touchedDaysRuleCases} ca: ` +
      `${JSON.stringify(r.touchedDaysRuleFail)}`,
  );
} catch (e) {
  problems.push(`không dựng được phép thử đồng thời: ${e.message}`);
} finally {
  stopPg();
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('daily_logs không hội tụ:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'daily_logs đồng thời OK — CHẠY THẬT recomputeDailyLog trên PostgreSQL 16.13 dựng từ toàn bộ migration, ' +
    'vai authenticated với claim JWT nên RLS còn hiệu lực, và kỳ vọng là một phép chiếu SQL ĐỘC LẬP ' +
    'không hề gọi vào app. Đua ghi-đè của Chain I vẫn bị CAS chặn; xoá bữa ăn hội tụ; ' +
    'ALPHA không dựng lại được ngày của BRAVO; chạy lại 10 lần cho cùng một kết quả. ' +
    'Hai lỗi đã sửa: một buổi tập đồng hồ ghi ở ngày khác nay ĐƯỢC dựng vào đúng ngày của nó ' +
    '(bản đã ship chỉ dựng hôm nay, nên ngày đó không có hàng daily_logs nào và chuỗi đứt ngay tại ngày ' +
    'người ta thật sự có tập); và thua CAS ba lần nay NÉM thay vì trả về bình thường ' +
    '(ghi steps đụng cột khác nhưng vẫn đẩy updated_at, nên bản cũ báo dựng xong trên một ngày sai). ' +
    'Cộng với quét: hơn 60 thứ tự đồng thời có chủ đích và hơn 300 trạng thái nguồn ngẫu nhiên ' +
    '(gồm 0, rất lớn, cùng mốc thời gian, ngày hôm trước, ranh giới nửa đêm) đều khớp phép chiếu độc lập',
);

/* ───────────────────────── harness source ───────────────────────── */
function SHIM(port, pgDir) {
  return `const { Client, types } = require(${JSON.stringify(path.join(pgDir, 'pg'))});
/* timestamptz/timestamp as RAW STRINGS: pg parses them to a millisecond-precision
   JS Date, and the CAS token is a microsecond column compared for exact equality.
   Left alone every compare-and-set misses and the app looks broken when the
   harness threw the precision away. PostgREST hands the app a string. */
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
const LAT = {};   /* per-actor, so one writer can be slow while another is not */
const sleep = (ms) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const q = (i) => '"' + String(i).replace(/"/g, '""') + '"';
class B {
  constructor(c, t, tag) { this.c = c; this.t = t; this.tag = tag; this.cols = '*'; this.f = []; this.o = []; this.l = null; }
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
    const lat = LAT[this.tag] || {};
    await sleep((this.mode ? lat.write : lat.read) || 0);
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
async function conn(uid) {
  const c = new Client({ host: '127.0.0.1', port: ${port}, user: 'postgres', database: 'dlc' });
  await c.connect();
  if (uid) { await c.query('SET ROLE authenticated'); await c.query("SET \\"request.jwt.claim.sub\\" = '" + uid + "'"); await c.query("SET \\"request.jwt.claim.role\\" = 'authenticated'"); }
  return c;
}
module.exports = {
  client: (c, tag) => ({ from: (t) => new B(c, t, tag) }),
  conn, sleep,
  setLatency: (tag, l) => { LAT[tag] = { ...(LAT[tag] || {}), ...l }; },
};`;
}

function DRIVER() { return String.raw`
const path = require('node:path');
const { client, conn, sleep, setLatency } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { recomputeDailyLog } = require('./lib/daily-log-service.js');
const { touchedDays } = require('./lib/health-days.js');

const A = 'aaaaaaaa-1111-1111-1111-111111111111';
const BR = 'bbbbbbbb-2222-2222-2222-222222222222';
const ds = (o = 0) => { const t = new Date(); t.setDate(t.getDate() - o);
  return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
const TODAY = ds(0);

let adm, adm2, cA, cA2, cB;
const o = {};

async function reset() {
  for (const u of [A, BR]) {
    await adm.query('DELETE FROM auth.users WHERE id=$1', [u]);
    await adm.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [u, u.slice(0, 5) + '@t']);
    await adm.query('INSERT INTO public.profiles (user_id,sleep_target_hours) VALUES ($1,8) ON CONFLICT (user_id) DO NOTHING', [u]);
  }
}
const addMeal = (u, kcal, date, hour = 12) => adm.query(
  "INSERT INTO public.meal_entries (id,user_id,date_time,meal_type,total_kcal,total_protein_g,total_carbs_g,total_fat_g,total_fiber_g)" +
  " VALUES (gen_random_uuid(),$1,$2::date + ($3 || ' hours')::interval,'lunch',$4,$5,$6,$7,$8) RETURNING id",
  [u, date, hour, kcal, kcal / 20, kcal / 10, kcal / 30, 2]);
const addWorkout = (u, load, date, hour = 9) => adm.query(
  "INSERT INTO public.workout_sessions (id,user_id,date_time,sets,volume_load,source,external_id)" +
  " VALUES (gen_random_uuid(),$1,$2::date + ($3 || ' hours')::interval,'[]'::jsonb,$4,'apple_health',gen_random_uuid()::text)",
  [u, date, hour, load]);
const bumpSteps = (u, date) => adm.query(
  "INSERT INTO public.daily_logs (user_id,date,steps) VALUES ($1,$2,floor(random()*9000)::int)" +
  " ON CONFLICT (user_id,date) DO UPDATE SET steps=EXCLUDED.steps", [u, date]);

/** INDEPENDENT: plain SQL over the source tables. Never touches the app. */
async function oracle(u, date) {
  const r = await adm2.query(
    "SELECT (SELECT COALESCE(SUM(total_kcal),0) FROM public.meal_entries WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::float kcal," +
    " (SELECT COALESCE(SUM(total_protein_g),0) FROM public.meal_entries WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::float protein_g," +
    " (SELECT COALESCE(SUM(total_carbs_g),0) FROM public.meal_entries WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::float carbs_g," +
    " (SELECT COALESCE(SUM(total_fat_g),0) FROM public.meal_entries WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::float fat_g," +
    " (SELECT COUNT(*) FROM public.workout_sessions WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::int workout_count," +
    " (SELECT COALESCE(SUM(volume_load),0) FROM public.workout_sessions WHERE user_id=$1 AND date_time>=$2::date AND date_time<$2::date+1)::float volume_load",
    [u, date]);
  return r.rows[0];
}
async function derived(u, date) {
  const r = await adm2.query(
    'SELECT kcal::float, protein_g::float, carbs_g::float, fat_g::float, workout_count, volume_load::float' +
    ' FROM public.daily_logs WHERE user_id=$1 AND date=$2', [u, date]);
  return r.rows[0] ?? null;
}
const KEYS = ['kcal', 'protein_g', 'carbs_g', 'fat_g', 'workout_count', 'volume_load'];
const same = (a, b) => !!a && !!b && KEYS.every((k) => Math.abs(Number(a[k]) - Number(b[k])) < 1e-6);
const run = async (c, u, date) => { sb._use(c); return recomputeDailyLog(u, date); };
const quiet = (p) => p.then(() => null, (e) => e);

(async () => {
  adm = await conn(null); adm2 = await conn(null);
  cA = client(await conn(A), 'A'); cA2 = client(await conn(A), 'A2'); cB = client(await conn(BR), 'B');

  /* ── baseline ── */
  await reset();
  await addMeal(A, 500, TODAY);
  await run(cA, A, TODAY);
  o.baselineOk = same(await derived(A, TODAY), await oracle(A, TODAY));
  o.baselineDetail = JSON.stringify([await derived(A, TODAY), await oracle(A, TODAY)]);

  /* ── 4. the Chain I lost-update race ── */
  /* A reads the world (500 kcal), then stalls for 400 ms before writing.
     B inserts a meal, reads and writes a COMPLETE newer snapshot inside that
     stall. A then commits an older world. Without the compare-and-set A wins
     and the second meal is gone for good. */
  setLatency('A', { read: 0, write: 400 });
  const slow = quiet(run(cA, A, TODAY));
  await sleep(60);
  await addMeal(A, 700, TODAY);
  await run(cA2, A, TODAY);
  await slow;
  setLatency('A', { read: 0, write: 0 });
  o.lostUpdateConverged = same(await derived(A, TODAY), await oracle(A, TODAY));
  o.lostUpdateDetail = JSON.stringify([await derived(A, TODAY), await oracle(A, TODAY)]);

  /* ── 9. a watch workout on another day, and what the streak then sees ── */
  await reset();
  const STALE = ds(2);
  for (const off of [0, 1, 3]) { await addMeal(A, 600, ds(off)); await run(cA, A, ds(off)); }
  await addWorkout(A, 4200, STALE);
  /* the sync rebuilds exactly the days it touched — the rule under test */
  for (const day of touchedDays({ workouts: [{ date_time: STALE + 'T07:00:00' }] })) {
    await run(cA, A, day);
  }
  o.staleDay = STALE;
  o.touchedDaysCovered = same(await derived(A, STALE), await oracle(A, STALE));
  o.staleDetail = JSON.stringify([await derived(A, STALE), await oracle(A, STALE)]);
  const act = await adm2.query(
    "SELECT date::text d FROM public.daily_logs WHERE user_id=$1 AND (kcal>0 OR workout_count>0 OR sleep_duration_min>0 OR supplement_taken>0) ORDER BY date DESC", [A]);
  o.streakDays = act.rows.map((x) => x.d).join(',');
  o.streakSeesTrainingDay = act.rows.some((x) => x.d === STALE);

  /* ── 17. losing the CAS three times to a writer that wrote no projection ── */
  await reset();
  await addMeal(A, 500, TODAY);
  await run(cA, A, TODAY);
  await addMeal(A, 700, TODAY);
  setLatency('A', { read: 30 });
  const p = quiet(run(cA, A, TODAY));
  const iv = setInterval(() => { bumpSteps(A, TODAY).catch(() => {}); }, 25);
  const err = await p;
  clearInterval(iv);
  setLatency('A', { read: 0 });
  await sleep(80);
  o.exhaustionThrows = !!err;
  o.exhaustionDetail = err ? String(err.message).slice(0, 60) : 'resolved normally, ' + JSON.stringify([await derived(A, TODAY), await oracle(A, TODAY)]);

  /* ── 8. delete × recompute ── */
  await reset();
  const m1 = (await addMeal(A, 500, TODAY)).rows[0].id;
  const m2 = (await addMeal(A, 700, TODAY)).rows[0].id;
  await run(cA, A, TODAY);
  setLatency('A', { read: 30 });
  const pd = quiet(run(cA, A, TODAY));
  await sleep(140);
  await adm.query('DELETE FROM public.meal_entries WHERE id=$1', [m2]);
  await pd;
  setLatency('A', { read: 0 });
  await quiet(run(cA2, A, TODAY));
  o.deleteConverged = same(await derived(A, TODAY), await oracle(A, TODAY));
  o.deleteDetail = JSON.stringify([await derived(A, TODAY), await oracle(A, TODAY)]);

  /* ── 16. RLS ── */
  await reset();
  await addMeal(A, 500, TODAY); await addMeal(BR, 900, TODAY);
  await run(cA, A, TODAY); await run(cB, BR, TODAY);
  const xerr = await quiet(run(cA, BR, TODAY));
  o.rlsBlocked = !!xerr;
  o.bravoIntact = same(await derived(BR, TODAY), await oracle(BR, TODAY));

  /* ── 18. idempotency ── */
  await reset();
  await addMeal(A, 500, TODAY); await addWorkout(A, 1000, TODAY);
  for (let i = 0; i < 10; i++) await run(cA, A, TODAY);
  const after10 = await derived(A, TODAY);
  await Promise.all([cA, cA2, cA, cA2, cA, cA2, cA, cA2, cA, cA2].map((c) => quiet(run(c, A, TODAY))));
  o.idempotent = same(after10, await oracle(A, TODAY)) && same(await derived(A, TODAY), await oracle(A, TODAY));
  o.idempotentDetail = JSON.stringify([after10, await derived(A, TODAY), await oracle(A, TODAY)]);

  /* ── 6. deterministic multi-source orderings ── */
  const OPS = ['meal', 'workout', 'steps', 'recompute'];
  const perms = [];
  for (const a of OPS) for (const b of OPS) for (const c of OPS) {
    perms.push([a, b, c, 'recompute']);
  }
  let pf = 0, pex = null, pruns = 0;
  for (const seq of perms) {
    await reset();
    await addMeal(A, 300, TODAY);
    await run(cA, A, TODAY);
    const inflight = [];
    for (const op of seq) {
      if (op === 'meal') await addMeal(A, 200, TODAY);
      else if (op === 'workout') await addWorkout(A, 500, TODAY);
      else if (op === 'steps') await bumpSteps(A, TODAY);
      else inflight.push(quiet(run(cA, A, TODAY)));
    }
    await Promise.all(inflight);
    /* the app's contract: a source write is followed by a rebuild of its day.
       The last one settles the projection. */
    await quiet(run(cA2, A, TODAY));
    pruns++;
    const [dv, ov] = [await derived(A, TODAY), await oracle(A, TODAY)];
    if (!same(dv, ov)) { pf++; if (!pex) pex = { seq, derived: dv, oracle: ov }; }
  }
  o.permutationsRun = pruns; o.permutationFailures = pf; o.permutationExample = pex;

  /* ── 15. randomized source states, including pathological ones ── */
  let rf = 0, rex = null, rr = 0;
  const rnd = (n) => Math.floor(Math.random() * n);
  for (let i = 0; i < 320; i++) {
    await reset();
    const n = rnd(5);
    for (let k = 0; k < n; k++) {
      const kind = rnd(10);
      const kcal = [0, 1, 9999, 0.5, 250, 1200][rnd(6)];
      const hour = [0, 12, 23][rnd(3)];       // midnight and end-of-day boundaries
      if (kind < 6) await addMeal(A, kcal, TODAY, hour);
      else if (kind < 8) await addWorkout(A, [0, 1, 50000][rnd(3)], TODAY, hour);
      else await addMeal(A, kcal, ds(1), hour);   // a neighbouring day, must not leak in
    }
    if (rnd(3) === 0) await bumpSteps(A, TODAY);
    await quiet(run(cA, A, TODAY));
    rr++;
    const [dv, ov] = [await derived(A, TODAY), await oracle(A, TODAY)];
    const empty = ov.kcal === 0 && ov.workout_count === 0;
    if (!(dv ? same(dv, ov) : empty)) { rf++; if (!rex) rex = { i, derived: dv, oracle: ov }; }
  }
  o.randomRun = rr; o.randomFailures = rf; o.randomExample = rex;

  /* ── the touchedDays rule itself, driven ── */
  const cases = [
    [{ workouts: [{ date_time: ds(3) + 'T09:00:00' }] }, [ds(3)]],
    [{ sleep: { waketime: ds(1) + 'T07:00:00' } }, [ds(1)]],
    [{ bio: {} }, [TODAY]],
    [{ workouts: [{ date_time: ds(2) + 'T09:00:00' }, { date_time: ds(2) + 'T18:00:00' }] }, [ds(2)]],
    [{ bio: {}, sleep: { waketime: ds(1) + 'T07:00:00' }, workouts: [{ date_time: ds(3) + 'T09:00:00' }] }, [ds(3), ds(1), TODAY].sort()],
    [{}, []],
    [{ workouts: [{ date_time: 'not-a-date' }] }, []],
    [{ sleep: { waketime: 'nonsense' } }, []],
  ];
  let tp = 0, tfail = null;
  for (const [inp, exp] of cases) {
    const got = touchedDays(inp, TODAY);
    if (JSON.stringify(got) === JSON.stringify(exp)) tp++;
    else if (!tfail) tfail = { inp, got, exp };
  }
  o.touchedDaysRuleCases = cases.length; o.touchedDaysRulePassed = tp; o.touchedDaysRuleFail = tfail;

  console.log(JSON.stringify(o));
  process.exit(0);
})().catch((e) => { console.log(JSON.stringify({ harnessError: String(e && e.stack || e) })); process.exit(0); });
`;
}
