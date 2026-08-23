import { TrendingDown, TrendingUp, Minus, Activity } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { Screen } from '@/components/ascnd/screen';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { INSIGHT_DAYS, useExerciseInsights } from '@/hooks/use-exercise-insights';
import { useUnits } from '@/hooks/use-units';
import type { ExerciseInsight, Trend } from '@/lib/exercise-trend';
import { MIN_SESSIONS } from '@/lib/exercise-trend';
import type { NativeStrings } from '@/lib/native-strings';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

/**
 * Exercise Intelligence, made visible.
 *
 * ── this is a proof, not a dashboard ──
 *
 * The engine in `lib/exercise-trend.ts` produces structured facts and no
 * sentences, deliberately: it does not know whether the reader wants kilograms
 * or pounds, and it does not know which of two languages they read in. Both of
 * those decisions live here, which is the whole reason the split exists.
 *
 * So this screen's job is to show that the engine works on real logged data —
 * one row per movement, the verdict, and the numbers it was reached from. It is
 * not the Progress Centre; that is a later phase, and building it now would
 * have meant designing a screen around an engine nobody had watched run yet.
 *
 * ── the evidence is on the card ──
 *
 * Every verdict shows the series it came from. A card that says "Plateau" and
 * nothing else is an app asserting something about somebody's training; a card
 * that says "Plateau — 8 / 8 / 9 / 8" is showing them their own logbook and
 * letting them agree with it. `exercise-trend.ts` carries the numbers all the
 * way here for exactly this.
 */

const TREND_ICON: Record<Trend, typeof TrendingUp> = {
  IMPROVING: TrendingUp,
  DECLINING: TrendingDown,
  PLATEAU: Minus,
  STABLE: Minus,
  INSUFFICIENT_DATA: Activity,
};

const TREND_COLOR: Record<Trend, string> = {
  IMPROVING: colors.readinessGreen,
  DECLINING: colors.readinessRed,
  PLATEAU: colors.readinessYellow,
  STABLE: colors.mutedForeground,
  INSUFFICIENT_DATA: colors.mutedForeground,
};

/**
 * One session's best set, written the way the person wrote it down.
 *
 * ── not the index ──
 *
 * The engine's own series is what the verdict was computed from, and for a
 * bodyweight movement that is body-times-reps: a pull-up history that renders
 * as "655 · 582 · 582" with a kilogram label on it. It shipped that way for one
 * build, and it is tonnage wearing a weight's unit — a number nobody's logbook
 * contains, presented as though it were a load.
 *
 * This is the readable half, which the engine now carries alongside. The
 * bodyweight is printed with it, because otherwise a card can say "9 ×
 * bodyweight" and "Est. 1RM 95 kg" with nothing on it connecting the two.
 */
function setText(
  v: { weightKg: number | null; reps: number | null; durationSec: number | null; bodyweightKg: number | null },
  u: WeightUnit,
  i18n: NativeStrings,
): string {
  if (v.durationSec !== null && v.reps === null) return `${Math.round(v.durationSec)}s`;
  if (v.reps === null) return '—';
  const kg = (n: number) => Math.round(displayWeight(n, u) * 10) / 10;
  if (v.bodyweightKg !== null) {
    const total = v.bodyweightKg + (v.weightKg ?? 0);
    return `${v.reps} × ${kg(total)} ${weightLabel(u)}`;
  }
  if ((v.weightKg ?? 0) <= 0) return `${v.reps} × ${i18n.nRdBodyweight.toLowerCase()}`;
  return `${kg(v.weightKg!)} ${weightLabel(u)} × ${v.reps}`;
}

