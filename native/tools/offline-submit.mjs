/**
 * That a write made without signal happens once, happens everywhere, and lands.
 *
 * ── the three bugs this was written for ──
 *
 * `offline-durable.mjs` proves the queue works: one key, one default function,
 * registered before the cache is restored, resumed after, and payloads that are
 * plain data. Every one of its rules is about a call site that **already uses**
 * the key. None of them can see a screen that should and does not, or a button
 * that lets the same intention be queued twice, or a replay whose verb differs
 * from the online write it is supposed to be identical to.
 *
 * All three had shipped.
 *
 *   1. **The week's day panel had no offline path at all.**
 *      `useLogWorkoutSession`'s own header says two screens finish a workout —
 *      the free-form sheet and `day-plan.tsx`. The sheet was given a durable
 *      path; the panel was not. Offline the mutation pauses, `isPending` stays
 *      true, the button greys out with no toast, and because it carries no
 *      `mutationKey` the persisted mutation comes back on the next launch with
 *      no function to run and is dropped. The sets are gone — and this is the
 *      screen people tick sets on *while training*, which is the more likely of
 *      the two to be used in a basement, not the less.
 *
 *   2. **The offline branch was outside the double-submit guard.**
 *      `log-workout`, `log-sleep`, `log-measurement` and the weight tile all
 *      guarded on the *online* mutation — `save.isPending`, `upsert.isPending`,
 *      `logWeight.isPending` — while offline the tap went to a second mutation
 *      whose state nothing read. `router.back()` only starts an animation, so
 *      the sheet stays mounted and hit-testable while it plays, and on that path
 *      nothing about the button changes: no spinner, no tick, the same label.
 *      A second tap queued the whole intention again. For sleep that is two
 *      rows for one night; for a workout, two sessions — and a phantom session
 *      moves `volume_load`, both training-load windows, the readiness score,
 *      the lifetime count behind the mascot unlocks and the weekly challenges.
 *
 *   3. **The weight replay used a different verb from its online twin.**
 *      `useLogWeight` upserts on `(user_id, date)`; the queue's `case 'weight'`
 *      inserted. `weight_logs` carries `UNIQUE (user_id, date)`, so against a
 *      day that already has a row the replay is *rejected* — and it resumes
 *      inside `resumePausedMutations`, which belongs to no screen, so the
 *      rejection is an unhandled error and the weigh-in is simply not there.
 *      The two orderings that reach it are ordinary: weigh in online at
 *      breakfast and correct it offline later, or correct a typo twice while
 *      still offline — in which case the number that survives is the wrong one.
 *
 * ── why the guard rule resolves identifiers instead of grepping ──
 *
 * The guard is never written where the button is. It is `disabled={!canSave}`,
 * and `canSave` is a const twenty lines up, and in `day-plan` that const reads
 * another one (`logged`). A rule that grepped for `queue.isPending` anywhere in
 * the file would pass on a file that mentions it in a comment; a rule that only
 * read the `disabled` prop would fail on all four real screens. So the prop is
 * read, its identifiers are resolved through their `const` initialisers, and
 * the question is asked of the resolved text.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(NATIVE, '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

/* Comments in this codebase describe bugs by name, so every rule below reads
   code with the prose removed. Block comments are blanked rather than deleted so
   that brace matching and line numbers survive. */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const problems = [];

/* ── the shared machinery ── */

/** Names bound to a mutation declared with the durable key: `const N = useMutation…` */
function offlineMutationNames(code) {
  const out = [];
  for (const m of code.matchAll(/const\s+(\w+)\s*=\s*useMutation[\s\S]{0,400}?OFFLINE_WRITE_KEY/g)) {
    out.push(m[1]);
  }
  return out;
}

