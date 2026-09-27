/**
 * Tự kiểm của thế giới giả không được đỏ vì LỊCH (#153).
 *
 * ── lỗi mà bước này ghim ──
 *
 * Sáng 27/09/2026 bước "máy chủ giả" đỏ. Ca "POST lô [đủ, thiếu] → 23502" của
 * `fake-rest.mjs` viết cứng ngày '2026-09-20'; fixture cân nặng đặt ngày TƯƠNG
 * ĐỐI với hôm nay (`dayStr(n)`), và đúng hôm ấy một hàng rơi vào 2026-09-20 —
 * lô vấp UNIQUE (user_id, date) → 409 trước khi tới NOT NULL. Sửa ở `dc7eb2b`;
 * không gì chặn một ca khác cùng kiểu, và loại lỗi này chỉ hiện đúng một ngày.
 *
 * ── hai vế ──
 *
 *   1. TĨNH: trong các tự kiểm node dùng `FIXTURES`, một chuỗi ngày ISO nằm
 *      trong ±400 ngày quanh hôm nay (ngoài chú thích) là một ngày có thể trùng
 *      fixture một ngày nào đó. Mỗi chỗ phải có tên trong LOCAL_OK kèm lý do —
 *      "hàng thử tự dựng, không đụng FIXTURES" là lý do hợp lệ.
 *   2. CHẠY: bốn tự kiểm dùng `FIXTURES` chạy lại dưới đồng hồ giả lệch −30,
 *      +15, +45 ngày (`Date` bị thay trước khi tệp nào nạp — `--import`), và
 *      phải xanh như ở hôm nay. Một ca phụ thuộc ngày tuyệt đối hay một phép
 *      tính ngày lệch múi thì đỏ ở một trong ba mốc.
 *
 * Thử ngược của vế 1 ngay trong bước: một nguồn giả có '2026-09-20' trong mã
 * (không trong chú thích) phải bị bắt.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];

/* Tự kiểm node (không mở trình duyệt) có đọc FIXTURES. */
const SELF_TESTS = ['tools/fake-rest.mjs', 'tools/fixture-integrity.mjs', 'tools/fixture-schema.mjs', 'tools/search-parity.mjs'];
/* Chỗ được phép, theo `tệp: chuỗi ngày`. */
const LOCAL_OK = {
  'tools/fake-rest.mjs: 2026-01-01': 'hàng thử tự dựng của ca sắp xếp NULL — không đụng FIXTURES',
  'tools/search-parity.mjs: 2026-09-26': 'thế giới riêng dựng từ search_cases.json, chỉ thứ tự tương đối của created_at',
};

const DAY = 864e5;
function datesIn(src) {
  const out = [];
  const code = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, '');
  for (const m of code.matchAll(/(['"`])(\d{4}-\d{2}-\d{2})/g)) {
    const t = Date.parse(`${m[2]}T00:00:00Z`);
    if (Number.isFinite(t) && Math.abs(t - Date.now()) < 400 * DAY) out.push(m[2]);
  }
  return [...new Set(out)];
}

/* ── vế 1 ── */
let scanned = 0;
for (const f of SELF_TESTS) {
  const src = readFileSync(path.join(NATIVE, f), 'utf8');
  scanned++;
  for (const d of datesIn(src)) {
    if (!LOCAL_OK[`${f}: ${d}`]) problems.push(`${f}: ngày viết cứng '${d}' (trong ±400 ngày quanh hôm nay) — có thể trùng một hàng fixture tương đối vào một ngày nào đó; dùng ngày không thể trùng (như 1999-01-01) hay dẫn xuất từ dayStr, hoặc ghi lý do vào LOCAL_OK`);
  }
}
for (const k of Object.keys(LOCAL_OK)) {
  const [f, d] = k.split(': ');
  if (!datesIn(readFileSync(path.join(NATIVE, f), 'utf8')).includes(d)) problems.push(`LOCAL_OK["${k}"] không còn khớp chỗ nào — bỏ dòng miễn`);
}
{
  const fake = "const x = 1; // '2026-09-19' trong chú thích thì không tính\nconst r = { date: '2026-09-20' };";
  const probe = new Date(Date.parse('2026-09-27T00:00:00Z'));
  const saved = Date.now;
  Date.now = () => probe.getTime();
  const got = datesIn(fake);
  Date.now = saved;
  if (got.join() !== '2026-09-20') problems.push(`thử ngược vế 1 hỏng: nguồn giả ra [${got}], phải ra [2026-09-20] (chú thích không tính)`);
}

/* ── vế 2 ── */
const dir = mkdtempSync(path.join(tmpdir(), 'date-drift-'));
const pre = path.join(dir, 'drift.mjs');
writeFileSync(
  pre,
  `const shift = Number(process.env.DRIFT_DAYS) * 864e5;
const Real = Date;
class Drift extends Real {
  constructor(...a) { super(...(a.length ? a : [Real.now() + shift])); }
  static now() { return Real.now() + shift; }
}
globalThis.Date = Drift;
`,
);
const DRIFTS = [-30, 15, 45];
let runs = 0;
try {
  for (const days of DRIFTS) {
    for (const f of SELF_TESTS) {
      runs++;
      try {
        execFileSync('node', ['--import', pathToFileURL(pre).href, f], {
          cwd: NATIVE, env: { ...process.env, DRIFT_DAYS: String(days) }, stdio: 'pipe', timeout: 120000,
        });
      } catch (e) {
        const out = `${e.stdout ?? ''}${e.stderr ?? ''}`.split('\n').filter((l) => /✗|•|CÓ LỖI|sai|Error/.test(l)).slice(0, 3).join(' | ');
        problems.push(`${f} đỏ khi đồng hồ lệch ${days > 0 ? '+' : ''}${days} ngày: ${out.slice(0, 300)}`);
      }
    }
  }
} finally {
  rmSync(dir, { recursive: true, force: true });
}

if (problems.length) {
  console.error('tự kiểm phụ thuộc lịch CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `lịch không đổi kết quả OK — ${scanned} tự kiểm dùng FIXTURES không có ngày viết cứng gần hôm nay ngoài ${Object.keys(LOCAL_OK).length} chỗ có lý do; ` +
    `và ${runs} lượt chạy lại dưới đồng hồ giả lệch ${DRIFTS.join(', ')} ngày đều xanh như hôm nay (#153 — '2026-09-20' của fake-rest từng đỏ đúng một ngày)`,
);
