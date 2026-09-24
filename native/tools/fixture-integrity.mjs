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
import { fileURLToPath } from 'node:url';

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
      const t = { file: f, pk: null, pkDefault: false, uniques: [], fks: [] };
      for (const p of splitTop(s.slice(start, i - 1))) {
        let mm;
        if ((mm = p.match(/^(?:CONSTRAINT \w+ )?PRIMARY KEY\s*\(([^)]+)\)/i))) t.pk = cols(mm[1]);
        else if ((mm = p.match(/^(?:CONSTRAINT \w+ )?UNIQUE\s*\(([^)]+)\)/i))) t.uniques.push(cols(mm[1]));
        else if ((mm = p.match(/^(?:CONSTRAINT \w+ )?FOREIGN KEY\s*\(([^)]+)\)\s*REFERENCES\s+(?:(\w+)\.)?"?(\w+)"?\s*\(([^)]+)\)/i)))
          t.fks.push({ col: mm[1].trim(), ref: refOf(mm[2], mm[3]), refCol: mm[4].trim() });
        else if ((mm = p.match(/^"?(\w+)"?\s+/)) && !/^(CONSTRAINT|CHECK|EXCLUDE)\b/i.test(p)) {
          const col = mm[1];
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
  return { problems, keys, refs, authRefs };
}

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

if (problems.length) {
  console.error('dữ liệu thế giới giả CÓ LỖI:\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
const tables = Object.values(FIXTURES).filter(Array.isArray).length;
console.log(
  `dữ liệu thế giới giả OK — ${tables} bảng, ${real.keys} giá trị khoá không trùng, ${real.refs} tham chiếu đều trỏ vào ` +
    `dòng có thật (${real.authRefs} khoá ngoại tới auth.users bỏ qua: thế giới giả không có bảng người dùng). Khoá và khoá ` +
    `ngoại đọc từ chính migration, không khai tay; và bộ kiểm tự phá thử ${selfTest.length} cách (id trùng, khoá ghép trùng, ` +
    'hai kiểu tham chiếu treo) trên bản sao fixture — cả bốn đều bị bắt',
);
