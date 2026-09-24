/**
 * Máy chủ giả trả 400 khi `select=` hỏi một cột không có thật — như PostgREST (#35).
 *
 * ── vì sao ──
 *
 * `c227cfe` sửa bốn lệnh xoá chưa từng chạy được trên server thật: Bỏ thích,
 * Bỏ lưu, Bỏ theo dõi, Rời thử thách. `confirmWrite` hỏi `select=id` trên bốn
 * bảng khoá bằng một CẶP cột, PostgREST biến nó thành `RETURNING id`, và
 * PostgreSQL trả 42703 mọi lần. `live.mjs` không thấy gì: nó trả hàng fixture
 * bất kể câu `select=` hỏi cột nào. Bước cổng tĩnh `confirm-write-cols.mjs`
 * canh riêng `confirmWrite`; mọi `.select('…')` khác vẫn mù. Tệp này cho máy
 * chủ giả đọc câu hỏi và từ chối đúng như máy chủ thật.
 *
 * ── cột lấy từ đâu ──
 *
 * `types.ts`, khối `Row` của từng bảng — bản sinh ra từ schema thật, và là
 * nguồn `fixture-schema.mjs` cũng đọc (nay đọc QUA tệp này, để hai bên không
 * thể lệch nhau). Cột có thật trong migration mà `types.ts` chưa sinh lại nằm
 * ở `TYPES_STALE`, mỗi cái chỉ đúng tệp migration đã thêm nó.
 *
 * ── cú pháp được hiểu ──
 *
 * `*` · `a,b` · bí danh `x:a` · ép kiểu `a::text` · đường JSON `a->b`, `a->>b` ·
 * nhúng `rel(…)`, `x:rel!hint(…)`, `...rel(…)` — cột BÊN TRONG phần nhúng được
 * soát khi `rel` là tên một bảng có trong `types.ts`; không thì bỏ qua (tên
 * quan hệ theo khoá ngoại, không đoán). Hàm gộp `count()` bỏ qua. Bảng không
 * có trong `types.ts` (kể cả `rpc/…`) không bị soát: không có gì để so.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Cột CÓ THẬT trong một migration nhưng `types.ts` chưa sinh lại. Mỗi cái phải
   chỉ đúng tệp migration đã thêm nó — một ngoại lệ không tra được nguồn là một
   ngoại lệ cho tiện. */
export const TYPES_STALE = {
  'profiles.coins': '20260810120000_economy_server_authority.sql',
};

/** Cột đọc thẳng từ khối `Row` của `types.ts` (không gồm TYPES_STALE). */
export function readTypeColumns(types) {
  const columns = new Map();
  /* Mỗi bảng là `ten: {` rồi `Row: {` … `}`. Lấy khối `Row` đầu tiên sau tên. */
  for (const m of types.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{\n {8}Row: \{\n([\s\S]*?)\n {8}\}/gm)) {
    const keys = [...m[2].matchAll(/^ {10}([a-z_][a-z0-9_]*)\??:/gm)].map((k) => k[1]);
    if (keys.length > 0) columns.set(m[1], new Set(keys));
  }
  return columns;
}

export const TYPE_COLUMNS = readTypeColumns(
  readFileSync(path.join(NATIVE, 'src/integrations/supabase/types.ts'), 'utf8'),
);

/** Cột của một bảng như máy chủ thật thấy: `types.ts` + TYPES_STALE. null nếu không biết bảng. */
export function realColumns(table, columns = TYPE_COLUMNS) {
  const base = columns.get(table);
  if (!base) return null;
  const out = new Set(base);
  for (const k of Object.keys(TYPES_STALE)) {
    const [t, c] = k.split('.');
    if (t === table) out.add(c);
  }
  return out;
}

