/**
 * That the streak counts the same everywhere, and that every medal on the
 * ladder can actually be reached.
 *
 * ── the two bugs this was written for ──
 *
 * **One rule, two copies.** `useDailyStreak` counted the run for Koa's room and
 * `useCheckAwards` counted it again for the medals, each from its own query.
 * The medal copy started at `1` and only ran its loop when the newest row was
 * today or yesterday, so somebody who last logged a week ago came out with a
 * streak of one rather than none. It never showed, because the smallest medal
 * needs three days — which is what makes it the interesting kind of bug: the
 * two answers were already different and nothing was watching.
 *
 * **A medal behind the window.** Both queries read `limit(35)`, which is not a
 * performance detail — it is a ceiling on the longest streak that can be
 * counted. The ladder stopped at 30, one short of the ceiling, and the day it
 * was extended to 60 and 100 and 365 those three medals would have been
 * unearnable by construction. An award nobody can get does not look like a bug
 * in the app; it looks like a failure in the person trying to get it.
 *
 * ── what is checked ──
 *
 *   1. the counting itself, run for real over date lists with known answers;
 *   2. the same run through a **full year in three timezones**, because a year
 *      contains every daylight-saving transition and "these two midnights are
 *      one day apart" is exactly the arithmetic that breaks at one;
 *   3. every streak milestone within `STREAK_WINDOW`;
 *   4. every award in the catalogue having text in both languages;
 *   5. nobody counting days on their own again.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
/** migrations live at the repo root, one level up from the app */
const readRepo = (p) => readFileSync(path.join(NATIVE, '..', p), 'utf8');
const problems = [];

/* ── load the real function ──
   `streak.ts` imports `local-date`, so both are compiled and the alias in the
   emitted require is rewritten to a relative path. Every other tool here loads
   a lib with no imports at all and needs no such line; this is the one
   substitution, and it is a path, not behaviour. */
