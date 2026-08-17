/**
 * That the load engine is measuring the two things it says it is measuring.
 *
 * ── the bug this was written for ──
 *
 * `load-progression.ts` exists to compare two quantities its own header names:
 * the effort a workout **asks for** (`rpe` on the template, summarised by
 * `effortRange`) against the effort the person **reported** (`session_rpe`, the
 * chip row on the log sheet). The single call site fed the *same* value into
 * both sides — it passed the sheet's reported-effort state as `target`.
 *
 * Run against the real engine, with a fixed history of three sessions reported
 * at 7 and nothing else changing:
 *
 *     hôm nay gõ 6  → down, −5%
 *     hôm nay gõ 7  → hold
 *     hôm nay gõ 8  → up,   +5%
 *     hôm nay gõ 9  → up,  +10%
 *
 * The person's history is identical in all four rows. The advice moves entirely
 * with the number they type about *today* — so the harder you say today was, the
 * more the app tells you to add. This is the only advice in the app that can
 * contribute to somebody getting hurt, and it was inverted.
 *
 * ── and the second half: a gate that switches itself off ──
 *
 * Two of the three guards on "add load" are written
 * `situationConfidence != null && !== 'none'`. `useUserState` reads the React
 * Query **cache** and mounts no observer — by design, so the companion layer
 * costs no requests — so a screen that never fetched the streak gets confidence
 * `none` and both guards vanish. The streak's key carries today's date, so the
 * first launch of a new day is enough: open the app, go to the workouts tab,
 * log a session, and the sheet offers ten per cent more to somebody the app
 * itself would have called overreached.
 *
 * ── what is checked, and why it is not "did you apply the patch" ──
 *
 * Rules 1–3 **run the engine** on boundary and pathological inputs, so the
 * hazard is demonstrated rather than asserted. Rules 4–6 are about the wiring
 * and are stated as properties of the *shape*: the identifier a screen writes to
 * `session_rpe` may not also be the one it hands the engine as `target`, nor the
 * one it quotes in the sentence; and a screen that hands the engine a confidence
 * must give that confidence a source. None of them name a variable this round
 * introduced.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
/* Comments name the bugs, so every static rule reads code with the prose
   blanked — newlines kept so line numbers survive. */
const strip = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const problems = [];

