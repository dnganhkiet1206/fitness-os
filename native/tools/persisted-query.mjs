/**
 * That nothing in the query cache stops being itself on the way to disk.
 *
 * ── the crash ──
 *
 *   undefined is not a function
 *   use-daily-quests.ts:132  →  claimed.has(...)
 *
 * `use-mascot-room.ts` returned `claimed: new Set(rows.map(...))`. This app
 * wraps the router in `PersistQueryClientProvider` and passes NO
 * `shouldDehydrateQuery`, so every query's data goes through `JSON.stringify`
 * on its way to AsyncStorage. A `Set` does not survive that: it serialises to
 * `{}`, hydrates back as an empty object, and the first `.has()` after a cold
 * launch throws — inside `Mascot`, on the first screen.
 *
 * ── why it took this long to fire ──
 *
 * The query always FAILED before. The old Supabase project had no
 * `mascot_transactions` table, so `wallet` was undefined and `?? new Set()`
 * quietly covered it. Pointing the app at a project that has the table made the
 * query succeed, and the Set reached the disk for the first time.
 *
 * That is the shape worth remembering: this was not a new bug. It was a bug
 * that could not happen while a table was missing, and fixing the backend
 * uncovered it.
 *
 * ── and nothing could have caught it ──
 *
 * `tools/live.mjs` boots the app once, with an empty cache, and never relaunches
 * — so the hydrate path it dies on is never executed. Same structural blindness
 * as the `GestureHandlerRootView` crash. Rules are what cover those.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (t) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/(^|\s)\/\/.*$/, '$1'))
    .join('\n');

const problems = [];

/* The premise. If a filter ever appears, this rule is judging more than it
   should and should be narrowed rather than left to cry wolf. */
const layout = strip(read('src/app/_layout.tsx'));
if (!/PersistQueryClientProvider/.test(layout)) {
  problems.push('_layout.tsx: không còn persist cache — luật này đang canh một tiền đề đã hết đúng, hãy xem lại nó');
}
const filtered = /shouldDehydrateQuery/.test(layout);

const walk = (d) =>
  readdirSync(d).flatMap((e) => {
    const p = path.join(d, e);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });

/* Only what is RETURNED, and only where it SURVIVES as a Set.

   A `Set` built inside a queryFn and never handed back never reaches the
   serialiser. Neither does one that is spread straight back into an array —
   `[...new Set(xs)]` and `Array.from(new Set(xs))` are the ordinary way to
   de-duplicate, and they produce a plain array. The first draft of this rule
   flagged both, which would have banned a correct idiom to prevent a bug it
   cannot cause; the reverse test is what caught that. */
const SAFE = /(\[\s*\.\.\.|Array\.from\s*\(\s*)$/;
const BAD = /\bnew (Set|Map)\s*\(/g;

for (const abs of walk(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, abs);
  const code = strip(read(rel));
  if (!/useQuery\s*[(<]/.test(code)) continue;

  for (const m of code.matchAll(/queryFn:\s*(async\s*)?\(\s*\)\s*=>/g)) {
    /* From the queryFn to the end of the hook call. Bounded by the closing
       `});` at the same indentation, which is how every one of these is
       written in this repository. */
    const rest = code.slice(m.index);
    const end = rest.search(/\n\s{0,4}\}\);/);
    const body = end < 0 ? rest : rest.slice(0, end);

    const ret = body.lastIndexOf('return {');
    if (ret < 0) continue;
    const returned = body.slice(ret);
    BAD.lastIndex = 0;
    let hit = null;
    for (const c of returned.matchAll(BAD)) {
      if (!SAFE.test(returned.slice(Math.max(0, c.index - 14), c.index))) {
        hit = c;
        break;
      }
    }
    if (hit) {
      const line = code.slice(0, m.index + ret + hit.index).split('\n').length;
      problems.push(
        `${rel}:${line}: queryFn trả về \`new ${hit[1]}(\` — cache của app này được PERSIST xuống ` +
          'AsyncStorage, và JSON.stringify biến Set/Map thành `{}`. Lần khởi động sau, `.has(...)` ' +
          'trên nó là "undefined is not a function". Trả về mảng, rồi dựng Set ở CHỖ DÙNG',
      );
    }
  }
}

/* ── đọc lại thì phải phòng thủ ──

   Bump `CACHE_BUSTER` dọn được dữ liệu cũ MỘT LẦN. Nó không làm cho lần đọc trở
   nên an toàn: `{}` không phải `undefined`, nên `?? []` đi thẳng qua nó và
   `new Set({})` ném "iterator method is not callable" — đúng chỗ, đúng màn
   hình đầu tiên, như đã xảy ra. Nửa còn lại là đọc qua một hàm kiểm hình dạng.

   Đây là luật repo này đã ghi hai lần rồi, cho `personal-model` và cho ngân
   sách xuất hiện: một giá trị lưu HỎNG không được phép thành một giá trị đang
   chạy. */
for (const abs of walk(path.join(NATIVE, 'src'))) {
  const rel = path.relative(NATIVE, abs);
  if (rel === 'src/hooks/use-mascot-room.ts') continue;
  const code = strip(read(rel));
  for (const m of code.matchAll(/wallet\??\.\s*claimed\b/g)) {
    const before = code.slice(Math.max(0, m.index - 40), m.index);
    if (!/claimedList\s*\($/.test(before.trimEnd() + '')) {
      /* Trong mảng deps của useMemo thì chỉ là một tham chiếu, không phải một
         lần đọc giá trị — nó không thể ném. */
      const after = code.slice(m.index, m.index + 40);
      if (/^wallet\??\.claimed\]/.test(after)) continue;
      if (/claimedList\(/.test(code.slice(Math.max(0, m.index - 60), m.index))) continue;
      const line = code.slice(0, m.index).split('\n').length;
      problems.push(
        `${rel}:${line}: đọc \`wallet.claimed\` trực tiếp — giá trị này tới từ cache trên đĩa, nơi ` +
          'một bản cũ đã ghi xuống một Set đã serialize thành `{}`. Đi qua `claimedList()`',
      );
    }
  }
}

if (problems.length) {
  console.log('dữ liệu truy vấn CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'dữ liệu truy vấn OK — không queryFn nào trả về Set/Map. Cả cache được persist xuống ' +
    `AsyncStorage${filtered ? ' (có lọc shouldDehydrateQuery)' : ' và KHÔNG lọc query nào'}, nên mọi ` +
    'thứ một queryFn trả về đều đi qua JSON.stringify — thứ biến Set thành `{}` và biến `.has(...)` ' +
    'ở lần khởi động sau thành một cú ném. Lỗi đó đã có thật: nó nằm im suốt nhiều tháng vì truy ' +
    'vấn luôn HỎNG (project cũ không có bảng mascot_transactions, nên wallet là undefined và ' +
    '`?? new Set()` che mất), rồi nổ ngay khi backend được sửa đúng. Bộ chạy web không thể bắt: nó ' +
    'khởi động app đúng một lần với cache rỗng, nên đường hydrate mà app chết trên đó không bao giờ chạy',
);
