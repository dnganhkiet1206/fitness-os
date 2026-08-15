import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Lightbulb, Moon, Trash2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { PressScale } from '@/components/ascnd/press-scale';
import { EmptyState } from '@/components/ascnd/empty-state';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { colors, spacing, type } from '@/constants/ascnd';
import { rise } from '@/lib/entrance';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useProfile, useSleepHistory } from '@/hooks/useTodayData';
import { useDeleteSleepLog } from '@/hooks/use-fitness-data';
import { getLocale } from '@/lib/i18n';
import { asleepMinutes } from '@/lib/daily-log-service';
import { toast } from '@/lib/toast';

const DEEP = colors.metricPurple;
const REM = colors.metricCyan;
const LIGHT = '#565663';

export default function SleepInsightsScreen() {
  const { lang } = useAppSettings();
  const i18n = useI18n();
  const locale = getLocale(lang);
  const { data: sleepLogs, isError, refetch, isRefetching } = useSleepHistory(7);
  const { data: profile } = useProfile();
  const vi = lang === 'vi';
  const remove = useDeleteSleepLog();
  const targetHours = Number(profile?.sleep_target_hours) || 8;

  const nights = useMemo(
    () =>
      (sleepLogs ?? []).map((s) => {
        const deep = Number(s.deep_min ?? 0);
        const rem = Number(s.rem_min ?? 0);
        const light = Number(s.light_min ?? 0);
        /*
          ── how long the night was, and how long it looked like ──

          `total` used to be `deep + rem + light`, which is only a night's
          length for a night HealthKit wrote. A night typed into `log-sleep`
          has a bedtime and a waketime and leaves the three stage boxes empty,
          stored as 0 — so this screen told anybody logging by hand that they
          slept **0.0h**, computed a full week of sleep debt from it, and then
          printed "Bạn ngủ trung bình 0.0h, thiếu 8.0h so với mục tiêu" as a
          finding about their body.

          Same mistake had already been found and fixed twice, in the readiness
          engine and in the two AI functions. `asleepMinutes` is the app's one
          definition of a night's length and it now lives in one place.

          The stages are still the stages. `stagesKnown` is what separates "you
          had no deep sleep" from "nobody measured your deep sleep", and every
          reader below has to respect that difference.
        */
        const stagesKnown = deep + rem + light > 0;
        const total = asleepMinutes(s);
        const wake = new Date(s.waketime);
        return {
          day: wake.toLocaleDateString(locale, { weekday: 'short' }),
          total_h: total / 60,
          deep_h: deep / 60,
          rem_h: rem / 60,
          light_h: light / 60,
          stagesKnown,
          quality: Number(s.quality ?? 0),
        };
      }),
    [sleepLogs, locale],
  );

  const stats = useMemo(() => {
    if (nights.length === 0) return null;
    const n = nights.length;
    const sum = (f: (x: (typeof nights)[number]) => number) => nights.reduce((a, x) => a + f(x), 0);
    const avgTotal = sum((d) => d.total_h) / n;
    const avgQuality = sum((d) => d.quality) / n;
    /*
      Averaged over the nights that actually have stages, not over the week.
      Counting a hand-logged night as zero deep sleep pulls the average under
      the threshold below and produces "Deep sleep thấp (<1h)" — a statement
      about somebody's sleep architecture, derived entirely from nights on
      which nobody measured their sleep architecture.
    */
    const staged = nights.filter((d) => d.stagesKnown);
    const avgDeep = staged.length ? staged.reduce((a, d) => a + d.deep_h, 0) / staged.length : null;
    const avgRem = staged.length ? staged.reduce((a, d) => a + d.rem_h, 0) / staged.length : null;
    const debt = Math.max(0, targetHours * 7 - sum((d) => d.total_h));
    return { avgTotal, avgQuality, avgDeep, avgRem, debt };
  }, [nights, targetHours]);

  const insights = useMemo(() => {
    if (!stats) return [];
    const out: string[] = [];
    if (stats.avgTotal < targetHours - 0.5) {
      out.push(
        lang === 'vi'
          ? `Bạn ngủ trung bình ${stats.avgTotal.toFixed(1)}h, thiếu ${(targetHours - stats.avgTotal).toFixed(1)}h so với mục tiêu.`
          : `You sleep ${stats.avgTotal.toFixed(1)}h on average, short by ${(targetHours - stats.avgTotal).toFixed(1)}h vs target.`,
      );
    }
    /* `null` means no night this week reported stages — so there is nothing to
       say about deep or REM, and saying it anyway is the bug this guards. */
    if (stats.avgDeep !== null && stats.avgDeep < 1) {
      out.push(
        lang === 'vi'
          ? 'Deep sleep thấp (<1h). Hãy tránh rượu và caffeine trước giờ ngủ.'
          : 'Deep sleep is low (<1h). Avoid alcohol and caffeine before bed.',
      );
    }
    if (stats.avgRem !== null && stats.avgRem < 1.2) {
      out.push(
        lang === 'vi'
          ? 'REM sleep thấp. Cố gắng đi ngủ đều giờ hơn.'
          : 'REM sleep is low. Try to keep a consistent bedtime.',
      );
    }
    if (stats.debt > 5) {
      out.push(
        lang === 'vi'
          ? `Nợ giấc ngủ tuần: ${stats.debt.toFixed(1)}h. Cân nhắc ngủ bù cuối tuần.`
          : `Weekly sleep debt: ${stats.debt.toFixed(1)}h. Consider catching up on weekends.`,
      );
    }
    if (stats.avgQuality >= 7) {
      out.push(lang === 'vi' ? 'Chất lượng giấc ngủ tốt! Giữ vững thói quen.' : 'Sleep quality is good! Keep it up.');
    }
    return out;
  }, [stats, targetHours, lang]);

  const maxH = Math.max(8, ...nights.map((n) => n.total_h));

  return (
    <Screen back title={i18n.sleepTitle}>
      {/* A failed read is not an empty history. `data` comes back undefined, the
        zero branch below renders, and the screen tells somebody they have
        never recorded anything — a statement about their account, not about
        the network. The failure is answered first so the empty state stays
        true. */}
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : !stats ? (
        <GlassCard>
          {/* Told a new user there was no sleep data and stopped there, leaving
              them to go and find the log sheet on another tab. */}
          <EmptyState
            icon={Moon}
            title={i18n.sleepNoData}
            hint={i18n.sleepNoDataMsg}
            action={{ label: i18n.nLogSleepTitle, onPress: () => router.push('/log-sleep') }}
          />
        </GlassCard>
      ) : (
        <>
          {/* Stat grid */}
          <Animated.View style={styles.statGrid} entering={rise(0)}>
            <StatCard value={`${stats.avgTotal.toFixed(1)}h`} label={i18n.sleepAvg} color={colors.foreground} />
            <StatCard value={`${stats.avgQuality.toFixed(1)}`} label={i18n.sleepAvgQuality} color={colors.readinessGreen} />
            {/* An em-dash rather than "0.0h": nobody slept zero deep, the app
                simply was not told. */}
            <StatCard
              value={stats.avgDeep === null ? '—' : `${stats.avgDeep.toFixed(1)}h`}
              label={i18n.sleepAvgDeep}
              color={stats.avgDeep === null ? colors.mutedForeground : DEEP}
            />
            <StatCard value={`${stats.debt.toFixed(1)}h`} label={i18n.sleepDebt} color={stats.debt > 5 ? colors.readinessRed : colors.mutedForeground} />
          </Animated.View>

          {/* Stage chart */}
          <Animated.View entering={rise(1)}>
          <GlassCard>
            <Text style={styles.cardTitle}>{i18n.sleepStages}</Text>
            <View style={styles.legend}>
              <LegendDot color={DEEP} label={i18n.sleepDeep} />
              <LegendDot color={REM} label="REM" />
              <LegendDot color={LIGHT} label="Light" />
            </View>
            <View style={styles.chart}>
              {nights.map((n, i) => (
                <View key={i} style={styles.barCol}>
                  <View style={styles.barTrack}>
                    <View style={{ flexGrow: Math.max(0, maxH - n.total_h) }} />
                    {n.stagesKnown ? (
                      <>
                        <View style={[styles.barSeg, { flexGrow: n.light_h, backgroundColor: LIGHT }]} />
                        <View style={[styles.barSeg, { flexGrow: n.rem_h, backgroundColor: REM }]} />
                        <View style={[styles.barSeg, { flexGrow: n.deep_h, backgroundColor: DEEP }]} />
                      </>
                    ) : (
                      /* The night's length is known and its breakdown is not.
                         One plain bar says both of those; three segments summing
                         to zero would draw nothing at all and read as a night
                         that never happened. */
                      <View style={[styles.barSeg, styles.barUnknown, { flexGrow: n.total_h }]} />
                    )}
                  </View>
                  <Text style={styles.barLabel}>{n.day}</Text>
                </View>
              ))}
            </View>
          </GlassCard>
          </Animated.View>

          {/* Insights */}
          {insights.length > 0 && (
            <Animated.View entering={rise(2)}>
            <GlassCard>
              <View style={styles.cardTitleRow}>
                <Icon icon={Lightbulb} size={15} color={colors.readinessYellow} />
                <Text style={styles.cardTitle}>{i18n.sleepInsights}</Text>
              </View>
              <View style={styles.insightList}>
                {insights.map((text, i) => (
                  <View key={i} style={styles.insightRow}>
                    <Text style={styles.insightBullet}>•</Text>
                    <Text style={styles.insightText}>{text}</Text>
                  </View>
                ))}
              </View>
            </GlassCard>
            </Animated.View>
          )}
        </>
      )}
      {/*
        Every night, and the way to take one back.

        ── why this was the missing half ──

        The log screen could only `.insert()`, and nothing anywhere listed a
        night, so a mistyped bedtime was permanent. That matters more than it
        looks: `daily-log-service` reads the *latest* night ending on a day, so
        a bad entry logged afterwards **hides** the correct one — and the
        seven-night average behind the readiness score keeps quoting it for a
        week.

        Newest first: the night somebody wants to undo is the one they just
        entered, usually about ten seconds ago.
      */}
      {(sleepLogs ?? []).length > 0 ? (
        <View style={styles.logSection}>
          <Text style={styles.logTitle}>{vi ? 'Các đêm đã ghi' : 'Logged nights'}</Text>
          {[...(sleepLogs ?? [])].reverse().map((s) => {
            const bed = new Date(s.bedtime);
            const wake = new Date(s.waketime);
            const mins = Math.round((wake.getTime() - bed.getTime()) / 60000);
            const t = (d: Date) => d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            return (
              <GlassCard key={s.id} style={styles.logRow}>
                <View style={styles.logBody}>
                  <Text style={styles.logWhen}>
                    {wake.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={styles.logVals}>
                    {`${t(bed)} → ${t(wake)} · ${Math.floor(mins / 60)}h${String(mins % 60).padStart(2, '0')}`}
                  </Text>
                </View>
                <PressScale
                  accessibilityRole="button"
                  accessibilityLabel={vi ? 'Xoá đêm này' : 'Delete this night'}
                  hitSlop={8}
                  style={styles.logDelete}
                  disabled={remove.isPending}
                  onPress={() => {
                    Haptics.selectionAsync();
                    Alert.alert(
                      vi ? 'Xoá đêm này?' : 'Delete this night?',
                      vi
                        ? 'Điểm sẵn sàng của ngày đó và của hôm nay sẽ được tính lại.'
                        : "That day's readiness and today's will be recomputed.",
                      [
                        { text: vi ? 'Huỷ' : 'Cancel', style: 'cancel' },
                        {
                          text: vi ? 'Xoá' : 'Delete',
                          style: 'destructive',
                          onPress: () =>
                            remove.mutate(
                              { id: s.id, waketime: s.waketime },
                              {
                                onSuccess: () => {
                                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                  toast.success(i18n.deleted);
                                },
                                onError: (e: Error) => toast.error(e.message),
                              },
                            ),
                        },
                      ],
                    );
                  }}>
                  <Icon icon={Trash2} size={16} color={colors.mutedForeground} />
                </PressScale>
              </GlassCard>
            );
          })}
        </View>
      ) : null}
    </Screen>
  );
}

