/**
 * Thế giới giả phải là một database HỢP LỆ: không khoá trùng, không tham chiếu treo.
 *
 *     node tools/fixture-integrity.mjs
 *
 * ── chuyện đã xảy ra (#16) ──
 *
 * Khi #7 (Recipe) rebase lên #8 (Progress), hai bài fixture cùng mang
 * `id: 'cp000000-…-000000000003'`. Git chỉ báo xung đột CHỮ, và cách gỡ tự
 * nhiên — "giữ cả hai" — để lại hai bài một id. Cổng vẫn xanh 264/264: không
 * bước nào hỏi. Trên màn hình, `id` là key của React (một thẻ bị nuốt hoặc vẽ
 * lẫn), `eq('id', …)` trả bài nào tuỳ thứ tự, và like / bình luận trỏ vào id ấy
 * gắn nhầm bài. Nó được bắt bằng MẮT.
 *
 * ── luật đọc từ MIGRATION, không khai tay ──
 *
 * Khoá chính, UNIQUE và khoá ngoại của từng bảng được đọc thẳng từ
 * `supabase/migrations/*.sql` — `CREATE TABLE`, `CREATE UNIQUE INDEX` (không có
 * `WHERE`), `ALTER TABLE … ADD CONSTRAINT`. Một danh sách khai tay sẽ lệch khỏi
 * schema vào ngày đầu tiên có người thêm bảng; đọc từ migration thì fixture bị
 * đo bằng đúng luật mà Postgres sẽ đo nó.
 *
 *   khoá       PK và mọi UNIQUE không trùng. Dòng THIẾU cột PK có DEFAULT thì
 *              bỏ qua (database sinh nó). Dòng có NULL ở cột UNIQUE bỏ qua —
 *              Postgres coi NULL là khác nhau.
 *   tham chiếu mọi khoá ngoại khác NULL trỏ vào một dòng CÓ THẬT. Bảng đích
 *              không có trong thế giới giả thì coi là rỗng: app đọc nó cũng
 *              nhận về rỗng, nên một id trỏ vào đó là treo. Riêng `auth.users`
 *              bỏ qua — thế giới giả không có bảng người dùng, app không đọc nó.
 *   CHECK      (#24) mọi CHECK của bảng, tính trên từng dòng bằng một bộ tính
 *              biểu thức nhỏ, ba giá trị như Postgres: chỉ `false` là hỏng,
 *              NULL thì qua. Tên ràng buộc đặt đúng như Postgres tự đặt, nên
 *              `DROP CONSTRAINT` / `ADD CONSTRAINT` về sau thay được bản cũ. Một
 *              CHECK bộ tính chưa hiểu là LỖI, không phải "bỏ qua".
 *   bảng lạ    một bảng fixture không có `CREATE TABLE` nào là một bảng app
 *              không thể có — tức một fixture đang đo thứ không tồn tại.
 *
 * ── và nó tự phá thử chính nó ──
 *
 * Bộ kiểm chạy lại trên BẢN SAO fixture đã bị làm hỏng theo ba cách — nhân
 * đôi một id, nhân đôi một khoá GHÉP, trỏ một like vào bài không tồn tại — và
 * phải bắt được cả ba. Xoá một luật đi thì bước này đỏ ở đây, không xanh im.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.resolve(NATIVE, '..', 'supabase', 'migrations');
const { FIXTURES } = await import(path.join(NATIVE, 'tools', 'live-world.mjs'));

/* ── schema: đọc từ migration ── */
function splitTop(body) {
  const parts = [];
  let d = 0;
  let cur = '';
  for (const ch of body) {
    if (ch === '(') d++;
    if (ch === ')') d--;
    if (ch === ',' && d === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
const cols = (s) => s.split(',').map((x) => x.trim().replace(/"/g, ''));
const refOf = (schemaName, table) => (schemaName && schemaName !== 'public' ? `${schemaName}.${table}` : table);

/* ── CHECK: một bộ tính biểu thức SQL NHỎ, ba giá trị như Postgres ──
   Chỉ những gì CHECK của repo này dùng: hằng, cột, so sánh, `~`, IN, IS
   [NOT] NULL, BETWEEN, AND/OR/NOT, + và −, và vài hàm chuỗi. Gặp thứ khác thì
   NÉM `Unsupported` — CHECK ấy được liệt kê là "không kiểm", không bị lờ đi.
   NULL là `null`: CHECK chỉ hỏng khi biểu thức ra đúng `false`. */
class Unsupported extends Error {}
function tokenize(src) {
  const out = [];
  const re = /\s*(?:('(?:[^']|'')*')|(\d+(?:\.\d+)?)|(<>|!=|<=|>=|::|[=<>~(),+\-*])|([A-Za-z_][\w.]*))/y;
  let i = 0;
  while (i < src.length) {
    if (/^\s*$/.test(src.slice(i))) break;
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Unsupported(`không đọc được "${src.slice(i, i + 12)}"`);
    i = re.lastIndex;
    if (m[1] !== undefined) out.push({ t: 'str', v: m[1].slice(1, -1).replace(/''/g, "'") });
    else if (m[2] !== undefined) out.push({ t: 'num', v: Number(m[2]) });
    else if (m[3] !== undefined) out.push({ t: 'op', v: m[3] });
    else out.push({ t: 'id', v: m[4] });
  }
  return out;
}
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);
const dayNum = (v) => Math.floor(Date.parse(v.slice(0, 10) + 'T00:00:00Z') / 86400000);
const FUNCS = {
  char_length: (s) => (s === null ? null : [...String(s)].length),
  length: (s) => (s === null ? null : [...String(s)].length),
  btrim: (s) => (s === null ? null : String(s).replace(/^ +| +$/g, '')),
  trim: (s) => (s === null ? null : String(s).replace(/^ +| +$/g, '')),
  lower: (s) => (s === null ? null : String(s).toLowerCase()),
  num_nonnulls: (...a) => a.filter((x) => x !== null).length,
};
export function evalCheck(expr, row) {
  const tk = tokenize(expr);
  let i = 0;
  const peek = (v) => tk[i] && (tk[i].v === v || (tk[i].t === 'id' && String(tk[i].v).toUpperCase() === v));
  const eat = (v) => { if (!peek(v)) throw new Unsupported(`chờ "${v}"`); i++; };
  const and3 = (a, b) => (a === false || b === false ? false : a === null || b === null ? null : true);
  const or3 = (a, b) => (a === true || b === true ? true : a === null || b === null ? null : false);
  const cmp = (a, op, b) => {
    if (a === null || b === null) return null;
    if (isDate(a) && isDate(b)) { a = dayNum(a); b = dayNum(b); }
    switch (op) {
      case '=': return a === b;
      case '<>': case '!=': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '~': return new RegExp(b).test(String(a));
    }
    throw new Unsupported(op);
  };
  function primary() {
    const x = tk[i++];
    if (!x) throw new Unsupported('hết biểu thức');
    if (x.t === 'str' || x.t === 'num') return x.v;
    if (x.t === 'op' && x.v === '(') { const v = orE(); eat(')'); return v; }
    if (x.t === 'op' && x.v === '-') { const v = primary(); return v === null ? null : -v; }
    if (x.t === 'id') {
      const up = x.v.toUpperCase();
      if (up === 'NULL') return null;
      if (up === 'TRUE') return true;
      if (up === 'FALSE') return false;
      if (peek('(')) {
        const f = FUNCS[x.v.toLowerCase()];
        if (!f) throw new Unsupported(`hàm ${x.v}()`);
        eat('(');
        const args = [];
        if (!peek(')')) { args.push(addE()); while (peek(',')) { i++; args.push(addE()); } }
        eat(')');
        return f(...args);
      }
      if (x.v.includes('.')) throw new Unsupported(`tên có schema ${x.v}`);
      const v = row[x.v];
      return v === undefined ? null : v;
    }
    throw new Unsupported(`"${x.v}"`);
  }
  function postfix() { let v = primary(); while (peek('::')) { i++; i++; } return v; }
  function addE() {
    let v = postfix();
    while (peek('+') || peek('-')) {
      const op = tk[i++].v; let b = postfix(); let a = v;
      if (a === null || b === null) { v = null; continue; }
      if (isDate(a)) a = dayNum(a); if (isDate(b)) b = dayNum(b);
      v = op === '+' ? a + b : a - b;
    }
    return v;
  }
  function cmpE() {
    const a = addE();
    if (peek('IS')) {
      i++; const neg = peek('NOT'); if (neg) i++; eat('NULL');
      return neg ? a !== null : a === null;
    }
    let neg = false;
    if (peek('NOT') && tk[i + 1] && ['IN', 'BETWEEN'].includes(String(tk[i + 1].v).toUpperCase())) { neg = true; i++; }
    if (peek('IN')) {
      i++; eat('('); const list = [addE()]; while (peek(',')) { i++; list.push(addE()); } eat(')');
      if (a === null) return null;
      const r = list.includes(a) ? true : list.includes(null) ? null : false;
      return neg ? (r === null ? null : !r) : r;
    }
    if (peek('BETWEEN')) {
      i++; const lo = addE(); eat('AND'); const hi = addE();
      const r = and3(cmp(a, '>=', lo), cmp(a, '<=', hi));
      return neg ? (r === null ? null : !r) : r;
    }
    const x = tk[i];
    if (x && x.t === 'op' && ['=', '<>', '!=', '<', '<=', '>', '>=', '~'].includes(x.v)) { i++; return cmp(a, x.v, addE()); }
    return a;
  }
  function notE() { if (peek('NOT')) { i++; const v = notE(); return v === null ? null : !v; } return cmpE(); }
  function andE() { let v = notE(); while (peek('AND')) { i++; v = and3(v, notE()); } return v; }
  function orE() { let v = andE(); while (peek('OR')) { i++; v = or3(v, andE()); } return v; }
  const v = orE();
  if (i !== tk.length) throw new Unsupported(`thừa "${tk[i].v}"`);
  return v;
}

/** Nội dung trong cặp ngoặc bắt đầu ở `s[open]` (là '('). */
function balanced(s, open) {
  let d = 0;
  for (let j = open; j < s.length; j++) {
    if (s[j] === "'") { j = s.indexOf("'", j + 1); while (s[j + 1] === "'") j = s.indexOf("'", j + 2); continue; }
    if (s[j] === '(') d++;
    else if (s[j] === ')' && --d === 0) return s.slice(open + 1, j);
  }
  return null;
}

export function readSchema(dir = MIG) {
  const schema = {};
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const s = readFileSync(path.join(dir, f), 'utf8').replace(/--[^\n]*/g, '');
    for (const m of s.matchAll(/CREATE TABLE (?:IF NOT EXISTS )?(?:public\.)?"?(\w+)"?\s*\(/gi)) {
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (depth && i < s.length) {
        if (s[i] === '(') depth++;
        else if (s[i] === ')') depth--;
        i++;
      }
      const t = { file: f, pk: null, pkDefault: false, uniques: [], fks: [], checks: {}, defaults: {} };
      const table = m[1];
      let anon = 0;
      for (const p of splitTop(s.slice(start, i - 1))) {
        let mm;
        /* CHECK: tên đặt ĐÚNG như Postgres tự đặt, để `DROP CONSTRAINT` về sau
           gỡ được nó — `<bảng>_<cột>_check` cho CHECK trên một cột,
           `<bảng>_check`, `<bảng>_check1`… cho CHECK cấp bảng không tên. */
        const ci = p.search(/\bCHECK\s*\(/i);
        if (ci >= 0) {
          const expr = balanced(p, p.indexOf('(', ci));
          const named = p.match(/^CONSTRAINT (\w+)\s+CHECK/i);
          const colDef = !/^(CONSTRAINT|CHECK)\b/i.test(p) && p.match(/^"?(\w+)"?\s+/);
          const name = named ? named[1] : colDef ? `${table}_${colDef[1]}_check` : `${table}_check${anon++ || ''}`;
          if (expr) t.checks[name] = expr;
          if (!colDef) continue;
        }
        if ((mm = p.match(/^(?:CONSTRAINT \w+ )?PRIMARY KEY\s*\(([^)]+)\)/i))) t.pk = cols(mm[1]);
        else if ((mm = p.match(/^(?:CONSTRAINT \w+ )?UNIQUE\s*\(([^)]+)\)/i))) t.uniques.push(cols(mm[1]));
        else if ((mm = p.match(/^(?:CONSTRAINT \w+ )?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?\s*\(([^)]+)\)/i)))
          t.fks.push({ col: mm[1].trim(), ref: refOf(mm[2], mm[3]), refCol: mm[4].trim() });
        else if ((mm = p.match(/^"?(\w+)"?\s+/)) && !/^(CONSTRAINT|CHECK|EXCLUDE)\b/i.test(p)) {
          const col = mm[1];
          /* DEFAULT của cột (#52): máy chủ giả điền nó cho một INSERT không gửi cột
             ấy, như Postgres. Chỉ những dạng tính được ở phía client. */
          const dm = p.match(/\bDEFAULT\s+(now\(\)|gen_random_uuid\(\)|auth\.uid\(\)|'([^']*)'|true|false|-?\d+(?:\.\d+)?)/i);
          if (dm) {
            const d = dm[1].toLowerCase();
            t.defaults[col] = d === 'now()' ? { now: true } : d === 'gen_random_uuid()' ? { uuid: true } : d === 'auth.uid()' ? { uid: true }
              : dm[2] !== undefined ? { value: dm[2] } : d === 'true' ? { value: true } : d === 'false' ? { value: false } : { value: Number(dm[1]) };
          }
          if (/PRIMARY KEY/i.test(p)) {
            t.pk = [col];
            t.pkDefault = /\bDEFAULT\b/i.test(p);
          }
          if (/\bUNIQUE\b/i.test(p)) t.uniques.push([col]);
          const r = p.match(/REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?\s*\((\w+)\)/i);
          if (r) t.fks.push({ col, ref: refOf(r[1], r[2]), refCol: r[3] });
        }
      }
      schema[m[1]] = t;
    }
    for (const m of s.matchAll(/CREATE UNIQUE INDEX[^;]*?\bON (?:public\.)?"?(\w+)"?\s*(?:USING \w+\s*)?\(([^)]+)\)([^;]*);/gi)) {
      if (/\bWHERE\b/i.test(m[3]) || !schema[m[1]]) continue; // chỉ mục một phần: chỉ duy nhất khi thoả điều kiện
      schema[m[1]].uniques.push(cols(m[2]));
    }
    for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?(?:public\.)?"?(\w+)"?\s+ADD CONSTRAINT \w+\s+(PRIMARY KEY|UNIQUE)\s*\(([^)]+)\)/gi)) {
      if (!schema[m[1]]) continue;
      if (/PRIMARY/i.test(m[2])) schema[m[1]].pk = cols(m[3]);
      else schema[m[1]].uniques.push(cols(m[3]));
    }
    for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?(?:public\.)?"?(\w+)"?\s+DROP CONSTRAINT (?:IF EXISTS )?"?(\w+)"?/gi)) {
      if (schema[m[1]]) delete schema[m[1]].checks[m[2]];
    }
    for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?(?:public\.)?"?(\w+)"?\s+ADD CONSTRAINT "?(\w+)"?\s+CHECK\s*\(/gi)) {
      if (!schema[m[1]]) continue;
      const expr = balanced(s, m.index + m[0].length - 1);
      if (expr) schema[m[1]].checks[m[2]] = expr;
    }
    for (const m of s.matchAll(/ALTER TABLE (?:ONLY )?(?:public\.)?"?(\w+)"?\s+ADD CONSTRAINT \w+\s+FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?\s*\(([^)]+)\)/gi)) {
      if (!schema[m[1]]) continue;
      schema[m[1]].fks.push({ col: m[2].trim(), ref: refOf(m[3], m[4]), refCol: m[5].trim() });
    }
  }
  return schema;
}

