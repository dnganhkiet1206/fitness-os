/**
 * Số ngày lịch chỉ được tính ở MỘT nơi: `lib/local-date.ts` (`dayGap`, `shiftLocalDate`).
 *
 *     node tools/day-math.mjs
 *
 * ── vì sao (#34) ──
 *
 * Ở #29, cổng "tầng import" bắt được `daysUntil` trong `challenge-hero.tsx` —
 * một bản CHÉP của `dayGap`. Bản ấy tình cờ đúng (cùng `Math.round`). Nhưng một
 * ngày địa phương không phải lúc nào cũng dài 86 400 000 ms: hai ngày đổi giờ
 * dài 23 và 25 giờ, nên phép chia ngây thơ ra 0,958 và 1,042, và `Math.floor`
 * biến cái đầu thành 0 — lệch một ngày, đúng hai lần mỗi năm, vào đúng hai ngày
 * không test nào chạy tới. Soát lần đầu tìm ra ĐÚNG lỗi ấy ở `exercise-trend.ts`
 * (`Math.floor` trên hai nửa đêm địa phương), cùng năm bản chép khác.
 *
 * ── luật ──
 *
 * Ngoài `lib/local-date.ts`, không tệp nào trong `src/` được CHIA cho độ dài
 * một ngày — `86400000`, `86_400_000`, `864e5`, tích `1000·60·60·24` theo bất kỳ
 * thứ tự nào, hay một hằng số mang tên được gán giá trị ấy trong cùng tệp. Nhân
 * hay trừ (`Date.now() - 30 * 86_400_000`, `gcTime`) là THỜI LƯỢNG, không phải
 * đếm ngày, nên không bị hỏi.
 *
 * Chú thích và chuỗi được bỏ trước khi quét: một câu giải thích "(b - a) /
 * 86400000 là sai" không phải một phép tính.
 *
 * Chỗ hợp lệ (đo thời lượng thật, hay số thứ tự ngày trên nửa đêm UTC — nơi
 * không có đổi giờ) nằm trong `EXEMPT`, MỖI chỗ một lý do. Một mục miễn trừ
 * không còn khớp gì là mồ côi, và bị báo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(NATIVE, 'src');
const HOME = 'lib/local-date.ts';

/** [tệp (so với src/), đoạn mã có mặt trên dòng bị bắt, lý do] */
const EXEMPT = [
  ['components/ascnd/studio/window.tsx', 'NEW_MOON = Date.UTC(2000, 0, 6, 18, 14) / 86400000',
    'pha mặt trăng: số ngày THIÊN VĂN có phần lẻ kể từ một kỳ trăng non, không phải ngày lịch'],
  ['components/ascnd/studio/window.tsx', 'at.getTime() / 86400000 - NEW_MOON',
    'pha mặt trăng: cùng phép đo thiên văn, phần lẻ là thứ nó cần'],
  ['lib/adaptive-tdee.ts', 'Math.floor(Date.parse(`${iso}T00:00:00Z`) / 86_400_000)',
    'số thứ tự ngày trên nửa đêm UTC của một chuỗi YYYY-MM-DD — UTC không đổi giờ, nên phép chia là chính xác'],
  ['lib/training-card.ts', 'Math.ceil((now.getTime() - oldest) / 86_400_000) + 1',
    'độ dài lịch sử tính bằng THỜI LƯỢNG (ceil của số giờ). Đổi sang ngày lịch là đổi kết quả (01:00 hôm qua → 23:00 hôm nay: 3 thay vì 2) — một quyết định sản phẩm, chưa ai ra (#34)'],
];

/* ── bỏ chú thích và chuỗi (giữ nguyên số dòng) ── */
export function stripCode(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') {
      const j = src.indexOf('\n', i);
      const end = j < 0 ? n : j;
      out += blank(src.slice(i, end));
      i = end;
    } else if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      out += blank(src.slice(i, end));
      i = end;
    } else if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && src[j] !== c) {
        if (src[j] === '\\') j++;
        else if (c === '`' && src[j] === '$' && src[j + 1] === '{') {
          /* giữ nguyên biểu thức trong template: nó là mã */
          let depth = 1;
          out += blank(src.slice(i, j)) + '${';
          i = j + 2;
          j = i;
          while (j < n && depth) {
            if (src[j] === '{') depth++;
            else if (src[j] === '}') depth--;
            j++;
          }
          out += stripCode(src.slice(i, j - 1)) + '}';
          i = j;
          j = i - 1;
        }
        j++;
      }
      out += blank(src.slice(i, j + 1));
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const NUM = String.raw`(?:86_?400_?000|864e5|86400e3|8\.64e7)`;
/* tích của các thừa số mà giá trị bằng 86 400 000 */
function isDayProduct(expr) {
  const parts = expr.split('*').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 || !parts.every((p) => /^\d+$/.test(p))) return false;
  return parts.reduce((a, p) => a * Number(p), 1) === 86_400_000;
}

