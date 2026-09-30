import { useInfiniteQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { type FeedPost, hydrate, POST_COLS, type PostRow } from '@/hooks/use-community';
import { supabase } from '@/integrations/supabase/client';
import { type FeedCursor, olderThan } from '@/lib/feed-page';
import { savedCursor, selectSaved } from '@/lib/saved-library';

/**
 * Thư viện Đã lưu (#10, người làm: B) — những bài người xem đã bấm Lưu.
 *
 * Tệp RIÊNG của B. Dựng `FeedPost` bằng chính `hydrate` của feed (A export ở
 * #23), nên một mục trong thư viện là ĐÚNG cái thẻ trên feed: cùng tác giả,
 * cùng trạng thái thích/lưu, cùng nút riêng của loại bài (Thử workout / Thêm
 * vào bữa ăn).
 *
 * ── "biến khỏi thư viện một cách trung thực" ──
 *
 *   bị xoá    dòng lưu tự đi theo (`community_saves.post_id … ON DELETE
 *             CASCADE`), nên nó không còn để đọc.
 *   bị ẩn,    RLS của `community_posts` không trả bài ấy về — kể cả khi dòng
 *   bị chặn   lưu vẫn còn. Mục ấy không được vẽ thành một thẻ rỗng: nó đơn
 *             giản không có mặt, như trên feed.
 *
 * ── vì sao key bắt đầu bằng `community_user_posts` ──
 *
 * Thư viện là một danh sách `FeedPost[]` có cùng hình dạng với "bài của một
 * người" (`useCommunityUserPosts`), nên nó nằm dưới cùng tiền tố key. Nhờ vậy
 * mọi chỗ A đã viết cho tiền tố ấy tự phủ luôn thư viện, không cần sửa thêm
 * dòng nào trong tệp của A: `patchPost` đổi dấu Thích/Lưu tại chỗ, `onError`
 * của `useToggle`, xoá bài, chặn người, xoá mọi bài của mình đều làm mới nó —
 * nên một bài vừa xoá hay một người vừa chặn không để lại thẻ hỏng. Phần tử
 * thứ ba là `SAVED`, không phải một uuid, nên không trùng với hồ sơ của ai.
 *
 * Client lọc lại thêm một lượt theo đúng khoá (id nằm trong danh sách đã lưu;
 * bài bị ẩn chỉ còn khi là của chính mình, như RLS) — một bộ lọc sai ở đâu đó
 * cũng không làm lọt một bài lạ hay một bài đã bị ẩn vào thư viện.
 *
 * Trả mảng thường: cache được persist qua `JSON.stringify`.
 *
 * ── theo trang (#178) ──
 *
 * Trước #178: 200 dòng lưu mới nhất rồi hết, "vì một người lưu nhiều hơn thế
 * cần tìm kiếm" — nhưng thư viện không có ô tìm, nên từ lần lưu thứ 201 mục cũ
 * nhất biến mất không đường nào tới. Nay theo trang như feed (#20): con trỏ
 * keyset `(created_at, post_id)` của `community_saves` (bảng không có cột
 * `id`; khoá chính là `(post_id, user_id)` và mọi dòng ở đây cùng `user_id`).
 * Con trỏ là của DÒNG LƯU, không của bài: bài bị ẩn/xoá rơi khỏi trang
 * (`selectSaved`), nên một trang có thể ít bài hơn số dòng — mỗi trang mang
 * con trỏ của nó, `{ posts, next }`.
 */

const PAGE = 30;
export type SavedPage = { posts: FeedPost[]; next: FeedCursor | null };

const SAVED = 'saved';

export function useSavedPosts() {
  const { user } = useAuth();
  return useInfiniteQuery({
    /* 'pages': cache persist cũ mang dạng mảng (xem `useCommunityFeed`). */
    queryKey: ['community_user_posts', user?.id, SAVED, 'pages'],
    enabled: !!user,
    /*
      Luôn đọc lại khi mở: lưu một bài ở feed rồi bấm "Xem thư viện" ngay thì
      bản cache còn "tươi" (staleTime) nhưng thiếu đúng bài vừa lưu — `useToggle`
      không làm mới gì khi thành công. Bỏ lưu NGAY TRONG thư viện thì
      `patchPost` đổi dấu tại chỗ, và mục ấy chỉ rời danh sách ở lần mở sau —
      không biến mất dưới ngón tay đang định bấm lại.
    */
    refetchOnMount: 'always',
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (last: SavedPage) => last.next,
    select: (d) => d.pages.flatMap((p) => p.posts),
    queryFn: async ({ pageParam }): Promise<SavedPage> => {
      const me = user!.id;
      let q = supabase
        .from('community_saves')
        .select('post_id, created_at')
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .order('post_id', { ascending: false })
        .limit(PAGE);
      if (pageParam) q = q.or(olderThan(pageParam, 'post_id'));
      const { data: saves, error } = await q;
      if (error) throw error;
      const rowsSaved = saves ?? [];
      const next = savedCursor(rowsSaved, PAGE);
      const ids = rowsSaved.map((s) => s.post_id).filter((x): x is string => typeof x === 'string');
      if (ids.length === 0) return { posts: [], next };

      const { data: rows, error: postsErr } = await supabase.from('community_posts').select(POST_COLS).in('id', ids);
      if (postsErr) throw postsErr;
      /* Thứ tự của THƯ VIỆN là thứ tự lưu, mới nhất trước — không phải lúc đăng. */
      return { posts: await hydrate(selectSaved(ids, (rows ?? []) as PostRow[], me), me), next };
    },
  });
}
