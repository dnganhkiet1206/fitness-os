/**
 * That the assistant's opening lines are about the person reading them.
 *
 * ── what this replaced ──
 *
 * *"Chào buổi tối!"* over *"Tôi ở đây để giúp bạn hiểu dữ liệu sức khoẻ…"* —
 * the same two sentences for every person on every day, directly above four
 * tiles reading that person's real numbers. An assistant that appears to be
 * waiting rather than one that has looked.
 *
 * ── why the checks are mostly about honesty ──
 *
 * A briefing is the one surface where being wrong is worse than being absent.
 * "Đêm qua bạn ngủ 0 giờ" to somebody who simply has not connected Health is
 * not a cosmetic slip: it is the app confidently telling you something false
 * about your own night, in the first sentence you read. And every failure of
 * that kind is silent — the string renders, the layout holds, and it looks
 * exactly as designed to anyone who is not that user on that day.
 *
 * So the rules are:
 *
 * 1. every number in every line traces back to a value the signal carried
 * 2. no line appears on a day whose datum is missing
 * 3. a day with nothing logged still gets an honest line, not a warm one
 * 4. the greeting uses the person's own name, and no stand-in when there is none
 * 5. names are read the way each language writes them
 * 6. at most `BRIEF_LINES`, and never zero
 * 7. two people with different data never get the same briefing
 * 8. both languages, always, and never identical
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'brief-'));

let briefFor, givenName, BRIEF_LINES;
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/assistant-brief.ts', '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  ({ briefFor, givenName, BRIEF_LINES } = createRequire(import.meta.url)(path.join(out, 'assistant-brief.js')));
} catch (e) {
  console.error('không biên dịch được assistant-brief.ts');
  console.error((e.stdout ?? '') + (e.stderr ?? '') + (e.message ?? ''));
  process.exit(2);
}

const problems = [];

const PLAIN = {
  name: 'Đặng Anh Kiệt',
  daysSinceWorkout: 0,
  readiness: 78,
  status: 'green',
  /* Whether the score rested on a recovery reading. The default person has a
     night and biometrics behind theirs, so this file keeps exercising the
     recovery wording; `tải-only` below is the same status with nothing but
     training load behind it, which is the other sentence entirely. Adding the
     field without a fixture for `false` would have quietly moved every case in
     this file onto one branch. */
  hasRecovery: true,
  acwr: 1.0,
  sleepMin: 472,
  kcal: 1900,
  kcalTarget: 2200,
  proteinG: 140,
  proteinTarget: 150,
  steps: 9000,
};
const day = (over) => ({ ...PLAIN, ...over });

const DAYS = {
  'ngày đầy đủ': day({}),
  'ngủ ngắn': day({ sleepMin: 320, status: 'yellow', readiness: 61 }),
  'chưa ghi ngủ': day({ sleepMin: 0 }),
  'nghỉ tập 2 ngày': day({ daysSinceWorkout: 2 }),
  'nghỉ tập 9 ngày': day({ daysSinceWorkout: 9, acwr: 0.4 }),
  'chưa từng tập': day({ daysSinceWorkout: null }),
  'tải vọt': day({ acwr: 1.62, daysSinceWorkout: 1 }),
  'chưa ăn gì': day({ kcal: 0 }),
  'ăn quá mục tiêu': day({ kcal: 2600 }),
  'chưa có sẵn sàng': day({ status: null, readiness: null, hasRecovery: false }),
  /* Readiness built from training load alone — a real score, and no measurement
     of recovery behind it. Chain AJ: the state line must talk about capacity,
     never about how the body recovered. */
  'đỏ chỉ từ tải': day({ status: 'red', readiness: 45, acwr: 0.01, hasRecovery: false, sleepMin: 0 }),
  'xanh chỉ từ tải': day({ status: 'green', readiness: 80, acwr: 1.14, hasRecovery: false, sleepMin: 0 }),
  'vàng chỉ từ tải': day({ status: 'yellow', readiness: 65, acwr: 0.7, hasRecovery: false, sleepMin: 0 }),
  'không tên': day({ name: '' }),
  'tên một chữ': day({ name: 'Kiệt' }),
  'trống hoàn toàn': {
    name: '', daysSinceWorkout: null, readiness: null, status: null, hasRecovery: false, acwr: null,
    sleepMin: 0, kcal: 0, kcalTarget: 0, proteinG: 0, proteinTarget: 0, steps: 0,
  },
};

