/**
 * That a sync writes what it read, once, and says so when it does not.
 *
 * ── the bug this was written for ──
 *
 * The Apple Health sleep and workout import had never written a single row, for
 * anybody, since the day it shipped.
 *
 * Reproduced on PostgreSQL 16.13 built from every migration in
 * `supabase/migrations/`, running the exact statement PostgREST renders for
 * `.upsert(…, { onConflict: 'user_id,external_id' })`:
 *
 *     ERROR:  there is no unique or exclusion constraint matching the
 *             ON CONFLICT specification
 *
 * The only unique index on those columns was the **partial** one from
 * `20260809120000_health_provenance.sql` (`WHERE external_id IS NOT NULL`), and
 * Postgres only infers a partial index as an arbiter when the statement repeats
 * a predicate implying it. PostgREST's `on_conflict` parameter takes a column
 * list and nothing else, so the predicate can never be sent.
 *
 * Neither call site read its error, so the rejection went nowhere: the sync
 * carried on and reported *"Đã đồng bộ"*. Sleep — the readiness score's
 * 0.30-weighted term, which had no source before that import — and every
 * workout the watch recorded, both landing nowhere, with a green toast over it.
 *
 * ── the three rules, and why they are these three ──
 *
 * 1. **Every `onConflict` must name a target the database can actually infer.**
 *    Read from `supabase/migrations/`, not from convention. This is the rule
 *    that would have caught it, and it catches the general shape: a partial
 *    unique index is not an upsert target, wherever somebody writes one next.
 *
 * 2. **Every write in the sync must be read.** The failure above was invisible
 *    *because* six of the seven statements in `useSyncMutation` dropped their
 *    result. A sync that cannot fail is a sync that cannot be trusted when it
 *    says it worked.
 *
 * 3. **The sync must not decide a row's existence with a read.**
 *    `select().maybeSingle()` then insert-or-update reads a failed query as
 *    "no row" — and there are three live sync mutations, so two can be in
 *    flight against the same day. The natural key belongs in the statement.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/* Comments name the bugs, so every rule reads code with the prose blanked out —
   newlines kept so line numbers and brace matching survive. */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const problems = [];
const SYNC = 'src/hooks/use-health-sync.ts';

/* ── the schema, as the database will actually have it ── */

const sql = globSync('supabase/migrations/*.sql', { cwd: REPO })
  .sort()
  .map((p) => readFileSync(path.join(REPO, p), 'utf8'))
  .join('\n');
const sqlNoComments = sql.replace(/^\s*--.*$/gm, '');

/** normalise a column list so `user_id,external_id` and `user_id, external_id` are one key */
const cols = (s) =>
  s
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)
    .join(',');

/**
 * Unique targets an `ON CONFLICT (cols)` can be inferred against.
 *
 * Partial indexes are deliberately **not** collected — that is the whole point.
 * They are gathered separately so the message can say which one was found and
 * why it does not count, rather than "no constraint", which reads as a missing
 * migration and sends the next person to write a second one.
 */
/** Every unique target in a body of DDL, split by whether ON CONFLICT can infer it. */
function parseSchema(text) {
  const inferable = new Set();
  const partialOnly = new Map();

  for (const m of text.matchAll(/CREATE\s+TABLE\s+(?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/gi)) {
    const [, table, body] = m;
    for (const u of body.matchAll(/UNIQUE\s*\(([^)]*)\)/gi)) inferable.add(`${table}:${cols(u[1])}`);
    /* `user_id UUID REFERENCES auth.users(id) … NOT NULL UNIQUE` — a column-level
       constraint, which `profiles` uses and `onboarding-flow.tsx` upserts
       against. `UNIQUE` not followed by `(` is what separates it from the
       table-level form already handled above; the type and its references are
       skipped wholesale rather than spelled out, because `auth.users(id)` is
       exactly the kind of thing a hand-written character class gets wrong. */
    for (const line of body.split('\n')) {
      const col = line.match(/^\s*(\w+)\s+(.*)$/);
      if (!col) continue;
      if (/^(UNIQUE|PRIMARY|FOREIGN|CONSTRAINT|CHECK)$/i.test(col[1])) continue;
      if (/\bUNIQUE\b\s*(?!\()/i.test(col[2])) inferable.add(`${table}:${col[1]}`);
    }
  }
  for (const m of text.matchAll(
    /CREATE\s+UNIQUE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)\s+ON\s+(?:public\.)?(\w+)\s*\(([^)]*)\)([^;]*);/gi,
  )) {
    const [, name, table, columns, tail] = m;
    const key = `${table}:${cols(columns)}`;
    if (/\bWHERE\b/i.test(tail)) partialOnly.set(key, name);
    else inferable.add(key);
  }
  for (const m of text.matchAll(
    /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(([^)]*)\)/gi,
  )) {
    inferable.add(`${m[1]}:${cols(m[2])}`);
  }
  /* A constraint added later wins over a partial index dropped along the way. */
  for (const m of text.matchAll(/DROP\s+INDEX\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(\w+)/gi)) {
    for (const [key, name] of partialOnly) if (name === m[1]) partialOnly.delete(key);
  }
  return { inferable, partialOnly };
}

