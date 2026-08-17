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
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
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
    'một dòng chứ không phải bản sao thứ n',
);
