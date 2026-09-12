/**
 * Một truy vấn KHÔNG được trả về thành công với dữ liệu thiếu một nửa.
 *
 * ── lỗi sinh ra luật này ──
 *
 * `useTodayLog` đọc hai lượt để dựng nhật ký bữa ăn: `meal_entries` cho tổng
 * calo/macro của từng bữa, rồi `meal_entry_items` cho các món bên trong. Lượt
 * đầu viết đúng — `if (error) throw error` — nên một lần đọc hỏng đi ra kênh
 * lỗi, tab Dinh dưỡng bắt được qua `isError` và hiện `LoadFailed`.
 *
 * Lượt thứ hai viết `const { data: items } = await …`, bỏ `error` đi. Hậu quả
 * không phải là thiếu vài hàng: hàm vẫn `return` THÀNH CÔNG, mỗi bữa mang đủ
 * tổng calo và macro, và `items: []`. Màn hình vẽ ra:
 *
 *     Bữa sáng          0 món · P36 · C63 · F16          540 kcal
 *
 * Mở ra rỗng. Không hàng nào để bấm sửa, không hàng nào để bấm xoá. Tức ĐÚNG
 * lúc dữ liệu đáng ngờ nhất thì app lặng lẽ gỡ mất đường sửa nó — và người
 * dùng không có cách nào biết đây là "bữa rỗng" hay "chưa đọc được".
 *
 * ── vì sao là một luật, không phải hai bản sửa ──
 *
 * React Query chỉ có MỘT kênh để nói "dữ liệu này không tin được": kênh lỗi.
 * Màn hình không thể tự phát minh ra kênh thứ hai, nên mọi lượt đọc góp phần
 * dựng giá trị trả về đều phải đi qua kênh ấy khi hỏng. Một `queryFn` đọc
 * nhiều lượt mà chỉ lượt đầu ném là một `queryFn` có thể nói dối.
 *
 * Và nó không hiếm: cùng hình dạng ấy có mặt ở `useSupplementChecklist` — đọc
 * `supplements` thì ném, đọc `supplement_intake_logs` thì nuốt — nên mọi thực
 * phẩm bổ sung hiện ra là CHƯA uống và hàng tắt ghi `0/4 hôm nay` cho người đã
 * tích đủ bốn. Hai chỗ cùng một lỗi là lý do đây là luật.
 *
 * ── ranh giới: chỉ `queryFn`, không đụng `mutationFn` ──
 *
 * Đây là một ranh giới CÓ CHỦ Ý, không phải chỗ luật bỏ sót.
 *
 * Một `queryFn` chỉ có một việc: dựng ra giá trị mà màn hình sẽ vẽ. Thiếu một
 * nửa là vẽ sai, luôn luôn, không có ngoại lệ nào đáng nghe.
 *
 * `mutationFn` thì khác thật. Ở đó "đọc hỏng" có nhiều đáp án đúng khác nhau
 * tuỳ việc, và hai chỗ trong repo này đã viết ra lý do của chúng ngay cạnh
 * dòng code: `useLogWorkout` đọc lịch sử để dò kỷ lục và cố ý nuốt, vì *"a
 * failure to read history is not a failure to save a workout"*; `use-extras`
 * đọc hồ sơ để lấy ngưỡng thử thách và rơi về đúng bộ mặc định cả app dùng.
 * Bắt cả hai phải ném là ép một câu trả lời sai cho một câu hỏi khác.
 *
 * Nhưng ranh giới ấy phải được NÓI RA chứ không phải để im: phía `mutationFn`
 * còn sáu lượt đọc `daily_logs`/`water_logs` trong `useSyncChallenges` mà đọc
 * hỏng cho ra `newValue = 0` rồi ghi ngược con số ấy vào tiến trình thử thách.
 * Đó là một câu hỏi riêng, chưa trả lời, và luật này cố tình không giả vờ đã
 * trả lời nó.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* `resolve` chứ không `join`: phép thử ngược trỏ vào một thư mục tuyệt đối
   ngoài repo, và `join` sẽ nối nó vào sau `native/` thành một đường không có. */
const ROOT = path.resolve(NATIVE, process.env.QUERY_PARTIAL_ROOT ?? 'src');

/**
 * Những lượt đọc trong `queryFn` được phép nuốt lỗi, và VÌ SAO.
 *
 * Khoá là `đường-dẫn:bảng`. Mỗi mục phải nói ra chuyện gì xảy ra khi lượt đọc
 * ấy hỏng — nếu câu trả lời là "màn hình vẽ sai mà không ai biết" thì nó không
 * thuộc về bảng này, nó là một lỗi.
 *
 * Trống là đúng lúc này: cả hai chỗ từng có đều đã sửa thành ném.
 */
const NUOT_CO_LY_DO = new Map([]);

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = path.join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(e)) files.push(p);
  }
})(ROOT);

