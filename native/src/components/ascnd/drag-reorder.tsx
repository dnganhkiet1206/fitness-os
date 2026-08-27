import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * Nhấn giữ rồi kéo để đổi thứ tự — cho những thẻ CAO KHÁC NHAU.
 *
 * ── vì sao không dùng một thư viện ──
 *
 * Mọi thư viện kéo-thả sẵn có đều muốn dựng danh sách hộ (`FlatList` của
 * riêng nó). Ở đây danh sách nằm trong một `ScrollView` đã có bốn thứ khác
 * bên trên và bên dưới nó, và cái ScrollView ấy mang ghim hero, lớp aura, mặt
 * nạ kính — đổi nó thành một list ảo là đổi màn hình chứ không phải thêm một
 * cử chỉ. Cái cần thêm chỉ là một cử chỉ.
 *
 * ── chiều cao khác nhau, nên phải ĐO ──
 *
 * Thẻ nhóm cao theo số widget bên trong, nên không có một `ROW_HEIGHT` nào để
 * chia. Mỗi hàng tự báo chiều cao qua `onLayout`, và cả phép tính chạy trên
 * mảng số đo ấy: một bước là `chiều cao hàng + gap`, và ngưỡng để nhảy qua một
 * hàng là NỬA bước của chính hàng đó — không phải nửa bước của hàng đang kéo.
 * Kéo một thẻ cao qua một thẻ thấp mà lấy nửa của thẻ cao thì phải kéo quá cả
 * thẻ thấp rồi nó mới đổi chỗ, và mắt đọc ra là "kéo không ăn".
 *
 * ── vì sao mọi thứ chạy trên luồng UI ──
 *
 * Cử chỉ, phép tính vị trí đích, và cả `translateY` của từng hàng đều là
 * worklet. JS chỉ được gọi ở ba khoảnh khắc: nhấc lên (rung), đổi vị trí đích
 * (rung), và thả ra (ghi thứ tự mới). Đó là ba lần trong một cử chỉ, thay vì
 * sáu mươi lần một giây — cùng nguyên tắc mà `tab-bar-visibility.ts` đã ghi.
 *
 * ── và vì sao hai cái nút mũi tên KHÔNG bị gỡ ──
 *
 * Một cú kéo là vô hình với trình đọc màn hình: VoiceOver không có "nhấn giữ
 * rồi trượt lên 120 điểm". Hai cái nút là đường duy nhất cho người dùng ấy, và
 * chúng cũng là đường cho bất kỳ ai không giữ máy đủ vững. Kéo-thả là lối
 * NHANH, không phải lối thay thế.
 */
export function DragReorder({
  items,
  gap,
  onMove,
}: {
  items: { key: string; node: React.ReactNode }[];
  /** Khoảng cách dọc giữa hai hàng, để một "bước" tính đúng. */
  gap: number;
  onMove: (from: number, to: number) => void;
}) {
  const n = items.length;
  /* Số đo sống ở shared value vì worklet đọc nó mỗi khung hình; bản ref là để
     ghi từ `onLayout` mà không dựng lại cây. */
  const heights = useSharedValue<number[]>([]);
  const hRef = useRef<number[]>([]);
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);

  const measure = useCallback(
    (i: number, e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      if (Math.abs((hRef.current[i] ?? 0) - h) < 1) return;
      hRef.current[i] = h;
      heights.value = [...hRef.current];
    },
    [heights],
  );

  const commit = useCallback(
    (f: number, t: number) => {
      if (f !== t) onMove(f, t);
    },
    [onMove],
  );

  const tick = useCallback(() => {
    Haptics.selectionAsync();
  }, []);

  return (
    <View style={{ gap }}>
      {items.map((item, i) => (
        <Row
          key={item.key}
          index={i}
          count={n}
          gap={gap}
          heights={heights}
          from={from}
          to={to}
          dy={dy}
          onMeasure={measure}
          onCommit={commit}
          onTick={tick}>
          {item.node}
        </Row>
      ))}
    </View>
  );
}

/**
 * Một hàng.
 *
 * Tách thành component riêng vì mỗi hàng cần `useAnimatedStyle` của chính nó,
 * và hook thì không gọi được trong một vòng lặp bên trong một component khác.
 */