function StatCard({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <GlassCard style={styles.statCard}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>{label}</Text>
    </GlassCard>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cardTitle: { ...type.headline, color: colors.foreground },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  empty: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.xs },
  emptyTitle: { ...type.body, color: colors.foreground, fontWeight: '600' },
  emptyMsg: { ...type.footnote, color: colors.mutedForeground, textAlign: 'center' },
  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  statCard: { width: '47.5%', alignItems: 'flex-start', gap: 2 },
  statValue: { ...type.title, ...type.mono },
  statLabel: { ...type.caption, color: colors.mutedForeground },
  legend: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 9, height: 9, borderRadius: 2 },
  legendText: { ...type.caption, color: colors.mutedForeground },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm, height: 160, marginTop: spacing.md },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barTrack: { width: '70%', height: 140, flexDirection: 'column', backgroundColor: colors.background, borderRadius: 4, overflow: 'hidden' },
  /* Neither of the three stage colours — it is not a stage, it is the absence
     of a breakdown, and giving it one of their colours would name it wrongly. */
  barUnknown: { backgroundColor: 'rgba(255,255,255,0.14)' },
  barSeg: { width: '100%', flexBasis: 0 },
  barLabel: { ...type.caption, color: colors.mutedForeground },
  insightList: { marginTop: spacing.sm, gap: spacing.sm },
  insightRow: { flexDirection: 'row', gap: spacing.sm },
  insightBullet: { ...type.body, color: colors.primary },
  insightText: { ...type.footnote, color: colors.foreground, flex: 1, lineHeight: 19 },
  logSection: { gap: spacing.sm, marginTop: spacing.md },
  logTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    textTransform: 'uppercase',
    letterSpacing: 1.6,
  },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  logBody: { flex: 1, gap: 2 },
  logWhen: { ...type.footnote, color: colors.foreground },
  logVals: { ...type.caption, color: colors.mutedForeground },
  logDelete: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
