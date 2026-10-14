#!/usr/bin/env node
/**
 * Cổng a11y tĩnh cho SwiftUI (#278).
 *
 * Tương tự `unnamed-press.mjs` của RN: quét `apps/ios/** /*.swift`,
 * đỏ khi một `Button` không có tên cho VoiceOver, hoặc vùng chạm
 * có thể nhỏ hơn 44pt.
 *
 * ── luật ──
 *
 * 1. Mỗi `Button { ... } label: { ... }` hoặc `Button("...")` phải có MỘT trong:
 *    · chữ trực tiếp trong label (`Button("Bắt đầu")`, `Text("...")` trong label);
 *    · `.accessibilityLabel(...)` trên Button;
 *    · `.accessibilityHidden(true)` (cố ý ẩn, phải có lý do trong comment).
 * 2. Mỗi `Button` nên có `.frame(minHeight: 44)` hoặc nằm trong component
 *    đã đảm bảo (DSButton). Thiếu thì cảnh báo (không đỏ — có thể đã đủ
 *    qua padding/content).
 * 3. `.accessibilityElement(children: .combine)` không được bọc `Button`:
 *    combine nuốt nút thành chữ, VoiceOver không bấm được.
 *
 * Chạy: `node tools/swift-a11y.mjs` từ `native/` (repo root: `native/tools/...`).
 * Thoát 1 khi có lỗi đỏ.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(new URL('.', import.meta.url).pathname, '..', '..');
const IOS = join(ROOT, 'apps/ios');

function swiftFiles(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e === '.build') continue;
      swiftFiles(p, out);
    } else if (e.endsWith('.swift')) {
      out.push(p);
    }
  }
  return out;
}

const errors = [];
const warnings = [];

/**
 * Một nút = từ dòng `Button` tới hết chuỗi modifier của nó (14/10, B #527).
 *
 * Bản đầu xét 15 dòng cố định và chỉ nhận chữ viết thẳng `Text("…")`: một
 * nút có `.accessibilityLabel` ở dòng 16, hay nhãn `Text(String(localized:))`
 * / `Label(…)` / `Button(title)` bị báo "không tên" — 38/38 lỗi ở tab Tập
 * luyện là báo nhầm, nên báo cáo không dùng được để tìm lỗi thật. Nay đọc
 * đúng khối của nút (đếm ngoặc), và phép tự thử (`--self-test`) giữ cho các
 * nút THẬT không tên (chỉ có Image) vẫn đỏ.
 */
function buttonSpan(lines, i) {
  let depth = 0;
  let started = false;
  let j = i;
  for (; j < lines.length; j++) {
    const code = lines[j].replace(/"(?:[^"\\]|\\.)*"/g, '""').replace(/\/\/.*$/, '');
    for (const ch of code) {
      if (ch === '(' || ch === '{' || ch === '[') { depth++; started = true; }
      else if (ch === ')' || ch === '}' || ch === ']') depth--;
    }
    if (started && depth <= 0) break;
  }
  // Chuỗi modifier ngay sau: các dòng bắt đầu bằng "." (và khối của chúng).
  let k = j + 1;
  let d = 0;
  for (; k < lines.length; k++) {
    const t = lines[k].trim();
    if (d === 0 && !t.startsWith('.') && !t.startsWith('//')) break;
    const code = lines[k].replace(/"(?:[^"\\]|\\.)*"/g, '""');
    for (const ch of code) {
      if (ch === '(' || ch === '{' || ch === '[') d++;
      else if (ch === ')' || ch === '}' || ch === ']') d--;
    }
  }
  return lines.slice(i, k).join('\n');
}

