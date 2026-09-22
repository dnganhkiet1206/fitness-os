/**
 * Hai màn onboarding đi qua nhau theo MỘT luật, và luật ấy có một chủ.
 *
 * ── điều đã xảy ra, hai lần ──
 *
 * ① Luồng mười ba màn ra đời mà không chỗ nào SỞ HỮU câu hỏi *"hai màn này đi
 *    qua nhau thế nào"*. Kết quả: màn 13 không có chuyển cảnh nào cả, và cây
 *    thước — cùng một dụng cụ hỏi hai câu ở màn 07 và 08 — tự dựng lại từ đầu
 *    mỗi lần, tức màn hình nói rằng đây là hai nơi khác nhau.
 *
 * ② Bản chuyển cảnh đầu tiên dùng `entering`/`exiting` tự viết. Reanimated BỎ
 *    chúng, im lặng, kèm một dòng console không ai đọc:
 *
 *        Couldn't load entering/exiting animation. Current version supports
 *        only predefined animations with modifiers: duration, delay, easing…
 *
 *    Đo ra: dịch 0 ở mọi mẫu, mọi màn. Cái chuyển cảnh ấy chưa từng chạy một
 *    khung nào, và không gì trong kho nói cho người viết biết điều đó.
 *
 * `constants/onboarding-motion.ts` ra đời để làm chủ câu hỏi ①. Nhưng một tệp
 * tự xưng là nguồn chân lý duy nhất mà không có luật đỡ thì chỉ là một tệp:
 * `withTiming(1, { duration: duration.swap, easing: Easing.linear })` viết
 * thẳng trong component vẫn hợp lệ với `tools/motion.mjs` — nó dùng đúng một
 * nhịp có tên — trong khi nó vừa đi vòng qua đúng cái tệp ấy.
 *
 * ── bốn điều được canh ──
 *
 * 1. MỘT giá trị tiến độ. Đúng một `withTiming` trong hook: hai tấm đọc cùng
 *    một con số nên chúng KHÔNG THỂ lệch pha, vì không có pha thứ hai. Thêm
 *    một `withTiming` nữa là dựng ra cái pha ấy.
 * 2. Số trần. Trong đường chuyển cảnh chỉ `0` và `1` được viết thẳng — hai đầu
 *    của một giá trị tiến độ và hai chiều của một trục. Mọi con số khác phải
 *    mang tên và ở trong `onboarding-motion.ts`.
 * 3. Bộ chuyển mờ CHÍNH LÀ bộ có thước. Màn nào dựng cây thước thì màn ấy
 *    chuyển mờ; đó là một phát biểu về CÙNG một tập hợp, không phải hai danh
 *    sách tình cờ trùng nhau. Thêm một màn thước thứ ba mà quên vế kia thì cây
 *    thước trượt ngang — đúng lỗi ① ở trên, quay lại.
 * 4. Không hiệu ứng layout tự viết. Một hàm trả về `{ initialValues, animations }`
 *    là đúng cái hình dạng runtime vứt đi. Luật tìm hình dạng ấy, không tìm
 *    một cái tên.
 *
 * Luật KHÔNG nói gì về đường cong hay con số cụ thể: 0,3 và `out(cubic)` là
 * những thứ đã đo và có thể đo lại thành số khác. Nó chỉ nói rằng bất kể con
 * số là gì, chỉ có MỘT chỗ được viết ra nó.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(NATIVE, p), 'utf8');

const HOOK = 'src/hooks/use-stage-motion.ts';
const FLOW = 'src/components/ascnd/onboarding-flow.tsx';
const OWNER = 'src/constants/onboarding-motion.ts';

const hook = read(HOOK);
const flow = read(FLOW);
const owner = read(OWNER);

/** Bỏ chú thích và chuỗi trước khi đi tìm số — một con số trong một câu giải
    thích là một câu giải thích. */
const bare = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');

const problems = [];

/* ── 1 · một giá trị tiến độ ── */
const timings = [...bare(hook).matchAll(/\bwithTiming\s*\(/g)].length;
if (timings !== 1) {
  problems.push(
    `hook chuyển cảnh có ${timings} lượt \`withTiming\` — phải đúng 1. Hai tấm đọc CÙNG một giá trị ` +
      'tiến độ là điều làm chúng không thể lệch pha; một lượt chạy thứ hai dựng ra đúng cái pha ấy',
  );
}

/* ── 2 · số trần ── */
const nums = [...new Set([...bare(hook).matchAll(/(?<![\w.$])(\d+(?:\.\d+)?)/g)].map((m) => m[1]))].filter(
  (n) => n !== '0' && n !== '1',
);
if (nums.length) {
  problems.push(
    `số viết thẳng trong đường chuyển cảnh: ${nums.join(', ')} — chỉ \`0\` và \`1\` được phép ` +
      `(hai đầu của tiến độ, hai chiều của trục). Mọi con số khác phải mang tên trong ${path.basename(OWNER)}`,
  );
}

/* Và cái tệp chủ phải thật sự là chủ: nó phải xuất ra thứ hook đang nhập. */
const imported = hook.match(/import\s*\{([^}]*)\}\s*from\s*'@\/constants\/onboarding-motion'/);
if (!imported) {
  problems.push(`hook chuyển cảnh không còn nhập gì từ ${path.basename(OWNER)} — nguồn chân lý đã mất chỗ dùng`);
} else {
  for (const name of imported[1].split(',').map((s) => s.trim()).filter(Boolean)) {
    if (!new RegExp(`export const ${name}\\b`).test(owner)) {
      problems.push(`hook nhập \`${name}\` nhưng ${path.basename(OWNER)} không xuất ra nó`);
    }
  }
}

