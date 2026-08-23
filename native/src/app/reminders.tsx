import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Bell, Droplets, Dumbbell, type LucideIcon, Moon, Pill, Scale } from 'lucide-react-native';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { PickRow } from '@/components/ascnd/pick-row';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { useReminders } from '@/hooks/use-reminders';
import { useProfile } from '@/hooks/useTodayData';
import type { ReminderPrefs } from '@/lib/notifications';
import { habitFor, usePersonalModel } from '@/lib/personal-model';
import {
  formatClock,
  suggestedTime,
  worthOffering,
  type TimedReminder,
} from '@/lib/reminder-timing';

const WATER_INTERVALS = [1, 2, 3, 4];

function timeToDate(hour: number, minute: number) {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d;
}

export default function RemindersScreen() {
  const i18n = useI18n();
  const { prefs, permission, available, toggle, setTime, setWaterInterval } = useReminders();

  /*
    ── the times the app already knew ──

    Two of these four defaults were constants somebody typed once for everybody:
    a wind-down alert at 22:30 and a weigh-in at 07:00. Onboarding *asks* for a
    bedtime and a waketime, so an app that ships those constants can fire a
    weigh-in reminder an hour before somebody wakes up — which is how a person
    learns to switch notifications off for good.

    The third source is the app's own: the hour this person is actually observed
    logging a workout (`lib/user-rhythm.ts`, six observations minimum and a real
    agreement threshold, so it stays silent until it has something to say).

    Nothing here moves by itself. Each row shows what was noticed and what it
    would set, and it takes a tap. See `lib/reminder-timing.ts`.
  */
  const { data: profile } = useProfile();
  /* Subscribed so the offer appears the moment the model learns a habit, rather
     than on whatever render happens next. */
  usePersonalModel();
  const workout = habitFor('workout');
  const known = {
    bedtime: profile?.sleep_target_bedtime,
    waketime: profile?.sleep_target_waketime,
    workoutHour: workout?.hour ?? null,
  };
  const SOURCE: Record<TimedReminder, string | null> = {
    bedtime: known.bedtime ? i18n.nSmartBedtime.replace('{t}', String(known.bedtime).slice(0, 5)) : null,
    weighIn: known.waketime ? i18n.nSmartWake.replace('{t}', String(known.waketime).slice(0, 5)) : null,
    workout: workout
      ? i18n.nSmartWorkout.replace('{t}', formatClock({ hour: Math.round(workout.hour), minute: 0 }))
      : null,
    supplements: null,
  };

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
          <PickRow
            value={String(prefs.water.everyHours)}
            fill={colors.primary}
            slotFill={colors.secondary}
            radius={radius.md}
              gap={spacing.sm}
            style={styles.intervalRow}>
            {WATER_INTERVALS.map((n) => (
              <PickRow.Item
                key={n}
                itemKey={String(n)}
                accessibilityLabel={i18n.nReminderEveryHours.replace('{n}', String(n))}
                style={styles.intervalChip}
                onPress={() => {
                  Haptics.selectionAsync();
                  setWaterInterval(n);
                }}>
                <Text
                  style={[styles.intervalText, prefs.water.everyHours === n && styles.intervalTextActive]}>
                  {i18n.nReminderEveryHours.replace('{n}', String(n))}
                </Text>
              </PickRow.Item>
            ))}
          </PickRow>
        )}
      </GlassCard>

      {/* Daily fixed-time reminders */}
      {timed.map(({ key, icon, color, title }) => {
        const r = prefs[key] as ReminderPrefs[TimedKey];
        const suggested = suggestedTime(key, known);
        /* Offered only while the reminder is on, and only when it is far enough
           from what is set to be worth a tap. An offer to move an alarm by
           eight minutes is a row people learn to scroll past. */
        const offer =
          r.enabled && suggested && SOURCE[key] && worthOffering(r, suggested)
            ? suggested
            : null;
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

            {offer ? (
              <View style={styles.smartRow}>
                <Text style={styles.smartText} numberOfLines={2}>
                  {i18n.nSmartFrom.replace('{what}', SOURCE[key] ?? '')}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={i18n.nSmartMove.replace('{t}', formatClock(offer))}
                  hitSlop={8}
                  style={styles.smartBtn}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTime(key, offer.hour, offer.minute);
                  }}>
                  <Text style={styles.smartBtnText}>
                    {i18n.nSmartMove.replace('{t}', formatClock(offer))}
                  </Text>
                </Pressable>
              </View>
            ) : null}
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
  intervalRow: { marginTop: spacing.md },
  /* Quiet, and below the control it talks about: this is the app explaining
     something it noticed, not a second setting competing with the picker. */
  smartRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  smartText: { ...type.caption, color: colors.mutedForeground, flex: 1, minWidth: 0 },
  smartBtn: {
    minHeight: 32,
    justifyContent: 'center',
    paddingHorizontal: spacing.md - 2,
    borderRadius: radius.full,
    backgroundColor: colors.secondary,
  },
  smartBtnText: { ...type.caption, fontWeight: '700', color: colors.primary },
  /* 34pt with no hitSlop is a 34pt-tall target on a control that spans the
     screen — and `tap-targets.mjs` never saw it, because it skipped anything
     without a fixed `width` and a `flex: 1` segment has none. 44 is Apple's
     floor, and on a page with room to spare it also stops the row reading as
     an afterthought. */
  /* Background drawn by the row — see `pick-row.tsx`. */
  intervalChip: {
    flex: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  intervalText: { ...type.footnote, color: colors.secondaryForeground },
  intervalTextActive: { color: colors.primaryForeground, fontWeight: '600' },
});
