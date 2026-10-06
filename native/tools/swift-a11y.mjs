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

for (const file of swiftFiles(IOS)) {
  const src = readFileSync(file, 'utf8');
  const rel = relative(ROOT, file);
  const lines = src.split('\n');

  // Tìm các Button và kiểm tra 15 dòng sau nó.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/\bButton\s*[\(\{]/.test(line)) continue;
    if (/^\s*\/\//.test(line)) continue; // comment

    const window = lines.slice(i, Math.min(i + 15, lines.length)).join('\n');

    // Có chữ trực tiếp? Button("..."), Button(String(localized: "...")),
    // hoặc Text("...") trong label.
    const hasInlineText =
      /Button\s*\(\s*"[^"]+"/.test(line) ||
      /Button\s*\(\s*String\s*\(\s*localized:\s*"[^"]+"/.test(line) ||
      /Button\s*\([^)]*"[^"]+"[^)]*\)\s*\{/.test(window) ||
      /label:\s*\{[^}]*Text\s*\(\s*"[^"]+"/s.test(window) ||
      /\{\s*Text\s*\(\s*"[^"]+"/s.test(window);

    const hasLabel = /\.accessibilityLabel\s*\(/.test(window);
    const hasHidden = /\.accessibilityHidden\s*\(\s*true\s*\)/.test(window);
    // DSButton đã có label + 48pt — Button bọc DSButton là đủ.
    const wrapsDS = /DSButton\s*\(/.test(window);

    if (!hasInlineText && !hasLabel && !hasHidden && !wrapsDS) {
      errors.push(`${rel}:${i + 1}: Button không có tên cho VoiceOver`);
    }

    // Vùng chạm: tìm minHeight/minWidth ≥ 44 trong window.
    const sizes = [...window.matchAll(/\.frame\s*\([^)]*minHeight:\s*(\d+)/g)].map(
      (m) => parseInt(m[1], 10)
    );
    const widths = [...window.matchAll(/\.frame\s*\([^)]*minWidth:\s*(\d+)/g)].map(
      (m) => parseInt(m[1], 10)
    );
    const bigEnough =
      sizes.some((s) => s >= 44) ||
      widths.some((s) => s >= 44) ||
      wrapsDS; // DSButton: minHeight 48
    if (!bigEnough && !hasHidden) {
      warnings.push(
        `${rel}:${i + 1}: Button chưa thấy minHeight/minWidth ≥ 44 (kiểm tra thủ công)`
      );
    }
  }

  // .combine bọc Button.
  for (let i = 0; i < lines.length; i++) {
    if (/\.accessibilityElement\s*\(\s*children:\s*\.combine\s*\)/.test(lines[i])) {
      // Lùi lại tìm VStack/HStack chứa nó, xem có Button trong 30 dòng trước không.
      const before = lines.slice(Math.max(0, i - 30), i).join('\n');
      const after = lines.slice(i, Math.min(i + 5, lines.length)).join('\n');
      if (/\bButton\s*[\(\{]/.test(before) && !/DSButton/.test(before + after)) {
        errors.push(
          `${rel}:${i + 1}: .combine có thể nuốt Button — tách nút ra khỏi phần tử gộp`
        );
      }
    }
  }
}

for (const w of warnings) console.log('WARN ' + w);
for (const e of errors) console.log('FAIL ' + e);
console.log(
  `\nswift-a11y: ${errors.length} lỗi, ${warnings.length} cảnh báo`
);
process.exit(errors.length > 0 ? 1 : 0);
