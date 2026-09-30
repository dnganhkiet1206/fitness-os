/**
 * Việc xếp hàng lúc mất mạng lên đĩa NGAY khi nó tạm dừng — CHẠY THẬT
 * `persistPausedNow` (src/lib/persist-paused.ts) cùng TanStack Query thật
 * (query-core, query-persist-client-core, query-async-storage-persister).
 *
 *     node tools/persist-paused.mjs
 *
 * Tất định: không đo bằng đồng hồ "đợi X ms rồi xem". Mỗi lượt ghi vào kho giả
 * được chụp lại, và "tắt app" là lấy ĐÚNG bản chụp của lượt ghi đầu tiên sau cú
 * bấm — ranh giới mutation/persist mà một lần bị giết có thể rơi vào.
 *
 *   0. tự kiểm: cấu hình CŨ (throttle 1000, không bọc) đúng là hỏng — lượt ghi
 *      đầu sau cú bấm không có mutation. Nếu không hỏng thì phép thử này không
 *      đo gì, và nó nói ra thay vì xanh;
 *   1. tắt app ngay sau lượt ghi đầu → mở lại (QueryClient mới, khôi phục từ
 *      đĩa, có mạng) → mutationFn chạy ĐÚNG MỘT lần với đúng biến;
 *   2. không lượt ghi nào sau cú bấm thiếu mutation (không lượt ghi cũ nào đè);
 *   3. cú bấm thứ hai trong cửa sổ throttle cũng lên đĩa ở tick kế, không chờ;
 *   4. mutation có mạng: chạy ngay, một lần, không bao giờ nằm trên đĩa như một
 *      việc tạm dừng — không đổi gì cho đường có mạng;
 *   5. nhịp ghi vẫn được giữ: 40 lần cập nhật truy vấn trong ~800 ms là vài lượt
 *      ghi, không phải 40;
 *   6. khôi phục / xoá đi thẳng xuống persister bên trong.
 * Rồi các bản hỏng của hàm phải bị bắt, và phần nối trong `query-client.ts`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MutationObserver, onlineManager, QueryClient } from '@tanstack/query-core';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/query-persist-client-core';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};
const KEY = ['offline-write'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pausedIn = (v) => (JSON.parse(v).clientState.mutations ?? []).filter((m) => m.state?.isPaused);

/** Một "app": QueryClient + persister trên một kho giả chụp mọi lượt ghi. */
function app({ wrap, online }) {
  const store = new Map();
  const writes = [];
  const storage = {
    getItem: async (k) => store.get(k) ?? null,
    setItem: async (k, v) => {
      store.set(k, v);
      writes.push({ at: Date.now(), v });
    },
    removeItem: async (k) => store.delete(k),
  };
  onlineManager.setOnline(online);
  const qc = new QueryClient();
  const calls = [];
  qc.setMutationDefaults(KEY, { mutationFn: async (v) => void calls.push(v) });
  const base = createAsyncStoragePersister({ storage, key: 'k', throttleTime: wrap ? 0 : 1000 });
  const persister = wrap ? wrap(base, 1000) : base;
  const stop = persistQueryClientSubscribe({ queryClient: qc, persister, buster: 'v3' });
  const tap = (vars) => {
    const at = Date.now();
    new MutationObserver(qc, { mutationKey: KEY }).mutate(vars).catch(() => {});
    return at;
  };
  return { qc, store, writes, calls, persister, stop, tap };
}

/** Mở lại từ MỘT bản chụp đĩa, có mạng: trả các lần mutationFn chạy. */
async function reopen(snapshot) {
  const store = new Map([['k', snapshot]]);
  const storage = { getItem: async (k) => store.get(k) ?? null, setItem: async (k, v) => void store.set(k, v), removeItem: async (k) => store.delete(k) };
  onlineManager.setOnline(true);
  const qc = new QueryClient();
  const calls = [];
  qc.setMutationDefaults(KEY, { mutationFn: async (v) => void calls.push(v) });
  await persistQueryClientRestore({ queryClient: qc, persister: createAsyncStoragePersister({ storage, key: 'k', throttleTime: 0 }), buster: 'v3' });
  await qc.resumePausedMutations();
  await sleep(20);
  return calls;
}

const firstAfter = (writes, t) => writes.find((w) => w.at >= t);

