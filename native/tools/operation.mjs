/**
 * Thao tác async của một màn: chỉ lượt HỢP LỆ được ghi kết quả (#157).
 *
 * React Query đã lo dữ liệu server: mỗi `queryKey` một request, chia cho mọi
 * nơi đọc, huỷ qua `signal`. Nó không lo việc async mà một màn TỰ bắt đầu —
 * hỏi AI gợi ý bữa ăn, chụp rồi phân tích, đăng nhập, đổi mật khẩu. Mỗi chỗ
 * ấy từng giữ một `loading`/`busyRef` riêng, và cờ cục bộ có hai lỗ: hai cú
 * chạm trong cùng khung hình đều đọc `false`, và không gì chặn một lượt về
 * SAU khi màn đã tháo, hay sau một lượt mới hơn, ghi kết quả của nó.
 *
 * Bước này CHẠY THẬT `createOperation` đọc từ `src/lib/operation-core.ts`,
 * với promise tự điều khiển được thứ tự xong, qua đủ các đường mục 12 của
 * #157: SUCCESS, ERROR, CANCEL, UNMOUNT, RAPID INPUT, OUT-OF-ORDER. Rồi sáu
 * bản hỏng phải bị bắt.
 *
 * Cộng phần cấu trúc: những màn đã chuyển sang `useOperation` không được quay
 * lại cờ tự giữ (`setLoading`/`setBusy`/`setSaving`/`busyRef`).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(NATIVE, f), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

/** Một promise mà ca kiểm quyết định lúc nào xong, xong thế nào. */
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((r) => setImmediate(r));

const CASES = [
  ['SUCCESS: một lượt, ghi đúng giá trị', async ({ createOperation }) => {
    const op = createOperation();
    const d = deferred();
    const p = op.run(() => d.promise);
    if (!op.pending()) return 'đang chạy mà pending() là false';
    d.resolve(7);
    const r = await p;
    if (r.status !== 'ok' || r.value !== 7) return `ra ${JSON.stringify(r)}`;
    return op.pending() ? 'xong rồi mà vẫn pending — khoá không nhả' : null;
  }],
  ['ERROR: lỗi đi ra thành `error`, không ném, và nhả pending', async ({ createOperation }) => {
    const op = createOperation();
    const r = await op.run(() => Promise.reject(new Error('x')));
    if (r.status !== 'error') return `ra ${r.status}`;
    if (op.pending()) return 'lỗi rồi mà vẫn pending — đường lỗi không dọn';
    const again = await op.run(() => Promise.resolve(1));
    return again.status === 'ok' ? null : 'sau một lỗi, lượt mới không chạy được';
  }],
  ['ERROR đồng bộ: hàm ném ngay khi gọi vẫn thành `error`', async ({ createOperation }) => {
    const op = createOperation();
    const r = await op.run(() => {
      throw new Error('sync');
    });
    return r.status === 'error' && !op.pending() ? null : `ra ${r.status}, pending ${op.pending()}`;
  }],
  ['RAPID INPUT (join): năm lần bấm, MỘT lần chạy, cả năm nhận chung kết quả', async ({ createOperation }) => {
    const op = createOperation('join');
    const d = deferred();
    let calls = 0;
    const ps = Array.from({ length: 5 }, () => op.run(() => (calls++, d.promise)));
    d.resolve('x');
    const rs = await Promise.all(ps);
    if (calls !== 1) return `chạy ${calls} lần`;
    return rs.every((r) => r.status === 'ok' && r.value === 'x') ? null : `kết quả ${JSON.stringify(rs)}`;
  }],
  ['OUT-OF-ORDER (replace): #1 bắt đầu, #2 bắt đầu, #2 xong, #1 xong → #2 ghi, #1 stale', async ({ createOperation }) => {
    const op = createOperation('replace');
    const d1 = deferred();
    const d2 = deferred();
    let aborted1 = false;
    const p1 = op.run((signal) => {
      signal.addEventListener('abort', () => (aborted1 = true));
      return d1.promise;
    });
    const p2 = op.run(() => d2.promise);
    d2.resolve('mới');
    const r2 = await p2;
    d1.resolve('cũ');
    const r1 = await p1;
    if (r2.status !== 'ok' || r2.value !== 'mới') return `#2 ra ${JSON.stringify(r2)}`;
    if (r1.status !== 'stale') return `#1 ra ${JSON.stringify(r1)} — response cũ được ghi`;
    return aborted1 ? null : '#1 không bị huỷ khi #2 thay nó (Test 6)';
  }],
  ['OUT-OF-ORDER: #1 bị thay nhưng về lỗi muộn → vẫn stale, không báo lỗi của lượt cũ', async ({ createOperation }) => {
    const op = createOperation('replace');
    const d1 = deferred();
    const p1 = op.run(() => d1.promise);
    const p2 = op.run(() => Promise.resolve(2));
    await p2;
    d1.reject(new Error('muộn'));
    const r1 = await p1;
    return r1.status === 'stale' ? null : `#1 ra ${r1.status}`;
  }],
  ['CANCEL / UNMOUNT: huỷ lúc đang chạy → lượt ấy stale, signal bị huỷ, pending nhả ngay', async ({ createOperation }) => {
    const op = createOperation();
    const d = deferred();
    let signalSeen;
    const p = op.run((signal) => ((signalSeen = signal), d.promise));
    op.cancel();
    if (op.pending()) return 'huỷ rồi mà vẫn pending';
    if (!signalSeen.aborted) return 'huỷ mà signal chưa bị abort';
    d.resolve('về sau khi tháo');
    const r = await p;
    return r.status === 'stale' ? null : `ra ${JSON.stringify(r)} — màn đã tháo vẫn nhận kết quả`;
  }],
  ['sau khi huỷ: lượt mới chạy bình thường, lượt cũ về muộn không đè nó', async ({ createOperation }) => {
    const op = createOperation();
    const d1 = deferred();
    const p1 = op.run(() => d1.promise);
    op.cancel();
    const d2 = deferred();
    const p2 = op.run(() => d2.promise);
    d1.resolve('cũ');
    await tick();
    if (!op.pending()) return 'lượt cũ xong làm nhả pending của lượt mới';
    d2.resolve('mới');
    const [r1, r2] = await Promise.all([p1, p2]);
    return r1.status === 'stale' && r2.status === 'ok' && r2.value === 'mới' ? null : `#1 ${r1.status}, #2 ${JSON.stringify(r2)}`;
  }],
  ['subscribe: báo khi pending đổi, cả khi bắt đầu, xong, và huỷ', async ({ createOperation }) => {
    const op = createOperation();
    const seen = [];
    op.subscribe(() => seen.push(op.pending()));
    await op.run(() => Promise.resolve(1));
    const d = deferred();
    void op.run(() => d.promise);
    op.cancel();
    const want = [true, false, true, false];
    return JSON.stringify(seen) === JSON.stringify(want) ? null : `thấy ${JSON.stringify(seen)}, phải là ${JSON.stringify(want)}`;
  }],
];

