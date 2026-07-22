/**
 * STAGE ASSET REGISTRY — governed by docs/HERO_STAGE_LAYOUT_SPEC.md (v2.0).
 *
 * An asset describes ONLY its metadata. It NEVER stores x / y / width / height.
 * The Layout Engine (src/lib/stage-layout.ts) decides where every asset goes,
 * from its zone + occupancy + priority + footprint + exclusive group. A Shop
 * item therefore only has to register an asset here; it drops into the right
 * zone automatically, no layout edits.
 */

export type AssetZone =
  | 'leftEquipment'
  | 'rightDecoration'
  | 'background'
  | 'floor';

export type AssetCategory = 'equipment' | 'decoration' | 'background' | 'floor';
export type AssetSize = 'S' | 'M' | 'L' | 'XL';

export interface StageAsset {
  id: string;
  category: AssetCategory;
  zone: AssetZone;
  size: AssetSize;
  /** higher wins when a zone is over capacity or an exclusive group clashes */
  priority: number;
  /** how many slots this asset occupies in its zone (XL usually 2) */
  footprint: number;
  /** at most one asset per exclusive group may be placed */
  exclusiveGroup?: string;
}

// size → scale multiplier applied to a zone slot's base size
export const SIZE_SCALE: Record<AssetSize, number> = { S: 0.72, M: 0.9, L: 1.1, XL: 1.35 };

/**
 * The catalogue of everything that can appear on the stage. Shop unlocks add
 * rows here; nothing else changes. `id` matches the art switch in the renderer
 * and (for shop items) the ShopItemKey.
 */
export const STAGE_ASSETS: Record<string, StageAsset> = {
  // ── Left Equipment Zone (max 2) ──
  dumbbell_rack: { id: 'dumbbell_rack', category: 'equipment', zone: 'leftEquipment', size: 'L', priority: 60, footprint: 1, exclusiveGroup: 'rack' },
  bench: { id: 'bench', category: 'equipment', zone: 'leftEquipment', size: 'M', priority: 50, footprint: 1 },

  // ── Right Decoration Zone (max 3, 1 dominant) ──
  plant: { id: 'plant', category: 'decoration', zone: 'rightDecoration', size: 'M', priority: 55, footprint: 1, exclusiveGroup: 'corner' },
  medicine_ball: { id: 'medicine_ball', category: 'decoration', zone: 'rightDecoration', size: 'M', priority: 45, footprint: 1 },

  // ── Background Zone ──
  window: { id: 'window', category: 'background', zone: 'background', size: 'L', priority: 30, footprint: 1 },

  // ── Floor Zone (max 5) ──
  yoga_mat: { id: 'yoga_mat', category: 'floor', zone: 'floor', size: 'S', priority: 25, footprint: 1 },
};

/**
 * The default set shown before the Shop is wired to drive it. Later this comes
 * from the player's owned/equipped stage items; the engine handles the rest.
 */
export const DEFAULT_ACTIVE_ASSETS = ['dumbbell_rack', 'plant', 'medicine_ball', 'window', 'yoga_mat'];
