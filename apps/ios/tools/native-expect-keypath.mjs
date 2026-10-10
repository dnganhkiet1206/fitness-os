#!/usr/bin/env node
/**
 * Swift Testing: không truyền key path cho hàm `rethrows` ở CẤP NGOÀI CÙNG của
 * `#expect` / `#require` (#527, A).
 *
 * ── vì sao có bước này ──
 *
 * `#expect(xs.allSatisfy(\.done))` không biên dịch: khi biểu thức ngoài cùng là
 * một lời gọi phương thức, macro tách nó thành
 * `__checkFunctionCall(xs, calling: { $0.allSatisfy($1) }, \.done)` — key path
 * thành một giá trị hàm có thể `throws`, và lời gọi `rethrows` không có `try`:
 * "call can throw, but it is not marked with 'try'". Lỗi chỉ lộ khi build gói
 * test (core-linux / app-macos) và làm HỎNG CẢ target test — không test nào
 * chạy. Đã lặp hai lần: A (`1af90ebb`, `MealLogTests`) và E (`b2c58c57`,
 * `CommunityFeedTests:344`).
 *
 * ── luật (hẹp, chỉ dạng đã chứng minh) ──
 *
 * Trong `#expect(…)` / `#require(…)` của `apps/ios/Packages/*\/Tests`: đối số
 * đầu (bỏ `try` / `await`) là MỘT lời gọi `….tên(…)` kết thúc biểu thức — không
 * có toán tử hai ngôi nào ở cấp ngoài — với `tên` là một hàm `rethrows` của thư
 * viện chuẩn nhận closure (bảng `RETHROWS`), và có một đối số là key path literal
 * (`\.x`, `\Kiểu.x`). Sửa: closure — `xs.allSatisfy { $0.done }`.
 *
 * KHÔNG báo (biên dịch được, đã có trong repo): key path lồng bên trong một
 * biểu thức hai ngôi (`#expect(xs.map(\.id) == [...])`), closure, trailing
 * closure.
 *
 * Vùng mù (không báo vì chưa chứng minh được hành vi của macro): biểu thức bắt
 * đầu bằng `!`, hàm `rethrows` do dự án tự viết, key path đi qua biến
 * (`let kp = \.x; xs.allSatisfy(kp)`), lời gọi trải nhiều đối số macro lạ.
 *
 *   node apps/ios/tools/native-expect-keypath.mjs
 *   node apps/ios/tools/native-expect-keypath.mjs --self-test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const PACKAGES = join(ROOT, 'apps/ios/Packages');
const FIXTURES = join(ROOT, 'apps/ios/tools/fixtures/expect-keypath');

/** Phương thức `rethrows` của Sequence / Collection nhận một hàm. */
const RETHROWS = new Set([
  'allSatisfy', 'contains', 'first', 'last', 'firstIndex', 'lastIndex', 'filter', 'map', 'compactMap',
  'flatMap', 'sorted', 'min', 'max', 'drop', 'prefix', 'reduce', 'forEach', 'split', 'elementsEqual',
  'starts', 'lexicographicallyPrecedes', 'count', 'partition', 'removeAll',
]);

const walk = (dir) =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return n === '.build' ? [] : walk(p);
    return n.endsWith('.swift') ? [p] : [];
  });

