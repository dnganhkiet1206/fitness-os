import * as Haptics from 'expo-haptics';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { useEffect, useId } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { AnimatedNumber } from '@/components/ascnd/animated-number';
import { Expander } from '@/components/ascnd/expander';
import { Icon } from '@/components/ascnd/icon';
import type { LucideIcon } from 'lucide-react-native';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, HERO_RING, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
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
  ring,
  more,
  children,
}: {
  title: string;
  /** the status colour beside the title, when the page has one */
  dot?: string;
  detailOpen?: boolean;
  onToggleDetail?: () => void;
  ring: React.ReactNode;
  /**
   * Đường đi sâu hơn, đặt ở CUỐI phần chi tiết — không phải trên cả tấm thẻ.
   *
   * ── vì sao không bọc cả trang trong một Pressable ──
   *
   * Nó từng như thế, và phải bấm HAI lần mới đi được. Cả deck nằm trong một
   * `GestureDetector`, nên một Pressable của React Native bên trong đang đua
   * với hệ cử chỉ chứ không hợp tác với nó — tài liệu RNGH nói thẳng rằng cử
   * chỉ lồng nhau phải được COMPOSE (`Race`, `Exclusive`, `requireToFail`), và
   * hai hệ chạm khác nhau tranh cùng một cú chạm thì không compose được.
   *
   * Cách chắc chắn nhất là bỏ sự lồng nhau. Và nó cũng là thiết kế đúng hơn:
   * một tấm vừa bung ra khi chạm vừa điều hướng khi chạm là hai câu trả lời cho
   * một cử chỉ, và người dùng không có cách nào biết mình sắp nhận cái nào.
   * Vòng tròn trả lời "bao nhiêu", mũi tên trả lời "vì sao", và dòng này trả
   * lời "cho tôi xem tất cả" — ba việc, ba chỗ.
   */
  more?: { label: string; onPress: () => void };
  /** the detail, revealed by the chevron */
  children?: React.ReactNode;
}) {
  const i18n = useI18n();
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
          inGesture
        accessibilityRole="button"
        accessibilityState={{ expanded: detailOpen }}
        /*
           Nhãn nói VIỆC, không nói lại tên.

           Nó từng là chính tên chỉ số, nên screen reader đọc "Nước, nút" — một
           câu không cho biết bấm vào thì được gì. Cùng lỗi với dòng đi sâu đã
           sửa trước đó: nhãn lặp lại chỗ mình đang đứng thay vì nói bước tiếp.

           Không tự thêm "mở"/"đóng": `accessibilityState.expanded` ngay bên trên
           đã nói trạng thái, và nói hai lần thì VoiceOver đọc hai lần. */
        accessibilityLabel={i18n.nHeroDetails.replace('{n}', title)}
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
        <View style={styles.detail}>
          {children}
          {more ? (
            <PressScale
          inGesture
              accessibilityRole="link"
              accessibilityLabel={more.label}
              onPress={() => {
                Haptics.selectionAsync();
                more.onPress();
              }}
              style={styles.moreRow}>
              <Text style={styles.moreLabel}>{more.label}</Text>
              <Icon icon={ChevronRight} size={16} color={colors.mutedForeground} />
            </PressScale>
          ) : null}
        </View>
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
  icon,
  iconColor,
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
  /**
   * Biểu tượng của phép đo, đặt TRONG vòng tròn.
   *
   * Bốn trang trông giống nhau là điều đúng cho một deck, và cũng là rủi ro của
   * nó: vuốt tới trang thứ ba rồi nhìn một con số bốn chữ số trong một vòng
   * tròn thì không có gì nói đó là calo hay là mililít. Nhãn ở trên có nói,
   * nhưng nhãn là chữ và chữ phải đọc; hình thì nhận ra được trước khi đọc.
   *
   * Readiness và activity không có: chúng KHÔNG cần, vì một vòng có ba vòng
   * đồng tâm và một vòng có nhãn trạng thái ở giữa đã tự nhận diện. Thêm icon
   * cho đủ bộ là thêm mực cho một câu đã nói xong.
   */
  icon?: LucideIcon;
  iconColor?: string;
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
        {icon ? (
          <Icon icon={icon} size={20} color={iconColor ?? colors.mutedForeground} />
        ) : null}
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

/**
 * Lưới chỉ số phụ, dùng chung cho cả năm trang hero.
 *
 * ── ba dòng, và thứ tự đó có lý do ──
 *
 * NHÃN nói đang đo cái gì, SỐ là chỗ mắt dừng lại, ĐƠN VỊ trả lời "50 cái gì".
 * Bỏ dòng cuối thì "90" và "1.46" trông như hai đại lượng cùng loại.
 *
 * ── vì sao ở đây chứ không chép vào từng trang ──
 *
 * Năm trang, một hình dạng. Chép năm bản thì chúng trôi ra khỏi nhau ở lần đầu
 * một trang được chỉnh, và trên một deck vuốt ngang thì hai lưới khác cỡ đọc ra
 * là hai màn hình chứ không phải hai trang của một thứ. Repo này đã bắt "một
 * luật, N bản" sáu lần.
 *
 * Phông hệ thống, không phải mono: mono đúng cho một CỘT số cần thẳng hàng dọc,
 * còn ở đây mỗi ô có đúng một số. `tabular-nums` vẫn giữ chữ số cùng bề rộng
 * nên số đổi không làm ô nhảy.
 */
export function HeroTiles({
  tiles,
}: {
  tiles: { label: string; value: string; unit: string; color?: string }[];
}) {
  if (tiles.length === 0) return null;
  return (
    <View style={styles.grid}>
      {tiles.map((t) => (
        <View key={t.label} style={styles.tile}>
          {/* Nhãn cũng giới hạn một dòng: một nhãn dài trong ô rộng 47% sẽ
              xuống dòng và đẩy số xuống, làm ba ô cùng hàng cao khác nhau. */}
          <Text style={styles.tileLabel} numberOfLines={1}>{t.label}</Text>
          <Text style={[styles.tileValue, t.color ? { color: t.color } : null]} numberOfLines={1}>
            {t.value}
          </Text>
          <Text style={styles.tileUnit} numberOfLines={1}>{t.unit}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  /* 47% cho hai ô một hàng có khoảng thở; `space-between` giữ hàng cuối lẻ nằm
     bên trái thay vì bị kéo giãn ra. */
  tile: {
    width: '47%',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: colors.mutedForeground,
  },
  tileValue: {
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.5,
    color: colors.foreground,
    fontVariant: ['tabular-nums'],
  },
  tileUnit: { fontSize: 12, color: colors.mutedForeground },
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
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  moreLabel: { ...type.footnote, color: colors.foreground },
  ringWrap: { alignItems: 'center', justifyContent: 'center' },
  ringCenter: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 2 },
  value: { ...type.largeTitle, color: colors.foreground, fontVariant: ['tabular-nums'] },
  /* `AnimatedNumber` là một TextInput bên dưới, thứ không tự co theo nội dung —
     không có hai dòng này thì con số trôi khỏi tâm vòng tròn. Cùng bản sửa mà
     readiness-gauge.tsx đã ghi. */
  valueBox: { alignSelf: 'stretch', textAlign: 'center' },
  caption: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
});
