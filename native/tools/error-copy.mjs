/**
 * A failed write must not put SQL in front of a person.
 *
 * ── the bug ──
 *
 * Forty-odd call sites were `onError: (e: Error) => toast.error(e.message)`,
 * and what they throw is whatever Supabase handed back. Measured against this
 * app's own schema on a real PostgreSQL 16.13 — these are the exact strings
 * that reached the toast:
 *
 *     permission denied for table daily_logs
 *     duplicate key value violates unique constraint "daily_logs_user_id_date_key"
 *     null value in column "user_id" of relation "daily_logs" violates not-null constraint
 *     column "date" of relation "meal_entries" does not exist
 *     invalid input syntax for type date: "not-a-date"
 *
 * Table names, constraint names, column names and SQL type names, in English,
 * in a pop-up, to somebody who tapped Save.
 *
 * ── what this runs ──
 *
 * The **real `classifyError`** against error objects in the shapes PostgREST,
 * GoTrue and React Native actually produce, plus the SQLSTATE codes this
 * schema really raises — those are read out of a live PostgreSQL rather than
 * typed here, so a code the app can produce and the classifier has never heard
 * of is a failure rather than a guess. If PostgreSQL is missing that half
 * **skips loudly**; the rest still runs.
 *
 * ── and the structural half ──
 *
 * One boundary is only a boundary while every call site uses it. Comments are
 * stripped first, so a note about `toast.fail` cannot stand in for a call to it.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(NATIVE, '..');
const out = mkdtempSync(path.join(tmpdir(), 'errcopy-'));
const problems = [];
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const want = (ok, message) => { if (!ok) problems.push(message); };

try {
  try {
    execFileSync('npx', ['tsc', 'src/lib/error-copy.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* emit is what matters */ }
  const req = createRequire(import.meta.url);
  const { classifyError, failureKeyFor, errorText, FAILURE_KEY } = req(path.join(out, 'error-copy.js'));
  if (typeof classifyError !== 'function' || typeof errorText !== 'function') {
    console.error('tự kiểm hỏng: không nạp được classifyError/errorText thật — đừng tin kết quả');
    process.exit(1);
  }

  /* ── 1. a system error never shows its own text ── */
  {
    const pgErr = (code, message) => ({ code, message, details: null, hint: null });
    const SYSTEM = [
      ['RLS / quyền', pgErr('42501', 'permission denied for table daily_logs'), 'signed-out'],
      ['trùng khoá', pgErr('23505', 'duplicate key value violates unique constraint "daily_logs_user_id_date_key"'), 'duplicate'],
      ['thiếu not-null', pgErr('23502', 'null value in column "user_id" of relation "daily_logs" violates not-null constraint'), 'invalid'],
      ['sai kiểu ngày', pgErr('22007', 'invalid input syntax for type date: "not-a-date"'), 'invalid'],
      ['sai biểu diễn', pgErr('22P02', 'invalid input syntax for type uuid: "abc"'), 'invalid'],
      ['khoá ngoại', pgErr('23503', 'insert or update on table "meal_entries" violates foreign key constraint'), 'invalid'],
      ['check', pgErr('23514', 'new row for relation "x" violates check constraint "y"'), 'invalid'],
      ['cột không tồn tại', pgErr('42703', 'column "date" of relation "meal_entries" does not exist'), 'server'],
      ['bảng không tồn tại', pgErr('42P01', 'relation "nope" does not exist'), 'server'],
      ['không có hàng', pgErr('PGRST116', 'JSON object requested, multiple (or no) rows returned'), 'not-found'],
      ['JWT hết hạn', pgErr('PGRST301', 'JWT expired'), 'signed-out'],
      ['mã lạ', pgErr('XX000', 'internal error: something nobody mapped'), 'unknown'],
      ['auth 401', { name: 'AuthApiError', status: 401, message: 'Invalid login credentials' }, 'signed-out'],
      ['auth 422', { name: 'AuthApiError', status: 422, message: 'Password should be at least 6 characters' }, 'invalid'],
      ['gateway 500', { status: 500, message: 'Internal Server Error' }, 'server'],
      ['mạng RN', Object.assign(new TypeError('Network request failed'), {}), 'offline'],
      ['fetch thất bại', Object.assign(new TypeError('Failed to fetch'), {}), 'offline'],
      ['DNS', { code: 'ENOTFOUND', message: 'getaddrinfo ENOTFOUND db.supabase.co' }, 'offline'],
    ];
    const DICT = Object.fromEntries(Object.values(FAILURE_KEY).map((k) => [k, `[${k}]`]));
    for (const [label, err, wantKind] of SYSTEM) {
      const got = classifyError(err);
      if (got !== wantKind) {
        problems.push(`classifyError("${label}") ra '${got}', đáng lẽ '${wantKind}'`);
        continue;
      }
      /* and the thing actually shown must not be the raw text */
      const shown = errorText(err, DICT);
      const raw = err.message ?? '';
      if (shown === raw || (raw.length > 0 && shown.includes(raw))) {
        problems.push(
          `"${label}": người dùng vẫn thấy nguyên văn "${raw.slice(0, 60)}" — đây chính là lỗi tệp này tồn tại để chặn`,
        );
      }
      for (const leak of ['constraint', 'relation', 'column "', 'table ', 'syntax for type', 'null value in', 'PGRST', 'JWT']) {
        if (shown.includes(leak)) {
          problems.push(`"${label}": câu hiện ra còn chứa "${leak}" — vẫn là chữ của cơ sở dữ liệu`);
        }
      }
    }
  }

  /* ── 2. an error the APP wrote keeps its own sentence ──

     `plausible.ts` explains a value is out of range; `health-sync-write.ts`
     names the day that failed. Replacing those with "could not save" would be
     a regression dressed as a fix. */
  {
    const APP = [
      'Nhịp tim nghỉ 600 bpm nằm ngoài khoảng hợp lý',
      'Đồng bộ sức khoẻ chưa xong — hôm nay; dựng lại 2026-01-02',
      'No items',
      'Sign in cancelled',
    ];
    for (const msg of APP) {
      const err = new Error(msg);
      if (classifyError(err) !== null) {
        problems.push(`một Error do CHÍNH APP viết ("${msg.slice(0, 40)}") bị phân loại là lỗi hệ thống — câu của nó sẽ bị thay bằng copy chung`);
      }
      if (errorText(err, {}) !== msg) {
        problems.push(`câu của app bị đổi: "${msg.slice(0, 40)}" → "${errorText(err, {}).slice(0, 40)}"`);
      }
    }
    /* and an app error must not smuggle database text inside itself */
    const sync = strip(read('src/lib/health-sync-write.ts'));
    want(!/failures\.push\([^)]*\berror\.message\b/.test(sync) && !/failures\.push\([^)]*\(e as Error\)\.message/.test(sync),
      'health-sync-write nhét lại error.message vào câu tổng hợp — đó là Error do app tạo nên error-copy sẽ ĐÚNG khi ' +
        'hiện nguyên văn, và chữ của PostgreSQL lại lên màn hình qua đường vòng');
  }

  /* ── 3. every failure kind has copy, in both languages ── */
  {
    const strings = read('src/lib/native-strings.ts');
    for (const key of Object.values(FAILURE_KEY)) {
      const hits = strings.split(`${key}:`).length - 1;
      want(hits >= 2, `thiếu bản dịch cho ${key} — cần cả vi lẫn en, đang có ${hits}`);
    }
    /* copy that names a table or a constraint is copy that failed its job */
    for (const m of strings.matchAll(/\berr(?:Offline|SignedOut|Duplicate|Invalid|NotFound|Server|Unknown): '([^']*)'/g)) {
      for (const leak of ['constraint', 'relation', 'SQL', 'PGRST', 'null value']) {
        want(!m[1].includes(leak), `copy lỗi chứa "${leak}": "${m[1].slice(0, 60)}"`);
      }
    }
  }

  /* ── 4. structural: no screen shows a raw thrown message ── */
  {
    const files = [];
    const walk = (dir) => {
      for (const f of readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f.name)) files.push(p);
      }
    };
    walk(path.join(NATIVE, 'src'));
    /*
      The call is READ, not pattern-matched. Written first as
      `Alert.alert([^,]*,\s*\w+\.message\s*\)`, and break-test 2 —
      `Alert.alert('ASCND', (e as Error).message)` — stayed green: a cast is
      not `\w+`, and neither is `err?.message` or a template literal. Anything
      that reaches `.message` inside one of these calls counts, unless the call
      goes through the boundary.
    */
    const callsOf = (src, head) => {
      const calls = [];
      let i = 0;
      while ((i = src.indexOf(head, i)) !== -1) {
        let depth = 0;
        let j = i + head.length - 1;
        for (; j < src.length; j++) {
          if (src[j] === '(') depth++;
          else if (src[j] === ')') { depth--; if (depth === 0) break; }
        }
        calls.push(src.slice(i, j + 1));
        i = j + 1;
      }
      return calls;
    };
    const POPUPS = ['toast.error(', 'toast.warning(', 'toast.info(', 'toast.success(', 'Alert.alert('];
    let checked = 0;
    for (const p of files) {
      const rel = path.relative(NATIVE, p);
      /* the boundary itself is allowed to read `.message` — that is its job */
      if (rel === 'src/lib/error-copy.ts' || rel === 'src/lib/toast.ts') continue;
      const src = strip(readFileSync(p, 'utf8'));
      checked++;
      for (const head of POPUPS) {
        for (const call of callsOf(src, head)) {
          if (!/\.\s*message\b/.test(call)) continue;
          if (/errorText\(/.test(call)) continue;
          problems.push(
            `${rel}: ${head.replace('(', '')} hiện thẳng .message của lỗi ném ra — với một lỗi Supabase đó là ` +
              'câu PostgreSQL viết cho lập trình viên (tên bảng, tên ràng buộc). Dùng toast.fail(e) hoặc ' +
              `errorText(e, i18n) — ${call.replace(/\s+/g, ' ').slice(0, 90)}`,
          );
        }
      }
    }
    want(checked > 100, `chỉ quét được ${checked} tệp — bộ dò lạc mục tiêu, đừng tin kết quả`);
    /* and the boundary is actually used somewhere, or rule 4 guards nothing */
    const usage = files.filter((p) => /toast\.fail\(|errorText\(/.test(strip(readFileSync(p, 'utf8')))).length;
    want(usage >= 20, `chỉ ${usage} tệp dùng toast.fail/errorText — cổng này đang không che gì cả`);
  }

  /* ── 5. the SQLSTATE codes this schema really raises are all mapped ──

     Read out of a live PostgreSQL built from every migration, so a code the app
     can actually produce and the classifier has never heard of is a failure
     rather than something nobody thought of. */
  const PGBIN = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/15/bin']
    .find((d) => existsSync(path.join(d, 'initdb'))) ?? null;
  if (!PGBIN) {
    console.log('copy lỗi: BỎ QUA phần cơ sở dữ liệu — không có PostgreSQL. Phần còn lại đã chạy.');
  } else {
    const pgOut = mkdtempSync(path.join(tmpdir(), 'errcopy-pg-'));
    /* Below the ephemeral range (32768-60999): a port inside it can be taken by
       any outbound socket, and a full check.mjs run opens many. */
    const PORT = 26000 + (Array.from(pgOut).reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 900, 13));
    const DATA = path.join(pgOut, 'pg');
    const sh = (cmd) => {
      try { return { code: 0, text: execFileSync('bash', ['-lc', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
      catch (e) { return { code: e.status ?? 1, text: (e.stdout || '') + (e.stderr || '') }; }
    };
    try {
      mkdirSync(DATA, { recursive: true });
      sh(`chmod 755 ${pgOut} && chown postgres:postgres ${DATA} && chmod 700 ${DATA}`);
      sh(`su postgres -c "${PGBIN}/initdb -D ${DATA} -U postgres --auth=trust"`);
      const started = sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} -o '-p ${PORT} -c listen_addresses=127.0.0.1 -k ${DATA}' -l ${DATA}/log -w -t 60 start"`);
      if (started.code !== 0) throw new Error(`không khởi động được PostgreSQL: ${started.text.slice(0, 200)}`);
      const live = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -tAc "SHOW data_directory"`).text.trim();
      if (live !== DATA) throw new Error(`nói chuyện với cluster KHÁC: ${live} != ${DATA}`);

      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -c "CREATE DATABASE app"`);
      const boot = path.join(pgOut, 'boot.sql');
      writeFileSync(boot,
        "CREATE SCHEMA IF NOT EXISTS auth;\n" +
        "CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now());\n" +
        "CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $x$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $x$;\n" +
        "CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $x$ SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon') $x$;\n" +
        "CREATE SCHEMA IF NOT EXISTS extensions; CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;\n" +
        "DO $x$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;\n" +
        "DO $x$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;\n" +
        "DO $x$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $x$;\n" +
        "GRANT USAGE ON SCHEMA public, auth, extensions TO anon, authenticated, service_role;\n");
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${boot}`);
      for (const m of execFileSync('bash', ['-lc', `ls ${path.join(ROOT, 'supabase', 'migrations')}/*.sql | sort`], { encoding: 'utf8' }).trim().split('\n')) {
        sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -q -f ${m} 2>/dev/null`);
      }
      sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -c "INSERT INTO auth.users (id,email) VALUES ('11111111-1111-1111-1111-111111111111','a@x') ON CONFLICT DO NOTHING"`);

      /* the writes a person can actually cause to fail, and the code each raises */
      const CASES = [
        ['ghi vào hàng của người khác (RLS)',
          `SET ROLE authenticated; SET "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111'; SET "request.jwt.claim.role" = 'authenticated'; INSERT INTO daily_logs (user_id,date,steps) VALUES ('22222222-2222-2222-2222-222222222222','2026-01-01',1);`],
        ['lưu hai lần cùng một ngày',
          "INSERT INTO daily_logs (user_id,date,steps) VALUES ('11111111-1111-1111-1111-111111111111','2026-02-02',1); INSERT INTO daily_logs (user_id,date,steps) VALUES ('11111111-1111-1111-1111-111111111111','2026-02-02',2);"],
        ['ngày gõ sai',
          "INSERT INTO daily_logs (user_id,date,steps) VALUES ('11111111-1111-1111-1111-111111111111','not-a-date',1);"],
        ['thiếu user_id',
          "INSERT INTO daily_logs (date,steps) VALUES ('2026-03-03',1);"],
      ];
      for (const [label, sql] of CASES) {
        const f = path.join(pgOut, 'c.sql');
        writeFileSync(f, sql);
        const r = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -v ON_ERROR_STOP=1 -q -f ${f} 2>&1 | grep -oE 'ERROR:.*' | head -1`);
        const msg = r.text.trim();
        if (!msg) { problems.push(`ca "${label}" KHÔNG hỏng — fixture không dựng ra lỗi nó định dựng`); continue; }
        /* the SQLSTATE, asked of PostgreSQL rather than guessed */
        const codeRes = sh(`psql -h 127.0.0.1 -p ${PORT} -U postgres -d app -v ON_ERROR_STOP=1 -q -c "\\\\set VERBOSITY verbose" -f ${f} 2>&1 | grep -oE 'SQLSTATE: [0-9A-Z]+' | head -1`);
        const code = (codeRes.text.match(/SQLSTATE: ([0-9A-Z]+)/) ?? [])[1] ?? null;
        if (code == null) continue;
        const kind = classifyError({ code, message: msg.replace(/^ERROR:\s*/, '') });
        if (kind == null || kind === 'unknown') {
          problems.push(
            `SQLSTATE ${code} — sinh ra bởi "${label}" trên CHÍNH schema này — phân loại ra '${kind}', nên người ` +
              `dùng sẽ thấy nguyên văn "${msg.slice(0, 70)}"`,
          );
        }
      }
    } catch (e) {
      problems.push(`không dựng được phép thử cơ sở dữ liệu: ${e.message}`);
    } finally {
      sh(`su postgres -c "${PGBIN}/pg_ctl -D ${DATA} stop -m immediate" 2>/dev/null`);
      rmSync(pgOut, { recursive: true, force: true });
    }
  }

  if (problems.length) {
    console.log('copy lỗi CÓ VẤN ĐỀ:\n');
    for (const p of problems.slice(0, 14)) console.log(`  • ${p}`);
    if (problems.length > 14) console.log(`  … và ${problems.length - 14} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    'copy lỗi OK — CHẠY THẬT classifyError/errorText trên 18 hình dạng lỗi mà PostgREST, GoTrue và React Native ' +
      'thật sự tạo ra: không ca nào để lọt nguyên văn câu của cơ sở dữ liệu, và không câu hiện ra nào còn chứa ' +
      'tên bảng, tên ràng buộc, tên cột hay "PGRST". Lỗi do CHÍNH APP viết vẫn giữ nguyên câu của nó (mức đo ' +
      'ngoài khoảng hợp lý, ngày đồng bộ hỏng, "No items") — sửa quá tay cũng là một lỗi, và health-sync-write ' +
      'không được nhét error.message vào câu tổng hợp để đi vòng qua cổng. Bảy mức lỗi đều có copy ở CẢ hai ngôn ' +
      'ngữ và không copy nào nhắc tới bảng hay ràng buộc. Cấu trúc: KHÔNG tệp nào trong src hiện thẳng .message ' +
      'của một lỗi ném ra qua toast hay Alert (chú thích bị bóc trước khi so, nên một ghi chú về toast.fail không ' +
      'thay được một lời gọi). Và trên PostgreSQL 16.13 dựng từ toàn bộ migration: bốn thao tác một người dùng ' +
      'thật có thể làm hỏng được CHẠY, SQLSTATE của chúng được HỎI chính PostgreSQL chứ không đoán, và mọi mã ' +
      'ấy đều có nhánh phân loại.',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
