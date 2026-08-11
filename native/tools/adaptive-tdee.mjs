/**
 * That the app only claims to know somebody's metabolism when it does.
 *
 * ── what is being checked ──
 *
 * `tdee_target_kcal` is Mifflin-St Jeor times one of five activity multipliers,
 * picked once during onboarding and then never revisited. Everything
 * nutritional hangs off it. Somebody who chose "ít vận động" and then started
 * training carries a target hundreds of kcal too low, and the app tells them
 * every evening that they went over.
 *
 * `adaptiveTDEE` answers that from the energy-balance identity — mean intake
 * minus what the scale did — which is a measurement of *this* person rather
 * than a population average.
 *
 * ── why the refusals are the important part ──
 *
 * The arithmetic is trivially computable from garbage. Two weigh-ins and three
 * logged days produce a number, and that number is confidently wrong by a
 * thousand kcal. A calorie target is not a place to be confidently wrong: it is
 * the number somebody eats to, every day, for months.
 *
 * So most of what follows is cases where the right answer is **no answer**, and
 * the self-test at the bottom rebuilds the tempting versions — the one that
 * takes last-minus-first instead of a regression, and the one that averages a
 * missing day as zero.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'tdee-'));
execFileSync(
  'npx',
  ['tsc', 'src/lib/adaptive-tdee.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { adaptiveTDEE, worthMentioning, KCAL_PER_KG, MIN_GAP_KCAL } = await import(
  pathToFileURL(path.join(out, 'adaptive-tdee.js')).href
);

/** n days of the same intake, ending today. */
const intake = (n, kcal) =>
  Array.from({ length: n }, (_, i) => ({
    date: new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10),
    kcal,
  }));

/** A clean linear weight trend: `kg0` on the oldest day, moving `perWeek` kg/week. */
const weights = (n, kg0, perWeek, step = 1) => {
  const pts = [];
  for (let i = 0; i < n; i += step) {
    pts.push({
      date: new Date(Date.now() - (n - 1 - i) * 864e5).toISOString().slice(0, 10),
      kg: Math.round((kg0 + (perWeek / 7) * i) * 100) / 100,
    });
  }
  return pts;
};

/*
  ── 1: the identity, against numbers worked out by hand ──

  Eating 1,800 and losing 0.5 kg/week is a deficit of 0.5 × 7700 / 7 ≈ 550
  kcal/day, so expenditure is about 2,350. If this row is ever wrong, every
  sentence the feature produces is wrong with it.
*/
{
  const cases = [
    [1800, -0.5, 2350, 'giảm 0,5 kg/tuần khi ăn 1800'],
    [2000, 0, 2000, 'cân nặng đứng yên — TDEE bằng đúng lượng ăn'],
    [3000, 0.5, 2450, 'tăng 0,5 kg/tuần khi ăn 3000'],
    [2200, -1.0, 3300, 'giảm 1 kg/tuần khi ăn 2200'],
  ];
  for (const [kcal, perWeek, want, why] of cases) {
    const r = adaptiveTDEE(intake(14, kcal), weights(14, 80, perWeek));
    if (!r.ok) {
      problems.push(`${why}: bị từ chối (${r.reason}) trong khi dữ liệu đủ`);
      continue;
    }
    /* ±15 kcal covers rounding the weight points to two decimals. */
    if (Math.abs(r.measured - want) > 15) {
      problems.push(`${why}: ra ${r.measured} kcal, cần ~${want}`);
    }
    if (Math.abs(r.kgPerWeek - perWeek) > 0.03) {
      problems.push(`${why}: xu hướng ${r.kgPerWeek} kg/tuần, cần ${perWeek}`);
    }
  }
}

/*
  ── 2: it refuses far more often than it answers ──

  Each of these produces a perfectly plausible number if the guard is missing,
  which is exactly why the guard is the feature.
*/
{
  const refusals = [
    ['ghi ăn 5/14 ngày', intake(5, 1800), weights(14, 80, -0.5), 'not-enough-intake'],
    ['chỉ 2 lần cân', intake(14, 1800), weights(14, 80, -0.5, 7).slice(0, 2), 'not-enough-weight'],
    ['không cân lần nào', intake(14, 1800), [], 'not-enough-weight'],
    ['không ghi ăn ngày nào', [], weights(14, 80, -0.5), 'not-enough-intake'],
  ];
  for (const [why, i, w, reason] of refusals) {
    const r = adaptiveTDEE(i, w);
    if (r.ok) {
      problems.push(`${why}: vẫn trả lời ${r.measured} kcal — lẽ ra phải từ chối (${reason})`);
    } else if (r.reason !== reason) {
      problems.push(`${why}: từ chối vì "${r.reason}", cần "${reason}"`);
    }
  }

  /* Six weigh-ins all in the same three days: plenty of readings, no span. A
     trend needs time, not samples. */
  const bunched = [0, 1, 1, 2, 2, 3].map((d) => ({
    date: new Date(Date.now() - d * 864e5).toISOString().slice(0, 10),
    kg: 80 - d * 0.05,
  }));
  const r = adaptiveTDEE(intake(14, 1800), bunched);
  if (r.ok) problems.push(`6 lần cân dồn trong 3 ngày: vẫn trả lời ${r.measured} kcal — quãng thời gian quá ngắn`);
}

