import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SheetHeader } from '@/components/ascnd/sheet-header';
import { PressScale } from '@/components/ascnd/press-scale';
import { Ruler, RULER_H, TICK_W } from '@/components/ascnd/weight-goal-ruler';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { useI18n } from '@/hooks/use-app-settings';
import type { WeightUnit } from '@/lib/units';
import { displayWeight, weightLabel, weightToKg } from '@/lib/units';

/**
 * Set a target weight — a full screen with a ruler you drag past a fixed mark.
 *
 * A typed number was the previous version and it was the wrong instrument. A
 * target weight is not really entered, it is *chosen*: you already know the
 * neighbourhood and what you are deciding is how far from today to put it. A
 * ruler shows exactly that — where you are on the scale, how much is on either
 * side, and how far one nudge moves you — and a text field shows none of it.
 * It also never opens a keyboard over the thing you are trying to look at.
 *
 * ── the ruler is a drawing, and it lives in its own file ──
 *
 * Đoạn ở đây từng mô tả một `FlatList` và lập luận rằng ảo hoá làm cả dải
 * 30–300 kg thành miễn phí. Nó không miễn phí: người dùng báo thước "phải load
 * mỗi lần kéo nhanh", tức những ô trắng mà tài liệu React Native gọi thẳng là
 * đánh đổi cố hữu của `VirtualizedList`.
 *
 * Thước nay là MỘT `<Pattern>` của SVG trượt bằng `transform` trên luồng UI.
 * Không có gì được dựng theo từng vạch, nên không có gì có thể dựng không kịp.
 * `weight-goal-ruler` ghi đầy đủ vì sao ảo hoá là câu trả lời sai cho một hoạ
 * tiết tuần hoàn.
 *
 * Nó vẫn `memo`ised và vẫn ở tệp riêng, nhưng lý do đã đổi: màn này `setState`
 * theo cú kéo để con số lớn đi theo, và mọi thứ đưa sang nó phải giữ nguyên
 * danh tính giữa các lần render.
 *
 * Hai đầu vẫn là đệm của nội dung chứ không phải phần tử chèn, nên vị trí cuộn
 * vẫn đúng bằng `index × TICK_W`.
 *
 * ── the number comes from the scroll position ──
 *
 * `Math.round(offsetX / TICK_W)` is the selected index, and `snapToInterval`
 * keeps rest positions on exact ticks, so the reading can never sit between
 * two values. Nothing is committed while dragging: `Done` writes, backing out
 * leaves the stored target alone.
 *
 * Phép tính ấy nay chạy TRONG worklet của thước, và nó chỉ gọi sang đây khi kết
 * quả đổi. Trước đây mỗi khung hình cuộn đều là một lời gọi JS rồi mới so sánh
 * ở đầu này.
 *
 * ── getting it to the right place on the first open ──
 *
 * Harder than it looks, and it was wrong: the ruler opened somewhere arbitrary
 * and dragged from there, so the number under the mark meant nothing.
 *
 * `onContentSizeChange` là tín hiệu đáng tin: it fires once the
 * content has actually been measured, which is the first moment a scroll
 * offset means anything. Positioning happens there, once per open, guarded by
 * a ref.
 *
 * Until that has happened the ruler's report is ignored entirely. Otherwise the
 * layout's own transient offsets get read as the user choosing values —
 * which is where the phantom movement came from, and a burst of haptics with
 * it.
 *
 * ── it works in the display unit ──
 *
 * The ruler is laid out in whatever unit the app shows and converted to
 * kilograms on save, a tenth of a unit per tick either way. A tenth of a pound
 * is finer than a tenth of a kilogram, which is harmless — the store keeps two
 * decimal places of a kilogram, so no two ticks can round onto the same
 * stored value.
 */

/** the range the store clamps to, in kg */
const MIN_KG = 30;
const MAX_KG = 300;

