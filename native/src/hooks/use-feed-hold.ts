import { haptics as Haptics } from '@/lib/haptics';
import { useEffect, useRef, useState } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

import { atTop, heldAbove } from '@/lib/feed-hold';
import { scrollActiveToTop } from '@/lib/scroll-to-top';

/**
 * Giữ bài mới lại khi người đọc đang ở giữa feed, như X (#160). Luật nằm ở
 * `lib/feed-hold.ts`; đây chỉ là chỗ nó gặp màn hình.
 *
 * "Đã thấy" = những bài đã được VẼ ra cho tab ấy, ghi lại sau mỗi lần vẽ —
 * không phải những bài đã về từ server. Hai thứ khác nhau đúng ở bài bị giữ:
 * nó đã về nhưng chưa được vẽ, nên lần tải lại kế tiếp vẫn thấy nó là mới.
 *
 * Mỗi tab một sổ "đã thấy": Đang theo dõi và Khám phá là hai feed khác nhau,
 * và một bài đã thấy ở bên này không làm gì bên kia.
 */
export function useFeedHold<T extends { id: string; mine: boolean }>(tab: string, posts: readonly T[] | undefined) {
  const [top, setTop] = useState(true);
  const topRef = useRef(true);
  const [ack, setAck] = useState<Record<string, readonly string[]>>({});

  const all = posts ?? [];
  const ids = all.map((p) => p.id);
  const held = new Set(
    top ? [] : heldAbove(ids, new Set(ack[tab] ?? []), new Set(all.filter((p) => p.mine).map((p) => p.id))),
  );
  const shown = all.filter((p) => !held.has(p.id));

  /* Thứ đã vẽ là thứ đã thấy — và đã thấy thì THẤY MÃI, sổ chỉ thêm: feed có
     trần 5 trang (#171), bài cuộn qua rồi rời bộ nhớ, và khi cuộn ngược lên
     trang ấy về lại. Sổ chỉ ghi "đang vẽ" thì lúc ấy nó đã quên chúng, và cả
     trang cũ bị giữ sau một viên "30 bài mới". So bằng chuỗi để một lần vẽ lại
     cùng danh sách (một lượt thích đổi số đếm) không ghi lại gì. */
  const shownKey = shown.map((p) => p.id).join(',');
  useEffect(() => {
    if (!shownKey) return;
    setAck((a) => {
      const had = a[tab] ?? [];
      const known = new Set(had);
      const add = shownKey.split(',').filter((id) => !known.has(id));
      return add.length ? { ...a, [tab]: [...had, ...add] } : a;
    });
  }, [tab, shownKey]);

  /* Chỉ đặt state khi VƯỢT ngưỡng, không ở mỗi sự kiện cuộn (16ms một lần). */
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const t = atTop(e.nativeEvent.contentOffset.y);
    if (t === topRef.current) return;
    topRef.current = t;
    setTop(t);
  };

  /* Chạm viên: mọi bài đang về đều thành đã thấy NGAY (không đợi tới đỉnh), rồi
     cuộn lên — bài mới hiện ra ở đúng chỗ người ta sắp nhìn. */
  const release = () => {
    Haptics.selection();
    setAck((a) => ({ ...a, [tab]: ids }));
    scrollActiveToTop();
  };

  return { posts: shown, held: all.filter((p) => held.has(p.id)), onScroll, release };
}
