/**
 * A medal is the only thing this app writes that it never takes back.
 *
 * `awards` carries `UNIQUE (user_id, award_key)`, a `SELECT`/`INSERT`/`DELETE`
 * policy for its owner and **no `UPDATE` policy at all** — so a row written
 * there is history. Chain S showed `daily_logs` can be temporarily wrong and
 * that the streak medals are decided from it; Chain R showed the celebration of
 * a medal is user-scoped state. This asks the question those two leave open:
 *
 *     can incorrect, stale or duplicated derived state permanently create,
 *     or permanently suppress, an award?
 *
 * ── how these rules work ──
 *
 * Rules A–C run the **real decision** (`awardsToGrant`, `isDuplicateAward`,
 * `grantAll`, and the real `streakFrom`). Rules D–F run against a **real
 * PostgreSQL 16.13** built from every migration, as the `authenticated` role
 * with the caller's JWT claim, so RLS is in force — and the expected answer is
 * an **independent** consecutive-day count computed from the source tables,
 * which never calls `streakFrom` and never calls the app.
 *
 * Without PostgreSQL or `pg` the database half **skips loudly**; the pure half
 * still runs.
 *
 * ── the two bugs it was written for ──
 *
 * **1. A duplicate was recognised by English prose.**
 *
 *     if (error && !error.message.includes('duplicate')) throw error;
 *
 * PostgreSQL really does say `duplicate key value violates unique constraint
 * "awards_user_id_award_key_key"` — measured — so it worked. It is also the
 * third time this shape has been found in this repository, and the previous two
 * (`DailyLogRebuildError`, `WrongAccountError`) are classes precisely because a
 * decision keyed on wording breaks silently when the wording changes. The
 * blast radius was not one medal: `grant` throwing left the single outer
 * `catch {}` to swallow it and **every award after it in the pass was skipped**.
 *
 * **2. One award's failure cost all the others.** Awards are independent facts
 * about a person; they were granted inside one `try`.
 *
 * ── and one thing this file deliberately does not assert ──
 *
 * Whether a medal should survive its condition becoming false. Measured: one
 * missing `daily_logs` row cut a genuine eight-day run to three, so `streak_7`
 * was not granted; repairing the day recovers it **while the run is still
 * alive**, and a medal is only ever decided from the *current* streak. Whether
 * a completed run should still count once it has lapsed is a product decision,
 * recorded in the ledger and not enforced here.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const out = mkdtempSync(path.join(tmpdir(), 'awc-'));
const sh = (cmd) => spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });

const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const pgClientDir = [path.join(NATIVE, 'node_modules'), '/usr/lib/node_modules']
  .find((d) => existsSync(path.join(d, 'pg'))) ?? null;
/* Below the ephemeral range (32768-60999 on Linux): a port inside it can be
   taken by any outbound socket, and under a full `check.mjs` run there are
   many. Standalone this file was green and inside the suite it failed with
   "khong khoi dong duoc PostgreSQL" — bisected to the parent commit, where it
   failed identically, so it is the port and not the change. */
const PORT = 24398;
const DATA = path.join(tmpdir(), `pg-awards-${process.pid}`);

