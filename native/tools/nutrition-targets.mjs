/**
 * That the calorie and macro targets the app hands somebody are safe to eat to.
 *
 * ── why this is the sharpest edge in the app ──
 *
 * Everything else the app computes is a *description*: a readiness score, a
 * trend, an ACWR. Get one wrong and somebody reads a wrong sentence. These four
 * numbers are a *prescription* — they are what a person eats to, every day, for
 * months. A wrong one is not a wrong sentence; it is a wrong diet.
 *
 * So this does not test a handful of chosen profiles. It sweeps the whole space
 * of people who can come out of onboarding — every weight, height, age, sex,
 * activity level and goal the form allows — and asserts on all of them.
 *
 * ── the three things that were wrong ──
 *
 * 1. **No floor.** `cut` was a flat 20% off TDEE and 20% of a small number is a
 *    small number. A 45 kg, 150 cm, 25-year-old sedentary woman came out at
 *    **1,058 kcal/day** — under her own resting metabolism of 1,102. The NIH
 *    puts the unsupervised floor at 1,200 kcal for women and 1,500 for men, and
 *    MyFitnessPal will not let a goal be set below those whatever the maths says.
 *
 * 2. **Protein charged against total body weight.** Protein need tracks
 *    fat-free mass; fat above BMI 30 adds almost none. At 2.4 g/kg a 150 kg
 *    person was told to eat **360 g of protein** — 1,440 kcal, most of their
 *    entire cut target.
 *
 * 3. **The macros did not add up to the calories.** Carbohydrate was the
 *    remainder and then `Math.max(carbs, 50)`, so when protein and fat had
 *    already eaten the budget the clamp quietly put energy back that the
 *    calorie target did not have. The nutrition card then showed four rings
 *    where filling every macro ring puts you **225 kcal over** the calorie ring
 *    directly above it — two numbers on one screen contradicting each other.
 *
 * The three interact, which is why they are checked together: (2) is what made
 * (3) fire, and (1) is what stops (3) from firing at the other end.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'nutri-'));
execFileSync(
  'npx',
  ['tsc', 'src/lib/fitness-calc.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const {
  calcBMR, calcTDEE, calcTargetCalories, calcMacros, calcWaterTarget, proteinReferenceWeight, FIBER_G_PER_1000_KCAL,
} = await import(pathToFileURL(path.join(out, 'fitness-calc.js')).href);

/* The floors this file holds the app to. Written out here rather than imported
   so that changing the constant in the app cannot silently change the test. */
const FLOOR = { female: 1200, male: 1500, other: 1500 };

const SEXES = ['male', 'female', 'other'];
const ACTIVITIES = ['sedentary', 'light', 'moderate', 'high', 'athlete'];
const GOALS = ['maintain', 'cut', 'bulk', 'recomp', 'strength', 'endurance'];

/*
  ── the sweep ──

  The ranges are the ones the onboarding form will actually accept, widened at
  both ends rather than narrowed: a 40 kg 140 cm person and a 180 kg 205 cm one
  are both rarer than the middle and both far more likely to break the maths,
  which is exactly why they belong in the sweep instead of a comment.
*/
let cases = 0;
let floorBound = 0;      // how often the calorie floor actually raised a target
let capBound = 0;        // how often the BMI-30 protein cap actually bit
let rebalanced = 0;      // how often the carb shortfall had to be paid for
let carbsClamped = 0;    // how often carbohydrate hit its last-resort zero
const worst = { identity: 0, at: null };

/** Every failure mode gets one line, not one line per case — 268k cases would bury it. */
const seen = new Set();
const fail = (key, msg) => { if (!seen.has(key)) { seen.add(key); problems.push(msg); } };

