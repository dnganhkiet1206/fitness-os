import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

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
  samples: number[];
}

/**
 * A window's samples, oldest first.
 *
 * Dates are `YYYY-MM-DD`, so a string compare is a date compare and there is no
 * need to parse anything — and no timezone to get wrong.
 */
function windowSamples(points: WeightPoint[], days: number | null): number[] {
  if (days == null) return points.map((p) => p.value);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const iso = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= iso).map((p) => p.value);
}

/** A flat line when there is nothing to draw, so every row keeps its rhythm. */
function sparkPath(values: number[], w: number, h: number): string {
  if (values.length < 2) return `M 0 ${h / 2} L ${w} ${h / 2}`;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 2;
  return values
    .map((v, i) => {
      const x = (w * i) / (values.length - 1);
      const y = pad + (h - pad * 2) * (1 - (v - lo) / span);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
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
    const delta = samples.length >= 2 ? samples[samples.length - 1] - samples[0] : 0;
    return {
      key: days == null ? 'all' : String(days),
      label: days == null ? i18n.nWcAllTime : i18n.nWcDays.replace('{n}', String(days)),
      delta,
      samples,
    };
  });

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
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            <Svg width={44} height={22} style={styles.spark}>
              <Path
                d={sparkPath(r.samples, 44, 22)}
                stroke={flat ? colors.mutedForeground : tint}
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
                opacity={flat ? 0.5 : 1}
              />
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
