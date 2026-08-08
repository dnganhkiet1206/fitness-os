/**
 * That today's insight is computed once, in one place, and says so honestly.
 *
 * ── what this replaced ──
 *
 * `SmartTipsCard` on the dashboard called the model on tap and dropped the
 * answer when the card unmounted. Press it twice and you got two different
 * readings of the same unchanged day — a paid call each time, and advice that
 * looked improvised because it was. It has moved to the Health Assistant as
 * "Insight hôm nay", and the dashboard card is a door into it.
 *
 * ── why these particular rules ──
 *
 * Every failure here is either invisible or expensive, and mostly both:
 *
 *   - **two callers.** The moment a second component calls the hook with
 *     fetching enabled, one day has two answers and whichever rendered last
 *     wins. Nothing breaks; the app simply contradicts itself between two
 *     screens.
 *   - **a key without the date.** Cache one insight forever and it is
 *     yesterday's advice tomorrow, presented as today's. The bug appears
 *     overnight, on somebody else's phone.
 *   - **a key without the language.** Switch to English and read Vietnamese
 *     tips, because the cache does not know they differ.
 *   - **an error rendered as emptiness.** "Hôm nay chưa có gì nổi bật" when
 *     the request actually failed is the app claiming it looked. That is the
 *     one failure here that is a lie rather than a bug.
 *   - **a `staleTime` that is not infinite.** A refetch on focus turns one
 *     call a day into one call per glance at the screen.
 *   - **a key that is only the date.** The insight then freezes at whatever
 *     the day looked like the first time the page was opened — which is the
 *     morning, when there is least to look at. Log a workout at six and it
 *     still describes an empty day.
 *   - **a key that is too fine.** The fix for the one above, overdone: put
 *     `kcal` in the key and every meal is a model call. The stamp has to be
 *     booleans, and the check has to say so, because "make it more responsive"
 *     is the natural next edit and it is the expensive one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const HOOK = 'src/hooks/use-smart-nudges.ts';
/** The page that displays the insight, and so the only one allowed to fetch it. */
const OWNER = 'src/app/(tabs)/assistant.tsx';
/** The dashboard card, which may read the cache and must never fetch. */
const DOOR = 'src/components/ascnd/today-widgets.tsx';

const problems = [];
const hook = strip(read(HOOK));

// ── the cache key carries everything that changes the answer ──
const key = hook.match(/queryKey: \[([^\]]*)\]/)?.[1] ?? '';
for (const [what, needle, why] of [
  ['ngày', 'date', 'thiếu ngày thì hôm nay đọc lại lời khuyên của hôm qua'],
  ['người dùng', 'user?.id', 'thiếu người dùng thì hai tài khoản dùng chung một insight'],
  ['ngôn ngữ', 'lang', 'thiếu ngôn ngữ thì đổi sang tiếng Anh vẫn đọc tiếng Việt'],
  ['dấu vân ngày', 'stamp', 'thiếu nó thì insight đóng băng ở lúc mở trang đầu tiên trong ngày, thường là buổi sáng khi chưa có gì'],
]) {
  if (!key.includes(needle)) problems.push(`use-smart-nudges: queryKey thiếu ${what} — ${why}`);
}

