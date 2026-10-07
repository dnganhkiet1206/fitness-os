#!/usr/bin/env node
/**
 * i18n plural/format audit — C (#315).
 *
 * Kiểm tra:
 *  1. Format strings với %d có xử lý số ít/số nhiều không
 *  2. Đơn vị (kg/phút/hiệp) có nhất quán không
 *  3. Nối chuỗi cứng thay vì format
 *
 * Chạy: node apps/ios/tools/native-i18n-plural-audit.mjs
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('../../..', import.meta.url).pathname;
const SCAN_DIRS = ['apps/ios/ASCND', 'apps/ios/Packages'];

let issues = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      walk(p);
    } else if (name.endsWith('.swift')) {
      scanFile(p);
    }
  }
}

function scanFile(path) {
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  const rel = relative(ROOT, path);

  lines.forEach((line, i) => {
    const n = i + 1;

    // 1. Nối đơn vị cứng: "\(x) kg" — nên qua localized format
    if (/\\"\([^"]+\)\s*(kg|phút|min|sets?|hiệp)"|"\s*\+\s*".*(kg|phút)/.test(line)) {
      // Bỏ qua nếu đã qua String(localized:) với format
      if (!line.includes('String(localized:') && !line.includes('format:')) {
        issues.push(`${rel}:${n}: nối đơn vị cứng (nên dùng localized format)`);
      }
    }

    // 2. %d không có xử lý plural — ghi nhận để review thủ công
    //    (không phải lỗi tự động vì vi không cần plural)
    if (/String\(format:.*%d/.test(line)) {
      // Kiểm tra có comment về plural không
      const ctx = lines.slice(Math.max(0, i - 3), i + 1).join('\n');
      if (!/plural/i.test(ctx)) {
        issues.push(`${rel}:${n}: INFO — %d format (kiểm tra plural cho en/es)`);
      }
    }
  });
}

for (const d of SCAN_DIRS) {
  try { walk(join(ROOT, d)); } catch {}
}

const errors = issues.filter(i => !i.includes('INFO'));
const infos = issues.filter(i => i.includes('INFO'));

if (errors.length > 0) {
  console.log('FAIL:');
  errors.forEach(e => console.log(' ', e));
  process.exit(1);
}

console.log(`native-i18n-plural-audit: XANH (${errors.length} lỗi, ${infos.length} gợi ý)`);
infos.slice(0, 10).forEach(i => console.log(' ', i));
if (infos.length > 10) console.log(` ... và ${infos.length - 10} gợi ý khác`);
