import { Link, type Href } from 'expo-router';
import { cloneElement, type ReactElement } from 'react';
import { Platform } from 'react-native';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { nav, navKey } from '@/lib/nav';
import { request } from '@/lib/nav-guard';

/**
 * Một `Link` giữ được chốt bấm dồn (#157) VÀ có chuyển cảnh zoom gốc của
 * iOS 18 (#216).
 *
 * ── vì sao cần component này ──
 *
 * `Link.AppleZoom` của expo-router chỉ zoom khi điều hướng đi qua `<Link>`,
 * còn mọi lối mở bài trong app đi qua `nav.push` — tức qua chốt trong
 * `lib/nav-guard.ts`. Dùng `<Link>` trần là mở lại đúng cái cửa #157 đã đóng:
 * bấm bốn lần lúc app khựng thì mở bốn màn. Nên `ZoomLink` hỏi chốt y hệt
 * `nav.push` (`request('push:<đích>', đích)`), và chỉ khi chốt nói `accept`
 * thì cú nhấn mới được đi tiếp tới điều hướng của Link.
 *
 * Cơ chế chặn: `onPress` của mình chạy TRƯỚC `onPress` điều hướng của Link
 * (xem `BaseExpoRouterLink`), nên `e.preventDefault()` khi chốt từ chối là
 * đủ — expo-router kiểm `defaultPrevented` trước khi dispatch, cả trên
 * native (`shouldHandleMouseEvent`) lẫn web. Đường nhả chốt không đổi:
 * `useNavGuard` ở layout gốc vẫn nghe `state` và `transitionEnd`.
 *
 * ── Reduce Motion ──
 *
 * Bật Reduce Motion thì không zoom: render con trần, điều hướng vẫn qua chốt
 * như thường. Trên web/Android `Link.AppleZoom` tự thành `Slot` (expo-router
 * chỉ bật zoom khi `EXPO_OS === 'ios'`); ngoài iOS component này không dùng
 * `<Link>` nữa — xem chỗ rẽ nhánh.
 *
 * ── a11y ──
 *
 * Dùng với `asChild` để giữ nguyên nút thật bên trong (kể cả
 * `accessible={false}` của vùng nuốt chạm — xem `PostShell`). `role: 'link'`
 * mà expo-router gắn thêm nằm trên một nút đã ẩn khỏi cây trợ năng thì vô
 * hiệu.
 *
 * Cấu trúc trong cây, khi zoom bật (iOS, không Reduce Motion):
 *   Link(asChild) > Slot > Link.AppleZoom > LinkZoomTransitionSource(native)
 *     > Slot > (nút của bạn)
 * `Slot` của Radix nối các `onPress` (con trước, cha sau), nên cả hiệu ứng
 * nhấn của nút lẫn chốt lẫn điều hướng đều chạy.
 */
export function ZoomLink({ href, children }: { href: Href; children: ReactElement<{ onPress?: () => void }> }) {
  const reduceMotion = useReducedMotion();
  /*
    Ngoài iOS không có zoom nào để giữ, nên cũng không bọc `<Link>`: gắn
    `nav.push` lên chính nút con, đúng như trước #216.

    Không phải chỉ cho gọn. Trên web `Link asChild` biến CẢ thẻ thành `<a>`,
    và cú click của một nút BÊN TRONG thẻ (Thích, Lưu) nổi bọt lên thẻ `<a>`
    ấy: bấm Thích trên feed là mở luôn bài viết (đo trên bản web 03/10, A).
    Trên native thì không, vì hệ responder trao cú chạm cho nút con trong
    cùng.
  */
  if (Platform.OS !== 'ios') return cloneElement(children, { onPress: () => nav.push(href) });
  return (
    <Link
      href={href}
      asChild
      onPress={(e: { preventDefault(): void }) => {
        /*
          Đúng một câu hỏi như `nav.push` trong `lib/nav.ts`: chỉ `'accept'`
          mới được dispatch. Không có đường `failed()` ở đây vì `preventDefault`
          không ném lỗi — chốt chỉ "giữ" khi nó đã nhận lời rồi giao việc đi.
        */
        const dest = navKey(href);
        if (request(`push:${dest}`, dest) !== 'accept') e.preventDefault();
      }}
    >
      {reduceMotion ? children : <Link.AppleZoom>{children}</Link.AppleZoom>}
    </Link>
  );
}
