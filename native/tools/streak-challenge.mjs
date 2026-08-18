/**
 * A day counts because somebody logged it, and a week is won once.
 *
 * ── the primary question this chain started from ──
 *
 * Could a wrong `daily_logs` from BUG-46 or BUG-47 have left permanent damage
 * downstream — a broken streak, a granted badge, a paid reward — that does not
 * repair when `daily_logs` is later corrected?
 *
 * Traced with the real functions, the answer is mostly no, and the reasons are
 * worth keeping because they are what makes the rest of this file small:
 *
 *   · The streak reads **row existence**, never a value in the row. BUG-46
 *     changed `kcal`; it never deleted a row. Streaks and streak medals were
 *     untouched by it.
 *   · Challenge progress is a **full rebuild** on every pass, so a corrected
 *     `daily_logs` repairs it on the next read.
 *   · BUG-47 could only ever push `steps` *down* (0 instead of a real count),
 *     so it could fail a quest but never pay one. Nothing irreversible.
 *
 * The one path that could pay early is an inflated value — BUG-46's stale
 * snapshot restoring a total after a meal was deleted — which can complete a
 * weekly challenge before the condition is genuinely met. The coins are bounded
 * by `challengeRefKey`, fixed for the week under `UNIQUE(user_id, ref_key)`, so
 * it is one week's reward paid early and never twice. **Code-path proven, not
 * production proven.**
 *
 * ── the four bugs the tracing turned up on its own ──
 *
 * **1. The streak counted days nobody logged.** The rule was "a day with a
 * `daily_logs` row", true when only `recomputeDailyLog` made rows. The health
 * sync backfills up to thirteen days of HealthKit steps with an *upsert*, which
 * creates the row when there is none. Run against the real `streakFrom`:
 *
 *     streakFromBackfillAlone: 13
 *
 * Thirteen days of streak on a first sync, for an account that has logged
 * nothing — past `streak_3` and `streak_7`, and those go into `awards`, which
 * nothing revokes. The same rule also counted a day whose every source record
 * had been deleted, because Chain I proved the row survives at all-zero.
 *
 * **2. The celebration replayed.** `completed` is a statement about the current
 * reading and may go back to false. So `completed && !was` is not "finished for
 * the first time", it is "finished again":
 *
 *     v=4 → v=5 (justCompleted) → v=5 → v=4 → v=5 (justCompleted)
 *
 * **3. A future-dated row zeroed the streak.** The newest row is read as where
 * the run ends; one dated tomorrow — a phone with a fast clock is enough —
 * ended it in the future, which is neither today nor yesterday, so the whole
 * streak read zero along with every medal granted from it.
 *
 * **4. Badges are client-authoritative**, and that one is *not* fixed here —
 * see the ledger. Cross-user is blocked and no coins are involved, so it is
 * bounded; making the server the authority is an architecture decision, not a
 * bug fix.
 *
 * ── how the rules work ──
 *
 * Rules A and B **run** the real `streakFrom` and `challengeStep`. Rule C reads
 * the two streak queries, because "which rows the database returns" cannot be
 * observed from a pure function — and those two call sites have drifted apart
 * twice already, which is why `lib/streak.ts` exists at all.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ─────────────────────────────────────────────────────────────────────────
   Rules A & B — run the two functions that decide accumulated state
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'streakch-'));
try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/streak.ts', 'src/lib/challenge-progress.ts', 'src/lib/local-date.ts',
        '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway. */
  }
  const js = path.join(out, 'streak.js');
  writeFileSync(js, readFileSync(js, 'utf8').replace('require("@/lib/local-date")', 'require("./local-date.js")'));

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const { streakFrom, STREAK_WINDOW } = require('./streak.js');
     const { challengeStep } = require('./challenge-progress.js');
     const d = (n) => { const x = new Date('2026-08-18T12:00:00Z'); x.setUTCDate(x.getUTCDate() - n); return x.toISOString().slice(0, 10); };
     const T = d(0);
     const o = {};

     /* ── A. the run itself ── */
     o.window = STREAK_WINDOW;
     o.plainRun = streakFrom([T, d(1), d(2)], T, []).count;
     o.endsYesterday = streakFrom([d(1), d(2)], T, []).count;
     o.lapsed = streakFrom([d(5), d(6)], T, []).count;
     o.gap = streakFrom([T, d(1), d(3), d(4)], T, []).count;
     o.frozenCovers = streakFrom([T, d(2)], T, [d(1)]).count;
     /* a phone whose clock is a day fast, and a row dated tomorrow */
     o.futureRow = streakFrom([d(-1), T, d(1)], T, []).count;
     o.farFutureRow = streakFrom([d(-30), T, d(1)], T, []).count;
     o.onlyFuture = streakFrom([d(-1), d(-2)], T, []).count;
     /* the run is counted the same however the rows arrive */
     const days = [T, d(1), d(2), d(3)];
     o.orderIndependent = [days, [...days].reverse(), [days[2], days[0], days[3], days[1]]]
       .map((x) => streakFrom([...x].sort().reverse(), T, []).count).join(',');

     /* ── B. one week, one celebration ── */
     const row = { current_value: 0, target_value: 5, completed: false, completed_at: null };
     const passes = [];
     const pass = (v) => {
       const s = challengeStep(row, v);
       passes.push(s.justCompleted);
       row.current_value = s.value;
       row.completed = s.completed;
       if (s.completed && !row.completed_at) row.completed_at = '2026-08-18T00:00:00Z';
       return s;
     };
     [4, 5, 5, 4, 5, 3, 5].forEach(pass);
     o.celebrations = passes.filter(Boolean).length;
     o.completedAtKept = row.completed_at !== null;

     /* the second pass over an unchanged finished challenge writes nothing */
     const steady = { current_value: 5, target_value: 5, completed: true, completed_at: 'x' };
     o.steadyUnchanged = challengeStep(steady, 5).unchanged;
     o.steadySilent = challengeStep(steady, 5).justCompleted === false;

     /* a reading that cannot be a reading must not become progress */
     o.nanValue = challengeStep({ current_value: 0, target_value: 5, completed: false }, NaN).value;
     o.negativeValue = challengeStep({ current_value: 0, target_value: 5, completed: false }, -3).value;
     o.overfill = challengeStep({ current_value: 0, target_value: 5, completed: false }, 99).value;

     console.log(JSON.stringify(o));`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  want(r.plainRun === 3 && r.endsYesterday === 2, `chuỗi cơ bản sai: ${r.plainRun}/${r.endsYesterday}`);
  want(r.lapsed === 0, `chuỗi đã đứt vẫn đếm ${r.lapsed} — độ dài cũ không phải thứ nên khoe`);
  want(r.gap === 2, `một ngày trống không cắt chuỗi (ra ${r.gap})`);
  want(r.frozenCovers === 3, `ngày được freeze che không được tính (ra ${r.frozenCovers})`);
  want(
    r.futureRow === 2 && r.farFutureRow === 2 && r.onlyFuture === 0,
    `một dòng mang ngày TƯƠNG LAI làm chuỗi ra ${r.futureRow}/${r.farFutureRow}/${r.onlyFuture} ` +
      'thay vì 2/2/0 — dòng mới nhất được đọc là chỗ chuỗi kết thúc, nên một ngày chưa xảy ra ' +
      'kết thúc chuỗi ở đó và cả chuỗi về 0. Một chiếc điện thoại chạy nhanh một ngày là đủ, ' +
      'và mọi huy hiệu chuỗi đều được trao từ con số này',
  );
  want(r.orderIndependent === '4,4,4', `thứ tự dòng đổi thì chuỗi đổi: ${r.orderIndependent}`);
  want(
    r.celebrations === 1,
    `bảy lượt với ba lần đạt đích sinh ${r.celebrations} màn ăn mừng — phải là 1. ` +
      '`completed` là phát biểu về LẦN ĐỌC HIỆN TẠI và được phép quay về false ' +
      '(xoá một bữa ăn, sửa một ngày), nên `completed && !was` không phải "lần đầu thắng" ' +
      'mà là "thắng lại". Tiền thì an toàn nhờ ref_key cố định theo tuần, còn màn ăn mừng ' +
      'toàn màn hình là thứ DUY NHẤT trong luồng này phải hiếm',
  );
  want(r.completedAtKept, 'completed_at bị xoá khi thử thách tụt lại dưới đích — mất luôn dấu vết lần thắng, và cùng với nó là cái chốt chặn ăn mừng lặp');
  want(r.steadyUnchanged && r.steadySilent, 'lượt thứ hai trên một thử thách đã xong vẫn ghi hoặc vẫn ăn mừng');
  want(
    r.nanValue === 0 && r.negativeValue === 0 && r.overfill === 5,
    `số đọc bệnh lý vẫn thành tiến trình: NaN→${r.nanValue}, -3→${r.negativeValue}, 99→${r.overfill}`,
  );
} catch (e) {
  problems.push(`không dựng được phép thử chuỗi/thử thách: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule C — both streak queries ask for days somebody logged
   ───────────────────────────────────────────────────────────────────────── */
{
  const streak = strip(read('src/lib/streak.ts'));
  const filter = streak.match(/LOGGED_DAY_FILTER\s*=\s*\n?\s*'([^']+)'/)?.[1];
  if (!filter) {
    problems.push(
      'lib/streak.ts không còn định nghĩa LOGGED_DAY_FILTER — ' +
        'quy tắc "ngày nào được tính" quay về nằm rải ở hai chỗ gọi, và hai chỗ đó đã lệch nhau hai lần',
    );
  } else {
    /* `steps` is what the health sync backfills; counting it is the bug. */
    if (/\bsteps\b|active_kcal|active_minutes/.test(filter)) {
      problems.push(
        `LOGGED_DAY_FILTER nhắc tới cột của đồng bộ sức khoẻ (${filter}) — ` +
          'đó là những cột được ghi cho cả những ngày không ai mở app, nên đưa chúng vào ' +
          'là đưa lại đúng cái đã đo: 13 ngày backfill một mình cho ra chuỗi 13 ngày',
      );
    }
    if (!/kcal\.gt\.0/.test(filter)) {
      problems.push(`LOGGED_DAY_FILTER không còn nhận ngày có ghi bữa ăn (${filter})`);
    }
  }

  /*
    The filter has to be in the query, not applied after it. `STREAK_WINDOW` is
    a `limit`: filtering afterwards fills those 400 rows with days that do not
    count and caps the streak short of the truth, silently.
  */
  const READERS = ['src/hooks/use-extras.ts', 'src/hooks/use-mascot-room.ts'];
  let checked = 0;
  for (const f of READERS) {
    const src = strip(read(f));
    for (const m of src.matchAll(/from\('daily_logs'\)[\s\S]{0,400}?limit\(STREAK_WINDOW\)/g)) {
      checked++;
      if (!/\.or\(LOGGED_DAY_FILTER\)/.test(m[0])) {
        problems.push(
          `${f}: truy vấn chuỗi không lọc LOGGED_DAY_FILTER — ` +
            'một dòng trần không còn là bằng chứng ai đó đã ghi gì: đồng bộ sức khoẻ tạo dòng ' +
            'cho tới 13 ngày quá khứ chỉ vì điện thoại đếm bước, và huy hiệu chuỗi thì không thu hồi được',
        );
      }
    }
  }
  if (checked !== READERS.length) {
    problems.push(
      `chỉ tìm thấy ${checked}/${READERS.length} truy vấn chuỗi — bộ quét lạc mục tiêu, đừng tin kết quả`,
    );
  }

  /* And the payment stays idempotent for the week, which is what bounds an
     early completion to one reward. */
  const extras = strip(read('src/hooks/use-extras.ts'));
  if (!/challengeRefKey\(/.test(extras)) {
    problems.push(
      'phần thưởng thử thách không còn dùng challengeRefKey — ' +
        'khoá cố định theo tuần là thứ DUY NHẤT biến một điều kiện chập chờn thành đúng một lần trả tiền',
    );
  }
  if (!/if \(step\.justCompleted\)/.test(extras)) {
    problems.push('tiền thưởng không còn gắn với chuyển trạng thái justCompleted');
  }
}

