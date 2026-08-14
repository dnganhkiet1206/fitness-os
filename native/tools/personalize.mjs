/**
 * That the app's model of a person is arithmetic, not decoration.
 *
 * ── the two things that go wrong here ──
 *
 * **Hours are a circle and everybody forgets.** Somebody who logs supper at
 * 23:00, 00:00 and 01:00 has a habit at midnight. The arithmetic mean of 23, 0
 * and 1 is **8 in the morning** — not slightly off, but on the other side of
 * the day, and it is what every naive implementation returns. The test for it
 * is below, and so is the naive version, so the test can be shown to catch it.
 *
 * **A sampler that is nearly right looks fine.** Thompson sampling is only
 * worth anything if the draws really come from the posterior; a subtly biased
 * Beta sampler produces perfectly plausible numbers and an app that quietly
 * favours whatever the bias favours. So the sampler is checked against the
 * analytic mean *and* variance, and the ranking is checked twice over: that it
 * learns a real difference, and that it does **not** pretend to know anything
 * on day one.
 *
 * That second one matters more than it sounds. The failure of a bad bandit is
 * not that it never learns, it is that it locks onto its first accident and
 * then never explores again — and from the outside that looks exactly like a
 * confident, working product.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'personalize-'));
execFileSync(
  'npx',
  ['tsc', 'src/lib/bandit.ts', 'src/lib/user-rhythm.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const require_ = createRequire(import.meta.url);
const { newArm, reward, mean, sampleBeta, rankArms, seeded, CAP, noteAsk, credit, settle } =
  require_(path.join(out, 'bandit.js'));
const { emptyHours, observeHour, habit, isLate, lateHour, MIN_OBS } =
  require_(path.join(out, 'user-rhythm.js'));

const near = (a, b, tol) => Math.abs(a - b) <= tol;
const fold = (hours) => hours.reduce((s, h) => observeHour(s, h), emptyHours());

/* ── 1: the clock ── */
{
  // the case the whole module exists for
  const midnight = habit(fold([23, 0, 1, 23, 0, 1]));
  if (!midnight) problems.push('nửa đêm: 6 lần quanh 0h mà không nhận ra thói quen nào');
  else if (!near(midnight.hour, 0, 0.5) && !near(midnight.hour, 24, 0.5)) {
    problems.push(`nửa đêm: ra ${midnight.hour.toFixed(1)}h, đáng lẽ ~0h`);
  }

  const naive = [23, 0, 1, 23, 0, 1].reduce((a, b) => a + b, 0) / 6;
  if (near(naive, 0, 1) || near(naive, 24, 1)) {
    problems.push('tự kiểm: trung bình cộng thường cũng ra ~0h nên ca này không chứng minh gì');
  }

  const seven = habit(fold([7, 7, 7, 7, 7, 7]));
  if (!seven || !near(seven.hour, 7, 0.01) || !near(seven.strength, 1, 0.01)) {
    problems.push('đúng 7h sáu lần: phải ra 7h với độ nhất quán 1');
  }

  // no pattern at all → say nothing, do not invent a time
  const scattered = habit(fold([1, 5, 9, 13, 17, 21]));
  if (scattered) problems.push(`giờ rải đều khắp ngày mà vẫn nhận là thói quen ${scattered.hour.toFixed(1)}h`);

  const tooFew = habit(fold(Array(MIN_OBS - 1).fill(7)));
  if (tooFew) problems.push(`mới ${MIN_OBS - 1} lần đã dám kết luận thói quen`);
}

/* ── 2: lateness, and the night owl who must not be nagged at breakfast ── */
{
  const owl = habit(fold([21, 21, 20, 22, 21, 21]));
  if (!owl) {
    problems.push('cú đêm: 6 lần quanh 21h mà không ra thói quen');
  } else {
    const floor = 18;
    if (lateHour(owl, floor) <= floor) {
      problems.push('cú đêm: ngưỡng muộn không được sớm hơn thói quen của chính họ');
    }
    if (isLate(owl, 9, floor)) problems.push('cú đêm bị coi là muộn lúc 9h sáng');
    if (!isLate(owl, 23, floor)) problems.push('cú đêm 23h vẫn chưa bị coi là muộn');
  }

  // nobody with no habit gets a personalised threshold — the floor stands
  if (lateHour(null, 18) !== 18) problems.push('chưa có thói quen thì phải giữ nguyên mốc mặc định');
  if (isLate(null, 12, 18)) problems.push('chưa có thói quen mà 12h đã bị coi là muộn');
}

