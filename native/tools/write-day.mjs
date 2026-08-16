/**
 * A write asks what day it is when it happens, not when the screen drew.
 *
 * ── the bug this was written for ──
 *
 * Hooks in this app open with `const dateStr = today();`. For a **query** that
 * is right and deliberate: the date is part of the query key, a key has to hold
 * still across the renders of a day, and React Query re-keys by itself the
 * moment a later render sees a new date.
 *
 * For a **write** it is wrong, and the app is exactly the kind that is left
 * open. A phone on a bedside table renders the Water screen at eleven at night
 * and is still showing it at ten past midnight. Three writes were reading that
 * render's date:
 *
 *   · `useAddWater` sent `date: dateStr`, so the glass counted toward
 *     *yesterday's* ring, challenge and streak. The give-away was inside the
 *     same object — `at:` read `new Date()` fresh — so one row stated two
 *     different days about itself.
 *   · `useToggleSupplement` used it for the **delete range**, so un-ticking
 *     after midnight looked inside yesterday's window: today's tick survived
 *     and yesterday's was removed instead.
 *   · `useInvalidateToday` closed over it, so the first log after midnight
 *     refreshed yesterday's keys and left the new day's totals on screen
 *     showing nothing logged.
 *
 * None of these throws, none shows up in a type, and none is reproducible
 * without staying up.
 *
 * ── what is checked ──
 *
 * A date bound in a hook body must not be *read inside a write*. `useMutation`
 * blocks and the closures hooks return are where writes live; queries are left
 * alone, because there the capture is the correct behaviour and banning it
 * would be a rule pushing the code the wrong way.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Walk from the `(` after `name` to its matching `)`. */
