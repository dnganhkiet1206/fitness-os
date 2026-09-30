/**
 * "N bài mới" (#160): bài nào bị giữ lại khi người đọc đang ở giữa feed.
 *
 * CHẠY THẬT `heldAbove` và `atTop` đọc từ `src/lib/feed-hold.ts`, qua các ca có
 * đáp án cụ thể — đúng các câu mà luật trong tệp ấy trả lời:
 *   · chỉ bài chưa thấy ĐỨNG TRƯỚC bài đã thấy đầu tiên;
 *   · bài của chính mình không bao giờ bị giữ;
 *   · chưa thấy gì, hay mất hết điểm neo → không giữ gì (không giấu cả feed);
 *   · bài chưa thấy đứng SAU (trang cũ hơn) không phải bài mới;
 *   · kéo-để-làm-mới (y âm) và dừng sát đỉnh vẫn là "ở đầu".
 * Rồi các bản hỏng phải bị bắt.
 *
 * Cộng phần nối: feed Cộng đồng vẽ `hold.posts` (không phải `feed.data`), nối
 * `onScroll` của hook vào `Screen`, và viên chỉ hiện khi có bài bị giữ; và
 * `focusManager` nghe `AppState` — không thì trên iOS không có lượt tải lại
 * ngầm nào mang bài mới tới.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

const S = (...x) => new Set(x);
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const CASES = [
  ['hai bài mới trên bài đã thấy → giữ cả hai, theo thứ tự', (m) => eq(m.heldAbove(['n2', 'n1', 'a', 'b'], S('a', 'b'), S()), ['n2', 'n1'])],
  ['không có gì mới → không giữ', (m) => eq(m.heldAbove(['a', 'b'], S('a', 'b'), S()), [])],
  ['bài của chính mình không bị giữ, bài người khác cạnh nó vẫn bị', (m) => eq(m.heldAbove(['mine', 'n1', 'a'], S('a'), S('mine')), ['n1'])],
  ['chưa thấy gì (lần tải đầu) → không giữ', (m) => eq(m.heldAbove(['a', 'b'], S(), S()), [])],
  ['không bài đã thấy nào còn trong feed → không giữ (không giấu cả feed)', (m) => eq(m.heldAbove(['x', 'y'], S('a'), S()), [])],
  ['bài chưa thấy đứng SAU bài đã thấy (trang cũ hơn) không bị giữ', (m) => eq(m.heldAbove(['a', 'old'], S('a'), S()), [])],
  ['bài đã thấy bị xoá ở đầu: neo vào bài đã thấy kế tiếp', (m) => eq(m.heldAbove(['n1', 'b'], S('a', 'b'), S()), ['n1'])],
  ['kéo-để-làm-mới (y âm) và dừng sát đỉnh là "ở đầu"; giữa feed thì không', (m) => m.atTop(-60) && m.atTop(0) && m.atTop(80) && !m.atTop(400)],
];

const out = mkdtempSync(path.join(tmpdir(), 'feed-hold-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/feed-hold.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'feed-hold.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };
  const runAll = (m) => CASES.filter(([, fn]) => {
    try {
      return !fn(m);
    } catch {
      return true;
    }
  }).map(([name]) => name);
  problems.push(...runAll(load(compiled)));

  const MUTANTS = [
    ['giữ cả bài của chính mình', /\.filter\(\(id\) => !mine\.has\(id\)\)/, ''],
    ['mất neo thì giữ cả feed', /if \(anchor < 0\)\s*return \[\];/, 'if (anchor < 0) return ids.filter((id) => !mine.has(id));'],
    ['giữ mọi bài chưa thấy, kể cả trang cũ', /ids\.slice\(0, anchor\)/, 'ids.filter((id) => !seen.has(id))'],
    ['"ở đầu" chỉ khi y === 0', /y < NEAR_TOP|y < exports\.NEAR_TOP/, 'y === 0'],
  ];
  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!runAll(load(compiled.replace(re, to))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const screen = readFileSync(path.join(NATIVE, 'src/app/(tabs)/community.tsx'), 'utf8');
const WIRING = [
  [/useFeedHold\(tab, feed\.data\)/, 'không còn gọi `useFeedHold(tab, feed.data)`'],
  /* Từ #20 `onScroll` của Screen là một hàm gọi CẢ `hold.onScroll(e)` lẫn tải
     thêm — chấp nhận cả hai dạng, miễn `hold.onScroll` nhận được sự kiện. */
  [/onScroll=\{hold\.onScroll\}|onScroll=\{\(e\) => \{\s*hold\.onScroll\(e\);/, '`Screen` không đưa sự kiện cuộn tới `hold.onScroll` — hook không bao giờ biết người đọc đang ở đâu, nên không bao giờ giữ'],
  [/\{hold\.posts\.map\(/, 'feed vẽ thứ khác `hold.posts` — bài bị giữ vẫn chèn lên và đẩy bài đang đọc'],
  [/overlay=\{hold\.held\.length \? <NewPostsPill posts=\{hold\.held\} onPress=\{hold\.release\} \/> : null\}/, 'viên "N bài mới" không còn nối vào `hold.held`/`hold.release`'],
];
for (const [re, msg] of WIRING) if (!re.test(screen)) problems.push(`(tabs)/community.tsx: ${msg}`);
/* Không có lượt tải lại ngầm nào thì không có bài mới nào để giữ: trên iOS,
   lượt ấy chỉ tới khi app trở lại từ nền được nối vào `focusManager`. */
const qc = readFileSync(path.join(NATIVE, 'src/lib/query-client.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (!/focusManager\.setEventListener\(\(handleFocus\) => \{[\s\S]*?AppState\.addEventListener\('change', \(state\) => handleFocus\(state === 'active'\)\)/.test(qc)) {
  problems.push('query-client.ts: `focusManager` không còn nối vào AppState — trên iOS feed không bao giờ tải lại khi app trở lại từ nền (mặc định của TanStack chỉ nghe `visibilitychange` của window, thứ React Native không có)');
}
if (/\(feed\.data \?\? \[\]\)\.map\(/.test(screen)) problems.push('(tabs)/community.tsx: còn một chỗ vẽ thẳng `feed.data` — nó bỏ qua phần giữ');

if (problems.length) {
  console.error('"N bài mới" CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `"N bài mới" OK — ${CASES.length} ca CHẠY THẬT heldAbove/atTop: chỉ bài chưa thấy đứng trước bài đã thấy đầu tiên, ` +
    'không bao giờ bài của chính mình, không giữ khi chưa thấy gì hay mất neo, trang cũ không phải bài mới, kéo-để-làm-mới ' +
    'là "ở đầu". 4 bản hỏng đều bị bắt. Feed Cộng đồng vẽ hold.posts, nối onScroll và viên vào hook; focusManager nghe AppState để có lượt tải lại ngầm trên iOS',
);
