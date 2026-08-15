/**
 * Every key the app invalidates belongs to a query somebody actually runs.
 *
 * ── the bug this was written for ──
 *
 * After a Health sync, `use-health-sync.ts` refreshed the sleep screen with:
 *
 *     queryClient.invalidateQueries({ queryKey: ['sleep_logs', user?.id] });
 *
 * No query in the app is keyed on `sleep_logs`. That is the name of the
 * **table**; the query is `['sleep_history', userId, days]`. So the call
 * matched zero observers and did nothing at all.
 *
 * The comment directly above it read: *"Without these the sleep screen keeps
 * showing last night as unlogged until the app restarts."* The comment was
 * accurate. It was describing a bug that the line beneath it had not fixed.
 *
 * ── why this needs a tool and not care ──
 *
 * `invalidateQueries` is a filter, not a lookup. Matching nothing is a
 * perfectly ordinary outcome — it is what happens when the screen is not
 * mounted — so there is no error, no warning, and no return value anybody
 * checks. A typo, a renamed query, or a key named after the table instead of
 * the query all produce exactly the same silence as success.
 *
 * The symptom is always the same and always looks like something else: stale
 * data on one screen until the app is restarted. That reads as a caching
 * problem, or a slow network, or the write not having worked — anything except
 * a string that matches nothing.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
  { cwd: NATIVE, encoding: 'utf8' },
)
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));

/** First element of every `queryKey: ['name', …]` that belongs to a real query. */
const defined = new Set();
/** Every first element that is only ever invalidated, with where it happens. */
const invalidated = new Map();

for (const f of files) {
  let src;
  try {
    src = strip(readFileSync(path.join(NATIVE, f), 'utf8'));
  } catch {
    continue;
  }

  /*
    An invalidation names its key inside `invalidateQueries({ queryKey: [...] })`
    or `removeQueries`/`cancelQueries`/`refetchQueries`. Everything else that
    writes `queryKey:` is declaring one — `useQuery`, `useInfiniteQuery`,
    `setQueryData`, `getQueryData`, `useMutation`'s `mutationKey` aside.

    Rather than parse, each match is classified by what precedes it within a
    short window, which is enough because these calls are written on one or two
    lines throughout this codebase.
  */
  for (const m of src.matchAll(/queryKey:\s*\[\s*'([\w-]+)'/g)) {
    const before = src.slice(Math.max(0, m.index - 120), m.index);
    const isInvalidation = /(invalidate|remove|cancel|refetch)Queries\s*\(\s*\{?\s*$/.test(before);
    if (isInvalidation) {
      if (!invalidated.has(m[1])) invalidated.set(m[1], `${f}`);
    } else {
      defined.add(m[1]);
    }
  }
  /* `setQueryData(['name', …])` and `getQueryData(['name', …])` also establish
     that a key is real — the optimistic paths write through them. */
  for (const m of src.matchAll(/(?:set|get)QueryData\(\s*\[\s*'([\w-]+)'/g)) {
    defined.add(m[1]);
  }
}

/*
  There was a third pattern here — anything shaped `['name', userId]` counted as
  a definition, meant to pick up the shared list in `lib/today-keys.ts`.

  It was wrong twice over. `todayKeys` is a list of keys to *invalidate*, so it
  defines nothing; and the pattern matched the invalidation calls themselves,
  so **every** invalidated key registered as defined and the rule could not
  fail. Verified by putting the shipped `sleep_logs` typo back: it passed.

  A check that classifies its own subject as its own evidence is not a check.
  Only `useQuery`-style declarations and `set/getQueryData` count now.
*/

if (defined.size < 20) {
  problems.push(`chỉ đọc được ${defined.size} khoá truy vấn — bộ quét hỏng, đừng tin kết quả`);
}
if (invalidated.size < 5) {
  problems.push(`chỉ đọc được ${invalidated.size} lệnh invalidate — bộ quét hỏng, đừng tin kết quả`);
}

for (const [key, where] of [...invalidated].sort()) {
  if (!defined.has(key)) {
    problems.push(
      `${where}: invalidate khoá '${key}' nhưng không truy vấn nào dùng khoá đó — ` +
        'lệnh này khớp 0 observer và không làm gì cả. invalidateQueries là một bộ lọc, ' +
        'khớp rỗng là chuyện bình thường nên không có lỗi nào được báo; ' +
        'triệu chứng là màn hình giữ số cũ cho tới khi khởi động lại app, ' +
        'và nó trông y như lỗi mạng chứ không giống một chuỗi gõ sai',
    );
  }
}

if (problems.length) {
  console.log('khoá invalidate:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `khoá invalidate OK — ${invalidated.size} khoá được invalidate đều trỏ tới truy vấn có thật ` +
    `trong ${defined.size} khoá đang dùng; bản đã ship invalidate 'sleep_logs' (TÊN BẢNG) trong khi ` +
    "truy vấn là 'sleep_history', nên lệnh đó khớp 0 observer — và chú thích ngay bên trên nó mô tả " +
    'đúng cái lỗi mà nó không sửa được: màn giấc ngủ vẫn hiện đêm qua là chưa ghi cho tới khi ' +
    'khởi động lại app',
);
