/**
 * That a number nobody's body could have produced cannot be saved.
 *
 * ── what was wrong ──
 *
 * Every manual health input in this app validated with `isNaN` and stopped
 * there. A resting heart rate of 600, an SpO₂ of 970, a body fat of 500% and a
 * weight of 7,500 kg all saved without complaint, and most of them never
 * announce themselves afterwards:
 *
 *   - `hr_bpm` and `hrv_rmssd_ms` become 28-day baselines that together carry
 *     0.50 of the readiness score. One bad reading skews the score for a month
 *     with nothing on screen explaining why.
 *   - `weight_kg` and `daily_logs.kcal` are the two inputs to `adaptiveTDEE`,
 *     which is a least-squares fit with no outlier defence, and which now sets
 *     a suggested calorie target. A typo in either comes back days later as a
 *     diet.
 *
 * ── the two halves of this check ──
 *
 * **The bounds have to be right.** They must reject the typos and still accept
 * the most extreme readings a human being has ever produced. That second half
 * is the one worth guarding: an app that refuses a real measurement is worse
 * than one that accepts a typo, because a typo can be corrected and a refusal
 * cannot be argued with. So the table below is written from records, and each
 * case names its source.
 *
 * **Every screen has to actually use them.** This project has repeatedly
 * written a rule that a *name* satisfied — an import present, a helper defined
 * — while the behaviour it was supposed to guarantee was missing. So the check
 * here is not "does the file mention `plausible`". It is: find the expression
 * that disables the save button, and require it to depend, transitively, on a
 * value computed by one of these functions. A screen that computes an error
 * and then ignores it fails.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const out = mkdtempSync(path.join(tmpdir(), 'plaus-'));
execFileSync(
  'npx',
  ['tsc', 'src/lib/plausible.ts', '--ignoreConfig', '--outDir', out,
   '--module', 'esnext', '--target', 'es2020', '--moduleResolution', 'bundler', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
);
const { plausible, plausibleText, outOfRangeMessage, BOUNDS } = await import(
  pathToFileURL(path.join(out, 'plausible.js')).href
);

/*
  ── 1: the bounds, against records and against typos ──

  `keep` is a value the app must never refuse; `refuse` is one it must never
  accept. Every `keep` that is a record carries the record in its label, so a
  future edit that tightens a bound has to argue with a real person's real
  measurement rather than with a number in a table.
*/
const CASES = [
  ['hr_bpm', 'nhịp nghỉ thấp nhất từng ghi nhận: 27 bpm (Martin Brady, Guinness 2005)', 27, null],
  ['hr_bpm', 'nhịp tim gắng sức của người trẻ', 205, null],
  ['hr_bpm', 'gõ nhầm 60 thành 600', null, 600],
  ['hr_bpm', 'gõ nhầm thành 6', null, 6],
  ['hrv_ms', 'HRV rất cao của vận động viên', 220, null],
  ['hrv_ms', 'HRV bình thường', 45, null],
  ['hrv_ms', '0 ms không phải phép đo, mà là phép đo bị thiếu', null, 0],
  ['hrv_ms', 'gõ nhầm 62 thành 6200', null, 6200],
  ['spo2_pct', 'trần theo định nghĩa', 100, null],
  ['spo2_pct', 'SpO₂ thấp có thật', 88, null],
  ['spo2_pct', 'gõ nhầm 97 thành 970', null, 970],
  ['spo2_pct', 'không thể vượt 100%', null, 101],
  ['lift_kg', 'mức tạ nặng nhất từng được ghi nhận: 501 kg (Hafthór Björnsson, deadlift 2020)', 501, null],
  ['lift_kg', 'body-weight: không tạ là một giá trị thật, không phải ô bỏ trống', 0, null],
  ['lift_kg', 'tạ đơn nhẹ', 2.5, null],
  ['lift_kg', 'gõ nhầm 70 thành 700 — cú gõ này từng thành kỷ lục cá nhân rồi thành mốc so sánh', null, 700],
  ['lift_kg', 'nhầm đơn vị: nhập gram', null, 70000],
  ['set_reps', 'set 100 rep là một giáo án có thật, không phải lỗi', 100, null],
  ['set_reps', 'set nặng 1 rep', 1, null],
  ['set_reps', '0 rep không phải một set, mà là một dòng chưa điền', null, 0],
  ['set_reps', 'số lần nuốt mất mức tạ', null, 5000],
  ['vo2max_mlkgmin', 'VO₂max cao nhất từng ghi nhận: 97,5 (Oskar Svendsen, 2012)', 97.5, null],
  ['vo2max_mlkgmin', 'người ít vận động', 25, null],
  ['vo2max_mlkgmin', 'gõ nhầm 44 thành 4400', null, 4400],
  ['resp_rpm', 'nhịp thở bình thường', 14, null],
  ['resp_rpm', 'ức chế hô hấp nặng', 4, null],
  ['resp_rpm', 'gõ nhầm 14 thành 140', null, 140],
  ['weight_kg', 'người rất nhẹ', 35, null],
  ['weight_kg', 'người rất nặng', 250, null],
  ['weight_kg', 'lệch dấu phẩy: 75 thành 7500', null, 7500],
  ['weight_kg', 'nhập số 0', null, 0],
  ['body_fat_pct', 'mỡ thiết yếu của nam theo ACE: 2%', 2, null],
  ['body_fat_pct', 'mỡ thiết yếu của nữ theo ACE: 10–13%', 10, null],
  ['body_fat_pct', 'béo phì nặng', 60, null],
  ['body_fat_pct', 'gõ nhầm 50 thành 500', null, 500],
  ['circumference_cm', 'vòng eo 100cm', 100, null],
  ['circumference_cm', 'vòng bắp tay 25cm', 25, null],
  ['circumference_cm', 'lệch dấu phẩy: 85 thành 850', null, 850],
  ['sleep_stage_min', 'một đêm trọn vẹn', 480, null],
  ['sleep_stage_min', 'dài hơn cả một ngày', null, 1500],
  ['meal_kcal', 'một bữa rất lớn', 2000, null],
  ['meal_kcal', 'lệch một số 0', null, 50000],
  ['macro_g', 'một món nhiều đạm', 120, null],
  ['macro_g', 'lệch một số 0', null, 5000],
];

