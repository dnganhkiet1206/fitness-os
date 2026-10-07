#!/usr/bin/env node
/**
 * Golden cho kế hoạch dinh dưỡng của onboarding (#424): `planFromEntry` /
 * `calcPlan` / `calcAge` của CHÍNH `native/src/lib/fitness-calc.ts` @ fac9ac2.
 * "Hôm nay" ghim ở 2026-10-05 (`calcAge` đọc `new Date()`).
 *
 *   ./build.sh && TZ=Asia/Ho_Chi_Minh node gen-plan.mjs > ../../Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/plan-golden.json
 */
const RealDate = Date;
const FIXED = new RealDate('2026-10-05T07:00:00.000Z').getTime();
globalThis.Date = class extends RealDate {
  constructor(...a) { super(...(a.length ? a : [FIXED])); }
  static now() { return FIXED; }
};
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { planFromEntry, calcAge } = require('./out/fitness-calc.js');

const sexes = ['male', 'female', 'other'];
const goals = ['bulk', 'cut', 'strength', 'endurance', 'maintain', 'recomp', 'weird'];
const acts = ['sedentary', 'light', 'moderate', 'high', 'athlete', ''];
const bodies = [
  ['170', '70'], ['150', '45'], ['195', '130'], ['160', '140'], ['100', '20'], ['250', '400'],
  ['99', '70'], ['170', '19.9'], ['', '70'], ['170', ''], ['17O', '70'], [' 182.5 ', '81.3'], ['-170', '70'],
  ['1e2', '70'], ['.5', '70'],
];
const dobs = ['2000-01-01', '2008-10-05', '2008-10-06', '1990-02-28', '1896-01-01', '2027-01-01', '', null, '1950-12-31'];
const cases = [];
let i = 0;
for (const [h, w] of bodies) for (const dob of dobs) {
  const sex = sexes[i % 3], goal = goals[i % goals.length], act = acts[i % acts.length];
  i++;
  const input = { heightText: h, weightText: w, dob, sex, goal, activity_level: act };
  cases.push({ input, out: planFromEntry(input) });
}
// Mọi tổ hợp giới × mục tiêu × vận động trên một cơ thể hợp lệ — phủ đủ các
// nhánh sàn calo / sàn chất béo / sàn đạm.
for (const sex of sexes) for (const goal of goals) for (const act of acts) for (const [h, w] of [['152', '41'], ['176', '78'], ['168', '120']]) {
  const input = { heightText: h, weightText: w, dob: '1995-06-15', sex, goal, activity_level: act };
  cases.push({ input, out: planFromEntry(input) });
}
// Thân lớn, tuổi cao, ăn thâm hụt: đạm theo cân nặng tham chiếu + chất béo +
// 50 g tinh bột vượt số calo — chạy nhánh hạ chất béo về sàn rồi hạ đạm về sàn.
for (const sex of sexes) for (const goal of goals) for (const act of acts) for (const [h, w] of [['180', '100'], ['200', '140'], ['190', '120']]) {
  const input = { heightText: h, weightText: w, dob: '1930-01-01', sex, goal, activity_level: act };
  cases.push({ input, out: planFromEntry(input) });
}
// Cao tuổi, ít vận động, ăn thâm hụt quanh sàn 1200: hạ chất béo về sàn vẫn
// chưa đủ, phải hạ cả đạm về sàn 1.2 g/kg (vd. nữ 170 cm 87 kg 100 tuổi, cut).
for (const sex of ['female', 'other']) for (const goal of ['cut', 'bulk', 'maintain']) for (const act of ['sedentary', 'light'])
  for (const h of ['160', '165', '170', '175']) for (const w of ['80', '87', '95']) {
    const input = { heightText: h, weightText: w, dob: '1926-10-05', sex, goal, activity_level: act };
    cases.push({ input, out: planFromEntry(input) });
  }
// Khoảng trắng: `String.prototype.trim` bỏ BOM (U+FEFF), NBSP, U+3000, LS / PS,
// tab; GIỮ NEL (U+0085) và ZWSP (U+200B) — ô có chúng là sai dạng.
for (const [h, w] of [['\uFEFF170', '70'], ['170\uFEFF', '\u00A070\u3000'], ['\u2028170\u2029', '70\t'],
  ['\u0085170', '70'], ['170', '70\u0085'], ['\u200B170', '70']]) {
  const input = { heightText: h, weightText: w, dob: '1995-06-15', sex: 'male', goal: 'cut', activity_level: 'moderate' };
  cases.push({ input, out: planFromEntry(input) });
}
const ages = ['2000-10-05', '2000-10-06', '2000-10-04', '2024-02-29', '1926-10-05'].map((d) => ({ dob: d, age: calcAge(d) }));
process.stdout.write(JSON.stringify({ source: 'native/src/lib/fitness-calc.ts @ fac9ac2', today: '2026-10-05', cases, ages }, null, 0) + '\n');
