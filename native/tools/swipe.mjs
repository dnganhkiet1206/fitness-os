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

/**
 * Thân của `const <tên> = { … }` hoặc `const <tên> = [ … ]`, cắt bằng ĐẾM NGOẶC.
 *
 * Bản đầu dùng `const ${n} = \{[^}]*\}` và nó trượt trên chính mã thật: khai
 * báo có chú kiểu (`const skipAction: SwipeAction = {`) không khớp, và một mảng
 * (`const rightActions: SwipeAction[] = [`) thì không phải ngoặc nhọn. Cả hai
 * lần luật đều báo "không đọc được hàm nào nó gọi" — một thông báo đúng về
 * chuyện sai, và là cách nhanh nhất để một luật bị người ta tắt đi.
 */
function declOf(body, name) {
  const m = new RegExp(`const ${name}(?:\\s*:[^=]+)?\\s*=\\s*`).exec(body);
  if (!m) return '';
  let i = m.index + m[0].length;
  const openCh = body[i];
  const closeCh = openCh === '{' ? '}' : openCh === '[' ? ']' : null;
  if (!closeCh) return '';
  let depth = 0;
  for (let k = i; k < body.length; k++) {
    if (body[k] === openCh) depth++;
    else if (body[k] === closeCh) {
      depth--;
      if (depth === 0) return body.slice(i, k + 1);
    }
  }
  return '';
}