const out = mkdtempSync(path.join(tmpdir(), 'operation-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/operation-core.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--lib', 'es2020,dom'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'operation-core.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };
  const runAll = async (mod) => {
    const fails = [];
    for (const [name, fn] of CASES) {
      let err;
      try {
        err = await fn(mod);
      } catch (e) {
        err = `ném ra ${e?.message ?? e}`;
      }
      if (err) fails.push(`${name}: ${err}`);
    }
    return fails;
  };

  problems.push(...(await runAll(load(compiled))));

  const MUTANTS = [
    ['không kiểm lượt hợp lệ (response cũ được ghi)', [/return id === valid \? o : \{ status: 'stale' \};/, 'return o;']],
    ['join mà vẫn chạy lượt thứ hai', [/if \(inFlight && mode === 'join'\)\s*return inFlight\.promise;/, '']],
    ['replace mà không huỷ lượt cũ', [/if \(inFlight\)\s*inFlight\.ctrl\.abort\(\);/, '']],
    ['cancel không vô hiệu lượt đang chạy', [/valid = \+\+seq;\s*if \(inFlight\) \{/, 'if (inFlight) {']],
    ['không nhả pending khi xong', [/(=== id\) \{)\s*inFlight = null;\s*notify\(\);/, '$1']],
    ['lượt cũ xong nhả pending của lượt mới', [/if \(inFlight\?\.id === id\)/, 'if (true)']],
  ];
  for (const [name, ...edits] of MUTANTS) {
    let src = compiled;
    for (const [re, to] of edits) {
      if (!re.test(src)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
      src = src.replace(re, to);
    }
    if (!(await runAll(load(src))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

/*
  Những màn đã chuyển sang `useOperation` (#157). Quay lại cờ tự giữ là quay
  lại đúng hai lỗ ở trên, và trong diff nó trông như một dòng vô hại.
*/
const CONVERTED = [
  'src/components/ascnd/ai-meal-suggest.tsx',
  'src/components/ascnd/auth-screen.tsx',
  'src/app/change-password.tsx',
  'src/app/scan-food.tsx',
];
for (const f of CONVERTED) {
  const code = strip(read(f));
  if (!/\buseOperation\(/.test(code)) problems.push(`${f}: không còn dùng \`useOperation\``);
  const m = /\b(setLoading|setBusy|setSaving|busyRef)\b/.exec(code);
  if (m) {
    const line = code.slice(0, m.index).split('\n').length;
    problems.push(`${f}:${line}: \`${m[1]}\` — cờ tự giữ quay lại; dùng \`pending\`/\`running()\` của \`useOperation\``);
  }
}
if (!/\bsignal\b/.test(strip(read('src/lib/edge.ts')).match(/functions\.invoke\([\s\S]*?\}\)/)?.[0] ?? '')) {
  problems.push('src/lib/edge.ts: `functions.invoke` không nhận `signal` — thao tác bị thay/huỷ vẫn chạy request tới cùng');
}

if (problems.length) {
  console.error('thao tác async CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  'thao tác async OK — CHẠY THẬT createOperation đọc từ src/lib/operation-core.ts: SUCCESS; ERROR (cả ' +
    'ném đồng bộ) nhả pending; năm lần bấm (join) chạy MỘT lần, cả năm chung kết quả; #1, #2 xong ngược ' +
    'thứ tự (replace) → #2 ghi, #1 stale và bị abort, kể cả khi #1 về lỗi muộn; huỷ/tháo lúc đang chạy → ' +
    'stale, signal abort, pending nhả ngay; lượt cũ về muộn không nhả pending của lượt mới; subscribe báo ' +
    'đúng mọi lần đổi. Sáu bản hỏng đều bị bắt. Bốn màn đã chuyển (gợi ý AI, đăng nhập, đổi mật khẩu, quét ' +
    'món) không quay lại cờ tự giữ, và callEdge truyền signal xuống functions.invoke',
);
