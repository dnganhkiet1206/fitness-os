import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';

import { colors, spacing, type } from '@/constants/ascnd';

export interface ChartPoint {
  date: string;
  value: number;
}

interface LineChartProps {
  points: ChartPoint[];
  color?: string;
  height?: number;
  /** Unit suffix for min/max labels (e.g. "kg") */
  unit?: string;
  emptyLabel?: string;
}

/**
 * Minimal smooth line chart (SVG): gradient fill, end-point dot, min/max
 * labels. Deliberately dependency-free — enough for trend surfaces.
 */
export function LineChart({ points, color = colors.primary, height = 140, unit = '', emptyLabel = 'Not enough data yet' }: LineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (points.length < 2) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const padY = 12;
  const chartH = height - padY * 2;

  const x = (i: number) => (width * i) / (points.length - 1);
  const y = (v: number) => padY + chartH * (1 - (v - min) / span);

  let path = `M ${x(0)} ${y(values[0])}`;
  for (let i = 1; i < values.length; i++) {
    // Catmull-Rom-ish smoothing via midpoint control
    const cx = (x(i - 1) + x(i)) / 2;
    path += ` C ${cx} ${y(values[i - 1])}, ${cx} ${y(values[i])}, ${x(i)} ${y(values[i])}`;
  }
  const fillPath = `${path} L ${x(values.length - 1)} ${height} L 0 ${height} Z`;

  const fmt = (v: number) => `${Math.round(v * 10) / 10}${unit ? ` ${unit}` : ''}`;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            <Defs>
              <LinearGradient id="fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={color} stopOpacity="0.25" />
                <Stop offset="1" stopColor={color} stopOpacity="0" />
              </LinearGradient>
            </Defs>
            <Path d={fillPath} fill="url(#fill)" />
            <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" />
            <Circle
              cx={x(values.length - 1)}
              cy={y(values[values.length - 1])}
              r={4.5}
              fill={color}
              stroke={colors.background}
              strokeWidth={2}
            />
          </Svg>
          <View style={styles.labels}>
            <Text style={styles.label}>{fmt(min)}</Text>
            <Text style={[styles.label, styles.labelStrong]}>{fmt(values[values.length - 1])}</Text>
            <Text style={styles.label}>{fmt(max)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

export interface MultiSeries {
  label: string;
  color: string;
  /** One entry per x slot; null = no reading that day (line connects across gaps) */
  values: (number | null)[];
}

interface MultiLineChartProps {
  series: MultiSeries[];
  height?: number;
  emptyLabel?: string;
}

/**
 * Multi-series companion to LineChart — several smooth lines on a shared
 * scale with per-point dots and a legend (web measurement-trend chart).
 */
export function MultiLineChart({ series, height = 200, emptyLabel = 'Not enough data yet' }: MultiLineChartProps) {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const slots = Math.max(...series.map((s) => s.values.length), 0);
  const allValues = series.flatMap((s) => s.values).filter((v): v is number => v != null);

  if (slots < 2 || allValues.length < 2) {
    return (
      <View style={[styles.empty, { height }]} onLayout={onLayout}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }

  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const span = max - min || 1;
  const padY = 12;
  const chartH = height - padY * 2;

  const x = (i: number) => (width * i) / (slots - 1);
  const y = (v: number) => padY + chartH * (1 - (v - min) / span);

  const lines = series
    .map((s) => {
      const pts = s.values
        .map((v, i) => ({ i, v }))
        .filter((p): p is { i: number; v: number } => p.v != null);
      if (pts.length === 0) return null;

      let path = `M ${x(pts[0].i)} ${y(pts[0].v)}`;
      for (let k = 1; k < pts.length; k++) {
        const cx = (x(pts[k - 1].i) + x(pts[k].i)) / 2;
        path += ` C ${cx} ${y(pts[k - 1].v)}, ${cx} ${y(pts[k].v)}, ${x(pts[k].i)} ${y(pts[k].v)}`;
      }
      return { color: s.color, path, pts };
    })
    .filter((l): l is NonNullable<typeof l> => l != null);

  const fmt = (v: number) => `${Math.round(v * 10) / 10}`;

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <>
          <Svg width={width} height={height}>
            {lines.map((l, li) => (
              <Path key={li} d={l.path} stroke={l.color} strokeWidth={2} fill="none" strokeLinecap="round" />
            ))}
            {lines.map((l, li) =>
              l.pts.map((p) => (
                <Circle key={`${li}-${p.i}`} cx={x(p.i)} cy={y(p.v)} r={3} fill={l.color} />
              )),
            )}
          </Svg>
          <View style={styles.labels}>
            <Text style={styles.label}>{fmt(min)}</Text>
            <Text style={styles.label}>{fmt(max)}</Text>
          </View>
          <View style={styles.legend}>
            {series.map((s) => (
              <View key={s.label} style={styles.legendItem}>
                <View style={[styles.legendSwatch, { backgroundColor: s.color }]} />
                <Text style={styles.label}>{s.label}</Text>
              </View>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    ...type.footnote,
    color: colors.mutedForeground,
  },
  labels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  label: {
    ...type.caption,
    color: colors.mutedForeground,
  },
  labelStrong: {
    color: colors.foreground,
    fontWeight: '600',
  },
  // Web trend legend: centered, wrapping, 2x2 rounded swatches
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendSwatch: { width: 8, height: 8, borderRadius: 2 },
});
