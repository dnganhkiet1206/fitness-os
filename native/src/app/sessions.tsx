import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Dumbbell } from 'lucide-react-native';
import { useMemo } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { LoadFailed } from '@/components/ascnd/load-failed';
import { EmptyState } from '@/components/ascnd/empty-state';
import { Screen } from '@/components/ascnd/screen';
import { SessionRow, sessionListStyles } from '@/components/ascnd/session-row';
import { colors, spacing } from '@/constants/ascnd';
import { useAppSettings, useI18n } from '@/hooks/use-app-settings';
import { useDeleteWorkoutSession, useWorkoutSessions } from '@/hooks/use-fitness-data';
import { useUnits } from '@/hooks/use-units';
import { getLocale } from '@/lib/i18n';
import { localDateStr } from '@/lib/local-date';
import { toast } from '@/lib/toast';
import { displayWeight, weightLabel } from '@/lib/units';

/** Ninety days back. The tab shows three; this is the place that shows the rest. */
const DAYS = 90;

/**
 * Every workout you have logged, newest first, grouped by month.
 *
 * ── why the tab could not just keep growing ──
 *
 * "Buổi tập gần đây" listed every session of the last fortnight inside one
 * card at the bottom of the Workouts tab. Train four times a week and that is
 * eight rows; the tab is a summary and the summary was mostly a log. Now the
 * tab shows three and this holds the rest, which is the same arrangement the
 * workout list directly above it already uses.
 *
 * ── months, because a list of dates is not a list ──
 *
 * Forty rows of "Thu, 6 Aug · 4,200 kg" is a wall you scroll rather than read.
 * A month heading with its session count and total volume gives the scroll
 * somewhere to stop, and answers the question people actually bring to a
 * training log — *how much did I do in July* — without anyone having to add up
 * rows by eye.
 */
