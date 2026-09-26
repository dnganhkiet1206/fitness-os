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
import { allAppCopy } from './live-narrow.mjs';

const problems = [];
const VERBS = ['Xoá', 'Xóa', 'Rời', 'Chặn', 'Bỏ chặn', 'Bỏ theo dõi', 'Đăng xuất', 'Delete', 'Remove', 'Leave', 'Block', 'Unblock', 'Unfollow', 'Sign out'];
const opens = new RegExp(`^(${VERBS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

const copy = allAppCopy().filter((s) => opens.test(s));
if (copy.length < 40) problems.push(`chỉ thấy ${copy.length} chuỗi app mở đầu bằng động từ phá huỷ — từ điển hỏng, đừng tin kết quả`);
for (const s of copy) if (!DESTRUCTIVE.test(s)) problems.push(`"${s}" là nhãn phá huỷ của app mà DESTRUCTIVE không khớp — lượt bấm sẽ không đòi nó hỏi lại`);
if (!copy.includes('Xoá tài khoản')) problems.push('"Xoá tài khoản" không còn trong từ điển — sửa phép kiểm đi theo nó');

for (const s of ['Deleted items', 'Removed from list', 'Leaves', 'Blocked', 'Xoáy', 'Rờii']) {
  if (DESTRUCTIVE.test(s)) problems.push(`"${s}" không phải nhãn phá huỷ mà DESTRUCTIVE khớp`);
}

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
    'toàn bộ "Xoá…", vì không có cờ u thì "á" không phải \\w',
);
