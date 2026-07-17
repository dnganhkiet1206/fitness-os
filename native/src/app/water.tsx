import * as Haptics from 'expo-haptics';
import { Minus, Plus } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useVolumeUnit } from '@/hooks/use-volume-unit';
import { useProfile } from '@/hooks/useTodayData';
import { useAddWater, useRemoveLastWater, useTodayWater, useTodayWaterLogs, useWaterWeek } from '@/hooks/use-water';
import { displayVolume, volumeLabel, volumeToMl } from '@/lib/units';

// Quick-add amounts in the display unit (converted to ml on tap)
const QUICK_ML = [250, 500, 750];
const QUICK_OZ = [8, 12, 16];

export default function WaterScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const { unit: vUnit } = useVolumeUnit();
  const vl = volumeLabel(vUnit);
  const { data: profile } = useProfile();
  const { data: total } = useTodayWater();
  const { data: logs } = useTodayWaterLogs();
  const { data: week } = useWaterWeek();
  const addWater = useAddWater();
  const removeLast = useRemoveLastWater();

  const target = Number(profile?.water_target_ml) || 2500;
  const todayMl = total ?? 0;
  const pct = Math.min(100, (todayMl / target) * 100);
  const maxWeek = Math.max(target, ...(week ?? []).map((d) => d.total));

  const QUICK = vUnit === 'oz' ? QUICK_OZ : QUICK_ML;
  // ml → "1.80 L" (metric) or "61 oz" (imperial)
  const bigValue = vUnit === 'oz' ? `${displayVolume(todayMl, 'oz')} oz` : `${(todayMl / 1000).toFixed(2)}L`;
  const targetLabel = vUnit === 'oz' ? `${displayVolume(target, 'oz')} oz` : `${(target / 1000).toFixed(1)}L`;

  return (
    <Screen back title={i18n.nWaterTitle}>
      {/* Today ring/summary */}
      <GlassCard>
        <View style={styles.summaryRow}>
          <View>
            <Text style={styles.bigValue}>{bigValue}</Text>
            <Text style={styles.cardHint}>{i18n.nOfTarget.replace('{x}', targetLabel)}</Text>
          </View>
          <Text style={styles.pct}>{Math.round(pct)}%</Text>
        </View>
        <View style={styles.barTrack}>
          <View style={[styles.barFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.quickLabel}>{i18n.nQuickAdd}</Text>
        <View style={styles.quickRow}>
          {/* Undo last entry (web: minus button) */}
          <Pressable
            style={({ pressed }) => [
              styles.undoBtn,
              (!logs || logs.length === 0) && styles.undoDisabled,
              pressed && styles.pressed,
            ]}
            disabled={!logs || logs.length === 0 || removeLast.isPending}
            onPress={() => removeLast.mutate()}>
            <Icon icon={Minus} size={16} color={colors.foreground} strokeWidth={2.5} />
          </Pressable>
          {QUICK.map((amount) => (
            <Pressable
              key={amount}
              style={({ pressed }) => [styles.quickBtn, pressed && styles.pressed]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                addWater.mutate(volumeToMl(amount, vUnit));
              }}>
              <Icon icon={Plus} size={14} color={colors.foreground} strokeWidth={2.5} />
              <Text style={styles.quickText}>{amount}</Text>
            </Pressable>
          ))}
        </View>
      </GlassCard>

      {/* 7-day chart */}
      <GlassCard>
        <Text style={styles.cardTitle}>{i18n.nLast7Days}</Text>
        <View style={styles.chart}>
          {(week ?? []).map((d) => {
            const h = maxWeek > 0 ? (d.total / maxWeek) * 100 : 0;
            const met = d.total >= target;
            const dayLetter = new Date(d.date).toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US', { weekday: 'short' });
            return (
              <View key={d.date} style={styles.barCol}>
                <View style={styles.barColTrack}>
                  <View style={[styles.barColFill, { height: `${Math.max(3, h)}%`, backgroundColor: met ? colors.metricBlue : colors.secondary }]} />
                </View>
                <Text style={styles.barColLabel}>{dayLetter}</Text>
              </View>
            );
          })}
        </View>
      </GlassCard>

      {/* Today's log entries */}
      {logs && logs.length > 0 && (
        <GlassCard>
          <Text style={styles.cardTitle}>{i18n.nTodayLogs}</Text>
          <View style={styles.logList}>
            {logs.map((l) => (
              <View key={l.id} style={styles.logRow}>
                <Text style={styles.logAmount}>{displayVolume(Number(l.amount_ml), vUnit)} {vl}</Text>
                <Text style={styles.logTime}>
                  {new Date(l.logged_at).toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            ))}
          </View>
        </GlassCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardHint: { ...type.footnote, color: colors.mutedForeground, marginTop: 2 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  bigValue: { ...type.largeTitle, ...type.mono, color: colors.foreground },
  pct: { ...type.title, color: colors.metricBlue, fontVariant: ['tabular-nums'] },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.background, overflow: 'hidden', marginTop: spacing.md },
  barFill: { height: '100%', borderRadius: 5, backgroundColor: colors.metricBlue },
  quickLabel: { ...type.caption, color: colors.mutedForeground, textTransform: 'uppercase', letterSpacing: 1, fontWeight: '600', marginTop: spacing.md },
  quickRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  quickBtn: { flex: 1, height: 46, borderRadius: radius.md, backgroundColor: colors.secondary, flexDirection: 'row', gap: 2, alignItems: 'center', justifyContent: 'center' },
  undoBtn: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  undoDisabled: { opacity: 0.35 },
  quickText: { ...type.headline, color: colors.foreground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 130, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barColTrack: { width: '60%', height: 104, justifyContent: 'flex-end', backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden' },
  barColFill: { width: '100%', borderRadius: 4 },
  barColLabel: { ...type.caption, color: colors.mutedForeground },
  logList: { marginTop: spacing.sm, gap: spacing.xs },
  logRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.xs },
  logAmount: { ...type.body, color: colors.foreground, fontWeight: '600', fontVariant: ['tabular-nums'] },
  logTime: { ...type.footnote, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
});
