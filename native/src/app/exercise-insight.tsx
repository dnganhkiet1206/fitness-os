import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { Activity, ChevronDown, Minus, TrendingDown, TrendingUp } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { EmptyState } from '@/components/ascnd/empty-state';
import { Expander } from '@/components/ascnd/expander';
import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { LineChart } from '@/components/ascnd/line-chart';
import { LoadFailed } from '@/components/ascnd/load-failed';
import { PressScale } from '@/components/ascnd/press-scale';
import { Screen } from '@/components/ascnd/screen';
import { Segmented, SegmentPanel } from '@/components/ascnd/segmented';
import { colors, radius, spacing, type } from '@/constants/ascnd';
import { useI18n } from '@/hooks/use-app-settings';
import { INSIGHT_DAYS, useExerciseInsights } from '@/hooks/use-exercise-insights';
import { useRoutineDays, useWorkoutTemplates } from '@/hooks/use-library';
import { useUnits } from '@/hooks/use-units';
import { planKeys, type PlanScope } from '@/lib/plan-exercises';
import type { ExerciseInsight, Trend } from '@/lib/exercise-trend';
import { MIN_SESSIONS } from '@/lib/exercise-trend';
import type { NativeStrings } from '@/lib/native-strings';
import { displayWeight, weightLabel, type WeightUnit } from '@/lib/units';

/**
 * Exercise Intelligence, as something you can read at a glance.
 *
 * ── what the first build got wrong, measured ──
 *
 * Each card was 280pt tall, so two and a half of six fitted on the screen, and
 * every one of them ended in four to six grey lines of the same size and
 * colour. Three specific faults, all visible in a screenshot:
 *
 *   · **A footnote printed four times.** "An estimate from your best set, not a
 *     max you have lifted" appeared on every card that had an estimate. It is
 *     true, it is worth saying, and it is worth saying once — it now sits at
 *     the bottom of the screen.
 *   · **The series repeated its own constants.** `50 kg × 10 · 50 kg × 3 ·
 *     50 kg × 9 · 50 kg × 5` spends most of its width on the part that did not
 *     change. The part that did — 10, 3, 9, 5 — is what somebody is looking
 *     for, and it was the least visible thing in the line.
 *   · **The strongest position held the weakest line.** "Keep as is", bold,
 *     bottom-left: the readiness verdict, which is the one thing on the card
 *     that only matters once you have already read everything else.
 *
 * ── what replaces it ──
 *
 * A card answers one question at rest — *which way is this going* — with a
 * name, a shape and a number. Everything that was a grey line is behind a tap,
 * which is the ordinary way to keep a summary a summary: defer what is only
 * relevant once somebody has decided to look closer.
 *
 * The shape is a sparkline of the index the verdict was computed from, so the
 * picture and the verdict cannot disagree. `LineChart` already draws these at
 * 90pt on the biometrics screen, and its own note says a sparkline is for when
 * "the only question is which way the line is going" — which is this question
 * exactly.
 *
 * ── and it is grouped ──
 *
 * Six cards in verdict order is still six cards. Under two headings — the ones
 * worth a look, and the ones going well — the screen answers "is anything
 * wrong" before you have read a single number.
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
 * Which of the three groups a movement belongs in.
 *
 * "Worth a look" is not the same as "bad". A movement that has plateaued, gone
 * backwards, been dropped, or whose sessions disagree with each other are four
 * different situations with one thing in common: the card is telling you
 * something you did not already know.
 */
type Group = 'attention' | 'fine' | 'thin';
const groupOf = (i: ExerciseInsight): Group => {
  if (i.trend === 'INSUFFICIENT_DATA') return 'thin';
  if (i.trend === 'DECLINING' || i.trend === 'PLATEAU') return 'attention';
  if (i.stale || i.evidence.some((e) => e.kind === 'volatile')) return 'attention';
  return 'fine';
};

/**
 * One session's best set, with the part that never changes factored out.
 *
 * Returns the constant prefix separately when every session in the window used
 * the same load, which on a rep-progression block is most of them. `55 kg → 7 ·
 * 8 · 8 · 9 · 9 · 10` says the same thing as six copies of "55 kg × n" in a
 * fifth of the width, and puts the varying number where the eye lands.
 */
