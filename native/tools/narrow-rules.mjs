/**
 * Luật 2 của lượt quét hẹp — "chữ của APP bị cắt" — tự kiểm, không cần trình
 * duyệt (#63, #87).
 *
 * `live-narrow.mjs` tách chữ bị cắt thành hai loại: chữ app viết (lỗi) và nội
 * dung người dùng bị `numberOfLines` cắt (đúng thiết kế). Nó tách bằng cách so
 * chữ với MỌI chuỗi trong `native-strings.ts`. Sai về phía nào cũng im lặng
 * trong lượt quét: khớp quá rộng thì chú thích người dùng thành báo oan, khớp
 * quá hẹp thì một câu của app bị cắt mà không ai nghe. Lượt quét không tự nói
 * ra cả hai điều ấy, vì nó chỉ thấy những gì thế giới giả tình cờ có.
 *
 * Nên ở đây: `cutKind` chạy trên mẫu sinh từ CHÍNH từ điển thật, với những câu
 * đã từng sai.
 */
import { appCopy, copyPatterns, cutKind, HEAD_WORDS, tailPatterns } from './live-narrow.mjs';

const copy = appCopy();
const full = copyPatterns(copy).map((s) => new RegExp(s));
const tails = tailPatterns(copy).map((s) => new RegExp(s));
const problems = [];

/* [chữ, loại phải ra, vì sao]. Chuỗi app dùng ở đây phải còn trong từ điển —
   xem vế "còn trong từ điển" bên dưới. */
const CASES = [
  /* #87: `{n} ngày trước` là chỗ trống DUY NHẤT, ở đầu. `^.+ ngày trước$` khớp
     mọi chú thích tận cùng bằng " ngày trước". */
  ['Hôm qua tôi tập 3 ngày trước', null, 'chú thích người dùng tận cùng bằng "ngày trước" không phải chữ của app (#87)'],
  ['I finally did it 3 days ago', null, 'chú thích tiếng Anh tận cùng bằng "days ago" không phải chữ của app (#87)'],
  ['3 ngày trước', 'full', '"{n} ngày trước" là chữ của app'],
  ['12 days ago', 'full', '"{n} {n:day|days} ago" là chữ của app'],
  ['1 day ago', 'full', '"{n} {n:day|days} ago" ở n = 1 là chữ của app — bộ chọn (#67) là chữ cố định, không phải chỗ trống'],
  ['Claim 100 coins', 'full', '"Claim {n} {n:coin|coins}" là chữ của app — mẫu không được coi bộ chọn là chữ nguyên văn (#67)'],
  /* Chỗ trống đầu là một tên: bốn từ vẫn là một tên. */
  ['Nguyễn Thị Minh Khai đã thích bài của bạn', 'full', 'tên bốn từ + "đã thích bài của bạn" là chữ của app'],
  /* Hai chỗ trống trở lên: không giới hạn phần đầu — tên thử thách dài. */
  ['Đi bộ 10.000 bước mỗi ngày trong tháng: 3/30 ngày', 'full', 'tên thử thách sáu từ + ": a/b ngày" vẫn là chữ của app'],
  /* #63: câu của app ở CUỐI một dòng ghép với nội dung. */
  ['@tuan.ng · Chặn từ 22 thg 9', 'tail', 'dòng chặn ghép (@handle · Chặn từ …) có đuôi là chữ của app (#63)'],
  ['vừa xong · Chỉ người theo dõi', 'tail', 'giờ đăng · "Chỉ người theo dõi" là dòng ghép có đuôi là chữ của app (#63)'],
  /* Khoảng trắng trần không phải chỗ nối: "buổi tập" là một chuỗi của app, và
     mọi chú thích tận cùng bằng nó sẽ khớp. */
  ['Hôm nay tôi hoàn thành 3 buổi tập', null, 'chú thích tận cùng bằng một chuỗi app một từ không phải dòng ghép (#63)'],
  /* Nội dung thuần. */
  ['Buổi sáng hôm nay trời đẹp quá, chạy được 5km', null, 'chú thích thuần không phải chữ của app'],
];

for (const [text, want, why] of CASES) {
  const got = cutKind(text, full, tails);
  if (got !== want) problems.push(`"${text}": ra ${got ?? 'nội dung'}, phải ra ${want ?? 'nội dung'} — ${why}`);
}

/* Các ca trên dựa vào những chuỗi này có trong từ điển; mất một chuỗi thì ca
   "full" của nó đỏ vì lý do khác, và ca null xanh mà không đo gì. */
for (const s of ['buổi tập', 'Chỉ người theo dõi', 'vừa xong', '{n} ngày trước', '{n} {n:day|days} ago', 'Claim {n} {n:coin|coins}', '{name} đã thích bài của bạn', '{title}: {a}/{b} ngày', 'Chặn từ {date}']) {
  if (!copy.includes(s)) problems.push(`chuỗi "${s}" không còn trong native-strings.ts — sửa ca tự kiểm đi theo nó`);
}

/* Thử ngược: với phần đầu `.+` như trước #87, ca chú thích phải bị coi là chữ
   của app — không thì ca null ở trên xanh mà không đo gì. */
const loose = copy
  .filter((s) => (s.replace(/\{\w+\}/g, '').match(/\p{L}/gu) ?? []).length >= 4)
  .map((s) => new RegExp(`^${s.split(/\{\w+\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+')}$`));
if (cutKind('Hôm qua tôi tập 3 ngày trước', loose, tails) !== 'full') {
  problems.push('thử ngược hỏng: với phần đầu ".+" (trước #87) chú thích "Hôm qua tôi tập 3 ngày trước" cũng không khớp — ca #87 không đo gì');
}
/* Và phần đầu dài HƠN `HEAD_WORDS` từ thì không khớp: đúng ranh giới. */
const words = (n) => Array.from({ length: n }, (_, i) => `từ${i}`).join(' ');
if (cutKind(`${words(HEAD_WORDS)} ngày trước`, full, tails) !== 'full') problems.push(`phần đầu ${HEAD_WORDS} từ phải còn khớp "{n} ngày trước"`);
if (cutKind(`${words(HEAD_WORDS + 1)} ngày trước`, full, tails) !== null) problems.push(`phần đầu ${HEAD_WORDS + 1} từ không được khớp "{n} ngày trước"`);

if (problems.length) {
  console.error('luật quét hẹp (chữ của app bị cắt):\n');
  for (const p of problems) console.error(`  • ${p}`);
  process.exit(1);
}
console.log(
  `luật quét hẹp OK — ${CASES.length} ca trên mẫu sinh từ ${copy.length} chuỗi thật của native-strings.ts: chú thích người dùng tận cùng bằng ` +
    `"ngày trước"/"days ago" không bị coi là chữ của app (#87: chỗ trống duy nhất ở đầu chuỗi chỉ được ${HEAD_WORDS} từ), tên bốn từ, tên thử ` +
    'thách dài và câu có bộ chọn số ít/số nhiều (#67) vẫn khớp, dòng chặn ghép khớp luật đuôi (#63). Thử ngược: với phần đầu ".+" như trước #87 thì ca chú thích ĐỎ, và ranh giới ' +
    `${HEAD_WORDS}/${HEAD_WORDS + 1} từ đúng chỗ.`,
);
