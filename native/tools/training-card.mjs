/**
 * That the training card says one thing about one number.
 *
 * ── the bug ──
 *
 * The acute-to-chronic ratio was drawn three times by three rules: a marker
 * coloured `>= 0.8 && <= 1.3 ? green : > 1.3 ? yellow : red`, a pill captioned
 * from five bands, and a five-dot legend listing those bands as hand-typed
 * strings. Two of the three agreed. The one that disagreed was the one
 * painting the dot.
 *
 *   at **1.70** — marker yellow, pill "Spike", legend calls > 1.6 red
 *   at **0.70** — marker red,    pill "Low",   legend calls 0.65–0.8 yellow
 *
 * Nothing crashes, nothing typechecks wrong, and the card tells you two
 * different things at once about whether to train tomorrow. So this file's
 * main job is to hold the bands against their real source — the readiness
 * engine — rather than against whatever the card currently believes.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// inside the project: `training-card.ts` imports `local-date`, so the build
// needs to resolve alongside its siblings
const out = mkdtempSync(path.join(NATIVE, '.check-training-'));
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/training-card.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { acwrZone, acwrPercent, daysSince, loadComparison, averageWeek, weeklyVolumes, ACWR_BANDS, ACWR_OPTIMAL, ACWR_MAX } =
    createRequire(import.meta.url)(path.join(out, 'training-card.js'));

  const problems = [];
  const eq = (what, got, want) => {
    if (got !== want) problems.push(`${what}: ${got}, đáng lẽ ${want}`);
  };

  /*
    The engine's own load bands, transcribed from readiness-engine.ts:66-70.

    Written out here rather than imported, on purpose: this is the independent
    statement of what the bands are. Importing the same module the card imports
    would make the two agree by construction and prove nothing.
  */
  const engineZone = (acwr) => {
    if (acwr >= 0.8 && acwr <= 1.3) return 'optimal';
    if (acwr >= 0.65 && acwr < 0.8) return 'low';
    if (acwr > 1.3 && acwr <= 1.6) return 'elevated';
    if (acwr < 0.65) return 'detraining';
    return 'spike';
  };

  /* ── every hundredth from 0 to 3 agrees with the engine ── */
  let drift = null;
  for (let i = 0; i <= 300 && !drift; i++) {
    const a = i / 100;
    if (acwrZone(a) !== engineZone(a)) drift = { a, got: acwrZone(a), want: engineZone(a) };
  }
  if (drift) {
    problems.push(
      `vùng đà tập lệch so với readiness-engine ở ${drift.a}: ${drift.got}, đáng lẽ ${drift.want}`,
    );
  }

  /* ── the edges, named, because they are where every off-by-one lives ── */
  eq('0.64 là tập quá thưa', acwrZone(0.64), 'detraining');
  eq('0.65 đã là "hơi ít"', acwrZone(0.65), 'low');
  eq('0.79 vẫn là "hơi ít"', acwrZone(0.79), 'low');
  eq('0.8 đã vào vùng an toàn', acwrZone(0.8), 'optimal');
  /*
    The one a tidy table gets wrong. Both ends of 0.8–1.3 are inclusive in the
    engine, so 1.3 is optimal — a "boundaries belong upward" rule would push it
    into `elevated` and have the card advise backing off on the exact ratio the
    engine scores highest.
  */
  eq('1.3 vẫn là vùng an toàn', acwrZone(1.3), 'optimal');
  eq('1.31 là tăng nhanh', acwrZone(1.31), 'elevated');
  eq('1.6 vẫn là tăng nhanh', acwrZone(1.6), 'elevated');
  eq('1.61 là nhảy vọt', acwrZone(1.61), 'spike');
  eq('0 là tập quá thưa', acwrZone(0), 'detraining');

  /* ── the two cases the old card contradicted itself on ── */
  eq('1.7 phải là nhảy vọt (marker cũ vẽ vàng)', acwrZone(1.7), 'spike');
  eq('0.7 phải là "hơi ít" (marker cũ vẽ đỏ)', acwrZone(0.7), 'low');

  /*
    Self-test: the old marker rule, rebuilt to three colours.

    If it does not disagree with the real bands at 1.7 and 0.7, those two cases
    above are decoration.
  */
  const oldTint = (a) => (a >= 0.8 && a <= 1.3 ? 'green' : a > 1.3 ? 'yellow' : 'red');
  const tint = { detraining: 'red', low: 'yellow', optimal: 'green', elevated: 'yellow', spike: 'red' };
  if (oldTint(1.7) === tint[acwrZone(1.7)] || oldTint(0.7) === tint[acwrZone(0.7)]) {
    console.error('phép tự kiểm hỏng — luật màu cũ đáng lẽ phải khác luật mới ở 1.7 và 0.7, đừng tin kết quả');
    process.exit(1);
  }

  /* ── the bar's geometry comes from the same numbers as its band ── */
  eq('mốc 0 ở đầu thanh', acwrPercent(0), 0);
  eq('mép trái vùng an toàn', acwrPercent(ACWR_OPTIMAL.from), 40);
  eq('mép phải vùng an toàn', acwrPercent(ACWR_OPTIMAL.to), 65);
  eq('cuối thang là 100%', acwrPercent(ACWR_MAX), 100);
  eq('vượt thang thì ghim ở cuối', acwrPercent(9), 100);
  eq('số âm thì ghim ở đầu', acwrPercent(-1), 0);
  // the drawn band has to be the band the colours use
  eq('mép trái vùng vẽ khớp vùng tính', acwrZone(ACWR_OPTIMAL.from), 'optimal');
  eq('mép phải vùng vẽ khớp vùng tính', acwrZone(ACWR_OPTIMAL.to), 'optimal');
  eq('bảng hiển thị có đủ 5 vùng', ACWR_BANDS.length, 5);

  /* ── the ratio, said as a comparison ── */
  eq('1.7 là nặng hơn 70%', JSON.stringify(loadComparison(1.7)), JSON.stringify({ heavier: true, percent: 70 }));
  eq('0.42 là nhẹ hơn 58%', JSON.stringify(loadComparison(0.42)), JSON.stringify({ heavier: false, percent: 58 }));
  eq('1.0 là không hơn không kém', loadComparison(1).percent, 0);
  eq('2.0 là nặng hơn 100%', loadComparison(2).percent, 100);
  eq('0.5 là nhẹ hơn 50%', loadComparison(0.5).percent, 50);
  /*
    Self-test: the percentage taken from zero instead of from 1.

    `Math.round(a * 100)` is the obvious reading and it is a different quantity
    — it says "you did 170% of something", where the something is an average
    day nobody trained on. If it does not disagree here, the cases above are
    not testing which baseline the sentence uses.
  */
  if (Math.round(1.7 * 100) === loadComparison(1.7).percent) {
    console.error('phép tự kiểm hỏng — bản lấy phần trăm từ 0 đáng lẽ phải khác bản lấy từ 1, đừng tin kết quả');
    process.exit(1);
  }

  /*
    ── the two numbers on the card divide to the verdict on the card ──

    This is what makes the card checkable instead of believable: it shows the
    last seven days' volume beside an average week, and claims a percentage
    between them. If `averageWeek` were, say, the 28-day total over 28 days
    (the engine's own per-*day* figure), the two printed numbers would not
    produce the printed sentence and somebody doing the division by hand would
    find the card lying to them.
  */
  const engineAcwr = (v7, v28) => (v7 / 7) / (v28 / 28);
  let mismatch = null;
  for (const [v7, v28] of [[18900, 44400], [4000, 40000], [0, 32000], [12000, 12000], [50000, 44400]]) {
    const shown = v7 / averageWeek(v28); // what a reader dividing the card gets
    const real = engineAcwr(v7, v28);
    if (Math.abs(shown - real) > 1e-9) mismatch = { v7, v28, shown, real };
  }
  if (mismatch) {
    problems.push(
      `hai số trên thẻ không chia ra đúng tỉ lệ: ${mismatch.v7} / tuần-trung-bình = ${mismatch.shown}, engine tính ${mismatch.real}`,
    );
  }
  eq('4 tuần của 44.400 là 11.100 mỗi tuần', averageWeek(44400), 11100);

  /* ── the eight-week chart ── */
  const at = (iso) => new Date(iso);
  {
    const now = at('2026-08-06T09:00:00');
    const ago = (days, hour = 12) => {
      const d = new Date(now);
      d.setDate(d.getDate() - days);
      d.setHours(hour, 0, 0, 0);
      return d.toISOString();
    };
    const S = (days, volume, hour) => ({ date_time: ago(days, hour), volume_load: volume });

    eq('không có buổi nào thì 8 cột rỗng',
      weeklyVolumes([], 8, now).every((w) => w.volume === 0 && w.sessions === 0), true);
    eq('luôn trả về đúng số tuần', weeklyVolumes([], 8, now).length, 8);

    const rows = [S(0, 1000), S(3, 2000), S(8, 500), S(30, 900), S(70, 100)];
    const t = weeklyVolumes(rows, 8, now);
    // oldest first, so the current week is the last element
    eq('tuần này gộp đúng', t[7].volume, 3000);
    eq('tuần này đếm đúng số buổi', t[7].sessions, 2);
    eq('8 ngày trước rơi vào tuần trước', t[6].volume, 500);
    eq('30 ngày trước rơi vào tuần thứ 5 tính ngược', t[3].volume, 900);
    eq('quá 8 tuần thì bị loại', t.reduce((s, w) => s + w.sessions, 0), 4);

    /*
      The property the whole bucketing exists for: the newest bar holds exactly
      the sessions the seven-day query returns. `daysAgoISO(7)` is
      `setDate(getDate() - 7)` and the query is `.gte(...)`, so this simulates
      it and requires the sums to be identical. A bar that disagrees with the
      total printed directly above it is worse than no bar.
    */
    const sevenDayCutoff = (() => {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.getTime();
    })();
    const queryWould = rows
      .filter((r) => new Date(r.date_time).getTime() >= sevenDayCutoff)
      .reduce((s, r) => s + r.volume_load, 0);
    eq('cột mới nhất bằng đúng tổng 7 ngày', t[7].volume, queryWould);

    /*
      A session stamped in the *future*.

      `useLogWorkoutSession` files a session at local noon of the day it belongs
      to, so one logged at nine in the morning carries a timestamp three hours
      ahead. The seven-day query has no upper bound and keeps it; a bucket
      closed at `now` would drop it, and the bar would be short by a whole
      session on the most common day there is — today.
    */
    const noonToday = weeklyVolumes([S(0, 4200, 12)], 8, at('2026-08-06T09:00:00'));
    eq('buổi ghi lúc 12h trưa vẫn thuộc tuần này khi đang là 9h sáng', noonToday[7].volume, 4200);

    /* Self-test: the version that closes the newest bucket at `now`. */
    const closedAtNow = [S(0, 4200, 12)].filter((r) => new Date(r.date_time).getTime() < now.getTime());
    if (closedAtNow.length !== 0) {
      console.error('phép tự kiểm hỏng — ca "ghi lúc 12h trưa" đáng lẽ phải nằm sau thời điểm hiện tại, đừng tin kết quả');
      process.exit(1);
    }

    eq('khối lượng rỗng/null coi là 0',
      weeklyVolumes([{ date_time: ago(1), volume_load: null }, { date_time: 'không phải ngày' }], 8, now)[7].volume, 0);
    eq('… nhưng buổi có ngày hợp lệ vẫn được đếm',
      weeklyVolumes([{ date_time: ago(1), volume_load: null }], 8, now)[7].sessions, 1);
  }

  /* ── "how many days ago", counted on the calendar ── */
  eq('cùng ngày là 0', daysSince('2026-08-06T07:00:00', at('2026-08-06T22:00:00')), 0);
  /*
    23:00 last night is *yesterday* at 07:00 this morning — eight hours apart,
    one calendar day. Subtracting instants would call this 0.
  */
  eq('23h tối qua là 1 ngày trước', daysSince('2026-08-05T23:00:00', at('2026-08-06T07:00:00')), 1);
  eq('một tuần', daysSince('2026-07-30T12:00:00', at('2026-08-06T12:00:00')), 7);
  eq('ngày ở tương lai không âm', daysSince('2026-08-09T12:00:00', at('2026-08-06T12:00:00')), 0);
  /*
    Across a daylight-saving change the day is 23 or 25 hours long. Counted in
    whole days it is still one — the trap `weekDates` was rebuilt to avoid.
  */
  const springForward = daysSince('2026-03-07T12:00:00', at('2026-03-09T12:00:00'));
  eq('qua mốc đổi giờ vẫn đếm đúng ngày', springForward, 2);

  /* ── and that the card is wired to the table rather than to its own copy ── */
  const card = read('src/components/ascnd/today-widgets-2.tsx');
  if (/acwr >= 0\.8 && acwr <= 1\.3 \?|a >= 0\.8 && a <= 1\.3 \?/.test(card)) {
    problems.push('today-widgets-2: còn luật màu đà tập viết tay — phải dùng acwrZone');
  }
  if (!/acwrZone\(/.test(card)) {
    problems.push('today-widgets-2: không dùng acwrZone — luật đang canh sai tệp');
  }
  if (/left: '40%'|right: '35%'/.test(card)) {
    problems.push('today-widgets-2: vùng an toàn trên thanh còn viết cứng 40%/35% thay vì lấy từ ACWR_OPTIMAL');
  }
  /*
    The card has to lead with the sentence, not the quotient.

    `loadComparison` is what turns 1.7 into "nặng hơn 70%". Without it the card
    is back to printing a ratio and a scale marked 0 / 0.8 / 1.3 / 2.0 — four
    numbers that only mean something once you already understand the first one,
    which is the state it was reported as unreadable in.
  */
  if (!/loadComparison\(/.test(card)) {
    problems.push('today-widgets-2: không dùng loadComparison — thẻ lại đang dẫn bằng tỉ lệ trần');
  }
  if (!/averageWeek\(/.test(card)) {
    problems.push('today-widgets-2: không hiện tuần trung bình — câu kết luận không kiểm chứng được');
  }
  if (!/weeklyVolumes\(/.test(card)) {
    problems.push('today-widgets-2: không vẽ 8 tuần — thẻ lại chỉ còn hiện tại, không có chiều hướng');
  }
  /*
    The English a Vietnamese card was printing verbatim.

    `Optimal`, `Spike`, `Elevated`, `Detraining`, `Low` and the heading
    `Acute:Chronic Ratio` were literals with no other-language branch anywhere
    near them. `tools/i18n.mjs` only inspects translation keys, so six English
    captions sat on the Vietnamese dashboard without anything noticing.

    The line has to carry a `vi ?` for the word to be allowed — that is what
    separates the *English half of a translation* from an untranslated string.
    Written first as "does this word appear at all", which flagged the perfectly
    good `vi ? 'Vừa sức' : 'Optimal'` and had to be narrowed.
  */
  for (const word of ['Optimal', 'Detraining', 'Elevated', 'Acute:Chronic']) {
    const offenders = card
      .split('\n')
      .filter((line) => new RegExp(`['"\`]${word}`).test(line) && !/\bvi \?/.test(line));
    if (offenders.length > 0) {
      problems.push(
        `today-widgets-2: chuỗi tiếng Anh "${word}" không có nhánh tiếng Việt — ${offenders[0].trim()}`,
      );
    }
  }
  const sheet = read('src/components/ascnd/training-explainer.tsx');
  if (!/ACWR_BANDS/.test(sheet)) {
    problems.push('training-explainer: tự viết lại các khoảng thay vì lấy ACWR_BANDS — đây đúng là cách thẻ đã lệch nhau');
  }

  if (problems.length) {
    console.error('thẻ tập luyện sai:\n');
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }

  console.log(
    'thẻ tập luyện OK — 301 mức đà tập khớp readiness-engine, 1.3 vẫn nằm trong vùng an toàn, thanh vẽ và màu dùng chung một bảng, "mấy ngày trước" đếm theo lịch (qua mốc đổi giờ vẫn đúng); 1.7 đọc thành "nặng hơn 70%" và hai số trên thẻ chia ra đúng tỉ lệ đó; cột mới nhất của biểu đồ 8 tuần bằng đúng tổng 7 ngày, kể cả buổi ghi lúc 12h trưa khi mới 9h sáng; luật màu cũ (mâu thuẫn ở 1.7 và 0.7) và cách lấy phần trăm từ 0 vẫn bị bắt',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
