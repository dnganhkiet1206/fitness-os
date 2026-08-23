/**
 * One segmented control, not five.
 *
 * ── what it was ──
 *
 * Nutrition, Progress, the shop, the mascot room and a local `Segmented` inside
 * `edit-profile` each built the same control: map the options, swap a
 * background colour on whichever one matched. Five copies of one idea, five
 * sets of paddings and radii drifting apart, and — the reason this became worth
 * doing — none of them moved. Pressing a segment cut the highlight from one box
 * to the next between frames.
 *
 * The mascot room's copy had already rotted the way copies do: its `tabRow`,
 * `tab`, `tabActive`, `tabText` and `tabTextActive` styles were all still
 * there, and nothing rendered any of them.
 *
 * ── what this rule protects ──
 *
 * A sixth copy. Writing `[styles.tab, x === k && styles.tabActive]` is the
 * obvious thing to reach for, it takes four lines, and it looks perfectly
 * reasonable in review — which is exactly how there came to be five.
 *
 * And the pill has to *travel*: a segmented control is a spatial statement,
 * and the movement is what carries the relationship between where you were and
 * where you are. Replace the slide with a fade and the control still works and
 * has stopped saying anything.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const COMPONENT = 'src/components/ascnd/segmented.tsx';
/*
  The moving part moved.

  `Segmented` used to compute its own pill; it is now a control on top of
  `pick-row.tsx`, which is the app's ONLY travelling highlight — for equal
  segments and for chips that fit their label alike. So rules about how the
  highlight moves have to read the file that moves it, or they go on passing
  while checking nothing. Pointing this at `segmented.tsx` after the rewrite
  gave exactly that: two rules green against a file with no animation left in
  it at all.
*/
const MOVER = 'src/components/ascnd/pick-row.tsx';
const code = strip(read(MOVER));