for (let w = 40; w <= 180; w += 5) {
  for (let h = 140; h <= 205; h += 5) {
    for (let age = 18; age <= 80; age += 6) {
      for (const sex of SEXES) {
        const bmr = calcBMR(w, h, age, sex);
        for (const activity of ACTIVITIES) {
          const tdee = calcTDEE(bmr, activity);
          for (const goal of GOALS) {
            cases++;
            const who = `${w}kg ${h}cm ${age}t ${sex} ${activity} ${goal}`;
            const target = calcTargetCalories(tdee, goal, sex);

            // ── 1: nobody is ever told to eat below the floor ──
            if (target < FLOOR[sex]) {
              fail('floor', `${who}: mục tiêu ${target} kcal, dưới sàn ${FLOOR[sex]} kcal`);
            }
            const unfloored =
              goal === 'cut' ? Math.round(tdee * 0.8)
              : goal === 'bulk' ? Math.round(tdee * 1.1)
              : goal === 'strength' || goal === 'endurance' ? Math.round(tdee * 1.05)
              : Math.round(tdee);
            if (unfloored < FLOOR[sex]) floorBound++;
            // the floor may only ever raise a target, never lower one
            if (target < unfloored) {
              fail('lowered', `${who}: sàn kéo mục tiêu XUỐNG ${unfloored} → ${target}`);
            }

            const m = calcMacros(target, w, goal, h);

            // ── 2: the three macros add up to the calorie target ──
            const sum = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
            const off = Math.abs(sum - target);
            if (off > worst.identity) { worst.identity = off; worst.at = who; }
            if (off > 2) {
              fail('identity',
                `${who}: đạm+tinh bột+béo = ${sum} kcal nhưng mục tiêu là ${target} kcal ` +
                `(lệch ${sum - target}) — no đủ ba vòng macro mà vẫn vượt vòng calo`);
            }

            // ── 3: no macro is absurd on its own ──
            if (m.protein_g <= 0 || m.fat_g <= 0 || m.carbs_g < 0) {
              fail('negative', `${who}: đạm ${m.protein_g}g, béo ${m.fat_g}g, tinh bột ${m.carbs_g}g`);
            }
            if (m.carbs_g === 0) carbsClamped++;
            /* Fat below a fifth of calories is outside the IOM's acceptable
               range (20–35%) and stops being a diet. −1 g of slack for the
               rounding of `fat_g` itself. */
            if ((m.fat_g + 1) * 9 < target * 0.2) {
              fail('fatfloor', `${who}: béo ${m.fat_g}g = ${Math.round((m.fat_g * 9 * 100) / target)}% calo, dưới ngưỡng 20%`);
            }

            // ── 4: fibre scales with calories ──
            const wantFiber = Math.round((target / 1000) * FIBER_G_PER_1000_KCAL);
            if (m.fiber_g !== wantFiber) {
              fail('fiber', `${who}: chất xơ ${m.fiber_g}g, cần ${wantFiber}g (14g/1000kcal)`);
            }

            // ── 5: protein is charged against a body weight capped at BMI 30 ──
            const refKg = proteinReferenceWeight(w, h);
            const bmi = w / (h / 100) ** 2;
            if (bmi > 30) {
              capBound++;
              if (refKg >= w) {
                fail('cap', `${who}: BMI ${bmi.toFixed(1)} nhưng cân nặng tính đạm vẫn là ${refKg}kg`);
              }
            } else if (refKg !== w) {
              fail('overcap', `${who}: BMI ${bmi.toFixed(1)} ≤ 30 mà cân nặng tính đạm bị đổi ${w} → ${refKg}`);
            }
            const perKg = goal === 'bulk' ? 2.2 : goal === 'cut' ? 2.4 : goal === 'strength' ? 2.0 : 1.8;
            if (m.protein_g > Math.round(refKg * perKg)) {
              fail('protein-high', `${who}: đạm ${m.protein_g}g vượt ${perKg}g/kg của ${refKg}kg`);
            }
            if (m.protein_g < Math.round(refKg * perKg)) rebalanced++;
            /* Whatever the rebalance took, it may never push protein under the
               1.2 g/kg that the same paper puts as the weight-loss minimum. */
            if (m.protein_g < Math.round(refKg * 1.2) - 1) {
              fail('protein-low', `${who}: đạm ${m.protein_g}g dưới sàn 1,2g/kg (${Math.round(refKg * 1.2)}g)`);
            }
          }
        }
      }
    }
  }
}

