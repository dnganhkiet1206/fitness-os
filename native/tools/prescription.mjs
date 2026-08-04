/**
 * That a saved workout reads back the rest and effort it was built with.
 *
 * ── why this is worth a tool ──
 *
 * The builder asks for both on every exercise and stores both; the card showed
 * neither. Nothing about that looked broken — the card was correct about
 * everything it *did* say, and the two missing values are exactly the two a
 * person sets once and then trusts the app to remember. It took a user opening
 * a saved workout and finding half the prescription gone.
 *
 * Now that they are shown, the ways this goes quietly wrong are all about
 * *where*:
 *
 * **Said twice.** The line appears on the card when every exercise agrees and
 * on each exercise when they do not. Those are one condition and its negation,
 * written in two places, and if they ever stop being opposites the card either
 * prints the same two figures seven times or prints them nowhere.
 *
 * **Split by a field nobody set.** A stored exercise from before these fields
 * existed has no `restSeconds` at all, and it means the default — that is what
 * the app does with it everywhere else. Compare raw values and a workout where
 * five exercises say nothing and one says 90 looks like six different rests, so
 * a perfectly uniform workout fans out onto six lines. This is the failure that
 * looks most like a feature: nothing errors, the numbers are all correct, the
 * card is just noisier than it should be, on exactly the old templates whose
 * owners are least likely to say so.
 *
 * **Effort read backwards.** Effort 8 leaves two reps; 10 leaves none. Invert
 * that and the app confidently tells somebody to stop three reps early on the
 * set that was meant to be all-out.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'rx-'));

try {
  execFileSync('npx', ['tsc', 'src/lib/prescription.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const { DEFAULT_REST, DEFAULT_RPE, repsInReserve, restLabel, uniformValue } =
    createRequire(import.meta.url)(path.join(out, 'prescription.js'));

  const problems = [];
  const rest = (xs) => uniformValue(xs, (e) => e.restSeconds, DEFAULT_REST);

  // ── 1: rest, as a person reads a clock ──
  const CLOCK = {
    0: '0s', 15: '15s', 45: '45s', 59: '59s',
    60: '1:00', 90: '1:30', 105: '1:45', 120: '2:00', 600: '10:00',
  };
  for (const [secs, want] of Object.entries(CLOCK)) {
    const got = restLabel(Number(secs));
    if (got !== want) problems.push(`restLabel(${secs}) = "${got}", đáng lẽ "${want}"`);
  }

  // ── 2: effort → reps left, in both directions ──
  const RIR = { 10: 0, 9: 1, 8: 2, 7: 3, 6: 4, 5: 5 };
  for (const [rpe, want] of Object.entries(RIR)) {
    const got = repsInReserve(Number(rpe));
    if (got !== want) problems.push(`gắng sức ${rpe} → còn ${got} rep, đáng lẽ ${want}`);
  }
  // stored templates are free JSON — anything can be in there
  for (const [rpe, want] of [[12, 0], [11, 0], [3, 5], [0, 5], [-4, 5]]) {
    const got = repsInReserve(rpe);
    if (got !== want) problems.push(`gắng sức ngoài thang ${rpe} → ${got}, đáng lẽ kẹp về ${want}`);
  }

  // ── 3: the missing field means the default, not a third answer ──
  const MIXED = [
    ['tất cả đều trống', [{}, {}, {}], DEFAULT_REST],
    ['trống lẫn giá trị mặc định ghi rõ', [{}, { restSeconds: 90 }, {}], 90],
    ['đều ghi rõ và giống nhau', [{ restSeconds: 60 }, { restSeconds: 60 }], 60],
    ['khác nhau thật', [{ restSeconds: 60 }, { restSeconds: 120 }], null],
    ['một cái khác giá trị mặc định', [{}, { restSeconds: 120 }], null],
    ['danh sách rỗng', [], null],
  ];
  for (const [what, items, want] of MIXED) {
    const got = rest(items);
    if (got !== want) problems.push(`${what}: uniformValue → ${got}, đáng lẽ ${want}`);
  }
  if (uniformValue([{ rpe: null }, {}], (e) => e.rpe, DEFAULT_RPE) !== DEFAULT_RPE) {
    problems.push('rpe null phải được coi như thiếu, không phải một giá trị khác');
  }

  /*
    ── 4: said once, never twice, never nowhere ──

    The card and the rows carry the two halves of one condition. Read as source
    because that is where the mistake lives: both halves are one short line, and
    the way this breaks is a copy-paste that leaves them pointing the same way.
  */
  const card = readFileSync(path.join(NATIVE, 'src/components/ascnd/template-list.tsx'), 'utf8');
  const onCard = /\{sharedLine \? <Text style=\{styles\.tplRx\}>\{sharedLine\}<\/Text> : null\}/.test(card);
  const onRows = /\{sharedLine \? null : \(/.test(card);
  if (!onCard) problems.push('template-list: không thấy dòng nghỉ/gắng sức trên mặt thẻ');
  if (!onRows) problems.push('template-list: không thấy nhánh ngược lại trên từng bài — hai nhánh phải trái dấu nhau');

  /*
    Self-test: the split-by-a-missing-field bug, rebuilt.

    The naive version compares what is stored, so a workout where one exercise
    spells out the default and the rest leave it blank looks non-uniform. If
    that version passes the case above, the case is not testing anything.
  */
  const naive = (items) => {
    if (items.length === 0) return null;
    const first = items[0].restSeconds;
    return items.every((it) => it.restSeconds === first) ? first : null;
  };
  if (naive([{}, { restSeconds: 90 }, {}]) === 90) {
    console.error('phép tự kiểm hỏng — cách so sánh thô đáng lẽ phải trượt ca "trống lẫn 90", đừng tin kết quả');
    process.exit(1);
  }

  if (problems.length) {
    console.error('cách đọc lại nghỉ/gắng sức sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const n = Object.keys(CLOCK).length + Object.keys(RIR).length + 5 + MIXED.length;
  console.log(`nghỉ/gắng sức OK — ${n} ca, thiếu trường = mặc định, gắng sức 10 = hết sức, dòng chỉ hiện đúng một chỗ`);
} finally {
  rmSync(out, { recursive: true, force: true });
}
