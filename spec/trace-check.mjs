#!/usr/bin/env node
/**
 * Kiểm tra source-trace registry cho issue #281 (D-6).
 *
 * Mỗi hàng trace.json: RN source (file#symbol) → behavior → spec rule →
 * golden vector → Swift implementation (file#symbol) → automated test.
 * Script báo hàng nào trỏ tới file/test KHÔNG tồn tại.
 *
 * - RN file: phải có trong cây làm việc (trừ node_modules → bỏ qua).
 * - Vector: spec/vectors/<file> trong cây làm việc, nếu không thì thử
 *   ref branch đã ghi; rồi kiểm tra có vector nào mang rule ấy không.
 * - Swift file/test: cây làm việc trước, rồi `git show <branch>:<path>`;
 *   symbol/test name phải xuất hiện trong nội dung file.
 * - Hàng `status: "planned"` (Swift chưa viết xong) chỉ liệt kê pending,
 *   không tính lỗi — nhưng RN + vector vẫn phải đúng.
 *
 * Chạy: node spec/trace-check.mjs [đường-dẫn-trace.json]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const registryPath = process.argv[2] ?? path.join(ROOT, 'spec', 'trace.json');
const rows = JSON.parse(readFileSync(registryPath, 'utf8'));
const problems = [];
const pending = [];

function gitShow(rev, file) {
  try {
    return execFileSync('git', ['show', `${rev}:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    return null;
  }
}

function fileContent(file, branch) {
  const abs = path.join(ROOT, file);
  if (existsSync(abs)) return { content: readFileSync(abs, 'utf8'), where: 'worktree' };
  if (branch) {
    const c = gitShow(branch, file);
    if (c !== null) return { content: c, where: branch };
  }
  return null;
}

// "RestTimer.adjust(base:delta:total:)" → ["RestTimer", "adjust"]
// "SessionStore" → ["SessionStore"]
function symbolParts(symbol) {
  const base = symbol.split('(')[0];
  return base.split('.').filter(Boolean);
}

function checkRow(r) {
  const planned = r.status === 'planned';

  // ── RN ──
  const [rnFile, rnSym] = r.rn.split('#');
  if (!rnFile.startsWith('node_modules/')) {
    const hit = fileContent(rnFile, null);
    if (!hit) {
      problems.push(`${r.id}: RN file không tồn tại: ${rnFile}`);
    } else if (rnSym && !hit.content.includes(rnSym.split(' ')[0].split('(')[0])) {
      problems.push(`${r.id}: RN symbol không thấy trong ${rnFile}: ${rnSym}`);
    }
  }

  // ── Vector ──
  if (r.vector) {
    const vf = `spec/vectors/${r.vector.file}`;
    const hit = fileContent(vf, r.vector.branch);
    if (!hit) {
      problems.push(`${r.id}: vector file không tồn tại: ${vf}` +
        (r.vector.branch ? ` (cả trên ${r.vector.branch})` : ''));
    } else {
      let vectors;
      try { vectors = JSON.parse(hit.content); }
      catch { vectors = null; }
      const ok = Array.isArray(vectors) &&
        vectors.some((v) => v.rule === r.rule || String(v.rule).startsWith(r.rule + '-') || String(v.rule).startsWith(r.rule));
      if (!ok) problems.push(`${r.id}: không có vector nào mang rule ${r.rule} trong ${r.vector.file}`);
    }
  }

  if (planned) {
    pending.push(`${r.id}: Swift/test đang chờ (${r.test?.name ?? '?'})`);
    return;
  }

  // ── Swift ──
  const sHit = fileContent(r.swift.file, r.swift.branch);
  if (!sHit) {
    problems.push(`${r.id}: Swift file không tồn tại: ${r.swift.file} (cả trên ${r.swift.branch})`);
  } else {
    for (const part of symbolParts(r.swift.symbol)) {
      if (!sHit.content.includes(part)) {
        problems.push(`${r.id}: Swift symbol không thấy trong ${r.swift.file}: ${r.swift.symbol}`);
        break;
      }
    }
  }

  // ── Test ──
  const tHit = fileContent(r.test.file, r.test.branch);
  if (!tHit) {
    problems.push(`${r.id}: test file không tồn tại: ${r.test.file} (cả trên ${r.test.branch})`);
  } else if (!tHit.content.includes(`func ${r.test.name}`) && !tHit.content.includes(r.test.name)) {
    problems.push(`${r.id}: test không thấy trong ${r.test.file}: ${r.test.name}`);
  }
}

for (const r of rows) checkRow(r);

console.log(`Registry: ${rows.length} hàng (${rows.filter((r) => r.status === 'verified').length} verified, ${pending.length} planned)`);
if (pending.length) {
  console.log('Pending (Swift chưa xong, không tính lỗi):');
  for (const p of pending) console.log('  ~', p);
}
if (problems.length) {
  console.log(`FAIL ${problems.length} vấn đề:`);
  for (const p of problems) console.log('  -', p);
  process.exit(1);
}
console.log('OK trace registry hợp lệ');
