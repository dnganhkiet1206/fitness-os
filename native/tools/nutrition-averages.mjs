/**
 * A nutrition average must be taken over the days that carry that nutrition.
 *
 * ── the bug this file exists for (BUG-102) ──
 *
 * `avg(logs.map((l) => Number(l.kcal) || 0))` averaged a metric across
 * `daily_logs` rows where the metric is absent. A row is not a meal:
 * `use-health-sync` upserts `{ user_id, date, steps }` for up to thirteen
 * finished HealthKit days and an upsert **creates** the row, and Chain AB
 * measured that a day whose only meal is deleted keeps its row at zero. So the
 * denominator was "how many rows happen to exist" — a number that moves with
 * whether the person granted Health access, which has nothing to do with what
 * they ate.
 *
 * Measured on PostgreSQL 16.13 with the rows the sync really writes. Somebody
 * eating exactly 2,100 kcal and 150 g of protein on every day they logged:
 *
 *     ngày ghi thật   TB calo   TB đạm   cảnh báo "đạm thấp"
 *     3               900       64       CÓ
 *     5               1.500     107      CÓ
 *     7               2.100     150      –
 *
 * The figure shown is the truth multiplied by `ngày ghi / 7`.
 *
 * ── why this rule does NOT ask for `LOGGED_DAY_FILTER` ──
 *
 * Because that would be a different, still-wrong answer, and Chain AC measured
 * the gap. Three meal days, two workout-only days, two step-only days:
 *
 *     sự thật              : 2.100 / 150
 *     không lọc            :   900 /  64
 *     LOGGED_DAY_FILTER    : 1.260 /  90   ← vẫn lệch
 *     lọc theo chính chỉ số: 2.100 / 150
 *
 * A workout-only day IS a logged day — that is the question `LOGGED_DAY_FILTER`
 * was written for and it answers it correctly — but it carries `kcal = 0`. A
 * rule demanding the canonical filter here would bless a number that is still
 * wrong, which is worse than the bug, so this file forbids that shape too.
 *
 * ── what it checks ──
 *
 * **Structural**, over the real source with comments stripped, so a predicate
 * that lives only in a comment cannot satisfy it.
 *
 * **Behavioural**, driving the **real `metricMean`** and the **real edge
 * function helpers** against a **real PostgreSQL 16.13** built from every
 * migration, judged by an oracle that reads `meal_entries` — the source of
 * truth for eating — and never `daily_logs`. A statistic about eating that
 * disagrees with `meal_entries` is wrong whatever the projection says, which is
 * what gives that oracle the authority to judge.
 *
 * If PostgreSQL or the `pg` client is missing this step **skips loudly** rather
 * than passing: a proof that quietly does nothing is worse than no proof.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const read = (rel) => readFileSync(path.join(rel.startsWith('supabase/') ? ROOT : NATIVE, rel), 'utf8');
/* Comments are stripped before every structural match. BREAK 9: a correct
   predicate written only in prose must not satisfy any rule below. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

/* ─────────────────────────────────────────────────────────────────────────
   RULE A — structural
   ───────────────────────────────────────────────────────────────────────── */
{
  const mean = strip(read('src/lib/nutrition-mean.ts'));
  const wr = strip(read('src/app/weekly-review.tsx'));
  const sg = strip(read('src/app/smart-goals.tsx'));
  const edge = strip(read('supabase/functions/ai-weekly-review/index.ts'));

  /* A1 — the shared rule filters on the value it is about to average, and on
     nothing else. `v` is the value `read(row)` returned; qualifying on any
     other column is BREAK 4/5. */
  const body = mean.match(/export function metricMean[\s\S]*?\n}/)?.[0];
  want(
    body != null,
    'lib/nutrition-mean.ts không còn export metricMean — quy tắc "trung bình theo dân số của chính chỉ số" ' +
      'quay về nằm rải trong từng màn hình, và đó chính là chỗ BUG-102 sinh ra',
  );
  if (body) {
    want(
      /Number\.isFinite\(v\)/.test(body) && /v > 0/.test(body),
      'metricMean không còn lọc theo chính giá trị sắp lấy trung bình (Number.isFinite(v) && v > 0) — ' +
        'một hàng do đồng bộ bước chân tạo ra mang 0 ở cột dinh dưỡng, và đưa nó vào mẫu số ' +
        'cho ra sự thật nhân (số ngày ghi / 7): đo được 2.100 kcal thật hiện ra 900',
    );
    want(
      !/\bkcal\b|\bprotein_g\b/.test(body),
      'metricMean nhắc tên một cột cụ thể — nó phải mù về chỉ số, nếu không thì đạm sẽ bị ' +
        'điều kiện hoá theo calo (hoặc ngược lại), và một ngày có đạm mà không có calo phải vẫn ' +
        'được tính cho trung bình đạm',
    );
  }

  /* A2 — the four weekly-review means come from that rule, and the exact shape
     of the bug is gone. BREAK 1/2/6. */
  for (const [name, re] of [
    ['avgKcal', /\{\s*mean:\s*avgKcal[^}]*\}\s*=\s*metricMean\(\s*logs\s*,\s*\(l\)\s*=>\s*Number\(l\.kcal\)\s*\)/],
    ['avgProtein', /\{\s*mean:\s*avgProtein[^}]*\}\s*=\s*metricMean\(\s*logs\s*,\s*\(l\)\s*=>\s*Number\(l\.protein_g\)\s*\)/],
    ['prevAvgKcal', /prevAvgKcal\s*=\s*metricMean\(\s*pLogs\s*,\s*\(l\)\s*=>\s*Number\(l\.kcal\)\s*\)/],
    ['prevAvgProtein', /prevAvgProtein\s*=\s*metricMean\(\s*pLogs\s*,\s*\(l\)\s*=>\s*Number\(l\.protein_g\)\s*\)/],
  ]) {
    want(
      re.test(wr),
      `weekly-review: ${name} không còn được tính qua metricMean với cột của chính nó — ` +
        'trung bình một chỉ số trên những hàng thiếu chỉ số đó là BUG-102',
    );
  }
  /* The literal shape of the shipped bug, in any nutrition consumer. */
  for (const [file, src] of [['weekly-review', wr], ['smart-goals', sg]]) {
    const bad = src.match(/avg\([^)]*Number\(\w+\.(kcal|protein_g)\)\s*\|\|\s*0[^)]*\)/g);
    want(
      !bad,
      `${file}: còn một trung bình dinh dưỡng lấy trên "Number(...) || 0" (${bad && bad[0]}) — ` +
        '"|| 0" biến một ngày KHÔNG CÓ dữ liệu thành một ngày ăn 0 calo, đúng hình dạng đã ship',
    );
  }

  /* A3 — the gates count the days the mean was built from, not the rows. */
  want(
    /avgProtein < targets\.protein \* 0\.8 && proteinDays >= 3/.test(wr),
    'weekly-review: khuyến nghị "đạm thấp" vẫn mở cổng bằng số HÀNG (daysWithData) chứ không phải ' +
      'số ngày CÓ ĐẠM — đo được: người ăn 150 g mỗi ngày họ ăn, ghi 5/7 ngày, bị báo 107 g và ' +
      'nhận lời khuyên ăn thêm đạm, với ba ngày làm đủ ngưỡng là ba hàng chỉ có bước chân',
  );
  want(
    /avgReadiness < 50 && readinessDays >= 3/.test(wr),
    'weekly-review: khuyến nghị deload mở cổng bằng số hàng chứ không phải số ngày CÓ ĐIỂM SẴN SÀNG',
  );

  /* A4 — the model is handed the average already taken over the right
     population, not left to derive one from rows whose zeros mean "not
     recorded". BREAK 8. */
  want(
    /nutrition:\s*\{[\s\S]{0,300}?avg_kcal:[\s\S]{0,300}?avg_protein_g:/.test(edge),
    'ai-weekly-review: payload không còn mang ctx.week.nutrition.{avg_kcal, avg_protein_g} — ' +
      'mô hình nhận lại từng hàng ngày với kcal: 0, steps: 7400 và tự chia, tức là tự tạo lại BUG-102',
  );
  const edgeMean = edge.match(/const nutritionMean\s*=[\s\S]*?\n\s*\};/)?.[0];
  want(
    edgeMean != null && /Number\.isFinite\(v\)\s*&&\s*v > 0/.test(edgeMean),
    'ai-weekly-review: nutritionMean không còn lọc theo chính giá trị (> 0) — ' +
      'trung bình rời khỏi edge function đã bị pha loãng bởi hàng 0',
  );
  want(
    edgeMean != null && /vals\.length \?/.test(edgeMean),
    'ai-weekly-review: nutritionMean không còn trả null khi không có ngày nào — ' +
      '"không ghi gì" không phải là con số 0, và mô hình sẽ đọc 0 thành "đã ăn 0 calo"',
  );

  /* A5 — and the wrong fix is forbidden as explicitly as the bug. */
  for (const [file, src] of [['weekly-review', wr], ['smart-goals', sg]]) {
    want(
      !/LOGGED_DAY_FILTER/.test(src),
      `${file}: dùng LOGGED_DAY_FILTER để định dân số cho một chỉ số dinh dưỡng — ` +
        'nó trả lời "ngày này có ghi log không", không phải "ngày này có dữ liệu dinh dưỡng không". ' +
        'Đo được: 3 ngày ăn + 2 ngày CHỈ TẬP + 2 ngày chỉ bước chân → sự thật 2.100, bộ lọc đó cho 1.260',
    );
  }

  /* A6 — the empty state is gated on nutrition, not on rows existing. BREAK 7. */
  want(
    /nutritionDays\(\s*\n?\s*dailyLogs \?\? \[\]/.test(sg) && /withNutrition === 0 \|\| !profile/.test(sg),
    'smart-goals: thẻ đạm lại mở cổng bằng dailyLogs.length — một tài khoản chưa từng ghi bữa nào, ' +
      'sau một lần đồng bộ, thấy "14 ngày thấp/14 ngày" màu đỏ thay vì "Chưa có dữ liệu dinh dưỡng"',
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
    'trung bình dinh dưỡng: BỎ QUA phần hành vi — không có PostgreSQL hoặc client pg trên máy này.\n' +
      '  Phần cấu trúc đã chạy. Phép chứng minh hành vi cần một cluster thật; ' +
      'một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
  );
} else {
  const out = mkdtempSync(path.join(tmpdir(), 'nutmean-'));
  /* Port derived from the temp directory: a leftover postmaster from an earlier
     run whose data dir is gone will still accept connections, and every number
     measured against that corpse belongs to a different database. Chain Z lost
     three break-tests to exactly that. */
  const PORT = 20000 + (Array.from(out).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 7));
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
    /* The cluster answering must be the one just built. */
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

    /* ── the real code, loaded rather than reimplemented ──
       `nutrition-mean.ts` imports nothing, so it transpiles on its own. The edge
       function's two helpers are lifted out of the real file and transpiled with
       it, so a change there changes what this proves. */
    const edgeSrc = strip(read('supabase/functions/ai-weekly-review/index.ts'));
    const grab = (name) => edgeSrc.match(new RegExp('const ' + name + '\\s*=[\\s\\S]*?\\n\\s*\\};'))?.[0]
      ?? edgeSrc.match(new RegExp('const ' + name + '\\s*=[\\s\\S]*?;\\n'))?.[0];
    const edgeMean = grab('nutritionMean');
    const edgeDays = grab('nutritionDays');
    if (!edgeMean || !edgeDays) throw new Error('không trích được nutritionMean/nutritionDays thật từ ai-weekly-review');
    mkdirSync(path.join(out, 'src'), { recursive: true });
    writeFileSync(path.join(out, 'src', 'nutrition-mean.ts'), read('src/lib/nutrition-mean.ts'));
    writeFileSync(path.join(out, 'src', 'edge.ts'),
      edgeMean + '\n' + edgeDays + '\nexport { nutritionMean, nutritionDays as edgeNutritionDays };\n');
    execFileSync('npx', ['tsc', 'src/nutrition-mean.ts', 'src/edge.ts', '--ignoreConfig', '--outDir', out,
      '--rootDir', 'src', '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: out, stdio: ['ignore', 'pipe', 'pipe'] });

    writeFileSync(path.join(out, 'drive.cjs'), DRIVER(PORT, PGCLIENT));
    const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
    if (r.harnessError) throw new Error(r.harnessError.slice(0, 400));

    /* The harness must have actually built the situation, or every assertion
       below is vacuous. */
    want(r.sanity.stepOnlyRows > 0 && r.sanity.oracleKcal === 2100,
      `phép thử không dựng được tình huống (${JSON.stringify(r.sanity)}) — bộ dò hỏng, đừng tin phần còn lại`);

    for (const c of r.cases) {
      want(
        c.kcalOk,
        `ca "${c.label}": TB calo = ${c.kcal}, oracle (từ meal_entries) = ${c.wantKcal} — ` +
          'hàng không mang dinh dưỡng đang lọt vào mẫu số',
      );
      want(
        c.proteinOk,
        `ca "${c.label}": TB đạm = ${c.protein}, oracle = ${c.wantProtein}`,
      );
      want(
        c.countOk,
        `ca "${c.label}": số ngày dựng nên trung bình = ${c.kcalDays}/${c.proteinDays}, ` +
          `oracle = ${c.wantKcalDays}/${c.wantProteinDays}`,
      );
    }
    want(r.empty.mean === 0 && r.empty.count === 0,
      `ca E (không có ngày dinh dưỡng nào): metricMean phải trả count 0 chứ không bịa ra một trung bình — ${JSON.stringify(r.empty)}`);
    want(r.empty.cardHidden,
      'ca E: thẻ đạm của smart-goals vẫn hiện dù không có ngày dinh dưỡng nào — phải là "Chưa có dữ liệu dinh dưỡng"');
    want(r.mixed.kcalOk && r.mixed.proteinOk,
      `ca F (calo và đạm ở hai tập ngày KHÁC NHAU): mỗi chỉ số phải dùng dân số của chính nó — ${JSON.stringify(r.mixed)}`);
    want(r.deleted.ok,
      `ca G (xoá bữa ăn): trung bình vẫn giữ giá trị đã xoá — ${JSON.stringify(r.deleted)}`);
    want(r.edge.kcalOk && r.edge.proteinOk && r.edge.nullOnEmpty,
      `ca AI: giá trị rời khỏi ai-weekly-review không khớp oracle — ${JSON.stringify(r.edge)}`);
  } catch (e) {
    problems.push(`không dựng được phép thử trung bình dinh dưỡng: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('trung bình dinh dưỡng bị pha loãng:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'trung bình dinh dưỡng OK — CHẠY THẬT metricMean và hai hàm của ai-weekly-review trên PostgreSQL 16.13 ' +
    'dựng từ toàn bộ migration, chấm bằng oracle đọc meal_entries chứ không đọc daily_logs. ' +
    'Bảy ca: 7/5/3/1 ngày dinh dưỡng lẫn với hàng chỉ-có-bước-chân đều cho 2.100 kcal / 150 g — ' +
    'bản đã ship cho 2.100/1.500/900/300 vì nó chia cho số HÀNG, mà một hàng do đồng bộ bước chân ' +
    'tạo ra không phải một bữa ăn. Không có ngày dinh dưỡng nào thì không bịa ra trung bình, và thẻ ' +
    'đạm hiện đúng trạng thái rỗng. Calo và đạm dùng hai dân số riêng, nên một ngày có đạm mà không ' +
    'có calo vẫn tính cho đạm. Xoá bữa ăn thì trung bình trả lại. Và quy tắc này KHÔNG đòi ' +
    'LOGGED_DAY_FILTER — đo được nó vẫn cho 1.260 thay vì 2.100 khi có ngày chỉ tập, nên dùng nó ở ' +
    'đây sẽ ban phước cho một con số vẫn sai.',
);

/* ─────────────────────────────────────────────────────────────────────────
   The driver. No backticks inside — this template is String.raw and a stray
   backtick silently terminates it (eight occurrences across earlier chains).
   ───────────────────────────────────────────────────────────────────────── */
function DRIVER(PORT, PGCLIENT) {
  return String.raw`
const pg = require(${JSON.stringify(PGCLIENT)});
const { metricMean, nutritionDays } = require('./nutrition-mean.js');
const { nutritionMean, edgeNutritionDays } = require('./edge.js');
const A = '11111111-1111-1111-1111-111111111111';
const KCAL = 2100, PROT = 150;
const out = {};

(async () => {
  const c = new pg.Client({ host: '127.0.0.1', port: ${PORT}, user: 'postgres', database: 'app' });
  await c.connect();
  const q = (s, p) => c.query(s, p || []);

  const wipe = () => q('DELETE FROM meal_entries; DELETE FROM workout_sessions; DELETE FROM daily_logs;');
  const day = async (n) => (await q('SELECT (CURRENT_DATE - $1::int)::text d', [n])).rows[0].d;
  const noon = async (d) => (await q("SELECT ($1::text || ' 12:00')::timestamptz t", [d])).rows[0].t;

  /* a day somebody ate on: the meal row AND the projection it produces */
  const ate = async (d, kcal, prot) => {
    await q("INSERT INTO meal_entries (user_id,date_time,meal_type,total_kcal,total_protein_g) VALUES ($1,$2,'lunch',$3,$4)",
      [A, await noon(d), kcal, prot]);
    await q('INSERT INTO daily_logs (user_id,date,kcal,protein_g) VALUES ($1,$2,$3,$4) ' +
      'ON CONFLICT (user_id,date) DO UPDATE SET kcal = EXCLUDED.kcal, protein_g = EXCLUDED.protein_g',
      [A, d, kcal, prot]);
  };
  /* a day somebody trained on and logged no food */
  const trained = async (d) => {
    await q('INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets) VALUES ($1,$2,6000,7,$3)',
      [A, await noon(d), JSON.stringify([{ reps: 10, weight_kg: 60 }])]);
    await q('INSERT INTO daily_logs (user_id,date,workout_count,volume_load) VALUES ($1,$2,1,6000) ' +
      'ON CONFLICT (user_id,date) DO UPDATE SET workout_count = 1, volume_load = 6000', [A, d]);
  };
  /* EXACTLY what use-health-sync writes: an upsert naming only steps, which
     CREATES the row when the day has none */
  const stepOnly = (d) => q('INSERT INTO daily_logs (user_id,date,steps) VALUES ($1,$2,7400) ' +
    'ON CONFLICT (user_id,date) DO UPDATE SET steps = EXCLUDED.steps', [A, d]);

  /* the production read, by its real column list */
  const rows = async (from) => (await q(
    'SELECT date::text, kcal, protein_g FROM daily_logs WHERE user_id=$1 AND date >= $2 ORDER BY date', [A, from])).rows;

  /* ORACLE — meal_entries only. It never looks at daily_logs, so a bug in the
     projection or in the consumer cannot agree with it by construction. */
  const oracle = async (from) => (await q(
    'WITH d AS (SELECT date_time::date dd, SUM(total_kcal) k, SUM(total_protein_g) p ' +
    '           FROM meal_entries WHERE user_id=$1 AND date_time >= $2::date GROUP BY 1) ' +
    'SELECT (SELECT count(*)::int FROM d WHERE k > 0) kdays, (SELECT count(*)::int FROM d WHERE p > 0) pdays, ' +
    '       (SELECT COALESCE(AVG(k),0)::float FROM d WHERE k > 0) ak, ' +
    '       (SELECT COALESCE(AVG(p),0)::float FROM d WHERE p > 0) ap', [A, from])).rows[0];

  const near = (a, b) => Math.abs(a - b) < 0.001;
  const from = await day(20);

  /* ── A–D and H: nutrition days diluted by step-only rows ── */
  out.cases = [];
  for (const [label, nDays, filler] of [
    ['A · 7 ngày dinh dưỡng', 7, 'none'],
    ['B · 5 ngày dinh dưỡng + 2 ngày chỉ bước chân', 5, 'steps'],
    ['C · 3 ngày dinh dưỡng + 4 ngày chỉ bước chân', 3, 'steps'],
    ['D · 1 ngày dinh dưỡng + 6 ngày rỗng/bước chân', 1, 'steps'],
    ['H · 3 ngày dinh dưỡng + 2 ngày CHỈ TẬP + 2 ngày bước chân', 3, 'mixed'],
  ]) {
    await wipe();
    for (let i = 0; i < nDays; i++) await ate(await day(i + 1), KCAL, PROT);
    if (filler === 'steps') for (let i = nDays; i < 7; i++) await stepOnly(await day(i + 1));
    if (filler === 'mixed') {
      for (let i = nDays; i < nDays + 2; i++) await trained(await day(i + 1));
      for (let i = nDays + 2; i < 7; i++) await stepOnly(await day(i + 1));
    }
    const rs = await rows(from);
    const o = await oracle(from);
    const k = metricMean(rs, (l) => Number(l.kcal));
    const p = metricMean(rs, (l) => Number(l.protein_g));
    out.cases.push({
      label, rows: rs.length,
      kcal: Math.round(k.mean), protein: Math.round(p.mean), kcalDays: k.count, proteinDays: p.count,
      wantKcal: Math.round(o.ak), wantProtein: Math.round(o.ap), wantKcalDays: o.kdays, wantProteinDays: o.pdays,
      kcalOk: near(Math.round(k.mean), Math.round(o.ak)),
      proteinOk: near(Math.round(p.mean), Math.round(o.ap)),
      countOk: k.count === o.kdays && p.count === o.pdays,
    });
    if (label.startsWith('A')) out.sanity = { stepOnlyRows: 0, oracleKcal: Math.round(o.ak) };
    if (label.startsWith('B')) out.sanity.stepOnlyRows = rs.length - o.kdays;
  }

  /* ── E: nothing recorded. No manufactured average, and the card hides. ── */
  await wipe();
  for (let i = 1; i <= 14; i++) await stepOnly(await day(i));
  {
    const rs = await rows(from);
    const k = metricMean(rs, (l) => Number(l.kcal));
    out.empty = {
      rows: rs.length, mean: k.mean, count: k.count,
      cardHidden: nutritionDays(rs, (l) => Number(l.kcal), (l) => Number(l.protein_g)) === 0,
    };
  }

  /* ── F: kcal on one set of days, protein on a different set ── */
  await wipe();
  await ate(await day(1), KCAL, 0);
  await ate(await day(2), KCAL, 0);
  await ate(await day(3), 0, PROT);
  await stepOnly(await day(4));
  {
    const rs = await rows(from);
    const o = await oracle(from);
    const k = metricMean(rs, (l) => Number(l.kcal));
    const p = metricMean(rs, (l) => Number(l.protein_g));
    out.mixed = {
      kcal: Math.round(k.mean), kcalDays: k.count, protein: Math.round(p.mean), proteinDays: p.count,
      wantKcal: Math.round(o.ak), wantKcalDays: o.kdays, wantProtein: Math.round(o.ap), wantProteinDays: o.pdays,
      kcalOk: near(Math.round(k.mean), Math.round(o.ak)) && k.count === o.kdays,
      proteinOk: near(Math.round(p.mean), Math.round(o.ap)) && p.count === o.pdays,
    };
  }

  /* ── G: the meal is deleted and the day rebuilt to zero ── */
  await wipe();
  await ate(await day(1), KCAL, PROT);
  await ate(await day(2), KCAL, PROT);
  const before = metricMean(await rows(from), (l) => Number(l.kcal));
  await q('DELETE FROM meal_entries WHERE user_id=$1 AND date_time::date = $2::date', [A, await day(2)]);
  await q('UPDATE daily_logs SET kcal = 0, protein_g = 0 WHERE user_id=$1 AND date = $2', [A, await day(2)]);
  {
    const after = metricMean(await rows(from), (l) => Number(l.kcal));
    const o = await oracle(from);
    out.deleted = {
      truoc: { mean: Math.round(before.mean), count: before.count },
      sau: { mean: Math.round(after.mean), count: after.count },
      oracle: { mean: Math.round(o.ak), count: o.kdays },
      ok: after.count === o.kdays && near(Math.round(after.mean), Math.round(o.ak)),
    };
  }

  /* ── the AI boundary: the real edge helpers over the same rows ── */
  await wipe();
  for (let i = 1; i <= 3; i++) await ate(await day(i), KCAL, PROT);
  for (let i = 4; i <= 7; i++) await stepOnly(await day(i));
  {
    const rs = await rows(from);
    const o = await oracle(from);
    const ak = nutritionMean(rs, 'kcal');
    const ap = nutritionMean(rs, 'protein_g');
    await wipe();
    for (let i = 1; i <= 7; i++) await stepOnly(await day(i));
    const emptyRows = await rows(from);
    out.edge = {
      avg_kcal: ak, avg_protein_g: ap, kcal_days: edgeNutritionDays(rs, 'kcal'),
      wantKcal: Math.round(o.ak), wantProtein: Math.round(o.ap), wantDays: o.kdays,
      kcalOk: ak === Math.round(o.ak), proteinOk: ap === Math.round(o.ap),
      nullOnEmpty: nutritionMean(emptyRows, 'kcal') === null,
    };
  }

  await c.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
