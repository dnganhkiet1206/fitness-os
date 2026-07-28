import { Ellipse, G, Path, Rect } from 'react-native-svg';

import { C } from '@/components/ascnd/studio/palette';

/**
 * A potted plant, in the two silhouettes the design actually uses.
 *
 * Measuring the reference settled something a single scale could not: the
 * shelf plant is a compact bush (29 × 24pt, so about 1.2 wide for its
 * height) while the floor plant is a broad spray on visible stems
 * (107 × 38pt, nearer 2.8). One is not the other made bigger, so `kind`
 * picks the tip table and everything else — blades, ribs, pot — is shared.
 *
 * The leaves are lances, not blobs: a narrow blade with a lighter midrib
 * and dark between. Broad rounded leaves read as one solid green mass at
 * phone size, which is what the first pass got wrong.
 *
 * (x, y) is the centre of the pot's base, so a plant is placed by where it
 * stands rather than by a bounding box.
 */

/** tip x, tip y, how far the blade bows, how far back it sits */
type Leaf = [number, number, number, number];

const BUSH: Leaf[] = [
  [-20, -32, 6, 0.5],
  [-13, -40, 6.5, 0.7],
  [-5, -44, 6, 0.95],
  [4, -44, 6, 0.88],
  [13, -39, 6.5, 0.66],
  [20, -31, 6, 0.46],
];

const SPRAY: Leaf[] = [
  [-30, -38, 7.5, 0.42],
  [-23, -43, 8, 0.56],
  [-14, -46, 8, 0.78],
  [-5, -48, 7, 0.95],
  [4, -48, 7, 0.88],
  [13, -45, 8, 0.7],
  [22, -41, 8, 0.54],
  [29, -35, 7.5, 0.4],
];

/** pot top; the bush fans straight off it, the spray rises on stems first */
const POT_Y = -12;
const ORIGIN = { bush: -12, spray: -28 };

/** base → tip, bowed either side by `b`: a lance that comes to a point */
function blade(oy: number, tx: number, ty: number, b: number) {
  const dy = ty - oy;
  const len = Math.hypot(tx, dy) || 1;
  const px = (-dy / len) * b;
  const py = (tx / len) * b;
  const mx = tx * 0.5;
  const my = oy + dy * 0.5;
  return `M0 ${oy} Q ${mx + px} ${my + py} ${tx} ${ty} Q ${mx - px} ${my - py} 0 ${oy} Z`;
}

const rib = (oy: number, tx: number, ty: number) =>
  `M0 ${oy} Q ${tx * 0.5} ${oy + (ty - oy) * 0.5} ${tx} ${ty}`;

/**
 * The pivot a plant sways about, in local units: the pot's rim. Leaves bend
 * from where they leave the soil, not from the floor.
 */
export const PLANT_PIVOT = POT_Y;

export type PlantKind = 'bush' | 'spray';

/**
 * Stem and leaves, without the pot.
 *
 * Split out so `plants-live.tsx` can sway the foliage while the pot holds
 * still — a pot that rocks with its own plant reads as an earthquake. Local
 * coordinates: the caller places and scales it.
 */
export function PlantFoliage({ kind = 'bush' }: { kind?: PlantKind }) {
  const leaves = kind === 'spray' ? SPRAY : BUSH;
  const oy = ORIGIN[kind];
  return (
    <>
      {kind === 'spray' && (
        <Path d={`M0 ${POT_Y} L 0 ${oy}`} stroke={C.plant} strokeWidth={1.1} opacity={0.4} fill="none" />
      )}
      {leaves.map(([tx, ty, b, tone], i) => (
        <G key={i}>
          <Path d={blade(oy, tx, ty, b)} fill={C.plant} opacity={tone} />
          <Path
            d={rib(oy, tx, ty)}
            stroke={C.plant}
            strokeWidth={0.7}
            fill="none"
            opacity={Math.min(1, tone + 0.25)}
          />
        </G>
      ))}
    </>
  );
}

/**
 * The pot.
 *
 * A rim lip, a tapered body, one shaded side. The room is dim, so the props
 * carry a lot of `primary` over the accent — the reference's violet is this
 * palette in shadow, not a darker colour, and the first pass read as bright
 * plastic.
 */
export function PlantPot() {
  return (
    <>
      {/* what the pot stands on. Without it the floor plant measured |Δ| 5.8
          against the ground it sits on and looked pasted onto it. */}
      <Ellipse cx={0} cy={0} rx={11} ry={3.2} fill={C.shadow} opacity={0.32} />
      <Path d={`M-9 ${POT_Y} L 9 ${POT_Y} L 7 0 L -7 0 Z`} fill={C.accent} />
      <Path d={`M-9 ${POT_Y} L 9 ${POT_Y} L 7 0 L -7 0 Z`} fill={C.primary} opacity={0.34} />
      <Path d={`M 2 ${POT_Y} L 9 ${POT_Y} L 7 0 L 1 0 Z`} fill={C.primary} opacity={0.3} />
      <Rect x={-10} y={POT_Y - 2.4} width={20} height={3.2} rx={1.4} fill={C.accent} />
    </>
  );
}

export function Plant({
  x,
  y,
  s = 1,
  kind = 'bush',
}: {
  x: number;
  y: number;
  s?: number;
  kind?: PlantKind;
}) {
  return (
    <G transform={`translate(${x} ${y}) scale(${s})`}>
      <PlantFoliage kind={kind} />
      <PlantPot />
    </G>
  );
}
