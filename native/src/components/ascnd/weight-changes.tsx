import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { GlassCard } from '@/components/ascnd/glass-card';
import { Icon } from '@/components/ascnd/icon';
import { spacing, type } from '@/constants/ascnd';
import { makeStyles } from '@/constants/theme';
import { usePalette } from '@/hooks/use-palette';
import type { useI18n } from '@/hooks/use-app-settings';
import { localDaysAgoStr } from '@/lib/local-date';

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
 * **The latest reading, minus what you weighed when the window opened.**
 *
 * That baseline is the most recent reading *at or before* the window's start —
 * carried forward, because a weight does not stop existing between weigh-ins.
 * If nothing was logged before the window opened, the baseline is the earliest
 * reading there is, which makes that window the whole history.
 *
 * The first version compared the first and last readings *inside* the window
 * instead, and it was wrong in the way that matters: weigh in weekly and every
 * short window holds one reading or none, so 3/7/14 day sat at `0.0 · no
 * change` forever while the weight was plainly moving. Comparing against the
 * last known weight before the window answers the question the row asks —
 * "how much have I changed since then" — with the best evidence available.
 *
 * With one reading in total there is still nothing to compare, and every row
 * reads 0.0. When logging is sparse several rows can show the same number:
 * that is honest — nothing was measured in between to tell them apart.
 *
 * ── the stroke ──
 *
 * Three shapes, and only three: up to the right for a rise, down to the right
 * for a fall, level for neither. It is a glyph for the row's own number, not a
 * plot of the readings behind it — see `sparkLine`.
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
}

const SPARK_W = 44;
const SPARK_H = 22;
const SPARK_PAD = 3;

/**
 * How much the weight has moved since `days` ago — `null` for all time.
 *
 * `points` is oldest first. Dates are `YYYY-MM-DD`, so a string compare is a
 * date compare: no parsing, and nothing for a timezone to get wrong.
 *
 * The cutoff comes from `localDaysAgoStr`, not `toISOString()`. The latter
 * converts to UTC first, so at 01:00 in Hanoi "3 days ago" came out as four
 * days ago — the windows were quietly a day wide of what they said.
 */
function deltaSince(points: WeightPoint[], days: number | null): number {
  if (points.length < 2) return 0;
  const latest = points[points.length - 1].value;
  if (days == null) return latest - points[0].value;

  const cutoff = localDaysAgoStr(days);
  // the last weight known before the window opened, carried forward
  let baseline: number | null = null;
  for (const p of points) {
    if (p.date <= cutoff) baseline = p.value;
    else break;
  }
  // nothing logged before it opened: the window covers everything there is
  return latest - (baseline ?? points[0].value);
}

/**
 * One straight stroke, left to right, in exactly three shapes.
 *
 * Specified by the user: **up** when the weight rose, **down** when it fell,
 * **level** when it did not. Nothing else — no proportional slope, no plot of
 * the readings. At 44×22 the box is a direction indicator, and the exact
 * figure is printed beside it in the same row, so the glyph only has to answer
 * "which way".
 *
 * It is a picture of the row's own number rather than of the days behind it,
 * which is why a window with too few readings still draws level: the row says
 * `0.0 · no change`, and the stroke agrees with the row.
 */
function sparkLine(delta: number): { x1: number; y1: number; x2: number; y2: number } {
  const top = SPARK_PAD;
  const bottom = SPARK_H - SPARK_PAD;
  const x1 = SPARK_PAD;
  const x2 = SPARK_W - SPARK_PAD;
  if (delta > EPSILON) return { x1, y1: bottom, x2, y2: top }; // rose: up to the right
  if (delta < -EPSILON) return { x1, y1: top, x2, y2: bottom }; // fell: down to the right
  const mid = SPARK_H / 2;
  return { x1, y1: mid, x2, y2: mid };
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
  const c = usePalette();
  const styles = stylesFor(c);
  const rows: Row[] = WINDOWS.map((days) => ({
    key: days == null ? 'all' : String(days),
    label: days == null ? i18n.nWcAllTime : i18n.nWcDays.replace('{n}', String(days)),
    delta: deltaSince(points, days),
  }));

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
          ? c.mutedForeground
          : good
            ? c.readinessGreen
            : bad
              ? c.metricOrange
              : c.metricBlue;
        const stroke = sparkLine(r.delta);
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.rowLabel}>{r.label}</Text>
            {/* Three shapes only: up to the right if it rose, down to the right
                if it fell, level if it did not. */}
            <Svg width={SPARK_W} height={SPARK_H} style={styles.spark}>
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

const stylesFor = makeStyles((c) => ({
  card: { gap: spacing.xs },
  title: { ...type.headline, color: c.foreground, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 5 },
  rowLabel: { ...type.footnote, color: c.mutedForeground, width: 58 },
  spark: { opacity: 0.9 },
  rowValue: {
    ...type.footnote,
    color: c.foreground,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    flex: 1,
    textAlign: 'right',
  },
  trend: { flexDirection: 'row', alignItems: 'center', gap: 3, width: 104 },
  trendText: { ...type.footnote, fontWeight: '600' },
  empty: { ...type.footnote, color: c.mutedForeground, paddingVertical: spacing.md },
}));
