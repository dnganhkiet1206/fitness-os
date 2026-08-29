import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { useEffect } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import type { useI18n } from '@/hooks/use-app-settings';
import { restLabel } from '@/lib/prescription';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The rest between sets.
 *
 * ── why it comes forward ──
 *
 * It was a bar pinned above the list, which is the polite version and the
 * wrong one. Rest is not a status: it is the part of a workout where you are
 * not doing anything and are waiting to be told to start again, and for that
 * ninety seconds the app has one job. A strip along the bottom of a list of
 * sets asks you to find it; a card in the middle of a dimmed screen is legible
 * from a bench two metres away, which is where the phone actually is.
 *
 * It closes itself when the time is up, so the workout is never more than one
 * countdown away from the list — nothing here has to be dismissed to get on.
 *
 * ── the ring drains, it does not fill ──
 *
 * A progress ring that fills says "this much is done". This one is a clock
 * running out: full when the rest starts, gone when it ends, so the amount of
 * colour left *is* the amount of time left and there is nothing to convert.
 *
 * ── and it is quiet ──
 *
 * The first version was loud: a 220pt ring in neon blue with a stacked halo
 * behind it, a 46pt clock, and the room blacked out to 86% behind all of it. It
 * looked like an alarm. Rest is the opposite of an alarm — it is the part of a
 * workout where nothing is happening and nothing needs to.
 *
 * So everything came down at once, because no single one of those was the
 * problem. The ring is 150 and silver instead of 220 and neon; the halo is
 * gone, because a glow is a thing asking to be looked at; the clock is 34; and
 * the room dims rather than going dark, so the sets you are working through
 * stay visible behind it. What is left is a clock on a card, which is all this
 * ever needed to be.
 *
 * The one thing kept at full strength is the *legibility* of the number. That
 * is the job, and it survives the rest of it being turned down — tabular
 * figures at 34pt on a plain dark card read from across a gym perfectly well.
 * It was never the size that made the old one shout.
 */

const SIZE = 150;
const R = 63;
const W = 8;
const CIRC = 2 * Math.PI * R;

