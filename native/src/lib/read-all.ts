/**
 * Đọc HẾT một danh sách theo từng trang — cho những danh sách mà màn hiển thị
 * cả, và lọc tại chỗ (#180).
 *
 * `.limit(N)` trên một danh sách như thế là cắt lặng lẽ: Món của tôi từng đọc
 * 200 món đầu theo tên, nên món thứ 201 — kể cả một món yêu thích — không có ở
 * đầu danh sách, không có khi lọc, và con số trên phân đoạn nói 200. Hàm này
 * hỏi tiếp tới khi một trang về thiếu, và khi vượt trần thì NÉM, không trả một
 * phần: một danh sách thiếu mà trông đủ là thứ không ai báo được.
 *
 * Thuần: không React, không Supabase — `tools/read-all.mjs` chạy thật nó.
 *
 *   `page(from, to)`  một trang, chỉ số dòng bao gồm hai đầu (như `.range()`),
 *                     trên một thứ tự TOÀN PHẦN — nếu không, offset trượt trên
 *                     những dòng bằng nhau và trang sau lặp hay bỏ dòng.
 */
export class TooManyRowsError extends Error {}

export async function readAllPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  size: number,
  maxPages = 20,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const { data, error } = await page(i * size, i * size + size - 1);
    if (error) throw error;
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < size) return out;
  }
  throw new TooManyRowsError(`hơn ${maxPages * size} dòng`);
}
