/**
 * A nap is a nap, and no night is 26 hours long.
 *
 * ── the bug this was written for ──
 *
 * `log-sleep.tsx` decided which day a bedtime belonged to by looking at the
 * bedtime and nothing else:
 *
 *     withDate(bedtime, bedtime.getHours() >= 12 ? -1 : 0)
 *
 * "After noon means yesterday." True of a night, false of everything else,
 * because it never asked when the person woke up.
 *
 * Asleep 14:00, awake 16:00 — an afternoon nap — became yesterday 14:00 to
 * today 16:00: **1,560 minutes**. The sheet printed "26h 00m" about itself and
 * saved it anyway. Then:
 *
 *   · `daily_logs.sleep_duration_min = 1560`
 *   · `computeSleepScore` divides by an 8-hour target → ratio 3.25 → the
 *     `>= 1.0` branch → **100/100**, at weight 0.30 the heaviest single input
 *     to readiness
 *   · `sleepDebt7d` averages seven nights, so one nap **erased a real week** of
 *     sleep debt
 *
 * The reverse direction was quieter and worse. Asleep 11:00, awake 07:00 gave a
 * *negative* span; the sheet clamped it with `Math.max(0, …)` for **display**
 * while `asleepMinutes` had no clamp at all, so −240 reached the database.
 *
 * ── why a table of cases ──
 *
 * Every failure here is at an edge, and every edge is a plausible thing for a
 * person to type. A rule like this cannot be checked by reading it — the old
 * one reads perfectly well. It has to be run.
 *
 * That is why `sleepSpan` was lifted out of the screen into `lib/sleep-window.ts`:
 * a rule about time living inside a component is a rule nothing can execute.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const out = mkdtempSync(path.join(tmpdir(), 'sleepwin-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/sleep-window.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* no project tsconfig here — tsc exits non-zero over the `@/` mapping and
     still emits, which is all this uses */
}
const { sleepSpan } = createRequire(import.meta.url)(path.join(out, 'sleep-window.js'));

/** A picker hands back a Date carrying only a clock time. */
const at = (h, m = 0) => new Date(2000, 0, 1, h, m);
/** A fixed "today" so the table does not drift with the wall clock. */
const REF = new Date(2026, 7, 15, 9, 0, 0, 0);

/* ── 1. the cases, each with the reason it is here ── */
{
  const CASES = [
    // [bed, wake, expected minutes, why]
    [at(14), at(16), 120, 'giấc trưa 14:00→16:00 — bản đã ship ra 1.560 phút (26 giờ)'],
    [at(23), at(7), 480, 'đêm bình thường 23:00→07:00 vẫn phải qua nửa đêm'],
    [at(0, 30), at(8), 450, 'ngủ sau nửa đêm 00:30→08:00 — cùng một ngày, không lùi'],
    [at(22, 15), at(6, 45), 510, 'đêm lệch phút, để bắt kiểu làm tròn về giờ'],
    [at(13), at(13, 20), 20, 'chợp mắt 20 phút vẫn là một khoảng hợp lệ'],
    [at(11), at(7), 1200, 'ca ngược 11:00→07:00 — bản đã ship ra SỐ ÂM (−240)'],
    [at(8), at(8), 1440, 'hai giờ bằng nhau là trọn một ngày, không phải 0'],
  ];

  for (const [bed, wake, want, why] of CASES) {
    const got = sleepSpan(bed, wake, REF).minutes;
    if (got !== want) {
      problems.push(`${why}: ra ${got} phút, cần ${want}`);
    }
  }
}

/* ── 2. never negative, whatever the pair ── */
{
  for (let b = 0; b < 24; b++) {
    for (let w = 0; w < 24; w++) {
      const { minutes, bedDate, wakeDate } = sleepSpan(at(b), at(w), REF);
      if (minutes < 0) {
        problems.push(`${b}:00→${w}:00 ra số âm (${minutes})`);
      }
      if (wakeDate.getTime() < bedDate.getTime()) {
        problems.push(`${b}:00→${w}:00: giờ dậy nằm TRƯỚC giờ ngủ trên lịch`);
      }
      /* 24 h is the ceiling the geometry allows — the bedtime moves back at
         most one day. Anything above it means the offset was applied twice. */
      if (minutes > 1440) {
        problems.push(`${b}:00→${w}:00 ra ${minutes} phút — quá một ngày, tức đã lùi ngày hai lần`);
      }
    }
  }
}