if (problems.length) {
  console.log('trạng thái tích luỹ còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'trạng thái tích luỹ OK — CHẠY THẬT streakFrom và challengeStep: chuỗi cơ bản, chuỗi kết thúc ' +
    'hôm qua, chuỗi đã đứt, ngày trống, ngày được freeze che, và thứ tự dòng không đổi kết quả; ' +
    'một dòng mang NGÀY TƯƠNG LAI không còn làm cả chuỗi về 0 (bản đã ship ra 0 thay vì 2 — dòng mới ' +
    'nhất được đọc là chỗ chuỗi kết thúc, và một điện thoại chạy nhanh một ngày là đủ, trong khi mọi ' +
    'huy hiệu chuỗi đều trao từ con số này). Bảy lượt với ba lần đạt đích sinh ĐÚNG MỘT màn ăn mừng ' +
    'và completed_at được giữ lại — bản đã ship sinh hai, vì `completed` là phát biểu về lần đọc hiện ' +
    'tại và được phép quay về false, nên "thắng lại" bị đọc thành "lần đầu thắng"; tiền vẫn an toàn ' +
    'nhờ ref_key cố định theo tuần. Số đọc bệnh lý (NaN, âm, vượt đích) không thành tiến trình. ' +
    'Và CẢ HAI truy vấn chuỗi lọc LOGGED_DAY_FILTER ngay trong câu truy vấn — lọc sau khi đọc sẽ ' +
    'làm limit(STREAK_WINDOW) đầy những ngày không tính và cắt cụt chuỗi trong im lặng; bộ lọc ' +
    'không được nhắc tới cột của đồng bộ sức khoẻ, vì 13 ngày backfill một mình đã đo ra chuỗi 13 ngày ' +
    'cho một tài khoản chưa ghi gì',
);
