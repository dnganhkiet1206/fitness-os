/**
 * Extra exercise a11y/i18n — C (#462, audit PR #410/#411).
 *
 * Những lỗi đã bắt được bằng audit tay trên slice C-38:
 *
 * 1. `common.cancel` chưa từng có trong xcstrings của branch này — nút Huỷ
 *    trong dialog xác nhận xoá hiện key thô.
 * 2. `FinishedSessionRemoveView` dùng `.accessibilityElement(children:
 *    .combine)` — gộp 2 nút Huỷ/Xoá thành MỘT phần tử, VoiceOver không bấm
 *    riêng từng nút được. Phải là `.contain`.
 * 3. Ba nút dưới 44pt: nút xoá trong ExtraExerciseRow (~20pt), nút Undo
 *    `.controlSize(.small)` (~28pt), 2 nút dialog finished-remove (~34pt).
 * 4. `ExtraExerciseRow` giữ `@State editedName` init một lần — parent đổi tên
 *    từ bên ngoài (cùng id) thì TextField giữ tên cũ. Phải sync qua onChange.
 * 5. `UndoBannerContainer` tái dùng cho lần xoá khác (cùng identity) thì đếm
 *    ngược giữ số giây cũ — phải reset khi exerciseName đổi.
 * 6. Chữ tên bài tập trong UndoBanner `.lineLimit(1)` — cắt ở Dynamic Type lớn.
 *
 * Không đụng: Stepper `1...maxExtraSets` đã chặn ở UI seam (model seam là
 * contract A20 #399, chưa có — không bịa); undo timer đã an toàn (main thread,
 * invalidate khi disappear/undo, onExpire một lần); SetRow `.constant()` là
 * trạng thái base cũ, đã fix ở #389 — không sửa trùng ở đây.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '..', '..');
const WORKOUT = path.join(REPO, 'apps/ios/ASCND/Features/Workout');
const XCSTRINGS = path.join(REPO, 'apps/ios/ASCND/Resources/Localizable.xcstrings');

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const row = readFileSync(path.join(WORKOUT, 'ExtraExerciseRow.swift'), 'utf8');
const undo = readFileSync(path.join(WORKOUT, 'UndoBanner.swift'), 'utf8');
const remove = readFileSync(path.join(WORKOUT, 'FinishedSessionRemoveView.swift'), 'utf8');

// 1. Mọi key extra.* + common.cancel đủ en/vi/es, state translated.
const xs = JSON.parse(readFileSync(XCSTRINGS, 'utf8'));
const needed = [
  'common.cancel',
  'extra.exercise.delete', 'extra.exercise.delete.confirm', 'extra.exercise.delete.confirm.title',
  'extra.exercise.incomplete', 'extra.exercise.name.label', 'extra.exercise.name.placeholder',
  'extra.exercise.sets.label', 'extra.exercise.sets.max.format',
  'extra.remove.finished.title', 'extra.remove.finished.message.format', 'extra.remove.finished.confirm',
  'extra.undo.action', 'extra.undo.countdown.format', 'extra.undo.deleted.format', 'extra.undo.hint.format',
];
for (const k of needed) {
  const e = xs.strings[k];
  check(!!e, `xcstrings: thiếu key '${k}'`);
  for (const loc of ['en', 'vi', 'es']) {
    const u = e && e.localizations && e.localizations[loc] && e.localizations[loc].stringUnit;
    check(!!(u && u.value && u.state === 'translated'),
      `xcstrings: key '${k}' thiếu bản dịch '${loc}' (state=translated)`);
  }
}

// 2. Không .combine nuốt nút trong dialog xoá finished session.
check(!/\.accessibilityElement\(children:\s*\.combine\)/.test(remove),
  'FinishedSessionRemoveView.swift: .combine gộp 2 nút thành 1 phần tử — phải .contain');
check(/\.accessibilityElement\(children:\s*\.contain\)/.test(remove),
  'FinishedSessionRemoveView.swift: phải .accessibilityElement(children: .contain)');

// 3. 44pt targets.
check(/\.frame\(minHeight:\s*44\)/.test(remove),
  'FinishedSessionRemoveView.swift: 2 nút dialog phải minHeight 44');
check(/\.frame\(maxWidth:\s*\.infinity,\s*minHeight:\s*44/.test(row),
  'ExtraExerciseRow.swift: nút xoá phải minHeight 44');
check(/\.frame\(minHeight:\s*44\)/.test(undo),
  'UndoBanner.swift: nút Undo phải minHeight 44 (không controlSize small)');

// 4. Sync tên khi parent đổi (cùng id).
check(/\.onChange\(of:\s*exercise\.name\)/.test(row),
  'ExtraExerciseRow.swift: thiếu .onChange(of: exercise.name) sync tên từ parent');

// 5. Reset đếm ngược khi tái dùng container.
check(/\.onChange\(of:\s*exerciseName\)/.test(undo),
  'UndoBanner.swift: thiếu .onChange(of: exerciseName) reset countdown');

// 6. Không cắt tên bài tập ở Dynamic Type lớn.
check(!/extra\.undo\.deleted\.format[\s\S]{0,400}\.lineLimit\(1\)/.test(undo),
  'UndoBanner.swift: tên bài tập không được .lineLimit(1)');

// 7. Stepper chặn max-20 ở UI seam.
check(/in:\s*1\.\.\.maxExtraSets/.test(row),
  'ExtraExerciseRow.swift: Stepper phải giới hạn in: 1...maxExtraSets');

if (problems.length) {
  console.error('extra exercise a11y/i18n (#462):');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('extra exercise a11y/i18n (#462): keys đủ en/vi/es, không nuốt nút, 44pt, sync tên, reset countdown');