/* ── 3: the sampler really is Beta ── */
{
  const rnd = seeded(12345);
  for (const [a, b] of [[1, 1], [4, 2], [2, 8]]) {
    const arm = { alpha: a, beta: b };
    const N = 20000;
    let sum = 0;
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      const x = sampleBeta(arm, rnd);
      if (x < 0 || x > 1) problems.push(`Beta(${a},${b}) trả về ${x} — ngoài [0,1]`);
      sum += x;
      sumSq += x * x;
    }
    const m = sum / N;
    const v = sumSq / N - m * m;
    const wantM = a / (a + b);
    const wantV = (a * b) / ((a + b) * (a + b) * (a + b + 1));
    if (!near(m, wantM, 0.01)) problems.push(`Beta(${a},${b}): trung bình ${m.toFixed(3)}, đáng lẽ ${wantM.toFixed(3)}`);
    if (!near(v, wantV, 0.005)) problems.push(`Beta(${a},${b}): phương sai ${v.toFixed(4)}, đáng lẽ ${wantV.toFixed(4)}`);
  }
}

/* ── 4: it learns a real difference ── */
{
  const rnd = seeded(7);
  const truth = { water: 0.8, workout: 0.1 };
  let arms = { water: newArm(2, 2), workout: newArm(4, 2) };
  for (let day = 0; day < 120; day++) {
    const pick = rankArms(arms, rnd)[0];
    const win = rnd() < truth[pick];
    arms = { ...arms, [pick]: reward(arms[pick], win) };
  }
  let waterFirst = 0;
  for (let i = 0; i < 400; i++) if (rankArms(arms, rnd)[0] === 'water') waterFirst++;
  if (waterFirst < 280) {
    problems.push(
      `sau 120 ngày với nước 80% và tập 10%, nước chỉ đứng đầu ${waterFirst}/400 lần — chưa học được gì`,
    );
  }
  if (mean(arms.water) <= mean(arms.workout)) {
    problems.push('niềm tin về nước vẫn không cao hơn về tập, dù dữ liệu nói ngược lại');
  }
}

/* ── 5: and it does not pretend to know on day one ── */
{
  const rnd = seeded(99);
  const arms = { water: newArm(2, 2), meal: newArm(3, 2), workout: newArm(4, 2), sleep: newArm(2, 2) };
  const wins = {};
  for (let i = 0; i < 2000; i++) {
    const first = rankArms(arms, rnd)[0];
    wins[first] = (wins[first] ?? 0) + 1;
  }
  for (const k of Object.keys(arms)) {
    if (!wins[k]) problems.push(`ngày đầu: ${k} không bao giờ được chọn — đó là quy tắc cứng, không phải học`);
  }
  const top = Math.max(...Object.values(wins));
  if (top > 1600) {
    problems.push(`ngày đầu: một lựa chọn chiếm ${top}/2000 — tiên nghiệm cứng đến mức không còn thăm dò`);
  }
  /* The prior is the editorial order, so the strongest arm must still be the
     one the app would have hard-coded — learning starts from an opinion. */
  if ((wins.workout ?? 0) <= (wins.water ?? 0)) {
    problems.push('ngày đầu: tiên nghiệm không còn phản ánh thứ tự biên tập (tập trước nước)');
  }
}

/* ── 6: evidence is bounded, so a preference never becomes a rule ── */
{
  let arm = newArm(2, 2);
  for (let i = 0; i < 200; i++) arm = reward(arm, true);
  if (arm.alpha + arm.beta > CAP) problems.push(`bằng chứng vượt trần: ${arm.alpha}+${arm.beta} > ${CAP}`);
  if (!Number.isInteger(arm.alpha) || !Number.isInteger(arm.beta)) {
    problems.push('tham số Beta không còn là số nguyên — bộ lấy mẫu chính xác dựa vào điều đó');
  }
  if (mean(arm) >= 1) problems.push('thắng mãi thì niềm tin chạm 1 — không còn chỗ cho một ngày khác');
  let loser = newArm(2, 2);
  for (let i = 0; i < 200; i++) loser = reward(loser, false);
  if (mean(loser) <= 0) problems.push('thua mãi thì niềm tin chạm 0 — sẽ không bao giờ được thử lại');
}