/** Tên cho VoiceOver của một khối nút — `null` khi không có. */
export function buttonName(block) {
  // Button("…"), Button(String(localized:…)), Button(title) — tham số đầu là
  // tiêu đề, không phải `action:` / `role:`; có thể nằm ở dòng sau "Button(".
  const head = block.split('\n').slice(0, 2).join(' ');
  const m = head.match(/\bButton\s*\(\s*([^)]*)/);
  if (m && m[1].trim() && !/^(action|role)\s*:/.test(m[1].trim())) return 'title';
  if (/\.accessibilityLabel\s*\(/.test(block)) return 'accessibilityLabel';
  if (/\.accessibilityHidden\s*\(\s*true\s*\)/.test(block)) return 'hidden';
  if (/\bDSButton\s*\(/.test(block)) return 'DSButton';
  // Nhãn có chữ: Text(…) / Label(…) / TextField — dù là khoá, verbatim hay biến.
  if (/\b(Text|Label)\s*\(/.test(block)) return 'text';
  // Hàm dựng nhãn của chính màn (buttonLabel(title, …)): nhận tiêu đề.
  if (/\b\w*[Ll]abel\s*\(\s*\w+\s*,/.test(block)) return 'labelBuilder';
  return null;
}

const files = process.argv.includes('--self-test') ? [] : swiftFiles(IOS);
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = src.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bButton\s*[\(\{]/.test(line)) continue;
    if (/^\s*\/\//.test(line)) continue; // comment

    const block = buttonSpan(lines, i);
    const hasHidden = /\.accessibilityHidden\s*\(\s*true\s*\)/.test(block);
    const wrapsDS = /DSButton\s*\(/.test(block);

    if (!buttonName(block)) {
      errors.push(`${rel}:${i + 1}: Button không có tên cho VoiceOver`);
    }

    // Vùng chạm: tìm minHeight/minWidth ≥ 44 trong khối.
    const sizes = [...block.matchAll(/\.frame\s*\([^)]*minHeight:\s*(\d+)/g)].map((x) => parseInt(x[1], 10));
    const widths = [...block.matchAll(/\.frame\s*\([^)]*minWidth:\s*(\d+)/g)].map((x) => parseInt(x[1], 10));
    const bigEnough = sizes.some((v) => v >= 44) || widths.some((v) => v >= 44) || wrapsDS;
    if (!bigEnough && !hasHidden) {
      warnings.push(`${rel}:${i + 1}: Button chưa thấy minHeight/minWidth ≥ 44 (kiểm tra thủ công)`);
    }
  }

  for (const at of combineWrapsButton(lines)) {
    errors.push(`${rel}:${at + 1}: .combine có thể nuốt Button — tách nút ra khỏi phần tử gộp`);
  }
}

/**
 * Dòng `.accessibilityElement(children: .combine)` mà khối nó gắn vào có
 * `Button` bên trong. Khối = lùi qua các modifier (dòng bắt đầu bằng "."),
 * tới `}` đóng, rồi tới dòng mở cùng thụt lề. Bản đầu xét 30 dòng phía trên
 * bất kể khối nào — báo cả nút nằm ở khối anh em.
 */
export function combineWrapsButton(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/\.accessibilityElement\s*\(\s*children:\s*\.combine\s*\)/.test(lines[i])) continue;
    let close = i - 1;
    while (close >= 0 && (lines[close].trim() === '' || lines[close].trim().startsWith('.') || lines[close].trim().startsWith('//'))) close--;
    if (close < 0 || !/^\s*\}/.test(lines[close])) continue;
    const want = lines[close].match(/^\s*/)[0].length;
    let open = close - 1;
    for (; open >= 0; open--) {
      const ind = lines[open].match(/^\s*/)[0].length;
      if (ind === want && /\{\s*$/.test(lines[open])) break;
    }
    if (open < 0) continue;
    const body = lines.slice(open + 1, close).join('\n');
    if (/\bButton\s*[\(\{]/.test(body) && !/DSButton/.test(body)) out.push(i);
  }
  return out;
}

if (process.argv.includes('--self-test')) {
  const cases = [
    ['Button {\n  go()\n} label: {\n  Image(systemName: "xmark")\n}', false],
    ['Button(action: go) {\n  Image(systemName: "trash")\n    .frame(minWidth: 44, minHeight: 44)\n}\n.buttonStyle(.plain)', false],
    ['Button {\n  go()\n} label: {\n  Image(systemName: "xmark")\n}\n.accessibilityLabel(Text("eg.close"))', true],
    ['Button(String(localized: "ws.edit")) { go() }', true],
    ['Button(ex.name) { pick(ex) }', true],
    ['Button(\n  String(localized: "settings.cancel"),\n  role: .cancel\n) {}', true],
    ['Button {\n  go()\n} label: {\n  Label(String(localized: "ws.addSet"), systemImage: "plus")\n}', true],
    ['Button {\n  go()\n} label: {\n  Text(verbatim: name)\n}', true],
    ['Button(action: action) {\n  ZStack {\n    Circle()\n    Image(systemName: "checkmark")\n  }\n}\n.buttonStyle(.plain)\n.disabled(x)\n.opacity(1)\n.frame(minHeight: 44)\n.padding(2)\n.padding(3)\n.padding(4)\n.padding(5)\n.padding(6)\n.accessibilityLabel(Text(verbatim: label))', true],
  ];
  let bad = 0;
  const combine = [
    ['HStack {\n  Text("a")\n  Button { go() } label: { Image(systemName: "x") }\n}\n.padding(4)\n.accessibilityElement(children: .combine)', true],
    ['VStack {\n  Button("b") { go() }\n  HStack {\n    Text("a")\n  }\n  .accessibilityElement(children: .combine)\n}', false],
  ];
  for (const [src, wraps] of combine) {
    const got = combineWrapsButton(src.split('\n')).length > 0;
    if (got !== wraps) { bad++; console.log(`SELF-TEST FAIL .combine (muốn ${wraps}):\n${src}\n`); }
  }
  for (const [src, named] of cases) {
    const got = buttonName(buttonSpan(src.split('\n'), 0)) !== null;
    if (got !== named) { bad++; console.log(`SELF-TEST FAIL (muốn ${named ? 'có tên' : 'KHÔNG tên'}):\n${src}\n`); }
  }
  console.log(bad ? `swift-a11y self-test: ${bad} ca sai` : `swift-a11y self-test: ${cases.length + combine.length} ca đúng`);
  process.exit(bad ? 1 : 0);
}

for (const w of warnings) console.log('WARN ' + w);
for (const e of errors) console.log('FAIL ' + e);
console.log(
  `\nswift-a11y: ${errors.length} lỗi, ${warnings.length} cảnh báo`
);
process.exit(errors.length > 0 ? 1 : 0);
