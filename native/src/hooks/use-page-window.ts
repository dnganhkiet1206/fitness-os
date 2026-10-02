import { useCallback, useLayoutEffect, useRef } from 'react';
import { type NativeScrollEvent, type NativeSyntheticEvent, Platform, type View } from 'react-native';

import { nearStart } from '@/lib/feed-page';
import { scrollActiveTo } from '@/lib/scroll-to-top';

/**
 * Vị trí của `el` trong `list`, gọi `cb` với nó (hoặc `null` khi không đo được).
 *
 * Trên web đo NGAY bằng `getBoundingClientRect`: `measureLayout` của
 * react-native-web hoãn phép đo qua `setTimeout(0)` — sau khi trình duyệt đã vẽ
 * khung hình có nội dung dời chỗ, tức đúng một khung hình nhảy rồi mới bù.
 * Trên iOS (Fabric) `measureLayout` đọc cây bóng đã tính xong.
 */
function measureIn(el: View, list: View, cb: (y: number | null) => void) {
  if (Platform.OS === 'web') {
    const a = (el as unknown as Element).getBoundingClientRect?.();
    const b = (list as unknown as Element).getBoundingClientRect?.();
    cb(a && b ? a.top - b.top : null);
    return;
  }
  el.measureLayout(list, (_x, y) => cb(y), () => cb(null));
}

/** Phần của một truy vấn theo trang (hai chiều) mà cửa sổ trang cần. */
type Pages = {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isFetchNextPageError: boolean;
  fetchNextPage: () => unknown;
  hasPreviousPage: boolean;
  isFetchingPreviousPage: boolean;
  isFetchPreviousPageError: boolean;
  fetchPreviousPage: () => unknown;
};

/**
 * Feed giữ TỐI ĐA vài trang (#171: `maxPages` 5) — một CỬA SỔ trượt trên
 * feed. Hook này làm hai việc cửa sổ ấy đòi:
 *
 *   · tải lại trang MỚI HƠN khi người đọc cuộn ngược lên gần đỉnh của những gì
 *     còn giữ (trang trên cùng đã rời bộ nhớ khi cuộn sâu);
 *   · GIỮ CHỖ ĐANG ĐỌC mỗi khi cửa sổ trượt.
 *
 * ── vì sao phải giữ chỗ, và ở CẢ HAI chiều ──
 *
 * Cửa sổ trượt xuống: trang kế nối vào đáy và trang ĐẦU bị bỏ — mọi thứ phía
 * trên chỗ đang đọc ngắn đi cả nghìn điểm trong khi `contentOffset` đứng yên,
 * nên màn nhảy xuống một trang. (Đo trên web trước khi có phần này: người đọc
 * bị ném tới gần đáy mới, trang kế lại tải, lại bỏ, lại nhảy — feed tự trôi tới
 * hết.) Trượt lên: trang trước chèn lên trên — ngược lại, cùng một lỗi. Đúng cái
 * #160 sinh ra để tránh: bài đang đọc trượt khỏi ngón tay.
 *
 * `maintainVisibleContentPosition` bị cấm ở khung `Screen` (chú thích đầu
 * `screen.tsx`: trên iOS nó làm trang không bao giờ dừng), nên giữ chỗ bằng tay,
 * quanh MỌI lần gọi trang:
 *
 *   1. trước khi gọi: đo vị trí một bài SẼ CÒN sau khi cửa sổ trượt — bài CUỐI
 *      khi gọi trang kế (trang đầu mới là thứ bị bỏ), bài ĐẦU khi gọi trang
 *      trước (trang cuối bị bỏ). Toạ độ trong danh sách, không đổi theo cuộn;
 *   2. trang về và đã vẽ: đo lại bài ấy; nó dời bao nhiêu thì cuộn bấy nhiêu,
 *      tính từ chỗ khung đứng lúc vẽ. Không dời (chưa tới trần, chưa bỏ gì) thì
 *      không cuộn.
 *
 * Đích là "chỗ khung đứng lúc vẽ + độ dời", không phải "chỗ hiện tại + độ dời":
 * trình duyệt có neo cuộn riêng (`overflow-anchor`) có thể đã tự bù trước khi
 * phép đo (bất đồng bộ trên web) trả về; cách này bù đúng một lần dù có ai bù
 * trước hay không.
 *
 * Trả `q` — chính truy vấn ấy với hai hàm gọi trang đã bọc, để MỌI lối gọi
 * (tới gần đáy, nút "Xem bài cũ hơn", nút thử lại) đều đi qua phần giữ chỗ —
 * `onScroll` để nối cạnh các `onScroll` khác, `list` cho View bọc danh sách, và
 * `item(id)` cho View bọc từng bài.
 */
