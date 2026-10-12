// Chữ cái đầu của avatar Today (#527) — golden từ CHÍNH `lib/initials.ts` của
// RN @ fac9ac2 (nạp qua `../studio/harness.cjs`: dịch TS, `git archive`).
//
// Chạy: KOA_DEPS=<deps có typescript> node gen.cjs
// Ghi: Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/initials-golden.json.
const { SRC } = require('../studio/harness.cjs');
const path = require('path');
const fs = require('fs');
const { initialsFor } = require(path.join(SRC, 'lib', 'initials.ts'));

const names = [
  null, '', '   ', 'Kiệt', 'Đặng Anh Kiệt', 'kiet dang', '  anh   kiệt  ', 'Ệ', '123 456', '(Kiet)',
  'Jean-Luc Picard', 'Mary  Ann', '山田 太郎', '김 민수', 'Ölaf Ärm', '🙂 Smile', '🙂', 'a', "O'Neil", 'de la Cruz',
  'X Æ A-12', '\tTab\nNew', 'ßeta', 'émile zola',
];
const emails = [null, '', 'kiet.dang@x.com', '@x.com', '1234@x.com', 'đạt@x.vn', 'no-at-sign', '_x@y'];
const cases = [];
for (const n of names) for (const e of emails) cases.push({ name: n, email: e, out: initialsFor(n, e) });
const dest = path.join(__dirname, '..', '..', 'Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/initials-golden.json');
fs.writeFileSync(dest, JSON.stringify({ cases }) + '\n');
console.log('ok', cases.length);
