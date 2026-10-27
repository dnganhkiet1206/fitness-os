#!/usr/bin/env node
/**
 * Chế độ UI test (máy chủ Supabase giả, `-uiTestFakeBackend`) chỉ có trong bản
 * Debug (#527, Maestro E2E).
 *
 * ── vì sao có bước này ──
 *
 * `ASCND/App/UITest/` dựng một máy chủ Supabase giả và một phiên đăng nhập giả
 * để Maestro chạy không cần tài khoản. Lọt vào bản Release thì một launch
 * argument đủ để app chạy trên dữ liệu giả — nên nó phải bị biên dịch bỏ, và
 * điều ấy giữ bằng máy, không bằng lời dặn. Workflow `ios-e2e.yml` còn kiểm lần
 * hai trên chính tệp nhị phân Release (`strings` không được thấy cờ / tên miền giả).
 *
 * ── luật ──
 *
 * 1. Mỗi tệp `.swift` trong `apps/ios/ASCND/App/UITest/` mở bằng `#if DEBUG`
 *    (dòng mã đầu tiên) và khối ấy đóng ở `#endif` cuối tệp, không có `#else`
 *    / `#elseif` của chính khối ấy — không có gì ở ngoài.
 * 2. Ngoài thư mục ấy, trong `apps/ios/ASCND` và `apps/ios/ASCNDWidgets`, mọi
 *    chỗ nhắc tới kiểu của chế độ test (`UITestMode`, `UITestAuth`,
 *    `UITestReachabilityProber`, `UITestSeed`, `FakeSupabaseStore`,
 *    `FakeSupabaseProtocol`) nằm trong nhánh `#if DEBUG` (không phải `#else`).
 * 3. Chuỗi cờ `uiTestFakeBackend` và tên miền giả `ui-test.ascnd.invalid` chỉ
 *    xuất hiện trong thư mục ấy.
 *
 *   node apps/ios/tools/native-uitest-mode.mjs
 *   node apps/ios/tools/native-uitest-mode.mjs --self-test
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SYMBOLS = /\b(UITestMode|UITestAuth|UITestReachabilityProber|UITestSeed|FakeSupabaseStore|FakeSupabaseProtocol)\b/;
const MARKERS = /uiTestFakeBackend|ui-test\.ascnd\.invalid/;

function swiftFiles(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return swiftFiles(p);
    return p.endsWith('.swift') ? [p] : [];
  });
}

// Bỏ chú thích dòng và khối (đủ cho luật này; chuỗi giữ nguyên).
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
}

/** Luật 1 cho một tệp trong thư mục UITest. */
export function checkUITestFile(src) {
  const lines = stripComments(src).split('\n').map((l) => l.trim());
  const code = lines.map((l, i) => [l, i]).filter(([l]) => l !== '');
  if (code.length === 0) return [];
  if (code[0][0] !== '#if DEBUG') return [`dòng ${code[0][1] + 1}: tệp phải mở bằng \`#if DEBUG\``];
  let depth = 0;
  for (let k = 0; k < code.length; k++) {
    const [l, i] = code[k];
    if (/^#if\b/.test(l)) depth++;
    else if (/^#(else|elseif)\b/.test(l) && depth === 1) return [`dòng ${i + 1}: khối \`#if DEBUG\` ngoài cùng không được có \`#else\``];
    else if (/^#endif\b/.test(l)) {
      depth--;
      if (depth === 0 && k !== code.length - 1) return [`dòng ${i + 1}: có mã sau \`#endif\` của khối \`#if DEBUG\``];
    }
  }
  return depth === 0 ? [] : ['khối `#if DEBUG` không đóng'];
}

/** Luật 2 + 3 cho một tệp ngoài thư mục UITest. */
export function checkOtherFile(src) {
  const problems = [];
  const lines = stripComments(src).split('\n');
  // Ngăn xếp: mỗi `#if` một phần tử — `true` khi đang ở nhánh `#if DEBUG`.
  const stack = [];
  lines.forEach((raw, i) => {
    const l = raw.trim();
    if (/^#if\b/.test(l)) stack.push(/^#if\s+DEBUG\s*$/.test(l));
    else if (/^#(else|elseif)\b/.test(l)) stack[stack.length - 1] = false;
    else if (/^#endif\b/.test(l)) stack.pop();
    else {
      if (MARKERS.test(raw)) problems.push(`dòng ${i + 1}: cờ / tên miền của chế độ UI test chỉ được ở ASCND/App/UITest/`);
      if (SYMBOLS.test(raw) && !stack.includes(true)) {
        problems.push(`dòng ${i + 1}: \`${raw.match(SYMBOLS)[1]}\` ngoài nhánh \`#if DEBUG\``);
      }
    }
  });
  return problems;
}

function run() {
  const uiDir = join(ROOT, 'apps/ios/ASCND/App/UITest');
  const ui = swiftFiles(uiDir);
  if (ui.length === 0) {
    console.error('✗ không thấy apps/ios/ASCND/App/UITest/*.swift');
    process.exit(1);
  }
  const others = [...swiftFiles(join(ROOT, 'apps/ios/ASCND')), ...swiftFiles(join(ROOT, 'apps/ios/ASCNDWidgets'))].filter(
    (p) => !p.startsWith(uiDir),
  );
  const failures = [];
  for (const f of ui) for (const p of checkUITestFile(readFileSync(f, 'utf8'))) failures.push(`${relative(ROOT, f)} ${p}`);
  for (const f of others) for (const p of checkOtherFile(readFileSync(f, 'utf8'))) failures.push(`${relative(ROOT, f)} ${p}`);
  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${f}`);
    console.error(`chế độ UI test lọt khỏi bản Debug: ${failures.length} chỗ`);
    process.exit(1);
  }
  console.log(`chế độ UI test chỉ ở bản Debug OK — ${ui.length} tệp UITest, ${others.length} tệp khác đã quét`);
}

function selfTest() {
  const cases = [
    ['UITest mở bằng #if DEBUG', checkUITestFile('#if DEBUG\n  enum A {}\n#endif\n'), 0],
    ['UITest có chú thích đầu tệp', checkUITestFile('// x\n#if DEBUG\n  enum A {}\n#endif\n'), 0],
    ['UITest có #if lồng', checkUITestFile('#if DEBUG\n#if os(iOS)\nenum A {}\n#else\nenum B {}\n#endif\n#endif'), 0],
    ['UITest thiếu #if DEBUG', checkUITestFile('import Foundation\n#if DEBUG\n#endif\n'), 1],
    ['UITest có #else', checkUITestFile('#if DEBUG\nenum A {}\n#else\nenum A {}\n#endif\n'), 1],
    ['UITest có mã sau #endif', checkUITestFile('#if DEBUG\nenum A {}\n#endif\nenum B {}\n'), 1],
    ['UITest chưa đóng', checkUITestFile('#if DEBUG\nenum A {}\n'), 1],
    ['khác: trong #if DEBUG', checkOtherFile('#if DEBUG\n let x = UITestMode.isOn\n#endif'), 0],
    ['khác: lồng trong #if DEBUG', checkOtherFile('#if DEBUG\n#if os(iOS)\n UITestAuth()\n#endif\n#endif'), 0],
    ['khác: chỉ trong chú thích', checkOtherFile('// UITestMode bật thì…\nlet x = 1'), 0],
    ['khác: ngoài #if', checkOtherFile('let x = UITestMode.isOn'), 1],
    ['khác: ở nhánh #else', checkOtherFile('#if DEBUG\nlet a = 1\n#else\nlet x = UITestSeed.tables\n#endif'), 1],
    ['khác: ở #if khác', checkOtherFile('#if os(iOS)\nlet x = FakeSupabaseStore.shared\n#endif'), 1],
    ['khác: cờ launch argument', checkOtherFile('#if DEBUG\nlet f = "-uiTestFakeBackend"\n#endif'), 1],
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
