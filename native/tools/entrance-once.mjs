/**
 * Hiệu ứng vào chạy ở LẦN TỚI, không chạy ở mỗi lần thôi bị che.
 *
 * ── lỗi có thật, người dùng báo ba lần ──
 *
 * Các thẻ thông tin của dashboard bị tháo khỏi cây khi `heroOpen`, và mỗi thẻ
 * mang `entering={FadeInDown.springify().delay((heroWidgets.length + gi + wi) * 70)}`.
 * Nên mỗi lần ĐÓNG thẻ chỉ số, cả nửa dưới dashboard dựng lại và toàn bộ
 * cascade chạy lại: từng thẻ bay lên từ dưới, lệch nhau 70ms, kéo dài quá nửa
 * giây. Người dùng bấm mũi tên để quay về thứ họ vừa rời khỏi, và thứ họ nhận
 * là cả trang diễn lại màn chào.
 *
 * Cộng thêm một `FadeIn`/`FadeOut` trên chính cái tấm chứa tất cả — một
 * `opacity` phủ lên nhóm có `BlurView` + `MaskedView` toàn màn, tức lượt gộp
 * ngoài màn lớn nhất trong app.
 *
 * Một hiệu ứng vào kể chuyện "cái này vừa tới". Đúng ở lần mở app — lúc ấy nó
 * vừa tới thật. Sai ở mọi lần sau, vì nó chưa đi đâu cả; nó chỉ bị che.
 *
 * ── vì sao luật này CHẠY chuỗi bấm thay vì dò chữ ──
 *
 * Một regex đòi `cascaded ?` ghim một CÁCH VIẾT. Nó xanh với bản đúng, và cũng
 * xanh với `cascaded` gắn vào `mounted` — thứ thành true ngay sau lần commit
 * đầu, mà lần commit đầu thường là lúc dữ liệu ngày còn đang tải và các thẻ
 * CHƯA có mặt. Bản ấy giết luôn cascade ở lần mở app, tức bỏ mất đúng cái lần
 * duy nhất nó đúng — và một regex tìm dấu `?` không phân biệt được hai bản.
 *
 * Nên tệp này TRÍCH biểu thức `entering` và thân `useEffect` ra khỏi mã thật,
 * rồi chạy đúng chuỗi mà người dùng đi qua:
 *
 *     1. mở app, ngày đang tải        → thẻ chưa dựng
 *     2. dữ liệu về, thẻ hiện ra      → cascade PHẢI chạy
 *     3. một lần đọc hỏng             → thẻ bị tháo
 *     4. thử lại xong, thẻ dựng lại   → cascade PHẢI im
 *     5. lặp thêm một vòng            → vẫn im
 *
 * Bước 2 và bước 4 là hai vế; một luật chỉ canh bước 4 sẽ xanh với bản không
 * bao giờ có hiệu ứng vào nào cả.
 *
 * ── bước 3 ĐÃ ĐỔI NGHĨA ──
 *
 * Nó từng là "bấm mở thẻ chỉ số", vì tấm nội dung bị tháo khỏi cây khi
 * `heroOpen`. Tấm nay đi bằng `<Expander>` — chiều cao chạy về 0 cùng đường
 * cong với khối chi tiết đang mở — nên các thẻ ở nguyên trong cây và cú bấm ấy
 * không dựng lại được gì. Lần dựng lại CÒN THẬT là `dayPending` lật.
 *
 * Hai phép thử ngược của chính tệp này đã báo đúng lúc: chúng thay một chuỗi
 * không còn tồn tại và trả về "đang thử một bản y hệt bản thật".
 *
 * Và vì mô hình cho rằng "thẻ có mặt" đúng bằng `groupsUp`, hai đầu ấy được SO
 * thẳng với nhau: thêm một vế vào cổng JSX mà `groupsUp` không có thì bước này
 * đỏ, thay vì lặng lẽ mô phỏng một màn hình khác — đúng cách nó vừa lệch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const TODAY = 'src/app/(tabs)/index.tsx';

const problems = [];

/**
 * Dựng một mô hình chạy được từ chính mã nguồn.
 *
 * Trả về `{ entering, effect }` — hai hàm thật, biên dịch từ hai đoạn được
 * trích ra — hoặc một danh sách lý do không trích được.
 */