export function RestTimer({
  left,
  total,
  next,
  i18n,
  onAdjust,
  onSkip,
}: {
  /** seconds remaining, or null when no rest is running */
  left: number | null;
  /** what the rest started at — the ring is the ratio of the two */
  total: number;
  /** the set this rest is waiting for, or null at the end of the workout */
  next: { name: string; ordinal: number; of: number } | null;
  i18n: ReturnType<typeof useI18n>;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const progress = useSharedValue(1);
  useEffect(() => {
    if (left === null || total <= 0) return;
    /*
      One second of linear travel per tick, rather than a jump per second.

      The clock underneath this is integer seconds and always will be — it is
      what the number reads. Animating each step across the whole second it
      represents makes the ring continuous without the ring and the number ever
      disagreeing: they arrive at each new value together.
    */
    progress.value = withTiming(Math.max(0, Math.min(1, left / total)), {
      duration: 1000,
      easing: Easing.linear,
    });
  }, [left, total, progress]);

  const ring = useAnimatedProps(() => ({
    strokeDashoffset: CIRC * (1 - progress.value),
  }));

  /*
    The way it arrives.

    It was `ZoomIn.springify()`, which starts the card at nothing and overshoots
    on the way in. On a small card that reads as a flourish; on something that
    fills the screen it lunges at you, and the verdict on it was the right one.

    So it settles instead of springing: 96% to full over a fifth of a second on
    an ease-out, with the fade doing most of the work. Four percent is enough
    for the eye to register that something came forward and not enough to be a
    movement in its own right — which is what you want from a panel that appears
    fifteen times in a workout. No bounce anywhere in it: a spring is a thing
    arriving, and this is a thing that was already there.
  */
  const scale = useSharedValue(0.96);
  useEffect(() => {
    if (left === null) {
      // Reset while it is off screen, so the next rest starts from 96 again
      // rather than opening already at full size.
      scale.value = 0.96;
      return;
    }
    scale.value = withTiming(1, { duration: duration.appear, easing: Easing.out(Easing.cubic) });
    // Only the appearing and disappearing matters here, not every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left === null, scale]);
  const card = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const bump = (delta: number) => {
    Haptics.selectionAsync();
    onAdjust(delta);
  };

  return (
    <Modal visible={left !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onSkip}>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
        {/*
          Chạm ra ngoài KHÔNG kết thúc nghỉ.

          Trước đây có một `Pressable` phủ kín màn hình gọi thẳng `onSkip`, kèm
          lập luận rằng với tay tới một nút nhỏ là ma sát thừa. Lập luận ấy tính
          nhầm cái giá của việc bấm nhầm: nghỉ là một khoảng THỜI GIAN, và thứ
          duy nhất phá được nó là kết thúc sớm. Điện thoại nằm trên ghế băng
          giữa hai set, tay còn dính magie — chạm phải màn hình là chuyện
          thường, và ở bản cũ mỗi lần chạm phải là mất luôn quãng nghỉ, không
          hoàn tác được.

          Một cử chỉ vô tình không được phép làm việc mà chỉ một quyết định mới
          được làm. Nay chỉ nút "Bỏ qua" kết thúc nghỉ — và vì nó thành lối ra
          DUY NHẤT, nó cũng phải trông ra thế (xem `styles.skip`).
        */}
        <Animated.View entering={FadeIn.duration(200)} style={[styles.card, card]}>
          <Text style={styles.label}>{i18n.nRdResting}</Text>

          <View style={styles.ringWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={colors.ringTrack} strokeWidth={W} />

              {/*
                One ring, in the app's own silver.

                It was a blue-to-silver gradient with three glow layers behind
                it. Neon is what this app signals *with* — a limit approached,
                a number out of range — and rest is none of those things. A
                plain stroke in the brand colour says the same amount about how
                much time is left and does not ask for anything.
              */}
              <AnimatedCircle
                animatedProps={ring}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                stroke={colors.primary}
                strokeWidth={W}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                // Twelve o'clock, and clockwise. A ring that starts at three is
                // a chart; a ring that starts at twelve is a clock.
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>

            <View style={styles.clockWrap} pointerEvents="none">
              <Text style={styles.clock}>{restLabel(left ?? 0)}</Text>
              <Text style={styles.total}>/ {restLabel(total)}</Text>
            </View>
          </View>

          {/*
            Một đồng hồ đếm ngược không nói nó đếm để làm gì thì chỉ là một con số.

            Bản cũ có đúng "NGHỈ" và 1:27 — bạn vẫn phải tự nhớ mình vừa xong
            set mấy và sắp làm gì. Hai dòng này biến chỗ CHỜ thành chỗ CHUẨN BỊ,
            và chúng là thứ khiến thẻ đọc ra như một phần của buổi tập chứ không
            phải một hộp thoại chen ngang.

            Vắng mặt ở set cuối: lúc đó không có gì kế tiếp, và bịa một dòng cho
            nó là nói sai về một buổi tập đã xong.
          */}
          {next ? (
            <View style={styles.nextWrap}>
              <View style={styles.rule} />
              <Text style={styles.nextLabel}>{i18n.nRestNext}</Text>
              <Text style={styles.nextName} numberOfLines={1}>{next.name}</Text>
              <Text style={styles.nextSet}>
                {i18n.nRestSetOf.replace('{n}', String(next.ordinal)).replace('{t}', String(next.of))}
              </Text>
            </View>
          ) : null}

          <View style={styles.controls}>
            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} −15`}
              onPress={() => bump(-15)}
              style={styles.round}>
              <Icon icon={Minus} size={14} color={colors.foreground} strokeWidth={2.5} />
              <Text style={styles.roundText}>15</Text>
            </PressScale>

            <PressScale
              accessibilityRole="button"
              accessibilityLabel={i18n.nRdSkip}
              onPress={onSkip}
              style={styles.skip}>
              <Text style={styles.skipText}>{i18n.nRdSkip}</Text>
            </PressScale>

            <PressScale
              accessibilityRole="button"
              accessibilityLabel={`${i18n.nRdResting} +15`}
              onPress={() => bump(15)}
              style={styles.round}>
              <Icon icon={Plus} size={14} color={colors.foreground} strokeWidth={2.5} />
              <Text style={styles.roundText}>15</Text>
            </PressScale>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    /* 0.55, from 0.86 by way of 0.68. The room dims; it does not go out. What
       is behind this is the list of sets you are working through, and keeping
       it faintly readable is what makes the countdown feel like a moment inside
       the workout rather than a screen you were sent to.

       Màu là `colors.background` viết dưới dạng rgba vì cần alpha — cùng một
       màu nền của trang, không phải một màu đen thứ hai. */
    backgroundColor: 'rgba(7,7,8,0.55)',
  },
  /*
    Cùng mặt phẳng với mọi tấm nổi khác của app, không phải một màu tự chọn.

    Bản cũ là `rgba(18,18,22,0.96)` bo 26 — cả hai đều là số gõ tay. App có ba
    nền tối (`card` #0e0e11, `muted` #161618, `secondary` #18181b) và cái này là
    cái thứ TƯ, lệch khỏi cả ba vừa đủ để không ai chỉ ra được, chỉ thấy thẻ như
    dán từ chỗ khác vào. Lưới ô cơ thể từng dính đúng lỗi ấy và ghi lại nguyên
    câu chẩn đoán: "a fourth dark in a screen that already has three, and it is
    what made the section read as pasted in from somewhere else."

    `colors.card` + `radius.xl` + viền hairline là vốn từ sẵn có cho một tấm
    NỔI: sheet chọn ngày trong `week-plan.tsx` đã dùng đúng bộ ấy. Hai tấm nổi,
    một cách làm.
  */
  card: {
    alignItems: 'center',
    minWidth: 268,
    gap: spacing.sm + 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.xl,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  label: {
    ...type.footnote,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  clockWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  /* Tabular, so the whole thing does not shuffle sideways every time a 1 goes
     past. 34pt reads across a gym; the old 46 was not more legible, only
     louder. */
  clock: { fontSize: 34, fontWeight: '700', color: colors.foreground, fontVariant: ['tabular-nums'] },
  total: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 2 },
  /* Khối "tiếp theo", ngăn với đồng hồ bằng một đường mảnh. Căn giữa như mọi
     thứ khác trong thẻ: đây là một tấm thẻ đọc từ xa, không phải một hàng dữ
     liệu để dò bằng mắt. */
  nextWrap: { alignItems: 'center', alignSelf: 'stretch', gap: 2 },
  rule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  nextLabel: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '600',
  },
  nextName: { ...type.headline, color: colors.foreground, textAlign: 'center' },
  nextSet: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },

  controls: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 4 },
  /* Nút ±15 NÓI RA con số.

     Trước đây chúng chỉ có dấu cộng và dấu trừ, và "cộng bao nhiêu" chỉ tồn tại
     trong nhãn trợ năng — tức là người nhìn thấy nút thì không biết, còn người
     không nhìn thấy nút thì biết. Đó là ngược. */
  round: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    width: 56,
    height: 48,
    borderRadius: 24,
    backgroundColor: glass.bg,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  roundText: { ...type.footnote, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },
  /*
    Vẫn KHÔNG tô đặc, nhưng đã sáng hơn hẳn hai nút bên cạnh.

    Ghi chú cũ ở đây nói "outlined, not filled", vì một thanh bạc đặc cạnh một
    vòng bạc là hai mảng sáng tranh nhau trong một tấm thẻ mà cả ý đồ là không
    có gì gấp. Lập luận ấy vẫn đúng và nền vẫn không tô.

    Nhưng tiền đề của nó đã đổi: hồi ấy chạm ra ngoài cũng thoát được, nên "Bỏ
    qua" chỉ là một trong hai lối ra. Nay nó là lối ra DUY NHẤT, và một lối ra
    duy nhất trông y hệt hai nút chỉnh giờ bên cạnh là một lối ra người ta phải
    đi tìm. Viền sáng lên và chữ nặng hơn: đủ để mắt biết đâu là đường ra, chưa
    đủ để thành mảng sáng thứ hai.
  */
  skip: {
    height: 48,
    minWidth: 116,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    /* `secondary` là một BẬC thật trong bảng màu, không phải một lớp trắng gõ
       tay: hai nút ±15 là kính trên nền thẻ, cái này đặc hơn hẳn chúng một bậc.
       Đủ để mắt biết đâu là đường ra mà không cần tô bạc đặc — xem ghi chú ở
       trên về vì sao nó vẫn không tô. */
    backgroundColor: colors.secondary,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  skipText: { ...type.body, color: colors.foreground, fontWeight: '700' },
});
