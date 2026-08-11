/**
 * That every screen in this app can still be got to.
 *
 * ── why this exists ──
 *
 * A route is a file. Nothing links a file to the thing that opens it, so
 * deleting the last button that pushed a screen leaves the screen compiling,
 * type-checking and passing every other rule in this directory — while being
 * unreachable by any human holding the phone. `tsc` cannot see it, because
 * nothing is wrong with the code; it is wrong with the app.
 *
 * The risk is not hypothetical here. Two headers were just emptied of icons
 * that were each the *only* way into a screen: Nutrition's pill and trolley
 * were supplements and the grocery list, and Progress's four glyphs were the
 * weekly review, smart goals, challenges and awards. Six screens, five of them
 * with exactly one door, and all six doors were in the code being deleted. They
 * were rebuilt as labelled rows — but "were" is doing a lot of work in that
 * sentence, and the next restructure will not have somebody watching.
 *
 * ── what counts as a door ──
 *
 * Any mention of the route's path outside the route's own file. That is
 * deliberately generous: this app pushes routes as bare strings
 * (`router.push('/awards')`), as objects (`{ pathname: '/food-list', params }`),
 * with a query attached (`/scan-food?from=ai`), and out of arrays of
 * `{ route }` records that a `.map` turns into rows. A rule that only
 * recognised the first of those would have reported five perfectly reachable
 * screens the first time it ran — which is exactly what a hand-written grep did
 * an hour before this file existed.
 *
 * ── what it does not prove ──
 *
 * That the door is *findable*. A route pushed from a button nobody can
 * recognise is reachable and still lost, which is what the header-icon rule in
 * `tap-targets.mjs` is for. This one answers the cruder question, and the
 * cruder question is the one that silently goes wrong.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');
const APP = path.join(SRC, 'app');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * The five tab roots. They are opened by the tab bar rather than by a `push`,
 * so they are listed by the name the trigger uses, and checked against the tab
 * bar itself rather than against the whole source tree — a tab that loses its
 * trigger is exactly as lost as a route that loses its button.
 */
const TAB_FILES = ['index.tsx', 'nutrition.tsx', 'workouts.tsx', 'progress.tsx', 'assistant.tsx'];

const problems = [];

/* `(tabs)` is a route group: it shapes the file tree and not the URL. */
const routeOf = (rel) =>
  '/' + rel.replace(/\\/g, '/').replace(/^app\//, '').replace(/\(tabs\)\//, '').replace(/\.tsx$/, '');

const files = walk(APP).filter((f) => !/_layout\.tsx$/.test(f));
const sources = walk(SRC).map((f) => [f, readFileSync(f, 'utf8')]);

const tabBar = readFileSync(path.join(SRC, 'components', 'app-tabs.tsx'), 'utf8');

let checked = 0;
for (const file of files) {
  const rel = path.relative(SRC, file);
  const base = path.basename(file);
  const isTab = rel.includes('(tabs)') && TAB_FILES.includes(base);

  if (isTab) {
    checked++;
    const name = base.replace(/\.tsx$/, '');
    if (!new RegExp(`name=["']${name}["']`).test(tabBar)) {
      problems.push(`${rel}: là một tab nhưng app-tabs.tsx không còn trigger nào tên "${name}"`);
    }
    continue;
  }

  const route = routeOf(rel);
  checked++;
  /* `/food-list` must not be satisfied by `/food-list-old`, so the character
     after the path has to be one that ends it. */
  const re = new RegExp(`${route.replace(/[/-]/g, '\\$&')}(?=["'\`?])`);
  const doors = sources.filter(([f, text]) => f !== file && re.test(text));
  if (doors.length === 0) {
    problems.push(
      `${route}: không còn chỗ nào trong app mở nó — màn hình vẫn biên dịch được và không ai tới được`,
    );
  }
}

/**
 * The self-test.
 *
 * A rule that answers "is this reachable" must be able to say no. The walker
 * and the pattern are both easy to get wrong in the direction that says yes to
 * everything, which reports a healthy app and proves nothing.
 */
const SELF = [
  ['route không ai gọi — bắt được', () => {
    const re = new RegExp('/lost-screen(?=["\'`?])');
    return !re.test("router.push('/other-screen')");
  }],
  ['route có người gọi — không báo oan', () => {
    const re = new RegExp('/awards(?=["\'`?])');
    return re.test("router.push('/awards')") && re.test("{ route: '/awards' }");
  }],
  ['gọi kèm query vẫn tính là lối vào', () => {
    const re = new RegExp('/scan-food(?=["\'`?])');
    return re.test("route: '/scan-food?from=ai'");
  }],
  ['tiền tố trùng không được tính', () => {
    const re = new RegExp('/food-list(?=["\'`?])');
    return !re.test("router.push('/food-listing')");
  }],
  ['(tabs) bị bỏ khỏi đường dẫn', () => routeOf('app/(tabs)/nutrition.tsx') === '/nutrition'],
  ['route thường giữ nguyên tên', () => routeOf('app/awards.tsx') === '/awards'],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('màn hình không còn lối vào:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `lối vào OK — ${checked} màn hình đều còn ít nhất một chỗ mở được: ` +
    `${TAB_FILES.length} tab có trigger trong app-tabs.tsx, còn lại được push từ đâu đó trong app ` +
    '(chuỗi trần, object có pathname, kèm query, hay qua mảng { route } được map — đều tính)',
);
