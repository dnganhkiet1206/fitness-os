/**
 * One definition of "a day this person logged", and every consumer using it.
 *
 * ── the bug this file exists for (BUG-101) ──
 *
 * `daily_logs` has two kinds of writer. `recomputeDailyLog` writes the derived
 * projection — `kcal`, `workout_count`, `sleep_duration_min`, … — and it runs
 * because somebody logged something. `use-health-sync` writes `steps`,
 * `active_kcal` and `active_minutes`, and it **upserts**, so it *creates* the
 * row for up to thirteen finished HealthKit days on a first sync. A phone
 * counting steps in a pocket therefore manufactures `daily_logs` rows for days
 * nobody opened the app.
 *
 * That is why `LOGGED_DAY_FILTER` exists: row existence stopped being evidence
 * of logging, so the streak asks the columns instead. Chain I fixed the two
 * streak readers. It did not reach the third reader of the same question —
 * the `log_7` weekly challenge, whose own description is *"Ghi log đầy đủ 7
 * ngày trong tuần"* and which counted rows.
 *
 * Measured on PostgreSQL 16.13 built from every migration, for an account that
 * has never logged a meal, a workout, a night or a supplement, first sync on a
 * Sunday:
 *
 *     hàng daily_logs do đồng bộ bước chân tạo : 14
 *     streakFrom (LOGGED_DAY_FILTER)          : 0 ngày
 *     log_7      (không lọc gì)               : 7/7
 *
 * Seven of seven on a **gold-tier** challenge, paid through
 * `claim_quest_reward`, for a week nobody logged anything in.
 *
 * ── why the behavioural rule executes the shipped query text ──
 *
 * A rule that asserts `LOGGED_DAY_FILTER` still says the right thing proves
 * nothing about a consumer that never applies it — that is exactly the bug
 * above, and `tools/streak-challenge.mjs` already holds the constant's shape.
 * So Rule B does not transcribe the query: it **reads the real chain out of
 * `use-extras.ts`, translates it to SQL, and runs it** against fixtures. Remove
 * the filter, remove the `user_id` restriction, move the week bounds, or let
 * `steps` into the constant, and the number this file measures changes.
 *
 * The translator is deliberately narrow. An operator it does not recognise is a
 * **failure**, not something to skip — a query that quietly stopped being
 * understood is a query nobody is checking any more.
 *
 * ── and why comments are stripped before Rule A ──
 *
 * `src/lib/streak.ts` and both streak readers describe `LOGGED_DAY_FILTER` in
 * prose at length. A rule matching raw text would be satisfied by a paragraph
 * about the filter next to a query that does not use it, which is the one
 * failure mode this file cannot have. Chain AA hit the mirror image of this:
 * a rule went red on a comment saying a hook *used to be* read there.
 *
 * If PostgreSQL or the `pg` client is missing, Rule B **skips loudly**. Rule A
 * still runs — it needs nothing but the source.
 */
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ─────────────────────────────────────────────────────────────────────────
   Shared: pull the PostgREST chains out of a file, comments already gone
   ───────────────────────────────────────────────────────────────────────── */

/** Every `.from('daily_logs')` chain in `text`, each ending at its statement's `;`. */
function chainsOver(text, table) {
  const out = [];
  const needle = `.from('${table}')`;
  let i = 0;
  for (;;) {
    const at = text.indexOf(needle, i);
    if (at < 0) break;
    const end = text.indexOf(';', at);
    out.push({ at, text: text.slice(at, end < 0 ? text.length : end) });
    i = at + needle.length;
  }
  return out;
}

