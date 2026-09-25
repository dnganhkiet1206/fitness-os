/**
 * Một lỗi đọc được từ supabase trong `mutationFn` phải được NÉM (#53).
 *
 * ── vì sao ──
 *
 * Ở #46, đường THÍCH của `useToggle` bị bẻ bằng cách cho `mutationFn` NUỐT lỗi
 * INSERT: `if (error && error.code === 'never') throw error`. Kết quả không phải
 * im lặng mà tệ hơn: mutation "thành công", `onSuccess` ở chỗ gọi chạy, và toast
 * "Đã lưu vào thư viện · Xem thư viện" hiện ra cho một lệnh ghi đã hỏng.
 * `write-heard.mjs` đòi có `onError` — và `onError` có đủ — nhưng không hỏi
 * `mutationFn` có ném hay không. Một `onError` không bao giờ được gọi thì cũng
 * như không có.
 *
 * ── luật ──
 *
 * Trong thân mọi `mutationFn: async (…) => { … }` và hàm ghi mặc định của hàng
 * đợi (`applyOfflineWrite`), mỗi `{ error }` (hay `{ error: e }`) lấy ra từ một
 * `await` phải được câu `if` ĐẦU TIÊN nhắc tới nó ném đi khi có lỗi:
 *
 *   `if (error) throw …` · `if (error) { … throw … }` · `if (error || …) throw`
 *
 * Được bỏ qua đúng một loại lỗi, và chỉ loại có tên trong IGNORABLE kèm lý do:
 * `if (error && error.code !== '23505') throw error` — "đã có từ trước", trạng
 * thái người dùng muốn ĐÃ đúng. Một phép kiểm hẹp (`error?.code === 'P0001'`
 * ném một lỗi có kiểu) thì được, miễn là SAU nó còn một phép kiểm chung.
 * Còn `if (error && error.code === 'never') throw error` — chỉ ném đúng một mã,
 * nuốt mọi mã khác — là đúng phép bẻ của #46, và đỏ.
 *
 * ── ngoài mutationFn (#89) ──
 *
 * Bản đầu không đi theo HÀM PHỤ mà `mutationFn` gọi. Đo lúc viết: cả `src/` có
 * 164 lần đọc `{ error }` từ một `await`, 12 lần không ném, tất cả ngoài
 * `mutationFn` — và "đã soát là có chủ ý" chỉ là một câu trong chú thích. Nay
 * lượt 2 xét MỌI lần đọc, trong khối bao quanh nó (câu ném của hàm bên cạnh
 * không cứu được). Được không ném khi: trả lỗi về chỗ gọi (`return { error }` —
 * bốn chỗ của `use-auth`), hoặc mang dấu `// không ném (#53): <lý do>` ngay
 * trên câu ấy — tám chỗ còn lại, mỗi chỗ một lý do lấy từ chú thích đang có.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:])\/\/.*$/gm, '$1');

/** Điều kiện bỏ qua được phép, mỗi cái một lý do. `E` là tên biến lỗi. */
export const IGNORABLE = [
  { re: (E) => new RegExp(`^${E}\\s*&&\\s*${E}\\??\\.code\\s*!==\\s*'23505'$`), why: "23505 — đã có từ trước (thích, lưu, theo dõi hai lần): trạng thái người dùng muốn đã đúng" },
  { re: (E) => new RegExp(`^${E}\\s*&&\\s*!${E}\\??\\.message\\??\\.includes\\('duplicate'\\)$`), why: 'thông báo "duplicate" — cùng nghĩa với 23505' },
  { re: (E) => new RegExp(`^${E}\\s*&&\\s*!isDuplicateAward\\(${E}\\)$`), why: 'huy hiệu đã trao — cùng nghĩa với 23505' },
];

/** Từ `at` (một `{` hay `(`), đoạn khớp ngoặc. */
function balanced(src, at) {
  const open = src[at];
  const close = open === '{' ? '}' : ')';
  let depth = 0;
  for (let i = at; i < src.length; i++) {
    if (src[i] === open) depth++;
    else if (src[i] === close && --depth === 0) return src.slice(at, i + 1);
  }
  return src.slice(at);
}

