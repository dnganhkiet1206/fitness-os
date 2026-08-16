/**
 * A write that can report failure has somebody listening for it.
 *
 * ── the half-finished job this exists for ──
 *
 * The round before this wrapped twenty-five updates and deletes in
 * `confirmWrite`, which **throws** when the statement matched no rows. That was
 * the right change: PostgREST answers "deleted five rows" and "matched nothing"
 * identically, so before it the app could not tell them apart at all.
 *
 * But making a write *able* to speak does nothing if nothing is listening. Two
 * screens — `coach-memory.tsx` and `ai-coach.tsx` — called those mutations with
 * no `onError` anywhere: React Query logged the rejection, the row vanished
 * optimistically, the refetch put it back, and the person watched a delete undo
 * itself in silence.
 *
 * That is worse than the state before, in the way that matters: the app now
 * knows something and still says nothing. Half a fix reads as a bug, because it
 * is one.
 *
 * ── what is checked ──
 *
 * Every mutation whose body reaches `confirmWrite` must have an error path — in
 * the hook itself, or at each place it is fired. Traced through the binding, so
 * `const forget = useForgetMemory(); … forget.mutate(id)` is followed rather
 * than guessed at, and the `onError` has to be inside *that* call rather than
 * somewhere else on the screen.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** From `at` (the index of `name`), the text of the whole `name(...)` call. */
function callAt(src, at, name) {
  let depth = 0;
  let i = at + name.length;
  for (; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')') {
      depth--;
      if (depth === 0) break;
    }
  }
  return src.slice(at, i + 1);
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

const read = new Map();
for (const f of files) {
  try {
    read.set(f, strip(readFileSync(path.join(NATIVE, f), 'utf8')));
  } catch {
    /* unreadable file is not this rule's business */
  }
}

/* ── 1. which exported hooks contain a confirmed write ── */
const speaking = new Map(); // hook name → file
for (const [f, src] of read) {
  if (!src.includes('confirmWrite(')) continue;
  for (const chunk of src.split(/\bexport function /).slice(1)) {
    const name = chunk.slice(0, chunk.indexOf('(')).trim();
    /* only up to the next export, so a hook does not inherit its neighbour's */
    if (chunk.includes('confirmWrite(')) speaking.set(name, f);
  }
}

if (speaking.size < 5) {
  problems.push(`chỉ tìm thấy ${speaking.size} hook có confirmWrite — bộ quét hỏng, đừng tin kết quả`);
}

/* ── 2. every place one of them is fired, has an ear ── */
let checked = 0;
for (const [f, src] of read) {
  for (const [hook, from] of speaking) {
    /* `const del = useDeleteWorkoutSession();` — the binding, so the call can
       be followed rather than guessed at */
    const bind = new RegExp(`const (\\w+)\\s*=\\s*${hook}\\(`, 'g');
    for (const b of src.matchAll(bind)) {
      const varName = b[1];
      /* Whitespace between the parts, because a long call is wrapped:
         `challengeProgress\n  .mutateAsync()`. The first version required them
         adjacent and therefore walked straight past Today's challenge refresh —
         the busiest confirmed write in the app. */
      const fire = new RegExp(`\\b${varName}\\s*\\.\\s*mutate(?:Async)?\\s*\\(`, 'g');
      for (const m of src.matchAll(fire)) {
        checked++;
        const call = callAt(src, m.index, m[0].slice(0, m[0].length - 1));
        /* Three shapes count as listening, and `.catch()` is one of them: a
           deliberate catch is a decision about the failure, which is all this
           rule asks for. What it refuses is the call that makes no decision at
           all. */
        const after = src.slice(m.index + call.length, m.index + call.length + 120);
        const caught = /^\s*\.\s*catch\(/.test(after);
        const awaited =
          /mutateAsync/.test(m[0]) &&
          /try\s*\{/.test(src.slice(Math.max(0, m.index - 400), m.index));
        if (/onError/.test(call) || caught || awaited) continue;
        /* or the hook itself reports, which covers every call site at once */
        if (/onError/.test(read.get(from) ?? '')) continue;
        problems.push(
          `${f}: ${varName}.mutate(…) gọi ${hook} (có confirmWrite) mà KHÔNG có onError, và ${from} ` +
            'cũng không báo lỗi. Lệnh ghi giờ BIẾT nó không chạm được dòng nào — nhưng không ai nghe, ' +
            'nên người dùng thấy dòng biến mất rồi hiện lại, không một lời nào. Đó tệ hơn trước khi ' +
            'thêm kiểm tra: app biết mà vẫn im',
        );
      }
    }
  }

  /* Mutations declared inside a screen: the `confirmWrite` and the firing are
     in one file, so the binding trace above does not apply.

     `speaking` is keyed by **hook name**, so the first version of this line
     asked `speaking.has(f)` with a file path and got `false` every time — which
     made every hook file take the screen branch and report itself. A type
     confusion inside the rule, and it produced five confident findings about
     files that were already correct. The values are the paths. */
  const hookFiles = new Set(speaking.values());
  if (src.includes('confirmWrite(') && !hookFiles.has(f) && /useMutation\(/.test(src)) {
    if (!/onError/.test(src)) {
      problems.push(
        `${f}: có confirmWrite trong một useMutation ngay trong màn hình mà cả file không có onError ` +
          'nào — lệnh ghi biết nó hỏng và không ai nghe',
      );
    }
  }
}

if (checked < 8) {
  problems.push(`chỉ theo dấu được ${checked} lời gọi mutate — bộ quét hỏng, đừng tin kết quả`);
}

if (problems.length) {
  console.log('lệnh ghi không ai nghe:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `lệnh ghi có người nghe OK — ${speaking.size} hook chứa confirmWrite, theo dấu ${checked} lời gọi ` +
    'mutate qua đúng biến đã bind (kể cả lời gọi xuống dòng): mỗi lời gọi hoặc tự có onError, hoặc có ' +
    '.catch() ngay sau, hoặc hook của nó báo lỗi, hoặc là mutateAsync nằm trong try/catch. Vòng trước làm cho lệnh ghi BIẾT nói (confirmWrite ném khi không ' +
    'chạm được dòng nào) rồi để hai màn — coach-memory và ai-coach — không có chỗ nào nghe: dòng biến ' +
    'mất theo kiểu lạc quan, refetch đưa nó về, và người dùng nhìn một thao tác xoá tự huỷ trong im ' +
    'lặng. Nửa bản sửa đọc ra thành một lỗi, vì nó đúng là một lỗi',
);