function Row({ i, i18n, u }: { i: ExerciseInsight; i18n: NativeStrings; u: WeightUnit }) {
  const series = i.evidence.find((e) => e.kind === 'best-sets');
  const change = i.evidence.find((e) => e.kind === 'change');
  const flat = i.evidence.find((e) => e.kind === 'no-upward-trend');
  const bwUnknown = i.evidence.some((e) => e.kind === 'bodyweight-unknown');
  const thin = i.evidence.find((e) => e.kind === 'too-few-sessions');

  const changeLine =
    change && change.kind === 'change'
      ? (Math.abs(change.pct) < 0.005
          ? i18n.nXiChangeFlat
          : (change.pct > 0 ? i18n.nXiChangeUp : i18n.nXiChangeDown).replace(
              '{p}',
              String(Math.abs(Math.round(change.pct * 100))),
            ))
      : null;

  return (
    <GlassCard style={styles.card}>
      <View style={styles.head}>
        <View style={styles.headText}>
          <Text style={styles.name} numberOfLines={1}>{i.exerciseName}</Text>
          <Text style={styles.kind}>
            {i18n[`nXiKind${i.kind}` as keyof NativeStrings] as string}
            {'  ·  '}
            {i.sessions === 1
              ? i18n.nXiOneSession
              : i18n.nXiSessions.replace('{n}', String(i.sessions))}
          </Text>
        </View>
        <View style={[styles.trendPill, { borderColor: TREND_COLOR[i.trend] }]}>
          <Icon icon={TREND_ICON[i.trend]} size={13} color={TREND_COLOR[i.trend]} />
          <Text style={[styles.trendText, { color: TREND_COLOR[i.trend] }]}>
            {i18n[`nXiTrend${i.trend}` as keyof NativeStrings] as string}
          </Text>
        </View>
      </View>

      {/* The best set, and — only where it means something — the estimate. */}
      <View style={styles.numbers}>
        {i.bestWeightKg !== null && i.bestReps !== null ? (
          <View style={styles.num}>
            <Text style={styles.numLabel}>{i18n.nXiBest}</Text>
            <Text style={styles.numValue}>
              {setText(
                {
                  weightKg: i.bestWeightKg,
                  reps: i.bestReps,
                  durationSec: null,
                  bodyweightKg:
                    i.kind === 'bodyweight'
                      ? (series && series.kind === 'best-sets'
                          ? series.values[series.values.length - 1]?.bodyweightKg ?? null
                          : null)
                      : null,
                },
                u,
                i18n,
              )}
            </Text>
          </View>
        ) : null}
        {i.bestDurationSec !== null ? (
          <View style={styles.num}>
            <Text style={styles.numLabel}>{i18n.nXiBest}</Text>
            <Text style={styles.numValue}>{Math.round(i.bestDurationSec)}s</Text>
          </View>
        ) : null}
        {i.bestE1rmKg !== null ? (
          <View style={styles.num}>
            <Text style={styles.numLabel}>{i18n.nXiE1rm}</Text>
            <Text style={styles.numValue}>
              {Math.round(displayWeight(i.bestE1rmKg, u))} {weightLabel(u)}
            </Text>
          </View>
        ) : null}
      </View>

      {changeLine ? <Text style={styles.change}>{changeLine}</Text> : null}

      {/* The logbook the verdict was read out of. */}
      {series && series.kind === 'best-sets' && series.values.length > 0 ? (
        <View style={styles.evidence}>
          <Text style={styles.evidenceLabel}>{i18n.nXiEvidence}</Text>
          <Text style={styles.evidenceValues}>
            {series.values.map((v) => setText(v, u, i18n)).join('  ·  ')}
          </Text>
        </View>
      ) : null}

      {flat && flat.kind === 'no-upward-trend' ? (
        <Text style={styles.note}>{i18n.nXiNoUpward.replace('{n}', String(flat.sessions))}</Text>
      ) : null}
      {thin && thin.kind === 'too-few-sessions' ? (
        <Text style={styles.note}>{i18n.nXiNeedMore.replace('{n}', String(MIN_SESSIONS))}</Text>
      ) : null}
      {bwUnknown ? <Text style={styles.note}>{i18n.nXiBodyweightUnknown}</Text> : null}
      {i.bestE1rmKg !== null ? <Text style={styles.note}>{i18n.nXiE1rmNote}</Text> : null}

      <View style={styles.foot}>
        <Text style={styles.ready}>
          {i18n[`nXiReady${i.readiness}` as keyof NativeStrings] as string}
        </Text>
        <Text style={styles.conf}>
          {i18n.nXiConf.replace(
            '{c}',
            i18n[`nXiConf${i.confidence}` as keyof NativeStrings] as string,
          )}
        </Text>
      </View>
    </GlassCard>
  );
}

export default function ExerciseInsightScreen() {
  const i18n = useI18n();
  const { weight: u } = useUnits();
  const { insights, loading, failed } = useExerciseInsights();

  return (
    <Screen back title={i18n.nXiTitle}>
      <Text style={styles.subtitle}>{i18n.nXiSubtitle}</Text>

      {failed ? (
        /* A failed read and an empty history say different things, and telling
           somebody their training is missing when the network hiccuped is the
           worse of the two mistakes. `empty-vs-failed.mjs` guards this. */
        <LoadFailed i18n={i18n} />
      ) : loading ? null : insights.length === 0 ? (
        <EmptyState icon={Activity} title={i18n.nXiEmpty} hint={i18n.nXiEmptyHint} />
      ) : (
        insights.map((i) => <Row key={i.exerciseKey} i={i} i18n={i18n} u={u} />)
      )}

      {insights.length > 0 ? (
        <Text style={styles.window}>{`${INSIGHT_DAYS}d`}</Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { ...type.footnote, color: colors.mutedForeground },
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.headline, color: colors.foreground },
  kind: { ...type.caption, color: colors.mutedForeground },
  trendPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  trendText: { ...type.caption, fontWeight: '700' },
  numbers: { flexDirection: 'row', gap: spacing.lg, flexWrap: 'wrap' },
  num: { gap: 2 },
  numLabel: { ...type.caption, color: colors.mutedForeground },
  numValue: { ...type.body, color: colors.foreground, fontWeight: '700', fontVariant: ['tabular-nums'] },
  change: { ...type.footnote, color: colors.foreground },
  evidence: { gap: 3 },
  evidenceLabel: { ...type.caption, color: colors.mutedForeground },
  evidenceValues: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  note: { ...type.caption, color: colors.mutedForeground },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  ready: { ...type.footnote, color: colors.foreground, fontWeight: '700' },
  conf: { ...type.caption, color: colors.mutedForeground },
  window: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
});
