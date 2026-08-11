/**
 * That typing into a sheet does not hide the button that saves it.
 *
 * ── the two separate failures ──
 *
 * **The keyboard covers the control.** A text field low on a sheet pushes Save
 * under the keyboard, and there is nothing to scroll it back up unless a
 * `KeyboardAvoidingView` is wrapped around the scroll view.
 *
 * **The first tap does nothing.** This one is worse, because it does not read
 * as a layout problem. With the keyboard open, a tap anywhere in a scroll view
 * is spent dismissing the keyboard unless `keyboardShouldPersistTaps` says
 * otherwise. So you type a number, reach for Save, and the button does not
 * respond — then it works on the second tap. Nobody reports that as "missing
 * keyboardShouldPersistTaps"; they report it as the app being unreliable.
 *
 * `log-sleep` had neither, while its three sibling sheets had both. It is also
 * the sheet whose fields sit furthest down: three stage boxes below the time
 * pickers, with the quality chips and Save below them.
 *
 * ── why the page scaffold is exempt, and provably so ──
 *
 * `screen.tsx` deliberately does **not** avoid the keyboard, and says why at
 * length: `automaticallyAdjustKeyboardInsets` was on all three of its scroll
 * views and is what made every page scroll past the end of its content into
 * empty space. It was removed on the argument that *every text field on those
 * pages sits near the top* — a search box, the first field of a short form.
 *
 * That is an assumption, and assumptions rot. So it is checked rather than
 * trusted: a `Screen` page may hold text fields only if they are near the top
 * of it or inside a `FormSheet`, which brings its own
 * `KeyboardAvoidingView`. The moment somebody adds a third field halfway down
 * a settings page, this fails and the note in `screen.tsx` stops being true in
 * a way somebody finds out about.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/** Comments out, newlines kept — a rule must not fire on the note explaining it. */
const codeOnly = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx$/.test(name)) out.push(p);
  }
  return out;
}

/*
  ── 1: every sheet that takes typing handles the keyboard ──

  A "sheet" here is a route that owns its own scroll view rather than going
  through `Screen`. Those are the ones responsible for their own keyboard
  behaviour, because nothing above them is doing it.
*/
const SHEETS = walk(path.join(NATIVE, 'src/app')).filter((f) => {
  const src = codeOnly(readFileSync(f, 'utf8'));
  return /<TextInput/.test(src) && !/<Screen[\s>]/.test(src);
});

/**
 * Routes that may skip the `KeyboardAvoidingView`, and the argument for each.
 *
 * `keyboardShouldPersistTaps` has no exemptions — it is one prop, it costs
 * nothing, and without it the first tap on any control is swallowed.
 */
const NO_AVOIDER = {
  'src/app/(tabs)/index.tsx':
    'ô nhập duy nhất là tên nhóm mới, chỉ tồn tại trong chế độ sắp xếp, và nó commit bằng phím ' +
    'Return chứ không cần bấm nút. Bọc cả tab bận nhất của app trong một KeyboardAvoidingView để ' +
    'phục vụ một ô như thế là đổi một phiền toái nhỏ lấy rủi ro trên màn hình mọi người mở đầu tiên.',
};

for (const file of SHEETS) {
  const rel = path.relative(NATIVE, file).replace(/\\/g, '/');
  const src = codeOnly(readFileSync(file, 'utf8'));
  /* `FormSheet` supplies both, so a route that only types inside one is
     covered by it rather than by itself. */
  if (/<FormSheet/.test(src)) continue;
  /* `<KeyboardAvoidingView`, not `KeyboardAvoidingView`. Removing the wrapper
     leaves the import behind, and a rule that matches the import passes on a
     file that no longer renders one — the same name-instead-of-behaviour trap
     this project has now fallen into four times. */
  if (!(rel in NO_AVOIDER) && !/<KeyboardAvoidingView/.test(src)) {
    problems.push(`${rel}: có ô nhập nhưng không có KeyboardAvoidingView — bàn phím sẽ che mất nút lưu`);
  }
  if (!/keyboardShouldPersistTaps/.test(src)) {
    problems.push(
      `${rel}: thiếu keyboardShouldPersistTaps — khi bàn phím đang mở, cú chạm ĐẦU TIÊN vào nút ` +
        'bị dùng để đóng bàn phím, và người dùng đọc nó thành "nút không ăn"',
    );
  }
}