/*
  ── the water target ──

  35 ml/kg is fine through the normal range and runs away above it, because it
  charges fat mass at the same rate as lean and adipose tissue holds far less
  water: a 150 kg person came out at 5.25 litres a day. The documented
  adjustment drops the coefficient to 25 ml/kg at BMI 30.

  Applied as published that puts an 870 ml step at the threshold, so the
  adjusted figure is floored at what somebody at BMI 30 of the same height gets.
  Both coefficients are the published ones; the floor only removes the step —
  which is what the first two assertions here are about, since a target that
  falls off a cliff or goes *down* as somebody gains weight reads as a bug
  whatever the physiology says.
*/
{
  for (let h = 145; h <= 200; h += 5) {
    let prev = 0;
    for (let w = 40; w <= 200; w += 1) {
      const ml = calcWaterTarget(w, h);
      if (ml < prev) {
        problems.push(`nước: ${h}cm, ${w}kg ra ${ml}ml — thấp hơn người nhẹ hơn 1kg (${prev}ml)`);
        break;
      }
      if (prev > 0 && ml - prev > 200) {
        problems.push(`nước: ${h}cm, ${w}kg nhảy ${ml - prev}ml chỉ vì nặng thêm 1kg — có bậc thang ở ngưỡng BMI`);
        break;
      }
      prev = ml;
    }
  }

  /* Under BMI 30 nothing may change: this is the range nearly every user is in,
     and the old rule was right there. */
  for (const [w, h] of [[70, 175], [55, 160], [90, 190], [50, 150]]) {
    const bmi = w / (h / 100) ** 2;
    if (bmi < 30 && calcWaterTarget(w, h) !== Math.round(w * 35)) {
      problems.push(`nước: ${w}kg/${h}cm (BMI ${bmi.toFixed(1)}) bị đổi mục tiêu dù dưới BMI 30`);
    }
  }

  /* And the case this started from. */
  const heavy = calcWaterTarget(150, 170);
  if (heavy >= 5000) problems.push(`nước: 150kg/170cm vẫn ra ${heavy}ml — tính mỡ với cùng tỉ lệ như nạc`);
  if (heavy < 3000) problems.push(`nước: 150kg/170cm chỉ còn ${heavy}ml — cắt quá tay`);
  if (calcWaterTarget(70) !== 2450) problems.push('nước: không có chiều cao thì phải giữ nguyên 35ml/kg');
}

/*
  ── the rebalance branch, on purpose ──

  Across the sweep above the shortfall path never fires: the BMI-30 cap removed
  the case that used to trigger it. That is the right outcome and a bad reason
  to leave the branch untested — untested code that never runs today is code
  that runs wrong the first day something changes.

  So it is called directly, with a target no chain in the app produces for a
  reference weight this large. The point is not that this person exists; it is
  that if one ever does, the numbers still add up and neither floor is broken.
*/
{
  const m = calcMacros(1200, 126, 'cut', 205);
  const sum = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
  if (Math.abs(sum - 1200) > 2) {
    problems.push(`bù trừ macro: tổng ${sum} kcal ≠ 1200 — nhánh bù trừ làm hỏng đẳng thức`);
  }
  if ((m.fat_g + 1) * 9 < 1200 * 0.2) {
    problems.push(`bù trừ macro: béo tụt xuống ${m.fat_g}g, dưới ngưỡng 20% calo`);
  }
  if (m.protein_g < Math.round(126 * 1.2) - 1) {
    problems.push(`bù trừ macro: đạm tụt xuống ${m.protein_g}g, dưới sàn 1,2g/kg`);
  }
  if (m.protein_g >= Math.round(126 * 2.4)) {
    problems.push('bù trừ macro: không nhánh nào chạy — ca dựng để thử nhánh bù trừ không còn kích hoạt nó');
  }
}

