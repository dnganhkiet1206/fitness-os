/**
 * Hàm được gọi TỪ TRONG một worklet phải là worklet — nếu không app THOÁT.
 *
 *     node tools/worklet-callable.mjs
 *
 * ── lỗi nó sinh ra để chặn, đọc từ một tệp `.ips` thật ──
 *
 * Chủ dự án gửi hai báo cáo sự cố cách nhau 20 giây (2026-09-14 23:30) kèm câu
 * "khi log thì app bị crash". Chữ ký:
 *
 *     SIGABRT · Abort trap: 6 · luồng chính
 *     RCTMountingManager performTransaction
 *       → LayoutAnimationsProxy_Legacy::startEnteringAnimation
 *       → LayoutAnimationsManager::startLayoutAnimation
 *       → jsi::Function::call
 *       → HermesRuntimeImpl::throwPendingError → __cxa_throw → std::terminate
 *
 * Tức một lỗi JavaScript ném ra trong lúc chạy animation VÀO-CÂY, trên luồng
 * UI. React Native không bắt được lỗi ở đó: không có màn đỏ, không có log —
 * tiến trình bị `abort()`.
 *
 * Nguyên nhân: `08be858` đổi animation vào-cây của thanh toast thành một
 * worklet tự viết (`riseIn`) và trong đó gọi `spring()` từ `constants/motion`,
 * một hàm KHÔNG có chỉ thị `'worklet'`. Toast hiện mỗi lần ghi xong một thứ,
 * nên triệu chứng đọc ra là "cứ log là thoát".
 *
 * ── vì sao không luật nào có sẵn bắt được ──
 *
 *   `tsc`               hợp lệ hoàn toàn: đây là một lời gọi hàm đúng kiểu
 *   ESLint              không biết `'worklet'` nghĩa là gì
 *   `tools/motion.mjs`  canh NHỊP và vòng lặp, không canh ai gọi được ai
 *   `live.mjs`          Reanimated bản web không có luồng UI riêng, nên lời
 *                       gọi ấy chạy bình thường và không có gì đỏ
 *
 * Chỉ máy thật mới nổ, và nó nổ bằng cách thoát hẳn — dạng lỗi đắt nhất để tìm.
 *
 * ── luật đọc gì ──
 *
 * Với mỗi thân worklet, lấy mọi lời gọi `tên(` mà `tên` được nhập từ một module
 * `@/` của chính app, rồi mở module ấy ra xem hàm được export có mang
 * `'worklet'` không. Hàm của thư viện ngoài (`withTiming`, `withSpring`…) không
 * bị hỏi: Reanimated tự lo phần của nó.
 *
 * ── và "thân worklet" là HAI thứ, không phải một ──
 *
 * Bản đầu chỉ đọc thân hàm có chỉ thị `'worklet';` viết tay. Nó bỏ sót cả một
 * họ, và lỗ ấy đã cho một crash thứ hai đi qua (2026-09-17, `swipe-row.tsx`):
 *
 *     [Worklets] Tried to synchronously call a Remote Function.
 *     Called "alpha" on the UI Runtime.
 *
 * Callback truyền cho `useAnimatedStyle` và họ hàng của nó KHÔNG có chữ
 * `'worklet'` nào — plugin babel của Reanimated tự biến chúng thành worklet lúc
 * dựng. Nên với luật cũ chúng vô hình, trong khi chúng đúng là nơi phần lớn mã
 * UI-thread của app này sống.
 *
 * `HOOKS` bên dưới là danh sách các hàm nhận callback được tự-worklet-hoá. Đây
 * là một DANH SÁCH CHỐT, không phải một phép suy: một hook mới của Reanimated
 * sẽ không tự có mặt, và đó là chỗ mù còn lại — ghi ra để người sau biết phải
 * thêm tay.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');

const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
};

/** Thân của mỗi hàm chứa `'worklet';`, cắt bằng ĐẾM NGOẶC chứ không bằng regex. */
export function workletBodies(src) {
  const out = [];
  for (const m of src.matchAll(/'worklet';/g)) {
    /* lùi về `{` mở thân hàm: bỏ qua mọi cặp ngoặc đã đóng trên đường lùi */
    let depth = 0;
    let i = m.index;
    while (i > 0) {
      const ch = src[i];
      if (ch === '}') depth++;
      else if (ch === '{') {
        if (depth === 0) break;
        depth--;
      }
      i--;
    }
    let d = 0;
    let k = i;
    while (k < src.length) {
      if (src[k] === '{') d++;
      else if (src[k] === '}') {
        d--;
        if (d === 0) break;
      }
      k++;
    }
    out.push(src.slice(i, k));
  }
  return out;
}