for (const [q, why, keep, refuse] of CASES) {
  if (keep !== null && !plausible(q, keep)) {
    problems.push(`${q}: từ chối ${keep} — ${why}. Từ chối một phép đo có thật thì tệ hơn nhận một số gõ nhầm`);
  }
  if (refuse !== null && plausible(q, refuse)) {
    problems.push(`${q}: chấp nhận ${refuse} — ${why}`);
  }
}

/*
  ── 2: blank is not an error, and NaN is ──

  Every one of these fields is optional; leaving one empty has to stay free.
  This is the same distinction the rest of the project keeps making between
  "no value" and "the value zero", and getting it backwards here would make
  every one of these sheets impossible to submit.
*/
for (const q of Object.keys(BOUNDS)) {
  if (!plausible(q, null)) problems.push(`${q}: null bị coi là sai — bỏ trống một ô không phải là lỗi`);
  if (!plausible(q, undefined)) problems.push(`${q}: undefined bị coi là sai — bỏ trống một ô không phải là lỗi`);
  if (!plausibleText(q, '')) problems.push(`${q}: chuỗi rỗng bị coi là sai — bỏ trống một ô không phải là lỗi`);
  if (!plausibleText(q, '   ')) problems.push(`${q}: chuỗi toàn khoảng trắng bị coi là sai`);
  if (plausible(q, NaN)) problems.push(`${q}: NaN được chấp nhận — có gõ gì đó vào và nó không phải là số`);
  if (plausible(q, Infinity)) problems.push(`${q}: Infinity được chấp nhận`);
  if (BOUNDS[q].min >= BOUNDS[q].max) problems.push(`${q}: khoảng rỗng (${BOUNDS[q].min}–${BOUNDS[q].max})`);
  if (!BOUNDS[q].unit) problems.push(`${q}: không có đơn vị để in ra cho người dùng`);
}

/* The message must actually carry the numbers — a placeholder left unreplaced
   reads as "Cần nằm trong khoảng {min}–{max}" on a real phone. */
{
  const msg = outOfRangeMessage('hr_bpm', '600', 'Cần nằm trong khoảng {min}–{max} {unit}');
  if (msg === null) problems.push('outOfRangeMessage trả null cho 600 bpm');
  else if (/\{(min|max|unit)\}/.test(msg)) problems.push(`còn chỗ trống chưa thay trong câu báo lỗi: "${msg}"`);
  else if (!msg.includes('20') || !msg.includes('250') || !msg.includes('bpm')) {
    problems.push(`câu báo lỗi không mang đủ số và đơn vị: "${msg}"`);
  }
  if (outOfRangeMessage('hr_bpm', '60', 'x') !== null) problems.push('60 bpm bị báo lỗi');
}

