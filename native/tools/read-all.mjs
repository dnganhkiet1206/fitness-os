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

/* ── #179: ảnh tiến trình — ký cả loạt (`lib/photo-urls.ts`) ── */
const PHOTO_CASES = [
  ['URL http đi thẳng, không ký; đường dẫn Storage được ký', async (m) => {
    const calls = [];
    const sign = async (paths) => (calls.push(paths), { data: paths.map((p) => ({ path: p, signedUrl: `S:${p}` })), error: null });
    const r = await m.signPhotos([{ photo_url: 'http://x/a.jpg' }, { photo_url: 'u/b.jpg' }], sign);
    return r[0].signedUrl === 'http://x/a.jpg' && r[1].signedUrl === 'S:u/b.jpg' && calls.length === 1 && calls[0].length === 1;
  }],
  ['250 ảnh: ký theo loạt 100 — ba lượt gọi, không phải 250', async (m) => {
    const calls = [];
    const sign = async (paths) => (calls.push(paths.length), { data: paths.map((p) => ({ path: p, signedUrl: `S:${p}` })), error: null });
    const rows = Array.from({ length: 250 }, (_, i) => ({ photo_url: `u/${i}.jpg` }));
    const r = await m.signPhotos(rows, sign);
    return JSON.stringify(calls) === '[100,100,50]' && r.every((x, i) => x.signedUrl === `S:u/${i}.jpg`);
  }],
  ['giữ đúng thứ tự và mọi trường của dòng', async (m) => {
    const sign = async (paths) => ({ data: [...paths].reverse().map((p) => ({ path: p, signedUrl: `S:${p}` })), error: null });
    const r = await m.signPhotos([{ id: 1, photo_url: 'u/1' }, { id: 2, photo_url: 'u/2' }], sign);
    return r.map((x) => `${x.id}:${x.signedUrl}`).join(',') === '1:S:u/1,2:S:u/2';
  }],
  ['ký hỏng (lỗi, hay ném): ô vẫn còn, signedUrl là đường dẫn — không ném', async (m) => {
    const a = await m.signPhotos([{ photo_url: 'u/1' }], async () => ({ data: null, error: new Error('x') }));
    const b = await m.signPhotos([{ photo_url: 'u/1' }], async () => { throw new Error('boom'); });
    return a[0].signedUrl === 'u/1' && b[0].signedUrl === 'u/1';
  }],
  ['một ảnh không ký được giữa loạt: chỉ ảnh ấy rơi về đường dẫn', async (m) => {
    const sign = async (paths) => ({ data: paths.map((p) => ({ path: p, signedUrl: p === 'u/2' ? null : `S:${p}` })), error: null });
    const r = await m.signPhotos([{ photo_url: 'u/1' }, { photo_url: 'u/2' }], sign);
    return r[0].signedUrl === 'S:u/1' && r[1].signedUrl === 'u/2';
  }],
];
const PHOTO_MUTANTS = [
  ['ký cả URL http', /\.filter\(\(p\) => !p\.startsWith\('http'\)\)/, ''],
  ['một lần ký NÉM làm ném cả thư viện', /catch \{/, 'catch (e) { throw e;'],
  ['bỏ chia loạt', /paths\.slice\(i, i \+ chunk\)/, 'paths'],
];
{
  const out2 = mkdtempSync(path.join(tmpdir(), 'photo-urls-'));
  try {
    execFileSync('npx', ['tsc', 'src/lib/photo-urls.ts', '--ignoreConfig', '--outDir', out2,
      '--module', 'commonjs', '--target', 'es2020', '--skipLibCheck'],
    { cwd: NATIVE, stdio: ['ignore', 'pipe', 'pipe'] });
    const compiled = readFileSync(path.join(out2, 'photo-urls.js'), 'utf8');
    let k = 0;
    const load = (src) => {
      const f = path.join(out2, `p${k++}.js`);
      writeFileSync(f, src);
      return createRequire(import.meta.url)(f);
    };
    const runPhoto = async (m) => {
      const bad = [];
      for (const [name, fn] of PHOTO_CASES) {
        try {
          if (!(await fn(m))) bad.push(name);
        } catch {
          bad.push(name);
        }
      }
      return bad;
    };
    problems.push(...(await runPhoto(load(compiled))).map((x) => `ảnh tiến trình: ${x}`));
    for (const [name, re, to] of PHOTO_MUTANTS) {
      if (!re.test(compiled)) fatal(`bản hỏng "${name}": không tìm thấy chỗ để sửa (${re})`);
      if (!(await runPhoto(load(compiled.replace(re, to)))).length) fatal(`bản hỏng "${name}" vẫn qua hết các ca`);
    }
  } finally {
    rmSync(out2, { recursive: true, force: true });
  }
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
const photosSrc = readFileSync(path.join(NATIVE, 'src/hooks/use-progress-photos.ts'), 'utf8');
const pi = photosSrc.indexOf('export function useProgressPhotos(');
const photos = pi < 0 ? '' : photosSrc.slice(pi, photosSrc.indexOf('\n}\n', pi));
if (!photos) problems.push('không thấy `export function useProgressPhotos(` trong use-progress-photos.ts');
else {
  if (!/readAllPages\(/.test(photos)) problems.push('useProgressPhotos không đọc qua readAllPages — ảnh cũ nhất lại rơi khỏi thư viện (#179)');
  if (!/\.order\('date', \{ ascending: false \}\)\s*\.order\('id', \{ ascending: false \}\)\s*\.range\(from, to\)/.test(photos)) problems.push('useProgressPhotos không đọc theo thứ tự toàn phần (date, id) bằng .range — nhiều ảnh cùng ngày thì trang sau lặp hay bỏ ảnh');
  if (/\.limit\(/.test(photos)) problems.push('useProgressPhotos còn `.limit(` (#179)');
  if (!/signPhotos\(rows, \(paths\) => supabase\.storage\.from\(BUCKET\)\.createSignedUrls\(paths, 3600\)\)/.test(photos)) problems.push('useProgressPhotos không ký cả loạt qua signPhotos/createSignedUrls — một request cho mỗi ảnh');
  if (/createSignedUrl\(/.test(photos)) problems.push('useProgressPhotos còn ký từng ảnh (`createSignedUrl(`)');
}

/* #196 · #197: hai lượt đọc nữa từng "cắt rồi mới sắp" / cắt không thứ tự. */
/* Bỏ chú thích trước khi xét: chú thích ghi lại chính bản cũ ("`.limit(90)`"). */
const noComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const cut = (file, start) => {
  const src = noComments(readFileSync(path.join(NATIVE, file), 'utf8'));
  const i = src.indexOf(start);
  if (i < 0) return null;
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j < 0 ? undefined : j);
};
const meas = cut('src/hooks/use-fitness-data.ts', 'export function useBodyMeasurements(');
if (!meas) problems.push('không thấy `export function useBodyMeasurements(`');
else {
  if (!/readAllPages\(/.test(meas)) problems.push('useBodyMeasurements không đọc qua readAllPages — từ lần đo thứ 91, thẻ Số đo hiện số cũ như số mới nhất (#196)');
  if (/\.limit\(/.test(meas)) problems.push('useBodyMeasurements còn `.limit(` (#196)');
  if (!/\.order\('date', \{ ascending: true \}\)\s*\.order\('id', \{ ascending: true \}\)\s*\.range\(from, to\)/.test(meas)) problems.push('useBodyMeasurements không đọc cũ → mới theo (date, id) bằng .range — body-panel lấy phần tử CUỐI làm lần đo mới nhất');
}
const extras = noComments(readFileSync(path.join(NATIVE, 'src/hooks/use-extras.ts'), 'utf8'));
const wi = extras.indexOf(".from('water_logs')");
const water = wi < 0 ? '' : extras.slice(extras.lastIndexOf('readAllPages(', wi) >= 0 && wi - extras.lastIndexOf('readAllPages(', wi) < 200 ? extras.lastIndexOf('readAllPages(', wi) : wi, extras.indexOf('),', wi) + 2);
if (!water) problems.push("không thấy lượt đọc `water_logs` của nguồn huy chương");
else {
  if (!/^readAllPages\(/.test(water)) problems.push('nguồn huy chương nước không đọc hết qua readAllPages — uống 8 cốc/ngày thì mốc 100 ngày không bao giờ tới (#197)');
  if (/\.limit\(/.test(extras.slice(wi, wi + 400))) problems.push('nguồn huy chương nước còn `.limit(` (#197)');
}

if (problems.length) {
  console.error('đọc hết theo trang CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `đọc hết theo trang OK — ${CASES.length} ca CHẠY THẬT lib/read-all.ts: số dòng chia hết và không chia hết, rỗng, trang giữa ` +
    'hỏng thì ném (không trả một phần), vượt trần thì ném (không cắt lặng lẽ), và đi hết 1 234 món nhiều tên trùng trên máy chủ ' +
    `giả theo (name, id) — đủ, đúng thứ tự. ${MUTANTS.length} bản hỏng (trang đầy coi là hết, bỏ qua lỗi, vượt trần trả một phần, ` +
    'hai trang chồng nhau) đều bị bắt. useMyFoods (#180), useProgressPhotos (#179), useBodyMeasurements (#196) và nguồn huy chương nước (#197) đọc hết qua nó, không còn .limit. ' +
    `Ảnh tiến trình ký cả loạt: ${PHOTO_CASES.length} ca chạy thật signPhotos (http đi thẳng, loạt 100, giữ thứ tự, ký hỏng thì ô còn), ` +
    `${PHOTO_MUTANTS.length} bản hỏng bị bắt`,
);
