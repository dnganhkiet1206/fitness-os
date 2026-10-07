#!/usr/bin/env node
/**
 * SwiftUI performance audit — C (#319).
 *
 * Static scan (không đo thời gian chạy — không claim số ms):
 *  1. AnyView / type erasure không cần thiết
 *  2. String(format:) trong body (nên cache hoặc dùng Text format) — INFO
 *  3. id: \.self — chỉ ghi nhận, không tự kết luận (no-op, chưa bật)
 *  4. UUID() trong ForEach (unstable ID)
 *
 * NOTE: #Preview blocks được loại khỏi scan (prodSrc); không có check riêng
 * cho "preview code leak" nên không claim có.
 *
 * Chạy: node apps/ios/tools/native-perf-audit.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/ios/ASCND', 'apps/ios/Packages'];

let issues = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith('.swift')) scanFile(p);
  }
}

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const rel = relative(ROOT, path);

  // Tách preview code
  const prodSrc = src.replace(/#Preview[\s\S]*?(?=\n[^ ]|\n$)/g, '');

  lines.forEach((line, i) => {
    const n = i + 1;
    if (line.trim().startsWith('//')) return;

    // 1. AnyView
    if (/\bAnyView\b/.test(line) && prodSrc.includes(line.trim())) {
      issues.push(`${rel}:${n}: AnyView (type erasure — kiểm tra có cần không)`);
    }

    // 2. String(format:) trong body — expensive nếu gọi mỗi render
    if (/String\(format:/.test(line)) {
      const ctx = lines.slice(Math.max(0, i - 5), i + 1).join('\n');
      if (/var body/.test(ctx) && !/private|func/.test(lines[Math.max(0, i - 1)])) {
        issues.push(`${rel}:${n}: INFO — String(format:) trong body (cân nhắc cache)`);
      }
    }

    // 4. UUID() trong ForEach
    if (/ForEach.*UUID\(\)/.test(line)) {
      issues.push(`${rel}:${n}: UUID() trong ForEach (unstable ID)`);
    }
  });

  // 3. id: \.self — kiểm tra type có Hashable ổn định không (thông tin)
  if (/id:\s*\\\.self/.test(prodSrc)) {
    // Không tự động kết luận — ghi INFO
  }
}

for (const d of SCAN_DIRS) {
  const dir = join(ROOT, d);
  // Thư mục không tồn tại = FAIL (không nuốt lỗi rồi báo xanh giả).
  if (!existsSync(dir)) {
    console.log(`FAIL: không tìm thấy thư mục quét ${d}`);
    process.exit(1);
  }
  walk(dir);
}

const errors = issues.filter(i => !i.includes('INFO'));
if (errors.length > 0) {
  console.log('FAIL:');
  errors.forEach(e => console.log(' ', e));
  process.exit(1);
}
console.log(`native-perf-audit: XANH (${errors.length} lỗi)`);
issues.filter(i => i.includes('INFO')).slice(0, 5).forEach(i => console.log(' ', i));