/* ── 3 · bộ chuyển mờ chính là bộ có thước ── */
const crossLine = flow.match(/crossSV\.value\s*=([^\n;]*)/);
const sameLine = flow.match(/const\s+sameTool\s*=([^\n;]*)/);
if (!crossLine || !sameLine) {
  problems.push('không tìm thấy chỗ đặt `crossSV` hoặc `sameTool` — hệ chuyển cảnh đã đổi hình, đọc lại luật này');
} else {
  const setIn = (s) => [...new Set([...s.matchAll(/([A-Z][A-Z0-9_]*)\s*\.has\s*\(/g)].map((m) => m[1]))];
  const a = setIn(crossLine[1]);
  const b = setIn(sameLine[1]);
  if (a.length !== 1 || b.length !== 1 || a[0] !== b[0]) {
    problems.push(
      `cú chuyển mờ hỏi \`${a.join('/') || '—'}\` còn hiệu ứng vào của thước hỏi \`${b.join('/') || '—'}\` — ` +
        'phải là CÙNG một tập hợp, nếu không một màn thước mới sẽ trượt ngang thay vì đứng yên',
    );
  } else {
    const name = a[0];
    const decl = flow.match(new RegExp(`${name}[^=]*=\\s*new Set\\(\\[([^\\]]*)\\]`));
    if (!decl) {
      problems.push(`\`${name}\` không còn là một \`new Set([...])\` đọc được — luật này không đo được nữa`);
    } else {
      const declared = [...decl[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
      /* Màn nào THẬT SỰ dựng cây thước: cắt thân render theo từng nhánh `k === '…'`. */
      const drawn = [];
      const parts = flow.split(/\{k === '/).slice(1);
      for (const p of parts) {
        const key = p.slice(0, p.indexOf("'"));
        const span = p.slice(0, p.length);
        const next = span.search(/\n\s*\{k === '/);
        if ((next === -1 ? span : span.slice(0, next)).includes('strip={RulerStrip}')) drawn.push(key);
      }
      drawn.sort();
      if (declared.join(',') !== drawn.join(',')) {
        problems.push(
          `\`${name}\` ghi [${declared.join(', ')}] nhưng màn thật sự dựng cây thước là [${drawn.join(', ')}] — ` +
            'một màn dựng thước mà không nằm trong bộ sẽ trượt ngang; một màn nằm trong bộ mà không dựng ' +
            'thước sẽ chuyển mờ mà chẳng có gì chung để giữ liền',
        );
      }
    }
  }
}

/* ── 4 · không hiệu ứng layout tự viết ── */
for (const [p, text] of [
  [HOOK, hook],
  [FLOW, flow],
  ['src/components/ascnd/onboarding/onboarding-screen.tsx', read('src/components/ascnd/onboarding/onboarding-screen.tsx')],
]) {
  const b = bare(text);
  if (/initialValues\s*:/.test(b) && /animations\s*:/.test(b)) {
    problems.push(
      `${path.basename(p)} dựng một hiệu ứng layout TỰ VIẾT (\`initialValues\` + \`animations\`) — ` +
        'runtime bỏ nó đi và chỉ in một dòng console: nó sẽ không chạy một khung nào',
    );
  }
}

if (problems.length) {
  console.error('chuyển cảnh onboarding CÓ LỖI:');
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

const owned = [...owner.matchAll(/export const ([A-Z][A-Z0-9_]*)/g)].map((m) => m[1]);
console.log(
  `chuyển cảnh onboarding OK — một giá trị tiến độ (đúng 1 \`withTiming\`) nuôi cả hai tấm, nên chúng không ` +
    `lệch pha được; trong đường chuyển cảnh chỉ \`0\` và \`1\` được viết thẳng và ${owned.length} hằng số còn lại ` +
    `mang tên trong onboarding-motion.ts (${owned.join(', ')}); bộ màn chuyển mờ và bộ màn dựng cây thước được ` +
    `đọc ra từ HAI chỗ khác nhau — khai báo và JSX thật — rồi so nhau, nên thêm một màn thước mà quên cú chuyển ` +
    `mờ sẽ đỏ; và không tệp nào dựng hiệu ứng layout tự viết, thứ runtime vứt đi trong im lặng`,
);