/*
  The parser is proved on DDL written here, not on the repository's own.

  The first version of this self-test asserted facts about the current
  migrations — "sleep_logs:user_id,external_id is inferable" — and that is
  circular: it is the thing the rule is supposed to *decide*. Deleting the
  migration under test made the tool abort with "self-test failed" instead of
  reporting the bug it exists for, which is the same failure as a detector that
  only passes because the implementation changed.

  So the fixtures below are self-contained: each states a shape and the answer
  the parser must give for it, and none of them can be satisfied or broken by
  editing `supabase/migrations/`.
*/
const PARSER_SELF = [
  [
    'UNIQUE ở cấp bảng',
    'CREATE TABLE public.t (\n  a uuid,\n  b date,\n  UNIQUE(a, b)\n);',
    { inferable: ['t:a,b'], partial: [] },
  ],
  [
    'UNIQUE ở cấp cột, có REFERENCES kèm dấu chấm',
    'CREATE TABLE public.t (\n  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,\n  x int\n);',
    { inferable: ['t:user_id'], partial: [] },
  ],
  [
    'index duy nhất thường',
    'CREATE UNIQUE INDEX t_uidx ON public.t (a, b);',
    { inferable: ['t:a,b'], partial: [] },
  ],
  [
    'index duy nhất RIÊNG PHẦN — không suy luận được',
    'CREATE UNIQUE INDEX t_uidx ON public.t (a, b) WHERE b IS NOT NULL;',
    { inferable: [], partial: ['t:a,b'] },
  ],
  [
    'bỏ index riêng phần rồi thêm ràng buộc thường — đúng bản sửa của vòng này',
    'CREATE UNIQUE INDEX t_uidx ON public.t (a, b) WHERE b IS NOT NULL;\n' +
      'DROP INDEX IF EXISTS public.t_uidx;\n' +
      'ALTER TABLE public.t ADD CONSTRAINT t_key UNIQUE (a, b);',
    { inferable: ['t:a,b'], partial: [] },
  ],
  [
    'khoảng trắng trong danh sách cột không tạo ra khoá khác',
    'ALTER TABLE public.t ADD CONSTRAINT t_key UNIQUE (a,   b);',
    { inferable: ['t:a,b'], partial: [] },
  ],
];
for (const [label, ddl, want] of PARSER_SELF) {
  const got = parseSchema(ddl);
  const okInf = want.inferable.every((k) => got.inferable.has(k));
  const okPart =
    want.partial.every((k) => got.partialOnly.has(k)) &&
    want.partial.every((k) => !got.inferable.has(k));
  const noExtra = want.partial.length > 0 || got.partialOnly.size === 0;
  if (!okInf || !okPart || !noExtra) {
    console.error(
      `tự kiểm (bộ đọc schema) hỏng: ${label} — ` +
        `suy luận được [${[...got.inferable]}], riêng phần [${[...got.partialOnly.keys()]}]`,
    );
    process.exit(2);
  }
}

const { inferable, partialOnly } = parseSchema(sqlNoComments);
if (inferable.size === 0) {
  console.error('tự kiểm hỏng: không đọc được ràng buộc duy nhất nào từ supabase/migrations — luật 1 đang không kiểm gì cả');
  process.exit(2);
}