const CASES = [
  ['tắt app ngay sau lượt ghi đầu tiên sau cú bấm → mở lại → gửi đúng một lần, đúng biến', async (wrap) => {
    const a = app({ wrap, online: false });
    const t = a.tap({ kind: 'meal', entryId: 'e1' });
    await sleep(60);
    a.stop();
    const w = firstAfter(a.writes, t);
    if (!w || pausedIn(w.v).length !== 1) return false;
    const calls = await reopen(w.v);
    return calls.length === 1 && calls[0].entryId === 'e1';
  }],
  ['không lượt ghi nào sau cú bấm thiếu mutation', async (wrap) => {
    const a = app({ wrap, online: false });
    const t = a.tap({ kind: 'meal', entryId: 'e2' });
    await sleep(1300);
    a.stop();
    const after = a.writes.filter((w) => w.at >= t);
    return after.length > 0 && after.every((w) => pausedIn(w.v).length === 1);
  }],
  ['cú bấm thứ hai trong cửa sổ throttle cũng lên đĩa ở tick kế (≤ 50 ms), không chờ', async (wrap) => {
    const a = app({ wrap, online: false });
    a.tap({ kind: 'water', rowId: 'w1' });
    await sleep(200);
    const t2 = a.tap({ kind: 'water', rowId: 'w2' });
    await sleep(60);
    a.stop();
    const w = firstAfter(a.writes, t2);
    return !!w && w.at - t2 <= 50 && pausedIn(w.v).length === 2;
  }],
  ['có mạng: chạy ngay một lần, không bao giờ nằm trên đĩa như việc tạm dừng', async (wrap) => {
    const a = app({ wrap, online: true });
    a.tap({ kind: 'meal', entryId: 'e3' });
    await sleep(1300);
    a.stop();
    return a.calls.length === 1 && a.writes.every((w) => pausedIn(w.v).length === 0);
  }],
  ['nhịp ghi được giữ: 40 lần cập nhật truy vấn trong ~800 ms là ≤ 3 lượt ghi', async (wrap) => {
    const a = app({ wrap, online: true });
    for (let i = 0; i < 40; i++) {
      a.qc.setQueryData(['q'], i);
      await sleep(20);
    }
    await sleep(1200);
    a.stop();
    return a.writes.length >= 1 && a.writes.length <= 3 && JSON.parse(a.writes.at(-1).v).clientState.queries[0].state.data === 39;
  }],
  ['khôi phục / xoá đi thẳng xuống persister bên trong', async (wrap) => {
    const a = app({ wrap, online: true });
    a.store.set('k', JSON.stringify({ buster: 'v3', timestamp: 1, clientState: { mutations: [], queries: [] } }));
    const r = await a.persister.restoreClient();
    await a.persister.removeClient();
    a.stop();
    return r?.timestamp === 1 && !a.store.has('k');
  }],
];

const out = mkdtempSync(path.join(tmpdir(), 'persist-paused-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/persist-paused.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck', '--moduleResolution', 'bundler'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'persist-paused.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f).persistPausedNow;
  };
  const runAll = async (wrap) => {
    const bad = [];
    for (const [name, fn] of CASES) {
      try {
        if (!(await fn(wrap))) bad.push(name);
      } catch {
        bad.push(name);
      }
    }
    return bad;
  };

  /* 0 · cấu hình cũ phải hỏng đúng ở ca đầu — không thì phép thử rỗng nghĩa */
  const old = await runAll(null);
  if (!old.includes(CASES[0][0])) fatal('cấu hình CŨ (throttle 1000, không bọc) không hỏng ở ca "tắt app ngay sau lượt ghi đầu" — phép thử không tái hiện race');

  problems.push(...(await runAll(load(compiled))));

  const MUTANTS = [
    ['không gộp theo tick: đưa thẳng xuống, mỗi sự kiện một lượt ghi', /persistClient: \(client\) => \{/, 'persistClient: (client) => { inner.persistClient(client); return;'],
    ['việc tạm dừng mới cũng chờ nhịp throttle', /schedule\(fresh \? Date\.now\(\) : /, 'schedule(false ? Date.now() : '],
    ['bỏ nhịp throttle: mọi lượt ghi ở tick kế', /Math\.max\(Date\.now\(\), nextAllowed\)/, 'Date.now()'],
  ];
  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!(await runAll(load(compiled.replace(re, to)))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
  globalThis.__mutants = MUTANTS.length;
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ── phần nối ── */
const qc = readFileSync(path.join(NATIVE, 'src/lib/query-client.ts'), 'utf8');
if (!/export const asyncStoragePersister = persistPausedNow\(\s*createAsyncStoragePersister\(\{[^}]*throttleTime: 0,[^}]*\}\),\s*1000,?\s*\)/.test(qc)) {
  problems.push('query-client.ts: `asyncStoragePersister` phải là `persistPausedNow(createAsyncStoragePersister({ …, throttleTime: 0 }), 1000)` — persister bên trong tự throttle thì lượt ghi đầu lại là bản cũ');
}

if (problems.length) {
  console.error('việc xếp hàng lên đĩa ngay CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `việc xếp hàng lên đĩa ngay OK — ${CASES.length} ca CHẠY THẬT persistPausedNow cùng TanStack Query thật. Tự kiểm: cấu hình cũ ` +
    '(throttle 1000, không bọc) HỎNG ở ca "tắt app ngay sau lượt ghi đầu tiên sau cú bấm" — race được tái hiện tất định. Với bản bọc: ' +
    'mở lại từ đúng lượt ghi ấy thì gửi đúng một lần; không lượt ghi nào sau cú bấm thiếu mutation; cú bấm thứ hai trong cửa sổ ' +
    'throttle lên đĩa ở tick kế; mutation có mạng không bao giờ nằm trên đĩa như việc tạm dừng; 40 lần cập nhật là ≤ 3 lượt ghi. ' +
    `${globalThis.__mutants} bản hỏng (không gộp theo tick, việc mới chờ throttle, bỏ throttle) đều bị bắt; query-client.ts nối đúng`,
);
process.exit(0);
