import { memo, useId, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { Defs, Pattern, Rect, Svg } from 'react-native-svg';

import { colors } from '@/constants/ascnd';

/**
 * The ruler: one static drawing that slides, not a list of marks.
 *
 * ── vì sao bản `FlatList` phải đi ──
 *
 * Người dùng báo: "thanh trượt phải load mỗi lần kéo nhanh". Đó là ô trắng của
 * `VirtualizedList`, và tài liệu của React Native nói thẳng rằng nó là một đánh
 * đổi cố hữu chứ không phải lỗi cấu hình: cửa sổ nhỏ thì kéo nhanh để lại
 * khoảng trống, cửa sổ lớn thì mỗi lô dựng lâu hơn và chặn luồng JS.
 *
 * Chính tệp này đã ghi lại đúng triệu chứng ấy từ trước, ở một chỗ khác:
 * `normal` làm cú vẩy đi vài nghìn điểm và "outrunning the renderer on the way,
 * so what you watched while it travelled was an empty strip". Bản sửa khi đó là
 * ghì tốc độ trôi lại (0.97) — tức giảm khả năng gặp, không phải bỏ nguyên
 * nhân. Và với một ngón tay kéo thẳng thì tốc độ là của người dùng, không phải
 * của `decelerationRate`.
 *
 * ── và vì sao chỉnh `maxToRenderPerBatch` cũng không phải câu trả lời ──
 *
 * Vì ở đây KHÔNG CÓ danh sách. 2.701 vạch không phải 2.701 thứ khác nhau; đó là
 * MỘT hoạ tiết dài 40 điểm lặp lại 270 lần. Ảo hoá một hoạ tiết tuần hoàn là
 * dựng đi dựng lại cùng một hình rồi vứt đi — đúng cái công việc mà cả cơ chế
 * ô trắng sinh ra để quản lý.
 *
 * Nên thứ được vẽ là một `<Pattern>` của SVG: MỘT node, một chu kỳ, phủ kín
 * khung nhìn. Không có gì để dựng theo từng vạch, nên không có gì có thể dựng
 * không kịp. Kéo nhanh cỡ nào cũng vậy — khái niệm "kịp" biến mất.
 *
 * ── cái gì chạy trên luồng nào ──
 *
 * `<Svg>` ĐỨNG YÊN. Chỉ lớp bọc nó nhận `translateX`, và giá trị ấy tính trong
 * worklet từ vị trí cuộn — cùng luật mà `assistant-aura` và `readiness-aura` đã
 * phải học: `react-native-svg` vẽ lại cả `<Svg>` khi một prop con đổi, nên
 * không bao giờ được chạy hoạt hoạ vào một prop con.
 *
 * Kết quả: mỗi khung hình của cú kéo tốn đúng một phép ghi `transform` trên
 * luồng UI. Luồng JS chỉ được gọi khi vạch dưới kim ĐỔI — mười lần mỗi đơn vị,
 * không phải sáu mươi lần mỗi giây — và chỉ để cập nhật con số lớn và bắn
 * haptic.
 *
 * ── phần cuộn vẫn là một `ScrollView` thật ──
 *
 * Cử chỉ, quán tính, `snapToInterval` và cảm giác nảy ở hai đầu đều là của
 * `UIScrollView`, và không có lý do nào để viết lại chúng. Nó chỉ không còn con
 * nào nữa: nội dung của nó là một bề rộng, còn hình thì nằm dưới.
 *
 * ── how far it coasts ──
 *
 * The number is chosen rather than named.
 *
 * iOS deceleration is a per-frame multiplier, so the distance a flick travels
 * scales with roughly `1 / (1 − rate)`. That is 10 for `fast` (0.9) and 500
 * for `normal` (0.998) — the two named settings are a factor of fifty apart,
 * with nothing in between, which is why this ended up as a literal.
 *
 * 0.97 is 3.3× `fast`, and it was reached by stepping up rather than down:
 * 0.94 (1.7×) coasted a couple of units and still read as stiff. A flick now
 * carries on the order of two hundred points — fifty ticks, about five units —
 * which is a throw you can feel, and a twentieth of what `normal` was doing.
 * `snapToInterval` finishes it on an exact tick: iOS picks the snap from where
 * the momentum was heading, so only the last few points are adjusted.
 *
 * Con số ấy được GIỮ, vì nó là một lựa chọn về cảm giác. Nhưng một trong hai lý
 * do của nó — "đi xa quá thì vượt mặt bộ dựng" — đã thôi tồn tại, và điều đó
 * được ghi ra đây thay vì để lập luận cũ đứng lại như thể nó vẫn đang chống đỡ
 * con số này.
 */

/**
 * Points between ticks — how far the finger travels for one tenth of a unit.
 *
 * 4, which puts a whole kilogram 40pt apart and about ten of them on screen.
 * There is a real trade here and it is worth naming: finer values mean more
 * ticks mean more dragging for the same distance travelled, unless the ticks
 * get narrower. At the old half-kilo steps a kilogram was 24pt; a tenth-kilo
 * ruler at the same 12pt tick would have made it 120, which is five times the
 * work to move the same amount. 4pt gets most of that back while leaving the
 * ticks far enough apart to read as separate marks rather than as a smear.
 */
export const TICK_W = 4;

/** ticks in a whole unit, at a tenth of a unit per tick */
const PER_UNIT = 10;

/** Chu kỳ của hoạ tiết: đúng một đơn vị tròn. */
const PERIOD = TICK_W * PER_UNIT;

/**
 * Height of the whole ruler strip.
 *
 * Exported because the screen has to size its own container and its needle to
 * match — the two were separate constants that happened to agree, which is a
 * pair of numbers waiting to drift apart.
 */
export const RULER_H = 96;

/*
 * Tall marks, thin marks — đúng những con số của bản `FlatList`, chỉ khác chỗ
 * chúng được vẽ ra.
 *
 * Height is what makes the ruler read as an instrument rather than a strip of
 * texture, and it is free: the marks are further apart vertically, not
 * horizontally, so nothing about the drag changes.
 *
 * Width is not free. At 4pt spacing a 1pt mark has three times its own width
 * of gap around it, which is what keeps it a mark; take it to 2 and the ruler
 * closes up into a grey band. Only the whole-unit marks are widened, and they
 * are one in ten.
 *
 * Cả hai neo ở mép DƯỚI của dải, nên vạch dài mọc LÊN từ một đường chân chung —
 * đúng hình dạng của một cái thước, và đúng hình dạng bản đã ship có.
 */
const MINOR_H = 28;
const MAJOR_H = 50;

export const Ruler = memo(function Ruler({
  count,
  min10,
  width,
  scrollRef,
  onIndex,
  onContentSizeChange,
}: {
  count: number;
  /**
   * The value of index 0, in tenths of a display unit.
   *
   * ── nó ở đây vì "cứ mười vạch một vạch dài" SAI ở đơn vị pound ──
   *
   * Luật cũ là `index % 10 === 0`, một phát biểu về DANH SÁCH chứ không về
   * thang đo. Ở kilogram nó đúng do tình cờ: index 0 là 30,0 kg nên `min10` là
   * 300 và mọi index chia hết cho 10 đều rơi vào một kilogram tròn.
   *
   * Ở pound index 0 là 66,1 lb (`min10` 661), nên vạch dài rơi vào 66,1 / 67,1
   * / 68,1 — suốt 5.954 vạch, không một vạch nào đánh vào một pound tròn. Không
   * ai báo, vì một hàng vạch dài cách đều nhau trông đúng bất kể nó bắt đầu ở
   * đâu.
   *
   * Nay nó quyết định PHA của hoạ tiết chứ không quyết định từng vạch — cùng
   * một sự thật, rẻ hơn một bậc.
   */
  min10: number;
  width: number;
  scrollRef: React.RefObject<Animated.ScrollView | null>;
  /** Gọi trên luồng JS, CHỈ khi vạch dưới kim đổi. */
  onIndex: (index: number) => void;
  onContentSizeChange: () => void;
}) {
  /* Nửa màn hình ở mỗi đầu, để giá trị đầu và cuối cũng tới được giữa. */
  const pad = (width - TICK_W) / 2;
  const total = pad * 2 + count * TICK_W;
  const svgW = width + PERIOD * 2;

  /*
    Id DUY NHẤT cho hoạ tiết.

    `readiness-aura` đã trả giá cho bài học này: hai màn cùng gắn một `<Svg>` có
    id viết cứng thì màn này vẽ ra kết luận của màn kia. Ở đây mới chỉ có một
    cái thước — nhưng "mới chỉ có một" là một sự thật về hôm nay.
  */
  const pid = `ruler-${useId()}`;

  const scrollX = useSharedValue(0);
  const last = useSharedValue(-1);

  const handler = useAnimatedScrollHandler(
    {
      onScroll: (e) => {
        scrollX.value = e.contentOffset.x;
        /*
          Đổi vạch thì mới sang JS.

          Bản trước gọi một hàm JS ở MỌI khung hình cuộn rồi mới so sánh ở bên
          kia. Phép so chuyển vào worklet: sáu mươi lần mỗi giây thành mười lần
          mỗi đơn vị, và giữa hai lần ấy luồng JS không cần biết cú kéo đang xảy
          ra.
        */
        const next = Math.max(0, Math.min(count - 1, Math.round(e.contentOffset.x / TICK_W)));
        if (next === last.value) return;
        last.value = next;
        runOnJS(onIndex)(next);
      },
    },
    [count, onIndex],
  );

  /*
    ── pha, và vì sao nó là một phép chia lấy dư chứ không phải một vị trí ──

    Hình vẽ chỉ rộng bằng khung nhìn cộng một chu kỳ đệm mỗi bên. Nó KHÔNG trôi
    đi cùng cú cuộn; nó trượt trong đúng một chu kỳ rồi lặp lại. Đó là lý do một
    dải dài 11.000 điểm không tốn gì cả.

    Vạch có chỉ số `i` nằm ở `pad + i·TICK_W − s`, và kim ở `pad`. Vạch dài đầu
    tiên có chỉ số `m = (−min10) mod 10`. Bắt nó rơi đúng vào một bội của chu kỳ
    trong toạ độ hình vẽ:

        tx = ((pad + TICK_W·m − s) mod PERIOD + PERIOD) mod PERIOD

    Hai lần `mod` chứ không một, và lý do KHÔNG phải là "nếu không thì vẽ sai".
    Tôi viết câu đó trước, rồi phép thử ngược bỏ một lần `mod` đi mà bước kiểm
    vẫn xanh — nó xanh đúng: `%` của JavaScript giữ dấu số bị chia, nên bản một
    `mod` cho `tx` âm, tức cả hình dịch trái thêm một chu kỳ, và một hoạ tiết
    tuần hoàn thì dịch nguyên một chu kỳ là KHÔNG đổi gì cả.

    Lý do thật là ngân sách đệm. Hình rộng hơn khung nhìn đúng một chu kỳ mỗi
    bên, và con số ấy vừa đủ khi `tx` nằm trong [0, PERIOD). Cho `tx` âm thì mép
    trái đi tới −2·PERIOD và mép phải chỉ còn vừa chạm khung nhìn — vẫn phủ kín
    hôm nay, và hết chỗ thở vào ngày ai đó đổi bề rộng đệm. Giữ `tx` trong một
    khoảng đã ghi ra thì phần đệm là một phép tính, không phải một sự may mắn.
  */
  const phase = TICK_W * (((-min10 % PER_UNIT) + PER_UNIT) % PER_UNIT);
  const slide = useAnimatedStyle(() => ({
    transform: [{ translateX: (((pad + phase - scrollX.value) % PERIOD) + PERIOD) % PERIOD }],
  }));

  const contentStyle = useMemo(() => ({ width: total }), [total]);

  return (
    <View style={styles.root}>
      <Animated.View style={[styles.paint, { left: -PERIOD, width: svgW }, slide]} pointerEvents="none">
        <Svg width={svgW} height={RULER_H}>
          <Defs>
            {/*
              Một chu kỳ: một vạch dài ở mép trái, chín vạch ngắn sau nó.

              `patternUnits="userSpaceOnUse"` để `width` là ĐIỂM chứ không phải
              tỉ lệ của hình bao — hình bao ở đây rộng theo màn hình, nên một
              hoạ tiết tính theo tỉ lệ sẽ co giãn theo cỡ máy và bước vạch thôi
              còn bằng 4 điểm.
            */}
            <Pattern id={pid} x={0} y={0} width={PERIOD} height={RULER_H} patternUnits="userSpaceOnUse">
              <Rect
                x={0}
                y={RULER_H - MAJOR_H}
                width={2}
                height={MAJOR_H}
                fill={colors.foreground}
                opacity={0.7}
              />
              {Array.from({ length: PER_UNIT - 1 }, (_, k) => (
                <Rect
                  key={k}
                  x={(k + 1) * TICK_W}
                  y={RULER_H - MINOR_H}
                  width={1}
                  height={MINOR_H}
                  fill={colors.foreground}
                  opacity={0.3}
                />
              ))}
            </Pattern>
          </Defs>
          <Rect x={0} y={0} width={svgW} height={RULER_H} fill={`url(#${pid})`} />
        </Svg>
      </Animated.View>

      {/*
        Trong suốt và nằm TRÊN: nó chỉ để bắt cử chỉ và giữ quán tính. Nội dung
        của nó là một bề rộng, không một con nào — thứ duy nhất nó còn phải biết
        là mình dài bao nhiêu.
      */}
      <Animated.ScrollView
        ref={scrollRef}
        style={StyleSheet.absoluteFill}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={TICK_W}
        decelerationRate={0.97}
        onScroll={handler}
        onContentSizeChange={onContentSizeChange}
        scrollEventThrottle={1}
        contentContainerStyle={contentStyle}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { height: RULER_H, alignSelf: 'stretch' },
  paint: { position: 'absolute', top: 0, height: RULER_H },
});
