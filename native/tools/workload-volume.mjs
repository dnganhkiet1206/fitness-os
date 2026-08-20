/**
 * `avg_volume_28d` — what it currently is, and the decision nobody has made.
 *
 * ── why this file pins behaviour instead of asserting a correct answer ──
 *
 * Chain AD measured that `ai-weekly-review`'s `avg_volume_28d` divides total
 * tonnage by the **number of `daily_logs` rows that happen to exist**:
 *
 *     6.300 kg trên 3 ngày tập, 7 ngày chỉ có bước chân, 18 ngày không có hàng
 *       hiện tại (chia cho 10 HÀNG)      630
 *       chia cho ngày CÓ TẢI (3)       2.100
 *       chia cho 28 ngày lịch            225
 *
 * The current denominator moves with whether the person granted Health access,
 * which has nothing to do with how much they lifted — so it answers none of the
 * questions anybody would ask. But **2.100 and 225 are both honest answers to
 * different questions**, and Chain AE could not find which one this field was
 * meant to be:
 *
 *   - no user-facing label — the value never reaches a screen;
 *   - no sentence in the system prompt describing it; the model is handed
 *     `JSON.stringify(ctx)` and nothing else;
 *   - exactly one consumer, `ai-weekly-review/index.ts`;
 *   - nothing in docs, and the field's introduction is not recoverable from the
 *     squashed history.
 *
 * The repository *does* have one settled convention for averaging tonnage over
 * a 28-day window — `averageWeek(volume28d, chronicDays(...))` in
 * `training-card.ts`, divisor `max(chronicDays, 7)`, labelled *"thói quen" /
 * "habit"*. That answers the **divisor**. It does not answer the **unit**:
 * `averageWeek` returns tonnage *per week* and its own comment rejects per-day
 * as *"a number about a day nobody trained on"*, while this field's name says
 * per-day. Divisor and unit are entangled in that helper, so adopting it would
 * silently change what the number *is*, not just how it is scaled.
 *
 * So this detector does the honest thing: it **proves the ambiguity is real**
 * — that the candidate denominators genuinely disagree on realistic data — and
 * **pins the current behaviour** so that changing it requires a deliberate
 * decision rather than a quiet edit. It hardcodes no winner.
 *
 * When the product decision is made, the pin below is the thing to change, and
 * changing it will make this file's message read false until it is rewritten —
 * which is the point.
 *
 * ── the oracle ──
 *
 * Every expected figure is computed from `workout_sessions` in SQL. It never
 * reads `daily_logs` and never calls the production expression, so a bug in the
 * projection or in the aggregate cannot agree with it by construction.
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
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

/* ─────────────────────────────────────────────────────────────────────────
   RULE A — structural: the open decision stays visible, and the quantities
   that must not be conflated stay separate.
   ───────────────────────────────────────────────────────────────────────── */
{
  const edge = strip(read('supabase/functions/ai-weekly-review/index.ts'));
  const ledger = read('docs/FORENSIC-AUDIT.md');

  /* A1 — the pinned expression is still the one this file measures. Comments
     are stripped first, so the formula quoted in prose above does not count. */
  want(
    /avg_volume_28d:\s*allLogs\.reduce\([\s\S]{0,140}?\/\s*Math\.max\(allLogs\.length,\s*1\)/.test(edge),
    'avg_volume_28d đã đổi công thức — bộ dò này GHIM hành vi hiện tại vì mẫu số của nó ' +
      'là một QUYẾT ĐỊNH SẢN PHẨM chưa ai đưa ra. Nếu đây là thay đổi có chủ đích thì ' +
      'phải cập nhật cả sổ FORENSIC-AUDIT.md lẫn file này, chứ không sửa lặng lẽ một bên',
  );

  /* A2 — the decision is recorded where the next person will find it. */
  want(
    /PRODUCT DECISION REQUIRED[\s\S]{0,400}?AVG_VOLUME_28D/i.test(ledger) ||
      /AVG_VOLUME_28D[\s\S]{0,400}?PRODUCT DECISION REQUIRED/i.test(ledger),
    'sổ không còn ghi PRODUCT DECISION REQUIRED cho mẫu số avg_volume_28d — ' +
      'một quyết định chưa đưa ra mà không được ghi lại sẽ được ai đó đưa ra bằng một dòng sửa',
  );

  /* A3 — tonnage, workout existence and the readiness ratio are three things.
     Chain AD's BUG-103 was exactly the cost of letting two of them merge. */
  want(
    !/avg_volume_28d[\s\S]{0,200}?acwr/i.test(edge) && !/acwr[\s\S]{0,200}?avg_volume_28d/i.test(edge),
    'avg_volume_28d và acwr bị đặt cạnh nhau trong cùng một khối payload — tonnage trung bình ' +
      'và tỉ lệ cấp tính/mạn tính là hai đại lượng khác nhau, và mô hình không được cho biết điều đó',
  );

  /* A3b — the two source-side facts every figure above rests on. Without these
     the behavioural cases would be measuring the harness's own fixtures rather
     than what the app writes: the driver builds watch sessions at tonnage 0 and
     de-duplicates on external_id because THIS is what use-health-sync does. */
  const sync = strip(read('src/hooks/use-health-sync.ts'));
  const workoutUpsert = sync.match(/from\('workout_sessions'\)[\s\S]{0,700}?\);/)?.[0] ?? '';
  want(
    /volume_load:\s*0\b/.test(workoutUpsert) && /sets:\s*\[\]/.test(workoutUpsert),
    'use-health-sync không còn ghi volume_load: 0 và sets: [] cho buổi tập từ đồng hồ — ' +
      'một buổi chạy KHÔNG có tonnage, và bịa ra một con số cho nó làm hỏng đúng cái ' +
      'tỉ lệ mà thẻ tập luyện tồn tại để đáng tin (ghi ở N6 trong sổ)',
  );
  want(
    /onConflict:\s*'user_id,external_id'/.test(workoutUpsert),
    'buổi tập từ đồng hồ không còn upsert theo (user_id, external_id) — mỗi lần đồng bộ lại ' +
      'sẽ chèn thêm một bản sao, và tonnage của ngày đó nhân lên theo số lần mở app',
  );

  /* A4 — and the workload aggregate must not borrow a population rule that was
     proven wrong for it. Chain AC's nutrition helpers answer a different
     question; Chain AB's logged-day filter answers a third. */
  for (const [name, re] of [
    ['LOGGED_DAY_FILTER', /LOGGED_DAY_FILTER/],
    ['nutritionDays', /nutritionDays\s*\(/],
    ['nutritionMean', /nutritionMean\s*\([^)]*volume/],
  ]) {
    want(
      !re.test(edge.split('month_context')[1] ?? ''),
      `month_context dùng ${name} để định dân số cho tải — đó là quy tắc của một câu hỏi khác ` +
        '("ngày này có ghi log không" / "ngày này có ăn không"), không phải của tonnage',
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   RULE B — behavioural, real cluster, independent SQL oracle
   ───────────────────────────────────────────────────────────────────────── */
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const PGCLIENT = path.join(NATIVE, 'node_modules', 'pg');

if (!PGBIN || !existsSync(PGCLIENT)) {
  console.log(
    'khối lượng tập: BỎ QUA phần hành vi — không có PostgreSQL hoặc client pg trên máy này.\n' +
      '  Phần cấu trúc đã chạy. Một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
  );
} else {
  const out = mkdtempSync(path.join(tmpdir(), 'wvol-'));
  const PORT = 20000 + (Array.from(out).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 23));
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
    for (const m of execFileSync('bash', ['-lc', `ls ${path.join(ROOT, 'supabase', 'migrations')}/*.sql | sort`], { encoding: 'utf8' }).trim().split('\n')) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${m} 2>/dev/null`);
    }
    psql("INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x'),('22222222-2222-2222-2222-222222222222','b@x') ON CONFLICT DO NOTHING;", 'app');

    /* ── the real code ── */
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
    /* the production expression, lifted out of the real edge function rather
       than retyped — a copy would agree with itself */
    const edgeRaw = strip(read('supabase/functions/ai-weekly-review/index.ts'));
    const expr = edgeRaw.match(/avg_volume_28d:\s*([\s\S]*?)\s*\},?\s*\n\s*\};/)?.[1]
      ?? edgeRaw.match(/avg_volume_28d:\s*(allLogs\.reduce\([\s\S]*?Math\.max\(allLogs\.length,\s*1\))/)?.[1];
    if (!expr) throw new Error('không trích được biểu thức avg_volume_28d thật từ ai-weekly-review');
    writeFileSync(path.join(out, 'prod.cjs'),
      'module.exports = { avgVolume28d: (allLogs) => (' + expr.replace(/:\s*number/g, '').replace(/:\s*any/g, '') + ') };');

    writeFileSync(path.join(out, 'sb.cjs'), 'let c = null; module.exports = { get supabase() { return c; }, _use: (x) => { c = x; } };');
    writeFileSync(path.join(out, 'shim.cjs'), SHIM(PORT, PGCLIENT));
    writeFileSync(path.join(out, 'drive.cjs'), DRIVER());

    const zones = ['America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'America/Denver', 'America/Phoenix', 'Asia/Ho_Chi_Minh'];
    for (const TZ of zones) {
      const today = execFileSync('node', ['-e', "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
        { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
      const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
        cwd: out, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 900000,
        env: { ...process.env, TZ, WV_TODAY: today, WV_RUNS: process.env.WV_RUNS || '1000' },
      });
      const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
      if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 300)}`);
      /* The measured table, on demand. The ledger quotes these numbers, and a
         number quoted from memory is a number that drifts. */
      if (process.env.WV_DUMP) console.log(TZ, JSON.stringify({ cases: r.cases, random: r.random, convergence: r.convergence }, null, 1));

      /* the harness must have built the situation, or every assertion is vacuous */
      want(r.sanity.sessions > 0 && r.sanity.tonnage > 0,
        `${TZ}: phép thử không dựng được tình huống (${JSON.stringify(r.sanity)}) — bộ dò hỏng`);

      /* B1 — the SQL-built projection agrees with the REAL recomputeDailyLog.
         Everything downstream is measured on rows built the fast way, so this
         is what earns the right to do that. */
      want(r.projectionMatchesReal.ok,
        `${TZ}: dòng daily_logs dựng bằng SQL KHÔNG khớp recomputeDailyLog thật ` +
          `(${JSON.stringify(r.projectionMatchesReal)}) — mọi số đo sau đó vô nghĩa`);

      /* B2 — current behaviour, pinned. Not endorsed: pinned. */
      for (const c of r.cases) {
        want(c.prodEqualsRowAvg,
          `${TZ} · ${c.label}: avg_volume_28d = ${c.prod} nhưng trung bình theo SỐ HÀNG là ` +
            `${c.rowAvg} — hành vi hiện tại đã đổi; nếu có chủ đích thì phải ghi quyết định vào sổ`);
      }

      /* B3 — the ambiguity is real: on realistic data the candidates disagree,
         so "pick whichever" is not a harmless choice. */
      want(r.candidatesDiffer >= 3,
        `${TZ}: các mẫu số ứng viên chỉ khác nhau ở ${r.candidatesDiffer} ca — nếu chúng trùng nhau ` +
          'thì câu hỏi sản phẩm đã tự trả lời, và bộ dò này nên được thay bằng một bản sửa');

      /* B4 — and the current answer is none of them, which is the finding. */
      want(r.neitherCandidate >= 1,
        `${TZ}: không ca nào cho thấy avg_volume_28d khác CẢ HAI cách hiểu — phát hiện của Chain AD ` +
          'là mẫu số hiện tại không trả lời câu nào, và phép thử phải thể hiện được điều đó');

      /* B5 — convergence of the underlying quantity, which is NOT ambiguous. */
      want(r.convergence.deleteOk,
        `${TZ}: xoá buổi tập rồi dựng lại KHÔNG trả tonnage về đúng nguồn (${JSON.stringify(r.convergence)})`);
      want(r.convergence.replayOk,
        `${TZ}: phát lại cùng external_id LÀM NHÂN ĐÔI tonnage (${JSON.stringify(r.convergence)})`);
      want(r.convergence.lateOk,
        `${TZ}: buổi tập từ đồng hồ đến muộn 7 ngày không vào đúng ngày của nó (${JSON.stringify(r.convergence)})`);
      want(r.convergence.watchZeroOk,
        `${TZ}: buổi tập từ đồng hồ (volume_load = 0 CÓ CHỦ ĐÍCH) bị tính thành tonnage ` +
          `(${JSON.stringify(r.convergence)}) — chạy bộ không có tonnage, và bịa ra một con số cho nó ` +
          'là thứ use-health-sync đã từ chối làm');
      want(r.convergence.crossAccountOk,
        `${TZ}: tonnage của tài khoản khác lọt vào (${JSON.stringify(r.convergence)})`);

      /* B6 — DST days carry no special behaviour for tonnage. */
      for (const d of r.dst) {
        want(d.ok, `${TZ} · ngày ${d.date} (${d.hours} giờ): tonnage ${d.got} ≠ oracle ${d.want}`);
      }

      /* B7 — the randomized sweep: current behaviour holds everywhere, and the
         disagreement between candidates is quantified rather than assumed. */
      want(r.random.mismatch === 0,
        `${TZ}: ${r.random.mismatch}/${r.random.runs} trạng thái ngẫu nhiên có avg_volume_28d ` +
          `KHÁC trung bình theo số hàng — ví dụ ${JSON.stringify(r.random.sample)}`);
      want(r.random.runs >= 1000,
        `${TZ}: chỉ chạy ${r.random.runs} trạng thái ngẫu nhiên, cần ít nhất 1000`);
      want(r.random.differFromCalendar > 0 && r.random.differFromTraining > 0,
        `${TZ}: quét ngẫu nhiên không tách được ba cách hiểu ` +
          `(khác lịch ${r.random.differFromCalendar}, khác ngày-tập ${r.random.differFromTraining})`);
    }
  } catch (e) {
    problems.push(`không dựng được phép thử khối lượng tập: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('khối lượng tập — bất biến hỏng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'khối lượng tập OK — GHIM hành vi hiện tại của avg_volume_28d chứ KHÔNG tán thành nó. ' +
    'Chạy biểu thức THẬT lấy ra từ ai-weekly-review trên PostgreSQL 16.13 dựng từ mọi migration, ở SÁU ' +
    'múi giờ, 1.000 trạng thái nguồn ngẫu nhiên mỗi múi, chấm bằng oracle SQL đọc workout_sessions. ' +
    'Mẫu số hiện tại là SỐ HÀNG daily_logs, và phép quét chứng minh nó khác CẢ HAI cách hiểu chính đáng ' +
    '(trung bình theo ngày lịch, trung bình theo ngày có tải) trên dữ liệu thật — nên đây là một QUYẾT ĐỊNH ' +
    'SẢN PHẨM chưa ai đưa ra, không phải một con số đúng. Sổ FORENSIC-AUDIT.md phải còn ghi PRODUCT ' +
    'DECISION REQUIRED cho nó, và đổi công thức mà không đổi sổ sẽ làm bước này đỏ. Những gì KHÔNG mơ hồ ' +
    'thì được khẳng định thẳng: tonnage hội tụ khi xoá buổi tập, phát lại cùng external_id không nhân đôi, ' +
    'buổi đến muộn bảy ngày vào đúng ngày của nó, buổi từ đồng hồ giữ tonnage 0 CÓ CHỦ ĐÍCH, tài khoản ' +
    'không rò sang nhau, và ngày 23/25 giờ không đổi gì.',
);

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

/* No backticks inside — this is String.raw and one stray backtick silently
   terminates the literal. Eight of those across earlier chains. */
function DRIVER() {
  return String.raw`
const { client, conn } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { recomputeDailyLog } = require('./lib/daily-log-service.js');
const { avgVolume28d } = require('./prod.cjs');
const A = '11111111-1111-1111-1111-111111111111';
const BB = '22222222-2222-2222-2222-222222222222';
const TZ = process.env.TZ;
const out = {};
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-6;

(async () => {
  const admin = await conn();
  const c = await conn();
  sb._use(client(c));
  const q = (s, p) => admin.query(s, p || []);
  const wipe = () => q('DELETE FROM workout_sessions; DELETE FROM daily_logs;');
  const at = async (d, h) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [d, h, TZ])).rows[0].t;
  const shift = async (d, n) => (await q('SELECT ($1::date + $2::int)::text d', [d, n])).rows[0].d;
  const D0 = process.env.WV_TODAY;
  const FROM = await shift(D0, -27);
  const TO = await shift(D0, 1);

  const lifted = (iso, vol, u) => q(
    'INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,$3,8,$4,$5)',
    [u || A, iso, vol, JSON.stringify([{ reps: 50, weight_kg: 60 }]), 'manual']);
  const watch = (iso, ext) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,sets,source,external_id) VALUES ($1,$2,0,'[]'::jsonb,'apple_health',$3) ON CONFLICT (user_id,external_id) DO NOTHING",
    [A, iso, ext]);
  const stepOnly = (d) => q(
    'INSERT INTO daily_logs (user_id,date,steps) VALUES ($1,$2,7400) ON CONFLICT (user_id,date) DO UPDATE SET steps = EXCLUDED.steps', [A, d]);

  /* Build the projection the fast way, from the source, in SQL. B1 proves this
     agrees with the real recomputeDailyLog before anything relies on it. */
  const projectSQL = async () => {
    await q(
      "WITH s AS (SELECT (date_time AT TIME ZONE $2)::date dd, count(*)::int n, SUM(volume_load)::numeric v" +
      "           FROM workout_sessions WHERE user_id=$1 GROUP BY 1)" +
      " INSERT INTO daily_logs (user_id, date, workout_count, volume_load)" +
      " SELECT $1, dd, n, v FROM s" +
      " ON CONFLICT (user_id, date) DO UPDATE SET workout_count = EXCLUDED.workout_count, volume_load = EXCLUDED.volume_load",
      [A, TZ]);
    /* days that have a row but no session any more must fall back to zero, which
       is what a rebuild of that day would write */
    await q(
      "UPDATE daily_logs d SET workout_count = 0, volume_load = 0 WHERE d.user_id=$1" +
      " AND NOT EXISTS (SELECT 1 FROM workout_sessions w WHERE w.user_id=$1 AND (w.date_time AT TIME ZONE $2)::date = d.date)",
      [A, TZ]);
  };

  /* ── ORACLE: workout_sessions only, day-assigned by AT TIME ZONE ── */
  const oracle = async (uid) => {
    const r = (await q(
      "WITH w AS (SELECT ($2::date::text||' 00:00')::timestamp AT TIME ZONE $4 lo," +
      "                  ($3::date::text||' 00:00')::timestamp AT TIME ZONE $4 hi)," +
      "     s AS (SELECT (ws.date_time AT TIME ZONE $4)::date dd, ws.volume_load v" +
      "           FROM workout_sessions ws, w WHERE ws.user_id=$1 AND ws.date_time >= w.lo AND ws.date_time < w.hi)," +
      "     d AS (SELECT dd, SUM(v) dv FROM s GROUP BY dd)" +
      " SELECT COALESCE((SELECT SUM(dv) FROM d),0)::float total," +
      "        (SELECT count(*)::int FROM d) session_days," +
      "        (SELECT count(*)::int FROM d WHERE dv > 0) loaded_days",
      [uid, FROM, TO, TZ])).rows[0];
    const total = Number(r.total);
    return {
      total,
      trainingDays: r.session_days,
      loadedDays: r.loaded_days,
      calendarAvg: total / 28,
      trainingAvg: r.loaded_days > 0 ? total / r.loaded_days : 0,
    };
  };
  /* the rows the edge function reads, by its real shape */
  const allLogs = async (uid) => (await q(
    'SELECT date::text, volume_load FROM daily_logs WHERE user_id=$1 AND date >= $2 AND date < $3 ORDER BY date',
    [uid || A, FROM, TO])).rows;

  /* ── B1: the SQL projection must equal the real recomputeDailyLog ── */
  {
    await wipe();
    await lifted(await at(await shift(D0, -1), '18:00'), 2100);
    await lifted(await at(await shift(D0, -1), '19:00'), 900);
    await watch(await at(await shift(D0, -3), '07:00'), 'p1');
    for (const k of [1, 3]) await recomputeDailyLog(A, await shift(D0, -k));
    const real = await allLogs();
    await q('DELETE FROM daily_logs');
    await projectSQL();
    const fake = await allLogs();
    const same = real.length === fake.length && real.every((r, i) =>
      r.date === fake[i].date && near(r.volume_load, fake[i].volume_load));
    out.projectionMatchesReal = { ok: same, real: real.map((r) => r.date + ':' + r.volume_load), fake: fake.map((r) => r.date + ':' + r.volume_load) };
  }

  /* ── §3 cases A–F ── */
  out.cases = [];
  let candidatesDiffer = 0, neitherCandidate = 0;
  const CASES = [
    ['A · 3 ngày tập / 25 ngày trống', 3, 'steps'],
    ['B · 7 ngày tập / 21 ngày trống', 7, 'steps'],
    ['C · 14 ngày tập / 14 ngày trống', 14, 'steps'],
    ['D · 28 ngày tập', 28, 'none'],
    ['E · chỉ buổi từ đồng hồ (volume 0)', 0, 'watch'],
    ['F · tay + đồng hồ trộn lẫn', 5, 'mixed'],
  ];
  for (const [label, nDays, filler] of CASES) {
    await wipe();
    for (let k = 0; k < nDays; k++) await lifted(await at(await shift(D0, -k), '18:00'), 2100);
    if (filler === 'watch') for (let k = 0; k < 10; k++) await watch(await at(await shift(D0, -k), '07:00'), 'w' + k);
    if (filler === 'mixed') for (let k = nDays; k < nDays + 5; k++) await watch(await at(await shift(D0, -k), '07:00'), 'm' + k);
    await projectSQL();
    if (filler === 'steps') for (let k = nDays; k < nDays + 7 && k < 28; k++) await stepOnly(await shift(D0, -k));
    const rows = await allLogs();
    const o = await oracle(A);
    const prod = avgVolume28d(rows);
    const rowAvg = rows.reduce((s, l) => s + (Number(l.volume_load) || 0), 0) / Math.max(rows.length, 1);
    const distinct = new Set([prod.toFixed(4), o.calendarAvg.toFixed(4), o.trainingAvg.toFixed(4)]).size;
    if (distinct === 3) candidatesDiffer++;
    if (!near(prod, o.calendarAvg) && !near(prod, o.trainingAvg)) neitherCandidate++;
    out.cases.push({
      label, rows: rows.length, prod: +prod.toFixed(2), rowAvg: +rowAvg.toFixed(2),
      calendarAvg: +o.calendarAvg.toFixed(2), trainingAvg: +o.trainingAvg.toFixed(2),
      total: o.total, trainingDays: o.trainingDays, loadedDays: o.loadedDays,
      prodEqualsRowAvg: near(prod, rowAvg),
    });
    if (label.startsWith('D')) out.sanity = { sessions: 28, tonnage: o.total };
  }
  out.candidatesDiffer = candidatesDiffer;
  out.neitherCandidate = neitherCandidate;

  /* ── §6 deletion / rebuild / late arrival / replay / cross-account ── */
  {
    const conv = {};
    await wipe();
    await lifted(await at(await shift(D0, -2), '18:00'), 2100);
    await projectSQL();
    const withIt = (await oracle(A)).total;
    await q("DELETE FROM workout_sessions WHERE user_id=$1", [A]);
    await recomputeDailyLog(A, await shift(D0, -2));
    conv.deleteOk = withIt === 2100 && (await allLogs()).every((r) => Number(r.volume_load) === 0);

    await wipe();
    await watch(await at(await shift(D0, -7), '07:00'), 'dup');
    await watch(await at(await shift(D0, -7), '07:00'), 'dup');
    await projectSQL();
    const dupRows = await allLogs();
    conv.replayOk = (await q('SELECT count(*)::int n FROM workout_sessions WHERE user_id=$1', [A])).rows[0].n === 1;
    conv.lateOk = dupRows.length === 1 && dupRows[0].date === (await shift(D0, -7));
    conv.watchZeroOk = Number(dupRows[0].volume_load) === 0;

    await wipe();
    await lifted(await at(D0, '18:00'), 9999, BB);
    await projectSQL();
    conv.crossAccountOk = (await oracle(A)).total === 0 && (await allLogs(A)).every((r) => Number(r.volume_load) === 0);
    out.convergence = conv;
  }

  /* ── §8 DST 23h / 25h ── */
  out.dst = [];
  for (const date of [D0, '2026-03-08', '2026-11-01']) {
    await wipe();
    const e = (await q(
      "SELECT (($1::date - 1)::text||' 23:59')::timestamp AT TIME ZONE $2 a," +
      " ($1::text||' 00:00')::timestamp AT TIME ZONE $2 b," +
      " ($1::text||' 23:59')::timestamp AT TIME ZONE $2 cc," +
      " (($1::date + 1)::text||' 00:00')::timestamp AT TIME ZONE $2 d," +
      " EXTRACT(EPOCH FROM ((($1::date + 1)::text||' 00:00')::timestamp AT TIME ZONE $2 - ($1::text||' 00:00')::timestamp AT TIME ZONE $2))/3600 hours",
      [date, TZ])).rows[0];
    await lifted(e.a, 111); await lifted(e.b, 222); await lifted(e.cc, 333); await lifted(e.d, 444);
    await recomputeDailyLog(A, date);
    const got = Number((await q('SELECT volume_load FROM daily_logs WHERE user_id=$1 AND date=$2', [A, date])).rows[0].volume_load);
    out.dst.push({ date, hours: Number(e.hours), got, want: 555, ok: got === 555 });
  }

  /* ── §8 randomized sweep ── */
  {
    let seed = 918273;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const RUNS = Number(process.env.WV_RUNS || 1000);
    let mismatch = 0, differCal = 0, differTr = 0, sample = null;
    for (let t = 0; t < RUNS; t++) {
      await wipe();
      const nSessions = Math.floor(rnd() * 10);
      for (let i = 0; i < nSessions; i++) {
        const k = Math.floor(rnd() * 28);
        const iso = await at(await shift(D0, -k), String(6 + Math.floor(rnd() * 14)).padStart(2, '0') + ':00');
        if (rnd() < 0.35) await watch(iso, 'r' + t + '_' + i);
        else await lifted(iso, Math.floor(rnd() * 4000));
      }
      await projectSQL();
      const nSteps = Math.floor(rnd() * 8);
      for (let i = 0; i < nSteps; i++) await stepOnly(await shift(D0, -Math.floor(rnd() * 28)));
      const rows = await allLogs();
      const o = await oracle(A);
      const prod = avgVolume28d(rows);
      const rowAvg = rows.reduce((s, l) => s + (Number(l.volume_load) || 0), 0) / Math.max(rows.length, 1);
      if (!near(prod, rowAvg)) { mismatch++; if (!sample) sample = { prod, rowAvg, rows: rows.length }; }
      if (!near(prod, o.calendarAvg)) differCal++;
      if (!near(prod, o.trainingAvg)) differTr++;
    }
    out.random = { runs: RUNS, mismatch, differFromCalendar: differCal, differFromTraining: differTr, sample };
  }

  await c.end(); await admin.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