export default function SessionsScreen() {
  const i18n = useI18n();
  const { lang } = useAppSettings();
  const vi = lang === 'vi';
  const { weight: wUnit } = useUnits();
  const wl = weightLabel(wUnit);
  const { data: sessions, isError, refetch, isRefetching } = useWorkoutSessions(DAYS);
  const del = useDeleteWorkoutSession();

  const confirmDelete = (id: string, date_time: string, label: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(i18n.nDeleteSession, i18n.nDeleteSessionMsg.replace('{x}', label), [
      { text: i18n.cancel, style: 'cancel' },
      {
        text: i18n.delete,
        style: 'destructive',
        onPress: () =>
          del.mutate(
            { id, date_time },
            {
              onSuccess: () => {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                toast.success(i18n.deleted);
              },
              onError: (e: Error) => toast.error(e.message),
            },
          ),
      },
    ]);
  };

  /*
    Grouped by the month the session happened in, locally.

    Keyed on `YYYY-MM` taken from `localDateStr` rather than on
    `getMonth()` of the raw timestamp — a session logged at 23:30 on the 31st
    belongs to the month it was in where the person was, which is the same rule
    the rest of the app files days under.
  */
  const months = useMemo(() => {
    const out: {
      key: string;
      label: string;
      rows: NonNullable<typeof sessions>;
      volume: number;
      /** the heaviest session in this month, for the row bars */
      peak: number;
    }[] = [];
    for (const s of sessions ?? []) {
      const at = new Date(s.date_time);
      const key = localDateStr(at).slice(0, 7);
      let group = out.find((g) => g.key === key);
      if (!group) {
        group = {
          key,
          label: at.toLocaleDateString(getLocale(lang), { month: 'long', year: 'numeric' }),
          rows: [],
          volume: 0,
          peak: 0,
        };
        out.push(group);
      }
      const v = Number(s.volume_load) || 0;
      group.rows.push(s);
      group.volume += v;
      group.peak = Math.max(group.peak, v);
    }
    return out;
  }, [sessions, lang]);

  return (
    <Screen back title={vi ? 'Buổi tập đã ghi' : 'Logged workouts'}>
      {/*
        A failed read is not an empty history.

        `sessions` comes back undefined when the query fails, `?? []` turns that
        into no months, and the screen then states — confidently, in the user's
        own language — that they have not trained in ninety days. Somebody who
        logged forty sessions reads that on a bad connection and has every
        reason to think the app lost them.

        So the failure is answered before the zero case, never instead of it:
        an empty history is still a real thing to say, just not this one.
      */}
      {isError ? (
        <LoadFailed i18n={i18n} onRetry={() => void refetch()} busy={isRefetching} />
      ) : months.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          /* Koa here: an empty session list is a state one button changes, and
             the button is right underneath. See `empty-state.tsx` for why the
             companion is not offered on the empties that only time can fill. */
          companion
          title={vi ? 'Chưa có buổi tập nào trong 90 ngày qua' : 'No workouts in the last 90 days'}
          action={{ label: i18n.nLogWorkoutBtn, onPress: () => router.push('/log-workout') }}
        />
      ) : (
        months.map((m, mi) => {
          /*
            How this month compares with the one before it.

            A heading reading `4 buổi · 48,200 kg` is a fact you have to carry
            in your head to the next heading before it means anything. "Am I
            doing more than I was" is the question people bring to a training
            log, and it is one subtraction the screen can do instead of them.

            ── two months are disqualified, and both would flatter or slander ──

            **This month**, when it is the current one: it is three days old on
            the third, so comparing it with a finished month reports every start
            of a month as a collapse.

            **The oldest group on screen**, always: the ninety-day window cuts
            through it, so it holds part of a month and the month before it
            would appear to have doubled. It is a truncation, not a training
            decision.

            `months` is newest-first, so the month *before* this one in time is
            the group after it in the array.
          */
          const older = months[mi + 1];
          const thisMonthIsRunning = m.key === localDateStr().slice(0, 7);
          const olderIsTruncated = mi + 1 === months.length - 1;
          const change =
            !thisMonthIsRunning && older && !olderIsTruncated && older.volume > 0
              ? Math.round(((m.volume - older.volume) / older.volume) * 100)
              : null;
          return (
            <View key={m.key} style={styles.month}>
              <View style={styles.monthHead}>
                <Text style={styles.monthName}>{m.label}</Text>
                <View style={styles.monthMetaRow}>
                  <Text style={styles.monthMeta}>
                    {m.rows.length} {vi ? 'buổi' : m.rows.length === 1 ? 'session' : 'sessions'}
                    {m.volume > 0
                      ? `  ·  ${Math.round(displayWeight(m.volume, wUnit)).toLocaleString()} ${wl}`
                      : ''}
                  </Text>
                  {change != null && change !== 0 ? (
                    <Text
                      style={[
                        styles.monthChange,
                        { color: change > 0 ? colors.readinessGreen : colors.mutedForeground },
                      ]}>
                      {change > 0 ? '↑' : '↓'} {Math.abs(change)}%{' '}
                      {vi ? 'so với tháng trước' : 'vs previous'}
                    </Text>
                  ) : null}
                </View>
              </View>
              <View style={sessionListStyles.group}>
                {m.rows.map((s, i) => (
                  <View key={s.id}>
                    {i > 0 ? <View style={sessionListStyles.sep} /> : null}
                    <SessionRow
                      session={s}
                      wUnit={wUnit}
                      lang={lang}
                      i18n={i18n}
                      onDelete={confirmDelete}
                      compactDate
                      volumeRatio={m.peak > 0 ? (Number(s.volume_load) || 0) / m.peak : undefined}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  month: { gap: spacing.sm },
  monthHead: { gap: 1 },
  monthName: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    color: colors.mutedForeground,
  },
  monthMeta: { fontSize: 11, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  monthMetaRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, flexWrap: 'wrap' },
  /* Green only when it went up — a month with less volume is a deload as often
     as it is a lapse, and colouring it red would call every planned easy month
     a failure. Down is simply muted. */
  monthChange: { fontSize: 11, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
