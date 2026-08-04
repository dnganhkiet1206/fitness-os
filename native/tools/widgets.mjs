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

  const { DEFAULT_CONFIG, WIDGET_META, withNewWidgets } =
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
  if (groupOf(merged, 'water') !== 'nutrition') problems.push('water did not land in nutrition');
  if (groupOf(merged, 'steps') !== 'health') problems.push('steps did not land in health');

  // ── 3: the arrangement is untouched ──
  if (merged.groups.map((g) => g.id).join(',') !== old.groups.map((g) => g.id).join(',')) {
    problems.push('group order changed');
  }
  if (merged.groups[0].title.en !== 'My insights') problems.push('a renamed group lost its name');
  if (merged.groups[0].widgets.join(',') !== 'nudges,ai-tips,readiness-trend,awards') {
    problems.push('an untouched group was reordered');
  }
  // added at the end of its group, never in front of what was already there
  if (merged.groups[2].widgets.join(',') !== 'nutrition,supplements,water') {
    problems.push(`water was not appended: ${merged.groups[2].widgets.join(',')}`);
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
        widgets: ['biometrics', 'sleep', 'steps', 'nutrition', 'supplements'] },
      { id: 'fitness', title: { en: 'Fitness', vi: 'Tập luyện' }, icon: '💪',
        widgets: ['training', 'workout-status', 'weight'] },
      { id: 'insights', title: { en: 'Insights', vi: 'Phân tích' }, icon: '✨',
        widgets: ['readiness-trend', 'ai-tips', 'awards', 'nudges'] },
    ],
  });
  if (noNutrition.groups.some((g) => g.id === 'nutrition')) {
    problems.push('a deleted group came back');
  }
  if (groupOf(noNutrition, 'water') !== 'insights') {
    problems.push(`water should fold into the last group, went to ${groupOf(noNutrition, 'water')}`);
  }

  // ── 6: nothing to do costs nothing ──
  if (withNewWidgets(DEFAULT_CONFIG) !== DEFAULT_CONFIG) {
    problems.push('a complete config was rebuilt instead of returned as-is');
  }

  // ── 7: idempotent ──
  if (withNewWidgets(merged) !== merged) problems.push('running twice changed the result');

  /*
    ── 8: the check has teeth ──

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
    `cấu hình cũ nhận lại steps+water đúng nhóm, thứ tự và tên nhóm giữ nguyên, ` +
    `nhóm đã xoá không sống lại, chạy hai lần không đổi gì; bản cũ (dùng thẳng) mất đúng 2 widget`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
