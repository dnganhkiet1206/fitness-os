#!/usr/bin/env node
/**
 * Giảm chuyển động (Reduce Motion) ở app iOS — C (#386); viết lại 04/11/2026
 * để vào cổng.
 *
 * ── vì sao viết lại ──
 *
 * Bản đầu nhìn 5 dòng phía TRÊN mỗi lời gọi xem có chữ `reduceMotion` không.
 * Ngày 04/11 nó báo 19 chỗ và 15 chỗ là oan: lời gọi nhiều dòng để
 * `reduceMotion:` ở dòng SAU, hay dùng một tên đã tính từ `reduceMotion` ở xa
 * hơn 5 dòng (`private var motion: Animation? { DSMotion.animation(…,
 * reduceMotion: reduceMotion) }`, `let running = … && !reduceMotion`). Một luật
 * kêu oan 15/19 lần thì không ai đưa vào cổng, nên 4 chỗ thật (thẻ kéo trượt
 * lên và nảy về khi đã bật Giảm chuyển động, cảnh Koa đi ngủ không có nút dừng,
 * hai lần mở / đóng thẻ không ghi vì sao được giữ) nằm đó không ai thấy.
 *
 * ── luật ──
 *
 * Mỗi `.animation(…)`, `withAnimation`, `TimelineView(.animation…)` trong
 * `apps/ios/ASCND`, `apps/ios/ASCNDWidgets` và `apps/ios/Packages` phải cho
 * thấy nó đã tính tới Giảm chuyển động, bằng một trong bốn cách:
 *
 *   1. chữ `reduceMotion` nằm từ 5 dòng trên tới 3 dòng dưới lời gọi;
 *   2. chính lời gọi (tới dấu đóng ngoặc, tối đa 4 dòng) dùng một tên mà định
 *      nghĩa của nó trong cùng tệp có `reduceMotion`, trực tiếp hay qua tên
 *      khác: `var motion … reduceMotion`, `let live = interactive && running`
 *      (running có `!reduceMotion`), tham số có nhãn `paused: reduceMotion || asleep`;
 *   3. `.animation(nil` — không có chuyển động;
 *   4. dòng đánh dấu `// reduce-motion: <lý do>` ngay trên hay cùng dòng, cho
 *      chỗ khi bật Giảm chuyển động chỉ còn MỜ DẦN (mờ dần được phép; trượt,
 *      phóng, nảy thì không). Lý do bắt buộc: dấu trống vẫn đỏ.
 *
 * ── vùng mù ──
 *
 * Luật đọc chữ, không đọc kiểu. Hai view trong một tệp dùng chung một tên thì
 * một cái có `reduceMotion` là cả hai qua. Dấu `reduce-motion:` là lời hứa của
 * người viết, máy không kiểm "chỉ còn mờ dần" có đúng không. Chuyển động không
 * đi qua ba lời gọi trên thì không thấy: `.symbolEffect(.bounce)` một lần lúc
 * chạm (hiệu ứng lặp thì app đã gắn `isActive: !reduceMotion`),
 * `keyframeAnimator` / `phaseAnimator`, UIKit.
 *
 *   node apps/ios/tools/native-motion-audit.mjs
 *   node apps/ios/tools/native-motion-audit.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/ios/ASCND', 'apps/ios/ASCNDWidgets', 'apps/ios/Packages'];
const BEFORE = 5;
const AFTER = 3;
const CALL_LINES = 4;
const MARKER = /\/\/\s*reduce-motion:(.*)$/;

function swiftFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...swiftFiles(p));
    else if (name.endsWith('.swift')) out.push(p);
  }
  return out;
}

/** Bỏ chú thích, giữ nguyên số dòng. */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '))
    .split('\n')
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

const word = (name) => new RegExp(`\\b${name}\\b`);

