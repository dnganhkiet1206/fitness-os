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
  type AnimatedRef,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, glass } from '@/constants/ascnd';
import { BOUNCE, spring } from '@/constants/motion';

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
 * ── và vì sao con số đổi ──
 *
 * Bản trước là `{ damping: 18, stiffness: 260 }`, hai số gõ tay. Quy ra thang
 * của Apple thì đó là **bounce 0,44** — nảy hơn cả `.bouncy`, preset nảy nhất
 * mà iOS ship, và nảy gấp ba `.snappy`. Không ai chọn 0,44; nó rơi ra từ hai
 * con số không nói được mình sẽ nảy bao nhiêu. Đó chính là chỗ cử chỉ đọc ra
 * như đồ chơi, và nó chạy ở BỐN nơi: nhấc lên, giữ xuống, thả ra, huỷ giữa
 * chừng.
 *
 * `snappy` (bounce 0,15) giữ nguyên ý ban đầu — vẫn có cái nảy để đọc ra là
 * "nhặt một vật lên" — nhưng ở mức hệ điều hành này coi là còn nghiêm túc.
 * `duration` 0,34 nhanh hơn 0,5 mặc định của Apple vì ngón tay đang chờ nó
 * xong để bắt đầu kéo.
 */
const LIFT = spring(0.34, BOUNCE.snappy);

/**
 * Chỗ trống mở ra dưới hàng đang kéo.
 *
 * Chậm hơn cú nhấc một bậc (0,46 so với 0,34): hàng bên cạnh là thứ PHẢN ỨNG,
 * và nó nặng hơn — một tấm thẻ đầy widget, không phải cái vật vừa được nhấc
 * lên.
 *
 * ── và KHÔNG nảy, khác bản trước ──
 *
 * Bản trước là bounce 0,26: hàng đang tránh đường vượt QUÁ ô mới rồi bò ngược
 * lại. Nó đọc ra là mất ổn định chứ không phải mềm mại — danh sách trông như
 * đang lún, trong khi việc nó đang làm là dọn chỗ. Một vật nhường đường thì
 * dừng ở chỗ nó nhường tới.
 *
 * `smooth` là tắt dần TỚI HẠN: nhanh nhất có thể mà không vượt qua đích lấy
 * một chút. Đây đúng là ô Apple dành cho loại chuyển động này.
 */
const GAP_SPRING = spring(0.46, BOUNCE.smooth);

/**
 * Cú ĐÁP khi thả tay — và cái lỗi nó sửa.
 *
 * ── bản cũ làm gì ──
 *
 *     .onEnd(() => {
 *       runOnJS(onCommit)(from.value, to.value);
 *       dy.value = 0;          // ← đặt thẳng, ngay trên luồng UI
 *       from.value = -1;
 *     })
 *
 * Chú thích cạnh nó lập luận rằng cây sắp được dựng lại theo thứ tự mới nên
 * hàng đã ở đúng chỗ. Điều đó ĐÚNG cho các hàng khác — độ dịch của chúng bằng
 * đúng độ đổi layout, nên về 0 là liên tục — và SAI cho hàng đang kéo: `dy` là
 * vị trí NGÓN TAY, không phải vị trí ô đích.
 *
 * Tệ hơn, hai vế ấy chạy trên hai luồng khác nhau. `dy.value = 0` xong ngay
 * khung hình đó; `onCommit` đi qua `runOnJS` → setState → JSON.stringify →
 * AsyncStorage → dựng lại cây, tức là vài khung hình sau. Trong khoảng ấy màn
 * hình hiện thứ tự CŨ với mọi thứ đã về chỗ cũ. Người dùng thấy:
 *
 *     thả tay → thẻ bật NGƯỢC về chỗ xuất phát → thẻ nhảy TỚI ô đích
 *
 * Hai cú nhảy, mỗi cú bằng cả quãng vừa kéo.
 *
 * ── cách sửa, và vì sao nó không còn phụ thuộc vào khung hình nào ──
 *
 * Phần dư — khoảng cách từ chỗ ngón tay thả tới tâm ô đích — được tách ra một
 * giá trị riêng (`settleY`) khoá theo ID CỦA THẺ chứ không theo chỉ số. ID sống
 * sót qua việc sắp lại, nên giá trị ấy KHÔNG đổi ở ranh giới commit: trước và
 * sau đều là cùng một con số trên cùng một tấm thẻ. Hai thứ đổi ở ranh giới —
 * `dy` về 0 và layout dịch đi `restY` — triệt tiêu nhau đúng bằng nhau, và cả
 * hai được phát trong CÙNG một nhịp JS (xem `commit`). Không còn khe hở nào để
 * nhìn thấy.
 *
 * `snappy` (bounce 0,15) — đúng ô Apple dành cho thứ người dùng VỪA BUÔNG: một
 * vật rơi vào chỗ của nó, có sức nặng, không nghịch ngợm. Bản trước là
 * `{ damping: 30, stiffness: 300 }`, quy ra bounce 0,13 — gần như y hệt, nên ở
 * đây con số không đổi mấy; cái đổi là giờ nó có TÊN, và cái tên nói ra mức
 * nảy thay vì bắt người đọc tự tính.
 *
 * `duration` 0,4 chậm hơn `LIFT` một chút chứ không nhanh hơn: quãng đường cú
 * đáp phải đi dài hơn nhiều (cả một ô, có khi vài ô) so với quãng phình 4% của
 * cú nhấc, và mắt muốn thời gian khớp với quãng đường.
 */