/* ── 1: every onConflict names something Postgres can infer ── */
{
  /** which table an `.upsert` belongs to — the nearest `.from('x')` above it */
  const files = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE }).sort();
  let checked = 0;
  for (const f of files) {
    const code = strip(read(f));
    for (const m of code.matchAll(/onConflict:\s*'([^']+)'/g)) {
      const wanted = cols(m[1]);
      const before = code.slice(0, m.index);
      const table = [...before.matchAll(/\.from\('(\w+)'\)/g)].pop()?.[1];
      const line = before.split('\n').length;
      if (!table) {
        problems.push(`${f}:${line}: onConflict '${wanted}' nhưng không tìm ra bảng — luật không đọc được chỗ này`);
        continue;
      }
      checked++;
      const key = `${table}:${wanted}`;
      if (inferable.has(key)) continue;
      const partial = partialOnly.get(key);
      problems.push(
        partial
          ? `${f}:${line}: upsert vào ${table} chốt theo (${wanted}), nhưng thứ duy nhất phủ các cột đó là ` +
            `INDEX RIÊNG PHẦN \`${partial}\`. Postgres chỉ suy luận được index riêng phần khi câu lệnh ` +
            'nhắc lại vị từ của nó, mà on_conflict của PostgREST chỉ gửi được danh sách cột — nên lệnh ' +
            'này BỊ TỪ CHỐI mọi lần chạy (đo thật trên PostgreSQL 16.13: ERROR 42P10). Đổi thành ' +
            'UNIQUE thường: NULL vẫn được coi là khác nhau, nên dòng nhập tay vẫn lặp lại tự do'
          : `${f}:${line}: upsert vào ${table} chốt theo (${wanted}) mà migrations không có ràng buộc ` +
            'duy nhất nào trên đúng các cột đó — lệnh sẽ bị từ chối với ERROR 42P10',
      );
    }
  }
  if (checked === 0) {
    console.error('tự kiểm hỏng: không tìm thấy onConflict nào trong src — luật đang không kiểm gì cả');
    process.exit(2);
  }
}

/* ── 2: every write in the sync is read ──

   Scoped to this file rather than the whole app, because the app already has
   `write-confirmed.mjs` for update/delete and `empty-vs-failed.mjs` for
   queryFns, and neither covers an insert/upsert inside a mutationFn. This is
   the file where six of seven statements dropped their result. */
{
  const code = strip(read(SYNC));
  /** `.from('x')` … `.insert(`/`.upsert(` — the statement, and what precedes it */
  for (const m of code.matchAll(/\.from\('(\w+)'\)\s*\.\s*(insert|upsert|update|delete)\(/g)) {
    const [, table, verb] = m;
    const line = code.slice(0, m.index).split('\n').length;
    /* Walk back to the start of the statement: either `const { … } = await` or
       a bare `await`. Only the first shape can look at an error. */
    const head = code.slice(Math.max(0, m.index - 240), m.index);
    const assigned = /const\s*\{[^}]*\berror\b[^}]*\}\s*=\s*await\s*(?:supabase)?[^;]*$/.test(head);
    if (!assigned) {
      problems.push(
        `${SYNC}:${line}: .${verb}() vào ${table} không hứng \`error\` — ` +
          'lệnh bị từ chối sẽ đi thẳng qua và lượt đồng bộ vẫn báo thành công. ' +
          'Đúng hình dạng đã giấu việc import giấc ngủ và buổi tập chưa từng ghi được dòng nào',
      );
    }
  }
  /* And every read the sync branches on. A `select` whose error is dropped is
     how "không đọc được" became "không có gì" at the sleep step. */
  for (const m of code.matchAll(/const\s*\{([^}]*)\}\s*=\s*await\s+supabase\s*\n?\s*\.from\('(\w+)'\)\s*\n?\s*\.select\(/g)) {
    const [, bound, table] = m;
    if (/\berror\b/.test(bound)) continue;
    const line = code.slice(0, m.index).split('\n').length;
    problems.push(
      `${SYNC}:${line}: select từ ${table} bỏ qua \`error\` — ` +
        'truy vấn hỏng sẽ đọc thành "không có dòng nào", và ở file này nhánh tiếp theo là một lệnh GHI',
    );
  }
}

