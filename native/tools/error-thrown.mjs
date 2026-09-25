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
 * ── vùng mù, nói ra ──
 *
 * Luật không đi theo HÀM PHỤ mà `mutationFn` gọi (`sleepRowToReplace`,
 * `syncProfileWeight`, …). Đo lúc viết: cả `src/` có 164 lần đọc `{ error }`
 * từ một `await`; 59 nằm trong thân `mutationFn` và đều ném; 12 lần KHÔNG ném
 * đều nằm ngoài, và cả 12 đã được soát là CÓ CHỦ Ý — trả lỗi về cho chỗ gọi
 * (`use-auth`, `auth-screen`, `edge.ts`), gom lỗi để báo (`health-sync-write`),
 * hay có lý do viết ngay cạnh ("không đọc được thì ghi như một hàng mới" ở
 * `same-day-entry`, "a failed read is not licence to guess" ở `weight-sync`).
 * Mở luật ra cả `src/` thì cần một dấu "nuốt có chủ đích" cho 12 chỗ ấy; đó là
 * việc của một vòng sau, không phải lý do để luật này đoán.
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
export function bodyProblems(body) {
  const out = [];
  for (const d of body.matchAll(/(?:const|let)\s*\{([^}]*)\}\s*=\s*await\b/g)) {
    const field = d[1].split(',').map((x) => x.trim()).find((x) => /^error\b/.test(x));
    if (!field) continue;
    const E = field.includes(':') ? field.split(':')[1].trim() : 'error';
    const rest = body.slice(d.index + d[0].length);
    const line = body.slice(0, d.index).split('\n').length;
    let verdict = null;
    for (const m of rest.matchAll(/\bif\s*\(/g)) {
      const cond = balanced(rest, m.index + m[0].length - 1).slice(1, -1).replace(/\s+/g, ' ').trim();
      if (!new RegExp(`\\b${E}\\b`).test(cond)) continue;
      const after = rest.slice(m.index + m[0].length - 1 + cond.length + 2).trimStart();
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
      if (throws && new RegExp(`^${E}\\??\\.code\\s*===|^${E}\\s*&&\\s*${E}\\??\\.code\\s*===|^${E}\\??\\.code\\s*===`).test(cond)) continue;
      verdict = `if (${cond}) — chỉ ném khi điều kiện ấy đúng, nuốt mọi lỗi khác`;
      break;
    }
    if (verdict == null) verdict = 'không câu if nào ném nó (hoặc chỉ có phép kiểm hẹp, không phép kiểm chung)';
    if (verdict !== 'ok') out.push({ line, why: `{ ${field} } = await … → ${verdict}` });
  }
  return out;
}

export function scan(read) {
  const problems = [];
  let bodies = 0;
  let reads = 0;
  for (const [f, src] of read) {
    for (const { line, body } of mutationBodies(src)) {
      bodies++;
      reads += (body.match(/\{[^}]*\berror\b[^}]*\}\s*=\s*await\b/g) ?? []).length;
      for (const p of bodyProblems(body)) problems.push(`${f}:${line + p.line - 1}: ${p.why}`);
    }
  }
  return { problems, bodies, reads };
}

const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: NATIVE, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f));
const read = new Map(files.map((f) => [f, strip(readFileSync(path.join(NATIVE, f), 'utf8'))]));
const { problems, bodies, reads } = scan(read);
if (bodies < 60) problems.push(`chỉ tìm thấy ${bodies} mutationFn — bộ quét hỏng, đừng tin kết quả`);

/* ── thử ngược: đúng phép bẻ của #46, trên bản sao ── */
{
  const F = 'src/hooks/use-community.ts';
  const src = read.get(F) ?? '';
  const OK23505 = "if (error && error.code !== '23505') throw error";
  if (!src.includes(OK23505)) problems.push(`thử ngược hỏng: ${F} không còn "${OK23505}" để bẻ`);
  else {
    const bent = new Map(read).set(F, src.replace(OK23505, "if (error && error.code === 'never') throw error"));
    if (scan(bent).problems.length <= problems.length) problems.push('thử ngược hỏng: bẻ như #46 (error.code === \'never\') mà luật vẫn xanh');
  }
  const F2 = [...read].find(([, s]) => /mutationFn:[\s\S]{0,400}if \(error\) throw error;/.test(s))?.[0];
  if (F2) {
    const s2 = read.get(F2);
    const allowed = new Map(read).set(F2, s2.replace(/(mutationFn:[\s\S]{0,400}?)if \(error\) throw error;/, "$1if (error && error.code !== '23505') throw error;"));
    if (scan(allowed).problems.length !== scan(read).problems.length) problems.push('thử ngược hỏng: bỏ qua 23505 (được phép) mà luật đỏ');
    const dropped = new Map(read).set(F2, s2.replace(/(mutationFn:[\s\S]{0,400}?)if \(error\) throw error;/, '$1void error;'));
    if (scan(dropped).problems.length <= scan(read).problems.length) problems.push('thử ngược hỏng: bỏ hẳn phép ném mà luật vẫn xanh');
  }
}

if (problems.length) {
  console.log('lỗi đọc được mà không ném:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `lỗi ghi được ném OK — ${bodies} mutationFn (và hàm ghi của hàng đợi), ${reads} lần đọc { error } từ một await: ` +
    'mỗi lần, câu if đầu tiên nhắc tới lỗi ấy NÉM nó; chỉ bỏ qua được 23505 / "duplicate" / huy hiệu đã trao (đã có ' +
    'từ trước), và phép kiểm hẹp một mã phải có phép kiểm chung đi sau. Thử ngược: bẻ như #46 (error.code === \'never\') ' +
    'thì đỏ, bỏ hẳn phép ném thì đỏ, đổi sang bỏ qua 23505 thì vẫn xanh',
);
