/**
 * That the companion notices what you did, and never claims something you didn't.
 *
 * ── what this is about ──
 *
 * Koa's line used to be a ladder of four reproaches and one generic compliment:
 * four of its six outcomes told you about something you had *not* done, and the
 * fifth said the same sentence whatever you had. Duolingo's own designers are
 * explicit that the mechanism a mascot buys you is not the reminder — it is that
 * you do not want to disappoint the character — and that only works if the
 * character is visibly pleased when there is something to be pleased about. A
 * companion that only ever counts absences is a nag with a face.
 *
 * So the voice is checked as a *balance*, not one line at a time, across a whole
 * matrix of days and hours:
 *
 *   1. **Never invent a win.** Every line that names something done must name
 *      something the day actually contains. This is the app's standing rule —
 *      never state what is not there — applied to a character's mouth.
 *   2. **Never nag on a day it could not read.** All four fields `null` is a
 *      failed query, not an empty day, and the old ladder could not tell the
 *      difference: a dropped request had Koa asking for the meal you had already
 *      logged. The line must go silent instead.
 *   3. **Acknowledgement is not rarer than reproach.** Over a full sweep of
 *      plausible days, lines that name a win must at least equal lines that only
 *      ask. If a change ever makes Koa nag more than it notices, this fails.
 *   4. **A day with everything done is never asked for anything**, and a day
 *      with nothing done is never praised.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(NATIVE, '.check-mascot-'));

try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/mascot-message.ts', '--ignoreConfig', '--outDir', out,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const { mascotLine, GAP_FROM, GAP_SPAN } =
    createRequire(import.meta.url)(path.join(out, 'mascot-message.js'));

  const problems = [];

  /* Case 2 first — it is the one that used to be wrong in a way nobody could
     see, because a failed query looks exactly like a quiet morning. */
  for (let hour = 0; hour < 24; hour++) {
    const line = mascotLine({ sleepMin: null, meals: null, waterPct: null, workouts: null, hour });
    if (line.kind !== 'silent') {
      problems.push(`giờ ${hour}: ngày không đọc được mà vẫn nói "${line.kind}" — im lặng mới đúng`);
    }
  }
  /* and a half-read day must not count as read */
  for (const partial of [
    { sleepMin: 400, meals: null, waterPct: 80, workouts: 1 },
    { sleepMin: null, meals: 3, waterPct: 80, workouts: 1 },
    { sleepMin: 400, meals: 3, waterPct: null, workouts: 1 },
    { sleepMin: 400, meals: 3, waterPct: 80, workouts: null },
  ]) {
    const line = mascotLine({ ...partial, hour: 19 });
    if (line.kind !== 'silent') {
      problems.push(`ngày đọc thiếu một mảng mà vẫn nói "${line.kind}" — nửa ngày không phải một ngày`);
    }
  }

  /* The sweep: every combination of the four things, every hour. */
  let notices = 0;
  let asks = 0;
  let praises = 0;
  let sweep = 0;

  for (let bits = 0; bits < 16; bits++) {
    const did = {
      sleep: !!(bits & 1),
      meal: !!(bits & 2),
      water: !!(bits & 4),
      workout: !!(bits & 8),
    };
    for (let hour = 0; hour < 24; hour++) {
      sweep++;
      const day = {
        sleepMin: did.sleep ? 430 : 0,
        meals: did.meal ? 3 : 0,
        waterPct: did.water ? 80 : 10,
        workouts: did.workout ? 1 : 0,
        hour,
      };
      const line = mascotLine(day);

      // 1. a named win must be true
      if (line.kind === 'notice') {
        notices++;
        if (!did[line.win]) {
          problems.push(
            `giờ ${hour}, ngày ${JSON.stringify(did)}: khen "${line.win}" trong khi hôm nay KHÔNG có việc đó`,
          );
        }
        if (did[line.gap]) {
          problems.push(
            `giờ ${hour}, ngày ${JSON.stringify(did)}: đòi "${line.gap}" trong khi việc đó đã xong`,
          );
        }
      }
      if (line.kind === 'ask') {
        asks++;
        if (did[line.gap]) {
          problems.push(`giờ ${hour}: đòi "${line.gap}" trong khi việc đó đã xong`);
        }
        // 4. an "ask" means nothing has been done — so nothing may be true
        if (Object.values(did).some(Boolean)) {
          problems.push(
            `giờ ${hour}, ngày ${JSON.stringify(did)}: chỉ đòi mà không ghi nhận gì, dù hôm nay có việc đã xong`,
          );
        }
      }
      if (line.kind === 'praise') {
        praises++;
        // 4. praise on a day with nothing done is a lie
        if (!Object.values(did).some(Boolean)) {
          problems.push(`giờ ${hour}: khen một ngày chưa làm gì cả`);
        }
      }
    }
  }

  /*
    ── 2b. the ask lands on this person's clock, not on an imagined one ──

    `GAP_FROM` used to be the whole answer: ask about a workout from four in
    the afternoon, whoever you are. Somebody on nights who trains at ten in the
    evening was therefore asked, wrongly, every single afternoon — and an ask
    that is wrong at the moment it is made is exactly how a companion becomes a
    nag. `lateHour` had been written for this and had no caller in the app.

    Four things are checked, and the last two are the ones that would let the
    old behaviour back in unnoticed.
  */
  {
    const nothing = { sleepMin: 0, meals: 0, waterPct: 0, workouts: 0 };
    const asked = (hour, dueFrom) => {
      const l = mascotLine({ ...nothing, hour }, undefined, dueFrom);
      return l.kind === 'ask' || l.kind === 'notice' ? l.gap : null;
    };

    // a stranger keeps exactly the shipped behaviour
    if (asked(16, {}) === null) problems.push('người mới không còn được hỏi về buổi tập lúc 16h');

    // the night worker, asked in their own evening and left alone in the day
    const owl = { workout: 22 };
    if (asked(16, owl) === 'workout') {
      problems.push('người tập lúc 22h vẫn bị hỏi về buổi tập lúc 16h — giờ học được không tới nơi');
    }
    if (asked(22, owl) !== 'workout') {
      problems.push('người tập lúc 22h lại KHÔNG được hỏi vào đúng giờ của họ');
    }
    // and the window travels with them across midnight
    if (asked(1, owl) !== 'workout') {
      problems.push('cửa sổ mở lúc 22h không chứa 1h sáng — số học đồng hồ không vòng');
    }

    // a closed window still closes, or "still time to train" stops being true
    if (asked(14, { workout: 16 }) === 'workout') {
      problems.push('hỏi về buổi tập TRƯỚC giờ mở cửa sổ');
    }
    if (GAP_SPAN.meal !== null || GAP_SPAN.water !== null) {
      problems.push('bữa ăn hoặc nước bị đóng cửa sổ — người chưa ăn tới tối vẫn phải được hỏi');
    }
    // an unfed evening must still be asked about, which a 6-hour window would kill
    if (asked(19, {}) === null) problems.push('19h chưa ăn gì mà Koa im');
  }

  // 3. the balance
  const acknowledged = notices + praises;
  if (acknowledged < asks) {
    problems.push(
      `giọng nghiêng về càu nhàu: ${asks} câu chỉ đòi so với ${acknowledged} câu có ghi nhận — ` +
        'một linh vật chỉ đếm những thứ bạn chưa làm thì là cái loa nhắc nhở có mặt mũi',
    );
  }

  if (problems.length) {
    console.log('giọng của linh vật sai:\n');
    for (const p of problems) console.log(`  ${p}`);
    process.exit(1);
  }

  console.log(
    `giọng linh vật OK — quét ${sweep} ca (16 tổ hợp việc × 24 giờ): ${acknowledged} câu có ghi nhận ` +
      `(${notices} vừa khen vừa nhắc, ${praises} khen hẳn) so với ${asks} câu chỉ đòi; ` +
      'không câu nào khen một việc chưa xảy ra hay đòi một việc đã xong; ' +
      'ngày không đọc được thì im ở cả 24 giờ, và đọc thiếu một mảng cũng vậy',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
