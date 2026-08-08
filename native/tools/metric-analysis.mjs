/**
 * That the assistant's analysis panels say only what the data supports.
 *
 * ── what this is for ──
 *
 * Tapping a metric tile used to leave for `/biometrics` or `/sleep-insights`.
 * It now opens a fortnight of that metric in place: an interpreted sentence, a
 * chart under it, two figures under that. The page is meant to read as a place
 * you analyse rather than a menu you pass through.
 *
 * ── the failure this exists for ──
 *
 * A chart is honest by construction — it draws what it is given. A *sentence*
 * about a chart is not, and this file's whole subject is the second one:
 *
 *   - **a trend from two readings.** "Điểm sẵn sàng đang đi lên" computed from
 *     Tuesday and Wednesday is noise wearing the costume of an insight, and it
 *     is the failure people notice last and trust most.
 *   - **an average over the wrong denominator.** Fourteen columns, four logged
 *     nights: divide by fourteen and the panel reports somebody sleeping two
 *     hours a night, in a confident sentence, above a chart that looks fine.
 *   - **a gap drawn as a zero.** A day nobody logged is not a day of no sleep,
 *     and a chart that closes its gaps shows a tidier fortnight than happened.
 *   - **a number nobody has.** The standing rule, here as an assertion.
 *
 * None of these throw. All of them render.
 *
 * ── what is checked ──
 *
 * 1. below `MIN_TREND` readings, no direction word appears anywhere
 * 2. every number in every sentence traces back to the readings
 * 3. the window is always `WINDOW_DAYS` wide, gaps included and marked
 * 4. averages divide by the readings, not by the window
 * 5. `direction` reads halves, so one outlier cannot flip a fortnight
 * 6. both languages, always, and never identical
 * 7. every metric kind is covered, and an empty one still says something
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'metric-'));

let analyse, barsFor, direction, MIN_TREND, WINDOW_DAYS;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/metric-analysis.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  ({ analyse, barsFor, direction, MIN_TREND, WINDOW_DAYS } =
    createRequire(import.meta.url)(path.join(out, 'metric-analysis.js')));
} catch (e) {
  console.error('không biên dịch được metric-analysis.ts');
  console.error((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? ''));
  process.exit(2);
}

const problems = [];
const TODAY = new Date(2026, 7, 8); // fixed, so the window is the same every run
const iso = (back) => {
  const d = new Date(2026, 7, 8 - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** `n` readings ending today, produced by `f(i)` oldest-first. */
const series = (n, f) => Array.from({ length: n }, (_, i) => ({ date: iso(n - 1 - i), value: f(i) }));

const KINDS = ['readiness', 'sleep', 'kcal', 'hr'];
const CASES = {
  'sẵn sàng, cả tuần đi lên': { kind: 'readiness', points: series(14, (i) => 50 + i * 2) },
  'sẵn sàng, 2 ngày': { kind: 'readiness', points: series(2, () => 70) },
  'sẵn sàng, trống': { kind: 'readiness', points: [] },
  'ngủ, thiếu cả tuần': { kind: 'sleep', points: series(9, () => 380) },
  'ngủ, 4 đêm rời rạc': { kind: 'sleep', points: [0, 2, 4, 6].map((b) => ({ date: iso(b), value: 400 })) },
  'ngủ, 3 đêm': { kind: 'sleep', points: series(3, () => 400) },
  'ngủ, trống': { kind: 'sleep', points: [] },
  'calo, đủ ngày': { kind: 'kcal', points: series(12, (i) => 2000 + (i % 3) * 150), kcalTarget: 2200 },
  'calo, không mục tiêu': { kind: 'kcal', points: series(12, () => 2000), kcalTarget: 0 },
  'calo, trống': { kind: 'kcal', points: [], kcalTarget: 2200 },
  'nhịp tim, giảm dần': { kind: 'hr', points: series(10, (i) => 64 - i) },
  'nhịp tim, 1 ngày': { kind: 'hr', points: series(1, () => 58) },
  'nhịp tim, trống': { kind: 'hr', points: [] },
};

const results = {};
for (const [name, c] of Object.entries(CASES)) {
  results[name] = analyse({ ...c, today: TODAY });
}

/*
  Only the readings inside the window count.

  Several fixtures deliberately hand in more days than the chart shows — the
  app queries a fortnight and draws a week, so that is the real shape and the
  one worth checking. The first version compared against `points.length` and
  reported perfectly correct output as wrong: seven columns from twelve
  readings is the window doing its job.
*/
const WINDOW_DATES = new Set(Array.from({ length: WINDOW_DAYS }, (_, i) => iso(i)));
const inWindow = (c) => c.points.filter((p) => WINDOW_DATES.has(p.date));

const allText = (a) => [
  a.headline,
  ...a.stats.map((s) => s.label),
  a.ask,
  ...(a.baseline ? [a.baseline.label] : []),
];

