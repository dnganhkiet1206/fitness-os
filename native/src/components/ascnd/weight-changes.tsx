import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

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
  samples: WeightPoint[];
  /** the window's left edge in ms, so x can be time and not sample number */
  from: number;
  to: number;
}

const SPARK_W = 44;
const SPARK_H = 22;
const SPARK_PAD = 2;

/** `YYYY-MM-DD` at local midnight — the same parse the rest of the app uses */
const ms = (iso: string) => new Date(`${iso}T00:00:00`).getTime();

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
 * The polyline for one window — or `null` when there is nothing to draw.
 *
 * Three rules, all of them about not drawing things that are not true:
 *
 * - **x is time, not sample number.** Spacing points evenly puts two readings
 *   a day apart at the same distance as two ninety days apart, which is a
 *   different shape from the one that happened. Each point sits where its date
 *   falls in the window.
 * - **y is a scale shared by every row** (`lo`/`hi` from all the data the card
 *   has), so the rows are comparable. Fitting each row to its own min and max
 *   made a 0.1 kg wobble over three days look exactly like a 3 kg fall over
 *   ninety — the most misleading thing a sparkline can do.
 * - **fewer than two points draws no line.** One reading is a dot, none is
 *   nothing at all. The old version drew a flat line through the middle of the
 *   box whenever a window was empty, which is a picture of a weight that held
 *   steady — a claim about days that were never measured.
 */
function sparkPath(row: Row, lo: number, hi: number): string | null {
  if (row.samples.length < 2) return null;
  const span = hi - lo;
  const dur = row.to - row.from || 1;
  const y = (v: number) =>
    // no variation anywhere in the data: draw it level, in the middle
    span === 0
      ? SPARK_H / 2
      : SPARK_PAD + (SPARK_H - SPARK_PAD * 2) * (1 - (v - lo) / span);
  const x = (iso: string) =>
    Math.max(0, Math.min(1, (ms(iso) - row.from) / dur)) * SPARK_W;
  return row.samples
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join(' ');
}

/** The single reading a window has, as a dot — there is no line to draw. */
function sparkDot(row: Row, lo: number, hi: number): { cx: number; cy: number } | null {
  if (row.samples.length !== 1) return null;
  const p = row.samples[0];
  const span = hi - lo;
  const dur = row.to - row.from || 1;
  return {
    cx: Math.max(0, Math.min(1, (ms(p.date) - row.from) / dur)) * SPARK_W,
    cy:
      span === 0
        ? SPARK_H / 2
        : SPARK_PAD + (SPARK_H - SPARK_PAD * 2) * (1 - (p.value - lo) / span),
  };
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
  const now = Date.now();
  const rows: Row[] = WINDOWS.map((days) => {
    const samples = windowSamples(points, days);
    const delta =
      samples.length >= 2 ? samples[samples.length - 1].value - samples[0].value : 0;
    return {
      key: days == null ? 'all' : String(days),
      label: days == null ? i18n.nWcAllTime : i18n.nWcDays.replace('{n}', String(days)),
      delta,
      samples,
      // A fixed window spans its whole length even when the readings sit in one
      // corner of it — that gap is information: it says when you did not weigh
      // yourself. All-time starts at the first reading, because there is no
      // "before" to leave room for.
      from: days == null ? ms(points[0]?.date ?? '') : now - days * 86400000,
      to: now,
    };
  });

  /**
   * One vertical scale for every row, taken from all the data the card holds.
   *
   * This is what makes the sparklines comparable: the 3-day row and the
   * all-time row are drawn against the same kilograms, so a small change looks
   * small. Fitting each row to its own range — the obvious thing, and what this
   * did at first — made every row fill the box regardless of how much had
   * actually moved.
   */
  const allValues = points.map((p) => p.value);
  const lo = allValues.length ? Math.min(...allValues) : 0;
  const hi = allValues.length ? Math.max(...allValues) : 0;

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
        const d = sparkPath(r, lo, hi);
        const dot = sparkDot(r, lo, hi);
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            {/* Nothing measured in this window means nothing drawn — the box
                stays empty rather than showing a line that was never weighed. */}
            <Svg width={SPARK_W} height={SPARK_H} style={styles.spark}>
              {d ? (
                <Path
                  d={d}
                  stroke={flat ? colors.mutedForeground : tint}
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                  opacity={flat ? 0.6 : 1}
                />
              ) : null}
              {dot ? (
                <Circle cx={dot.cx} cy={dot.cy} r={2} fill={colors.mutedForeground} />
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
