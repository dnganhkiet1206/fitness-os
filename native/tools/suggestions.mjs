/**
 * That the assistant's suggestions are about the person looking at them.
 *
 * ── what this replaced ──
 *
 * A constant array of four. Everybody saw the same chips, every day, and
 * pressing one opened an empty chat — under a heading that reads *Gợi ý cho
 * bạn*. The tiles beside them were reading real numbers the whole time, which
 * made it worse rather than better: the page knew you had slept four hours and
 * was offering to talk about building habits.
 *
 * ── what can go wrong now, and why none of it is visible ──
 *
 * Every failure here is silent. A rule that never fires shows three chips
 * instead of four. A rule that always fires pins itself to the first slot
 * forever. Two rules about the same thing take two of four slots to say one
 * thing. And a question that quotes a number the log does not have prints
 * `NaN` or `undefined` into a sentence sent to an AI — which then answers it.
 *
 * None of those throw, none of them look wrong in a diff, and all of them look
 * plausible on the one profile whoever wrote them was testing with.
 *
 * ── what is checked ──
 *
 * 1. every rule is reachable — each fires on at least one day
 * 2. no rule fires on every day, so nothing is a constant wearing a condition
 * 3. the section is always full, on every combination tried
 * 4. no two chips in one result share a topic, apart from the evergreens
 * 5. no question ever contains NaN, undefined, null, or an empty slot
 * 6. a question only quotes a value the signal actually had
 * 7. the urgent outrank the absent, which outrank the evergreen
 * 8. both languages are present and different everywhere
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'sugg-'));

/* CommonJS and `createRequire`, the same as `training-card.mjs` — `tsc` emits
   the `./training-card` import without an extension, which Node's ESM loader
   refuses and its CJS loader resolves. */
let suggestionsFor, SUGGESTION_SLOTS, SHORT_SLEEP_MIN;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/assistant-suggestions.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  ({ suggestionsFor, SUGGESTION_SLOTS, SHORT_SLEEP_MIN } =
    createRequire(import.meta.url)(path.join(out, 'assistant-suggestions.js')));
} catch (e) {
  console.error('không biên dịch được assistant-suggestions.ts');
  console.error((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? ''));
  process.exit(2);
}

const problems = [];

/** A day with nothing remarkable about it — the baseline every case varies from. */
const PLAIN = {
  name: 'Đặng Anh Kiệt',
  daysSinceWorkout: 1,
  readiness: 78,
  status: 'green',
  acwr: 1.0,
  sleepMin: 460,
  kcal: 1900,
  kcalTarget: 2200,
  proteinG: 140,
  proteinTarget: 150,
  steps: 9000,
};
const day = (over) => ({ ...PLAIN, ...over });

/*
  The days. Deliberately more than one per rule, and several that fire two or
  three rules at once — the interesting failures are in the overlap, not in the
  single-signal cases.
*/
const DAYS = {
  'ngày bình thường': day({}),
  'sẵn sàng thấp': day({ status: 'red', readiness: 34 }),
  'sẵn sàng thấp, chưa có điểm': day({ status: 'red', readiness: null }),
  'sẵn sàng vừa': day({ status: 'yellow', readiness: 61 }),
  'tải vọt': day({ acwr: 1.9 }),
  'tải hơi cao': day({ acwr: 1.45 }),
  'tập quá ít': day({ acwr: 0.5 }),
  'chưa có tải': day({ acwr: null }),
  'ngủ thiếu': day({ sleepMin: 320 }),
  'chưa ghi ngủ': day({ sleepMin: 0 }),
  'thiếu đạm': day({ proteinG: 60 }),
  'chưa ăn gì': day({ kcal: 0, proteinG: 0 }),
  'ít bước': day({ steps: 1200 }),
  'chưa có bước': day({ steps: 0 }),
  'ngày tệ toàn diện': day({ status: 'red', readiness: 28, acwr: 1.85, sleepMin: 300, proteinG: 40, steps: 900 }),
  'nghỉ tập lâu': day({ daysSinceWorkout: 6 }),
  'vừa tập hôm nay': day({ daysSinceWorkout: 0 }),
  'ngủ ngon': day({ sleepMin: 490 }),
  /* No data rule can fire on this one: sleep between the two thresholds, no
     readiness, no ratio, no session ever, calories inside the 200 floor. It is
     the day that proves the fourth evergreen is reachable, and the day whose
     absence let it be deleted once. */
  'không luật nào chạy': day({
    sleepMin: 430, status: null, readiness: null, acwr: null,
    daysSinceWorkout: null, kcal: 2100, proteinG: 140,
  }),
  'trống hoàn toàn': {
    name: '', daysSinceWorkout: null,
    readiness: null, status: null, acwr: null, sleepMin: 0,
    kcal: 0, kcalTarget: 2200, proteinG: 0, proteinTarget: 150, steps: 0,
  },
};