const out = mkdtempSync(path.join(tmpdir(), 'streak-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/streak.ts', 'src/lib/local-date.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  /* Without the project's tsconfig there is no `@/` mapping, so tsc reports the
     alias as unresolved and exits non-zero — while still emitting the JS, which
     is all that is wanted. The real type check is `npx tsc --noEmit` over the
     project; failing here on that would only be failing on the missing config. */
}
const emitted = path.join(out, 'streak.js');
if (!readFileSync(emitted, 'utf8')) {
  console.log('không biên dịch được src/lib/streak.ts');
  process.exit(1);
}
writeFileSync(emitted, readFileSync(emitted, 'utf8').replaceAll('@/lib/local-date', './local-date'));
const { streakFrom, missedDates, STREAK_WINDOW } = createRequire(import.meta.url)(emitted);

/* ── dates, built in UTC so the *fixtures* never move with the timezone ──
   Only the code under test is allowed to care where it is running. */
const day = (base, back) => {
  const d = new Date(Date.UTC(...base));
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
};
const TODAY_PARTS = [2026, 7, 14]; // 2026-08-14, month is 0-based
const TODAY = day(TODAY_PARTS, 0);
/** `n` consecutive days, newest first, ending `back` days before today */
const run = (n, back = 0) => Array.from({ length: n }, (_, i) => day(TODAY_PARTS, back + i));

/* ── 1: the answers ── */
const CASES = [
  ['chưa có ngày nào', [], 0, false],
  ['chỉ hôm nay', run(1), 1, true],
  ['chỉ hôm qua — vẫn còn cơ hội, nhưng chưa an toàn', run(1, 1), 1, false],
  ['ba ngày tính đến hôm nay', run(3), 3, true],
  ['ba ngày tính đến hôm qua', run(3, 1), 3, false],
  ['đứt từ hai hôm trước', run(5, 2), 0, false],
  ['hôm nay có, hôm qua trống', [TODAY, day(TODAY_PARTS, 2), day(TODAY_PARTS, 3)], 1, true],
  ['một năm liền', run(365), 365, true],
];

/* ── the freeze ──
   A bought day off only means anything if the counter treats it as a day. */
const FREEZE_CASES = [
  [
    // today + the covered yesterday + the two logged days behind it = four
    'hôm qua được bù thì chuỗi liền mạch',
    [TODAY, day(TODAY_PARTS, 2), day(TODAY_PARTS, 3)],
    [day(TODAY_PARTS, 1)],
    4,
    true,
  ],
  [
    'bù hai ngày liền',
    [TODAY, day(TODAY_PARTS, 3)],
    [day(TODAY_PARTS, 1), day(TODAY_PARTS, 2)],
    4,
    true,
  ],
  [
    'bù ngày không nằm trong lỗ hổng thì không nối gì thêm',
    [TODAY, day(TODAY_PARTS, 1)],
    [day(TODAY_PARTS, 9)],
    2,
    true,
  ],
  [
    'không thể bù chính hôm nay — ngày chưa hết',
    [day(TODAY_PARTS, 1)],
    [TODAY],
    1,
    false,
  ],
];

const check = (label, dates, wantCount, wantToday, tz) => {
  const got = streakFrom(dates, TODAY);
  const where = tz ? ` [${tz}]` : '';
  if (got.count !== wantCount) {
    problems.push(`${label}${where}: đếm ra ${got.count}, đáng lẽ ${wantCount}`);
  }
  if (got.loggedToday !== wantToday) {
    problems.push(`${label}${where}: loggedToday=${got.loggedToday}, đáng lẽ ${wantToday}`);
  }
};

const TZ = process.env.STREAK_TZ;
for (const [label, dates, count, today] of CASES) check(label, dates, count, today, TZ);

/* In a timezone whose clocks move, the year-long run must be a case the naive
   version actually fails — otherwise the extra passes are decoration. `diff ===
   1` without the rounding is that naive version, and in Santiago it counts 132
   days instead of 365 because one midnight-to-midnight is 25 hours. If it ever
   reaches 365 here, this zone is not exercising anything and the claim in the
   summary line below is false. */
if (TZ) {
  const { parseLocalDate } = createRequire(import.meta.url)(path.join(out, 'local-date.js'));
  let naive = 1;
  const year = run(365);
  for (let i = 1; i < year.length; i++) {
    const diff = (parseLocalDate(year[i - 1]).getTime() - parseLocalDate(year[i]).getTime()) / 86_400_000;
    if (diff === 1) naive++;
    else break;
  }
  if (naive === 365) problems.push(`${TZ}: đồng hồ không đổi giờ trong năm này — ca này không chứng minh gì`);
}

/* ── 1b: frozen days, and the gap a freeze would have to cover ── */
for (const [label, dates, frozen, wantCount, wantToday] of FREEZE_CASES) {
  const got = streakFrom(dates, TODAY, frozen);
  const where = TZ ? ` [${TZ}]` : '';
  if (got.count !== wantCount) problems.push(`${label}${where}: đếm ra ${got.count}, đáng lẽ ${wantCount}`);
  if (got.loggedToday !== wantToday) {
    problems.push(`${label}${where}: loggedToday=${got.loggedToday}, đáng lẽ ${wantToday}`);
  }
}

{
  const eq = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  const cases = [
    ['ghi hôm nay thì không có lỗ hổng', run(3), [], []],
    ['ghi hôm qua thì hôm qua chưa phải lỗ hổng', run(3, 1), [], []],
    ['lỡ đúng hôm qua', run(3, 2), [], [day(TODAY_PARTS, 1)]],
    ['lỡ hai ngày', run(3, 3), [], [day(TODAY_PARTS, 2), day(TODAY_PARTS, 1)]],
    ['ngày đã bù thì không đòi bù lại', run(3, 2), [day(TODAY_PARTS, 1)], []],
    ['chưa từng ghi gì thì không có gì để bù', [], [], []],
  ];
  for (const [label, dates, frozen, want] of cases) {
    const got = missedDates(dates, TODAY, frozen);
    if (!eq(got, want)) {
      problems.push(`lỗ hổng — ${label}: ra [${got.join(', ')}], đáng lẽ [${want.join(', ')}]`);
    }
  }
}

/* ── 1c: the guard must not spend a freeze that cannot save anything ── */
{
  const guard = read('src/hooks/use-streak-guard.ts').replace(/\/\*[\s\S]*?\*\//g, '');
  if (!/missed\.length > held/.test(guard)) {
    problems.push(
      'use-streak-guard: không thấy điều kiện chặn khi số ngày lỡ nhiều hơn số bảo hiểm đang có — ' +
        'sẽ đốt coin để đổi lấy đúng con số không, và người dùng mở app ra thấy chuỗi bằng 0 lẫn ngăn kéo rỗng',
    );
  }
  const FREEZE_SQL = 'supabase/migrations/20260814120000_streak_freeze.sql';
  if (!/use_streak_freeze/.test(readRepo(FREEZE_SQL))) {
    problems.push('không tìm thấy hàm use_streak_freeze trong migration');
  }
  const sqlFreeze = readRepo(FREEZE_SQL);
  if (!/CURRENT_DATE - 3|CURRENT_DATE-3/.test(sqlFreeze)) {
    problems.push(
      'use_streak_freeze: thiếu cửa sổ ngày — mua bảo hiểm sau khi chuỗi đã chết mà vẫn cứu được ' +
        'thì chuỗi không còn nghĩa gì',
    );
  }
  if (!/CREATE UNIQUE INDEX[\s\S]*?used_on/.test(sqlFreeze)) {
    problems.push('thiếu unique index (user, used_on) — hai lần mở app cùng lúc sẽ tiêu hai bảo hiểm cho một ngày');
  }
}

/* ── 1d: the streak has to be refreshed by the thing that changes it ──

   `mascot_streak` is derived from `daily_logs`, and for one release nothing
   invalidated it: logging the first meal of the day left the flame grey in the
   header and Koa wearing the worried face all evening, for somebody who had
   already logged. The number was right in the database and wrong on the screen.

   The cause was two hand-maintained lists of query keys — a hook for screens and
   a plain function for mutation callbacks — which the file itself already warned
   had drifted once before. So the rule is not "remember to add the key", it is
   that there is only one list. */
if (!TZ) {
  const keys = read('src/lib/today-keys.ts');
  if (!/'mascot_streak'/.test(keys)) {
    problems.push(
      "today-keys: thiếu 'mascot_streak' — ghi bữa đầu tiên trong ngày xong, ngọn lửa vẫn xám " +
        'và Koa vẫn giữ mặt lo, cho người đã ghi rồi',
    );
  }
  for (const f of ['src/hooks/useTodayData.ts', 'src/hooks/use-nutrition.ts']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    // anchored on the *definition*: an unanchored match found a call site
    const block = src.match(/function (useInvalidateToday|invalidateLogQueries)\([\s\S]*?\n\}/);
    if (!block) {
      problems.push(`${f}: không tìm thấy hàm làm mới hôm nay`);
      continue;
    }
    if (!/todayKeys\(/.test(block[0])) {
      problems.push(`${f}: không dùng todayKeys — danh sách khoá lại có hai bản, và hai bản đã lệch nhau hai lần`);
    }
    const literals = [...block[0].matchAll(/queryKey: \[/g)].length;
    if (literals > 0) {
      problems.push(`${f}: còn ${literals} khoá viết thẳng trong hàm làm mới — phải nằm trong today-keys`);
    }
  }
}

/* ── 2: the same cases, from somewhere the clocks move ──
   A year of consecutive days crosses every transition a timezone has, so a
   `Math.round(diff) === 1` that cannot survive a 23- or 25-hour day comes out
   short without anybody having to know the transition dates. Lord Howe is in
   the list because its shift is **30 minutes**, which is the case a fix aimed
   at whole hours quietly misses. */
if (!TZ) {
  for (const zone of ['America/Santiago', 'Pacific/Auckland', 'Australia/Lord_Howe']) {
    try {
      const res = execFileSync('node', [fileURLToPath(import.meta.url)], {
        cwd: NATIVE,
        env: { ...process.env, TZ: zone, STREAK_TZ: zone },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (!/OK/.test(res)) problems.push(`chạy lại ở ${zone} không báo OK`);
    } catch (e) {
      problems.push(`múi giờ ${zone}: ${((e.stdout ?? '') + (e.stderr ?? '')).trim()}`);
    }
  }
}

/* ── 3: every milestone inside the window ── */
const extras = read('src/hooks/use-extras.ts');
const defs = [...extras.matchAll(/\{ key: '([\w]+)', type: '([\w]+)'[^}]*?requirement: (\d+)/g)].map(
  (m) => ({ key: m[1], type: m[2], requirement: Number(m[3]) }),
);
if (!defs.some((d) => d.type === 'streak')) {
  problems.push('không đọc được mốc streak nào trong AWARD_DEFINITIONS');
}
for (const d of defs.filter((d) => d.type === 'streak')) {
  if (d.requirement > STREAK_WINDOW) {
    problems.push(
      `${d.key} cần ${d.requirement} ngày mà cửa sổ truy vấn chỉ ${STREAK_WINDOW} — ` +
        'huy hiệu này không ai lấy được, và trông như lỗi của người dùng chứ không phải của app',
    );
  }
}

/* ── 4: every award says something, in both languages ── */
const allKeys = [...extras.matchAll(/\{ key: '([\w]+)', type:/g)].map((m) => m[1]);
const text = read('src/lib/gamification-i18n.ts');
for (const key of allKeys) {
  const block = text.match(new RegExp(`\\b${key}: \\{[\\s\\S]*?\\n  \\},`));
  if (!block) {
    problems.push(`${key}: không có chữ trong AWARD_TEXT — grant() sẽ đọc undefined.title`);
    continue;
  }
  for (const lang of ['en', 'vi']) {
    if (!new RegExp(`${lang}: '[^']+'`).test(block[0])) {
      problems.push(`${key}: thiếu bản ${lang}`);
    }
  }
}

/* ── 5: nobody counts days on their own again ── */
for (const f of ['src/hooks/use-extras.ts', 'src/hooks/use-mascot-room.ts']) {
  const src = read(f);
  if (!/streakFrom/.test(src)) problems.push(`${f}: không dùng streakFrom`);
  if (/864[_]?00[_]?000/.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))) {
    problems.push(`${f}: vẫn tự cộng trừ ngày — chuỗi ngày phải đếm ở lib/streak.ts`);
  }
}

/* ── self-test: the cases have to be sharp enough for the bug that shipped ── */
if (!TZ) {
  /** the medal engine's own copy, exactly as it was */
  const shipped = (datesDesc, today) => {
    if (datesDesc.length === 0) return { count: 0, loggedToday: false };
    let streak = 1;
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yStr = y.toISOString().slice(0, 10);
    if (datesDesc[0] === today || datesDesc[0] === yStr) {
      for (let i = 1; i < datesDesc.length; i++) {
        const diff = (new Date(datesDesc[i - 1]).getTime() - new Date(datesDesc[i]).getTime()) / 86400000;
        if (Math.round(diff) === 1) streak++;
        else break;
      }
    }
    return { count: streak, loggedToday: datesDesc[0] === today };
  };
  const caught = CASES.some(([, dates, count]) => shipped(dates, TODAY).count !== count);
  if (!caught) problems.push('tự kiểm: bản đếm cũ (khởi tạo bằng 1) vẫn qua được bảng ca');

  const window35 = defs.filter((d) => d.type === 'streak' && d.requirement > 35);
  if (window35.length === 0) {
    problems.push('tự kiểm: không còn mốc nào vượt 35 nên luật cửa sổ chưa chứng minh được gì');
  }
}

if (problems.length) {
  console.log('chuỗi ngày:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `chuỗi ngày OK — ${CASES.length} ca đếm đúng, ${FREEZE_CASES.length} ca có bảo hiểm ` +
    '(bù được lỗ hổng, không bù được chính hôm nay), lỗ hổng tính đúng ở 6 ca; ' +
    'guard từ chối tiêu khi lỗ hổng lớn hơn số đang có, SQL có cửa sổ ngày và unique index; ' +
    'chạy lại nguyên bảng ở 3 múi giờ có đổi giờ (gồm Lord Howe lệch 30 phút) nên một năm liền vẫn ra 365; ' +
    `${defs.filter((d) => d.type === 'streak').length} mốc streak đều nằm trong cửa sổ ${STREAK_WINDOW} ngày ` +
    `(cửa sổ cũ 35 sẽ chặn ${defs.filter((d) => d.type === 'streak' && d.requirement > 35).length} mốc); ` +
    `${allKeys.length} huy hiệu đều có chữ ở cả hai ngôn ngữ; ` +
    'và bản đếm cũ khởi tạo bằng 1 vẫn bị bảng ca bắt',
);