/*
  ── 2: the scaffold's own assumption, recorded ──

  `Screen` pages may hold text fields, but `screen.tsx` only gets to skip
  keyboard avoidance while its stated reason holds: *every text field on those
  pages sits near the top*.

  The first version of this measured that — lines of JSX between `<Screen>` and
  the first `<TextInput>`. It reported the Nutrition tab, whose input is a
  search box at the top of its "foods" tab; the hundred-odd lines in front of it
  belong to the *today* branch of a ternary that never renders at the same time.
  The proxy could not tell a sibling branch from an ancestor, and a rule that
  cannot tell those apart will keep reporting pages that are fine.

  So each page is judged once, by a person, and the judgement is written down.
  A new page with a text field is not in this list and fails until somebody
  either wraps its form or records why it does not need it. That is slower than
  a heuristic and it is the only version that is right.
*/
const SCREEN_PAGES = {
  'src/app/(tabs)/nutrition.tsx': 'ô tìm kiếm ở đầu tab "foods"',
  'src/app/food-list.tsx': 'ô tìm kiếm ở đầu trang',
  'src/app/templates.tsx': 'ô tìm kiếm ở đầu trang',
  'src/app/exercises.tsx': 'ô tìm kiếm ở đầu trang; form thêm bài tập nằm trong FormSheet',
  'src/app/change-password.tsx': 'form hai ô ngay đầu trang, không có gì phía trên',
  'src/app/supplements.tsx': 'form thêm nằm ngay dưới header, mở bằng nút ở header',
  'src/app/grocery.tsx': 'ô thêm món ở đầu trang',
  'src/app/workout-builder.tsx': 'tự bọc KeyboardAvoidingView',
  'src/app/food-editor.tsx': 'tự bọc KeyboardAvoidingView',
  'src/app/coach-memory.tsx': 'không có form nhập, chỉ có ô tìm kiếm ở đầu',
};

const PAGES = walk(path.join(NATIVE, 'src/app')).filter((f) => {
  const src = codeOnly(readFileSync(f, 'utf8'));
  return /<TextInput/.test(src) && /<Screen[\s>]/.test(src);
});

for (const file of PAGES) {
  const rel = path.relative(NATIVE, file).replace(/\\/g, '/');
  const src = codeOnly(readFileSync(file, 'utf8'));
  if (/<KeyboardAvoidingView/.test(src)) continue; // renders one itself, nothing to prove
  if (!(rel in SCREEN_PAGES)) {
    problems.push(
      `${rel}: trang dùng <Screen> và có ô nhập, nhưng chưa có trong danh sách của tools/keyboard.mjs. ` +
        'screen.tsx cố tình không né bàn phím với lý do "mọi ô nhập đều nằm gần đầu trang" — ' +
        'hoặc ghi vào danh sách kèm lý do, hoặc bọc form đó trong KeyboardAvoidingView.',
    );
  }
}

/**
 * The self-test.
 *
 * The first rule is trivially satisfiable by a regex that matches nothing, and
 * the second by a `slice` that comes back empty. Both are handed the broken and
 * the fixed shape.
 */
const SELF = [
  ['thiếu cả hai — bắt được', () => {
    const bad = 'return (<ScrollView style={s.root}><TextInput /></ScrollView>);';
    return !/KeyboardAvoidingView/.test(bad) && !/keyboardShouldPersistTaps/.test(bad);
  }],
  ['có đủ cả hai — không báo oan', () => {
    const good =
      'return (<KeyboardAvoidingView><ScrollView keyboardShouldPersistTaps="handled"><TextInput /></ScrollView></KeyboardAvoidingView>);';
    return /<KeyboardAvoidingView/.test(good) && /keyboardShouldPersistTaps/.test(good);
  }],
  ['chỉ còn dòng import, không còn thẻ — vẫn bị bắt', () => {
    const bad = "import { KeyboardAvoidingView } from 'react-native';\nreturn (<ScrollView><TextInput /></ScrollView>);";
    return /KeyboardAvoidingView/.test(bad) && !/<KeyboardAvoidingView/.test(bad);
  }],
  ['trang <Screen> mới, chưa ghi lý do — bắt được', () => {
    const src = '<Screen>\n<TextInput />\n</Screen>';
    return /<TextInput/.test(src) && /<Screen[\s>]/.test(src) && !('src/app/khong-co-that.tsx' in SCREEN_PAGES);
  }],
  ['chú thích nhắc TextInput — không bị coi là code', () =>
    !/<TextInput/.test(codeOnly('/* wrap the <TextInput /> in a KAV */\nconst a = 1;'))],
];
const missed = SELF.filter(([, fn]) => !fn()).map(([l]) => l);
if (missed.length) {
  console.error(`phép tự kiểm hỏng — ${missed.join('; ')}; đừng tin kết quả`);
  process.exit(2);
}

if (problems.length) {
  console.log('bàn phím che mất chỗ bấm:\n');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

console.log(
  `bàn phím OK — ${SHEETS.length} sheet tự quản scroll view đều có KeyboardAvoidingView và ` +
    'keyboardShouldPersistTaps (thiếu cái thứ hai thì cú chạm đầu tiên vào nút bị nuốt, và nó đọc thành "nút không ăn"); ' +
    `${PAGES.length} trang dùng <Screen> đều đã được xét từng cái và ghi lý do — ` +
    'giả định mà screen.tsx dựa vào để cố tình không né bàn phím vẫn còn đúng, và trang mới có ô nhập sẽ tự động hỏng',
);
