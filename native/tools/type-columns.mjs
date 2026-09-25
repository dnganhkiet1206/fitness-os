/**
 * Khối `Tables` của `types.ts` khớp cột trong migration; `TYPES_STALE` tự hết hạn (#90).
 *
 * ── vì sao ──
 *
 * #51 buộc khối `Functions` viết tay khớp migration. Khối `Tables` có cùng rủi
 * ro: `postgrest-select.mjs` dùng cột `Row` của `types.ts` để đánh 400 mọi
 * `select=` hỏi một cột "không có thật" (#35). `types.ts` thiếu một cột có thật
 * thì máy chủ giả đánh OAN; còn giữ một cột migration không có thì máy chủ giả
 * THA, trong khi Postgres thật trả 400.
 *
 * `TYPES_STALE` là danh sách tay những cột "có thật mà `types.ts` chưa sinh
 * lại", mỗi mục trích một tệp migration. Chưa bước nào kiểm nó. Lần đầu luật này
 * chạy, mục duy nhất — `profiles.coins`, trích `20260810120000_economy_server_
 * authority.sql` — hoá ra KHÔNG có thật: không migration nào tạo cột ấy (số dư
 * xu là tổng `mascot_transactions.amount`), nó chỉ có trong fixture của
 * `live-world.mjs`, và ngoại lệ đã che một cột ma của fixture bằng một nguồn
 * trích sai.
 *
 * ── luật ──
 *
 * Cột đọc từ migration bằng `readSchema` (`fixture-integrity.mjs`: CREATE TABLE
 * + ALTER TABLE ADD/DROP/RENAME COLUMN), cột `types.ts` bằng `readTypeColumns`
 * (`postgrest-select.mjs`) — không bộ đọc thứ ba. Với mỗi bảng có ở cả hai:
 *   · cột migration có mà `Row` thiếu → đỏ, trừ khi có trong `TYPES_STALE`;
 *   · cột `Row` có mà migration không có → đỏ.
 * Mỗi mục `TYPES_STALE`: cột phải có trong migration VÀ tệp được trích phải
 * nhắc nó; `types.ts` đã có cột ấy → đỏ "hết hạn, gỡ đi".
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSchema } from './fixture-integrity.mjs';
import { readTypeColumns, TYPES_STALE } from './postgrest-select.mjs';

const NATIVE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIG = path.join(NATIVE, '..', 'supabase', 'migrations');
const TYPES = 'src/integrations/supabase/types.ts';

export function check(types, schema, stale, readMig = (f) => readFileSync(path.join(MIG, f), 'utf8')) {
  const out = [];
  const typeCols = readTypeColumns(types);
  let tables = 0;
  let cols = 0;
  for (const [table, have] of typeCols) {
    const sch = schema[table];
    if (!sch) continue; // bảng không có CREATE TABLE trong repo (dựng ngoài migration): không có gì để so
    tables++;
    cols += have.size;
    const mig = new Set(sch.columns);
    for (const c of mig) {
      if (!have.has(c) && !(`${table}.${c}` in stale)) out.push(`${table}.${c}: có trong migration mà Row của ${TYPES} thiếu — máy chủ giả sẽ đánh 400 oan một select= hỏi nó`);
    }
    for (const c of have) {
      if (!mig.has(c)) out.push(`${table}.${c}: có trong Row của ${TYPES} mà không migration nào tạo — máy chủ giả sẽ tha một select= mà Postgres thật trả 400`);
    }
  }
  for (const [key, file] of Object.entries(stale)) {
    const [table, col] = key.split('.');
    if (typeCols.get(table)?.has(col)) out.push(`TYPES_STALE['${key}']: ${TYPES} đã có cột ấy — ngoại lệ hết hạn, gỡ đi`);
    if (!schema[table]?.columns.includes(col)) {
      out.push(`TYPES_STALE['${key}']: không migration nào tạo cột ấy — ngoại lệ không tra được nguồn (trích ${file})`);
      continue;
    }
    let text = '';
    try {
      text = readMig(file);
    } catch {
      /* tệp trích không có */
    }
    if (!new RegExp(`\\b${col}\\b`).test(text.replace(/--[^\n]*/g, ''))) out.push(`TYPES_STALE['${key}']: tệp được trích (${file}) không nhắc cột ấy`);
  }
  return { out, tables, cols };
}

const types = readFileSync(path.join(NATIVE, TYPES), 'utf8');
const schema = readSchema();
const { out: problems, tables, cols } = check(types, schema, TYPES_STALE);
if (tables < 30) problems.push(`chỉ so được ${tables} bảng — bộ đọc hỏng, đừng tin kết quả`);

/* ── thử ngược, trong bộ nhớ ── */
{
  const base = problems.length;
  const probe = (label, n) => {
    if (n == null) problems.push(`thử ngược hỏng: "${label}" không áp được`);
    else if (n <= base) problems.push(`thử ngược hỏng: ${label} mà luật vẫn xanh`);
  };
  const dropBadges = types.replace(/^( {10})show_badges: boolean\n/m, '');
  probe('bỏ show_badges khỏi Row của community_settings', dropBadges === types ? null : check(dropBadges, schema, TYPES_STALE).out.length);
  const fake = types.replace(/^( {6}community_settings: \{\n {8}Row: \{\n)/m, '$1          made_up_column: string\n');
  probe('thêm một cột giả vào Row', fake === types ? null : check(fake, schema, TYPES_STALE).out.length);
  probe('một ngoại lệ TYPES_STALE trỏ tới cột không có thật', check(types, schema, { ...TYPES_STALE, 'profiles.coins': '20260810120000_economy_server_authority.sql' }).out.length);
  const withBadgesStale = { ...TYPES_STALE, 'community_settings.show_badges': '20261001120000_community_badges.sql' };
  probe('ngoại lệ cho một cột types.ts đã có (hết hạn)', check(types, schema, withBadgesStale).out.length);
}

if (problems.length) {
  console.log('Tables của types.ts lệch migration:\n');
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `cột bảng OK — ${tables} bảng có ở cả types.ts lẫn migration, ${cols} cột Row: không cột migration nào thiếu trong Row ` +
    `(ngoài ${Object.keys(TYPES_STALE).length} ngoại lệ TYPES_STALE), không cột Row nào migration không tạo; mỗi ngoại lệ có ` +
    'thật, được tệp trích nhắc tới, và chưa hết hạn. Thử ngược: bỏ một cột có thật, thêm một cột giả, ngoại lệ trỏ tới cột ' +
    'ma (đúng như profiles.coins từng làm), ngoại lệ hết hạn — mỗi cái đỏ',
);
