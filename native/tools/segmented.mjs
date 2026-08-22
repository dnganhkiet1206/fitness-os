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
    'của bản cũ — phòng Koa từng giữ nguyên cả năm style tab mà không render cái nào',
);
