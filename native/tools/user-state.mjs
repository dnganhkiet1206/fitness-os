/**
 * A missed Tuesday is not a decline, and a new user is not a lapsed one.
 *
 * ── why this rule is a table of days and not a reading ──
 *
 * `lib/user-state.ts` decides how the app treats somebody who is having a hard
 * fortnight. Every failure mode it has is at a boundary, and every boundary is
 * an ordinary thing for a person to do:
 *
 *   · log every day for a month and miss one → must stay `steady`. A system
 *     that softens its tone the first time you skip a Tuesday is a system that
 *     is doing it constantly, and the softening stops meaning anything.
 *   · be five days old → must be `settling_in` with confidence `none`. There is
 *     no baseline to be below, and "logged 2 of your first 5 days" is not
 *     evidence of a decline; reading it as one aims the gentlest handling in the
 *     app at the person who has done nothing wrong.
 *   · come back after two weeks → must be `returning`, **not** `slipping`.
 *     Somebody who was away is below their baseline by arithmetic. That is the
 *     one case where the obvious computation and the right answer point in
 *     opposite directions, so it is ranked above the drop rule on purpose.
 *   · train through a load spike → `overreaching`, because encouraging that
 *     person to do more is the one piece of advice that can hurt them.
 *
 * None of those can be checked by reading the file. The old rule reads
 * perfectly well too — it is only wrong when you run a year of days through it.
 *
 * ── and the invariants ──
 *
 * A sweep over every history length from 0 to 120 days, at four different
 * logging rates, asserting the things that must hold whatever the input:
 * `recent` and `baseline` stay inside 0..1, confidence never outruns the
 * history, and nothing but `settling_in` is ever returned with confidence
 * `none` — the property the whole cold-start guardrail rests on.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'userstate-'));
const problems = [];

try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/user-state.ts', 'src/lib/training-card.ts', 'src/lib/local-date.ts',
       '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  /* `PROGRESS_DAYS` is `TREND_WEEKS * 7` imported from the training card rather
     than a second 56 typed here, so the emitted alias has to be rewritten to a
     relative path — the same one-line substitution `tools/streak.mjs` and
     `tools/koa-decide.mjs` both document. It is a path, not behaviour. */
  /* `local-date` joins it for the same reason and by the same substitution:
     `progressionOf` groups a session's `timestamptz` into a calendar day with
     `localDateStr`, because bucketing by UTC filed every session before 07:00
     east of Greenwich a day early — which is also why this tool's timezone
     cases below are worth running rather than reading. */
  const statePath = path.join(out, 'user-state.js');
  writeFileSync(
    statePath,
    readFileSync(statePath, 'utf8')
      .replaceAll('@/lib/training-card', './training-card')
      .replaceAll('@/lib/local-date', './local-date'),
  );

  const {
    userStateFrom,
    MIN_HISTORY_DAYS,
    BASELINE_DAYS,
    RECENT_DAYS,
    DROP_FRACTION,
    MIN_BASELINE,
    MIN_LIFT_SESSIONS,
    PROGRESS_DAYS,
    AWAY_DAYS,
    OVERREACH_ACWR,
  } = createRequire(import.meta.url)(path.join(out, 'user-state.js'));

  const TODAY = '2026-08-16';
  const DAY = 86_400_000;
  /** `d(0)` is today, `d(3)` is three days ago. */
  const d = (n) => new Date(Date.parse(`${TODAY}T00:00:00Z`) - n * DAY).toISOString().slice(0, 10);
  /** every day from `from` days ago up to `to` days ago, inclusive */
  const span = (from, to) => {
    const list = [];
    for (let i = to; i <= from; i++) list.push(d(i));
    return list;
  };
  /** every `every`-th day across `from..to` — a weekly rhythm, not a daily one */
  /** sessions `daysAgo` back, all at one tonnage; `prAt` marks which get a PR */
  const lifts = (daysAgo, volume, prAt = []) =>
    daysAgo.map((n, i) => ({
      date_time: `${d(n)}T18:00:00.000Z`,
      volume_load: volume,
      pr_detected: prAt.includes(i),
    }));
  const cadence = (from, to, every) => {
    const list = [];
    for (let i = to; i <= from; i += every) list.push(d(i));
    return list;
  };

  /* ── 1. the cases, each with the reason it is here ── */
  const CASES = [
    {
      name: 'ghi đủ 60 ngày, lỡ đúng thứ Ba tuần này',
      dates: span(59, 0).filter((x) => x !== d(3)),
      want: 'steady',
      why: 'lỡ MỘT ngày là chuyện thường nhất trên đời — hệ thống phản ứng với nó là hệ thống phản ứng liên tục',
    },
    {
      name: 'ghi đủ 60 ngày, lỡ hai ngày rời nhau trong tuần',
      dates: span(59, 0).filter((x) => x !== d(2) && x !== d(5)),
      want: 'steady',
      why: 'hai ngày rời nhau vẫn nằm trong biên độ ồn — 5/7 nhịp thường vẫn trên ngưỡng 60%',
    },
    {
      name: 'ghi đều một tháng rồi tuần này chỉ được một ngày',
      dates: [...span(59, 7), d(4)],
      want: 'slipping',
      why: 'đây mới là sụt thật: 1/7 so với nền của chính họ, và nó kéo dài cả tuần chứ không phải một ngày',
    },
    {
      name: 'mới dùng app 5 ngày, ghi 2 ngày',
      dates: [d(4), d(1)],
      want: 'settling_in',
      confidence: 'none',
      why: 'chưa có "bình thường của chính họ" để mà thấp hơn; đọc thành sa sút là nhắm sai người',
    },
    {
      name: 'chưa ghi ngày nào',
      dates: [],
      want: 'settling_in',
      confidence: 'none',
      why: 'không dữ liệu thì không kết luận — không được crash, không được đoán',
    },
    {
      name: 'vắng 14 ngày rồi hôm qua ghi lại',
      dates: [...span(59, 15), d(1)],
      want: 'returning',
      why: 'người vừa quay lại ĐANG thấp hơn nền của họ theo đúng số học; đọc thành "sa sút" là nhắm sự dịu dàng vào sai thời điểm',
    },
    {
      name: 'vắng 14 ngày, quay lại từ 5 ngày trước và ghi đều từ đó',
      dates: [...span(59, 20), ...span(4, 0)],
      want: 'steady',
      why: 'quay lại đã hết mới — họ đang ở đây rồi, nhắc mãi hai tuần đã vắng là bới lại',
    },
    {
      name: 'ngày ghi đầu tiên trong đời, sau khi đủ tuổi dữ liệu',
      dates: [d(0)],
      want: 'settling_in',
      confidence: 'none',
      why: 'khoảng trống TRƯỚC bản ghi đầu tiên không phải là vắng mặt — nó là mép của những gì đã biết',
    },
    {
      name: 'tập nặng dồn dập, acwr 1.8',
      dates: span(59, 0),
      acwr: 1.8,
      want: 'overreaching',
      why: 'người có tỉ lệ tải 1.8 không cần được động viên làm thêm — đây là lời khuyên duy nhất có thể gây hại',
    },
    {
      name: 'acwr chưa tính được (null) trên người ghi đều',
      dates: span(59, 0),
      acwr: null,
      want: 'steady',
      why: 'null là "chưa biết" chứ không phải 0 — `?? 0` ở đây sẽ báo mọi người thiếu sinh trắc là quá tải hoặc bỏ tập',
    },
    {
      name: 'người tập 2 buổi/tuần suốt 3 tháng, vẫn đúng nhịp đó',
      dates: cadence(89, 0, 3),
      want: 'steady',
      why: 'không có ngưỡng tuyệt đối nào trong file này — 1/3 số ngày là bình thường CỦA HỌ',
    },
    {
      name: 'người tập 2 buổi/tuần rồi tuần này im hẳn',
      dates: cadence(89, 8, 3),
      want: 'slipping',
      why: 'so với chính họ chứ không so với ai — nền ~0.33 mà tuần này 0 là sụt thật; ngưỡng TUYỆT ĐỐI sẽ mù hẳn ca này',
    },
    {
      name: 'ngày ghi ở tương lai (đồng hồ máy sai)',
      dates: [...span(59, 0), '2099-01-01'],
      want: 'steady',
      why: 'một ngày chưa xảy ra không được tính vào cửa sổ gần đây',
    },
    {
      name: 'ngày rác trong danh sách',
      dates: [...span(59, 0), 'không-phải-ngày', ''],
      want: 'steady',
      why: 'một dòng hỏng trong DB không được làm hỏng kết luận về cả tháng',
    },
    {
      name: 'mới 16 ngày nhưng ghi đủ cả 16',
      dates: span(15, 0),
      want: 'steady',
      baseline: 1,
      trend: 'steady',
      why:
        'nền phải là 1.0 — "bình thường của họ là mỗi ngày". Chia cho đủ 28 ngày họ chưa sống ' +
        'sẽ ra 0.57 và biến người ghi hoàn hảo thành người "đang lên", tức bịa ra một đà tiến từ việc mới dùng app',
    },
    {
      name: 'mới 20 ngày, ghi đủ 13 ngày đầu rồi im cả tuần',
      dates: span(19, 7),
      want: 'slipping',
      why: 'nền tính trên 20 ngày đã sống chứ không phải 28 ngày tưởng tượng',
    },
    /* ── plateau: turning up, numbers not moving ── */
    {
      name: 'tập đều 8 tuần, không kỷ lục, khối lượng đứng yên',
      dates: span(59, 0),
      sessions: lifts([50, 46, 42, 38, 24, 20, 16, 12, 8, 4], 5000),
      want: 'stalled',
      why: 'hai tín hiệu cùng chỉ một hướng qua 8 tuần vẫn đi tập — đây mới là hình dạng của chững lại',
    },
    {
      name: 'tập đều 8 tuần, khối lượng tăng đều',
      dates: span(59, 0),
      sessions: [...lifts([50, 46, 42, 38], 4000), ...lifts([24, 20, 16, 12, 8, 4], 6000)],
      want: 'steady',
      why: 'khối lượng tăng 50% thì app không có gì hữu ích để nói',
    },
    {
      name: 'tập đều 8 tuần, khối lượng đứng nhưng CÓ kỷ lục',
      dates: span(59, 0),
      sessions: lifts([50, 46, 42, 38, 24, 20, 16, 12, 8, 4], 5000, [3]),
      want: 'steady',
      why: 'chỉ "không kỷ lục" đã là tín hiệu tồi; có kỷ lục thì dứt khoát không phải chững',
    },
    {
      name: 'người chạy bộ: 20 buổi từ đồng hồ, volume_load 0',
      dates: span(59, 0),
      sessions: lifts(Array.from({ length: 20 }, (_, i) => i * 2 + 1), 0),
      want: 'steady',
      why:
        'use-health-sync CỐ Ý ghi volume_load 0 cho buổi nhập từ đồng hồ (chạy bộ không có tổng tạ). ' +
        'Không lọc thì mọi người chạy bộ đều bị chấm là chững — đó không phải plateau, đó là lỗi đơn vị',
    },
    {
      name: 'mới 5 buổi có tạ trong 8 tuần',
      dates: span(59, 0),
      sessions: lifts([40, 30, 20, 10, 2], 5000),
      want: 'steady',
      why: 'dưới ngưỡng buổi tối thiểu thì trung bình mỗi nửa chỉ hai ba buổi — đó là bài tập nào có trong buổi, không phải tiến bộ',
    },
    {
      name: 'chưa đọc được buổi tập nào',
      dates: span(59, 0),
      sessions: undefined,
      want: 'steady',
      why: 'không đọc được KHÁC với không tiến bộ — màn không fetch buổi tập thì không được kết luận',
    },
    {
      name: 'đang sa sút thì KHÔNG được đọc thành chững lại',
      dates: [...span(59, 7), d(4)],
      sessions: lifts([50, 46, 42, 38, 24, 20, 16, 12, 8, 4], 5000),
      want: 'slipping',
      why:
        'chững lại là chuyện của người VẪN ĐANG tập. Nói với người vừa tập ít hẳn đi rằng công sức ' +
        'của họ không có kết quả là nói sai vào đúng lúc tệ nhất',
    },
    {
      name: 'quá tải thì vẫn là quá tải, không phải chững',
      dates: span(59, 0),
      acwr: 1.8,
      sessions: lifts([50, 46, 42, 38, 24, 20, 16, 12, 8, 4], 5000),
      want: 'overreaching',
      why: 'quá tải có việc phải làm ngay, chững lại thì không — nên nó xếp trên',
    },
    {
      name: 'ngày trùng lặp',
      dates: [...span(59, 0), ...span(3, 0)],
      want: 'steady',
      why: 'đếm theo ngày phân biệt, nếu không recent có thể vượt 1.0',
    },
  ];

  for (const c of CASES) {
    let got;
    try {
      got = userStateFrom({ loggedDates: c.dates, today: TODAY, acwr: c.acwr, sessions: c.sessions });
    } catch (e) {
      problems.push(`"${c.name}" ném lỗi: ${e.message}`);
      continue;
    }
    if (got.situation !== c.want) {
      problems.push(
        `"${c.name}" ra '${got.situation}' nhưng phải là '${c.want}' — ${c.why} ` +
          `[recent ${got.recent.toFixed(2)}, nền ${got.baseline.toFixed(2)}, vì: ${got.because}]`,
      );
    }
    if (c.baseline != null && Math.abs(got.baseline - c.baseline) > 0.02) {
      problems.push(
        `"${c.name}" nền ra ${got.baseline.toFixed(2)} nhưng phải là ${c.baseline} — ${c.why}`,
      );
    }
    if (c.trend && got.trend !== c.trend) {
      problems.push(`"${c.name}" xu hướng '${got.trend}' nhưng phải là '${c.trend}' — ${c.why}`);
    }
    if (c.confidence && got.confidence !== c.confidence) {
      problems.push(
        `"${c.name}" độ tin cậy '${got.confidence}' nhưng phải là '${c.confidence}' — ${c.why}`,
      );
    }
  }

  /* ── 2. cold start: nothing is ever claimed without a baseline ──

     The single property the whole guardrail rests on. Swept rather than spot
     checked, because the failure is silent: a `slipping` returned at
     confidence `none` reads exactly like a real one downstream. */
  for (let history = 0; history < MIN_HISTORY_DAYS; history++) {
    for (const every of [1, 2, 3, 7]) {
      const s = userStateFrom({ loggedDates: cadence(history - 1, 0, every), today: TODAY });
      if (s.confidence !== 'none') {
        problems.push(`${history} ngày lịch sử mà độ tin cậy là '${s.confidence}' — phải là 'none'`);
      }
      if (s.situation !== 'settling_in') {
        problems.push(
          `${history} ngày lịch sử ra '${s.situation}' — dưới ${MIN_HISTORY_DAYS} ngày thì chỉ được 'settling_in'`,
        );
      }
    }
  }

  /* ── 3. the invariants, over a sweep ── */
  for (let history = 0; history <= 120; history += 1) {
    for (const every of [1, 2, 3, 7]) {
      const s = userStateFrom({ loggedDates: cadence(history - 1, 0, every), today: TODAY });
      if (!(s.recent >= 0 && s.recent <= 1)) {
        problems.push(`recent ngoài 0..1 (${s.recent}) ở lịch sử ${history} ngày, nhịp ${every}`);
      }
      if (!(s.baseline >= 0 && s.baseline <= 1)) {
        problems.push(`nền ngoài 0..1 (${s.baseline}) ở lịch sử ${history} ngày, nhịp ${every}`);
      }
      if (s.confidence === 'none' && s.situation !== 'settling_in') {
        problems.push(`độ tin cậy 'none' mà vẫn kết luận '${s.situation}'`);
      }
      if (s.daysQuiet < 0 || s.daysQuiet > BASELINE_DAYS) {
        problems.push(`daysQuiet vô lý (${s.daysQuiet})`);
      }
    }
  }

  /* ── 4. somebody logging every single day is never anything but steady ──

     The regression that matters most in the other direction: a person doing
     everything right must never be told the app thinks they are slipping. */
  for (let history = MIN_HISTORY_DAYS; history <= 120; history += 7) {
    const s = userStateFrom({ loggedDates: cadence(history - 1, 0, 1), today: TODAY });
    if (s.situation !== 'steady') {
      problems.push(`ghi đủ ${history}/${history} ngày mà ra '${s.situation}' — ${s.because}`);
    }
  }

  /* ── 5. the drop margin does what its comment says ──

     Stated as an arithmetic fact rather than a second opinion: one missed day
     out of a perfect week must land above the line, and the margin must be
     wide enough that it does. */
  for (const [missed, label] of [[1, 'một'], [2, 'hai']]) {
    const share = 1 - missed / RECENT_DAYS;
    if (!(share >= 1 - DROP_FRACTION)) {
      problems.push(
        `DROP_FRACTION ${DROP_FRACTION} quá hẹp — lỡ ${label} ngày trong tuần hoàn hảo còn ` +
          `${share.toFixed(3)} nhịp thường, đã rơi xuống dưới ngưỡng ${(1 - DROP_FRACTION).toFixed(3)}`,
      );
    }
  }
  if (Math.abs(MIN_BASELINE - 1 / RECENT_DAYS) > 1e-9) {
    problems.push(
      'MIN_BASELINE không còn bằng một lần ghi trên mỗi cửa sổ — nó là số học của cửa sổ, ' +
        'không phải một mức nghiêm khắc để chỉnh',
    );
  }
  /* the overreach branch, in both directions — a sign flip here would tell the
     person training hardest that they are fine and the person resting that they
     are overreaching, and the label alone would still read correctly */
  {
    const heavy = userStateFrom({ loggedDates: span(59, 0), today: TODAY, acwr: OVERREACH_ACWR + 0.3 });
    const light = userStateFrom({ loggedDates: span(59, 0), today: TODAY, acwr: 0.6 });
    if (heavy.situation !== 'overreaching') {
      problems.push(`acwr ${(OVERREACH_ACWR + 0.3).toFixed(1)} phải là 'overreaching', ra '${heavy.situation}'`);
    }
    if (light.situation === 'overreaching') {
      problems.push('acwr 0.6 (tập nhẹ hơn thói quen) bị đọc thành quá tải — dấu bất đẳng thức bị lật');
    }
  }

  /* the plateau read never fires without enough lifting sessions, swept */
  for (let n = 0; n < MIN_LIFT_SESSIONS; n++) {
    const st = userStateFrom({
      loggedDates: span(59, 0),
      today: TODAY,
      sessions: lifts(Array.from({ length: n }, (_, i) => i * 5 + 1), 5000),
    });
    if (st.situation === 'stalled') {
      problems.push(`${n} buổi có tạ mà đã kết luận 'stalled' — dưới ${MIN_LIFT_SESSIONS} thì không được nói gì`);
    }
  }
  if (PROGRESS_DAYS !== 56) {
    problems.push(
      `PROGRESS_DAYS = ${PROGRESS_DAYS} — nó phải là TREND_WEEKS × 7 của training-card, tức cùng cửa ` +
        'sổ mà thẻ tập luyện đã fetch và vẽ; lệch đi là hai ý kiến khác nhau về "gần đây" cạnh nhau trên một màn',
    );
  }

  /*
    ── the sessions are bucketed by the lifter's day, not by UTC's ──

    `progressionOf` compares each session's calendar day against `today`, and
    `today` is local. It used to take the session's day with
    `date_time.slice(0, 10)` — the date in **UTC** — so east of Greenwich every
    session before 07:00 was counted one day older than it was.

    That is not cosmetic here. The window is split at its midpoint
    (`PROGRESS_DAYS / 2`), and a session sitting on the seam moves from `recent`
    to `older` when it is aged by a day — which changes the two means the
    plateau verdict is drawn from. The case below is built on that seam: every
    session at 06:00 Saigon time, one of them exactly at day 27, and volumes
    chosen so the verdict is 'stalled' only while that session is counted as
    recent. Bucketing by UTC ages it to day 28 and the answer flips.

    Run in real processes with TZ set, because that is the only way to observe
    `localDateStr` doing its job — the same method `tools/goal-training.mjs`
    uses, and for the same bug found in the same shape one file over.
  */
  {
    /* 06:00 in Asia/Ho_Chi_Minh is 23:00 UTC on the *previous* date — that
       one-day disagreement is the whole subject of this case. */
    const at6amSaigon = (daysAgo) =>
      new Date(Date.parse(`${TODAY}T00:00:00Z`) - daysAgo * DAY - 3600_000).toISOString();
    /*
      Eight sessions — the minimum the plateau read will speak on — with the
      seam session at day 27 carrying the only heavy tonnage.

        counted locally:  recent {5000, 5000, 5000, 9000} → 6000
                          older  {5000 × 4}               → 5000   ⇒ +20%, not stalled
        counted in UTC:   recent {5000 × 3}               → 5000
                          older  {9000, 5000 × 4}         → 5800   ⇒ no growth, stalled

      One session moving across the midpoint is the entire difference between
      "you are progressing" and "you have plateaued".
    */
    const SEAM = [
      ...[3, 10, 17].map((n) => ({ date_time: at6amSaigon(n), volume_load: 5000, pr_detected: false })),
      { date_time: at6amSaigon(27), volume_load: 9000, pr_detected: false },
      ...[31, 38, 45, 52].map((n) => ({ date_time: at6amSaigon(n), volume_load: 5000, pr_detected: false })),
    ];
    const ask = (tz) =>
      execFileSync(
        process.execPath,
        [
          '-e',
          `const {userStateFrom}=require(${JSON.stringify(statePath)});` +
            `process.stdout.write(userStateFrom({loggedDates:${JSON.stringify(span(59, 0))},` +
            `today:${JSON.stringify(TODAY)},sessions:${JSON.stringify(SEAM)}}).situation)`,
        ],
        { env: { ...process.env, TZ: tz }, encoding: 'utf8' },
      ).trim();

    const saigon = ask('Asia/Ho_Chi_Minh');
    const utc = ask('UTC');
    if (saigon === 'stalled') {
      problems.push(
        'giờ Việt Nam: buổi 06:00 ở ngày thứ 27 phải nằm trong nửa GẦN ĐÂY của cửa sổ, và với nó ' +
          "khối lượng đang TĂNG 20% — nhưng kết luận vẫn ra 'stalled'. Đang gom buổi tập theo ngày " +
          'UTC chứ không phải ngày của người tập, nên buổi sáng sớm bị già đi một ngày và rơi sang ' +
          'nửa kia: app nói một người đang tiến bộ rằng họ đã chững lại',
      );
    }
    /* And the case has teeth: on a device actually running in UTC, 06:00 Saigon
       *is* the previous date, so the same input must land on the other answer.
       Two zones agreeing would mean the case is not measuring the grouping. */
    if (utc !== 'stalled') {
      problems.push(
        `ca kiểm múi giờ không có răng: ở UTC ca này ra '${utc}' chứ không phải 'stalled', ` +
          'nên nó không phân biệt được gom theo ngày người tập với gom theo ngày UTC',
      );
    }
  }

  if (AWAY_DAYS < 2) problems.push('AWAY_DAYS dưới 2 — một ngày nghỉ không phải là vắng mặt');
  if (OVERREACH_ACWR <= 1) problems.push('OVERREACH_ACWR ≤ 1 — tập đúng bằng thói quen không phải quá tải');

  if (problems.length) {
    console.log('trạng thái người dùng CÓ LỖI:\n');
    for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
    if (problems.length > 12) console.log(`  … và ${problems.length - 12} lỗi nữa`);
    process.exit(1);
  }

  console.log(
    `trạng thái người dùng OK — ${CASES.length} ca có đáp án cụ thể đều đúng: lỡ một ngày (và hai ngày ` +
      'rời nhau) vẫn là "steady" chứ không phải sa sút; người mới 5 ngày và người chưa ghi gì đều ra ' +
      '"settling_in" với độ tin cậy none; người vắng 14 ngày rồi quay lại được đọc là "returning" chứ ' +
      'KHÔNG phải "slipping" — dù về số học họ đang thấp hơn nền của chính mình; acwr 1.8 ra "overreaching" ' +
      'còn acwr null thì không kết luận gì; và người tập 2 buổi/tuần suốt 3 tháng vẫn là bình thường CỦA HỌ. ' +
      `Quét toàn bộ 0–120 ngày lịch sử × 4 nhịp: dưới ${MIN_HISTORY_DAYS} ngày không bao giờ kết luận gì khác ` +
      'ngoài settling_in, recent/nền luôn nằm trong 0..1, và người ghi đủ mọi ngày không bao giờ bị nói là sa sút. ' +
      'Chững lại (stalled) cần HAI tín hiệu cùng chiều — không kỷ lục VÀ khối lượng không nhích — trên ít nhất ' +
      `${MIN_LIFT_SESSIONS} buổi CÓ TẠ trong ${PROGRESS_DAYS} ngày: người chạy bộ (volume_load 0, do đồng bộ ` +
      'đồng hồ ghi cố ý như vậy) không bao giờ bị chấm là chững, người có kỷ lục cũng không, người đang sa sút ' +
      'thì "slipping" mới là điều đúng để nói, và chưa đọc được buổi tập nào thì không kết luận gì',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