function model(src) {
  const bad = [];

  /*
    ── cổng nay nằm ở LOẠI NODE, không ở giá trị prop ──

    Bản trước viết `entering={cascaded ? undefined : …}` trên một
    `Animated.View`. Nó đúng về hoạt hoạ và vẫn để lại một lỗi: một node của
    Reanimated từng khai layout animation vẫn tham gia lượt sắp xếp lại của thư
    viện kể cả khi prop đã là `undefined`. Đổi thứ tự nhóm xong, tiêu đề đi tới
    chỗ mới còn widget vẫn vẽ ở chỗ cũ — chúng chồng lên thẻ của nhóm khác.

    Nên hình dạng đúng là: cascade xong thì dựng `View` THUẦN. Luật này đọc
    đúng điều đó, và nó mạnh hơn luật cũ — `entering={undefined}` không còn
    lọt qua.
  */
  const ent = /\n\s*(\w+) \? \(\s*\n\s*<View key=\{key\}[\s\S]*?\) : \(\s*\n\s*<Animated\.View[\s\S]*?entering=\{([\s\S]*?)\}>/.exec(src);
  if (!ent) {
    bad.push(
      'thẻ nhóm không còn cổng "cascade xong thì dựng View thuần" — hoặc cascade chạy vô điều kiện (mỗi lần ' +
        'đóng thẻ chỉ số cả dashboard diễn lại màn chào), hoặc nó vẫn là Animated.View sau khi đã xong, và ' +
        'node ấy vẫn tham gia lượt sắp xếp lại của Reanimated: đổi thứ tự nhóm thì widget kẹt lại chỗ cũ',
    );
    return { bad };
  }
  const gate = ent[1];

  /* ── thân `useEffect` đặt cờ ────────────────────────────────────────────── */
  const setter = `set${gate[0].toUpperCase()}${gate.slice(1)}`;
  const eff = new RegExp(
    `useEffect\\(\\(\\) => \\{([\\s\\S]*?${setter}[\\s\\S]*?)\\}, \\[([^\\]]*)\\]\\);`,
  ).exec(src);
  if (!eff) {
    bad.push(`không tìm thấy useEffect ghi \`${setter}\` — cờ \`${gate}\` không có gì đổi được nó`);
    return { bad };
  }

  /* Cờ phải là React state: một ref không dựng lại cây, nên lần render đang
     dựng các thẻ sẽ đọc một giá trị đã cũ. */
  if (!new RegExp(`const \\[${gate}, ${setter}\\] = useState\\(false\\)`).test(src)) {
    bad.push(`\`${gate}\` không phải React state khởi tạo bằng false`);
    return { bad };
  }

  const deps = eff[2].split(',').map((s) => s.trim()).filter(Boolean);
  let effect;
  let entering;
  try {
    /* `FadeInDown` giả: mọi phương thức nối chuỗi đều trả lại chính nó, nên thứ
       đi ra là một dấu hiệu nhận biết được chứ không phải một lỗi. */
    const chain = new Proxy(
      { __anim: true },
      { get: (t, k) => (k === '__anim' ? true : () => chain) },
    );
    /*
      Gọi với đủ tham số chứ KHÔNG `bind`: `bind` gắn từ tham số ĐẦU, mà tham số
      đầu ở đây chính là cái cờ đang được thử. Bản nháp đầu bind nó thành
      `undefined` nên nó luôn falsy, `entering` luôn trả về animation, và phép
      tự kiểm đỏ ngay trên bản thật — đúng cách một harness hỏng đọc ra như một
      lỗi sản phẩm.
    */
    /*
      Dựng lại CẢ ternary, không chỉ nhánh `:`. Bản nháp đầu chỉ biên dịch nhánh
      sai — nên cái cổng không có mặt trong biểu thức chút nào và nó luôn trả về
      animation, ở cả hai giá trị cờ. Phép tự kiểm bắt được, và đó đúng là việc
      của nó: một harness hỏng đọc ra y hệt một lỗi sản phẩm.
    */
    const raw = new Function(
      gate, 'FadeInDown', 'config', 'gi', 'wi',
      `return (${gate} ? undefined : ${ent[2].trim()});`,
    );
    entering = (flag) => raw(flag, chain, { heroWidgets: [1, 2, 3, 4] }, 0, 0);
    effect = new Function(...deps, setter, eff[1]);
  } catch (e) {
    bad.push(`không biên dịch được đoạn trích: ${e.message}`);
    return { bad };
  }
  return { bad, gate, deps, entering, effect };
}

/**
 * Chạy chuỗi bấm thật và trả về danh sách sai lệch.
 *
 * `entering(flag)` được gọi với giá trị cờ ở ĐÚNG lần render đang xét, và
 * `effect` chạy SAU nó — đúng thứ tự React commit rồi mới chạy effect.
 */
function judge(m) {
  if (m.bad.length) return m.bad;
  const bad = [];
  let flag = false;
  const set = (v) => {
    if (v === false) bad.push(`\`${m.gate}\` bị đặt lại về false — cascade sẽ chạy lại`);
    flag = v;
  };

  /** Một lần render: đọc `entering` với cờ hiện tại, rồi chạy effect. */
  const step = (groupsUp) => {
    const anim = groupsUp ? m.entering(flag)?.__anim === true : null;
    /* Effect chạy theo đúng deps mà mã thật khai. */
    const args = m.deps.map((d) => (d === 'groupsUp' ? groupsUp : undefined));
    m.effect(...args, set);
    return anim;
  };

  /*
    ── chuỗi này ĐÃ ĐỔI, và vì sao ──

    Bản trước lái hai biến, `groupsUp` và `heroOpen`, vì các thẻ nhóm bị THÁO
    khỏi cây khi mở thẻ chỉ số — nên "đóng thẻ chỉ số" là một lần dựng lại, và
    đó là lần cascade dễ chạy lại nhất.

    Tấm nội dung nay đi bằng `<Expander>` chứ không bằng một cái cổng, nên các
    thẻ ở nguyên trong cây suốt cả hai chiều và `heroOpen` không còn dựng lại
    được gì. Giữ nó trong mô hình là mô phỏng một cơ chế không còn tồn tại; hai
    phép thử ngược của tệp này đã báo đúng điều đó bằng câu "đang thử một bản y
    hệt bản thật".

    Lần dựng lại CÒN THẬT là `dayPending` lật: một lần đọc hỏng rồi thử lại gỡ
    các thẻ ra rồi trả về. Lần ấy vẫn không phải một lần "vừa tới".
  */
  /* 1. mở app, ngày đang tải — chưa có thẻ nào */
  step(false);
  /* 2. dữ liệu về: cascade PHẢI chạy. Đây là vế dễ mất nhất — một bản gắn cờ
        vào `mounted` sẽ im ở đây, và im ở đây là bỏ mất đúng lần duy nhất một
        hiệu ứng vào có nghĩa. */
  if (step(true) !== true) {
    bad.push(
      'lần đầu thẻ hiện ra mà cascade KHÔNG chạy — cờ đang bật quá sớm (thường là gắn vào `mounted`, ' +
        'thứ thành true ngay sau commit đầu, lúc dữ liệu ngày còn đang tải và các thẻ chưa có mặt)',
    );
  }
  /* 3. một lần đọc hỏng đưa ngày về pending — thẻ bị tháo */
  step(false);
  /* 4. thử lại xong: thẻ dựng lại, cascade PHẢI im */
  if (step(true) !== false) {
    bad.push(
      'thẻ dựng lại xong cascade lại chạy — cả nửa dưới dashboard diễn lại màn chào, từng thẻ bay lên ' +
        'lệch nhau 70ms',
    );
  }
  /* 5. lần thứ hai, để chắc rằng cờ không bị đặt lại */
  step(false);
  if (step(true) !== false) bad.push('lần dựng lại thứ hai cascade vẫn chạy');
  return bad;
}

/*
  Và mô hình trên chỉ đúng chừng nào `groupsUp` VẪN là cái cổng mà JSX dùng.

  `step()` cho rằng "thẻ có mặt" đúng bằng `groupsUp`. Nếu JSX thêm một vế nữa
  mà `groupsUp` không có — đúng thứ vừa được gỡ ra — thì mô hình mô phỏng một
  màn hình khác với màn hình thật, và nó sẽ nói dối theo chiều xanh. Nên hai đầu
  được so thẳng với nhau.
*/
function gateMatches(src) {
  const def = /const groupsUp = ([^;]+);/.exec(src);
  const jsx = /\{([^}]*?)\? null : config\.groups\.map\(/.exec(src);
  if (!def) return 'không tìm thấy định nghĩa `groupsUp`';
  if (!jsx) return 'không tìm thấy cổng dựng thẻ nhóm trong JSX';
  const d = def[1].replace(/\s/g, '');
  const j = jsx[1].replace(/\s/g, '');
  /* Hai vế phải là phủ định của nhau: `!a && !b` ↔ `a || b`. */
  const want = d.replace(/^!/, '').split('&&!').join('||');
  if (want !== j) {
    return `\`groupsUp = ${d}\` nhưng JSX dựng thẻ khi \`!(${j})\` — mô hình ở đây đang mô phỏng một màn hình khác`;
  }
  return null;
}

const today = read(TODAY);
{
  const drift = gateMatches(today);
  if (drift) problems.push(drift);
}
problems.push(...judge(model(today)));

/* ── tấm chứa tất cả không được mang hiệu ứng nào ────────────────────────── */
/*
  `heroOpen` chỉ đổi vì người dùng BẤM, nên `entering`/`exiting` ở đây chưa từng
  làm mềm một chuyển cảnh nào — chúng chỉ bắt cả nhóm mờ đi rồi mờ lại. Và nhóm
  ấy chứa BlurView + MaskedView phủ kín, nên đó là lượt gộp ngoài màn lớn nhất
  trong app.
*/
const sheet = /<(Animated\.View|View) style=\{styles\.sheet\}([\s\S]{0,200}?)>/.exec(today);
if (!sheet) {
  problems.push(`${TODAY}: không đọc được tấm nội dung`);
} else {
  if (/entering=|exiting=/.test(sheet[2])) {
    problems.push(
      `${TODAY}: tấm nội dung lại mang entering/exiting — nó chỉ chạy khi người dùng bấm mở/đóng thẻ chỉ ` +
        'số, và nó phủ `opacity` lên một nhóm có BlurView + MaskedView toàn màn',
    );
  }
  if (sheet[1] === 'Animated.View') {
    problems.push(`${TODAY}: tấm nội dung là Animated.View dù không còn hiệu ứng nào — trả nó về <View>`);
  }
}

/* ── 3. Koa cũng tới nơi một lần, và đây là lỗi THỨ BA cùng loại ─────────── */
/*
  `<Mascot>` nằm TRONG tấm nội dung, nên nó bị tháo cùng tấm mỗi lần người dùng
  mở thẻ chỉ số. Nó có `entrance` riêng — `useSharedValue(0)` cộng
  `withDelay(350, withSpring(1))` trên `[]` — và giá trị ấy nhân vào `scale`.
  Nên mỗi lần ĐÓNG thẻ, Koa biến mất hẳn 350ms rồi mới bung trở lại.

  Người dùng báo đúng chỗ này SAU KHI hai hiệu ứng kia đã được gỡ, nên luật
  phải nói được điều chung: `useEffect(…, [])` đọc ra là "một lần" nhưng nó là
  một lần MỖI LẦN MOUNT, và với một component bị tháo theo thao tác của người
  dùng thì hai câu ấy khác nhau hoàn toàn.

  Cờ phải ở phạm vi MODULE, không phải state của component: component bị tháo
  thì state của nó chết theo. Và nó phải đăng ký `onUserScopedReset` — người
  dùng khác thì đây là một Koa khác.
*/
const MASCOT = 'src/components/ascnd/mascot.tsx';
const mascot = read(MASCOT);
{
  const flag = /const entrance = useSharedValue\((\w+) \? 1 : 0\)/.exec(mascot);
  if (!flag) {
    problems.push(
      `${MASCOT}: \`entrance\` khởi tạo vô điều kiện — mỗi lần Koa được dựng lại nó về 0, mà giá trị ấy nhân ` +
        'vào `scale`, nên Koa biến mất hẳn rồi mới bung trở lại. Trên Today, "dựng lại" nghĩa là mỗi lần ' +
        'người dùng đóng thẻ chỉ số',
    );
  } else {
    const f = flag[1];
    if (!new RegExp(`^let ${f} = false;`, 'm').test(mascot)) {
      problems.push(
        `${MASCOT}: \`${f}\` không phải biến ở phạm vi module — component này BỊ THÁO, nên state của nó chết ` +
          'theo và không nhớ được gì giữa hai lần dựng',
      );
    }
    const guard = /useEffect\(\(\) => \{\s*if \((\w+)\) return;\s*(\w+) = true;\s*entrance\.value = withDelay/.exec(mascot);
    if (!guard || guard[1] !== f || guard[2] !== f) {
      problems.push(
        `${MASCOT}: hiệu ứng tới nơi không được canh bằng \`${f}\` — nó sẽ chạy lại ở mỗi lần dựng`,
      );
    }
    if (!new RegExp(`onUserScopedReset\\(\\(\\) => \\{\\s*${f} = false;`).test(mascot)) {
      problems.push(
        `${MASCOT}: \`${f}\` không đăng ký onUserScopedReset — đăng nhập tài khoản khác trên cùng máy thì ` +
          'đó là một Koa khác, và nó phải được thấy tới nơi',
      );
    }
  }
}

/* ── phép tự kiểm ─────────────────────────────────────────────────────────── */
const SELF = [
  {
    name: 'giữ Animated.View sau khi cascade xong (widget kẹt lại chỗ cũ khi đổi thứ tự)',
    mutate: (s) => s.replace('cascaded ? (\n                  <View key={key}', 'cascaded ? (\n                  <Animated.View key={key}'),
    expect: /không còn cổng "cascade xong thì dựng View thuần"/,
  },
  {
    name: 'gắn cờ vào `mounted` (giết cascade ở lần mở app)',
    mutate: (s) =>
      s.replace(
        'if (groupsUp) setCascaded(true);',
        'setCascaded(true);',
      ),
    expect: /lần đầu thẻ hiện ra mà cascade KHÔNG chạy/,
  },
  {
    name: 'đặt cờ lại về false khi thẻ bị tháo',
    mutate: (s) =>
      s.replace(
        'if (groupsUp) setCascaded(true);',
        'if (groupsUp) setCascaded(true); else setCascaded(false);',
      ),
    expect: /bị đặt lại về false|cascade lại chạy/,
  },
  {
    name: 'trả entering/exiting về cho tấm nội dung',
    mutate: (s) =>
      s.replace(
        '<View style={styles.sheet}>',
        '<Animated.View style={styles.sheet} entering={FadeIn} exiting={FadeOut}>',
      ),
    expect: /lại mang entering\/exiting/,
  },
];

const selfFail = [];
for (const s of SELF) {
  const broken = s.mutate(today);
  if (broken === today) {
    selfFail.push(`${s.name}: không đổi được gì — phép thử ngược đang thử một bản y hệt bản thật`);
    continue;
  }
  const found = [...judge(model(broken))];
  const m2 = /<(Animated\.View|View) style=\{styles\.sheet\}([\s\S]{0,200}?)>/.exec(broken);
  if (m2 && /entering=|exiting=/.test(m2[2])) found.push('tấm nội dung lại mang entering/exiting');
  if (found.length === 0) selfFail.push(`${s.name}: bản hỏng vẫn XANH — luật này không bắt được gì`);
  else if (!found.some((f) => s.expect.test(f))) {
    selfFail.push(`${s.name}: đỏ, nhưng không đúng chỗ đã dự đoán (${s.expect}); thật ra: ${found.join('; ')}`);
  }
}
if (judge(model(today)).length !== 0) {
  selfFail.push(`phép kiểm đỏ ngay trên BẢN THẬT: ${judge(model(today)).join('; ')}`);
}

if (selfFail.length) {
  console.error('phép tự kiểm hỏng — đừng tin kết quả:\n');
  for (const s of selfFail) console.error(`  ${s}`);
  process.exit(2);
}
if (problems.length) {
  console.log('hiệu ứng vào chạy sai lúc:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'hiệu ứng vào OK — biểu thức `entering` của thẻ nhóm và thân useEffect đặt cờ được TRÍCH ra khỏi mã thật ' +
    'rồi CHẠY qua đúng chuỗi người dùng đi: mở app lúc ngày đang tải → dữ liệu về (cascade PHẢI chạy) → một ' +
    'lần đọc hỏng đưa ngày về pending → thử lại xong (cascade PHẢI im) → lặp lần nữa (vẫn im). Chuỗi này ' +
    'từng lái `heroOpen`, vì các thẻ bị THÁO khi mở thẻ chỉ số; tấm nội dung nay đi bằng `<Expander>` nên ' +
    'chúng ở nguyên trong cây, và lần dựng lại còn thật là `dayPending` lật. Mô hình chỉ đúng chừng nào ' +
    '`groupsUp` vẫn ĐÚNG BẰNG cổng JSX dùng, nên hai đầu được so thẳng — thêm một vế vào một bên thì bước ' +
    'này đỏ thay vì mô phỏng một màn hình khác trong im lặng. Hai vế, và vế thứ nhất là vế dễ ' +
    'mất: gắn cờ vào `mounted` sẽ giết luôn cascade ở lần mở app, vì `mounted` thành true ngay sau commit ' +
    'đầu — lúc dữ liệu ngày còn tải và các thẻ chưa có mặt — và một regex tìm dấu `?` không phân biệt được ' +
    'bản ấy với bản đúng. Cờ phải là React state khởi tạo false và không bao giờ bị đặt lại. Tấm chứa tất ' +
    'cả không còn entering/exiting nào và đã trả về <View>: hai hiệu ứng ấy chỉ chạy khi người dùng bấm, ' +
    'và chúng phủ `opacity` lên một nhóm có BlurView + MaskedView toàn màn — lượt gộp ngoài màn lớn nhất ' +
    `trong app. ${SELF.length} phép thử ngược đều đỏ đúng chỗ đã dự đoán và tất cả xanh trên bản thật`,
);
