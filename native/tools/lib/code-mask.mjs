/**
 * Đánh dấu từng ký tự của một tệp nguồn: 1 = mã thật, 0 = chú thích hoặc chuỗi.
 *
 * ── vì sao nó ở đây chứ không nằm trong một công cụ ──
 *
 * `theme-migrate.mjs` cần nó để KHÔNG viết lại chú thích, và `palette.mjs` cần
 * đúng nó để không ĐẾM chú thích. Hai câu hỏi ngược nhau, một phép quét.
 *
 * Bản trước, `palette.mjs` hỏi bằng một regex trần (`/\bcolors\./`) và báo còn
 * 3 tệp đóng băng bảng màu. Cả ba đều sai: `constants/theme.ts` và
 * `app/_layout.tsx` DẪN LẠI hình dạng cũ trong chú thích để giải thích vì sao
 * nó bị bỏ, và `pick-row.tsx` kể lại một lỗi cũ mà stylesheet của nó không có
 * lấy một màu nào. Một luật lỏng hơn thứ nó phải bắt không chỉ báo thừa — nó
 * đóng băng con số, nên một tệp đóng băng THẬT thứ tư sẽ trông y như không có
 * gì thay đổi.
 *
 * Không phải trình phân tích cú pháp đầy đủ: nó không hiểu `${…}` trong chuỗi
 * ngược, cũng không hiểu regex literal. Cả hai đều lệch về phía an toàn cho cả
 * hai người dùng — chỗ bị che thì không bị sửa và không bị đếm.
 */
export function codeMask(src) {
  const mask = new Uint8Array(src.length);
  let i = 0;
  const N = src.length;
  while (i < N) {
    const two = src.slice(i, i + 2);
    if (two === '//') { const j = src.indexOf('\n', i); i = j < 0 ? N : j; continue; }
    if (two === '/*') { const j = src.indexOf('*/', i + 2); i = j < 0 ? N : j + 2; continue; }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      let j = i + 1;
      while (j < N && src[j] !== ch) { if (src[j] === '\\') j++; j++; }
      i = Math.min(j + 1, N);
      continue;
    }
    mask[i] = 1;
    i++;
  }
  return mask;
}

/** Chuỗi `needle` có xuất hiện ở một vị trí là MÃ trong `src` không. */
export function inCode(src, needle) {
  const mask = codeMask(src);
  for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) {
    if (mask[i]) return true;
  }
  return false;
}
