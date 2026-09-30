/**
 * Đọc HẾT theo trang (#180) — CHẠY THẬT `readAllPages` của `src/lib/read-all.ts`.
 *
 *     node tools/read-all.mjs
 *
 * Món của tôi từng là `.order('name').limit(200)`: món thứ 201 theo tên — kể
 * cả một món yêu thích — không bao giờ về client, và bộ lọc của màn Thực phẩm
 * nói "No matches" cho một món có thật. Bước này:
 *
 *   1. chạy hàm trên những ca có đáp án cụ thể: số dòng không chia hết, chia
 *      hết (cần một trang rỗng để biết là hết), rỗng, trang giữa HỎNG (ném,
 *      không trả một phần), vượt trần (ném, không cắt lặng lẽ); và đi hết một
 *      bảng 1 234 món có NHIỀU món trùng tên trên máy chủ giả (`applyQuery`,
 *      offset + limit như `.range()`), theo đúng thứ tự `(name, id)` của hook;
 *   2. đòi mỗi bản hỏng của hàm bị ít nhất một ca bắt;
 *   3. canh phần nối: `useMyFoods` đọc qua `readAllPages` trên thứ tự toàn phần
 *      `(name, id)` bằng `.range`, không còn `.limit(`.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyQuery } from './live-world.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const fatal = (m) => {
  console.error(`phép tự kiểm hỏng — ${m}, đừng tin kết quả`);
  process.exit(1);
};

/* Một bảng giả: `n` dòng, mỗi trang là một lát; ghi lại mọi lượt gọi. */
const pager = (n, { failAt = -1 } = {}) => {
  const rows = Array.from({ length: n }, (_, i) => ({ i }));
  const calls = [];
  const page = async (from, to) => {
    calls.push([from, to]);
    if (calls.length - 1 === failAt) return { data: null, error: new Error('boom') };
    return { data: rows.slice(from, to + 1), error: null };
  };
  return { rows, calls, page };
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* 1 234 món, tên lặp theo cụm (như "Cơm", "Cơm", "Cơm"…): offset trên một thứ
   tự KHÔNG toàn phần trượt đúng ở những cụm này. */
const FOODS = Array.from({ length: 1234 }, (_, i) => ({
  id: `f${String((i * 7919) % 1234).padStart(4, '0')}`,
  name: `Món ${String(Math.floor(i / 9)).padStart(3, '0')}`,
}));
const ORDERED = [...FOODS].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : a.id < b.id ? -1 : 1)).map((r) => r.id);

const CASES = [
  ['1 234 dòng, trang 500: đủ cả, đúng thứ tự, ba lượt gọi', async (m) => {
    const p = pager(1234);
    const got = await m.readAllPages(p.page, 500);
    return same(got, p.rows) && same(p.calls, [[0, 499], [500, 999], [1000, 1499]]);
  }],
  ['1 000 dòng, trang 500: trang thứ ba RỖNG mới biết là hết', async (m) => {
    const p = pager(1000);
    const got = await m.readAllPages(p.page, 500);
    return got.length === 1000 && p.calls.length === 3;
  }],
  ['không dòng nào: mảng rỗng, một lượt gọi', async (m) => {
    const p = pager(0);
    return same(await m.readAllPages(p.page, 500), []) && p.calls.length === 1;
  }],
  ['trang hai HỎNG: ném, không trả 500 dòng đầu như thể là tất cả', async (m) => {
    const p = pager(1234, { failAt: 1 });
    try {
      await m.readAllPages(p.page, 500);
      return false;
    } catch (e) {
      return e?.message === 'boom';
    }
  }],
  ['vượt trần: ném TooManyRowsError, không cắt lặng lẽ', async (m) => {
    const p = pager(100);
    try {
      await m.readAllPages(p.page, 10, 5);
      return false;
    } catch (e) {
      return e instanceof m.TooManyRowsError && p.calls.length === 5;
    }
  }],
  ['đúng bằng trần mà trang cuối thiếu: không ném', async (m) => {
    const p = pager(45);
    return (await m.readAllPages(p.page, 10, 5)).length === 45;
  }],
  ['máy chủ giả, 1 234 món nhiều tên trùng, order=name,id + offset/limit: đủ, đúng thứ tự, không trùng không hở', async (m) => {
    const page = async (from, to) => {
      const q = new URLSearchParams({ order: 'name.asc,id.asc', offset: String(from), limit: String(to - from + 1) });
      return { data: applyQuery(FOODS, new URL(`http://x/rest/v1/food_items?${q}`)), error: null };
    };
    return same((await m.readAllPages(page, 100)).map((r) => r.id), ORDERED);
  }],
];

