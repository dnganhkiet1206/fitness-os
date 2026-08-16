/**
 * A focus effect runs on focus, not on every render.
 *
 * ── the bug this was written for ──
 *
 * `useFocusEffect` re-runs its effect whenever the callback it was given
 * changes identity, for as long as the screen is focused. That is by design —
 * it is how the effect picks up new inputs — and it makes anything unmemoised
 * in the dependency list a per-render loop.
 *
 * Today had one:
 *
 *     const { checkAndGrant } = useCheckAwards();
 *     useFocusEffect(useCallback(() => { … checkAndGrant() … },
 *                                [awardsReady, checkAndGrant]));
 *
 * and `checkAndGrant` was a bare `async () => {}` in a hook body — a new
 * function every render. The dashboard re-renders constantly: a query settling,
 * the mascot's held emotion expiring, a quest ticking, the wallet arriving. Each
 * of those started another full award pass, which is four Supabase reads.
 *
 * The `awardCheckInFlight` ref beside it looks like the guard and is not: it
 * stops two passes *overlapping*, so the reads never pile up — they just never
 * stop either. Nothing errors, nothing is slow enough to notice on a laptop,
 * and the bill is paid in somebody's battery and mobile data.
 *
 * ── what is checked ──
 *
 * Every identifier a `useFocusEffect` depends on has to be something that holds
 * its identity: a primitive, a ref, a `useCallback`/`useMemo` binding, or a
 * value the file can show is stable. A function returned by a hook and declared
 * as a plain arrow is the case that bit, and it is invisible at the call site —
 * `(tabs)/index.tsx` reads perfectly well; the fault is one file away.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], {
  cwd: NATIVE,
  encoding: 'utf8',
})
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

/** Everything each file exports as a memoised binding, so a caller can rely on it. */
const memoised = new Map();
/** …and everything it exports as a plain arrow, which cannot be relied on. */
const unstable = new Map();

for (const f of files) {
  let src;
  try {
    src = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  } catch {
    continue;
  }
  for (const m of src.matchAll(/const (\w+) = useCallback\(/g)) memoised.set(m[1], f);
  for (const m of src.matchAll(/const (\w+) = useMemo\(/g)) memoised.set(m[1], f);
  /* A plain arrow assigned in a hook body — `const x = async () => {` or
     `const x = () => {`. Two-space indent, so this is the hook's own body and
     not something nested inside a callback that already re-creates it. */
  for (const m of src.matchAll(/^ {2}const (\w+) = (?:async )?\([^)]*\) => \{/gm)) {
    if (!memoised.has(m[1])) unstable.set(m[1], f);
  }
}

let checked = 0;
for (const f of files) {
  let src;
  try {
    src = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  } catch {
    continue;
  }
  if (!src.includes('useFocusEffect')) continue;

  /* Each `useFocusEffect(useCallback(fn, [ … ]))` — the dependency list is what
     decides how often the effect runs. */
  for (const m of src.matchAll(/useFocusEffect\(\s*useCallback\([\s\S]*?\}, \[([^\]]*)\]\)/g)) {
    checked++;
    const deps = m[1]
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean);
    for (const dep of deps) {
      /* Only bare identifiers can be looked up; `a.b` and `a?.b` are member
         reads whose stability belongs to the object, and those are checked by
         whether the object itself is stable. */
      const name = dep.split(/[.?]/)[0];
      if (memoised.has(name)) continue;
      if (!unstable.has(name)) continue;
      problems.push(
        `${f}: useFocusEffect phụ thuộc '${name}', mà '${name}' được khai báo trong ` +
          `${unstable.get(name)} như một arrow thường — danh tính mới mỗi render. ` +
          'useFocusEffect chạy lại effect mỗi khi callback đổi danh tính, nên nó chạy lại trên ' +
          'MỌI render chứ không phải mỗi lần focus. Cờ in-flight cạnh đó chỉ chặn chạy chồng, ' +
          'không chặn chạy lặp — nên đây là một vòng truy vấn không dừng, không ném lỗi và ' +
          'không chậm đủ để ai nhận ra trên máy tính (bọc useCallback ở nơi khai báo)',
      );
    }
  }
}

if (checked < 2) {
  problems.push(`chỉ tìm thấy ${checked} useFocusEffect có danh sách phụ thuộc — bộ quét hỏng`);
}

/* ── and the one that was wrong stays memoised at its source ── */
{
  const src = strip(readFileSync(path.join(NATIVE, 'src/hooks/use-extras.ts'), 'utf8'));
  if (!/const checkAndGrant = useCallback\(/.test(src)) {
    problems.push(
      'use-extras.ts: checkAndGrant không còn được useCallback bọc — Today liệt nó làm dependency ' +
        'của useFocusEffect, nên một arrow thường ở đây là bốn truy vấn Supabase trên mỗi render ' +
        'của dashboard',
    );
  }
}

if (problems.length) {
  console.log('hiệu ứng focus CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `hiệu ứng focus OK — kiểm ${checked} useFocusEffect có danh sách phụ thuộc, ${memoised.size} binding ` +
    `được memo và ${unstable.size} arrow thường trong thân hook: không hiệu ứng focus nào phụ thuộc vào ` +
    'một hàm đổi danh tính mỗi render. Bản đã ship có đúng một — checkAndGrant — và nó khiến bộ trao huy ' +
    'hiệu chạy lại (bốn truy vấn Supabase) trên MỌI render của Today, trong khi cờ in-flight cạnh đó chỉ ' +
    'chặn chạy chồng chứ không chặn chạy lặp',
);