/* ── 1. the pill travels, and it travels by transform ── */
{
  /*
    Inside an animated style, not anywhere in the file.

    The first version searched the whole file, and stayed green when every
    animated `translateX` was deleted — because the resting boxes behind the
    chips are also placed with `transform: [{ translateX }]`, statically. The
    highlight had stopped moving and the rule was reading a static placement.
    Third time in one session that a rule of mine matched a spelling instead of
    a behaviour.
  */
  const animated = (code.match(/useAnimatedStyle\(\(\) => \(\{[\s\S]*?\}\)\)/g) ?? []).join('\n');
  if (!/translateX/.test(animated)) {
    problems.push(
      `${MOVER} không còn dịch chuyển pill. Một segmented control là một câu nói về VỊ TRÍ — chuyển ` +
        'động chính là câu trả lời "cái nào trong số này", vì nó mang theo quan hệ giữa chỗ bạn vừa ở ' +
        'và chỗ bạn đang tới. Đổi sang mờ dần thì control vẫn chạy và đã thôi nói gì',
    );
  }
  /* Width and left must be static: animating either re-runs layout every frame,
     which is what `tools/motion.mjs` was written for. */
  if (/withTiming\([^)]*\)\s*,?\s*\n?\s*(width|left|right):/.test(code) || /(width|left):\s*withTiming/.test(code)) {
    problems.push(
      `${MOVER} animate thuộc tính layout (width/left). Chạy lại bố cục mỗi khung hình — đúng lỗi ` +
        'mà tools/motion.mjs đã bắt ở bạn đồng hành Koa vài commit trước. Các segment chia đều nên vị ' +
        'trí thứ i là i × bề rộng, và translateX làm được cả việc',
    );
  }
  /*
    The call and the use, not the name.

    The first version of this rule tested for the string `useReducedMotion`, and
    stayed green when the call was replaced with `false` — because the import
    line still carried the word. Checking a name rather than a behaviour, which
    is the flaw this repository keeps finding in its own guards.
  */
  const flag = code.match(/const (\w+) = useReducedMotion\(\)/);
  if (!flag) {
    problems.push(`${MOVER} không GỌI useReducedMotion() — cài đặt hệ thống tồn tại đúng cho loại chuyển động này`);
  } else {
    /*
      Where the branch lives is not the test; whether the flag reaches a branch
      that skips the animation is.

      The first version demanded `reduceMotion` inside `useAnimatedStyle`, which
      was true of the old `Segmented` and is false of every component in this
      app that got the architecture right afterwards — `progress-bar.tsx` and
      `pick-row.tsx` both branch where the shared value is ASSIGNED, and their
      worklets read nothing but shared values. A rule that insists on one shape
      of correct code fails the other one, and it failed it loudly the moment
      the rewrite landed.

      So: follow the flag. Names derived from it count as the flag, and one of
      them has to gate a `withTiming` — that is the branch that means "arrive
      without travelling".
    */
    const names = new Set([flag[1]]);
    for (let pass = 0; pass < 3; pass++) {
      for (const m of code.matchAll(/const (\w+) = ([^;\n]*(?:\n[^;\n]*)?);/g)) {
        if ([...names].some((n) => new RegExp(`\\b${n}\\b`).test(m[2]))) names.add(m[1]);
      }
    }
    /*
      The timing call gets followed too, not just the flag.

      This rule already had to stop caring WHERE the branch lives. It then broke
      a second time, on a refactor that changed nothing about behaviour:

          const go = (v) => withTiming(v, { duration, easing });
          x.value = jump ? here.x : go(here.x);

      `withTiming` is still what the false branch reaches; it now reaches it
      through a name. A rule that only recognises the literal call is reading
      the spelling. So: collect the names whose definition leads to a timing
      call, and let the branch mention any of them.
    */
    const timed = new Set(['withTiming', 'withSpring', 'withDelay']);
    for (let pass = 0; pass < 3; pass++) {
      for (const m of code.matchAll(/const (\w+) = ([^;]*?);/g)) {
        if ([...timed].some((t) => new RegExp(`\\b${t}\\b`).test(m[2]))) timed.add(m[1]);
      }
    }
    const reach = [...timed].join('|');
    const gates = [...code.matchAll(new RegExp(`([\\w.$]+)\\s*\\?[^;]*?\\b(?:${reach})\\b`, 'g'))]
      .some((m) => [...names].some((n) => new RegExp(`\\b${n}\\b`).test(m[1])));
    const inStyle = (code.match(/useAnimatedStyle\(\(\) => \(\{[\s\S]*?\}\)\)/g) ?? [])
      .some((b) => [...names].some((n) => new RegExp(`\\b${n}\\b`).test(b)));
    if (!gates && !inStyle) {
      problems.push(
      `${MOVER} đọc Reduce Motion nhưng không dùng nó trong style động — cờ được lấy về rồi bỏ đi ` +
        'thì cũng như không có',
      );
    }
  }
}

/* ── 2. nobody builds a sixth one ── */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(e) ? [p] : [];
    });

  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT) continue;
    const src = strip(readFileSync(file, 'utf8'));
    /* The shape every one of the five had: a style pair toggled on a match. */
    const hand = /styles\.(tab|segment)\b[^\]]{0,60}&&\s*styles\.(tabActive|segmentActive)\b/.test(src);
    if (hand) {
      problems.push(
        `${rel} tự dựng lại segmented control (\`styles.tab\` + \`styles.tabActive\`). Đã có 5 bản chép ` +
          'như vậy và không bản nào có chuyển động; dùng <Segmented> thay vì viết bản thứ sáu',
      );
    }
  }
}

/* ── 3. and no copy left its styles behind ──

   The mascot room's five tab styles outlived the markup that used them. Dead
   style is not harmless: the next person reads it as the pattern to follow. */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(e) ? [p] : [];
    });
  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT) continue;
    const src = readFileSync(file, 'utf8');
    for (const k of ['tabActive', 'segmentActive', 'tabTextActive', 'segmentTextActive']) {
      const declared = new RegExp(`\\n  ${k}: \\{`).test(src);
      const used = new RegExp(`styles\\.${k}\\b`).test(src);
      if (declared && !used) {
        problems.push(
          `${rel} còn style \`${k}\` mà không ai render — tàn dư của một bản segmented đã gỡ. Style chết ` +
            'không vô hại: người đọc sau sẽ hiểu đó là khuôn mẫu để làm theo',
        );
      }
    }
  }
}

