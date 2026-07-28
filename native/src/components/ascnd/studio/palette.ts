/**
 * Koa Studio — the whole scene's colour vocabulary.
 *
 * Twelve entries, and that is the budget. A new shade means replacing one,
 * not appending: the flat 2.5D look holds together because everything is
 * built from the same short list, and depth comes from scale, overlap and
 * brightness rather than from more colours.
 */
export const C = {
  /** page gradient, top → bottom */
  bgTop: '#11152A',
  bgBottom: '#1C2140',
  /** podium body, city silhouette — the darkest solid */
  primary: '#171B2E',
  /** panels: shelf, window frame, streak card, lamp shade */
  secondary: '#232B46',
  /** the one warm colour: podium ring, bolt, streak, lit windows */
  highlight: '#FFC24D',
  /** structural purple: pots, strokes, equipment */
  accent: '#7B61FF',
  /** lighter purple: neon stroke, moon, labels */
  soft: '#8F83FF',
  /** foliage */
  plant: '#4FA96A',
  /** contact shadow */
  shadow: 'rgba(0,0,0,0.18)',
  /** spotlight, stars, numerals */
  white: '#FFFFFF',
} as const;

/** the artboard the scene is drawn on */
export const STUDIO_W = 390;
export const STUDIO_H = 844;

/**
 * Where Koa stands, in artboard units: the middle of the podium's top face.
 * The figure is placed from this, so the scene and the character cannot
 * drift apart.
 */
export const STAGE_MARK = { x: 195, y: 414 };

/** the scene is drawn in the top of the artboard; below it is app content */
export const SCENE_BOTTOM = 470;