/** Mọi phép chia cho độ dài một ngày trong một mã nguồn đã bỏ chú thích/chuỗi. */
export function findDayDivisions(code) {
  const names = [...code.matchAll(new RegExp(String.raw`\b(?:const|let|var)\s+(\w+)\s*=\s*(${NUM}|[\d\s*]+)\s*[;\n]`, 'g'))]
    .filter((m) => new RegExp(`^${NUM}$`).test(m[2].trim()) || isDayProduct(m[2]))
    .map((m) => m[1]);
  const hits = [];
  const re = /\/(?![/*])\s*(\(\s*[\d\s*]+\)|[\d_.e]+|[A-Za-z_]\w*)/g;
  for (const m of code.matchAll(re)) {
    const operand = m[1].replace(/^\(|\)$/g, '').trim();
    const isDay = new RegExp(`^${NUM}$`).test(operand) || isDayProduct(operand) || names.includes(operand);
    if (!isDay) continue;
    const line = code.slice(0, m.index).split('\n').length;
    hits.push({ line, operand });
  }
  /* Chuỗi phép chia mà TÍCH các số chia là một ngày: `/ 1000 / 60 / 60 / 24`,
     `/ 3_600_000 / 24`. Phá thử đầu tiên của bước này lọt qua đúng dạng ấy. */
  for (const m of code.matchAll(/(?:\/(?![/*])\s*[\d_]+\s*){2,}/g)) {
    const nums = [...m[0].matchAll(/[\d_]+/g)].map((x) => Number(x[0].replace(/_/g, '')));
    if (nums.reduce((a, b) => a * b, 1) !== 86_400_000) continue;
    const line = code.slice(0, m.index).split('\n').length;
    if (!hits.some((h) => h.line === line)) hits.push({ line, operand: m[0].replace(/\s+/g, ' ').trim() });
  }
  return hits;
}

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = path.join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
}

const problems = [];
const used = new Set();
let scanned = 0;
let exempted = 0;
for (const file of walk(SRC)) {
  const rel = path.relative(SRC, file).split(path.sep).join('/');
  if (rel === HOME) continue;
  scanned++;
  const raw = readFileSync(file, 'utf8');
  const code = stripCode(raw);
  const rawLines = raw.split('\n');
  for (const h of findDayDivisions(code)) {
    /* phép chia xuống dòng: dòng của `/` có thể chỉ là dấu chia — lấy cả dòng trước */
    const around = rawLines.slice(Math.max(0, h.line - 3), h.line).join(' ').replace(/\s+/g, ' ');
    const ex = EXEMPT.findIndex(([f, snip]) => f === rel && around.includes(snip.replace(/\s+/g, ' ')));
    if (ex >= 0) {
      used.add(ex);
      exempted++;
      continue;
    }
    problems.push(
      `src/${rel}:${h.line} chia cho một ngày (${h.operand}) để ra số ngày — dùng \`dayGap\` / \`shiftLocalDate\` của ` +
        `\`lib/local-date.ts\` (vào hai ngày đổi giờ, phép chia ra 0,958 / 1,042). Hợp lệ thì thêm vào EXEMPT kèm lý do.`,
    );
  }
}
EXEMPT.forEach(([f, snip], i) => {
  if (!used.has(i)) problems.push(`miễn trừ mồ côi: \`src/${f}\` không còn "${snip}" — xoá mục ấy khỏi EXEMPT`);
});

/* ── tự phá thử: những thứ PHẢI bị bắt, và những thứ KHÔNG được bắt ── */
const must = [
  ['bản chép `daysUntil` gỡ ở #29', 'const daysUntil = (a, b) => Math.round((b - a) / 86_400_000);'],
  ['`Math.floor` trên nửa đêm địa phương', 'const d = Math.floor((t1 - t0) / 86400000);'],
  ['tích 1000·60·60·24 trong ngoặc', 'const d = (b - a) / (1000 * 60 * 60 * 24);'],
  ['tích đảo thứ tự', 'const d = (b - a) / (24 * 60 * 60 * 1000);'],
  ['hằng số mang tên', 'const DAY = 86_400_000;\nconst d = (b - a) / DAY;'],
  ['phép chia xuống dòng', 'const d = Math.round(\n  (b - a) /\n    864e5,\n);'],
  ['chuỗi chia / 3_600_000 / 24', 'const d = Math.ceil((b - a) / 3_600_000 / 24);'],
  ['chuỗi chia / 1000 / 60 / 60 / 24', 'const d = (b - a) / 1000 / 60 / 60 / 24;'],
];
const mustNot = [
  ['chia trong CHÚ THÍCH', '// không viết (b - a) / 86400000\nconst x = 1;'],
  ['chia trong CHUỖI', "const s = 'x / 86400000';"],
  ['nhân để ra một mốc (thời lượng)', 'const since = Date.now() - 30 * 86_400_000;'],
  ['chia cho số khác', 'const h = ms / 3_600_000;'],
  ['chuỗi chia KHÔNG ra một ngày', 'const m = ms / 1000 / 60;'],
];
for (const [label, src] of must)
  if (findDayDivisions(stripCode(src)).length === 0) problems.push(`bộ bắt đã mất răng: không bắt được ${label}`);
for (const [label, src] of mustNot)
  if (findDayDivisions(stripCode(src)).length > 0) problems.push(`bộ bắt bắt nhầm: ${label}`);

if (problems.length) {
  console.error('phép tính ngày tự chế CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `phép tính ngày tự chế OK — ${scanned} tệp trong src/ (trừ ${HOME}): không phép CHIA nào cho độ dài một ngày ngoài ` +
    `${exempted} chỗ miễn trừ, mỗi chỗ một lý do (pha mặt trăng, số thứ tự ngày trên nửa đêm UTC, một độ dài tính bằng ` +
    `thời lượng). Chú thích và chuỗi được bỏ trước khi quét; nhân/trừ để ra một mốc là thời lượng, không bị hỏi. Bộ bắt tự ` +
    `phá thử ${must.length} dạng phải bắt (kể cả bản chép \`daysUntil\` của #29 và phép chia xuống dòng) và ${mustNot.length} dạng ` +
    'không được bắt',
);
