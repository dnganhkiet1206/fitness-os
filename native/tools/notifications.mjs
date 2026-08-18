/**
 * A scheduled notification belongs to a person, and the OS holds only 64.
 *
 * ── the primary question this chain started from ──
 *
 * Can a notification scheduled by user A survive logout and fire while user B
 * is using the same phone?
 *
 * **No**, and it is proven by running it rather than by reading it: rule A
 * schedules a full plan through the real `scheduleReminderPlan`, then calls the
 * real `cancelAllReminders` — the function `use-auth`'s `forgetPreviousAccount`
 * calls on the `SIGNED_OUT` event — and looks at what the centre still holds.
 * 77 pending → 0. That cleanup is Chain E's, hung off the auth event rather
 * than off the Settings button, so every door out of a session goes through it:
 * the button, a refresh token that no longer works, a password change that
 * revoked sessions, and delete-account (which calls `signOut()` itself).
 *
 * Three more things are absent rather than fixed, and absence is worth writing
 * down so nobody looks for the bug that cannot exist here:
 *
 *   · There is **no notification response listener** anywhere in the app — no
 *     `addNotificationResponseReceivedListener`, no
 *     `useLastNotificationResponse`. Tapping a reminder opens the app and
 *     nothing else runs. So a notification cannot carry an action across a
 *     logout, which is the Chain F queue-identity attack in this subsystem.
 *   · The content is `{ title, body }` and **no `data` payload**. Nothing to
 *     treat as authority, no entity id to deep-link with.
 *   · `use-daily-quests` and `use-smart-nudges` schedule nothing. They are
 *     in-app surfaces; the OS never hears about them, so a quest that stops
 *     qualifying has no notification left behind.
 *
 * ── what was wrong, all of it one thing ──
 *
 * There was no single, verified owner of the OS schedule.
 *
 * **The horizon asked for more than iOS will hold.** `UNUserNotificationCenter`
 * keeps 64 pending requests per app. On the app's *own defaults* — water every
 * two hours — the plan is 77. Driven through the real function against a centre
 * that enforces the cap: 64 pending, last survivor on day 5, and the plan asked
 * through day 7. The loop sat inside one `try` with an empty `catch`, so the
 * first refusal abandoned every reminder after it.
 *
 * **Two hooks owned one schedule.** `useReminderSync()` runs on Today and the
 * Reminders screen mounts `useReminders()` on top of it — a pushed route leaves
 * the tab mounted. Each had its own `useState` copy of the switches, read once
 * at its own mount. Switch bedtime on, let any shared query update, and Today's
 * copy — which still says off — rebuilds the schedule from scratch: 7 pending
 * → 0, with the switch still on and the stored preference still on.
 *
 * **And they raced.** Cancel-everything-then-add-them-back, with an `await` per
 * step, interleaves as cancel → cancel → add×n → add×n. Five runs out of five:
 * plan 56, pending 112.
 *
 * **The record was written before the act.** `setItem(PLAN_KEY, signature)` ran
 * *before* the OS was asked, and the OS call swallowed failures. The next sync
 * compares against that record and exits early — so one refusal meant nothing
 * was ever rescheduled again. Measured: 19 of 56 pending, signature claiming
 * all 56.
 *
 * ── how the rules work ──
 *
 * Every rule **runs** the real `notifications.ts` and `reminder-plan.ts`
 * against a stand-in notification centre that behaves the way iOS is documented
 * to: a hard cap, and a refusal past it. Nothing here greps for a cleanup call.
 * That is deliberate — the Chain K post-mortem is that a rule which reads a
 * guard cannot tell you the guard works.
 *
 * ── what these rules cannot tell you ──
 *
 * The centre is a stand-in. `SCHEDULE-PERSISTENCE-PROVEN`,
 * `FIRING-ON-DEVICE-UNVERIFIED`: no notification has been fired on an iPhone,
 * no schedule inspected through the real `UNUserNotificationCenter`, and what
 * survives an uninstall/reinstall is `PLATFORM-BEHAVIOR-UNVERIFIED`. The 64 is
 * Apple's documented limit, not a number measured here.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const out = mkdtempSync(path.join(tmpdir(), 'notif-'));
try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/notifications.ts', 'src/lib/reminder-plan.ts',
        '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway. */
  }
  const nf = path.join(out, 'notifications.js');
  writeFileSync(
    nf,
    readFileSync(nf, 'utf8')
      .replace('require("react-native")', 'require("./shim-rn.js")')
      .replace("require('expo-notifications')", "require('./shim-notif.js')")
      .replace('require("expo-notifications")', 'require("./shim-notif.js")'),
  );
  writeFileSync(path.join(out, 'shim-rn.js'), `module.exports = { Platform: { OS: 'ios' } };\n`);

  /* A stand-in for the iOS notification centre, behaving the way it is
     documented to: 64 pending requests per app, and a refusal past that. */
  writeFileSync(
    path.join(out, 'shim-notif.js'),
    `const state = { pending: [], calls: [], cap: 64, failFrom: null, slow: 0, seq: 0, granted: true };
     const tick = () => (state.slow ? new Promise((r) => setTimeout(r, state.slow)) : Promise.resolve());
     module.exports = {
       __state: state,
       __reset(over = {}) {
         state.pending = []; state.calls = []; state.cap = 64;
         state.failFrom = null; state.slow = 0; state.seq = 0; state.granted = true;
         Object.assign(state, over);
       },
       SchedulableTriggerInputTypes: { DATE: 'date' },
       setNotificationHandler() {},
       async getPermissionsAsync() { return { granted: state.granted }; },
       async requestPermissionsAsync() { return { granted: state.granted }; },
       async scheduleNotificationAsync(req) {
         await tick();
         state.seq += 1;
         state.calls.push('schedule');
         if (state.failFrom !== null && state.seq >= state.failFrom) throw new Error('native refused');
         if (state.pending.length >= state.cap) throw new Error('too many pending notifications');
         state.pending.push({ title: req.content.title, date: req.trigger.date, data: req.content.data });
         return 'id' + state.seq;
       },
       async cancelAllScheduledNotificationsAsync() {
         await tick();
         state.calls.push('cancelAll');
         state.pending = [];
       },
       async getAllScheduledNotificationsAsync() { return state.pending.slice(); },
     };\n`,
  );

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const notif = require('./shim-notif.js');
     const { scheduleReminderPlan, cancelAllReminders } = require('./notifications.js');
     /* what the centre holds — read from the stand-in itself, so no production
        code exists solely to be observed by a test */
     const pending = () => notif.__state.pending.length;
     const { planReminders, planSignature, MAX_PENDING, HORIZON_DAYS } = require('./reminder-plan.js');

     const COPY = { water:{title:'water',body:'b'}, supplements:{title:'supp',body:'b'},
       bedtime:{title:'bed',body:'b'}, weighIn:{title:'weigh',body:'b'}, workout:{title:'work',body:'b'} };
     const ALL = (every) => ({
       water: { enabled: true, everyHours: every },
       supplements: { enabled: true, hour: 9, minute: 0 },
       bedtime: { enabled: true, hour: 22, minute: 30 },
       weighIn: { enabled: true, hour: 7, minute: 0 },
       workout: { enabled: true, hour: 17, minute: 0 },
     });
     const OFF = {
       water: { enabled: false, everyHours: 2 }, supplements: { enabled: false, hour: 9, minute: 0 },
       bedtime: { enabled: false, hour: 22, minute: 30 }, weighIn: { enabled: false, hour: 7, minute: 0 },
       workout: { enabled: false, hour: 17, minute: 0 },
     };
     const CTX = { workedOutToday:false, weighedToday:false, supplementsDone:false, waterDone:false, trainingDays:null };
     const NOW = new Date(2026, 7, 18, 6, 0, 0);
     const o = {};

     (async () => {
       /* ── A. logout cancels what the previous account left pending ── */
       notif.__reset();
       const plan2 = planReminders(ALL(2), CTX, NOW);
       await scheduleReminderPlan(plan2, COPY);
       o.beforeLogout = pending();
       await cancelAllReminders();
       o.afterLogout = pending();
       /* and the next account starting from nothing gets its own, not A's */
       await scheduleReminderPlan(planReminders({ ...OFF, bedtime: { enabled: true, hour: 21, minute: 0 } }, CTX, NOW), COPY);
       o.afterBLogsIn = [...new Set(notif.__state.pending.map((p) => p.title))].sort().join(',');
       o.afterBLogsInCount = notif.__state.pending.length;

       /* ── B. the plan never asks for more than the OS holds ── */
       o.max = MAX_PENDING;
       o.horizon = HORIZON_DAYS;
       o.sizes = [1, 2, 3, 4].map((h) => planReminders(ALL(h), CTX, NOW).length).join(',');
       notif.__reset();
       const big = planReminders(ALL(1), CTX, NOW);
       const r1 = await scheduleReminderPlan(big, COPY);
       o.hourlyRequested = r1.requested;
       o.hourlyScheduled = r1.scheduled;
       o.hourlyPending = pending();
       /* every kind still represented, and in time order */
       o.kinds = [...new Set(notif.__state.pending.map((p) => p.title))].sort().join(',');
       o.ordered = notif.__state.pending.every((p, i, a) => i === 0 || a[i - 1].date <= p.date);

       /* ── C. two writers at once produce one schedule ── */
       notif.__reset({ slow: 1 });
       const pl = planReminders(ALL(4), CTX, NOW);
       await Promise.all([scheduleReminderPlan(pl, COPY), scheduleReminderPlan(pl, COPY)]);
       o.concurrentPending = pending();
       o.concurrentPlan = pl.length;
       /* five writers, and a cancel thrown into the middle of them */
       notif.__reset({ slow: 1 });
       await Promise.all([
         scheduleReminderPlan(pl, COPY), scheduleReminderPlan(pl, COPY), cancelAllReminders(),
         scheduleReminderPlan(pl, COPY), scheduleReminderPlan(pl, COPY),
       ]);
       o.fiveWriters = pending();

       /* ── D. repeating the same call converges ── */
       notif.__reset();
       for (let i = 0; i < 20; i++) await scheduleReminderPlan(pl, COPY);
       o.twentyRepeats = pending();

       /* ── E. a refusal costs one reminder, not the rest of the plan, and is reported ── */
       notif.__reset({ failFrom: 20 });
       const r2 = await scheduleReminderPlan(pl, COPY);
       o.partialRequested = r2.requested;
       o.partialScheduled = r2.scheduled;
       o.partialAttempts = notif.__state.calls.filter((c) => c === 'schedule').length;
       /* a plan that fully lands reports so, which is what a caller may record */
       notif.__reset();
       const r3 = await scheduleReminderPlan(pl, COPY);
       o.wholeRequested = r3.requested;
       o.wholeScheduled = r3.scheduled;
       o.supported = r3.supported;

       /* ── F. nothing is scheduled with a payload or a past date ── */
       notif.__reset();
       await scheduleReminderPlan(plan2, COPY);
       o.anyPayload = notif.__state.pending.some((p) => p.data !== undefined);
       o.anyPast = notif.__state.pending.some((p) => p.date.getTime() <= NOW.getTime());

       /* ── G. time semantics: one per day across both DST transitions ── */
       const bedOnly = (h, m) => ({ ...OFF, bedtime: { enabled: true, hour: h, minute: m } });
       const dayCount = (start, h, m) => {
         const p = planReminders(bedOnly(h, m), CTX, new Date(start));
         const days = p.map((x) => x.at.toDateString());
         return { n: p.length, unique: new Set(days).size, hours: [...new Set(p.map((x) => x.at.getHours() + ':' + x.at.getMinutes()))].join(' ') };
       };
       o.spring = dayCount('2026-03-06T12:00:00', 2, 30);
       o.fall = dayCount('2026-10-30T12:00:00', 1, 30);
       o.normal = dayCount('2026-08-18T12:00:00', 22, 30);

       console.log(JSON.stringify(o));
     })();\n`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', env: { ...process.env, TZ: 'America/Chicago' } })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A ── */
  want(
    r.beforeLogout > 0 && r.afterLogout === 0,
    `đăng xuất KHÔNG huỷ lịch thông báo: còn ${r.afterLogout} cái đang chờ sau cancelAllReminders ` +
      `(trước đó ${r.beforeLogout}). Đây là đòn chính của vòng này: một chiếc điện thoại đưa cho ` +
      'người khác vẫn nhắc theo lịch của chủ cũ cho tới hết chân trời 7 ngày',
  );
  want(
    r.afterBLogsIn === 'bed' && r.afterBLogsInCount === 7,
    'người dùng thứ hai đăng nhập và thấy lịch của người thứ nhất: ' +
      `${r.afterBLogsIn} (${r.afterBLogsInCount} cái) — chỉ được có nhắc đi ngủ của chính B`,
  );

  /* ── B ── */
  want(r.max === 64, `trần thông báo chờ đổi thành ${r.max} — iOS giữ 64 cho mỗi ứng dụng`);
  want(
    r.sizes.split(',').every((n) => Number(n) <= r.max),
    `kế hoạch vẫn xin nhiều hơn số iOS giữ được: ${r.sizes} với trần ${r.max}. ` +
      'Bản đã ship xin 77 cái ở ĐÚNG cấu hình mặc định (nước 2 giờ một lần) và 119 khi nước 1 giờ ' +
      'một lần; hệ điều hành nhận 64, phần đuôi chân trời lặng lẽ không tồn tại',
  );
  want(
    r.hourlyRequested === r.hourlyScheduled && r.hourlyPending === r.hourlyRequested,
    `xin ${r.hourlyRequested} nhưng đặt được ${r.hourlyScheduled}, hệ điều hành giữ ${r.hourlyPending}`,
  );
  want(
    r.kinds === 'bed,supp,water,weigh,work' && r.ordered,
    `cắt theo trần làm mất hẳn một LOẠI nhắc chứ không phải rút ngắn chân trời: còn ${r.kinds} ` +
      `(thứ tự thời gian: ${r.ordered}). Cắt phần đuôi của một danh sách đã sắp theo giờ nghĩa là ` +
      '"đặt xa nhất trong khả năng của hệ điều hành", không phải "bỏ hẳn nhắc đi ngủ"',
  );

  /* ── C ── */
  want(
    r.concurrentPending === r.concurrentPlan,
    `hai lượt đặt lịch chạy chồng nhau sinh ${r.concurrentPending} thông báo cho một kế hoạch ` +
      `${r.concurrentPlan} cái. Đặt lịch là "huỷ hết rồi thêm lại từng cái", nên hai lượt đan vào ` +
      'nhau thành huỷ → huỷ → thêm×n → thêm×n và cả hai bộ cùng sống. Đo được 112 cho kế hoạch 56, ' +
      'năm lần trên năm',
  );
  want(
    r.fiveWriters === r.concurrentPlan,
    `bốn lượt đặt lịch và một lượt huỷ chạy cùng lúc để lại ${r.fiveWriters} thay vì ${r.concurrentPlan}`,
  );

  /* ── D ── */
  want(
    r.twentyRepeats === r.concurrentPlan,
    `gọi hai mươi lần liên tiếp để lại ${r.twentyRepeats} thông báo — phải hội tụ về ${r.concurrentPlan}`,
  );

  /* ── E ── */
  want(
    r.partialScheduled === 19 && r.partialAttempts === r.partialRequested,
    `một lời từ chối của hệ điều hành vẫn cuốn theo cả phần còn lại: đặt được ${r.partialScheduled}, ` +
      `thử ${r.partialAttempts}/${r.partialRequested} lần. Vòng lặp nằm trong MỘT try với catch rỗng, ` +
      'nên cái bị từ chối đầu tiên kết thúc luôn kế hoạch',
  );
  want(
    r.wholeScheduled === r.wholeRequested && r.supported === true,
    `một kế hoạch đặt trọn vẹn không báo lại đúng: ${r.wholeScheduled}/${r.wholeRequested}`,
  );

  /* ── F ── */
  want(!r.anyPayload, 'thông báo bắt đầu mang data payload — một thông báo không được là thẩm quyền về trạng thái hiện tại của người dùng; nếu cố ý thì luật này phải được sửa CÙNG một lý do viết ra');
  want(!r.anyPast, 'có thông báo đặt vào thời điểm đã qua — nó nổ ngay hoặc bị bỏ, và cả hai đều tệ hơn im lặng');

  /* ── G ── */
  want(
    r.normal.n === r.normal.unique && r.normal.hours === '22:30',
    `ngày thường không ra đúng một nhắc mỗi ngày: ${JSON.stringify(r.normal)}`,
  );
  want(
    r.spring.n === r.spring.unique && r.fall.n === r.fall.unique,
    `qua mốc đổi giờ sinh trùng hoặc thiếu: xuân ${JSON.stringify(r.spring)}, thu ${JSON.stringify(r.fall)} ` +
      '— ngày 23 giờ và ngày 25 giờ đều phải ra ĐÚNG một nhắc mỗi ngày',
  );
  want(
    r.fall.hours === '1:30',
    `ngày 25 giờ làm giờ địa phương trôi: ${r.fall.hours} — 01:30 xảy ra hai lần và chỉ một lần được chọn`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   H — the OS is spoken to from one module, and the record follows the act
   ───────────────────────────────────────────────────────────────────────── */
{
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) files.push(p);
    }
  })(path.join(NATIVE, 'src'));

  for (const f of files) {
    const rel = path.relative(NATIVE, f);
    if (rel === 'src/lib/notifications.ts') continue;
    if (/expo-notifications/.test(strip(readFileSync(f, 'utf8')))) {
      problems.push(
        `${rel} nói chuyện thẳng với expo-notifications — hàng đợi tuần tự và trần 64 nằm ở ` +
          'lib/notifications.ts, và một luật giữ ở chỗ gọi là luật mà chỗ gọi tiếp theo không biết',
      );
    }
  }

  /* The signature is a claim about the OS, so it may only be written after the
     OS has been asked and has taken the whole plan. */
  const hook = strip(read('src/hooks/use-reminders.ts'));
  const commit = (() => {
    const at = hook.indexOf('async function commitPlan');
    return at === -1 ? null : hook.slice(at, hook.indexOf('\n}', at));
  })();
  if (commit === null) {
    problems.push('không còn commitPlan — chữ ký kế hoạch lại được ghi tách rời khỏi việc đặt lịch');
  } else {
    const sched = commit.indexOf('scheduleReminderPlan(');
    const write = commit.indexOf('PLAN_KEY');
    if (sched === -1 || write === -1 || sched > write) {
      problems.push(
        'chữ ký kế hoạch được ghi TRƯỚC khi hỏi hệ điều hành — lần đồng bộ sau so với chữ ký đó rồi ' +
          'thoát sớm, nên một lần từ chối là không bao giờ đặt lại lịch nữa',
      );
    }
    if (!/\bscheduled\s*!==\s*[\w.]*\brequested\b|\brequested\s*!==\s*[\w.]*\bscheduled\b/.test(commit)) {
      problems.push(
        'chữ ký được ghi kể cả khi chỉ đặt được một phần — một phần không phải là kế hoạch, ' +
          'và ghi nó lại là tự khoá mình khỏi lần thử tiếp theo',
      );
    }
  }

  /* One store for the switches, or the two mounted copies disagree. */
  if (/const \[prefs, setPrefs\] = useState/.test(hook)) {
    problems.push(
      'các công tắc nhắc nhở lại nằm trong useState của từng bản hook — hook này được gắn HAI lần ' +
        '(useReminderSync trên Today và màn Reminders bên trên nó), nên bản cũ ghi đè lịch của bản mới: ' +
        'đo được bật nhắc đi ngủ ra 7 thông báo rồi về 0 trong khi công tắc vẫn bật',
    );
  }
  if (!/onUserScopedReset\(/.test(hook)) {
    problems.push(
      'kho công tắc nhắc nhở không đăng ký reset theo người dùng — Chain E: xoá khoá AsyncStorage ' +
        'không chạm tới biến ở phạm vi module, nên người kế tiếp thừa hưởng công tắc của người trước',
    );
  }
  /* And the key itself stays in the sign-out list. */
  const qc = strip(read('src/lib/query-client.ts'));
  for (const key of ['ascnd_reminders', 'ascnd_reminder_plan']) {
    if (!qc.includes(`'${key}'`)) {
      problems.push(`${key} không còn bị xoá khi đăng xuất — trạng thái nhắc nhở của người dùng sống sót qua phiên`);
    }
  }
  /* Sign-out must go through the auth event, not a button. */
  const auth = strip(read('src/hooks/use-auth.tsx'));
  if (!/SIGNED_OUT/.test(auth) || !/cancelAllReminders\(/.test(auth)) {
    problems.push(
      'huỷ thông báo không còn treo vào sự kiện SIGNED_OUT — hết hạn token, đổi mật khẩu và xoá tài ' +
        'khoản đều kết thúc phiên mà không đi qua nút trong Settings',
    );
  }
}

if (problems.length) {
  console.log('vòng đời thông báo còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'vòng đời thông báo OK — CHẠY THẬT scheduleReminderPlan/cancelAllReminders trên một trung tâm ' +
    'thông báo có trần 64 như iOS: đăng xuất đưa 77 thông báo đang chờ về 0 và người kế tiếp chỉ ' +
    'thấy lịch của chính mình; kế hoạch không còn xin nhiều hơn số hệ điều hành giữ được (bản đã ship ' +
    'xin 77 ở ĐÚNG cấu hình mặc định và 119 khi nước 1 giờ/lần, hệ điều hành nhận 64 và phần đuôi ' +
    'chân trời lặng lẽ không tồn tại), phần cắt vẫn đủ năm loại nhắc và đúng thứ tự thời gian; hai ' +
    'lượt đặt lịch chồng nhau ra MỘT bộ chứ không phải 112 cho kế hoạch 56, bốn lượt cộng một lượt ' +
    'huỷ cũng vậy, hai mươi lượt liên tiếp hội tụ; một lời từ chối của hệ điều hành chỉ mất một nhắc ' +
    'chứ không cuốn theo phần còn lại (bản đã ship: 19/56 rồi im lặng) và được BÁO LẠI, nên chữ ký ' +
    'kế hoạch chỉ được ghi sau khi cả kế hoạch đã nằm trong hệ điều hành; không thông báo nào mang ' +
    'data payload hay giờ đã qua; và qua cả hai mốc đổi giờ, ngày 23 giờ lẫn ngày 25 giờ đều ra đúng ' +
    'một nhắc mỗi ngày, giữ nguyên giờ địa phương',
);
