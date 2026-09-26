/**
 * Mẫu "nút phá huỷ" của lượt bấm thử khớp mọi nhãn phá huỷ THẬT của app, ở cả
 * hai ngôn ngữ (#107).
 *
 * `live-press.mjs` giữ mẫu; `live.mjs` dùng nó để đòi mỗi nút xoá / rời / chặn
 * / bỏ theo dõi / đăng xuất HỎI LẠI trước khi ghi. Một mẫu không khớp thì nút ấy
 * được bấm mà không ai hỏi nó có hỏi lại không — im lặng, trên đúng loại nút
 * nguy hiểm nhất. Bản #91 dùng `\b` và bỏ sót 33 trong 76 nhãn, toàn bộ là
 * "Xoá…", kể cả "Xoá tài khoản".
 *
 * Nên ở đây: lấy từ từ điển chữ app (`allAppCopy`, #94) mọi chuỗi mở đầu bằng
 * một động từ phá huỷ, đọc bằng một mẫu Unicode ĐỘC LẬP (`\p{L}`, cờ `u`), và
 * đòi `DESTRUCTIVE` khớp từng chuỗi. Cộng vài chuỗi KHÔNG được khớp.
 */
import { DESTRUCTIVE } from './live-press.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { allAppCopy } from './live-narrow.mjs';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