/* ── bộ kiểm ── */
const absent = (v) => v === undefined || v === null;
const show = (v) => (typeof v === 'string' ? `'${v}'` : JSON.stringify(v));

export function check(fixtures, schema) {
  const problems = [];
  let keys = 0;
  let refs = 0;
  let authRefs = 0;
  let checksRun = 0;
  const skipped = new Set();
  for (const [table, rows] of Object.entries(fixtures)) {
    if (!Array.isArray(rows)) continue;
    const t = schema[table];
    if (!t) {
      problems.push(`bảng lạ: \`${table}\` có trong thế giới giả nhưng không migration nào tạo nó`);
      continue;
    }
    const keyList = [...(t.pk ? [{ c: t.pk, pk: true }] : []), ...t.uniques.map((c) => ({ c, pk: false }))];
    for (const { c, pk } of keyList) {
      const seen = new Map();
      rows.forEach((r, i) => {
        const vals = c.map((k) => r?.[k]);
        if (vals.some(absent)) {
          /* PK thiếu mà có DEFAULT: database sinh nó. PK thiếu mà KHÔNG có
             DEFAULT là một dòng Postgres từ chối. UNIQUE có NULL: bỏ qua. */
          if (pk && !(c.length === 1 && t.pkDefault))
            problems.push(`thiếu khoá chính: \`${table}\` dòng ${i} không có (${c.join(', ')}), và cột ấy không có DEFAULT`);
          return;
        }
        keys++;
        const k = JSON.stringify(vals);
        if (seen.has(k))
          problems.push(`khoá trùng: \`${table}\` (${c.join(', ')}) = ${vals.map(show).join(', ')} — dòng ${seen.get(k)} và dòng ${i}`);
        else seen.set(k, i);
      });
    }
    for (const [name, expr] of Object.entries(t.checks ?? {})) {
      rows.forEach((r, i) => {
        let v;
        try {
          v = evalCheck(expr, r ?? {});
        } catch (e) {
          if (!(e instanceof Unsupported)) throw e;
          skipped.add(`${table}.${name}`);
          return;
        }
        checksRun++;
        if (v === false) problems.push(`vi phạm CHECK: \`${table}\` dòng ${i} — \`${name}\`: ${expr.replace(/\s+/g, ' ')}`);
      });
    }
    for (const fk of t.fks) {
      if (fk.ref === 'auth.users') {
        authRefs++;
        continue;
      }
      const target = Array.isArray(fixtures[fk.ref]) ? fixtures[fk.ref] : [];
      const have = new Set(target.map((r) => r?.[fk.refCol]).filter((v) => !absent(v)).map(String));
      rows.forEach((r, i) => {
        const v = r?.[fk.col];
        if (absent(v)) return;
        refs++;
        if (!have.has(String(v)))
          problems.push(
            `tham chiếu treo: \`${table}\` dòng ${i}, ${fk.col} = ${show(v)} → \`${fk.ref}.${fk.refCol}\` không có dòng nào như vậy` +
              (Array.isArray(fixtures[fk.ref]) ? '' : ` (thế giới giả không có bảng \`${fk.ref}\`)`),
          );
      });
    }
  }
  return { problems, keys, refs, authRefs, checksRun, skipped: [...skipped].sort() };
}