/* ── 4. a segmented control that swaps panels must not swap them by hard cut ──

   `day-plan.tsx` worked this out on its own screen and wrote it down: the
   panel under a segmented control is being *replaced*, not arriving, so it
   wants one short uniform fade — not the app's `rise(i)` cascade, which
   "left three cascades overlapping each other" when you tapped T2, T3, T4 in
   sequence. Then that finding sat in one file while five other segmented
   controls kept cutting.

   That is the shape being guarded, and it is the shape this repository keeps
   meeting: one rule, N copies, and only one copy knows the rule.

   `screen.tsx` records the opposite mistake twice — animating a whole tab
   screen with `FadeInDown`, which "begins at invisible… wrong on a page that
   is already drawn: replaying an entrance there has to un-draw it first". So
   this rule deliberately does NOT ask every `<Segmented>` to animate. It asks
   only the ones whose value gates a block of JSX — the panel genuinely is not
   drawn yet, so nothing is being un-drawn. A `<Segmented>` used as a value
   picker (sex, kg/lbs in edit-profile) changes no panel and is left alone.

   And the wrapper has to sit BETWEEN the control and the panel. A
   `SegmentPanel` imported, rendered somewhere else, and never actually put
   around the conditional would satisfy a name check while the cut stayed —
   which is exactly how `koa-companion.mjs` and `segmented.mjs`'s own reduce-
   motion rule managed to pass on code that did not do the thing. */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(e) ? [p] : [];
    });
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT) continue;
    const src = readFileSync(file, 'utf8');

    for (const m of src.matchAll(/<Segmented\b/g)) {
      /* the value bound to this control — search only the tag itself */
      const tag = src.slice(m.index, src.indexOf('/>', m.index) + 2);
      const v = tag.match(/value=\{([A-Za-z_$][\w$.]*)\}/);
      if (!v) continue;
      const key = v[1];

      /* does this value gate JSX? `{key === '…'` / `{key !== '…'` in an
         expression container is a conditional render (or a conditional style,
         which is the same swap seen from the other side). */
      const cond = new RegExp(`\\{\\s*${esc(key)}\\s*(===|!==)\\s*'`, 'g');
      const conds = [...src.matchAll(cond)].map((c) => c.index).filter((i) => i > m.index);
      if (!conds.length) continue; /* a value picker, not a panel switcher */

      /*
        The key has to be IN the segment expression, not be the whole of it.

        What this rule is for is that the panel remounts when the control moves,
        and `segment={single ? \`one:${single}\` : scope}` does that — the
        exercise-insight screen keys on the scope AND on a deep-linked single
        exercise, so both changes fade. Demanding the bare identifier would have
        forced that screen to drop the second one to satisfy a rule about the
        first.
      */
      /* Bounded by `>` and not by `}`: the expression can contain a template
         literal — `` `one:${single}` `` — and a `}`-bounded match stops inside
         it, reporting a correctly keyed panel as missing. */
      const panel = new RegExp(`<SegmentPanel segment=\\{[^>]*\\b${esc(key)}\\b`);
      const found = panel.exec(src);
      const wrap = found ? found.index : -1;
      if (wrap < 0) {
        problems.push(
          `${rel}: <Segmented value={${key}}> đổi panel bên dưới nhưng panel đó bị CẮT CỤP — không có ` +
            `<SegmentPanel segment={${key}}>. day-plan.tsx đã tìm ra và ghi lại điều này cho màn của ` +
            'nó rồi để năm control còn lại nguyên như cũ: một luật, N bản chép, chỉ một bản biết luật',
        );
        continue;
      }
      /*
        The test is that panel content is INSIDE the wrapper, not that the
        wrapper comes before the first conditional anywhere on the screen.

        The first draft asked for the stricter thing and was wrong about a real
        screen: `shop.tsx` renders a shared category row between the segmented
        strip and the panel, gated on `tab === 'outfit' || tab === 'closet'`.
        That row is a second *control*, and it deliberately sits outside the
        wrapper — it is a horizontal ScrollView shared by two tabs, so a keyed
        remount would throw away its scroll position on every tab change. A
        rule that forces it inside would be asking for that bug by name.
      */
      /*
        Something real inside, not necessarily a conditional on the key.

        The first version asked for `{key === '…'}` between the tags, because
        that is how four of the five screens switch their panel. The fifth
        filters upstream — `exercise-insight` derives the list from the scope
        and then renders it — so its wrapper held the whole panel and the rule
        called it empty.

        What the rule is actually for is a wrapper placed BELOW the panel
        instead of around it, which leaves the cut in place while a name check
        stays green. That is an empty wrapper, and emptiness is the thing to
        test: a conditional on the key counts, and so does any markup at all.
      */
      const close = src.indexOf('</SegmentPanel>', wrap);
      const span = close > 0 ? src.slice(src.indexOf('>', wrap) + 1, close) : '';
      const bare = span.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trim();
      const inside =
        close > 0 && (conds.some((i) => i > wrap && i < close) || /<[A-Za-z]/.test(bare));
      if (!inside) {
        problems.push(
          `${rel}: có <SegmentPanel segment={${key}}> nhưng KHÔNG có nội dung rẽ nhánh nào nằm BÊN ` +
            'TRONG nó — bọc nhầm chỗ thì cú cắt vẫn còn nguyên trong khi phép kiểm theo tên vẫn xanh, ' +
            'đúng kiểu đã lọt hai lần ở repo này',
        );
      }
    }
  }
}