/* tiền đề được CHẠY: phép cắt phải lấy được cả hai dạng khai báo thật */
{
  const probe = 'const a: SwipeAction = { onPress: doA };\nconst b: SwipeAction[] = [{ onPress: () => doB(1) }];\n';
  if (!declOf(probe, 'a').includes('doA')) problems.push('tự kiểm hỏng — không cắt được một khai báo có chú kiểu');
  if (!declOf(probe, 'b').includes('doB')) problems.push('tự kiểm hỏng — không cắt được một khai báo MẢNG');
  if (declOf(probe, 'zzz') !== '') problems.push('tự kiểm hỏng — cắt ra thân cho một tên không tồn tại');
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
      const sources = [open, ...named.map((n) => declOf(body, n))];
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

/* ── 4. hình dạng nút, cú kéo dài, và cú bo góc ──

   Ba thứ chủ dự án đặt hàng sau khi nhìn ảnh Nhắc nhở của iOS trên máy thật:
   "icon phải nhỏ hơn thẻ và chữ xuất hiện bên dưới icon", "các nút tách ra như
   apple làm", "kéo dài ra và xoá thẻ mà không cần bấm nút", "thẻ chính khi vuốt
   sẽ có hiệu ứng bo góc lại".

   Cả ba đều là loại chi tiết biến mất trong một lần "dọn dẹp" mà không ai thấy,
   vì không màn nào đỏ khi thiếu chúng. */
{
  /* Hằng ở đây có thứ viết bằng BIỂU THỨC (`OPEN_W - 12`), nên đọc số trần là
     không đủ — luật sẽ báo "không đọc được" trên mã hoàn toàn hợp lệ, đúng kiểu
     thông báo đúng về chuyện sai đã xảy ra hai lần trong phiên này. Nên lấy vế
     phải rồi CHẠY nó, với các hằng đã đọc được làm biến. */
  const scope = {};
  const num = (name) => {
    const m = new RegExp(`const ${name} = ([^;]+);`).exec(src);
    if (!m) return null;
    try {
      const args = Object.keys(scope);
      const v = Number(new Function(...args, `return ${m[1]};`)(...args.map((k) => scope[k])));
      if (!Number.isFinite(v)) return null;
      scope[name] = v;
      return v;
    } catch {
      return null;
    }
  };
  const openW = num('OPEN_W');
  const cap = num('CAPSULE_H');
  const capW = num('CAPSULE_W');
  const icon = num('CAPSULE_ICON');
  const full = num('FULL_SWIPE_AT');

  if (cap === null || capW === null || icon === null || openW === null || full === null) {
    problems.push(
      `${COMPONENT}: không đọc được một trong CAPSULE_H / CAPSULE_W / CAPSULE_ICON / OPEN_W / ` +
        'FULL_SWIPE_AT — luật hình dạng đang không kiểm gì cả',
    );
  } else {
    /* icon phải NHỎ HƠN ô, và nhỏ rõ chứ không nhỏ một điểm. Trong ảnh tham
       chiếu nó chiếm chưa tới một nửa bề ngang ô. */
    if (icon / cap > 0.62) {
      problems.push(
        `${COMPONENT}: icon ${icon} trên ô ${cap} là ${Math.round((icon / cap) * 100)}% bề ngang — ` +
          'đặt hàng là "icon phải nhỏ hơn thẻ", và trên ảnh tham chiếu nó chưa tới một nửa',
      );
    }
    /* Ô phải hẹp hơn cột của nó, không thì các nút dính thành một dải. */
    if (capW >= openW) {
      problems.push(
        `${COMPONENT}: viên nang ${capW} rộng bằng hoặc hơn cột ${openW}, nên các nút dính liền nhau ` +
          '— đặt hàng là "các nút tách ra như apple làm"',
      );
    }
    /* CÙNG hình với nút "Ghi" trên hàng: viên nang, không phải ô vuông bo góc. */
    if (!/borderRadius: radius\.full/.test(src)) {
      problems.push(
        `${COMPONENT}: viên nang không dùng \`radius.full\` — chủ dự án đặt hàng "cùng hình dạng với ` +
          'nút ghi", và nút ghi là một viên nang',
      );
    }
    /* Mở LẦN LƯỢT: nút thứ i phải bị đẩy `i` cột lúc đóng, không thì cả cụm
       hiện cùng lúc — "nó phải chạy theo từng nút gần nhất chứ không đồng loạt". */
    if (!/const stack = index \* OPEN_W/.test(src)) {
      problems.push(
        `${COMPONENT}: các nút không xếp chồng theo chỉ số lúc đóng, nên chúng lộ ra ĐỒNG LOẠT thay ` +
          'vì lần lượt từ mép vào',
      );
    }
    /* Hàng đang mở phải tự thu về khi một hàng khác mở ra. */
    if (!/let openRow: SwipeableMethods \| null = null;/.test(src) || !/openRow\.close\(\)/.test(src)) {
      problems.push(
        `${COMPONENT}: không có sổ ghi hàng đang mở, nên hai hàng mở cùng lúc được — iOS thu hàng cũ ` +
          'về, và chủ dự án chụp được đúng cảnh hai hàng cùng mở',
      );
    }
    /* Ngưỡng kéo dài phải nằm trong tầm ngón cái và phải xa hơn hẳn ngưỡng mở
       thường, không thì một cú vuốt bình thường cũng kích hoạt nó. */
    if (full < 0.3 || full > 0.6) {
      problems.push(
        `${COMPONENT}: ngưỡng kéo-dài ${full} nằm ngoài khoảng dùng được — dưới 0,3 thì một cú vuốt ` +
          'thường cũng kích hoạt, trên 0,6 thì phải rướn quá nửa màn',
      );
    }
  }

  /* ── viên nang phải THẲNG HÀNG với nút của chính hàng ──

     Chủ dự án chụp màn hình lần thứ hai: viên nang vẫn không nằm cùng một
     đường với nút "Ghi" ngay cạnh. Đó không phải chuyện thẩm mỹ, nó là số học.

     Hàng To-do cao 52 (ô icon 44 + đệm 4 hai bên), nút "Ghi" cao 44 căn giữa
     nên tâm ở 26. Một cột "viên nang + khe + chữ" cao 51 căn giữa trong 52 đặt
     tâm viên nang ở 17,5 — lệch 8,5 điểm. Chỉ có hai lối: bỏ dòng chữ và cho
     viên nang cao đúng 44, hoặc kéo hàng lên 69 điểm. Ràng buộc "thẻ giữ nguyên
     kích thước mặc định" loại lối thứ hai.

     Nên luật ĐO: viên nang phải cao đúng bằng nút của hàng, và cột nút không
     được có gì nằm dưới viên nang nữa. */
  {
    const card = readFileSync(path.join(NATIVE, 'src/components/ascnd/todo-card.tsx'), 'utf8');
    const btn = /\n  action: \{[\s\S]*?height: (\d+)/.exec(card);
    if (!btn) {
      problems.push(`${COMPONENT}: không đọc được chiều cao nút "Ghi" ở todo-card.tsx để so hàng`);
    } else if (cap !== null && cap !== Number(btn[1])) {
      problems.push(
        `${COMPONENT}: viên nang cao ${cap} còn nút của hàng cao ${btn[1]} — hai cái căn giữa trong ` +
          `cùng một hàng sẽ lệch nhau ${Math.abs(cap - Number(btn[1])) / 2} điểm, đúng chỗ chủ dự án ` +
          'chụp lại hai lần',
      );
    }
    if (/const ACTION_H = CAPSULE_H \+/.test(src)) {
      problems.push(
        `${COMPONENT}: cột nút lại cao hơn viên nang, tức có gì đó nằm dưới nó. Bất cứ thứ gì thêm vào ` +
          'dưới viên nang đều đẩy tâm nó lên khỏi đường của nút hàng — xem phép tính ở `CAPSULE_H`',
      );
    }
  }

  /* Cú kéo dài: phải có cờ, có haptic NẶNG hơn tiếng cam kết thường, và phải
     đóng hàng lại sau khi làm — để lại một hàng mở sau khi đã làm xong là nói
     rằng chưa làm. */
  for (const [re, why] of [
    [/overshootLeft=\{fullSwipe\}/, 'không cho kéo quá bề rộng nút, nên không có chỗ nào để kéo dài'],
    [/ImpactFeedbackStyle\.Medium/, 'không có tiếng haptic riêng cho ngưỡng kéo-dài'],
    [/methods\.current\?\.close\(\)/, 'không đóng hàng lại sau khi cú kéo dài đã làm xong việc'],
  ]) {
    if (!re.test(src)) problems.push(`${COMPONENT}: ${why}`);
  }

  /* ── cụm nút phải nằm CHÍNH GIỮA chiều cao hàng ──

     Tấm nút là con của một khung `absoluteFill` cao bằng cả hàng, còn cột nút
     có chiều cao riêng (`ACTION_H`). Trong một hàng flex mà cha để `alignItems`
     mặc định `stretch`, một đứa con đã có chiều cao sẽ rơi về cross-start — tức
     dính MÉP TRÊN. Bản đã ship mắc đúng lỗi ấy: viên nang đội lên gần chạm tiêu
     đề thẻ, chữ dưới nó thò quá đáy hàng.

     `tsc` không biết flexbox và bộ chạy web vẽ ra đúng cái lệch ấy, nên không có
     gì đỏ. Chỉ ảnh chụp máy thật của chủ dự án mới thấy. */
  for (const name of ['styles_panelRight', 'styles_panelLeft']) {
    const decl = new RegExp(`const ${name} = \\{([^}]*)\\}`).exec(src);
    if (!decl) {
      problems.push(`${COMPONENT}: không đọc được \`${name}\``);
    } else if (!/alignItems: 'center'/.test(decl[1])) {
      problems.push(
        `${COMPONENT}: \`${name}\` không căn giữa theo chiều dọc, nên cột nút dính mép TRÊN của hàng ` +
          '— đúng lỗi đã ship: viên nang đội lên gần tiêu đề thẻ và chữ thò quá đáy hàng',
      );
    }
  }

  /* Glyph neo mép ĐI THEO THẺ, không ở lại phía sau: "nút - ở giữa sẽ kéo về
     gần thẻ chính ở cuối góc phải của thẻ xoá". */
  {
    const capsuleBody = /\n  capsule: \{([\s\S]*?)\n  \},/.exec(src)?.[1] ?? '';
    if (!/justifyContent: 'flex-end'/.test(capsuleBody) || !/paddingRight:/.test(capsuleBody)) {
      problems.push(
        `${COMPONENT}: glyph không neo vào mép đi theo thẻ — nở ra thì nó ở lại phía sau thay vì trôi ` +
          'cùng thẻ',
      );
    }
  }

  /* ── cú kéo dài: nút NỞ RA, hàng ĐỨNG YÊN, hệ điều hành hỏi lại ──

     Chủ dự án gửi bốn ảnh Nhắc nhở và Nhạc của iOS kèm mô tả: "khi kéo đến giữa
     màn hình nút trừ sẽ kéo đến gần thẻ và kích hoạt nút xoá và thẻ sẽ dừng ở
     điểm kéo đó sau đó sẽ có pop up hệ thống hiện lên hỏi có chắc chắn muốn xoá
     không". Ba mệnh đề, ba luật — vì mất bất kỳ cái nào thì hai cái kia vẫn
     chạy và không có gì đỏ. */
  {
    const swell = /const swell = useAnimatedStyle\(\(\) => \{([\s\S]*?)\n  \}\);/.exec(src)?.[1] ?? '';
    if (!/width: Math\.max\(CAPSULE_W, Math\.abs\(translation\.value\)/.test(swell)) {
      problems.push(
        `${COMPONENT}: nút ngoài cùng không nở theo khoảng ĐÃ KÉO. Chạy tới một bề rộng định sẵn thì nó ` +
          'rời khỏi ngón tay, còn không nở gì thì không có gì nói "thả ra là làm"',
      );
    }
    /* Bề rộng KHÔNG được nhân với `full`: `full` chỉ lên 1 SAU khi qua ngưỡng,
       nên nhân vào đó là để nút đứng nguyên suốt quãng kéo trước đó trong khi
       hàng đi mỗi lúc một xa — khoảng trắng giữa hai thứ càng kéo càng to, đúng
       cái chủ dự án chụp lại. */
    if (/full\.value/.test(swell)) {
      problems.push(
        `${COMPONENT}: bề rộng nút phụ thuộc \`full\`, thứ chỉ lên 1 sau khi qua ngưỡng — nên trước đó ` +
          'nút đứng nguyên và để hở một mảng trắng càng kéo càng to giữa nó và thẻ',
      );
    }
  }

  /* ── nút nở phải LẤP KÍN khoảng hàng nhường ra, và luật CHẠY phép tính ──

     Bản đã ship nở đúng theo `translation` nhưng để viên nang CĂN GIỮA trong
     cột, nên nó giãn đều hai phía: với một cú kéo 250 điểm, 77 điểm chạy ra
     ngoài khung và bị cắt, còn mép phải chỉ tới 149 — hở 101 điểm trắng giữa
     nút và thẻ. Chủ dự án chụp lại đúng mảng trắng ấy.

     Luật dựng lại chính phép tính trong `swell` rồi hỏi hai câu: có bị cắt
     không, và còn hở bao nhiêu. Nó không đọc chữ `position: absolute` — nó đo
     KẾT QUẢ, nên một cách neo khác mà đúng vẫn xanh. */
  {
    const inset = /const CAPSULE_INSET = \(OPEN_W - CAPSULE_W\) \/ 2;/.test(src)
      ? (openW - capW) / 2
      : null;
    /*
      Đọc THÂN style `capsule`, không quét cả tệp: bản đầu của luật này hỏi
      `/position: 'absolute'/` trên toàn bộ nguồn, mà `hit` cũng tuyệt đối — nên
      nó vẫn xanh sau khi tôi gỡ hẳn phép neo ra để thử phá. Một luật xanh trên
      đúng bản đã hỏng là một luật không tồn tại.
    */
    const capsuleBody = /\n  capsule: \{([\s\S]*?)\n  \},/.exec(src)?.[1] ?? '';
    const anchored = /left: CAPSULE_INSET/.test(capsuleBody) && /position: 'absolute'/.test(capsuleBody);
    const sub = /Math\.abs\(translation\.value\) - ([A-Za-z_]+) \* 2/.exec(src);
    if (inset === null || !sub) {
      problems.push(`${COMPONENT}: không đọc được phép neo/nở của nút để đo khoảng hở`);
    } else {
      const minus = sub[1] === 'CAPSULE_INSET' ? inset : NaN;
      for (const drag of [120, 180, 250, 340]) {
        const span = Math.max(capW, drag - (Number.isNaN(minus) ? 24 : minus * 2));
        const left = anchored ? inset : openW / 2 - span / 2;
        const right = left + span;
        if (left < 0) {
          problems.push(
            `${COMPONENT}: kéo ${drag} điểm thì nút bị cắt mất ${Math.round(-left)} điểm bên trái — nó ` +
              'giãn đều hai phía thay vì neo một mép',
          );
          break;
        }
        if (drag - right > inset + 1) {
          problems.push(
            `${COMPONENT}: kéo ${drag} điểm thì còn hở ${Math.round(drag - right)} điểm trắng giữa nút ` +
              'và thẻ — nút nở phải lấp KÍN khoảng hàng vừa nhường ra',
          );
          break;
        }
      }
    }
  }
  if (!/Alert\.alert\(/.test(src) || !/style: 'destructive'/.test(src)) {
    problems.push(
      `${COMPONENT}: cú kéo dài không hỏi lại bằng hộp thoại của HỆ ĐIỀU HÀNH. Nó là cú dễ lỡ tay nhất ` +
        'trong cả bộ cử chỉ — bắt đầu giống hệt một cú vuốt thường và chỉ khác ở chỗ ngón tay dừng lại',
    );
  }
  /* Hàng phải ĐỨNG YÊN cho tới khi có câu trả lời: `close()` chỉ được gọi
     TRONG nhánh trả lời, không phải trước khi hỏi. */
  {
    const ask = /if \(armed\.current && direction === '\w+' && firstLeft\) \{([\s\S]*?)\n      \}/.exec(src);
    if (!ask) {
      problems.push(`${COMPONENT}: không đọc được nhánh cú-kéo-dài để kiểm thứ tự đóng hàng`);
    } else if (!/onPress: done/.test(ask[1]) || !/const done = \(\)/.test(ask[1])) {
      problems.push(
        `${COMPONENT}: hàng không đứng yên chờ câu trả lời — đóng nó lại trước khi hỏi là hỏi về một ` +
          'thứ vừa biến mất khỏi màn hình',
      );
    }
  }
  /* Cái nảy: có, và KHÔNG được nằm trong phần bám ngón tay. */
  if (!/withSpring\(1, spring\([\d.]+, BOUNCE\.bouncy\)\)/.test(src)) {
    problems.push(
      `${COMPONENT}: nút không nảy khi hàng mở xong — đặt hàng là "hiệu ứng sinh động nảy như apple", ` +
        'và cái nảy thuộc khoảnh khắc THẢ RA chứ không thuộc phần kéo',
    );
  }

  /* ── ngưỡng kéo-dài phải VỚI TỚI ĐƯỢC, và luật CHẠY công thức của thư viện ──

     Bản đã ship có `friction: 2` và `overshootFriction: 8`. Cả hai đều là con số
     hợp lệ, cả hai đều đọc ra rất hợp lý, và cộng lại chúng đẩy ngưỡng kéo-dài
     ra ngoài tầm vật lý: ngón tay phải đi 1.592 điểm trên một màn rộng 393.
     Cú kéo dài không bao giờ xảy ra được, và không luật nào của tôi thấy —
     chúng kiểm HÌNH DẠNG mã, không kiểm vật lý.

     Nên luật này dựng lại đúng phép nội suy của thư viện
     (`ReanimatedSwipeable.js`: `interpolate` với extrapolation EXTEND, nên quá
     bề rộng tấm nút thì mỗi điểm `offsetDrag` chỉ sinh `1/overshootFriction`
     điểm dịch chuyển) và hỏi: trên màn hẹp nhất app hỗ trợ, ngón tay có với
     tới ngưỡng không. */
  {
    const prop = (name) => {
      const m = new RegExp(`${name}=\\{([^}]+)\\}`).exec(src);
      return m ? m[1].trim() : null;
    };
    const friction = Number(prop('friction'));
    const oF = Number(prop('overshootFriction'));
    /* iPhone SE: 375 điểm. Thẻ To-do trừ đệm hai bên còn ~343. */
    const SCREEN = 375;
    const ROW = SCREEN - 32;
    if (!Number.isFinite(friction) || !Number.isFinite(oF)) {
      problems.push(`${COMPONENT}: không đọc được \`friction\`/\`overshootFriction\` để chạy phép nội suy`);
    } else if (full !== null && openW !== null) {
      const applied = (finger) => {
        const d = finger / friction;
        return d <= openW ? d : openW + (d - openW) / oF;
      };
      const target = full * ROW;
      let need = Infinity;
      for (let x = 1; x <= 4000; x++) {
        if (applied(x) >= target) {
          need = x;
          break;
        }
      }
      if (need > SCREEN) {
        problems.push(
          `${COMPONENT}: ngưỡng kéo-dài cần ${need === Infinity ? '∞' : need} điểm ngón tay trên một ` +
            `màn rộng ${SCREEN} — không với tới được. friction ${friction} × overshootFriction ${oF} ` +
            `đang nhân khoảng phải kéo lên; chạy lại công thức của ReanimatedSwipeable.js`,
        );
      }
    }
  }

  /* ── tên hướng của thư viện được ĐỌC RA khỏi chính nó ──

     `onSwipeableWillOpen` đặt tên hướng theo chiều HÀNG DỊCH CHUYỂN, không theo
     mép nào mở: mở tấm bên TRÁI thì `toValue` dương và nó báo `RIGHT`. Bản đã
     ship so với `'left'`, nên nhánh cú-kéo-dài không bao giờ chạy.

     Luật không gõ cứng `'right'`: nó đọc dòng dispatch trong mã thư viện đang
     cài và suy ra tên đúng, nên một bản thư viện đổi quy ước sẽ làm đỏ thay vì
     làm hỏng lặng lẽ. */
  {
    const lib = 'node_modules/react-native-gesture-handler/lib/module/components/ReanimatedSwipeable/ReanimatedSwipeable.js';
    let libSrc = null;
    try {
      libSrc = readFileSync(path.join(NATIVE, lib), 'utf8');
    } catch {
      /* thư viện chưa cài — bước `ghim gói native` lo việc đó */
    }
    if (libSrc) {
      const m = /onSwipeableWillOpen\)\(toValue > 0 \? SwipeDirection\.(\w+)/.exec(libSrc);
      if (!m) {
        problems.push(`${COMPONENT}: không đọc được quy ước tên hướng trong ${lib}`);
      } else {
        const want = m[1].toLowerCase();
        const used = /direction === '(\w+)' && firstLeft/.exec(src);
        if (!used) {
          problems.push(`${COMPONENT}: không đọc được phép so hướng ở nhánh cú-kéo-dài`);
        } else if (used[1] !== want) {
          problems.push(
            `${COMPONENT}: nhánh cú-kéo-dài so hướng với '${used[1]}', nhưng thư viện báo '${want}' khi ` +
              'tấm nút bên TRÁI mở ra — nó đặt tên theo chiều HÀNG dịch chuyển, không theo mép nào mở',
          );
        }
      }
    }
  }

  /* Bo góc phải chạy theo CÚ KÉO, không phải một animation chạy song song. */
  if (!/borderRadius: interpolate\(openness\.value/.test(src)) {
    problems.push(
      `${COMPONENT}: bán kính góc không nội suy từ độ mở của cú kéo — một hiệu ứng chạy song song sẽ ` +
        'lệch khỏi ngón tay, đúng thứ làm swipe của một app thấy rẻ tiền',
    );
  }
  if (!/overflow: 'hidden'/.test(src)) {
    problems.push(
      `${COMPONENT}: lớp bo góc thiếu \`overflow: hidden\`, nên nền hàng vẫn vuông và góc bo không ` +
        'nhìn thấy được',
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
    '`UISwipeActionsConfiguration` dựng từ mép ngoài vào trong. Và hai luật CHẠY chứ không đọc hình dạng: phép nội suy của chính ReanimatedSwipeable được dựng lại để hỏi ngón tay có với tới ngưỡng kéo-dài trên màn hẹp nhất không (bản đã ship đòi 1.592 điểm trên một màn 393, tức cú kéo dài KHÔNG THỂ xảy ra), và tên hướng được đọc ra khỏi mã thư viện đang cài thay vì gõ cứng — thư viện đặt tên theo chiều HÀNG dịch chuyển nên mở tấm bên TRÁI lại báo `right`, và bản đã ship so với `left` nên nhánh ấy không bao giờ chạy',
);
