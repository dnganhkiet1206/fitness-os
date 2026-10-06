#!/usr/bin/env node
/**
 * Runner golden vectors Personal Records cho issue #321 (D-9).
 *
 * GỌI THẲNG LOGIC THẬT, không chép lại (bài học từ #237, theo #254/#280):
 * - `bestsFrom`, `findRecords`, `headlineRecord`, `WEIGHT_EPSILON_KG`
 *   từ native/src/lib/personal-record.ts (biên dịch bằng tsc)
 * - `exerciseKey` từ native/src/lib/exercise-key.ts (import thật qua @/)
 *
 * Mỗi vector: history (các set đã từng ghi) + session (buổi vừa xong)
 * → bests = bestsFrom(history) → records = findRecords(session, bests)
 * → so với expected. Vector PR-7 còn kiểm headlineRecord.
 *
 * Chạy: node spec/vectors/run-personal-record.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NATIVE = path.join(ROOT, 'native');
const problems = [];
let passed = 0;

// ── Biên dịch logic thật ──
const out = mkdtempSync(path.join(os.tmpdir(), 'pr-vectors-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/personal-record.ts', 'src/lib/exercise-key.ts',
     '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  // @/ path mapping làm tsc exit non-zero; vẫn emit đủ dùng
}
// personal-record.ts import '@/lib/exercise-key' — trỏ về file vừa biên dịch.
const Module = (await import('node:module')).default;
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req === '@/lib/exercise-key') return path.join(out, 'exercise-key.js');
  return origResolve.call(this, req, ...args);
};
const { createRequire } = await import('node:module');
const req = createRequire(path.join(out, 'x.js'));
const pr = req(path.join(out, 'personal-record.js'));
const { bestsFrom, findRecords, headlineRecord } = pr;

// ── So sánh sâu, key sắp xếp để JSON ổn định ──
const norm = (v) => JSON.stringify(v, Object.keys(v ?? {}).sort());
const eq = (a, b) => {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => norm(x) === norm(b[i]));
  }
  return norm(a) === norm(b);
};

// ── Chạy vectors ──
const vectors = JSON.parse(readFileSync(path.join(ROOT, 'spec/vectors/personal-record.json'), 'utf8'));
for (const v of vectors) {
  const bests = bestsFrom(v.input.history);
  const got = findRecords(v.input.session, bests);
  const fails = [];
  if (!eq(got, v.expected)) {
    fails.push(`records: nhận ${JSON.stringify(got)}, muốn ${JSON.stringify(v.expected)}`);
  }
  if (v.expectedHeadline !== undefined) {
    const head = headlineRecord(got);
    if (!eq(head, v.expectedHeadline)) {
      fails.push(`headline: nhận ${JSON.stringify(head)}, muốn ${JSON.stringify(v.expectedHeadline)}`);
    }
  }
  if (fails.length > 0) {
    problems.push(`${v.rule} (${v.desc}): ${fails.join('; ')}`);
  } else {
    passed += 1;
  }
}

console.log(`personal-record: ${passed}/${vectors.length} vectors xanh`);
if (problems.length > 0) {
  for (const p of problems) console.log('  ĐỎ ' + p);
  process.exit(1);
}
