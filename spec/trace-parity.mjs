#!/usr/bin/env node
/**
 * Parity drift scanner cho issue #330 (D-18).
 *
 * Kiểm tra BAO PHỦ trace hành vi (không phải parity từng dòng code):
 * mọi feature native phải có entry trong spec/trace.json trỏ tới bằng
 * chứng (RN source / spec rule / vector / Swift / test).
 *
 * Hai chiều:
 *  1. Registry → evidence: hàng `verified` nào trỏ tới file không tồn
 *     tại → DRIFT (dùng lại logic của trace-check.mjs).
 *  2. Evidence → registry: file vector / rule QA matrix / file Swift
 *     nào không được hàng nào reference → DRIFT (feature mới không trace).
 *
 * Chạy: node spec/trace-parity.mjs  (từ repo root)
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = JSON.parse(readFileSync(path.join(ROOT, 'spec', 'trace.json'), 'utf8'));
const drift = [];

function gitExists(rev, file) {
  try {
    execFileSync('git', ['cat-file', '-e', `${rev}:${file}`], { cwd: ROOT, stdio: 'ignore' });
    return true;
  } catch { return false; }
}
function gitLs(rev, dir) {
  try {
    const out = execFileSync('git', ['ls-tree', '-r', '--name-only', rev, dir],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return out.split('\n').filter(Boolean);
  } catch { return []; }
}
const rnPath = (rn) => (rn ?? '').split('#')[0];

// ---- Chiều 1: registry → evidence (chỉ hàng verified) ----
for (const r of rows) {
  if (r.status !== 'verified') continue;
  const missing = [];
  // RN trỏ vào node_modules (thư viện ngoài) thì bỏ qua như trace-check.mjs.
  if (r.rn && !rnPath(r.rn).startsWith('node_modules') &&
      !existsSync(path.join(ROOT, rnPath(r.rn)))) missing.push(`rn:${r.rn}`);
  const v = r.vector ?? {};
  if (v.file && !(existsSync(path.join(ROOT, 'spec', 'vectors', v.file)) ||
      (v.branch && gitExists(v.branch, `spec/vectors/${v.file}`)))) missing.push(`vector:${v.file}`);
  const s = r.swift ?? {};
  if (s.file && !(existsSync(path.join(ROOT, s.file)) ||
      (s.branch && gitExists(s.branch, s.file)))) missing.push(`swift:${s.file}`);
  const t = r.test ?? {};
  if (t.file && !(existsSync(path.join(ROOT, t.file)) ||
      (t.branch && gitExists(t.branch, t.file)))) missing.push(`test:${t.file}`);
  if (missing.length > 0) drift.push(`${r.id}: bằng chứng không tồn tại → ${missing.join(', ')}`);
}

// ---- Chiều 2a: vector không được trace ----
const tracedVectors = new Set(rows.map((r) => r.vector?.file).filter(Boolean));
const vectorBranches = [...new Set(rows.map((r) => r.vector?.branch).filter(Boolean))];
const allVectors = new Set();
for (const b of vectorBranches) {
  for (const f of gitLs(b, 'spec/vectors/')) {
    if (f.endsWith('.json')) allVectors.add(path.basename(f));
  }
}
for (const v of [...allVectors].sort()) {
  if (!tracedVectors.has(v)) drift.push(`vector ${v}: không hàng trace nào reference`);
}

// ---- Chiều 2b: file Swift không được trace ----
// ASCNDTestSupport là hạ tầng test (fake/clock/rng), không phải behavior.
const tracedSwift = new Set(rows.map((r) => r.swift?.file).filter(Boolean));
const swiftBranches = [...new Set(rows.map((r) => r.swift?.branch).filter(Boolean))];
const allSwift = new Set();
for (const b of swiftBranches) {
  for (const f of gitLs(b, 'apps/ios/Packages/ASCNDKit/Sources/')) {
    if (f.endsWith('.swift') && !f.includes('/ASCNDTestSupport/')) allSwift.add(f);
  }
}
for (const f of [...allSwift].sort()) {
  if (!tracedSwift.has(f)) drift.push(`swift ${f}: không hàng trace nào reference`);
}

if (drift.length > 0) {
  console.log('PARITY DRIFT — các feature thiếu bằng chứng trace:');
  for (const d of drift) console.log('  ĐỎ ' + d);
  console.log(`${drift.length} điểm drift`);
  process.exit(1);
}
console.log(`parity: ${rows.length} hàng trace, không drift`);