/* ── 5. the wrapper must give back the spacing it took away ──

   `SegmentPanel` turns N children of `Screen` into ONE child. `Screen` stacks
   its children with `gap: spacing.stack`, so every gap inside the wrapper
   disappears the moment it is added. Measured on `/progress` at x=200 when
   this component first shipped: above the wrapper the page background shows for
   exactly 20px, and inside it for none at all — card ends at y=194, next card's
   top edge at y=195. The cards were touching.

   That is the whole failure. It type-checks. No route throws. Nothing renders
   blank. The screen is still usable and just quietly looks worse, on four
   screens at once, which is precisely the kind of thing that survives review.

   So: the wrapper must apply a gap, and its default must be the SYMBOL
   `spacing.stack` rather than a copy of its value — a literal 20 here would go
   stale the day somebody tunes the scale, and go stale invisibly. */
{
  const wrapper = readFileSync(path.join(NATIVE, COMPONENT), 'utf8');
  const fn = wrapper.slice(wrapper.indexOf('export function SegmentPanel'));

  if (!/style=\{\{\s*gap\s*\}\}/.test(fn)) {
    problems.push(
      'SegmentPanel không đặt gap — nó gộp N con của Screen thành MỘT, nên toàn bộ khe bên trong biến ' +
        'mất (đo trên /progress tại x=200: trên vòng bọc nền trang lộ ra đúng 20px, bên trong lộ ra 0px — ' +
        'thẻ kết thúc ở y=194, thẻ kế tiếp bắt đầu ngay y=195, tức DÍNH LIỀN). Không sai kiểu, ' +
        'không màn nào trắng, không luật nào khác thấy: chỉ là bốn màn cùng lúc trông xấu đi trong im lặng',
    );
  }
  const def = fn.match(/gap = ([^,\n]+),/);
  if (!def) {
    problems.push('SegmentPanel không còn giá trị gap mặc định — mỗi chỗ gọi lại phải tự nhớ, và sẽ có chỗ quên');
  } else if (def[1].trim() !== 'spacing.stack') {
    problems.push(
      `SegmentPanel lấy gap mặc định là \`${def[1].trim()}\` chứ không phải \`spacing.stack\` — chép GIÁ TRỊ ` +
        'của thang khoảng cách thay vì trỏ vào nó thì hôm nào thang được chỉnh, bốn màn này lệch đi trong im lặng',
    );
  }
}