const RELEASE = spring(0.4, BOUNCE.snappy);

/**
 * Trần vận tốc đưa vào cú đáp, điểm/giây.
 *
 * Vận tốc PHẢI có ảnh hưởng — vẩy nhanh và đẩy chậm mà đáp giống hệt nhau thì
 * cử chỉ mất hẳn cảm giác quán tính. Nhưng nó không được quyết định ĐI ĐÂU: ô
 * đích đã chốt theo vị trí, và để vận tốc kéo thẻ đi tiếp là để một cú vẩy đổi
 * thứ tự ngoài ý muốn. Nên vận tốc chỉ nắn HÌNH DẠNG của cú đáp, và bị chặn ở
 * đây để một cú vẩy thật mạnh không làm thẻ vọt qua ô rồi bò ngược lại.
 */
const MAX_RELEASE_V = 2400;

/**
 * Cú chạm xuống, trước khi cử chỉ kịp kích hoạt.
 *
 * `activateAfterLongPress(260)` nghĩa là suốt 260ms đầu tấm thẻ hoàn toàn im —
 * người dùng đã đặt ngón tay xuống và giữ, và không gì nói cho họ biết máy có
 * nhận hay không. iOS trả lời cú giữ ngay khi nó bắt đầu nhận ra.
 *
 * Hoãn 140ms là chỗ then chốt: một cú CUỘN bắt đầu bằng ngón tay chạm rồi trượt
 * trong vòng vài chục mili giây, nên nó không bao giờ thấy phản hồi này. Chỉ
 * một cú GIỮ thật mới sống qua được 140ms, và lúc đó thẻ khẽ dày lên — rồi tới
 * 260ms thì nhấc hẳn. Hai bậc, đúng thứ tự người dùng trải qua.
 */
const PRESS_DELAY = 140;
/** Bao nhiêu phần của cú nhấc mà một cú giữ (chưa kéo) được hưởng. */
const PRESS_LIFT = 0.3;

/**
 * Kéo quá đầu hoặc quá cuối danh sách thì NẶNG dần, không phải tự do.
 *
 * Không chặn cứng: một cái phanh đột ngột đọc ra như cử chỉ bị hỏng. Không thả
 * tự do: bản cũ cho kéo thẻ đầu tiên lên tám trăm điểm phía trên danh sách, và
 * ở đó tấm thẻ chỉ còn là một hình chữ nhật trôi giữa màn hình, không còn quan
 * hệ gì với chỗ nó sẽ đáp.
 *
 * 0.22 nghĩa là mỗi điểm kéo thêm ngoài biên chỉ còn được khoảng một phần năm:
 * thẻ vẫn theo tay, nhưng tay biết là nó đang chạm đáy.
 */
const RUBBER = 0.22;

/**
 * Tấm ĐỤC luồn xuống dưới thẻ đang được nhấc lên.
 *
 * ── vì sao cần nó ──
 *
 * `GlassCard` là kính: nó cho thấy thứ nằm sau. Đứng yên trong danh sách thì
 * thứ nằm sau là nền trang, và đó đúng là hiệu ứng muốn có. Nhưng lúc bị nhấc
 * lên và kéo đi, thứ nằm sau nó là MỘT TẤM THẺ KHÁC — nên người dùng đọc được
 * chữ của thẻ dưới xuyên qua thẻ đang cầm trên tay. iOS không bao giờ để thế:
 * vật được nhấc lên nhận một chất liệu ĐẶC, chính vì lý do ấy.
 *
 * ── vì sao là một lớp riêng chứ không sửa `GlassCard` ──
 *
 * Một prop `opaque` trên `GlassCard` là một trạng thái mới cho mọi chỗ dùng nó
 * trong app, để phục vụ đúng một cử chỉ ở đúng một màn hình. Một tấm nền luồn
 * xuống dưới thì chỉ tồn tại trong lúc có ngón tay trên màn hình, và nó không
 * biết gì về cái thẻ nó đang đỡ.
 *
 * `colors.card` là chính màu nền thẻ của hệ thiết kế — nên khi lớp này đục
 * hoàn toàn, thẻ trông đúng như một thẻ, không phải như một hình chữ nhật đen.
 */
