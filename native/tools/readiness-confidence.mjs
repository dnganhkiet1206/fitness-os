/**
 * Missing data must not become reassurance, and a thin number must not wear a
 * thick one's confidence.
 *
 * ── the two faults this was written for ──
 *
 * **1. `acwr` was never null.** `getACWR(0, 0, …)` returns `0`, so an account
 * that had never logged a session stored exactly what somebody who trained hard
 * for a month and then took a full rest week stored. Those are opposite states —
 * *nothing is known* against *thoroughly rested* — and the app had given the
 * missing one a number, which is a claim.
 *
 * That is precisely the shape this repository keeps finding: `acwr ?? 0`,
 * `meals?.length ?? 0`, an unread day scored as an empty one. The absent value
 * gets a numeral, the numeral gets used, and nothing anywhere reports a fault.
 *
 * **2. The score carried no trace of how thin it was.** The engine drops the
 * dimensions it cannot measure and renormalises the rest, which is right. But it
 * meant a readiness of 72 built from sleep alone rendered identically to a 72
 * built from HRV, resting heart rate, sleep and training load. This is the
 * screen on which somebody decides whether to train hard today.
 *
 * ── and why the banding lives in one place ──
 *
 * The engine knows the dimension count directly; the dashboard recovers it from
 * `readiness_explain`. Two routes to the same count, so the *banding* must not
 * be typed twice — a threshold copied is a threshold that drifts, six times
 * over in this repository. `readinessConfidence` is exported and both call it.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'readyconf-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/readiness-engine.ts', 'src/lib/readiness-i18n.ts', 'src/lib/training-card.ts',
       'src/lib/local-date.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const req = createRequire(import.meta.url);
  const { computeReadiness, readinessConfidence } = req(path.join(out, 'readiness-engine.js'));
  const { readinessSubscores } = req(path.join(out, 'readiness-i18n.js'));

  /** Everything absent unless named, so each case says exactly what it has. */
  const run = (over) =>
    computeReadiness({
      hrv_today: undefined,
      hrv_history_28d: [],
      rhr_today: undefined,
      rhr_history_28d: [],
      sleep_min_lastnight: undefined,
      sleep_target_min: 480,
      sleep_debt_7d_min: 0,
      training_load_7d: 0,
      training_load_28d: 0,
      training_days_28d: 28,
      ...over,
    });

  const FULL = {
    hrv_today: 60,
    hrv_history_28d: [58, 60, 62, 59, 61, 60],
    rhr_today: 55,
    rhr_history_28d: [55, 56, 54, 55, 57],
    sleep_min_lastnight: 450,
    training_load_7d: 2400,
    training_load_28d: 9000,
  };

  /* ── 1. no chronic base → acwr is null, never 0 ── */
  {
    const fresh = run({ sleep_min_lastnight: 450 });
    if (!fresh) {
      problems.push('một tài khoản chỉ có giấc ngủ mà computeReadiness trả null — bộ quét hỏng');
    } else if (fresh.acwr !== null) {
      problems.push(
        `tài khoản chưa từng ghi buổi tập nào ra acwr = ${fresh.acwr} thay vì null. 0 là một KHẲNG ĐỊNH ` +
          '— nó nói "tuần này không tập, so với nền của bạn" — còn ở đây không có nền nào cả. ' +
          'Chính là hình dạng `acwr ?? 0` mà repo này đã sửa nhiều lần: thiếu dữ liệu được gán một ' +
          'con số, con số đó được dùng, và không đâu báo lỗi',
      );
    }
  }

  /* ── 2. …and 0 keeps its real meaning when a base exists ──

     A full rest week after a month of training is a fact worth having, and it
     must not be collapsed into the same value as an empty account. */
  {
    const rested = run({ ...FULL, training_load_7d: 0, training_load_28d: 9000 });
    if (!rested || rested.acwr !== 0) {
      problems.push(
        `một tuần nghỉ hoàn toàn SAU một tháng tập ra acwr = ${rested?.acwr} thay vì 0 — đây là một ` +
          'trạng thái có thật (nghỉ ngơi đầy đủ) và phải phân biệt được với tài khoản trống',
      );
    }
  }

  /* ── 3. confidence tracks the number of dimensions, and only that ──

     `dims` is what the case *intends* to supply, and it is checked against what
     the engine actually measured before the confidence is judged. Without that
     step this section grades itself: the first draft handed resting heart rate
     a three-reading baseline, the engine correctly refused it (a median and a
     MAD need five), and the case then failed as though the *banding* were
     wrong. A fixture that quietly supplies less than it claims turns every
     assertion below it into a statement about nothing — the same shape as the
     product bugs this repository keeps finding, in the tool meant to catch
     them. Checking the measured count separately also catches the opposite
     fault, an engine that silently stops scoring a dimension it used to. */
  {
    const RHR_BASE = [55, 56, 54, 55, 57];
    const CASES = [
      { name: 'chỉ có giấc ngủ', over: { sleep_min_lastnight: 450 }, want: 'low', dims: 1 },
      {
        name: 'giấc ngủ + nhịp nghỉ',
        over: { sleep_min_lastnight: 450, rhr_today: 55, rhr_history_28d: RHR_BASE },
        want: 'medium',
        dims: 2,
      },
      {
        name: 'giấc ngủ + nhịp nghỉ + tải',
        over: {
          sleep_min_lastnight: 450,
          rhr_today: 55,
          rhr_history_28d: RHR_BASE,
          training_load_7d: 2400,
          training_load_28d: 9000,
        },
        want: 'high',
        dims: 3,
      },
      { name: 'đủ bốn chiều', over: FULL, want: 'high', dims: 4 },
    ];
    for (const c of CASES) {
      const r = run(c.over);
      if (!r) {
        problems.push(`"${c.name}" trả null — phải có điểm`);
        continue;
      }
      const measured = Object.values(r.subscores).filter((v) => v !== undefined).length;
      if (measured !== c.dims) {
        problems.push(
          `"${c.name}" định cấp ${c.dims} chiều nhưng engine chỉ chấm được ${measured} — hoặc dữ liệu ` +
            'mẫu thiếu (một baseline nhịp tim cần 5 lần đo, không phải 3), hoặc engine đã lặng lẽ bỏ ' +
            'chấm một chiều nó từng chấm. Cả hai đều khiến các khẳng định bên dưới nói về một thứ khác',
        );
        continue;
      }
      if (r.confidence !== c.want) {
        problems.push(
          `"${c.name}" (${c.dims} chiều) ra độ tin cậy '${r.confidence}' nhưng phải là '${c.want}' — ` +
            'một điểm dựng từ MỘT phép đo không được trông giống hệt một điểm dựng từ bốn',
        );
      }
      /* and the dashboard recovers the same count from the stored token */
      const recovered = Object.keys(readinessSubscores(r.explainToken)).length;
      if (readinessConfidence(recovered) !== r.confidence) {
        problems.push(
          `"${c.name}": engine nói '${r.confidence}' còn màn hình đọc lại từ readiness_explain ra ` +
            `'${readinessConfidence(recovered)}' (${recovered} chiều) — hai đường tới cùng một con số ` +
            'mà không khớp, tức người dùng thấy một mức tin cậy khác với mức engine đã tính',
        );
      }
    }
  }

  /* ── 4. a thin score is still a real score ──

     The opposite failure, and the tempting one: refusing to score at all until
     everything is measured would leave most people with a blank gauge for
     weeks. Thin is fine; thin *pretending to be thick* is not. */
  {
    const thin = run({ sleep_min_lastnight: 450 });
    if (!thin || typeof thin.score !== 'number' || thin.score <= 0) {
      problems.push('một chỉ số đo được vẫn phải ra một điểm thật — từ chối chấm là bỏ trống màn hình hàng tuần');
    }
    const nothing = run({});
    if (nothing !== null) {
      problems.push(
        `không đo được gì mà vẫn ra điểm (${nothing?.score}) — không dữ liệu thì phải là null, ` +
          'chứ một số 0 đỏ chót là lời khẳng định sai về cơ thể người ta',
      );
    }
  }

  /* ── 5. the banding is a ladder and has no gaps ── */
  {
    for (const n of [0, 1, 2, 3, 4, 9]) {
      const c = readinessConfidence(n);
      if (!['low', 'medium', 'high'].includes(c)) {
        problems.push(`readinessConfidence(${n}) ra '${c}' — ngoài ba mức`);
      }
    }
    if (readinessConfidence(1) !== 'low' || readinessConfidence(2) !== 'medium' || readinessConfidence(3) !== 'high') {
      problems.push('thang độ tin cậy không còn là 1 → low, 2 → medium, 3+ → high');
    }
  }

  /* ── 6. and the gauge really says it ── */
  {
    const gauge = readFileSync(path.join(NATIVE, 'src/components/ascnd/readiness-gauge.tsx'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (!/readinessConfidence\(/.test(gauge)) {
      problems.push(
        'gauge không gọi readinessConfidence — hoặc nó không nói gì về độ tin cậy, hoặc nó tự gõ lại ' +
          'ngưỡng, và ngưỡng gõ lại là ngưỡng sẽ lệch',
      );
    }
    if (/confidence !== 'high'/.test(gauge) === false) {
      problems.push('gauge không ẩn dòng độ tin cậy khi đã đủ chiều — một dòng luôn hiện là một dòng thôi được đọc');
    }
  }

  if (problems.length) {
    console.log('độ tin cậy điểm sẵn sàng CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    'độ tin cậy điểm sẵn sàng OK — acwr là null khi CHƯA CÓ nền để so (bản cũ ra 0, tức tài khoản ' +
      'chưa từng tập lưu đúng cùng một giá trị với người tập cả tháng rồi nghỉ trọn một tuần — hai ' +
      'trạng thái ngược nhau), và 0 giữ nguyên nghĩa thật của nó khi nền có tồn tại; độ tin cậy bám ' +
      'theo SỐ CHIỀU đo được (1 → low, 2 → medium, 3+ → high) nên một điểm 72 dựng từ mỗi giấc ngủ ' +
      'không còn trông giống hệt một điểm 72 dựng từ bốn chiều; engine và màn hình tới cùng con số ' +
      'ấy bằng hai đường khác nhau — engine đếm trực tiếp, màn hình đọc lại từ readiness_explain — ' +
      'nên phép chia mức nằm ở MỘT chỗ và cả hai cùng gọi; một chỉ số vẫn ra điểm thật (từ chối chấm ' +
      'sẽ bỏ trống màn hình hàng tuần), còn không đo được gì thì trả null chứ không phải 0 đỏ chót',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