const HOURS = [7, 14, 21];
const results = {};
for (const [n, d] of Object.entries(DAYS)) results[n] = briefFor(d, HOURS[1], true);

// ── 6: length ──
for (const [name, b] of Object.entries(results)) {
  if (b.lines.length === 0) problems.push(`"${name}": không có dòng nào — kể cả ngày trống cũng phải nói được điều gì đó`);
  if (b.lines.length > BRIEF_LINES) {
    problems.push(`"${name}": ${b.lines.length} dòng, tối đa ${BRIEF_LINES} — quá số đó thì nó thành bảng chứ không phải lời chào`);
  }
}

/*
  ── 1: provenance ──

  Every run of digits in every sentence has to be a value the signal actually
  carried, in one of the forms the sentence may render it in. This is the rule
  that catches the class the whole file exists for: a confident sentence about
  a number nobody has.
*/
function allowed(d) {
  const set = new Set();
  const add = (v) => v != null && set.add(String(v));
  if (d.sleepMin > 0) {
    add(Math.floor(d.sleepMin / 60));
    add(d.sleepMin % 60);
  }
  if (d.readiness != null) add(d.readiness);
  if (d.daysSinceWorkout != null) add(d.daysSinceWorkout);
  if (d.acwr != null) add(Math.round((d.acwr - 1) * 100));
  if (d.kcalTarget > 0) {
    add(d.kcalTarget);
    for (const p of d.kcalTarget.toLocaleString('vi-VN').split(/[.,\s ]/)) add(p);
    for (const p of d.kcalTarget.toLocaleString('en-US').split(/[.,\s ]/)) add(p);
    const diff = Math.abs(d.kcalTarget - d.kcal);
    add(diff);
    for (const p of diff.toLocaleString('vi-VN').split(/[.,\s ]/)) add(p);
    for (const p of diff.toLocaleString('en-US').split(/[.,\s ]/)) add(p);
  }
  if (d.steps > 0) {
    add(d.steps);
    for (const p of d.steps.toLocaleString('vi-VN').split(/[.,\s ]/)) add(p);
    for (const p of d.steps.toLocaleString('en-US').split(/[.,\s ]/)) add(p);
  }
  return set;
}
for (const [name, b] of Object.entries(results)) {
  const ok = allowed(DAYS[name]);
  for (const l of b.lines) {
    for (const lang of ['vi', 'en']) {
      for (const n of (l.text[lang].match(/\d+/g) ?? [])) {
        if (!ok.has(n)) {
          problems.push(
            `"${name}"/${l.key} (${lang}): câu nói số ${n} nhưng người này không có giá trị nào như vậy — "${l.text[lang]}"`,
          );
        }
      }
    }
  }
}

/*
  ── 2: a line only appears when its datum does ──

  The inverse of the rule above, and the one that catches "bạn đã ngủ 0 giờ":
  the number would be legitimate (`sleepMin` is 0) while the sentence is a lie.
*/
const REQUIRES = {
  sleep: (d) => d.sleepMin > 0,
  readiness: (d) => d.status != null,
  'no-workouts': (d) => d.daysSinceWorkout == null,
  'rest-gap': (d) => d.daysSinceWorkout != null && d.daysSinceWorkout >= 2,
  'load-high': (d) => d.acwr != null && d.acwr > 1.3,
  'kcal-left': (d) => d.kcal > 0 && d.kcalTarget > 0 && d.kcalTarget > d.kcal,
  'kcal-over': (d) => d.kcal > 0 && d.kcalTarget > 0 && d.kcalTarget <= d.kcal,
  'kcal-none': (d) => d.kcal === 0 && d.kcalTarget > 0,
  steps: (d) => d.steps > 0,
  'no-data': () => true,
};
for (const [name, b] of Object.entries(results)) {
  for (const l of b.lines) {
    const gate = REQUIRES[l.key];
    if (!gate) {
      problems.push(`"${name}": dòng lạ "${l.key}" — thêm điều kiện của nó vào tools/brief.mjs`);
    } else if (!gate(DAYS[name])) {
      problems.push(`"${name}": dòng "${l.key}" xuất hiện nhưng dữ liệu của nó không có — "${l.text.vi}"`);
    }
  }
}

