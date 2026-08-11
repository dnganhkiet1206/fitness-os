/**
 * That no text in this app is smaller than a phone can comfortably show.
 *
 * ── the rule, and whose rule it is ──
 *
 * Apple's Human Interface Guidelines put the floor at **11 points**, and put it
 * there for the smallest Dynamic Type setting, not the default one. It is not a
 * style preference: SF Pro Text is drawn with wider spacing and heavier strokes
 * below 19pt precisely because small type stops resolving, and below 11 it
 * stops resolving for people with ordinary eyesight holding an ordinary phone
 * at an ordinary distance.
 *
 * This app had **61** text styles under it — 8, 9 and 10 point — and almost all
 * of them were the same thing: a unit beside a number, a label under a tile, an
 * uppercase micro-caption. Secondary text, in the app's muted grey, at the
 * smallest size in the file. Three quiet decisions that compound into text
 * somebody squints at.
 *
 * It is also the difference between an app that looks dense and one that looks
 * cheap, and it is the single most common thing separating this app's screens
 * from the ones worth copying. Apple Fitness, Oura and Whoop are all denser
 * than this app and none of them go under 11: they buy density by removing
 * labels, not by shrinking them.
 *
 * ── what is exempt, and why ──
 *
 * Numerals drawn *inside* a shape — a rank badge, a streak card — are graphics
 * with a glyph in them, not text in a layout. Raising those does not improve
 * legibility, it overflows the circle they sit in. They are listed by name
 * below rather than pattern-matched, so a new one has to be argued for.
 *
 * ── what this deliberately does NOT enforce ──
 *
 * `constants/ascnd.ts` defines seven type steps (28/22/18/17/15/13/11) and the
 * app uses **fourteen** distinct sizes above the floor, including 12, 14 and 16
 * — sizes that sit *between* ramp steps, which is the signature of a scale that
 * is being ignored rather than used. That is real, and it is a design decision
 * with visible consequences on every screen, not a bug with a right answer. A
 * tool should not quietly make that call. It is reported at the end so the
 * drift stays visible.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

/** Apple HIG: 11pt, held even at the smallest Dynamic Type setting. */
const FLOOR = 11;

/**
 * Glyphs inside a drawn shape. Each is a numeral centred in a circle or a card
 * whose geometry is fixed in a viewBox — raising the type does not make it
 * easier to read, it makes it collide with the shape around it.
 */
const GRAPHIC_NUMERALS = {
  'src/components/ascnd/rank-journey.tsx': 'số hiệu bậc, nằm giữa một hình tròn có bán kính cố định',
  'src/components/ascnd/studio/streak-card.tsx': 'chữ số trong thẻ chuỗi ngày, toạ độ tuyệt đối trong viewBox',
};

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Comments out, newlines kept — so a note explaining the rule is not read as code. */
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

const problems = [];
const sizes = new Map();

for (const file of walk(SRC)) {
  const rel = path.relative(NATIVE, file).replace(/\\/g, '/');
  const code = codeOnly(readFileSync(file, 'utf8'));
  const exempt = GRAPHIC_NUMERALS[rel];

  /* Both spellings: `fontSize: 11` in a StyleSheet and `fontSize={11}` on an
     SVG <Text>. The second is the one a rule written only for stylesheets
     misses, and it is where the chart labels live. */
  for (const m of code.matchAll(/fontSize[:=]\s*\{?\s*([0-9]+(?:\.[0-9]+)?)/g)) {
    const n = Number(m[1]);
    sizes.set(n, (sizes.get(n) ?? 0) + 1);
    if (n >= FLOOR) continue;
    if (exempt) continue;
    const line = code.slice(0, m.index).split('\n').length;
    problems.push(
      `${rel}:${line} — chữ ${n}pt, dưới sàn ${FLOOR}pt của Apple HIG. ` +
        'Muốn dày đặc hơn thì bớt nhãn đi, đừng thu nhỏ chữ.',
    );
  }
}

/**
 * The self-test.
 *
 * A regex that matches nothing reports a clean codebase, which is the one
 * failure this file cannot afford. So it is handed both spellings of the bug
 * and both spellings of the fix, plus a comment containing the bug — because
 * the note above this rule mentions "fontSize: 9" and a scanner that reads
 * prose would report its own explanation.
 */
const SELF = [
  ['stylesheet dưới sàn — bắt được', () => /fontSize[:=]\s*\{?\s*([0-9]+)/.exec('  label: { fontSize: 9, color: x },')?.[1] === '9'],
  ['SVG dưới sàn — bắt được', () => /fontSize[:=]\s*\{?\s*([0-9]+)/.exec('<SvgText fontSize={9}>')?.[1] === '9'],
  ['đúng sàn — không báo oan', () => Number(/fontSize[:=]\s*\{?\s*([0-9]+)/.exec('  label: { fontSize: 11 },')[1]) >= FLOOR],
  ['chú thích nhắc tới fontSize: 9 — không bị coi là code', () =>
    !/fontSize/.test(codeOnly('/* used to be fontSize: 9 */\nconst a = 1;'))],
  ['code thật vẫn còn sau khi bỏ chú thích', () =>
    /fontSize/.test(codeOnly('/* note */\n  label: { fontSize: 11 },'))],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('chữ nhỏ hơn sàn của Apple:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const above = [...sizes.keys()].filter((n) => n >= FLOOR).sort((a, b) => a - b);
const RAMP = [11, 13, 15, 17, 18, 22, 28];
const offRamp = above.filter((n) => !RAMP.includes(n) && n < 26);

console.log(
  `thang chữ OK — không chỗ nào dưới ${FLOOR}pt (sàn của Apple HIG, giữ nguyên cả ở mức Dynamic Type nhỏ nhất); ` +
    `${Object.keys(GRAPHIC_NUMERALS).length} tệp được miễn kèm lý do (chữ số nằm trong hình vẽ, không phải chữ trong bố cục); ` +
    `còn ${offRamp.length} cỡ chữ ngoài thang 7 bậc (${offRamp.join(', ')}) — chưa ép, vì gộp lại là một quyết định thiết kế chứ không phải một lỗi`,
);
