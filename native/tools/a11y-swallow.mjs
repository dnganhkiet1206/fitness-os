/**
 * Một nút không được nằm TRONG một nút — vì trên iOS cái ngoài nuốt cái trong.
 *
 * ── lỗi đã xảy ra, và vì sao không ai nhìn thấy nó ──
 *
 * `help-button.tsx` để nút X (tắt lời nhắc) nằm bên trong `PressScale` của cả
 * dải. Chạm bằng ngón tay vẫn đúng: hệ responder của React Native trao quyền
 * cho view SÂU NHẤT nhận, nên cái X vẫn bấm được. Nên lỗi này không hỏng ở nơi
 * ai cũng nhìn.
 *
 * Nó hỏng ở chỗ không ai nhìn. `Pressable.js:252` của React Native 0.86 đặt
 *
 *     accessible: accessible !== false
 *
 * nghĩa là MỌI `Pressable` là một phần tử trợ năng trừ khi bị bảo ngược lại. Và
 * tài liệu trợ năng của React Native nói phần tử ấy làm gì: *"When a view is an
 * accessibility element, it groups its children into a single selectable
 * component."* UIKit không đi vào bên trong một phần tử đã là phần tử trợ năng.
 *
 * Kết quả cụ thể, đo được trên bộ chạy web trước khi sửa: màn Hôm nay có 2 nút
 * "Đóng" và cả 2 đều nằm trong một nút khác. Người dùng VoiceOver mở được sheet
 * giải thích và **không có cách nào tắt lời nhắc** — nó ở lại vĩnh viễn.
 *
 * Bộ chạy web bắt được cùng nguyên nhân ở một mặt khác: `<button>` lồng trong
 * `<button>` là lỗi hydrate của React, hai lần mỗi lần dựng màn Hôm nay.
 *
 * ── luật ──
 *
 * Một phần tử bấm được nằm trong một phần tử bấm được khác thì phần tử NGOÀI
 * phải khai `accessible={false}` — tức nó tự nhận mình là một vùng nuốt chạm
 * chứ không phải một nút. Không khai thì phải nằm trong danh sách NỢ dưới đây
 * kèm lý do.
 *
 * `Modal` / `FormSheet` cắt chuỗi: thứ bên trong chúng dựng ở một cây khác, nên
 * chồng nhau về mặt chữ không phải chồng nhau khi chạy.
 *
 * ── và vì sao số dòng được giữ nguyên khi bỏ chú thích ──
 *
 * Bản đầu của bước này cắt hẳn khối chú thích đi rồi mới đếm dòng, nên MỌI vị
 * trí nó in ra đều lệch — nó chỉ đúng nhóm tệp. Một công cụ đo báo sai chỗ thì
 * tệ hơn không có công cụ, vì người đọc sẽ đi mở đúng cái dòng nó chỉ và thấy
 * một thứ không liên quan, rồi kết luận là báo động giả.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.join(NATIVE, process.env.A11Y_SWALLOW_ROOT ?? 'src');

const PRESS = new Set([
  'Pressable', 'PressScale', 'TouchableOpacity', 'TouchableHighlight',
  'TouchableWithoutFeedback', 'RNPressable', 'GHPressable',
]);
/** Cổng sang một cây khác — chồng nhau về mặt chữ, không chồng nhau khi chạy. */
const PORTAL = new Set(['Modal', 'FormSheet', 'Portal']);

/**
 * Những chỗ CÒN nợ, mỗi chỗ một lý do.
 *
 * Danh sách này chỉ được ngắn đi. Thêm một dòng vào đây là một quyết định phải
 * viết ra, không phải một cách làm bước kiểm im lặng.
 */
const NỢ = new Map([
]);