function seriesText(
  values: { weightKg: number | null; reps: number | null; durationSec: number | null; bodyweightKg: number | null }[],
  u: WeightUnit,
): { prefix: string | null; parts: string[] } {
  const kg = (n: number) => `${Math.round(displayWeight(n, u) * 10) / 10} ${weightLabel(u)}`;

  if (values.every((v) => v.durationSec !== null && v.reps === null)) {
    return { prefix: null, parts: values.map((v) => `${Math.round(v.durationSec!)}s`) };
  }

  const loads = values.map((v) => (v.bodyweightKg ?? 0) + (v.weightKg ?? 0));
  const same = loads.every((l) => Math.abs(l - loads[0]) < 0.05);
  if (same && loads[0] > 0 && values.every((v) => v.reps !== null)) {
    return { prefix: kg(loads[0]), parts: values.map((v) => String(v.reps)) };
  }
  return {
    prefix: null,
    parts: values.map((v) =>
      v.reps === null
        ? '—'
        : (v.bodyweightKg ?? 0) + (v.weightKg ?? 0) > 0
          ? `${kg((v.bodyweightKg ?? 0) + (v.weightKg ?? 0))} × ${v.reps}`
          : `${v.reps}`,
    ),
  };
}

function Card({ i, i18n, u }: { i: ExerciseInsight; i18n: NativeStrings; u: WeightUnit }) {
  const [open, setOpen] = useState(false);

  const sets = i.evidence.find((e) => e.kind === 'best-sets');
  const index = i.evidence.find((e) => e.kind === 'series');
  const change = i.evidence.find((e) => e.kind === 'change');
  const flat = i.evidence.find((e) => e.kind === 'no-upward-trend');
  const last = i.evidence.find((e) => e.kind === 'last-trained');
  const volatile = i.evidence.find((e) => e.kind === 'volatile');
  const win = i.evidence.find((e) => e.kind === 'window-best');
  const thin = i.evidence.find((e) => e.kind === 'too-few-sessions');
  const bwUnknown = i.evidence.some((e) => e.kind === 'bodyweight-unknown');

  const kg1 = (n: number) => Math.round(displayWeight(n, u) * 10) / 10;
  const tint = TREND_COLOR[i.trend];

  /* The headline: the best set, in the shortest true form. */
  const headline = (() => {
    if (i.bestDurationSec !== null && i.bestReps === null) return `${Math.round(i.bestDurationSec)}s`;
    if (i.bestReps === null) return '—';
    const bw = sets && sets.kind === 'best-sets' ? sets.values[sets.values.length - 1]?.bodyweightKg : null;
    const load = (bw ?? 0) + (i.bestWeightKg ?? 0);
    if (load <= 0) return `${i.bestReps}`;
    return `${kg1(load)} ${weightLabel(u)} × ${i.bestReps}`;
  })();

  const pct = change && change.kind === 'change' ? Math.round(change.pct * 100) : null;

  /*
    Drawn from the INDEX, on the sessions' own dates.

    The index because it is what the verdict was computed from, so the picture
    and the words cannot disagree. The real dates because `LineChart` lays out
    by time — three sessions in a week and one six weeks later is a shape, and
    even spacing erases it.

    The first version passed `'00'`, `'01'`, `'02'` as dates. The chart parses
    `` `${date}T00:00:00` ``, all of those are `NaN`, and it fell back to even
    spacing without saying so. The chart looked fine and was laid out for a
    reason that was not true.
  */
  const spark = useMemo(
    () =>
      index && index.kind === 'series'
        ? index.values.map((v, n) => ({ date: index.dates[n] ?? '', value: v }))
        : [],
    [index],
  );

  const series = sets && sets.kind === 'best-sets' ? seriesText(sets.values, u) : null;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${i.exerciseName} — ${i18n[`nXiTrend${i.trend}` as keyof NativeStrings] as string}`}
      onPress={() => {
        Haptics.selectionAsync();
        setOpen((v) => !v);
      }}>
      <GlassCard style={styles.card}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.name} numberOfLines={1}>{i.exerciseName}</Text>
            {/*
              One muted line where there used to be three. Kind, how many
              sessions, and how long ago — the context you need to decide
              whether the number above is worth anything.
            */}
            <Text style={styles.meta} numberOfLines={1}>
              {i18n[`nXiKind${i.kind}` as keyof NativeStrings] as string}
              {'  ·  '}
              {i.sessions === 1 ? i18n.nXiOneSession : i18n.nXiSessions.replace('{n}', String(i.sessions))}
              {/* The short form. "Last trained 75 days ago" is the third thing
                  on a one-line meta row and was the part that got truncated —
                  losing the number, which is the only part of it that varies. */}
              {last && last.kind === 'last-trained'
                ? `  ·  ${last.days === 0 ? i18n.nXiLastToday : i18n.nXiAgoShort.replace('{n}', String(last.days))}`
                : ''}
            </Text>
          </View>
          <View style={[styles.chip, { borderColor: tint }]}>
            <Icon icon={TREND_ICON[i.trend]} size={12} color={tint} />
            <Text style={[styles.chipText, { color: tint }]}>
              {i18n[`nXiTrend${i.trend}` as keyof NativeStrings] as string}
            </Text>
          </View>
        </View>

        <View style={styles.figures}>
          <View style={styles.headlineWrap}>
            <Text style={styles.headline} numberOfLines={1}>{headline}</Text>
            {pct !== null ? (
              <Text style={[styles.delta, { color: pct === 0 ? colors.mutedForeground : tint }]}>
                {pct > 0 ? '↑' : pct < 0 ? '↓' : '='}
                {Math.abs(pct)}%
              </Text>
            ) : null}
          </View>
          {spark.length >= 2 ? (
            <View style={styles.spark} pointerEvents="none">
              {/* No label row. The series is an internal index — for a
                  bodyweight movement it is body mass times reps — and printing
                  its extremes put "572" under a pull-up, which reads as a load.
                  A sparkline here answers one question and the numbers are
                  behind the tap. */}
              <LineChart points={spark} color={tint} height={46} labels={false} />
            </View>
          ) : null}
        </View>

        {/* The one line that changes what somebody should do with this card. */}
        {volatile && volatile.kind === 'volatile' ? (
          <Text style={styles.warn} numberOfLines={2}>
            {i18n.nXiVolatile.replace('{p}', String(Math.round(volatile.spread * 100)))}
          </Text>
        ) : last && last.kind === 'last-trained' && last.stale ? (
          <Text style={styles.warn} numberOfLines={2}>{i18n.nXiStale}</Text>
        ) : null}

        <Expander open={open}>
          <View style={styles.detail}>
            {series && series.parts.length > 0 ? (
              <View style={styles.block}>
                <Text style={styles.label}>{i18n.nXiEvidence}</Text>
                <Text style={styles.values}>
                  {series.prefix ? `${series.prefix}  →  ` : ''}
                  {series.parts.join('  ·  ')}
                </Text>
              </View>
            ) : null}

            {win && win.kind === 'window-best' ? (
              <Text style={styles.best}>
                {win.of === 'weight'
                  ? i18n.nXiWindowWeight
                      .replace('{v}', String(kg1(win.value)))
                      .replace('{unit}', weightLabel(u))
                      .replace('{prev}', String(kg1(win.previous)))
                  : (win.atWeightKg ?? 0) > 0
                    ? i18n.nXiWindowReps
                        .replace('{v}', String(win.value))
                        .replace('{w}', String(kg1(win.atWeightKg!)))
                        .replace('{unit}', weightLabel(u))
                        .replace('{prev}', String(win.previous))
                    : i18n.nXiWindowRepsBody
                        .replace('{v}', String(win.value))
                        .replace('{prev}', String(win.previous))}
                {win.daysAgo !== null ? `  ·  ${i18n.nXiWindowAgo.replace('{n}', String(win.daysAgo))}` : ''}
              </Text>
            ) : null}

            {flat && flat.kind === 'no-upward-trend' ? (
              <Text style={styles.note}>{i18n.nXiNoUpward.replace('{n}', String(flat.sessions))}</Text>
            ) : null}
            {thin ? <Text style={styles.note}>{i18n.nXiNeedMore.replace('{n}', String(MIN_SESSIONS))}</Text> : null}
            {bwUnknown ? <Text style={styles.note}>{i18n.nXiBodyweightUnknown}</Text> : null}

            <View style={styles.foot}>
              <Text style={styles.ready}>
                {i18n[`nXiReady${i.readiness}` as keyof NativeStrings] as string}
              </Text>
              <View style={styles.footRight}>
                {i.bestE1rmKg !== null ? (
                  <Text style={styles.e1rm}>
                    {i18n.nXiE1rm} {Math.round(displayWeight(i.bestE1rmKg, u))} {weightLabel(u)}
                  </Text>
                ) : null}
                <Text style={styles.conf}>
                  {i18n.nXiConf.replace(
                    '{c}',
                    i18n[`nXiConf${i.confidence}` as keyof NativeStrings] as string,
                  )}
                </Text>
              </View>
            </View>
          </View>
        </Expander>

        {/* A chevron rather than a word: the affordance has to be visible, and a
            button labelled "Details" on every card is six of them. */}
        <View style={[styles.more, open && styles.flip]}>
          <Icon icon={ChevronDown} size={14} color={colors.mutedForeground} />
        </View>
      </GlassCard>
    </PressScale>
  );
}

export default function ExerciseInsightScreen() {
  const i18n = useI18n();
  const { weight: u } = useUnits();
  const { insights, loading, failed } = useExerciseInsights();
  const { ex } = useLocalSearchParams<{ ex?: string }>();
  const days = useRoutineDays();
  const templates = useWorkoutTemplates();

  /*
    Scoped to the plan, because the plan is what the person is training.

    Ninety days of logging on a routine with twelve exercises a day is sixty
    cards, and at that size the screen stops answering "how is my bench going"
    and becomes a catalogue to search. `routine_days` already says which
    template runs on which weekday — a list nobody maintains, never out of date,
    and "today" is about a dozen.

    Defaults to the week rather than to today: a movement trained on Mondays is
    still the thing somebody wants to look at on a Wednesday, and a default that
    is empty five days out of seven is a default that teaches people the screen
    is broken.
  */
  const [scope, setScope] = useState<PlanScope>('week');

  const keys = useMemo(
    () => planKeys(scope, days.data ?? [], templates.data ?? []),
    [scope, days.data, templates.data],
  );

  /*
    A chip on a plan row sends you here with one exercise named. Filtering to it
    is the whole point — arriving at a list of sixty and being told to find it
    again is the journey this was meant to remove.
  */
  const single = typeof ex === 'string' && ex.length > 0 ? ex : null;

  const shown = useMemo(() => {
    if (single) return insights.filter((i) => i.exerciseKey === single);
    if (keys === null) return insights;
    return insights.filter((i) => keys.has(i.exerciseKey));
  }, [insights, keys, single]);

  const groups = useMemo(() => {
    const out: Record<Group, ExerciseInsight[]> = { attention: [], fine: [], thin: [] };
    for (const i of shown) out[groupOf(i)].push(i);
    return out;
  }, [shown]);

  const heading: Record<Group, string> = {
    attention: i18n.nXiNeedsAttention,
    fine: i18n.nXiGoingWell,
    thin: i18n.nXiNotYet,
  };

  return (
    <Screen refreshable back title={i18n.nXiTitle}>
      {failed ? (
        <LoadFailed i18n={i18n} />
      ) : loading ? null : insights.length === 0 ? (
        <EmptyState icon={Activity} title={i18n.nXiEmpty} hint={i18n.nXiEmptyHint} />
      ) : (
        <>
          {single ? (
            /* Arrived from a plan row. One exercise, and a way back to the rest
               — not a filter somebody has to work out how to clear. */
            <View style={styles.singleRow}>
              <Text style={styles.summary}>{i18n.nXiOnly}</Text>
              <PressScale
                accessibilityRole="button"
                accessibilityLabel={i18n.nXiShowAll}
                hitSlop={8}
                onPress={() => {
                  Haptics.selectionAsync();
                  router.setParams({ ex: '' });
                }}>
                <Text style={styles.showAll}>{i18n.nXiShowAll}</Text>
              </PressScale>
            </View>
          ) : (
            <>
              <Segmented
                value={scope}
                onChange={setScope}
                compact
                options={[
                  { key: 'today' as const, label: i18n.nXiScopeToday },
                  { key: 'week' as const, label: i18n.nXiScopeWeek },
                  { key: 'all' as const, label: i18n.nXiScopeAll },
                ]}
              />
              {/* The answer to "is anything wrong", before a single number. */}
              <Text style={styles.summary}>
                {i18n.nXiSummary
                  .replace('{a}', String(groups.fine.length))
                  .replace('{b}', String(groups.attention.length))}
              </Text>
            </>
          )}

          {/* An empty scope is not an empty history, and saying "no exercises
              logged" here would be a statement about their training rather than
              about their plan. */}
          {shown.length === 0 ? (
            <GlassCard>
              <Text style={styles.emptyScope}>
                {scope === 'today' ? i18n.nXiScopeEmptyToday : i18n.nXiScopeEmptyWeek}
              </Text>
              <Text style={styles.note}>{i18n.nXiScopeHint}</Text>
            </GlassCard>
          ) : null}

          {/*
            The list is this control's panel, so it fades when the scope
            changes rather than cutting. `tools/segmented.mjs` caught this
            missing — the rule I wrote three rounds ago, on the screen I was
            adding the control to.
          */}
          <SegmentPanel segment={single ? `one:${single}` : scope}>
          {(['attention', 'fine', 'thin'] as const).map((g) =>
            groups[g].length === 0 ? null : (
              <View key={g} style={styles.group}>
                <Text style={styles.groupTitle}>{heading[g]}</Text>
                {groups[g].map((i) => (
                  <Card key={i.exerciseKey} i={i} i18n={i18n} u={u} />
                ))}
              </View>
            ),
          )}
          </SegmentPanel>

          {/* Said once. It was on every card that had an estimate — four times
              on this screen, in a grey the same size as everything else. */}
          <Text style={styles.footnote}>{i18n.nXiFootnote}</Text>
          <Text style={styles.window}>{`${INSIGHT_DAYS}d`}</Text>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  summary: { ...type.footnote, color: colors.mutedForeground },
  singleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  showAll: { ...type.footnote, color: colors.primary, fontWeight: '700' },
  emptyScope: { ...type.body, color: colors.foreground, fontWeight: '700' },
  group: { gap: spacing.sm },
  groupTitle: {
    ...type.caption,
    color: colors.mutedForeground,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  name: { ...type.headline, color: colors.foreground },
  meta: { ...type.caption, color: colors.mutedForeground },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
  },
  chipText: { ...type.caption, fontWeight: '700' },
  figures: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  headlineWrap: { flex: 1, minWidth: 0, gap: 2 },
  headline: { ...type.title2, color: colors.foreground, fontVariant: ['tabular-nums'] },
  delta: { ...type.footnote, fontWeight: '700', fontVariant: ['tabular-nums'] },
  /* Half the row, so the number and the shape are read as one statement rather
     than as a figure with a decoration beside it. */
  spark: { width: '46%' },
  warn: { ...type.caption, color: colors.readinessYellow },
  detail: { gap: spacing.sm, paddingTop: spacing.sm },
  block: { gap: 3 },
  label: { ...type.caption, color: colors.mutedForeground },
  values: { ...type.footnote, color: colors.foreground, fontVariant: ['tabular-nums'] },
  best: { ...type.footnote, color: colors.readinessGreen, fontWeight: '700' },
  note: { ...type.caption, color: colors.mutedForeground },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  footRight: { alignItems: 'flex-end', gap: 2 },
  ready: { ...type.footnote, color: colors.foreground, fontWeight: '700' },
  e1rm: { ...type.caption, color: colors.mutedForeground, fontVariant: ['tabular-nums'] },
  conf: { ...type.caption, color: colors.mutedForeground },
  more: { alignItems: 'center' },
  flip: { transform: [{ rotate: '180deg' }] },
  footnote: { ...type.caption, color: colors.mutedForeground },
  window: { ...type.caption, color: colors.mutedForeground, textAlign: 'center' },
});