/** Tên có định nghĩa (trong tệp) dẫn tới `reduceMotion`, lan tới điểm dừng. */
export function awareNames(code) {
  const lines = code.split('\n');
  const defs = [];
  lines.forEach((l, i) => {
    for (const m of l.matchAll(/\b(?:let|var)\s+([A-Za-z_]\w*)/g)) {
      let text = l.slice(m.index + m[0].length);
      // thuộc tính tính toán: thân ở mấy dòng sau
      if (/\{\s*$/.test(l)) text += '\n' + lines.slice(i + 1, i + 3).join('\n');
      defs.push([m[1], text]);
    }
    // tham số có nhãn ở chỗ gọi: `studio(size, paused: reduceMotion || asleep)` (sau `(` hay `,`, không
    // phải nhánh của `a ? b : c` hay kiểu của `var x: T`)
    for (const m of l.matchAll(/[(,]\s*([A-Za-z_]\w*)\s*:\s*([^,)]+)/g)) defs.push([m[1], m[2]]);
  });
  const aware = new Set(['reduceMotion']);
  for (let grew = true; grew; ) {
    grew = false;
    for (const [name, text] of defs) {
      if (aware.has(name)) continue;
      if ([...aware].some((a) => word(a).test(text))) {
        aware.add(name);
        grew = true;
      }
    }
  }
  return aware;
}

/** Chữ trong ngoặc của lời gọi, từ `(` ở `col` dòng `i` tới khi ngoặc cân, tối đa CALL_LINES dòng. */
function callText(lines, i, col) {
  // không có ngoặc (`withAnimation {`, `TimelineView(.animation)`) thì không có gì để xét
  if (!/^\s*\(/.test(lines[i].slice(col))) return '';
  let depth = 0;
  let out = '';
  let opened = false;
  for (let k = i; k < Math.min(lines.length, i + CALL_LINES); k++) {
    const l = k === i ? lines[k].slice(col) : lines[k];
    for (const ch of l) {
      out += ch;
      if (ch === '(') {
        depth++;
        opened = true;
      } else if (ch === ')') {
        depth--;
        if (opened && depth === 0) return out;
      }
    }
    out += '\n';
  }
  return out;
}

export function checkFile(src) {
  const raw = src.split('\n');
  const lines = stripComments(src).split('\n');
  const aware = awareNames(lines.join('\n'));
  const awareRe = [...aware].map(word);
  const problems = [];
  lines.forEach((line, i) => {
    for (const m of line.matchAll(/TimelineView\(\s*\.animation\b|\.animation\(|\bwithAnimation\b/g)) {
      const kind = m[0].startsWith('TimelineView') ? 'TimelineView(.animation)' : m[0] === 'withAnimation' ? 'withAnimation' : '.animation()';
      if (kind === '.animation()' && /^\s*nil\b/.test(line.slice(m.index + m[0].length))) continue;
      const window = lines.slice(Math.max(0, i - BEFORE), i + AFTER + 1).join('\n');
      if (/reduceMotion/.test(window)) continue;
      // chỉ xét giá trị truyền vào: bỏ tên hàm và nhãn, kẻo nhãn `paused:` trùng một tên đã biết thì lọt
      const call = callText(lines, i, m.index + m[0].length - (kind === '.animation()' ? 1 : 0)).replace(/([(,]\s*)[A-Za-z_]\w*\s*:/g, '$1');
      if (awareRe.some((re) => re.test(call))) continue;
      const mark = [raw[i], raw[i - 1] ?? ''].map((l) => l.match(MARKER)).find(Boolean);
      if (mark && mark[1].trim().length > 0) continue;
      problems.push(`${i + 1}: ${kind} không tính tới Giảm chuyển động${mark ? ' (dấu reduce-motion: thiếu lý do)' : ''}`);
    }
  });
  return problems;
}

function run() {
  const files = SCAN_DIRS.flatMap((d) => swiftFiles(join(ROOT, d)));
  if (files.length === 0) {
    console.error('✗ không thấy tệp .swift nào trong apps/ios');
    process.exit(1);
  }
  const failures = [];
  for (const f of files) for (const p of checkFile(readFileSync(f, 'utf8'))) failures.push(`${relative(ROOT, f)}:${p}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`Giảm chuyển động: ${failures.length} chỗ chưa tính tới`);
    process.exit(1);
  }
  console.log(`native-motion-audit: XANH — ${files.length} tệp, mọi .animation / withAnimation / TimelineView đều tính tới Giảm chuyển động`);
}

function selfTest() {
  const view = (body) => `struct V: View {\n  @Environment(\\.accessibilityReduceMotion) private var reduceMotion\n${'  let pad = 0\n'.repeat(6)}${body}\n}`;
  const bare = (body) => `struct V: View {\n${body}\n}`;
  const cases = [
    ['withAnimation trơn', checkFile(bare('  func f() { withAnimation(.spring) { x = 1 } }')), 1],
    ['.animation trơn', checkFile(bare('  var body: some View { Text("a").animation(.easeOut, value: v) }')), 1],
    ['TimelineView không dừng', checkFile(bare('  var body: some View { TimelineView(.animation) { _ in Text("a") } }')), 1],
    ['tên không dẫn tới reduceMotion', checkFile(bare('  let motion = Animation.spring\n  var body: some View { Text("a").animation(motion, value: v) }')), 1],
    ['dấu reduce-motion trống', checkFile(bare('  func f() {\n    // reduce-motion:\n    withAnimation(.spring) { x = 1 }\n  }')), 1],
    ['reduceMotion chỉ trong chú thích', checkFile(bare('  // reduceMotion\n  func f() { withAnimation(.spring) { x = 1 } }')), 1],
    ['env xa hơn 5 dòng, lời gọi không dùng', checkFile(view('  func f() { withAnimation(.spring) { x = 1 } }')), 1],
    ['ba ngôi tại chỗ', checkFile(bare('  var body: some View { Text("a").animation(reduceMotion ? nil : .spring, value: v) }')), 0],
    ['DSMotion ở dòng sau', checkFile(view('  var body: some View {\n    Text("a").animation(\n      DSMotion.animation(.spring, reduceMotion: reduceMotion),\n      value: v)\n  }')), 0],
    ['thuộc tính tính toán', checkFile(view('  private var motion: Animation? {\n    DSMotion.animation(.snappy, reduceMotion: reduceMotion)\n  }\n  var body: some View { Text("a").animation(motion, value: v) }')), 0],
    ['lan qua hai tên', checkFile(view('  var body: some View {\n    let running = animated && !reduceMotion\n    let live = interactive && running\n' + '    let pad = 0\n'.repeat(6) + '    TimelineView(.animation(paused: !live)) { _ in Text("a") }\n  }')), 0],
    ['tham số có nhãn ở chỗ gọi', checkFile(view('  var body: some View { studio(size, paused: reduceMotion || asleep) }\n' + '  let pad2 = 0\n'.repeat(6) + '  func studio(_ s: CGSize, paused: Bool) -> some View {\n    TimelineView(.animation(minimumInterval: 1, paused: paused)) { _ in Text("a") }\n  }')), 0],
    ['.animation(nil', checkFile(bare('  var body: some View { Text("a").animation(nil, value: away) }')), 0],
    ['dấu reduce-motion có lý do', checkFile(bare('  func f() {\n    // reduce-motion: chỉ còn mờ dần\n    withAnimation(.easeOut) { shown = true }\n  }')), 0],
    ['chỉ trong chú thích', checkFile(bare('  // withAnimation(.spring) { x = 1 }\n  /* .animation(.spring, value: v) */\n  let a = 1')), 0],
  ];
  let bad = 0;
  for (const [name, problems, want] of cases) {
    const ok = want === 0 ? problems.length === 0 : problems.length > 0;
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — ${JSON.stringify(problems)}`}`);
  }
  if (bad) {
    console.error(`self-test: ${bad} ca sai`);
    process.exit(1);
  }
  console.log(`self-test OK — ${cases.length} ca`);
}

if (process.argv.includes('--self-test')) selfTest();
else run();
