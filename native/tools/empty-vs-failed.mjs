/**
 * That "you have nothing" is only ever said when it is true.
 *
 * ── the bug ──
 *
 * A query fails. React Query hands back `data === undefined`. The screen does
 * `data ?? []`, the length is zero, and the zero branch renders:
 *
 *     Chưa có buổi tập nào trong 90 ngày qua
 *
 * That sentence is not a description of a network error. It is a confident
 * statement, in the person's own language, about their own account — and it is
 * false. Somebody who logged forty sessions reads it on a bad connection and
 * has every reason to think the app lost them. The next thing they do is log
 * things again, or write in asking where their history went.
 *
 * `load-failed.tsx` was written for exactly this and its own header says the
 * measurement: *"Not one of the app's forty queries had a consumer that read
 * `isError`."* Five tab screens were fixed at the time. The other twenty-eight
 * were not, and nothing noticed, because a screen in this state looks completely
 * normal — it is not blank, it is not spinning, it is not showing an error. It
 * is calmly telling you something untrue.
 *
 * ── what this asks ──
 *
 * Not "does every screen handle errors". That would be a lint rule with a
 * hundred exceptions. The question is narrower and has no reasonable exception:
 *
 *     if a screen reads server data, and has a branch that says "there is
 *     nothing here", then it must also be able to say "I could not read this"
 *
 * A screen with no zero-state message is not covered, because it has not made a
 * claim. A screen with no queries is not covered either. The rule is about the
 * sentence, not about the error handling.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * Same as `strip`, but every comment becomes the same number of blank lines.
 *
 * The rule below reports a file and a line, and a line number that points at
 * the wrong place is worse than none: the first run sent four people to the
 * middle of a paragraph of prose. Removing comments shifts everything after
 * them upward, so they are blanked rather than deleted.
 */
const blank = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) ?? []).length))
    .replace(/^\s*\/\/.*$/gm, '');

const problems = [];

/**
 * How a screen says "there is nothing here".
 *
 * Style names rather than the words themselves: the copy lives in `i18n.ts`
 * under a hundred different keys and is written in two languages, but every one
 * of these branches renders through a style called `empty`-something. That is a
 * convention this app already keeps, and it is the only handle that does not
 * turn into a dictionary of phrases to maintain.
 */
const SAYS_EMPTY = /styles\.(empty|emptyTitle|emptyText|emptyMsg|emptyHint|emptyBody|pickerEmpty)\b/;

/**
 * The screen can admit it could not read.
 *
 * `isError` specifically, not `LoadFailed`. The first version accepted either,
 * and a sabotage that deleted the whole failure branch still passed — because
 * the now-unused `import { LoadFailed }` line at the top of the file matched.
 * A rule an orphaned import can satisfy is checking that somebody once thought
 * about the problem, not that the screen handles it.
 *
 * `isError` is the query's own signal and cannot be left behind by accident:
 * remove the branch that reads it and TypeScript reports an unused variable.
 */
const SAYS_FAILED = /\bisError\b/;

