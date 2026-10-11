// "N bài mới" (#527, Community lát 17) — golden từ CHÍNH `lib/feed-hold.ts` của
// RN @ fac9ac2 (nạp qua `../studio/harness.cjs`: dịch TS, `git archive`).
//
// Chạy: KOA_DEPS=<deps có typescript> node gen.cjs
// Ghi: Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/feed-hold-golden.json.
const { SRC } = require('../studio/harness.cjs');
const path = require('path');
const fs = require('fs');
const { heldAbove, atTop, NEAR_TOP } = require(path.join(SRC, 'lib', 'feed-hold.ts'));

// số giả ngẫu nhiên cố định — chạy lại ra đúng tệp cũ
let seed = 20261011;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a, p) => a.filter(() => rnd() < p);

const cases = [
  // các ca có tên trong chú thích của RN
  { ids: ['a', 'b', 'c'], seen: [], mine: [] },
  { ids: ['n1', 'n2', 'a', 'b'], seen: ['a', 'b'], mine: [] },
  { ids: ['n1', 'me', 'n2', 'a'], seen: ['a'], mine: ['me'] },
  { ids: ['x', 'y'], seen: ['a', 'b'], mine: [] },
  { ids: ['a', 'n1', 'b'], seen: ['a', 'b'], mine: [] },
  { ids: [], seen: ['a'], mine: [] },
];
for (let i = 0; i < 120; i++) {
  const n = Math.floor(rnd() * 12);
  const ids = Array.from({ length: n }, (_, j) => `p${i}-${j}`);
  cases.push({ ids, seen: [...pick(ids, 0.4), ...pick(['gone1', 'gone2'], 0.3)], mine: pick(ids, 0.15) });
}
const out = {
  nearTop: NEAR_TOP,
  held: cases.map((c) => ({ ...c, held: heldAbove(c.ids, new Set(c.seen), new Set(c.mine)) })),
  top: [-40, 0, 60, 119, 119.9, 120, 121, 800].map((y) => ({ y, top: atTop(y) })),
};
const dest = path.join(__dirname, '..', '..', 'Packages/ASCNDKit/Tests/ASCNDCoreTests/Fixtures/feed-hold-golden.json');
fs.writeFileSync(dest, JSON.stringify(out) + '\n');
console.log('ok', out.held.length, out.held.filter((c) => c.held.length).length);