/**
 * Các COMPONENT mà bản thân chúng LÀ một phần tử bấm được.
 *
 * ── vì sao danh sách này phải được tính, không được gõ ──
 *
 * `dashboard-cards.tsx` viết `const card = (<GlassCard>… <HelpButton/> …)` rồi
 * `<PressScale>{card}</PressScale>`. Chuỗi lồng nhau đi qua HAI lớp gián tiếp:
 * một biến, rồi một component. `HelpButton` không có chữ `Pressable` nào trong
 * tệp gọi nó — nó chỉ là một cái tên — nhưng thân nó ở `help-button.tsx` trả về
 * một `PressScale`. Bộ chạy web tìm ra chỗ này (`<button>` trong `<button>`,
 * hai lần mỗi lần dựng tab Dinh dưỡng) trong khi bước kiểm báo xanh.
 *
 * Bản đầu của phép sửa chỉ đi theo BIẾN và vẫn xanh trên đúng tệp hỏng — phép
 * thử ngược bắt được điều đó trước khi tôi tin nó. Nên danh sách này được quét
 * ra từ mã nguồn: một component có `return (` mà thẻ mở đầu tiên là một phần tử
 * bấm được thì chính nó là một phần tử bấm được, ở mọi chỗ gọi nó.
 */
function pressableComponents(allFiles) {
  const names = new Set();
  for (const f of allFiles) {
    const src = strip(readFileSync(f, 'utf8'));
    const re = /export function ([A-Z]\w*)\s*\(/g;
    let m;
    while ((m = re.exec(src))) {
      const from = m.index;
      const nextExport = src.indexOf('\nexport ', from + 1);
      const body = src.slice(from, nextExport < 0 ? src.length : nextExport);
      const ret = /return\s*\(\s*<([A-Z]\w*)/.exec(body);
      if (ret && PRESS.has(ret[1])) names.add(m[1]);
    }
  }
  return names;
}

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx$/.test(e)) files.push(p);
  }
})(ROOT);

/* Bỏ chú thích mà GIỮ số dòng — xem ghi chú đầu tệp. */
const blank = (m) => m.replace(/[^\n]/g, ' ');
const strip = (t) =>
  t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + blank(m.slice(p1.length)));

/** Thuộc tính của một thẻ mở, đọc bằng cách ĐẾM ngoặc — `onPress={() => {}}` có ngoặc lồng. */
function openTag(src, i) {
  if (src[i] !== '<' || !/[A-Z]/.test(src[i + 1] ?? '')) return null;
  let j = i + 1;
  while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
  const name = src.slice(i + 1, j);
  let depth = 0, q = null;
  for (; j < src.length; j++) {
    const ch = src[j];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { q = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') depth--;
    else if (ch === '>' && depth === 0) {
      const attrs = src.slice(i + 1 + name.length, j);
      return { name, attrs, end: j, selfClose: src[j - 1] === '/' };
    }
  }
  return null;
}

/**
 * Các biến trong tệp mang sẵn một phần tử bấm được.
 *
 * ── vì sao cần bước này ──
 *
 * `dashboard-cards.tsx` viết `const card = (<GlassCard>… <HelpButton/> …</GlassCard>)`
 * rồi `<PressScale>{card}</PressScale>`. Đó là một nút trong một nút, và phép
 * đi theo thẻ ở dưới KHÔNG thấy: lồng nhau đi qua một biến chứ không qua JSX
 * lồng chữ. Bộ chạy web tìm ra nó — `<button>` trong `<button>`, hai lần mỗi
 * lần dựng tab Dinh dưỡng — trong khi bước này báo xanh.
 *
 * Một tầng, không phải mọi tầng: `const a = <X/>; const b = <Y>{a}</Y>;` rồi
 * `{b}` là chuyện có thể viết ra nhưng không có trong repo này, và một phép
 * lần vết đầy đủ cần một trình phân tích cú pháp thật. Một tầng bắt được đúng
 * hình dạng đã xảy ra, và khi nó không đủ thì phép đo lúc chạy vẫn còn đó.
 */
function carriers(src) {
  const out = new Set();
  const re = /\bconst\s+(\w+)\s*=\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    let depth = 0;
    let i = m.index + m[0].length - 1;
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(m.index, i);
    if ([...PRESS].some((n) => new RegExp(`<${n}\\b`).test(body))) out.add(m[1]);
  }
  return out;
}