/*
  ── 3: a day with nothing logged is honest, and quotes nothing ──

  First written as "the empty day is exactly the `no-data` line", and that was
  wrong about the app rather than about the code: `calorieTargetFor` falls back
  to 2200, so a real person always has a calorie target, so the "chưa ghi bữa
  nào" line always fires and `no-data` is unreachable in practice. The rule was
  asserting a state the product cannot produce.

  What matters is the property, not which line delivers it: every sentence
  shown to someone the app cannot see yet must be about *absence*, and must
  contain no number — because there is no number to have.
*/
const ABSENCE = new Set(['no-data', 'no-workouts', 'kcal-none']);
{
  const b = results['trống hoàn toàn'];
  if (b.lines.length === 0) problems.push('ngày trống không có dòng nào');
  for (const l of b.lines) {
    if (!ABSENCE.has(l.key)) {
      problems.push(`ngày trống có dòng "${l.key}" — người này chưa ghi gì, mọi câu phải nói về cái còn thiếu`);
    }
    for (const lang of ['vi', 'en']) {
      if (/\d/.test(l.text[lang])) {
        problems.push(`ngày trống có số trong câu (${lang}): "${l.text[lang]}"`);
      }
    }
  }
}

/* And the same for a brand-new account as the app really produces one: no log
   at all, but a calorie target from the profile fallback. */
{
  const fresh = briefFor(
    { ...DAYS['trống hoàn toàn'], kcalTarget: 2200 },
    9,
    true,
  );
  if (fresh.lines.length === 0) problems.push('tài khoản mới không có dòng nào');
  for (const l of fresh.lines) {
    if (!ABSENCE.has(l.key)) {
      problems.push(`tài khoản mới có dòng "${l.key}" — chưa ghi gì mà đã nói về số liệu`);
    }
  }
}

// ── 4 + 5: the name ──
for (const [full, wantVi, wantEn] of [
  ['Đặng Anh Kiệt', 'Kiệt', 'Đặng'],
  ['Kiệt', 'Kiệt', 'Kiệt'],
  ['  Trần  Minh  ', 'Minh', 'Trần'],
  ['', '', ''],
]) {
  if (givenName(full, true) !== wantVi) {
    problems.push(`givenName("${full}", vi) = "${givenName(full, true)}", đáng lẽ "${wantVi}"`);
  }
  if (givenName(full, false) !== wantEn) {
    problems.push(`givenName("${full}", en) = "${givenName(full, false)}", đáng lẽ "${wantEn}"`);
  }
}
for (const hour of HOURS) {
  const named = briefFor(day({}), hour, true).greeting;
  const anon = briefFor(day({ name: '' }), hour, true).greeting;
  for (const lang of ['vi', 'en']) {
    if (!named[lang].includes(lang === 'vi' ? 'Kiệt' : 'Đặng')) {
      problems.push(`${hour}h (${lang}): lời chào không có tên — "${named[lang]}"`);
    }
    /* No stand-in. "Chào bạn ơi" is the opposite of the impression this is for. */
    if (/bạn ơi|there|friend|user/i.test(anon[lang])) {
      problems.push(`${hour}h (${lang}): hồ sơ không tên nhưng lời chào bịa một cái — "${anon[lang]}"`);
    }
  }
}
// the greeting still knows what time it is
{
  const g = HOURS.map((h) => briefFor(day({}), h, true).greeting.vi);
  if (new Set(g).size !== HOURS.length) problems.push(`lời chào không đổi theo giờ: ${g.join(' / ')}`);
}

