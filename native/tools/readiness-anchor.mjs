/**
 * A day's readiness is scored against that day's history, and never against
 * anything that happened after it.
 *
 * ── the bug this exists for (BUG-106) ──
 *
 * `recomputeDailyLog` built its seven- and twenty-eight-day windows from
 * `new Date()`, six lines before it looked at the date it had been handed, and
 * handed each to PostgREST as a lower bound with **no upper bound at all**. The
 * target day's own rows were selected with `localDayRangeISO(date)` — anchored
 * to the day — and everything the score compares them against was anchored to
 * the moment somebody happened to trigger a rebuild.
 *
 * Measured on PostgreSQL 16.13 built from every migration, in all six
 * timezones, on a target twelve days old whose own rows never changed:
 *
 *     55 · yellow · yellow_reduce · acwr 0.09     ← current week light
 *     48 · red    · red_recover   · acwr 1.73     ← current week heavy
 *
 * A stored instruction reading *"chỉ phục hồi tích cực"* about a day whose HRV,
 * resting pulse and sleep were identical in both rows. The "seven-day" acute
 * load behind it held sessions dated six to twelve days **after** the day being
 * scored, and the day's own training was not in the window at all.
 *
 * The gate was the same shape. For a day owning one night, with nothing before
 * it and a busy present, `hasEnoughData` was satisfied by the present's nights,
 * and the day stored `load:80 · acwr 1.14` — a training ratio built entirely
 * from sessions that had not happened yet.
 *
 * ── what is asserted, and what is deliberately not ──
 *
 * The product decision is Model B: readiness is a day-owned training-capacity
 * value, so the windows state history **as of D**. This file asserts exactly
 * that boundary and nothing else. It does not assert what a day should score,
 * which components it should have, or which way a correction should move it —
 * those belong to `readiness.mjs`, `readiness-confidence.mjs` and
 * `readiness-integrity.mjs`, and duplicating them here would be a second
 * opinion about the same rule.
 *
 * The behavioural rule is one sentence: **rebuilding D in a world truncated at
 * the end of D must produce the identical row.** That is Model B stated as an
 * experiment rather than as a property of the source, and it is the statement
 * Chain AN measured as false — R1 ≠ R3, every field.
 *
 * Two teeth-checks keep it from passing vacuously. A correction to the target
 * day's OWN rows must still move the row, so a writer that ignored everything
 * would fail. And section 4 compiles a copy of the writer with the old
 * now-anchored, open-topped windows restored and asserts this file's own rules
 * go RED on it — the break-test lives here rather than in somebody's memory of
 * having run one once.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const SERVICE = 'src/lib/daily-log-service.ts';
const DATES = 'src/lib/local-date.ts';

const problems = [];
const want = (ok, message) => { if (!ok) problems.push(message); };

/* Comments blanked, newlines kept. This file's subject is a piece of code whose
   own documentation quotes the broken form, and a rule that reads its own
   explanation is the mistake this directory has made four times. */
const code = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

const svc = code(read(SERVICE));

/* ── 1 · the writer takes no opinion from the clock ──────────────────────
   `new Date()` with no argument is "now", and there is nothing in a rebuild
   that "now" is allowed to decide: the function is handed the date it is
   rebuilding. `new Date(someTimestamp)` is a different thing entirely — it
   parses a stored instant, which `asleepMinutes` legitimately does — so the
   rule is written against the empty-argument form alone. */
{
  const nows = [...svc.matchAll(/new Date\(\s*\)/g)];
  want(
    nows.length === 0,
    `${SERVICE}: còn ${nows.length} chỗ gọi \`new Date()\` — dựng lại một ngày không được hỏi ĐỒNG HỒ ` +
      'điều gì cả; nó đã được trao chính cái ngày cần dựng. Đó là hình dạng của BUG-106',
  );
}