/** The body of every `disabled={ … }` JSX prop, brace-matched. */
function disabledProps(code) {
  const out = [];
  const re = /\bdisabled=\{/g;
  let m;
  while ((m = re.exec(code))) {
    let depth = 1;
    let i = m.index + m[0].length;
    for (; i < code.length && depth > 0; i++) {
      if (code[i] === '{') depth++;
      else if (code[i] === '}') depth--;
    }
    out.push(code.slice(m.index + m[0].length, i - 1));
  }
  return out;
}

/** The initialiser text of `const NAME = …;` — used to follow `!canSave` back. */
function constInit(code, name) {
  const m = code.match(new RegExp(`const\\s+${name}\\s*=([\\s\\S]*?);\\n`));
  return m ? m[1] : '';
}

/**
 * Everything a `disabled` prop actually depends on, with local consts inlined.
 *
 * Three levels, because `disabled={!canFinish}` → `canFinish` → `logged` is a
 * real chain in `day-plan.tsx` and a fourth has never been needed.
 */
function guardText(code) {
  let text = disabledProps(code).join('\n');
  for (let depth = 0; depth < 3; depth++) {
    let grew = '';
    for (const id of new Set(text.match(/\b[A-Za-z_$][\w$]*\b/g) ?? [])) {
      grew += `\n${constInit(code, id)}`;
    }
    if (!grew.trim()) break;
    text += grew;
  }
  return text;
}

/* ── self-test, before anything is trusted ──

   Every rule below is run first against the code as it was written — the real
   pre-fix text of each screen, trimmed — and against the fixed shape. A rule
   that no longer matches the bug reports a clean run, which is indistinguishable
   from a clean codebase and considerably worse. */
const BROKEN_SHEET = `
  const queue = useMutation<void, Error, OfflineWrite>({
    mutationKey: [...OFFLINE_WRITE_KEY],
  });
  const save = useMutation({ mutationFn: () => log.mutateAsync({}) });
  const canSave = validSets.length > 0 && !save.isPending && !save.isSuccess;
  <PressScale disabled={!canSave} onPress={() => {
    if (offlineNow() && user) { queue.mutate({ kind: 'workout' }); return; }
    save.mutate();
  }} />
`;
const FIXED_SHEET = BROKEN_SHEET.replace(
  '!save.isPending && !save.isSuccess',
  '!save.isPending && !save.isSuccess && !queue.isPending && !queue.isSuccess',
);
/** the `day-plan` shape: the guard is two consts away from the prop */
const FIXED_INDIRECT = `
  const queue = useMutation<void, Error, OfflineWrite>({ mutationKey: [...OFFLINE_WRITE_KEY] });
  const logged = sessions.length > 0 || log.isSuccess || queue.isPending || queue.isSuccess;
  const canFinish = doneRows.length > 0 && !log.isPending && !logged;
  <PressScale disabled={!canFinish} onPress={finish} />
`;

/** the rule itself, so the self-test and the run cannot drift apart */
function unguarded(code) {
  const guard = guardText(code);
  return offlineMutationNames(code)
    .filter((n) => new RegExp(`\\b${n}\\.mutate\\(`).test(code))
    .filter((n) => !new RegExp(`\\b${n}\\.isPending\\b`).test(guard));
}

{
  const cases = [
    ['bản đã ship (guard chỉ nhìn mutation online) — phải bị bắt', BROKEN_SHEET, ['queue']],
    ['bản đã sửa — không được báo oan', FIXED_SHEET, []],
    ['guard nằm sau hai lớp const (day-plan) — không được báo oan', FIXED_INDIRECT, []],
  ];
  for (const [label, code, want] of cases) {
    const got = unguarded(strip(code));
    if (got.join(',') !== want.join(',')) {
      console.error(`tự kiểm hỏng: ${label} — ra [${got}], đáng lẽ [${want}]`);
      process.exit(2);
    }
  }
}

/* ── 1: every offline submit sits behind the same guard as the online one ── */
{
  const files = globSync('src/**/*.tsx', { cwd: NATIVE }).sort();
  for (const f of files) {
    const code = strip(read(f));
    if (!/OFFLINE_WRITE_KEY/.test(code) || !/offlineNow\(\)/.test(code)) continue;
    for (const name of unguarded(code)) {
      problems.push(
        `${f}: nhánh offline gửi qua \`${name}\` nhưng guard của nút không đọc ` +
          `\`${name}.isPending\` — router.back() chỉ *bắt đầu* animation, sheet vẫn ` +
          'nhận chạm, và ở nhánh này nút không đổi gì cả; chạm hai lần là hai lần ' +
          'xếp hàng cùng một thao tác',
      );
    }
  }
}

/* ── 2: both screens that finish a workout have a durable path ──

   The rule is stated against the hook rather than against a list of files, so a
   third screen that starts logging workouts inherits it without anybody
   remembering to add it here. */
{
  const files = globSync('src/**/*.tsx', { cwd: NATIVE }).sort();
  const callers = files.filter((f) => /useLogWorkoutSession\(\)/.test(strip(read(f))));
  if (callers.length < 2) {
    problems.push(
      `chỉ thấy ${callers.length} màn hình gọi useLogWorkoutSession — ` +
        'luật này được viết cho hai (sheet ghi tự do và bảng ngày trong tuần); ' +
        'nếu hook đổi tên thì luật đang không kiểm gì cả',
    );
  }
  for (const f of callers) {
    const code = strip(read(f));
    if (!/OFFLINE_WRITE_KEY/.test(code) || !/kind: 'workout'/.test(code)) {
      problems.push(
        `${f}: kết thúc buổi tập nhưng không có đường ghi bền — ` +
          'useLogWorkoutSession cần mạng hai lần (đọc lịch sử tìm kỷ lục, rồi insert), ' +
          'nên offline nó bị tạm dừng: nút xám đi, không có toast, và vì mutation ' +
          'không mang mutationKey nên lần mở app sau nó trở về mà không có hàm nào ' +
          'để chạy và bị vứt đi — mất trắng buổi tập',
      );
    }
  }
}

/* ── 3: a replay uses the same verb as its online twin ──

   Read from the schema, not from convention: a table the queue writes with a
   plain `insert` while the database holds `UNIQUE (user_id, date)` over it is a
   replay that gets rejected by any day that already has a row. */
{
  const w = strip(read('src/lib/offline-write.ts'));

  /** tables with a unique key over (user_id, date), from the migrations */
  const sql = globSync('supabase/migrations/*.sql', { cwd: REPO })
    .map((p) => readFileSync(path.join(REPO, p), 'utf8'))
    .join('\n');
  const uniqueByDate = new Set();
  for (const m of sql.matchAll(
    /CREATE\s+TABLE\s+(?:public\.)?(\w+)([\s\S]*?);/gi,
  )) {
    if (/UNIQUE\s*\(\s*user_id\s*,\s*date\s*\)/i.test(m[2])) uniqueByDate.add(m[1]);
  }
  for (const m of sql.matchAll(
    /CREATE\s+UNIQUE\s+INDEX\s+\w+\s+ON\s+(?:public\.)?(\w+)\s*\(\s*user_id\s*,\s*date\s*\)/gi,
  )) {
    uniqueByDate.add(m[1]);
  }
  for (const m of sql.matchAll(
    /ALTER\s+TABLE\s+(?:public\.)?(\w+)\s+ADD\s+CONSTRAINT\s+\w+\s+UNIQUE\s*\(\s*user_id\s*,\s*date\s*\)/gi,
  )) {
    uniqueByDate.add(m[1]);
  }

  /* The rule is only meaningful if the schema read found the table it was
     written for. A regex that silently matches nothing would clear this step on
     any codebase at all. */
  if (!uniqueByDate.has('weight_logs')) {
    console.error(
      'tự kiểm hỏng: không đọc được ràng buộc UNIQUE(user_id, date) của weight_logs ' +
        'từ supabase/migrations — luật verb đang không kiểm gì cả',
    );
    process.exit(2);
  }

  /** every `case '<kind>': { … }` of `applyOfflineWrite`, and the verb it writes with */
  const replays = new Map();
  for (const m of w.matchAll(/case '(\w+)': \{([\s\S]*?)\n    \}/g)) {
    const [, kind, body] = m;
    const table = body.match(/\.from\('(\w+)'\)\s*\.?\s*\n?\s*\.(insert|upsert)\(/);
    if (table) replays.set(kind, { table: table[1], verb: table[2] });
  }

  for (const [kind, { table: tableName, verb }] of replays) {
    if (uniqueByDate.has(tableName) && verb !== 'upsert') {
      problems.push(
        `src/lib/offline-write.ts: case '${kind}' dùng .${verb}() vào ${tableName}, ` +
          'bảng có UNIQUE(user_id, date) — ngày nào đã có dòng thì lần phát lại bị từ chối, ' +
          'và nó chạy trong resumePausedMutations (không thuộc màn hình nào) nên lỗi ' +
          'không đi đâu cả: bản ghi biến mất không một lời',
      );
    }
  }

  /* And the same question asked from the other end: the online twin's verb. A
     schema can gain a constraint the app does not know about yet, and it can
     also lack one the app is already relying on. */
  const fitness = strip(read('src/hooks/use-fitness-data.ts'));
  const online = fitness.match(/from\('weight_logs'\)\s*\n?\s*\.(insert|upsert)\(/)?.[1];
  const replay = replays.get('weight');
  if (!online || !replay) {
    console.error(
      'tự kiểm hỏng: không tìm thấy lệnh ghi weight_logs ở một trong hai phía ' +
        `(online: ${online ?? 'không thấy'}, phát lại: ${replay?.verb ?? 'không thấy'}) — ` +
        'luật đối chiếu động từ đang không kiểm gì cả',
    );
    process.exit(2);
  }
  if (online !== replay.verb) {
    problems.push(
      'ghi cân nặng online và bản phát lại dùng hai động từ khác nhau — ' +
        `online .${online}(), phát lại .${replay.verb}(); ` +
        'hàng đợi tồn tại để làm *đúng việc đã làm khi có mạng*, không phải một phiên bản khác',
    );
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\ngửi offline: ${problems.length} vấn đề`);
  process.exit(1);
}

console.log(
  'gửi offline OK — mọi nhánh offline đều nằm sau guard của nút, ' +
    'cả hai màn hình kết thúc buổi tập đều có đường ghi bền, ' +
    'và bản phát lại dùng đúng động từ mà bảng có ràng buộc đòi hỏi; ' +
    'bản đã ship (guard chỉ nhìn mutation online) vẫn bị bắt',
);
