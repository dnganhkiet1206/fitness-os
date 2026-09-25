/**
 * Khối `Functions` viết tay của `types.ts` phải khớp chữ ký hàm trong migration (#51).
 *
 * ── vì sao ──
 *
 * Khối ấy được VIẾT TAY (chú thích đầu khối nói vậy), và từ #38 máy chủ giả của
 * `live.mjs` tin nó ở hai chỗ: đối số không khớp `Args` thì nhận 404 PGRST202,
 * và fixture RPC phải khớp `Returns` (`fixture-schema.mjs`). Nên `types.ts` lệch
 * migration thì máy chủ giả lệch THEO: thêm một đối số ở migration mà quên ở
 * `types.ts` thì `live.mjs` đỏ sai; bỏ một cột khỏi `RETURNS TABLE` mà
 * `types.ts` còn giữ thì fixture cứ trả cột ấy. `tsc` không thấy được — nó chỉ
 * đọc `types.ts`.
 *
 * ── luật ──
 *
 * Với mỗi hàm trong `Functions`, đọc MỌI bản `CREATE [OR REPLACE] FUNCTION` của
 * nó theo thứ tự migration: bản cùng kiểu đối số thì bản sau thay bản trước
 * (đúng như Postgres), bản khác kiểu đối số là một OVERLOAD cùng sống
 * (`buy_streak_freeze` còn bản không đối số cho app đã cài). Chỉ cần MỘT bản
 * đang sống khớp:
 *   · tên đối số khớp `Args`; có `DEFAULT` ⇔ có `?`; kiểu đổi được sang kiểu TS;
 *   · `RETURNS TABLE (…)` ⇔ `Returns: {…}[]` cùng tập cột, cùng kiểu;
 *     `RETURNS <scalar>` ⇔ kiểu TS tương ứng.
 * Và mọi `supabase.rpc('…')` trong `src/` phải gọi một hàm có trong `Functions`.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { readTypeFunctions } from './postgrest-select.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.join(NATIVE, '..', 'supabase', 'migrations');
const TYPES = 'src/integrations/supabase/types.ts';

/** Kiểu SQL (đã chuẩn hoá) → kiểu TS mà `types.ts` dùng. null = không biết, không đoán. */
const SQL_TS = [
  [/^(integer|int|int2|int4|int8|bigint|smallint|numeric(\(.*\))?|real|double precision|float4|float8)$/, 'number'],
  [/^(text|uuid|varchar|character varying(\(.*\))?|date|timestamptz|timestamp( with(out)? time zone)?|time|interval)$/, 'string'],
  [/^(boolean|bool)$/, 'boolean'],
  [/^(jsonb|json)$/, 'Json'],
];
export function tsOf(sqlType) {
  const t = sqlType.toLowerCase().replace(/\s+/g, ' ').trim();
  const arr = t.endsWith('[]');
  const base = arr ? t.slice(0, -2).trim() : t;
  const hit = SQL_TS.find(([re]) => re.test(base))?.[1] ?? null;
  return hit && arr ? `${hit}[]` : hit;
}
/** Kiểu TS của `types.ts` có nhận kiểu `ts` không — `| null` bỏ qua: SQL không khai báo NOT NULL cho đối số hay cột kết quả. */
const fits = (tsType, ts) => tsType.split('|').map((x) => x.trim()).filter((x) => x !== 'null').includes(ts);