/* ── 2 · every window in the writer is closed at both ends ───────────────
   An open-topped window is the bug in its purest form: `gte` alone says "from
   here to whenever this happens to run". Each query block is read on its own —
   a flat search over the file would let one bounded query satisfy the rule for
   an unbounded neighbour, which is the trap `health-source.mjs` records falling
   into. */
{
  const blocks = svc.split(/supabase\s*\n?\s*\./).slice(1);
  const unbounded = [];
  for (const b of blocks) {
    const head = b.slice(0, 400);
    const table = head.match(/from\('([^']+)'\)/)?.[1] ?? '?';
    const gte = [...head.matchAll(/\.gte\('([^']+)'/g)].map((m) => m[1]);
    const lt = [...head.matchAll(/\.lt\('([^']+)'/g)].map((m) => m[1]);
    for (const col of gte) if (!lt.includes(col)) unbounded.push(`${table}.${col}`);
  }
  want(
    unbounded.length === 0,
    `${SERVICE}: cửa sổ HỞ ĐẦU TRÊN ở ${unbounded.join(', ')} — một \`gte\` không có \`lt\` nghĩa là ` +
      '"từ đây tới lúc nào chạy", và đó chính là cách một ngày trong quá khứ đọc phải dữ liệu của tương lai',
  );
}

/* ── 3 · the two windows are derived from the date being rebuilt ─────────
   Named constants rather than `- 7` and `- 28` written twice: the pair here and
   the `training_days_28d` the engine divides by have to describe one span. */
{
  want(/const ACUTE_DAYS = 7;/.test(svc), `${SERVICE}: thiếu hằng ACUTE_DAYS = 7`);
  want(/const CHRONIC_DAYS = 28;/.test(svc), `${SERVICE}: thiếu hằng CHRONIC_DAYS = 28`);
  want(
    /const acute = localWindowISO\(date, ACUTE_DAYS\);/.test(svc) &&
      /const chronic = localWindowISO\(date, CHRONIC_DAYS\);/.test(svc),
    `${SERVICE}: hai cửa sổ không dựng từ \`date\` qua localWindowISO — chúng phải thuộc về NGÀY đang dựng`,
  );

  /* And the window helper counts DAYS. `end - n * 86400000` is 23 hours short
     once a year, which starts the window an hour late and drops a session
     logged just after midnight on the oldest day it was meant to cover. */
  const dates = code(read(DATES));
  want(
    /export function localWindowISO/.test(dates),
    `${DATES}: thiếu localWindowISO — cửa sổ theo ngày phải sống cạnh localDayRangeISO`,
  );
  want(
    !/localWindowISO[\s\S]{0,400}?86[_ ]?400[_ ]?000/.test(dates),
    `${DATES}: localWindowISO đếm bằng MILLISECOND — một ngày địa phương dài 23 giờ một lần mỗi năm, ` +
      'nên cửa sổ tính bằng giờ bắt đầu muộn mất một tiếng đúng vào ngày đó',
  );
  want(
    /shiftLocalDate\(endDate, -\(days - 1\)\)/.test(dates),
    `${DATES}: localWindowISO không lùi theo NGÀY LỊCH — xem ghi chú của dayGap ngay phía trên`,
  );
}

/* ── 4 · and the same rule, executed ─────────────────────────────────────

   Everything above reads the source. This drives the real `recomputeDailyLog`
   against a real PostgreSQL 16.13 built from every migration, in six timezones,
   and asks the one question the source cannot answer: does a day rebuilt in a
   world truncated at the end of that day come out identical?

   Section 4c then recompiles the writer with the old windows restored and
   asserts 4a and 4b go red on it. A rule nobody has watched fail is a rule
   nobody knows the shape of. */
const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin', '/usr/local/pgsql/bin']
  .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
const PGCLIENT = path.join(NATIVE, 'node_modules', 'pg');

/* How many timezone runs the behavioural section actually completed. The
   summary at the bottom is built from this rather than printed unconditionally:
   the first draft announced "CHẠY THẬT trên PostgreSQL" on every exit, skip
   included, which is precisely the shape of claim this whole directory exists
   to stop. */
let ran = 0;

if (!PGBIN || !existsSync(PGCLIENT)) {
  console.log(
    'neo cửa sổ điểm sẵn sàng: BỎ QUA phần cơ sở dữ liệu — không có PostgreSQL hoặc client pg.\n' +
      '  Các luật cấu trúc đã chạy. Một phép thử im lặng không chạy còn tệ hơn không có phép thử.',
  );
} else {
  const work = mkdtempSync(path.join(tmpdir(), 'ranchor-'));
  /* Below the ephemeral range (32768–60999): a port inside it is a port the
     kernel may already have handed to something else. */
  const PORT = 20000 + (Array.from(work).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 733));
  const DATA = path.join(work, 'pg');
  const sh = (cmd) => {
    try { return { code: 0, text: execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
    catch (e) { return { code: e.status ?? 1, text: (e.stdout || '') + (e.stderr || '') }; }
  };
  const stopPg = () => sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null`);

  try {
    mkdirSync(DATA, { recursive: true });
    sh(`chmod 755 ${work} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
    sh(`su postgres -c "${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust"`);
    const started = sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} -o '-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA} -c max_connections=200' -l ${DATA}/log -w -t 60 start"`);
    if (started.code !== 0) throw new Error(`không khởi động được PostgreSQL: ${started.text.slice(0, 300)}`);

    /* An orphan postmaster on this port would measure a different database
       entirely. Chain Z lost three break-tests to exactly that. */
    const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).text.trim();
    if (live !== DATA) throw new Error(`nói chuyện với cluster KHÁC: ${live} != ${DATA}`);

    const psql = (sql, db = 'postgres') => {
      const f = path.join(work, 'q.sql');
      writeFileSync(f, sql);
      return sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d ${db} -v ON_ERROR_STOP=1 -q -f ${f}`);
    };
    psql('CREATE DATABASE app;');
    psql(
      'CREATE SCHEMA IF NOT EXISTS auth;' +
      " CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());" +
      " CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;" +
      " CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;" +
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
    psql("INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x') ON CONFLICT DO NOTHING;", 'app');

    /**
     * Compile `src/lib` into its own root and point the Supabase import at a
     * PostgREST-shaped shim over `pg`.
     *
     * `mutate` is how the break-test gets its writer: it rewrites the emitted
     * `daily-log-service.js` before anything requires it, so the broken build
     * and the real one differ in exactly the two lines under test.
     */
    const build = (dir, mutate) => {
      mkdirSync(dir, { recursive: true });
      const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
      try {
        execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', dir, '--rootDir', 'src',
          '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
          { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
      } catch { /* the unmapped `@/` raises TS2307; the emit is still written */ }
      for (const rel of LIB) {
        const js = path.join(dir, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
        writeFileSync(js, readFileSync(js, 'utf8')
          .replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`)
          .replace(/require\("\.\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")')
          .replace(/require\("\.\/integrations\/supabase\/client"\)/g, 'require("../sb.cjs")'));
      }
      const svcJs = path.join(dir, 'lib', 'daily-log-service.js');
      if (mutate) writeFileSync(svcJs, mutate(readFileSync(svcJs, 'utf8')));
      writeFileSync(path.join(dir, 'sb.cjs'), 'let c = null; module.exports = { get supabase() { return c; }, _use: (x) => { c = x; } };');
      writeFileSync(path.join(dir, 'shim.cjs'), SHIM(PORT, PGCLIENT));
      writeFileSync(path.join(dir, 'drive.cjs'), DRIVER());
      return dir;
    };

    /**
     * The writer as it was before this chain: both windows taken from the
     * clock, both handed over as a lower bound with nothing on top.
     *
     * Written against the emitted JS rather than the TypeScript so the broken
     * build cannot drift from the real one through a second compile — and it
     * asserts its own arithmetic, because a break-test that silently failed to
     * break anything is a green light nobody earned.
     */
    const BREAK = (js) => {
      const windows = js
        .replace(
          /const acute = \(0, local_date_1\.localWindowISO\)\(date, ACUTE_DAYS\);/,
          'const acute = { start: new Date(Date.now() - ACUTE_DAYS * 86400000).toISOString() };',
        )
        .replace(
          /const chronic = \(0, local_date_1\.localWindowISO\)\(date, CHRONIC_DAYS\);/,
          'const chronic = { start: new Date(Date.now() - CHRONIC_DAYS * 86400000).toISOString() };',
        );
      /*
        And the upper bounds go entirely, because that is what shipped: a `gte`
        and nothing else.

        The first version of this patch kept the calls and gave them a
        far-future date instead. `new Date(8640000000000000)` is a valid
        JavaScript Date and its ISO form is a year 275760 that PostgreSQL will
        not parse, so the bind failed, the connection went down inside the
        rebuild's eleven-query `Promise.all`, and the queued promises never
        settled — the step hung for sixteen minutes at zero CPU with two idle
        connections. Removing the bound reproduces the shipped writer exactly
        and has nothing to parse.
      */
      const out = windows.replace(/\s*\.lt\('(?:date_time|waketime)', (?:acute|chronic)\.end\)/g, '');
      const lost = (windows.match(/\.lt\('(?:date_time|waketime)', (?:acute|chronic)\.end\)/g) || []).length;
      if (out === js || lost !== 4) {
        /*
          Reported rather than exited on.

          The first version called `process.exit(1)` here, which is technically
          a failure and practically a worse one: this runs inside the build for
          section 4c, after the structural rules have found their answers and
          before anything prints them. On a writer that had genuinely regressed
          — the case this file exists for — the step died with a note about its
          own break-test and said nothing at all about the four rules that had
          just failed. The reason a break-test cannot be built is itself a
          finding, so it joins the others and 4c is skipped rather than faked.
        */
        throw new Error(
          `không dựng được bản phá: gỡ được ${lost} chốt trên thay vì 4 — writer không còn hình dạng mà ` +
            'phép phá này biết cách khôi phục, nên bước 4c không chạy và không được coi là xanh',
        );
      }
      return out;
    };

    const goodDir = build(path.join(work, 'good'));

    const runIn = (dir, TZ) => {
      const today = execFileSync('node', ['-e',
        "const d=new Date();console.log(d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'))"],
        { encoding: 'utf8', env: { ...process.env, TZ } }).trim();
      const raw = execFileSync('node', [path.join(dir, 'drive.cjs')], {
        cwd: dir, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 1500000,
        env: { ...process.env, TZ, RA_TODAY: today, RA_PORT: String(PORT), RA_PG: PGCLIENT },
      });
      const line = raw.trim().split('\n').filter((l) => l.startsWith('{')).pop();
      return JSON.parse(line);
    };

    for (const TZ of ['UTC', 'America/New_York', 'America/Los_Angeles', 'America/Chicago',
      'Asia/Ho_Chi_Minh', 'Australia/Lord_Howe']) {
      const r = runIn(goodDir, TZ);
      if (r.harnessError) throw new Error(`${TZ}: ${r.harnessError.slice(0, 400)}`);
      if (!Array.isArray(r.cases) || r.cases.length < 4) {
        throw new Error(`${TZ}: chỉ nhận được ${r.cases ? r.cases.length : 0} ca — bộ chạy hỏng, đừng tin bước này`);
      }
      for (const c of r.cases) want(c.ok, `${TZ} · ${c.label}: ${c.why}`);
      ran++;
    }

    /* ── 4c · the break-test ──
       Built and run AFTER the six, and inside its own guard: if the writer has
       changed shape enough that the old windows cannot be put back, that is a
       finding on its own line rather than something that takes the six real
       measurements down with it.

       One timezone is enough here. The rules above already proved they agree
       across six; what this demonstrates is that they can fail at all. */
    try {
      const brokenDir = build(path.join(work, 'broken'), BREAK);
      const broken = runIn(brokenDir, 'UTC');
      if (broken.harnessError) throw new Error(`bản phá: ${broken.harnessError.slice(0, 300)}`);
      const truncated = broken.cases.find((c) => c.label === 'cắt sau D');
      const future = broken.cases.find((c) => c.label === 'thêm tương lai');
      const teeth = broken.cases.find((c) => c.label === 'sửa chính ngày đó');
      want(
        truncated && !truncated.ok,
        'tự kiểm: dựng lại bản CÓ LỖI (cửa sổ neo ở new Date(), hở đầu trên) mà luật "cắt sau D" vẫn XANH — ' +
          'luật này không đo cái nó nói là đang đo',
      );
      want(
        future && !future.ok,
        'tự kiểm: bản CÓ LỖI mà luật "thêm tương lai" vẫn XANH — xem trên',
      );
      /* And the teeth-check must stay green on the broken build: it is there to
         stop a writer that ignores everything from passing, and the old writer
         did not ignore the target day. If it reddened here it would mean the
         break-test broke something else as well. */
      want(
        teeth && teeth.ok,
        'tự kiểm: bản CÓ LỖI cũng làm hỏng luật "sửa chính ngày đó" — phép phá đã đụng vào nhiều hơn hai dòng cửa sổ',
      );
    } catch (e) {
      problems.push(`bước 4c (phép thử tự phá) không chạy: ${e.message}`);
    }
  } catch (e) {
    problems.push(`không dựng được phép thử trên cơ sở dữ liệu: ${e.message}`);
  } finally {
    stopPg();
    rmSync(work, { recursive: true, force: true });
  }
}

