#!/usr/bin/env node
/**
 * Trích NGUYÊN VĂN phần toán thuần của `components/ascnd/koa/koa-figure.tsx`
 * @ fac9ac2 (ma trận, đường cong CSS, lấy mẫu keyframe, `parseOps` /
 * `parseAnim`) ra `lib/koa-math.ts` cho `build.sh` biên dịch. Tệp gốc kéo
 * theo React / Reanimated / react-native-svg nên không biên dịch nguyên được.
 * Chỉ cắt theo dòng đánh dấu — không sửa một ký tự nào của thân hàm.
 *
 *   node extract-koa.mjs < koa-figure.tsx > lib/koa-math.ts
 */
import { readFileSync } from 'node:fs';

const src = readFileSync(0, 'utf8').split('\n');
const cut = (from, to) => {
  const a = src.findIndex((l) => from.test(l));
  const b = src.findIndex((l, i) => i > a && to.test(l));
  if (a < 0 || b < 0) throw new Error(`không thấy ${from} … ${to}`);
  return src.slice(a, b);
};
const out = [
  "import type { Anim, OFrame, Op, TFrame } from './koa-scene';",
  '',
  ...cut(/^const IDENTITY = /, /^function AnimGroup\(/),
  ...cut(/^function parseOps\(/, /^\/\* ── static rendering/),
  'export { IDENTITY, mul, opMat, opsMat, bezier, ease, lerpOpMat, span, sampleMat, sampleOp, parseOps, parseAnim };',
];
process.stdout.write(out.join('\n') + '\n');