/* Tách ở dấu phẩy CẤP NGOÀI CÙNG (ngoài ngoặc đơn và ngoặc kép). */
function splitTop(s) {
  const out = [];
  let cur = '';
  let depth = 0;
  let q = false;
  for (const ch of s) {
    if (ch === '"') q = !q;
    if (!q && ch === '(') depth++;
    if (!q && ch === ')') depth--;
    if (ch === ',' && depth === 0 && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/**
 * Mọi cột `select` hỏi mà `table` không có, kèm đường đi (`rel.cột` cho phần nhúng).
 * Trả [] khi hợp lệ hoặc khi không có gì để so.
 */
export function unknownSelectColumns(table, select, columns = TYPE_COLUMNS) {
  const real = realColumns(table, columns);
  if (!real || select == null) return [];
  const bad = [];
  for (const item of splitTop(select)) {
    const open = item.indexOf('(');
    if (open >= 0) {
      /* nhúng: `[...][alias:]rel[!hint](inner)`; hàm gộp: `count()` */
      const head = item.slice(0, open).replace(/^\.\.\./, '');
      const rel = head.slice(head.lastIndexOf(':') + 1).split('!')[0].trim();
      const inner = item.slice(open + 1, item.lastIndexOf(')'));
      if (!rel || rel === 'count' || !inner.trim()) continue;
      for (const c of unknownSelectColumns(rel, inner, columns)) bad.push(`${rel}.${c}`);
      continue;
    }
    let name = item.split('::')[0];
    name = name.slice(name.lastIndexOf(':') + 1);
    name = name.split('->')[0].replace(/^"|"$/g, '').trim();
    /* `count` đứng một mình, hay `cột.sum()` đã bị bắt ở nhánh ngoặc bên trên */
    if (name === '*' || name === '') continue;
    if (!real.has(name)) bad.push(name);
  }
  return bad;
}

/**
 * Câu trả lời 400 PostgREST gửi cho một `select=` hỏi cột không có thật, hoặc
 * null nếu câu hỏi hợp lệ. `url` là URL đầy đủ tới `/rest/v1/<bảng>`.
 */
export function selectRejection(url, columns = TYPE_COLUMNS) {
  const table = url.pathname.split('/')[3];
  const bad = unknownSelectColumns(table, url.searchParams.get('select'), columns);
  if (!bad.length) return null;
  const col = bad[0].includes('.') ? bad[0] : `${table}.${bad[0]}`;
  return {
    table,
    bad,
    status: 400,
    body: { code: '42703', details: null, hint: null, message: `column ${col} does not exist` },
  };
}

/* ── RPC (#38): chữ ký trong khối `Functions` của `types.ts` ─────────────── */

/* `a: string; b?: number` hay mỗi dòng một trường → Map(tên → { optional, type }) */
function readFields(body) {
  const out = new Map();
  for (const m of body.matchAll(/(\w+)(\??):\s*([^;\n]+)/g)) {
    out.set(m[1], { optional: m[2] === '?', type: m[3].trim().replace(/[;,]$/, '') });
  }
  return out;
}

/**
 * Map(tên hàm → { args: Map | null, returns: { kind: 'rows', cols } | { kind: 'scalar', type } }).
 * `args: null` nghĩa là `Record<PropertyKey, never>` — hàm không nhận đối số nào.
 */
export function readTypeFunctions(types) {
  const start = types.indexOf('    Functions: {');
  const end = types.indexOf('    Enums: {', start);
  if (start < 0 || end < 0) return new Map();
  const block = types.slice(start, end);
  const fns = new Map();
  const heads = [...block.matchAll(/^ {6}([a-z_][a-z0-9_]*): \{\n/gm)];
  heads.forEach((h, i) => {
    const body = block.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : block.length);
    const a = /^ {8}Args: (Record<PropertyKey, never>|\{([\s\S]*?)\})\n {8}Returns:/m.exec(body);
    const r = /^ {8}Returns: (\{\n([\s\S]*?)\n {8}\}\[\]|[^\n]+)/m.exec(body);
    if (!a || !r) return;
    fns.set(h[1], {
      args: a[1].startsWith('Record') ? null : readFields(a[2]),
      returns: r[2] != null ? { kind: 'rows', cols: readFields(r[2]) } : { kind: 'scalar', type: r[1].trim() },
    });
  });
  return fns;
}

export const TYPE_FUNCTIONS = readTypeFunctions(
  readFileSync(path.join(NATIVE, 'src/integrations/supabase/types.ts'), 'utf8'),
);

/**
 * Đối số một lời gọi RPC gửi lên không khớp chữ ký thì PostgREST không tìm ra
 * hàm: 404 / `PGRST202`. Thừa một tên, hay thiếu một đối số không có mặc định
 * (không có `?` trong `types.ts`), đều là "không có hàm nào như thế".
 * Trả null khi khớp, hoặc khi hàm không có trong `types.ts` (không có gì để so).
 */
export function rpcArgsRejection(fn, args, fns = TYPE_FUNCTIONS) {
  const sig = fns.get(fn);
  if (!sig) return null;
  const given = Object.keys(args ?? {});
  const known = sig.args ?? new Map();
  const extra = given.filter((k) => !known.has(k));
  const missing = [...known].filter(([k, f]) => !f.optional && !given.includes(k)).map(([k]) => k);
  if (!extra.length && !missing.length) return null;
  return {
    extra,
    missing,
    status: 404,
    body: {
      code: 'PGRST202',
      details: null,
      hint: null,
      message: `Could not find the function public.${fn}(${given.join(', ')}) in the schema cache`,
    },
  };
}

/* Một giá trị JS có hợp với một kiểu TS đơn giản trong `types.ts` không. */
function fitsType(v, type) {
  return type.split('|').map((t) => t.trim()).some((t) => {
    if (t === 'null') return v === null;
    if (t === 'string') return typeof v === 'string';
    if (t === 'number') return typeof v === 'number' && Number.isFinite(v);
    if (t === 'boolean') return typeof v === 'boolean';
    if (t === 'Json') return v !== undefined;
    return true; /* kiểu lạ: không đoán */
  });
}

/** Mọi chỗ kết quả của một fixture RPC lệch `Returns` trong `types.ts`. [] khi khớp. */
export function rpcReturnProblems(fn, value, fns = TYPE_FUNCTIONS) {
  const sig = fns.get(fn);
  if (!sig) return [`\`${fn}\` không có trong khối Functions của \`types.ts\``];
  const { returns } = sig;
  if (returns.kind === 'scalar') {
    return fitsType(value, returns.type) ? [] : [`\`${fn}\` trả ${JSON.stringify(value)?.slice(0, 60)}, mà \`types.ts\` hứa \`${returns.type}\``];
  }
  if (!Array.isArray(value)) return [`\`${fn}\` phải trả một MẢNG hàng (\`types.ts\`: \`{…}[]\`), ra ${typeof value}`];
  const out = [];
  value.forEach((row, i) => {
    for (const k of Object.keys(row)) if (!returns.cols.has(k)) out.push(`\`${fn}\` hàng ${i}: cột thừa \`${k}\``);
    for (const [k, f] of returns.cols) {
      if (!(k in row)) {
        if (!f.optional) out.push(`\`${fn}\` hàng ${i}: thiếu cột \`${k}\``);
      } else if (!fitsType(row[k], f.type)) {
        out.push(`\`${fn}\` hàng ${i}: \`${k}\` = ${JSON.stringify(row[k])}, mà \`types.ts\` hứa \`${f.type}\``);
      }
    }
  });
  return out;
}
