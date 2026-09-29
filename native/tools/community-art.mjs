/**
 * Ảnh của bài Cộng đồng do app cấp (#163): app chọn sẵn đúng ảnh.
 *
 * CHẠY THẬT `pickArt`, `artStyles`, `workoutTags` đọc từ
 * `src/lib/community-art.ts`, qua các ca có đáp án cụ thể:
 *   · chỉ ảnh CÒN DÙNG và ĐÚNG LOẠI — đúng hai điều server kiểm (trigger
 *     `community_posts_art_check`), nên ảnh app chọn sẵn không bao giờ bị từ
 *     chối;
 *   · trùng nhãn > không nhãn > nhãn khác, hoà thì `sort` rồi `id`;
 *   · có phong cách thì chỉ trong phong cách ấy, phong cách rỗng thì bỏ lọc;
 *   · nhãn buổi tập: "Leg Press" là chân chứ không phải đẩy, hai nhóm → `full`.
 * Rồi năm bản hỏng phải bị bắt.
 *
 * Cộng phần cấu trúc: mọi thẻ bài đi qua `PostShell`, và `PostShell` vẽ
 * `PostArt` — "mọi bài có ảnh" là một dòng, không phải ba.
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

const art = (id, kind, style, tags, sort, active = true) => ({
  id, kind, style, tags, path: `${kind}/${id}.png`, alt_en: id, alt_vi: id, active, sort,
});
const LIB = [
  art('legs', 'workout', 'mono', ['legs'], 0),
  art('push', 'workout', 'mono', ['push'], 1),
  art('any', 'workout', 'mono', [], 2),
  art('neon', 'workout', 'neon', [], 3),
  art('off', 'workout', 'retro', ['push'], -5, false),
  art('rcp', 'recipe', 'mono', ['push'], -9),
];

const CASES = [
  ['buổi đẩy nhận ảnh đẩy, không phải ảnh chân đứng trước', (m) => m.pickArt(LIB, 'workout', { tags: ['push'] })?.id === 'push'],
  ['buổi không nhận ra nhóm nào: ảnh không nhãn thắng ảnh mang nhãn khác', (m) => m.pickArt(LIB, 'workout', { tags: [] })?.id === 'any'],
  ['ảnh đã tắt không bao giờ được chọn, dù trùng nhãn và đứng đầu', (m) => m.pickArt(LIB, 'workout', { tags: ['push'], style: 'retro' })?.id === 'push'],
  ['ảnh loại khác không bao giờ được chọn', (m) => m.pickArt(LIB, 'recipe', { tags: ['push'] })?.id === 'rcp' && m.pickArt(LIB, 'progress') === null],
  ['chọn phong cách thì chỉ trong phong cách ấy', (m) => m.pickArt(LIB, 'workout', { tags: ['push'], style: 'neon' })?.id === 'neon'],
  ['cùng thư viện, cùng đầu vào → cùng ảnh, bất kể thứ tự mảng', (m) =>
    m.pickArt([...LIB].reverse(), 'workout', { tags: ['push'] })?.id === 'push' &&
    m.pickArt([art('b', 'workout', 's', [], 0), art('a', 'workout', 's', [], 0)], 'workout')?.id === 'a'],
  ['phong cách: chỉ phong cách còn ảnh đúng loại, theo sort', (m) => JSON.stringify(m.artStyles(LIB, 'workout')) === '["mono","neon"]'],
  ['nhãn: Leg Press là chân, Bench Press là đẩy, Lat Pulldown là kéo', (m) =>
    JSON.stringify(m.workoutTags(['Leg Press'])) === '["legs"]' &&
    JSON.stringify(m.workoutTags(['Bench Press'])) === '["push"]' &&
    JSON.stringify(m.workoutTags(['Lat Pulldown'])) === '["pull"]'],
  ['nhãn: hai nhóm cơ trở lên → thêm full; cardio không tính', (m) =>
    JSON.stringify(m.workoutTags(['Squat', 'Bench Press'])) === '["legs","push","full"]' &&
    JSON.stringify(m.workoutTags(['Treadmill run', 'Bench Press'])) === '["push","cardio"]'],
  ['nhãn: không nhận ra bài nào thì không nhãn', (m) => m.workoutTags(['Plank']).length === 0],
];

const out = mkdtempSync(path.join(tmpdir(), 'community-art-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/community-art.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'community-art.js'), 'utf8');
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
    ['bỏ lọc ảnh đã tắt', /a\.active && a\.kind === kind/, 'a.kind === kind'],
    ['bỏ lọc loại bài', /a\.active && a\.kind === kind/, 'a.active'],
    ['bỏ điểm theo nhãn', /return hit > 0 \? 2 \+ hit : 0;/, 'return 1;'],
    ['bỏ lọc phong cách', /const inStyle = opts\.style \? usable\.filter\(\(a\) => a\.style === opts\.style\) : usable;/, 'const inStyle = usable;'],
    ['Leg Press thành đẩy (bỏ "dừng ở nhóm đầu")', /break;\s*\}/, '}'],
  ];
  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!runAll(load(compiled.replace(re, to))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

const shell = readFileSync(path.join(NATIVE, 'src/components/ascnd/post-parts.tsx'), 'utf8');
if (!/<PostArt art=\{post\.art\} kind=\{post\.kind\} \/>/.test(shell)) {
  problems.push('post-parts.tsx: `PostShell` không còn vẽ `PostArt` — có loại bài sẽ không có ảnh');
}

if (problems.length) {
  console.error('ảnh thư viện app CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `ảnh thư viện app OK — ${CASES.length} ca CHẠY THẬT pickArt/artStyles/workoutTags: chỉ ảnh còn dùng và đúng loại (hai ` +
    'điều server kiểm), trùng nhãn > không nhãn > nhãn khác, phong cách lọc được và rỗng thì bỏ lọc, cùng đầu vào cùng ' +
    'ảnh, nhãn buổi tập đúng cả ca Leg Press. 5 bản hỏng đều bị bắt. PostShell vẽ PostArt cho mọi loại bài',
);
