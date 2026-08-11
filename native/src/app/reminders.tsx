import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Bell, Droplets, Dumbbell, type LucideIcon, Moon, Pill, Scale } from 'lucide-react-native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useReminders } from '@/hooks/use-reminders';
import type { ReminderPrefs } from '@/lib/notifications';

const WATER_INTERVALS = [1, 2, 3, 4];

function timeToDate(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export default function RemindersScreen() {
  const i18n = useI18n();
  const { prefs, permission, available, toggle, setTime, setWaterInterval } = useReminders();

  type TimedKey = 'supplements' | 'bedtime' | 'weighIn' | 'workout';
  const timed: { key: TimedKey; icon: LucideIcon; color: string; title: string }[] = [
    { key: 'supplements', icon: Pill, color: colors.metricPurple, title: i18n.nReminderSupplements },
    { key: 'workout', icon: Dumbbell, color: colors.primary, title: i18n.nReminderWorkout },
    { key: 'weighIn', icon: Scale, color: colors.metricBlue, title: i18n.nReminderWeighIn },
    { key: 'bedtime', icon: Moon, color: colors.metricOrange, title: i18n.nReminderBedtime },
  ];

  const showPermHint = available && !permission && Object.values(prefs).some((r) => r.enabled);

  return (
    <Screen back title={i18n.nRemindersTitle}>
      <View style={styles.intro}>
        <Icon icon={Bell} size={18} color={colors.primary} />
        <Text style={styles.introText}>{i18n.nRemindersDesc}</Text>
      </View>

      {showPermHint && (
        <GlassCard style={styles.warnCard}>
          <Text style={styles.warnText}>{i18n.nRemindersDenied}</Text>
        </GlassCard>
      )}

      {/* Water — interval-based through the day */}
      <GlassCard>
        <View style={styles.rowHead}>
          <View style={styles.rowTitleWrap}>
            <View style={[styles.iconBadge, { backgroundColor: 'rgba(59,166,255,0.14)' }]}>
              <Icon icon={Droplets} size={16} />
            </View>
            <Text style={styles.rowTitle}>{i18n.nReminderWater}</Text>
          </View>
          <Switch
            value={prefs.water.enabled}
            onValueChange={(v) => {
              Haptics.selectionAsync();
              toggle('water', v);
            }}
            trackColor={{ true: colors.readinessGreen, false: colors.secondary }}
          />
        </View>
        {prefs.water.enabled && (
          <View style={styles.intervalRow}>
            {WATER_INTERVALS.map((n) => (
              <Pressable
                key={n}
                style={[styles.intervalChip, prefs.water.everyHours === n && styles.intervalChipActive]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWaterInterval(n);
                }}>
                <Text
                  style={[styles.intervalText, prefs.water.everyHours === n && styles.intervalTextActive]}>
                  {i18n.nReminderEveryHours.replace('{n}', String(n))}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </GlassCard>

      {/* Daily fixed-time reminders */}
      {timed.map(({ key, icon, color, title }) => {
        const r = prefs[key] as ReminderPrefs[TimedKey];
        return (
          <GlassCard key={key}>
            <View style={styles.rowHead}>
              <View style={styles.rowTitleWrap}>
                <View style={[styles.iconBadge, { backgroundColor: `${color}22` }]}>
                  <Icon icon={icon} size={16} color={color} />
                </View>
                <Text style={styles.rowTitle}>{title}</Text>
              </View>
              <View style={styles.rowRight}>
                {r.enabled && (
                  <DateTimePicker
                    value={timeToDate(r.hour, r.minute)}
                    mode="time"
                    display="compact"
                    themeVariant="dark"
                    onChange={(_, d) => d && setTime(key, d.getHours(), d.getMinutes())}
                  />
                )}
                <Switch
                  value={r.enabled}
                  onValueChange={(v) => {
                    Haptics.selectionAsync();
                    toggle(key, v);
                  }}
                  trackColor={{ true: colors.readinessGreen, false: colors.secondary }}
                />
              </View>
            </View>
          </GlassCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  introText: { ...type.footnote, color: colors.mutedForeground, flex: 1 },
  warnCard: { backgroundColor: 'rgba(255,217,61,0.1)' },
  warnText: { ...type.footnote, color: colors.readinessYellow },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  rowTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1, minWidth: 0 },
  iconBadge: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { ...type.headline, color: colors.foreground, flexShrink: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  intervalRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  /* 34pt with no hitSlop is a 34pt-tall target on a control that spans the
     screen — and `tap-targets.mjs` never saw it, because it skipped anything
     without a fixed `width` and a `flex: 1` segment has none. 44 is Apple's
     floor, and on a page with room to spare it also stops the row reading as
     an afterthought. */
  intervalChip: {
    flex: 1,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalChipActive: { backgroundColor: colors.primary },
  intervalText: { ...type.footnote, color: colors.secondaryForeground },
  intervalTextActive: { color: colors.primaryForeground, fontWeight: '600' },
});
