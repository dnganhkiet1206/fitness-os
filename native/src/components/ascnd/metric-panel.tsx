import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChartBar } from '@/components/ascnd/chart-bar';
import { colors, glass, radius, spacing, type } from '@/constants/ascnd';
import type { Analysis } from '@/lib/metric-analysis';

/**
 * A metric's fortnight, read out loud.
 *
 * ── it stays on the page ──
 *
 * Tapping a tile used to push `/biometrics` or `/sleep-insights`. Those pages
 * still exist and are still the place to *log* things; what they were being
 * used for here was answering "and what does that number mean" — a question the
 * assistant should not have to leave itself to answer.
 *
 * ── the sentence comes first, the chart is the evidence ──
 *
 * Fourteen bars tell you the shape of a fortnight. They do not tell you whether
 * it was a good one, and a panel that only draws them has moved the data dump
 * rather than replaced it. So the interpreted line is the largest thing here,
 * the chart sits under it, and the figures under that are the two numbers the
 * sentence leans on. See `metric-analysis`, which is where the honesty rules
 * live — including the one this file exists to display: below four readings it
 * says how many days it has instead of inventing a direction.
 *
 * ── gaps are drawn ──
 *
 * A day with nothing logged is a faint stub, not a missing column and not a
 * zero. Closing the gaps would show a tidier fortnight than the one that
 * happened, and a zero-height bar reads as "you slept none" rather than "you
 * did not log it".
 */

const TRACK = 68;

export function MetricPanel({
  analysis,
  tint,
  vi,
  onAsk,
}: {
  analysis: Analysis;
  /** the metric's own colour, so the panel belongs to the tile that opened it */
  tint: string;
  vi: boolean;
  onAsk: () => void;
}) {
  const { headline, stats, bars, baseline } = analysis;

  /* The baseline is drawn in pixels, measured — a percentage inside `<Svg>`
     resolves against the frame the SVG was last laid out at, which
     `glass-card.tsx` and `liquid-glass.tsx` both document after it cost a
     visible seam on each. */
  const [w, setW] = useState(0);
  const measure = (e: LayoutChangeEvent) => {
    const { width } = e.nativeEvent.layout;
    setW((p) => (p === width ? p : width));
  };

  /* The tallest thing on the chart, including the baseline: a fortnight spent
     entirely under target would otherwise draw its own rule off the top. */
  const peak = Math.max(
    ...bars.filter((b) => !b.missing).map((b) => b.value),
    baseline?.value ?? 0,
    1,
  );

  return (
    <View style={styles.wrap}>
      <Text style={styles.headline}>{vi ? headline.vi : headline.en}</Text>

      <View style={styles.chart} onLayout={measure}>
        {bars.map((b, i) => (
          <View key={b.date} style={styles.slot}>
            <ChartBar
              /* Missing days get a 3pt stub at a tenth of the opacity. At 0 they
                 vanish and the fortnight looks shorter than it was; at full
                 height they would be a reading nobody took. */
              heightPct={b.missing ? (3 / TRACK) * 100 : Math.max(4, (b.value / peak) * 100)}
              color={b.missing ? 'rgba(255,255,255,0.14)' : tint}
              radius={3}
              delay={i * 22}
            />
          </View>
        ))}
        {baseline && w > 0 ? (
          /*
            Drawn after the bars, so it crosses them rather than hiding behind
            them — React Native stacks siblings in source order and `zIndex`
            only reorders within one parent. The training card's habit line was
            written the other way round and was invisible on exactly the weeks
            it mattered.

            SVG rather than a dashed border: `borderStyle: 'dashed'` is refused
            on iOS unless all four border colours match, and it does not fall
            back to a solid line — it draws nothing at all.
          */
          <View
            style={[styles.baseline, { bottom: (baseline.value / peak) * TRACK }]}
            pointerEvents="none">
            <Svg width={w} height={1}>
              <Line x1={0} y1={0.5} x2={w} y2={0.5} stroke="rgba(255,255,255,0.5)" strokeWidth={1} strokeDasharray={[3, 4]} />
            </Svg>
          </View>
        ) : null}
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisText}>{vi ? '14 ngày trước' : '14 days ago'}</Text>
        {baseline ? (
          <Text style={styles.axisText}>
            {vi ? '— — ' : '— — '}
            {vi ? baseline.label.vi : baseline.label.en}
          </Text>
        ) : null}
        <Text style={[styles.axisText, styles.axisEnd]}>{vi ? 'hôm nay' : 'today'}</Text>
      </View>

      {stats.length ? (
        <View style={styles.stats}>
          {stats.map((s) => (
            <View key={s.key} style={styles.stat}>
              <Text style={styles.statLabel}>{vi ? s.label.vi : s.label.en}</Text>
              <Text style={styles.statValue}>{s.value}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {/*
        The analysis stays here; the question leaves.

        This is the one link out, and it carries everything the panel just
        showed — so the coach answers about your fortnight rather than about
        the metric in general. Analysis in place, question out.
      */}
      <Text
        accessibilityRole="button"
        onPress={onAsk}
        style={[styles.ask, { color: tint }]}>
        {vi ? 'Hỏi coach về chỉ số này →' : 'Ask the coach about this →'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: spacing.md, gap: spacing.sm + 2 },
  /* The largest thing in the panel, because it is the point of the panel. */
  headline: { ...type.footnote, color: colors.foreground, lineHeight: 20 },
  chart: { height: TRACK, flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  baseline: { position: 'absolute', left: 0, right: 0, height: 1 },
  axis: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  axisText: { fontSize: 10, color: colors.glassMuted },
  axisEnd: { fontWeight: '600', color: colors.foreground },
  stats: { flexDirection: 'row', gap: spacing.lg, marginTop: 2 },
  stat: { gap: 2 },
  statLabel: { fontSize: 10, color: colors.glassMuted },
  statValue: { ...type.footnote, fontWeight: '600', color: colors.foreground, fontVariant: ['tabular-nums'] },
  ask: {
    ...type.caption,
    fontWeight: '600',
    marginTop: 2,
    /* 44pt of touch on a line of text: the label is ~15pt, so the padding is
       what makes it a control rather than a word you have to hit exactly. */
    paddingVertical: 14,
    marginBottom: -12,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: glass.border, borderRadius: radius.sm },
});