/**
 * Những hàm mà ĐỐI SỐ CALLBACK của chúng được plugin babel tự biến thành
 * worklet. Không cái nào cần chữ `'worklet'` trong mã nguồn.
 *
 * Danh sách chốt: một hook mới của Reanimated không tự có mặt ở đây.
 */
const HOOKS = [
  'useAnimatedStyle',
  'useAnimatedProps',
  'useDerivedValue',
  'useAnimatedReaction',
  'useAnimatedScrollHandler',
  'useFrameCallback',
  'runOnUI',
];

/** Thân các callback tự-worklet-hoá: `useAnimatedStyle(() => { … })` và họ. */
export function autoWorkletBodies(src) {
  const out = [];
  for (const hook of HOOKS) {
    for (const m of src.matchAll(new RegExp(`\\b${hook}\\s*\\(`, 'g'))) {
      /* Cắt TRỌN lời gọi bằng đếm ngoặc, rồi giữ cả phần trong — với
         `useAnimatedReaction` thì cả hai callback đều là worklet, nên lấy cả
         lời gọi là đúng chứ không phải lười. */
      let d = 0;
      let k = m.index + m[0].length - 1;
      const start = k;
      while (k < src.length) {
        if (src[k] === '(') d++;
        else if (src[k] === ')') {
          d--;
          if (d === 0) break;
        }
        k++;
      }
      out.push(src.slice(start, k + 1));
    }
  }
  return out;
}

/** Tên export của một module có mang `'worklet'` trong thân nó. */
export function exportedWorklets(src) {
  const names = new Set();
  for (const m of src.matchAll(/export (?:const|function) (\w+)/g)) {
    /* 400 ký tự là đủ để qua chữ ký và tới dòng đầu của thân — chỉ thị
       `'worklet'` theo quy ước luôn là câu lệnh ĐẦU TIÊN. */
    if (src.slice(m.index, m.index + 400).includes("'worklet'")) names.add(m[1]);
  }
  return names;
}

const problems = [];
let worklets = 0;
let handWritten = 0;
let autoMade = 0;
let checked = 0;
const cache = new Map();
const moduleSource = (rel) => {
  if (cache.has(rel)) return cache.get(rel);
  let found = null;
  for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
    try {
      found = readFileSync(path.join(NATIVE, rel + ext), 'utf8');
      break;
    } catch {
      /* thử phần mở rộng tiếp theo */
    }
  }
  cache.set(rel, found);
  return found;
};

