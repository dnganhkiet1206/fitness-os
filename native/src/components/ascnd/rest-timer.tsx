import { BlurView } from 'expo-blur';
import { haptics as Haptics } from '@/lib/haptics';
import { Check, Minus, Plus } from 'lucide-react-native';
import { useEffect, useRef } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { PressScale } from '@/components/ascnd/press-scale';
import { Icon } from '@/components/ascnd/icon';
import { radius, spacing, type } from '@/constants/ascnd';
import { themeOf } from '@/constants/palette';
import { alpha, makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
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

/*
  Thông số theo bản đề xuất của chủ dự án (02/10): thẻ nằm cao hơn và gọn hơn —
  cách đỉnh ~170pt thay vì ~220, cao ~360pt thay vì ~430, lề trái/phải 24pt —
  vòng 112pt nét 8, "9s" 34 semibold, "/ 1:30" 14 regular. Bản trước là một
  thẻ hẹp 268pt giữa màn hình với vòng 150, nhìn như một hộp thoại chen ngang;
  bản này là một tấm rộng đúng bằng các thẻ của trang bên dưới, nên nó đọc ra
  như một phần của buổi tập.
*/
const SIZE = 112;
const W = 8;
const R = (SIZE - W) / 2;
/* Cách đỉnh vùng an toàn. 59 (đảo động) + 111 ≈ 170pt của bản đề xuất. */
const TOP_BELOW_SAFE_AREA = 111;
/* Năm giây cuối vòng đổi sang đỏ — "sắp hết" là thứ duy nhất trên thẻ này đáng
   được một màu cảnh báo, và chỉ trong đúng năm giây ấy. */
const WARN_AT = 5;
/* iOS có kính mờ thật; Android cần `BlurTargetView` bọc từng trang (xem
   `status-scrim.tsx`), nên ở đó và trên web chỉ có lớp mờ màu. */
const NATIVE_BLUR = Platform.OS === 'ios';
const CIRC = 2 * Math.PI * R;

export function RestTimer({
  left,
  total,
  next,
  paused,
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
  /**
   * True after an Island pause tap (AppIntent, 02/10/2026): `left` is the
   * frozen remainder. The card shows it with a paused caption; resume comes
   * from the Island.
   */
  paused?: boolean;
  i18n: ReturnType<typeof useI18n>;
  onAdjust: (delta: number) => void;
  onSkip: () => void;
}) {
  const c = usePalette();
  const styles = stylesFor(c);
  const insets = useSafeAreaInsets();
  /* Giá trị CUỐI CÙNG đã hiện. Lúc đóng, `left` thành null ngay khung đầu của
     hiệu ứng mờ dần, và đọc thẳng nó thì thẻ đang biến mất lại ghi "0s" —
     một con số chưa từng đúng (bấm Bỏ qua lúc 1:12 mà thấy 0s lướt qua). */
  const shown = useRef(left ?? 0);
  if (left !== null) shown.current = left;
  const now = shown.current;
  const done = now === 0;
  // A frozen (island-paused) ring must not glow red: the urgency signal is
  // about time running out, and time is not running.
  const warn = !paused && now > 0 && now <= WARN_AT;
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
    Haptics.selection();
    onAdjust(delta);
  };

  return (
    <Modal visible={left !== null} transparent animationType="none" statusBarTranslucent onRequestClose={onSkip}>
      <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(160)} style={styles.backdrop}>
        {/*
          Trang phía sau MỜ đi chứ không chỉ tối đi. Bản trước chỉ phủ một lớp
          màu, nên chữ của danh sách set vẫn sắc nét ngay cạnh mép thẻ và tranh
          với nó — ảnh chụp máy thật cho thấy "Bench Press", "RPE 10" đọc được
          rõ như chính thẻ. Làm mờ giữ được cảm giác "vẫn đang trong buổi tập"
          mà không để thứ gì phía sau đòi được đọc.
        */}
        {NATIVE_BLUR ? (
          <BlurView intensity={40} tint={themeOf(c) === 'dark' ? 'dark' : 'light'} style={StyleSheet.absoluteFill} pointerEvents="none" />
        ) : null}
        <View style={[StyleSheet.absoluteFill, styles.dim]} pointerEvents="none" />
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
        <Animated.View entering={FadeIn.duration(200)} style={[styles.card, { marginTop: insets.top + TOP_BELOW_SAFE_AREA }, card]}>
          <Text style={styles.label}>
            {paused ? `${i18n.nRdResting} · ${i18n.nCxIslandPaused}` : i18n.nRdResting}
          </Text>

          <View style={styles.ringWrap}>
            <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
              <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke={c.ringTrack} strokeWidth={W} />

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
                stroke={warn ? c.destructive : c.primary}
                /* Cạn hẳn thì nét bo tròn vẫn để lại một chấm ở 12 giờ; lúc
                   xong chỉ còn rãnh và dấu tick. */
                strokeOpacity={done ? 0 : 1}
                strokeWidth={W}
                strokeLinecap="round"
                strokeDasharray={CIRC}
                // Twelve o'clock, and clockwise. A ring that starts at three is
                // a chart; a ring that starts at twelve is a clock.
                transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              />
            </Svg>

            <View style={styles.clockWrap} pointerEvents="none">
              {/* Giây cuối cùng là một dấu tick, không phải "0s": quãng nghỉ
                  đã xong, và thứ cần nói là "xong" chứ không phải một con số. */}
              {done ? (
                <Icon icon={Check} size={40} color={c.foreground} strokeWidth={2.5} />
              ) : (
                <>
                  <Text style={styles.clock}>{restLabel(now)}</Text>
                  <Text style={styles.total}>/ {restLabel(total)}</Text>
                </>
              )}
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
              <Icon icon={Minus} size={16} color={c.foreground} strokeWidth={2.25} />
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
              <Icon icon={Plus} size={16} color={c.foreground} strokeWidth={2.25} />
              <Text style={styles.roundText}>15</Text>
            </PressScale>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const stylesFor = makeStyles((c, m) => ({
  backdrop: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.lg,
  },
  /* Lớp màu trên lớp mờ. Bản tối: đúng `colors.background` 55% như trước (trang
     tối đi, không tắt hẳn). Bản sáng: trang sẫm nhẹ đi chứ không trắng xoá —
     bản trước lấy `primaryForeground`, tức là TRẮNG ở bản sáng, nên thẻ trắng
     nằm trên một trang bị phủ trắng và mất mép. */
  dim: { backgroundColor: m.lit ? alpha(c.background, 0.55) : alpha(c.foreground, NATIVE_BLUR ? 0.14 : 0.22) },
  /*
    Cùng mặt phẳng với mọi tấm nổi khác của app, không phải một màu tự chọn.

    Bản cũ là `rgba(18,18,22,0.96)` bo 26 — cả hai đều là số gõ tay. App có ba
    nền tối (`card` #0e0e11, `muted` #161618, `secondary` #18181b) và cái này là
    cái thứ TƯ, lệch khỏi cả ba vừa đủ để không ai chỉ ra được, chỉ thấy thẻ như
    dán từ chỗ khác vào.

    `colors.card` + `radius.xl` (24) là vốn từ sẵn có cho một tấm NỔI. Bóng đổ
    theo bản đề xuất (0 8 32, 8%) — lấy màu và việc bật/tắt từ chất liệu của
    theme: bản tối không có bóng (RN vẽ bóng trên nền tối thành một quầng), nên
    ở đó viền hairline làm việc tách thẻ khỏi trang.
  */
  card: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderRadius: radius.xl,
    backgroundColor: c.card,
    borderWidth: m.lit ? StyleSheet.hairlineWidth : 0,
    borderColor: c.border,
    shadowColor: m.shadow.shadowColor,
    shadowOpacity: m.shadow.shadowOpacity > 0 ? 0.08 : 0,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: m.shadow.elevation > 0 ? 6 : 0,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  ringWrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  clockWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  /* Tabular, so the whole thing does not shuffle sideways every time a 1 goes
     past. 34pt reads across a gym; the old 46 was not more legible, only
     louder. */
  clock: { fontSize: 34, fontWeight: '600', color: c.foreground, fontVariant: ['tabular-nums'], lineHeight: 40 },
  total: { fontSize: 14, fontWeight: '400', color: c.mutedForeground, fontVariant: ['tabular-nums'] },
  /* Khối "tiếp theo", ngăn với đồng hồ bằng một đường mảnh. Căn giữa như mọi
     thứ khác trong thẻ: đây là một tấm thẻ đọc từ xa, không phải một hàng dữ
     liệu để dò bằng mắt. */
  nextWrap: { alignItems: 'center', alignSelf: 'stretch', marginTop: 16 },
  rule: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
    backgroundColor: c.border,
    marginBottom: 16,
  },
  nextLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: c.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.8,
  },
  nextName: { fontSize: 20, fontWeight: '600', letterSpacing: -0.2, color: c.foreground, textAlign: 'center', marginTop: 8 },
  nextSet: { fontSize: 14, fontWeight: '400', color: c.mutedForeground, fontVariant: ['tabular-nums'], marginTop: 4 },

  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 20 },
  /* Nút ±15 NÓI RA con số.

     Trước đây chúng chỉ có dấu cộng và dấu trừ, và "cộng bao nhiêu" chỉ tồn tại
     trong nhãn trợ năng — tức là người nhìn thấy nút thì không biết, còn người
     không nhìn thấy nút thì biết. Đó là ngược. */
  round: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    width: 64,
    height: 44,
    borderRadius: 22,
    backgroundColor: m.inset.bg,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  roundText: { fontSize: 16, fontWeight: '500', color: c.foreground, fontVariant: ['tabular-nums'] },
  /*
    Vẫn KHÔNG tô đặc, nhưng sáng hơn hẳn hai nút bên cạnh.

    Từ khi chạm ra ngoài thôi kết thúc quãng nghỉ, "Bỏ qua" là lối ra DUY NHẤT,
    và một lối ra duy nhất trông y hệt hai nút chỉnh giờ bên cạnh là một lối ra
    người ta phải đi tìm. `secondary` là một BẬC thật trong bảng màu: đặc hơn
    hai nút ±15 một bậc, đủ để mắt biết đâu là đường ra, chưa đủ để thành mảng
    sáng thứ hai cạnh vòng đồng hồ.
  */
  skip: {
    height: 44,
    width: 120,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: c.secondary,
    borderWidth: m.inset.borderWidth,
    borderColor: m.inset.border,
  },
  skipText: { fontSize: 16, fontWeight: '600', color: c.foreground },
}));