const MUTANTS = [
  ['trang ĐẦY cũng coi là hết', /if \(rows\.length < size\)/, 'if (rows.length <= size)'],
  ['bỏ qua lỗi của một trang', /if \(error\)\s*throw error;/, ''],
  ['vượt trần thì trả một phần', /throw new TooManyRowsError\(/, 'return out; ('],
  ['hai trang chồng một dòng (to = from + size)', /i \* size \+ size - 1/, 'i * size + size'],
];

const out = mkdtempSync(path.join(tmpdir(), 'read-all-'));
try {
  execFileSync('npx', ['tsc', 'src/lib/read-all.ts', '--ignoreConfig', '--outDir', out,
    '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
  { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
  const compiled = readFileSync(path.join(out, 'read-all.js'), 'utf8');
  let n = 0;
  const load = (src) => {
    const f = path.join(out, `v${n++}.js`);
    writeFileSync(f, src);
    return createRequire(import.meta.url)(f);
  };
  const runAll = async (m) => {
    const bad = [];
    for (const [name, fn] of CASES) {
      try {
        if (!(await fn(m))) bad.push(name);
      } catch {
        bad.push(name);
      }
    }
    return bad;
  };
  problems.push(...(await runAll(load(compiled))));
  for (const [name, re, to] of MUTANTS) {
    if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
    if (!(await runAll(load(compiled.replace(re, to)))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
  }
} finally {
  rmSync(out, { recursive: true, force: true });
}

/* ── phần nối ── */
const hook = readFileSync(path.join(NATIVE, 'src/hooks/use-nutrition.ts'), 'utf8');
const i = hook.indexOf('export function useMyFoods(');
const body = i < 0 ? '' : hook.slice(i, hook.indexOf('\n}\n', i));
const WIRING = [
  [/readAllPages\(/, 'useMyFoods không đọc qua readAllPages — danh sách lại bị cắt ở một con số'],
  [/\.order\('name'\)\s*\.order\('id'\)\s*\.range\(from, to\)/, "useMyFoods không đọc theo thứ tự toàn phần (name, id) bằng .range — offset trượt ở những món trùng tên"],
];
if (!body) problems.push('không thấy `export function useMyFoods(` trong use-nutrition.ts');
for (const [re, msg] of WIRING) if (!re.test(body)) problems.push(msg);
if (/\.limit\(/.test(body)) problems.push('useMyFoods còn `.limit(` — món sau giới hạn không bao giờ về client (#180)');

if (problems.length) {
  console.error('đọc hết theo trang CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `đọc hết theo trang OK — ${CASES.length} ca CHẠY THẬT lib/read-all.ts: số dòng chia hết và không chia hết, rỗng, trang giữa ` +
    'hỏng thì ném (không trả một phần), vượt trần thì ném (không cắt lặng lẽ), và đi hết 1 234 món nhiều tên trùng trên máy chủ ' +
    `giả theo (name, id) — đủ, đúng thứ tự. ${MUTANTS.length} bản hỏng (trang đầy coi là hết, bỏ qua lỗi, vượt trần trả một phần, ` +
    'hai trang chồng nhau) đều bị bắt. useMyFoods đọc hết qua nó, không còn .limit (#180)',
);
