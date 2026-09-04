import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Line } from 'react-native-svg';

import { ChartBar } from '@/components/ascnd/chart-bar';
import { radius, spacing, type } from '@/constants/ascnd';
import { alpha, makeStyles } from '@/constants/theme';
import { useMaterial, usePalette } from '@/hooks/use-palette';
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
 * zero. Closing the gaps would show a tidier week than the one that happened,
 * and a zero-height bar reads as "you slept none" rather than "you did not log
 * it". The axis says so in words whenever there is one, because a faint bar is
 * not self-explanatory.
 *
 * ── what "đẹp nhưng khó hiểu" was ──
 *
 * The first version drew fourteen unlabelled columns with the baseline's
 * meaning in a legend floating in the middle of a caption row. It looked good
 * and you could not read a single value off it: no idea which column was which
 * day, no scale, and a dashed line you had to mentally connect to a legend
 * three inches away.
 *
 * Four things fixed that, and none of them is decoration:
 *
 *   - **seven columns, each with its weekday under it.** The axis is the
 *     single biggest gain — "which day was that" becomes readable instead of
 *     inferable.
 *   - **today is brighter and carries its value.** It is the column everyone
 *     looks at first and the one the tile above is showing.
 *   - **the baseline is labelled on the line**, at its right end, so there is
 *     nothing to connect.
 *   - **the gap note appears only when there is a gap**, so it is information
 *     rather than furniture.
 */

const TRACK = 68;
/** Between columns, and the number the label's own width is derived from. */
const GAP = 6;

export function MetricPanel({
  analysis,
  tint,
  vi,
  format,
  onAsk,
}: {
  analysis: Analysis;
  /** the metric's own colour, so the panel belongs to the tile that opened it */
  tint: string;
  vi: boolean;
  /** how today's value reads — "7h52", "2.150", "68". Owned by the caller,
      because only it knows what unit this metric is in. */
  format: (v: number) => string;
  onAsk: () => void;
}) {
  const c = usePalette();
  const m = useMaterial();
  const styles = stylesFor(c);
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
  const todayBar = bars[bars.length - 1];

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
                 vanish and the week looks shorter than it was; at full height
                 they would be a reading nobody took. */
              heightPct={b.missing ? (3 / TRACK) * 100 : Math.max(4, (b.value / peak) * 100)}
              /* Today at full strength, the rest at 55%. Without it the column
                 that matters most is one of seven identical shapes. */
              color={b.missing ? alpha(m.ink, 0.14) : b.today ? tint : `${tint}8c`}
              radius={3}
              delay={i * 30}
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
              {/*
                Mực của theme, không phải trắng: trên mặt thẻ TRẮNG, một nét
                trắng 50% đo được **1,00:1** — đường trung bình của biểu đồ
                không tồn tại ở bản sáng, và không có lỗi nào báo vì một chuỗi
                vẫn là một chuỗi hợp lệ. `alpha(m.ink, 0.5)` giữ bản tối từng
                ký tự (`ink` của bản tối LÀ `#ffffff`) và cho 3,36:1 ở bản
                sáng — trên sàn 3:1 mà WCAG đòi cho một nét đồ hoạ.
              */}
              <Line x1={0} y1={0.5} x2={w} y2={0.5} stroke={alpha(m.ink, 0.5)} strokeWidth={1} strokeDasharray={[3, 4]} />
            </Svg>
            {/*
              On the line, at its **left** end.

              It was a "— — Trung bình" legend floating in the caption row,
              which you had to connect to a line somewhere above it — the single
              most confusing thing on the chart. Putting it on the line fixed
              that and introduced a new one: the right end is where today's
              value sits, so on any week whose baseline lands near the top the
              two labels printed on top of each other. The render showed "76"
              struck through by "Trung bình".

              Left and right cannot collide, and the two labels are now the two
              things you read: what the line is, and where you are today.

              The backing is why it survives crossing a tall bar — a 9pt label
              at 62% white over a saturated column is not legible on its own.
            */}
            <Text style={styles.baselineLabel} numberOfLines={1}>
              {vi ? baseline.label.vi : baseline.label.en}
            </Text>
          </View>
        ) : null}

        {/*
          ── today's value, drawn last ──

          One labelled value is what turns a shape into a reading, and this is
          the one the tile above is already showing, so the two agree in front
          of you.

          It began inside today's slot, above the bar, and the baseline crossed
          it: the rule is drawn *after* the bars on purpose — so it can cross
          them rather than hide behind them — which also put it over anything
          the slots contained. A darker backing did not help, because the line
          paints on top of the backing too. Source order is the only thing that
          settles which of two overlapping things wins, and the label has to
          win.

          Positioned over the last column rather than inside it: the slots are
          `flex: 1` with a fixed gap, so one column is `(w - gaps) / n` wide and
          the last one ends at the chart's right edge.
        */}
        {w > 0 && todayBar && !todayBar.missing ? (
          <View
            style={[
              styles.todayWrap,
              {
                width: (w - GAP * (bars.length - 1)) / bars.length,
                bottom: (todayBar.value / peak) * TRACK + 3,
              },
            ]}
            pointerEvents="none">
            {/* Backing as well as source order. Drawing last stops the rule
                painting *over* the number; it does not stop the dashes showing
                between and inside the letters, which on a day just under the
                baseline still reads as a strikethrough. Both are needed, and
                the render is what said so — three panels looked right and the
                fourth, the only one whose today sits below its line, did not. */}
            <Text style={[styles.todayValue, { color: tint }]} numberOfLines={1}>
              {format(todayBar.value)}
            </Text>
          </View>
        ) : null}
      </View>

      {/* The axis. One label per column, so every bar has a name. */}
      <View style={styles.axis}>
        {bars.map((b) => (
          <Text
            key={b.date}
            style={[styles.axisDay, b.today && styles.axisToday]}
            numberOfLines={1}>
            {b.today ? (vi ? 'Nay' : 'Now') : vi ? b.weekday.vi : b.weekday.en}
          </Text>
        ))}
      </View>

      {/* Only when there is one. A permanent note about gaps on a week with no
          gaps is furniture. */}
      {bars.some((b) => b.missing) ? (
        <Text style={styles.gapNote}>
          {vi ? 'Cột mờ là ngày chưa ghi.' : 'Faint columns are days with nothing logged.'}
        </Text>
      ) : null}

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

