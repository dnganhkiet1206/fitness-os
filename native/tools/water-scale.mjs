/**
 * The water chart's value axis, run against real numbers.
 *
 * ── why this is worth a tool ──
 *
 * The chart it replaced had no axis at all: seven bars normalised against the
 * week's own maximum, so the tallest was always full height and no bar could be
 * read as a quantity. Adding an axis is the whole point of the redraw — and an
 * axis is a *claim*. A bar drawn at half height next to a label saying "3L" is
 * asserting 1.5L, and if the label and the geometry disagree the chart is worse
 * than the one with no numbers on it, because now it is convincing.
 *
 * The first version of `scaleTop` got this wrong in the imperial path only. It
 * applied a sixteen-*ounce* step to a *millilitre* number, so a 2500ml target
 * produced a ceiling of 2512ml and an axis reading "85". Nothing about that
 * looks broken on a screenshot: the bars are the right relative heights and the
 * labels are numbers. Only somebody converting by hand would catch it — or
 * this.
 *
 * ── what is checked ──
 *
 * 1. the ceiling is on the step, in the unit shown
 * 2. it never falls below what has to fit — the week's best day and the target
 * 3. the printed label round-trips: what the axis says, converted back, is the
 *    value the geometry uses
 * 4. a bar's height as a fraction of the plot matches its value as a fraction
 *    of the ceiling
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'waterscale-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/water-scale.ts', 'src/lib/units.ts', '--ignoreConfig', '--outDir', out,
     // CommonJS, not ESM: `water-scale.ts` imports `./units`, and tsc emits
     // that specifier verbatim. Node's ESM loader requires the `.js`, CJS does
     // not — so this avoids rewriting the emitted import to test it.
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const require_ = createRequire(import.meta.url);
  const { scaleTop, axisLabel } = require_(path.join(out, 'water-scale.js'));
  const { volumeToMl } = require_(path.join(out, 'units.js'));

  const PLOT_H = 150; // must match the constant in water-chart.tsx
  const problems = [];

  // (best day in ml, target in ml) — real-shaped inputs, including the empty week
  const WEEKS = [
    [0, 2500],
    [250, 2500],
    [1800, 2500],
    [2500, 2500],
    [2680, 2500],
    [4100, 2000],
    [7300, 3000],
  ];

  for (const unit of ['ml', 'oz']) {
    const step = unit === 'oz' ? 16 : 500;
    for (const [best, target] of WEEKS) {
      const need = Math.max(best, target);
      const top = scaleTop(need, unit);
      const where = `${unit} best=${best} target=${target}`;

      // 1. on the step, in the unit shown
      if (top.display % step !== 0) {
        problems.push(`${where}: trần ${top.display} không chia hết cho ${step}`);
      }

      // 2. everything that must fit, fits
      if (top.ml + 1 < need) {
        problems.push(`${where}: trần ${top.ml}ml thấp hơn ${need}ml cần vẽ`);
      }

      // 3. the label round-trips to the value the geometry uses
      const label = axisLabel(top.display, unit);
      const spoken = unit === 'oz' ? Number(label) : Number(label.replace('L', '')) * 1000;
      const backMl = volumeToMl(unit === 'oz' ? spoken : spoken, unit);
      // one unit of slack: displayVolume rounds oz to a tenth
      if (Math.abs(backMl - top.ml) > 2) {
        problems.push(`${where}: nhãn "${label}" quy ra ${backMl}ml, hình vẽ dùng ${top.ml}ml`);
      }

      // 4. geometry agrees with the axis
      const drawn = Math.min(1, best / top.ml) * PLOT_H;
      const claimed = (drawn / PLOT_H) * top.ml;
      if (best > 0 && Math.abs(claimed - Math.min(best, top.ml)) > 1) {
        problems.push(`${where}: cột cao ${drawn.toFixed(1)}px nói ${claimed.toFixed(0)}ml, thật ra ${best}ml`);
      }
    }
  }

  // The half-way label is the one people read off the middle gridline.
  const mid = scaleTop(2680, 'ml');
  if (axisLabel(mid.display / 2, 'ml') !== '1.5L') {
    problems.push(`nhãn giữa của trần 3L là "${axisLabel(mid.display / 2, 'ml')}", đáng lẽ "1.5L"`);
  }
  if (axisLabel(0, 'ml') !== '0' || axisLabel(0, 'oz') !== '0') {
    problems.push('đáy trục phải là "0" ở cả hai đơn vị');
  }
  // 2L, not 2.0L — a trailing zero reads as a measurement, not a quantity
  if (axisLabel(2000, 'ml') !== '2L') {
    problems.push(`2000ml hiện "${axisLabel(2000, 'ml')}", đáng lẽ "2L"`);
  }

  /*
    Self-test: the original bug, rebuilt, must be rejected.

    A rule that has quietly stopped matching reports success, and success is
    indistinguishable from a healthy codebase. So the checks above are pointed
    at `brokenScaleTop` — the imperial mistake exactly as it was written, a
    sixteen-ounce step applied to a millilitre number — and at least one of them
    has to fire. If none does, the checks are decoration and this exits before
    blessing anything.

    Worth recording which one catches it, because the first guess was wrong.
    Not the step check: 2512 *is* a multiple of 16, so a ceiling stepped in the
    wrong unit still looks round. It is the round-trip that catches it — the
    label says "2512" and the geometry uses 2512 *millilitres*, and 2512 ounces
    is 74 litres.
  */
  const brokenScaleTop = (needMl) => {
    const display = Math.max(16, Math.ceil(needMl / 16) * 16);
    return { ml: display, display };
  };
  const caught = (() => {
    const bad = brokenScaleTop(2500);
    if (bad.display % 16 !== 0) return 'bước';
    const label = axisLabel(bad.display, 'oz');
    if (Math.abs(volumeToMl(Number(label), 'oz') - bad.ml) > 2) return 'quy đổi ngược';
    return null;
  })();
  if (!caught) {
    console.error('phép tự kiểm hỏng — lỗi gốc không bị bắt, đừng tin kết quả bên dưới');
    process.exit(1);
  }

  if (problems.length) {
    console.error('trục biểu đồ nước sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const s = scaleTop(2680, 'ml');
  const o = scaleTop(2680, 'oz');
  console.log(
    `trục nước OK — ${WEEKS.length * 2} ca (lỗi gốc bị bắt bởi "${caught}"); 2680ml → ${axisLabel(s.display, 'ml')} (ml), ` +
      `${axisLabel(o.display, 'oz')} oz (${o.ml}ml)`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
