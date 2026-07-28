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
  bgTop: '#0F142E',
  bgBottom: '#261F4E',
  /** podium body, city silhouette — the darkest solid */
  primary: '#151A33',
  /** panels: shelf, window frame, streak card, lamp shade */
  secondary: '#212B4E',
  /**
   * What the lamp leaves on the floor and the podium's top face.
   *
   * Not a tint of `highlight`. Gold over this indigo cancels rather than
   * warms — the warm's blue channel is far under the wall's, so the mixture
   * walks to neutral and the middle of the room goes grey while its
   * luminance stays right. The design's floor pool and podium face measure
   * hue 316 and 296 at 10–11% saturation: a muted plum, which no amount of
   * gold over indigo will reach.
   */
  lit: '#2C2439',
  /** the one warm colour: podium ring, bolt, streak, lit windows */
  highlight: '#FFC24D',
  /** structural purple: pots, strokes, equipment */
  accent: '#7B61FF',
  /** lighter purple: neon stroke, moon, labels */
  soft: '#8F83FF',
  /** foliage — the design's leaves measure 145 · 31 · 27, this was 8 lighter */
  plant: '#3D8253',
  /**
   * Contact shadow, and the only way to darken something without draining
   * its colour: scaling all three channels keeps (max−min)/(max+min), so
   * black over a fill loses lightness and keeps saturation exactly. Every
   * other colour in this list mixes, and mixing walks the result toward the
   * pair's average saturation. Alpha lives at the use site, not in here —
   * a colour with an opacity baked into it cannot be asked for more.
   */
  shadow: '#000000',
  /**
   * The edge of the room. `bgTop` at full strength leaves the corners at 27
   * against the design's 22.5, so the vignette had nothing dark enough to
   * end on and the room fell away to the wall's own colour instead of into
   * shadow. This is the twelfth and last colour.
   */
  edge: '#0B0F22',
  /** spotlight, stars, numerals */
  white: '#FFFFFF',
} as const;

/**
 * Room skins. The studio is one design with one palette; a skin shifts the
 * wall and the warm colour and leaves everything else alone, which is enough
 * to read as a different room and keeps the shop's stage unlocks meaning
 * something now that the old themed stage is gone.
 */
export const STUDIO_SKINS: Record<string, { wall: [string, string]; glow: string }> = {
  default: { wall: [C.bgTop, C.bgBottom], glow: C.highlight },
  night: { wall: ['#0B0E1E', '#141833'], glow: C.soft },
  sunset: { wall: ['#1D1430', '#2A1B3D'], glow: C.highlight },
  champion: { wall: ['#151228', '#241C3E'], glow: '#FFD97A' },
};

/** the artboard the scene is drawn on */
export const STUDIO_W = 390;
export const STUDIO_H = 844;

/**
 * Where Koa stands, in artboard units: the middle of the podium's top face.
 * The figure is placed from this, so the scene and the character cannot
 * drift apart.
 */
export const STAGE_MARK = { x: 195, y: 412 };

/** the scene is drawn in the top of the artboard; below it is app content */
export const SCENE_BOTTOM = 476;
