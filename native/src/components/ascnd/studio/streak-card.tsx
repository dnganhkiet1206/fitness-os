import { Path, Rect, Text } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * The streak, as an object on the wall rather than a UI overlay — it is the
 * one number Koa's day is really about, so it lives in the room.
 *
 * The bar is seven pips because a streak is counted in days, not in percent.
 */
const X = 270;
const Y = 245;
const W = 102;
const H = 62;
const DAYS = 7;
const DONE = 4;

export function StreakCard({ days = DONE }: { days?: number }) {
  const lit = Math.max(0, Math.min(DAYS, days));
  return (
    <>
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill={C.secondary} />
      <Rect x={X} y={Y} width={W} height={H} rx={11} fill="none" stroke={C.accent} strokeWidth={1.4} opacity={0.55} />

      <Text x={X + W / 2} y={Y + 17} fill={C.soft} fontSize={9} fontWeight="800" textAnchor="middle">
        STREAK
      </Text>
      <Text x={X + 34} y={Y + 42} fill={C.white} fontSize={22} fontWeight="800" textAnchor="middle">
        {String(DAYS)}
      </Text>

      {/* flame */}
      <Path
        d={`M ${X + 60} ${Y + 44} C ${X + 52} ${Y + 38} ${X + 56} ${Y + 30} ${X + 62} ${Y + 24}
            C ${X + 63} ${Y + 30} ${X + 67} ${Y + 30} ${X + 68} ${Y + 27}
            C ${X + 73} ${Y + 33} ${X + 74} ${Y + 40} ${X + 68} ${Y + 44}
            C ${X + 66} ${Y + 46} ${X + 62} ${Y + 46} ${X + 60} ${Y + 44} Z`}
        fill={C.highlight}
      />

      {Array.from({ length: DAYS }, (_, i) => (
        <Rect
          key={i}
          x={X + 12 + i * 11}
          y={Y + H - 14}
          width={8}
          height={4}
          rx={2}
          fill={i < lit ? C.highlight : C.primary}
        />
      ))}
    </>
  );
}
