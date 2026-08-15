/**
 * That everything built is actually wired to something.
 *
 * ── the bug this was written for ──
 *
 * `isLate(habit, now, floor)` answered the one question the mascot's whole
 * personalisation exists for: *is this person past the hour they would normally
 * have done this?* It was written, documented, and covered by
 * `tools/personalize.mjs`. It had **no caller in the app**.
 *
 * So for as long as it existed, Koa went on asking about a workout from four in
 * the afternoon and a meal from eleven — four hours somebody typed once for an
 * imagined day — while the model that knew better sat one import away. Every
 * check was green. The rhythm was learned, stored, tested, and consumed by
 * nothing.
 *
 * That is a whole class: a producer with no consumer. It looks exactly like
 * working code, it passes every test written about it, and the only symptom is
 * a feature quietly behaving as though the work had never been done. This app
 * has now hit it three times — the learned clock and the reminders, the learned
 * clock and the mascot's asks, and `pr_detected`, a column every session wrote
 * as `false` while three features read it.
 *
 * ── what it asks ──
 *
 * Every `export function` under `src/` must be named somewhere in `src/` other
 * than its own declaration. Not "imported" — *named*, anywhere, so a re-export
 * or an indirect use counts and the rule stays about linkage rather than about
 * import style.
 *
 * Exports consumed **only by `tools/`** deliberately do not count. A constant a
 * check reads is fine; a *function* that only a check calls is a function the
 * product does not use, which is the thing being looked for.
 *
 * ── the exemption list ──
 *
 * Everything already unlinked on the day this was written, each with a reason.
 * The list can only shrink honestly: the self-test below fails if an entry
 * names something that has since acquired a caller, so a stale exemption cannot
 * sit there pretending to be needed.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');
const problems = [];

const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})(SRC);
const all = files.map((f) => ({ f: path.relative(SRC, f), s: strip(readFileSync(f, 'utf8')) }));

/**
 * Unlinked on the day this check was written.
 *
 * Two kinds, and they are worth telling apart when clearing them: a **component
 * nobody renders** is a screen's worth of code that will rot without anybody
 * noticing, and a **helper nobody calls** is usually a rule with a second copy
 * somewhere. Neither is urgent; both are debt, and the point of writing them
 * down is that the nineteenth one cannot hide among them.
 */
const KNOWN = {
  'components/ascnd/icon-button.tsx: IconButton': 'nút icon dùng chung, chưa màn nào dùng',
  'components/ascnd/liquid-glass.tsx: SolidCard': 'biến thể thẻ đặc, chưa dùng',
  'components/ascnd/liquid-tab-bar.tsx: LiquidTabBar': 'thanh tab cũ, đã thay bằng NativeTabs',
  'components/ascnd/quick-stats.tsx: QuickStats': 'dải chỉ số nhanh, chưa gắn vào màn nào',
  'components/ascnd/studio/plants-live.tsx: SwayingPlants': 'lớp cây động của studio, chưa bật',
  'components/ascnd/koa/koa-gaze.ts: headMat': 'ma trận nhìn, chỉ tool dựng hình gọi',
  'components/ascnd/koa/koa-gaze.ts: eyeMat': 'như trên',
  'components/ascnd/koa/koa-gaze.ts: lookK': 'như trên',
  'components/ascnd/shop/shop-camera.ts: zoomOf': 'chỉ tools/shop-camera.mjs kiểm',
  'components/ascnd/studio/live-regions.ts: areaOf': 'chỉ tool ngân sách vẽ dùng',
  'hooks/use-library.ts: useWorkoutTemplateNames': 'danh sách tên mẫu, chưa màn nào cần',
  'lib/backend.ts: describeBackend': 'câu mô tả backend cho màn chẩn đoán chưa dựng',
  'lib/help-nudge.ts: resetRun': 'dùng khi test',
  'lib/i18n.ts: formatPrice': 'định dạng giá — chờ IAP',
  'lib/i18n.ts: useTranslation': 'API cũ của bản web, useI18n thay thế',
  'lib/training-card.ts: acwrPercent': 'chỉ tools/training-card.mjs kiểm',
  'lib/units.ts: formatWeight': 'displayWeight + weightLabel đang được gọi rời',
};

const unlinked = [];
for (const { f, s } of all) {
  for (const m of s.matchAll(/^export (?:async )?function (\w+)/gm)) {
    const name = m[1];
    let uses = 0;
    for (const o of all) uses += (o.s.match(new RegExp(`\\b${name}\\b`, 'g')) ?? []).length;
    const decls = (s.match(new RegExp(`^export (?:async )?function ${name}\\b`, 'gm')) ?? []).length;
    if (uses - decls === 0) unlinked.push(`${f}: ${name}`);
  }
}

for (const entry of unlinked) {
  if (!(entry in KNOWN)) {
    problems.push(
      `${entry} — viết ra rồi nhưng KHÔNG chỗ nào trong app gọi tới. ` +
        'Nối vào, xoá đi, hoặc thêm vào danh sách miễn kèm lý do.',
    );
  }
}

/* ── the self-test the exemption list needs ──

   An entry that has since been wired up, or deleted, is a line that makes this
   check quieter without making the app better. Both are failures here. */
for (const entry of Object.keys(KNOWN)) {
  if (!unlinked.includes(entry)) {
    problems.push(`danh sách miễn còn '${entry}' nhưng nó đã được nối hoặc đã bị xoá — bỏ dòng đó đi`);
  }
}

/* And the rule has to be able to see anything at all: if the scan finds no
   functions, it is passing by measuring nothing — the failure `live.mjs`
   records having shipped once. */
const totalExports = all.reduce(
  (n, { s }) => n + (s.match(/^export (?:async )?function /gm) ?? []).length,
  0,
);
if (totalExports < 200) {
  problems.push(`chỉ quét được ${totalExports} hàm export — bộ quét hỏng, đừng tin kết quả`);
}

if (problems.length) {
  console.log('làm ra mà chưa nối:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `đã nối OK — quét ${totalExports} hàm export trong src, ${unlinked.length} hàm chưa có chỗ gọi và ` +
    'cả ' + Object.keys(KNOWN).length + ' đều nằm trong danh sách miễn kèm lý do; ' +
    'một hàm mới viết ra mà không ai gọi sẽ làm hỏng bước này — đúng hình dạng của isLate, ' +
    'thứ trả lời câu hỏi trung tâm của phần cá nhân hoá suốt nhiều tuần mà không màn nào hỏi tới',
);
