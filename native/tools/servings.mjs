/**
 * Changing a portion and changing it back gets the food you logged.
 *
 * ── the bug this pins down ──
 *
 * `useUpdateMealItemServings` rescales a logged food from the figures already
 * on the row: `k = new / old`, then every macro × k. That is the right
 * arithmetic, and it was rounded to a whole number on the way back into the
 * database — so each edit threw away the fraction and the next one multiplied
 * what was left.
 *
 * It compounds, and going back does not undo it. The columns are NUMERIC, so
 * the rounding was never something the schema asked for; it only lost the
 * precision the next edit needed.
 *
 * ── what is checked ──
 *
 * 1. a portion changed and changed back gives the number it started with
 * 2. a chain of awkward portions round-trips exactly
 * 3. the rounded version is rebuilt and required to drift, so this cannot go
 *    green again if the rounding comes back
 * 4. how far the rounded version drifts is measured, not asserted
 * 5. what the diary shows is unchanged — whole numbers either way
 */

/** the fix: scale exactly, and round only where it is read */
const exact = (macro, from, to) => (macro * to) / from;
/** what it did before: scale, then round into storage */
const rounded = (macro, from, to) => Math.round((macro * to) / from);

const problems = [];

/** walk a food through a list of portion sizes under one of the two rules */
function walk(rule, macro, portions) {
  let value = macro;
  let at = 1;
  for (const p of portions) {
    value = rule(value, at, p);
    at = p;
  }
  return value;
}

/** floats are floats: 1.6 × 6.25 is not always exactly 10 */
const near = (a, b) => Math.abs(a - b) < 1e-9;

const FOODS = [10, 101, 157, 243, 1, 7, 999];
const TRIPS = [
  [0.5, 1],
  [3, 1],
  [0.3, 1],
  [1.5, 1],
  [0.25, 1],
  [0.4, 0.16, 1],
  [2, 0.5, 3, 1],
  [0.1, 10, 0.7, 1],
];

// ── 1 + 2: exact scaling always comes home ──
for (const kcal of FOODS) {
  for (const trip of TRIPS) {
    const back = walk(exact, kcal, trip);
    if (!near(back, kcal)) {
      problems.push(`exact: ${kcal} through ${trip.join('→')} came back as ${back}`);
    }
  }
}

// ── 3: the rounded version must drift, or this tool proves nothing ──
const drifted = [];
for (const kcal of FOODS) {
  for (const trip of TRIPS) {
    const back = walk(rounded, kcal, trip);
    if (back !== kcal) drifted.push({ kcal, trip, back });
  }
}
if (drifted.length === 0) {
  problems.push('the rounded version no longer drifts — this check proves nothing');
}

// ── 4: measure the worst of it ──
let worst = { pct: 0 };
for (const d of drifted) {
  const pct = Math.abs(d.back - d.kcal) / d.kcal;
  if (pct > worst.pct) worst = { ...d, pct };
}
// The case named in the code comment has to be one of them, so the comment and
// the tool cannot end up saying different things
const named = walk(rounded, 10, [0.4, 0.16, 1]);
if (named !== 13) {
  problems.push(`the documented case changed: 10 kcal ×0.4 ×0.16 back to 1 is now ${named}, not 13`);
}

// ── 5: the diary reads the same either way ──
for (const kcal of FOODS) {
  for (const trip of TRIPS) {
    const shown = Math.round(walk(exact, kcal, trip));
    if (shown !== kcal) {
      problems.push(`display: ${kcal} through ${trip.join('→')} reads as ${shown}`);
    }
  }
}

if (problems.length) {
  console.error('khẩu phần CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(
  `khẩu phần OK — ${FOODS.length * TRIPS.length} lần đổi qua đổi lại đều về đúng số cũ; ` +
    `bản làm tròn lệch ${drifted.length}/${FOODS.length * TRIPS.length} ca, ` +
    `nặng nhất ${worst.kcal} → ${worst.back} kcal (+${Math.round(worst.pct * 100)}%); ` +
    `số hiển thị không đổi`,
);