/**
 * Xoá chú thích mà GIỮ NGUYÊN vị trí ký tự, và không đụng vào chuỗi.
 *
 * Không dùng được `codeMask` kiểu cũ của repo: nó xoá cả chuỗi, mà tên bảng
 * trong `.from('meal_entry_items')` nằm trong một chuỗi — xoá đi là luật này
 * mất chính thứ nó cần để báo cho ra hồn.
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const two = src.slice(i, i + 2);
    if (two === '//') {
      while (i < n && src[i] !== '\n') { out += ' '; i++; }
      continue;
    }
    if (two === '/*') {
      while (i < n && src.slice(i, i + 2) !== '*/') { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch;
      out += ch; i++;
      while (i < n) {
        if (src[i] === '\\') { out += src.slice(i, i + 2); i += 2; continue; }
        out += src[i];
        if (src[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    out += ch; i++;
  }
  return out;
}

/** Thân của khối bắt đầu tại `{` ở vị trí `open`, khớp ngoặc. */
function blockAt(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return { body: src.slice(open, i + 1), end: i };
    }
  }
  return null;
}

/** Mọi thân `queryFn:` trong một tệp, kèm dòng bắt đầu. */
function queryFnBodies(src) {
  const out = [];
  const re = /\bqueryFn\s*:/g;
  let m;
  while ((m = re.exec(src))) {
    const arrow = src.indexOf('=>', m.index);
    if (arrow < 0) continue;
    const open = src.indexOf('{', arrow);
    if (open < 0) continue;
    const blk = blockAt(src, open);
    if (!blk) continue;
    out.push({ body: blk.body, at: m.index });
  }
  return out;
}

const problems = [];
let checked = 0;
let reads = 0;

for (const f of files) {
  const rel = path.relative(ROOT, f);
  const src = stripComments(readFileSync(f, 'utf8'));
  if (!/\bqueryFn\s*:/.test(src)) continue;

  for (const { body, at } of queryFnBodies(src)) {
    checked++;
    /* `const { … } = await supabase … .from('bảng')` — chỉ bảng, không đụng
       `supabase.storage.from(BUCKET)` (một URL ký thất bại là một hàng mất ảnh,
       không phải cả tập dữ liệu sai) và không đụng `supabase.auth`. */
    const re = /const\s*\{([^}]*)\}\s*=\s*await\s+supabase\s*\.\s*from\s*\(\s*['"`]([^'"`]+)['"`]/g;
    let m;
    while ((m = re.exec(body))) {
      reads++;
      const bound = m[1];
      const table = m[2];
      const line = src.slice(0, at).split('\n').length;
      const key = `${rel}:${table}`;

      const errName = /\berror\s*:\s*(\w+)/.exec(bound)?.[1]
        ?? (/(^|[,{\s])error\s*(,|$|\s)/.test(bound) ? 'error' : null);

      if (!errName) {
        if (NUOT_CO_LY_DO.has(key)) continue;
        problems.push(
          `${rel}: đọc \`${table}\` trong queryFn (quanh dòng ${line}) bỏ \`error\` đi — ` +
            'truy vấn sẽ trả về THÀNH CÔNG với dữ liệu thiếu, và màn hình không có cách nào ' +
            'phân biệt "rỗng thật" với "chưa đọc được". Nhận `error` rồi ném nó',
        );
        continue;
      }
      if (!new RegExp(`throw\\s+${errName}\\b`).test(body)) {
        problems.push(
          `${rel}: đọc \`${table}\` trong queryFn (quanh dòng ${line}) có nhận \`${errName}\` ` +
            `nhưng không chỗ nào \`throw ${errName}\` — nhận lỗi rồi không ném thì cũng là nuốt, ` +
            'chỉ là nuốt ở một dòng xa hơn',
        );
      }
    }
  }
}

for (const [key] of NUOT_CO_LY_DO) {
  const [rel, table] = key.split(':');
  const f = path.join(ROOT, rel);
  if (!files.includes(f) || !readFileSync(f, 'utf8').includes(table)) {
    problems.push(`${key}: không còn lượt đọc nào như thế — bỏ nó khỏi NUOT_CO_LY_DO trong tools/query-partial.mjs`);
  }
}

if (problems.length) {
  console.error('truy vấn trả về nửa vời:');
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(
  `truy vấn nửa vời OK — ${checked} thân queryFn, ${reads} lượt đọc bảng, mọi lượt đều ném lỗi của ` +
    `chính nó (${NUOT_CO_LY_DO.size} miễn kèm lý do). Luật chỉ soi queryFn: mutationFn có nhiều đáp án ` +
    'đúng khác nhau và ranh giới ấy được ghi ở đầu tệp, kèm chỗ CHƯA trả lời (useSyncChallenges)',
);
