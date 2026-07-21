/**
 * Art registry for the data-driven room.
 *
 * `require()` can't live in JSON, so the image sources + their measured
 * aspect ratios (height / width, from the tight-cropped WebP art) live here
 * while positions live in scene.json and skins in theme.json.
 *
 * Aspect ratios are the real cropped dimensions — do not guess these; they
 * ground each prop exactly on the floor line in RoomRenderer.
 */

export type SlotKey =
  | 'statscreen'
  | 'mirror'
  | 'treadmill'
  | 'heavybag'
  | 'plant'
  | 'rack'
  | 'bench'
  | 'kettlebell'
  | 'barbell';

export interface ItemArt {
  /** image = pre-rendered WebP; vector = drawn in RoomRenderer */
  render: 'image' | 'vector';
  source?: number;
  /** height / width of the art */
  aspect: number;
}

/** Backdrop art keyed by the name a theme references. */
export const BACKDROPS: Record<string, number> = {
  wall: require('@/assets/room/scene-wall.webp'),
  floor: require('@/assets/room/scene-floor.webp'),
};

/** Per-slot art. Image aspects are the measured cropped dimensions. */
export const ITEM_ART: Record<SlotKey, ItemArt> = {
  statscreen: { render: 'image', source: require('@/assets/room/prop-statscreen.webp'), aspect: 0.681 },
  heavybag: { render: 'image', source: require('@/assets/room/prop-heavybag.webp'), aspect: 3.641 },
  plant: { render: 'image', source: require('@/assets/room/prop-plant.webp'), aspect: 1.291 },
  rack: { render: 'image', source: require('@/assets/room/prop-rack.webp'), aspect: 0.662 },
  bench: { render: 'image', source: require('@/assets/room/prop-bench.webp'), aspect: 0.981 },
  mirror: { render: 'vector', aspect: 2.4 },
  kettlebell: { render: 'vector', aspect: 1.05 },
  barbell: { render: 'vector', aspect: 0.42 },
  treadmill: { render: 'vector', aspect: 0.72 },
};

/**
 * Maps a purchasable shop item key (user_room.placed / inventory) to the
 * scene slot it fills. Items without a slot (statscreen is always-on decor,
 * yoga_mat paints the podium) are handled directly by RoomRenderer.
 */
export const SHOP_TO_SLOT: Record<string, SlotKey> = {
  dumbbell_rack: 'rack',
  punching_bag: 'heavybag',
  bench: 'bench',
  plant: 'plant',
  mirror: 'mirror',
  kettlebell: 'kettlebell',
  barbell: 'barbell',
  treadmill: 'treadmill',
};