/*
  ── 3: every screen that takes a health number is actually gated ──

  `REGISTRY` names, for each screen, the identifier that must both (a) be
  computed from one of the plausibility functions and (b) appear in whatever
  expression disables its save control. Checking only (a) is the trap this
  project has fallen into three times: a helper that exists, is correct, and is
  never consulted.

  `save` is the substring of the line that turns saving off. It is matched
  literally so that renaming the button does not silently disable the rule —
  a missing anchor is reported as a failure, not passed over.
*/
const REGISTRY = [
  {
    file: 'src/app/log-biometrics.tsx',
    gate: 'anyBad',
    save: 'const canSave =',
    covers: ['hr_bpm', 'hrv_ms', 'spo2_pct', 'vo2max_mlkgmin', 'resp_rpm'],
  },
  {
    /*
      ── this screen used to be exempt, and the exemption was the bug ──

      It sat in `NO_GATE_NEEDED` with the reason *"tạ và số lần là con số của
      buổi tập, không phải chỉ số sức khoẻ có ngưỡng sinh lý"* — a workout
      number, not a health metric with physiological bounds. That is true about
      the number and wrong about what the app does with it.

      A mistyped 700 kg bench inflates `volume_load`, which feeds training load,
      which feeds the readiness score — so it *is* a health metric two steps
      downstream. And after `lib/personal-record.ts` was added it became worse
      than wrong: the typo is detected as a personal record, celebrated on
      screen, and then kept as the baseline every later set is compared against,
      so nothing is ever a record again.

      The exemption was written before the record engine existed. It was
      reasonable then and false afterwards, which is the failure mode of every
      exemption list — so this one is now a real entry instead.
    */
    file: 'src/app/log-workout.tsx',
    gate: 'firstSetError',
    save: 'const canSave =',
    covers: ['lift_kg', 'set_reps'],
  },
  {
    file: 'src/app/log-measurement.tsx',
    gate: 'anyBad',
    save: 'const canSave =',
    covers: ['body_fat_pct', 'circumference_cm'],
  },
  {
    file: 'src/app/log-sleep.tsx',
    gate: 'stageError',
    save: 'disabled={save.isPending',
    covers: ['sleep_stage_min'],
  },
  {
    file: 'src/app/log-meal.tsx',
    gate: 'customBad',
    save: 'const canAddCustom =',
    covers: ['meal_kcal', 'macro_g'],
  },
  {
    file: 'src/components/ascnd/today-widgets.tsx',
    gate: 'weightError',
    save: 'const submit = ',
    covers: ['weight_kg'],
  },
];

/**
 * `const x = …` → the whole right-hand side, however many lines it spans.
 *
 * The first version of this ended a binding at the next line starting with a
 * keyword, which cut `const errorFor = (key) => { const raw = … }` off at its
 * own first statement and hid the `plausible()` call inside it. The rule then
 * reported a correctly gated screen as ungated — the tool wrong about the app,
 * which is the failure mode that matters most here, since the opposite
 * mistake is the one this whole file exists to catch.
 *
 * So it tracks bracket depth and ends the binding at the `;` that closes the
 * statement, which is what actually delimits one.
 */
function bindings(src) {
  const map = new Map();
  const re = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let depth = 0;
    for (; i < src.length; i++) {
      const c = src[i];
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break; // ran past the end of an enclosing block
        depth--;
      } else if (c === ';' && depth === 0) break;
    }
    map.set(m[1], src.slice(m.index + m[0].length, i));
  }
  return map;
}