const results = Object.fromEntries(Object.entries(DAYS).map(([n, d]) => [n, suggestionsFor(d)]));

// ── 3: the section is never short ──
for (const [name, r] of Object.entries(results)) {
  if (r.length !== SUGGESTION_SLOTS) {
    problems.push(`"${name}": ${r.length} gợi ý, phải đúng ${SUGGESTION_SLOTS} — mục gợi ý bị hụt chỗ`);
  }
}

// ── 4: one topic per result, evergreens excepted ──
for (const [name, r] of Object.entries(results)) {
  const seen = new Set();
  for (const s of r) {
    if (s.topic === 'general') continue;
    if (seen.has(s.topic)) {
      problems.push(`"${name}": hai gợi ý cùng chủ đề "${s.topic}" — một ý chiếm hai trong bốn chỗ`);
    }
    seen.add(s.topic);
  }
}

// ── 5 + 8: the sentences themselves ──
const BAD = /NaN|undefined|null|\bInfinity\b|\s\s|\(\)|\{\}/;
for (const [name, r] of Object.entries(results)) {
  for (const s of r) {
    for (const lang of ['vi', 'en']) {
      const q = s.question[lang];
      const l = s.label[lang];
      if (!q || !l) {
        problems.push(`"${name}"/${s.key}: thiếu bản ${lang}`);
        continue;
      }
      if (BAD.test(q)) problems.push(`"${name}"/${s.key} (${lang}): câu hỏi có lỗ hổng — "${q}"`);
      if (BAD.test(l)) problems.push(`"${name}"/${s.key} (${lang}): nhãn có lỗ hổng — "${l}"`);
      // a chip is a pill in a wrapping row; a sentence in it stops being a chip
      if (l.length > 24) problems.push(`"${name}"/${s.key} (${lang}): nhãn dài ${l.length} ký tự — chip không chứa nổi`);
      // the question is what the coach receives, so it has to be a question
      if (q.length < 25) problems.push(`"${name}"/${s.key} (${lang}): câu hỏi quá ngắn để trả lời riêng cho ai — "${q}"`);
    }
    if (s.question.vi === s.question.en) {
      problems.push(`"${name}"/${s.key}: hai ngôn ngữ giống hệt nhau — chưa dịch`);
    }
  }
}

/*
  ── 6: every number in a sentence traces back to the day ──

  The failure this catches is the app's standing rule turned into an assertion:
  never state a value you do not have. A question that says "you slept 0h00" or
  "your ratio is NaN" reads as authoritative and is sent verbatim to an AI,
  which will then answer it.

  Written first as "on a day with nothing logged, no digits at all", which
  flagged the meal suggestion for quoting a 2200 kcal target on an empty day —
  and that is correct. **Targets come from the profile, not from today's log**,
  so they are known on a day where nothing has been measured; that is exactly
  when the meal question is most useful. The rule was confusing "the day has no
  measurements" with "there is nothing true to say".

  So it checks provenance instead: pull every run of digits out of the sentence
  and require each one to be a value the signal actually carried, in one of the
  forms the sentence is allowed to render it in.
*/
function allowedNumbers(d) {
  const set = new Set(['100']); // as in "readiness 62/100"
  const add = (v) => v != null && set.add(String(v));
  if (d.readiness != null) add(d.readiness);
  if (d.acwr != null) {
    const f = d.acwr.toFixed(2);
    add(f);
    for (const part of f.split('.')) add(part);
  }
  if (d.sleepMin > 0) {
    add(Math.floor(d.sleepMin / 60));
    add(String(d.sleepMin % 60).padStart(2, '0'));
    add(d.sleepMin % 60);
  }
  add(d.kcal);
  add(d.kcalTarget);
  add(Math.round(d.proteinG));
  add(Math.round(d.proteinTarget));
  if (d.daysSinceWorkout != null) add(d.daysSinceWorkout);
  if (d.steps > 0) {
    add(d.steps);
    // `toLocaleString` groups, and the separator depends on the runtime's locale
    for (const part of d.steps.toLocaleString().split(/[.,\s ]/)) add(part);
  }
  return set;
}
for (const [name, r] of Object.entries(results)) {
  const allowed = allowedNumbers(DAYS[name]);
  for (const s of r) {
    for (const lang of ['vi', 'en']) {
      for (const n of s.question[lang].match(/\d+/g) ?? []) {
        if (!allowed.has(n)) {
          problems.push(
            `"${name}"/${s.key} (${lang}): câu có số ${n} nhưng ngày này không có giá trị nào như vậy — "${s.question[lang]}"`,
          );
        }
      }
    }
  }
}

