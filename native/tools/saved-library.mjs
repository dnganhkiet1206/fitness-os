/**
 * Thư viện Đã lưu (#10) — CHẠY THẬT phần chọn và sắp, và canh giả định thiết kế.
 *
 *     node tools/saved-library.mjs
 *
 * ── hai thứ nó canh ──
 *
 *   1. HÀNH VI (chạy thật `lib/saved-library.ts`): thứ tự là thứ tự LƯU, không
 *      phải lúc đăng; bài bị ẩn của người khác không vào thư viện, bài bị ẩn
 *      của chính mình thì có (như policy đọc bài); dòng lạ không nằm trong danh
 *      sách lưu bị bỏ; một id lưu hai lần không sinh hai thẻ; bộ lọc đúng loại.
 *
 *   2. GIẢ ĐỊNH mà thư viện dựa vào. Hook đặt key dưới tiền tố
 *      `community_user_posts` để khỏi sửa thêm dòng nào trong tệp của A:
 *      `patchPost`, xoá bài, chặn người, xoá mọi bài của mình đều đã làm mới
 *      tiền tố ấy. Nếu một ngày một trong số đó thôi làm mới nó, thư viện sẽ
 *      giữ một bài đã xoá hay một người đã chặn — đúng "thẻ hỏng" mà #10 cấm —
 *      và không có gì báo. Nên bước này ĐỌC các hook ấy và đòi chúng vẫn làm.
 *
 * Và fixture: thế giới giả phải có một bài Workout và một bài Recipe đã lưu,
 * lưu theo thứ tự NGƯỢC với thứ tự đăng — nếu không, một thư viện xếp nhầm
 * theo lúc đăng vẫn trông đúng trên ảnh chụp.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const problems = [];
let CASES = 0;
const note = (label, ok, why) => {
  CASES++;
  if (!ok) problems.push(`${label} — ${why}`);
};

/* ── 1 · hành vi: biên dịch rồi chạy ── */
const out = mkdtempSync(path.join(tmpdir(), 'saved-library-'));
let mod;
try {
  execFileSync('npx', ['tsc', 'src/lib/saved-library.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'], { cwd: NATIVE, stdio: 'pipe' });
  mod = await import(path.join(out, 'saved-library.js'));
} catch (e) {
  console.error('thư viện Đã lưu CÓ LỖI:\n');
  console.error(`  • không biên dịch được \`lib/saved-library.ts\`: ${e.message.split('\n')[0]}`);
  rmSync(out, { recursive: true, force: true });
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
const { selectSaved, filterSaved } = mod.default ?? mod;

const ME = 'me';
const post = (id, o = {}) => ({ id, author_id: 'other', hidden: false, kind: 'workout', ...o });
const names = (xs) => xs.map((x) => x.id).join(',');

/* server trả theo thứ tự tuỳ ý — thư viện phải xếp lại theo lúc LƯU */
let r = selectSaved(['c', 'a', 'b'], [post('a'), post('b'), post('c')], ME);
note('thứ tự là thứ tự LƯU, không phải thứ tự server trả', names(r) === 'c,a,b', names(r));
r = selectSaved(['a', 'b'], [post('a'), post('b'), post('x')], ME);
note('bài không nằm trong danh sách lưu bị bỏ (một bộ lọc sai phía server không lọt vào)', names(r) === 'a,b', names(r));
r = selectSaved(['a', 'h'], [post('a'), post('h', { hidden: true })], ME);
note('bài BỊ ẨN của người khác không vào thư viện', names(r) === 'a', names(r));
r = selectSaved(['mine'], [post('mine', { hidden: true, author_id: ME })], ME);
note('bài bị ẩn của CHÍNH MÌNH vẫn ở lại (như policy đọc bài: tác giả cần biết)', names(r) === 'mine', names(r));
r = selectSaved(['a', 'b', 'a'], [post('a'), post('b'), post('a')], ME);
note('một id lưu hai lần (cache cũ) không sinh hai thẻ, và đứng ở lần lưu MỚI nhất', names(r) === 'a,b', names(r));
r = selectSaved([], [post('a')], ME);
note('chưa lưu gì thì rỗng, dù server trả gì', r.length === 0, names(r));
let err = null;
try { selectSaved(['a'], [null, post('a')], ME); } catch (e) { err = e; }
note('một dòng rác (null) không làm ném', !err, err?.message ?? '');

const mixed = [post('w', { kind: 'workout' }), post('r', { kind: 'recipe' }), post('p', { kind: 'progress' })];
note('lọc Buổi tập: chỉ workout', names(filterSaved(mixed, 'workout')) === 'w', names(filterSaved(mixed, 'workout')));
note('lọc Công thức: chỉ recipe', names(filterSaved(mixed, 'recipe')) === 'r', names(filterSaved(mixed, 'recipe')));
note('Tất cả: gồm cả bài Progress, đúng thứ tự', names(filterSaved(mixed, 'all')) === 'w,r,p', names(filterSaved(mixed, 'all')));

/* ── 2 · giả định thiết kế ── */
const hook = read('src/hooks/use-community-saved.ts');
const community = read('src/hooks/use-community.ts');
note('hook dùng CHÍNH `hydrate` của feed, không một bản chép',
  /import \{[^}]*\bhydrate\b[^}]*\} from '@\/hooks\/use-community'/.test(hook) && !/function hydrate/.test(hook),
  '`use-community-saved.ts` phải import `hydrate` từ `use-community`, không tự định nghĩa');
