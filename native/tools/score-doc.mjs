/**
 * A document about numbers, checked against the numbers.
 *
 * ── what this is guarding ──
 *
 * `docs/fitness-scores.md` states, for every score the app shows, what it is
 * made of and what it does when the data is missing. Written down, those become
 * assertions — and a document is the one place in this repository where an
 * assertion has never had to be true. Nothing compiles it, nothing runs it, and
 * a threshold that moves in code leaves the prose behind still describing the
 * old behaviour, confidently, to whoever reads it next.
 *
 * That has already happened here twice in the code itself: a comment describing
 * a test that did not exist, and `LAUNCH.md` promising an offline queue handled
 * three kinds of write when it handled seven. Both read as true. Both were the
 * only description anybody had.
 *
 * So every number the document quotes is pulled back out of it and compared to
 * the value the app actually uses. The check is deliberately two-sided in
 * spirit: if the doc goes vague — drops the figure, rounds it, rewrites the
 * sentence — the pattern stops matching and this fails as loudly as a wrong
 * figure would, because an unpinnable claim is exactly the thing that drifts.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'scoredoc-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc',
       'src/lib/goal-training.ts', 'src/lib/training-week.ts', 'src/lib/session-load.ts',
       'src/lib/load-progression.ts', 'src/lib/prescription.ts', 'src/lib/user-state.ts',
       'src/lib/training-card.ts', 'src/lib/streak.ts', 'src/lib/adaptive-tdee.ts',
       'src/lib/local-date.ts', 'src/lib/readiness-engine.ts', 'src/lib/readiness-i18n.ts',
       'src/lib/exercise-trend.ts', 'src/lib/exercise-performance.ts', 'src/lib/exercise-kind.ts',
       'src/lib/personal-record.ts', 'src/lib/exercise-key.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* the `@/` mapping makes tsc exit non-zero; it still emits, which is all
       this needs */
  }
  /* `@/lib/x` → `./x` in everything emitted, so `require` can resolve them. */
  for (const f of ['load-progression', 'training-week', 'user-state', 'streak', 'training-card',
                   'exercise-trend', 'exercise-performance', 'personal-record']) {
    const p = path.join(out, `${f}.js`);
    writeFileSync(p, readFileSync(p, 'utf8').replace(/@\/lib\//g, './'));
  }
  const req = createRequire(import.meta.url);
  const load = (m) => req(path.join(out, `${m}.js`));

  const goal = load('goal-training');
  const week = load('training-week');
  const sess = load('session-load');
  const prog = load('load-progression');
  const state = load('user-state');
  const streak = load('streak');
  const tdee = load('adaptive-tdee');
  const card = load('training-card');
  const ready = load('readiness-engine');
  const xtrend = load('exercise-trend');
  const xperf = load('exercise-performance');

  const doc = readFileSync(path.join(NATIVE, 'docs/fitness-scores.md'), 'utf8');

  /**
   * Each row: what the doc must say, and the value the app actually uses.
   *
   * The regex has to be specific enough that it can only match the sentence it
   * is about — a bare `/(\d+)/` would find any number and prove nothing.
   */
  const PINS = [
    ['nền HRV/nhịp nghỉ cần bao nhiêu lần đo', /\*\*≥ (\d+) lần đo\*\*/, 5],
    ['ACWR: tử số chia 7 ngày', /\(tải7d \/ (\d+)\)/, 7],
    ['ACWR: sàn mẫu số', /max\(số_ngày_có, (\d+)\)/, 7],
    ['ACWR: mép dưới dải hợp lý', /([\d.]+)–[\d.]+ hợp lý/, 0.8],
    ['ACWR: mép trên dải hợp lý', /[\d.]+–([\d.]+) hợp lý/, 1.3],
    ['ACWR: ngưỡng giảm tải', /< ([\d.]+) đang giảm tải/, 0.65],
    ['ACWR: ngưỡng tăng vọt', /> ([\d.]+) tăng vọt/, 1.6],
    ['tải buổi tập: dải RPE dưới', /RPE là tự chấm; nằm ngoài (\d+)–\d+/, sess.RPE_MIN],
    ['tải buổi tập: dải RPE trên', /RPE là tự chấm; nằm ngoài \d+–(\d+)/, sess.RPE_MAX],
    ['ngày tập cơ: sàn WHO', /Sàn (\d+) ngày\/tuần cho \*\*mọi\*\*/, goal.WHO_STRENGTH_DAYS],
    ['ngày tập cơ: mục tiêu sức mạnh', /`bulk` nhắm (\d+)/, goal.goalTraining('strength').strengthDays],
    ['ngày tập cơ: trần cửa sổ', /Ngày tập cơ trong tuần[\s\S]*?\*\*Khoảng\*\* \| 0–(\d+)/, week.WEEK_DAYS],
    ['trạng thái: cần bao nhiêu ngày lịch sử', /< (\d+) ngày lịch sử/, state.MIN_HISTORY_DAYS],
    ['trạng thái: ngưỡng sụt', /`DROP_FRACTION = ([\d.]+)`/, state.DROP_FRACTION],
    ['điều chỉnh tải: số buổi tối thiểu', /< (\d+) buổi → \*\*`unknown`\*\*/, prog.MIN_SESSIONS],
    ['điều chỉnh tải: biên RPE', /lệch > (\d+) điểm/, prog.RPE_MARGIN],
    ['điều chỉnh tải: bước nhảy', /bước \*\*tỉ lệ\*\* (\d+)%/, prog.STEP * 100],
    ['điều chỉnh tải: trần bước nhảy', /trần (\d+)%/, prog.MAX_STEP * 100],
    ['chuỗi ngày: cửa sổ', /0–(\d+) \(cửa sổ truy vấn\)/, streak.STREAK_WINDOW],
    ['TDEE thích ứng: kcal mỗi kg', /`(\d+) kcal\/kg`/, tdee.KCAL_PER_KG],
    ['TDEE thích ứng: số ngày ăn', /≥ (\d+) ngày ăn/, tdee.MIN_LOGGED_DAYS],
    ['TDEE thích ứng: số lần cân', /≥ (\d+) lần cân/, tdee.MIN_WEIGH_INS],
    ['TDEE thích ứng: khoảng ngày', /khoảng ≥ (\d+) ngày/, tdee.MIN_SPAN_DAYS],
    ['TDEE thích ứng: ngày khác biệt', /≥ (\d+) ngày khác biệt/, tdee.MIN_DISTINCT_DAYS],
    ['TDEE thích ứng: chênh lệch kcal', /chênh lệch ≥ (\d+) kcal/, tdee.MIN_GAP_KCAL],

    /* ── trí tuệ bài tập ──
       Cả bốn ngưỡng đều được tài liệu giải thích bằng một lý do; nếu con số
       trong code đổi mà lý do ở lại thì lý do đó thành một câu nói sai. */
    ['bài tập: số buổi tối thiểu', /`MIN_SESSIONS` \| (\d+)/, xtrend.MIN_SESSIONS],
    ['bài tập: ngưỡng gọi là chững', /`PLATEAU_SESSIONS` \| (\d+)/, xtrend.PLATEAU_SESSIONS],
    ['bài tập: thay đổi đáng kể', /`MEANINGFUL_CHANGE` \| (\d+)%/, xtrend.MEANINGFUL_CHANGE * 100],
    ['bài tập: cửa sổ xu hướng', /`TREND_WINDOW` \| (\d+) buổi/, xtrend.TREND_WINDOW],
    ['bài tập: trần rep của e1RM', /\*\*chỉ tới (\d+) rep\*\*/, xperf.E1RM_MAX_REPS],
  ];

  for (const [what, re, actual] of PINS) {
    const m = doc.match(re);
    if (!m) {
      problems.push(
        `tài liệu không còn nói rõ "${what}" theo dạng bám được (${re}) — một con số bị bỏ đi hoặc ` +
          'viết mờ đi thì không kiểm được nữa, và một khẳng định không kiểm được chính là thứ sẽ lệch',
      );
      continue;
    }
    if (Number(m[1]) !== Number(actual)) {
      problems.push(
        `"${what}": tài liệu ghi ${m[1]} nhưng app dùng ${actual} — tài liệu đang mô tả một hành vi ` +
          'không còn tồn tại, và nó là bản mô tả duy nhất người đọc sau này có',
      );
    }
  }

  /* ── the confidence ladder, checked by running it ── */
  {
    const m = doc.match(/`high` \(≥(\d+) chiều\) · `medium` \((\d+)\) · `low` \((\d+)\)/);
    if (!m) {
      problems.push('tài liệu không còn ghi thang độ tin cậy của điểm sẵn sàng theo dạng bám được');
    } else {
      const [, hi, mid, lo] = m.map(Number);
      for (const [n, label] of [[hi, 'high'], [mid, 'medium'], [lo, 'low']]) {
        if (ready.readinessConfidence(n) !== label) {
          problems.push(
            `tài liệu nói ${n} chiều là '${label}' nhưng engine trả '${ready.readinessConfidence(n)}'`,
          );
        }
      }
    }
  }

  /* ── the two numbers the trend document uses to justify its own method ──

     The document claims best-of-half and a regression agree on the plateau
     example and disagree on one-bad-day-after-progress, and quotes four
     percentages. Those are the entire argument for the design, so they are
     recomputed here rather than trusted: a comparison that has quietly stopped
     being true is worse than no comparison, because it reads as evidence. */
  {
    const halves = (v) => {
      const h = Math.floor(v.length / 2);
      const p = Math.max(...v.slice(0, h));
      const c = Math.max(...v.slice(v.length - h));
      return ((c - p) / p) * 100;
    };
    const regression = (v) => {
      const n = v.length;
      const mx = (n - 1) / 2;
      const my = v.reduce((a, b) => a + b, 0) / n;
      let sxy = 0;
      let sxx = 0;
      v.forEach((y, i) => { sxy += (i - mx) * (y - my); sxx += (i - mx) ** 2; });
      return ((sxy / sxx) * n / my) * 100;
    };
    const e = (w, r) => xperf.estimate1rm(w, r);
    const CASES = [
      ['plateau', [6, 6, 6, 5, 6].map((r) => e(60, r)), /best-of-half đọc (0,0)%/, /hồi quy đọc −(1,4)%/],
      ['một ngày tệ', [8, 9, 10, 5].map((r) => e(55, r)), /cho best-of-half \*\*\+([\d,]+)%\*\*/, /hồi quy \*\*−([\d,]+)%\*\*/],
    ];
    for (const [what, series, reHalf, reReg] of CASES) {
      const got = { half: halves(series), reg: regression(series) };
      for (const [side, re, actual] of [['best-of-half', reHalf, got.half], ['hồi quy', reReg, got.reg]]) {
        const m = doc.match(re);
        if (!m) {
          problems.push(`tài liệu không còn ghi con số ${side} cho ca "${what}" theo dạng bám được (${re})`);
          continue;
        }
        const said = Number(m[1].replace(',', '.'));
        if (Math.abs(said - Math.abs(actual)) > 0.05) {
          problems.push(
            `ca "${what}", ${side}: tài liệu ghi ${said}% nhưng tính lại ra ${Math.abs(actual).toFixed(1)}% — ` +
              'đây là TOÀN BỘ lập luận cho cách chọn phương pháp, nên một con số lệch ở đây là bằng chứng giả',
          );
        }
      }
    }
  }

  /* ── and the ACWR bands the doc quotes are the bands the card draws ── */
  {
    /*
      The boundaries themselves, and the value either side of each.

      The first draft sampled the middle of each band — 0.5, 0.7, 1.0, 1.45, 1.8
      — and stayed green when `< 0.65` was moved to `< 0.55`: every sample was
      still in the band it started in, while 0.6 had silently fallen through
      every branch to `spike`. A band check that never touches an edge is not
      checking the edges, and the edges are the only numbers the document
      quotes.
    */
    const zones = [
      [0.64, 'detraining'], [0.65, 'low'], [0.79, 'low'], [0.8, 'optimal'],
      [1.3, 'optimal'], [1.31, 'elevated'], [1.6, 'elevated'], [1.61, 'spike'],
    ];
    for (const [v, want] of zones) {
      const got = card.acwrZone(v);
      if (got !== want) {
        problems.push(
          `acwrZone(${v}) = '${got}', không phải '${want}' — các mốc trong tài liệu (0.65 / 0.8 / 1.3 / ` +
            '1.6) không còn là các mốc thẻ tập luyện thật sự dùng',
        );
      }
    }
  }

  /* ── the claims that are not numbers, and are the point of the document ──

     "Missing data must not become a number" is the through-line of the whole
     file. These four are the ones that had to be fixed in the product, so they
     are the ones a future edit is most likely to soften back into a default. */
  {
    const MUST_SAY = [
      [/`null` khi chưa có nền/, 'ACWR là null khi chưa có nền để so'],
      [/Không có dòng ngủ ≠ ngủ 0 phút/, 'không có dòng ngủ khác với ngủ 0 phút'],
      [/không có rep → \*\*`null`\*\*/, 'buổi không đo được trả null chứ không phải 0'],
      [/\*\*KHÔNG phải chỉ số thể lực\*\*/, 'XP không phải tiến bộ thể lực'],
    ];
    for (const [re, what] of MUST_SAY) {
      if (!re.test(doc)) {
        problems.push(
          `tài liệu không còn nói: ${what}. Đây là một trong những lỗi ĐÃ phải sửa trong app, nên nó ` +
            'là chỗ dễ bị viết mềm trở lại thành một giá trị mặc định nhất',
        );
      }
    }
  }

  if (problems.length) {
    console.log('tài liệu chỉ số CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `tài liệu chỉ số OK — ${PINS.length} con số trong docs/fitness-scores.md được lấy NGƯỢC ra khỏi ` +
      'tài liệu và so với giá trị app thật sự dùng (sàn WHO, dải ACWR, biên RPE, bước nhảy tải, cửa ' +
      'sổ chuỗi ngày, năm ngưỡng của TDEE thích ứng…), nên một hằng số đổi trong code mà quên sửa ' +
      'tài liệu sẽ đỏ; thang độ tin cậy và bốn mốc ACWR được CHẠY THẬT qua engine và qua acwrZone chứ ' +
      'không đọc chữ; và bốn khẳng định "thiếu dữ liệu không được thành một con số" — thứ đã phải sửa ' +
      'thật trong app — phải còn nguyên trong tài liệu. Viết mờ một con số đi cũng đỏ như ghi sai nó: ' +
      'một khẳng định không kiểm được chính là khẳng định sẽ lệch',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
