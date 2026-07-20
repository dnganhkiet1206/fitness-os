import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';

import type { AppLang } from '@/lib/i18n';
import type { RankDef } from '@/lib/mascot-room';

/**
 * A milestone timeline of the whole rank ladder — the buddy's journey at
 * a glance. Reached ranks are filled dots on a coloured line; the current
 * rank glows with a "you are here" pill; future ranks are hollow. Only
 * the compact level threshold sits under each node, so long localized
 * rank names never collide. Learns from Duolingo/Strava path visuals.
 */

const VW = 340; // viewBox width (rendered at 100% of the card)
const VH = 72;

export function RankJourney({
  ranks,
  currentKey,
  lang,
  cardBg = '#0e0e11',
}: {
  ranks: RankDef[];
  currentKey: string;
  lang: AppLang;
  /** Card colour behind the ring cut-outs, so the dot centres read clean */
  cardBg?: string;
}) {
  const n = ranks.length;
  const current = Math.max(0, ranks.findIndex((r) => r.key === currentKey));
  const cur = ranks[current];
  const padX = 18;
  const y = 40;
  const step = (VW - padX * 2) / Math.max(1, n - 1);
  const x = (i: number) => padX + i * step;
  const px = x(current);

  return (
    <Svg width="100%" height={VH} viewBox={`0 0 ${VW} ${VH}`}>
      {/* base line + filled portion up to the current rank */}
      <Line x1={x(0)} y1={y} x2={x(n - 1)} y2={y} stroke="#26262c" strokeWidth={3} strokeLinecap="round" />
      <Line x1={x(0)} y1={y} x2={px} y2={y} stroke={cur.color} strokeWidth={3} strokeLinecap="round" />

      {/* "you are here" pill above the current node */}
      <Rect x={px - 32} y={0} width={64} height={19} rx={9.5} fill={cur.color} />
      <Path d={`M ${px - 4} 19 L ${px + 4} 19 L ${px} 24 Z`} fill={cur.color} />
      <SvgText x={px} y={13.5} textAnchor="middle" fontSize={10.5} fontWeight="800" fill={cardBg}>
        {cur.name[lang]}
      </SvgText>

      {ranks.map((rk, i) => {
        const reached = i <= current;
        const isCur = i === current;
        const cx = x(i);
        return (
          <G key={rk.key}>
            {isCur ? (
              <>
                <Circle cx={cx} cy={y} r={14} fill="none" stroke={rk.color} strokeWidth={2} opacity={0.35} />
                <Circle cx={cx} cy={y} r={9} fill={rk.color} />
                <Circle cx={cx} cy={y} r={3.5} fill={cardBg} />
              </>
            ) : reached ? (
              <Circle cx={cx} cy={y} r={6.5} fill={rk.color} />
            ) : (
              <Circle cx={cx} cy={y} r={6} fill="#151518" stroke="#3a3a3f" strokeWidth={2} />
            )}
            <SvgText
              x={cx}
              y={y + 24}
              textAnchor="middle"
              fontSize={10}
              fontWeight="700"
              fill={reached ? '#c9c9cf' : '#5a5a60'}>
              {rk.minLevel}
            </SvgText>
          </G>
        );
      })}
    </Svg>
  );
}
