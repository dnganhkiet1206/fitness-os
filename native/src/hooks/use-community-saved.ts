import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/use-auth';
import { type FeedPost, hydrate, POST_COLS, type PostRow } from '@/hooks/use-community';
import { supabase } from '@/integrations/supabase/client';
import { selectSaved } from '@/lib/saved-library';

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
 */

/** Đủ cho một thư viện cá nhân; một người lưu nhiều hơn thế cần tìm kiếm, không cần cuộn. */
const LIMIT = 200;

const SAVED = 'saved';

export function useSavedPosts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['community_user_posts', user?.id, SAVED],
    enabled: !!user,
    /*
      Luôn đọc lại khi mở: lưu một bài ở feed rồi bấm "Xem thư viện" ngay thì
      bản cache còn "tươi" (staleTime) nhưng thiếu đúng bài vừa lưu — `useToggle`
      không làm mới gì khi thành công. Bỏ lưu NGAY TRONG thư viện thì
      `patchPost` đổi dấu tại chỗ, và mục ấy chỉ rời danh sách ở lần mở sau —
      không biến mất dưới ngón tay đang định bấm lại.
    */
    refetchOnMount: 'always',
    queryFn: async (): Promise<FeedPost[]> => {
      const me = user!.id;
      const { data: saves, error } = await supabase
        .from('community_saves')
        .select('post_id, created_at')
        .eq('user_id', me)
        .order('created_at', { ascending: false })
        .limit(LIMIT);
      if (error) throw error;
      const ids = (saves ?? []).map((s) => s.post_id).filter((x): x is string => typeof x === 'string');
      if (ids.length === 0) return [];

      const { data: rows, error: postsErr } = await supabase.from('community_posts').select(POST_COLS).in('id', ids);
      if (postsErr) throw postsErr;
      /* Thứ tự của THƯ VIỆN là thứ tự lưu, mới nhất trước — không phải lúc đăng. */
      return hydrate(selectSaved(ids, (rows ?? []) as PostRow[], me), me);
    },
  });
}
