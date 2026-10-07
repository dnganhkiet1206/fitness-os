#!/usr/bin/env node
/**
 * Native localization forensic — C (#303).
 *
 * Quét apps/ios Swift tìm chuỗi user-facing viết trực tiếp hoặc
 * bypass localization:
 *  1. Text("...") với literal cứng (không qua String(localized:))
 *  2. Bilingual ternary: lang == "vi" ? "..." : "..."
 *  3. Text(verbatim: "...") với text user-facing
 *
 * Bỏ qua: Preview, sample/test data, comment, và code trong `#if DEBUG`
 * (Lab/màn thử: không vào bản phát hành, chữ cố ý không vào catalog —
 * `WorkoutLabView.swift`, `LabsView` trong `RootTabView.swift`).
 *
 * Exit 1 nếu có hit. Negative test: thêm literal cố ý → gate phải đỏ.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/ios/ASCND', 'apps/ios/Packages'];
const SKIP_DIRS = ['Tests', 'TestSupport', '__tests__'];

let hits = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!SKIP_DIRS.includes(name)) walk(p);
    } else if (name.endsWith('.swift')) {
      scanFile(p);
    }
  }
}

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const rel = relative(ROOT, path);

  // Bỏ qua file Preview-only
  const isPreviewOnly = /#Preview/.test(src) && !/struct.*View/.test(src.replace(/#Preview[\s\S]*/g, ''));

  // Vùng chỉ có ở bản Debug: ngăn xếp `#if` — mỗi tầng ghi nhánh hiện tại
  // có phải nhánh DEBUG không (`#if DEBUG` → true, `#else` của nó → false).
  const cond = [];
  const debugAt = lines.map((line) => {
    const t = line.trim();
    if (/^#if\b/.test(t)) cond.push(/^#if\s+DEBUG\b/.test(t));
    else if (/^#else\b/.test(t) && cond.length) cond[cond.length - 1] = false;
    else if (/^#endif\b/.test(t)) cond.pop();
    return cond.includes(true);
  });

  lines.forEach((line, i) => {
    const n = i + 1;
    const trimmed = line.trim();

    // Bỏ qua code chỉ có ở bản Debug
    if (debugAt[i]) return;

    // Bỏ qua comment
    if (trimmed.startsWith('//')) return;

    // 1. Text("literal") — không qua localized
    //    Cho phép: Text("") (placeholder), Text("\(var)") (interpolation),
    //    Text("some.key") (localization key — SwiftUI tự localize)
    //    Chỉ bắt text user-facing thật (có dấu cách / câu chữ).
    const textLit = line.match(/Text\("([^"\\]*)"\)/);
    if (textLit) {
      const lit = textLit[1];
      // Key localization: chỉ chữ thường + dấu chấm, không dấu cách
      const isKey = /^[a-z0-9._-]+$/.test(lit);
      // Bỏ qua: rỗng, interpolation, số thuần, key, preview
      if (lit && !lit.includes('\\(') && !/^\d+$/.test(lit) && !isKey && !isPreviewOnly) {
        // Chỉ bắt khi trông như text user-facing (có dấu cách hoặc dài)
        if (lit.includes(' ') || lit.length > 20) {
          const contextStart = Math.max(0, i - 5);
          const context = lines.slice(contextStart, i + 1).join('\n');
          if (!context.includes('#Preview')) {
            hits.push(`${rel}:${n}: Text literal cứng: "${lit.slice(0, 40)}"`);
          }
        }
      }
    }

    // 2. Bilingual ternary: ... ? "..." : "..."
    if (/["']vi["']\s*\?\s*"[^"]+"\s*:\s*"[^"]+"/.test(line) ||
        /lang\s*==/.test(line) && line.includes('?') && line.includes(':')) {
      hits.push(`${rel}:${n}: bilingual ternary nghi ngờ`);
    }

    // 3. Text(verbatim: "user-facing")
    const verbatim = line.match(/Text\(verbatim:\s*"([^"\\]+)"\)/);
    if (verbatim) {
      const lit = verbatim[1];
      // Cho phép verbatim cho ký hiệu/số, không cho câu chữ
      if (/[a-zA-ZÀ-ỹ]{3,}/.test(lit) && !isPreviewOnly) {
        const contextStart = Math.max(0, i - 5);
        const context = lines.slice(contextStart, i + 1).join('\n');
        if (!context.includes('#Preview')) {
          hits.push(`${rel}:${n}: Text(verbatim:) user-facing: "${lit.slice(0, 40)}"`);
        }
      }
    }
  });
}

for (const d of SCAN_DIRS) {
  try {
    walk(join(ROOT, d));
  } catch (e) {
    // Thư mục không tồn tại — bỏ qua
  }
}

if (hits.length > 0) {
  console.log('FAIL — chuỗi bypass localization:');
  for (const h of hits) console.log(' ', h);
  console.log(`\nnative-i18n-forensic: ${hits.length} hit`);
  process.exit(1);
} else {
  console.log('native-i18n-forensic: XANH (0 hit)');
}