/* ── 3: the sync does not decide a row's existence by reading first ──

   `maybeSingle()` answers "no row" for a query that matched nothing AND for one
   that errored AND for one that matched more than one. None of the three is a
   licence to insert against a unique key. */
{
  const code = strip(read(SYNC));
  if (/maybeSingle\(\)/.test(code)) {
    problems.push(
      `${SYNC}: còn dùng maybeSingle() — nó trả "không có dòng" cho cả ba trường hợp: ` +
        'không khớp gì, truy vấn hỏng, và khớp NHIỀU HƠN MỘT. Trong file này nhánh sau nó là một lệnh ghi ' +
        'vào bảng có khoá duy nhất, nên hai trường hợp sau biến thành mất dữ liệu trong im lặng',
    );
  }
  /* The specific shape that was there: read the id, then write by it. */
  if (/\.eq\('id',\s*existing/.test(code)) {
    problems.push(
      `${SYNC}: ghi theo một id đọc được từ một vòng trước (\`eq('id', existing…)\`) — ` +
        'có ba mutation đồng bộ cùng sống, nên hai lượt có thể cùng đọc rồi cùng ghi vào một ngày; ' +
        'khoá tự nhiên thuộc về chính câu lệnh',
    );
  }
}

/* ── 4: the readings carry their own clock and their own identity ──

   `getLatestBiometrics` stamped `date_time: new Date()` — the moment of the
   sync — over a query window seven days wide, so a reading from Tuesday was
   written as Friday's and scored as today's. And with no identity, every
   foreground inserted another copy of the same two numbers into the 28-day
   baseline the two largest readiness terms are z-scored against. */
{
  const code = strip(read('src/lib/health.ts'));
  const fn = code.match(/export async function getLatestBiometrics[\s\S]*?\n\}/)?.[0] ?? '';
  if (!fn) {
    console.error('tự kiểm hỏng: không tìm thấy getLatestBiometrics — luật 4 đang không kiểm gì cả');
    process.exit(2);
  }
  if (/date_time:\s*new Date\(\)\.toISOString\(\)/.test(fn)) {
    problems.push(
      'src/lib/health.ts: getLatestBiometrics đóng dấu date_time bằng GIỜ ĐỒNG BỘ chứ không phải giờ ' +
        'của mẫu đo — cửa sổ truy vấn rộng 7 ngày, nên một lần đo hôm thứ Ba đồng bộ hôm thứ Sáu được ' +
        'ghi là số đo của thứ Sáu, rồi được chấm như số đo của HÔM NAY',
    );
  }
  if (!/external_id/.test(fn)) {
    problems.push(
      'src/lib/health.ts: getLatestBiometrics không mang external_id — không có danh tính thì mỗi lần ' +
        'app lên foreground lại chèn thêm một bản sao của cùng hai con số vào đường cơ sở 28 ngày mà ' +
        'hai số hạng lớn nhất của điểm sẵn sàng được z-score theo',
    );
  }
}