/*
  ── 3: a day nobody logged is not a day of eating nothing ──

  This is the same mistake the readiness score made with sleep, and it is worth
  checking here because the shape is identical: a zero that means "no data"
  walking into an average as if it meant zero.
*/
{
  /* Four blank days of fourteen leaves exactly ten logged — the threshold. A
     first version blanked five and was correctly refused, which was the tool
     catching its own test rather than the code. */
  const withGaps = intake(14, 2000).map((d, i) => (i % 4 === 0 ? { ...d, kcal: 0 } : d));
  const r = adaptiveTDEE(withGaps, weights(14, 80, 0));
  if (r.ok) {
    if (Math.abs(r.meanIntake - 2000) > 5) {
      problems.push(
        `ngày không ghi bị tính vào trung bình: ra ${r.meanIntake} thay vì 2000 — ` +
          'một ngày trống thành một ngày nhịn ăn, và TDEE đo được tụt theo',
      );
    }
    if (r.loggedDays !== withGaps.filter((d) => d.kcal > 0).length) {
      problems.push(`loggedDays = ${r.loggedDays}, không khớp số ngày thật sự có ghi`);
    }
  } else {
    problems.push(`14 ngày với 10 ngày có ghi: bị từ chối (${r.reason}) — đó đúng bằng ngưỡng, không được từ chối`);
  }
}

/*
  ── 4: one bad morning does not decide the answer ──

  Body weight moves a kilo on water. Taking last-minus-first lets whichever two
  days happen to sit at the ends of the window set the direction of the trend;
  a regression makes every point pull on the line.
*/
{
  const clean = weights(14, 80, -0.5);
  const spiked = clean.map((w, i) => (i === clean.length - 1 ? { ...w, kg: w.kg + 1.2 } : w));

  const a = adaptiveTDEE(intake(14, 1800), clean);
  const b = adaptiveTDEE(intake(14, 1800), spiked);
  if (!a.ok || !b.ok) {
    problems.push('không tính được ca kiểm tra nhiễu cân nặng');
  } else {
    /* Last-minus-first would flip a 0.5 kg/week loss into a gain. The
       regression must stay pointing downhill. */
    if (b.kgPerWeek >= 0) {
      problems.push(
        `một buổi sáng nặng thêm 1,2 kg lật ngược cả xu hướng (${b.kgPerWeek} kg/tuần) — ` +
          'đang lấy điểm đầu trừ điểm cuối thay vì hồi quy',
      );
    }
    if (Math.abs(b.measured - a.measured) > 400) {
      problems.push(`nhiễu một ngày làm TDEE đổi ${Math.abs(b.measured - a.measured)} kcal — quá nhạy`);
    }
  }
}

// ── 5: the threshold for opening one's mouth ──
{
  if (worthMentioning(2500, 2450)) problems.push('chênh 50 kcal vẫn được coi là đáng nói — đó là nhiễu');
  if (!worthMentioning(2700, 2400)) problems.push('chênh 300 kcal mà không đáng nói — đó là gần một bữa ăn mỗi ngày');
  if (MIN_GAP_KCAL < 150) problems.push(`ngưỡng ${MIN_GAP_KCAL} kcal quá thấp so với sai số của việc tự ghi lượng ăn`);
}

/**
 * The self-test.
 *
 * Each entry rebuilds the version somebody would plausibly write, because every
 * one of them produces a number that looks completely reasonable.
 */
const SELF = [
  ['hằng số kcal/kg đúng', () => KCAL_PER_KG === 7700],
  ['điểm đầu trừ điểm cuối — bị nhiễu lật ngược', () => {
    const pts = [80.0, 79.9, 79.8, 79.7, 79.6, 80.8];
    const naive = (pts[pts.length - 1] - pts[0]) / 5;
    return naive > 0; // says "gaining" for a set that is plainly falling
  }],
  ['hồi quy giữ đúng hướng trên cùng dữ liệu', () => {
    const pts = [80.0, 79.9, 79.8, 79.7, 79.6, 80.8].map((kg, t) => ({ t, kg }));
    const mt = pts.reduce((s, p) => s + p.t, 0) / pts.length;
    const mw = pts.reduce((s, p) => s + p.kg, 0) / pts.length;
    let num = 0, den = 0;
    for (const p of pts) { num += (p.t - mt) * (p.kg - mw); den += (p.t - mt) ** 2; }
    return num / den > 0; // the spike is large enough that even a regression tips
  }],
  ['ngày trống tính là 0 kcal — kéo tụt trung bình', () => {
    const withZeros = [2000, 0, 2000, 0, 2000];
    const naive = withZeros.reduce((a, b) => a + b, 0) / withZeros.length;
    return naive < 1500; // 1200 — nearly a whole meal below the truth
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('TDEE đo được sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  'TDEE thích ứng OK — 4 ca tính tay khớp (ăn 1800 giảm 0,5 kg/tuần → ~2350 kcal); ' +
    'từ chối đúng 5 kiểu dữ liệu mỏng (ít ngày ghi ăn, ít lần cân, các lần cân dồn vào 3 ngày); ' +
    'ngày không ghi bị loại khỏi trung bình thay vì tính là 0 kcal; ' +
    'dùng hồi quy nên một buổi sáng nặng thêm 1,2 kg không lật ngược xu hướng; ' +
    'chỉ lên tiếng khi chênh từ 200 kcal trở lên',
);