if (problems.length) {
  console.log('neo cửa sổ điểm sẵn sàng CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'neo cửa sổ điểm sẵn sàng OK — điểm của một NGÀY được chấm bằng lịch sử TÍNH ĐẾN ngày đó, không bao ' +
    'giờ bằng thứ xảy ra sau nó (BUG-106). Cấu trúc: writer không còn gọi new Date() lần nào, không cửa ' +
    'sổ nào còn hở đầu trên, và localWindowISO lùi theo NGÀY LỊCH chứ không theo 86.400.000 ms — ngày ' +
    '23 giờ mỗi năm một lần sẽ làm cửa sổ tính bằng giờ bắt đầu muộn một tiếng. ' +
    (ran === 0
      ? 'Phần HÀNH VI thì KHÔNG chạy lần này (xem dòng BỎ QUA ở trên) — các luật trên chỉ đọc mã nguồn.'
      : `Hành vi, CHẠY THẬT trên PostgreSQL 16.13 dựng từ toàn bộ migration, ở ${ran} múi giờ: dựng lại ` +
        'một ngày trong một thế giới đã CẮT ở cuối ngày đó ra ĐÚNG hàng cũ, và đổ thêm cả một tuần nặng ' +
        'vào sau ngày đó cũng không lay được nó — bản đã ship chuyển 55·vàng·acwr 0.09 thành 48·đỏ·acwr ' +
        '1.73 kèm lời khuyên "chỉ phục hồi tích cực" cho một ngày mà HRV, nhịp nghỉ và giấc ngủ y hệt. ' +
        'Một ngày KHÔNG dài 24 giờ cũng vậy, kể cả buổi tập lúc 00:30 ở mép xa nhất của cửa sổ. Còn răng ' +
        'của luật: sửa chính đêm của ngày đó VẪN đổi được hàng, nên một writer bỏ qua tất cả không lọt. ' +
        'Và luật tự chứng minh mình biết đỏ: một bản dựng cố tình khôi phục cửa sổ cũ (neo ở new Date(), ' +
        'bỏ hẳn bốn chốt trên) được biên dịch cạnh bản thật, và cả hai luật hành vi đều ĐỎ trên nó.'),
);

/* ── the shim and the driver ─────────────────────────────────────────────
   String.raw, and a single stray backtick inside either silently ends the
   literal — this repository has lost a round to exactly that. */
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

function DRIVER() {
  return String.raw`
const { client, conn } = require('./shim.cjs');
const sb = require('./sb.cjs');
const { recomputeDailyLog } = require('./lib/daily-log-service.js');

const A = '11111111-1111-1111-1111-111111111111';
const TZ = process.env.TZ;
const D0 = process.env.RA_TODAY;
const out = { cases: [] };
const add = (label, ok, why) => out.cases.push({ label, ok, why });

const FIELDS = ['readiness_score', 'readiness_status', 'readiness_explain', 'readiness_recommendation', 'acwr'];
const same = (a, b) => {
  if (a == null || b == null) return a == null && b == null;
  return FIELDS.every((f) => String(a[f] == null ? '' : a[f]) === String(b[f] == null ? '' : b[f]));
};
const show = (a, b) => FIELDS
  .filter((f) => String(a && a[f] == null ? '' : a[f]) !== String(b && b[f] == null ? '' : b[f]))
  .map((f) => f + ': ' + JSON.stringify(a && a[f]) + ' -> ' + JSON.stringify(b && b[f]))
  .join('; ');

(async () => {
  const admin = await conn();
  const c = await conn();
  sb._use(client(c));
  const q = (s, p) => admin.query(s, p || []);

  /* Memoized, because the fixtures below place the same handful of days over
     and over and each of these is a round trip. Uncached, six timezones plus a
     deliberately-broken build came to enough round trips to time the whole step
     out — the wall clock was the harness, not the writer. They are pure
     functions of their arguments inside one process, and PostgreSQL answers
     them rather than JavaScript so a 23-hour day is a 23-hour day. */
  const memo = (fn) => { const m = new Map(); return async (...a) => { const k = a.join('|'); if (!m.has(k)) m.set(k, await fn(...a)); return m.get(k); }; };
  const at = memo(async (day, hhmm) => (await q("SELECT ($1::text||' '||$2::text)::timestamp AT TIME ZONE $3::text t", [day, hhmm, TZ])).rows[0].t);
  const shift = memo(async (day, n) => (await q('SELECT ($1::date + $2::int)::text d', [day, n])).rows[0].d);
  const wipe = () => q('DELETE FROM workout_sessions; DELETE FROM sleep_logs; DELETE FROM biometric_samples; DELETE FROM daily_logs;');

  const night = async (day, min) => q(
    'INSERT INTO sleep_logs (user_id,bedtime,waketime,asleep_min,quality) VALUES ($1,$2,$3,$4,8)',
    [A, await at(await shift(day, -1), '23:00'), await at(day, '07:00'), min]);
  const bio = async (day, hr, sdnn) => q(
    "INSERT INTO biometric_samples (user_id,date_time,hr_bpm,hrv_sdnn_ms,source) VALUES ($1,$2,$3,$4,'manual')",
    [A, await at(day, '06:00'), hr, sdnn]);
  const lifted = async (day, rpe, reps, hhmm) => q(
    "INSERT INTO workout_sessions (user_id,date_time,volume_load,session_rpe,sets,source) VALUES ($1,$2,$3,$4,$5,'manual')",
    [A, await at(day, hhmm || '18:00'), rpe * reps, rpe, JSON.stringify([{ reps: reps, weight_kg: 60 }])]);
  const row = async (d) => (await q(
    'SELECT readiness_score, readiness_status, readiness_explain, readiness_recommendation, acwr FROM daily_logs WHERE user_id=$1 AND date=$2', [A, d])).rows[0] || null;

  const NIGHT_MIN = (k) => 400 + ((k * 37) % 60);
  const HR = (k) => 52 + ((k * 13) % 7);
  const SDNN = (k) => 55 + ((k * 29) % 11);

  /* 41 days of nights and biometrics, a heavy block, a moderate block holding
     the target, and a light current week. Values vary by a fixed function of
     the day index so the HRV and RHR baselines have a real spread — a flat
     baseline divides by the floor and hides the very movement under test. */
  async function build(anchor) {
    await wipe();
    for (let k = 0; k <= 40; k++) {
      const d = await shift(anchor, -k);
      await night(d, NIGHT_MIN(k));
      await bio(d, HR(k), SDNN(k));
    }
    for (let k = 25; k >= 16; k--) await lifted(await shift(anchor, -k), 9, 120);
    for (let k = 15; k >= 8; k--) await lifted(await shift(anchor, -k), 7, 60);
    for (const k of [6, 4, 2]) await lifted(await shift(anchor, -k), 6, 20);
  }

  const TARGET = await shift(D0, -12);
  const dayHi = await at(await shift(TARGET, 1), '00:00');

  /* ── the rule, stated as an experiment ──
     Rebuild D with the whole world present, then rebuild the same D in a world
     that has been cut off at the end of D. Model B says those are the same row.
     Chain AN measured them differing in every field. */
  await build(D0);
  await recomputeDailyLog(A, TARGET);
  const full = await row(TARGET);

  await q('DELETE FROM workout_sessions WHERE user_id=$1 AND date_time >= $2', [A, dayHi]);
  await q('DELETE FROM sleep_logs WHERE user_id=$1 AND waketime >= $2', [A, dayHi]);
  await q('DELETE FROM biometric_samples WHERE user_id=$1 AND date_time >= $2', [A, dayHi]);
  await recomputeDailyLog(A, TARGET);
  const truncated = await row(TARGET);
  add('cắt sau D', same(full, truncated),
    'dựng lại ' + TARGET + ' trong một thế giới CẮT ở cuối ngày đó ra hàng KHÁC — ' + show(full, truncated));

  /* And the other direction: pour a loud week in after D and it must not move. */
  await build(D0);
  await recomputeDailyLog(A, TARGET);
  const before = await row(TARGET);
  for (let k = 6; k >= 0; k--) { await lifted(await shift(D0, -k), 10, 240); await bio(await shift(D0, -k), 40, 150); }
  await recomputeDailyLog(A, TARGET);
  const after = await row(TARGET);
  add('thêm tương lai', same(before, after),
    'một tuần nặng SAU ngày ' + TARGET + ' đã lay được hàng của ngày đó — ' + show(before, after));

  /* Teeth: a correction to the target day's own night must still move it. */
  await build(D0);
  await recomputeDailyLog(A, TARGET);
  const t0 = await row(TARGET);
  await q('DELETE FROM sleep_logs WHERE user_id=$1 AND waketime >= $2 AND waketime < $3', [A, await at(TARGET, '00:00'), dayHi]);
  await night(TARGET, 150);
  await recomputeDailyLog(A, TARGET);
  const t1 = await row(TARGET);
  add('sửa chính ngày đó', !same(t0, t1),
    'sửa đêm CỦA CHÍNH ngày ' + TARGET + ' mà hàng không đổi — luật trên đang xanh một cách rỗng');

  /* A day whose length is not 24 hours, where a window counted in hours starts
     an hour late and drops the session logged just after midnight on the
     oldest day it was supposed to cover. */
  const dst = (await q(
    "WITH s AS (SELECT generate_series((now() AT TIME ZONE $1::text)::date - 400, (now() AT TIME ZONE $1::text)::date, '1 day'::interval)::date x)" +
    ' SELECT x::text AS d FROM s WHERE EXTRACT(EPOCH FROM ((x + 1)::timestamp AT TIME ZONE $1::text) - (x::timestamp AT TIME ZONE $1::text))/3600 <> 24' +
    ' ORDER BY x DESC LIMIT 1', [TZ])).rows[0];

  if (dst) {
    const day = dst.d;
    await build(day);
    await lifted(await shift(day, -6), 8, 80, '00:30');
    for (let k = 0; k <= 20; k++) { await bio(await shift(D0, -k), 40, 150); await lifted(await shift(D0, -k), 10, 240); }
    await recomputeDailyLog(A, day);
    const a0 = await row(day);
    for (let k = 0; k <= 6; k++) await lifted(await shift(D0, -k), 10, 400);
    await recomputeDailyLog(A, day);
    const a1 = await row(day);
    add('ngày đổi giờ', a0 != null && a0.readiness_score != null && same(a0, a1),
      'ngày ' + day + ' (không dài 24 giờ) ' + (a0 == null || a0.readiness_score == null ? 'không chấm được' : 'bị hiện tại lay: ' + show(a0, a1)));
  } else {
    add('ngày đổi giờ', true, '');
  }

  await admin.end(); await c.end();
  console.log(JSON.stringify(out));
})().catch((e) => { out.harnessError = String((e && e.stack) || e); console.log(JSON.stringify(out)); });
`;
}
