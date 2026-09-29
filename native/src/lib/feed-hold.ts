/**
 * "N bài mới" (#160) — bài mới tới khi người đọc đang ở giữa feed.
 *
 * ── X làm gì, và vì sao ──
 *
 * Feed tải lại ngầm (app trở lại từ nền, một lượt làm mới sau khi thích…). Nếu
 * bài mới cứ thế chèn lên đầu danh sách, mọi thứ bên dưới bị đẩy xuống đúng
 * bằng chiều cao của chúng — bài người ta đang đọc trượt khỏi ngón tay, và họ
 * không biết vì sao. X không chèn: nó GIỮ bài mới lại và nổi một viên "N bài
 * mới" ở đầu màn; chạm vào thì cuộn lên và bài mới hiện ra ở chỗ người ta
 * đang nhìn.
 *
 * ── luật ──
 *
 * Giữ = chuỗi bài CHƯA THẤY đứng TRƯỚC bài đã thấy đầu tiên (feed mới nhất
 * trước, nên đó là bài mới hơn mọi thứ người ta đã thấy), trừ bài của CHÍNH
 * mình — người vừa đăng bài quay về feed để thấy nó, không phải để thấy một
 * viên thông báo về nó.
 *
 * Không giữ gì khi:
 *   · chưa thấy gì (lần tải đầu, hay tab vừa mở) — không có "mới hơn" nếu
 *     chưa có gì cũ;
 *   · không bài đã thấy nào còn trong feed — không còn điểm neo, nên không có
 *     "phía trên"; giữ lúc ấy là giấu cả feed sau một viên.
 * Bài chưa thấy đứng SAU bài đã thấy (trang cũ hơn) không phải bài mới, và
 * không bị giữ.
 *
 * Tệp thuần, không import gì — `tools/feed-hold.mjs` biên dịch và chạy nó.
 */
export function heldAbove(ids: readonly string[], seen: ReadonlySet<string>, mine: ReadonlySet<string>): string[] {
  /* "Chưa thấy gì" rơi vào đây luôn: không bài nào có trong một sổ rỗng. */
  const anchor = ids.findIndex((id) => seen.has(id));
  if (anchor < 0) return [];
  return ids.slice(0, anchor).filter((id) => !mine.has(id));
}

/**
 * Người đọc có đang ở đầu feed không — ở đó bài mới hiện ngay, không giữ.
 *
 * Một khoảng chứ không phải `y === 0`: nảy khi kéo-để-làm-mới cho `y` âm, và
 * dừng cách đỉnh vài điểm vẫn là "đang ở đầu".
 */
export const NEAR_TOP = 120;
export const atTop = (y: number) => y < NEAR_TOP;
