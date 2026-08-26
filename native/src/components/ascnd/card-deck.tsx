import { useCallback, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { Expander } from '@/components/ascnd/expander';
import { colors, radius, spacing } from '@/constants/ascnd';

/**
 * The ring cards, one at a time, swiped between — and the page's colour comes
 * with them.
 *
 * ── what this stopped being, and why ──
 *
 * It was a STACK: cards layered, each lifted above the one in front, edges
 * peeking. That was read off an App Store montage, and it cost something the
 * screenshots then measured. A stack has to occlude — a card must hide the ones
 * behind it — so every card needed an opaque backing. With the deck moved to
 * the top of Today and the readiness aura behind it, that backing covered the
 * aura: measured on the shipped build, the day's colour survived in a 55px
 * strip above the card and everything below it was `rgb(44,44,46)`, flat grey.
 *
 * An opaque card and a coloured page are exclusive. The reference has the ring
 * ON the colour, so the cards are separate pages now — side by side, clipped,
 * never overlapping. Nothing needs to hide anything, so nothing needs to be
 * opaque, so the aura reaches the glass.
 *
 * ── the colour follows the swipe ──
 *
 * `progress` is owned by the caller, not by this component. That is the whole
 * mechanism: Today creates it, hands it here, and reads it to cross-fade one
 * aura layer per page. The alternative — an `onPage` callback firing when the
 * swipe settles — would change the background AFTER the card had arrived, and
 * a background that catches up is worse than one that does not move.
 *
 * ── the gesture ──
 *
 * `Gesture.Pan` rather than a scroll view. `swipe-row.tsx` explains why that is
 * normally the wrong call — it means owning the conflict with the vertical
 * scroll rather than getting it for free — and it is right here because these
 * pages are absolutely positioned in one clipped box, so there is no scrollable
 * content for a scroll view to hold. The conflict is handled the way the
 * platform does it, by direction: the pan must travel sideways before it
 * activates and gives up entirely if the finger goes vertical first.
 *
 * And this needs `GestureHandlerRootView` at the app root or it throws on
 * mount. `tools/gesture-root.mjs` is the rule; it exists because the web
 * screenshot runner cannot see that crash.
 */

/** Past this fraction of the deck's width, the release commits to the next page. */
const COMMIT = 0.28;

/** Sideways travel before the pan takes the gesture from the page's scroll. */
const HYSTERESIS = 12;

const DOT = 6;

/** Cùng một nhịp cho cú vuốt và cho phím trợ năng — hai cửa vào, một cảm giác. */
const SNAP = { damping: 22, stiffness: 190, mass: 0.7 };

const ADJUST = [
  { name: 'increment' as const, label: 'next' },
  { name: 'decrement' as const, label: 'previous' },
];


export function CardDeck({
  children,
  progress,
  expandedAt = null,
  onPageChange,
  a11yLabel,
  scrollRef,
}: {
  children: React.ReactNode[];
  /** Where the deck is, as a float index. Pass one in to drive something else
   *  from the same swipe — Today drives the background colour off it. */
  progress?: SharedValue<number>;
  /**
   * Trang nào đang MỞ CHI TIẾT, hoặc `null` nếu không trang nào.
   *
   * Một chỉ số, không phải một boolean. Trước đây Today giữ một `heroOpen` duy
   * nhất và truyền nó cho CẢ SÁU thẻ, nên mở chi tiết một thẻ là mở chi tiết
   * sáu thẻ — và chính điều đó thổi phồng chiều cao của mọi trang, rồi phép
   * `max()` bên dưới áp chiều cao ấy cho tất cả.
   *
   * Khoảng trống dọc và rò rỉ trạng thái là CÙNG MỘT LỖI, nhìn từ hai phía.
   */
  expandedAt?: number | null;
  /** Gọi khi cú vuốt dừng ở một trang KHÁC. Today dùng nó để đóng chi tiết. */
  onPageChange?: (index: number) => void;
  /** Deck này là gì, cho screen reader — hàng chấm không nói được điều đó. */
  a11yLabel?: string;
  /**
   * ScrollView của trang, để cú kéo DỌC không bị deck nuốt mất.
   *
   * ── lỗi nó sửa ──
   *
   * Pan ở đây kích hoạt trên CẢ HAI trục (`activeOffsetX` + `activeOffsetY`),
   * và đó là chủ ý: một cú vuốt ngang của người thật võng xuống, nên ngưỡng chỉ
   * đặt trên trục ngang sẽ để thua cú vuốt ấy cho ScrollView. Trục được chốt
   * một lần rồi `onUpdate`/`onEnd` bỏ qua mọi cú dọc.
   *
   * Nhưng "bỏ qua" không có nghĩa là "trả lại". Một Pan KÍCH HOẠT bên trong một
   * ScrollView sẽ HUỶ cú cuộn của ScrollView đó — đấy là quan hệ mặc định của
   * gesture-handler, và cũng chính là thứ làm `activeOffsetX` trở thành khuôn
   * mẫu cho carousel ngang. Nên một cú vuốt dọc MẠNH bắt đầu trên vòng tròn:
   * trang cuộn được đúng 12 điểm cho tới lúc pan vượt ngưỡng, rồi đứng khựng.
   *
   * Đó là cú giật đã bị báo — "vuốt mạnh xuống thì ring bị giật, vuốt lên cũng
   * bị giật" — và nó xảy ra ở cả hai chiều vì ngưỡng đối xứng.
   *
   * Khai đồng thời thì ScrollView không bị huỷ nữa: cú dọc cuộn trang như bình
   * thường trong khi deck đứng yên, vì trục đã chốt là dọc và không có gì đọc
   * `translationX` nữa. Đánh đổi: một cú vuốt NGANG cũng để ScrollView thấy phần
   * dọc của nó, nên trang có thể trôi vài điểm — nhỏ hơn hẳn một cú khựng giữa
   * đà, và `activeOffsetY` vẫn giữ nguyên lý do nó được thêm vào.
   */
  scrollRef?: React.RefObject<unknown>;
}) {
  const pages = children.filter(Boolean);
  const [w, setW] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);

  const own = useSharedValue(0);
  const at = progress ?? own;
  const from = useSharedValue(0);

  const last = pages.length - 1;

  /**
   * Trang đang xem, ở JS — `at` là shared value và bố cục không đọc được nó.
   *
   * Chỉ đổi khi cú vuốt DỪNG. Cập nhật theo từng frame sẽ làm chiều cao nhảy
   * suốt cú vuốt.
   */
  const [page, setPage] = useState(0);

  /**
   * Chiều cao là của TRANG ĐANG XEM, không phải của trang cao nhất.
   *
   * `Math.max(...heights)` là nguyên nhân thật của khoảng trống: mỗi trang phải
   * dành sẵn chiều cao của trang cao nhất, kể cả khi nội dung của nó ngắn hơn
   * nhiều. Bố cục khi đó mô tả trang cao nhất chứ không mô tả trang bạn đang
   * nhìn.
   *
   * Trong lúc chưa đo được trang nào thì lùi về trang đầu, rồi về 0 — không có
   * số nào để đoán, và đoán ở đây là dựng lại đúng khoảng trống vừa gỡ.
   */
  const shown = heights[page] ?? heights[0] ?? 0;

  /* Khoá cử chỉ NGANG khi đang mở chi tiết — không dựa vào góc vuốt.
     Một ngưỡng góc vẫn để lọt cú vuốt hơi lệch, và người đang đọc thì không có
     lý do nào để đổi sang thẻ khác. */
  const locked = expandedAt !== null && expandedAt !== undefined;

  /* Chạy ở JS thread — `runOnJS` gọi nó từ worklet. */
  const settle = (index: number) => {
    setPage(index);
    onPageChange?.(index);
  };

  /** Trục của cú chạm hiện tại: 0 chưa chốt, 1 ngang, 2 dọc. */
  const axis = useSharedValue(0);

  let pan = Gesture.Pan()
    .enabled(!locked)
    /*
      Deck NUỐT cả cú dọc khi đang thu lại, và đó là điều kiện để vuốt ngang
      sạch.

      ── lỗi nó sửa ──

      Trước đây `failOffsetY` cho cú cuộn dọc thật thắng: ngón tay đi lệch quá
      24 điểm dọc thì pan bỏ cuộc và ScrollView nhận tiếp. Nhưng một cú vuốt
      ngang của người thật gần như không bao giờ nằm ngang tuyệt đối — nó võng
      xuống — nên "vuốt sang thẻ khác" và "cuộn trang xuống" tranh nhau cùng một
      cử chỉ, và người dùng thua ván này thắng ván kia mà không hiểu vì sao.

      Đặt ngưỡng kích hoạt trên CẢ HAI trục thì mọi cú kéo trong vùng deck đều
      thuộc về pan. Cú vuốt ngang không còn phải cạnh tranh.

      ── và "đi dọc thì không có gì xảy ra" KHÔNG tự đúng ──

      Câu đó từng đứng ở đây, kèm lý do "chỗ này chỉ đọc `translationX`". Sai:
      một cú kéo dọc của người thật vẫn có `translationX` khác 0 — bàn tay rung.
      `onUpdate` dịch cả deck theo từng điểm ngang đó, nên vòng tròn RUNG theo
      ngón tay. Đo được trên harness: kéo dọc 14 bước, x của ring nhảy 69 → 67
      → 68. Đó đúng là cú "giật giật" đã bị báo, và nó do chính thay đổi này
      sinh ra.

      Nên trục được CHỐT một lần lúc cú chạm bắt đầu di chuyển, rồi giữ nguyên
      cho tới khi nhấc tay — đúng cách `UIScrollView` khoá hướng. Đây không phải
      phép đoán góc theo từng khung hình (thứ đã bị cấm ở đây, và đúng là nên
      cấm): quyết định xảy ra MỘT lần, và sau đó không có gì đo lại nữa.

      `failOffsetY` bỏ hẳn chứ không chỉnh: nó TỒN TẠI để nhường, mà nhường là
      đúng cái phải chấm dứt. Giữ lại một con số nhường lớn hơn chỉ là dời chỗ
      lỗi ra xa hơn chứ không bỏ nó.

      ── vì sao khoá này an toàn ──

      Nó chỉ áp khi thu lại. Mở chi tiết ra thì `enabled(!locked)` tắt pan, mọi
      cử chỉ về lại ScrollView, và tấm chi tiết — cao hơn cả màn hình — cuộn
      được bình thường. Đúng hai chế độ đã đặt ra: thu lại thì vuốt ngang, mở ra
      thì cuộn dọc.

      Đánh đổi: khi thu lại, người dùng không cuộn trang được bằng cách kéo TRÊN
      deck; họ kéo ở phần dưới (Koa, các nút ghi). Đó là chủ ý, không phải sót.
    */
    .activeOffsetX([-HYSTERESIS, HYSTERESIS])
    .activeOffsetY([-HYSTERESIS, HYSTERESIS])
    .onBegin(() => {
      from.value = at.value;
      axis.value = 0;
    })
    .onUpdate((e) => {
      /* Chốt trục ở khung hình đầu tiên có di chuyển thật, rồi thôi. */
      if (axis.value === 0) {
        const dx = Math.abs(e.translationX);
        const dy = Math.abs(e.translationY);
        if (dx < 1 && dy < 1) return;
        axis.value = dx >= dy ? 1 : 2;
      }
      /* Trục dọc: nuốt cú chạm để trang không cuộn, nhưng KHÔNG dịch deck. */
      if (axis.value === 2) return;
      const span = w > 0 ? w : 1;
      const next = from.value - e.translationX / span;
      /* Soft past either end: the page still moves, a third as far, so the deck
         answers the finger instead of feeling stuck. */
      at.value = next < 0 ? next / 3 : next > last ? last + (next - last) / 3 : next;
    })
    .onEnd((e) => {
      /* Cú dọc không chọn trang: nó chưa từng dịch deck thì cũng không được
         quyết định deck dừng ở đâu. */
      if (axis.value !== 1) return;
      const span = w > 0 ? w : 1;
      const moved = -e.translationX / span;
      const flung = Math.abs(e.velocityX) > 550;
      const step = flung || Math.abs(moved) > COMMIT ? Math.sign(moved) : 0;
      const target = Math.min(last, Math.max(0, Math.round(from.value) + step));
      /* Báo ra ở JS khi đã CHỌN xong trang, không phải theo từng frame: Today
         dùng tín hiệu này để đóng chi tiết và đưa trang về đầu, và làm hai việc
         đó giữa cú vuốt là làm chúng nhiều lần. */
      if (target !== Math.round(from.value)) runOnJS(settle)(target);
      at.value = withSpring(target, SNAP);
    });

  /* Xem ghi chú ở `scrollRef`: không khai thì một cú kéo dọc trên deck sẽ huỷ
     cú cuộn của trang giữa đà. */
  if (scrollRef) pan = pan.simultaneousWithExternalGesture(scrollRef as never);

  /* Ổn định như `onHeight`, và vì đúng một lý do — xem ghi chú ở đó. */
  const measureW = useCallback((e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setW((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  }, []);

  /**
   * Chiều cao của TỪNG trang, đo riêng.
     *
     * Trước đây phép đo này nuôi một `Math.max(...)` và mọi trang phải dành sẵn
     * chiều cao của trang cao nhất. Nay nó nuôi `heights[page]`: bố cục mô tả
     * trang bạn đang nhìn.
   *
   * ── why the grow-only version was wrong ──
   *
   * It kept a single `max` and refused to come down, which was right while a
   * page's height was fixed: a card rendering short for one frame as its data
   * landed would otherwise pull the deck up and drop everything below it.
   *
   * Then the pages learnt to expand. Tapping the chevron opens a panel of
   * sub-scores, and a max that never falls means CLOSING it leaves the deck at
   * its opened height for the rest of the session — a page-tall hole under the
   * ring that nothing will ever fill.
   *
   * Keeping each page's own height and taking the max of the current values
   * gets both: the deck follows a real expansion in either direction, and one
   * page briefly reporting short cannot shrink the deck below a taller sibling
   * that is still tall.
   */
  /**
   * Một hàm ỔN ĐỊNH, và việc nó ổn định là cả bản sửa cho cú giật.
   *
   * ── lỗi ──
   *
   * Trước đây đây là `measure(i)` trả về một closure mới, gắn thẳng vào
   * `onLayout={measure(i)}`. Mỗi lần render sinh ra một hàm KHÁC, React thấy
   * prop đổi nên gắn lại handler, React Native bắn `onLayout` lần nữa,
   * `setHeights` chạy, render lại — và vòng đó không có đáy.
   *
   * Trên máy nó đọc ra là thanh ring giật liên tục ngay khi vào app, và Koa với
   * các nút ghi không kịp hiện ra: khối đó vào bằng một hiệu ứng `entering`, mà
   * một hiệu ứng bắt đầu lại ở mỗi frame thì không bao giờ tới đích. Bấm mũi tên
   * rồi đóng lại "sửa" được vì nó tháo và dựng lại cả nhánh, cắt ngang vòng lặp.
   *
   * `useCallback` với deps rỗng cho một hàm sống suốt đời component. Chỉ số đi
   * vào bằng THAM SỐ chứ không bằng closure, nên không cần sinh hàm mới cho từng
   * trang.
   *
   * Ngưỡng một điểm ảnh nguyên, giống `widget-heights.ts`: layout trả về số lẻ,
   * và một hàng đổi từ 9 sang 10 có thể báo 96.33 thay vì 96 — ghi lại con số đó
   * là ghi lại nhiễu, và ở đây nhiễu nghĩa là render lại.
   */
  const onHeight = useCallback((i: number, next: number) => {
    setHeights((prev) => {
      if (Math.abs((prev[i] ?? 0) - next) < 1) return prev;
      const out = prev.slice();
      out[i] = next;
      return out;
    });
  }, []);

  if (pages.length === 0) return null;

  /* One page is not a deck: no gesture, no pips, no clipped box around a
     carousel that cannot move. */
  if (pages.length === 1) return <>{pages[0]}</>;

  return (
    <View onLayout={measureW}>
      <GestureDetector gesture={pan}>
        {/*
          `adjustable` — và không có nó thì năm trang kia KHÔNG TỒN TẠI với
          VoiceOver.

          Cách duy nhất đổi trang là vuốt ngang, mà VoiceOver chiếm đúng cử chỉ
          đó để đi giữa các phần tử. Người dùng screen reader vì thế bị khoá ở
          trang đầu: năm trong sáu chỉ số của họ không có đường nào tới. Không
          lỗi, không cảnh báo — chỉ là năm màn hình biến mất với một nhóm người.

          `adjustable` là câu trả lời của nền tảng: VoiceOver đọc "điều chỉnh
          được", rồi vuốt LÊN/XUỐNG gọi increment/decrement. Cùng deck, cùng
          trạng thái, một cửa vào khác.

          Nhãn nói vị trí bằng LỜI, vì hàng chấm là thông tin thị giác thuần.
        */}
        <View
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={a11yLabel}
          accessibilityValue={{ min: 1, max: pages.length, now: page + 1 }}
          accessibilityActions={ADJUST}
          onAccessibilityAction={(e) => {
            const d = e.nativeEvent.actionName === 'increment' ? 1 : -1;
            const next = Math.min(last, Math.max(0, page + d));
            if (next === page) return;
            at.value = withSpring(next, SNAP);
            settle(next);
          }}
          style={[styles.stage, shown > 0 ? { height: shown } : null]}>
          {pages.map((node, i) => (
            <Page key={i} index={i} at={at} width={w} onHeight={onHeight}>
              {node}
            </Page>
          ))}
        </View>
      </GestureDetector>


      {/*
        Hàng chấm KHÔNG được đọc lên.

        Sáu chấm không có nội dung: chúng nói vị trí bằng hình. Với screen reader
        chúng thành sáu phần tử rỗng phải lướt qua — nhiễu thuần tuý. Thông tin
        ấy đã nằm ở `accessibilityValue` của deck ("2 trên 6"), nơi nó là một câu
        chứ không phải sáu chấm. `skeleton.tsx` lập luận đúng như vậy khi ẩn các
        khối bóng.
      */}
      {/*
        Hàng chấm biến mất khi mở chi tiết.

        Nó nói "còn trang nữa, vuốt đi". Mở chi tiết ra thì vuốt bị khoá
        (`pan.enabled(!locked)`), nên hàng chấm đang quảng cáo một thao tác
        không dùng được — nó không sai một chút, nó sai hoàn toàn: người dùng
        vuốt, không có gì xảy ra, và họ kết luận app hỏng chứ không kết luận
        rằng chế độ đã đổi.

        Đi qua `Expander` chứ không phải một câu điều kiện, vì hai lý do. Một:
        biến mất tức thì là một hàng 18 điểm bốc hơi giữa lúc thẻ đang mở ra, và
        mắt đọc cú giật đó là một lỗi vẽ. Hai: `Expander` chạy chiều cao VÀ độ
        mờ trên cùng một shared value, nên hàng chấm mờ đi đúng lúc nó co lại —
        hai thứ rời nhau sẽ cho ra một hàng chấm mờ vẫn còn chiếm chỗ.
      */}
      <Expander open={!locked}>
        <View
          style={styles.pips}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants">
          {pages.map((_, i) => (
            <Pip key={i} index={i} at={at} />
          ))}
        </View>
      </Expander>
    </View>
  );
}

/** One page, parked a full deck-width away for every step it is from the front. */
function Page({
  index,
  at,
  width,
  onHeight,
  children,
}: {
  index: number;
  at: SharedValue<number>;
  width: number;
  onHeight: (index: number, height: number) => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (index - at.value) * (width || 1) }],
  }));
  /* Ổn định theo `index` — xem ghi chú ở `onHeight` về vì sao một handler đổi
     danh tính mỗi render là một vòng lặp layout. */
  const measure = useCallback(
    (e: LayoutChangeEvent) => onHeight(index, e.nativeEvent.layout.height),
    [index, onHeight],
  );
  return (
    <Animated.View style={[styles.page, style]}>
      {/*
        Không có dải kính nào ở đây, và việc bỏ nó đi là bản sửa cho "thẻ bị cắt
        ngang".

        Trước đó mỗi trang có một `BlurView` phủ kín. Nó phẳng và không viền,
        nhưng nó vẫn có MÉP DƯỚI: chỗ blur kết thúc là một đường ngang cứng vắt
        qua màn hình, ngay trên Koa. Hero không được phép có mép — nó là phần
        trên cùng của trang, không phải một tấm đặt lên trang.

        Và khi không còn thẻ thì cũng không còn gì để làm mờ: thứ duy nhất phía
        sau vòng tròn là lớp aura, và làm mờ một wash gradient thì cho ra đúng
        cái wash đó. Blur được chọn hồi phương án còn lại là một cái thẻ ĐỤC che
        mất màu; giờ không có thẻ nào cả, nên nó không còn việc gì để làm.
      */}
      <View onLayout={measure}>{children}</View>
    </Animated.View>
  );
}