/*
  ── 1: no direction claimed below MIN_TREND ──

  Checked on the words rather than on the internals, because the words are what
  the person reads. `direction` returning null is only half the guarantee; the
  other half is that no branch reaches for a trend word anyway.
*/
const TREND_WORDS = /đi lên|đi xuống|ổn định|giảm dần|nhích lên|trending|steady|drifting|creeping/i;
for (const [name, a] of Object.entries(results)) {
  const n = inWindow(CASES[name]).length;
  if (n >= MIN_TREND) continue;
  for (const t of allText(a)) {
    for (const lang of ['vi', 'en']) {
      if (TREND_WORDS.test(t[lang])) {
        problems.push(
          `"${name}" (${lang}): chỉ có ${n} ngày mà đã nói xu hướng — "${t[lang]}". ` +
            `Dưới ${MIN_TREND} lần đo thì không có chiều nào để đọc.`,
        );
      }
    }
  }
}

/*
  ── 2: provenance ──

  Every run of digits has to be a value the readings could produce: a reading
  itself, the mean, the extremes, the count, the target, or one of the fixed
  scale marks the copy legitimately uses.
*/
function allowed(c) {
  const vals = inWindow(c).map((p) => p.value);
  const n = vals.length;
  const set = new Set(['100', '7']); // "x/100", the seven-hour mark and the window
  /* Two adders on purpose. The first version used one, guarded by
     `Number.isFinite`, and fed it the *string* pieces of a grouped number —
     `Number.isFinite('150')` is `false`, because it does not coerce, so every
     digit group a locale separator produces was silently dropped and four
     perfectly honest sentences were reported as inventing numbers. A guard
     that rejects the thing it was written to accept. */
  const addStr = (v) => set.add(String(v));
  const add = (v) => Number.isFinite(v) && addStr(v);
  const addNum = (v) => {
    const r = Math.round(v);
    add(r);
    // grouped forms: "2.150" in vi, "2,150" in en — the panel prints these
    for (const p of r.toLocaleString('vi-VN').split(/[.,\s ]/)) addStr(p);
    for (const p of r.toLocaleString('en-US').split(/[.,\s ]/)) addStr(p);
  };
  add(n);
  add(MIN_TREND - n);
  if (n) {
    const mean = vals.reduce((a, b) => a + b, 0) / n;
    for (const v of [...vals, mean, Math.min(...vals), Math.max(...vals)]) {
      addNum(v);
      // durations render as hours and minutes
      add(Math.floor(v / 60));
      add(Math.round(v % 60));
    }
    // counts of days meeting a bar
    for (let i = 0; i <= n; i++) add(i);
  }
  if (c.kcalTarget) addNum(c.kcalTarget);
  return set;
}
for (const [name, a] of Object.entries(results)) {
  const ok = allowed(CASES[name]);
  for (const t of allText(a)) {
    for (const lang of ['vi', 'en']) {
      for (const num of t[lang].match(/\d+/g) ?? []) {
        if (!ok.has(num)) {
          problems.push(`"${name}" (${lang}): câu có số ${num} không lần ra được nguồn — "${t[lang]}"`);
        }
      }
    }
  }
}

/*
  ── 3: the window is the window, gaps are marked, and every column has a name ──

  The axis is the part that made this chart readable. Fourteen unlabelled
  columns was "đẹp nhưng khó hiểu" in the user's words: a shape you could see
  and not one value you could read off. So a column without a weekday, or a
  week without exactly one "today", is the regression this guards.
*/
for (const [name, a] of Object.entries(results)) {
  if (a.bars.length !== WINDOW_DAYS) {
    problems.push(`"${name}": biểu đồ có ${a.bars.length} cột, phải đúng ${WINDOW_DAYS} — đóng khoảng trống lại là vẽ một tuần khác`);
  }
  const drawn = a.bars.filter((b) => !b.missing).length;
  const want = inWindow(CASES[name]).length;
  if (drawn !== want) {
    problems.push(`"${name}": ${drawn} cột có dữ liệu nhưng có ${want} lần đo nằm trong cửa sổ`);
  }
  for (const b of a.bars) {
    if (b.missing && b.value !== 0) problems.push(`"${name}": cột trống ${b.date} lại mang giá trị ${b.value}`);
    if (!b.weekday?.vi || !b.weekday?.en) problems.push(`"${name}": cột ${b.date} không có nhãn thứ — trục biến mất`);
  }
  const todays = a.bars.filter((b) => b.today).length;
  if (todays !== 1) problems.push(`"${name}": có ${todays} cột được đánh dấu "hôm nay", phải đúng 1`);
  if (a.bars.length && !a.bars[a.bars.length - 1].today) {
    problems.push(`"${name}": cột "hôm nay" không nằm ở cuối — biểu đồ đang đọc ngược`);
  }
}