/** Bỏ chú thích; thay nội dung chuỗi bằng khoảng trắng (giữ độ dài, giữ dòng). */
function scrub(src) {
  let out = '', i = 0, inStr = false;
  while (i < src.length) {
    const ch = src[i], nx = src[i + 1];
    if (inStr) {
      if (ch === '\\') { out += '  '; i += 2; continue; }
      if (ch === '"') { inStr = false; out += '"'; i++; continue; }
      out += ch === '\n' ? '\n' : ' ';
      i++;
      continue;
    }
    if (ch === '"') { inStr = true; out += '"'; i++; continue; }
    if (ch === '/' && nx === '/') { while (i < src.length && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (ch === '/' && nx === '*') {
      const end = src.indexOf('*/', i + 2);
      const stop = end < 0 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

const OPEN = '([{', CLOSE = ')]}';

/** Vị trí ngoặc đóng khớp với ngoặc mở ở `i`. */
function matching(s, i) {
  let depth = 0;
  for (let j = i; j < s.length; j++) {
    if (OPEN.includes(s[j])) depth++;
    else if (CLOSE.includes(s[j])) { depth--; if (depth === 0) return j; }
  }
  return -1;
}

/** Tách theo dấu phẩy ở cấp 0. */
function splitTop(s) {
  const parts = [];
  let depth = 0, start = 0;
  for (let j = 0; j < s.length; j++) {
    if (OPEN.includes(s[j])) depth++;
    else if (CLOSE.includes(s[j])) depth--;
    else if (s[j] === ',' && depth === 0) { parts.push(s.slice(start, j)); start = j + 1; }
  }
  parts.push(s.slice(start));
  return parts;
}

/** Phần ở cấp 0 của biểu thức (bỏ nội dung mọi cặp ngoặc). */
function topLevel(s) {
  let out = '', depth = 0;
  for (const ch of s) {
    if (OPEN.includes(ch)) { if (depth === 0) out += ch; depth++; continue; }
    if (CLOSE.includes(ch)) { depth--; if (depth === 0) out += ch; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/** Toán tử hai ngôi ở cấp ngoài (không tính `?.` / `!.` / `!` hậu tố của optional). */
const BINARY = /==|!=|<=|>=|&&|\|\||\?\?|[<>+*\/%&|^]|\s-\s|\s(?:is|as)\s|\s(?:as[?!])\s|=/;

/** Lý do biểu thức đầu của một macro là dạng hỏng, hay `null`. */
function verdict(expr) {
  let e = expr.trim().replace(/^(?:try\??\s+|await\s+)+/, '').trim();
  if (e.startsWith('!')) return null; // vùng mù: phủ định
  const top = topLevel(e);
  if (BINARY.test(top.replace(/[?!](?=[.(\[])|!$/g, ''))) return null;
  if (!e.endsWith(')')) return null;
  // Lời gọi cuối: `.tên(` có ngoặc khớp tới đúng cuối biểu thức.
  const m = /\.([A-Za-z_]\w*)\s*\($/.exec(top.slice(0, -1));
  if (!m) return null;
  const name = m[1];
  if (!RETHROWS.has(name)) return null;
  let open = -1;
  for (let j = e.length - 1, depth = 0; j >= 0; j--) {
    if (CLOSE.includes(e[j])) depth++;
    else if (OPEN.includes(e[j])) { depth--; if (depth === 0) { open = j; break; } }
  }
  if (open < 0 || matching(e, open) !== e.length - 1) return null;
  const args = splitTop(e.slice(open + 1, -1));
  const kp = args.find((a) => /^\s*(?:[A-Za-z_]\w*\s*:\s*)?\\[A-Za-z_.]/.test(a));
  return kp ? `${name}(${kp.trim()}) — key path tới hàm rethrows ở cấp ngoài cùng; dùng closure` : null;
}

/** Mọi vi phạm của một tệp. */
function check(src, rel) {
  const s = scrub(src);
  const found = [];
  const re = /#(expect|require)\s*\(/g;
  let m;
  while ((m = re.exec(s))) {
    const open = m.index + m[0].length - 1;
    const close = matching(s, open);
    if (close < 0) continue;
    const first = splitTop(s.slice(open + 1, close))[0];
    const why = verdict(first);
    if (why) found.push(`${rel}:${s.slice(0, m.index).split('\n').length}: #${m[1]} ${why}`);
  }
  return found;
}

if (process.argv.includes('--self-test')) {
  let bad = 0;
  for (const name of readdirSync(FIXTURES).sort()) {
    const found = check(readFileSync(join(FIXTURES, name), 'utf8'), name);
    const wantRed = name.startsWith('bad-');
    const ok = wantRed ? found.length > 0 : found.length === 0;
    console.log(`${ok ? 'ok  ' : 'SAI '} ${name}: ${found.length ? found.map((f) => f.split(': ').slice(1).join(': ')).join('; ') : 'xanh'}`);
    if (!ok) bad++;
  }
  if (bad) {
    console.log(`native-expect-keypath --self-test: ĐỎ (${bad} fixture sai kỳ vọng)`);
    process.exit(1);
  }
  console.log('native-expect-keypath --self-test: XANH');
} else {
  const files = readdirSync(PACKAGES)
    .map((p) => join(PACKAGES, p, 'Tests'))
    .filter((d) => { try { return statSync(d).isDirectory(); } catch { return false; } })
    .flatMap(walk);
  const found = files.flatMap((p) => check(readFileSync(p, 'utf8'), relative(ROOT, p)));
  if (found.length) {
    console.log('native-expect-keypath: ĐỎ — gói test sẽ không biên dịch (core-linux / app-macos):');
    for (const f of found) console.log('  ' + f);
    process.exit(1);
  }
  console.log(`native-expect-keypath: XANH (${files.length} tệp test)`);
}
