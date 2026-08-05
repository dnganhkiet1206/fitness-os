/**
 * A reminder only exists if it still applies.
 *
 * ── what this pins down ──
 *
 * The five reminders were repeating daily alarms, so the workout nudge arrived
 * at 17:00 on rest days and again on days already trained; the weigh-in arrived
 * the morning after a weigh-in; water kept going after the target was met. Each
 * is a notification that is wrong about you, and the third wrong one in a week
 * is when the whole category gets switched off.
 *
 * iOS runs none of our code when a notification fires, so a reminder cannot
 * decide at the last moment whether it still applies. The only lever is not
 * scheduling it — which makes the *planner* the thing that has to be right, and
 * the planner is a pure module precisely so this can run it.
 *
 * ── what is checked ──
 *
 *  1. nothing is ever scheduled in the past
 *  2. done today is skipped today and back tomorrow
 *  3. a rest day gets no workout nudge, on any day of the horizon
 *  4. an unread routine schedules workouts, rather than silencing them
 *  5. bedtime is never skipped
 *  6. a disabled reminder produces nothing at all
 *  7. the water step is honoured and its window respected
 *  8. every planned time is a real local wall-clock time, across a DST change
 *  9. the signature changes when, and only when, the plan does
 * 10. the old always-on behaviour is rebuilt and required to fail rules 2 and 3
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'reminders-'));
const problems = [];

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/reminder-plan.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { planReminders, planSignature, routineIndexOf, HORIZON_DAYS, WATER_START_HOUR, WATER_END_HOUR } =
    createRequire(import.meta.url)(path.join(out, 'reminder-plan.js'));

  const ON = {
    water: { enabled: true, everyHours: 4 },
    supplements: { enabled: true, hour: 9, minute: 0 },
    bedtime: { enabled: true, hour: 22, minute: 30 },
    weighIn: { enabled: true, hour: 7, minute: 0 },
    workout: { enabled: true, hour: 17, minute: 0 },
  };
  const CLEAR = {
    workedOutToday: false,
    weighedToday: false,
    supplementsDone: false,
    waterDone: false,
    trainingDays: null,
  };
  /** a Wednesday, mid-morning — before every reminder time except water's first */
  const NOW = new Date(2026, 7, 5, 8, 30);
  const dayOf = (d) => Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate())) / 86400000);
  const on = (plan, key, day) => plan.filter((p) => p.key === key && dayOf(p.at) === day);

  // ── 1: nothing in the past ──
  const full = planReminders(ON, CLEAR, NOW);
  for (const p of full) {
    if (p.at.getTime() <= NOW.getTime()) problems.push(`${p.key} scheduled at ${p.at.toISOString()}, already past`);
  }
  if (full.length === 0) problems.push('a fully enabled week planned nothing at all');

  // ordered
  for (let i = 1; i < full.length; i++) {
    if (full[i].at < full[i - 1].at) { problems.push('the plan is not in time order'); break; }
  }

  // ── 2: done today is skipped today, and back tomorrow ──
  const done = [
    ['workedOutToday', 'workout'],
    ['weighedToday', 'weighIn'],
    ['supplementsDone', 'supplements'],
    ['waterDone', 'water'],
  ];
  for (const [flag, key] of done) {
    const plan = planReminders(ON, { ...CLEAR, [flag]: true }, NOW);
    if (on(plan, key, 0).length !== 0) problems.push(`${key} still scheduled today with ${flag}`);
    if (on(plan, key, 1).length === 0) problems.push(`${key} did not come back tomorrow after ${flag}`);
  }

  // ── 5: bedtime is never skipped ──
  const allDone = planReminders(ON, {
    workedOutToday: true, weighedToday: true, supplementsDone: true, waterDone: true, trainingDays: [],
  }, NOW);
  if (on(allDone, 'bedtime', 0).length !== 1) problems.push('bedtime was skipped on a day where everything was done');

  // ── 3: rest days get no workout nudge, anywhere in the horizon ──
  const wed = routineIndexOf(NOW);           // Monday = 0
  const onlyWed = planReminders(ON, { ...CLEAR, trainingDays: [wed] }, NOW);
  for (let d = 0; d < HORIZON_DAYS; d++) {
    const when = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() + d, 12, 0);
    const trains = routineIndexOf(when) === wed;
    const count = on(onlyWed, 'workout', d).length;
    if (trains && count !== 1) problems.push(`training day +${d} got ${count} workout reminders`);
    if (!trains && count !== 0) problems.push(`rest day +${d} got ${count} workout reminders`);
  }
  const noTraining = planReminders(ON, { ...CLEAR, trainingDays: [] }, NOW);
  if (noTraining.some((p) => p.key === 'workout')) problems.push('an all-rest week still planned a workout');

  // ── 4: an unread routine is not an empty one ──
  if (!full.some((p) => p.key === 'workout')) {
    problems.push('trainingDays === null silenced the workout reminder');
  }

  // ── 6: off means nothing ──
  const OFF = Object.fromEntries(Object.entries(ON).map(([k, v]) => [k, { ...v, enabled: false }]));
  if (planReminders(OFF, CLEAR, NOW).length !== 0) problems.push('disabled reminders still planned something');

  // ── 7: the water window and step ──
  const waterTomorrow = on(full, 'water', 1).map((p) => p.at.getHours());
  const expected = [];
  for (let h = WATER_START_HOUR; h <= WATER_END_HOUR; h += ON.water.everyHours) expected.push(h);
  if (waterTomorrow.join(',') !== expected.join(',')) {
    problems.push(`water fired at ${waterTomorrow.join(',')}, expected ${expected.join(',')}`);
  }
  for (const step of [0, -3, 1.4]) {
    const p = planReminders({ ...ON, water: { enabled: true, everyHours: step } }, CLEAR, NOW);
    const hours = on(p, 'water', 1).map((x) => x.at.getHours());
    if (hours.length === 0 || hours.some((h) => h < WATER_START_HOUR || h > WATER_END_HOUR)) {
      problems.push(`water step ${step} produced ${hours.join(',') || '(none)'}`);
    }
  }

  // ── 8: wall-clock times survive a DST change ──
  // Europe/London springs forward on 2026-03-29. A plan laid down before it must
  // still say 22:30 on the days after, not 21:30 or 23:30.
  const dst = new Date(2026, 2, 26, 8, 0);
  const across = planReminders(ON, CLEAR, dst);
  for (const p of across.filter((x) => x.key === 'bedtime')) {
    if (p.at.getHours() !== 22 || p.at.getMinutes() !== 30) {
      problems.push(`bedtime landed at ${p.at.getHours()}:${p.at.getMinutes()} across a DST boundary`);
    }
  }

  // ── 9: the signature tracks the plan ──
  if (planSignature(full) !== planSignature(planReminders(ON, CLEAR, NOW))) {
    problems.push('the same inputs produced two signatures');
  }
  /*
    `workedOutToday`, not `weighedToday`. The weigh-in is set for 07:00 and
    `NOW` is 08:30, so today's weigh-in was already in the past and never in the
    plan — skipping it changes nothing, and a test that expected a change there
    was testing the clock rather than the rule. The check caught it.
  */
  if (planSignature(full) === planSignature(planReminders(ON, { ...CLEAR, workedOutToday: true }, NOW))) {
    problems.push('the signature did not change when the plan did');
  }

  // ── 10: teeth. The old behaviour has to fail 2 and 3. ──
  const alwaysOn = (prefs) => {
    const items = [];
    for (let d = 0; d < HORIZON_DAYS; d++) {
      if (prefs.workout.enabled) items.push({ key: 'workout', day: d });
      if (prefs.weighIn.enabled) items.push({ key: 'weighIn', day: d });
    }
    return items;
  };
  const old = alwaysOn(ON);
  if (old.filter((i) => i.key === 'workout' && i.day === 0).length === 0) {
    problems.push('the rebuilt old behaviour no longer nudges on a trained day — this proves nothing');
  }
  if (old.filter((i) => i.key === 'workout').length !== HORIZON_DAYS) {
    problems.push('the rebuilt old behaviour no longer nudges on rest days — this proves nothing');
  }

  if (problems.length) {
    console.error('nhắc nhở CÓ LỖI:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }

  console.log(
    `nhắc nhở OK — ${full.length} lịch trong ${HORIZON_DAYS} ngày, không cái nào ở quá khứ; ` +
      'việc đã làm hôm nay thì bỏ hôm nay và quay lại ngày mai; ngày nghỉ không nhắc tập; ' +
      'chưa đọc lịch tuần thì vẫn nhắc; giờ đi ngủ không bao giờ bị bỏ; ' +
      'giờ đúng cả khi đổi giờ mùa; bản cũ (nhắc mọi ngày) vẫn bị bắt',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
