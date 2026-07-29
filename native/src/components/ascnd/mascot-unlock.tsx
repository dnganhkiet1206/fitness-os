import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
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

import { MascotFigure } from '@/components/ascnd/mascot-figure';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useMascotSettings, useUnlockStats } from '@/hooks/use-mascot';
import { enqueueMascot } from '@/lib/celebration-queue';
import { TEST_UNLOCK_ALL } from '@/lib/dev-flags';
import { isUnlocked, MASCOTS, type MascotDef } from '@/lib/mascots';

/**
 * Full-screen "new companion unlocked" celebration. Watches the lifetime
 * unlock counters and compares against an AsyncStorage set of already-
 * celebrated ids, so each character is celebrated exactly once — right
 * after the log that crossed its threshold. First run seeds the set
 * silently (no fanfare for characters that were already unlocked).
 */

const SEEN_KEY = 'ascnd_mascot_seen_unlocked';

export function MascotUnlockCelebration() {
  const { data: stats } = useUnlockStats();
  const { enabled } = useMascotSettings();

  useEffect(() => {
    // Respect the Settings toggle: no companion celebrations when mascots
    // are turned off (the seen-set is still advanced below so re-enabling
    // later doesn't replay every unlock earned while off).
    if (!stats) return;
    let cancelled = false;
    (async () => {
      try {
        const unlockedIds = MASCOTS.filter((m) => isUnlocked(m, stats)).map((m) => m.id);
        const raw = await AsyncStorage.getItem(SEEN_KEY);
        if (raw == null) {
          // First launch: everything already unlocked is old news
          await AsyncStorage.setItem(SEEN_KEY, JSON.stringify(unlockedIds));
          return;
        }
        const seen: string[] = JSON.parse(raw);
        const fresh = unlockedIds.filter((id) => !seen.includes(id));
        if (fresh.length === 0 || cancelled) return;
        // Advance the seen-set even when disabled so toggling back on
        // later doesn't replay every unlock earned while it was off
        await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh]));
        if (!enabled) return;
        // Test mode unlocks everything at once — don't queue 5 modals
        if (TEST_UNLOCK_ALL) return;
        // Feed the shared celebration queue so mascot unlocks and award
        // medals play one at a time instead of stacking
        fresh.forEach((id) => enqueueMascot(id));
      } catch {
        // storage hiccup — skip, never block the app
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [stats, enabled]);

  // Detection only — the shared CelebrationHost renders the modal
  return null;
}

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CONFETTI_COLORS = ['#e6a23d', '#e0763d', '#5fb56f', '#b07de0', '#8fb3a4', '#f0d264'];
const PIECE_COUNT = 26;

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
        // Tumble in depth so pieces read as paper, not dots
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

export function MascotCelebrationModal({ mascot, onClose }: { mascot: MascotDef; onClose: () => void }) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { setSelectedId } = useMascotSettings();

  const backdrop = useSharedValue(0);
  const pop = useSharedValue(0);
  const spin = useSharedValue(0);
  const confetti = useSharedValue(0);
  // `useRef(makePieces())` evaluated its argument on *every* render and kept
  // only the first result, so each render built 26 piece objects and threw
  // them away. useMemo runs it once.
  const pieces = useMemo(() => makePieces(), []);
  const closing = useRef(false);

  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    backdrop.value = withTiming(1, { duration: 280 });
    // Hero entrance: overshoot spring + a full 3D turn to show off
    pop.value = withDelay(140, withSpring(1, { stiffness: 210, damping: 12 }));
    spin.value = withDelay(
      180,
      withTiming(360, { duration: 750, easing: Easing.out(Easing.cubic) }),
    );
    confetti.value = withDelay(
      120,
      withTiming(1, { duration: 2600, easing: Easing.out(Easing.quad) }),
    );
  }, [backdrop, pop, spin, confetti]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: backdrop.value,
    transform: [{ translateY: (1 - backdrop.value) * 24 }],
  }));
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { perspective: 340 },
      { scale: pop.value },
      { rotateY: `${spin.value}deg` },
    ],
  }));

  const dismiss = (use: boolean) => {
    if (closing.current) return;
    closing.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (use) setSelectedId(mascot.id);
    backdrop.value = withTiming(0, { duration: 200 });
    setTimeout(onClose, 210);
  };

  return (
    <Modal transparent statusBarTranslucent animationType="none" onRequestClose={() => dismiss(false)}>
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        {pieces.map((p, i) => (
          <ConfettiPiece key={i} progress={confetti} piece={p} />
        ))}

        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.kicker}>{i18n.nMascotUnlockedTitle}</Text>

          <View style={styles.stage}>
            <View style={[styles.aura, { backgroundColor: mascot.accent }]} />
            <Animated.View style={[styles.hero, { shadowColor: mascot.accent }, heroStyle]}>
              <MascotFigure mascot={mascot} size={110} mood="happy" emotion="celebrate" />
            </Animated.View>
          </View>

          <Text style={styles.name}>{mascot.name}</Text>
          <Text style={styles.tagline}>{mascot.tagline[lang]}</Text>

          <Pressable
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: mascot.accent },
              pressed && styles.pressed,
            ]}
            onPress={() => dismiss(true)}>
            <Text style={styles.primaryBtnText}>{i18n.nMascotUse}</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.laterBtn, pressed && styles.pressed]}
            onPress={() => dismiss(false)}>
            <Text style={styles.laterText}>{i18n.nMascotLater}</Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(4, 4, 6, 0.82)',
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
    gap: spacing.sm,
  },
  kicker: {
    ...type.footnote,
    color: colors.mutedForeground,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },
  stage: {
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: spacing.sm,
  },
  aura: {
    position: 'absolute',
    width: 96,
    height: 96,
    borderRadius: 48,
    opacity: 0.2,
    transform: [{ scale: 1.3 }],
  },
  hero: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 },
  },
  name: { ...type.title, color: colors.foreground, fontWeight: '800' },
  tagline: {
    ...type.footnote,
    color: colors.mutedForeground,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  primaryBtn: {
    alignSelf: 'stretch',
    height: 50,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { ...type.headline, color: '#0a0a0c', fontWeight: '700' },
  laterBtn: {
    alignSelf: 'stretch',
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterText: { ...type.footnote, color: colors.mutedForeground, fontWeight: '600' },
  pressed: { opacity: 0.85, transform: [{ scale: 0.98 }] },
});
