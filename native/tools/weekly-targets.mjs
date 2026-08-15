/**
 * The weekly challenges measure the target they promise, and every screen
 * agrees where a week starts.
 *
 * ── bug one: "your target" was somebody else's number ──
 *
 * Three challenges counted against a literal typed into `use-extras.ts`:
 * sleep at 360 minutes, protein at 100 g, water at 2,000 ml.
 *
 * What the user reads underneath them says something different:
 *
 *     protein_7  "Đạt mục tiêu protein 7 ngày"  / "Hit your protein target"
 *     water_7    "Đạt mục tiêu nước 7 ngày"     / "Hit your water target"
 *     sleep_7    "Ngủ đủ giấc 7 ngày liên tiếp" / "Sleep enough"
 *
 * So somebody whose profile holds 8 hours, 150 g and 3,500 ml was told they had
 * hit *their* target on a day they slept six hours, ate 100 g and drank two
 * litres. Not a generous threshold — a false statement about them, made from
 * the one table that already stored the right answer.
 *
 * `lib/macro-targets.ts` exists for exactly this. Its own header says a target
 * computed twice is a target that will contradict itself, and `use-extras.ts`
 * had never imported it.
 *
 * ── bug two: the Sunday nobody sees ──
 *
 * Three separate week-start expressions. Two were right. The third,
 * `smart-goals.tsx`, was `getDate() - getDay() + 1` — and `getDay()` is
 * Sunday-first, so on a Sunday that resolves to **tomorrow**. "This week" ran
 * from tomorrow's Monday to the following Sunday: entirely in the future,
 * holding nothing, with the calorie advice beneath it quietly reading a
 * week-old window.
 *
 * It is right six days out of seven and wrong on the day people sit down to
 * look at their week — and correct again by Monday morning, so there is never
 * anything left to catch.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

/* ── 1. every week-start agrees, on all seven days ── */
{
  const out = mkdtempSync(path.join(tmpdir(), 'weekstart-'));
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/local-date.ts', '--ignoreConfig', '--outDir', out,
       '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* emits regardless */
  }
  const { weekStartOf } = createRequire(import.meta.url)(path.join(out, 'local-date.js'));

  /* A full week, built in local time so the fixture cannot drift with the
     runner's zone — only the code under test is allowed to care. */
  for (let i = 0; i < 7; i++) {
    const d = new Date(2026, 7, 10 + i, 14, 30); // Mon 10 Aug 2026 … Sun 16th
    const ws = weekStartOf(d);
    if (ws.getDay() !== 1) {
      problems.push(`weekStartOf(${d.toDateString()}) ra ${ws.toDateString()} — không phải thứ Hai`);
    }
    if (ws.getTime() > d.getTime()) {
      problems.push(
        `weekStartOf(${d.toDateString()}) ra ${ws.toDateString()} — nằm ở TƯƠNG LAI, ` +
          'nên "tuần này" rỗng và màn hình lặng lẽ đọc cửa sổ của tuần trước',
      );
    }
    const ageDays = Math.round((d.setHours(0, 0, 0, 0) - ws.getTime()) / 86_400_000);
    if (ageDays < 0 || ageDays > 6) {
      problems.push(`weekStartOf(${new Date(d).toDateString()}) lệch ${ageDays} ngày — ngoài khoảng 0–6`);
    }
  }

  /* Named, because Sunday is the one day of seven the broken expression got
     wrong and therefore the only one worth stating out loud. */
  const sunday = new Date(2026, 7, 16, 20, 0);
  const ws = weekStartOf(sunday);
  if (ws.getDate() !== 10 || ws.getMonth() !== 7) {
    problems.push(
      `Chủ nhật 16/8 phải thuộc tuần bắt đầu 10/8, nhưng ra ${ws.toDateString()} — ` +
        'đây đúng là ngày duy nhất trong bảy ngày mà công thức cũ sai',
    );
  }
}

/* ── 2. nobody keeps a private copy of the arithmetic ── */
{
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', 'src'],
    { cwd: NATIVE, encoding: 'utf8' },
  )
    .split('\n')
    .filter((f) => /\.tsx?$/.test(f) && f !== 'src/lib/local-date.ts');

  for (const f of files) {
    let src;
    try {
      src = strip(read(f));
    } catch {
      continue;
    }
    /* The shape of all three copies: shifting a date by its own `getDay()`. */
    if (/getDate\(\)\s*[-+][^;\n]*getDay\(\)/.test(src)) {
      problems.push(
        `${f}: tự tính đầu tuần bằng getDay() — dùng weekStartOf ở lib/local-date.ts. ` +
          'Ba bản sao từng tồn tại và một bản sai đúng vào Chủ nhật',
      );
    }
  }
}

/* ── 3. the challenges read the profile, not a literal ── */
{
  const src = strip(read('src/hooks/use-extras.ts'));

  if (!src.includes('macroTargetsFor')) {
    problems.push(
      'use-extras.ts: không dùng macroTargetsFor — thử thách đạm nói "đạt mục tiêu protein" ' +
        'trong khi đo bằng một con số gõ thẳng vào file này',
    );
  }

  /* The three shipped literals, named exactly. Anchored to the comparison so a
     `360` appearing elsewhere as a duration is not mistaken for this. */
  const shipped = [
    [/sleep_duration_min[^;]*>=\s*360\b/, 'giấc ngủ', '360 phút (6h) trong khi hồ sơ mặc định 8h'],
    [/protein_g[^;]*>=\s*100\b/, 'đạm', '100 g trong khi macroTargetsFor nói 150'],
    [/values\(\)[^;]*>=\s*2000\b/, 'nước', '2000 ml, bỏ qua hẳn mục tiêu trong hồ sơ'],
  ];
  for (const [re, what, why] of shipped) {
    if (re.test(src)) {
      problems.push(
        `use-extras.ts: thử thách ${what} vẫn đo bằng ngưỡng gõ cứng — ${why}. ` +
          'Nhãn người dùng đọc hứa "mục tiêu của bạn", nên đây là một câu nói SAI về họ ' +
          'lấy từ chính bảng đã có câu trả lời đúng',
      );
    }
  }

  /* And the profile is actually read — a target variable computed from nothing
     would satisfy the checks above while changing no behaviour. */
  if (!/from\('profiles'\)/.test(src)) {
    problems.push('use-extras.ts: không đọc bảng profiles — các ngưỡng "theo mục tiêu" lấy ở đâu ra?');
  }
}

if (problems.length) {
  console.log('mục tiêu tuần:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  if (problems.length > 10) console.log(`  … và ${problems.length - 10} lỗi nữa`);
  process.exit(1);
}

console.log(
  'mục tiêu tuần OK — đầu tuần tính ở một chỗ duy nhất và đúng cả bảy ngày, kể cả Chủ nhật ' +
    '(bản cũ ở smart-goals.tsx ra thứ Hai NGÀY MAI, nên mỗi Chủ nhật cột tuần mới nhất rỗng và ' +
    'lời khuyên calo lặng lẽ đọc cửa sổ tuần trước — đúng sáu trên bảy ngày nên không ai bắt được); ' +
    'không file nào còn tự tính bằng getDay(); và ba thử thách ngủ/đạm/nước đo theo mục tiêu ' +
    'trong hồ sơ chứ không phải 360 phút, 100 g, 2000 ml gõ thẳng — nhãn người dùng đọc hứa ' +
    '"đạt mục tiêu của bạn", nên ngưỡng gõ cứng là một câu nói sai về chính họ',
);
