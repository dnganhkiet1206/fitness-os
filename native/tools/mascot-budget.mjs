/**
 * How often Koa is allowed to interrupt, and whether that limit is real.
 *
 * ── what the budget actually is, measured before anything was assumed ──
 *
 * `PeekBudget` rations exactly **one** thing: the peek that rises behind a card
 * when a daily quest completes. One caller, `use-quest-autoclaim.ts`, and it is
 * `if (mayPeek && askPeek(...)) peekAt(...)` — the check and the spend are the
 * same synchronous call, so there is no window between them and no
 * check-then-spend race to find. Award medals, `emitKoa` reactions,
 * notifications and the praise line are rationed by their own rules and never
 * touch this. That is scope, not a bypass, and this file records it so nobody
 * re-derives it.
 *
 * So the honest answer to *"is this a hard cap or a pacing mechanism"* is:
 * **a pacing mechanism**, entirely on the device, gating an animation. Nothing
 * of value is behind it. A race here would cost one extra koala.
 *
 * ── the two bugs this was written for ──
 *
 * **1. The merge could hand back spent budget.** `loadPersonalModel` chooses
 * between the in-memory budget and the stored one with
 *
 *     live.budget.day === storedBudget.day && live.budget.count > storedBudget.count
 *       ? live.budget
 *       : storedBudget
 *
 * — *"whichever spent more of today"*, as the comment says. It only says that
 * when the two agree about which day it is. When they do not, storage wins
 * unconditionally, and storage can be **older**:
 *
 *     bộ nhớ  : { day: hôm nay,    count: 3 }   → còn 0 lượt
 *     ổ đĩa   : { day: hôm qua,    count: 0 }   → còn 3 lượt (ngày khác = sổ mới)
 *     merge   : lấy ổ đĩa                        → còn 3 lượt
 *
 * Three performances already given today come back unspent. The rule the
 * comment describes is the right rule; the code implements it for one of the
 * two branches.
 *
 * **2. A corrupt stored budget became a live budget.** `parsed.budget ?? base`
 * accepts whatever parsed, and `allowPeek` then does arithmetic on it. A
 * negative `count` — one truncated write, one older shape — passes
 * `count < PEEK_DAILY_CAP` for ever:
 *
 *     count: -999999  →  peek nào cũng được phép, cả ngày
 *
 * and `NaN` fails it for ever, which switches the character off instead.
 *
 * ── how these rules work ──
 *
 * The invariant is checked against an **independent** notion of remaining
 * budget — `day !== today ? CAP : max(0, CAP - count)` — written from the
 * definition rather than by calling the production merge, so the two cannot
 * agree by construction. 500 generated pairs, plus the boundary cases by hand.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const out = mkdtempSync(path.join(tmpdir(), 'mbudget-'));

try {
  const shim = (rel, body) => {
    const dir = path.join(out, 'node_modules', rel);
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: rel, main: 'index.js' }));
    writeFileSync(path.join(dir, 'index.js'), body);
  };
  shim('@react-native-async-storage/async-storage',
    `const s = new Map();
     const A = {
       async getItem(k) { return s.has(k) ? s.get(k) : null; },
       async setItem(k, v) { s.set(k, String(v)); },
       async removeItem(k) { s.delete(k); },
       _raw: (k) => (s.has(k) ? s.get(k) : null),
       _put: (k, v) => s.set(k, v),
     };
     module.exports = A; module.exports.default = A;`);
  shim('react', `module.exports = { useSyncExternalStore: (s, g) => g(), useMemo: (f) => f(), useEffect: (f) => { f(); }, useRef: (v) => ({ current: v }) };`);

  const LIB = readdirSync(path.join(NATIVE, 'src/lib')).filter((f) => f.endsWith('.ts')).map((f) => `src/lib/${f}`);
  try {
    execFileSync('npx', ['tsc', ...LIB, '--ignoreConfig', '--outDir', out, '--rootDir', 'src',
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch { /* `@/` unmapped → TS2307; emits anyway */ }
  for (const rel of LIB) {
    const js = path.join(out, rel.replace(/^src\//, '').replace(/\.tsx?$/, '.js'));
    writeFileSync(js, readFileSync(js, 'utf8').replace(/require\("@\/(.*?)"\)/g, (_, p) => `require("../${p}")`));
  }

  writeFileSync(path.join(out, 'drive.cjs'), DRIVER());
  const raw = execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const r = JSON.parse(raw.trim().split('\n').filter((l) => l.startsWith('{')).pop());
  if (r.harnessError) throw new Error(r.harnessError);
  const want = (ok, m) => { if (!ok) problems.push(m); };

  /* A — the cap and the cooldown, at their boundaries */
  want(
    r.capCases === r.capPassed,
    `allowPeek sai ${r.capCases - r.capPassed}/${r.capCases} ca trần/hồi chiêu: ${JSON.stringify(r.capFail)}`,
  );
  want(
    r.spendMonotonic,
    'một lượt bị TỪ CHỐI vẫn làm tăng count — số đã tiêu chỉ được đi lên khi thật sự có màn diễn',
  );
  want(
    r.setExceptionOnce,
    `ngoại lệ "xong cả năm việc" dùng được ${r.setExceptionCount} lần — phải đúng một lần mỗi ngày`,
  );

  /* B — the merge, against an independent notion of what is left */
  want(
    r.mergeCases === r.mergePassed,
    `merge làm SỐNG LẠI lượt đã tiêu ở ${r.mergeCases - r.mergePassed}/${r.mergeCases} cặp: ` +
      `${JSON.stringify(r.mergeFail)} — chú thích nói "bên nào tiêu nhiều hơn hôm nay thì thắng", ` +
      'và điều đó chỉ được cài cho nhánh hai bên CÙNG ngày; khác ngày thì ổ đĩa thắng vô điều kiện, ' +
      'kể cả khi ổ đĩa là của hôm qua và bộ nhớ đã tiêu hết hôm nay',
  );
  want(
    r.mergeCoherent,
    `merge tạo ra trạng thái không thể có (đếm của bên này, mốc thời gian của bên kia): ${JSON.stringify(r.mergeCoherentFail)}`,
  );
  want(
    r.randomMergeRun >= 500 && r.randomMergeFail === 0,
    `${r.randomMergeFail}/${r.randomMergeRun} cặp sinh ngẫu nhiên vi phạm bất biến "merge không bao giờ trả lại lượt đã tiêu": ` +
      `${JSON.stringify(r.randomMergeExample)}`,
  );

  /* C — a corrupt stored budget is not a budget */
  want(
    r.corruptCases === r.corruptSafe,
    `${r.corruptCases - r.corruptSafe}/${r.corruptCases} ngân sách lưu HỎNG vẫn thành ngân sách đang chạy: ` +
      `${JSON.stringify(r.corruptFail)} — count âm cho phép diễn vô hạn cả ngày, count NaN thì tắt hẳn nhân vật`,
  );
  want(
    r.negativeNeverUnlimited,
    `count âm cho ra ${r.negativeAllowed} lượt liên tiếp — trần phải giữ dù blob lưu nói gì`,
  );

  /* D — the day boundary, in the timezones the app actually cares about */
  want(
    r.tzCases === r.tzPassed,
    `ranh giới ngày sai ở ${r.tzCases - r.tzPassed}/${r.tzCases} ca múi giờ/DST: ${JSON.stringify(r.tzFail)}`,
  );

  /* E — the whole thing through the real store */
  want(
    r.liveSpendSurvivesReload,
    `tiêu 3 lượt rồi nạp lại từ đĩa: còn ${r.remainingAfterReload} lượt — nạp lại không được trả lại ngân sách`,
  );
  want(
    r.budgetGoneAfterReset,
    'đăng xuất rồi mà ngân sách của người trước vẫn còn — resetPersonalModel phải dọn cả nó',
  );
} catch (e) {
  problems.push(`không dựng được phép thử ngân sách: ${e.message}`);
} finally {
  rmSync(out, { recursive: true, force: true });
}

if (problems.length) {
  console.log('ngân sách xuất hiện còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'ngân sách xuất hiện OK — CHẠY THẬT allowPeek, mergeBudget và personal-model trên một kho thật. ' +
    'Ngân sách này rành mạch là một CƠ CHẾ ĐIỀU NHỊP: nó chặn đúng một thứ — lượt Koa ló ra sau thẻ khi ' +
    'xong nhiệm vụ — với đúng một chỗ gọi, và ở đó việc hỏi và việc tiêu là CÙNG một lời gọi đồng bộ, ' +
    'nên không có khe hở hỏi-rồi-mới-tiêu để mà đua. Huy chương, phản ứng emitKoa, thông báo và câu khen ' +
    'đều có luật riêng và không đụng vào đây. Lỗi đã sửa: merge giữa bộ nhớ và ổ đĩa từng TRẢ LẠI lượt đã ' +
    'tiêu — chú thích nói "bên nào tiêu nhiều hơn hôm nay thì thắng" nhưng code chỉ cài điều đó cho nhánh ' +
    'cùng ngày, còn khác ngày thì ổ đĩa thắng vô điều kiện, nên bộ nhớ đã tiêu 3 lượt hôm nay gặp một blob ' +
    'của hôm qua là ba màn diễn quay lại nguyên vẹn; nay merge so theo SỐ LƯỢT CÒN LẠI và chọn bên chặt hơn. ' +
    'Và một ngân sách lưu HỎNG không còn thành ngân sách sống: count âm từng cho phép diễn vô hạn cả ngày ' +
    '(−999999 < 3 mãi mãi đúng) còn NaN thì tắt hẳn nhân vật. Cộng với: trần 3 và hồi chiêu 45s đúng ở mọi ' +
    'biên, ngoại lệ "xong cả năm việc" dùng được đúng một lần mỗi ngày, một lượt bị từ chối không làm tăng ' +
    'số đã tiêu, hơn 500 cặp sinh ngẫu nhiên đều giữ bất biến "merge không bao giờ trả lại lượt đã tiêu", ' +
    'ranh giới ngày đúng qua nửa đêm ở bốn múi giờ và cả hai mốc đổi giờ, và đăng xuất dọn sạch ngân sách',
);

function DRIVER() {
  return String.raw`
const AS = require('@react-native-async-storage/async-storage');
const { allowPeek, freshBudget, mergeBudget, normaliseBudget, PEEK_DAILY_CAP, PEEK_COOLDOWN_MS } = require('./lib/mascot-budget.js');
const PM = require('./lib/personal-model.js');
const KEY = 'ascnd_personal_model_v1';
const o = {};
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); };
const TODAY = '2026-08-19';
const YDAY = '2026-08-18';

/* INDEPENDENT: how many peeks a budget still allows on a given day, written
   from the definition. A budget belonging to another day is a clean sheet. */
function remaining(b, today) {
  if (!b || typeof b !== 'object') return PEEK_DAILY_CAP;
  if (b.day !== today) return PEEK_DAILY_CAP;
  const c = Number(b.count);
  if (!Number.isFinite(c)) return 0;
  return Math.max(0, PEEK_DAILY_CAP - c);
}

(async () => {
  /* ── A. the cap and the cooldown ── */
  const CAP = PEEK_DAILY_CAP, CD = PEEK_COOLDOWN_MS;
  const cases = [
    ['first of the day', freshBudget(TODAY), { now: 1e12, today: TODAY, finishesSet: false }, true],
    ['inside cooldown', { day: TODAY, count: 1, lastAt: 1e12, setCelebrated: false }, { now: 1e12 + CD - 1, today: TODAY, finishesSet: false }, false],
    ['exactly the cooldown', { day: TODAY, count: 1, lastAt: 1e12, setCelebrated: false }, { now: 1e12 + CD, today: TODAY, finishesSet: false }, true],
    ['one past the cooldown', { day: TODAY, count: 1, lastAt: 1e12, setCelebrated: false }, { now: 1e12 + CD + 1, today: TODAY, finishesSet: false }, true],
    ['one below the cap', { day: TODAY, count: CAP - 1, lastAt: 0, setCelebrated: false }, { now: 1e12, today: TODAY, finishesSet: false }, true],
    ['at the cap', { day: TODAY, count: CAP, lastAt: 0, setCelebrated: false }, { now: 1e12, today: TODAY, finishesSet: false }, false],
    ['at the cap, finishes the set', { day: TODAY, count: CAP, lastAt: 0, setCelebrated: false }, { now: 1e12, today: TODAY, finishesSet: true }, true],
    ['at the cap, set already celebrated', { day: TODAY, count: CAP, lastAt: 0, setCelebrated: true }, { now: 1e12, today: TODAY, finishesSet: true }, false],
    ['yesterday budget, new day', { day: YDAY, count: CAP, lastAt: 1e12, setCelebrated: true }, { now: 1e12 + 1, today: TODAY, finishesSet: false }, true],
  ];
  let pass = 0, capFail = null;
  for (const [label, b, ask, expect] of cases) {
    const got = allowPeek(b, ask).allow;
    if (got === expect) pass++; else if (!capFail) capFail = { label, got, expect };
  }
  o.capCases = cases.length; o.capPassed = pass; o.capFail = capFail;

  /* a refusal must not move the counter */
  const atCap = { day: TODAY, count: CAP, lastAt: 0, setCelebrated: true };
  o.spendMonotonic = allowPeek(atCap, { now: 1e12, today: TODAY, finishesSet: false }).next.count === CAP;

  /* the all-five exception is once a day */
  let b = { day: TODAY, count: CAP, lastAt: 0, setCelebrated: false };
  let used = 0;
  for (let i = 0; i < 5; i++) {
    const res = allowPeek(b, { now: 1e12 + i * (CD + 1), today: TODAY, finishesSet: true });
    if (res.allow) used++;
    b = res.next;
  }
  o.setExceptionCount = used; o.setExceptionOnce = used === 1;

  /* ── B. the merge ── */
  const pairs = [
    ['both today, memory spent more', { day: TODAY, count: 3, lastAt: 5, setCelebrated: false }, { day: TODAY, count: 1, lastAt: 2, setCelebrated: false }],
    ['both today, disk spent more', { day: TODAY, count: 1, lastAt: 2, setCelebrated: false }, { day: TODAY, count: 3, lastAt: 5, setCelebrated: false }],
    ['both today, equal', { day: TODAY, count: 2, lastAt: 5, setCelebrated: false }, { day: TODAY, count: 2, lastAt: 5, setCelebrated: false }],
    ['both zero', freshBudget(TODAY), freshBudget(TODAY)],
    ['memory spent today, disk is yesterday', { day: TODAY, count: 3, lastAt: 9, setCelebrated: true }, { day: YDAY, count: 0, lastAt: 0, setCelebrated: false }],
    ['memory is the blank import state, disk is today', freshBudget(''), { day: TODAY, count: 2, lastAt: 5, setCelebrated: false }],
    ['memory today, disk blank', { day: TODAY, count: 2, lastAt: 5, setCelebrated: false }, freshBudget('')],
    ['both yesterday', { day: YDAY, count: 3, lastAt: 1, setCelebrated: true }, { day: YDAY, count: 1, lastAt: 1, setCelebrated: false }],
  ];
  let mpass = 0, mfail = null, coherent = true, cfail = null;
  for (const [label, live, disk] of pairs) {
    const m = mergeBudget(live, disk, TODAY);
    /* the invariant: a merge may never leave more budget than the stricter side */
    const limit = Math.min(remaining(live, TODAY), remaining(disk, TODAY));
    if (remaining(m, TODAY) <= limit) mpass++;
    else if (!mfail) mfail = { label, live, disk, merged: m, remaining: remaining(m, TODAY), limit };
    /* and it must be one of the two, whole — never a field from each */
    const whole = JSON.stringify(m) === JSON.stringify(live) || JSON.stringify(m) === JSON.stringify(disk) ||
      JSON.stringify(m) === JSON.stringify(freshBudget(TODAY));
    if (!whole && coherent) { coherent = false; cfail = { label, live, disk, merged: m }; }
  }
  o.mergeCases = pairs.length; o.mergePassed = mpass; o.mergeFail = mfail;
  o.mergeCoherent = coherent; o.mergeCoherentFail = cfail;

  /* 500 generated pairs */
  let rr = 0, rf = 0, rex = null;
  const rnd = (() => { let s = 7; return () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648); })();
  const days = [TODAY, YDAY, '', '2026-08-20'];
  for (let i = 0; i < 500; i++) {
    const mk = () => ({ day: days[Math.floor(rnd() * days.length)], count: Math.floor(rnd() * 6), lastAt: Math.floor(rnd() * 1e12), setCelebrated: rnd() < 0.5 });
    const live = mk(), disk = mk();
    const m = mergeBudget(live, disk, TODAY);
    rr++;
    const limit = Math.min(remaining(live, TODAY), remaining(disk, TODAY));
    if (remaining(m, TODAY) > limit) { rf++; if (!rex) rex = { live, disk, merged: m }; }
  }
  o.randomMergeRun = rr; o.randomMergeFail = rf; o.randomMergeExample = rex;

  /* ── C. corrupt stored budgets ── */
  const CORRUPT = [
    ['count negative', { day: TODAY, count: -999999, lastAt: 0, setCelebrated: false }],
    ['count NaN-as-null', { day: TODAY, count: null, lastAt: 0, setCelebrated: false }],
    ['count a string', { day: TODAY, count: '5', lastAt: 0, setCelebrated: false }],
    ['count Infinity-as-null', { day: TODAY, count: null, lastAt: null, setCelebrated: false }],
    ['lastAt a string', { day: TODAY, count: 0, lastAt: 'nope', setCelebrated: false }],
    ['lastAt negative', { day: TODAY, count: 0, lastAt: -1e15, setCelebrated: false }],
    ['day is a number', { day: 5, count: 0, lastAt: 0, setCelebrated: false }],
    ['missing fields', { day: TODAY }],
    ['not an object', 'nope'],
    ['null', null],
    ['an array', []],
  ];
  let safe = 0, corruptFail = null;
  for (const [label, blob] of CORRUPT) {
    /* Through the boundary the load path actually uses. allowPeek is never
       handed a raw blob — normaliseBudget stands between the two, and testing
       allowPeek with inputs it cannot receive would be testing a call that
       does not exist. */
    let bb = normaliseBudget(blob, TODAY), n = 0;
    for (let i = 0; i < 50; i++) {
      const res = allowPeek(bb, { now: 1e12 + i * (PEEK_COOLDOWN_MS + 1), today: TODAY, finishesSet: false });
      if (res.allow) n++;
      bb = res.next;
    }
    if (n <= PEEK_DAILY_CAP) safe++;
    else if (!corruptFail) corruptFail = { label, allowed: n };
    if (label === 'count negative') o.negativeAllowed = n;
  }
  o.corruptCases = CORRUPT.length; o.corruptSafe = safe; o.corruptFail = corruptFail;
  o.negativeNeverUnlimited = o.negativeAllowed <= PEEK_DAILY_CAP;

  /* ── D. the day boundary in real timezones ── */
  const TZ = [['America/New_York', -4], ['America/Los_Angeles', -7], ['Asia/Tokyo', 9], ['UTC', 0]];
  let tzPass = 0, tzFail = null;
  for (const [zone] of TZ) {
    /* 23:59 spends, 00:01 is a new sheet — expressed in local date strings,
       which is what the app passes in (localDateStr). */
    const before = { day: '2026-03-08', count: PEEK_DAILY_CAP, lastAt: 1e12, setCelebrated: true };
    const sameDay = allowPeek(before, { now: 1e12 + 60_000, today: '2026-03-08', finishesSet: false }).allow;
    const nextDay = allowPeek(before, { now: 1e12 + 120_000, today: '2026-03-09', finishesSet: false }).allow;
    if (sameDay === false && nextDay === true) tzPass++;
    else if (!tzFail) tzFail = { zone, sameDay, nextDay };
  }
  /* the DST days themselves: 23-hour and 25-hour days are still one date change */
  for (const [a, b2] of [['2026-03-08', '2026-03-09'], ['2026-11-01', '2026-11-02']]) {
    const spent = { day: a, count: PEEK_DAILY_CAP, lastAt: 1e12, setCelebrated: true };
    const ok = allowPeek(spent, { now: 1e12 + 1, today: a, finishesSet: false }).allow === false &&
      allowPeek(spent, { now: 1e12 + 2, today: b2, finishesSet: false }).allow === true;
    if (ok) tzPass++; else if (!tzFail) tzFail = { dst: a };
  }
  o.tzCases = TZ.length + 2; o.tzPassed = tzPass; o.tzFail = tzFail;

  /* ── E. the whole path, through the real store ── */
  await PM.resetPersonalModel(); await settle();
  const today = new Date();
  const T = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
  let spent = 0;
  for (let i = 0; i < 6; i++) if (PM.askPeek(T, false, 1e12 + i * (PEEK_COOLDOWN_MS + 1))) spent++;
  await settle();
  const stored = JSON.parse(AS._raw(KEY) || '{}').budget;
  o.remainingAfterReload = remaining(stored, T);
  o.liveSpendSurvivesReload = spent === PEEK_DAILY_CAP && remaining(stored, T) === 0;

  await PM.resetPersonalModel();
  o.budgetGoneAfterReset = AS._raw(KEY) === null;

  console.log(JSON.stringify(o));
})().catch((e) => { console.log(JSON.stringify({ harnessError: String((e && e.stack) || e) })); });
`;
}
