import { Plant, type PlantKind } from '@/components/ascnd/studio/plant';

/**
 * Where the room's plants stand.
 *
 * Both are here rather than one on the shelf and one in `koa-studio.tsx`
 * because they share a canvas now: they are the only props that move, and
 * anything that moves has to be on a layer of its own — see
 * `plants-live.tsx`. The shelf draws its equipment and leaves its plant to
 * this list.
 *
 * (x, y) is the centre of the pot's base, so a plant is placed by where it
 * stands. The shelf one sits on the top board at y 250.
 */
export const PLANTS: { x: number; y: number; s: number; kind: PlantKind }[] = [
  { x: 41, y: 250, s: 0.72, kind: 'bush' },
  { x: 316, y: 397, s: 1.81, kind: 'spray' },
];

/** the plants, still — what a snapshot of the room shows */
export function StudioPlants() {
  return (
    <>
      {PLANTS.map((p, i) => (
        <Plant key={i} {...p} />
      ))}
    </>
  );
}
