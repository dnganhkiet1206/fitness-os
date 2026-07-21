import { useId } from 'react';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

/**
 * Gamification icon set — hand-authored SVG (code-drawn), sharp at any size
 * and on-brand with the app. Gradient ids are scoped per instance via
 * `useId` so the same icon can appear many times without id collisions.
 *
 *   <GameIcon name="coin" size={22} />
 */
export type GameIconName =
  | 'coin'
  | 'energy'
  | 'health'
  | 'rank'
  | 'badge'
  | 'shop'
  | 'fire'
  | 'water'
  | 'steps'
  | 'calendar'
  | 'achievement'
  | 'reward';

export function GameIcon({ name, size = 28 }: { name: GameIconName; size?: number }) {
  const uid = useId().replace(/[:]/g, '');
  const id = (k: string) => `${name}-${k}-${uid}`;
  const P = { width: size, height: size, viewBox: '0 0 60 60' } as const;

  switch (name) {
    case 'coin':
      return (
        <Svg {...P}>
          <Defs>
            <RadialGradient id={id('g')} cx="40%" cy="35%" r="70%">
              <Stop offset="0%" stopColor="#ffe27a" />
              <Stop offset="60%" stopColor="#f5b731" />
              <Stop offset="100%" stopColor="#d98a12" />
            </RadialGradient>
          </Defs>
          <Circle cx={30} cy={30} r={22} fill={`url(#${id('g')})`} stroke="#c47a0e" strokeWidth={2} />
          <Circle cx={30} cy={30} r={15} fill="none" stroke="#e79f1c" strokeWidth={2.5} />
          <Path d="M30 20l2.9 6 6.6.6-5 4.3 1.5 6.5L30 40l-5.9 3.4 1.5-6.5-5-4.3 6.6-.6z" fill="#fff2c4" />
        </Svg>
      );
    case 'energy':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffe066" />
              <Stop offset="100%" stopColor="#f5a623" />
            </LinearGradient>
          </Defs>
          <Path d="M34 8L16 34h11l-5 18 22-28H31l6-16z" fill={`url(#${id('g')})`} stroke="#d98a12" strokeWidth={2} strokeLinejoin="round" />
        </Svg>
      );
    case 'health':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ff8199" />
              <Stop offset="100%" stopColor="#e23b57" />
            </LinearGradient>
          </Defs>
          <Path d="M30 47C13 36 9 27 12 20c2.6-6 10.6-6.6 14-1 3.4-5.6 11.4-5 14 1 3 7-1 16-10 27z" fill={`url(#${id('g')})`} />
          <Path d="M20 20c-2 1-3 3-3 6" stroke="#ffd0da" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.8} />
        </Svg>
      );
    case 'rank':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffe27a" />
              <Stop offset="100%" stopColor="#e9a11c" />
            </LinearGradient>
          </Defs>
          <Path d="M18 14h24v6c0 7-4 12-9 13v6h6v4H21v-4h6v-6c-5-1-9-6-9-13z" fill={`url(#${id('g')})`} stroke="#c47a0e" strokeWidth={1.6} />
          <Path d="M18 16c-5 0-6 8 2 10M42 16c5 0 6 8-2 10" stroke="#e9a11c" strokeWidth={2.4} fill="none" />
          <Rect x={19} y={44} width={22} height={4} rx={2} fill="#c47a0e" />
        </Svg>
      );
    case 'badge':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#8f9bff" />
              <Stop offset="100%" stopColor="#5661d8" />
            </LinearGradient>
          </Defs>
          <Path d="M30 10l16 5v13c0 12-8 18-16 22-8-4-16-10-16-22V15z" fill={`url(#${id('g')})`} stroke="#3f47a8" strokeWidth={2} />
          <Path d="M30 22l2.6 5.4 5.9.6-4.4 4 1.3 5.8L30 40l-5.4 2.4 1.3-5.8-4.4-4 5.9-.6z" fill="#eaecff" />
        </Svg>
      );
    case 'shop':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffb066" />
              <Stop offset="100%" stopColor="#f07f2c" />
            </LinearGradient>
          </Defs>
          <Path d="M16 22h28l-3 26a3 3 0 0 1-3 3H22a3 3 0 0 1-3-3z" fill={`url(#${id('g')})`} stroke="#c95f13" strokeWidth={1.8} />
          <Path d="M23 24v-4a7 7 0 0 1 14 0v4" fill="none" stroke="#c95f13" strokeWidth={3} strokeLinecap="round" />
        </Svg>
      );
    case 'fire':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffd23e" />
              <Stop offset="45%" stopColor="#ff7a2c" />
              <Stop offset="100%" stopColor="#e2361f" />
            </LinearGradient>
          </Defs>
          <Path d="M30 8c3 8-4 11-4 18a10 10 0 1 0 20 0c0-3-1-5-2-7 4 4 6 9 6 14a16 16 0 1 1-32 0C18 26 30 22 30 8z" fill={`url(#${id('g')})`} />
          <Path d="M30 46a6 6 0 0 0 6-6c0-3-3-4-3-8-4 3-9 5-9 9a6 6 0 0 0 6 5z" fill="#ffe9a8" opacity={0.85} />
        </Svg>
      );
    case 'water':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#6fd3ff" />
              <Stop offset="100%" stopColor="#2b8be0" />
            </LinearGradient>
          </Defs>
          <Path d="M30 10c8 11 14 18 14 26a14 14 0 1 1-28 0c0-8 6-15 14-26z" fill={`url(#${id('g')})`} />
          <Path d="M22 34c-1 3-1 7 2 10" stroke="#d3f0ff" strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.8} />
        </Svg>
      );
    case 'steps':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#5aa2ff" />
              <Stop offset="100%" stopColor="#2f6fd6" />
            </LinearGradient>
          </Defs>
          <Path d="M10 38c0-4 4-4 8-6s7-6 11-6c3 0 4 3 8 5 5 2 11 2 12 7 .5 3-1 5-5 5H14c-3 0-4-2-4-5z" fill={`url(#${id('g')})`} stroke="#2453a8" strokeWidth={1.6} />
          <Path d="M22 30l3 4M28 27l3 5" stroke="#cfe2ff" strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      );
    case 'calendar':
      return (
        <Svg {...P}>
          <Rect x={12} y={15} width={36} height={33} rx={6} fill="#f2f5fb" stroke="#c2cbdb" strokeWidth={1.6} />
          <Rect x={12} y={15} width={36} height={11} rx={6} fill="#e2493f" />
          <Rect x={20} y={11} width={4} height={9} rx={2} fill="#8a94a6" />
          <Rect x={36} y={11} width={4} height={9} rx={2} fill="#8a94a6" />
          <G fill="#aeb8ca">
            <Rect x={19} y={31} width={6} height={5} rx={1.5} />
            <Rect x={28} y={31} width={6} height={5} rx={1.5} />
            <Rect x={37} y={31} width={6} height={5} rx={1.5} />
            <Rect x={19} y={39} width={6} height={5} rx={1.5} />
            <Rect x={28} y={39} width={6} height={5} rx={1.5} fill="#e2493f" />
          </G>
        </Svg>
      );
    case 'achievement':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ffe27a" />
              <Stop offset="100%" stopColor="#f2b21e" />
            </LinearGradient>
          </Defs>
          <Path d="M30 10l6.2 12.6 13.8 2-10 9.8 2.4 13.6L30 41.6 17.6 48l2.4-13.6-10-9.8 13.8-2z" fill={`url(#${id('g')})`} stroke="#d98a12" strokeWidth={1.6} strokeLinejoin="round" />
        </Svg>
      );
    case 'reward':
      return (
        <Svg {...P}>
          <Defs>
            <LinearGradient id={id('g')} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor="#ff6f7d" />
              <Stop offset="100%" stopColor="#e23b57" />
            </LinearGradient>
          </Defs>
          <Rect x={14} y={26} width={32} height={22} rx={4} fill={`url(#${id('g')})`} />
          <Rect x={14} y={22} width={32} height={9} rx={3} fill="#ff8894" />
          <Rect x={27} y={22} width={6} height={26} fill="#ffd0d6" />
          <Path d="M30 22c-6-10-14-2-6 0 8-2 0-10-6 0" fill="none" stroke="#ffd0d6" strokeWidth={3.4} strokeLinecap="round" />
        </Svg>
      );
  }
}
