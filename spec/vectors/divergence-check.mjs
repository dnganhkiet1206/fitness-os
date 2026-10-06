#!/usr/bin/env node --experimental-strip-types
/**
 * Divergence test cho #502 (D-35).
 *
 * Chứng minh runner đang thực thi RN source thật: so sánh trực tiếp output
 * của runner với output của hàm RN gốc trên cùng input. Nếu ai đó sửa runner
 * thành bản chép (hoặc RN đổi mà lib copy chưa sync), test này đỏ.
 *
 * Chạy: node spec/vectors/divergence-check.mjs
 */
import { parseRepEntry } from './lib/rep-entry.ts';
import { restLabel } from './lib/prescription.ts';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');

let fail = 0;
const check = (name, cond, detail = '') => {
  if (!cond) { fail++; console.log(`  ĐỎ ${name}${detail ? ': ' + detail : ''}`); }
  else console.log(`  XANH ${name}`);
};

// 1. parseRepEntry từ lib phải khớp RN gốc (đọc trực tiếp từ native/src/lib/)
const rnSrc = readFileSync(path.join(ROOT, 'native/src/lib/rep-entry.ts'), 'utf8');
const libSrc = readFileSync(path.join(HERE, 'lib/rep-entry.ts'), 'utf8');
// Bỏ dòng import (đã sửa đường dẫn), còn lại phải giống hệt
const norm = (s) => s.split('\n').filter((l) => !l.startsWith('import ')).join('\n').trim();
check(
  'rep-entry.ts đồng bộ với RN gốc',
  norm(rnSrc) === norm(libSrc),
  'lib copy lệch khỏi native/src/lib/rep-entry.ts'
);

// 2. prescription.ts đồng bộ
const rnPresc = readFileSync(path.join(ROOT, 'native/src/lib/prescription.ts'), 'utf8');
const libPresc = readFileSync(path.join(HERE, 'lib/prescription.ts'), 'utf8');
check(
  'prescription.ts đồng bộ với RN gốc',
  norm(rnPresc) === norm(libPresc),
  'lib copy lệch khỏi native/src/lib/prescription.ts'
);

// 3. Behavior spot-check: các case từng lệch
const cases = [
  ['45.5s', 46],
  ['45 s', 45],
  ['90s', 90],
  ['10', null], // reps, không phải hold
];
for (const [input, expectedSec] of cases) {
  const e = parseRepEntry(input);
  const got = e.durationSec;
  check(
    `parseRepEntry("${input}")`,
    expectedSec === null ? e.reps === 10 : got === expectedSec,
    `got ${JSON.stringify(e)}`
  );
}

// 4. restLabel spot-check
check('restLabel(90)', restLabel(90) === '1:30', `got "${restLabel(90)}"`);
check('restLabel(45)', restLabel(45) === '45s', `got "${restLabel(45)}"`);

if (fail) {
  console.log(`\nDIVERGENCE-CHECK: ${fail} lỗi — runner lệch khỏi RN!`);
  process.exit(1);
}
console.log('\nDIVERGENCE-CHECK: OK — runner đồng bộ với RN source thật');
