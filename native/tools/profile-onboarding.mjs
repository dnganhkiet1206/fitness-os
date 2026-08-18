/**
 * A derived fitness number must never be computed for a body nobody described.
 *
 * ── the primary question this chain started from ──
 *
 * Can an incomplete, stale, malformed, defaulted or cross-user profile make
 * downstream fitness logic produce a confident but incorrect result?
 *
 * Cross-user: no, and that was measured rather than read. On PostgreSQL 16.13
 * with `SET LOCAL ROLE authenticated`, user B against user A's profile returns
 * 0 rows on SELECT, 0 on UPDATE, 0 on DELETE, and both INSERT-as-A and
 * moving B's own row to A raise *"new row violates row-level security policy"*
 * — the UPDATE policy has no separate `WITH CHECK`, so Postgres applies the
 * `USING` expression to the new row too and the ownership transfer is refused.
 *
 * Incomplete: no, at the gate. `onboarding_completed` defaults to false,
 * `handle_new_user` leaves it false, `_layout` renders `OnboardingFlow` while
 * it is false, and `finish` writes every field **and** the flag in one upsert,
 * so there is no half-finished profile to be caught in.
 *
 * Malformed and defaulted: **yes**, and that is what this file is about. Both
 * of the screens that write a body were substituting for missing numbers, and
 * the one that creates the account was not checking the ones it got.
 *
 * ── what was measured, on the real `fitness-calc` chain ──
 *
 *     70 kg / 170 cm      → 2,539 kcal · 126 P · 349 C · 71 F ·  2,450 ml
 *     70 kg /  17 cm      → 1,500 kcal · 126 P · 155 C · 42 F ·  2,450 ml
 *     70 kg /  70 cm      → 1,570 kcal · 126 P · 168 C · 44 F ·  2,450 ml
 *    700 kg / 170 cm      → 12,304 kcal · 156 P · 2151 C · 342 F · 17,500 ml
 *
 * A height typed as `17` takes a thousand calories a day off the target and
 * says nothing. It is worse than it looks: `proteinReferenceWeight` and
 * `calcWaterTarget` both read `height_cm < 100` as *"no height was given"*, so
 * the mistyped digit switches two guards **off** — the water figure above is
 * the unadjusted one, and the protein ceiling never applies. A single wrong
 * digit turns a guard off rather than tripping it, and every screen downstream
 * draws the result as a fact.
 *
 * `edit-profile` had validated these same two fields, against these same
 * bounds, with this same helper, since it was written. Onboarding — the screen
 * that decides what the numbers are and stores them with
 * `onboarding_completed: true` — did not.
 *
 * And where a number was missing, three different bodies were invented for it:
 * `?? 175` in `edit-profile`'s form load, `|| 170` in its *Recalculate* twelve
 * lines below, `|| 170` again in onboarding. Three defaults for one column
 * means none of them is anybody's.
 *
 * ── how the rules work ──
 *
 * A and B **run** the real `readStat`, `calcPlan` and `planFromEntry`: what a
 * blank field becomes, and what the chain does when handed a body it was not
 * given. C is the coupling that made the typo dangerous — the height floor and
 * the "no height" fallback are the same number, and a bound loosened below the
 * fallback would let through exactly the values that disable it. D and E read
 * the two screens, because "the button is disabled" and "the payload persists
 * the reading that was validated" are wiring, not arithmetic. F forbids the
 * substitution coming back anywhere. G enumerates the writers to `profiles` and
 * requires each to reach the shared boundary — there is no `CHECK` on that
 * table, so the application *is* the boundary, and a writer that skips it makes
 * the rest of this file decorative.
 *
 * ── a rule of mine that did not have teeth, and what replaced it ──
 *
 * E used to read `recalcTargets` and assert the refusal was written there: two
 * `=== null` checks and a `return` above the `calcPlan` call. Changing the
 * guard to `if (false && … )` left every one of those tokens in place, the rule
 * stayed green, and the screen computed a plan for a body nobody described.
 *
 * A rule that reads a guard cannot tell you the guard works. So the gate became
 * `planFromEntry` — one function, both screens — and B2 **drives** it. The same
 * break now reports `plan:2508` where `incomplete:height_cm` belongs.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ─────────────────────────────────────────────────────────────────────────
   Rules A, B & C — run the reader and the chain it feeds
   ───────────────────────────────────────────────────────────────────────── */
