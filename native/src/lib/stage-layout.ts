/**
 * STAGE LAYOUT ENGINE — governed by docs/HERO_STAGE_LAYOUT_SPEC.md (v2.0).
 *
 * Pure, deterministic. Given the set of ACTIVE asset ids it decides where each
 * one goes, honouring, per zone: priority ordering, exclusive groups, and the
 * occupancy cap (by footprint). Standing assets are distributed evenly across
 * their zone; the background asset fills its zone rect. Assets never carry
 * coordinates — every position comes out of here — so a Shop unlock only has to
 * register an asset (stage-assets.ts) and it lands in the right place.
 */
import stageCfg from '@/config/stage/stage.json';
import { SIZE_SCALE, STAGE_ASSETS, type AssetZone, type StageAsset } from '@/config/stage/stage-assets';

type Range = [number, number];
interface StandZoneCfg {
  x: Range;
  baseY: number;
  maxOccupancy: number;
  pad: number;
}
interface BgZoneCfg {
  x: Range;
  y: Range;
  maxOccupancy: number;
}
const ZONES = (stageCfg as unknown as {
  zones: {
    groundLine: number;
    leftEquipment: StandZoneCfg;
    rightDecoration: StandZoneCfg;
    background: BgZoneCfg;
    floor: StandZoneCfg;
  };
}).zones;

export const GROUND_LINE = ZONES.groundLine;

export interface Placement {
  id: string;
  zone: AssetZone;
  /** anchor centre, fraction of WIDTH */
  cx: number;
  /** baseline (standing) or rect centre (background), fraction of HEIGHT */
  cy: number;
  /** size multiplier the art applies to its own proportions */
  scale: number;
  /** background assets only: the rect to fill, all fractions */
  rect?: { x: number; y: number; w: number; h: number };
}

function zoneCfg(zone: AssetZone): StandZoneCfg | BgZoneCfg | undefined {
  return (ZONES as unknown as Record<string, StandZoneCfg | BgZoneCfg>)[zone];
}

/** Resolve which active assets are placed, and where, per the spec's rules. */
export function resolveLayout(activeIds: string[]): Placement[] {
  const assets = activeIds.map((id) => STAGE_ASSETS[id]).filter(Boolean) as StageAsset[];

  const byZone = new Map<AssetZone, StageAsset[]>();
  for (const a of assets) {
    const arr = byZone.get(a.zone) ?? [];
    arr.push(a);
    byZone.set(a.zone, arr);
  }

  const out: Placement[] = [];
  for (const [zone, list] of byZone) {
    // priority desc — highest wins on every conflict
    const sorted = [...list].sort((x, y) => y.priority - x.priority);

    // exclusive groups — keep only the highest-priority asset per group
    const groupSeen = new Set<string>();
    const afterGroups = sorted.filter((a) => {
      if (!a.exclusiveGroup) return true;
      if (groupSeen.has(a.exclusiveGroup)) return false;
      groupSeen.add(a.exclusiveGroup);
      return true;
    });

    // occupancy cap by footprint — over-capacity assets don't spawn
    const cfg = zoneCfg(zone);
    const cap = cfg && 'maxOccupancy' in cfg ? cfg.maxOccupancy : 99;
    const placed: StageAsset[] = [];
    let used = 0;
    for (const a of afterGroups) {
      if (used + a.footprint > cap) continue;
      used += a.footprint;
      placed.push(a);
    }

    if (!cfg) continue;

    if (zone === 'background') {
      const bg = cfg as BgZoneCfg;
      for (const a of placed) {
        out.push({
          id: a.id,
          zone,
          cx: (bg.x[0] + bg.x[1]) / 2,
          cy: (bg.y[0] + bg.y[1]) / 2,
          scale: SIZE_SCALE[a.size],
          rect: { x: bg.x[0], y: bg.y[0], w: bg.x[1] - bg.x[0], h: bg.y[1] - bg.y[0] },
        });
      }
    } else {
      const sz = cfg as StandZoneCfg;
      const x0 = sz.x[0] + sz.pad;
      const x1 = sz.x[1] - sz.pad;
      const k = placed.length;
      placed.forEach((a, i) => {
        const cx = k <= 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (k - 1);
        out.push({ id: a.id, zone, cx, cy: sz.baseY, scale: SIZE_SCALE[a.size] });
      });
    }
  }
  return out;
}