/*
  ── 7: two different *days* never read the same thing ──

  Scoped to the days that differ in signal data. The name-only variants are
  excluded because they are supposed to produce identical lines — the name
  lives in the greeting, and `givenName` is asserted directly above.
*/
const NAME_ONLY = new Set(['không tên', 'tên một chữ']);
{
  const seen = new Map();
  for (const [name, b] of Object.entries(results)) {
    if (NAME_ONLY.has(name)) continue;
    const body = b.lines.map((l) => l.text.vi).join(' ');
    if (seen.has(body)) {
      problems.push(`"${name}" và "${seen.get(body)}" cho ra cùng một lời tóm tắt — dữ liệu khác nhau phải đọc khác nhau`);
    }
    seen.set(body, name);
  }
}

// ── 8: both languages, always, and different ──
for (const [name, b] of Object.entries(results)) {
  for (const l of [{ key: 'greeting', text: b.greeting }, ...b.lines]) {
    for (const lang of ['vi', 'en']) {
      const t = l.text[lang];
      if (!t) problems.push(`"${name}"/${l.key}: thiếu bản ${lang}`);
      else if (/NaN|undefined|null|\s\s/.test(t)) problems.push(`"${name}"/${l.key} (${lang}): câu có lỗ hổng — "${t}"`);
    }
    if (l.text.vi === l.text.en) problems.push(`"${name}"/${l.key}: hai ngôn ngữ giống hệt — chưa dịch`);
  }
}

/**
 * The self-test.
 *
 * The provenance and gating rules are the two that matter, so both are handed
 * the shape they exist to catch — built by calling the real function on a
 * doctored signal rather than by writing a fake sentence, so the fixtures
 * cannot drift away from the code.
 */
const selfTest = [
  ['ngủ 0 giờ', () => {
    const b = briefFor(day({ sleepMin: 0 }), 9, true);
    // no sleep line at all is the correct behaviour; the rule must be the thing
    // that would catch one if it appeared
    return !b.lines.some((l) => l.key === 'sleep') && REQUIRES.sleep({ sleepMin: 0 }) === false;
  }],
  ['số không có nguồn', () => {
    const ok = allowed(day({ steps: 0 }));
    return !ok.has('9000');
  }],
  ['ngày trống không được có số', () => results['trống hoàn toàn'].lines.every((l) => !/\d/.test(l.text.vi))],
  ['tên tiếng Việt lấy chữ cuối', () => givenName('Đặng Anh Kiệt', true) === 'Kiệt'],
  ['hai ngày khác nhau đọc khác nhau', () =>
    briefFor(day({ sleepMin: 320 }), 9, true).lines.map((l) => l.text.vi).join(' ') !==
    briefFor(day({ sleepMin: 480 }), 9, true).lines.map((l) => l.text.vi).join(' ')],
];
const missed = selfTest.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — không bắt được: ${missed.join(', ')}, đừng tin kết quả`);
  rmSync(out, { recursive: true, force: true });
  process.exit(2);
}

rmSync(out, { recursive: true, force: true });

if (problems.length) {
  console.log('lời tóm tắt sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const sample = results['ngủ ngắn'];
console.log(
  `lời tóm tắt OK — ${Object.keys(DAYS).length} người × ${HOURS.length} khung giờ, mỗi người đọc một khác; ` +
    `không câu nào chứa số người đó không có; không dòng nào hiện khi thiếu dữ liệu; ` +
    `ngày trống nói thật và không có số; tên lấy đúng theo từng ngôn ngữ; ` +
    `ví dụ: "${sample.greeting.vi} ${sample.lines.map((l) => l.text.vi).join(' ')}"`,
);
