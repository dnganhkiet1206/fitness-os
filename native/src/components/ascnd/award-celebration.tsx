import * as Haptics from 'expo-haptics';
import {
  Beef,
  Calendar,
  Dumbbell,
  Flame,
  Footprints,
  Moon,
  Target,
  Trophy,
  X,
  type LucideIcon,
} from 'lucide-react-native';
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
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { enqueueAward } from '@/lib/celebration-queue';

/**
 * Global award celebration — port of the web AwardCelebrationOverlay.
 * useCheckAwards fires fireCelebration() when it grants a medal; the
 * overlay (mounted once in the root layout) queues them and shows a
 * confetti burst + tier card for each, auto-dismissing after 4s.
 */

const ICON_MAP: Record<string, LucideIcon> = {
  flame: Flame,
  dumbbell: Dumbbell,
  trophy: Trophy,
  calendar: Calendar,
  target: Target,
  moon: Moon,
  footprints: Footprints,
  beef: Beef,
};

const TIER_CONFIG: Record<string, { color: string; glow: string; label: string }> = {
  bronze: { color: '#c47b3d', glow: 'rgba(196,123,61,0.5)', label: 'Bronze' },
  silver: { color: '#c7cad1', glow: 'rgba(199,202,209,0.5)', label: 'Silver' },
  gold: { color: '#e8ba30', glow: 'rgba(232,186,48,0.6)', label: 'Gold' },
  platinum: { color: '#8d52e0', glow: 'rgba(141,82,224,0.6)', label: 'Platinum' },
};

export interface CelebrationAward {
  title: string;
  description: string;
  icon: string;
  tier: string;
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
  const { lang } = useAppSettings();
  const tier = TIER_CONFIG[award.tier] ?? TIER_CONFIG.bronze;
  const AwardIcon = ICON_MAP[award.icon] ?? Trophy;
  const kicker = lang === 'vi' ? 'Huy Chương Mới!' : 'New Award!';

  const backdrop = useSharedValue(0);
  const pop = useSharedValue(0);
  const confetti = useSharedValue(0);
  // `useRef(makePieces())` evaluated its argument on *every* render and kept
  // only the first result, so each render built 32 piece objects and threw
  // them away. useMemo runs it once.
  const pieces = useMemo(makePieces, []);
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
          <Pressable style={styles.closeBtn} hitSlop={8} onPress={dismiss}>
            <Icon icon={X} size={16} color={colors.mutedForeground} />
          </Pressable>

          <Animated.View
            style={[styles.medal, { backgroundColor: tier.color, shadowColor: tier.color }, medalStyle]}>
            <Icon icon={AwardIcon} size={36} color="#fff" />
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

const styles = StyleSheet.create({
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
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
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
  medal: {
    width: 80,
    height: 80,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
    shadowOpacity: 0.6,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 4 },
  },
  kicker: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 2.5,
    color: colors.mutedForeground,
  },
  title: { ...type.title, color: colors.foreground, fontWeight: '800', textAlign: 'center' },
  desc: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  tierBadge: {
    marginTop: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.full,
  },
  tierText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 2,
    color: '#fff',
  },
});