/* ── 5: a finished day is finished, and the app comes back for it ──

   `daily_logs.steps` for a past date used to be whatever was true at the last
   foreground: leave the house at nine in the evening on 9,000 steps and 9,000
   is what that day is worth for ever. The Steps screen averages seven of those
   and trends three against three; the weekly `steps_50k` challenge sums the
   week. Both were summing days that had stopped early, and the error only ever
   ran one way — down.

   Two halves to hold. The sync has to *ask* for the finished days, and the
   answer has to land on the right calendar day without inventing zeros. */
{
  const sync = strip(read(SYNC));
  if (!/getDailyStepHistory\(\)/.test(sync)) {
    problems.push(
      `${SYNC}: chỉ hỏi HealthKit về HÔM NAY — ngày đã kết thúc giữ nguyên con số đúng lúc ` +
        'app lên foreground lần cuối, và không có gì quay lại hoàn tất nó. ' +
        'Màn Bước chân lấy trung bình 7 ngày và so 3 với 3 trên đúng những ngày đó',
    );
  }
  /* Asking is not writing. The shape that would pass the rule above while
     changing nothing is a query whose result is read and dropped. */
  if (!/stepDays\.map\(/.test(sync) || !/from\('daily_logs'\)\s*\.\s*upsert\(/.test(sync)) {
    problems.push(
      `${SYNC}: đọc lịch sử bước chân nhưng không ghi nó bằng upsert theo khoá tự nhiên — ` +
        'một lần backfill phải chạy lại được nhiều lần mà ra cùng kết quả',
    );
  }
}

/* ── 6: and the aggregation itself, run rather than read ──

   `dailyStepsFrom` is the whole of what this round can execute: the HealthKit
   query above it needs an iPhone. So the file is compiled and the real function
   is called, in real processes with `TZ` set — which is the only way to observe
   `localDateStr` doing its job, and the method `tools/goal-training.mjs` and
   `tools/user-state.mjs` already use for the same class of bug. */
{
  const out = mkdtempSync(path.join(tmpdir(), 'stepdays-'));
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/step-days.ts', 'src/lib/local-date.ts', '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* No project tsconfig here, so tsc exits non-zero over the `@/` mapping
       while still emitting the JS — the trick `tools/streak.mjs` documents. */
  }
  const emitted = path.join(out, 'step-days.js');
  writeFileSync(
    emitted,
    readFileSync(emitted, 'utf8').replaceAll('@/lib/local-date', './local-date'),
  );
  const { dailyStepsFrom, STEP_HISTORY_DAYS } = createRequire(import.meta.url)(emitted);

  /** run the real function in a process pinned to `tz` */
  const inTZ = (tz, buckets, today) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          '-e',
          `const {dailyStepsFrom}=require(${JSON.stringify(emitted)});` +
            `process.stdout.write(JSON.stringify(dailyStepsFrom(${JSON.stringify(buckets)}, ${JSON.stringify(today)})))`,
        ],
        { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
      ),
    );

  /** a bucket anchored at local midnight of `date` in zone `tz`, as HealthKit returns one */
  const bucketAt = (tz, date, sum) => {
    const iso = execFileSync(
      process.execPath,
      ['-e', `const d=new Date(${JSON.stringify(date + 'T00:00:00')});process.stdout.write(d.toISOString())`],
      { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
    );
    return sum == null ? { startDate: iso } : { startDate: iso, sumQuantity: { quantity: sum } };
  };

  const ZONES = ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Ho_Chi_Minh'];

  /* Test 6 — the same local midnight is a different UTC date in half the world,
     and the bucket must still land on the day the person lived. */
  for (const tz of ZONES) {
    const got = inTZ(tz, [bucketAt(tz, '2026-08-14', 9000), bucketAt(tz, '2026-08-15', 12500)], '2026-08-16');
    const want = [
      { date: '2026-08-14', steps: 9000 },
      { date: '2026-08-15', steps: 12500 },
    ];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(
        `dailyStepsFrom ở ${tz}: gói ngày rơi sai lịch — ra ${JSON.stringify(got)}, đáng lẽ ` +
          `${JSON.stringify(want)}. Đang lấy ngày THEO UTC chứ không phải ngày của người dùng`,
      );
    }
  }

  /* Test 7 — a day HealthKit holds nothing for is not a day with zero steps.
     Writing 0 would also flip `useStepsAvailable`, which asks
     `.not('steps','is',null)`, to "this account has a step source". */
  {
    const got = inTZ('Asia/Ho_Chi_Minh', [
      bucketAt('Asia/Ho_Chi_Minh', '2026-08-13', null),
      bucketAt('Asia/Ho_Chi_Minh', '2026-08-14', 0),
      bucketAt('Asia/Ho_Chi_Minh', '2026-08-15', 7000),
    ], '2026-08-16');
    const want = [
      { date: '2026-08-14', steps: 0 },
      { date: '2026-08-15', steps: 7000 },
    ];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(
        `dailyStepsFrom không phân biệt "không có số đo" với "không bước bước nào" — ra ` +
          `${JSON.stringify(got)}, đáng lẽ ${JSON.stringify(want)}: ngày không có mẫu phải bị BỎ, ` +
          'ngày đo được 0 phải được ghi',
      );
    }
  }

  /* Test 8 — today belongs to `getTodaySteps`, whose window ends *now* rather
     than at midnight. Two writers on one row inside one sync is a race with
     itself, and a future-dated bucket (a device clock running fast) would sit
     at the right-hand end of every chart until the clock caught up. */
  {
    const tz = 'America/New_York';
    const got = inTZ(tz, [
      bucketAt(tz, '2026-08-15', 5000),
      bucketAt(tz, '2026-08-16', 300),
      bucketAt(tz, '2026-08-17', 10),
    ], '2026-08-16');
    if (JSON.stringify(got) !== JSON.stringify([{ date: '2026-08-15', steps: 5000 }])) {
      problems.push(
        `dailyStepsFrom trả về hôm nay hoặc ngày tương lai: ${JSON.stringify(got)} — ` +
          'hôm nay do getTodaySteps ghi (cửa sổ của nó kết thúc ở BÂY GIỜ, không phải nửa đêm)',
      );
    }
  }

  /* Test 9 — idempotent, and stable under two syncs running together: same
     buckets in, same rows out, so whichever upsert lands second writes the same
     numbers the first one did. */
  {
    const tz = 'Asia/Ho_Chi_Minh';
    const buckets = [bucketAt(tz, '2026-08-14', 9000), bucketAt(tz, '2026-08-15', 12500)];
    const runs = [inTZ(tz, buckets, '2026-08-16'), inTZ(tz, buckets, '2026-08-16'), inTZ(tz, buckets, '2026-08-16')];
    if (new Set(runs.map((r) => JSON.stringify(r))).size !== 1) {
      problems.push('dailyStepsFrom không ổn định giữa các lần chạy — backfill phải chạy lại được');
    }
  }

  /* Test 10 — both daylight-saving transitions. The 23-hour day and the
     25-hour day are where a hand-rolled `+ 864e5` breaks, and where two buckets
     can land on one local date. One row per date, and the fuller one wins. */
  for (const [tz, dstDay, before, after] of [
    ['America/New_York', '2026-03-08', '2026-03-07', '2026-03-09'], // spring forward, 23h
    ['America/New_York', '2026-11-01', '2026-10-31', '2026-11-02'], // fall back, 25h
  ]) {
    const got = inTZ(tz, [
      bucketAt(tz, before, 4000),
      bucketAt(tz, dstDay, 6000),
      bucketAt(tz, after, 8000),
    ], '2026-12-01');
    const want = [
      { date: before, steps: 4000 },
      { date: dstDay, steps: 6000 },
      { date: after, steps: 8000 },
    ];
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      problems.push(
        `dailyStepsFrom quanh mốc đổi giờ ${dstDay} ở ${tz}: ra ${JSON.stringify(got)}, ` +
          `đáng lẽ ${JSON.stringify(want)}`,
      );
    }
  }

  /* And the window is the one the readers need. Fourteen is the Steps screen's
     `useStepsHistory(14)`; anything smaller leaves bars nothing can fill. */
  const readerWindow = Number(
    strip(read('src/app/steps.tsx')).match(/useStepsHistory\((\d+)\)/)?.[1] ?? 0,
  );
  if (!readerWindow) {
    console.error('tự kiểm hỏng: không đọc được cửa sổ useStepsHistory từ steps.tsx');
    process.exit(2);
  }
  if (STEP_HISTORY_DAYS < readerWindow) {
    problems.push(
      `STEP_HISTORY_DAYS = ${STEP_HISTORY_DAYS} nhưng màn Bước chân đọc ${readerWindow} ngày — ` +
        'những ngày ngoài cửa sổ backfill sẽ giữ mãi con số dở dang',
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nđồng bộ sức khoẻ: ${problems.length} vấn đề`);
  process.exit(1);
}

console.log(
  `đồng bộ sức khoẻ OK — ${inferable.size} ràng buộc duy nhất suy luận được đọc từ migrations, ` +
    'mọi onConflict trong app đều chốt vào một trong số đó (index RIÊNG PHẦN không tính: ' +
    'PostgREST không gửi được vị từ, nên upsert bị từ chối mọi lần — đó là lý do việc import giấc ngủ ' +
    'và buổi tập từ Apple Health chưa từng ghi được dòng nào); mọi lệnh ghi và mọi select trong ' +
    'use-health-sync đều hứng error; không còn maybeSingle() rồi ghi theo id đọc trước; ' +
    'và số đo sinh trắc mang giờ của chính mẫu đo cùng một danh tính, nên đồng bộ lại là cập nhật ' +
    'một dòng chứ không phải bản sao thứ n. ' +
    'Ngày đã kết thúc được hoàn tất chứ không giữ mãi con số lúc mở app lần cuối, và phép gộp ngày ' +
    'được CHẠY THẬT trong tiến trình có TZ qua 4 múi giờ, cả hai mốc đổi giờ (ngày 23 và 25 tiếng), ' +
    'ngày không có số đo (BỎ, không ghi 0 — ghi 0 sẽ lật useStepsAvailable), ngày đo được 0 (GHI), ' +
    'hôm nay và ngày tương lai (BỎ — hôm nay do getTodaySteps ghi), và ba lần chạy ra cùng kết quả',
);
