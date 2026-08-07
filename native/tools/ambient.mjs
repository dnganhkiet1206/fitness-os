/**
 * Fail on a full page with no room light.
 *
 * ── the bug this exists for ──
 *
 * `AmbientLight` puts three pools behind the page — a warm key past the
 * top-left, a cool fill low and right, a neutral lift in the middle. `<Screen>`
 * mounts it, so every page built on `<Screen>` has it and nobody thinks about
 * it again.
 *
 * Today does not use `<Screen>`. It builds its own scroll view because of the
 * edit-mode layout, and so it was the one tab with a flat background — sitting
 * under cards whose highlights are drawn to agree with a key light at the
 * top-left that was not there. It stayed that way until somebody noticed, and
 * nothing in the code said it was wrong: the file read like a perfectly normal
 * screen.
 *
 * That is the shape this catches. Not "the light looks off" — a rule cannot see
 * that — but "this page never mounts it at all", which is a fact about the
 * source and is exactly how it went missing.
 *
 * ── modals are not pages ──
 *
 * The sheets are exempt, and not as a convenience. `_layout.tsx` gives them
 * `contentStyle: { backgroundColor: colors.card }` — a different surface,
 * sitting *in front of* the page rather than being one. Room light belongs to
 * the room, not to the card held up in it. The camera screens are
 * `fullScreenModal` over black for the same kind of reason.
 *
 * So the exempt list is not written here. It is **read from `_layout.tsx`**, so
 * a route that stops being a modal stops being exempt on the same commit,
 * rather than staying quietly excused by a list nobody updates.
 *
 * ── what it cannot check ──
 *
 * Whether the light is actually *visible*. Mounting `<AmbientLight />` and then
 * painting `colors.background` over it in the child's style produces exactly
 * what was there before, and that is a real trap — it is why the fix had to
 * make Today's scroll view transparent. Proving that statically means resolving
 * a style object through `StyleSheet.create` and knowing z-order, which is more
 * machinery than the bug is worth and would be wrong in both directions.
 *
 * It is stated here rather than left implicit: a clean run means every page
 * mounts the light, not that every page shows it.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP = path.join(NATIVE, 'src', 'app');
const LAYOUT = path.join(APP, '_layout.tsx');

/** Route names given `presentation: 'modal' | 'fullScreenModal'` in _layout. */
function modalRoutes(source) {
  const names = new Set();

  // The `.map()` list: a run of quoted names followed by `presentation: 'modal'`
  for (const m of source.matchAll(/\(\s*\[([^\]]*)\]\s*as const\s*\)\s*\.map/g)) {
    if (!/presentation:\s*'(?:full[Ss]creen)?[Mm]odal'/.test(source.slice(m.index))) continue;
    for (const q of m[1].matchAll(/'([\w-]+)'/g)) names.add(q[1]);
  }

  // And the individually-declared ones: <Stack.Screen name="x" … modal … />
  for (const m of source.matchAll(/<Stack\.Screen\b[\s\S]{0,400}?\/>/g)) {
    const tag = m[0];
    const name = tag.match(/name=["']([\w-]+)["']/);
    if (name && /presentation:\s*['"](?:full[Ss]creen)?[Mm]odal['"]/.test(tag)) names.add(name[1]);
  }

  return names;
}

/** Every route file under src/app, as route names, skipping layouts. */
function routeFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      // `(tabs)` is a group: it does not appear in the route name
      out.push(...routeFiles(full, entry.startsWith('(') ? prefix : `${prefix}${entry}/`));
      continue;
    }
    if (!entry.endsWith('.tsx') || entry.startsWith('_')) continue;
    out.push({ route: prefix + entry.replace(/\.tsx$/, ''), file: full });
  }
  return out;
}

/**
 * Does this file get room light — directly, through `<Screen>`, or from a
 * component whose whole job is to *be* the room light?
 *
 * `AssistantAura` is the third case. It is the same three-pool recipe with the
 * pools drifting, built for the Health Assistant page where the light is the
 * hero rather than the backdrop; a page carrying it is lit by definition. The
 * rule matches the name rather than a list of files, so a second animated
 * backdrop would be recognised without editing this.
 */
const lit = (src) =>
  /<AmbientLight\b/.test(src) ||
  /<AssistantAura\b/.test(src) ||
  /from '@\/components\/ascnd\/screen'/.test(src);

function audit(layoutSource, files) {
  const modals = modalRoutes(layoutSource);
  const dark = [];
  for (const { route, file } of files) {
    const name = route.split('/').pop();
    if (modals.has(name)) continue;
    if (!lit(readFileSync(file, 'utf8'))) dark.push(path.relative(NATIVE, file));
  }
  return { dark, modals };
}

/*
  Self-test first.

  A rule that has quietly stopped matching anything reports success, and that is
  indistinguishable from a healthy codebase — the failure mode every tool in
  this folder is written to avoid. So the checker is run against three files it
  must classify correctly before its verdict on the real ones is trusted.
*/
const FIXTURES = [
  ['dùng Screen', `import { Screen } from '@/components/ascnd/screen';`, true],
  ['tự gắn AmbientLight', `import x from 'y';\nreturn (<View><AmbientLight /><ScrollView/></View>);`, true],
  ['tự gắn AssistantAura', `return (<View><AssistantAura state={null} /><ScrollView/></View>);`, true],
  ['không có gì', `import { View, ScrollView } from 'react-native';\nreturn <ScrollView/>;`, false],
  /* The near miss: a page that only *imports* the aura and never renders it is
     dark, and reads at a glance as though it is not. */
  ['chỉ import chứ không dùng', `import { AssistantAura } from '@/components/ascnd/assistant-aura';\nreturn <ScrollView/>;`, false],
];
const selfFail = FIXTURES.filter(([, src, want]) => lit(src) !== want).map(([label]) => label);
if (selfFail.length) {
  console.error(`ánh sáng nền: phép kiểm tự sai ở ${selfFail.join(', ')} — không tin kết quả`);
  process.exit(1);
}

const layout = readFileSync(LAYOUT, 'utf8');
const { dark, modals } = audit(layout, routeFiles(APP));

// If the modal list came back empty the parse broke, and every sheet would be
// reported as a dark page. Louder to say so than to print eleven false alarms.
if (modals.size === 0) {
  console.error('ánh sáng nền: không đọc được danh sách modal từ _layout.tsx — sửa tools/ambient.mjs');
  process.exit(1);
}

if (dark.length) {
  console.error('trang đầy đủ thiếu ánh sáng nền:\n');
  for (const f of dark) console.error(`  ${f}`);
  console.error('\nDùng <Screen>, hoặc bọc trong <View> và gắn <AmbientLight /> phía sau.');
  console.error('Nhớ để nền của con là transparent — nếu không nó phủ lên chính ánh sáng vừa thêm.');
  process.exit(1);
}

console.log(`ánh sáng nền OK — mọi trang đầy đủ đều có, ${modals.size} sheet được miễn`);