for (const n of pressableComponents(files)) PRESS.add(n);

const found = new Map();
for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = strip(readFileSync(f, 'utf8'));
  const carried = carriers(src);
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    if (src[i] !== '<') continue;
    if (src[i + 1] === '/') {
      let j = i + 2;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const name = src.slice(i + 2, j);
      const k = stack.map((x) => x.name).lastIndexOf(name);
      if (k >= 0) stack.length = k;
      i = j;
      continue;
    }
    const t = openTag(src, i);
    if (!t) continue;
    if (PRESS.has(t.name)) {
      const portal = stack.map((x) => x.name).findLastIndex((n) => PORTAL.has(n));
      const outer = stack.findLast((x, k) => PRESS.has(x.name) && k > portal && !x.opaque);
      if (outer) {
        const line = src.slice(0, i).split('\n').length;
        if (!found.has(rel)) found.set(rel, []);
        found.get(rel).push(`dòng ${line}: <${t.name}> trong <${outer.name}> (dòng ${outer.line})`);
      }
    }
    if (!t.selfClose) {
      /* `<PressScale>{card}</PressScale>`: nếu thân của thẻ vừa mở có `{NAME}`
         và NAME mang sẵn một nút, thì đây là một nút trong một nút. */
      if (PRESS.has(t.name) && carried.size) {
        let d = 0, j = t.end, close = src.length;
        for (; j < src.length; j++) {
          if (src[j] === '<' && src[j + 1] === '/') { if (d === 0) { close = j; break; } d--; }
          else if (src[j] === '<' && /[A-Za-z]/.test(src[j + 1] ?? '')) {
            const nt = openTag(src, j);
            if (nt && !nt.selfClose) d++;
          }
        }
        const body = src.slice(t.end, close);
        for (const name of carried) {
          if (new RegExp(`\\{\\s*${name}\\s*\\}`).test(body)) {
            const line = src.slice(0, i).split('\n').length;
            if (!found.has(rel)) found.set(rel, []);
            found.get(rel).push(`dòng ${line}: <${t.name}> chứa {${name}}, và ${name} mang sẵn một nút`);
            break;
          }
        }
      }
      stack.push({
        name: t.name,
        line: src.slice(0, i).split('\n').length,
        /* `accessible={false}` = "tôi là vùng nuốt chạm, không phải nút" — nó
           thôi nuốt cây con, nên con của nó không còn bị chôn. */
        opaque: /accessible=\{false\}/.test(t.attrs),
      });
    }
    i = t.end;
  }
}

const problems = [];
for (const [rel, list] of found) {
  if (!NỢ.has(rel)) {
    problems.push(`${rel}: ${list.length} nút lồng trong nút — ${list[0]}. Nút NGOÀI phải khai \`accessible={false}\` (nó là vùng nuốt chạm), hoặc bố cục lại thành hai nút CẠNH nhau như \`help-button.tsx\``);
  }
}
/* Và chiều ngược lại: một mục nợ đã được sửa mà còn nằm trong danh sách thì
   danh sách bắt đầu nói dối, và lần sau không ai tin nó nữa. */
/* Chỉ khi quét cây THẬT: một gốc phá hoại chỉ có một hai tệp, và ở đó "không
   tìm thấy" là hiển nhiên chứ không phải một tin. */
for (const [rel] of (process.env.A11Y_SWALLOW_ROOT ? [] : NỢ)) {
  if (!found.has(rel)) problems.push(`${rel}: không còn nút lồng nào — bỏ nó khỏi danh sách NỢ trong ${path.basename(fileURLToPath(import.meta.url))}`);
}

if (problems.length) {
  console.error('nút lồng trong nút:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
const debt = [...NỢ.keys()].length;
console.log(`nút lồng trong nút: ${files.length} tệp, 0 chỗ mới; ${debt} chỗ còn nợ, mỗi chỗ có lý do viết ra`);