/**
 * One pip, brightening and stepping forward as its page arrives — NOT widening.
 *
 * The word matters because widening is what a first draft did and what
 * `tools/motion.mjs` refused: an animated `width` is a layout property running
 * on every frame of every swipe, and the obvious escape — `scaleX` on a rounded
 * pill — is the thing `progress-bar.tsx` already measured and rejected, because
 * scaling one axis of a fully-rounded shape pulls its end caps into ovals.
 * UIKit's own page control does not resize its dots either.
 */
function Pip({ index, at }: { index: number; at: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = Math.min(1, Math.abs(at.value - index));
    return {
      opacity: interpolate(t, [0, 1], [1, 0.28]),
      transform: [{ scale: interpolate(t, [0, 1], [1.25, 1]) }],
    };
  });
  return <Animated.View style={[styles.pip, style]} />;
}

const styles = StyleSheet.create({
  /* Clipped, and that is what replaces the opaque backing the stack needed: a
     page one step away sits a full width to the side and is simply cut off, so
     no card has to paint over another and none of them has to be solid. */
  stage: { position: 'relative', overflow: 'hidden' },
  /*
    Neo TRÊN, không neo dưới — và việc thiếu chữ "dưới" đó là một lỗi tôi đã tạo
    ra rồi phải gỡ.

    Bản trước đặt cả `top: 0` lẫn `bottom: 0` để mọi trang bằng đúng kích thước
    sân khấu. Nó bằng thật, và nó không vẽ ra gì cả: chiều cao trang khi đó lấy
    từ sân khấu, còn chiều cao sân khấu lấy từ nội dung trang đo được. Vòng lặp
    chết — sân khấu 0 → trang 0 → đo ra 0 → sân khấu vẫn 0. Trên máy thật là bốn
    cái pip nằm dưới một khoảng trống.

    Thứ THẬT SỰ làm các trang bằng nhau là `hero-panel.tsx`: bốn trang cùng một
    vỏ, cùng một cỡ vòng, cùng một bộ đệm. Kích thước bằng nhau đến từ việc nội
    dung giống nhau, không đến từ một ràng buộc bố cục vay chiều cao của chính
    thứ nó đang định nghĩa.
  */
  page: { position: 'absolute', left: 0, right: 0, top: 0 },
  /* Xếp tuyệt đối để không cộng một điểm nào vào chiều cao deck: nó là phần
     ĐUÔI của thẻ, không phải một hàng nữa dưới thẻ. */
  pips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: spacing.sm },
  pip: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.foreground },
});