/* ── 7: attribution — the ordinary day the one-slot version got wrong ──

   Midday: nothing logged, Koa asks about meals. Late afternoon: the training
   window opens and meals are *still* unlogged, so the sentence moves on and Koa
   asks about training. Evening: supper, logged. Next morning: training never
   happened.

   One win for meals and one loss for training. The order matters and is the
   whole point — a first draft of this case credited the meal *before* the second
   ask, which the broken version also gets right. */
{
  const D = '2026-08-14';
  const NEXT = '2026-08-15';
  const base = { arms: { meal: newArm(3, 2), workout: newArm(4, 2) }, asked: {} };

  let l = noteAsk(base, 'meal', D);
  l = noteAsk(l, 'workout', D);
  l = credit(l, 'meal', D);
  l = settle(l, NEXT);

  if (l.arms.meal.alpha !== 4 || l.arms.meal.beta !== 2) {
    problems.push(`quy công: bữa ăn ra ${l.arms.meal.alpha}/${l.arms.meal.beta}, đáng lẽ 4/2 (một lần thắng)`);
  }
  if (l.arms.workout.alpha !== 4 || l.arms.workout.beta !== 3) {
    problems.push(`quy công: tập ra ${l.arms.workout.alpha}/${l.arms.workout.beta}, đáng lẽ 4/3 (một lần thua)`);
  }
  if (Object.keys(l.asked).length !== 0) problems.push('quy công: sổ chưa được dọn sau khi sang ngày mới');

  // the shipped one-slot version, so the case above can be shown to catch it
  let slot = { arms: { meal: newArm(3, 2), workout: newArm(4, 2) }, pending: null };
  const ask = (s, k) => ({ ...s, pending: { quest: k, date: D } });
  const done = (s, k) =>
    s.pending && s.pending.quest === k
      ? { arms: { ...s.arms, [k]: reward(s.arms[k], true) }, pending: null }
      : s;
  const day = (s) =>
    s.pending && s.pending.date !== NEXT
      ? { arms: { ...s.arms, [s.pending.quest]: reward(s.arms[s.pending.quest], false) }, pending: null }
      : s;
  slot = day(done(ask(ask(slot, 'meal'), 'workout'), 'meal'));
  if (slot.arms.meal.alpha === 4 && slot.arms.workout.beta === 3) {
    problems.push('tự kiểm: bản một-ô-pending cũng ra đúng, nên ca này không chứng minh gì');
  }

  // a re-render is not a second ask
  const once = noteAsk(base, 'meal', D);
  if (noteAsk(once, 'meal', D) !== once) problems.push('gọi lại noteAsk cùng ngày lại tạo bản ghi mới');
  // and doing something nobody asked about must not be counted as persuasion
  const unasked = credit(base, 'water', D);
  if (unasked !== base) problems.push('làm một việc không ai nhắc lại được tính là nhắc thành công');
}

if (problems.length) {
  console.log('mô hình cá nhân:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'mô hình cá nhân OK — giờ giấc tính theo vòng tròn (23h/0h/1h ra ~0h, trung bình cộng ra 8h nên ca này có răng); ' +
    `dưới ${MIN_OBS} lần hoặc giờ rải đều thì KHÔNG kết luận; cú đêm không bị coi là muộn lúc 9h sáng; ` +
    'bộ lấy mẫu Beta khớp cả trung bình lẫn phương sai giải tích trên 3 tham số × 20.000 lượt; ' +
    'học được khác biệt thật (nước 80% vs tập 10% → 120 ngày là đứng đầu), ' +
    'ngày đầu vẫn thăm dò đủ 4 lựa chọn và giữ đúng thứ tự biên tập; ' +
    `bằng chứng bị chặn ở ${CAP} nên một sở thích không bao giờ thành luật; ` +
    'quy công chạy qua một ngày thật (sáng nhắc ăn → ăn xong; tối nhắc tập → không tập) ' +
    'ra đúng một thắng cho ăn và một thua cho tập, còn bản một-ô-pending đã ship thì không',
);
