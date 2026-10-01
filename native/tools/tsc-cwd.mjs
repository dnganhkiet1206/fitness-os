/**
 * Mọi bước kiểm gọi `npx tsc` phải gọi nó TỪ `native/` (`cwd: NATIVE`).
 *
 * ── lỗi này có hình dạng gì ──
 *
 * `npx tsc` tìm `tsc` trong `node_modules/.bin` đi NGƯỢC lên từ thư mục đang
 * chạy. Từ một thư mục tạm (`/tmp/…`) thì không có `node_modules` nào trên
 * đường ấy, và điều xảy ra tiếp theo tuỳ MÁY:
 *
 *   - máy có TypeScript cài toàn cục (môi trường của các agent ở đây: npm prefix
 *     `/opt/node22`) → npx dùng bản toàn cục, bước kiểm xanh;
 *   - máy CI (`setup-node`, không có gói toàn cục nào) → npx tải gói tên `tsc`
 *     từ npm. Đó là `tsc@2.0.4`, một gói đã khai tử, chỉ in một câu rồi thoát —
 *     không phát ra tệp nào.
 *
 * Ba bước (`claim-window`, `web-alert`, `plural-copy`) viết đúng lối ấy, và cả
 * ba nuốt lỗi của tsc bằng một `catch {}` rỗng ("bản phát ra mới là thứ cần").
 * Nên CI chỉ nói "Cannot find module /tmp/…/x.js", và cổng ĐỎ trên CI từ run
 * 241 (25/09, commit thêm `claim-window`) tới 01/10 trong khi cổng chạy ở máy
 * vẫn báo 296/296 — đúng loại lỗi mà một con số xanh ở máy không bao giờ thấy.
 * Hermes (agent kiểm của chủ dự án) tìm ra; tái hiện ở máy bằng một npm prefix
 * và cache rỗng.
 *
 * ── bước này đòi gì ──
 *
 * Mỗi lời gọi `execFileSync('npx', ['tsc', …])` (và mọi dạng chuỗi `npx tsc`
 * trong execSync/spawn) ở `tools/*.mjs` phải mang `cwd: NATIVE`. Tệp vào nằm ở
 * thư mục tạm thì truyền đường dẫn tuyệt đối kèm `--outDir`, như ~130 lời gọi
 * khác vẫn làm. Là luật TĨNH, nên nó đỏ ở máy, không chờ CI.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

/** Bóc comment mà giữ nguyên số dòng. */
const strip = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Thân của lời gọi bắt đầu ở `open` (chỉ số của `(`), tới `)` khớp nó. */
function callAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/** Mọi lời gọi tiến trình con chạy `npx tsc` mà KHÔNG mang `cwd: NATIVE`. */
export function badCalls(src) {
  const code = strip(src);
  const out = [];
  for (const m of code.matchAll(/\b(execFileSync|execSync|spawnSync|execFile|spawn|exec)\s*\(/g)) {
    const call = callAt(code, m.index + m[0].length - 1);
    const runsTsc = /^\(\s*'npx'\s*,\s*\[\s*'tsc'/.test(call) || /^\(\s*[`'"]npx\s+tsc\b/.test(call);
    if (!runsTsc) continue;
    if (!/\bcwd:\s*NATIVE\b/.test(call)) out.push(code.slice(0, m.index).split('\n').length);
  }
  return out;
}

const problems = [];

/* ── tự kiểm: luật biết đỏ, và không kêu oan ── */
{
  const cases = [
    ["execFileSync('npx', ['tsc', 'a.ts'], { cwd: dir });", 1, 'cwd thư mục tạm'],
    ["execFileSync('npx', ['tsc', 'a.ts', '--outDir', out]);", 1, 'không có cwd'],
    ["execSync(`npx tsc ${f}`, { cwd: out });", 1, 'dạng chuỗi'],
    ["execFileSync('npx', ['tsc', path.join(out, 'a.ts'), '--outDir', out], { cwd: NATIVE, stdio: 'pipe' });", 0, 'đúng lối'],
    ["execFileSync('npx',\n  ['tsc', 'src/a.ts',\n   '--outDir', out],\n  { cwd: NATIVE });", 0, 'nhiều dòng'],
    ["execFileSync('npx', ['playwright', 'x'], { cwd: dir });", 0, 'không phải tsc'],
    ["/* execFileSync('npx', ['tsc'], { cwd: dir }) */", 0, 'trong chú thích'],
  ];
  for (const [src, want, label] of cases) {
    const got = badCalls(src).length;
    if (got !== want) problems.push(`tự kiểm (${label}): ra ${got} lời gọi sai, phải ${want}`);
  }
}

/* ── trên mã thật ── */
let calls = 0;
const files = readdirSync(TOOLS).filter((f) => f.endsWith('.mjs') && f !== SELF).sort();
for (const f of files) {
  const src = readFileSync(path.join(TOOLS, f), 'utf8');
  calls += (strip(src).match(/'npx'\s*,\s*\[\s*'tsc'|[`'"]npx\s+tsc\b/g) ?? []).length;
  for (const line of badCalls(src)) {
    problems.push(`tools/${f}:${line}: \`npx tsc\` không chạy từ native/ — trên CI nó tải gói giả tsc@2.0.4; dùng cwd: NATIVE, đường dẫn tuyệt đối và --outDir`);
  }
}
if (calls < 100) problems.push(`tự kiểm: chỉ thấy ${calls} lời gọi npx tsc trong tools/ — bộ quét đã mù?`);

if (problems.length) {
  console.error(`tsc của dự án HỎNG\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log(
  `tsc của dự án OK — ${calls} lời gọi \`npx tsc\` trong tools/ đều chạy từ native/ (cwd: NATIVE), nên dùng TypeScript ` +
    'của dự án ở mọi máy. Từ một thư mục tạm, npx ở máy có TypeScript toàn cục vẫn chạy được, còn trên CI nó tải gói giả ' +
    'tsc@2.0.4 — cổng đỏ ở CI từ 25/09 tới 01/10 mà ở máy vẫn xanh. Tự kiểm 7 ca: cwd tạm, thiếu cwd, dạng chuỗi đều đỏ; ' +
    'đúng lối, nhiều dòng, lệnh khác, trong chú thích đều xanh',
);
