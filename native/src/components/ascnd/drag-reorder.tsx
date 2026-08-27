import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  scrollTo,
  useAnimatedStyle,
  useDerivedValue,
  useFrameCallback,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { duration } from '@/constants/motion';

/**
 * Cú NHẤC, và vì sao nó là lò xo chứ không phải một giá trị đặt thẳng.
 *
 * iOS nhấc một hàng lên khỏi danh sách trước khi cho bạn kéo nó: nó phình ra
 * một chút, và các hàng khác GIÃN RA nhường chỗ. Cả hai đều chạy bằng lò xo, và
 * chính cái nảy nhẹ ấy là thứ làm cử chỉ đọc ra như nhặt một vật lên chứ không
 * phải như một ô trong bảng đổi giá trị.
 *
 * Bản đầu đặt `scale: 1.02` thẳng và dịch hàng bên cạnh thẳng tới chỗ mới —
 * đúng về vị trí, và không có gì ở đó cả.
 *
 * `damping: 18, stiffness: 260` — mềm hơn `press.spring` (20/400) có chủ đích:
 * viên `press` trả lời một cú chạm trong chưa tới 120ms vì ngón tay sắp nhấc
 * lên; ở đây ngón tay còn ở lại suốt cú kéo, nên cú nhấc có chỗ để nảy.
 */
const LIFT = { damping: 18, stiffness: 260 };

/**
 * Chỗ trống mở ra dưới hàng đang kéo.
 *
 * Chậm hơn cú nhấc một bậc: hàng bên cạnh là thứ PHẢN ỨNG, và nó nặng hơn —
 * một tấm thẻ đầy widget, không phải cái vật vừa được nhấc lên.
 */
const GAP_SPRING = { damping: 20, stiffness: 180 };

/**
 * Tay nắm TRƯỢT VÀO TỪ PHẢI khi vào chế độ sắp xếp.
 *
 * ── vì sao cái này thay cho một lượt mờ cả trang ──
 *
 * Bản trước cho cả trang sắp xếp `FadeIn` một lượt. Người dùng gọi nó là "hơi
 * kì", và đúng: mờ cả trang đọc ra như trang vừa được TẢI LẠI, trong khi thứ
 * vừa xảy ra là bạn đổi chế độ của một trang vẫn đang ở đó.
 *
 * Apple Music (và Danh sách, Nhắc nhở) làm ngược lại: trang đứng yên, và những
 * điều khiển MỚI trượt vào từ mép phải, lệch nhau một nhịp ngắn. Chuyển động
 * chỉ nằm ở thứ vừa xuất hiện, nên nó nói đúng một điều — "đây là những nút
 * bạn vừa mở ra" — thay vì nói "mọi thứ trên trang này vừa mới tới".
 *
 * Lệch 40ms mỗi thẻ: đủ để đọc ra là một hàng chứ không phải một khối, và đủ
 * ngắn để thẻ cuối không phải chờ. Bốn nhóm là 120ms cho cả cụm.
 */
const HANDLE_IN = { damping: 22, stiffness: 240 };
const HANDLE_STAGGER = 40;