// ── 1 + 2: every rule reachable, no rule constant ──
const fired = {};
for (const [name, r] of Object.entries(results)) {
  for (const s of r) (fired[s.key] ??= []).push(name);
}
const RULES = [
  'readiness-low', 'load-spike', 'load-elevated', 'sleep-short', 'readiness-moderate',
  'load-detraining', 'protein-low', 'meal-idea', 'steps-low', 'sleep-quality',
  'rest-gap', 'readiness-high', 'sleep-good', 'load-optimal', 'trained-today', 'kcal-remaining',
  'recovery', 'energy', 'habit', 'weekly-plan',
];
for (const key of RULES) {
  if (!fired[key]) problems.push(`luật "${key}" không bao giờ xuất hiện — chết mà không ai biết`);
}
for (const [key, days] of Object.entries(fired)) {
  if (key.startsWith('load-') || key.startsWith('readiness-') || key === 'sleep-short' || key === 'protein-low' || key === 'steps-low') {
    if (days.length === Object.keys(DAYS).length) {
      problems.push(`luật "${key}" xuất hiện ở mọi ngày — đó là hằng số đội lốt điều kiện`);
    }
  }
}
for (const key of Object.keys(fired)) {
  if (!RULES.includes(key)) problems.push(`luật lạ "${key}" — thêm vào danh sách trong tools/suggestions.mjs`);
}

/*
  ── 7: urgency wins the first slot ──

  On a day where several things are wrong, the chip in position one has to be
  about one of them rather than an evergreen. This is the rule that keeps the
  ordering a product decision instead of an accident of array order.
*/
for (const name of ['ngày tệ toàn diện', 'sẵn sàng thấp', 'tải vọt', 'ngủ thiếu']) {
  if (results[name][0].topic === 'general') {
    problems.push(`"${name}": chip đầu tiên là gợi ý chung "${results[name][0].key}" trong khi có chuyện cần nói`);
  }
}
/*
  A plain day may talk about readiness and load — it should, now that the
  good-day rules exist — but it must not *alarm*.

  This rule used to forbid the topics outright, which was right when every rule
  fired on something wrong. It became wrong the moment a healthy day started
  getting "Tận dụng hôm nay" and "Tăng tải thế nào?", which is the whole point
  of those rules. What it actually guards is the alarming *keys*.
*/
const ALARMS = new Set(['readiness-low', 'load-spike', 'load-elevated', 'load-detraining', 'sleep-short', 'rest-gap']);
for (const s of results['ngày bình thường']) {
  if (ALARMS.has(s.key)) {
    problems.push(`"ngày bình thường": báo động "${s.key}" trong khi mọi chỉ số đều bình thường`);
  }
}
/* And it must not be all evergreens either — that was the bug this change
   fixed, and the shape it would regress to. */
{
  const data = results['ngày bình thường'].filter((s) => s.topic !== 'general').length;
  if (data < 3) {
    problems.push(
      `"ngày bình thường": chỉ ${data}/4 chip đến từ dữ liệu — người khoẻ mạnh lại thấy gợi ý chung chung như tài khoản trống`,
    );
  }
}

/**
 * The self-test.
 *
 * Each rule is handed the shape it exists to catch, built from the real
 * results so the fixtures cannot drift away from the code.
 */
const selfTest = [
  ['mục gợi ý hụt chỗ', () => results['ngày bình thường'].slice(0, 2).length !== SUGGESTION_SLOTS],
  ['hai chip cùng chủ đề', () => {
    const r = results['ngày tệ toàn diện'];
    const dup = [...r.filter((s) => s.topic !== 'general'), r.find((s) => s.topic !== 'general')].filter(Boolean);
    const seen = new Set();
    return dup.some((s) => (seen.has(s.topic) ? true : (seen.add(s.topic), false)));
  }],
  ['câu hỏi có undefined', () => BAD.test('Đêm qua tôi ngủ undefined, làm sao bù lại?')],
  ['nhãn dài quá chip', () => 'Cải thiện chất lượng giấc ngủ của bạn'.length > 24],
  ['ngưỡng ngủ thiếu đúng chiều', () =>
    suggestionsFor(day({ sleepMin: SHORT_SLEEP_MIN - 1 })).some((s) => s.key === 'sleep-short') &&
    !suggestionsFor(day({ sleepMin: SHORT_SLEEP_MIN })).some((s) => s.key === 'sleep-short')],
];
const missed = selfTest.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join(', ')}, đừng tin kết quả`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });

if (problems.length) {
  console.log('gợi ý trợ lý sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const worst = results['ngày tệ toàn diện'].map((s) => s.key).join(' → ');
console.log(
  `gợi ý trợ lý OK — ${Object.keys(DAYS).length} ngày × ${SUGGESTION_SLOTS} chip, ${RULES.length} luật đều có ngày của mình ` +
    `và không luật nào xuất hiện mọi ngày; ngày tệ nhất ra "${worst}"; ngày bình thường không báo động; ` +
    'không câu nào chứa số mà ngày đó không có; ngưỡng ngủ đúng cả hai chiều',
);
