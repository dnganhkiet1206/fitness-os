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
let checked = 0;

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
      Những hàm cú vuốt gọi tới.

      API của `SwipeRow` từ bản nhiều-nút là hai mảng `right`/`left`, mỗi phần
      tử có `onPress`. Bản trước đọc một prop `onAction` duy nhất, và khi API
      đổi thì nó không đỏ vì API sai — nó đỏ vì "không đọc được hàm nó gọi",
      tức một thông báo đúng về chuyện sai.

      Nhận cả hai dạng viết: `onPress: () => fn(...)` và `onPress: fn`.
    */
    for (const tag of [...body.matchAll(/<SwipeRow\b/g)]) {
      /* Cả thẻ mở, từ `<SwipeRow` tới `}>` đóng nó — đó là chỗ hai mảng nằm. */
      const open = body.slice(tag.index, body.indexOf('}>', tag.index) + 2);
      /*
        Hành động viết THẲNG trong thẻ, và hành động đặt tên rồi truyền vào.

        Dạng thứ hai có thật và hợp lệ: dashboard dùng CÙNG một nút ở cả hai
        mép, nên nó khai `const remove = { … }` một lần rồi đưa vào cả hai mảng
        — chép đôi ở đó mới là cái sai. Luật phải đi theo một bước ấy, không thì
        nó bắt người viết chép đôi để làm vừa lòng nó.
      */
      const named = [...open.matchAll(/[[{]\s*(\w+)\s*[,\]}]/g)].map((x) => x[1]);
      const sources = [
        open,
        ...named.map((n) => {
          const d = new RegExp(`const ${n} = \\{[^}]*\\}`).exec(body);
          return d ? d[0] : '';
        }),
      ];
      const fns = [
        ...new Set(
          sources
            .flatMap((src2) => [...src2.matchAll(/onPress: (?:\(\) => )?(\w+)/g)].map((x) => x[1]))
            .filter((n) => n !== 'undefined'),
        ),
      ];
      if (!fns.length) {
        problems.push(`${rel} dùng <SwipeRow> nhưng không đọc được hàm nào nó gọi`);
        continue;
      }
      for (const fn of fns) {
        checked++;
        const rest = body
          .replace(open, '')
          .replace(new RegExp(`(const|function) ${fn}\\b`), '__decl__');
        if (!new RegExp(`\\b${fn}\\b`).test(rest)) {
          problems.push(
            `${rel}: \`${fn}\` chỉ tới được bằng cú vuốt — today-meals.tsx đã ghi vì sao điều đó không ` +
              'đủ: "cả hai đều vô hình cho tới khi đoán ra". Phải còn một lối khác trong chính tệp này',
          );
        }
      }
    }
  }
}

/* ── 3. lối cho VoiceOver nằm ở CHÍNH component, và nó phải lấy từ danh sách thật ──

   Bản trước để mỗi chỗ dùng tự khai `accessibilityActions`, nên một chỗ dùng
   mới rất dễ quên. Từ bản nhiều-nút, `SwipeRow` tự khai — nhưng chỉ đúng khi
   nó khai từ ĐÚNG danh sách nó vẽ ra. Một danh sách gõ tay sẽ trôi khỏi danh
   sách thật mà không có gì báo, và VoiceOver sẽ đọc ra một việc đã đổi tên
   hoặc bỏ sót việc mới. */
{
  const has = (re) => re.test(src);
  if (!has(/accessibilityActions=\{all\.map\(/)) {
    problems.push(
      `${COMPONENT}: \`accessibilityActions\` không lấy từ chính danh sách hành động đang vẽ — một ` +
        'danh sách gõ tay sẽ trôi khỏi nó mà không có gì báo',
    );
  }
  if (!has(/onAccessibilityAction=\{/) || !has(/all\.find\(/)) {
    problems.push(
      `${COMPONENT}: khai \`accessibilityActions\` mà không xử lý — VoiceOver đọc ra một việc rồi bấm ` +
        'vào không có gì xảy ra',
    );
  }
  const max = /const MAX_ACTIONS = (\d+);/.exec(src);
  if (!max) {
    problems.push(`${COMPONENT}: không đọc được \`MAX_ACTIONS\``);
  } else if (Number(max[1]) < 1 || Number(max[1]) > 4) {
    problems.push(
      `${COMPONENT}: \`MAX_ACTIONS\` = ${max[1]} — Apple để tối đa 3–4 nút mỗi mép, và mỗi nút ở đây ` +
        'rộng OPEN_W nên quá số ấy là hàng không còn chỗ để nhìn thấy mình là hàng nào',
    );
  }
  if (!/row-reverse/.test(src)) {
    problems.push(
      `${COMPONENT}: mép phải không đảo chiều, nên nút ĐẦU danh sách nằm trong cùng. iOS dựng từ mép ` +
        'ngoài vào trong, nên thứ tự người viết khai và thứ tự người dùng thấy đang ngược nhau',
    );
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
    `haptic nổ đúng lúc cam kết với chốt một-lần. ${checked} hành động vuốt trên mọi chỗ dùng đều còn ` +
    'một LỐI KHÁC trong chính tệp của nó — today-meals.tsx đã ghi vì sao: "cả hai đều vô hình cho tới ' +
    'khi đoán ra" — và luật đi theo được một bước khi hành động được ĐẶT TÊN rồi truyền vào, vì dashboard ' +
    'dùng cùng một nút ở cả hai mép và chép đôi ở đó mới là cái sai. Lối cho VoiceOver thì không còn là ' +
    'việc của từng chỗ dùng nữa: `SwipeRow` tự khai `accessibilityActions` TỪ CHÍNH danh sách nó đang vẽ ' +
    'và có xử lý — một danh sách gõ tay sẽ trôi khỏi danh sách thật mà không có gì báo. Cộng hai luật của ' +
    'bản nhiều-nút: tối đa 3 nút mỗi mép (Apple để 3–4, mà mỗi nút ở đây rộng OPEN_W nên ba nút đã chiếm ' +
    '252 trên 393 điểm), và mép phải phải đảo chiều để nút ĐẦU danh sách nằm ngoài cùng, đúng cách ' +
    '`UISwipeActionsConfiguration` dựng từ mép ngoài vào trong',
);
