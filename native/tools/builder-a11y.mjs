/**
 * Builder a11y/i18n — C (#466), cập nhật cho builder viết lại (#527 Phase 2).
 *
 * 4 findings cụ thể từ audit rewrite, mỗi cái đã từng "đúng mà sai":
 *
 * 1. TemplateListView dùng `.onTapGesture` trên hàng List — chạm tay thì
 *    được, nhưng VoiceOver không thấy đây là một nút: không có trait button,
 *    không có "double-tap to activate". Phải là control thật (`Button`,
 *    `DisclosureGroup`).
 * 2. TemplateRowView gán `accessibilityLabel` chứa chữ "exercises" cứng —
 *    trong khi hợp đồng en/vi/es bắt mọi chuỗi qua xcstrings. (Kèm bug thật:
 *    key đếm bài chưa từng tồn tại trong xcstrings nên chữ hiện trên hàng
 *    cũng là key thô.)
 * 3. WeekdayButton vẽ vòng tròn 36×36 — dưới mức tối thiểu 44pt của HIG.
 *    Hit target phải ≥44pt.
 * 4. Overlay "đang lưu" và các dòng lỗi xuất hiện mà VoiceOver không hay —
 *    focus vẫn nằm trên nút Save đã bị disable đằng sau.
 *
 * Builder viết lại (`TemplateListView` / `TemplateFormView` theo
 * `app/templates.tsx` + `app/workout-builder.tsx` @ fac9ac2) bỏ
 * `WeekdayAssignmentView` (RN builder không gán thứ; gán ngày ở màn Plan) và
 * `WorkoutBuilderModels`. Các luật quét mọi file `.swift` trong
 * `Features/Builder/`, nên màn mới thêm vào đây cũng bị giữ.
 *
 * Cổng này giữ cả 4 + #462: đỏ khi bất kỳ pattern nào quay lại.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '..', '..');
const BUILDER = path.join(REPO, 'apps/ios/ASCND/Features/Builder');
const XCSTRINGS = path.join(REPO, 'apps/ios/ASCND/Resources/Localizable.xcstrings');
const DSBUTTON = path.join(REPO, 'apps/ios/Packages/ASCNDKit/Sources/ASCNDDesignSystem/DSButton.swift');

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };
// Đối số của một lời gọi, cho phép một tầng ngoặc lồng (`String(localized: …)`).
const ARGS = String.raw`\((?:[^()]|\([^()]*\))*\)`;

const builderFiles = readdirSync(BUILDER).filter((f) => f.endsWith('.swift')).sort()
  .map((f) => [f, readFileSync(path.join(BUILDER, f), 'utf8')]);
const src = Object.fromEntries(builderFiles);
for (const f of ['TemplateListView.swift', 'TemplateFormView.swift', 'WorkoutBuilderView.swift']) {
  check(f in src, `Features/Builder: thiếu ${f}`);
}
const list = src['TemplateListView.swift'] ?? '';
const form = src['TemplateFormView.swift'] ?? '';

// 1. Không onTapGesture ở bất kỳ màn builder nào — phải là control thật.
for (const [f, s] of builderFiles) {
  check(!/\.onTapGesture/.test(s), `${f}: còn .onTapGesture — phải dùng Button / DisclosureGroup`);
}
check(/DisclosureGroup\s*\{/.test(list),
  'TemplateListView.swift: hàng buổi tập phải là DisclosureGroup (control có trait button)');
check(/Button\s*\{\s*draft\.toggle\(/.test(form),
  'TemplateFormView.swift: hàng thư viện phải là Button gọi draft.toggle');

// 2. Không hardcode "exercises" trong label trợ năng; key đếm đủ en/vi/es.
// Bắt đúng dạng cũ: accessibilityLabel("... exercises") — literal không chứa
// dấu " nên [^"]* ăn trọn cả \(...) interpolation bên trong.
for (const [f, s] of builderFiles) {
  check(!/accessibilityLabel\("[^"]*exercises/.test(s),
    `${f}: còn hardcode "exercises" trong accessibilityLabel — phải qua key i18n`);
}
check(/"wb\.list\.meta \\\(/.test(list),
  'TemplateListView.swift: số bài / số set của hàng phải qua key wb.list.meta');
check(/accessibilityLabel\(Text\(String\(localized: "wb\.delete\.a11y \\\(/.test(list),
  'TemplateListView.swift: nút xoá (chỉ có icon) phải có accessibilityLabel qua key wb.delete.a11y');
const xs = JSON.parse(readFileSync(XCSTRINGS, 'utf8'));
for (const k of ['wb.list.meta %lld %lld', 'wb.delete.a11y %@', 'wb.saving', 'wb.saved']) {
  const e = xs.strings[k];
  check(!!e, `xcstrings: thiếu key '${k}'`);
  for (const loc of ['en', 'vi', 'es']) {
    const v = e && e.localizations && e.localizations[loc] && e.localizations[loc].stringUnit;
    check(!!(v && v.value && v.state === 'translated'),
      `xcstrings: key '${k}' thiếu bản dịch '${loc}' (state=translated)`);
  }
}

// 3. Hit target ≥44pt: không frame cố định nào dưới 44 trên màn builder, và
// nút chỉ có icon phải tự nới vùng chạm.
for (const [f, s] of builderFiles) {
  for (const m of s.matchAll(/\.frame\(width:\s*(\d+(?:\.\d+)?),\s*height:\s*(\d+(?:\.\d+)?)\)/g)) {
    check(Number(m[1]) >= 44 && Number(m[2]) >= 44, `${f}: ${m[0]} dưới 44pt`);
  }
}
for (const [f, s] of builderFiles) {
  // Nút chỉ có icon (`} label: { Image(systemName:) … }`): icon nhỏ hơn 44pt
  // nhiều, nên label phải tự nới vùng chạm — như WeekdayButton năm xưa.
  for (const m of s.matchAll(/\}\s*label:\s*\{\s*Image\(systemName:\s*("[^"]+")([^}]*)\}/g)) {
    check(/\.frame\(minWidth:\s*44,\s*minHeight:\s*44\)/.test(m[2]),
      `${f}: nút icon ${m[1]} phải frame(minWidth: 44, minHeight: 44)`);
  }
}
check(/Image\(systemName: "trash"\)[^}]*\.frame\(minWidth:\s*44,\s*minHeight:\s*44\)/.test(list),
  'TemplateListView.swift: nút xoá (icon) phải frame(minWidth: 44, minHeight: 44)');

// 4. VoiceOver announcements cho saving/error states.
check(/func announceForVoiceOver/.test(form),
  'TemplateFormView.swift: thiếu announceForVoiceOver');
for (const s of ['saving', 'failure']) {
  check(new RegExp(`\\.onChange\\(of:\\s*${s}\\)`).test(form),
    `TemplateFormView.swift: thiếu .onChange(of: ${s}) để thông báo VoiceOver`);
}
check(/announceForVoiceOver\(String\(localized: "wb\.saved"\)\)/.test(form),
  'TemplateFormView.swift: lưu xong phải thông báo wb.saved');

// #462 (audit PR #410): nút Thử lại phải là callback thật (không action rỗng),
// và các nút trong builder phải đủ 44pt.
for (const [f, s] of builderFiles) {
  check(!new RegExp(String.raw`DSErrorView${ARGS}\s*\{\s*\}`).test(s), `${f}: DSErrorView có nút Thử lại rỗng`);
  for (const m of s.matchAll(/\.buttonStyle\(\.(bordered|borderedProminent)\)(\s*\n?\s*\.frame\(minHeight:\s*44\))?/g)) {
    check(!!m[2], `${f}: nút .${m[1]} phải minHeight 44`);
  }
}
check(new RegExp(String.raw`DSErrorView${ARGS}\s*\{\s*Task\s*\{\s*await flow\.refresh\(\)\s*\}`).test(list),
  'TemplateListView.swift: lỗi đọc phải có Thử lại gọi flow.refresh()');
check(new RegExp(String.raw`DSErrorView${ARGS}\s*\{\s*Task\s*\{\s*await library\.refresh\(\)\s*\}`).test(form),
  'TemplateFormView.swift: lỗi đọc thư viện phải có Thử lại gọi library.refresh()');
check(/DSButton\(String\(localized: "wb\.createNew"\)/.test(list),
  'TemplateListView.swift: nút Tạo mới phải là DSButton (vùng chạm ≥44pt)');
check(/\.frame\(minHeight:\s*(4[4-9]|[5-9]\d)\)/.test(readFileSync(DSBUTTON, 'utf8')),
  'DSButton.swift: vùng chạm phải ≥44pt');

if (problems.length) {
  console.error('builder a11y/i18n (#466/#462):');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`builder a11y/i18n: #466 4 findings + #462 (Thử lại thật, nút ≥44pt) được giữ trên ${builderFiles.length} file`);