/** Tách ở dấu phẩy CẤP NGOÀI (bỏ qua ngoặc và chuỗi). */
function splitTop(s) {
  const out = [];
  let depth = 0;
  let quote = false;
  let cur = '';
  for (const ch of s) {
    if (ch === "'") quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** `p_a uuid, p_b text DEFAULT ''` → [{ name, type, hasDefault }] */
export function parseArgs(s) {
  return splitTop(s).map((a) => {
    const m = /^(?:IN\s+)?(\w+)\s+([\s\S]+?)(\s+(DEFAULT|=)\s+[\s\S]*)?$/i.exec(a.replace(/\s+/g, ' '));
    return { name: m[1], type: m[2].trim(), hasDefault: !!m[3] };
  });
}

/** Mọi định nghĩa của những hàm có tên trong `names`, theo thứ tự migration. */
export function sqlSignatures(migrations, names) {
  const live = new Map(); // tên → Map(khoá kiểu đối số → định nghĩa)
  for (const [file, raw] of migrations) {
    const sql = raw.replace(/--[^\n]*/g, '');
    for (const m of sql.matchAll(/CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?(\w+)"?\s*\(/gi)) {
      if (!names.has(m[1])) continue;
      let i = m.index + m[0].length;
      for (let d = 1; d && i < sql.length; i++) {
        if (sql[i] === '(') d++;
        else if (sql[i] === ')') d--;
      }
      const args = parseArgs(sql.slice(m.index + m[0].length, i - 1));
      const tail = sql.slice(i);
      let returns;
      const table = /^\s*RETURNS\s+TABLE\s*\(/i.exec(tail);
      if (table) {
        let j = table[0].length;
        for (let d = 1; d && j < tail.length; j++) {
          if (tail[j] === '(') d++;
          else if (tail[j] === ')') d--;
        }
        returns = { kind: 'rows', cols: parseArgs(tail.slice(table[0].length, j - 1)) };
      } else {
        const sc = /^\s*RETURNS\s+(SETOF\s+)?([\w ]+?(?:\[\])?)\s*(?:LANGUAGE|AS|SECURITY|STABLE|VOLATILE|IMMUTABLE|SET|STRICT|CALLED|\n)/i.exec(tail);
        returns = sc ? { kind: sc[1] ? 'setof' : 'scalar', type: sc[2].trim() } : { kind: 'unknown' };
      }
      const key = args.map((a) => tsOf(a.type) ?? a.type.toLowerCase()).join(',');
      const byName = live.get(m[1]) ?? live.set(m[1], new Map()).get(m[1]);
      byName.set(key, { file, args, returns });
    }
  }
  return live;
}

/** Những chỗ một định nghĩa SQL lệch chữ ký trong `types.ts`. [] khi khớp. */
export function mismatch(sig, def) {
  const out = [];
  const tsArgs = sig.args ?? new Map();
  const names = new Set(def.args.map((a) => a.name));
  for (const [n] of tsArgs) if (!names.has(n)) out.push(`Args có \`${n}\` mà SQL không có`);
  for (const a of def.args) {
    const t = tsArgs.get(a.name);
    if (!t) out.push(`SQL có đối số \`${a.name}\`${a.hasDefault ? ' (DEFAULT)' : ''} mà Args không có`);
    else {
      if (t.optional !== a.hasDefault) out.push(`\`${a.name}\`: SQL ${a.hasDefault ? 'có' : 'không có'} DEFAULT mà Args ${t.optional ? 'có' : 'không có'} \`?\``);
      const ts = tsOf(a.type);
      if (ts && !fits(t.type, ts)) out.push(`\`${a.name}\`: SQL \`${a.type}\` (→ ${ts}) mà Args ghi \`${t.type}\``);
    }
  }
  const r = sig.returns;
  if (def.returns.kind === 'rows') {
    if (r.kind !== 'rows') out.push(`SQL trả RETURNS TABLE mà Returns là \`${r.type}\``);
    else {
      const cols = new Map(def.returns.cols.map((c) => [c.name, c.type]));
      for (const [n] of r.cols) if (!cols.has(n)) out.push(`Returns có cột \`${n}\` mà RETURNS TABLE không có`);
      for (const [n, t] of cols) {
        const f = r.cols.get(n);
        if (!f) out.push(`RETURNS TABLE có cột \`${n}\` mà Returns không có`);
        else if (tsOf(t) && !fits(f.type, tsOf(t))) out.push(`cột \`${n}\`: SQL \`${t}\` (→ ${tsOf(t)}) mà Returns ghi \`${f.type}\``);
      }
    }
  } else if (def.returns.kind === 'scalar') {
    const ts = tsOf(def.returns.type);
    if (r.kind !== 'scalar') out.push(`SQL trả \`${def.returns.type}\` mà Returns là một bảng`);
    else if (ts && !fits(r.type, ts)) out.push(`SQL trả \`${def.returns.type}\` (→ ${ts}) mà Returns ghi \`${r.type}\``);
  } else out.push(`không đọc được RETURNS của bản ở ${def.file}`);
  return out;
}

/** Vế chính: trả danh sách sai. */
export function check(types, migrations, srcFiles) {
  const out = [];
  const fns = readTypeFunctions(types);
  if (fns.size < 10) out.push(`chỉ đọc được ${fns.size} hàm trong khối Functions — bộ đọc hỏng, đừng tin kết quả`);
  const live = sqlSignatures(migrations, new Set(fns.keys()));
  for (const [name, sig] of fns) {
    const defs = [...(live.get(name)?.values() ?? [])];
    if (!defs.length) {
      out.push(`\`${name}\` có trong Functions của ${TYPES} mà không migration nào định nghĩa nó`);
      continue;
    }
    const tries = defs.map((d) => [d, mismatch(sig, d)]);
    if (tries.some(([, m]) => m.length === 0)) continue;
    const [d, m] = tries.at(-1);
    out.push(
      `\`${name}\`: không bản nào đang sống khớp ${TYPES}` +
        (defs.length > 1 ? ` (${defs.length} bản; bản sau cùng ở ${d.file})` : ` (${d.file})`) +
        ` — ${m.join('; ')}`,
    );
  }
  for (const [f, src] of srcFiles) {
    for (const m of src.matchAll(/\.rpc\(\s*['"](\w+)['"]/g)) {
      if (!fns.has(m[1])) out.push(`${f}: gọi rpc('${m[1]}') mà hàm ấy không có trong Functions của ${TYPES}`);
    }
  }
  return { out, fns: fns.size };
}

const types = readFileSync(path.join(NATIVE, TYPES), 'utf8');
const migrations = readdirSync(MIG)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => [f, readFileSync(path.join(MIG, f), 'utf8')]);
const srcFiles = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'src'], { cwd: NATIVE, encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => [f, readFileSync(path.join(NATIVE, f), 'utf8')]);

const { out: problems, fns } = check(types, migrations, srcFiles);
const calls = srcFiles.reduce((n, [, s]) => n + (s.match(/\.rpc\(\s*['"]\w+['"]/g) ?? []).length, 0);

/* ── thử ngược, trong bộ nhớ ── */
{
  const base = problems.length;
  const bentMig = (file, from, to) => {
    const i = migrations.findIndex(([f]) => f.includes(file));
    if (i < 0 || !migrations[i][1].includes(from)) return null;
    const copy = migrations.slice();
    copy[i] = [copy[i][0], copy[i][1].replace(from, to)];
    return check(types, copy, srcFiles).out.length;
  };
  const probe = (label, n) => {
    if (n == null) problems.push(`thử ngược hỏng: "${label}" không áp được`);
    else if (n <= base) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  };
  probe(
    'thêm một đối số DEFAULT vào share_workout',
    bentMig('_community_foundation', '  p_minutes    integer DEFAULT NULL\n)', '  p_minutes    integer DEFAULT NULL,\n  p_extra      text DEFAULT NULL\n)'),
  );
  /* Bẻ định nghĩa ĐANG CÓ HIỆU LỰC: #88 định nghĩa lại hàm ở một migration sau,
     và bẻ tệp #42 thì bản sau ghi đè — phép thử xanh mà không đo gì. */
  probe(
    'bỏ một cột khỏi RETURNS TABLE của community_user_badges',
    bentMig('20261001140000_community_badges_no_date', 'RETURNS TABLE (challenge_id uuid, title text)', 'RETURNS TABLE (challenge_id uuid)'),
  );
  probe(
    'đổi kiểu trả của claim_community_challenge sang text',
    bentMig('_community_challenges', 'RETURNS integer\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_uid     uuid := auth.uid();\n  c ', 'RETURNS text\nLANGUAGE plpgsql\nSECURITY DEFINER\nSET search_path = public\nAS $$\nDECLARE\n  v_uid     uuid := auth.uid();\n  c '),
  );
  const noBadges = types.replace(/ {6}community_user_badges: \{\n[\s\S]*?\n {6}\}\n/, '');
  probe('bỏ community_user_badges khỏi Functions trong khi app vẫn gọi nó', noBadges === types ? null : check(noBadges, migrations, srcFiles).out.length);
}

if (problems.length) {
  console.log('Functions của types.ts lệch migration:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `chữ ký RPC OK — ${fns} hàm trong khối Functions viết tay của types.ts đều có một bản đang sống trong migration khớp ` +
    'tên đối số, DEFAULT ⇔ `?`, kiểu đối số, và cột/kiểu của RETURNS (bản sau thay bản trước cùng kiểu đối số; overload ' +
    `khác kiểu cùng sống); ${calls} lời gọi supabase.rpc trong src/ đều gọi hàm có trong Functions. Thử ngược: thêm một ` +
    'đối số DEFAULT, bỏ một cột RETURNS TABLE, đổi kiểu trả, bỏ một hàm app đang gọi — mỗi cái đỏ',
);
