/**
 * Koa Today-only: KHÔNG còn floating companion.
 *
 *     node tools/koa-boundary.mjs
 *
 * Quyết định của chủ dự án (03/10/2026, issue #6): Koa chỉ ở màn Hôm nay.
 * Floating companion (`koa-companion.tsx` + `koa-perch.ts`) đã bị xoá.
 *
 * Gate này gác invariant mới: floating Koa không được quay lại.
 * Nếu ai đó tạo lại file companion, gate đỏ và yêu cầu quyết định mới.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

const GONE = [
  'src/components/ascnd/koa-companion.tsx',
  'src/lib/koa-perch.ts',
];

for (const f of GONE) {
  if (existsSync(path.join(NATIVE, f))) {
    problems.push(
      `${f} đã quay lại — Koa Today-only (quyết định 03/10/2026): ` +
      `floating companion không được tồn tại. Xoá file hoặc xin quyết định mới.`
    );
  }
}

if (problems.length) {
  console.log('ranh giới của Koa CÓ LỖI:\n');
  for (const p of problems) console.log('  •', p);
  process.exit(1);
}
console.log('ranh giới của Koa OK — không còn floating companion (Today-only)');