/** Reads something off the server. */
const READS_DATA = /const \{[^}]*\bdata\b|useQuery\(/;

/**
 * Screens whose zero-state is not a claim about server data.
 *
 * The rule keys off a style name, which is a good handle and a blunt one: a
 * screen can render `styles.empty` for something that has nothing to do with
 * what the server said. Both of these were caught on the first run and both are
 * correct as written.
 *
 * Listed rather than silenced, with the reason next to the name, because an
 * exception nobody can see is how a rule quietly stops meaning anything. Adding
 * to this list should be an argument, not a convenience — if the zero-state
 * says anything at all about data that came off the server, it belongs in the
 * rule and not here.
 */
const NOT_A_DATA_CLAIM = new Set([
  /* The greeting before the first message — "Chào, tôi có thể giúp gì?" and
     four prompt chips. It is what the screen looks like when a conversation has
     not started, which is a fact about the session and not about anything read.
     The `conversations` query failing does not change a word of it. */
  'src/app/ai-coach.tsx',
  /* "Chưa thêm món nào" counts `items`, the draft being assembled in this
     sheet's own `useState`. It is empty because the person has not tapped
     anything yet, and it is true whatever the network is doing. */
  'src/app/log-meal.tsx',
]);

const screens = globSync('src/app/**/*.tsx', { cwd: NATIVE })
  .filter((f) => !f.includes('_layout'))
  .sort();

let covered = 0;
let exempt = 0;
for (const f of screens) {
  const code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  if (!READS_DATA.test(code)) continue;
  if (!SAYS_EMPTY.test(code)) continue;
  if (NOT_A_DATA_CLAIM.has(f)) {
    exempt++;
    continue;
  }
  covered++;
  if (!SAYS_FAILED.test(code)) {
    problems.push(
      `${f}: nói "chưa có gì" nhưng không phân biệt được với "không đọc được" — ` +
        'truy vấn hỏng thì data là undefined, nhánh rỗng chạy, và màn hình khẳng định ' +
        'một điều sai về dữ liệu của chính người dùng',
    );
  }
}

/*
  ── a screen cannot report an error its query never had ──

  Wiring `isError` into twelve screens turned out to fix six of them. The other
  six kept saying "no saved foods yet" against a server returning 500 to every
  request, and the reason was a layer down: the query functions themselves.

      const { data } = await supabase.from('food_items').select(...);
      return (data ?? []) as FoodItemRow[];

  The `error` is destructured away. A failed request therefore *resolves* — with
  `data: null`, which becomes `[]` — so React Query records a success, `isError`
  is never true, and the failure branch above it is unreachable code that reads
  like a fix.

  Found by running the app against a server that 500s everything, which is the
  only way it could have been found: every one of these type-checks, and the
  screens all pass the rule above.

  So the rule reaches into the query. Seven of forty-five were swallowing.
*/
{
  /*
     Screens too, not just hooks. Two `useQuery` calls live directly in
     `smart-goals.tsx` and both swallowed the error — the rule had been looking
     only where queries usually live, which is not the same as where they are.
  */
  const HOOKS = [
    ...globSync('src/{hooks,lib}/*.{ts,tsx}', { cwd: NATIVE }),
    ...globSync('src/app/**/*.tsx', { cwd: NATIVE }),
    ...globSync('src/components/**/*.tsx', { cwd: NATIVE }),
  ].sort();
  for (const f of HOOKS) {
    const src = blank(readFileSync(path.join(NATIVE, f), 'utf8'));
    for (const m of src.matchAll(/queryFn: async \([^)]*\) *(?::[^=]+)?=> *\{/g)) {
      let i = m.index + m[0].length;
      let depth = 1;
      while (i < src.length && depth > 0) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') depth--;
        i++;
      }
      const body = src.slice(m.index + m[0].length, i);
      if (!/supabase/.test(body)) continue;
      if (/\berror\b/.test(body)) continue;
      problems.push(
        `${f}:${src.slice(0, m.index).split('\n').length} — queryFn bỏ qua error của Supabase — ` +
          'truy vấn hỏng sẽ *thành công* với data null, nên isError không bao giờ đúng ' +
          'và nhánh báo lỗi ở màn hình trở thành code không bao giờ chạy',
      );
    }
  }
}

/*
  ── the gate that decides whether the app exists at all ──

  `_layout.tsx`'s `Gate` holds the splash until it is `ready`, and that
  condition was `!loading && (!user || !profileLoading)`. Measured against a
  server that fails **only** the `profiles` request and answers everything else
  normally: the app is blank for ever. Thirty-five seconds in, still nothing —
  no error, no retry, no explanation, and force-quitting does it again.

  Failing every *other* query left the app working perfectly, so this was one
  read deciding whether the product existed. `.single()` reports "no rows" as an
  error too, which widens the blast radius past network trouble.

  A gate may wait on a query. It may not wait on one for ever, so its readiness
  condition has to account for that query having failed.
*/
{
  const layout = strip(readFileSync(path.join(NATIVE, 'src/app/_layout.tsx'), 'utf8'));
  const gate = layout.slice(layout.indexOf('function Gate()'));
  const body = gate.slice(0, gate.indexOf('\nfunction ') === -1 ? gate.length : gate.indexOf('\nfunction '));

  /*
     The *expression*, not the file.

     A first version asked whether the word `isError` appeared anywhere above
     `const ready =`. Removing the flag from the readiness condition — the whole
     bug — left the destructure `isError: profileFailed` sitting there and the
     rule stayed green. Third time in this project that a rule has been
     satisfied by a name rather than by behaviour.
  */
  const readyExpr = (body.match(/const ready = [^;]*;/) ?? [''])[0];
  if (!readyExpr) {
    problems.push('src/app/_layout.tsx: không tìm thấy điều kiện `ready` của Gate — luật này cần sửa lại');
  } else if (!/Failed|isError/.test(readyExpr)) {
    problems.push(
      'src/app/_layout.tsx: điều kiện `ready` của Gate không tính tới việc đọc profile bị lỗi — ' +
        'chỉ cần truy vấn đó hỏng là app trắng vĩnh viễn, không báo gì và không có cách nào thoát',
    );
  }
  if (!/profileFailed &&/.test(body)) {
    problems.push(
      'src/app/_layout.tsx: Gate không có nhánh hiển thị khi đọc profile hỏng — ' +
        'người dùng lần đầu cài, hoặc vừa đăng nhập lại, sẽ nhìn vào màn hình trắng',
    );
  }
}