/* ── load the real engine ── */
const out = mkdtempSync(path.join(tmpdir(), 'prog-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/load-progression.ts', 'src/lib/goal-training.ts', 'src/lib/prescription.ts',
     '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* No project tsconfig here, so tsc exits non-zero over the `@/` mapping while
     still emitting the JS — the trick `tools/streak.mjs` documents. The
     `user-state` import is type-only and is erased. */
}
{
  const p = path.join(out, 'load-progression.js');
  writeFileSync(
    p,
    readFileSync(p, 'utf8')
      .replaceAll('@/lib/goal-training', './goal-training')
      .replaceAll('@/lib/prescription', './prescription'),
  );
}
const require_ = createRequire(import.meta.url);
const { suggestLoad, MIN_SESSIONS, RPE_MARGIN, STEP, MAX_STEP } = require_(path.join(out, 'load-progression.js'));
const { goalRpeTarget, goalTraining, WHO_STRENGTH_DAYS } = require_(path.join(out, 'goal-training.js'));
const { DEFAULT_RPE } = require_(path.join(out, 'prescription.js'));

/* The engine has to be the one under test. A require that silently gave back
   something else would make every assertion below vacuous. */
if (typeof suggestLoad !== 'function' || MIN_SESSIONS == null || RPE_MARGIN == null) {
  console.error('tự kiểm hỏng: không nạp được suggestLoad thật — đừng tin kết quả');
  process.exit(2);
}

/* ── 1: the direction of the verdict, and the boundary it turns on ──

   Derived independently and compared, rather than snapshotted: for a history
   whose mean sits `d` from the target, the sign of the advice is the sign of
   `-d` once `|d|` reaches `RPE_MARGIN`, and nothing inside the margin moves. */
{
  const target = 7;
  const verdict = (mean) => suggestLoad({ reported: [mean, mean, mean], target }).advice;
  const cases = [
    [target - RPE_MARGIN - 0.01, 'up'],
    [target - RPE_MARGIN, 'up'],
    [target - RPE_MARGIN + 0.01, 'hold'],
    [target, 'hold'],
    [target + RPE_MARGIN - 0.01, 'hold'],
    [target + RPE_MARGIN, 'down'],
    [target + RPE_MARGIN + 0.01, 'down'],
  ];
  for (const [mean, want] of cases) {
    const got = verdict(mean);
    if (got !== want) {
      problems.push(
        `suggestLoad: trung bình ${mean} so với mức đặt ${target} ra '${got}', đáng lẽ '${want}' — ` +
          `biên RPE_MARGIN=${RPE_MARGIN} không còn là chỗ lời khuyên đổi chiều`,
      );
    }
  }
  /*
    ── and the margin itself, anchored to its reason rather than to itself ──

    The cases above derive their expectations *from* `RPE_MARGIN`, so they hold
    whatever it is — which means loosening the constant would slide the whole
    test with it and report green. (It did, on the first run of this file.)

    So the margin is pinned to the argument the engine gives for it: the scale is
    self-reported in whole numbers, nobody is consistent to a half point, and a
    gap under one point is noise. That makes two things checkable without naming
    the constant:

      · a whole point is the smallest gap that may move anything;
      · and the default target from a goal is 7.5, so somebody reporting a
        steady 7 sits half a point below it — a difference their own scale
        cannot express. Being told to add load for that is the failure.
  */
  if (!(RPE_MARGIN >= 1)) {
    problems.push(
      `RPE_MARGIN = ${RPE_MARGIN}, dưới một điểm. Thang RPE được tự báo cáo bằng SỐ NGUYÊN, nên một ` +
        'khoảng nhỏ hơn một điểm là nhiễu chứ không phải tín hiệu — và mục tiêu mặc định theo goal là ' +
        '7.5, nên biên dưới 1 sẽ bảo người báo đều đặn 7 rằng hãy tăng tạ',
    );
  }
  {
    const steady7 = suggestLoad({ reported: [7, 7, 7], goal: 'maintain' }).advice;
    if (steady7 !== 'hold') {
      problems.push(
        `ba buổi báo đều 7 so với mục tiêu mặc định ${goalRpeTarget('maintain')} ra '${steady7}' thay vì ` +
          "'hold' — nửa điểm là thứ thang số nguyên không diễn đạt được, không phải căn cứ để đổi tải",
      );
    }
  }

  /* The step is a fraction, it grows with the gap, and it is capped. Checked as
     arithmetic rather than as three literals: a cap that stopped capping would
     be a suggestion to add half a person's working weight. */
  /* Gaps stay under the target, so the "too light" side keeps its reported
     values above zero — the engine drops anything at or below it as "nobody
     answered", and a case built out of dropped values tests nothing. */
  for (const gap of [1, 1.5, 2, 3, 5, 6]) {
    const up = suggestLoad({ reported: [target - gap, target - gap, target - gap], target });
    const down = suggestLoad({ reported: [target + gap, target + gap, target + gap], target });
    const want = Math.min(STEP * Math.round(gap), MAX_STEP);
    if (up.step !== want || down.step !== -want) {
      problems.push(
        `suggestLoad: chênh ${gap} điểm ra bước ${up.step}/${down.step}, đáng lẽ ±${want} ` +
          `(STEP=${STEP}, trần MAX_STEP=${MAX_STEP})`,
      );
    }
    if (Math.abs(up.step) > MAX_STEP || Math.abs(down.step) > MAX_STEP) {
      problems.push(`suggestLoad: bước ${up.step} vượt trần ${MAX_STEP}`);
    }
  }
}

/* ── 2: nothing, and never a number, out of nothing ──

   Every one of these is a shape that has reached this engine or one beside it in
   this codebase: an empty list, too few points, nulls where somebody did not
   answer, a zero standing in for "no answer", and values a text field can
   produce. None of them may become a verdict. */
{
  const cases = [
    ['danh sách rỗng', { reported: [], target: 7 }, 'unknown'],
    ['dưới MIN_SESSIONS', { reported: [6, 6], target: 7 }, 'unknown'],
    ['toàn null', { reported: [null, null, null, null], target: 7 }, 'unknown'],
    ['toàn NaN', { reported: [NaN, NaN, NaN], target: 7 }, 'unknown'],
    ['toàn số âm', { reported: [-5, -5, -5], target: 7 }, 'unknown'],
    ['toàn 0 — không trả lời, không phải gắng sức 0', { reported: [0, 0, 0], target: 7 }, 'unknown'],
    ['null xen giữa vẫn đủ 3 số thật', { reported: [6, null, 6, undefined, 6], target: 7 }, 'up'],
  ];
  for (const [label, input, want] of cases) {
    const got = suggestLoad(input);
    if (got.advice !== want) {
      problems.push(`suggestLoad: ${label} → '${got.advice}', đáng lẽ '${want}'`);
    }
    if (!Number.isFinite(got.step) || !Number.isFinite(got.target)) {
      problems.push(`suggestLoad: ${label} → bước hoặc mức đặt không phải số hữu hạn`);
    }
  }
  /* A target of zero or nothing at all falls back to the goal, then to
     `DEFAULT_RPE` — never to a comparison against zero, which would read every
     session ever logged as far too hard. */
  for (const bad of [0, null, undefined, NaN]) {
    const t = suggestLoad({ reported: [7, 7, 7], target: bad }).target;
    if (!(t > 0)) {
      problems.push(`suggestLoad: mức đặt ${String(bad)} rơi về ${t} — mọi buổi sẽ bị đọc là quá nặng`);
    }
  }
}

/* ── 3: the gates, and the exact condition that switches them off ──

   The first two assertions are the guard doing its job. The third and fourth are
   the hazard rule 6 exists to close, demonstrated here rather than described:
   the same overreached person, with the state unread, is told to add the maximum
   step. And the last is the rule that must never be gated — too heavy always
   gets through. */
{
  const light = { reported: [6, 6, 6], target: 8 };
  const expect = (label, input, want) => {
    const got = suggestLoad(input).advice;
    if (got !== want) problems.push(`suggestLoad: ${label} → '${got}', đáng lẽ '${want}'`);
  };
  expect('quá tải, biết chắc', { ...light, situation: 'overreaching', situationConfidence: 'high' }, 'hold');
  expect('vừa quay lại, biết chắc', { ...light, situation: 'returning', situationConfidence: 'high' }, 'hold');
  expect('điểm sẵn sàng đỏ', { ...light, readiness: 'red' }, 'hold');
  const blind = suggestLoad({ ...light, situation: 'overreaching', situationConfidence: 'none' });
  if (blind.advice !== 'up') {
    problems.push(
      'tự kiểm hỏng: engine không còn khuyên tăng khi độ tin cậy là none — ' +
        'luật 6 được viết cho đúng nguy cơ đó, và nếu nó biến mất thì luật 6 đang canh một chỗ trống',
    );
  }
  expect('quá nặng, dù đang quá tải', { reported: [10, 10, 10], target: 7, situation: 'overreaching', situationConfidence: 'high' }, 'down');
  expect('quá nặng, dù điểm sẵn sàng đỏ', { reported: [10, 10, 10], target: 7, readiness: 'red' }, 'down');
}

/* ── 4: the goal reaches the engine, and never below the floor ── */
{
  if (goalRpeTarget('strength') <= goalRpeTarget('maintain')) {
    problems.push('mục tiêu strength không còn nhắm cao hơn maintain — goal không chạm tới engine nữa');
  }
  for (const goal of ['strength', 'bulk', 'cut', 'maintain', 'recomp', 'endurance', null, undefined, '', 'khong-ton-tai']) {
    const g = goalTraining(goal);
    if (g.strengthDays < WHO_STRENGTH_DAYS) {
      problems.push(`goalTraining('${goal}').strengthDays = ${g.strengthDays}, dưới sàn WHO ${WHO_STRENGTH_DAYS}`);
    }
    const t = goalRpeTarget(goal);
    if (!(t >= 1 && t <= 10)) {
      problems.push(`goalRpeTarget('${goal}') = ${t} — ngoài thang RPE`);
    }
  }
  if (!(DEFAULT_RPE >= 1 && DEFAULT_RPE <= 10)) {
    problems.push(`DEFAULT_RPE = ${DEFAULT_RPE} — ngoài thang RPE`);
  }
}

/* ── the static half: the wiring at the one place that turns this into words ── */

const CALLERS = globSync('src/**/*.{ts,tsx}', { cwd: NATIVE })
  .sort()
  .filter((f) => f !== 'src/lib/load-progression.ts' && /\bsuggestLoad\s*\(/.test(strip(read(f))));

if (CALLERS.length === 0) {
  console.error('tự kiểm hỏng: không tìm thấy chỗ nào gọi suggestLoad — các luật dưới đang không kiểm gì cả');
  process.exit(2);
}

/**
 * The identifier a file writes as the session's **reported** effort.
 *
 * `sessionRpe:` is the field `useLogWorkoutSession` and the offline queue both
 * carry into `workout_sessions.session_rpe`, which `load-progression.ts` defines
 * as what the person reported. Whatever expression a screen puts there is that
 * screen's reported-effort value, by definition.
 */
function reportedIdent(code) {
  const m = code.match(/sessionRpe:\s*([A-Za-z_$][\w$]*)\s*[,\n]/);
  return m ? m[1] : null;
}

/* ── 5: reported is not asked-for, and is not what the sentence quotes ── */
for (const f of CALLERS) {
  const code = strip(read(f));
  const reported = reportedIdent(code);
  if (!reported) continue;

  const target = code.match(/\btarget:\s*([^,\n]+)/)?.[1]?.trim();
  if (target && new RegExp(`^${reported}$`).test(target)) {
    problems.push(
      `${f}: đưa \`${reported}\` — chính giá trị được ghi vào session_rpe, tức mức gắng sức NGƯỜI DÙNG ` +
        'BÁO CÁO — vào `target`, thứ engine định nghĩa là mức workout ĐẶT RA. Hai vế của phép so trở ' +
        'thành một: cùng một lịch sử, gõ 6 ra "giảm 5%", gõ 9 ra "tăng 10%" — càng nói hôm nay nặng ' +
        'thì app càng bảo thêm tạ',
    );
  }

  /* And the sentence has to quote the number the verdict was about. A screen
     printing its own local effort beside the engine's verdict is the
     "progress screen says 40, prescription says 45" shape. */
  const hint = code.match(/const\s+loadHint\s*=[\s\S]*?\n\s*\},\s*\[/)?.[0] ?? '';
  if (hint && new RegExp(`\\$\\{${reported}\\}`).test(hint)) {
    problems.push(
      `${f}: câu gợi ý nhắc \`${reported}\` (mức người dùng vừa gõ cho hôm nay) trong khi kết luận ` +
        'được tính trên một mức khác — hãy trích `suggestion.target`, con số engine thật sự nhắm tới',
    );
  }
}

/* ── 6: a confidence handed to a safety gate must have a source ──

   Rule 3 above proves, by running the engine, that `confidence: 'none'` removes
   both guards on "add load". `useUserState` returns exactly that when the streak
   is not in the query cache, and it deliberately fetches nothing. So a screen
   that turns that state into advice has to be the one that asks for it. */
for (const f of CALLERS) {
  const code = strip(read(f));
  if (!/situationConfidence:/.test(code)) continue;
  if (!/useUserState\(\)/.test(code)) continue;
  if (/useDailyStreak\(\)/.test(code)) continue;
  problems.push(
    `${f}: đưa độ tin cậy của useUserState vào cổng an toàn của suggestLoad nhưng không màn nào ở đây ` +
      'nạp chuỗi ngày. useUserState chỉ ĐỌC cache và không fetch gì, nên khoá `mascot_streak` mang ngày ' +
      'hôm nay sẽ rỗng ở lần mở app đầu tiên của một ngày mới — độ tin cậy thành "none" và CẢ HAI cổng ' +
      'chặn tăng tải im lặng biến mất (chạy thật ở luật 3: quá tải + none → tăng 10%)',
  );
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  ✗ ${p}`);
  console.error(`\nđiều chỉnh tải — dây nối: ${problems.length} vấn đề`);
  process.exit(1);
}

console.log(
  `điều chỉnh tải — dây nối OK — chạy THẬT engine: biên RPE_MARGIN=${RPE_MARGIN} đổi chiều đúng chỗ ở 7 ca, ` +
    `bước là phân số tăng theo chênh lệch và bị chặn ở ${MAX_STEP} qua 6 mức chênh, ` +
    '7 dạng đầu vào bệnh lý (rỗng, thiếu, null, NaN, âm, toàn 0) không đẻ ra kết luận nào, ' +
    'mức đặt 0/null/NaN rơi về mục tiêu theo goal chứ không so với 0; ba cổng chặn tăng tải hoạt động ' +
    'và không cổng nào chặn được lời khuyên GIẢM; mọi goal đều ở trên sàn WHO và trong thang RPE. ' +
    `Và dây nối tại ${CALLERS.length} chỗ gọi: giá trị ghi vào session_rpe (mức BÁO CÁO) không được ` +
    'dùng làm `target` (mức ĐẶT RA) cũng không được trích trong câu gợi ý, và độ tin cậy đưa vào cổng ' +
    'an toàn phải có nguồn nạp',
);
