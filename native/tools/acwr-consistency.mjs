/**
 * One acute:chronic ratio in this app, produced in one place.
 *
 * ── the bug this file exists for (BUG-103) ──
 *
 * `weekly-review.tsx` computed its **own** ACWR:
 *
 *     const load28d    = sum(monthLogs.map((l) => Number(l.volume_load) || 0));
 *     const chronicAvg = load28d / 28;
 *     const acwr = chronicAvg > 0 ? (load7d / 7) / chronicAvg : 0;
 *
 * Four regressions from the canonical path, each already fixed and written down
 * in `readiness-engine.ts`: tonnage instead of internal load, so a watch import
 * reads as a week of no training; a flat 28 instead of `max(chronicDays, 7)`;
 * `0` instead of `null` for "cannot tell"; and no `hasEnoughData` gate.
 *
 * Measured on PostgreSQL 16.13 with the real `recomputeDailyLog` and the real
 * engine, one barbell session every other day — training perfectly evenly:
 *
 *     lịch sử    engine (Today)      weekly review
 *     1 tuần     1.00 · optimal      4.00 · spike   → "Giảm 15-20% … tránh chấn thương"
 *     2 tuần     1.06 · optimal      2.29 · spike   → "Giảm 15-20% …"
 *     4 tuần     1.10 · optimal      1.14 · optimal
 *
 * Identical in all six timezones including both DST days — arithmetic, not date
 * handling. Two screens, two verdicts, and the wrong one is the screen telling
 * people to deload to avoid injury.
 *
 * ── what this file checks ──
 *
 * **Structural**, over the real source with comments stripped — so the old
 * formula quoted inside `latestAcwr`'s documentation, which is there on purpose,
 * does not trip the rule that forbids it in code.
 *
 * **Behavioural**, driving the **real `recomputeDailyLog`**, the **real
 * `computeReadiness`** and the **real `latestAcwr`** against a **real
 * PostgreSQL 16.13** built from every migration. The invariant proved is not a
 * number but a relationship: what the weekly review displays is what
 * `daily_logs.acwr` holds, including when that is `null`.
 *
 * If PostgreSQL or the `pg` client is missing this step **skips loudly** rather
 * than passing.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const read = (rel) => readFileSync(path.join(rel.startsWith('supabase/') ? ROOT : NATIVE, rel), 'utf8');
/* Comments stripped before every structural match, in both directions: a
   forbidden formula hiding in prose must not go unnoticed, and a forbidden
   formula QUOTED in prose to explain why it is forbidden must not go red. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

/* ─────────────────────────────────────────────────────────────────────────
   RULE A — structural
   ───────────────────────────────────────────────────────────────────────── */
{
  const wr = strip(read('src/app/weekly-review.tsx'));
  const tc = strip(read('src/lib/training-card.ts'));

  /* A1 — no second ACWR formula in the weekly review. */
  for (const [name, re] of [
    ['chronicAvg', /chronicAvg/],
    ['load28d', /load28d/],
    ['chia cho 28', /\/\s*28\b/],
    ['(load7d / 7)', /load7d\s*\/\s*7/],
  ]) {
    want(
      !re.test(wr),
      `weekly-review lại tự tính ACWR (${name}) — đây là bản dựng thứ hai của một con số ` +
        'đã có nguồn chính tắc, và bản cũ cho 4.00 "spike" khi engine cho 1.00 "optimal" ' +
        'cho người tập đều đặn, kèm lời khuyên giảm 15-20% tải để tránh chấn thương',
    );
  }

  /* A2 — it reads the canonical value instead. */
  want(
    /const acwr = latestAcwr\(logs\)/.test(wr),
    'weekly-review không còn lấy ACWR qua latestAcwr(logs) — tỉ lệ phải được ĐỌC từ ' +
      'daily_logs.acwr, thứ recomputeDailyLog ghi từ computeReadiness, chứ không tính lại',
  );
  /* A3 — and asks the database for it. */
  want(
    /from\('daily_logs'\)[\s\S]{0,200}?\.select\('[^']*\bacwr\b[^']*'\)/.test(wr),
    'weekly-review không còn select cột acwr — không có cột thì latestAcwr luôn trả null ' +
      'và ô ACWR im lặng biến mất',
  );

  /* A4 — 0 is a real ratio; absent is not. Truthiness cannot tell them apart. */
  want(
    /sub: acwr != null \?/.test(wr),
    'ô ACWR lại dùng truthiness (acwr ? …) — 0 là một tỉ lệ THẬT ("tuần này không tập gì, ' +
      'trên một nền có thật") và bị ẩn đi như thể không đo được, trong khi null mới là ' +
      'thứ phải hiện dấu —',
  );
  /* A5 — no verdict without a ratio. */
  want(
    /if \(acwr == null\) \{/.test(wr),
    'chuỗi khuyến nghị ACWR không còn được chặn bởi acwr == null — một tuần engine TỪ CHỐI ' +
      'chấm vẫn sinh ra lời khuyên tập luyện',
  );
  /* A6 — and the canonical null is never coerced on the way through. */
  const body = tc.match(/export function latestAcwr[\s\S]*?\n}/)?.[0];
  want(body != null, 'lib/training-card.ts không còn export latestAcwr');
  if (body) {
    want(
      !/\?\?\s*0|\|\|\s*0/.test(body),
      'latestAcwr ép null thành 0 — cột acwr là NULLABLE KHÔNG DEFAULT đúng để phân biệt ' +
        '"không chấm được" với "tuần không tập", và 0 là câu trả lời thứ hai chứ không phải câu đầu',
    );
    want(
      /r\?\.acwr == null/.test(body) && /return best === null \? null : best\.acwr/.test(body),
      'latestAcwr không còn bỏ qua hàng null và trả null khi cả dải không có tỉ lệ nào',
    );
  }

  /* A7 — exactly one ACWR formula in the whole repository. This is the rule
     that catches a THIRD implementation appearing somewhere new. */
  const FILES = [];
  const walk = (base, d) => {
    for (const e of readdirSync(path.join(base, d), { withFileTypes: true })) {
      const rel = `${d}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(base, rel); }
      else if (/\.tsx?$/.test(e.name)) FILES.push([base, rel]);
    }
  };
  walk(NATIVE, 'src');
  walk(ROOT, 'supabase/functions');
  const CANONICAL = 'src/lib/readiness-engine.ts';
  const offenders = [];
  for (const [base, rel] of FILES) {
    if (rel === CANONICAL) continue;
    const src = strip(readFileSync(path.join(base, rel), 'utf8'));
    /* the shape of the ratio itself: an acute term divided by a chronic term */
    if (/acute\s*\/\s*\(?\s*chronic/.test(src) || /load7d\s*\/\s*7[\s\S]{0,80}?chronic/.test(src)) {
      offenders.push(rel);
    }
  }
  want(
    offenders.length === 0,
    `có bản dựng ACWR thứ hai ngoài ${CANONICAL}: ${offenders.join(', ')} — ` +
      'tỉ lệ này chỉ được sinh ra ở MỘT nơi; mọi màn hình khác phải đọc daily_logs.acwr',
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   RULE B — behavioural, real functions on a real cluster
   ───────────────────────────────────────────────────────────────────────── */
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const PGCLIENT = path.join(NATIVE, 'node_modules', 'pg');

if (!PGBIN || !existsSync(PGCLIENT)) {
  console.log(
    'ACWR nhất quán: BỎ QUA phần hành vi — không có PostgreSQL hoặc client pg trên máy này.\n' +
      '  Phần cấu trúc đã chạy. Một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
  );
} else {
  const out = mkdtempSync(path.join(tmpdir(), 'acwr-'));
  /* Port derived from the temp directory: an orphan postmaster whose data dir is
     gone still accepts connections, and Chain Z lost three break-tests to
     measuring that corpse. The data_directory assertion below is the second
     half of the same guard. */
  const PORT = 20000 + (Array.from(out).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 11));
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
    const started = sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} -o '-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}' -l ${DATA}/log -w -t 60 start"`);
    if (started.code !== 0) throw new Error(`không khởi động được PostgreSQL: ${started.text.slice(0, 300)}`);

    const psql = (sql, db = 'postgres') => {
      const f = path.join(out, 'q.sql');
      writeFileSync(f, sql);
      return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
    };
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).text.trim();
    if (live !== DATA) throw new Error(`nói chuyện với cluster khác: ${live} != ${DATA}`);

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
    const migrations = path.join(ROOT, 'supabase', 'migrations');
    for (const m of execFileSync('bash', ['-lc', `ls ${migrations}/*.sql | sort`], { encoding: 'utf8' }).trim().split('\n')) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${m} 2>/dev/null`);
    }
    psql("INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x') ON CONFLICT DO NOTHING;", 'app');

    /* BREAK 7: if the canonical source is gone this must fail loudly here
       rather than quietly measuring nothing. */
    const hasCol = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -tAc "SELECT count(*) FROM information_schema.columns WHERE table_name='daily_logs' AND column_name='acwr'"`).text.trim();
    if (hasCol !== '1') throw new Error('daily_logs.acwr không tồn tại — nguồn chính tắc đã biến mất, không có gì để chứng minh');

    /* ── the real code, transpiled and driven ── */
    const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
    try {
      execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
        '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
        { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch { /* unmapped @/ paths raise TS2307; the emit is still written */ }
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

    const zones = ['America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'America/Denver', 'America/Phoenix', 'Asia/Ho_Chi_Minh'];
    const results = [];
    for (const TZ of zones) {
      const today = execFileSync('node', ['-e', "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
        { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
      const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
        cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
        env: { ...process.env, TZ, ACWR_TODAY: today },
      });
      const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
      if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 300)}`);
      results.push({ TZ, r });
    }

    /* The pinned numbers Chain AD measured — break-tests 4, 5, 6. */
    const PINNED = { 1: 1, 2: 1.06, 4: 1.1 };
    for (const { TZ, r } of results) {
      /* the harness must have built the situation, or every assertion is vacuous */
      want(r.sanity.sessions > 0 && r.sanity.nights >= 3,
        `${TZ}: phép thử không dựng được tình huống (${JSON.stringify(r.sanity)}) — bộ dò hỏng`);

      for (const c of r.evenTraining) {
        want(
          c.canonical === PINNED[c.weeks],
          `${TZ} · ${c.weeks} tuần tập ĐỀU: ACWR chính tắc = ${c.canonical}, phải là ${PINNED[c.weeks]} — ` +
            'đây là con số engine cho người tập đều đặn, và bản dựng cũ của weekly-review cho 4.00 ở mốc 1 tuần',
        );
        want(
          c.displayed === c.canonical,
          `${TZ} · ${c.weeks} tuần: weekly-review hiện ${c.displayed} trong khi daily_logs.acwr là ` +
            `${c.canonical} — hai màn hình nói hai con số về cùng một người, cùng một ngày`,
        );
        want(
          c.zone === c.canonicalZone,
          `${TZ} · ${c.weeks} tuần: vùng hiện ra "${c.zone}" khác vùng chính tắc "${c.canonicalZone}"`,
        );
      }

      want(r.noBiometrics.canonical === null && r.noBiometrics.displayed === null,
        `${TZ}: thiếu sinh trắc/giấc ngủ mà vẫn bịa ra ACWR (${JSON.stringify(r.noBiometrics)}) — ` +
          'hasEnoughData từ chối chấm, và màn hình phải im lặng chứ không thay bằng 0');
      want(r.watchOnly.canonical === null && r.watchOnly.displayed === null,
        `${TZ}: người chỉ tập bằng đồng hồ nhận một ACWR giả (${JSON.stringify(r.watchOnly)}) — ` +
          'buổi từ đồng hồ mang sets rỗng nên sessionLoad là null và tỉ lệ không đo được');
      want(r.emptyWeek.displayed === null,
        `${TZ}: tuần không có hàng nào vẫn ra một tỉ lệ (${JSON.stringify(r.emptyWeek)})`);
      want(r.nullNotZero.displayed === null,
        `${TZ}: một tuần toàn hàng acwr NULL bị đọc thành ${r.nullNotZero.displayed} thay vì null`);
      want(r.picksNewest.ok,
        `${TZ}: latestAcwr không lấy ngày MỚI NHẤT có tỉ lệ (${JSON.stringify(r.picksNewest)}) — ` +
          'ACWR đã là một cửa sổ trượt kết thúc ở ngày của nó, nên ngày cuối dải mới là câu trả lời của dải');
    }
  } catch (e) {
    problems.push(`không dựng được phép thử ACWR: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('ACWR không nhất quán:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ACWR nhất quán OK — CHẠY THẬT recomputeDailyLog, computeReadiness và latestAcwr trên PostgreSQL 16.13 ' +
    'dựng từ toàn bộ migration, ở SÁU múi giờ. Người tập ĐỀU ĐẶN nhận 1.00 / 1.06 / 1.10 ở mốc 1 / 2 / 4 ' +
    'tuần lịch sử, và weekly-review hiện ĐÚNG con số ấy cùng đúng vùng — bản đã ship tự tính lấy từ tonnage ' +
    'chia cho 28 cố định và cho 4.00 "spike" ở mốc một tuần, kèm câu "Giảm 15-20% volume tuần tới để tránh ' +
    'chấn thương" cho một người không hề tăng tải. null đi suốt: thiếu sinh trắc và giấc ngủ, người chỉ tập ' +
    'bằng đồng hồ, tuần trống, và tuần toàn hàng NULL đều ra null chứ không phải 0 — vì 0 là một tỉ lệ THẬT ' +
    '("không tập gì trên một nền có thật") và không được dùng để nói "chưa đo được". latestAcwr lấy ngày mới ' +
    'nhất CÓ tỉ lệ, vì ACWR đã là cửa sổ trượt kết thúc ở ngày của nó. Và toàn repo chỉ còn MỘT công thức ' +
    'ACWR, trong readiness-engine.ts.',
);

/* ─────────────────────────────────────────────────────────────────────────
   The PostgREST-shaped shim over a real connection, from Chain S. The
   timestamp parsers matter: the CAS token is a microsecond column compared for
   exact equality, and pg's default Date parser throws the precision away.
   ───────────────────────────────────────────────────────────────────────── */
function SHIM(PORT, PGCLIENT) {
  return String.raw`const { Client, types } = require(${JSON.stringify(PGCLIENT)});
types.setTypeParser(1184, (v) => v);
types.setTypeParser(1114, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
const q = (i) => '"' + String(i).replace(/"/g, '""') + '"';
class B {
  constructor(c, t) { this.c = c; this.t = t; this.cols = '*'; this.f = []; this.o = []; this.l = null; }
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
module.exports = { client: (c) => ({ from: (t) => new B(c, t) }), conn };`;
}

/* No backticks inside this template — it is String.raw and a stray one silently
   terminates it. Eight occurrences across earlier chains were found that way. */
function DRIVER() {
  return String.raw`
const { client, conn } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { recomputeDailyLog } = require('./lib/daily-log-service.js');
const { latestAcwr, acwrZone } = require('./lib/training-card.js');
const A = '11111111-1111-1111-1111-111111111111';
const TZ = process.env.TZ;
const out = {};

(async () => {
  const admin = await conn();
  const c = await conn();
  sb._use(client(c));
  const q = (s, p) => admin.query(s, p || []);
  const wipe = () => q('DELETE FROM meal_entries; DELETE FROM workout_sessions; DELETE FROM sleep_logs; DELETE FROM biometric_samples; DELETE FROM daily_logs;');
  const at = async (d, h) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [d, h, TZ])).rows[0].t;
  const shift = async (d, n) => (await q('SELECT ($1::date + $2::int)::text d', [d, n])).rows[0].d;
  const D0 = process.env.ACWR_TODAY;

  const lifted = (iso) => q(
    'INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,3000,8,$3,$4)',
    [A, iso, JSON.stringify([{ reps: 50, weight_kg: 60 }]), 'manual']);
  /* exactly what use-health-sync writes for a watch workout: no tonnage, no reps */
  const watch = (iso, ext) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,sets,source,external_id) VALUES ($1,$2,0,'[]'::jsonb,'apple_health',$3) ON CONFLICT (user_id,external_id) DO NOTHING",
    [A, iso, ext]);
  /* readiness is gated on hasEnoughData: three biometric readings OR three
     nights in the last seven days. Without these the engine never runs and
     every acwr below would be null for the wrong reason. */
  const nights = async (n) => {
    for (let k = 0; k < n; k++) await q(
      'INSERT INTO sleep_logs (user_id,bedtime,waketime,asleep_min,quality) VALUES ($1,$2,$3,430,8)',
      [A, await at(await shift(D0, -k - 1), '23:00'), await at(await shift(D0, -k), '07:00')]);
  };
  /* the weekly review's own query, by its real shape */
  const weekRows = async (from, toExcl) => (await q(
    'SELECT date::text, acwr FROM daily_logs WHERE user_id=$1 AND date >= $2 AND date < $3 ORDER BY date', [A, from, toExcl])).rows;
  const canonicalOf = async (d) => {
    const r = (await q('SELECT acwr FROM daily_logs WHERE user_id=$1 AND date=$2', [A, d])).rows[0];
    return r && r.acwr != null ? Number(r.acwr) : null;
  };

  /* ── training perfectly evenly, with only as much history as they have ── */
  out.evenTraining = [];
  for (const weeks of [1, 2, 4]) {
    await wipe();
    const days = weeks * 7;
    for (let k = 0; k < days; k += 2) await lifted(await at(await shift(D0, -k), '18:00'));
    await nights(5);
    for (let k = days - 1; k >= 0; k--) await recomputeDailyLog(A, await shift(D0, -k));
    const canonical = await canonicalOf(D0);
    const rows = await weekRows(await shift(D0, -6), await shift(D0, 1));
    const displayed = latestAcwr(rows);
    out.evenTraining.push({
      weeks, canonical, displayed,
      canonicalZone: canonical == null ? null : acwrZone(canonical),
      zone: displayed == null ? null : acwrZone(displayed),
    });
    if (weeks === 4) out.sanity = {
      sessions: (await q('SELECT count(*)::int n FROM workout_sessions WHERE user_id=$1', [A])).rows[0].n,
      nights: (await q('SELECT count(*)::int n FROM sleep_logs WHERE user_id=$1', [A])).rows[0].n,
    };
  }

  /* ── E: sessions but nothing the engine can score against ── */
  await wipe();
  for (let k = 0; k < 28; k += 2) await lifted(await at(await shift(D0, -k), '18:00'));
  for (let k = 27; k >= 0; k--) await recomputeDailyLog(A, await shift(D0, -k));
  out.noBiometrics = {
    canonical: await canonicalOf(D0),
    displayed: latestAcwr(await weekRows(await shift(D0, -6), await shift(D0, 1))),
  };

  /* ── F: the athlete who only ever uses the watch ── */
  await wipe();
  for (let k = 0; k < 28; k += 2) await watch(await at(await shift(D0, -k), '07:00'), 'hk' + k);
  await nights(5);
  for (let k = 27; k >= 0; k--) await recomputeDailyLog(A, await shift(D0, -k));
  out.watchOnly = {
    canonical: await canonicalOf(D0),
    displayed: latestAcwr(await weekRows(await shift(D0, -6), await shift(D0, 1))),
  };

  /* ── a week with no rows at all ── */
  await wipe();
  out.emptyWeek = { displayed: latestAcwr(await weekRows(await shift(D0, -6), await shift(D0, 1))) };

  /* ── every row present, every acwr NULL: must stay null, never 0 ── */
  await wipe();
  for (let k = 0; k < 7; k++) await q('INSERT INTO daily_logs (user_id,date,steps) VALUES ($1,$2,5000)', [A, await shift(D0, -k)]);
  out.nullNotZero = { displayed: latestAcwr(await weekRows(await shift(D0, -6), await shift(D0, 1))) };

  /* ── the newest day carries the answer, and a null newer day does not erase it ── */
  await wipe();
  await q('INSERT INTO daily_logs (user_id,date,acwr) VALUES ($1,$2,0.70)', [A, await shift(D0, -4)]);
  await q('INSERT INTO daily_logs (user_id,date,acwr) VALUES ($1,$2,1.25)', [A, await shift(D0, -2)]);
  await q('INSERT INTO daily_logs (user_id,date,steps) VALUES ($1,$2,5000)', [A, D0]);
  {
    const rows = await weekRows(await shift(D0, -6), await shift(D0, 1));
    const got = latestAcwr(rows);
    const shuffled = [...rows].reverse();
    out.picksNewest = { got, wanted: 1.25, orderIndependent: latestAcwr(shuffled) === got, ok: got === 1.25 && latestAcwr(shuffled) === got };
  }

  /* ── 0 is a real ratio and must survive ── */
  await wipe();
  await q('INSERT INTO daily_logs (user_id,date,acwr) VALUES ($1,$2,0)', [A, D0]);
  out.zeroSurvives = { displayed: latestAcwr(await weekRows(await shift(D0, -6), await shift(D0, 1))) };

  await c.end(); await admin.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