for (const file of walk(SRC)) {
  const src = readFileSync(file, 'utf8');
  if (!src.includes("'worklet'") && !HOOKS.some((h) => src.includes(h + '('))) continue;
  const rel = path.relative(NATIVE, file);

  const imported = new Map();
  for (const m of src.matchAll(/import \{([^}]*)\} from '(@\/[^']+)';/g)) {
    for (const raw of m[1].split(',')) {
      const name = raw.trim().replace(/^type\s+/, '').split(/\s+as\s+/)[0].trim();
      if (name && !raw.trim().startsWith('type ')) imported.set(name, m[2]);
    }
  }

  const hand = workletBodies(src);
  const auto = autoWorkletBodies(src);
  handWritten += hand.length;
  autoMade += auto.length;
  for (const body of [...hand, ...auto]) {
    worklets++;
    for (const call of new Set([...body.matchAll(/\b([A-Za-z_$][\w$]*)\s*\(/g)].map((m) => m[1]))) {
      const from = imported.get(call);
      if (!from) continue;
      const modSrc = moduleSource(from.replace('@/', 'src/'));
      if (modSrc == null) continue;
      checked++;
      if (!exportedWorklets(modSrc).has(call)) {
        problems.push(
          `${rel}: một worklet gọi \`${call}()\` nhập từ \`${from}\`, mà hàm ấy không có chỉ thị ` +
            "`'worklet'`. Trên luồng UI đó là một Remote Function: Worklets ném thẳng (\"Tried to " +
            'synchronously call a Remote Function\"), hoặc tiến trình bị abort không màn đỏ không log — ' +
            'hai `.ips` ngày 2026-09-14 và cú crash `alpha` ngày 2026-09-17 đều là hình này',
        );
      }
    }
  }
}

/* ── tiền đề được CHẠY: phép cắt thân hàm phải thật sự cắt đúng ──
   Nếu `workletBodies` trả về rỗng thì mọi luật trên im lặng và luật này đọc ra
   là xanh trong khi nó không kiểm gì cả. */
{
  const probe = `
    const a = () => { 'worklet'; return helper(1); };
    function b() { const x = { k: 1 }; return x; }
  `;
  const got = workletBodies(probe);
  if (got.length !== 1 || !got[0].includes('helper(1)')) {
    problems.push(`tự kiểm hỏng — phép cắt thân worklet trả về ${got.length} khối, đáng lẽ 1 khối có \`helper(1)\``);
  }
  if (!exportedWorklets("export function f() { 'worklet'; }").has('f')) {
    problems.push('tự kiểm hỏng — không nhận ra một export có `\'worklet\'`');
  }
  if (exportedWorklets('export function g() { return 1; }').has('g')) {
    problems.push('tự kiểm hỏng — nhận nhầm một export KHÔNG có `\'worklet\'`');
  }
}

if (problems.length) {
  console.log('hàm gọi được từ worklet CÓ LỖI:\n');
  for (const p of problems.slice(0, 12)) console.log(`  • ${p}`);
  process.exit(1);
}

console.log(
  `hàm gọi được từ worklet OK — soi ${worklets} thân worklet trên toàn bộ src: ${handWritten} viết tay ` +
    `(có chỉ thị \`'worklet';\`) và ${autoMade} được plugin babel tự worklet-hoá — callback của ` +
    `\`useAnimatedStyle\` và họ, thứ KHÔNG mang chữ 'worklet' nào. Nhóm thứ hai từng vô hình với luật này, ` +
    `và lỗ ấy đã cho một crash đi qua: \`alpha()\` gọi trong thân \`useAnimatedStyle\` của swipe-row ` +
    `(2026-09-17) — "Tried to synchronously call a Remote Function". Trong số đó ` +
    `${checked} lời gọi trong đó trỏ tới một hàm của chính app; mỗi hàm ấy đều mang chỉ thị. Luật này ` +
    'có vì một lời gọi như thế KHÔNG hỏng ở đâu khác: `tsc` thấy đúng kiểu, ESLint không biết ' +
    "`'worklet'` là gì, `motion.mjs` chỉ canh nhịp, và Reanimated bản web không có luồng UI riêng nên " +
    '`live.mjs` chạy qua bình thường. Chỉ máy thật nổ, và nó nổ bằng `abort()` giữa một animation ' +
    'vào-cây — hai tệp `.ips` ngày 2026-09-14 là cái giá đã trả. Phép cắt thân hàm tự kiểm bằng ba ca ' +
    'chạy thật, nên một luật im lặng vì không cắt được gì sẽ đỏ thay vì xanh',
);