function stopPg() {
  if (!PGBIN) return;
  sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null || ${PGBIN}/pg_ctl -D ${DATA} stop -m immediate 2>/dev/null`);
  rmSync(DATA, { recursive: true, force: true });
}

try {
  /* ── the real modules ── */
  const FILES = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  try {
    execFileSync('npx', ['tsc', ...FILES, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of FILES) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`));
  }

  /* ── the database half, when this machine can answer ── */
  let dbReady = false;
  if (PGBIN && pgClientDir) {
    rmSync(DATA, { recursive: true, force: true });
    mkdirSync(DATA, { recursive: true });
    const asRoot = process.getuid && process.getuid() === 0 && sh('id -u postgres').status === 0;
    if (asRoot) sh(`chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    const run = (c) => (asRoot ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
    run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
    run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}" -l ${DATA}/log start`);
    sh('sleep 2');
    const psql = (t, db = 'postgres') => {
      const f = path.join(out, 'q.sql'); writeFileSync(f, t);
      return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
    };
    if (psql('SELECT 1;').status === 0) {
      psql('CREATE DATABASE aw;');
      psql(`CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());
        CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;
        CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;
        CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
        DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
        DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
        DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;
        GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;`, 'aw');
      for (const m of readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
        sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d aw -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
      }
      psql('GRANT ALL ON ALL TABLES IN SCHEMA public TO anon,authenticated,service_role; GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon,authenticated,service_role;', 'aw');
      dbReady = Number(sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d aw -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`).stdout.trim()) >= 30;
    }
  }

  writeFileSync(path.join(out, 'drive.cjs'), DRIVER(PORT, pgClientDir, dbReady));
  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], {
    cwd: out, encoding: 'utf8', env: { ...process.env, NODE_PATH: pgClientDir ?? '' }, maxBuffer: 64 * 1024 * 1024,
  });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  const want = (ok, m) => { if (!ok) problems.push(m); };
  if (r.harnessError) throw new Error(r.harnessError);

  /* A — the decision itself */
  want(
    r.pureCases === r.purePassed,
    `awardsToGrant sai ${r.pureCases - r.purePassed}/${r.pureCases} ca ngưỡng/biên: ${JSON.stringify(r.pureFail)}`,
  );
  want(
    r.nullNeverGrants,
    'một nguồn KHÔNG ĐỌC ĐƯỢC (null) vẫn được đem so với ngưỡng — ' +
      '`null` là "không biết", không phải "chưa đủ"; đọc hỏng mà quyết được là cách một lỗi mạng ' +
      'trở thành một quyết định vĩnh viễn',
  );
  want(
    r.earnedNeverRegranted,
    'một huy chương đã có vẫn nằm trong danh sách cấp — mỗi lần mở Today sẽ là một lần ăn mừng lại',
  );

  /* B — duplicate detection */
  want(
    r.dupByCode && !r.dupByOtherCode && !r.dupByMessageOnly,
    `isDuplicateAward nhận nhầm: 23505=${r.dupByCode}, 42501=${r.dupByOtherCode}, ` +
      `chỉ-có-chữ-"duplicate"-trong-message=${r.dupByMessageOnly} — ` +
      'trùng khoá phải nhận theo SQLSTATE, không theo chữ tiếng Anh trong thông điệp của PostgreSQL',
  );
  want(
    r.realPgDuplicateRecognised !== false,
    'lỗi trùng khoá THẬT từ PostgreSQL không được isDuplicateAward nhận ra — ' +
      'lần cấp thứ hai sẽ NÉM, và cái `catch` im lặng ở ngoài sẽ nuốt mọi huy chương còn lại trong lượt đó',
  );

  /* C — one failure must not cost the others */
  want(
    r.independentGranted === 'streak_3,steps_10k' && r.independentFailed === 'first_workout',
    `một lần cấp hỏng ở giữa danh sách làm mất các huy chương khác ` +
      `(cấp được: ${r.independentGranted}, hỏng: ${r.independentFailed}) — ` +
      'huy chương là những sự thật độc lập; chuỗi ngày hỏng không nói gì về buổi tập đầu tiên',
  );

  /* D–F — the database */
  if (!r.db) {
    console.log(
      'huy chương — nửa cơ sở dữ liệu BỎ QUA, và nói rõ là bỏ qua: ' +
        'không có PostgreSQL hoặc client `pg`. Các luật thuần vẫn chạy.',
    );
  } else {
    want(r.concurrentRows === 1, `10 lượt cấp cùng lúc một khoá tạo ra ${r.concurrentRows} hàng — phải đúng 1`);
    want(r.concurrentCodes === '23505', `các lượt thua trả mã ${r.concurrentCodes} — phải là 23505 để nhận ra là trùng`);
    want(r.differentAwardsKept === 2, `hai huy chương KHÁC nhau cấp cùng lúc chỉ còn ${r.differentAwardsKept}`);
    want(r.crossUserRefused, 'ALPHA ghi được huy chương cho BRAVO');
    want(r.deletedAccountRefused, 'huy chương vẫn tạo được cho một tài khoản đã bị xoá');
    want(r.updateBlocked, 'một huy chương đã cấp SỬA được bậc/khoá — lịch sử phải bất biến');
    want(
      r.suppressionReproduced,
      `một hàng daily_logs thiếu KHÔNG còn làm hụt chuỗi (app ${r.appStreak} vs nguồn ${r.oracleStreak}) — ` +
        'phép thử này mô tả hậu quả của BUG-82; nó xanh trở lại nghĩa là kịch bản không còn dựng được, ' +
        'và luật hồi phục bên dưới không còn chứng minh gì',
    );
    want(
      r.recoveredAfterRepair,
      `sau khi hàng daily_logs được vá, chuỗi vẫn không hồi phục (${r.repairedStreak}) — ` +
        'huy chương bị nén phải cấp lại được ở lượt kiểm kế tiếp',
    );
  }
} catch (e) {
  problems.push(`không dựng được phép thử huy chương: ${e.message}`);
} finally {
  stopPg();
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('huy chương còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'huy chương OK — CHẠY THẬT quyết định cấp huy chương (awardsToGrant, isDuplicateAward, grantAll, streakFrom) ' +
    'và, trên PostgreSQL 16.13 dựng từ toàn bộ migration với vai authenticated nên RLS còn hiệu lực: ' +
    '10 lượt cấp cùng lúc một khoá để lại ĐÚNG MỘT hàng và các lượt thua trả 23505; hai huy chương khác nhau ' +
    'cấp song song đều còn; ALPHA không ghi được cho BRAVO; tài khoản đã xoá không nhận được huy chương nào; ' +
    'và một huy chương đã cấp không sửa được bậc (không có policy UPDATE). Hai lỗi đã sửa: trùng khoá nay nhận ' +
    'theo SQLSTATE 23505 chứ không theo chữ "duplicate" trong thông điệp tiếng Anh của PostgreSQL (bản cũ đúng ' +
    'hôm nay và hỏng im lặng vào ngày thông điệp đổi — và khi hỏng thì cái catch ngoài cùng nuốt MỌI huy chương ' +
    'còn lại trong lượt); và một lần cấp hỏng nay chỉ mất đúng huy chương đó, các huy chương khác vẫn được cấp. ' +
    'Cộng với: nguồn đọc hỏng (null) không bao giờ được đem so với ngưỡng, huy chương đã có không bao giờ ' +
    'được cấp lại, và kịch bản Chain S — thiếu một hàng daily_logs làm hụt chuỗi thật — vẫn dựng được ' +
    'và vẫn hồi phục sau khi ngày đó được vá',
);

function DRIVER(port, pgDir, dbReady) {
  return String.raw`
const path = require('node:path');
const { awardsToGrant, isDuplicateAward, grantAll, AWARD_DEFINITIONS } = require('./lib/award-grant.js');
const { streakFrom, STREAK_WINDOW } = require('./lib/streak.js');
const o = { db: ${dbReady ? 'true' : 'false'} };

(async () => {
  /* ── A. the decision, over thresholds and edges ── */
  const none = new Set();
  const keys = (s, e = none) => awardsToGrant(s, e).map((d) => d.key).join(',');
  /* Mặc định null cho MỌI nguồn, kể cả bốn nguồn mới. Nếu thiếu, chúng đến
     awardsToGrant dưới dạng undefined — mà usable() cũng loại undefined, nên ca
     kiểm sẽ XANH vì lý do sai và không còn kiểm được gì.
     (Không dùng dấu huyền trong tệp này: cả khối là một template literal.) */
  const S = (p) => ({
    streak: null, workoutCount: null, prCount: null, steps: null,
    mealCount: null, waterDays: null, sleepCount: null, weighCount: null,
    ...p,
  });
  const cases = [
    [S({ streak: 0 }), ''],
    [S({ streak: 2 }), ''],
    [S({ streak: 3 }), 'streak_3'],
    [S({ streak: 7 }), 'streak_3,streak_7'],
    [S({ streak: 365 }), 'streak_3,streak_7,streak_14,streak_30,streak_60,streak_100,streak_180,streak_365'],
    [S({ streak: -5 }), ''],
    [S({ streak: Infinity }), ''],
    [S({ streak: NaN }), ''],
    [S({ workoutCount: 0 }), ''],
    [S({ workoutCount: 1 }), 'first_workout'],
    [S({ workoutCount: 9 }), 'first_workout'],
    [S({ workoutCount: 10 }), 'first_workout,workouts_10'],
    [S({ workoutCount: 100 }), 'first_workout,workouts_10,workouts_50,workouts_100'],
    [S({ prCount: 4 }), 'first_pr'],
    [S({ prCount: 5 }), 'first_pr,pr_5'],
    [S({ steps: 9999 }), ''],
    [S({ steps: 10000 }), 'steps_10k'],
    [S({ steps: 14999 }), 'steps_10k'],
    [S({ steps: 15000 }), 'steps_10k,steps_15k'],
    [S({ steps: 20000 }), 'steps_10k,steps_15k,steps_20k'],
    /* Một con số vô lý vẫn phải trao ĐỦ CẢ THANG, không phải bậc đầu. Ca này
       từng kỳ vọng đúng steps_10k — viết hồi bước chân chỉ có một huy chương —
       và nó bắt được ngay lúc thang dài ra, đúng việc của nó. */
    [S({ steps: 1e12 }), 'steps_10k,steps_15k,steps_20k'],

    /* Bốn miền mới: dưới ngưỡng, đúng ngưỡng, và vượt xa. */
    [S({ mealCount: 0 }), ''],
    [S({ mealCount: 1 }), 'first_meal'],
    [S({ mealCount: 49 }), 'first_meal'],
    [S({ mealCount: 250 }), 'first_meal,meals_50,meals_250'],
    [S({ waterDays: 6 }), ''],
    [S({ waterDays: 7 }), 'water_7'],
    [S({ waterDays: 100 }), 'water_7,water_30,water_100'],
    [S({ sleepCount: 6 }), ''],
    [S({ sleepCount: 30 }), 'sleep_7,sleep_30'],
    [S({ weighCount: 9 }), ''],
    [S({ weighCount: 200 }), 'weigh_10,weigh_50,weigh_200'],
    /* null KHÔNG phải 0: một truy vấn hỏng không được trao gì, kể cả bậc thấp
       nhất. Đây là bất biến mà usable() giữ, và nó dễ vỡ nhất đúng lúc thêm
       miền mới — bốn nhánh mới đều phải đi qua nó. */
    [S({ mealCount: null, waterDays: null, sleepCount: null, weighCount: null }), ''],

    [S({}), ''],
  ];
  let pass = 0, fail = null;
  for (const [src, exp] of cases) {
    const got = keys(src);
    if (got === exp) pass++; else if (!fail) fail = { src, got, exp };
  }
  o.pureCases = cases.length; o.purePassed = pass; o.pureFail = fail;

  /* a source that could not be read must never reach a threshold */
  o.nullNeverGrants = keys(S({ streak: null, workoutCount: null, prCount: null, steps: null })) === '';
  /* and a medal already held is never offered again */
  o.earnedNeverRegranted = keys(S({ streak: 365, workoutCount: 100, prCount: 5, steps: 20000 }),
    new Set(AWARD_DEFINITIONS.map((d) => d.key))) === '';

  /* ── B. duplicate detection ── */
  o.dupByCode = isDuplicateAward({ code: '23505', message: 'whatever' });
  o.dupByOtherCode = isDuplicateAward({ code: '42501', message: 'duplicate-ish wording' });
  o.dupByMessageOnly = isDuplicateAward({ message: 'duplicate key value violates unique constraint' });

  /* ── C. one failure must not cost the others ── */
  const list = [
    AWARD_DEFINITIONS.find((d) => d.key === 'streak_3'),
    AWARD_DEFINITIONS.find((d) => d.key === 'first_workout'),
    AWARD_DEFINITIONS.find((d) => d.key === 'steps_10k'),
  ];
  const res = await grantAll(list, async (def) => {
    if (def.key === 'first_workout') throw Object.assign(new Error('refused'), { code: '42501' });
  });
  o.independentGranted = res.granted.join(',');
  o.independentFailed = res.failed.join(',');

  if (!o.db) { console.log(JSON.stringify(o)); return; }

  /* ── D–F. the database ── */
  const { Client, types } = require(${JSON.stringify(path.join(pgDir ?? '', 'pg'))});
  types.setTypeParser(1082, (v) => v);
  const A = 'aaaaaaaa-1111-1111-1111-111111111111';
  const B = 'bbbbbbbb-2222-2222-2222-222222222222';
  const conn = async (uid) => {
    const c = new Client({ host: '127.0.0.1', port: ${port}, user: 'postgres', database: 'aw' });
    await c.connect();
    if (uid) { await c.query('SET ROLE authenticated'); await c.query('SET "request.jwt.claim.sub" = \'' + uid + '\''); await c.query('SET "request.jwt.claim.role" = \'authenticated\''); }
    return c;
  };
  const adm = await conn(null);
  const ds = (n = 0) => { const t = new Date(); t.setDate(t.getDate() - n);
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
  const TODAY = ds(0);
  const reset = async () => {
    for (const u of [A, B]) {
      await adm.query('DELETE FROM auth.users WHERE id=$1', [u]);
      await adm.query("INSERT INTO auth.users (id,email) VALUES ($1,$2)", [u, u.slice(0, 5) + '@t']);
    }
  };
  const awardRows = async (u) => (await adm.query('SELECT award_key FROM public.awards WHERE user_id=$1 ORDER BY award_key', [u])).rows.map((x) => x.award_key);

  /* 10 concurrent grants of one key */
  await reset();
  const cs = await Promise.all(Array.from({ length: 10 }, () => conn(A)));
  const settled = await Promise.allSettled(cs.map((c) =>
    c.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'streak','streak_7','S7')", [A])));
  o.concurrentRows = (await awardRows(A)).length;
  o.concurrentCodes = [...new Set(settled.filter((x) => x.status === 'rejected').map((x) => x.reason.code))].join(',');
  await Promise.all(cs.map((c) => c.end()));

  /* two different awards, concurrently */
  await reset();
  const c1 = await conn(A), c2 = await conn(A);
  await Promise.all([
    c1.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'streak','streak_3','S3')", [A]),
    c2.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'first_workout','first_workout','FW')", [A]),
  ]);
  o.differentAwardsKept = (await awardRows(A)).length;

  /* the real PostgreSQL duplicate error, through the real predicate */
  let realDupErr = null;
  try { await c1.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'streak','streak_3','S3')", [A]); }
  catch (e) { realDupErr = e; }
  o.realPgDuplicateRecognised = realDupErr ? isDuplicateAward(realDupErr) : null;

  /* cross-user, immutability, deleted account */
  try { await c1.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'streak','streak_30','forged')", [B]); o.crossUserRefused = false; }
  catch (e) { o.crossUserRefused = e.code === '42501'; }
  const upd = await c1.query("UPDATE public.awards SET tier='platinum' WHERE user_id=$1", [A]);
  o.updateBlocked = upd.rowCount === 0;
  await c1.end(); await c2.end();

  await adm.query('DELETE FROM auth.users WHERE id=$1', [A]);
  const cGone = await conn(A);
  try { await cGone.query("INSERT INTO public.awards (user_id,award_type,award_key,title) VALUES ($1,'streak','streak_7','late')", [A]); o.deletedAccountRefused = false; }
  catch (e) { o.deletedAccountRefused = e.code === '23503'; }
  await cGone.end();

  /* the Chain S scenario, with an INDEPENDENT consecutive-day count */
  await reset();
  const cA = await conn(A);
  for (let i = 0; i <= 7; i++) {
    await adm.query("INSERT INTO public.meal_entries (id,user_id,date_time,meal_type,total_kcal,total_protein_g,total_carbs_g,total_fat_g,total_fiber_g) VALUES (gen_random_uuid(),$1,$2::date + interval '12 hours','lunch',600,30,60,20,5)", [A, ds(i)]);
    if (i !== 3) await adm.query("INSERT INTO public.daily_logs (user_id,date,kcal) VALUES ($1,$2,600) ON CONFLICT (user_id,date) DO UPDATE SET kcal=600", [A, ds(i)]);
  }
  const appStreak = async () => {
    const r = await cA.query('SELECT date FROM public.daily_logs WHERE user_id=$1 AND (kcal>0 OR workout_count>0 OR sleep_duration_min>0 OR supplement_taken>0) ORDER BY date DESC LIMIT ' + STREAK_WINDOW, [A]);
    return streakFrom(r.rows.map((x) => x.date), TODAY, []).count;
  };
  /* independent: counts the run itself, from meal_entries, never via streakFrom */
  const oracleStreak = async () => {
    const r = await adm.query("SELECT DISTINCT (date_time AT TIME ZONE 'UTC')::date::text d FROM public.meal_entries WHERE user_id=$1 ORDER BY d DESC", [A]);
    const days = r.rows.map((x) => x.d).filter((d) => d <= TODAY);
    if (!days.length) return 0;
    const step = (d, n) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + n);
      return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    if (days[0] !== TODAY && days[0] !== step(TODAY, -1)) return 0;
    let n = 1, cur = days[0];
    for (const d of days.slice(1)) { if (d === step(cur, -1)) { n++; cur = d; } else break; }
    return n;
  };
  o.appStreak = await appStreak();
  o.oracleStreak = await oracleStreak();
  o.suppressionReproduced = o.appStreak < o.oracleStreak &&
    awardsToGrant(S({ streak: o.appStreak }), none).length < awardsToGrant(S({ streak: o.oracleStreak }), none).length;
  await adm.query("INSERT INTO public.daily_logs (user_id,date,kcal) VALUES ($1,$2,600) ON CONFLICT (user_id,date) DO UPDATE SET kcal=600", [A, ds(3)]);
  o.repairedStreak = await appStreak();
  o.recoveredAfterRepair = o.repairedStreak === o.oracleStreak;
  await cA.end(); await adm.end();

  console.log(JSON.stringify(o));
})().catch((e) => { console.log(JSON.stringify({ harnessError: String((e && e.stack) || e) })); });
`;
}
