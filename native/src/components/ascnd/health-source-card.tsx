import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { Glyph } from '@/components/ascnd/assistant-icons';
import { LiquidGlass, tintBorder } from '@/components/ascnd/liquid-glass';
import { PressScale } from '@/components/ascnd/press-scale';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings } from '@/hooks/use-app-settings';
import { useHealthSync } from '@/hooks/use-health-sync';

const TINT = '#ff3b5c';

/**
 * Where today's numbers came from, and a way to go and get them.
 *
 * ── why it belongs on this page ──
 *
 * The sync existed before this card, on the Today tab, as an unlabelled button
 * among the widgets. This page is the one that *explains* the body — the
 * briefing, the metric tiles, the insight — and every sentence on it is only as
 * current as the last sync. Somebody reading "bạn ngủ 5 giờ 20 phút" and
 * disagreeing with it had nowhere on this screen to go.
 *
 * ── it says what it brings, not that it is connected ──
 *
 * "Connected" is a claim about a permission dialog somebody tapped once. What
 * matters is which of the app's readings this source can actually fill, so the
 * card lists them: sleep, heart, movement, workouts. Those are the four things
 * that used to be typed in and now do not have to be.
 *
 * ── absent on hardware that cannot do it ──
 *
 * Not disabled, absent. `isHealthKitAvailable()` is false on Android, on web,
 * in Expo Go and on a simulator without the native module — and a greyed-out
 * card offering Apple Health on a Pixel is an advertisement for a thing that
 * will never work there.
 */
export function HealthSourceCard() {
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { available, sync } = useHealthSync();

  if (!available) return null;

  const brings = vi
    ? 'Giấc ngủ · Nhịp tim & HRV · Bước chân · Buổi tập'
    : 'Sleep · Heart & HRV · Steps · Workouts';

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={vi ? 'Đồng bộ với Apple Health' : 'Sync with Apple Health'}
      accessibilityState={{ busy: sync.isPending }}
      disabled={sync.isPending}
      onPress={() => sync.mutate()}>
      <LiquidGlass style={[styles.card, tintBorder(TINT)]} radius={radius.lg} tint={TINT}>
        <View style={[styles.icon, { backgroundColor: `${TINT}1f` }]}>
          <Glyph name="heart" size={19} />
        </View>
        <View style={styles.body}>
          <Text style={styles.title}>Apple Health</Text>
          <Text style={styles.hint} numberOfLines={2}>
            {brings}
          </Text>
        </View>
        {sync.isPending ? (
          <ActivityIndicator size="small" color={colors.glassMuted} />
        ) : (
          <Text style={styles.action}>{vi ? 'Đồng bộ' : 'Sync'}</Text>
        )}
      </LiquidGlass>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.card,
  },
  icon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
  title: { ...type.headline, color: colors.foreground },
  /* `glassMuted`, not `mutedForeground`. This sits on glass over the aura,
     where #828282 measures 2.57:1 — see `tools/glass-legibility.mjs`. */
  hint: { ...type.footnote, color: colors.glassMuted },
  action: { ...type.footnote, color: colors.foreground, fontWeight: '600' },
});
