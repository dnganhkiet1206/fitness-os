/**
 * Cổng trên CI phải CHẶN được, không chỉ sáng đèn.
 *
 * ── chế độ hỏng mà bước này canh ──
 *
 * Không phải "workflow bị xoá". Đó là chuyện ai cũng thấy. Chế độ hỏng thật là
 * workflow ở lại, dấu tích vẫn xanh, và nó thôi chứng minh điều gì:
 *
 *   • một `continue-on-error: true` thêm vào lúc ba giờ sáng để merge cho kịp
 *   • một `|| true` sau lệnh chạy bộ kiểm
 *   • `npm ci --omit=dev`, thứ bỏ mất `pg` và `typescript` — và thiếu `pg` thì
 *     5 bước cơ sở dữ liệu BỎ QUA trong im lặng rồi vẫn thoát 0
 *   • tiền kiểm bị chuyển xuống sau bộ kiểm, nên nó không còn cứu được gì
 *
 * Cả bốn đều để lại một job XANH. Đó là lý do chúng nguy hiểm hơn một job đỏ,
 * và là lý do luật này đọc chính tệp YAML thay vì tin rằng nó vẫn như lúc viết.
 *
 * ── và vì sao nó phân tích YAML chứ không dò chữ ──
 *
 * `continue-on-error` có thể viết `true`, `'true'`, hay trong một biểu thức
 * `${{ }}`; một phép `grep` bắt được cách này và bỏ lọt cách kia. Bộ phân tích
 * thì không đoán. Không có bộ phân tích thì bước này ĐỎ — một luật riêng tư hay
 * một luật về cổng mà tự tắt khi thiếu công cụ là luật tệ nhất trong cả hai
 * loại: nó im lặng đúng lúc cần nói.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WF = path.resolve(NATIVE, '..', '.github/workflows/quality-gate.yml');
const problems = [];
const want = (ok, msg) => { if (!ok) problems.push(msg); };

if (!existsSync(WF)) {
  console.error('cổng CI CÓ LỖI:');
  console.error('  ✗ không có .github/workflows/quality-gate.yml — 211 bước chỉ chạy khi có người nhớ chạy chúng');
  process.exit(1);
}

let YAML;
try {
  YAML = createRequire(path.join(NATIVE, 'x.cjs'))('js-yaml');
} catch {
  console.error('cổng CI CÓ LỖI:');
  console.error(
    '  ✗ không nạp được `js-yaml`, nên không đọc được workflow. Bước này KHÔNG bỏ qua: một luật về cổng '
    + 'mà tự tắt khi thiếu công cụ thì im lặng đúng lúc cần nói. Cài js-yaml hoặc sửa bước này.',
  );
  process.exit(1);
}

const wf = YAML.load(readFileSync(WF, 'utf8'));
const jobs = Object.values(wf?.jobs ?? {});
want(jobs.length > 0, 'workflow không có job nào');

const steps = jobs.flatMap((j) => j?.steps ?? []);
const runs = steps.map((s) => String(s?.run ?? ''));
const joined = runs.join('\n');

/* ── 1. hai thứ phải thật sự được chạy ── */
want(/tools\/check\.mjs/.test(joined),
  'workflow không chạy `tools/check.mjs` — nó là cổng thật, 211 bước; mọi thứ khác chỉ là phần phụ');
want(/\btsc\b/.test(joined), 'workflow không chạy `tsc`');

/* ── 2. tiền kiểm phải chạy TRƯỚC bộ kiểm ──
   Sau thì vô nghĩa: lúc nó nói "thiếu PostgreSQL" thì 5 bước đã bỏ qua trong im
   lặng và đã báo xanh rồi. */
const iPre = runs.findIndex((r) => /ci-preflight\.mjs/.test(r));
const iGate = runs.findIndex((r) => /tools\/check\.mjs/.test(r));
want(iPre !== -1,
  'workflow không chạy `tools/ci-preflight.mjs` — thiếu nó thì một runner dựng thiếu vẫn cho job XANH, '
  + 'vì 5 bước cơ sở dữ liệu bỏ qua trong im lặng và thoát 0');