export function WeightGoalDialog({
  visible,
  goalKg,
  currentKg,
  unit,
  i18n,
  onSave,
  onClose,
}: {
  visible: boolean;
  /** the target as stored, or null when none is set */
  goalKg: number | null;
  /** latest weigh-in — seeds the ruler, and says which way the goal points */
  currentKg: number | null;
  unit: WeightUnit;
  i18n: ReturnType<typeof useI18n>;
  onSave: (kg: number | null) => void;
  onClose: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wl = weightLabel(unit);
  const list = useRef<Animated.ScrollView>(null);

  /**
   * One tick is a tenth of a unit — 50, 50.1, … 50.9, 51.
   *
   * The arithmetic is done in tenths as whole numbers rather than in steps of
   * `0.1`, because there are 2 700 of them between 30 and 300 kg and floating
   * point does not survive that: `30 / 0.1` is already 299.999…, and adding a
   * tenth to itself a few thousand times drifts far enough to land the ruler
   * between values. Integers cannot drift; the division back to a real number
   * happens once, at the end.
   */
  const min10 = Math.ceil(displayWeight(MIN_KG, unit) * 10);
  const max10 = Math.floor(displayWeight(MAX_KG, unit) * 10);
  const count = max10 - min10 + 1;

  const valueAt = useCallback((i: number) => (min10 + i) / 10, [min10]);

  /** where the ruler opens: the existing target, else today's weight, else 70kg */
  const seedIndex = useMemo(() => {
    const seedKg = goalKg ?? currentKg ?? 70;
    return Math.max(0, Math.min(count - 1, Math.round(displayWeight(seedKg, unit) * 10) - min10));
  }, [goalKg, currentKg, unit, min10, count]);

  const [index, setIndex] = useState(seedIndex);

  /**
   * Whether the ruler has been put where it belongs for this opening.
   *
   * A ref, not state: it gates the ruler's report, and flipping it must not
   * itself cause a render in the middle of a drag.
   */
  const placed = useRef(false);

  /**
   * The last index a haptic was fired for.
   *
   * A ref, and this is the whole reason the clicks did not track the notches.
   * Bộ xử lý cuộn từng so với `index` lấy từ state — một giá trị chụp lại lúc
   * hàm được tạo. React không nhất thiết render lại giữa hai sự kiện cuộn, nên
   * vài sự kiện liên tiếp cùng thấy một `index` cũ: đi qua ba vạch chỉ kêu một
   * lần, và quay lại qua đúng vạch đó thì kêu thêm lần nữa. Một ref được ghi
   * đồng bộ ngay trong hàm, nên mỗi lần đều so với thứ lần trước thật sự thấy.
   *
   * Phép so THỨ NHẤT nay nằm trong worklet của thước và dùng shared value cho
   * đúng lý do ấy; ref này giữ phép so thứ hai, thứ chỉ chạy sau cổng `placed`.
   */
  const clicked = useRef(seedIndex);

  /**
   * Reseed on every open, not once on mount.
   *
   * The screen stays mounted between openings, so without this it would come
   * back showing wherever it was left — including a value that was abandoned
   * by backing out rather than saved.
   */
  useEffect(() => {
    if (!visible) {
      placed.current = false;
      return;
    }
    setIndex(seedIndex);
    clicked.current = seedIndex;
  }, [visible, seedIndex]);

  /**
   * The content has been measured — now an offset means something. Position
   * the ruler and start listening to it.
   */
  const onContentSizeChange = useCallback(() => {
    if (placed.current) return;
    list.current?.scrollTo({ x: seedIndex * TICK_W, animated: false });
    clicked.current = seedIndex;
    placed.current = true;
  }, [seedIndex]);

  /*
    Vạch dưới kim vừa đổi.

    Phép SO đã chuyển vào worklet của thước — xem `weight-goal-ruler` — nên hàm
    này chỉ chạy khi thật sự có thay đổi, không phải mỗi khung hình. `clicked`
    vẫn còn vì nó trả lời một câu khác: cú nhảy nào là do NGƯỜI DÙNG. Thước
    không biết về `placed`, nên nó vẫn báo trong lúc bố cục đang ổn định.
  */
  const onIndex = useCallback((next: number) => {
    // Layout settling is not the user choosing a number
    if (!placed.current) return;
    const prev = clicked.current;
    if (next === prev) return;
    clicked.current = next;
    setIndex(next);

    /*
     * Two feels, because a tick is a tenth now.
     *
     * Every tick gets the light picker click. Drag slowly and you feel each
     * tenth, which is the point of them being there.
     *
     * Crossing a whole unit gets something firmer. At any real dragging speed
     * the tenths arrive faster than the Taptic Engine will play them — it
     * manages about one every 30ms — so on their own they degrade into a buzz
     * that no longer corresponds to anything. Whole units are ten times
     * further apart, so they survive that ceiling and keep giving the drag a
     * structure you can feel.
     *
     * The test is a crossing, not equality: a fast drag steps over several
     * ticks between frames and can pass a whole unit without ever landing on
     * it.
     */
    if (Math.floor(next / 10) !== Math.floor(prev / 10)) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      Haptics.selectionAsync();
    }
  }, []);

  const value = valueAt(index);

  /**
   * Which way this goal points, from today's weight.
   *
   * Not from `profiles.goal` — that is what the person told onboarding they
   * were doing, and this is what the number they just chose actually means. If
   * the two disagree the number is the honest one.
   */
  const currentDisplay = currentKg != null ? displayWeight(currentKg, unit) : null;
  const intent =
    currentDisplay == null || Math.abs(value - currentDisplay) < 0.05
      ? i18n.nWeightGoalMaintain
      : value > currentDisplay
        ? i18n.nWeightGoalGain
        : i18n.nWeightGoalLose;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <SheetHeader title={i18n.nWeightGoalEdit} onClose={onClose} />

        <View style={styles.stage}>
          <Text style={styles.intent}>{intent}</Text>
          {/* Always a decimal. Dropping it on whole numbers would change the
              string's width every tenth tick, and the number is centred — so
              it would twitch left and right the whole way through a drag. */}
          <Text style={styles.value}>
            {value.toFixed(1)} {wl}
          </Text>

          <View style={styles.ruler}>
            <Ruler
              count={count}
              min10={min10}
              width={width}
              scrollRef={list}
              onIndex={onIndex}
              onContentSizeChange={onContentSizeChange}
            />

            {/* The mark the ruler is read against */}
            <View style={styles.needle} pointerEvents="none" />
          </View>
        </View>

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          {/* Clearing is only offered when there is something to clear */}
          {goalKg != null ? (
            <PressScale
              style={styles.ghost}
              onPress={() => {
                Haptics.selectionAsync();
                onSave(null);
                onClose();
              }}>
              <Text style={styles.ghostText}>{i18n.nWeightGoalClear}</Text>
            </PressScale>
          ) : null}
          <PressScale
            style={styles.done}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSave(weightToKg(value, unit));
              onClose();
            }}>
            <Text style={styles.doneText}>{i18n.nWeightGoalDone}</Text>
          </PressScale>
        </View>
      </View>
    </Modal>
  );
}

