import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { useEffect, useRef, useMemo } from 'react';
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Icon } from '@/components/ascnd/icon';
import { Medal, TIER_CONFIG } from '@/components/ascnd/medal';
import { radius, spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
/* Từ `lib/`, không qua `hooks/use-extras`: một component không cần kéo theo cả
   tầng truy vấn chỉ để tra một danh mục tĩnh. */
import { AWARD_DEFINITIONS } from '@/lib/award-grant';
import { useAppSettings } from '@/hooks/use-app-settings';
import { enqueueAward } from '@/lib/celebration-queue';
import { useI18n } from '@/hooks/use-app-settings';

/**
 * Global award celebration — port of the web AwardCelebrationOverlay.
 * useCheckAwards fires fireCelebration() when it grants a medal; the
 * overlay (mounted once in the root layout) queues them and shows a
 * confetti burst + tier card for each, auto-dismissing after 4s.
 */

/**
 * Đây là bản vẽ huy chương THỨ BA, và tôi không biết nó tồn tại.
 *
 * Người dùng báo thẻ "Huy chương gần đây" chưa nhận bản thiết kế mới. Tôi sửa
 * thẻ ấy, rồi dựng `tools/medal-single.mjs` để bản sao không mọc lại — và luật
 * vừa viết xong lập tức chỉ vào tệp này. Nó có đúng cùng một bảng tám icon đã
 * cũ và đúng cùng một bảng màu hạng, cho cái modal hiện ra ĐÚNG LÚC người ta
 * vừa nhận huy chương. Tức khoảnh khắc quan trọng nhất của cả hệ thống huy
 * chương là khoảnh khắc vẽ bằng bản cũ nhất.
 *
 * Không ai tìm ra nó bằng mắt: nó chỉ hiện lên trong vài giây, và chỉ khi vừa
 * đạt một mốc. Cái tìm ra nó là một luật hỏi "có bao nhiêu bảng màu hạng trong
 * repo này" — một câu hỏi về cấu trúc, không phải về giao diện.
 *
 * `glow` trong bảng cũ chưa từng được đọc ở đâu, nên bỏ nó không mất gì.
 */

export interface CelebrationAward {
  title: string;
  description: string;
  icon: string;
  tier: string;
  /**
   * Khoá trong danh mục, khi ăn mừng này LÀ một huy chương.
   *
   * Hàng đợi này còn chở hai thứ khác — lên hạng ở phòng Koa, và hoàn thành
   * thử thách tuần — và chúng không có mốc nào để in lên mặt đĩa. Chúng vẫn
   * dùng chung cái đĩa, chỉ là đĩa tròn mang glyph thay vì mang con số.
   */
  awardKey?: string;
}

/** Queue an award medal celebration (shown by the shared CelebrationHost) */
export function fireCelebration(award: CelebrationAward) {
  enqueueAward(award);
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Web CONFETTI_COLORS translated to hex
const CONFETTI_COLORS = ['#f5c518', '#f28c33', '#10b981', '#a855f7', '#3b82f6', '#f43f5e', '#f7dc7a', '#38d4f5'];
const PIECE_COUNT = 32;

interface Piece {
  x: number;
  drift: number;
  delay: number;
  spin: number;
  size: number;
  color: string;
}

function makePieces(): Piece[] {
  return Array.from({ length: PIECE_COUNT }, () => ({
    x: Math.random() * SCREEN_W,
    drift: (Math.random() - 0.5) * 140,
    delay: Math.random() * 0.35,
    spin: (Math.random() - 0.5) * 900,
    size: 6 + Math.random() * 6,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }));
}

function ConfettiPiece({ progress, piece }: { progress: SharedValue<number>; piece: Piece }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const style = useAnimatedStyle(() => {
    const t = Math.min(Math.max((progress.value - piece.delay) / (1 - piece.delay), 0), 1);
    return {
      opacity: interpolate(t, [0, 0.08, 0.8, 1], [0, 1, 1, 0]),
      transform: [
        { translateX: piece.x + piece.drift * t },
        { translateY: -50 + t * SCREEN_H * 0.9 },
        { rotate: `${piece.spin * t}deg` },
        { rotateX: `${piece.spin * 0.7 * t}deg` },
      ],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.confetti,
        { backgroundColor: piece.color, width: piece.size, height: piece.size * 1.7 },
        style,
      ]}
    />
  );
}

export function AwardCelebrationModal({ award, onClose }: { award: CelebrationAward; onClose: () => void }) {
  const c = usePalette();
  const styles = stylesFor(c);
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const tier = TIER_CONFIG[award.tier] ?? TIER_CONFIG.bronze;
  const def = award.awardKey ? AWARD_DEFINITIONS.find((d) => d.key === award.awardKey) : undefined;
  const kicker = lang === 'vi' ? 'Huy Chương Mới!' : 'New Award!';

  const backdrop = useSharedValue(0);
  const pop = useSharedValue(0);
  const confetti = useSharedValue(0);
  // `useRef(makePieces())` evaluated its argument on *every* render and kept
  // only the first result, so each render built 32 piece objects and threw
  // them away. useMemo runs it once.
  const pieces = useMemo(() => makePieces(), []);
  const closing = useRef(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    backdrop.value = withTiming(1, { duration: 260 });
    pop.value = withDelay(140, withSpring(1, { stiffness: 220, damping: 14 }));
    confetti.value = withDelay(
      120,
      withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
    );
  }, [backdrop, pop, confetti]);

  const dismiss = () => {
    if (closing.current) return;
    closing.current = true;
    backdrop.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 210);
  };

  // Web auto-dismisses after 4s
  useEffect(() => {
    const t = setTimeout(dismiss, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
    transform: [{ translateY: (1 - backdrop.value) * 32 }, { scale: 0.9 + backdrop.value * 0.1 }],
  }));
  const medalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${(1 - pop.value) * -180}deg` }],
  }));

  return (
    <Modal transparent statusBarTranslucent animationType="none" onRequestClose={dismiss}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        {pieces.map((p, i) => (
          <ConfettiPiece key={i} progress={confetti} piece={p} />
        ))}

        <Animated.View style={[styles.card, { shadowColor: tier.color }, cardStyle]}>
          <Pressable accessibilityRole="button" accessibilityLabel={i18n.a11yDismiss} style={styles.closeBtn} hitSlop={14} onPress={dismiss}>
            <Icon icon={X} size={16} color={c.mutedForeground} />
          </Pressable>

          {/*
            Cùng cái đĩa mà màn `/awards` và thẻ trên Hôm nay vẽ.

            Trước đây chỗ này là một ô bo góc 80×80 tô đặc màu hạng với một icon
            trắng ở giữa — không vành, không chuyển màu, không dáng theo miền,
            không con số. Ba màn, ba tấm huy chương khác nhau cho cùng một thứ.

            Quầng sáng riêng của tấm huy chương thì BỎ, và đây là lý do chứ
            không phải sơ suất.

            Bóng cũ đổ từ một ô 80×80 tô đặc màu hạng. Đĩa mới là SVG trong một
            lớp bọc trong suốt, và một `shadowOpacity` trên nền trong suốt thì
            trên iOS không có hình nào để đổ bóng theo. Giữ lại bốn dòng ấy là
            giữ một hiệu ứng đã chết mà trông vẫn như đang bật.

            Cứu nó thì phải đặt một cái đĩa màu nhỏ hơn giấu sau lưng — và bán
            kính của "nhỏ hơn" phụ thuộc vào DÁNG: tia mặt trời có bán kính
            trong 0,8·r, khiên thì thắt lại ở dưới. Tức mỗi lần thêm một dáng
            huy chương là một lần phải tính lại chỗ giấu.

            Màu hạng vẫn toả ra: `styles.card` mang `shadowColor: tier.color`
            và cái thẻ thì CÓ nền, nên bóng ấy vẫn đổ thật.
          */}
          <Animated.View style={[styles.medal, medalStyle]}>
            <Medal
              type={def?.type ?? 'body'}
              tier={award.tier}
              icon={def?.icon ?? award.icon}
              requirement={def && 'requirement' in def ? def.requirement : null}
              earned
              size={88}
            />
          </Animated.View>

          <Text style={styles.kicker}>{kicker}</Text>
          <Text style={styles.title}>{award.title}</Text>
          <Text style={styles.desc}>{award.description}</Text>
          <View style={[styles.tierBadge, { backgroundColor: tier.color }]}>
            <Text style={styles.tierText}>{tier.label}</Text>
          </View>
        </Animated.View>

        {/* Tap anywhere to dismiss */}
        <Pressable style={StyleSheet.absoluteFill} onPress={dismiss} />
      </Animated.View>
    </Modal>
  );
}

const stylesFor = makeStyles((c) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 6, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  confetti: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderRadius: 2,
  },
  card: {
    alignSelf: 'stretch',
    alignItems: 'center',
    backgroundColor: c.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.border,
    borderRadius: radius.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
    zIndex: 2,
    shadowOpacity: 0.45,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  closeBtn: { position: 'absolute', top: spacing.sm + 2, right: spacing.sm + 2, zIndex: 3 },
  medal: { alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  kicker: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    color: c.mutedForeground,
  },
  title: { ...type.title, color: c.foreground, fontWeight: '800', textAlign: 'center' },
  desc: { ...type.footnote, color: c.mutedForeground, textAlign: 'center' },
  tierBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  tierText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#fff',
  },
}));
