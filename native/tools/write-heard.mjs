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

/** From `at` (the index of a `{`), the text of that object literal. */
function objectAt(src, at) {
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
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

function scan(read) {
  const problems = [];
  /* ── 1. which exported hooks contain a write that can speak ──

     Two kinds. `confirmWrite` throws when nothing was touched. `useOnlineMutation`
     (#45) throws when there is no connection, where the default `useMutation`
     PAUSED — and a pause is silent by construction. Either one, unheard, is the
     silence it was written to end. */
  const SPEAKS = /confirmWrite\(|useOnlineMutation\(/;
  const speaking = new Map(); // hook name → file
  const body = new Map(); // hook name → its own text, up to the next export
  for (const [f, src] of read) {
    if (!SPEAKS.test(src)) continue;
    for (const chunk of src.split(/\bexport function /).slice(1)) {
      const name = chunk.slice(0, chunk.indexOf('(')).trim();
      /* only up to the next export, so a hook does not inherit its neighbour's */
      if (SPEAKS.test(chunk)) {
        speaking.set(name, f);
        body.set(name, chunk);
      }
    }
  }
  /* `useToggleLike = () => useToggle(…)`: an arrow export wrapping a private hook
     that speaks. Its own text has no `onError`; the private hook's does. */
  for (const [f, src] of read) {
    for (const m of src.matchAll(/export const (use\w+)\s*=\s*\(\)\s*=>\s*(use\w+)\(/g)) {
      const inner = src.split(new RegExp(`\\bfunction ${m[2]}\\(`))[1];
      if (inner && SPEAKS.test(inner.split(/\bexport /)[0])) {
        speaking.set(m[1], f);
        body.set(m[1], inner.split(/\bexport /)[0]);
      }
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
          /* `update.mutate({ id, ...data }, opts)` — callbacks shared by two
             calls live in one object. Followed to `const opts = { … }` in the
             same file rather than accepted on the name. */
          const optsName = call.match(/,\s*(\w+)\s*\)$/)?.[1];
          const optsDecl = optsName ? src.match(new RegExp(`const ${optsName}\\s*=\\s*\\{`)) : null;
          const viaOpts = optsDecl != null && /onError/.test(objectAt(src, optsDecl.index + optsDecl[0].length - 1));
          if (/onError/.test(call) || caught || awaited || viaOpts) continue;
          /* or the hook itself reports, which covers every call site at once.
             ITS OWN text, not its file's: `use-community.ts` has one `onError`
             (in `useToggle`), and a file-wide test let all sixteen of its hooks
             through on the strength of that one. */
          if (/onError/.test(body.get(hook) ?? '')) continue;
          problems.push(
            `${f}: ${varName}.mutate(…) gọi ${hook} (có confirmWrite / useOnlineMutation) mà KHÔNG có onError, và ` +
              `chính ${hook} (${from}) cũng không báo lỗi. Lệnh ghi giờ BIẾT nó hỏng (không chạm được dòng nào, ` +
              'hay không có mạng) — nhưng không ai nghe, nên người dùng thấy thao tác tự huỷ, không một lời ' +
              'nào. Đó tệ hơn trước khi thêm kiểm tra: app biết mà vẫn im',
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

  /* ── 3. a Community write is online-only, never paused (#45) ──

     A bare `useMutation` in a Community hook file is the pause again: offline
     it never runs, never errors, and the button it drives waits for ever.
     Built on `useOnlineMutation`, it refuses at once and says why — and
     section 2 then insists somebody hears it. */
  let community = 0;
  for (const [f, src] of read) {
    if (!/^src\/hooks\/use-community[\w-]*\.ts$/.test(f)) continue;
    community += (src.match(/\buseOnlineMutation\(/g) ?? []).length;
    const bare = (src.match(/\buseMutation\(/g) ?? []).length;
    if (bare > 0) {
      problems.push(
        `${f}: ${bare} lời gọi useMutation trần trong một tệp hook Cộng đồng. Mất mạng thì React Query TẠM ` +
          'DỪNG nó: mutationFn không chạy, onError không gọi, dấu lạc quan đứng yên và nút chờ mãi. Dùng ' +
          'useOnlineMutation (hooks/use-online-mutation.ts) — thao tác cộng đồng không xếp hàng để gửi sau',
      );
    }
  }
  if (community < 15) {
    problems.push(`chỉ thấy ${community} useOnlineMutation trong các hook Cộng đồng — bộ quét hỏng, đừng tin kết quả`);
  }

  return { problems, checked, hooks: speaking.size, community };
}

const { problems, checked, hooks, community } = scan(read);

/* ── thử ngược, trên bản sao trong bộ nhớ: mỗi luật phải đỏ khi đúng chỗ nó canh bị gỡ ── */
const PROBES = [
  [
    'bỏ onError im lặng có chủ ý của useMarkInboxRead',
    'src/hooks/use-community.ts',
    (s) => s.replace(/onError: \(\) => \{\},/, ''),
  ],
  [
    'bỏ onError của useToggleFavoriteFood (hai ngôi sao không tự có)',
    'src/hooks/use-nutrition.ts',
    (s) => s.replace(/(export function useToggleFavoriteFood[\s\S]*?)onError: \(e: Error\) => toast\.fail\(e\),/, '$1'),
  ],
  [
    'đưa một hook Cộng đồng về useMutation trần',
    'src/hooks/use-community.ts',
    (s) => s.replace('useOnlineMutation({', 'useMutation({'),
  ],
  [
    'bỏ onError khỏi opts dùng chung của food-editor',
    'src/app/food-editor.tsx',
    (s) => s.replace(/(const opts = \{[\s\S]*?)onError: \(e: Error\) => toast\.fail\(e\),/, '$1'),
  ],
];
for (const [what, file, mutate] of PROBES) {
  const src = read.get(file);
  const changed = src == null ? null : mutate(src);
  if (changed == null || changed === src) {
    problems.push(`thử ngược "${what}": không tìm thấy chỗ cần gỡ trong ${file} — luật thử ngược đã lỗi thời`);
    continue;
  }
  const probe = new Map(read);
  probe.set(file, changed);
  if (scan(probe).problems.length <= problems.length) {
    problems.push(`thử ngược hỏng: ${what} mà luật vẫn xanh — bộ quét không còn đọc đúng`);
  }
}

if (problems.length) {
  console.log('lệnh ghi không ai nghe:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `lệnh ghi có người nghe OK — ${hooks} hook chứa confirmWrite hoặc useOnlineMutation, theo dấu ${checked} lời gọi ` +
    'mutate qua đúng biến đã bind (kể cả lời gọi xuống dòng): mỗi lời gọi hoặc tự có onError (kể cả trong một ' +
    'object opts dùng chung, lần theo tới chỗ khai báo), hoặc có .catch() ngay sau, hoặc CHÍNH hook của nó báo ' +
    'lỗi (đọc thân hook, không phải cả tệp — đọc cả tệp thì 16 hook Cộng đồng qua nhờ một onError duy nhất, và từng ' +
    'giấu hai ngôi sao Yêu thích hỏng im lặng), hoặc là mutateAsync nằm trong try/catch. ' +
    `${community} mutation Cộng đồng đều là useOnlineMutation, không useMutation trần nào: mất mạng thì báo ngay ` +
    'thay vì tạm dừng im lặng (#45). Thử ngược trên bản sao: gỡ onError của hộp thư, của ngôi sao, của opts ' +
    'food-editor, hay đưa một hook Cộng đồng về useMutation trần — cả bốn đều làm luật đỏ',
);
