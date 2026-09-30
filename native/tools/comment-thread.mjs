/**
 * Bình luận một tầng và `@handle` (#30) — phía app vẽ đúng thứ server quyết.
 *
 * CHẠY THẬT `mentionParts`, `threadComments`, `replyPrefix` đọc từ
 * `src/lib/comment-thread.ts`, qua các ca có đáp án cụ thể:
 *   · `@handle` thành liên kết CHỈ khi server đã xác nhận (có trong `known`),
 *     không phân biệt hoa thường, không nuốt dấu chấm cuối câu — cùng mẫu với
 *     trigger `community_notify_thread`;
 *   · handle trông hợp lệ mà server không xác nhận thì là CHỮ;
 *   · luồng: gốc theo thứ tự đến, câu trả lời theo thứ tự đến dưới gốc; câu
 *     trả lời mà gốc không có trong danh sách đứng một mình, không biến mất.
 * Rồi các bản hỏng phải bị bắt. Cộng phần nối: màn bài vẽ qua `threadComments`
 * và `mentionParts`, hook đọc `parent_id` và bảng mentions, và gửi `parent_id`.
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

const known = new Map([['linh.pham', 'L'], ['kiet', 'K']]);
const parts = (m, body) => JSON.stringify(m.mentionParts(body, known).map((p) => (p.userId ? [p.text, p.userId] : p.text)));
const c = (id, parent_id, created_at) => ({ id, parent_id, created_at });
const shape = (m, list) => JSON.stringify(m.threadComments(list).map((t) => [t.root.id, t.replies.map((r) => r.id)]));

const CASES = [
  ['handle đã xác nhận thành liên kết, giữ nguyên chữ quanh nó', (m) => parts(m, 'Đúng rồi @linh.pham, 26kg') === JSON.stringify(['Đúng rồi ', ['@linh.pham', 'L'], ', 26kg'])],
  ['không phân biệt hoa thường (server hạ chữ thường)', (m) => parts(m, '@Linh.Pham ơi') === JSON.stringify([['@Linh.Pham', 'L'], ' ơi'])],
  ['dấu chấm cuối câu không thuộc handle', (m) => parts(m, 'Cảm ơn @kiet.') === JSON.stringify(['Cảm ơn ', ['@kiet', 'K'], '.'])],
  ['handle server không xác nhận là CHỮ, không phải liên kết', (m) => parts(m, 'Rủ @ai.khong nhé') === JSON.stringify(['Rủ @ai.khong nhé'])],
  ['không có @ nào thì một đoạn chữ', (m) => parts(m, 'Hay!') === JSON.stringify(['Hay!'])],
  ['luồng: gốc theo thứ tự đến, câu trả lời dưới gốc theo thứ tự đến', (m) =>
    shape(m, [c('r2', 'a', '03'), c('b', null, '02'), c('a', null, '01'), c('r1', 'a', '04'), c('rb', 'b', '05')]) === JSON.stringify([['a', ['r2', 'r1']], ['b', ['rb']]])],
  ['câu trả lời mà gốc không có trong danh sách đứng một mình, không biến mất', (m) =>
    shape(m, [c('x', 'gone', '01'), c('a', null, '02')]) === JSON.stringify([['x', []], ['a', []]])],
  ['chữ điền sẵn khi trả lời là "@handle "; không handle thì rỗng', (m) => m.replyPrefix('linh.pham') === '@linh.pham ' && m.replyPrefix(null) === ''],
];

const out = mkdtempSync(path.join(tmpdir(), 'comment-thread-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/comment-thread.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'comment-thread.js'), 'utf8');
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
    ['mọi @handle đều thành liên kết, kể cả thứ server không xác nhận', /if \(!userId \|\| m\.index === undefined\)\s*continue;/, "if (m.index === undefined) continue;"],
    ['không hạ chữ thường khi tra', /known\.get\(m\[1\]\.toLowerCase\(\)\)/, 'known.get(m[1])'],
    ['dấu chấm cuối câu tính vào handle', /\[a-zA-Z0-9_\.\]\*\[a-zA-Z0-9_\]/, '[a-zA-Z0-9_.]+'],
    ['câu trả lời mồ côi bị giấu', /if \(c\.parent_id && ids\.has\(c\.parent_id\)\)\s*continue;/, 'if (c.parent_id) continue;'],
    ['không sắp theo thứ tự đến', /const byTime = \[\.\.\.list\]\.sort\([^;]*\);/, 'const byTime = [...list];'],
  ];
  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!runAll(load(compiled.replace(re, to))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const screen = readFileSync(path.join(NATIVE, 'src/app/community-post.tsx'), 'utf8');
const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-community.ts'), 'utf8');
const WIRING = [
  [screen, /threadComments\(comments\.data \?\? \[\]\)/, 'community-post.tsx không vẽ bình luận qua `threadComments` — câu trả lời không nằm dưới gốc'],
  [screen, /mentionParts\(comment\.body, new Map\(comment\.mentions\)\)/, 'community-post.tsx không vẽ thân qua `mentionParts` với lượt nhắc server đã xác nhận'],
  [screen, /parentId: replyTo\?\.id \?\? null/, 'community-post.tsx không gửi `parentId` của bình luận đang được trả lời'],
  [hook, /\.select\('id, post_id, parent_id, author_id, body, created_at'\)/, 'useComments không đọc `parent_id`'],
  [hook, /\.from\('community_comment_mentions'\)/, 'useComments không đọc bảng lượt nhắc — mọi @ sẽ là chữ'],
  [hook, /parent_id: parentId/, 'useAddComment không gửi `parent_id`'],
];
for (const [src, re, msg] of WIRING) if (!re.test(src)) problems.push(msg);

if (problems.length) {
  console.error('bình luận một tầng / @handle CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `bình luận một tầng / @handle OK — ${CASES.length} ca CHẠY THẬT mentionParts/threadComments/replyPrefix: @ chỉ thành liên kết ` +
    'khi server đã xác nhận, không phân biệt hoa thường, không nuốt dấu chấm cuối câu (cùng mẫu với trigger), luồng một tầng ' +
    `theo thứ tự đến và câu trả lời mồ côi không biến mất. ${5} bản hỏng đều bị bắt. Màn bài và hook nối đúng`,
);
