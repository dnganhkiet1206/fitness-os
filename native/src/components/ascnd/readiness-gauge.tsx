import * as Haptics from 'expo-haptics';
import { useIsFocused } from 'expo-router';
import { HelpCircle, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  FadeOut,
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { ReadinessExplainer } from '@/components/ascnd/readiness-explainer';
import { colors, glass, radius, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { noteHelpOpened, noteNudged, shouldNudge } from '@/lib/help-nudge';
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
}

/**
 * Faithful port of the web ReadinessGauge card: pulsing status dot +
 * uppercase title, 208pt gradient ring with the score in mono type,
 * status label, ACWR tile, explain text, tinted recommendation pill and
 * the three-zone legend.
 */
export function ReadinessGauge({ score, status, explain, recommendation, acwr }: Props) {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';

  /*
    Help, and the hint that it exists.

    `HELP_TOPIC` is the storage key for the counting; it is a constant rather
    than the string typed twice, because the two uses have to agree or the hint
    counts under one name and is silenced under another — a bug whose only
    symptom is a hint that never stops.
  */
  const [help, setHelp] = useState(false);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    let alive = true;
    void shouldNudge(HELP_TOPIC).then((show) => {
      if (!alive || !show) return;
      setNudge(true);
      void noteNudged(HELP_TOPIC);
    });
    return () => {
      alive = false;
    };
  }, []);

  const openHelp = () => {
    Haptics.selectionAsync();
    setNudge(false);
    setHelp(true);
    void noteHelpOpened(HELP_TOPIC);
  };
  /* Dismissing is not the same as reading: the showing has already been
     counted, so it can come back tomorrow, up to the budget. */
  const dismissNudge = () => {
    Haptics.selectionAsync();
    setNudge(false);
  };

  // Stored values are language-neutral tokens (legacy rows may hold prose);
  // localize here so the copy follows the active language.
  const explainText = readinessExplainText(explain, lang);
  const recoText = readinessRecoText(recommendation, lang);
  const color = STATUS_COLOR[status] ?? colors.readinessYellow;

  // Sub-score tiles (web parity): RHR / Sleep / Load (0–100) + the ACWR ratio
  const subs = readinessSubscores(explain);
  const subColor = (v: number) =>
    v >= 70 ? colors.readinessGreen : v >= 40 ? colors.readinessYellow : colors.readinessRed;
  const acwrColor =
    acwr == null ? colors.mutedForeground : acwr >= 0.8 && acwr <= 1.3 ? colors.readinessGreen : acwr > 1.3 ? colors.readinessYellow : colors.readinessRed;
  const tiles: { label: string; value: string; color: string }[] = [];
  if (subs.rhr != null) tiles.push({ label: 'RHR', value: String(subs.rhr), color: subColor(subs.rhr) });
  if (subs.sleep != null) tiles.push({ label: 'SLEEP', value: String(subs.sleep), color: subColor(subs.sleep) });
  if (subs.load != null) tiles.push({ label: 'LOAD', value: String(subs.load), color: subColor(subs.load) });
  if (acwr != null && acwr > 0) tiles.push({ label: 'ACWR', value: String(acwr), color: acwrColor });
  const [g0, g1] = GRADIENTS[status] ?? GRADIENTS.yellow;
  const statusLabel =
    status === 'green' ? i18n.dcReadinessTrain : status === 'yellow' ? i18n.dcReadinessModerate : i18n.dcReadinessRecover;

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
      300,
      withTiming(score / 100, { duration: 1600, easing: Easing.bezier(0.16, 1, 0.3, 1) }),
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
    <GlassCard style={styles.card}>
      {/* Title with pulsing status dot */}
      <View style={styles.titleRow}>
        <Animated.View
          style={[styles.statusDot, { backgroundColor: color }, { transform: [{ scale: pulse }] }]}
        />
        <Text style={styles.title}>{i18n.dcReadinessTitle}</Text>
        {/*
          The way in to what any of this means.

          A nested `Pressable` becomes the touch responder itself, so this does
          not fall through to the card's own press — Today wraps the whole gauge
          in one that pushes `/biometrics`, and tapping `?` must not navigate.
        */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={vi ? 'Giải thích điểm sẵn sàng' : 'Explain the readiness score'}
          hitSlop={12}
          onPress={openHelp}
          style={({ pressed }) => [styles.helpBtn, pressed && styles.helpPressed]}>
          <Icon icon={HelpCircle} size={17} color={colors.mutedForeground} />
        </Pressable>
      </View>

      {/*
        The hint, at most three times and never again once the `?` is pressed.

        It points up-and-right at the button rather than describing where it is,
        because "bấm vào biểu tượng dấu hỏi ở góc" is a sentence you have to
        parse into a location. See `lib/help-nudge.ts` for the counting — the
        counting is the whole feature, since an uncounted hint on a card you
        open every morning becomes an obstacle by its tenth appearance.
      */}
      {nudge ? (
        <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(140)}>
          <Pressable
            accessibilityRole="button"
            onPress={openHelp}
            style={({ pressed }) => [styles.nudge, pressed && styles.helpPressed]}>
            <Icon icon={HelpCircle} size={14} color={colors.metricBlue} />
            <Text style={styles.nudgeText}>
              {vi
                ? 'Chưa rõ RHR, LOAD hay ACWR là gì? Bấm vào đây.'
                : 'Not sure what RHR, LOAD or ACWR mean? Tap here.'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={i18n.a11yClose}
              hitSlop={12}
              onPress={dismissNudge}>
              <Icon icon={X} size={14} color={colors.mutedForeground} />
            </Pressable>
          </Pressable>
        </Animated.View>
      ) : null}

      {/* Ring */}
      <View style={styles.ringWrap}>
        {/* Neon halo behind the ring, tinted to the status colour (web glow) */}
        <View
          pointerEvents="none"
          style={[styles.ringGlow, { shadowColor: color, backgroundColor: `${color}0d` }]}
        />
        <Svg width={208} height={208} viewBox="0 0 120 120">
          <Defs>
            <LinearGradient id="readiness-grad" x1="0%" y1="0%" x2="100%" y2="100%">
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
            stroke="url(#readiness-grad)"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={`${CIRC}`}
            animatedProps={ringProps}
            transform="rotate(-90 60 60)"
          />
        </Svg>
        <View style={styles.ringCenter} pointerEvents="none">
          <Text style={[styles.score, { color }]}>{score}</Text>
          <Text style={[styles.statusLabel, { color }]}>{statusLabel}</Text>
        </View>
      </View>

      {/* Sub-score tiles: RHR · SLEEP · LOAD · ACWR (web parity) */}
      {tiles.length > 0 && (
        <View style={styles.tileRow}>
          {tiles.map((t) => (
            <View key={t.label} style={styles.tile}>
              <Text style={styles.tileLabel}>{t.label}</Text>
              <Text style={[styles.tileValue, { color: t.color }]}>{t.value}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Explain + recommendation */}
      {explainText ? <Text style={styles.explain}>{explainText}</Text> : null}
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
      <ReadinessExplainer visible={help} onClose={() => setHelp(false)} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { alignItems: 'center', paddingVertical: spacing.xl + 8, gap: spacing.lg },
  /* Sits at the end of the title row, so it is where a trailing accessory is
     on every other header in the app rather than beside the word it explains. */
  helpBtn: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  helpPressed: { opacity: 0.7, transform: [{ scale: 0.94 }] },
  nudge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(59,166,255,0.25)',
    backgroundColor: 'rgba(59,166,255,0.10)',
  },
  nudgeText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.foreground },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  title: {
    /* Takes the slack so the `?` lands on the right edge of the card rather
       than tucked against the last letter of the title. */
    flex: 1,
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
  tileRow: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch', paddingHorizontal: spacing.card },
  tile: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
    backgroundColor: glass.bg,
    borderRadius: radius.sm,
    paddingVertical: spacing.sm + 2,
    borderWidth: glass.borderWidth,
    borderColor: glass.border,
  },
  tileLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 1, color: colors.mutedForeground },
  tileValue: { fontSize: 18, fontFamily: 'Menlo', fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },
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
  legendText: { fontSize: 10, color: colors.mutedForeground },
});