/* ── 6. no hand-built exclusive picker anywhere ──

   Rule 2 looks for `styles.tab` + `styles.tabActive`, because that is what the
   five copies it was written for were called. Nine more rows were doing exactly
   the same thing under different names — `chip`/`chipActive`, `seg`/`segActive`,
   `modeChip`, `poseChip`, `intervalChip`, `langChip` — and every one of them
   sailed past a rule whose whole purpose was to catch them. It was matching the
   word `tab`.

   The shape has nothing to do with the name. It is:

       style={[styles.X, <something> === <something> && styles.XActive]}

   An equality test is what makes it EXCLUSIVE — one of these, not some of
   these — and exclusive is what earns a travelling highlight. Rows that test
   membership (`allergies.includes(a.value)`) or a boolean (`aiOpen`,
   `editMode`) are multi-select or toggles: several can be on at once, so there
   is no single place for a highlight to be and this must NOT ask them to have
   one. That distinction is the rule, not an exception to it. */
{
  const walk = (dir) =>
    readdirSync(dir).flatMap((e) => {
      const p = path.join(dir, e);
      return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(e) ? [p] : [];
    });
  /* Rows that are exclusive but are not a row of buttons, kept out by name and
     with the reason next to them — the same shape as motion.mjs's LEGACY. */
  const NOT_A_ROW = {
    'src/app/ai-coach.tsx': 'danh sách hội thoại đã lưu — một danh sách dọc cuộn được, không phải một hàng nút; ' +
      'dấu chọn chạy dọc qua các dòng chữ dài ngắn khác nhau là một thứ khác hẳn và chưa ai xin',
  };
  for (const file of walk(path.join(NATIVE, 'src'))) {
    const rel = path.relative(NATIVE, file);
    if (rel === COMPONENT || rel === MOVER) continue;
    const body = strip(readFileSync(file, 'utf8'));
    for (const m of body.matchAll(/style=\{\[\s*styles\.(\w+)\s*,\s*([^\]]*?)&&\s*styles\.\1Active\s*\]\}/g)) {
      if (!/===|!==/.test(m[2])) continue; /* multi-select or a toggle — leave it alone */
      if (NOT_A_ROW[rel]) continue;
      /*
        The container, not the label.

        `styles.chipText` + `styles.chipTextActive` is the same expression on a
        `<Text>`, and switching a label's colour outright is CORRECT here — it
        is what `Segmented` has always done while its pill slides underneath.
        The first draft flagged six of those. Excluding names that end in `Text`
        would be reading the spelling again, so this reads the element the style
        is on: a travelling highlight is a thing that happens to a box.
      */
      const tag = [...body.slice(0, m.index).matchAll(/<([A-Za-z][\w.]*)/g)].pop()?.[1];
      if (tag === 'Text') continue;
      const line = body.slice(0, m.index).split('\n').length;
      problems.push(
        `${rel}:${line} dựng một hàng chọn-MỘT bằng tay (styles.${m[1]} + styles.${m[1]}Active). Bấm sang ` +
          'nút khác là tắt đèn chỗ này bật đèn chỗ kia trong cùng một khung hình: hai sự kiện rời nhau, ' +
          'không có gì nói rằng đó vẫn là một lựa chọn. Dùng <PickRow> để dấu chọn ĐI sang',
      );
    }
  }
  for (const rel of Object.keys(NOT_A_ROW)) {
    if (!existsSync(path.join(NATIVE, rel))) {
      problems.push(`NOT_A_ROW còn ghi ${rel} nhưng tệp đó không còn — xoá dòng đó đi`);
    }
  }
}

if (problems.length) {
  console.log('segmented CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  'segmented OK — một control dùng chung thay cho SÁU bản chép (dinh dưỡng, tiến độ, cửa hàng, phòng ' +
    'Koa, pháp lý, và một bản cục bộ trong sửa hồ sơ — bản pháp lý do chính luật này tìm ra ở lần chạy ' +
    'đầu, tôi đã sót khi kiểm kê bằng tay); pill DI CHUYỂN giữa các mục chứ không nhảy cóc, và di ' +
    'chuyển bằng translateX chứ không animate width/left — animate layout là chạy lại bố cục mỗi khung ' +
    'hình, đúng lỗi tools/motion.mjs đã bắt ở bạn đồng hành Koa; tôn trọng Reduce Motion; không file ' +
    'nào dựng bản thứ sáu bằng cặp styles.tab + styles.tabActive, và không file nào để lại style chết ' +
    'của bản cũ — phòng Koa từng giữ nguyên cả năm style tab mà không render cái nào; và mọi control ĐỔI PANEL đều phải bọc panel bằng SegmentPanel dùng chung, đặt ĐÚNG giữa control và panel, trong khi control chỉ dùng để chọn giá trị (giới tính, kg/lbs) thì không bị đòi — screen.tsx đã ghi hai lần thất bại vì làm hoạt ảnh vào thứ đã vẽ xong; và vòng bọc TRẢ LẠI đúng khoảng cách nó vừa lấy đi — gộp N con của Screen thành một là xoá sạch khe giữa chúng, thứ không sai kiểu, không làm màn nào trắng, chỉ khiến bốn màn cùng lúc trông xấu đi trong im lặng',
);