want(iPre === -1 || iGate === -1 || iPre < iGate,
  'tiền kiểm chạy SAU bộ kiểm — lúc nó lên tiếng thì các bước bỏ qua đã báo xanh xong rồi');

/* ── 3. không bước nào được phép hỏng mà job vẫn xanh ── */
for (const s of steps) {
  const r = String(s?.run ?? '');
  const critical = /tools\/check\.mjs|ci-preflight\.mjs|\btsc\b|npm ci/.test(r);
  if (!critical) continue;
  const name = s?.name ?? r.slice(0, 40);
  want(s['continue-on-error'] === undefined || s['continue-on-error'] === false,
    `bước "${name}" có continue-on-error — nó hỏng mà job vẫn xanh, tức cổng thành một cái đèn`);
  want(!/\|\|\s*(true|exit\s+0|:)\b/.test(r),
    `bước "${name}" nuốt mã thoát bằng \`|| true\` — cùng hiệu ứng với continue-on-error, khó thấy hơn`);
}

/* ── 4. `npm ci` phải cài CẢ devDependencies ──
   `pg` và `typescript` đều nằm ở đó. Thiếu `pg` thì các bước cơ sở dữ liệu bỏ
   qua trong im lặng — chính chế độ hỏng mà cả workflow này dựng lên để chặn. */
for (const r of runs) {
  if (!/\bnpm ci\b/.test(r)) continue;
  want(!/--omit=dev|--production|NODE_ENV=production/.test(r),
    '`npm ci` bỏ devDependencies — `pg` và `typescript` nằm ở đó, và thiếu `pg` thì 5 bước cơ sở dữ liệu '
    + 'bỏ qua trong im lặng rồi vẫn thoát 0');
}

/* ── 5. bộ kiểm phải chạy TỪ native/ ──
   `check.mjs` cố ý thoát 2 khi chạy từ gốc repo, và một job đỏ vì lý do ấy đọc
   ra như mã hỏng. */
const gateStep = steps.find((s) => /tools\/check\.mjs/.test(String(s?.run ?? '')));
if (gateStep) {
  const wd = gateStep['working-directory'] ?? jobs.find((j) => (j.steps ?? []).includes(gateStep))?.defaults?.run?.['working-directory'];
  want(/native/.test(String(wd ?? '')) || /cd\s+native/.test(String(gateStep.run)),
    'bước chạy bộ kiểm không đặt working-directory là `native` — `check.mjs` cố ý thoát 2 khi chạy từ gốc repo');
}

/* ── 6. mọi tệp mà workflow gọi tên phải tồn tại ──
   Đổi tên một tool rồi quên workflow thì lỗi chỉ hiện ra ở lần đẩy tiếp theo,
   trên máy người khác. */
for (const m of joined.matchAll(/tools\/[\w-]+\.mjs/g)) {
  want(existsSync(path.join(NATIVE, m[0])), `workflow gọi \`${m[0]}\` nhưng tệp đó không tồn tại`);
}

if (problems.length) {
  console.error('cổng CI CÓ LỖI:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  'cổng CI OK — workflow được PHÂN TÍCH (không dò chữ) và nó thật sự chạy `tsc` rồi `tools/check.mjs` từ '
  + '`native/`. Tiền kiểm chạy TRƯỚC bộ kiểm, vì sau thì vô nghĩa: lúc nó nói "thiếu PostgreSQL" thì 5 bước '
  + 'đã bỏ qua trong im lặng và báo xanh xong. Không bước chịu lực nào có continue-on-error hay `|| true`, '
  + 'và `npm ci` không bỏ devDependencies — `pg` nằm ở đó, và thiếu nó thì các bước cơ sở dữ liệu bỏ qua '
  + 'trong im lặng rồi vẫn thoát 0. Mọi tools/*.mjs mà workflow gọi tên đều tồn tại thật.',
);