const stylesFor = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.background },


  // The number and the ruler sit together in the middle of the screen
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  intent: { ...type.body, color: c.mutedForeground },
  value: {
    fontSize: 52,
    fontWeight: '700',
    letterSpacing: -1,
    color: c.foreground,
    fontVariant: ['tabular-nums'],
    marginBottom: spacing.lg,
  },

  /*
   * No edge treatment. A gradient of the page colour used to sit over the
   * ends, on the theory that the ruler should fade out rather than stop at the
   * screen edge. In practice it covered nearly a third of the strip at each
   * side in near-black, which reads as two panels laid over the ruler rather
   * than as the ruler receding. The marks now simply run to the edges.
   */
  ruler: { height: RULER_H, alignSelf: 'stretch', justifyContent: 'center' },
  // Taller than the whole-unit marks and wider than any of them, so the ruler
  // is read against it rather than it being mistaken for one more tick
  needle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 0,
    width: 3,
    height: 68,
    borderRadius: 1.5,
    backgroundColor: c.foreground,
  },

  footer: { paddingHorizontal: spacing.md, gap: spacing.xs },
  done: {
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f5f5f5',
  },
  doneText: { ...type.headline, color: '#111111' },
  ghost: { alignItems: 'center', paddingVertical: spacing.sm },
  ghostText: { ...type.footnote, color: c.mutedForeground },
}));
