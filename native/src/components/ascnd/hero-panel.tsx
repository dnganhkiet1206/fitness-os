import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { AnimatedNumber } from '@/components/ascnd/animated-number';
import { Expander } from '@/components/ascnd/expander';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, HERO_RING, spacing, type } from '@/constants/ascnd';
import { duration } from '@/constants/motion';

/**
 * The shell every page of the hero deck wears.
 *
 * ── why this exists ──
 *
 * Four pages: readiness, activity, nutrition, water. Each needs the same three
 * things — a title, one big ring, and a chevron that opens its detail — and the
 * first two were written twice before the last two existed. Written four times,
 * the four would drift: this repository has caught "one rule, N copies" six
 * times, and the symptom here would be exactly what the deck cannot afford,
 * four pages that look like four screens instead of four pages of one thing.
 *
 * ── and it is what makes the pages the same size ──
 *
 * `card-deck.tsx` anchors every page top and bottom, so the pages are the
 * stage's size by construction. What that does NOT do is make their contents
 * agree: a page whose content is a list card is taller than one whose content
 * is a ring, and the stage grows to the tallest, so the short ones get a hole.
 *
 * One shell with one ring size is what closes that. The deck guarantees the
 * box; this guarantees what goes in it.
 */
export function HeroPanel({
  title,
  dot,
  detailOpen = false,
  onToggleDetail,
  a11yDetail,
  ring,
  children,
}: {
  title: string;
  /** the status colour beside the title, when the page has one */
  dot?: string;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  a11yDetail: string;
  ring: React.ReactNode;
  /** the detail, revealed by the chevron */
  children?: React.ReactNode;
}) {
  const spin = useSharedValue(0);
  useEffect(() => {
    spin.value = withTiming(detailOpen ? 1 : 0, { duration: duration.toggle });
  }, [detailOpen, spin]);
  const chevron = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 180}deg` }] }));

  return (
    <View style={styles.panel}>
      <View style={styles.titleRow}>
        {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
        <Text style={styles.title}>{title}</Text>
      </View>

      {ring}

      {/*
        The chevron: the way into the detail, and the only thing that says there
        is one.

        A ring alone in the top half of the page does not announce that it is
        hiding five measurements, and a bare tap area announces nothing at all —
        `today-meals.tsx` wrote the rule down when it refused a hidden gesture:
        "both are invisible until guessed".

        It ROTATES rather than swapping icon: one object turned 180°, so closed
        and open are two poses of a thing rather than two things. `duration.toggle`
        is named for exactly this — "an icon swapping between two states in
        place — a toggle, a chevron flip".
      */}
      <PressScale
        accessibilityRole="button"
        accessibilityState={{ expanded: detailOpen }}
        accessibilityLabel={a11yDetail}
        hitSlop={14}
        onPress={() => {
          Haptics.selectionAsync();
          onToggleDetail?.();
        }}
        style={styles.moreBtn}>
        <Animated.View style={chevron}>
          <Icon icon={ChevronDown} size={20} color={colors.mutedForeground} strokeWidth={2.5} />
        </Animated.View>
      </PressScale>

      <Expander open={detailOpen}>
        <View style={styles.detail}>{children}</View>
      </Expander>
    </View>
  );
}

/**
 * One value, drawn as the hero's ring.
 *
 * For the pages whose reading is a single number against a target. Readiness
 * and activity keep their own — readiness has a glow and a counting number tied
 * to the sweep, activity has three concentric tracks — and both are more than a
 * parameter of this could express without becoming a second implementation
 * wearing one name.
 */
/* Cùng nhịp mà `readiness-gauge.tsx` dùng, vì hai vòng nằm cạnh nhau trong một
   deck: hai tốc độ đếm khác nhau trên hai trang của một thứ đọc ra là hai app. */
const RING_DELAY = 300;
const RING_MS = 1600;

export function HeroRing({
  pct,
  from,
  to,
  value,
  decimals = 0,
  caption,
  captionColor,
}: {
  /** 0–1 */
  pct: number;
  from: string;
  to: string;
  /**
   * Số, không phải chuỗi — và đó là một bản sửa chứ không phải một sở thích.
   *
   * Bản đầu nhận `string` và chỗ gọi truyền `String(Math.round(kcal))`, tức là
   * `1680`. Thẻ cũ in `1.680`. Canary của `live.mjs` neo vào đúng con số đó và
   * bắt được — nó tìm `/1[,.]680/` và không thấy, rồi từ chối tin toàn bộ lượt
   * chạy. Đúng việc nó sinh ra để làm, và ở đây nó bắt một hồi quy thật: bốn
   * chữ số không dấu phân cách khó đọc hơn hẳn.
   *
   * `AnimatedNumber` đã lo dấu phân cách theo ngôn ngữ, và kèm theo là cú đếm
   * lên khớp với nét quét của vòng tròn — hai nửa của một số đọc tới nơi cùng
   * lúc thay vì con số xong trước khi vòng bắt đầu.
   */
  value: number;
  decimals?: number;
  caption: string;
  captionColor: string;
}) {
  /* SVG ids are document-global on native, so four of these on one deck would
     all paint whichever gradient registered last. `status-scrim.tsx`: "this has
     caught the app three times; `useId` is the rule." */
  const uid = useId();
  const gid = `heroRing-${uid}`;

  const R = 52;
  const CIRC = 2 * Math.PI * R;
  const filled = Math.max(0, Math.min(1, pct));

  return (
    <View style={[styles.ringWrap, { width: HERO_RING, height: HERO_RING }]}>
      <Svg width={HERO_RING} height={HERO_RING} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={from} />
            <Stop offset="100%" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Circle cx="60" cy="60" r={R} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={6} />
        <Circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${CIRC * filled} ${CIRC}`}
          transform="rotate(-90 60 60)"
        />
      </Svg>
      <View style={styles.ringCenter} pointerEvents="none">
        <AnimatedNumber
          value={value}
          decimals={decimals}
          delay={RING_DELAY}
          duration={RING_MS}
          style={[styles.value, styles.valueBox]}
        />
        <Text style={[styles.caption, { color: captionColor }]} numberOfLines={1}>{caption}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  /* One set of paddings for all four pages. Written per card, four numbers
     would agree today and drift the first time one page gained a line. */
  panel: {
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.card,
    gap: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { width: 7, height: 7, borderRadius: 4 },
  title: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.mutedForeground,
  },
  /* 44 is Apple's floor for a touch target and `tools/tap-targets.mjs` measures
     it rather than trusting the eye. */
  moreBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  detail: { gap: spacing.md, alignSelf: 'stretch' },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  value: { ...type.largeTitle, color: colors.foreground, fontVariant: ['tabular-nums'] },
  /* `AnimatedNumber` là một TextInput bên dưới, thứ không tự co theo nội dung —
     không có hai dòng này thì con số trôi khỏi tâm vòng tròn. Cùng bản sửa mà
     readiness-gauge.tsx đã ghi. */
  valueBox: { alignSelf: 'stretch', textAlign: 'center' },
  caption: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
});
