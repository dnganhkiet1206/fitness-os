import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { colors, spacing, type } from '@/constants/ascnd';
import type { useI18n } from '@/hooks/use-app-settings';

/**
 * How the weight has moved, over each window that matters.
 *
 * The chart above answers "what shape is the trend"; it does not answer "am I
 * up or down this week", which is the question people actually weigh
 * themselves for. Reading it off a 90-day line is guesswork. This is the same
 * data as six subtractions.
 *
 * ── the windows ──
 *
 * 3 / 7 / 14 / 30 / 90 days and all time. Short windows are mostly noise —
 * water, salt, time of day — and long ones are the real signal; showing them
 * together is what makes that visible, because a 0.0 over three days beside a
 * −2.4 over ninety says "the noise is noise" better than any explanation.
 *
 * ── what a window's number means ──
 *
 * The **first and last samples inside the window**, subtracted. Not "today
 * minus the reading nearest 7 days ago", which invents a comparison against a
 * day that may have no reading at all. A window with fewer than two readings
 * has nothing to compare and reads 0.0 / no change — which is honest: nothing
 * was measured, so nothing is known to have moved.
 *
 * ── the colour ──
 *
 * Up is not bad and down is not good; it depends on what the person is doing.
 * The trend takes its colour from `goal` — green when the weight is moving the
 * way they asked for, amber when it is moving against, and neutral when there
 * is no goal set or nothing changed. The same rule the tiles above already use.
 */

/** windows in days; `null` is all time */
const WINDOWS: (number | null)[] = [3, 7, 14, 30, 90, null];

/** below this a change is a rounding artefact, not a change (in the display unit) */
const EPSILON = 0.05;

export interface WeightPoint {
  date: string;
  value: number;
}

interface Row {
  key: string;
  label: string;
  delta: number;
  /** how many readings the window holds — under two, there is nothing to draw */
  count: number;
}

const SPARK_W = 44;
const SPARK_H = 22;
const SPARK_PAD = 3;

/**
 * A window's samples, oldest first.
 *
 * Dates are `YYYY-MM-DD`, so a string compare is a date compare and there is no
 * need to parse anything — and no timezone to get wrong.
 */
function windowSamples(points: WeightPoint[], days: number | null): WeightPoint[] {
  if (days == null) return points;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= iso);
}

/**
 * One straight stroke saying which way the window went.
 *
 * At the user's direction this is not a plot of every reading — it is a glyph
 * for the row's own number: **up if the weight rose, down if it fell, level if
 * it held.** At 44×22 a real time-series is a smudge anyway, and the row
 * already prints the exact figure beside it; what the eye wants from the box
 * is the direction.
 *
 * The one thing it still owes the data is **proportion**. The stroke's rise is
 * scaled by this row's change against the largest change on the card, so the
 * biggest mover spans the box and a tenth of that leans a tenth as far. A
 * fixed 45° for every row would say every window moved the same amount.
 *
 * `null` when the window holds fewer than two readings: nothing was measured,
 * so there is no direction to claim. That is the case that used to draw a flat
 * line through the middle — a picture of a steady weight on days nobody
 * weighed themselves.
 */
function sparkLine(row: Row, maxDelta: number): { x1: number; y1: number; x2: number; y2: number } | null {
  if (row.count < 2) return null;
  const mid = SPARK_H / 2;
  const reach = (SPARK_H - SPARK_PAD * 2) / 2;
  // share of the biggest change on the card, 0..1
  const frac = maxDelta > 0 ? Math.min(1, Math.abs(row.delta) / maxDelta) : 0;
  const rise = reach * frac;
  const dir = row.delta > EPSILON ? -1 : row.delta < -EPSILON ? 1 : 0;
  // dir is -1 for a rise because SVG y grows downwards
  return { x1: SPARK_PAD, y1: mid - dir * rise, x2: SPARK_W - SPARK_PAD, y2: mid + dir * rise };
}

export function WeightChanges({
  points,
  unit,
  goal,
  i18n,
}: {
  /** every weigh-in, oldest first, already in the user's display unit */
  points: WeightPoint[];
  /** "kg" / "lb", for the number beside each row */
  unit: string;
  /** what the person is aiming at, so a rise can be read as good or bad */
  goal?: string | null;
  i18n: ReturnType<typeof useI18n>;
}) {
  const rows: Row[] = WINDOWS.map((days) => {
    const samples = windowSamples(points, days);
    const delta =
      samples.length >= 2 ? samples[samples.length - 1].value - samples[0].value : 0;
    return {
      key: days == null ? 'all' : String(days),
      label: days == null ? i18n.nWcAllTime : i18n.nWcDays.replace('{n}', String(days)),
      delta,
      count: samples.length,
    };
  });

  /**
   * The biggest move on the card, which every stroke is drawn against.
   *
   * One scale for all six rows is what keeps them comparable: the row that
   * moved most spans its box, and a row that moved a tenth as much leans a
   * tenth as far. Scaling each row to itself would have every stroke at the
   * same angle and say nothing.
   */
  const maxDelta = Math.max(...rows.map((r) => Math.abs(r.delta)), 0);

  if (points.length === 0) {
    return (
      <GlassCard style={styles.card}>
        <Text style={styles.title}>{i18n.nWeightChanges}</Text>
        <Text style={styles.empty}>{i18n.nWcNoData}</Text>
      </GlassCard>
    );
  }

  return (
    <GlassCard style={styles.card}>
      <Text style={styles.title}>{i18n.nWeightChanges}</Text>
      {rows.map((r) => {
        const up = r.delta > EPSILON;
        const down = r.delta < -EPSILON;
        const flat = !up && !down;
        // moving the way they asked for?
        const good = (goal === 'bulk' && up) || (goal === 'cut' && down);
        const bad = (goal === 'bulk' && down) || (goal === 'cut' && up);
        const tint = flat
          ? colors.mutedForeground
          : good
            ? colors.readinessGreen
            : bad
              ? colors.metricOrange
              : colors.metricBlue;
        const stroke = sparkLine(r, maxDelta);
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            {/* One stroke: up if it rose, down if it fell, level if it held —
                and nothing at all when the window holds under two readings,
                because then there is no direction to claim. */}
            <Svg width={SPARK_W} height={SPARK_H} style={styles.spark}>
              {stroke ? (
                <Line
                  x1={stroke.x1}
                  y1={stroke.y1}
                  x2={stroke.x2}
                  y2={stroke.y2}
                  stroke={tint}
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={flat ? 0.6 : 1}
                />
              ) : null}
            </Svg>
            <Text style={styles.rowValue}>
              {Math.abs(r.delta).toFixed(1)} {unit}
            </Text>
            <View style={styles.trend}>
              <Icon
                icon={up ? ArrowUpRight : down ? ArrowDownRight : ArrowRight}
                size={15}
                color={tint}
              />
              <Text style={[styles.trendText, { color: tint }]} numberOfLines={1}>
                {flat ? i18n.nWcNoChange : up ? i18n.nWcIncrease : i18n.nWcDecrease}
              </Text>
            </View>
          </View>
        );
      })}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.xs },
  title: { ...type.headline, color: colors.foreground, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  rowLabel: { ...type.footnote, color: colors.mutedForeground, width: 58 },
  spark: { opacity: 0.9 },
  rowValue: {
    ...type.footnote,
    color: colors.foreground,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
    textAlign: 'right',
  },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 104 },
  trendText: { ...type.footnote, fontWeight: '600' },
  empty: { ...type.footnote, color: colors.mutedForeground, paddingVertical: spacing.md },
});
