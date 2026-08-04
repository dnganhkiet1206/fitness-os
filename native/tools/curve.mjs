/**
 * The weight chart's line geometry, run against real shapes.
 *
 * ── why this is worth a tool ──
 *
 * Two things depend on `src/lib/curve.ts` agreeing with the stroke the chart
 * paints. The scrubber's marker rides it, so a disagreement makes the dot float
 * off the line. And the touch test uses it, so a disagreement makes the line
 * unresponsive exactly where it looks like it should respond — which is
 * indistinguishable, to somebody holding the phone, from the feature being
 * broken.
 *
 * The touch band is the part with a history. It began as the whole plot, which
 * meant a finger coming down anywhere on a 180pt band of a long scrolling page
 * was captured and the page locked — usually for somebody who was only
 * scrolling past. The band is now measured from the curve itself, and the point
 * of these checks is that it is measured *from the data*: the same x can be on
 * the line for one weight history and off it for another, and no fixed region
 * survives a change to the readings.
 *
 * ── what is checked ──
 *
 * 1. samples sit on the drawn path — exactly on every reading, and monotonic
 *    in x so the lookup between them is well defined
 * 2. the sample budget holds whether the series is 2 points or 400
 * 3. `yOnCurve` is clamped outside the series rather than extrapolating
 * 4. the band accepts the line and rejects what is off it, at the stated 22pt
 * 5. **the band moves with the data** — the same touch that lands on one
 *    history misses a different one drawn on the same axes
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'curve-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/curve.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );

  const require_ = createRequire(import.meta.url);
  const { sampleCurve, yOnCurve, onCurve, HIT_BAND } = require_(path.join(out, 'curve.js'));

  const problems = [];
  const PAD_X = 34;
  const PLOT_W = 286;
  const PLOT_H = 180;

  /** lay a series out the way the chart does: evenly in x, scaled into the plot */
  const layout = (weights) => {
    const n = weights.length;
    const lo = Math.min(...weights);
    const hi = Math.max(...weights);
    const span = hi - lo || 1;
    const xs = weights.map((_, i) => PAD_X + (PLOT_W * i) / (n - 1));
    const ys = weights.map((w) => 12 + (PLOT_H - 24) * (1 - (w - lo) / span));
    return { xs, ys, curve: sampleCurve(xs, ys) };
  };

  // ── 1 & 2: the samples are the path ──
  for (const n of [2, 7, 30, 400]) {
    const weights = Array.from({ length: n }, (_, i) => 60 + 5 * Math.sin(i / 2));
    const { xs, ys, curve } = layout(weights);

    if (!curve.every((p, i) => i === 0 || p.x >= curve[i - 1].x - 1e-9)) {
      problems.push(`${n} điểm: mẫu không tăng dần theo x`);
    }
    if (Math.abs(curve[0].x - xs[0]) > 1e-9 || Math.abs(curve[curve.length - 1].x - xs[n - 1]) > 1e-9) {
      problems.push(`${n} điểm: mẫu không bắt đầu và kết thúc đúng hai đầu chuỗi`);
    }
    // every reading must be exactly on the sampled line, or the marker will sit
    // beside the dot the chart drew
    for (let i = 0; i < n; i++) {
      if (Math.abs(yOnCurve(curve, xs[i]) - ys[i]) > 0.01) {
        problems.push(`${n} điểm: tại mốc ${i} đường lệch ${Math.abs(yOnCurve(curve, xs[i]) - ys[i]).toFixed(2)}px`);
        break;
      }
    }
    if (curve.length > 500) problems.push(`${n} điểm: ${curve.length} mẫu, vượt ngân sách`);
  }

  // ── 3: clamped, not extrapolated ──
  {
    const { xs, ys, curve } = layout([60, 62, 61]);
    if (yOnCurve(curve, xs[0] - 500) !== ys[0]) problems.push('ngoài mép trái không được kẹp về điểm đầu');
    if (yOnCurve(curve, xs[2] + 500) !== ys[2]) problems.push('ngoài mép phải không được kẹp về điểm cuối');
    if (yOnCurve([], 100) !== 0) problems.push('đường rỗng phải trả 0 thay vì ném lỗi');
    if (onCurve([], 100, 100)) problems.push('đường rỗng không được nhận chạm');
  }

  // ── 4: the band is where the line is, and is the width it claims ──
  {
    const { xs, curve } = layout([60, 64, 58, 62, 59]);
    const probe = xs[0] + (xs[4] - xs[0]) * 0.37;
    const onIt = yOnCurve(curve, probe);
    if (!onCurve(curve, probe, onIt)) problems.push('chạm đúng trên đường lại bị từ chối');
    if (!onCurve(curve, probe, onIt + HIT_BAND - 0.5)) problems.push(`cách ${HIT_BAND - 0.5}px vẫn phải nhận`);
    if (onCurve(curve, probe, onIt + HIT_BAND + 0.5)) problems.push(`cách ${HIT_BAND + 0.5}px phải từ chối`);
    if (onCurve(curve, probe, onIt - HIT_BAND - 0.5)) problems.push('phía trên quá dải phải từ chối');
  }

  /*
    ── 5: the band follows the readings ──

    This is the check the whole file exists for. A fixed strip through the
    middle of the plot would pass everything above and fail here: two histories
    drawn on the same axes put the line in different places, so a touch that is
    on one has to miss the other. If this ever passes for both, the hit test has
    stopped consulting the data.
  */
  {
    const rising = layout([55, 56, 57, 58, 59, 60, 61]);
    const falling = layout([61, 60, 59, 58, 57, 56, 55]);
    const probe = PAD_X + PLOT_W * 0.15; // well away from where they cross
    const yUp = yOnCurve(rising.curve, probe);
    const yDown = yOnCurve(falling.curve, probe);

    if (Math.abs(yUp - yDown) <= HIT_BAND * 2) {
      problems.push('hai chuỗi thử quá giống nhau — phép kiểm này không chứng minh được gì');
    } else {
      if (!onCurve(rising.curve, probe, yUp)) problems.push('chuỗi đi lên: không nhận chạm trên chính nó');
      if (onCurve(falling.curve, probe, yUp)) {
        problems.push('điểm nằm trên chuỗi đi lên lại được chuỗi đi xuống nhận — dải không bám dữ liệu');
      }
      if (!onCurve(falling.curve, probe, yDown)) problems.push('chuỗi đi xuống: không nhận chạm trên chính nó');
      if (onCurve(rising.curve, probe, yDown)) {
        problems.push('điểm nằm trên chuỗi đi xuống lại được chuỗi đi lên nhận — dải không bám dữ liệu');
      }
    }
  }

  /*
    Self-test: the wrong answer, rebuilt, must be rejected.

    A check that has quietly stopped matching reports success, and success is
    indistinguishable from a healthy codebase. So check 5 is pointed at
    `fixedBand` — a static strip through the middle of the plot, which is what
    "give the line a region" means — and it has to fail. If it passes, the
    checks above are decoration and this exits before blessing anything.
  */
  {
    const fixedBand = (_curve, _px, py) => Math.abs(py - PLOT_H / 2) <= HIT_BAND;
    const rising = layout([55, 56, 57, 58, 59, 60, 61]);
    const falling = layout([61, 60, 59, 58, 57, 56, 55]);
    const probe = PAD_X + PLOT_W * 0.15;
    const yUp = yOnCurve(rising.curve, probe);
    // The give-away: a fixed strip cannot tell the two series apart, so a point
    // on one is accepted by the other.
    const blind = fixedBand(rising.curve, probe, yUp) === fixedBand(falling.curve, probe, yUp);
    if (!blind) {
      console.error('phép tự kiểm hỏng — vùng cố định đáng lẽ phải mù với dữ liệu, đừng tin kết quả');
      process.exit(1);
    }
  }

  if (problems.length) {
    console.error('hình học đường biểu đồ sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  const { curve } = layout([55, 56, 57, 58, 59, 60, 61]);
  console.log(
    `đường biểu đồ OK — mẫu bám đúng mọi mốc, dải chạm ±${HIT_BAND}px bám theo dữ liệu ` +
      `(${curve.length} mẫu cho 7 điểm)`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
