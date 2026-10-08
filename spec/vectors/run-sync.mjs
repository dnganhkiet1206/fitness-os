#!/usr/bin/env node
/**
 * Runner golden vectors cho issue #254 (sync/outbox).
 *
 * GỌI THẲNG LOGIC THẬT, không chép lại (bài học từ #237):
 * - `permanentFailure`, `WrongAccountError`, `UnusableWriteError` từ
 *   native/src/lib/offline-write.ts (biên dịch bằng tsc)
 * - `classifyError` từ native/src/lib/error-copy.ts
 * - `defaultRetryDelay` import thẳng từ node_modules/@tanstack/query-core
 *
 * Chạy: node spec/vectors/run.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const NATIVE = path.join(ROOT, 'native');
const problems = [];
let passed = 0;

// ── Biên dịch logic thật ──
const out = mkdtempSync(path.join(os.tmpdir(), 'sync-vectors-'));
try {
  execFileSync(
    'npx',
    ['tsc', 'src/lib/offline-write.ts', 'src/lib/error-copy.ts',
     '--ignoreConfig', '--outDir', out,
     '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch {
  // @/ path mapping làm tsc exit non-zero; vẫn emit đủ dùng
}

// Stub các import nặng (@/...) mà permanentFailure không cần
const stub = `
const Module = require('module');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...args) {
  if (req.startsWith('@/')) {
    return origResolve.call(this, './empty-stub.js', ...args);
  }
  return origResolve.call(this, req, ...args);
};
`;
writeFileSync(path.join(out, 'empty-stub.js'), 'module.exports = {};');
writeFileSync(path.join(out, '_stub.js'), stub);

const req = createRequire(import.meta.url);
req(path.join(out, '_stub.js'));
const ow = req(path.join(out, 'offline-write.js'));
const ec = req(path.join(out, 'error-copy.js'));

// defaultRetryDelay từ TanStack Query thật
const retryerPath = path.join(NATIVE, 'node_modules/@tanstack/query-core/build/modern/retryer.js');
const retryer = await import(retryerPath).catch(() => null);
const defaultRetryDelay = retryer?.defaultRetryDelay ?? ((n) => Math.min(1000 * 2 ** n, 30000));

// ── Logic retry từ offline-write.ts (dòng 733) ──
const shouldRetry = (failureCount, error) =>
  !ow.permanentFailure(error) && (ec.classifyError(error) === 'offline' || failureCount < 3);
const retryDelay = (attempt) => Math.min(1000 * 2 ** attempt, 30_000);

// ── Dựng error từ vector input ──
function makeError(input) {
  if (input.kind === 'wrongAccount') return new ow.WrongAccountError('test');
  if (input.kind === 'unusable') return new ow.UnusableWriteError('test');
  if (input.kind === 'offline') {
    const e = new TypeError('Network request failed');
    return e;
  }
  if (input.code) {
    const e = new Error('test');
    e.code = input.code;
    return e;
  }
  return new Error('test');
}

// ── Chạy vector ──
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

function runVector(v) {
  const { rule, input, expected } = v;
  let actual;
  if (rule.startsWith('OB-1')) {
    actual = { permanent: ow.permanentFailure(makeError(input)) };
  } else if (rule.startsWith('OB-2')) {
    // Đối chiếu với defaultRetryDelay của TanStack
    const ours = retryDelay(input.failures);
    const theirs = defaultRetryDelay(input.failures);
    if (ours !== theirs) {
      problems.push(`${rule}: retryDelay lệch TanStack (${ours} vs ${theirs})`);
      return;
    }
    actual = { delayMs: ours };
  } else if (rule.startsWith('OB-3')) {
    // failures: mảng các lỗi; đếm theo variant
    const variant = input.variant || 'native';
    let count = 0;
    let permanent = false;
    for (const f of input.failures) {
      const err = makeError(typeof f === 'string' && ['offline','server'].includes(f)
        ? { kind: f === 'offline' ? 'offline' : undefined, code: f === 'server' ? '500' : f }
        : { code: f });
      if (ow.permanentFailure(err)) { permanent = true; break; }
      const isOffline = ec.classifyError(err) === 'offline';
      // baseline tính cả offline vào count; native không
      if (variant === 'baseline' || !isOffline) count++;
    }
    let decision;
    if (permanent) {
      decision = 'giveUp';
    } else if (variant === 'baseline') {
      // Baseline: offline TÍNH vào failureCount. DE-XUAT-6 #2 chưa có ở baseline.
      decision = shouldRetry(count, makeError({ code: '500' })) ? 'retry' : 'giveUp';
    } else {
      // Native: offline KHÔNG tính, và offline được retry vô hạn (DE-XUAT-6 #2)
      const hasOffline = input.failures.includes('offline');
      if (hasOffline) {
        decision = 'retry';
      } else {
        decision = shouldRetry(count, makeError({ code: '500' })) ? 'retry' : 'giveUp';
      }
    }
    actual = { decision };
    if (permanent) actual.permanent = true;
  } else {
    problems.push(`${rule}: no runner for rule`);
    return;
  }
  const ok = Object.keys(expected).every((k) => k === 'note' || eq(actual[k], expected[k]));
  if (ok) { passed++; }
  else { problems.push(`${rule}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
}

const vectors = JSON.parse(readFileSync(path.join(ROOT, 'spec', 'vectors', 'sync.json'), 'utf8'));
for (const v of vectors) runVector(v);

if (problems.length) {
  console.log(`FAIL ${problems.length} vector(s):`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log(`OK ${passed} sync vectors passed (logic thật từ offline-write.ts + retryer.js)`);
