/**
 * Every table in the schema has somebody who uses it — or a written reason why
 * not.
 *
 * ── the shape this exists for ──
 *
 * Four tables were being carried at once, in three different states, and none
 * of them announced itself:
 *
 *   · `habit_nudges` — read on every Today open, written by nothing. It also
 *     sat in `todayKeys`, so *every* write in the app invalidated it and
 *     refetched an empty table. The card that consumed it filtered a list that
 *     was always empty and therefore returned `null` every single render, while
 *     the widget settings offered a toggle for it.
 *   · `wearable_sources` — read once per Today open, written by nothing, and it
 *     made the biometrics card print "chưa kết nối" in red beside HRV that
 *     Apple Health had just supplied.
 *   · `weekly_reviews`, `scan_history` — in the migrations and in `types.ts`,
 *     never referenced by a single line of the app.
 *
 * None of these is a crash. Two were a cost paid on every write, one was a
 * false statement on the dashboard, and the last two were simply never true. A
 * table nobody uses does not fail — it accumulates.
 *
 * ── why this is a list and not a deletion ──
 *
 * The two untouched tables stay. Dropping a table is irreversible, and an empty
 * table costs nothing to keep; the actual cost was always the *queries*, and
 * those are gone. So this is the same shape as `tools/linked.mjs`, which
 * catches exported functions nobody calls: everything unused must be named, with
 * a reason, in one place somebody has to edit on purpose.
 *
 * A table added later and never wired up fails this step — which is the case
 * worth catching, because it is the one nobody would otherwise notice.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const problems = [];

/**
 * Known, unused, and kept on purpose.
 *
 * The reason is the point. "It is in the list" is not an argument; the sentence
 * beside it is what a later reader needs in order to decide whether the entry
 * is still true.
 */
const KEPT = new Map([
  [
    'habit_nudges',
    'từng được đọc mỗi lần mở Today mà không ai ghi; truy vấn đã bỏ, bảng giữ lại ' +
      'vì xoá bảng là không hoàn tác được còn một bảng rỗng thì gần như không tốn gì',
  ],
  [
    'wearable_sources',
    'ý định ban đầu là danh sách thiết bị đã kết nối; nguồn dữ liệu thật nằm ngay ' +
      'trên cột `source` của từng bản ghi sinh trắc, nên thẻ đọc chỗ đó thay vì bảng này',
  ],
  ['weekly_reviews', 'màn Weekly Review dựng từ dữ liệu thô mỗi lần mở, chưa từng lưu bản tổng kết'],
  ['scan_history', 'lịch sử quét chưa được làm; kết quả quét đi thẳng vào bữa ăn qua scan-bridge'],
]);

