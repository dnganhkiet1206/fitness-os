/**
 * That a swipe is a shortcut and never the only way in.
 *
 * ── the argument this enforces, which the app made before it had any swipes ──
 *
 * `today-meals.tsx` wrote it down while deciding NOT to use one:
 *
 *   "Not a swipe and not a long-press. Both are invisible until guessed, and
 *    this list is already behind a tap to expand the meal — a gesture hidden
 *    inside something hidden is a feature only its author finds."
 *
 * That is right, and it does not mean the app can never have a swipe. It means
 * the swipe cannot be where an action LIVES. A row you can swipe to delete must
 * also have a delete you can see, or the feature is reachable only by people
 * who already knew — which on a phone is the people who did not need the
 * shortcut.
 *
 * ── and the three things that make it feel like the system's own ──
 *
 * Pulled out of the component rather than trusted, because each is a number
 * somebody could "tidy" without knowing what it was doing:
 *
 *   · it tracks the finger — the action's size comes from the drag's own shared
 *     value, not from a React state set on release;
 *   · it commits before release, and says so;
 *   · a little hysteresis, so a vertical scroll that drifts sideways does not
 *     peel rows open on its way past.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = 'src/components/ascnd/swipe-row.tsx';
const src = readFileSync(path.join(NATIVE, COMPONENT), 'utf8');
const problems = [];

/* ── 1. the mechanics, read out of the component ── */
{
  const num = (re, what) => {
    const m = src.match(re);
    if (!m) {
      problems.push(`không lấy được ${what} ra khỏi ${COMPONENT} — luật này đang không kiểm gì cả`);
      return null;
    }
    return Number(m[1]);
  };
  const open = num(/const OPEN_W = (\d+);/, 'bề rộng mở');
  const commitExpr = src.match(/const COMMIT = OPEN_W \* ([\d.]+);/);
  const hyst = num(/const HYSTERESIS = (\d+);/, 'độ trễ trước khi cam kết');

  if (open !== null && commitExpr) {
    const commit = open * Number(commitExpr[1]);
    if (commit >= open) {
      problems.push(
        `ngưỡng cam kết (${commit}) không nhỏ hơn bề rộng mở (${open}) — nghĩa là hàng chỉ mở khi đã ` +
          'kéo hết cỡ, tức không còn khoảnh khắc "thả ra là nó mở" để nhãn kịp hiện',
      );
    }
    if (commit <= open * 0.25) {
      problems.push(`ngưỡng cam kết ${commit} quá thấp so với ${open} — chạm nhẹ cũng mở hàng`);
    }
  }
  if (hyst !== null && (hyst < 5 || hyst > 24)) {
    problems.push(
      `độ trễ ${hyst}pt nằm ngoài khoảng hợp lý — quá nhỏ thì cuộn dọc hơi lệch cũng bóc hàng ra, ` +
        'quá lớn thì cử chỉ vuốt cảm giác dính',
    );
  }

  /* It must follow the finger: the action reads the drag's shared value. */
  if (!/interpolate\(progress\.value/.test(src)) {
    problems.push(
      'nút hành động không đọc `progress.value` — nó thôi bám theo ngón tay và chuyển thành "chạy ' +
        'tới trạng thái khi thả", tức đúng thứ làm swipe của một app thấy rẻ tiền',
    );
  }
  if (!/onSwipeableWillOpen/.test(src) || !/Haptics\./.test(src)) {
    problems.push('không có haptic ở khoảnh khắc hàng cam kết mở — thị giác và xúc giác phải nổ cùng lúc');
  }
  /* One buzz, not one per frame. */
  if (!/buzzed/.test(src)) {
    problems.push('haptic không có chốt một-lần, nên nó sẽ rung lại mỗi khi ngón tay rung quanh ngưỡng');
  }
}

/* ── 2. every swipe action is also a visible control ── */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(e) ? [p] : [];
    });
  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT) continue;
    const body = readFileSync(file, 'utf8');
    if (!/<SwipeRow/.test(body)) continue;

    /*
      What the swipe calls — gọi thẳng `onAction={() => fn(…)}` hoặc trao tham
      chiếu `onAction={fn}`. Bản đầu chỉ đọc dạng thứ nhất và báo "không đọc
      được hàm nó gọi" trên một chỗ dùng hoàn toàn hợp lệ.
    */
    const m =
      body.match(/<SwipeRow[\s\S]*?onAction=\{\(\) => (\w+)\(/) ??
      body.match(/<SwipeRow[\s\S]*?onAction=\{(\w+)\}/);
    if (!m) {
      problems.push(`${rel} dùng <SwipeRow> nhưng không đọc được hàm nó gọi`);
      continue;
    }
    const fn = m[1];
    /*
      Reachable from somewhere OTHER than the swipe — by any route, not by a
      call.

      The first version counted `fn(` and failed on the real code: `sessions.tsx`
      hands the function to `SessionRow` as `onDelete={confirmDelete}`, which is
      a reference and not a call, and that component draws the visible bin
      button. The rule reported a screen that has both paths as having only one.

      So: cut the `<SwipeRow>` block and the declaration out of the file, and ask
      whether the name is still mentioned anywhere. Anything left is another way
      to reach it.
    */
    const swipeBlock = body.slice(m.index, body.indexOf('>', m.index + m[0].length) + 1);
    const rest = body
      .replace(swipeBlock, '')
      .replace(new RegExp(`(const|function) ${fn}\\b`), '__decl__');
    /*
      ── luật này được CHUYỂN HƯỚNG, không nới ──

      Bất biến thật là: một cú vuốt là VÔ HÌNH, nên hành động phải còn một lối
      khác. Bản đầu cài nó thành "phải còn một nút nhìn thấy được", và đó là
      MỘT cách thoả, không phải bất biến.

      Chế độ sắp xếp dashboard bỏ hẳn nút xoá — đúng cách iOS làm ở Mail và Nhắc
      nhở: xoá đứng thường trực cạnh tên, ngang hàng với hai thao tác vô hại,
      trên một hàng người ta lướt qua, là một thao tác không hoàn tác được đặt
      sai chỗ. Lối khác ở đó là một accessibility ACTION, và đó chính là thứ
      VoiceOver dùng — nó không bao giờ "thấy" cái nút kia.

      Nên luật nhận CẢ HAI, và vẫn đỏ khi không có lối nào: một nút khác gọi tới
      cùng hàm, hoặc một action khai `accessibilityActions` kèm
      `onAccessibilityAction` xử lý nó. Khai mà không xử lý thì không tính —
      VoiceOver đọc ra một việc rồi bấm vào không có gì xảy ra.
    */
    const viaButton = new RegExp(`\\b${fn}\\b`).test(rest);
    const viaA11y =
      /accessibilityActions=\{/.test(body) &&
      /onAccessibilityAction=\{/.test(body) &&
      new RegExp(`actionName === '(\\w+)'\\)\\s*${fn}\\(|name: '(\\w+)', label:`).test(body);
    if (!viaButton && !viaA11y) {
      problems.push(
        `${rel}: \`${fn}\` chỉ tới được bằng cú vuốt — today-meals.tsx đã ghi vì sao điều đó không đủ: ` +
          '"cả hai đều vô hình cho tới khi đoán ra". Phải còn một lối khác: một nút nhìn thấy được, hoặc ' +
          'một accessibility action có khai VÀ có xử lý',
      );
    }
  }
}

if (problems.length) {
  console.log('hàng vuốt CÓ LỖI:\n');
  for (const p of problems.slice(0, 10)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hàng vuốt OK — cơ chế lấy từ react-native-gesture-handler chứ không tự viết lại bộ giải xung đột ' +
    'với cuộn; nút hành động đọc THẲNG `progress.value` của cú kéo nên nó bám ngón tay từng khung ' +
    'hình chứ không "chạy tới trạng thái khi thả"; có ngưỡng cam kết nằm trong khoảng mở (để có ' +
    'khoảnh khắc nhãn kịp hiện trước khi thả), có độ trễ để cuộn dọc hơi lệch không bóc hàng ra, và ' +
    'haptic nổ đúng lúc cam kết với chốt một-lần; và mọi hành động vuốt được đều còn một LỐI KHÁC — ' +
    'today-meals.tsx đã ghi vì sao: "cả hai đều vô hình cho tới khi đoán ra". Lối ấy là một nút nhìn thấy ' +
    'được, HOẶC một accessibility action có khai và có xử lý: chế độ sắp xếp dashboard bỏ hẳn nút xoá — ' +
    'đúng cách iOS làm ở Mail và Nhắc nhở, vì một thao tác không hoàn tác được không nên đứng thường trực ' +
    'ngang hàng với hai thao tác vô hại — và ở đó VoiceOver vốn không bao giờ "thấy" cái nút kia',
);
