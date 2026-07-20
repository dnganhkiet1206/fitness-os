import Svg, { Circle, G } from 'react-native-svg';

/**
 * Apple-Fitness-style segmented energy ring. Each segment is one daily
 * signal (meal / workout / water / sleep / steps); it lights up in its
 * own colour when that signal is met today, and sits as a faint track
 * when it isn't. Purely a status glyph — the centre number is overlaid
 * by the parent so it can use themed text styles.
 */
export function EnergyRing({
  size = 104,
  stroke = 10,
  segments,
}: {
  size?: number;
  stroke?: number;
  segments: { on: boolean; color: string }[];
}) {
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const C = 2 * Math.PI * r;
  const n = Math.max(1, segments.length);
  const gapDeg = 8;
  const segDeg = 360 / n - gapDeg;
  const arc = (C * segDeg) / 360;

  return (
    <Svg width={size} height={size}>
      {segments.map((seg, i) => {
        const start = -90 + i * (360 / n) + gapDeg / 2;
        return (
          <G key={i} rotation={start} originX={cx} originY={cy}>
            <Circle
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke="#1c1c20"
              strokeWidth={stroke}
              strokeDasharray={[arc, C]}
              strokeLinecap="round"
            />
            {seg.on && (
              <Circle
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={stroke}
                strokeDasharray={[arc, C]}
                strokeLinecap="round"
              />
            )}
          </G>
        );
      })}
    </Svg>
  );
}