/* Phần dưới là BƯỚC CỔNG: chỉ chạy khi tệp được gọi thẳng (`node tools/fixture-integrity.mjs`).
   `live.mjs` import `readSchema` để máy chủ giả biết khoá và DEFAULT (#52), và một
   lần import không được chạy bước cổng hay `process.exit` giữa chừng. */
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const schema = readSchema();
  const real = check(FIXTURES, schema);
  const problems = [...real.problems];

  /* ── bộ kiểm tự phá thử chính nó, trên BẢN SAO ── */
  const clone = () => JSON.parse(JSON.stringify(FIXTURES));
  const selfTest = [
    ['nhân đôi id một bài', (f) => f.community_posts.push({ ...f.community_posts[0] }), /khoá trùng: `community_posts` \(id\)/],
    ['nhân đôi khoá GHÉP của một lượt thích', (f) => f.community_likes.push({ ...f.community_likes[0] }), /khoá trùng: `community_likes` \(post_id, user_id\)/],
    ['trỏ một lượt thích vào bài không tồn tại', (f) => (f.community_likes[0].post_id = 'cp-khong-ton-tai'), /tham chiếu treo: `community_likes` dòng 0, post_id/],
    ['một món trong bữa trỏ vào bữa không tồn tại', (f) => (f.meal_entry_items[0].meal_entry_id = 'm-khong-co'), /tham chiếu treo: `meal_entry_items`/],
    /* #24: một dòng Postgres sẽ từ chối vì CHECK */
    ['loại bài gõ nhầm', (f) => (f.community_posts[0].kind = 'recipie'), /vi phạm CHECK: `community_posts` dòng 0 — `community_posts_kind_check`/],
    ['handle có chữ hoa và dấu cách', (f) => (f.community_profiles[0].handle = 'Linh Pham'), /vi phạm CHECK: `community_profiles` dòng 0 — `community_profiles_handle_check`/],
    ['bình luận chỉ có dấu cách', (f) => (f.community_comments[0].body = '   '), /vi phạm CHECK: `community_comments` dòng 0 — `community_comments_body_check`/],
  ];
  for (const [label, mutate, want] of selfTest) {
    const f = clone();
    mutate(f);
    const got = check(f, schema).problems;
    if (!got.some((p) => want.test(p)))
      problems.push(`bộ kiểm đã mất răng: phá thử "${label}" mà không bắt được — luật tương ứng đã hỏng hoặc bị xoá`);
  }
  /* Và đủ luật để có nghĩa: một bộ đọc schema hỏng (đọc ra 0 khoá ngoại) sẽ xanh vì không kiểm gì. */
  for (const [t, c, ref] of [
    ['community_posts', 'author_id', 'community_profiles'],
    ['community_likes', 'post_id', 'community_posts'],
    ['community_comments', 'post_id', 'community_posts'],
    ['meal_entry_items', 'meal_entry_id', 'meal_entries'],
  ]) {
    if (!schema[t]?.fks.some((k) => k.col === c && k.ref === ref))
      problems.push(`bộ đọc migration không thấy khoá ngoại \`${t}.${c}\` → \`${ref}\` — nó đang đọc sai schema, nên mọi kết luận khác vô nghĩa`);
  }

  /* CHECK bị THAY về sau phải ra bản mới nhất: `post_kinds` gỡ
     `community_posts_kind_check` ('workout') rồi thêm lại với ba loại. Đọc sai
     chỗ này thì mọi bài Progress/Recipe trong fixture đều "vi phạm". */
  if (!/'recipe'/.test(schema.community_posts?.checks?.community_posts_kind_check ?? ''))
    problems.push('bộ đọc migration không ra bản MỚI NHẤT của `community_posts_kind_check` — `DROP CONSTRAINT` / `ADD CONSTRAINT` về sau đã bị bỏ qua');
  for (const name of real.skipped) problems.push(`CHECK không kiểm được: \`${name}\` — bộ tính biểu thức chưa hiểu nó; thêm vào bộ tính, đừng bỏ qua im lặng`);

  if (problems.length) {
    console.error('dữ liệu thế giới giả CÓ LỖI:\n');
    for (const p of problems) console.error(`  • ${p}`);
    process.exit(1);
  }
  const tables = Object.values(FIXTURES).filter(Array.isArray).length;
  console.log(
    `dữ liệu thế giới giả OK — ${tables} bảng, ${real.keys} giá trị khoá không trùng, ${real.refs} tham chiếu đều trỏ vào ` +
      `dòng có thật (${real.authRefs} khoá ngoại tới auth.users bỏ qua: thế giới giả không có bảng người dùng), và ${real.checksRun} ` +
      'lần tính CHECK đều không ra false (logic ba giá trị như Postgres; không CHECK nào bị bỏ qua). Khoá, khoá ngoại và CHECK ' +
      'đọc từ chính migration, không khai tay — kể cả CHECK bị gỡ rồi thêm lại về sau; và bộ kiểm tự phá thử ' +
      `${selfTest.length} cách trên bản sao fixture (id trùng, khoá ghép trùng, hai kiểu tham chiếu treo, ba kiểu vi phạm CHECK) — ` +
      'cách nào cũng bị bắt',
  );
}
