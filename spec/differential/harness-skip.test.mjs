#!/usr/bin/env node
/**
 * Regression test cho C39 (#461) — DifferentialHarness skip khi thiếu env vars.
 *
 * Bug gốc (D-21, #382): guard thiếu DIFF_INPUT/DIFF_OUTPUT gọi
 * `Issue.record(...)` khiến `swift test` thường FAIL oan. Fix: return sớm,
 * không ghi issue — test này chỉ chạy qua differential runner.
 *
 * Hai phép kiểm (static, chạy được trên Linux — Swift không compile ở đây):
 *  1. missing-env-skips: nhánh guard thiếu env PHẢI return sớm và KHÔNG
 *     chứa Issue.record / XCTFail / fatalError (đỏ trên code cũ).
 *  2. configured-env-executes: khi đủ env, run() PHẢI tiếp tục — decode
 *     fixtures (JSONDecoder), chạy logic native thật và ghi DIFF_OUTPUT
 *     (đỏ nếu ai đó biến cả test thành no-op).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'apps/ios/Packages/ASCNDKit/Tests/ASCNDCoreTests/DifferentialHarness.swift');

const src = readFileSync(SRC, 'utf8');
let pass = 0, fail = 0;
const check = (name, cond) => {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL:', name); }
};

// ---- Lấy khối guard thiếu env ----
const guardRe = /guard\s+let\s+inPath\s*=\s*ProcessInfo\.processInfo\.environment\["DIFF_INPUT"\][\s\S]*?else\s*\{([\s\S]*?)\n    \}/;
const m = src.match(guardRe);
check('tìm được guard DIFF_INPUT/DIFF_OUTPUT', !!m);
const elseBlock = m ? m[1] : '';

// 1. missing-env-skips: return sớm, không ghi issue
check('nhánh thiếu env có return', /\breturn\b/.test(elseBlock));
check('nhánh thiếu env KHÔNG Issue.record', !/Issue\.record/.test(elseBlock));
check('nhánh thiếu env KHÔNG XCTFail/fatalError', !/XCTFail|fatalError|preconditionFailure/.test(elseBlock));

// 2. configured-env-executes: sau guard, run() vẫn làm việc thật
const afterGuard = m ? src.slice(m.index + m[0].length) : '';
check('decode fixtures bằng JSONDecoder', /JSONDecoder\(\)/.test(afterGuard));
check('ghi kết quả ra DIFF_OUTPUT', /outPath/.test(afterGuard) && /createFile|write/.test(afterGuard));
check('dùng logic native thật (PersonalRecords/findRecords/bests)',
  /PersonalRecords|findRecords|\.bests/.test(afterGuard));

console.log(`harness-skip: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
