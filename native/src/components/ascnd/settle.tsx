import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

/**
 * A section arriving on a page that was already there.
 *
 * ── this is the effect `screen.tsx` says to build, and not the two it says
 *    not to ──
 *
 * That file records two failed attempts at giving tab changes motion: a fade
 * on focus from 0, and a `key` that remounts the content so `entering` replays.
 * Both blink, and for one reason — `FadeInDown` and its family **begin at
 * invisible**. That is correct for a screen arriving from nothing, and wrong
 * on a page a `UITabBarController` has kept mounted, because replaying an
 * entrance there has to un-draw the page first. The note ends by naming what
 * would work: *"an animation that starts from the page as it is — a small
 * settle, not an entrance."*
 *
 * So this never goes near zero. It starts at 0.86 opacity and 12pt low, which
 * is close enough to the finished state that the first frame reads as the page
 * rather than as a flash. Leaving the tab resets it, so coming back settles
 * again — and the reset is invisible because it happens on a screen nobody is
 * looking at.
 *
 * ── the timings are the tab bar's, not free choices ──
 *
 * Arriving here also hides the tab bar, and `patches/react-native-screens` now
 * makes UIKit slide it off rather than blink it out — roughly 300ms for the
 * capsule to collapse past the bottom edge.
 *
 * That is the clock everything else is set to. The first version ran 340ms per
 * step with a 55ms stagger, so the last of five sections landed at 560ms: the
 * bar finished, and then the page kept arriving for another quarter of a
 * second with nothing driving it. 220ms and a 30ms stagger puts the last
 * section down at 340ms — one motion that starts and stops with the bar,
 * instead of two that overlap and disagree about how long this is meant to
 * take.
 *
 * ── why not put this in `Screen` ──
 *
 * Because it would then run on all five tabs, and four of them are pages you
 * flick between constantly. Motion on every switch is the thing iOS
 * deliberately does not do. The Health Assistant is the one that *hides the tab
 * bar* when you open it — arriving there is a change of place rather than a
 * change of pane, and it is worth marking.
 */
export function Settle({
  index = 0,
  children,
}: {
  /** stagger position; each step waits 30ms longer than the last */
  index?: number;
  children: React.ReactNode;
}) {
  const focused = useIsFocused();
  /*
    Bắt đầu ở TRẠNG THÁI XONG, không phải ở đầu hiệu ứng.

    ── lỗi nó sửa ──

    Đã bị báo từ máy thật, kèm ảnh: chữ trên Health Assistant — lời chào, hai
    dòng tóm tắt, viên trạng thái — hiện ra MỜ, và phải sang tab khác rồi quay
    lại mới bình thường.

    `t` khởi tạo bằng 0, và 0 nghĩa là `opacity 0.86` cộng `translateY 12`. Nó
    chỉ rời khỏi đó khi effect chạy VÀ `focused` đúng lúc ấy là true. Ở lần dựng
    đầu tiên của một màn hình vừa được đẩy vào, hai điều đó không phải lúc nào
    cũng gặp nhau: `useIsFocused` còn false trong lần render đầu, effect ghi 0
    một lần nữa, và nếu khung hình sau đó bị bỏ lỡ thì thứ còn lại trên màn hình
    là đúng giá trị đầu ấy. Nội dung đã dựng, đã chiếm chỗ, và mờ.

    Sang tab khác rồi quay lại thì sửa được, vì lần đó `focused` đổi từ false
    sang true trên một luồng đã rảnh — đúng như đã báo.

    Nguyên tắc thì `lib/entrance.ts` vừa viết ra cho đúng lớp lỗi này: một hiệu
    ứng vào là TRANG TRÍ, nên nó không bao giờ được là thứ quyết định nội dung
    có đọc được hay không. Nên mặc định là 1 — trang hiện đủ — và chỉ khi RỜI
    tab mới lùi về 0 để lần quay lại còn có cái để settle.
  */
  const t = useSharedValue(1);

  useEffect(() => {
    if (focused) {
      t.value = withDelay(
        index * 30,
        withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      );
    } else {
      // instant, not animated: this runs on a screen that is off-view, and an
      // animation nobody sees is a timer nobody needed
      t.value = 0;
    }
  }, [focused, index, t]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.86 + t.value * 0.14,
    transform: [{ translateY: (1 - t.value) * 12 }],
  }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
