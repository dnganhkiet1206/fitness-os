/**
 * A goal that only moves a calorie number is a label.
 *
 * ── what was wrong ──
 *
 * `profiles.goal` reached exactly two functions — `calcTargetCalories` and
 * `calcMacros` — and nothing else. Grepping it across `training-card.ts`,
 * `prescription.ts`, `load-progression.ts`, `user-state.ts`,
 * `readiness-engine.ts` and `koa-decide.ts` returned nothing at all. Somebody
 * could pick "build strength", watch their calorie target move, and find the
 * training half of the app had never heard of it.
 *
 * ── the two things this rule protects ──
 *
 * **Nobody drops below the public-health floor.** WHO's 2020 guidance for
 * adults is muscle-strengthening work on two or more days a week *plus* 150–300
 * minutes of moderate aerobic activity, and the strengthening half applies to
 * every adult whatever they are training for. So the floor is swept across
 * every goal, including the ones that might look like exceptions — an
 * "endurance" goal does not opt out of strength work — and including goals the
 * app has never heard of, which must land on the floor rather than on zero.
 *
 * **Nothing is invented above the floor.** This is the rule that keeps the file
 * from quietly becoming this app's own exercise science: a goal may sit above
 * the WHO floor only where something published says so, and every other goal
 * must be *exactly* at it. The check below is therefore two-sided — it fails a
 * goal that is too low, and it fails a goal that has been given a number nobody
 * can point at a source for.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'goaltrain-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/goal-training.ts', 'src/lib/load-progression.ts', 'src/lib/prescription.ts',
       'src/lib/training-week.ts', 'src/lib/session-load.ts', 'src/lib/local-date.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const lp = path.join(out, 'load-progression.js');
  writeFileSync(
    lp,
    readFileSync(lp, 'utf8')
      .replaceAll('@/lib/prescription', './prescription')
      .replaceAll('@/lib/goal-training', './goal-training'),
  );
  const tw = path.join(out, 'training-week.js');
  writeFileSync(
    tw,
    readFileSync(tw, 'utf8')
      .replaceAll('@/lib/local-date', './local-date')
      .replaceAll('@/lib/session-load', './session-load'),
  );
  const req = createRequire(import.meta.url);
  const {
    goalTraining,
    goalRpeTarget,
    WHO_STRENGTH_DAYS,
    WHO_AEROBIC_MIN,
    WHO_AEROBIC_MIN_EXTRA,
  } = req(path.join(out, 'goal-training.js'));
  const { suggestLoad } = req(lp);
  const { strengthDaysIn } = req(tw);

  /** Every goal the app offers, plus the ones only older rows can hold. */
  const OFFERED = ['bulk', 'cut', 'maintain', 'strength', 'endurance', 'recomp'];
  const STRANGERS = ['', '   ', 'muscle_gain', 'unknown-goal', null, undefined];

  /* ── 1. the WHO floor holds for every goal, including strangers ── */
  for (const goal of [...OFFERED, ...STRANGERS]) {
    const g = goalTraining(goal);
    if (!(g.strengthDays >= WHO_STRENGTH_DAYS)) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.strengthDays} ngày tập cơ/tuần, dưới sàn WHO ${WHO_STRENGTH_DAYS} — ` +
          'khuyến nghị tập cơ áp dụng cho MỌI người lớn bất kể họ đang tập vì mục tiêu gì, ' +
          'nên mục tiêu sức bền cũng không được miễn',
      );
    }
    if (!(g.aerobicMin >= WHO_AEROBIC_MIN)) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.aerobicMin} phút aerobic/tuần, dưới sàn WHO ${WHO_AEROBIC_MIN}`,
      );
    }
    const [lo, hi] = g.rpeBand;
    if (!(lo >= 1 && hi <= 10 && lo <= hi)) {
      problems.push(`mục tiêu '${goal}' có dải RPE vô lý [${lo}, ${hi}]`);
    }
  }

  /* ── 2. a stranger gets the floor exactly, not a guess ── */
  for (const goal of STRANGERS) {
    const g = goalTraining(goal);
    if (g.strengthDays !== WHO_STRENGTH_DAYS || g.aerobicMin !== WHO_AEROBIC_MIN) {
      problems.push(
        `mục tiêu lạ '${goal}' ra ${g.strengthDays}/${g.aerobicMin} — một giá trị app chưa từng ` +
          'nghe tên phải rơi về đúng khuyến nghị công cộng, không phải 0 và cũng không phải một phỏng đoán',
      );
    }
  }

  /* ── 3. nothing above the floor without a published reason ──

     The other half of the rule, and the half that stops this file becoming the
     app's own exercise science. Each entry names the source it is allowed to
     exceed the floor by; anything not listed must sit exactly on the floor. */
  const JUSTIFIED = {
    strength: { strengthDays: 3, why: 'tập cơ thường xuyên hơn là chính mục đích của mục tiêu này' },
    bulk: { strengthDays: 3, why: 'như trên' },
    endurance: {
      aerobicMin: WHO_AEROBIC_MIN_EXTRA,
      why: 'đầu trên của chính dải WHO, mức họ gọi là "additional benefits" — không phải số mới',
    },
  };
  for (const goal of OFFERED) {
    const g = goalTraining(goal);
    const j = JUSTIFIED[goal] ?? {};
    const wantDays = j.strengthDays ?? WHO_STRENGTH_DAYS;
    const wantAero = j.aerobicMin ?? WHO_AEROBIC_MIN;
    if (g.strengthDays !== wantDays) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.strengthDays} ngày tập cơ nhưng phải là ${wantDays} — ` +
          (j.strengthDays
            ? `được vượt sàn vì: ${j.why}`
            : 'không có cơ sở nào để nó khác sàn, và đặt một con số không chỉ được nguồn ' +
              'là app tự bịa ra khoa học thể thao'),
      );
    }
    if (g.aerobicMin !== wantAero) {
      problems.push(
        `mục tiêu '${goal}' ra ${g.aerobicMin} phút aerobic nhưng phải là ${wantAero} — ` +
          (j.aerobicMin ? `được vượt sàn vì: ${j.why}` : 'không có cơ sở nào để nó khác sàn'),
      );
    }
  }

  /* ── 4. and the goal really reaches the load engine ──

     The whole point: `goal` used to touch calories and nothing else. If this
     stops being true the file above is just a table nobody reads. */
  {
    /* Six sessions all reported at 8. Against a `maintain` band centred on 7.5
       that is within the margin — hold. Against a `strength` band centred on
       8.5 it is also within the margin — hold. The difference shows at 7: easy
       for strength, on target for maintain. */
    const atSeven = (goal) => suggestLoad({ reported: [7, 7, 7, 7, 7, 7], goal }).advice;
    if (atSeven('maintain') !== 'hold') {
      problems.push(`báo 7 với mục tiêu 'maintain' ra '${atSeven('maintain')}' — dải của nó tâm ở 7.5, phải là hold`);
    }
    if (atSeven('strength') !== 'up') {
      problems.push(
        `báo 7 với mục tiêu 'strength' ra '${atSeven('strength')}' — dải của mục tiêu sức mạnh tâm ở ` +
          '8.5, nên 7 là nhẹ hơn một điểm rưỡi và phải đề xuất tăng. Nếu ra hold thì mục tiêu vẫn ' +
          'chưa chạm tới engine và nó vẫn chỉ là một cái nhãn',
      );
    }
    /* and a template that states its own effort still wins */
    const withTemplate = suggestLoad({ reported: [7, 7, 7, 7, 7, 7], target: 7, goal: 'strength' }).advice;
    if (withTemplate !== 'hold') {
      problems.push(
        `mẫu tập ghi rõ mức 7 mà vẫn bị mục tiêu ghi đè (ra '${withTemplate}') — người viết buổi tập ` +
          'biết về nó nhiều hơn một cái nhãn mục tiêu',
      );
    }
  }

  /* ── 5. the midpoint helper agrees with the band ── */
  for (const goal of OFFERED) {
    const [lo, hi] = goalTraining(goal).rpeBand;
    const mid = goalRpeTarget(goal);
    if (Math.abs(mid - (lo + hi) / 2) > 1e-9) {
      problems.push(`goalRpeTarget('${goal}') = ${mid} không phải tâm của dải [${lo}, ${hi}]`);
    }
  }

  /* ── 6. every field of the contract is reachable, or admitted ──

     The fault this was written after: `goalTraining` returned three fields and
     the previous round wired one of them. `strengthDays` and `aerobicMin` were
     computed, documented at length, and read by nobody — while the commit
     message said the goal now reached the training half of the app. A contract
     can grow a field silently; nothing fails, the tests still pass, and the
     documentation goes on describing an intent the code does not carry out.

     A field counts as reachable if product code names it, or if an exported
     helper here consumes it and product code calls that helper — which is how
     `rpeBand` reaches anything, through `goalRpeTarget`. Anything else has to be
     listed below with the reason it cannot be measured yet, so an unread field
     is a decision somebody wrote down rather than an oversight. */
  {
    const gt = readFileSync(path.join(NATIVE, 'src/lib/goal-training.ts'), 'utf8');

    /** Fields the app cannot measure yet, each with why. Two-sided: a stale
        entry — one that HAS become reachable — fails too. */
    const NOT_REACHED = {
      aerobicMin:
        'app chưa đo được số phút aerobic cường độ vừa. Buổi từ đồng hồ có phút (`w.minutes`) ' +
        'nhưng `use-health-sync.ts` gộp nó vào chuỗi hiển thị `template_name` — workout_sessions ' +
        'không có cột thời lượng, nên con số đó bị mất dưới dạng dữ liệu. Còn `daily_logs.' +
        'active_minutes` là "phút vận động" của Apple, gồm cả tập tạ, nên gọi nó là phút aerobic ' +
        'là một khẳng định rộng hơn thứ đo được. Thà để trống còn hơn vẽ một thanh tiến độ sai',
    };

    const body = gt.match(/export interface GoalTraining \{([\s\S]*?)\n\}/);
    const fields = body
      ? [...body[1].matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1])
      : [];
    if (fields.length < 2) {
      problems.push('không đọc được các trường của GoalTraining — bộ quét hỏng, không phải code sạch');
    }

    /* Every source file except the contract itself. */
    const srcFiles = [];
    (function walk(dir) {
      for (const e of readdirSync(dir)) {
        const p = path.join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(e) && !p.endsWith(path.join('lib', 'goal-training.ts'))) srcFiles.push(p);
      }
    })(path.join(NATIVE, 'src'));
    /*
      Comments stripped first, and that is not tidiness.

      The first draft read this file raw and found `aerobicMin` "used" — in the
      doc comment of `training-week.ts`, which mentions it precisely to say that
      nothing reads it. A rule about whether code reaches a value cannot be
      satisfied by prose about the value, or every field becomes reachable by
      being written about. Same failure this repository has had in guards four
      times: matching names instead of behaviour.
    */
    const productCode = srcFiles
      .map((f) => readFileSync(f, 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');

    /*
      name → body, for each exported helper in the contract file — minus the
      constructor of the contract itself.

      That exclusion is the whole precision of this rule, and leaving it out
      made the rule green on the very fault it was written for. `goalTraining`
      builds the object, so its body names every field by construction; counting
      that as a read means any field is "reachable" the moment *anything* calls
      `goalTraining`, whatever the caller actually looks at. The card reads
      `.strengthDays` and nothing else, and the first draft happily declared
      `aerobicMin` reached.

      So a helper only counts when it *reduces* a field to a value — which is how
      `rpeBand` genuinely reaches the load engine, through `goalRpeTarget`
      returning a number. Anything whose return type is `GoalTraining` is handing
      the object on, not reading it.
    */
    const helpers = gt
      .split(/\nexport /)
      .slice(1)
      /* `function`/`const` only: `interface GoalTraining` also mentions every
         field, and its "name" would be the word `interface`, which appears in
         half the codebase — so it would mark every field reachable forever. */
      .map((chunk) => ({ name: (chunk.match(/^(?:function|const) (\w+)/) ?? [])[1], text: chunk }))
      .filter((h) => h.name && !/\)\s*:\s*GoalTraining\b/.test(h.text));

    for (const f of fields) {
      const named = new RegExp(`\\b${f}\\b`).test(productCode);
      const viaHelper = helpers.some(
        (h) => new RegExp(`\\b${f}\\b`).test(h.text) && new RegExp(`\\b${h.name}\\b`).test(productCode),
      );
      const reached = named || viaHelper;
      if (!reached && !NOT_REACHED[f]) {
        problems.push(
          `GoalTraining.${f} không tới được đâu cả — không file nào trong src/ nhắc tên nó, và không ` +
            'hàm export nào của chính file này vừa dùng nó vừa được app gọi. Một trường không ai đọc ' +
            'là một lời hứa trong tài liệu mà code không thực hiện: đúng chuyện đã xảy ra với ' +
            'strengthDays vòng trước, khi commit nói mục tiêu đã chạm tới phần tập luyện',
        );
      }
      if (reached && NOT_REACHED[f]) {
        problems.push(
          `GoalTraining.${f} được liệt kê là "chưa đo được" nhưng nay app ĐÃ đọc nó — xoá khỏi danh ` +
            'sách, kẻo lời giải thích ở đó mô tả một giới hạn không còn tồn tại',
        );
      }
    }
    for (const f of Object.keys(NOT_REACHED)) {
      if (!fields.includes(f)) {
        problems.push(`danh sách "chưa đo được" còn '${f}' nhưng GoalTraining không có trường đó nữa`);
      }
    }
  }

  /* ── 7. and the measuring half: days of strength work, counted honestly ── */
  {
    const setsOf = (reps) => [{ reps, weight_kg: 0 }];
    /* A fixed "today", and every timestamp built from it at midday UTC — far
       enough from either midnight that the case is about what it says it is
       rather than about the runner's time zone. The timezone question has its
       own section below, run in real processes with TZ set. */
    const TODAY = '2025-03-09';
    const at = (daysAgo, hourUTC = 12) => {
      const d = new Date(`${TODAY}T${String(hourUTC).padStart(2, '0')}:00:00.000Z`);
      d.setUTCDate(d.getUTCDate() - daysAgo);
      return d.toISOString();
    };
    const CASES = [
      { name: 'chưa đọc được gì', input: null, want: 0 },
      { name: 'mảng rỗng', input: [], want: 0 },
      { name: 'buổi từ đồng hồ (sets rỗng)', input: [{ date_time: at(1), sets: [] }], want: 0 },
      { name: 'buổi tay không vẫn là tập cơ', input: [{ date_time: at(1), sets: setsOf(12) }], want: 1 },
      {
        name: 'hai buổi hai ngày khác nhau',
        input: [{ date_time: at(1), sets: setsOf(10) }, { date_time: at(3), sets: setsOf(10) }],
        want: 2,
      },
      {
        name: 'hai buổi CÙNG một ngày',
        input: [{ date_time: at(1, 8), sets: setsOf(10) }, { date_time: at(1, 17), sets: setsOf(10) }],
        want: 1,
      },
      { name: 'set có 0 lần lặp', input: [{ date_time: at(1), sets: setsOf(0) }], want: 0 },
      { name: 'date_time rác', input: [{ date_time: 'hôm nọ', sets: setsOf(10) }], want: 0 },
      { name: 'hôm nay cũng tính', input: [{ date_time: at(0), sets: setsOf(10) }], want: 1 },
      { name: 'đúng mép cửa sổ (6 ngày trước)', input: [{ date_time: at(6), sets: setsOf(10) }], want: 1 },
      /* Outside the window, and both directions matter: an old session would
         make a quiet week look like a trained one, and a row from a device with
         a wrong clock would do the same from the other side. Neither can lower
         the count, only raise it — past a floor the person has not met. */
      { name: 'quá cũ (7 ngày trước)', input: [{ date_time: at(7), sets: setsOf(10) }], want: 0 },
      { name: 'ngày trong tương lai', input: [{ date_time: at(-2), sets: setsOf(10) }], want: 0 },
    ];
    for (const c of CASES) {
      const got = strengthDaysIn(c.input, TODAY);
      if (got !== c.want) {
        problems.push(`ngày tập cơ — "${c.name}" ra ${got} thay vì ${c.want}`);
      }
    }

    /* ── the count can never exceed the window it is printed against ──

       `useWorkoutSessions(7)` is the last 7×24 hours, and a span of hours that
       starts partway through a day touches EIGHT dates. Somebody who trains
       every day would then read "8/2 strength days in the last 7 days": a
       denominator its own numerator beats, which is not a comparison at all.
       Fourteen days of daily sessions, at an hour that straddles nothing. */
    const daily = Array.from({ length: 14 }, (_, i) => ({ date_time: at(i), sets: setsOf(10) }));
    const capped = strengthDaysIn(daily, TODAY);
    if (capped !== 7) {
      problems.push(
        `tập đủ 14 ngày liền ra ${capped} ngày tập cơ trong cửa sổ 7 ngày — cửa sổ đang tính theo GIỜ ` +
          '(7×24) chứ không theo ngày, mà một khoảng giờ bắt đầu giữa ngày thì chạm vào TÁM ngày lịch. ' +
          'Con số này đang được đặt cạnh mức sàn "ít nhất 2 ngày/tuần", nên nó phải cùng đơn vị với mức đó',
      );
    }

    /* ── the same Monday, counted twice ──

       `date_time` is written with `toISOString()`, so it is UTC. Grouping by
       `.slice(0, 10)` groups by UTC date, and at UTC+7 a 06:00 session carries
       the PREVIOUS UTC date. The two timestamps below are 06:00 and 20:00 on the
       same local Monday in Ho Chi Minh City — one day of strength work — and
       exactly two days in UTC.

       It inflates the count, and the count is being held against a floor, so the
       error runs in the direction that tells somebody they have met a guideline
       they have not. Run in a real process with TZ set, because that is the only
       way `localDateStr` can be observed doing its job. */
    const SAME_LOCAL_MONDAY = [
      { date_time: '2025-01-05T23:00:00.000Z', sets: [{ reps: 10 }] },
      { date_time: '2025-01-06T13:00:00.000Z', sets: [{ reps: 10 }] },
    ];
    /* The window is anchored on the Monday itself, so both sessions are inside
       it in either zone and the only thing under test is the grouping. */
    const inTZ = (tz) =>
      Number(
        execFileSync(
          process.execPath,
          ['-e', `const {strengthDaysIn}=require(${JSON.stringify(tw)});process.stdout.write(String(strengthDaysIn(${JSON.stringify(SAME_LOCAL_MONDAY)}, '2025-01-06')))`],
          { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
        ),
      );
    const saigon = inTZ('Asia/Ho_Chi_Minh');
    if (saigon !== 1) {
      problems.push(
        `hai buổi 06:00 và 20:00 cùng một thứ Hai ở giờ Việt Nam đếm ra ${saigon} ngày tập cơ thay vì 1 — ` +
          'đang gom theo ngày UTC chứ không phải ngày của người tập, nên buổi sáng sớm rơi sang ngày ' +
          'hôm trước. Sai lệch này chỉ đẩy con số LÊN, mà con số đang được đem so với một mức sàn: ' +
          'nó nói người ta đã đạt khuyến nghị trong khi chưa',
      );
    }
    /* ── and the seven-day window is seven days across a clock change ──

       The window is built by `setDate(getDate() - 6)` on a local midnight, so
       it runs straight through the spring-forward and autumn-back boundaries —
       the same arithmetic that has produced off-by-one days in this repository
       before. Fourteen consecutive days of training must read as exactly 7 in
       every zone and on either side of the transition; 6 or 8 would mean the
       floor is being compared against a week that was not one. */
    for (const [tz, days] of [
      ['America/New_York', ['2025-03-09', '2025-03-10', '2025-11-02', '2025-11-03']],
      ['Australia/Lord_Howe', ['2025-04-06', '2025-10-05']],
      ['Asia/Ho_Chi_Minh', ['2025-06-15']],
    ]) {
      for (const day of days) {
        const rows = Array.from({ length: 14 }, (_, i) => {
          const d = new Date(`${day}T12:00:00.000Z`);
          d.setUTCDate(d.getUTCDate() - i);
          return { date_time: d.toISOString(), sets: [{ reps: 10 }] };
        });
        const got = Number(
          execFileSync(
            process.execPath,
            ['-e', `const {strengthDaysIn}=require(${JSON.stringify(tw)});process.stdout.write(String(strengthDaysIn(${JSON.stringify(rows)}, ${JSON.stringify(day)})))`],
            { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
          ),
        );
        if (got !== 7) {
          problems.push(
            `${tz} ngày ${day}: tập liền 14 ngày ra ${got} ngày trong cửa sổ 7 ngày — phép lùi ngày ` +
              'đi qua mốc đổi giờ và trả về một tuần dài hoặc ngắn hơn bảy ngày, nên mức sàn đang ' +
              'được đem so với một khoảng không phải một tuần',
          );
        }
      }
    }

    const utc = inTZ('UTC');
    if (utc !== 2) {
      problems.push(
        `cùng dữ liệu ấy ở múi giờ UTC phải ra 2 ngày (chứ không phải ${utc}) — nếu không thì ca kiểm ` +
          'trên không thật sự vắt qua nửa đêm và nó đang chứng minh một thứ khác',
      );
    }
  }

  /* ── 8. and an unloaded query is not a score of zero ── */
  {
    const card = readFileSync(path.join(NATIVE, 'src/components/ascnd/today-widgets-2.tsx'), 'utf8');
    if (!/week == null \? null : strengthDaysIn\(week, localDateStr\(\)\)/.test(card)) {
      problems.push(
        'thẻ tập luyện không còn phân biệt "chưa tải xong" với "chưa tập buổi nào" — truy vấn chưa về ' +
          'mà vẽ 0/2 là nói với người ta rằng họ chưa đạt mức tối thiểu, trong khi buổi tập của họ ' +
          'chỉ là chưa tới nơi',
      );
    }
    if (!/strengthDone != null && strengthTarget != null \?/.test(card)) {
      problems.push(
        'dòng ngày tập cơ không còn đợi CẢ HAI vế. Mục tiêu là mẫu số của một lời phán xét: vẽ sàn ' +
          'WHO trong lúc hồ sơ chưa về sẽ cho người có mục tiêu sức mạnh thấy 2/2 (đã đạt) rồi lật ' +
          'thành 2/3 (chưa đạt) ngay khi dòng hồ sơ tới nơi',
      );
    }
    if (!/profile === undefined \? null :/.test(card)) {
      problems.push(
        'thẻ không phân biệt "hồ sơ chưa tải xong" với "hồ sơ không đặt mục tiêu" — cái sau là câu ' +
          'trả lời thật và rơi về sàn WHO đúng như thiết kế, cái trước thì chưa biết gì',
      );
    }
    /*
      And the query behind it really returns the two columns the count reads.

      `strengthDaysIn` needs `sets` (to know a session held reps) and
      `date_time` (to know which day it was). Drop either from the select and
      the function keeps working perfectly — returning 0, for everybody,
      forever. Nothing throws, the card renders, and the line says the person
      has not met a health minimum. `sets` is the fragile one: it carries a
      comment justifying its cost, which is exactly the kind of column somebody
      later removes to make a query lighter.
    */
    const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-fitness-data.ts'), 'utf8');
    const q = hook.match(/export function useWorkoutSessions[\s\S]*?\.select\('([^']+)'\)/);
    if (!q) {
      problems.push('không tìm thấy select của useWorkoutSessions — bộ quét hỏng, không phải code sạch');
    } else {
      for (const col of ['sets', 'date_time']) {
        if (!new RegExp(`\\b${col}\\b`).test(q[1])) {
          problems.push(
            `useWorkoutSessions không còn lấy cột '${col}', mà đếm ngày tập cơ đọc nó. Thiếu cột thì ` +
              'hàm vẫn chạy trơn tru và trả 0 — cho tất cả mọi người, mãi mãi — rồi thẻ Today nói ' +
              'họ chưa đạt mức tối thiểu về sức khoẻ. Không có ngoại lệ nào ném ra',
          );
        }
      }
    }

    if (!/7 ngày qua|last 7/i.test(card)) {
      problems.push(
        'nhãn không còn nói cửa sổ 7 ngày — `useWorkoutSessions(7)` là cửa sổ trượt, gọi nó là ' +
          '"tuần này" là một khẳng định về cuốn lịch mà truy vấn không dùng',
      );
    }
  }

  if (problems.length) {
    console.log('mục tiêu → tập luyện CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `mục tiêu → tập luyện OK — ${OFFERED.length} mục tiêu app đang có và ${STRANGERS.length} giá trị lạ ` +
      `đều ≥ sàn WHO (${WHO_STRENGTH_DAYS} ngày tập cơ/tuần, ${WHO_AEROBIC_MIN} phút aerobic/tuần), và ` +
      'mục tiêu sức bền KHÔNG được miễn phần tập cơ; một giá trị app chưa từng nghe tên rơi về ĐÚNG sàn ' +
      'chứ không phải 0. Luật hai chiều: mục tiêu nào vượt sàn phải có nguồn ghi kèm (strength/bulk lên ' +
      `3 ngày, endurance lên ${WHO_AEROBIC_MIN_EXTRA} phút — đầu trên của chính dải WHO), mọi mục tiêu ` +
      'còn lại phải nằm ĐÚNG trên sàn, nên không ai đặt thêm được một con số không chỉ được nguồn. Và ' +
      "mục tiêu THẬT SỰ chạm tới engine: báo 7 ra 'hold' với maintain nhưng 'up' với strength — trước đây " +
      'goal chỉ chạm calo và macro, không một file tập luyện nào biết nó tồn tại; mẫu tập có ghi mức ' +
      'gắng sức riêng thì vẫn thắng. Mọi trường của GoalTraining đều tới được nơi nào đó, hoặc nằm ' +
      'trong danh sách "chưa đo được" kèm lý do (1 trường: aerobicMin) — vòng trước có hai trường ' +
      'không ai đọc trong khi commit nói mục tiêu đã chạm tới phần tập luyện. Và nửa ĐO ĐƯỢC: số ngày ' +
      'tập cơ đếm theo NGÀY chứ không theo buổi (hai buổi cùng ngày là một ngày), buổi từ đồng hồ ' +
      'không tính, buổi tay không có tính, và ngày được gom theo giờ CỦA NGƯỜI TẬP — chạy thật ở ' +
      'Asia/Ho_Chi_Minh, hai buổi 06:00 và 20:00 cùng một thứ Hai ra 1 ngày (gom theo UTC sẽ ra 2, ' +
      'tức nói người ta đã đạt sàn khuyến nghị trong khi chưa). Cửa sổ tính theo NGÀY chứ không theo ' +
      '168 giờ — tập liền 14 ngày vẫn ra 7, vì một khoảng giờ bắt đầu giữa ngày chạm vào TÁM ngày lịch ' +
      'và "8/2 ngày trong 7 ngày qua" là một mẫu số bị chính tử số của nó vượt; buổi quá cũ và buổi ' +
      'mang ngày tương lai (đồng hồ thiết bị sai) đều bị loại, cả hai đều chỉ có thể đẩy con số LÊN; ' +
      'và cửa sổ ấy vẫn đúng bảy ngày khi lùi qua mốc đổi giờ — chạy thật ở New York (cả hai chiều), ' +
      'Lord Howe (lệch 30 phút) và giờ Việt Nam. ' +
      'Thẻ Today phân biệt "chưa tải xong" với "chưa tập buổi nào" và nhãn nói đúng cửa sổ 7 ngày',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
