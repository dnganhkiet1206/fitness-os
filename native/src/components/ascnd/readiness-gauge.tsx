import { useIsFocused } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useEffect, useId, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { AnimatedNumber } from '@/components/ascnd/animated-number';
import { Expander } from '@/components/ascnd/expander';
import { HeroTiles } from '@/components/ascnd/hero-panel';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { HelpButton, HelpNudge, useHelpTopic } from '@/components/ascnd/help-button';
import { ReadinessExplainer } from '@/components/ascnd/readiness-explainer';
import { readinessConfidence } from '@/lib/readiness-engine';
import { colors, HERO_RING, radius, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { readinessExplainText, readinessRecoText, readinessSubscores } from '@/lib/readiness-i18n';

/** The storage key the hint counts under — see `lib/help-nudge.ts`. */
const HELP_TOPIC = 'readiness';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Track color used by every web ring: hsl(230 10% 10%) */
const TRACK = '#17171c';

const GRADIENTS: Record<string, [string, string]> = {
  green: ['#2bf5a8', '#3dff7a'],
  yellow: ['#ffb800', '#ffd93d'],
  red: ['#ff3b5c', '#ff2d8a'],
};

const STATUS_COLOR: Record<string, string> = {
  green: colors.readinessGreen,
  yellow: colors.readinessYellow,
  red: colors.readinessRed,
};

interface Props {
  score: number;
  status: 'green' | 'yellow' | 'red';
  explain?: string | null;
  recommendation?: string | null;
  acwr?: number | null;
  /**
   * Chi tiết có đang mở không — và vì sao state này KHÔNG nằm trong file này.
   *
   * Mở chi tiết không chỉ bung một khối bên dưới vòng tròn: nó ẩn luôn phần
   * còn lại của Today. Đó là một quyết định về cả TRANG, nên nó thuộc về trang,
   * và thẻ này chỉ nhận nó xuống cùng cách để bật tắt.
   */
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  /** đường đi sâu, đặt ở cuối phần chi tiết — xem ghi chú `more` ở hero-panel */
  onOpenDetail?: () => void;
}

/* The ring's fill, named because the score now counts on exactly these two
   numbers. Left as literals they would drift apart the first time one was
   tuned, and a number that finishes before its ring is the specific thing this
   pairing exists to fix. */
const RING_DELAY = 300;
const RING_MS = 1600;

/**
 * Faithful port of the web ReadinessGauge card: pulsing status dot +
 * uppercase title, 208pt gradient ring with the score in mono type,
 * status label, ACWR tile, explain text, tinted recommendation pill and
 * the three-zone legend.
 */
export function ReadinessGauge({
  score,
  status,
  explain,
  recommendation,
  acwr,
  detailOpen = false,
  onToggleDetail,
  onOpenDetail,
}: Props) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  /*
    Help, and the hint that it exists — the same machinery the training card
    uses. `HELP_TOPIC` is the storage key the counting happens under; it is a
    constant rather than the string typed twice, because the button and the
    hint have to agree on it or one counts under a name the other never
    silences, and the only symptom is a tip that never stops.
  */
  const help = useHelpTopic(HELP_TOPIC);

  /* Mũi tên quay 180° chứ không đổi sang một icon khác — hai tư thế của một
     vật, không phải hai vật. */
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withTiming(detailOpen ? 1 : 0, { duration: duration.toggle });
  }, [detailOpen, spin]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));

  // Stored values are language-neutral tokens (legacy rows may hold prose);
  // localize here so the copy follows the active language.
  const explainText = readinessExplainText(explain, lang);
  const recoText = readinessRecoText(recommendation, lang);
  const color = STATUS_COLOR[status] ?? colors.readinessYellow;

  // Sub-score tiles: HRV / RHR / Sleep / Load (0–100) + the ACWR ratio
  const subs = readinessSubscores(explain);
  const subColor = (v: number) =>
    v >= 70 ? colors.readinessGreen : v >= 40 ? colors.readinessYellow : colors.readinessRed;
  const acwrColor =
    acwr == null ? colors.mutedForeground : acwr >= 0.8 && acwr <= 1.3 ? colors.readinessGreen : acwr > 1.3 ? colors.readinessYellow : colors.readinessRed;
  const tiles: { label: string; value: string; color: string; unit: string }[] = [];
  /*
    ── the chip counted a tile that was never drawn ──

    This row shipped as RHR / Sleep / Load, carried over from the web card, and
    `hrv` was parsed out of the token and then dropped. The confidence line
    below counts `Object.keys(subs)`, which includes it, so the two disagreed
    about the same string:

        explain "hrv:50"          chip "Dựa trên 1 chỉ số đo được"   tiles: 0
        explain "hrv:50|rhr:50"   chip "Dựa trên 2 chỉ số đo được"   tiles: 1

    A count of measured inputs with nothing on screen to account for one of them
    is the same false precision the chip was added to remove. The comment below
    already claimed the count came from "the same string the tiles are drawn
    from"; now it does.
  */
  /*
    ── một chiều chưa đo được phải NÓI ra, chứ không biến mất ──

    Hàng này từng chỉ vẽ những chiều đo được, nên một chiều thiếu đơn giản là
    không có mặt — và không có mặt thì không đọc ra được. Người ta thấy hai ô
    và không có cách nào biết còn ba thứ nữa tồn tại, càng không biết phải làm
    gì để có chúng: đeo đồng hồ, ghi giấc ngủ, ghi một buổi tập.

    Thiếu là một TRẠNG THÁI, không phải một khoảng trống. Nên MỌI chiều đều có
    ô của nó; chiều chưa đo được mang dấu "—", chữ số xám thay vì màu vùng, và
    dòng đơn vị nói thẳng ra là chưa có dữ liệu. Dòng độ tin cậy bên dưới vẫn
    đếm CHỈ những chiều đo được — hai câu khác nhau về cùng một ngày, và cả hai
    đều đúng.

    Nó thay cho khối `PENDING_TILES` trước đây, vốn chỉ đúng ở ca TẤT CẢ đều
    trống: đo được hai trên năm thì ba chiều kia vẫn biến mất không dấu vết.
    Cùng một lập luận, áp cho từng chiều một thay vì cho cả hàng.

    Và mỗi chiều được viết ra ở ĐÚNG chỗ của nó trong hàng, chứ không phải các
    ô đo được dồn lên trước rồi các ô trống xếp sau. Thứ tự cố định là thứ làm
    hàng này đọc được: cùng một vị trí nói về cùng một chỉ số mỗi sáng, nên hôm
    nay ghi được giấc ngủ thì ô SLEEP sáng lên TẠI CHỖ chứ không nhảy lên đầu
    hàng.
  */
  const none = { value: '—', color: colors.mutedForeground, unit: vi ? 'chưa có dữ liệu' : 'no data yet' };
  if (subs.hrv != null) tiles.push({ label: 'HRV', value: String(subs.hrv), color: subColor(subs.hrv), unit: '/100' });
  else tiles.push({ label: 'HRV', ...none });
  if (subs.rhr != null) tiles.push({ label: 'RHR', value: String(subs.rhr), color: subColor(subs.rhr), unit: '/100' });
  else tiles.push({ label: 'RHR', ...none });
  if (subs.sleep != null) tiles.push({ label: 'SLEEP', value: String(subs.sleep), color: subColor(subs.sleep), unit: '/100' });
  else tiles.push({ label: 'SLEEP', ...none });
  if (subs.load != null) tiles.push({ label: 'LOAD', value: String(subs.load), color: subColor(subs.load), unit: '/100' });
  else tiles.push({ label: 'LOAD', ...none });
  /* ACWR là một TỈ SỐ, không phải điểm 0–100, nên mẫu số "/100" sẽ là một câu
     sai về chính con số đó. */
  if (acwr != null && acwr > 0)
    tiles.push({
      label: 'ACWR',
      value: String(acwr),
      color: acwrColor,
      /* "tỉ số", không phải tên vùng. Ảnh tham chiếu để một chữ đánh giá ở đây
         ("TỐT"), nhưng gọi tên vùng ACWR cần một bảng nhãn mà file này không có
         — và bịa một bảng thứ hai bên cạnh `acwrZone` là đúng cái lỗi "một luật,
         N bản" mà repo này đã gặp sáu lần. Đơn vị nói ĐƠN VỊ; màu đã nói vùng. */
      unit: vi ? 'tỉ số' : 'ratio',
    });
  else tiles.push({ label: 'ACWR', ...none });

  /*
    ── how much of this number is actually measured ──

    The engine renormalises over whatever dimensions it could read, which is
    right — but it meant a 72 built from sleep alone rendered identically to a
    72 built from HRV, resting heart rate, sleep and training load. A thin
    number wearing the same confidence as a full one is false precision, and
    this is the screen where somebody decides whether to train hard today.

    The count is recovered from `readiness_explain`, which already encodes every
    sub-score the engine measured — the same string the tiles above are drawn
    from, so there is nothing new to store. The *banding* comes from
    `readinessConfidence` in the engine rather than being re-typed here: one
    rule, two readers.
  */
  const measured = Object.keys(subs).length;
  const confidence = measured > 0 ? readinessConfidence(measured) : null;
  const [g0, g1] = GRADIENTS[status] ?? GRADIENTS.yellow;
  const statusLabel =
    status === 'green' ? i18n.dcReadinessTrain : status === 'yellow' ? i18n.dcReadinessModerate : i18n.dcReadinessRecover;

  /*
    The ring's gradient needs a unique id, and the shipped one was a constant.

    SVG ids are document-global on native rather than scoped to the `<Svg>` that
    declares them, so two of these mounted at once both draw whichever was
    registered last. `status-scrim.tsx` puts it plainly: "This has caught the
    app three times; `useId` is the rule."

    It became reachable when the hero cards became a deck — the stack mounts
    every ring card at once — and the symptom would be one status's colour drawn
    on another status's number.
  */
  const uid = useId();
  const gradId = `readinessRing-${uid}`;

  /*
    Beside the tiles the ring is smaller, and that is layout rather than taste.

    The reference puts the ring and the measurements side by side, which only
    reads if both get room: at 208 the ring leaves about 90pt for the tiles, and
    "1.46" with a label over it does not fit in 90pt without shrinking the type
    below the 11pt floor `tools/type-scale.mjs` enforces. That rule says the fix
    is to drop a label rather than the point size — here it is to give the ring
    less room, because a ring reads perfectly well at 150.
  */
  /*
    Không còn bố cục hai cột.

    Trước đây vòng tròn thu lại còn 150 để nhường chỗ cho lưới ô số bên cạnh, và
    ghi chú ở đây lập luận rằng đặt cạnh nhau thì "số đọc và lý do của nó là một
    cái liếc thay vì hai". Lập luận đó đúng cho một cái THẺ nằm trong danh sách
    thẻ. Hero giờ không phải vậy: nó chiếm phần trên cùng của trang, và thứ nó
    phải nói trong nửa giây đầu là MỘT con số. Các ô số vẫn ở đó, sau một cú
    chạm — xem `Expander` bên dưới.
  */
  /* To hơn hẳn, vì cái hộp chứa nó đã rộng hơn hẳn: hero giờ tràn hết bề ngang
     màn hình thay vì nằm trong padding của trang, nên một vòng 208 đọc ra là
     nhỏ so với chỗ nó đứng. */
  const ringSize = HERO_RING;

  // Ring geometry — mirrors web: viewBox 120, r=52, strokeWidth 6
  const R = 52;
  const CIRC = 2 * Math.PI * R;

  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);
  // this sits on the home tab, which stays mounted for the whole session —
  // an ungated repeat here is a loop that never stops running
  const focused = useIsFocused();
  useEffect(() => {
    progress.value = withDelay(
      RING_DELAY,
      withTiming(score / 100, { duration: RING_MS, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
    );
  }, [score, progress]);
  useEffect(() => {
    if (!focused) return;
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.3, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
    );
    return () => {
      cancelAnimation(pulse);
      pulse.value = 1;
    };
  }, [focused, pulse]);

  const ringProps = useAnimatedProps(() => ({
    strokeDashoffset: CIRC - progress.value * CIRC,
  }));

  const legend = [
    { color: colors.readinessGreen, label: `75–100 · ${i18n.dcReadinessTrain}` },
    { color: colors.readinessYellow, label: `50–74 · ${i18n.dcReadinessModerate}` },
    { color: colors.readinessRed, label: `0–49 · ${i18n.dcReadinessRecover}` },
  ];

  return (
    <View style={styles.card}>
      {/* Title with pulsing status dot */}
      <View style={styles.titleRow}>
        <Animated.View
          style={[styles.statusDot, { backgroundColor: color }, { transform: [{ scale: pulse }] }]}
        />
        <Text style={styles.title}>{i18n.dcReadinessTitle}</Text>
      </View>

      {/*
        The way in to what any of this means — pinned to the card's corner,
        deliberately outside the title row.

        It was inside it, with `flex: 1` on the title to push it right, and that
        moved the title: this card is `alignItems: 'center'`, so the row is a
        centred group that sizes to its contents, and a stretching child turns
        it into a full-width row with the dot and the words against the left
        edge. Absolute here means the title sits exactly where it always has and
        the `?` cannot affect it at all.

        A nested `Pressable` becomes the touch responder itself, so this does
        not fall through to the card's own press — Today wraps the whole gauge
        in one that pushes `/biometrics`, and tapping `?` must not navigate.
      */}

      {/*
        The hint, at most three times and never again once the `?` is pressed.

        It points up-and-right at the button rather than describing where it is,
        because "bấm vào biểu tượng dấu hỏi ở góc" is a sentence you have to
        parse into a location. See `lib/help-nudge.ts` for the counting — the
        counting is the whole feature, since an uncounted hint on a card you
        open every morning becomes an obstacle by its tenth appearance.
      */}

      {/*
        Ring and measurements side by side.

        They were stacked: a 208pt ring, then a row of up to five tiles across
        the full width. Five tiles in one row is 60pt each — the ratio and its
        label do not fit — and the ring alone took a third of the card's height
        to say one number that the tiles then explain. Beside each other, the
        reading and its reasons are one glance instead of two.
      */}
      <View style={[styles.ringWrap, { width: ringSize, height: ringSize }]}>
        {/* Neon halo behind the ring, tinted to the status colour (web glow) */}
        <View
          pointerEvents="none"
          style={[styles.ringGlow, { shadowColor: color, backgroundColor: `${color}0d` }]}
        />
        <Svg width={ringSize} height={ringSize} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={g0} />
              <Stop offset="100%" stopColor={g1} />
            </LinearGradient>
          </Defs>
          <Circle cx="60" cy="60" r={R} fill="none" stroke={TRACK} strokeWidth={6} />
          {/* soft glow approximation */}
          <AnimatedCircle
            cx="60" cy="60" r={R}
            fill="none"
            stroke={g0}
            opacity={0.25}
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            animatedProps={ringProps}
            transform="rotate(-90 60 60)"
          />
          <AnimatedCircle
            cx="60" cy="60" r={R}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            animatedProps={ringProps}
            transform="rotate(-90 60 60)"
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          {/*
            Counts while the ring fills, on the ring's own delay and duration,
            so the two halves of one reading arrive together rather than the
            number being finished before the ring has started.

            Stretched and centred rather than left to shrink: a `<Text>` sizes
            to its digits and gets centred by `alignItems`, a `TextInput` does
            not size to content, so without this the number drifts off the
            middle of the ring.
          */}
          <AnimatedNumber
            value={score}
            group={false}
            delay={RING_DELAY}
            duration={RING_MS}
            style={[styles.score, { color, alignSelf: 'stretch', textAlign: 'center' }]}
          />
          <Text style={[styles.statusLabel, { color }]}>{statusLabel}</Text>
        </View>
      </View>

      {/*
        Mũi tên: cách vào phần chi tiết, và cách duy nhất nói rằng có phần đó.

        Vòng tròn đứng một mình ở nửa trên của trang không tự nói rằng nó còn
        giấu năm phép đo. Một hàng chấm hay một vùng chạm vô hình thì đọc ra là
        trang trí hoặc không đọc ra gì cả — màn ghi buổi tập trong repo này đã
        ghi đúng câu đó khi từ chối một cử chỉ ẩn: "cả hai đều vô hình cho tới
        khi đoán ra".

        Nó XOAY chứ không đổi icon: cùng một vật quay 180°, nên trạng thái đóng
        và mở là hai tư thế của một thứ chứ không phải hai thứ. `duration.toggle`
        được đặt tên cho đúng việc này — "an icon swapping between two states in
        place — a toggle, a chevron flip".
      */}
      <PressScale
          inGesture
        accessibilityRole="button"
        accessibilityState={{ expanded: detailOpen }}
        accessibilityLabel={vi ? 'Chi tiết điểm sẵn sàng' : 'Readiness details'}
        hitSlop={14}
        onPress={() => {
          Haptics.selectionAsync();
          onToggleDetail?.();
        }}
        style={styles.moreBtn}>
        {/* Chữ đi kèm mũi tên: một mũi tên đơn độc là một lời mời mà người ta
            phải đoán ra. Nó đổi theo trạng thái, nên nhãn luôn nói việc CHẠM
            sẽ làm gì chứ không nói cái đang có. */}
        <Text style={styles.tapHint}>
          {detailOpen ? (vi ? 'Thu gọn' : 'Tap to close') : (vi ? 'Chạm để xem chi tiết' : 'Tap for details')}
        </Text>
        <Animated.View style={chevron}>
          <Icon icon={ChevronDown} size={20} color={colors.mutedForeground} strokeWidth={2.5} />
        </Animated.View>
      </PressScale>

      <Expander open={detailOpen}>
      <View style={styles.detail}>
      {/*
        Nút `?` và lời nhắc của nó đi CÙNG phần chi tiết.

        Chúng giải thích RHR, LOAD và ACWR — mà ở trạng thái đóng không có chữ
        nào trong ba chữ đó trên màn hình. Một nút trả lời câu hỏi chưa ai hỏi
        là một nút chiếm chỗ ở góc của thứ đang cần yên tĩnh nhất trên trang.
      */}
      <HelpButton
        label={vi ? 'Giải thích điểm sẵn sàng' : 'Explain the readiness score'}
        onPress={help.openHelp}
        style={styles.helpBtn}
      />
      {help.nudge ? (
        <HelpNudge
          text={
            vi
              ? 'Chưa rõ RHR, LOAD hay ACWR là gì? Bấm vào đây.'
              : 'Not sure what RHR, LOAD or ACWR mean? Tap here.'
          }
          onPress={help.openHelp}
          onDismiss={help.dismissNudge}
        />
      ) : null}

      {/* Sub-score tiles: HRV · RHR · SLEEP · LOAD · ACWR — one per measured
          component, so this row and the confidence line below always agree. */}
      {/*
        Chưa có số thì vẽ CHỖ của số, không vẽ khoảng trống.

        `readiness_explain` rỗng — tài khoản mới, hoặc ngày chưa được chấm — cho
        ra 0 ô, và trước đây khối này biến mất hoàn toàn. Bấm mũi tên rồi thấy
        gần như không có gì là một câu trả lời tệ hơn cả việc không có mũi tên:
        nó nói rằng tính năng hỏng, chứ không nói rằng dữ liệu chưa tới.

        Năm nhãn luôn hiện, và chiều nào chưa đo được thì tự nói ra ở ngay ô của
        nó — xem chỗ dựng `tiles` bên trên. Người đọc biết cái gì sắp có ở đó và
        vì sao nó chưa có, kể cả khi chỉ THIẾU MỘT chiều chứ không phải cả năm.
      */}
      <HeroTiles tiles={tiles} />

      {/* Explain + recommendation */}
      {explainText ? <Text style={styles.explain}>{explainText}</Text> : null}
      {/* Said plainly rather than as a badge: a coloured chip reading "LOW"
          beside a readiness score would be read as a low *score*. */}
      {confidence && confidence !== 'high' ? (
        <Text style={styles.confidence}>
          {vi
            ? `Dựa trên ${measured} chỉ số đo được${confidence === 'low' ? ' — ghi thêm giấc ngủ hoặc buổi tập để chắc hơn' : ''}`
            : `Based on ${measured} measured input${measured === 1 ? '' : 's'}${confidence === 'low' ? ' — log sleep or a workout for a fuller reading' : ''}`}
        </Text>
      ) : null}
      {recoText ? (
        <View style={[styles.recoPill, { backgroundColor: `${color}1a`, borderColor: `${color}33` }]}>
          <Text style={[styles.recoText, { color }]}>{recoText}</Text>
        </View>
      ) : null}

      {/* Legend */}
      <View style={styles.legendRow}>
        {legend.map((l) => (
          <View key={l.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: l.color }]} />
            <Text style={styles.legendText}>{l.label}</Text>
          </View>
        ))}
      </View>
      {/* Đường đi sâu, ở CUỐI phần chi tiết. Xem ghi chú `more` ở hero-panel.tsx
          về vì sao nó không còn là một Pressable bọc cả tấm thẻ. */}
      {onOpenDetail ? (
        <PressScale
          inGesture
          accessibilityRole="link"
          accessibilityLabel={vi ? 'Xem sinh trắc học' : 'Open biometrics'}
          onPress={() => {
            Haptics.selectionAsync();
            onOpenDetail();
          }}
          style={styles.moreRow}>
          <Text style={styles.moreLabel}>{vi ? 'Xem sinh trắc học' : 'Open biometrics'}</Text>
          <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
        </PressScale>
      ) : null}
      </View>
      </Expander>
      <ReadinessExplainer visible={help.open} onClose={help.close} />
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Không còn là một cái thẻ.

    `GlassCard` cấp nền, viền và `padding: spacing.card`; bỏ nó đi thì phần đệm
    ngang biến mất cùng, nên nó được viết lại ở đây. Cái mất đi là NỀN — hero
    này nằm tràn hai mép trên chính lớp aura, và một cái thẻ nổi lên trên đó
    che mất thứ nó đang nằm trên.
  */
  card: {
    alignItems: 'center',
    /*
      Đệm của một HERO, không phải của một thẻ trong danh sách.

      Trước đây là paddingVertical 40 và gap 24 — đúng cho một thẻ có viền, nằm
      giữa các thẻ khác. Ở đây nó đo được 100px trống giữa mũi tên và hàng pip
      trên ảnh chụp, vì phần tử cuối cùng là `Expander` đang ĐÓNG: cái gap 24
      trước một khối cao 0 là 24 điểm không có gì trong đó, cộng 40 đệm đáy dưới
      một mũi tên vốn đã là thứ cuối cùng nhìn thấy được.
    */
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.card,
    gap: spacing.md,
  },
  /* Out of the flow, in the corner — see the comment at the button. It is the
     only way to add a trailing accessory to a centred header without the
     header moving. 28pt of ink plus hitSlop 14 is a 56pt target. */
  /* Out of the flow, in the corner — see the comment at the button. It is the
     only way to add a trailing accessory to a centred header without the
     header moving. Size and hit area come from `HelpButton`. */
  /* Không còn tuyệt đối ở góc thẻ: nó nằm TRONG phần chi tiết bây giờ, nên nó
     là một dòng của khối đó và tự nép về mép phải. */
  helpBtn: { alignSelf: 'flex-end' },
  /* 44pt là sàn của Apple cho vùng chạm, và `tools/tap-targets.mjs` đo chứ
     không ước lượng. Icon 20pt nằm giữa một ô 44 là đủ. */
  moreBtn: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'stretch',
  },
  /* Chữ đi cùng mũi tên. Tên riêng chứ không dùng chung `moreLabel` bên dưới:
     cái kia là nhãn của HÀNG đi sâu ở cuối phần chi tiết, đậm bằng chữ nội
     dung, còn cái này là một lời mời nhạt đứng cạnh một icon. Chúng trùng tên
     một lần khi hai nhánh gặp nhau, và một `StyleSheet` có hai khoá cùng tên
     thì khoá sau lặng lẽ nuốt khoá trước. */
  tapHint: { fontSize: 12, color: colors.mutedForeground, letterSpacing: 0.2 },
  detail: { gap: spacing.lg, alignItems: 'center', alignSelf: 'stretch' },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  moreLabel: { ...type.footnote, color: colors.foreground },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  title: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  ringWrap: { width: 208, height: 208, alignItems: 'center', justifyContent: 'center' },
  ringGlow: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 28,
    shadowOpacity: 0.7,
    elevation: 8,
  },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  score: { fontSize: 60, fontWeight: '700', fontFamily: 'Menlo', fontVariant: ['tabular-nums'] },
  statusLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 2.4, marginTop: 6 },
  readRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    gap: spacing.md,
    paddingHorizontal: spacing.card,
  },
  /* Lưới ô số không còn ở tệp này — nó là `HeroTiles` trong `hero-panel.tsx`,
     dùng chung cho cả bốn trang hero, và các số đo của một ô (nhãn nhỏ, số to,
     đơn vị nhỏ; bề rộng 47%) sống ở đó. Ghi lại ở đây vì hai khối chú thích
     mô tả `grid`/`tile` từng đứng đúng chỗ này, và một chú thích tả một style
     đã đi nơi khác là thứ người đọc sau sẽ tin. */
  confidence: {
    fontSize: 11,
    color: colors.mutedForeground,
    textAlign: 'center',
    opacity: 0.8,
    paddingHorizontal: spacing.card,
    marginTop: 2,
  },
  explain: { fontSize: 12, color: colors.mutedForeground, textAlign: 'center', lineHeight: 18, paddingHorizontal: spacing.card },
  recoPill: {
    marginHorizontal: spacing.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 4,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  recoText: { fontSize: 14, fontWeight: '500', textAlign: 'center' },
  legendRow: { flexDirection: 'row', gap: spacing.md, flexWrap: 'wrap', justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, color: colors.mutedForeground },
});
