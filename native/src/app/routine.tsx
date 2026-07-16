import { StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useRoutineDays, useWorkoutTemplateNames } from '@/hooks/use-library';

const DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAYS_VI = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export default function RoutineScreen() {
  const { data: days } = useRoutineDays();
  const { data: templateNames } = useWorkoutTemplateNames();
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const dayNames = lang === 'vi' ? DAYS_VI : DAYS_EN;

  const byDay = new Map((days ?? []).map((d) => [d.day_of_week, d]));

  return (
    <Screen title={i18n.nRoutine}>
      {dayNames.map((label, idx) => {
        const d = byDay.get(idx);
        const templateName = d?.template_id ? templateNames?.get(d.template_id) : null;
        return (
          <GlassCard key={idx} style={styles.dayCard}>
            <View style={styles.row}>
              <Text style={styles.day}>{label}</Text>
              {d?.is_rest ? (
                <View style={[styles.badge, styles.badgeRest]}>
                  <Text style={styles.badgeText}>{i18n.nRest}</Text>
                </View>
              ) : d?.is_deload ? (
                <View style={[styles.badge, styles.badgeDeload]}>
                  <Text style={styles.badgeText}>{i18n.nDeload}</Text>
                </View>
              ) : templateName ? (
                <Text style={styles.template} numberOfLines={1}>{templateName}</Text>
              ) : (
                <Text style={styles.empty}>—</Text>
              )}
            </View>
            {d?.notes ? <Text style={styles.notes}>{d.notes}</Text> : null}
          </GlassCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dayCard: { paddingVertical: spacing.md },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  day: { ...type.headline, color: colors.foreground },
  template: { ...type.body, color: colors.primary, flexShrink: 1 },
  empty: { ...type.body, color: colors.mutedForeground },
  badge: {
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  badgeRest: { backgroundColor: colors.secondary },
  badgeDeload: { backgroundColor: 'rgba(230,185,61,0.18)' },
  badgeText: { ...type.caption, color: colors.secondaryForeground, fontWeight: '600' },
  notes: { ...type.footnote, color: colors.mutedForeground, marginTop: spacing.sm },
});
