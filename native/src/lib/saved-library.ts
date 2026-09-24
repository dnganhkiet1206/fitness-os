/**
 * Thư viện Đã lưu (#10) — phần CHỌN và SẮP, tách khỏi hook để chạy thật được.
 *
 * Thuần: không React, không Supabase. `tools/saved-library.mjs` chạy hai hàm
 * này trên những đầu vào hỏng thật sự, thay vì đọc mã rồi đoán.
 */

/** Chỉ những cột hàm này đọc — `PostRow` của feed có đủ chúng. */
export interface SavedRowLike {
  id: string;
  author_id: string;
  hidden: boolean;
  kind: string;
}

/**
 * Những bài đã lưu còn được vẽ, theo THỨ TỰ LƯU (mới nhất trước).
 *
 *   `ids`   post_id của các dòng lưu, đã xếp mới nhất trước.
 *   `rows`  bài server trả về — RLS đã bỏ bài bị ẩn / bị chặn, nhưng hàm này
 *           không dựa vào việc ấy: bài không nằm trong `ids` bị bỏ, và bài bị
 *           ẩn chỉ ở lại khi là của chính người xem (như policy đọc bài).
 *
 * Một id lưu HAI lần (không thể với PRIMARY KEY, nhưng một cache cũ thì có)
 * không sinh hai thẻ: mỗi bài một lần, ở vị trí lần lưu mới nhất.
 */
export function selectSaved<T extends SavedRowLike>(ids: readonly string[], rows: readonly T[], me: string): T[] {
  const firstAt = new Map<string, number>();
  ids.forEach((id, i) => {
    if (!firstAt.has(id)) firstAt.set(id, i);
  });
  const seen = new Set<string>();
  return rows
    .filter((r) => r && firstAt.has(r.id) && (!r.hidden || r.author_id === me))
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => firstAt.get(a.id)! - firstAt.get(b.id)!);
}

export type SavedFilter = 'workout' | 'recipe' | 'all';

/** Bộ lọc của màn: "Tất cả" gồm cả bài Progress; hai lựa chọn kia chỉ đúng loại ấy. */
export function filterSaved<T extends { kind: string }>(list: readonly T[], filter: SavedFilter): T[] {
  return filter === 'all' ? [...list] : list.filter((p) => p.kind === filter);
}