const problems = [];
const VERBS = ['Xoá', 'Xóa', 'Rời', 'Chặn', 'Bỏ chặn', 'Bỏ theo dõi', 'Bỏ khỏi', 'Bỏ tích', 'Đăng xuất', 'Delete', 'Remove', 'Erase', 'Clear', 'Untick', 'Leave', 'Block', 'Unblock', 'Unfollow', 'Sign out'];
const opens = new RegExp(`^(${VERBS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const copy = allAppCopy().filter((s) => opens.test(s));
if (copy.length < 40) problems.push(`chỉ thấy ${copy.length} chuỗi app mở đầu bằng động từ phá huỷ — từ điển hỏng, đừng tin kết quả`);
for (const s of copy) if (!DESTRUCTIVE.test(s)) problems.push(`"${s}" là nhãn phá huỷ của app mà DESTRUCTIVE không khớp — lượt bấm sẽ không đòi nó hỏi lại`);
if (!copy.includes('Xoá tài khoản')) problems.push('"Xoá tài khoản" không còn trong từ điển — sửa phép kiểm đi theo nó');

for (const s of ['Deleted items', 'Removed from list', 'Leaves', 'Blocked', 'Xoáy', 'Rờii']) {
  if (DESTRUCTIVE.test(s)) problems.push(`"${s}" không phải nhãn phá huỷ mà DESTRUCTIVE khớp`);
}

/*
  ── cặp đôi (#128) ──

  Mỗi chữ của app có hai bản. Bản tiếng Anh khớp DESTRUCTIVE mà bản tiếng Việt
  không (hay ngược lại) thì lượt bấm ở MỘT ngôn ngữ không đòi nút ấy hỏi lại —
  "Remove" / "Bỏ khỏi danh sách" ở /grocery là như thế. Cặp lấy từ hai từ điển
  (cùng khoá) và từ mọi `vi ? '…' : '…'` / `lang === 'vi' ? '…' : '…'` viết thẳng.
  PAIR_OK là chữ KHÔNG phải nhãn nút mà một bên tình cờ mở đầu bằng động từ;
  khoá là tên khoá từ điển, hoặc CHỮ TIẾNG ANH của một cặp viết thẳng (số dòng
  thì trôi, chữ thì không).
*/
const PAIR_OK = {
  nLgBwHint: 'gợi ý dưới ô nhập ("Leave the weight empty…" = để trống), không phải nút',
  'Leave kcal empty to auto-calc from macros (P×4 + C×4 + F×9)': 'gợi ý dưới ô kcal của log-meal (để trống), không phải nút',
  nRdUntickTitle: 'TIÊU ĐỀ hộp hỏi lại "Undo this set?"; nút của hộp (nRdUntickConfirm "Untick" / "Bỏ tích") khớp cả hai bên',
  nPvSince: 'nhãn trạng thái "Chặn từ {date}" trong danh sách đã chặn, không phải nút',
  nDeleteAccountDesc: 'dòng mô tả dưới nút Xoá tài khoản; chính nút đã khớp cả hai bên',
};
function section(src, startRe) {
  const rest = src.slice(src.search(startRe));
  return rest.slice(0, rest.search(/\n};/));
}
function entries(sec) {
  const m = new Map();
  for (const x of sec.matchAll(/^  ([A-Za-z][A-Za-z0-9_]*)\??:\s*(?:\n\s+)?(['"`])((?:\\.|(?!\2).)*)\2/gm)) m.set(x[1], x[3].replace(/\\'/g, "'"));
  return m;
}
function pairs() {
  const out = [];
  for (const [f, viRe, enRe] of [
    ['lib/i18n.ts', /const vi: Translations = \{/, /const en: Translations = \{/],
    ['lib/native-strings.ts', /const vi: typeof en = \{/, /const en = \{/],
  ]) {
    const s = readFileSync(path.join(SRC, f), 'utf8');
    const vi = entries(section(s, viRe));
    for (const [k, en] of entries(section(s, enRe))) if (vi.has(k)) out.push({ where: k, vi: vi.get(k), en });
  }
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : []));
  for (const f of walk(SRC)) {
    const s = readFileSync(f, 'utf8');
    for (const x of s.matchAll(/\b(?:vi|isVi|lang === 'vi')\s*\?\s*'((?:\\.|[^'\\])*)'\s*:\s*'((?:\\.|[^'\\])*)'/g)) {
      out.push({ where: `${path.relative(SRC, f)}:${s.slice(0, x.index).split('\n').length}`, vi: x[1], en: x[2] });
    }
  }
  return out;
}
const allPairs = pairs();
if (allPairs.length < 1000) problems.push(`chỉ đọc được ${allPairs.length} cặp chữ — bộ đọc từ điển hỏng, đừng tin kết quả`);
const lopsided = (re) => allPairs.filter((p) => !PAIR_OK[p.where] && !PAIR_OK[p.en] && re.test(p.vi) !== re.test(p.en));
for (const p of lopsided(DESTRUCTIVE)) {
  problems.push(`${p.where}: "${p.en}" ${DESTRUCTIVE.test(p.en) ? 'khớp' : 'KHÔNG khớp'} DESTRUCTIVE mà "${p.vi}" ${DESTRUCTIVE.test(p.vi) ? 'khớp' : 'KHÔNG khớp'} — lượt bấm ở một ngôn ngữ sẽ không đòi nút này hỏi lại`);
}
for (const k of Object.keys(PAIR_OK)) if (!allPairs.some((p) => p.where === k || p.en === k)) problems.push(`PAIR_OK[${JSON.stringify(k)}] không còn khớp cặp chữ nào — bỏ dòng miễn`);
/* Thử ngược: mẫu TRƯỚC #128 (không "Bỏ khỏi") phải để lệch đúng cặp a11yRemove. */
const BEFORE_128 = /^(Xoá|Rời|Chặn|Bỏ chặn|Bỏ theo dõi|Đăng xuất|Delete|Remove|Leave|Block|Unblock|Unfollow|Sign out)(?=\s|$)/i;
if (!lopsided(BEFORE_128).some((p) => p.where === 'a11yRemove')) problems.push('thử ngược hỏng: mẫu trước #128 không để lệch cặp a11yRemove ("Remove" / "Bỏ khỏi danh sách") — luật cặp đôi không đo gì');

/* Thử ngược: mẫu của #91 (`\b` không cờ `u`) phải bỏ sót ít nhất một nhãn "Xoá…" của app — không thì phép kiểm trên không đo gì. */
const OLD = /^(Xoá|Xóa|Rời|Chặn|Bỏ chặn|Bỏ theo dõi|Đăng xuất|Delete|Remove|Leave|Block|Unblock|Unfollow|Sign out)\b/i;
const missedByOld = copy.filter((s) => !OLD.test(s));
if (missedByOld.length === 0) problems.push('thử ngược hỏng: mẫu cũ của #91 cũng khớp mọi nhãn — phép kiểm không phân biệt được');

if (problems.length) {
  console.log('mẫu nút phá huỷ sai:\n');
  for (const p of problems.slice(0, 20)) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `nút phá huỷ OK — DESTRUCTIVE (live-press.mjs) khớp đủ ${copy.length} nhãn phá huỷ THẬT của app ở cả hai ngôn ngữ (từ điển #94), ` +
    `kể cả "Xoá tài khoản", và không khớp "Deleted items", "Xoáy"… Thử ngược: mẫu \\b của #91 bỏ sót ${missedByOld.length} nhãn — ` +
    'toàn bộ "Xoá…", vì không có cờ u thì "á" không phải \\w. ' +
    `Và ${allPairs.length} cặp chữ hai ngôn ngữ (hai từ điển + vi ? … : … viết thẳng) khớp CẢ HAI hoặc KHÔNG bên nào (#128), ` +
    `trừ ${Object.keys(PAIR_OK).length} chữ không phải nút; thử ngược: mẫu trước #128 để lệch "Remove" / "Bỏ khỏi danh sách"`,
);