/** Thân mọi mutationFn (và applyOfflineWrite) trong một tệp: `[{ line, body }]`. */
export function mutationBodies(src) {
  const out = [];
  const add = (idx) => {
    const brace = src.indexOf('{', idx);
    out.push({ line: src.slice(0, idx).split('\n').length, body: balanced(src, brace) });
  };
  for (const m of src.matchAll(/mutationFn:\s*async\s*(?:\w+|\([^)]*\))\s*(?::\s*[^=]+?)?=>\s*\{/g)) add(m.index + m[0].length - 1);
  for (const m of src.matchAll(/export async function applyOfflineWrite\([^)]*\)[^{]*\{/g)) add(m.index + m[0].length - 1);
  return out;
}

/** Xét một thân; trả danh sách sai (chuỗi, chưa có tên tệp). */
/** Khối `{…}` nhỏ nhất bao quanh vị trí `at` trong `src`: `[mở, đóng)`. */
function enclosing(src, at) {
  let depth = 0;
  for (let i = at; i >= 0; i--) {
    if (src[i] === '}') depth++;
    else if (src[i] === '{') {
      if (depth === 0) return [i, i + balanced(src, i).length];
      depth--;
    }
  }
  return [0, src.length];
}

/**
 * Xét một đoạn mã; trả `[{ line, at, why }]` — `line` là dòng của lệnh đọc,
 * `at` là dòng của câu phạm (câu `if`, hay chính lệnh đọc khi không câu nào
 * xét tới lỗi). `scoped`: chỉ nhìn trong khối bao quanh lệnh đọc — cần khi
 * đoạn mã là CẢ MỘT TỆP, để câu `if (error)` của hàm bên cạnh không "cứu" nhầm.
 */
export function bodyProblems(body, { scoped = false } = {}) {
  const out = [];
  for (const d of body.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\b/g)) {
    const field = d[1].split(',').map((x) => x.trim()).find((x) => /^error\b/.test(x));
    if (!field) continue;
    const E = field.includes(':') ? field.split(':')[1].trim() : 'error';
    const from = d.index + d[0].length;
    const to = scoped ? enclosing(body, d.index)[1] : body.length;
    const rest = body.slice(from, to);
    const line = body.slice(0, d.index).split('\n').length;
    const lineOf = (i) => body.slice(0, from + i).split('\n').length;
    let verdict = null;
    let at = line;
    /* Trả lỗi về cho chỗ gọi (`return { error }`, `return error`) là chuyển nó
       đi, không phải nuốt: chỗ gọi quyết định. */
    const handed = rest.search(new RegExp(`\\breturn\\s*(?:\\{[^}]*\\b${E}\\b[^}]*\\}|${E}\\b)`));
    for (const m of rest.matchAll(/\bif\s*\(/g)) {
      if (handed >= 0 && handed < m.index) break;
      const cond = balanced(rest, m.index + m[0].length - 1).slice(1, -1).replace(/\s+/g, ' ').trim();
      if (!new RegExp(`\\b${E}\\b`).test(cond)) continue;
      at = lineOf(m.index);
      const after = rest.slice(m.index + m[0].length - 1 + balanced(rest, m.index + m[0].length - 1).length).trimStart();
      const throws = after.startsWith('throw') || (after.startsWith('{') && /\bthrow\b/.test(balanced(after, 0)));
      const generic = cond === E || cond.split('||').map((t) => t.trim()).includes(E);
      if (generic) {
        verdict = throws ? 'ok' : `if (${cond}) mà không ném`;
        break;
      }
      if (IGNORABLE.some((x) => x.re(E).test(cond))) {
        verdict = throws ? 'ok' : `if (${cond}) mà không ném`;
        break;
      }
      /* Một phép kiểm HẸP (một mã, một lỗi có kiểu): được, nếu còn phép kiểm chung sau nó. */
      if (throws && new RegExp(`^${E}\\??\\.code\\s*===|^${E}\\s*&&\\s*${E}\\??\\.code\\s*===`).test(cond)) continue;
      verdict = `if (${cond}) — chỉ ném khi điều kiện ấy đúng, nuốt mọi lỗi khác`;
      break;
    }
    if (verdict == null && handed >= 0) verdict = 'ok';
    if (verdict == null) verdict = 'không câu if nào ném nó (hoặc chỉ có phép kiểm hẹp, không phép kiểm chung)';
    if (verdict !== 'ok') out.push({ line, at, why: `{ ${field} } = await … → ${verdict}` });
  }
  return out;
}

/**
 * Dấu "không ném, có chủ ý" — kèm một lý do bằng chữ, ít nhất tám ký tự. Không
 * gọi là "nuốt": hai trong tám chỗ đầu tiên BÁO lỗi cho người dùng bằng Alert,
 * chỉ không ném nó — và một cái dấu nói sai về chỗ nó đứng thì không ai tin.
 */
export const MARK = /không ném \(#53\):[ \t]*(\S.{7,})/; // `[ \t]`, không `\s`: `\s` nuốt cả xuống dòng và đọc dòng code kế tiếp thành "lý do"

/**
 * `read`: tệp → mã ĐÃ bỏ chú thích (dòng giữ nguyên); `raw`: tệp → mã gốc, nơi
 * dấu nằm. Hai lượt:
 *   1. thân `mutationFn` và `applyOfflineWrite` — CHẶT: không dấu nào cứu được,
 *      chỉ IGNORABLE. Một `onSuccess` báo thành công đứng ngay sau thân ấy.
 *   2. mọi lệnh đọc khác trong `src/` (#89) — được không ném, nếu ngay phía trên
 *      câu phạm (tới 3 dòng trên lệnh đọc) có dấu `không ném (#53): <lý do>`.
 */
export function scan(read, raw = read) {
  const problems = [];
  let bodies = 0;
  let reads = 0;
  let marked = 0;
  for (const [f, src] of read) {
    const ranges = [];
    for (const { line, body } of mutationBodies(src)) {
      bodies++;
      ranges.push([line, line + body.split('\n').length - 1]);
      for (const p of bodyProblems(body)) problems.push(`${f}:${line + p.line - 1}: ${p.why}`);
    }
    reads += (src.match(/(?:const|let)\s*\{[^}]*\berror\b[^}]*\}\s*=\s*await\b/g) ?? []).length;
    const lines = (raw.get(f) ?? src).split('\n');
    for (const p of bodyProblems(src, { scoped: true })) {
      if (ranges.some(([a, b]) => p.line >= a && p.line <= b)) continue; // lượt 1 đã xét, và chặt hơn
      const window = lines.slice(Math.max(0, p.line - 4), p.at).join('\n');
      if (MARK.test(window)) {
        marked++;
        continue;
      }
      problems.push(
        `${f}:${p.at}: ${p.why} — ngoài mutationFn thì được nuốt, nhưng phải nói ra: ` +
          'đặt "// không ném (#53): <lý do>" ngay trên câu ấy (hoặc tới 3 dòng trên lệnh đọc)',
      );
    }
  }
  return { problems, bodies, reads, marked };
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: NATIVE, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));
const raw = new Map(files.map((f) => [f, readFileSync(path.join(NATIVE, f), 'utf8')]));
const read = new Map([...raw].map(([f, s]) => [f, strip(s)]));
const { problems, bodies, reads, marked } = scan(read, raw);
if (bodies < 60) problems.push(`chỉ tìm thấy ${bodies} mutationFn — bộ quét hỏng, đừng tin kết quả`);

