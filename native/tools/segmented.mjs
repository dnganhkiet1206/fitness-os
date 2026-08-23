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
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(path.join(NATIVE, rel), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];

const COMPONENT = 'src/components/ascnd/segmented.tsx';
const code = strip(read(COMPONENT));

/* ── 1. the pill travels, and it travels by transform ── */
{
  if (!/translateX/.test(code)) {
    problems.push(
      `${COMPONENT} không còn dịch chuyển pill. Một segmented control là một câu nói về VỊ TRÍ — chuyển ` +
        'động chính là câu trả lời "cái nào trong số này", vì nó mang theo quan hệ giữa chỗ bạn vừa ở ' +
        'và chỗ bạn đang tới. Đổi sang mờ dần thì control vẫn chạy và đã thôi nói gì',
    );
  }
  /* Width and left must be static: animating either re-runs layout every frame,
     which is what `tools/motion.mjs` was written for. */
  if (/withTiming\([^)]*\)\s*,?\s*\n?\s*(width|left|right):/.test(code) || /(width|left):\s*withTiming/.test(code)) {
    problems.push(
      `${COMPONENT} animate thuộc tính layout (width/left). Chạy lại bố cục mỗi khung hình — đúng lỗi ` +
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
  if (!/useReducedMotion\(\)/.test(code)) {
    problems.push(`${COMPONENT} không GỌI useReducedMotion() — cài đặt hệ thống tồn tại đúng cho loại chuyển động này`);
  }
  const styleBlock = code.match(/useAnimatedStyle\(\(\) => \(\{[\s\S]*?\}\)\)/);
  if (styleBlock && !/reduceMotion/.test(styleBlock[0])) {
    problems.push(
      `${COMPONENT} đọc Reduce Motion nhưng không dùng nó trong style động — cờ được lấy về rồi bỏ đi ` +
        'thì cũng như không có',
    );
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

      const wrap = src.indexOf(`<SegmentPanel segment={${key}}>`);
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
      const close = src.indexOf('</SegmentPanel>', wrap);
      const inside = close > 0 && conds.some((i) => i > wrap && i < close);
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