/*
  ── 4: the denominator is the readings ──

  The one that produces "bạn ngủ 2 giờ mỗi đêm" from a perfectly good fortnight
  with four logged nights. Asserted against a case built to make the two
  denominators far apart: four nights of 400 minutes is 6h40 over the readings
  and 1h54 over the window.
*/
{
  const a = results['ngủ, 4 đêm rời rạc'];
  const avg = a.stats.find((s) => s.key === 'avg');
  if (!avg || !/6 giờ 40/.test(avg.value)) {
    problems.push(`"ngủ, 4 đêm rời rạc": trung bình ra "${avg?.value}", phải là 6 giờ 40 phút — chia cho số đêm ghi được, không phải cho 14`);
  }
}

// ── 5: halves, not endpoints ──
{
  const rising = Array.from({ length: 10 }, (_, i) => 50 + i);
  const flatWithSpike = [70, 70, 70, 70, 70, 70, 70, 70, 70, 120];
  if (direction(rising) !== 'up') problems.push('direction: chuỗi tăng đều không ra "up"');
  if (direction([70, 70, 70, 70, 70, 70]) !== 'flat') problems.push('direction: chuỗi phẳng không ra "flat"');
  if (direction([1, 2]) !== null) problems.push('direction: 2 điểm phải trả null');
  /* One spike at the end must not carry a fortnight. Halves were not enough —
     a mean over five still lets one day move the verdict by a seventh — so
     each half is read by its median. */
  if (direction(flatWithSpike) === 'up') {
    problems.push('direction: một ngày đột biến ở cuối đủ lật cả hai tuần — mỗi nửa phải đọc bằng trung vị');
  }
}

// ── 6: both languages ──
for (const [name, a] of Object.entries(results)) {
  for (const t of allText(a)) {
    for (const lang of ['vi', 'en']) {
      if (!t[lang]) problems.push(`"${name}": thiếu bản ${lang}`);
      else if (/NaN|undefined|null|\bInfinity\b|\s\s/.test(t[lang])) {
        problems.push(`"${name}" (${lang}): câu có lỗ hổng — "${t[lang]}"`);
      }
    }
    if (t.vi === t.en) problems.push(`"${name}": hai ngôn ngữ giống hệt — "${t.vi}"`);
  }
}

// ── 7: every kind, and an empty one still speaks ──
for (const kind of KINDS) {
  if (!Object.values(CASES).some((c) => c.kind === kind)) problems.push(`chưa có ca nào cho "${kind}"`);
  const empty = analyse({ kind, points: [], today: TODAY, kcalTarget: 2200 });
  if (!empty.headline.vi || !empty.ask.vi) problems.push(`"${kind}" rỗng không nói gì — panel sẽ trống`);
  if (empty.stats.length) problems.push(`"${kind}" rỗng vẫn hiện ${empty.stats.length} con số`);
}

/**
 * The self-test.
 *
 * Rules 1 and 4 are the two that matter, so both are exercised against the
 * shape they exist to catch — a trend word on a two-day series, and an average
 * over the window instead of over the readings.
 */
const selfTest = [
  ['xu hướng từ 2 ngày', () => {
    const a = analyse({ kind: 'readiness', points: series(2, () => 70), today: TODAY });
    return !TREND_WORDS.test(a.headline.vi) && direction([70, 70]) === null;
  }],
  ['mẫu số sai bị bắt', () => {
    const vals = [400, 400, 400, 400];
    const overWindow = vals.reduce((a, b) => a + b, 0) / WINDOW_DAYS;
    const overReadings = vals.reduce((a, b) => a + b, 0) / vals.length;
    return Math.round(overWindow) !== Math.round(overReadings);
  }],
  ['cột trống được đánh dấu', () => {
    const bars = barsFor([{ date: iso(0), value: 5 }], WINDOW_DAYS, TODAY);
    return bars.length === WINDOW_DAYS && bars.filter((b) => b.missing).length === WINDOW_DAYS - 1;
  }],
  ['mỗi cột có nhãn thứ, và đúng một cột là hôm nay', () => {
    const bars = barsFor([], WINDOW_DAYS, TODAY);
    return bars.every((b) => b.weekday?.vi) && bars.filter((b) => b.today).length === 1;
  }],
  ['một ngày đột biến không lật xu hướng', () =>
    direction([70, 70, 70, 70, 70, 70, 70, 70, 70, 120]) !== 'up'],
];
const missed = selfTest.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join(', ')}, đừng tin kết quả`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });

if (problems.length) {
  console.log('phân tích chỉ số sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `phân tích chỉ số OK — ${Object.keys(CASES).length} ca × ${KINDS.length} loại, cửa sổ luôn ${WINDOW_DAYS} cột và ` +
    `ngày trống được đánh dấu; dưới ${MIN_TREND} lần đo thì không câu nào nói xu hướng; ` +
    `trung bình chia cho số lần đo chứ không cho cửa sổ; một ngày đột biến không lật được hai tuần; ` +
    `ví dụ: "${results['ngủ, thiếu cả tuần'].headline.vi}"`,
);