/* ── 3. the impossible spans are refused before saving ── */
{
  const src = strip(read('src/app/log-sleep.tsx'));

  if (!src.includes('sleepSpan(')) {
    problems.push(
      'src/app/log-sleep.tsx: không dùng sleepSpan — màn hình lại tự có luật ngày riêng, ' +
        'đúng thứ đã đẻ ra đêm 26 tiếng',
    );
  }
  /* The shipped expression, named exactly so it cannot come back. */
  if (/getHours\(\)\s*>=\s*12/.test(src)) {
    problems.push(
      "src/app/log-sleep.tsx: vẫn quyết định ngày bằng `getHours() >= 12` — luật chỉ nhìn giờ đi ngủ",
    );
  }
  if (!src.includes("plausible('sleep_duration_min'")) {
    problems.push(
      'src/app/log-sleep.tsx: độ dài đêm không được kiểm ngưỡng — ' +
        '11:00→07:00 giờ là 20 tiếng hợp lệ về số học và vẫn không phải một đêm',
    );
  }
  /* An error nobody can act on is not a check: the Save button has to be shut
     while the span is impossible. */
  if (!/disabled=\{[^}]*durationError/.test(src)) {
    problems.push('src/app/log-sleep.tsx: có báo lỗi độ dài đêm nhưng nút Lưu vẫn bấm được');
  }

  const bounds = strip(read('src/lib/plausible.ts'));
  if (!/sleep_duration_min:\s*\{/.test(bounds)) {
    problems.push('src/lib/plausible.ts: chưa có ngưỡng sleep_duration_min');
  } else {
    const m = bounds.match(/sleep_duration_min:\s*\{\s*min:\s*(\d+),\s*max:\s*(\d+)/);
    if (!m) {
      problems.push('src/lib/plausible.ts: không đọc được ngưỡng sleep_duration_min');
    } else {
      const [, min, max] = m.map(Number);
      if (!(min > 0)) problems.push(`sàn ${min} — số 0 lọt qua, và một cặp giờ ngược sẽ ra đúng 0`);
      if (!(max >= 600 && max <= 1200)) {
        problems.push(`trần ${max} phút không hợp lý (cần đủ cho giấc ngủ bù, và chặn được một ngày trọn)`);
      }
      /* The two cases the fix exists for must actually fall outside. */
      if (1560 <= max) problems.push('đêm 26 tiếng (1.560) vẫn nằm trong ngưỡng');
      if (1200 <= max) problems.push('ca ngược 11:00→07:00 (1.200) vẫn nằm trong ngưỡng');
    }
  }
}

/* ── 4. and nothing negative can reach daily_logs from an old row ── */
{
  const svc = strip(read('src/lib/daily-log-service.ts'));
  const fn = svc.slice(svc.indexOf('export function asleepMinutes'));
  /* To the closing brace in column 0 — not the first `\n}`, which lands on the
     end of the destructured parameter type (`}): number {`) and cuts the body
     off above the `return`. That mistake made this rule report a clamp that was
     there, which is the same shape of error the rule is looking for. */
  const body = fn.slice(0, fn.indexOf('\n}\n'));
  if (!/Math\.max\(\s*0\s*,/.test(body)) {
    problems.push(
      'src/lib/daily-log-service.ts: asleepMinutes không kẹp sàn 0 — ' +
        'một dòng ngược có sẵn trong DB (hoặc từ HealthKit) vẫn ghi số âm vào daily_logs',
    );
  }
}

if (problems.length) {
  /*
    Capped. The sweep is 576 pairs, and a rule this broad fails in sheets — the
    shipped date rule produced 145 lines, of which the first four were the whole
    story and the rest were the same sentence with different numbers. A report
    nobody reads to the end is a report that hides its own headline.
  */
  console.log('cửa sổ giấc ngủ:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  if (problems.length > 12) {
    console.log(`  … và ${problems.length - 12} lỗi cùng loại nữa`);
  }
  process.exit(1);
}

console.log(
  'cửa sổ giấc ngủ OK — 7 ca có số cụ thể đều đúng: giấc trưa 14:00→16:00 ra 120 phút ' +
    '(bản đã ship ra 1.560, tức "đêm" 26 tiếng chấm 100/100 điểm ngủ và xoá nợ ngủ cả tuần), ' +
    'đêm 23:00→07:00 vẫn qua nửa đêm, ngủ sau nửa đêm không bị lùi ngày, ' +
    'và ca ngược 11:00→07:00 ra 1.200 thay vì −240; quét toàn bộ 576 cặp giờ không cặp nào ' +
    'ra số âm, không cặp nào có giờ dậy trước giờ ngủ, không cặp nào vượt một ngày; ' +
    'độ dài đêm có ngưỡng riêng và nút Lưu tắt khi vượt — cả 1.560 lẫn 1.200 đều bị chặn; ' +
    'và asleepMinutes kẹp sàn 0 nên dòng cũ trong DB không ghi số âm vào daily_logs',
);