/** Quãng tính từ mép khung nhìn mà tự-cuộn bắt đầu chạy. */
const EDGE = 96;
/** Điểm cuộn mỗi khung hình khi ngón tay ở sát mép nhất. */
const EDGE_SPEED = 12;

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
  scrollRef,
  scrollY,
  viewportH,
  maxScroll,
}: {
  items: { key: string; node: React.ReactNode }[];
  /** Khoảng cách dọc giữa hai hàng, để một "bước" tính đúng. */
  gap: number;
  onMove: (from: number, to: number) => void;
  scrollRef: AnimatedRef<Animated.ScrollView>;
  /** Vị trí cuộn hiện tại — trang đã theo dõi sẵn cho những việc khác. */
  scrollY: SharedValue<number>;
  viewportH: SharedValue<number>;
  maxScroll: SharedValue<number>;
}) {
  const n = items.length;
  /* Số đo sống ở shared value vì worklet đọc nó mỗi khung hình; bản ref là để
     ghi từ `onLayout` mà không dựng lại cây. */
  const heights = useSharedValue<number[]>([]);
  const hRef = useRef<number[]>([]);
  const from = useSharedValue(-1);
  const to = useSharedValue(-1);
  const dy = useSharedValue(0);
  const lift = useSharedValue(0);
  /** Vị trí ngón tay trên MÀN HÌNH, để biết nó đã tới mép chưa. */
  const fingerY = useSharedValue(0);
  /** Mức cuộn lúc bắt đầu kéo — xem `shift` ở `Row`. */
  const startScroll = useSharedValue(0);

  /*
    ── tự cuộn khi kéo tới mép ──

    Phải là một ĐỒNG HỒ KHUNG HÌNH, không phải một phép tính trong `onUpdate`.
    `onUpdate` chỉ bắn khi ngón tay DI CHUYỂN; giữ nguyên ngón tay ở sát mép
    dưới là trạng thái phổ biến nhất của thao tác này, và ở đó không có sự kiện
    nào cả — trang sẽ đứng im đúng lúc người dùng đang chờ nó chạy.

    `setActive` tắt hẳn đồng hồ khi không ai kéo, nên nó không tồn tại ngoài
    quãng vài giây có một ngón tay trên màn hình. `tools/motion.mjs` miễn cho
    tệp này luật Reduce Motion vì đóng băng cú cuộn là gỡ mất tính năng, và nó
    đổi lại bằng cách ĐÒI cái cổng này.
  */
  const autoScroll = useFrameCallback(() => {
    if (from.value < 0 || viewportH.value <= 0) return;
    const top = fingerY.value;
    const bottom = viewportH.value - fingerY.value;
    let v = 0;
    if (top < EDGE) v = -EDGE_SPEED * (1 - Math.max(top, 0) / EDGE);
    else if (bottom < EDGE) v = EDGE_SPEED * (1 - Math.max(bottom, 0) / EDGE);
    if (v === 0) return;
    const next = Math.min(Math.max(scrollY.value + v, 0), maxScroll.value);
    if (next === scrollY.value) return;
    /* Cuộn KHÔNG animate: đồng hồ này đã chạy mỗi khung hình rồi, nên một
       animation chồng lên nó là hai thứ cùng lái một giá trị. */
    scrollTo(scrollRef, 0, next, false);
  }, false);

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

  const setScrolling = useCallback(
    (on: boolean) => {
      autoScroll.setActive(on);
    },
    [autoScroll],
  );

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
          lift={lift}
          fingerY={fingerY}
          startScroll={startScroll}
          scrollY={scrollY}
          onMeasure={measure}
          onCommit={commit}
          onTick={tick}
          onScrolling={setScrolling}>
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
  lift,
  fingerY,
  startScroll,
  scrollY,
  onMeasure,
  onCommit,
  onTick,
  onScrolling,
  children,
}: {
  index: number;
  count: number;
  gap: number;
  heights: SharedValue<number[]>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  lift: SharedValue<number>;
  fingerY: SharedValue<number>;
  startScroll: SharedValue<number>;
  scrollY: SharedValue<number>;
  onMeasure: (i: number, e: LayoutChangeEvent) => void;
  onCommit: (f: number, t: number) => void;
  onTick: () => void;
  onScrolling: (on: boolean) => void;
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
    .onStart((e) => {
      from.value = index;
      to.value = index;
      dy.value = 0;
      startScroll.value = scrollY.value;
      fingerY.value = e.absoluteY;
      /* Cú nhấc — lò xo, không phải một giá trị đặt thẳng. Xem `LIFT`. */
      lift.value = withSpring(1, LIFT);
      runOnJS(onTick)();
      runOnJS(onScrolling)(true);
    })
    .onUpdate((e) => {
      dy.value = e.translationY;
      fingerY.value = e.absoluteY;
      /*
        Quãng dịch tính trong HỆ TOẠ ĐỘ NỘI DUNG, không phải màn hình.

        `translationY` đo theo màn hình. Khi tự-cuộn chạy, nội dung trôi dưới
        ngón tay — ngón tay đứng yên mà hàng đang kéo phải đi tiếp. Cộng thêm
        phần trang đã cuộn kể từ lúc nhấc lên là thứ giữ cho thẻ dính vào ngón
        tay, và cũng là thứ giữ cho vị trí đích tính đúng.
      */
      const shift = e.translationY + (scrollY.value - startScroll.value);
      const t = target(index, shift, heights.value);
      if (t !== to.value) {
        to.value = t;
        /* Rung MỘT lần mỗi khi vị trí đích đổi, không phải mỗi khung hình. */
        runOnJS(onTick)();
      }
    })
    .onEnd(() => {
      runOnJS(onScrolling)(false);
      runOnJS(onCommit)(from.value, to.value);
      /* Trả về 0 ngay, không animate: cây sắp được dựng lại theo thứ tự MỚI,
         nên hàng này đã ở đúng chỗ của nó. Animate về 0 là chạy một hiệu ứng
         trên một hàng vừa đổi nghĩa. */
      dy.value = 0;
      lift.value = withSpring(0, LIFT);
      from.value = -1;
      to.value = -1;
    })
    .onFinalize(() => {
      runOnJS(onScrolling)(false);
      /* Cử chỉ bị huỷ (gọi điện tới, chuyển app) cũng phải trả trạng thái về,
         nếu không hàng kẹt ở giữa chừng và không gì đưa nó về. */
      if (from.value !== -1) {
        dy.value = withTiming(0, { duration: duration.move });
        lift.value = withSpring(0, LIFT);
        from.value = -1;
        to.value = -1;
      }
    });

  /**
   * Chỗ hàng này phải đứng trong lúc có người kéo — đi tới bằng LÒ XO.
   *
   * Bản đầu trả thẳng `±step`, nên hàng bên cạnh NHẢY tới chỗ mới ở đúng khung
   * hình vị trí đích đổi. Đúng về vị trí và không đọc ra như iOS: ở đó khe
   * trống GIÃN RA, và cái giãn ấy mới là thứ nói rằng danh sách đang nhường chỗ
   * chứ không phải đang chớp sang một trạng thái khác.
   *
   * ── và vì sao nó SNAP khi thả ──
   *
   * `from.value < 0` trả về 0 THẲNG, không qua lò xo. Lúc thả, cây được dựng
   * lại theo thứ tự mới, nên hàng này đã nằm đúng chỗ do layout đặt. Cho nó
   * chạy lò xo từ `±step` về 0 lúc ấy là bắt nó nhảy xuống rồi bò ngược lên —
   * một hoạt hoạ cho một chuyển động đã xảy ra rồi.
   */
  const offset = useDerivedValue(() => {
    const f = from.value;
    if (f < 0 || f === index) return 0;
    const h = heights.value;
    const step = (h[f] ?? 0) + gap;
    const t = to.value;
    /* Các hàng nằm GIỮA chỗ cũ và chỗ mới dịch đúng một bước, ngược chiều kéo.
       Hàng ngoài khoảng đó không nhúc nhích. */
    const want = f < index && index <= t ? -step : t <= index && index < f ? step : 0;
    return withSpring(want, GAP_SPRING);
  });

  const style = useAnimatedStyle(() => {
    if (from.value === index) {
      return {
        transform: [
          { translateY: dy.value + (scrollY.value - startScroll.value) },
          /*
            Phình 4% khi nhấc lên. KHÔNG kèm bóng đổ: `liquid-glass.tsx` đã đo
            và ghi lại rằng trên nền #070708 thì "#070708 dưới #070708 là không
            có gì" — một cái bóng ở đây tốn một lượt vẽ để đổi lấy không pixel
            nào. Thứ kể chuyện "vật này đã rời khỏi mặt phẳng" là cỡ của nó
            cộng với khe trống đang giãn ra bên dưới.

            Cũng KHÔNG kèm `opacity`: cả phiên này là chuyện gỡ những lượt gộp
            ngoài màn ra khỏi màn hình này, và một tấm thẻ đầy widget là đúng
            loại nhóm nhiều con mà `opacity` bắt iOS gộp lại.
          */
          { scale: 1 + lift.value * 0.04 },
        ],
        /* Lên trên các hàng khác trong lúc kéo, nếu không nó chui xuống dưới
           cái hàng nó vừa đi qua. `zIndex` không phải thuộc tính layout — nó
           chỉ đổi thứ tự vẽ. */
        zIndex: 10,
      };
    }
    return { transform: [{ translateY: offset.value }, { scale: 1 }], zIndex: 0 };
  });

  /* Trượt vào từ phải, lệch nhịp theo vị trí — xem `HANDLE_IN`. */
  const handleIn = useSharedValue(0);
  useEffect(() => {
    handleIn.value = withDelay(index * HANDLE_STAGGER, withSpring(1, HANDLE_IN));
  }, [handleIn, index]);
  const handle = useAnimatedStyle(() => ({
    opacity: handleIn.value,
    transform: [{ translateX: (1 - handleIn.value) * 24 }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} onLayout={(e) => onMeasure(index, e)}>
        {children}
        {/*
          Tay nắm nằm TUYỆT ĐỐI chứ không chen vào hàng tiêu đề của thẻ: thẻ
          nhóm là nội dung của chỗ gọi, và `DragReorder` không được quyền đổi bố
          cục bên trong nó. Nó cũng phải nằm ngoài dòng chảy để hiệu ứng trượt
          không đẩy cái gì.

          `pointerEvents="none"`: cả tấm thẻ đã là vùng kéo rồi. Cái này là DẤU
          HIỆU — thứ nói cho người ta biết có thể kéo — chứ không phải một vùng
          chạm thứ hai chỉ rộng 24 điểm.
        */}
        <Animated.View style={[styles.handle, handle]} pointerEvents="none">
          <View style={styles.grip} />
          <View style={styles.grip} />
          <View style={styles.grip} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  /* Neo vào mép phải của thẻ, canh giữa theo chiều dọc của HÀNG TIÊU ĐỀ chứ
     không của cả thẻ: thẻ cao theo số widget, còn tay nắm phải nằm ngang tầm
     cái tên nhóm — đó là chỗ mắt đi tìm nó. 22 điểm là nửa chiều cao hàng ấy
     cộng padding trên của GlassCard. */
  handle: { position: 'absolute', right: 16, top: 22, gap: 3, alignItems: 'flex-end' },
  /* Ba vạch 14×1.5. Mảnh hơn icon vì nó không phải một nút — nó là kết cấu,
     cùng cách iOS vẽ tay nắm sắp xếp: đủ để nhận ra, nhạt để không tranh chỗ
     với tên nhóm ngay bên trái. */
  grip: { width: 14, height: 1.5, borderRadius: 1, backgroundColor: 'rgba(237,237,237,0.32)' },
});