note('key của thư viện nằm dưới tiền tố `community_user_posts`',
  /queryKey: \['community_user_posts',/.test(hook),
  'không còn dưới tiền tố ấy thì xoá bài / chặn người không làm mới thư viện nữa');
note('thư viện luôn đọc lại khi mở (`refetchOnMount: \'always\'`)', /refetchOnMount: 'always'/.test(hook),
  'lưu ở feed rồi bấm "Xem thư viện" ngay thì bản cache còn tươi mà thiếu đúng bài vừa lưu');
const body = (name) => {
  const i = community.indexOf(`export function ${name}(`);
  if (i < 0) return null;
  const j = community.indexOf('\nexport ', i + 10);
  return community.slice(i, j < 0 ? undefined : j);
};
for (const hookName of ['useDeletePost', 'useBlock', 'useDeleteAllMyPosts']) {
  const b = body(hookName);
  note(`\`${hookName}\` vẫn làm mới \`community_user_posts\``,
    !!b && /invalidateQueries\(\{ queryKey: \['community_user_posts'\] \}\)/.test(b),
    b ? 'không còn làm mới nó thì thư viện giữ lại bài đã xoá / người đã chặn — một thẻ hỏng' : `không thấy \`${hookName}\``);
}
const patch = community.slice(community.indexOf('function patchPost('), community.indexOf('function useToggle('));
note('`patchPost` vẫn vá `community_user_posts` (dấu Lưu đổi tại chỗ trong thư viện)',
  /setQueriesData<FeedPost\[\]>\(\{ queryKey: \['community_user_posts'\] \}/.test(patch),
  'bỏ lưu ngay trong thư viện sẽ không đổi dấu dưới ngón tay');

/* ── fixture ── */
const { FIXTURES, UID } = await import(path.join(NATIVE, 'tools', 'live-world.mjs'));
const mySaves = FIXTURES.community_saves.filter((s) => s.user_id === UID)
  .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
const postOf = (id) => FIXTURES.community_posts.find((p) => p.id === id);
const kinds = mySaves.map((s) => postOf(s.post_id)?.kind);
note('fixture: người xem đã lưu cả một bài Workout lẫn một bài Recipe',
  kinds.includes('workout') && kinds.includes('recipe'), `loại đã lưu: ${kinds.join(', ') || '(không có)'}`);
const bySave = mySaves.map((s) => s.post_id).join(',');
const byPost = [...mySaves].sort((a, b) => (postOf(a.post_id).created_at < postOf(b.post_id).created_at ? 1 : -1))
  .map((s) => s.post_id).join(',');
note('fixture: thứ tự LƯU khác thứ tự ĐĂNG (để ảnh chụp phân biệt được hai cách xếp)', bySave !== byPost,
  'hai thứ tự trùng nhau — một thư viện xếp nhầm theo lúc đăng vẫn trông đúng');

if (problems.length) {
  console.error('thư viện Đã lưu CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `thư viện Đã lưu OK — ${CASES} ca. CHẠY THẬT \`selectSaved\` / \`filterSaved\`: thứ tự là thứ tự LƯU, bài ẩn của ` +
    'người khác bị bỏ còn của chính mình thì ở lại, dòng lạ và dòng trùng không lọt, bộ lọc đúng loại. Và giả định mà ' +
    'thư viện dựa vào còn nguyên: nó dùng chính `hydrate` của feed, nằm dưới tiền tố `community_user_posts`, và xoá bài / ' +
    'chặn người / xoá mọi bài / `patchPost` đều vẫn làm mới tiền tố ấy — nên không bài đã xoá hay người đã chặn nào để ' +
    'lại thẻ hỏng. Fixture có Workout lẫn Recipe đã lưu, theo thứ tự lưu khác thứ tự đăng',
);
