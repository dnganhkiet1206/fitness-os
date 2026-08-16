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
import { mkdtempSync, rmSync } from 'node:fs';
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
      ['tsc', 'src/lib/user-state.ts', '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
       still emits, which is all this uses */
  }
  const {
    userStateFrom,
    MIN_HISTORY_DAYS,
    BASELINE_DAYS,
    RECENT_DAYS,
    DROP_FRACTION,
    MIN_BASELINE,
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
      got = userStateFrom({ loggedDates: c.dates, today: TODAY, acwr: c.acwr });
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
      'ngoài settling_in, recent/nền luôn nằm trong 0..1, và người ghi đủ mọi ngày không bao giờ bị nói là sa sút',
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
