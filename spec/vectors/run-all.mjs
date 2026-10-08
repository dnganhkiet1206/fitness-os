#!/usr/bin/env node
/**
 * CHẠY mọi runner JS của golden vectors (#529, #527).
 *
 * `check-runners.mjs` chỉ kiểm mỗi tệp vector có runner ĐĂNG KÝ. Trước bước
 * này, không bước CI nào chạy các runner ấy: một runner đỏ — RN đổi luật, vector
 * bị sửa tay, lib chép lệch — vẫn để cổng xanh. Đây là chỗ chúng chạy.
 *
 * Luật:
 *  - mọi runner JS trong `runners.json` (trừ `swift:` — chạy ở iOS CI) chạy
 *    bằng `node`, mỗi cái một process, và PHẢI thoát 0;
 *  - `divergence-check.mjs` (runner chạy đúng mã RN, không phải bản chép) cũng
 *    chạy;
 *  - mọi tệp `run*.mjs` trong thư mục PHẢI được `runners.json` trỏ tới — một
 *    runner không ai đăng ký là một runner không ai chạy;
 *  - một runner treo quá `TIMEOUT_MS` là đỏ, không phải bị bỏ qua.
 *
 *   node spec/vectors/run-all.mjs              # chạy thật
 *   node spec/vectors/run-all.mjs --self-test  # bộ chạy phải đỏ trên runner hỏng
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TIMEOUT_MS = 300_000;
/** Không phải runner của một tệp vector, nhưng là phép kiểm runner chạy mã RN thật. */
const ALWAYS = ['divergence-check.mjs'];

/** Runner đã chạy xanh ở lượt `runAll` gần nhất, kèm dòng kết luận của nó. */
export const ran = [];

/** Chạy mọi runner của thư mục `dir`; trả về danh sách lỗi (rỗng = xanh). */
export function runAll(dir, { log = console.log } = {}) {
  const problems = [];
  ran.length = 0;
  const runners = JSON.parse(readFileSync(path.join(dir, 'runners.json'), 'utf8'));
  const js = [...new Set(Object.values(runners).filter((r) => !r.startsWith('swift:')))].sort();
  const present = readdirSync(dir).filter((f) => /^run.*\.mjs$/.test(f) && f !== 'run-all.mjs');
  for (const f of present) {
    if (!js.includes(f)) problems.push(`${f}: có trong spec/vectors nhưng runners.json không trỏ tới — không ai chạy nó`);
  }
  const files = readdirSync(dir);
  for (const r of [...js, ...ALWAYS.filter((f) => files.includes(f))]) {
    const t0 = Date.now();
    const res = spawnSync(process.execPath, [path.join(dir, r)], { cwd: dir, encoding: 'utf8', timeout: TIMEOUT_MS });
    const ms = Date.now() - t0;
    if (res.error?.code === 'ETIMEDOUT') {
      problems.push(`${r}: treo quá ${TIMEOUT_MS / 1000} giây`);
    } else if (res.status !== 0) {
      const tail = `${res.stdout ?? ''}${res.stderr ?? ''}`.trim().split('\n').slice(-8).join('\n    ');
      problems.push(`${r}: thoát ${res.status ?? res.signal}\n    ${tail}`);
    } else {
      // Dòng kết luận của chính runner ("today-controller: 14/14 vectors xanh")
      // — để log CI chứng minh TỪNG runner đã chạy, không chỉ bộ chạy.
      const verdict = `${res.stdout ?? ''}`.trim().split('\n').filter(Boolean).pop() ?? '';
      ran.push(`${r.replace(/\.mjs$/, '')}: ${verdict.trim()}`);
      log(`  xanh ${r} (${ms} ms) — ${verdict.trim()}`);
    }
  }
  return problems;
}

if (process.argv.includes('--self-test')) {
  // Thế giới hỏng: một runner đăng ký mà đỏ, một runner không ai đăng ký, một
  // runner xanh. Bộ chạy phải báo đúng hai lỗi kia — không thì nó không chứng
  // minh được gì.
  const dir = mkdtempSync(path.join(tmpdir(), 'run-all-'));
  writeFileSync(path.join(dir, 'runners.json'), JSON.stringify({ 'a.json': 'run-ok.mjs', 'b.json': 'run-red.mjs', 'c.json': 'swift:x.swift' }));
  writeFileSync(path.join(dir, 'run-ok.mjs'), 'process.exit(0);\n');
  writeFileSync(path.join(dir, 'run-red.mjs'), "console.log('  ĐỎ X-1'); process.exit(1);\n");
  writeFileSync(path.join(dir, 'run-orphan.mjs'), 'process.exit(0);\n');
  const found = runAll(dir, { log: () => {} });
  const red = found.some((p) => p.startsWith('run-red.mjs: thoát 1'));
  const orphan = found.some((p) => p.startsWith('run-orphan.mjs: có trong spec/vectors'));
  const okClean = !found.some((p) => p.startsWith('run-ok.mjs'));
  // Danh sách in ra CI chỉ được có runner đã chạy xanh — không có runner đỏ.
  const listed = ran.length === 1 && ran[0].startsWith('run-ok:');
  if (!(red && orphan && okClean && listed && found.length === 2)) {
    console.error(`run-all --self-test: ĐỎ — bộ chạy không bắt đúng thế giới hỏng:\n  ${found.join('\n  ') || '(không báo gì)'}`);
    process.exit(1);
  }
  console.log('run-all --self-test: XANH (runner đỏ và runner mồ côi đều bị bắt, runner xanh không bị báo oan)');
} else {
  const problems = runAll(HERE);
  if (problems.length) {
    console.log('spec/vectors runner JS ĐỎ:');
    for (const p of problems) console.log(`  ĐỎ ${p}`);
    process.exit(1);
  }
  // Dòng cuối là dòng `check.mjs` in ra: liệt kê từng runner đã chạy.
  console.log(`spec/vectors: ${ran.length} runner JS chạy thật và xanh — ${ran.join(' · ')}`);
}