/* ── the tables the schema declares ── */
const types = readFileSync(path.join(NATIVE, 'src/integrations/supabase/types.ts'), 'utf8');
const tablesBlock = types.slice(types.indexOf('Tables: {'), types.indexOf('Views: {'));
const declared = [...tablesBlock.matchAll(/^      (\w+): \{$/gm)].map((m) => m[1]);

if (declared.length < 15) {
  problems.push(`chỉ đọc được ${declared.length} bảng từ types.ts — bộ quét hỏng, đừng tin kết quả`);
}

/* ── who touches them ── */
const used = new Set();
const scan = (root, args) => {
  let files;
  try {
    files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', ...args], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    return;
  }
  for (const f of files) {
    let src;
    try {
      src = readFileSync(path.join(root, f), 'utf8');
    } catch {
      continue;
    }
    /* `.from('x')` in the app and in the edge functions, plus `rpc('x')`
       arguments that name a table is not a thing — RPCs are covered by
       `economy-sql.mjs`. */
    for (const m of src.matchAll(/\.from\(\s*['"](\w+)['"]/g)) used.add(m[1]);
  }
};
scan(NATIVE, ['src']);
scan(REPO, ['supabase/functions']);

if (used.size < 10) {
  problems.push(`chỉ tìm thấy ${used.size} bảng đang dùng — bộ quét hỏng, đừng tin kết quả`);
}

/* ── 1. every declared table is used, or named with a reason ── */
for (const t of declared) {
  if (used.has(t) || KEPT.has(t)) continue;
  problems.push(
    `bảng '${t}' không có một dòng code nào đọc hay ghi — nối nó vào, hoặc ghi tên nó ` +
      'vào danh sách KEPT trong tools/dead-schema.mjs kèm LÝ DO. Một bảng không ai dùng không ' +
      'gây lỗi, nó chỉ tích lại, và không có gì tự nói ra điều đó',
  );
}

/* ── 2. the list does not outlive its own entries ── */
for (const [t, why] of KEPT) {
  if (!declared.includes(t)) {
    problems.push(`danh sách KEPT còn '${t}' nhưng bảng đó không còn trong schema — bỏ dòng đó đi`);
  }
  if (!why || why.length < 20) {
    problems.push(`'${t}' nằm trong KEPT mà lý do quá sơ sài — lý do mới là thứ người đọc sau cần`);
  }
}

/* ── 3. and the two queries that were the actual cost stay gone ── */
{
  const today = readFileSync(path.join(NATIVE, 'src/hooks/useTodayData.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  for (const [table, why] of [
    ['habit_nudges', 'nó nằm trong todayKeys nên MỌI lần ghi đều fetch lại một bảng rỗng'],
    ['wearable_sources', 'nó làm thẻ sinh trắc nói "chưa kết nối" cạnh dữ liệu Apple Health'],
  ]) {
    if (today.includes(`'${table}'`)) {
      problems.push(`useTodayData.ts truy vấn lại '${table}' — ${why}`);
    }
  }
  const keys = readFileSync(path.join(NATIVE, 'src/lib/today-keys.ts'), 'utf8');
  if (/'nudges'/.test(keys)) {
    problems.push(
      "today-keys.ts còn khoá 'nudges' — mỗi lần ghi bữa ăn/buổi tập/giấc ngủ/cân nặng đều " +
        'fetch lại một bảng không ai ghi',
    );
  }
}

/* ── 4. and the claim that replaced the dead table is one the data supports ──

   Removing the query is only half of E5a. The other half is the sentence the
   card prints in its place, and that sentence has edges: `manual` is a real
   source and still not a connection, an empty string is not a source at all,
   and a source nobody has heard of should be named rather than read as "no
   connection" — which is precisely the failure the table caused.

   A ternary inside a component is a rule nothing can execute, so the rule was
   lifted into `lib/biometric-source.ts` and is run here, on every branch. */
{
  const out = mkdtempSync(path.join(tmpdir(), 'biosrc-'));
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/biometric-source.ts', '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const { connectedSourceLabel } = createRequire(import.meta.url)(
    path.join(out, 'biometric-source.js'),
  );

  const CASES = [
    ['apple_health', 'apple health', 'người đồng bộ Apple Health PHẢI thấy "đã kết nối" — bản đã ship nói "chưa kết nối" ngay cạnh HRV của chính họ'],
    ['manual', null, 'người tự gõ tay không có thiết bị nào cả; "manual" là một nguồn thật nhưng không phải một kết nối'],
    [null, null, 'chưa có bản ghi nào của hôm nay thì không được khẳng định có kết nối'],
    [undefined, null, 'cột source rỗng cũng vậy'],
    ['', null, 'chuỗi rỗng không phải một nguồn'],
    ['   ', null, 'khoảng trắng cũng không'],
    ['health_connect', 'health connect', 'một nguồn lạ phải được GỌI TÊN, không phải bị đọc thành "chưa kết nối" — đó đúng là lỗi mà bảng chết đã gây ra'],
  ];
  for (const [input, expected, why] of CASES) {
    let got;
    try {
      got = connectedSourceLabel(input);
    } catch (e) {
      problems.push(`connectedSourceLabel(${JSON.stringify(input)}) ném lỗi: ${e.message}`);
      continue;
    }
    if (got !== expected) {
      problems.push(
        `connectedSourceLabel(${JSON.stringify(input)}) ra ${JSON.stringify(got)} ` +
          `nhưng phải là ${JSON.stringify(expected)} — ${why}`,
      );
    }
  }

  /* and the card must actually be asking this function, not a fresh ternary */
  const card = readFileSync(path.join(NATIVE, 'src/components/ascnd/today-widgets-2.tsx'), 'utf8');
  if (!/connectedSourceLabel\(\s*bio\.source\s*\)/.test(card)) {
    problems.push(
      'thẻ sinh trắc không còn gọi connectedSourceLabel(bio.source) — luật ở trên có chạy ' +
        'thì cũng không nói gì về thứ người dùng nhìn thấy',
    );
  }
}

if (problems.length) {
  console.log('bảng chết:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `bảng chết OK — ${declared.length} bảng trong schema, ${used.size} bảng có code đọc/ghi, ` +
    `${KEPT.size} bảng được giữ lại CÓ GHI LÝ DO (không xoá: xoá bảng là không hoàn tác được, ` +
    'còn cái giá thật nằm ở các truy vấn, và chúng đã bỏ); một bảng mới thêm mà quên nối sẽ ' +
    'làm hỏng bước này; và hai truy vấn từng chạy mỗi lần mở Today vào hai bảng không ai ghi ' +
    "vẫn không quay lại, kể cả khoá 'nudges' trong todayKeys vốn khiến MỌI lần ghi fetch lại " +
    'một bảng rỗng; và câu thay thế cho bảng wearable_sources đã được CHẠY THẬT qua 7 ca — ' +
    "apple_health ra 'apple health', manual/rỗng/khoảng trắng ra 'chưa kết nối', và một nguồn " +
    'lạ được gọi tên chứ không bị đọc thành mất kết nối',
);
