/**
 * Every widget the app can draw has somewhere to be drawn.
 *
 * ── why this is worth a tool ──
 *
 * The Today layout is stored on the device and used as it comes back. That is
 * right for the arrangement and wrong for the roster: a widget added to
 * `DEFAULT_CONFIG` after a layout was saved is simply absent, and edit mode has
 * no "add widget" — only move, remove a group, add a group, and reset. So the
 * only way to see a newly shipped card was to throw the whole layout away.
 *
 * It is not hypothetical. `water` and `steps` were added after the feature
 * shipped, so every account that had ever opened edit mode was missing both.
 *
 * ── what is checked ──
 *
 * 1. the roster is complete: every `WidgetKey` appears somewhere in the default
 *    layout, so there is no card the merge could never place
 * 2. an old config gains exactly the widgets it lacked, in their own groups
 * 3. the user's order, names and groupings survive untouched
 * 4. a widget the user *moved* is found there and not duplicated
 * 5. a group the user deleted is not resurrected — its widget lands in the last
 *    group, where `removeGroup` already folds orphans
 * 6. a current config comes back as the same object, so a load costs nothing
 * 7. running it twice changes nothing the first run did not
 * 8. a widget that was RETIRED is dropped from a stored layout
 *
 * ── why (8) is here ──
 *
 * `nudges` was deleted because its table had no writer, so the card returned
 * `null` on every render. But the merge is add-only by design, so the key
 * survived in every layout that had ever been saved — and a dead key is not
 * silent. The group lays it out as a zero-height child inside a `gap`, so the
 * section grows a blank slot; and edit mode falls back to `?? key`, printing
 * the bare identifier **"nudges"** on a Vietnamese screen as a chip for a card
 * that cannot appear. The only escape was `resetConfig`, which discards
 * everything the user arranged.
 *
 * Deleting a card is therefore two edits, and this is the one that is easy to
 * forget because nothing crashes when you do.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'widgets-'));
const problems = [];

try {
  // The hook pulls in React and AsyncStorage; only the pure parts are wanted,
  // so the two exports under test are compiled out of a trimmed copy.
  const src = execFileSync('node', ['-e', `
    const fs = require('fs');
    const s = fs.readFileSync(${JSON.stringify(path.join(NATIVE, 'src/hooks/use-widget-config.ts'))}, 'utf8');
    const start = s.indexOf('export type WidgetKey');
    const end = s.indexOf('export function useWidgetConfig');
    process.stdout.write(s.slice(start, end));
  `], { encoding: 'utf8' });

  const file = path.join(out, 'widgets.ts');
  execFileSync('node', ['-e', `require('fs').writeFileSync(${JSON.stringify(file)}, ${JSON.stringify(src)})`]);
  execFileSync('npx', ['tsc', file, '--ignoreConfig', '--outDir', out, '--module', 'commonjs',
    '--target', 'es2020', '--skipLibCheck'], { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });

  const { DEFAULT_CONFIG, RETIRED_WIDGETS, WIDGET_META, withNewWidgets } =
    createRequire(import.meta.url)(path.join(out, 'widgets.js'));

  const flat = (c) => [...c.heroWidgets, ...c.groups.flatMap((g) => g.widgets)];

  // ── 1: nothing in the roster is unplaceable ──
  const placed = new Set(flat(DEFAULT_CONFIG));
  for (const key of Object.keys(WIDGET_META)) {
    if (!placed.has(key)) problems.push(`"${key}" is in WIDGET_META but nowhere in DEFAULT_CONFIG`);
  }
  for (const key of placed) {
    if (!WIDGET_META[key]) problems.push(`"${key}" is laid out but has no WIDGET_META entry`);
  }

  // ── the config as it was before water and steps existed, with the user's own
  // arrangement on top: a renamed group, a reordered one, a moved widget ──
  const old = {
    heroWidgets: ['readiness', 'activity'],
    groups: [
      { id: 'insights', title: { en: 'My insights', vi: 'Phân tích của tôi' }, icon: '✨',
        widgets: ['nudges', 'ai-tips', 'readiness-trend', 'awards'] },
      { id: 'health', title: { en: 'Health', vi: 'Sức khỏe' }, icon: '❤️',
        widgets: ['sleep', 'biometrics'] },
      { id: 'nutrition', title: { en: 'Nutrition', vi: 'Dinh dưỡng' }, icon: '🍎',
        widgets: ['nutrition', 'supplements'] },
      { id: 'fitness', title: { en: 'Fitness', vi: 'Tập luyện' }, icon: '💪',
        widgets: ['training', 'workout-status', 'weight'] },
    ],
  };
  const merged = withNewWidgets(old);

  // ── 2: exactly the missing ones came back, in their own groups ──
  const gained = flat(merged).filter((k) => !flat(old).includes(k));
  if (gained.sort().join(',') !== 'steps,water') {
    problems.push(`expected steps+water back, got: ${gained.join(',') || '(none)'}`);
  }
  const groupOf = (c, key) => c.groups.find((g) => g.widgets.includes(key))?.id;
  if (groupOf(merged, 'steps') !== 'health') problems.push('steps did not land in health');
  /* `water` không còn rơi vào nhóm: nó nằm trong PROMOTED_TO_HERO, nên chỗ của
     nó là deck ở đầu trang. Xem khối "thăng lên hero" bên dưới. */
  if (groupOf(merged, 'water')) problems.push(`water landed in a group: ${groupOf(merged, 'water')}`);
  if (!merged.heroWidgets.includes('water')) problems.push('water did not reach the hero deck');

  // ── 3: the arrangement is untouched ──
  if (merged.groups.map((g) => g.id).join(',') !== old.groups.map((g) => g.id).join(',')) {
    problems.push('group order changed');
  }
  if (merged.groups[0].title.en !== 'My insights') problems.push('a renamed group lost its name');
  if (merged.groups[0].widgets.join(',') !== 'ai-tips,readiness-trend,awards') {
    problems.push(`an untouched group was reordered: ${merged.groups[0].widgets.join(',')}`);
  }
  // added at the end of its group, never in front of what was already there
  if (merged.groups[2].widgets.join(',') !== 'supplements') {
    problems.push(`nutrition group wrong after promotion: ${merged.groups[2].widgets.join(',')}`);
  }

  // ── 4: a widget the user moved is found, not duplicated ──
  const moved = withNewWidgets({
    heroWidgets: ['readiness', 'activity'],
    groups: [
      { id: 'health', title: { en: 'Health', vi: 'Sức khỏe' }, icon: '❤️',
        widgets: ['biometrics', 'sleep', 'steps', 'water'] },
      { id: 'nutrition', title: { en: 'Nutrition', vi: 'Dinh dưỡng' }, icon: '🍎',
        widgets: ['nutrition', 'supplements'] },
      { id: 'fitness', title: { en: 'Fitness', vi: 'Tập luyện' }, icon: '💪',
        widgets: ['training', 'workout-status', 'weight'] },
      { id: 'insights', title: { en: 'Insights', vi: 'Phân tích' }, icon: '✨',
        widgets: ['readiness-trend', 'ai-tips', 'awards', 'nudges'] },
    ],
  });
  const dupes = flat(moved).filter((k, i, a) => a.indexOf(k) !== i);
  if (dupes.length) problems.push(`duplicated: ${dupes.join(',')}`);

  // ── 5: a deleted group stays deleted ──
  const noNutrition = withNewWidgets({
    heroWidgets: ['readiness', 'activity'],
    groups: [
      { id: 'health', title: { en: 'Health', vi: 'Sức khỏe' }, icon: '❤️',
        widgets: ['biometrics', 'sleep', 'steps', 'nutrition'] },
      { id: 'fitness', title: { en: 'Fitness', vi: 'Tập luyện' }, icon: '💪',
        widgets: ['training', 'workout-status', 'weight'] },
      { id: 'insights', title: { en: 'Insights', vi: 'Phân tích' }, icon: '✨',
        widgets: ['readiness-trend', 'ai-tips', 'awards', 'nudges'] },
    ],
  });
  if (noNutrition.groups.some((g) => g.id === 'nutrition')) {
    problems.push('a deleted group came back');
  }
  /* `water` thăng lên hero nên nó không gấp vào nhóm cuối nữa. Cái được kiểm ở
     đây — một khoá KHÔNG có nhóm nhà thì rơi vào nhóm cuối chứ không bị đánh
     rơi — vẫn cần một ví dụ, và `nutrition` không dùng được vì nó cũng thăng.
     Dùng `supplements`: nhóm nhà của nó cũng là 'nutrition', nhóm đã bị xoá. */
  if (groupOf(noNutrition, 'supplements') !== 'insights') {
    problems.push(`supplements should fold into the last group, went to ${groupOf(noNutrition, 'supplements')}`);
  }
  if (groupOf(noNutrition, 'water')) problems.push('water should be in the hero, not a group');

  /* ── 6: nothing to do costs nothing ──

     DEFAULT_CONFIG đã mang nutrition và water ở hero, nên phép thăng hạng không
     tìm thấy gì để dời và `changed` phải giữ nguyên false. Đó cũng là phép thử
     rằng việc dời là IDEMPOTENT: chạy trên một bố cục đã dời không được đếm là
     một thay đổi, nếu không caller so sánh bằng identity sẽ ghi lại đĩa mỗi lần
     mở app. */
  // ── 6: nothing to do costs nothing ──
  if (withNewWidgets(DEFAULT_CONFIG) !== DEFAULT_CONFIG) {
    problems.push('a complete config was rebuilt instead of returned as-is');
  }

  // ── 7: idempotent ──
  if (withNewWidgets(merged) !== merged) problems.push('running twice changed the result');

  /*
    ── 8: a retired widget is dropped, everywhere it could be hiding ──

    `old` above already carries `nudges` in a group, so the merge must have
    removed it there. Here it is also placed among the hero widgets, because a
    user can drag it up there and the pruning has to reach both lists.
  */
  if (flat(merged).includes('nudges')) {
    problems.push('nudges survived in a stored layout — nó vẽ ra một ô rỗng và một chip tên "nudges"');
  }
  const retiredHero = withNewWidgets({
    heroWidgets: ['readiness', 'nudges', 'activity'],
    groups: DEFAULT_CONFIG.groups.map((g) => ({ ...g, widgets: [...g.widgets] })),
  });
  if (flat(retiredHero).includes('nudges')) {
    problems.push('nudges survived among the hero widgets');
  }
  /* Hai khoá được thăng nối vào SAU thứ tự cũ, không chen vào giữa: người dùng
     đã sắp readiness trước activity và việc dời không được phép sắp lại. */
  if (retiredHero.heroWidgets.join(',') !== 'readiness,activity,nutrition,water') {
    problems.push(`pruning disturbed the hero order: ${retiredHero.heroWidgets.join(',')}`);
  }
  /* and the two lists cannot overlap: a key on both would be pruned on load and
     re-added by the merge on the same pass, so the config would never settle and
     the card would flicker in and out of somebody's layout forever */
  for (const k of RETIRED_WIDGETS ?? []) {
    if (WIDGET_META[k] || placed.has(k)) {
      problems.push(`'${k}' vừa nằm trong RETIRED_WIDGETS vừa còn trong roster — dọn rồi thêm lại ngay`);
    }
  }

  /*
    ── 8b: thăng lên hero, đúng ca nâng cấp thật ──

    Fixture ở 8 KHÔNG đi qua đường này: nhóm mặc định không còn chứa
    nutrition/water, nên vòng lặp DEFAULT_CONFIG.heroWidgets đã thêm chúng vào
    hero trước khi phép dời chạy tới, và phép dời không tìm thấy gì. Một phá thử
    đổi `push` thành `unshift` vẫn xanh — luật đọc đúng kết quả nhưng chưa bao
    giờ chạy qua đoạn code nó nói về.

    Đây là bố cục của một người đã dùng app trước khi hero thành deck: hai thẻ
    kia nằm trong nhóm, và hero mang thứ tự của chính họ.
  */
  const upgraded = withNewWidgets({
    heroWidgets: ['activity', 'readiness'],
    groups: [
      { id: 'health', title: { en: 'Health', vi: 'Sức khỏe' }, icon: '❤️',
        widgets: ['biometrics', 'sleep', 'steps'] },
      { id: 'nutrition', title: { en: 'Nutrition', vi: 'Dinh dưỡng' }, icon: '🍎',
        widgets: ['nutrition', 'water', 'supplements'] },
      { id: 'fitness', title: { en: 'Fitness', vi: 'Tập luyện' }, icon: '💪',
        widgets: ['training', 'workout-status', 'weight'] },
      { id: 'insights', title: { en: 'Insights', vi: 'Phân tích' }, icon: '✨',
        widgets: ['readiness-trend', 'ai-tips', 'awards'] },
    ],
  });
  // nối vào SAU thứ tự người dùng đã sắp, không chen lên đầu
  if (upgraded.heroWidgets.join(',') !== 'activity,readiness,nutrition,water') {
    problems.push(`promotion changed the hero order: ${upgraded.heroWidgets.join(',')}`);
  }
  // và biến mất khỏi nhóm cũ, không nằm hai chỗ
  const stillGrouped = upgraded.groups.flatMap((g) => g.widgets).filter((k) => k === 'nutrition' || k === 'water');
  if (stillGrouped.length) problems.push(`promoted keys left in a group: ${stillGrouped.join(',')}`);
  if (upgraded.groups[1].widgets.join(',') !== 'supplements') {
    problems.push(`the rest of the group was disturbed: ${upgraded.groups[1].widgets.join(',')}`);
  }
  const upDupes = flat(upgraded).filter((k, i, a) => a.indexOf(k) !== i);
  if (upDupes.length) problems.push(`promotion duplicated: ${upDupes.join(',')}`);
  // chạy lại không được tính là một thay đổi, nếu không app ghi đĩa mỗi lần mở
  if (withNewWidgets(upgraded) !== upgraded) problems.push('promotion is not idempotent');

  /*
    ── 9: the check has teeth ──

    What the loader did before this: hand the stored config straight through.
    Rebuilt here and required to fail the very test that matters, so a future
    "simplification" back to that cannot pass by leaving the tool green.
  */
  const beforeTheFix = (stored) => stored;
  const wouldMiss = flat(DEFAULT_CONFIG).filter((k) => !flat(beforeTheFix(old)).includes(k));
  if (wouldMiss.sort().join(',') !== 'steps,water') {
    problems.push('the pre-fix behaviour no longer loses steps+water — this check proves nothing');
  }

  if (problems.length) {
    console.error('bố cục Today CÓ LỖI:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `bố cục Today OK — ${Object.keys(WIDGET_META).length} widget đều có chỗ; ` +
    `cấu hình cũ nhận lại steps vào đúng nhóm còn water được DỜI LÊN hero deck (một lần, idempotent, nối vào sau thứ tự người dùng đã sắp chứ không chen vào giữa), thứ tự và tên nhóm giữ nguyên, ` +
    `nhóm đã xoá không sống lại, chạy hai lần không đổi gì; bản cũ (dùng thẳng) mất đúng 2 widget; ` +
    `và widget đã khai tử ('nudges') bị dọn khỏi layout đã lưu ở CẢ hàng hero lẫn trong nhóm — ` +
    `để lại thì nó vẽ một ô rỗng trong nhóm có gap và một chip mang đúng tên khoá tiếng Anh cho ` +
    `một thẻ không bao giờ hiện được`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