/**
 * The self-test.
 *
 * Both halves matter. Catching the bug is easy; the rule is only usable if it
 * stays quiet about a screen that says nothing about emptiness at all, and
 * about one that already answers both questions.
 */
const SELF = [
  ['Gate chờ mãi một truy vấn — bị bắt', () => {
    /* The exact sabotage the first version of this rule missed: the flag is
       still destructured, it is simply not used in the condition. */
    const bad = 'const { isError: profileFailed } = useProfile();\nconst ready = !loading && (!user || !profileLoading);';
    return !/Failed|isError/.test((bad.match(/const ready = [^;]*;/) ?? [''])[0]);
  }],
  ['Gate có tính tới lỗi — không báo oan', () => {
    const good = 'const ready = !loading && (!user || !profileLoading || profileFailed);';
    return /Failed|isError/.test((good.match(/const ready = [^;]*;/) ?? [''])[0]);
  }],
  ['queryFn nuốt lỗi — bị bắt', () => {
    const body = "const { data } = await supabase.from('x').select('*');\nreturn data ?? [];";
    return /supabase/.test(body) && !/\berror\b/.test(body);
  }],
  ['queryFn có ném lỗi — không báo oan', () => {
    const body = "const { data, error } = await supabase.from('x').select('*');\nif (error) throw error;\nreturn data ?? [];";
    return /\berror\b/.test(body);
  }],
  ['màn nói "rỗng" mà không có nhánh lỗi — bị bắt', () => {
    const bad = "const { data: sessions } = useWorkoutSessions();\n<Text style={styles.empty}>Chưa có buổi tập nào</Text>";
    return READS_DATA.test(bad) && SAYS_EMPTY.test(bad) && !SAYS_FAILED.test(bad);
  }],
  ['màn có cả hai — không báo oan', () => {
    const good = "const { data, isError } = useX();\n{isError ? <LoadFailed /> : <Text style={styles.empty}>Chưa có</Text>}";
    return SAYS_FAILED.test(good);
  }],
  ['màn không nói gì về rỗng — không bị hỏi', () => {
    const neutral = "const { data } = useProfile();\n<Text style={styles.name}>{data?.name}</Text>";
    return READS_DATA.test(neutral) && !SAYS_EMPTY.test(neutral);
  }],
  ['màn không đọc server — không bị hỏi', () => {
    const stat = "<Text style={styles.emptyTitle}>Chưa chọn</Text>";
    return !READS_DATA.test(stat);
  }],
  /* `const { data }` without a rename is how most of these screens are written,
     and a first pass that only looked for `data: name` saw five screens out of
     thirty-three. A rule that quietly covers a sixth of what it claims to is
     worse than no rule, because it reports success. */
  ['destructure không đổi tên vẫn tính là đọc dữ liệu', () => READS_DATA.test('const { data } = useMyFoods();')],
  /* The exemption list is the part most likely to rot: the cheapest way to
     make this tool green is to add a filename to it. Keeping it small is not
     enforceable, but keeping it *honest* is — every entry must name a file that
     still exists and would otherwise be flagged, so a stale exemption for a
     file that has since been fixed cannot sit there pretending to be needed. */
  ['danh sách miễn không chứa file đã hết lỗi', () => {
    for (const f of NOT_A_DATA_CLAIM) {
      const code = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
      if (SAYS_FAILED.test(code)) return false; // it handles errors now — drop it
      if (!SAYS_EMPTY.test(code) || !READS_DATA.test(code)) return false;
    }
    return true;
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('màn hình nói dối khi tải hỏng:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `rỗng ≠ hỏng OK — mọi queryFn đều báo lỗi Supabase lên trên (nuốt lỗi thì truy vấn hỏng hoá thành "thành công, rỗng"); ` +
    `${covered} màn có câu "chưa có gì" về dữ liệu server, màn nào cũng phân biệt được với "không đọc được"; ` +
    `${exempt} màn được miễn kèm lý do (câu "rỗng" của chúng nói về trạng thái tại chỗ, không phải về thứ đọc từ server)`,
);
