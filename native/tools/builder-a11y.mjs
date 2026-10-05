/**
 * Builder a11y/i18n — C (#466).
 *
 * 4 findings cụ thể từ audit rewrite, mỗi cái đã từng "đúng mà sai":
 *
 * 1. TemplateListView dùng `.onTapGesture` trên hàng List — chạm tay thì
 *    được, nhưng VoiceOver không thấy đây là một nút: không có trait button,
 *    không có "double-tap to activate". Phải là `Button` thật.
 * 2. TemplateRowView gán `accessibilityLabel` chứa chữ "exercises" cứng —
 *    trong khi hợp đồng en/vi/es bắt mọi chuỗi qua xcstrings. (Kèm bug thật:
 *    key `builder.exercise.count` chưa từng tồn tại trong xcstrings nên chữ
 *    hiện trên hàng cũng là key thô.)
 * 3. WeekdayButton vẽ vòng tròn 36×36 — dưới mức tối thiểu 44pt của HIG.
 *    Hit target phải ≥44pt mà vòng tròn hiển thị giữ nguyên.
 * 4. Overlay "đang lưu" và các dòng lỗi xuất hiện mà VoiceOver không hay —
 *    focus vẫn nằm trên nút Save đã bị disable đằng sau overlay.
 *
 * Cổng này giữ cả 4: đỏ khi bất kỳ pattern nào quay lại.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(TOOLS, '..', '..');
const BUILDER = path.join(REPO, 'apps/ios/ASCND/Features/Builder');
const XCSTRINGS = path.join(REPO, 'apps/ios/ASCND/Resources/Localizable.xcstrings');

const problems = [];
const check = (cond, msg) => { if (!cond) problems.push(msg); };

const list = readFileSync(path.join(BUILDER, 'TemplateListView.swift'), 'utf8');
const weekday = readFileSync(path.join(BUILDER, 'WeekdayAssignmentView.swift'), 'utf8');
const form = readFileSync(path.join(BUILDER, 'TemplateFormView.swift'), 'utf8');

// 1. Không onTapGesture trên hàng List — phải là Button đúng semantics.
check(!/\.onTapGesture/.test(list),
  'TemplateListView.swift: còn .onTapGesture trên hàng — phải dùng Button');
check(/Button\s*\{[^}]*onSelect\(template\)/.test(list),
  'TemplateListView.swift: hàng phải là Button gọi onSelect(template)');
check(/\.buttonStyle\(\.plain\)/.test(list),
  'TemplateListView.swift: Button hàng phải .buttonStyle(.plain) để giữ giao diện');

// 2. Không hardcode "exercises" trong label trợ năng; key đếm đủ en/vi/es.
// Bắt đúng dạng cũ: accessibilityLabel("... exercises") — literal không chứa
// dấu " nên [^"]* ăn trọn cả \(...) interpolation bên trong.
const builderFiles = ['TemplateListView.swift', 'TemplateFormView.swift', 'WeekdayAssignmentView.swift', 'WorkoutBuilderView.swift']
  .map((f) => [f, readFileSync(path.join(BUILDER, f), 'utf8')]);
for (const [f, src] of builderFiles) {
  check(!/accessibilityLabel\("[^"]*exercises/.test(src),
    `${f}: còn hardcode "exercises" trong accessibilityLabel — phải qua key i18n`);
}
check(/builder\.exercise\.count\.one/.test(list) && /builder\.exercise\.count\.other/.test(list),
  'TemplateListView.swift: phải dùng key builder.exercise.count.one/other');
const xs = JSON.parse(readFileSync(XCSTRINGS, 'utf8'));
for (const k of ['builder.exercise.count.one', 'builder.exercise.count.other %lld']) {
  const e = xs.strings[k];
  check(!!e, `xcstrings: thiếu key '${k}'`);
  for (const loc of ['en', 'vi', 'es']) {
    const v = e && e.localizations && e.localizations[loc] && e.localizations[loc].stringUnit;
    check(!!(v && v.value && v.state === 'translated'),
      `xcstrings: key '${k}' thiếu bản dịch '${loc}' (state=translated)`);
  }
}

// 3. WeekdayButton hit target ≥44pt.
check(/\.frame\(width:\s*44,\s*height:\s*44\)/.test(weekday),
  'WeekdayAssignmentView.swift: WeekdayButton phải có frame 44×44');

// 4. VoiceOver announcements cho saving/error states.
check(/func announceForVoiceOver/.test(form),
  'TemplateFormView.swift: thiếu announceForVoiceOver');
for (const s of ['isSaving', 'saveError', 'validationError']) {
  check(new RegExp(`\\.onChange\\(of:\\s*${s}\\)`).test(form),
    `TemplateFormView.swift: thiếu .onChange(of: ${s}) để thông báo VoiceOver`);
}

if (problems.length) {
  console.error('builder a11y/i18n (#466):');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log('builder a11y/i18n (#466): 4 findings được giữ (Button semantics, key đếm en/vi/es, 44pt, announcements)');