export function usePageWindow(q: Pages, ids: readonly string[]) {
  const y = useRef(0);
  const list = useRef<View>(null);
  const items = useRef(new Map<string, View>());
  const refs = useRef(new Map<string, (el: View | null) => void>());
  /* Bài neo của lần gọi đang chờ; `at` NaN = đang đo, chưa gọi. */
  const anchor = useRef<{ id: string; at: number; t: number } | null>(null);

  /* Một hàm ref ỔN ĐỊNH cho mỗi bài: hàm mới mỗi lần vẽ là React gọi nó với
     null rồi với phần tử, 150 lần cho mỗi lượt thích. */
  const item = useCallback((id: string) => {
    let f = refs.current.get(id);
    if (!f) {
      f = (el) => (el ? items.current.set(id, el) : items.current.delete(id));
      refs.current.set(id, f);
    }
    return f;
  }, []);

  const first = ids[0];
  const last = ids[ids.length - 1];

  const call = (dir: 'next' | 'prev') => {
    /* Một lần gọi đang chờ thì không gọi chồng. Neo quá 15 giây là của một lần
       gọi không bao giờ đổi trạng thái tải (TanStack bỏ qua nó) — đừng để nó
       khoá mọi lần sau. */
    if (anchor.current && Date.now() - anchor.current.t < 15_000) return;
    const go = dir === 'next' ? q.fetchNextPage : q.fetchPreviousPage;
    const id = dir === 'next' ? last : first;
    const el = id ? items.current.get(id) : undefined;
    if (!id || !el || !list.current) {
      go();
      return;
    }
    anchor.current = { id, at: Number.NaN, t: Date.now() };
    measureIn(el, list.current, (at) => {
      anchor.current = at == null ? null : { id, at, t: Date.now() };
      go();
    });
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    y.current = e.nativeEvent.contentOffset.y;
    if (!q.hasPreviousPage || q.isFetchingPreviousPage || q.isFetchPreviousPageError) return;
    if (nearStart(y.current)) call('prev');
  };

  const fetching = q.isFetchingNextPage || q.isFetchingPreviousPage;
  useLayoutEffect(() => {
    const a = anchor.current;
    if (!a || Number.isNaN(a.at) || fetching) return;
    anchor.current = null;
    const el = items.current.get(a.id);
    if (!el || !list.current) return;
    const from = y.current;
    measureIn(el, list.current, (at) => {
      if (at != null && Math.abs(at - a.at) >= 1) scrollActiveTo(from + (at - a.at));
    });
  }, [first, last, fetching]);

  /* Kể từng trường thay vì `...q`: kết quả của TanStack theo dõi trường nào
     được ĐỌC để quyết định khi nào vẽ lại, và trải cả đối tượng là đọc hết. */
  const paged: Pages = {
    hasNextPage: q.hasNextPage,
    isFetchingNextPage: q.isFetchingNextPage,
    isFetchNextPageError: q.isFetchNextPageError,
    fetchNextPage: () => call('next'),
    hasPreviousPage: q.hasPreviousPage,
    isFetchingPreviousPage: q.isFetchingPreviousPage,
    isFetchPreviousPageError: q.isFetchPreviousPageError,
    fetchPreviousPage: () => call('prev'),
  };
  return { q: paged, onScroll, list, item };
}