const stylesFor = makeStyles((c, m) => ({
  wrap: { padding: spacing.md, gap: spacing.sm + 2 },
  /* The largest thing in the panel, because it is the point of the panel. */
  headline: { ...type.footnote, color: c.foreground, lineHeight: 20 },
  chart: { height: TRACK, flexDirection: 'row', alignItems: 'flex-end', gap: GAP },
  slot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  /* Same dark backing as the baseline label, for the same reason and a
     different collision: this sits above today's column, and on any week whose
     baseline lands near the top the dashed rule runs straight through it. The
     render showed "2.210" with a line of dashes through the middle of it.
     Left-versus-right separated the two *labels*; only a backing separates a
     label from the line itself.

     0.94 rather than 0.72: at 72% the dashes showed *through* the backing,
     which is a strikethrough with extra steps. The render is what said so —
     the number looked crossed out in two of the four panels. */
  todayWrap: { position: 'absolute', right: 0, alignItems: 'center' },
  todayValue: {
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    backgroundColor: 'rgba(10,10,16,0.94)',
    paddingHorizontal: 3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  baseline: { position: 'absolute', left: 0, right: 0, height: 1 },
  /* Sitting on the line rather than under it: `bottom: 2` lifts the text clear
     of the rule without pushing it into the bar above. */
  baselineLabel: {
    position: 'absolute',
    left: 0,
    bottom: 2,
    fontSize: 11,
    color: alpha(m.ink, 0.72),
    backgroundColor: 'rgba(10,10,16,0.94)',
    paddingHorizontal: 3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  axis: { flexDirection: 'row', gap: GAP },
  axisDay: { flex: 1, fontSize: 11, textAlign: 'center', color: c.glassMuted },
  axisToday: { fontWeight: '700', color: c.foreground },
  gapNote: { fontSize: 11, color: c.glassMuted, marginTop: -4 },
  stats: { flexDirection: 'row', gap: spacing.lg, marginTop: 2 },
  stat: { gap: 2 },
  statLabel: { fontSize: 11, color: c.glassMuted },
  statValue: { ...type.footnote, fontWeight: '600', color: c.foreground, fontVariant: ['tabular-nums'] },
  ask: {
    ...type.caption,
    fontWeight: '600',
    marginTop: 2,
    /* 44pt of touch on a line of text: the label is ~15pt, so the padding is
       what makes it a control rather than a word you have to hit exactly. */
    paddingVertical: 14,
    marginBottom: -12,
  },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: m.inset.border, borderRadius: radius.sm },
}));