/*
  ── the person this started from ──

  Kept as a named case, separate from the sweep, because a regression here is
  the one that matters most and a sweep failure reads as an abstraction.
*/
{
  const bmr = calcBMR(45, 150, 25, 'female');       // 1102
  const tdee = calcTDEE(bmr, 'sedentary');          // 1322
  const target = calcTargetCalories(tdee, 'cut', 'female');
  if (target < 1200) {
    problems.push(`phụ nữ 45kg/150cm/25t ít vận động, mục tiêu giảm cân: ${target} kcal — dưới sàn 1200`);
  }
  if (Math.round(tdee * 0.8) >= 1200) {
    problems.push('ca kiểm tra hỏng: 0,8×TDEE của người này lẽ ra phải dưới 1200 thì sàn mới có việc để làm');
  }
}

if (carbsClamped > 0) {
  problems.push(`${carbsClamped} hồ sơ có tinh bột bằng 0 — chốt chặn cuối cùng đáng lẽ không bao giờ chạm tới`);
}

/**
 * The self-test.
 *
 * Each entry rebuilds the version that shipped, and each one has to come out
 * wrong. If any of them comes out fine, the check above is measuring nothing.
 */
const SELF = [
  ['không có sàn calo — kê 1058 kcal/ngày', () => {
    const tdee = calcTDEE(calcBMR(45, 150, 25, 'female'), 'sedentary');
    return Math.round(tdee * 0.8) < 1100; // 1058, dưới cả BMR 1102 của chính họ
  }],
  ['chất xơ cố định 30g — sai ở cả hai đầu', () => {
    const at1500 = Math.round((1500 / 1000) * 14);   // 21
    const at3500 = Math.round((3500 / 1000) * 14);   // 49
    return Math.abs(30 - at1500) >= 9 && Math.abs(30 - at3500) >= 19;
  }],
  /* Dựng lại cả hai bên bằng số học tại chỗ. Bản đầu gọi thẳng
     `proteinReferenceWeight` của app, nên khi phá hoại đúng hàm đó thì phép tự
     kiểm hỏng trước và che mất việc vòng quét có bắt được hay không — một phép
     tự kiểm chỉ kiểm chính nó thì không kiểm gì cả. */
  ['đạm tính trên cân nặng tổng — 360g cho người 150kg', () => {
    const naive = Math.round(150 * 2.4);
    const capped = Math.round(Math.min(150, 30 * 1.7 ** 2) * 2.4); // 150kg/170cm → chặn ở 86,7kg
    return naive === 360 && capped < 250;
  }],
  ['kẹp tinh bột ở 50g — macro cộng vượt mục tiêu calo', () => {
    /* 180 kg, 160 cm, 55, nữ, ít vận động, giảm cân — đúng chuỗi tính cũ. */
    const tdee = calcTDEE(calcBMR(180, 160, 55, 'female'), 'sedentary');
    const target = Math.round(tdee * 0.8);
    const p = Math.round(180 * 2.4);
    const f = Math.round((target * 0.25) / 9);
    const rawCarbs = Math.round((target - p * 4 - f * 9) / 4);
    const clamped = Math.max(rawCarbs, 50);
    const sum = p * 4 + clamped * 4 + f * 9;
    return rawCarbs < 0 && sum - target > 150; // tinh bột âm, và tổng vượt >150 kcal
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('mục tiêu dinh dưỡng sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `mục tiêu dinh dưỡng OK — quét ${cases.toLocaleString('vi-VN')} hồ sơ (40–180kg × 140–205cm × 18–80t × 3 giới × 5 mức vận động × 6 mục tiêu); ` +
    `không hồ sơ nào bị kê dưới sàn 1200/1500 kcal (sàn phải can thiệp ở ${floorBound.toLocaleString('vi-VN')} hồ sơ, và chỉ kéo lên chứ không kéo xuống); ` +
    `đạm + tinh bột + béo luôn bằng đúng mục tiêu calo (lệch lớn nhất ${worst.identity} kcal do làm tròn), nên no đủ ba vòng macro không thể vượt vòng calo; ` +
    `chất xơ 14g/1000kcal thay vì 30g cố định; ` +
    `đạm tính trên cân nặng chặn ở BMI 30 (bít ở ${capBound.toLocaleString('vi-VN')} hồ sơ), không hồ sơ nào chạm chốt tinh bột bằng 0; ` +
    'nhánh bù trừ được gọi thẳng để thử vì chuỗi tính của app không còn kích hoạt nó',
);