const SOLID_RADIUS = glass.radius;

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
 * ── một cú kéo là VÔ HÌNH, nên nó không được là đường duy nhất ──
 *
 * VoiceOver không có "nhấn giữ rồi trượt lên 120 điểm". Chỗ gọi trả lời điều
 * đó bằng accessibility ACTION trên chính tấm thẻ — "dời lên", "dời xuống" —
 * đúng cách iOS làm cho một hàng kéo được.
 *
 * Đoạn này TỪNG ghi rằng hai cái nút mũi tên còn đó và là đường duy nhất ấy.
 * Câu đó thôi đúng ở lần hàng tiêu đề được dựng lại theo kiểu Apple Music: ba
 * nút cạnh nhau cho hai việc là chỗ nó vừa hỏng theo đúng nghĩa đen — tay nắm
 * mới vẽ đè lên nút xoá — nên hai mũi tên đi và action thay chỗ.
 *
 * Ghi lại vì đây là lần thứ hai trong cùng một phiên một chú thích sống lâu
 * hơn thứ nó mô tả, và lần trước câu sai ấy đã được đưa cho người dùng như một
 * dữ kiện. `tools/drag-reorder.mjs` nay canh chính điều này.
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
    Phần dư của cú đáp, và tấm thẻ nó thuộc về.

    Khoá theo ID chứ không theo chỉ số, và đó là toàn bộ lý do nó tồn tại: chỉ
    số của thẻ ĐỔI ở đúng khoảnh khắc thứ tự được ghi, còn ID thì không. Nhờ thế
    `settleY` mang cùng một con số trước và sau ranh giới ấy, nên cú đáp chạy
    xuyên qua việc sắp lại mà không hề biết nó vừa xảy ra. Xem `RELEASE`.
  */
  const settleKey = useSharedValue('');
  const settleY = useSharedValue(0);

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

  /**
   * Ghi thứ tự mới VÀ dọn trạng thái kéo, trong cùng một nhịp.
   *
   * Đây là nửa còn lại của bản sửa mô tả ở `RELEASE`. Bản cũ dọn `dy`/`from`
   * trong worklet — tức là trên luồng UI, ngay lập tức — rồi mới nhờ `runOnJS`
   * mang lệnh ghi sang luồng JS. Hai việc phải xảy ra CÙNG LÚC thì bị tách ra
   * hai luồng và cách nhau vài khung hình, và cái khe ấy chính là chỗ tấm thẻ
   * bật ngược về chỗ cũ.
   *
   * Gộp lại thì cả `setState` lẫn các lệnh ghi shared value đều được phát trong
   * một nhịp JS, nên React và Reanimated cùng đổ xuống một lượt cập nhật của
   * luồng UI: layout dịch đi `restY` đúng lúc `dy` về 0, và hai cái triệt tiêu
   * nhau. Không có khung hình nào ở giữa để nhìn thấy.
   *
   * Thứ tự trong hàm này có ý nghĩa: ghi trước, dọn sau. Nếu `onMove` ném thì
   * trạng thái kéo vẫn phải được trả về, nếu không hàng kẹt lơ lửng — nên nó
   * nằm trong `finally`.
   */
  const commit = useCallback(
    (f: number, t: number) => {
      try {
        if (f !== t) onMove(f, t);
      } finally {
        from.value = -1;
        to.value = -1;
        dy.value = 0;
      }
    },
    [onMove, from, to, dy],
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
          itemKey={item.key}
          index={i}
          count={n}
          gap={gap}
          heights={heights}
          from={from}
          to={to}
          dy={dy}
          lift={lift}
          settleKey={settleKey}
          settleY={settleY}
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
  itemKey,
  index,
  count,
  gap,
  heights,
  from,
  to,
  dy,
  lift,
  settleKey,
  settleY,
  fingerY,
  startScroll,
  scrollY,
  onMeasure,
  onCommit,
  onTick,
  onScrolling,
  children,
}: {
  itemKey: string;
  index: number;
  count: number;
  gap: number;
  heights: SharedValue<number[]>;
  from: SharedValue<number>;
  to: SharedValue<number>;
  dy: SharedValue<number>;
  lift: SharedValue<number>;
  settleKey: SharedValue<string>;
  settleY: SharedValue<number>;
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

  /**
   * Layout dịch đi bao nhiêu khi hàng `f` về chỗ `t`.
   *
   * Đúng bằng tổng các bước nó đi qua, tính trên mảng chiều cao CŨ — vì đó là
   * bố cục nó đang đứng trong đó. Đây là con số mà `dy` phải bằng lúc thứ tự
   * được ghi, để hai bên triệt tiêu nhau; xem `RELEASE`.
   */
  const restFor = useCallback(
    (f: number, t: number, h: number[]) => {
      'worklet';
      const step = (k: number) => (h[k] ?? 0) + gap;
      let acc = 0;
      if (t > f) for (let k = f + 1; k <= t; k++) acc += step(k);
      else for (let k = t; k < f; k++) acc -= step(k);
      return acc;
    },
    [gap],
  );

  /**
   * Biên của cú kéo, trong hệ toạ độ nội dung.
   *
   * Hàng không được đi cao hơn ô đầu tiên hay thấp hơn ô cuối cùng — quá đó thì
   * không còn ô nào để đáp xuống. Ngoài biên, cử chỉ nặng dần thay vì dừng
   * khựng; xem `RUBBER`.
   */
  const clampShift = useCallback(
    (f: number, shift: number, h: number[]) => {
      'worklet';
      const lo = restFor(f, 0, h);
      const hi = restFor(f, count - 1, h);
      if (shift < lo) return lo + (shift - lo) * RUBBER;
      if (shift > hi) return hi + (shift - hi) * RUBBER;
      return shift;
    },
    [restFor, count],
  );

  /**
   * Cú giữ, trước khi cử chỉ kích hoạt.
   *
   * Của riêng hàng này, không dùng chung như `lift`: chỉ tấm thẻ đang bị ngón
   * tay đè mới được phản ứng, còn `lift` thì cả danh sách cùng đọc để biết có
   * ai đang được nhấc hay không.
   */
  const press = useSharedValue(0);

  const pan = Gesture.Pan()
    .maxPointers(1)
    /* Ngón tay vừa chạm xuống. Chưa có gì được quyết định ở đây — cú cuộn cũng
       bắt đầu y hệt — nên phản hồi bị hoãn lại đủ lâu để một cú cuộn không bao
       giờ chạm tới nó. Xem `PRESS_DELAY`. */
    .onBegin(() => {
      press.value = withDelay(PRESS_DELAY, withSpring(PRESS_LIFT, LIFT));
    })
    /* Nhấn giữ rồi mới kéo. Đây là thứ giữ cho cú CUỘN bình thường không bị
       cướp: trước khi giữ đủ lâu, pan chưa kích hoạt nên ScrollView vẫn nhận
       trọn cử chỉ. Không cần `blocksExternalGesture`, thứ sẽ chặn cuộn ngay từ
       lúc ngón tay chạm xuống. */
    .activateAfterLongPress(260)
    .onStart((e) => {
      /* Một cử chỉ tại một thời điểm.

         Mỗi hàng có `GestureDetector` riêng nhưng `from`/`to`/`dy` là dùng
         chung, nên hai ngón tay giữ hai thẻ khác nhau sẽ cùng ghi vào một bộ
         giá trị: hàng thứ hai đè `from`, và khi hàng thứ nhất thả ra nó ghi
         thứ tự bằng một chỉ số không phải của nó. Thứ tự lưu trên máy khác thứ
         tự trên màn hình, và không có gì đỏ. */
      if (from.value !== -1) return;
      from.value = index;
      to.value = index;
      dy.value = 0;
      /* Thẻ này vừa được cầm lên, nên phần dư của cú đáp TRƯỚC đó — nếu còn
         đang chạy — thôi thuộc về nó. Không xoá thì cú kéo mới bắt đầu bằng
         một khoảng lệch thừa hưởng từ cú kéo cũ. */
      if (settleKey.value === itemKey) {
        settleKey.value = '';
        settleY.value = 0;
      }
      startScroll.value = scrollY.value;
      fingerY.value = e.absoluteY;
      /* Cú nhấc — lò xo, không phải một giá trị đặt thẳng. Xem `LIFT`. */
      lift.value = withSpring(1, LIFT);
      runOnJS(onTick)();
      runOnJS(onScrolling)(true);
    })
    .onUpdate((e) => {
      /* Cùng chốt với `onStart`, và nó KHÔNG thừa.

         `onStart` từ chối ngón thứ hai bằng một `return`, nhưng cử chỉ ấy vẫn
         sống: `onUpdate` của nó tiếp tục bắn theo mỗi lần ngón tay nhúc nhích,
         và nếu không chặn ở đây thì nó ghi đè `dy` và `to` của cú kéo ĐANG diễn
         ra. Tấm thẻ trên tay người dùng nhảy theo một ngón tay khác, và thứ tự
         được ghi là thứ tự ngón kia vừa vẽ ra. Từ chối một cử chỉ nghĩa là từ
         chối cả ba giai đoạn của nó, không phải chỉ giai đoạn đầu. */
      if (from.value !== index) return;
      fingerY.value = e.absoluteY;
      /*
        Quãng dịch tính trong HỆ TOẠ ĐỘ NỘI DUNG, không phải màn hình.

        `translationY` đo theo màn hình. Khi tự-cuộn chạy, nội dung trôi dưới
        ngón tay — ngón tay đứng yên mà hàng đang kéo phải đi tiếp. Cộng thêm
        phần trang đã cuộn kể từ lúc nhấc lên là thứ giữ cho thẻ dính vào ngón
        tay, và cũng là thứ giữ cho vị trí đích tính đúng.
      */
      const shift = clampShift(index, e.translationY + (scrollY.value - startScroll.value), heights.value);
      /* `dy` mang đúng giá trị ĐÃ KẸP, trừ đi phần cuộn — nếu thẻ vẽ theo
         `translationY` thô trong khi đích tính theo bản đã kẹp thì hai bên nói
         về hai vị trí khác nhau, và ngoài biên chúng rời nhau ra. */
      dy.value = shift - (scrollY.value - startScroll.value);
      const t = target(index, shift, heights.value);
      if (t !== to.value) {
        to.value = t;
        /* Rung MỘT lần mỗi khi vị trí đích đổi, không phải mỗi khung hình. */
        runOnJS(onTick)();
      }
    })
    .onEnd((e) => {
      if (from.value !== index) return;
      runOnJS(onScrolling)(false);
      const f = from.value;
      const t = to.value;
      const h = heights.value;
      /* Vị trí thật của thẻ lúc buông, tính từ ô gốc của nó. */
      const visual = dy.value + (scrollY.value - startScroll.value);
      /* Chỗ layout sắp đặt nó xuống. */
      const rest = restFor(f, t, h);

      /*
        Phần dư đi ra một giá trị KHÁC, khoá theo ID thẻ.

        Đặt trước khi ghi thứ tự, và không đổi ở ranh giới ấy. Ngay lúc này ảnh
        không nhúc nhích: hàng đang kéo vẽ ở `dy + settleY` = `rest + (visual −
        rest)` = `visual`, đúng chỗ ngón tay vừa rời. Nhưng khi thứ tự được ghi
        thì `dy` về 0 và layout dịch đi `rest` — hai cái triệt tiêu — còn
        `settleY` vẫn nguyên và tiếp tục chạy lò xo về 0. Cú đáp đi xuyên qua
        việc sắp lại mà không biết nó vừa xảy ra. Xem `RELEASE`.
      */
      settleKey.value = itemKey;
      settleY.value = visual - rest;
      dy.value = rest;
      settleY.value = withSpring(0, {
        ...RELEASE,
        /* Vận tốc chỉ nắn hình dạng cú đáp, không đổi ô đích — xem
           `MAX_RELEASE_V`. Dấu giữ nguyên: thẻ đang đi xuống thì đáp xuống. */
        velocity: Math.max(-MAX_RELEASE_V, Math.min(MAX_RELEASE_V, e.velocityY)),
      });

      lift.value = withSpring(0, LIFT);
      press.value = withSpring(0, LIFT);
      /* `commit` ghi thứ tự VÀ dọn `from`/`to`/`dy` trong cùng một nhịp JS —
         đó là điều kiện để hai vế triệt tiêu nhau. Không dọn ở đây. */
      runOnJS(onCommit)(f, t);
    })
    .onFinalize(() => {
      /* Chạy sau MỌI kết cục, kể cả cú chạm chưa bao giờ kích hoạt thành kéo —
         nên cú giữ phải được thu về ở đây, không phải ở `onEnd`. Một cú cuộn
         đi qua đúng đường này. */
      press.value = withSpring(0, LIFT);
      runOnJS(onScrolling)(false);
      /* Cử chỉ bị huỷ (gọi điện tới, chuyển app) cũng phải trả trạng thái về,
         nếu không hàng kẹt ở giữa chừng và không gì đưa nó về.

         `onEnd` đã dọn `from` qua `commit`, nên tới đây mà `from` vẫn là hàng
         này thì đúng nghĩa là cử chỉ bị cắt ngang giữa chừng: không có thứ tự
         nào để ghi, và thẻ chỉ việc trôi về ô cũ. Lò xo chứ không phải timing —
         một cú huỷ cũng là một cú buông, và nó phải đáp giống hệt. */
      if (from.value === index) {
        settleKey.value = itemKey;
        settleY.value = dy.value + (scrollY.value - startScroll.value);
        settleY.value = withSpring(0, RELEASE);
        dy.value = 0;
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

  /**
   * Phần dư của cú đáp, nếu tấm thẻ NÀY là thẻ vừa được thả.
   *
   * So bằng ID chứ không bằng chỉ số, và đó là cả cái mẹo: sau khi thứ tự được
   * ghi, chỉ số của thẻ đã khác, còn ID thì vẫn thế. Nhờ vậy cú đáp bám theo
   * đúng tấm thẻ đi qua việc sắp lại.
   */
  const settle = useDerivedValue(() => (settleKey.value === itemKey ? settleY.value : 0));

  const style = useAnimatedStyle(() => {
    if (from.value === index) {
      return {
        transform: [
          { translateY: dy.value + (scrollY.value - startScroll.value) + settle.value },
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
          { scale: 1 + Math.max(lift.value, press.value) * 0.04 },
        ],
        /* Lên trên các hàng khác trong lúc kéo, nếu không nó chui xuống dưới
           cái hàng nó vừa đi qua. `zIndex` không phải thuộc tính layout — nó
           chỉ đổi thứ tự vẽ. */
        zIndex: 10,
      };
    }
    /*
      Hàng không bị kéo — nhưng nó vẫn có thể là hàng VỪA ĐƯỢC THẢ, đang đáp
      xuống sau khi thứ tự đã ghi. Lúc ấy `from` đã là -1 nên nhánh trên không
      chạy nữa, và cú đáp sống tiếp ở đây qua `settle`.

      `zIndex` phải ở trên trong lúc còn đáp: thẻ đang trên đường về ô của nó và
      vẫn có thể phủ lên hàng bên cạnh; để nó chui xuống dưới giữa chừng là làm
      lộ ra rằng vừa có một lượt dựng lại cây.
    */
    const s = settle.value;
    return {
      transform: [{ translateY: offset.value + s }, { scale: 1 + press.value * 0.04 }],
      zIndex: s !== 0 ? 10 : 0,
    };
  });

  /* Chỉ hàng ĐANG được nhấc mới cần tấm đục. Các hàng khác vẫn là kính. */
  const solid = useAnimatedStyle(() => ({
    opacity: from.value === index ? lift.value : 0,
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={style} onLayout={(e) => onMeasure(index, e)}>
        {/*
          Tấm đục nằm DƯỚI nội dung (trước nó trong nguồn), và mờ dần theo đúng
          `lift` — nên nó đặc lại cùng nhịp với cú nhấc thay vì bật ra.
        */}
        <Animated.View style={[styles.solid, solid]} pointerEvents="none" />
        {/*
          Tay nắm ba vạch KHÔNG vẽ ở đây, và đó là một ranh giới chứ không phải
          một thiếu sót: thẻ nhóm là nội dung của chỗ gọi, và `DragReorder`
          không được quyền chen UI vào bố cục bên trong nó — bản đầu neo tay nắm
          tuyệt đối ở `right: 16` và nó vẽ đè lên nút thùng rác.

          Chỗ gọi dựng tay nắm trong chính hàng tiêu đề, cạnh nút xoá, và cho cả
          cụm trượt vào cùng nhau.
        */}
        {children}
      </Animated.View>
    </GestureDetector>
  );
}


const styles = StyleSheet.create({
  /* Phủ kín thẻ và bo cùng bán kính với `GlassCard`, nếu không thì bốn góc lộ
     ra một mảng vuông đặc dưới góc bo của kính. */
  solid: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    borderRadius: SOLID_RADIUS,
    backgroundColor: colors.card,
  },
});