/* ── thử ngược, trên bản sao ──

   Mỗi phép đổi MÃ GỐC rồi bỏ chú thích lại, và so với số sai của cây thật
   (0). Bản đầu chỉ đổi mã đã bỏ chú thích — tức đã mất hết dấu — nên lượt 2
   luôn thấy 8 chỗ "không dấu" và mọi phép thử ngược "đỏ" dù phép bẻ có được
   nhận ra hay không. */
const base = problems.length;
const bentScan = (f, edit) => {
  const r = raw.get(f);
  const e = edit(r);
  if (e === r) return null; // phép đổi không áp được — tự báo bên dưới
  const rr = new Map(raw).set(f, e);
  return scan(new Map([...rr].map(([k, v]) => [k, strip(v)])), rr).problems.length;
};
const probe = (label, f, edit, wantRed) => {
  const n = bentScan(f, edit);
  if (n == null) problems.push(`thử ngược hỏng: "${label}" không áp được lên ${f}`);
  else if (wantRed && n <= base) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  else if (!wantRed && n !== base) problems.push(`thử ngược hỏng: ${label} (được phép) mà luật đỏ`);
};
{
  const F = 'src/hooks/use-community.ts';
  const OK23505 = "if (error && error.code !== '23505') throw error";
  probe("bẻ như #46 (error.code === 'never')", F, (r) => r.replace(OK23505, "if (error && error.code === 'never') throw error"), true);
  const F2 = [...raw].find(([, v]) => /mutationFn:[\s\S]{0,400}if \(error\) throw error;/.test(v))?.[0];
  if (!F2) problems.push('thử ngược hỏng: không còn mutationFn nào có "if (error) throw error;" để thử');
  else {
    const at = /(mutationFn:[\s\S]{0,400}?)if \(error\) throw error;/;
    probe('đổi sang bỏ qua 23505', F2, (r) => r.replace(at, "$1if (error && error.code !== '23505') throw error;"), false);
    probe('bỏ hẳn phép ném trong mutationFn', F2, (r) => r.replace(at, '$1void error;'), true);
  }
  /* #89 */
  const W = 'src/lib/weight-sync.ts';
  probe('bỏ dấu "không ném" ở weight-sync', W, (r) => r.replace(/\s*\/\/ không ném \(#53\):[^\n]*/, ''), true);
  probe('dấu "không ném" mà lý do rỗng', W, (r) => r.replace(/\/\/ không ném \(#53\):[^\n]*/, '// không ném (#53):'), true);
  const S = 'src/lib/same-day-entry.ts';
  probe(
    'thêm một hàm phụ nuốt lỗi không dấu',
    S,
    (r) => `${r}\nexport async function probe89() {\n  const { error } = await supabase.from('x').select('id');\n  if (error) return null;\n  return 1;\n}\n`,
    true,
  );
  probe(
    'câu if (error) throw của HÀM BÊN CẠNH không được cứu một hàm nuốt lỗi',
    S,
    (r) => `${r}\nexport async function probe89a() {\n  const { error } = await supabase.from('x').select('id');\n  return 1;\n}\nexport async function probe89b() {\n  const { error } = await supabase.from('y').select('id');\n  if (error) throw error;\n}\n`,
    true,
  );
}

if (problems.length) {
  console.log('lỗi đọc được mà không ném:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `lỗi ghi được ném OK — ${bodies} mutationFn (và hàm ghi của hàng đợi): mọi { error } đọc từ một await đều bị câu if ` +
    'đầu tiên nhắc tới nó NÉM đi; chỉ bỏ qua được 23505 / "duplicate" / huy hiệu đã trao (đã có từ trước), và phép kiểm ' +
    `hẹp một mã phải có phép kiểm chung đi sau. Cả src/ (#89): ${reads} lần đọc, mỗi lần hoặc ném, hoặc trả về chỗ gọi ` +
    `(return { error }), hoặc mang dấu "không ném (#53): <lý do>" — ${marked} chỗ có dấu. Thử ngược: bẻ như #46, bỏ hẳn ` +
    'phép ném, bỏ một dấu, dấu rỗng lý do, thêm một hàm phụ nuốt lỗi, và câu ném của hàm bên cạnh — mỗi cái đỏ; đổi sang ' +
    'bỏ qua 23505 thì vẫn xanh',
);
