/**
 * Fail on a bare date string used as a `timestamptz` range filter.
 *
 * ── the bug this exists for ──
 *
 * `` .gte('waketime', `${dateStr}T00:00:00`) `` looks like it asks for local
 * midnight and does not. A timestamp string with no zone is read in the
 * *server's* zone, which is UTC, so at UTC+7 the window runs 07:00 today to
 * 06:59 tomorrow in local terms. A night whose `waketime` is before seven, a
 * breakfast at six, a biometric sample at six — all land in the wrong day.
 *
 * It was found once in the nutrition diary, fixed there, and left standing in
 * three other hooks for weeks. Nothing about the code said the other three were
 * wrong: they read exactly like the fixed one used to. That is what this file
 * is for — the correct form (`localDayRangeISO`) is not more obvious than the
 * broken one, so the broken one has to stop compiling.
 *
 * ── what counts as a violation ──
 *
 * A template literal containing `T00:00:00` or `T23:59` passed as the second
 * argument of a Supabase range filter (`gte`/`gt`/`lte`/`lt`).
 *
 * Deliberately narrow. `new Date(`${d}T00:00:00`)` is the *correct* way to
 * parse a date string as local midnight and appears in `local-date.ts` on
 * purpose, so parsing is not flagged — only the comparison. A rule that cried
 * about the helper implementing the fix would be turned off within a week.
 *
 * Comparing a plain `YYYY-MM-DD` against a real `date` column is also fine
 * (`daily_logs.date`), and this rule cannot tell a `date` column from a
 * `timestamptz` one, so it does not try. It catches the one shape that is
 * always wrong.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

/** `.gte('col', `…T00:00:00…`)` — the range filter, then a bare-date template */
const BAD = /\.(gte|gt|lte|lt)\(\s*(['"])[^'"]+\2\s*,\s*`[^`]*T(?:00:00:00|23:59)[^`]*`/g;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/**
 * Prove the pattern still matches the bug before trusting it on the codebase.
 *
 * A check that has quietly stopped matching anything reports a clean run, which
 * is indistinguishable from a clean codebase and considerably worse. The first
 * string is the code as it was written in `useTodayData.ts`; the second and
 * third are the shapes that must NOT be flagged.
 */
const SELF_TEST = [
  ["      .gte('waketime', `${dateStr}T00:00:00`)", true],
  ["      .lt('date_time', `${dateStr}T23:59:59.999`)", true],
  ['  const start = new Date(`${dateStr}T00:00:00`);', false],
  ["      .gte('waketime', day.start)", false],
  ["      .eq('date', dateStr)", false],
];
for (const [line, shouldFlag] of SELF_TEST) {
  const flagged = new RegExp(BAD.source).test(line);
  if (flagged !== shouldFlag) {
    console.error(
      `tự kiểm tra hỏng: ${JSON.stringify(line)} đáng lẽ ${shouldFlag ? 'bị bắt' : 'được bỏ qua'}`,
    );
    process.exit(1);
  }
}

const SERVER_SELF = [
  ['edge function tự tính ngày UTC — bị bắt', () => {
    const bad = 'const today = new Date().toISOString().split("T")[0];';
    return /new Date\(\)[\s\S]{0,40}?toISOString\(\)\s*\.\s*split\(["']T["']\)\[0\]/.test(bad);
  }],
  ['có nhận date từ body (destructure) — không báo oan', () => {
    const good = 'const { lang = "vi", date } = await req.json();\nconst today = date ?? new Date().toISOString().split("T")[0];';
    return /const\s*\{[^}]*\bdate\b[^}]*\}\s*=\s*(?:await\s*)?req\.json/.test(good);
  }],
  ['có nhận body?.date — không báo oan', () => /body[?.]*\.date/.test('const today = body?.date ?? fallback;')],
];
const serverMissed = SERVER_SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (serverMissed.length) {
  console.error(`phép tự kiểm (server) hỏng — ${serverMissed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

const hits = [];

/*
  ── the other half: a server guessing somebody's calendar day ──

  Everything above is about the client. The edge functions had the same bug from
  the opposite side, and nothing was watching them.

      const today = new Date().toISOString().split("T")[0];

  On a Deno host that expression is the date **in UTC**, always. For a caller in
  Vietnam (UTC+7) it is yesterday's date every morning between midnight and
  seven — so `ai-coach` fetched the wrong day's log and discussed the wrong
  numbers with complete confidence, every single morning, for anybody east of
  Greenwich.

  There is no way to derive it server-side: only the device knows what day it is
  where the person is standing. So an edge function that needs a calendar date
  must take one from the request. Computing one from its own clock is allowed
  only as a fallback for an older client — which is exactly what "must also read
  a date from the body" tests for.
*/
{
  const FUNCS = path.join(NATIVE, '..', 'supabase', 'functions');
  const UTC_DATE = /new Date\(\)[\s\S]{0,40}?toISOString\(\)\s*\.\s*(?:split\(["']T["']\)\[0\]|slice\(0,\s*10\))/;
  /*
     Reading the date off the request counts however it is written. Two of these
     functions destructure it —

         const { meal_type, lang = "vi", date } = await req.json();

     — and a first version of this rule only recognised `body?.date`, so it
     reported both of them as guessing when both were already correct. A rule
     whose first run is two false positives out of three teaches people to
     ignore it. */
  const FROM_BODY =
    /body[?.]*\.date|const\s*\{[^}]*\bdate\b[^}]*\}\s*=\s*(?:await\s*)?req\.json|week_start|body\?\.\w*[Ww]eek/;

  for (const dir of readdirSync(FUNCS)) {
    const file = path.join(FUNCS, dir, 'index.ts');
    if (!existsSync(file)) continue;
    const code = readFileSync(file, 'utf8');
    if (!UTC_DATE.test(code)) continue;
    if (FROM_BODY.test(code)) continue;
    hits.push({
      where: `supabase/functions/${dir}/index.ts — tự tính ngày lịch từ đồng hồ của server`,
      code:
        'đó là ngày UTC. Với người dùng ở UTC+7, từ nửa đêm tới 7h sáng nó là NGÀY HÔM QUA. ' +
        'Ngày phải do thiết bị gửi lên, vì chỉ thiết bị mới biết hôm nay là ngày nào ở chỗ người đó đứng.',
    });
  }
}

for (const file of walk(SRC)) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(BAD)) {
    hits.push({
      where: `${path.relative(NATIVE, file)}:${text.slice(0, m.index).split('\n').length}`,
      code: m[0].trim(),
    });
  }
}

if (hits.length) {
  console.error('cửa sổ ngày dùng chuỗi ngày trần trên cột timestamptz:\n');
  for (const h of hits) console.error(`  ${h.where}\n    ${h.code}\n`);
  console.error('dùng localDayRangeISO(dateStr) — xem đầu tools/day-window.mjs');
  process.exit(1);
}

console.log(
  `cửa sổ ngày OK — ${SELF_TEST.length} ca tự kiểm tra đúng, không chỗ nào dùng chuỗi trần; ` +
    'và không edge function nào tự tính ngày lịch từ đồng hồ UTC của server',
);