/*
  ── the stamp is coarse, and that is the expensive thing to get wrong ──

  Three booleans can flip three times, so a day costs at most four calls. A raw
  value in the same place — `kcal`, `steps`, a minute count — is a model call
  every time it moves, which on calories is every meal and on steps is all day.

  Checked by shape: the stamp's expression must compare, and must not carry a
  bare numeric field through. "Make it more responsive" is the natural next
  edit here and it is the one that quietly multiplies the bill.
*/
{
  const stampExpr = hook.match(/const stamp =([\s\S]*?);\n/)?.[1] ?? '';
  if (!stampExpr) {
    problems.push('use-smart-nudges: không tìm thấy biểu thức `stamp`');
  } else {
    const flags = [...stampExpr.matchAll(/> 0 \? '/g)].length;
    if (flags < 3) {
      problems.push(`use-smart-nudges: stamp chỉ có ${flags} cờ boolean — cần ít nhất 3 (ngủ, ăn, tập)`);
    }
    /* Any interpolation that is not a comparison is a raw value leaking in. */
    for (const m of stampExpr.matchAll(/Number\(log\?\.(\w+)\)(\s*[><=]|\s*\?)?/g)) {
      if (!m[2] || m[2].trim() === '?') {
        problems.push(
          `use-smart-nudges: stamp mang thẳng giá trị "${m[1]}" chứ không phải cờ — ` +
            'mỗi lần con số đó đổi là một lần gọi model',
        );
      }
    }
    for (const field of ['sleep_duration_min', 'kcal', 'workout_count']) {
      if (!stampExpr.includes(field)) {
        problems.push(`use-smart-nudges: stamp không theo dõi "${field}" — thay đổi ở đó sẽ không làm insight tươi lại`);
      }
    }
  }
}

// ── one call a day, not one per glance ──
if (!/staleTime: Infinity/.test(hook)) {
  problems.push('use-smart-nudges: staleTime không phải Infinity — mỗi lần mở lại trang là một lần gọi model nữa');
}
if (!/gcTime:/.test(hook)) {
  problems.push('use-smart-nudges: không đặt gcTime — cache bị dọn giữa ngày thì lại gọi lại');
}
/* The failure has to reach the caller. Swallowing it into `[]` is what turns
   "could not look" into "nothing to suggest". */
if (!/if \(!res\.ok\) throw/.test(hook)) {
  problems.push('use-smart-nudges: lỗi không được ném ra — màn hình sẽ nói "không có gợi ý" trong khi thật ra chưa đọc được');
}

/*
  ── exactly one fetching caller ──

  `useSmartNudges(false)` is the read-only form: it reads whatever the day's
  cache holds and never requests. Any other call site is a second place asking
  the model the same question.
*/
const callers = [];
for (const f of [OWNER, DOOR, 'src/app/(tabs)/index.tsx']) {
  for (const m of strip(read(f)).matchAll(/useSmartNudges\(([^)]*)\)/g)) {
    callers.push({ file: f, arg: m[1].trim() });
  }
}
const fetching = callers.filter((c) => c.arg !== 'false');
if (fetching.length !== 1) {
  problems.push(
    `có ${fetching.length} chỗ gọi useSmartNudges có bật fetch (${fetching.map((c) => c.file).join(', ') || 'không có chỗ nào'}) — ` +
      'phải đúng một, nếu không thì một ngày có hai câu trả lời',
  );
} else if (fetching[0].file !== OWNER) {
  problems.push(`chỗ gọi có fetch là ${fetching[0].file}, phải là ${OWNER} — nơi hiển thị mới là nơi được gọi`);
}
if (!callers.some((c) => c.file === DOOR && c.arg === 'false')) {
  problems.push(`${DOOR}: thẻ ở dashboard phải gọi useSmartNudges(false) — nó chỉ đọc cache, không được tự gọi model`);
}

// ── the door leads somewhere, and no longer computes ──
{
  const door = strip(read(DOOR));
  if (!/router\.push\('\/assistant'\)/.test(door)) {
    problems.push(`${DOOR}: thẻ không còn dẫn sang /assistant — nó là cánh cửa, cửa phải mở ra chỗ nào đó`);
  }
  if (/callEdge|useMutation/.test(door)) {
    problems.push(`${DOOR}: vẫn tự gọi edge function — insight chỉ được tính ở một chỗ`);
  }
}

/*
  ── the three states are distinguishable on screen ──

  Loading, failed and genuinely empty have to read differently. Collapsing
  failed into empty is the one failure in this file that is a lie: the app says
  it looked and found nothing, when it did not look.
*/
{
  const owner = read(OWNER);
  for (const [what, re] of [
    ['đang tải', /insight\.isPending/],
    ['lỗi', /insight\.isError/],
    ['rỗng thật', /!insight\.data\?\.length/],
  ]) {
    if (!re.test(owner)) problems.push(`${OWNER}: không phân biệt trạng thái "${what}"`);
  }
  if (!/refetch\(\)/.test(owner)) {
    problems.push(`${OWNER}: trạng thái lỗi không cho thử lại — một lần hỏng là hỏng cả ngày`);
  }
  /* The error copy must not claim there is nothing to say. */
  const errText = owner.match(/Chưa đọc được hôm nay[^']*/)?.[0];
  if (!errText) {
    problems.push(`${OWNER}: câu báo lỗi phải nói rõ là chưa đọc được, không được nói "không có gợi ý"`);
  }
}

/**
 * The self-test.
 *
 * The caller-count rule is the one worth proving: it is the rule that would
 * catch the regression, and the wrong version — a second component calling the
 * hook plainly — is the one that reads more naturally at the call site.
 */
const selfTest = [
  ['hai chỗ cùng fetch', () => {
    const fake = [{ file: 'a', arg: '' }, { file: 'b', arg: '' }].filter((c) => c.arg !== 'false');
    return fake.length !== 1;
  }],
  ['thẻ cửa tự fetch', () => {
    const fake = [{ file: DOOR, arg: '' }];
    return !fake.some((c) => c.file === DOOR && c.arg === 'false');
  }],
  ['queryKey thiếu ngày bị bắt', () => !"['smart_nudges', user?.id, lang]".includes('date')],
  ['stamp mang giá trị thô bị bắt', () => {
    const bad = "const stamp = String(Number(log?.kcal)) + (Number(log?.steps) > 0 ? 's' : '-');\n";
    const expr = bad.match(/const stamp =([\s\S]*?);\n/)?.[1] ?? '';
    const leaks = [...expr.matchAll(/Number\(log\?\.(\w+)\)(\s*[><=]|\s*\?)?/g)].filter((m) => !m[2] || m[2].trim() === '?');
    return leaks.length > 0;
  }],
];
const missed = selfTest.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join(', ')}, đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('insight hôm nay sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `insight hôm nay OK — một chỗ gọi model (${OWNER.split('/').pop()}), thẻ dashboard chỉ đọc cache và dẫn sang /assistant; ` +
    'queryKey mang ngày + người dùng + ngôn ngữ + dấu vân ngày (3 cờ, tối đa 4 lần gọi/ngày); ' +
    'ba trạng thái tải/lỗi/rỗng phân biệt được và lỗi thì cho thử lại',
);