function callBlock(src, at, name) {
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

/**
 * Known, captured, and correct — with the reason.
 *
 * Empty on purpose right now. The entry that would go here is a write whose day
 * genuinely is the day the screen was opened rather than the day the button was
 * pressed, and no such write exists; if one is added, the sentence beside it is
 * what a later reader needs.
 */
const EXEMPT = new Map();

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

let scannedMutations = 0;
let scannedBindings = 0;

for (const f of files) {
  let raw;
  try {
    raw = readFileSync(path.join(NATIVE, f), 'utf8');
  } catch {
    continue;
  }
  if (!/useMutation\(|return \(\) =>/.test(raw)) continue;
  const src = strip(raw);

  /*
    ── one hook at a time, and the first draft got this wrong ──

    The first version collected the bound names across the whole file and then
    searched every mutation block for them. It reported `use-water.ts` and
    `use-library.ts` immediately — and both reports were false. Those files hold
    queries that bind `dateStr` at render (correct: it is a query key) *and*
    mutations that bind their own `dateStr` inside `mutationFn` (correct: read
    at fire time). Same identifier, different scopes, and a file-wide grep
    cannot tell one from the other.

    A rule that shouts at the fixed code is worse than no rule: the next reader
    silences it. So the file is split per exported function, and a name is only
    a capture if the block using it does not re-declare it — as a `const` of its
    own, or as a callback parameter, which is exactly how `onSettled(_d, _e,
    dateStr)` receives the day the write actually carried.
  */
  for (const chunk of src.split(/\bexport function /).slice(1)) {
    const hook = chunk.slice(0, chunk.indexOf('(')).trim();

    const blocks = [];
    for (let i = chunk.indexOf('useMutation('); i >= 0; i = chunk.indexOf('useMutation(', i + 1)) {
      blocks.push(['useMutation', callBlock(chunk, i, 'useMutation')]);
      /* Counted here, before the binding test bails out, because this number is
         the "is the scanner still looking at the app" sentinel. Counting it
         after the bail-out made it fall to zero the moment the code was fixed —
         a broken-scanner alarm that fires exactly when everything is right. */
      scannedMutations++;
    }

    const bound = [...chunk.matchAll(/^ {2}const (\w+) = (?:today\(\)|localDateStr\(\));/gm)].map(
      (m) => m[1],
    );
    if (bound.length === 0) continue;
    scannedBindings += bound.length;
    for (const m of chunk.matchAll(/return \(\) => \{[\s\S]*?\n {2}\};/g)) {
      blocks.push(['closure trả về', m[0]]);
    }
    /*
      And the wrapper a hook returns around its mutation.

      This was the blind spot in the first working version, found by breaking
      the shipped bug back in: `useAddWater` assembles the write inside
      `return { ...m, mutate: (…) => … }`, which is *after* the `useMutation(`
      call and therefore outside the block above. The specific check at the
      bottom of this file caught it, but the general rule — the one that has to
      cover the write nobody has written yet — did not.
    */
    {
      const at = chunk.lastIndexOf('return {');
      if (at >= 0 && /\bmutate:/.test(chunk.slice(at))) {
        blocks.push(['wrapper mutate trả về', chunk.slice(at)]);
      }
    }

    for (const [what, block] of blocks) {
      for (const name of bound) {
        if (EXEMPT.has(`${f}:${hook}:${name}`)) continue;
        /* Re-declared inside the write — a fresh reading, which is the whole
           point of the fix — or received as a callback parameter. */
        const shadowed =
          new RegExp(`\\bconst ${name}\\b`).test(block) ||
          new RegExp(`[(,]\\s*${name}\\s*[),]`).test(block);
        if (shadowed) continue;
        if (new RegExp(`\\b${name}\\b`).test(block)) {
          problems.push(
            `${f} › ${hook}: '${name}' được đọc lúc RENDER rồi dùng bên trong ${what} — một lệnh ghi ` +
              'phải hỏi hôm nay là ngày nào vào LÚC NÓ CHẠY. App bị để mở qua nửa đêm là chuyện ' +
              'thường, và khi đó bản ghi rơi vào hôm qua (hoặc xoá nhầm dòng của hôm qua) mà không ' +
              'có lỗi nào được ném ra',
          );
        }
      }
    }
  }
}

if (scannedMutations < 10) {
  problems.push(`chỉ quét được ${scannedMutations} khối useMutation — bộ quét hỏng, đừng tin kết quả`);
}

for (const [k, why] of EXEMPT) {
  if (!why || why.length < 20) problems.push(`'${k}' được miễn mà lý do quá sơ sài`);
}

/* ── and the three that were wrong stay right ── */
{
  const water = strip(readFileSync(path.join(NATIVE, 'src/hooks/use-water.ts'), 'utf8'));
  if (!/date: today\(\)/.test(water)) {
    problems.push("use-water.ts không còn ghi `date: today()` trong thân hàm mutate — cốc nước sau nửa đêm sẽ rơi vào hôm qua");
  }
  const lib = strip(readFileSync(path.join(NATIVE, 'src/hooks/use-library.ts'), 'utf8'));
  const toggle = lib.slice(lib.indexOf('useToggleSupplement'));
  if (!/mutationFn:[\s\S]{0,400}const dateStr = today\(\);/.test(toggle)) {
    problems.push('useToggleSupplement không đọc ngày bên trong mutationFn — bỏ tick sau nửa đêm sẽ xoá nhầm ngày');
  }
  const td = strip(readFileSync(path.join(NATIVE, 'src/hooks/useTodayData.ts'), 'utf8'));
  if (!/todayKeys\(user\?\.id, today\(\)\)/.test(td)) {
    problems.push(
      'useInvalidateToday không đọc ngày lúc chạy — lần ghi đầu sau nửa đêm sẽ làm mới khoá của HÔM QUA ' +
        'và màn hình đứng nguyên như chưa ghi gì',
    );
  }
}

if (problems.length) {
  console.log('ngày của lệnh ghi CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
  process.exit(1);
}

console.log(
  `ngày ghi OK — quét ${scannedMutations} khối useMutation và ${scannedBindings} biến ngày đọc lúc render: ` +
    'không lệnh ghi nào còn đọc ngày của lúc VẼ MÀN HÌNH thay vì lúc bấm. Truy vấn thì vẫn được phép ' +
    'chụp ngày ở thân hook — khoá truy vấn phải đứng yên suốt một ngày và React Query tự đổi khoá ở lần ' +
    'render sau — nên luật chỉ nhắm vào lệnh ghi và các closure hook trả về. Ba chỗ từng sai vẫn đúng: ' +
    'cốc nước mang ngày của lúc bấm (bản cũ ghi vào hôm qua trong khi trường `at` lại đúng hôm nay, ' +
    'tức một dòng nói hai ngày về chính nó), bỏ tick thực phẩm bổ sung xoá đúng cửa sổ ngày, và lần ghi ' +
    'đầu sau nửa đêm làm mới khoá của HÔM NAY',
);