/** Does `ident` trace back to a plausibility call within `depth` hops? */
function fromPlausible(ident, map, depth = 4, seen = new Set()) {
  if (depth === 0 || seen.has(ident)) return false;
  seen.add(ident);
  const rhs = map.get(ident);
  if (!rhs) return false;
  if (/\b(plausible|plausibleText|outOfRangeMessage)\s*\(/.test(rhs)) return true;
  for (const ref of rhs.matchAll(/\b([A-Za-z_$][\w$]*)\b/g)) {
    if (ref[1] !== ident && fromPlausible(ref[1], map, depth - 1, seen)) return true;
  }
  return false;
}

for (const { file, gate, save, covers } of REGISTRY) {
  const src = read(file);
  const map = bindings(src);

  if (!map.has(gate)) {
    problems.push(`${file}: không có \`${gate}\` — màn hình này nhận số sức khoẻ mà không có chốt chặn nào`);
    continue;
  }
  if (!fromPlausible(gate, map)) {
    problems.push(
      `${file}: \`${gate}\` không truy về được plausible/plausibleText/outOfRangeMessage — ` +
        'một cái tên đúng không phải là một phép kiểm tra',
    );
  }

  const line = src.split('\n').find((l) => l.includes(save));
  if (!line) {
    problems.push(`${file}: không tìm thấy dòng chặn lưu ("${save}") — luật này đang không kiểm gì cả, hãy sửa mốc neo`);
  } else {
    /* The anchor may open a multi-line expression; read to the end of the
       statement rather than trusting one line. */
    const start = src.indexOf(save);
    const expr = src.slice(start, start + 600);
    const head = expr.split(/;\n|\n\s*\n/)[0];
    if (!new RegExp(`\\b${gate}\\b`).test(head)) {
      problems.push(
        `${file}: \`${gate}\` được tính nhưng không có mặt trong biểu thức chặn lưu — ` +
          'giá trị bị từ chối vẫn lưu được',
      );
    }
  }

  for (const q of covers) {
    if (!new RegExp(`['"]${q}['"]`).test(src)) {
      problems.push(`${file}: không kiểm \`${q}\`, dù màn hình này có ô nhập cho nó`);
    }
  }
}

/*
  ── 4: a new sheet cannot slip through ──

  The registry above is a list somebody has to remember to extend. So anything
  matching `src/app/log-*.tsx` that is not in it is a failure by default: the
  next health sheet added to this app fails this check until it is either
  gated or explicitly recorded as needing no gate.
*/
const NO_GATE_NEEDED = {
  /* Empty on purpose. `log-workout.tsx` was the only entry and it has moved
     into REGISTRY — see the note there for why its exemption was wrong. */
};
for (const f of readdirSync(path.join(NATIVE, 'src/app')).filter((f) => /^log-.*\.tsx$/.test(f))) {
  const known = REGISTRY.some((r) => r.file.endsWith(`/${f}`)) || f in NO_GATE_NEEDED;
  if (!known) {
    problems.push(`src/app/${f}: màn hình nhập mới, chưa có trong danh sách chốt chặn của tools/plausible.mjs`);
  }
}

/**
 * The self-test.
 *
 * The derivation walker is the part most likely to be quietly broken, because
 * a walker that returns `true` for everything makes the whole of section 3
 * pass. So it is fed both a gated screen and an ungated one and has to tell
 * them apart.
 */
const SELF = [
  ['tìm ra được chốt chặn thật', () => {
    const src = 'const errors = { a: outOfRangeMessage("hr_bpm", x, t) };\n\nconst anyBad = Object.values(errors).some(Boolean);\n';
    return fromPlausible('anyBad', bindings(src));
  }],
  ['không nhận nhầm một biến chẳng liên quan', () => {
    const src = 'const errors = { a: somethingElse(x) };\n\nconst anyBad = Object.values(errors).some(Boolean);\n';
    return !fromPlausible('anyBad', bindings(src));
  }],
  ['không nhận nhầm khi chỉ có import mà không có tính toán', () => {
    const src = 'import { plausible } from "@/lib/plausible";\n\nconst anyBad = false;\n';
    return !fromPlausible('anyBad', bindings(src));
  }],
  ['bản cũ (chỉ isNaN) không đỡ được gì', () => {
    const val = 600;
    return !isNaN(val) && val > 0 && !plausible('hr_bpm', val);
  }],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('kiểm tra tính hợp lý sinh lý sai:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `hợp lý sinh lý OK — ${CASES.length} ca ngưỡng: nhận đúng các kỷ lục có thật (nhịp nghỉ 27 bpm của Martin Brady, ` +
    'VO₂max 97,5 của Oskar Svendsen, mỡ thiết yếu 2% theo ACE) và từ chối các kiểu gõ nhầm (600 bpm, SpO₂ 970, mỡ 500%, 7500 kg); ' +
    `bỏ trống vẫn hợp lệ ở cả ${Object.keys(BOUNDS).length} đại lượng còn NaN/Infinity thì không; ` +
    `${REGISTRY.length} màn hình nhập đều có chốt chặn truy được về plausible VÀ có mặt trong chính biểu thức chặn nút lưu ` +
    '(một cái tên đúng không phải là một phép kiểm tra); màn hình log-* mới không có trong danh sách sẽ tự động hỏng',
);