const out = mkdtempSync(path.join(tmpdir(), 'profonb-'));
try {
  try {
    execFileSync(
      'npx',
      ['tsc', 'src/lib/plausible.ts', 'src/lib/fitness-calc.ts',
        '--ignoreConfig', '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
      { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch {
    /* `@/` is unmapped without the project tsconfig — TS2307, emitted anyway. */
  }
  const fc = path.join(out, 'fitness-calc.js');
  writeFileSync(fc, readFileSync(fc, 'utf8').replace('require("@/lib/plausible")', 'require("./plausible.js")'));

  writeFileSync(
    path.join(out, 'drive.cjs'),
    `const { readStat, statMessage, outOfRangeMessage, BOUNDS } = require('./plausible.js');
     const fc = require('./fitness-calc.js');
     const o = {};

     /* ── A. a blank field is not a body ── */
     const r = (q, t, req) => { const s = readStat(q, t, req); return String(s.value) + '/' + String(s.problem); };
     o.blankRequired   = r('height_cm', '', true);
     o.blankOptional   = r('height_cm', '', false);
     o.spacesRequired  = r('weight_kg', '   ', true);
     o.good            = r('height_cm', '170', true);
     o.goodDecimal     = r('weight_kg', '70.5', true);
     o.typo17          = r('height_cm', '17', true);
     o.typo70          = r('height_cm', '70', true);
     o.typo700         = r('weight_kg', '700', true);
     o.zero            = r('weight_kg', '0', true);
     o.negative        = r('weight_kg', '-500', true);
     o.notANumber      = r('height_cm', 'cao', true);
     /* Shapes that are not number entry. \`Number()\` is a JS-literal parser and
        takes three radix prefixes and an exponent; all four below landed INSIDE
        the bounds on the shipped reader and were accepted as a height. */
     o.hex             = r('height_cm', '0xAA', true);
     o.binary          = r('height_cm', '0b10101010', true);
     o.octal           = r('height_cm', '0o252', true);
     o.exponent        = r('height_cm', '1e2', true);
     o.infinity        = r('weight_kg', 'Infinity', true);
     o.negInfinity     = r('weight_kg', '-Infinity', true);
     o.overflowExp     = r('weight_kg', '1e400', true);
     o.nanText         = r('weight_kg', 'NaN', true);
     o.comma           = r('height_cm', '1,70', true);
     o.trailingJunk    = r('height_cm', '170abc', true);
     o.underscored     = r('height_cm', '1_7_0', true);
     /* …while these are number entry and must still work */
     o.padded          = r('height_cm', ' 170 ', true);
     o.trailingPoint   = r('height_cm', '170.', true);
     o.leadingZeros    = r('height_cm', '00170', true);
     /* the message the screen shows names the range for either problem */
     o.msgMissing = statMessage('height_cm', readStat('height_cm', '', true).problem, '{min}-{max} {unit}');
     o.msgRange   = statMessage('height_cm', readStat('height_cm', '17', true).problem, '{min}-{max} {unit}');
     /* the old entry point still treats blank as nothing to complain about */
     o.legacyBlank = outOfRangeMessage('height_cm', '', '{min}-{max} {unit}');
     o.legacyBad   = outOfRangeMessage('height_cm', '17', '{min}-{max} {unit}');

     /* ── B. the chain refuses what it was not given ── */
     const plan = (w, h, age) => {
       try {
         const p = fc.calcPlan({ weight_kg: w, height_cm: h, age, sex: 'male', goal: 'maintain', activity_level: 'moderate' });
         return [p.tdee_target_kcal, p.macro_protein_g, p.macro_carbs_g, p.macro_fat_g, p.water_target_ml].join('/');
       } catch (e) {
         return e.name + ':' + (e.field || '');
       }
     };
     o.real       = plan(70, 170, 26);
     o.bulkDiffers = (() => {
       const a = fc.calcPlan({ weight_kg: 70, height_cm: 170, age: 26, sex: 'male', goal: 'maintain', activity_level: 'moderate' });
       const b = fc.calcPlan({ weight_kg: 70, height_cm: 170, age: 26, sex: 'male', goal: 'bulk', activity_level: 'moderate' });
       return a.tdee_target_kcal !== b.tdee_target_kcal;
     })();
     o.h17        = plan(70, 17, 26);
     o.h70        = plan(70, 70, 26);
     o.h0         = plan(70, 0, 26);
     o.w700       = plan(700, 170, 26);
     o.w7         = plan(7, 170, 26);
     o.wNeg       = plan(-500, 170, 26);
     o.wNaN       = plan(NaN, 170, 26);
     o.hNull      = plan(70, null, 26);
     o.ageFuture  = plan(70, 170, -173);
     o.ageAbsurd  = plan(70, 170, 200);
     o.ageNaN     = plan(70, 170, NaN);
     o.newborn    = plan(70, 170, 0).split('/')[0] > 0;

     /* ── B2. the four downstream states, driven through the REAL shared gate ──

        This runs \`planFromEntry\` itself. An earlier version of the rule read
        the screen and checked that a refusal was written there; changing the
        guard to \`if (false && … )\` left every token it looked for in place and
        it stayed green while the screen computed a plan for nobody. The gate is
        a function now precisely so this can drive it. */
     const state = (hText, wText, dob) => {
       let a;
       try {
         a = fc.planFromEntry({ heightText: hText, weightText: wText, dob,
           sex: 'male', goal: 'maintain', activity_level: 'moderate' });
       } catch (e) { return 'threw:' + (e.field || e.message); }
       return a.ok ? 'plan:' + a.plan.tdee_target_kcal : 'incomplete:' + a.missing.join('+');
     };
     const DOB = '2000-01-01';
     o.stComplete   = state('170', '70', DOB);
     o.stPartialH   = state('', '70', DOB);
     o.stPartialW   = state('170', '', DOB);
     o.stPartialDob = state('170', '70', null);
     o.stEmptyDob   = state('170', '70', '');
     o.stEmpty      = state('', '', null);
     o.stMalformedH = state('17', '70', DOB);
     o.stMalformedW = state('170', '700', DOB);
     o.stHex        = state('0xAA', '70', DOB);
     o.stInfinity   = state('170', 'Infinity', DOB);
     o.stFutureDob  = state('170', '70', '2199-01-01');
     /* the gate must never throw at a caller: refusal is a value, not an exception */
     o.stNeverThrows = ['', '  ', '0xAA', 'NaN', 'Infinity', '-1', '1e2', 'abc']
       .every((t) => !state(t, t, DOB).startsWith('threw'));

     /* ── C. the bound and the "no height" fallback are the same number ── */
     o.heightFloor = BOUNDS.height_cm.min;
     o.heightCeil  = BOUNDS.height_cm.max;
     /* just under the floor: both guards fall back, which is why the floor is there */
     o.refAtFloor      = fc.proteinReferenceWeight(150, BOUNDS.height_cm.min);
     o.refBelowFloor   = fc.proteinReferenceWeight(150, BOUNDS.height_cm.min - 1);
     o.waterAtFloor    = fc.calcWaterTarget(150, BOUNDS.height_cm.min);
     o.waterBelowFloor = fc.calcWaterTarget(150, BOUNDS.height_cm.min - 1);

     console.log(JSON.stringify(o));`,
  );

  const r = JSON.parse(
    execFileSync('node', [path.join(out, 'drive.cjs')], { cwd: out, encoding: 'utf8' })
      .trim().split('\n').pop(),
  );
  const want = (ok, msg) => { if (!ok) problems.push(msg); };

  /* ── A ── */
  want(
    r.blankRequired === 'null/missing' && r.spacesRequired === 'null/missing',
    `ô trống ở màn onboarding không ra 'missing' mà ra ${r.blankRequired}/${r.spacesRequired} — ` +
      'một ô đã bị xoá trắng và một cơ thể 70 kg / 170 cm là HAI SỰ THẬT KHÁC NHAU, và cái thứ hai ' +
      'là điều app nói với người dùng về chính họ',
  );
  want(r.blankOptional === 'null/null', `ô trống ở Sửa hồ sơ bị coi là lỗi (${r.blankOptional}) — hồ sơ có quyền chưa có chiều cao`);
  want(r.good === '170/null' && r.goodDecimal === '70.5/null', `số hợp lệ bị từ chối: ${r.good} / ${r.goodDecimal}`);
  want(
    r.typo17 === 'null/out-of-range' && r.typo70 === 'null/out-of-range' && r.typo700 === 'null/out-of-range',
    `chiều cao 17/70 cm hoặc cân nặng 700 kg vẫn lọt: ${r.typo17} ${r.typo70} ${r.typo700}`,
  );
  want(
    r.zero === 'null/out-of-range' && r.negative === 'null/out-of-range' && r.notANumber === 'null/out-of-range',
    `0, số âm hoặc chữ vẫn lọt qua readStat: ${r.zero} ${r.negative} ${r.notANumber}`,
  );
  want(
    r.msgMissing === '100-250 cm' && r.msgRange === '100-250 cm',
    `câu báo lỗi không nêu khoảng cần nhập: ${r.msgMissing} / ${r.msgRange}`,
  );
  want(r.legacyBlank === null && r.legacyBad === '100-250 cm', `outOfRangeMessage đổi nghĩa: ${r.legacyBlank} / ${r.legacyBad}`);
  want(
    r.hex === 'null/out-of-range' && r.binary === 'null/out-of-range' &&
      r.octal === 'null/out-of-range' && r.exponent === 'null/out-of-range',
    `một chuỗi KHÔNG PHẢI số nhập tay vẫn thành một chiều cao hợp lệ: ` +
      `0xAA→${r.hex} 0b10101010→${r.binary} 0o252→${r.octal} 1e2→${r.exponent}. ` +
      'Number() là bộ đọc HẰNG SỐ JavaScript chứ không phải bộ đọc ô nhập số: ba tiền tố cơ số ' +
      'và ký hiệu mũ đều lọt, và cả bốn giá trị trên rơi vào GIỮA khoảng hợp lệ — đúng hình dạng ' +
      'nguy hiểm nhất của vòng này. keyboardType chỉ đổi bàn phím trên màn hình, dán và bàn phím rời đi thẳng qua nó',
  );
  want(
    r.infinity === 'null/out-of-range' && r.negInfinity === 'null/out-of-range' &&
      r.overflowExp === 'null/out-of-range' && r.nanText === 'null/out-of-range' &&
      r.comma === 'null/out-of-range' && r.trailingJunk === 'null/out-of-range' &&
      r.underscored === 'null/out-of-range',
    `Infinity/NaN/1e400/1,70/170abc/1_7_0 không còn bị từ chối: ${r.infinity} ${r.nanText} ` +
      `${r.overflowExp} ${r.comma} ${r.trailingJunk} ${r.underscored}`,
  );
  want(
    r.padded === '170/null' && r.trailingPoint === '170/null' && r.leadingZeros === '170/null',
    `luật hình dạng đã chặt tay: ' 170 '→${r.padded}, '170.'→${r.trailingPoint}, ` +
      `'00170'→${r.leadingZeros} — đều là cách gõ thật của một chiều cao thật`,
  );

  /* ── B ── */
  want(
    r.real === '2539/126/349/71/2450',
    `70 kg / 170 cm / 26 tuổi ra ${r.real} thay vì 2539/126/349/71/2450 — chuỗi tính đã đổi`,
  );
  want(r.bulkDiffers, 'calcPlan trả cùng một target cho maintain và bulk — mục tiêu không còn được đọc');
  want(
    r.h17 === 'PlanInputError:height_cm' && r.h70 === 'PlanInputError:height_cm' && r.h0 === 'PlanInputError:height_cm',
    `chiều cao 17/70/0 cm vẫn ra một thực đơn: ${r.h17} ${r.h70} ${r.h0} — bản đã ship trả ` +
      '1500 kcal cho 17 cm và 1570 kcal cho 70 cm (đúng ra là 2539), và tệ hơn là im lặng: ' +
      'proteinReferenceWeight lẫn calcWaterTarget đều đọc height_cm < 100 là "KHÔNG CÓ chiều cao", ' +
      'nên một chữ số gõ nhầm TẮT hai cái chốt chứ không chạm vào chúng',
  );
  want(
    r.w700 === 'PlanInputError:weight_kg' && r.wNeg === 'PlanInputError:weight_kg' &&
      r.wNaN === 'PlanInputError:weight_kg' && r.w7 === 'PlanInputError:weight_kg',
    `cân nặng 700/-500/NaN/7 kg vẫn ra một thực đơn: ${r.w700} ${r.wNeg} ${r.wNaN} ${r.w7} — ` +
      'bản đã ship trả 12.304 kcal và 17,5 lít nước một ngày cho 700 kg',
  );
  want(r.hNull === 'PlanInputError:height_cm', `thiếu hẳn chiều cao vẫn ra thực đơn: ${r.hNull}`);
  want(
    r.ageFuture === 'PlanInputError:age' && r.ageAbsurd === 'PlanInputError:age' && r.ageNaN === 'PlanInputError:age',
    `tuổi âm/200/NaN vẫn ra thực đơn: ${r.ageFuture} ${r.ageAbsurd} ${r.ageNaN} — ngày sinh ở tương lai ` +
      'ghi thẳng vào cột dob được (DB không chặn), và bản đã ship quy ra 4081 kcal',
  );
  want(r.newborn, 'tuổi 0 bị từ chối — 0 là tuổi thật của một người, không phải giá trị thiếu');
  want(
    r.stComplete === 'plan:2539',
    `hồ sơ ĐỦ không còn ra đúng một thực đơn: ${r.stComplete} (chờ plan:2539)`,
  );
  want(
    r.stPartialH === 'incomplete:height_cm' && r.stPartialW === 'incomplete:weight_kg' &&
      r.stPartialDob === 'incomplete:dob' && r.stEmptyDob === 'incomplete:dob',
    'hồ sơ THIẾU một ô không ra trạng thái "chưa tính được" gọi đúng tên ô đó: ' +
      `${r.stPartialH} / ${r.stPartialW} / ${r.stPartialDob} / ${r.stEmptyDob}. ` +
      'Tên ô là thứ màn hình dùng để nói người dùng còn thiếu gì — "thiếu gì đó" trên một ' +
      'màn hai mươi ô là một ngõ cụt',
  );
  want(
    r.stEmpty === 'incomplete:height_cm+weight_kg+dob',
    `hồ sơ RỖNG ra ${r.stEmpty} — phải kể ra cả ba ô còn thiếu, không phải dừng ở ô đầu tiên`,
  );
  want(
    r.stMalformedH === 'incomplete:height_cm' && r.stMalformedW === 'incomplete:weight_kg' &&
      r.stHex === 'incomplete:height_cm' && r.stInfinity === 'incomplete:weight_kg' &&
      r.stFutureDob === 'incomplete:dob',
    'hồ sơ MÉO vẫn ra một thực đơn: 17cm→' + r.stMalformedH + ', 700kg→' + r.stMalformedW +
      ', 0xAA→' + r.stHex + ', Infinity→' + r.stInfinity + ', dob 2199→' + r.stFutureDob +
      '. "Chưa tính được" là một trạng thái, không phải một con số nghe hợp lý',
  );
  want(
    r.stNeverThrows,
    'cổng ném ngoại lệ ra tới người gọi — từ chối phải là một GIÁ TRỊ trả về. ' +
      'PlanInputError là chốt cho lập trình viên tiếp theo, không phải câu để hiện lên màn hình',
  );

  /* ── C ── */
  want(
    r.heightFloor === 100 && r.heightCeil === 250,
    `khoảng chiều cao đã đổi thành ${r.heightFloor}–${r.heightCeil}`,
  );
  want(
    r.refBelowFloor === 150 && r.refAtFloor < 150 && r.waterBelowFloor !== r.waterAtFloor,
    'ngay dưới sàn chiều cao, proteinReferenceWeight và calcWaterTarget KHÔNG còn quay về nhánh ' +
      '"không có chiều cao" như trước — hai con số này phải bằng nhau: sàn của BOUNDS.height_cm ' +
      'chính là ngưỡng mà hai hàm kia coi là thiếu chiều cao. Hạ sàn xuống dưới nó là cho lọt ' +
      'đúng những giá trị TẮT hai cái chốt đó ' +
      `(đo được: ref ${r.refAtFloor} → ${r.refBelowFloor}, nước ${r.waterAtFloor} → ${r.waterBelowFloor})`,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule D — onboarding writes the reading, and will not move on without it
   ───────────────────────────────────────────────────────────────────────── */
{
  const onb = read('src/components/ascnd/onboarding-flow.tsx');
  const code = strip(onb);

  /* ── the gate, not a spelling ──

     This rule named `readStat('height_cm', heightCm, true)` until the screens
     moved onto the shared `planFromEntry`. The property never changed; the
     identifiers did. What it asks now is structural: the row this screen
     persists is the gate's own answer, and nothing in the payload re-derives a
     number the gate never saw. */
  if (!/planFromEntry\(/.test(code)) {
    problems.push(
      'onboarding không còn đi qua cổng chung planFromEntry — đây là màn DUY NHẤT tạo ra ' +
        'con số cho cả tài khoản, và nó ghi kèm onboarding_completed: true',
    );
  }

  const at = code.indexOf("from('profiles').upsert(");
  const row = at === -1 ? '' : code.slice(at, at + 1600);
  if (at === -1) {
    problems.push('không tìm thấy upsert profiles trong onboarding — luật này không còn đọc đúng chỗ');
  }
  for (const col of ['height_cm', 'weight_kg']) {
    if (!new RegExp(`${col}:\\s*\\w+\\.${col}\\b`).test(row)) {
      problems.push(`upsert của onboarding không ghi ${col} từ kết quả của cổng — số đã kiểm và số được ghi phải là một`);
    }
  }
  for (const col of ['tdee_target_kcal', 'macro_protein_g', 'macro_carbs_g', 'macro_fat_g', 'macro_fiber_g', 'water_target_ml']) {
    if (!new RegExp(`${col}:\\s*[\\w.]*plan\\.${col}\\b`).test(row)) {
      problems.push(`onboarding ghi ${col} từ đâu đó không phải thực đơn của cổng — thực đơn phải đến từ một chuỗi tính duy nhất`);
    }
  }
  /* nothing in the payload re-parses what the gate already read */
  if (/Number\(|parseFloat\(|\?\?\s*[1-9]|\|\|\s*[1-9]/.test(row)) {
    problems.push(
      'payload upsert của onboarding còn phân tích lại một con số — màn hình kiểm một bản ' +
        'phân tích rồi ghi một bản khác chỉ đúng do may mắn',
    );
  }
  /* the write itself refuses, whatever the screen did */
  if (!/if\s*\(\s*!\w+\.ok\s*\)\s*\{?\s*\n?\s*throw/.test(code)) {
    problems.push('mutationFn của onboarding không chặn khi cổng từ chối — "không với tới được" là phát biểu về màn hình, không phải về câu ghi');
  }
  /* and step 0 cannot be walked past */
  if (!/disabled=\{step === 0 && \w+\}/.test(code) || !/!\w*\.ok\b/.test(code)) {
    problems.push(
      'nút Tiếp ở bước 0 không còn khoá theo phán quyết của cổng — mọi bước sau đều là câu hỏi ' +
        'về một cơ thể chưa biết',
    );
  }
  if (!/statsBad/.test(code.split('onboardingDone')[0].slice(-800))) {
    problems.push('nút Hoàn tất không xét trạng thái số đo');
  }
  if (!/styles\.fieldError/.test(code)) {
    problems.push('onboarding không hiện câu báo lỗi dưới ô — khoá nút mà không nói vì sao là một màn hình chết');
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule E — Sửa hồ sơ opens on what is stored, and Recalculate asks first
   ───────────────────────────────────────────────────────────────────────── */
{
  const code = strip(read('src/app/edit-profile.tsx'));

  for (const col of ['height_cm', 'weight_kg', 'tdee_target_kcal', 'macro_protein_g',
    'macro_carbs_g', 'macro_fat_g', 'macro_fiber_g', 'water_target_ml', 'sleep_target_hours']) {
    if (!new RegExp(`${col}:\\s*numText\\(profile\\.${col}\\)`).test(code)) {
      problems.push(
        `form Sửa hồ sơ nạp ${col} không qua numText — một cột null mở ra thành một con số bịa, ` +
          'và một lần bấm Lưu biến nó thành số đo của người đó',
      );
    }
  }
  if (/height_cm:\s*'1\d\d'|weight_kg:\s*'\d/.test(code)) {
    problems.push('EMPTY của form lại mang sẵn một cơ thể — form còn hiện trước khi hồ sơ về');
  }
  /* ── the two writers, read structurally ──

     Anchored to shape, not to spelling. An earlier version of this rule named
     the identifiers (`readStat('height_cm', form.height_cm, true)`,
     `toast.error(i18n.statsRequired)`) and went red the moment the screen was
     refactored to take one reading instead of two — the property had not
     changed at all. A rule that a rename can break is a rule about names. */

  /** The body of a top-level `const <name> = ... => {` … `\n  };` in this file. */
  const bodyOf = (name) => {
    const at = code.indexOf(`const ${name} =`);
    if (at === -1) return null;
    const end = code.indexOf('\n  };', at);
    return end === -1 ? code.slice(at) : code.slice(at, end);
  };

  const recalc = bodyOf('recalcTargets');
  if (recalc === null) {
    problems.push('không tìm thấy recalcTargets — luật này không còn đọc đúng chỗ');
  } else {
    if (!/planFromEntry\(/.test(recalc)) {
      problems.push('Tính lại không còn đi qua cổng chung planFromEntry — chuỗi tính lại bị chép tay lần nữa');
    }
    /* refuses before it reads a plan, and says so out loud */
    const guardAt = recalc.search(/if\s*\(\s*!\w+\.ok\s*\)/);
    const planAt = recalc.search(/\w+\.plan\b/);
    if (guardAt === -1 || planAt === -1 || guardAt > planAt) {
      problems.push(
        'Tính lại đọc thực đơn trước khi kiểm phán quyết của cổng — bản đã ship thay bằng ' +
          '70 kg / 170 cm / 30 tuổi rồi ghi kết quả vào hồ sơ như thể đó là mục tiêu của người dùng',
      );
    } else {
      const guard = recalc.slice(guardAt, planAt);
      if (!/\breturn\b/.test(guard)) {
        problems.push('chốt của Tính lại không thoát ra — kiểm rồi tính tiếp thì chốt đó không tồn tại');
      }
      if (!/toast\.(error|success)\(/.test(guard) || !/i18n\./.test(guard)) {
        problems.push('Tính lại từ chối trong im lặng — một nút không phản ứng là một nút hỏng');
      }
      if (!/missing/.test(guard)) {
        problems.push('Tính lại không nói THIẾU Ô NÀO — "thiếu gì đó" trên một màn hai mươi ô là một ngõ cụt');
      }
    }
    if (/Number\(|parseFloat\(|\?\?\s*[1-9]|\|\|\s*[1-9]/.test(recalc)) {
      problems.push('Tính lại còn phân tích lại một con số thay vì dùng kết quả của cổng');
    }
  }

  /* The save payload must persist the reading that was validated, not a second
     parse of the same box. This is the boundary the UI error does not cover:
     "the button was disabled" is a statement about a screen, and the payload is
     what reaches the table. */
  const upAt = code.indexOf('.update({');
  const payload = upAt === -1 ? '' : code.slice(upAt, upAt + 1400);
  if (upAt === -1) {
    problems.push('không tìm thấy payload update của Sửa hồ sơ — luật này không còn đọc đúng chỗ');
  }
  for (const col of ['height_cm', 'weight_kg']) {
    if (!new RegExp(`${col}:\\s*\\w+\\.value\\b`).test(payload)) {
      problems.push(
        `payload Lưu của Sửa hồ sơ ghi ${col} bằng một lần phân tích khác với lần đã kiểm — ` +
          'một màn hình kiểm một bản phân tích rồi ghi một bản khác chỉ đúng do may mắn, ' +
          'và bản được ghi là bản KHÔNG có khoảng giá trị nào gắn vào',
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule F — one chain, and nothing substitutes a body anywhere
   ───────────────────────────────────────────────────────────────────────── */
{
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) files.push(p);
    }
  })(path.join(NATIVE, 'src'));

  /* The chain lives in one file. It was written out twice and the two copies
     had already drifted — that is how there came to be three defaults for one
     column — so a second copy is the fault, not the symptom.

     The four listed are the ones that take a *body*, which is what makes them
     the chain: nothing outside `fitness-calc` has a body to give them that has
     not been through `readStat` first. `calcTargetCalories` and `calcTDEE` are
     deliberately not listed — `smart-goals` applies the goal multiplier to a
     **measured** expenditure from `adaptiveTDEE`, which never touches a height
     or a weight and is a different question with the same last step. */
  const CHAIN = ['calcBMR', 'calcMacros', 'calcWaterTarget', 'proteinReferenceWeight'];
  for (const f of files) {
    const rel = path.relative(NATIVE, f);
    if (rel === 'src/lib/fitness-calc.ts') continue;
    const code = strip(readFileSync(f, 'utf8'));
    for (const fn of CHAIN) {
      if (new RegExp(`\\b${fn}\\s*\\(`).test(code)) {
        problems.push(
          `${rel} gọi thẳng ${fn}( — mọi hàm nhận một CƠ THỂ phải đi qua calcPlan, ` +
            'vì hai bản chép tay của chuỗi này đã lệch nhau một lần rồi (175 với 170 cho cùng một cột)',
        );
      }
    }
  }

  /* The substitution, in the spelling it had. `|| 0` is not caught and must not
     be: zero is how several call sites say "no height", which is the honest
     answer. What is forbidden is standing a real body in for a missing one. */
  const SUBST = /\b(weight_kg|height_cm|weightKg|heightCm)\b[^\n;]{0,60}?(\?\?|\|\|)\s*([1-9]\d*(\.\d+)?)/;
  for (const f of files) {
    const rel = path.relative(NATIVE, f);
    if (rel === 'src/lib/plausible.ts' || rel === 'src/lib/fitness-calc.ts') continue;
    for (const line of strip(readFileSync(f, 'utf8')).split('\n')) {
      const m = SUBST.exec(line);
      if (m) {
        problems.push(
          `${rel}: \`${line.trim().slice(0, 80)}\` — thay một con số thật vào chỗ một số đo còn thiếu. ` +
            'Đây chính là lỗi của vòng này: ô trống ra 70 kg / 170 cm và không có gì trên màn hình nói đó là số bịa',
        );
        break;
      }
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   Rule G — every writer to `profiles` goes through the shared boundary
   ───────────────────────────────────────────────────────────────────────── */
{
  const files = [];
  (function walk(dir) {
    for (const e of readdirSync(dir)) {
      const p = path.join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e)) files.push(p);
    }
  })(path.join(NATIVE, 'src'));

  /* Traced rather than assumed, because assuming is how this round started:
     onboarding was treated as the only screen that writes a body, and it was
     not. Today the writers are onboarding, Sửa hồ sơ, and `weight-sync` — the
     one that is not a screen at all and persists straight into the column
     `calcPlan` later reads. A fourth one added without a bound goes red here. */
  const writers = [];
  for (const f of files) {
    const code = strip(readFileSync(f, 'utf8'));
    if (!/from\('profiles'\)/.test(code)) continue;
    /* a writer, not a reader */
    if (!/from\('profiles'\)[\s\S]{0,120}?\.\s*(insert|upsert|update)\(/.test(code)) continue;
    writers.push([path.relative(NATIVE, f), code]);
  }

  if (writers.length < 3) {
    problems.push(`chỉ thấy ${writers.length} chỗ ghi vào profiles — luật này không còn tìm đúng chỗ (chờ ít nhất 3)`);
  }
  for (const [rel, code] of writers) {
    if (!/plausible\(|readStat\(|planFromEntry\(/.test(code)) {
      problems.push(
        `${rel} ghi vào profiles mà không đi qua ranh giới kiểm chung (plausible / readStat / ` +
          'planFromEntry) — không có CHECK nào trên bảng profiles, nên tầng ứng dụng LÀ ranh giới, ' +
          'và một chỗ ghi bỏ qua nó thì cả vòng này không còn ý nghĩa gì',
      );
    }
  }
}

if (problems.length) {
  console.log('hồ sơ / onboarding còn hở:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hồ sơ/onboarding OK — CHẠY THẬT readStat và calcPlan: ô trống ở onboarding ra "missing" chứ không ' +
    'ra 70 kg / 170 cm, ô trống ở Sửa hồ sơ vẫn được phép, và 17/70/0 cm, 700/7/-500/NaN kg, tuổi ' +
    'âm/200/NaN đều bị calcPlan TỪ CHỐI thay vì trả về một thực đơn (bản đã ship: 17 cm → 1500 kcal, ' +
    '70 cm → 1570 kcal thay vì 2539, 700 kg → 12.304 kcal và 17,5 lít nước). Sàn chiều cao của BOUNDS ' +
    'trùng đúng ngưỡng mà proteinReferenceWeight và calcWaterTarget coi là "không có chiều cao", nên ' +
    'một chữ số gõ nhầm không thể TẮT hai cái chốt đó nữa. Onboarding khoá nút Tiếp ở bước 0 và nói vì ' +
    'sao, ghi đúng height.value/weight.value và toàn bộ thực đơn từ calcPlan; Sửa hồ sơ mở ra đúng ' +
    'những gì đã lưu (cột null là ô trống, không phải 175 cm) và Tính lại đòi đủ chiều cao, cân nặng, ' +
    'ngày sinh. Chuỗi BMR→TDEE→kcal→macro→nước chỉ tồn tại ở một chỗ, và không file nào trong src còn ' +
    'thay một cơ thể thật vào chỗ một số đo còn thiếu',
);
