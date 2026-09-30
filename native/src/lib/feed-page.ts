/**
 * Phân trang feed Cộng đồng theo con trỏ keyset (#20).
 *
 * ── vì sao keyset, không phải offset ──
 *
 * Feed mới nhất trước, và bài mới về liên tục. Trang hai theo `offset=30` là
 * "bỏ 30 bài mới nhất ở THỜI ĐIỂM hỏi": một bài mới đăng giữa hai lần tải đẩy
 * mọi thứ xuống một nấc, nên bài cuối trang một hiện lại ở đầu trang hai
 * (trùng), còn một bài bị xoá kéo mọi thứ lên và một bài lọt giữa hai trang
 * (hở). Con trỏ keyset hỏi "những bài CŨ HƠN bài cuối cùng tôi đã có" — không
 * phụ thuộc thứ gì mới về phía trên.
 *
 * ── vì sao hai cột ──
 *
 * `created_at` không duy nhất: một lượt seed, hay hai bài đăng cùng một giao
 * dịch, cho nhiều bài cùng mốc. Con trỏ chỉ theo `created_at.lt` sẽ bỏ qua mọi
 * bài còn lại cùng mốc với bài cuối trang (hở); `lte` thì lặp lại chúng (trùng).
 * Nên thứ tự là `(created_at desc, id desc)` — một thứ tự TOÀN PHẦN — và con
 * trỏ là cặp ấy.
 *
 * Tệp thuần, không import gì — `tools/feed-page.mjs` biên dịch và chạy nó.
 */
export type FeedCursor = { at: string; id: string };

/**
 * Con trỏ của trang kế tiếp, hoặc `undefined` khi đã hết feed.
 *
 * Trang về ít hơn một trang đầy = server không còn gì cũ hơn. Trang về ĐẦY thì
 * có thể còn, có thể không — một lần hỏi nữa trả mảng rỗng và dừng ở đấy.
 */
export function nextCursor(page: readonly { created_at: string; id: string }[], size: number): FeedCursor | undefined {
  if (page.length < size) return undefined;
  const last = page[page.length - 1];
  return { at: last.created_at, id: last.id };
}

/**
 * Bộ lọc PostgREST `or=(…)` cho "cũ hơn con trỏ" theo `(created_at desc, id
 * desc)`: mốc nhỏ hơn, HOẶC cùng mốc mà id nhỏ hơn.
 *
 * Giá trị bọc ngoặc kép: mốc của Postgres mang `.` (phần triệu giây) và `:`,
 * mà tài liệu PostgREST liệt kê `,.:()` là ký tự dành riêng trong một cây
 * `or` — giá trị chứa chúng phải nằm trong ngoặc kép.
 */
export function olderThan(c: FeedCursor): string {
  return `created_at.lt."${c.at}",and(created_at.eq."${c.at}",id.lt."${c.id}")`;
}

/**
 * Gần đáy chưa — tải trang kế TRƯỚC khi người ta chạm đáy, để lần cuộn liền
 * mạch không va vào một vòng xoay. Một khoảng tính bằng điểm, cỡ hai thẻ bài
 * (thẻ Workout cao ~320): đủ để một trang về trong lúc ngón tay còn đang lướt.
 */
export const NEAR_END = 800;
export const nearEnd = (y: number, viewport: number, content: number) => content > 0 && y + viewport >= content - NEAR_END;

/** Các trang nối lại thành một danh sách, đúng thứ tự trang. */
export function flatPages<T>(pages: readonly (readonly T[])[]): T[] {
  return pages.flat() as T[];
}

/**
 * Đổi từng phần tử của một mục cache, dù nó là một mảng (truy vấn thường) hay
 * một `{ pages, pageParams }` (truy vấn theo trang). Tiền tố `community_feed` /
 * `community_user_posts` chứa CẢ HAI dạng — và cả những mục không phải danh
 * sách bài (`'kinds'`) — nên thứ duyệt qua chúng phải hiểu cả hai, và để yên
 * mọi thứ khác thay vì ném.
 */
export function mapPosts<T>(old: unknown, fn: (p: T) => T): unknown {
  if (Array.isArray(old)) return old.map(fn);
  if (old && typeof old === 'object' && Array.isArray((old as { pages?: unknown }).pages)) {
    const o = old as { pages: unknown[] };
    return { ...o, pages: o.pages.map((pg) => (Array.isArray(pg) ? pg.map(fn) : pg)) };
  }
  return old;
}
