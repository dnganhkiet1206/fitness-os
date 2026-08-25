import MaskedView from '@react-native-masked-view/masked-view';
import { useId, useState } from 'react';
import { BlurView } from 'expo-blur';
import { Platform, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from 'react-native-reanimated';

import { colors, radius } from '@/constants/ascnd';

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

/**
 * Và bao nhiêu độ lệch DỌC thì cú vuốt ngang bị bỏ hẳn.
 *
 * Từng bằng đúng HYSTERESIS, và đó là lý do "mở chi tiết ra thì không vuốt sang
 * trang khác được": `failOffsetY` làm pan thất bại VĨNH VIỄN cho cú chạm đó,
 * không phải tạm hoãn. Khi phần chi tiết mở, tấm cao hơn hẳn và ngón tay đi
 * ngang trên một vùng cao thì gần như luôn lệch vài pixel dọc trước — lệch 13px
 * là mất luôn cú vuốt, và người dùng phải thử lại mà không hiểu vì sao.
 *
 * Gấp đôi thì cú cuộn dọc thật vẫn thắng (nó đi thẳng xuống, qua 24px trước khi
 * đi ngang 12px), còn một cú vuốt ngang hơi xiên thì không còn bị giết.
 */
const GIVE_UP_Y = 24;

const DOT = 6;

/**
 * Kính của hero KÉO XUỐNG qua mép dưới của nó, mờ dần đến hết.
 *
 * ── vì sao phải có ──
 *
 * Trang hero là một `BlurView` phẳng phủ kín trang, và nó DỪNG ở đúng hàng
 * pixel cuối cùng của trang: bên trên là aura đã được làm mờ, ngay bên dưới là
 * aura sắc nét, cách nhau một hàng. Đó là một đường kẻ ngang chạy hết bề rộng
 * màn hình mà không có gì vẽ nó — thứ `status-scrim.tsx` gọi đúng tên khi bỏ
 * cái hairline của nó đi: "một cái kết không được đánh dấu là một vết nhoè mà
 * mắt cứ cố lấy nét vào".
 *
 * Cách chữa ở đó cũng là cách chữa ở đây, và là cùng một cơ chế: một
 * `MaskedView` trên một `BlurView`, mask là một gradient dọc. Blur là bộ lọc
 * nền nên nó SỐNG SÓT qua việc bị mask — status-scrim đã trả giá một vòng cho
 * kết luận đó rồi, khi mang một nhận định về `UIGlassEffect` áp nhầm sang
 * `UIBlurEffect` và xếp bốn tấm chồng lên nhau.
 *
 * ── vì sao nó nằm ở ĐÂY, giữa sân khấu và hàng pip ──
 *
 * `BlurView` làm mờ những gì được vẽ TRƯỚC nó. Đặt sau `stage` thì thứ nó lấy
 * mẫu là lớp aura; đặt trước hàng pip thì pip — và toàn bộ dashboard bên dưới,
 * vốn là anh em vẽ sau ở component cha — nằm ĐÈ LÊN nó và không bị mờ. Một
 * dải blur trôi nổi trên nội dung là một dải làm mờ nội dung.
 *
 * Nó cũng xếp tuyệt đối và `pointerEvents="none"`: không chiếm một điểm chiều
 * cao nào, không ăn một cú chạm nào. Mốc `top` là chiều cao trang cao nhất, nên
 * khi mở phần chi tiết ra thì dải kính đi theo mép dưới mới.
 */
const TRAIL = 72;

/**
 * Blur chỉ có trên iOS, đúng lý do `status-scrim.tsx` đã ghi: trên Android
 * `BlurView` cần `blurMethod` cộng một `BlurTargetView` bọc quanh thứ đang bị
 * làm mờ, còn để mặc định nó vẽ ra "một view có nền bán trong suốt" — tức là
 * một dải xám, đúng thứ mà đoạn này sinh ra để KHÔNG phải là.
 */
const NATIVE_BLUR = Platform.OS === 'ios';

export function CardDeck({
  children,
  progress,
}: {
  children: React.ReactNode[];
  /** Where the deck is, as a float index. Pass one in to drive something else
   *  from the same swipe — Today drives the background colour off it. */
  progress?: SharedValue<number>;
}) {
  const pages = children.filter(Boolean);
  const [w, setW] = useState(0);
  const [heights, setHeights] = useState<number[]>([]);

  /* Id của gradient là TOÀN CỤC trên native, không cục bộ trong `<Svg>` khai
     ra nó — hai deck cùng mounted (một trang được push nằm trên tab bên dưới)
     sẽ cùng dùng cái đăng ký sau cùng. `status-scrim.tsx` nói repo này đã dính
     ba lần; `useId` là luật. */
  const uid = useId();
  const mid = `deckTrailMask-${uid}`;

  const own = useSharedValue(0);
  const at = progress ?? own;
  const from = useSharedValue(0);

  const last = pages.length - 1;
  const tallest = heights.length > 0 ? Math.max(0, ...heights.filter((n) => Number.isFinite(n))) : 0;

  const pan = Gesture.Pan()
    .activeOffsetX([-HYSTERESIS, HYSTERESIS])
    .failOffsetY([-GIVE_UP_Y, GIVE_UP_Y])
    .onBegin(() => {
      from.value = at.value;
    })
    .onUpdate((e) => {
      const span = w > 0 ? w : 1;
      const next = from.value - e.translationX / span;
      /* Soft past either end: the page still moves, a third as far, so the deck
         answers the finger instead of feeling stuck. */
      at.value = next < 0 ? next / 3 : next > last ? last + (next - last) / 3 : next;
    })
    .onEnd((e) => {
      const span = w > 0 ? w : 1;
      const moved = -e.translationX / span;
      const flung = Math.abs(e.velocityX) > 550;
      const step = flung || Math.abs(moved) > COMMIT ? Math.sign(moved) : 0;
      const target = Math.min(last, Math.max(0, Math.round(from.value) + step));
      at.value = withSpring(target, { damping: 22, stiffness: 190, mass: 0.7 });
    });

  const measureW = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    setW((prev) => (Math.abs(prev - next) < 1 ? prev : next));
  };

  /**
   * The tallest page sets the height — measured PER PAGE, not as one number.
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
  const measure = (i: number) => (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.height;
    setHeights((prev) => {
      if (Math.abs((prev[i] ?? 0) - next) < 0.5) return prev;
      const out = prev.slice();
      out[i] = next;
      return out;
    });
  };

  if (pages.length === 0) return null;

  /* One page is not a deck: no gesture, no pips, no clipped box around a
     carousel that cannot move. */
  if (pages.length === 1) return <>{pages[0]}</>;

  return (
    <View onLayout={measureW}>
      <GestureDetector gesture={pan}>
        <View style={[styles.stage, tallest > 0 ? { height: tallest } : null]}>
          {pages.map((node, i) => (
            <Page key={i} index={i} at={at} width={w} onHeight={measure(i)}>
              {node}
            </Page>
          ))}
        </View>
      </GestureDetector>

      {/* Kính của thẻ kéo dài xuống dưới mép và tắt dần — xem ghi chú ở TRAIL. */}
      {NATIVE_BLUR && tallest > 0 ? (
        <View pointerEvents="none" style={[styles.trail, { top: tallest, height: TRAIL }]}>
          <MaskedView
            style={StyleSheet.absoluteFill}
            maskElement={
              /*
                Bốn chặng chứ không phải hai. Một dốc thẳng chạm 0 ở một hàng
                xác định và mắt tìm ra đúng hàng đó — cùng lập luận, cùng hình
                dạng với mask của `status-scrim.tsx`, chỉ khác là ở đây nó bắt
                đầu từ chỗ kính của thẻ vừa hết chứ không phải từ mép trên màn
                hình.
              */
              <Svg style={StyleSheet.absoluteFill}>
                <Defs>
                  <LinearGradient id={mid} x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="#fff" stopOpacity="1" />
                    <Stop offset="0.45" stopColor="#fff" stopOpacity="0.6" />
                    <Stop offset="0.78" stopColor="#fff" stopOpacity="0.18" />
                    <Stop offset="1" stopColor="#fff" stopOpacity="0" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${mid})`} />
              </Svg>
            }>
            {/* Cùng cường độ với kính của trang: nếu khác thì chỗ nối giữa hai
                lớp lại thành đúng cái đường kẻ vừa xoá đi. */}
            <BlurView intensity={18} tint="dark" style={StyleSheet.absoluteFill} />
          </MaskedView>
        </View>
      ) : null}

      <View style={styles.pips}>
        {pages.map((_, i) => (
          <Pip key={i} index={i} at={at} />
        ))}
      </View>
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
  onHeight: (e: LayoutChangeEvent) => void;
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: (index - at.value) * (width || 1) }],
  }));
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
      <View onLayout={onHeight}>{children}</View>
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
  trail: { position: 'absolute', left: 0, right: 0 },
  pips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 5, paddingTop: 12 },
  pip: { width: DOT, height: DOT, borderRadius: radius.full, backgroundColor: colors.foreground },
});
