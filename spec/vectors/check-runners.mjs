#!/usr/bin/env node
/**
 * Guard cho issue #328 (D-16): mọi tệp spec/vectors/*.json phải đăng ký
 * runner trong runners.json — không thì CI đỏ và nêu đúng tên tệp.
 *
 * Chạy: node spec/vectors/check-runners.mjs  (từ repo root)
 * Hoặc qua gate: bước 'vector runners' trong native/tools/check.mjs.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DIR, '..', '..');
/** Runner là test Swift: `swift:<đường dẫn từ gốc repo>`. */
const SWIFT = 'swift:';
const runners = JSON.parse(readFileSync(path.join(DIR, 'runners.json'), 'utf8'));
const problems = [];
const present = readdirSync(DIR).filter((x) => x.endsWith('.json') && x !== 'runners.json');

// 1. Mọi *.json HIỆN CÓ (trừ chính runners.json) phải có runner đăng ký +
//    runner tồn tại. Mục registry cho tệp chưa merge thì bỏ qua — guard
//    không được đỏ chỉ vì PR vector chưa vào trước.
for (const f of present) {
  const runner = runners[f];
  if (!runner) {
    problems.push(`${f}: chưa đăng ký runner trong spec/vectors/runners.json`);
    continue;
  }
  if (runner.startsWith(SWIFT)) {
    // Hành vi chỉ native có (không có logic RN nào để chạy trên Linux): runner
    // là test Swift, chạy ở iOS CI. Phải tồn tại VÀ đọc đúng tệp này — một
    // test không nhắc tới tệp thì không chạy nó.
    const rel = runner.slice(SWIFT.length);
    const abs = path.join(ROOT, rel);
    if (!existsSync(abs)) problems.push(`${f}: runner Swift ${rel} không tồn tại`);
    else if (!readFileSync(abs, 'utf8').includes(`spec/vectors/${f}`))
      problems.push(`${f}: runner Swift ${rel} không đọc spec/vectors/${f}`);
    continue;
  }
  if (!existsSync(path.join(DIR, runner))) {
    problems.push(`${f}: runner ${runner} không tồn tại`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.log('  ĐỎ ' + p);
  console.log(`vector runners: ${problems.length} tệp thiếu runner`);
  process.exit(1);
}
const n = present.length;
console.log(`vector runners: ${n} tệp vector đều có runner`);