function Row({
  index,
  count,
  gap,
  heights,
  from,
  to,
  dy,
  onMeasure,
  onCommit,
  onTick,
  children,
}: {
  index: number;
  count: number;
  gap: number;
  heights: ReturnType<typeof useSharedValue<number[]>>;
  from: ReturnType<typeof useSharedValue<number>>;
  to: ReturnType<typeof useSharedValue<number>>;
  dy: ReturnType<typeof useSharedValue<number>>;
  onMeasure: (i: number, e: LayoutChangeEvent) => void;
  onCommit: (f: number, t: number) => void;
  onTick: () => void;
  children: React.ReactNode;
}) {
  /**
   * Vị trí đích cho quãng kéo hiện tại.
   *
   * Khai TRƯỚC cử chỉ và trước `useAnimatedStyle` đọc nó — một worklet bắt các
   * biến nó tham chiếu ngay lúc hook được gọi, nên một `const` nằm dưới vẫn ở
   * trong vùng chết và màn hình chết bằng ReferenceError trước khi vẽ.
   * `tools/worklet-tdz.mjs` tồn tại vì đúng lỗi đó.
   */
  const target = useCallback(
    (f: number, shift: number, h: number[]) => {
      'worklet';
      const step = (k: number) => (h[k] ?? 0) + gap;
      let k = f;
      let acc = 0;
      if (shift > 0) {
        /* Ngưỡng là nửa bước của hàng SẮP bị vượt qua, không phải của hàng đang
           kéo — xem chú thích đầu tệp. */
        while (k + 1 < count && shift > acc + step(k + 1) / 2) {
          acc += step(k + 1);
          k += 1;
        }
      } else {
        while (k - 1 >= 0 && -shift > acc + step(k - 1) / 2) {
          acc += step(k - 1);
          k -= 1;
        }
      }
      return k;
    },
    [count, gap],
  );

  const pan = Gesture.Pan()
    /* Nhấn giữ rồi mới kéo. Đây là thứ giữ cho cú CUỘN bình thường không bị
       cướp: trước khi giữ đủ lâu, pan chưa kích hoạt nên ScrollView vẫn nhận
       trọn cử chỉ. Không cần `blocksExternalGesture`, thứ sẽ chặn cuộn ngay từ
       lúc ngón tay chạm xuống. */
    .activateAfterLongPress(260)
    .onStart(() => {
      from.value = index;
      to.value = index;
      dy.value = 0;
      runOnJS(onTick)();
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      const t = target(index, e.translationY, heights.value);
      if (t !== to.value) {
        to.value = t;
        /* Rung MỘT lần mỗi khi vị trí đích đổi, không phải mỗi khung hình. */
        runOnJS(onTick)();
      }
    })
    .onEnd(() => {
      runOnJS(onCommit)(from.value, to.value);
      /* Trả về 0 ngay, không animate: cây sắp được dựng lại theo thứ tự MỚI,
         nên hàng này đã ở đúng chỗ của nó. Animate về 0 là chạy một hiệu ứng
         trên một hàng vừa đổi nghĩa. */
      dy.value = 0;
      from.value = -1;
      to.value = -1;
    })
    .onFinalize(() => {
      /* Cử chỉ bị huỷ (gọi điện tới, chuyển app) cũng phải trả trạng thái về,
         nếu không hàng kẹt ở giữa chừng và không gì đưa nó về. */
      if (from.value !== -1) {
        dy.value = withTiming(0, { duration: duration.move });
        from.value = -1;
        to.value = -1;
      }
    });

  const style = useAnimatedStyle(() => {
    const f = from.value;
    if (f < 0) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, opacity: 1 };
    if (f === index) {
      return {
        transform: [{ translateY: dy.value }, { scale: 1.02 }],
        /* Lên trên các hàng khác trong lúc kéo, nếu không nó chui xuống dưới
           cái hàng nó vừa đi qua. `zIndex` không phải thuộc tính layout — nó
           chỉ đổi thứ tự vẽ. */
        zIndex: 10,
        opacity: 0.96,
      };
    }
    const h = heights.value;
    const step = (h[f] ?? 0) + gap;
    const t = to.value;
    /* Các hàng nằm GIỮA chỗ cũ và chỗ mới dịch đúng một bước, ngược chiều kéo.
       Hàng ngoài khoảng đó không nhúc nhích. */
    if (f < index && index <= t) return { transform: [{ translateY: -step }, { scale: 1 }], zIndex: 0, opacity: 1 };
    if (t <= index && index < f) return { transform: [{ translateY: step }, { scale: 1 }], zIndex: 0, opacity: 1 };
    return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0, opacity: 1 };
  });

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} onLayout={(e) => onMeasure(index, e)}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}
