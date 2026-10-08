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

// 4. Tạm dừng (#235, RT-17): runner chép logic nằm TRONG component
// (day-plan.tsx). Neo từng dòng đã chép — RN đổi một dòng thì đỏ ở đây, và
// bản chép trong run.mjs phải được chép lại.
const dayPlan = readFileSync(path.join(ROOT, 'native/src/components/ascnd/day-plan.tsx'), 'utf8');
for (const line of [
  'if (s.pausedLeft !== undefined) return s;',
  'if (now - s.endsAt >= 1000) return null;',
  'const pausedLeft = Math.max(0, Math.ceil(intent.remainingSeconds));',
  'const left = Math.max(1, Math.ceil(intent.remainingSeconds));',
  'endsAt: Date.now() + left * 1000,',
  's.pausedLeft !== undefined\n            ? s.pausedLeft\n            : Math.max(0, Math.ceil((s.endsAt - Date.now()) / 1000));',
  'const left = Math.max(1, Math.min(REST_MAX, base + delta));',
  'setResting({ ...s, pausedLeft: left, total });',
]) {
  check(`day-plan.tsx còn: ${line.split('\n')[0]}`, dayPlan.includes(line), 'RN đã đổi — chép lại restStep của run.mjs');
}
const nativeModule = readFileSync(path.join(ROOT, 'native/modules/ascnd-native/ios/AscndNativeModule.swift'), 'utf8');
check(
  'AscndNativeModule.swift: remaining khi dừng = pausedRemaining',
  nativeModule.includes('s.isPaused ? s.pausedRemaining : max(s.endDate.timeIntervalSince(now), 0)'),
  'RN đã đổi — chép lại restRemaining của run.mjs',
);

// 5. restLabel spot-check
check('restLabel(90)', restLabel(90) === '1:30', `got "${restLabel(90)}"`);
check('restLabel(45)', restLabel(45) === '45s', `got "${restLabel(45)}"`);

if (fail) {
  console.log(`\nDIVERGENCE-CHECK: ${fail} lỗi — runner lệch khỏi RN!`);
  process.exit(1);
}
console.log('\nDIVERGENCE-CHECK: OK — runner đồng bộ với RN source thật');
