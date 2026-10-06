#!/usr/bin/env node
/**
 * Bằng chứng hồi quy cho forensic #327 (D-15) / fix #339 (D-5).
 *
 * Gate "neo cửa sổ điểm sẵn sàng" đỏ oan ở Australia/Lord_Howe ngày 2026-10-04
 * (đổi giờ 02:00 → 02:30, ngày dài 23.5 giờ). Forensic kết luận: code đúng,
 * test sai — case 'ngày đổi giờ' đổ "tuần nặng sau đó" bằng shift(D0, -k)
 * (neo theo hôm nay) trong khi day là ngày đổi giờ gần nhất; khi day ≈ hôm nay
 * thì 6/7 buổi "tương lai" rơi vào trong cửa sổ của chính day.
 *
 * Script này kiểm hai mệnh đề bằng LOGIC THẬT (tsc biên dịch local-date.ts):
 *
 * 1. Cửa sổ tính đúng trên ngày đổi giờ: localDayRangeISO cho đúng biên UTC
 *    (ngày 23.5h), localWindowISO lùi theo ngày lịch, và session 00:30 ngày
 *    day-6 nằm trong cửa sổ (không bị rớt như bản tính bằng giờ).
 * 2. Setup test cũ sai: với day = 2026-10-04, D0 = 2026-10-05, 6/7 buổi
 *    shift(D0, -k) nằm trong cửa sổ [day-27, day]; setup mới shift(day, +k)
 *    cho 0/7.
 *
 * Chạy: TZ='Australia/Lord_Howe' node native/tools/readiness-dst-forensic.mjs
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = mkdtempSync(path.join(tmpdir(), 'dst-forensic-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/local-date.ts', '--ignoreConfig',
    '--outDir', out, '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
} catch { /* vẫn emit đủ dùng */ }
const { createRequire } = await import('node:module');
const req = createRequire(path.join(out, 'x.js'));
const ld = req(path.join(out, 'local-date.js'));

let fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? '  OK ' : '  ĐỎ ') + name + (detail ? ` — ${detail}` : ''));
  if (!cond) fail++;
};

console.log('Mệnh đề 1: cửa sổ đúng trên ngày đổi giờ (logic thật)');
{
  // Lord Howe: 2026-10-04 đổi 02:00 → 02:30, ngày dài 23.5 giờ
  const r = ld.localDayRangeISO('2026-10-04');
  const hrs = (new Date(r.end) - new Date(r.start)) / 3600000;
  check('ngày đổi giờ dài 23.5h', hrs === 23.5, `${hrs}h`);
  check('biên UTC đúng', r.start === '2026-10-03T13:30:00.000Z' && r.end === '2026-10-04T13:00:00.000Z',
    `${r.start} .. ${r.end}`);
  const w = ld.localWindowISO('2026-10-04', 7);
  check('cửa sổ 7 ngày bắt đầu đúng nửa đêm day-6',
    w.start === '2026-09-27T13:30:00.000Z', w.start);
  // Session 00:30 giờ địa phương ngày day-6 — ca mà cửa sổ tính bằng giờ làm rớt
  const s = new Date('2026-09-28T00:30:00+10:30').toISOString();
  check('session 00:30 day-6 nằm trong cửa sổ', s >= w.start && s < w.end, s);
}

console.log('Mệnh đề 2: setup test cũ đổ dữ liệu vào trong cửa sổ');
{
  const day = '2026-10-04', D0 = '2026-10-05';
  const shift = (d, n) => ld.shiftLocalDate(d, n);
  const inWin = (d) => d >= shift(day, -27) && d <= day;
  const oldHeavy = []; for (let k = 0; k <= 6; k++) oldHeavy.push(shift(D0, -k));
  const newHeavy = []; for (let k = 1; k <= 7; k++) newHeavy.push(shift(day, k));
  const oldIn = oldHeavy.filter(inWin).length;
  const newIn = newHeavy.filter(inWin).length;
  check('setup cũ: đa số buổi "tương lai" nằm trong cửa sổ (test sai)', oldIn >= 6, `${oldIn}/7`);
  check('setup mới: không buổi nào trong cửa sổ (test đúng)', newIn === 0, `${newIn}/7`);
}

if (fail > 0) { console.log(`\n${fail} mệnh đề ĐỎ`); process.exit(1); }
console.log('\nForensic OK: code đúng (mệnh đề 1), test cũ sai (mệnh đề 2).');