/** The call list of a chain — `[['select', "'date'"], ['eq', "'user_id', user.id"], …]`. */
function callsOf(chain) {
  const calls = [];
  const re = /\.(\w+)\(/g;
  let m;
  while ((m = re.exec(chain))) {
    if (m.index === 0) continue; // the `.from(` that opens it is matched below
    let depth = 1;
    let j = re.lastIndex;
    let quote = null;
    for (; j < chain.length && depth > 0; j++) {
      const ch = chain[j];
      if (quote) { if (ch === '\\') j++; else if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if (ch === '(' || ch === '{' || ch === '[') depth++;
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    calls.push([m[1], chain.slice(re.lastIndex, j - 1).trim()]);
  }
  return calls;
}

/** The first argument, when it is a plain single-quoted string. */
const firstString = (args) => args.match(/^'([^']*)'/)?.[1] ?? null;

/* ─────────────────────────────────────────────────────────────────────────
   Rule A — a query that treats rows as evidence of a logged day must say
   which days count
   ─────────────────────────────────────────────────────────────────────────

   The question a query is asking is readable from its select list. A chain that
   selects **only `date`** is not after a value; it is after the existence of a
   day, and it is the shape both streak readers and `log_7` have. Anything that
   selects a metric column is asking about that metric and filters on it itself.

   Such a query is allowed exactly two answers:

     1. `.or(LOGGED_DAY_FILTER)` — the shared definition, or
     2. its own predicate on a named column, which declares a different
        question. `useStepsAvailable` is the live example: it selects `date`
        with `.gt('steps', 0)` and means *"has this device ever fed us steps"*.

   `user_id` and `date` do not count as that predicate: every one of these
   queries carries them, so accepting them would accept everything. */
{
  const FILES = [];
  const walk = (dir) => {
    for (const e of readdirSync(path.join(NATIVE, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) FILES.push(rel);
    }
  };
  walk('src');

  const SCOPE_ONLY = new Set(['user_id', 'date']);
  let existenceQueries = 0;
  let log7Seen = false;

  for (const f of FILES) {
    const src = strip(read(f));
    for (const { at, text } of chainsOver(src, 'daily_logs')) {
      const calls = callsOf(text);
      const select = calls.find(([name]) => name === 'select');
      if (!select) continue;                       // insert/upsert/update — not a reader
      const cols = (firstString(select[1]) ?? '').split(',').map((c) => c.trim()).filter(Boolean);
      if (cols.length !== 1 || cols[0] !== 'date') continue;   // asks for a value, not a day

      existenceQueries++;
      const line = src.slice(0, at).split('\n').length;
      const usesShared = /\.or\(LOGGED_DAY_FILTER\)/.test(text);
      const ownPredicate = calls.some(([name, args]) => {
        if (!['gt', 'gte', 'lt', 'lte', 'eq', 'neq', 'not', 'is', 'in'].includes(name)) return false;
        const col = firstString(args);
        return col != null && !SCOPE_ONLY.has(col);
      });
      if (/challenge_key === 'log_7'/.test(src.slice(Math.max(0, at - 400), at))) log7Seen = true;

      if (!usesShared && !ownPredicate) {
        problems.push(
          `${f}:${line}: truy vấn daily_logs chỉ chọn 'date' — tức là đang coi SỰ TỒN TẠI của dòng ` +
            'là bằng chứng người ta đã ghi log — mà không lọc LOGGED_DAY_FILTER và cũng không tự khai ' +
            'một vị từ trên cột nào. Đồng bộ sức khoẻ upsert {user_id, date, steps} cho tới 13 ngày ' +
            'HealthKit đã đóng, và upsert TẠO dòng: một chiếc điện thoại đếm bước trong túi tự sinh ' +
            'ra ngày. Đo được: log_7 ra 7/7 cho tài khoản chưa ghi gì, trong khi chuỗi ngày ra 0',
        );
      }
    }
  }

  /* A scanner that has stopped finding its targets passes for the wrong reason. */
  if (existenceQueries < 4) {
    problems.push(
      `chỉ tìm thấy ${existenceQueries} truy vấn "ngày có tồn tại không" trên daily_logs (chờ ít nhất 4: ` +
        'hai chỗ đọc chuỗi, log_7, và useStepsAvailable) — bộ quét lạc mục tiêu, đừng tin kết quả',
    );
  }
  if (!log7Seen) {
    problems.push(
      'không định vị được truy vấn log_7 trong use-extras.ts — đây là truy vấn BUG-101 nói tới, ' +
        'và một quy tắc không nhìn thấy mục tiêu của nó thì không canh gì cả',
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule B — run the shipped query, on real rows
   ───────────────────────────────────────────────────────────────────────── */

const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const pgClientDir = [path.join(NATIVE, 'node_modules'), '/usr/lib/node_modules']
  .find((d) => existsSync(path.join(d, 'pg'))) ?? null;

if (!PGBIN || !pgClientDir) {
  console.log(
    'ngày-được-ghi-log — quy tắc A đã chạy, quy tắc B BỎ QUA và nói rõ là bỏ qua: ' +
      (!PGBIN ? 'không có PostgreSQL trên máy này. ' : '') +
      (!pgClientDir ? 'không có client `pg` (npm i pg). ' : '') +
      'Quy tắc B chạy CHÍNH câu truy vấn đang ship trên dữ liệu thật; im lặng đi qua sẽ là ' +
      'một lời nói dối về mức độ đã kiểm.',
  );
} else {
  const out = mkdtempSync(path.join(tmpdir(), 'lgday-'));
  /*
    ── HARNESS DISCIPLINE: which cluster is answering, and on what port ──

    Two separate hazards, both of which have already cost this repo a wrong
    measurement.

    **A fixed port is not this run's port.** Chain Z spent a round believing
    numbers from an orphan postmaster whose data directory had been deleted:
    `initdb` succeeded, `pg_ctl start` quietly failed, and `psql` connected to
    the corpse. So the cluster is asked to name its own `data_directory` below,
    and the answer must be the directory this run just built.

    **And a free port cannot be computed, only found.** Deriving the port from
    this run's temp directory was still a guess, and the first version drew it
    from 49000–58000 — inside this kernel's `ip_local_port_range`
    (32768–60999). Inside `tools/check.mjs` this is the fifth step to build a
    cluster, and the four before it open a great many client connections; one
    of those *outbound* sockets was sitting on the port this step then tried to
    bind: *"could not bind IPv4 address … Address already in use"*. Green
    standalone, red in the suite, which is the worst shape a rule can have.

    So the base moved below the ephemeral range, **and** candidates are still
    tried in turn — the range makes a collision unlikely, the retry makes it
    harmless, and neither alone was enough.
  */
  const PORT_SEED = 20000 + (Math.abs([...out].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7)) % 12000);
  const DATA = path.join(out, 'pg');
  let PORT = PORT_SEED;
  const sh = (cmd) => spawnSync('sh', ['-c', cmd], { encoding: 'utf8' });
  const stopPg = () => {
    sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null || ${PGBIN}/pg_ctl -D ${DATA} stop -m immediate 2>/dev/null`);
  };

  try {
    mkdirSync(DATA, { recursive: true });
    const asPostgres = sh('id -u postgres').status === 0 && process.getuid && process.getuid() === 0;
    if (asPostgres) sh(`chmod 755 ${out} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    const run = (c) => (asPostgres ? sh(`su postgres -c ${JSON.stringify(c)}`) : sh(c));
    const initdb = run(`${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust`);
    if (initdb.status !== 0) throw new Error(`initdb hỏng: ${(initdb.stderr || initdb.stdout || '').trim().slice(-300)}`);
    /*
      ── `-w`, and the postmaster's own log when it refuses ──

      This ran `pg_ctl start` followed by `sleep 2` and then judged the cluster
      by whether `psql` connected. Inside `tools/check.mjs` this step is the
      fifth to build a cluster in one run, and it reported only *"không khởi
      động được PostgreSQL"* — a sentence that names no cause and cannot be
      acted on. `-w` makes `pg_ctl` wait and report, and the postmaster's log
      is what actually says why (a port already taken, shared memory or
      semaphores exhausted by the clusters before this one, no disk left).
    */
    const pgLog = () => { try { return readFileSync(path.join(DATA, 'log'), 'utf8').trim().split('\n').slice(-6).join(' | '); } catch { return '(không đọc được log)'; } };
    let started = null;
    for (let attempt = 0; attempt < 12; attempt++) {
      PORT = PORT_SEED + attempt * 37;
      started = run(`${PGBIN}/pg_ctl -D ${DATA} -o "-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}" -l ${DATA}/log -w -t 60 start`);
      if (started.status === 0) break;
      if (!/Address already in use/.test(pgLog())) break;   // a different fault: say so, do not spin
    }
    if (started.status !== 0) {
      throw new Error(`pg_ctl start hỏng ở cổng ${PORT}: ${(started.stderr || started.stdout || '').trim().slice(-200)} — postmaster nói: ${pgLog()}`);
    }
    const psql = (sqlText, db = 'postgres') => {
      const f = path.join(out, 'q.sql');
      writeFileSync(f, sqlText);
      return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
    };
    const ping = psql('SELECT 1;');
    if (ping.status !== 0) {
      throw new Error(`không nối được tới cổng ${PORT}: ${(ping.stdout || '').trim().slice(-200)} — postmaster nói: ${pgLog()}`);
    }
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).stdout.trim();
    if (live !== DATA) throw new Error(`cluster trả lời KHÔNG phải cluster vừa dựng: ${live} ≠ ${DATA}`);

    psql('CREATE DATABASE lgday;');
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
      'lgday',
    );
    const migrations = readdirSync(path.join(ROOT, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort();
    for (const m of migrations) {
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d lgday -q -f ${path.join(ROOT, 'supabase/migrations', m)} 2>/dev/null`);
    }
    const tableCount = Number(sh(
      `psql -h 127.0.0.1 -p ${PORT} -U postgres -d lgday -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"`,
    ).stdout.trim());
    if (tableCount < 30) throw new Error(`chỉ dựng được ${tableCount} bảng từ ${migrations.length} migration`);

    const A = '11111111-1111-1111-1111-111111111111';
    const B = '22222222-2222-2222-2222-222222222222';
    /* A fixed week, so nothing here depends on the day this suite runs. */
    const WEEK_START = '2026-08-17';
    const WEEK_END = '2026-08-24';

    /* ── the real constant, from the real file ── */
    const filterSrc = strip(read('src/lib/streak.ts')).match(/LOGGED_DAY_FILTER\s*=\s*\n?\s*'([^']+)'/)?.[1];
    if (!filterSrc) throw new Error('lib/streak.ts không còn định nghĩa LOGGED_DAY_FILTER');
    const OPS = { gt: '>', gte: '>=', lt: '<', lte: '<=', eq: '=', neq: '<>' };
    const filterSql = '(' + filterSrc.split(',').map((clause) => {
      const [col, op, val] = clause.trim().split('.');
      if (!OPS[op]) throw new Error(`LOGGED_DAY_FILTER dùng toán tử chưa dịch được: ${clause}`);
      if (!/^[a-z_]+$/.test(col)) throw new Error(`LOGGED_DAY_FILTER có tên cột lạ: ${clause}`);
      return `"${col}" ${OPS[op]} ${Number(val)}`;
    }).join(' OR ') + ')';

    /* ── the real query, from the real file ── */
    const extras = strip(read('src/hooks/use-extras.ts'));
    const branch = extras.match(/challenge_key === 'log_7'\)\s*\{([\s\S]*?)\n\s*\}\s*else\s+if/);
    if (!branch) throw new Error('không tìm thấy nhánh log_7 trong use-extras.ts');
    const chain = chainsOver(branch[1], 'daily_logs')[0];
    if (!chain) throw new Error('nhánh log_7 không còn đọc daily_logs');
    if (!/newValue\s*=\s*logs\?\.length/.test(branch[1])) {
      throw new Error('log_7 không còn đếm SỐ DÒNG trả về — bộ dịch dưới đây không còn mô tả đúng nó');
    }

    /*
      Translate the shipped chain. An operator we do not recognise is a
      **failure**: a query that stopped being understood is a query nobody
      checks any more.

      Placeholders are bound in the order the chain uses them rather than to
      fixed positions, because the break-tests remove calls. Numbered `$1..$3`
      up front meant that deleting `.eq('user_id', …)` left `$1` in the
      parameter list and unused in the SQL — PostgreSQL then refused the
      statement for *"could not determine data type of parameter $1"*, and the
      break-test went red for a harness fault instead of for the cross-account
      leak it exists to catch. A rule that reports the wrong reason is a rule
      that will be believed about the wrong thing.
    */
    const VALUES = { 'user.id': [A, 'uuid'], weekStart: [WEEK_START, 'date'], weekEndStr: [WEEK_END, 'date'] };
    const where = [];
    const params = [];
    for (const [name, args] of callsOf(chain.text)) {
      if (name === 'select') continue;
      if (name === 'or') {
        if (args.trim() !== 'LOGGED_DAY_FILTER') throw new Error(`log_7 .or() không phải LOGGED_DAY_FILTER: ${args}`);
        where.push(filterSql);
        continue;
      }
      if (!OPS[name]) throw new Error(`log_7 dùng toán tử chưa dịch được: .${name}(${args})`);
      const col = firstString(args);
      const rhs = args.slice(args.indexOf(',') + 1).trim();
      if (col == null || !/^[a-z_]+$/.test(col)) throw new Error(`log_7 lọc trên tên cột lạ: .${name}(${args})`);
      if (rhs in VALUES) {
        const [value, type] = VALUES[rhs];
        params.push(value);
        where.push(`"${col}" ${OPS[name]} $${params.length}::${type}`);
      } else if (/^-?\d+(\.\d+)?$/.test(rhs)) {
        where.push(`"${col}" ${OPS[name]} ${Number(rhs)}`);
      } else {
        throw new Error(`log_7 so sánh với một giá trị bộ đo không biết: ${rhs}`);
      }
    }
    const LOG7_SQL = `SELECT date FROM public.daily_logs WHERE ${where.join(' AND ')}`;

    const { default: pg } = await import(path.join(pgClientDir, 'pg/lib/index.js'));
    const db = new pg.Client({ host: '127.0.0.1', port: PORT, user: 'postgres', database: 'lgday' });
    await db.connect();
    await db.query(`INSERT INTO auth.users (id,email) VALUES ($1,'a@x'),($2,'b@x') ON CONFLICT DO NOTHING`, [A, B]);
    const day = (n) => new Date(Date.parse(WEEK_START + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
    /* exactly what use-health-sync writes: the row is created, and only `steps`
       is named — the projection columns stay at their defaults */
    const stepOnly = (u, d) => db.query(
      `INSERT INTO public.daily_logs (user_id,date,steps) VALUES ($1,$2,7500)
       ON CONFLICT (user_id,date) DO UPDATE SET steps = EXCLUDED.steps`, [u, d]);
    /* a day recomputeDailyLog would have written: a real meal is in it */
    const logged = (u, d) => db.query(
      `INSERT INTO public.daily_logs (user_id,date,kcal,protein_g,steps) VALUES ($1,$2,1800,110,7500)
       ON CONFLICT (user_id,date) DO UPDATE SET kcal = EXCLUDED.kcal`, [u, d]);
    const count = async () => (await db.query(LOG7_SQL, params)).rowCount;
    const wipe = () => db.query('DELETE FROM public.daily_logs');
    const want = (ok, message) => { if (!ok) problems.push(message); };

    /* 1 — only step-only rows */
    await wipe();
    for (let i = 0; i < 7; i++) await stepOnly(A, day(i));
    const c1 = await count();
    want(c1 === 0, `7 ngày CHỈ có bước chân được log_7 đếm là ${c1}/7 ngày đã ghi log (phải là 0) — ` +
      'đây đúng là BUG-101: đồng bộ sức khoẻ tạo dòng, và một dòng trần không phải bằng chứng ai ghi gì');

    /* 2 — one legitimate day */
    await wipe();
    await logged(A, day(0));
    const c2 = await count();
    want(c2 === 1, `một ngày ghi log thật được đếm là ${c2} (phải là 1) — bộ lọc đang ăn cả ngày thật`);

    /* 3 — a genuinely logged week must still win */
    await wipe();
    for (let i = 0; i < 7; i++) await logged(A, day(i));
    const c3 = await count();
    want(c3 === 7, `tuần ghi log thật đủ 7 ngày chỉ được đếm ${c3}/7 — bản sửa đang lấy đi thử thách ` +
      'của người thật sự làm được, và đó là cái giá không được phép trả');

    /* 4 — the shipped scenario: a first sync and nothing else */
    await wipe();
    for (let i = 0; i < 7; i++) await stepOnly(A, day(i));
    const c4 = await count();
    want(c4 === 0, `log_7 = ${c4}/7 cho một tuần chỉ có bước chân — thử thách hạng vàng được trả công ` +
      'cho một tuần không ai ghi gì, và nó tự nhận là "Ghi log đầy đủ 7 ngày trong tuần"');

    /* 5 — mixed */
    await wipe();
    for (let i = 0; i < 4; i++) await logged(A, day(i));
    for (let i = 4; i < 7; i++) await stepOnly(A, day(i));
    const c5 = await count();
    want(c5 === 4, `4 ngày thật + 3 ngày chỉ bước chân ra ${c5} (phải là 4)`);

    /* 6 — another account's logged days are not this account's */
    await wipe();
    for (let i = 0; i < 4; i++) await logged(A, day(i));
    for (let i = 0; i < 3; i++) await logged(B, day(i));
    const c6 = await count();
    want(c6 === 4, `ngày ghi log của tài khoản KHÁC lọt vào log_7 (${c6}, phải là 4) — ` +
      'truy vấn mất ràng buộc user_id');

    /* 7 — days outside the week are not in the week */
    await wipe();
    for (let i = 0; i < 4; i++) await logged(A, day(i));
    for (let i = -5; i < 0; i++) await logged(A, day(i));
    for (let i = 7; i < 9; i++) await logged(A, day(i));
    const c7 = await count();
    want(c7 === 4, `ngày NGOÀI tuần lọt vào log_7 (${c7}, phải là 4) — cửa sổ tuần của truy vấn sai`);

    await db.end();
  } catch (e) {
    problems.push(`không dựng được phép thử ngày-được-ghi-log: ${e.message}`);
  } finally {
    stopPg();
    rmSync(out, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('định nghĩa "ngày đã ghi log" đang lệch nhau:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ngày-được-ghi-log OK — mọi truy vấn daily_logs chỉ chọn \'date\' (tức là coi sự tồn tại của dòng ' +
    'là bằng chứng đã ghi log) đều hoặc lọc LOGGED_DAY_FILTER, hoặc tự khai một vị từ trên cột của ' +
    'riêng nó; chú thích bị bóc trước khi so, nên một đoạn văn nói về bộ lọc không thay được bộ lọc. ' +
    'Và CHÍNH câu truy vấn log_7 đang ship được đọc ra khỏi use-extras.ts, dịch sang SQL và CHẠY THẬT ' +
    'trên PostgreSQL dựng từ toàn bộ migration: 7 ngày chỉ có bước chân → 0, một ngày thật → 1, ' +
    'tuần ghi log thật → 7, 4 thật + 3 bước chân → 4, ngày của tài khoản khác → không lọt, ngày ngoài ' +
    'tuần → không lọt. Bản đã ship ra 7/7 cho một tài khoản chưa từng ghi một bữa ăn nào, trong khi ' +
    'chuỗi ngày hỏi cùng câu đó bằng LOGGED_DAY_FILTER và trả về 0 — BUG-101',
);
