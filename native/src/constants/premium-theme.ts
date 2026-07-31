/**
 * Dark Gray Premium — the charcoal theme, on trial.
 *
 * The app's surfaces are currently near-black (`colors.background` is #070708).
 * That is clean but flat: with nothing between the page and true black there is
 * no depth, and large dark areas on an OLED panel read as a hole rather than a
 * surface. This is the alternative being tested — charcoal instead of black,
 * built in thin layers rather than one fill.
 *
 * ── scope ──
 *
 * **Nutrition only, for now.** Nothing here is referenced by any other screen.
 * The tokens live apart from `constants/ascnd.ts` on purpose: when the theme is
 * approved they get folded into `colors`/`glass` and every page inherits them
 * in one edit; if it is rejected, deleting this file and `theme-backdrop.tsx`
 * removes it completely. No page outside Nutrition changes either way.
 *
 * ── why these values ──
 *
 * From the brief's "phiên bản chuyển sang tone xám", Gradient 3 — the one it
 * recommends, and the one closest to how Apple's own dark surfaces are built.
 * Plain grey was ruled out for looking dirty; charcoal keeps a trace of blue so
 * it stays cool without being navy.
 *
 * Three things carry the depth, and each is nearly invisible alone:
 *
 *   1. a diagonal gradient, lighter at the top-left, near-black at the bottom
 *   2. a grain texture at 2%, so the surface is not mathematically flat
 *   3. a wide, very soft light behind the top of the page
 *
 * The brief is emphatic that none of these should be *noticed*. Anything here
 * that reads as an effect is turned up too far.
 */

/**
 * Gradient 3 — top-left → bottom-right.
 *
 * The middle stop sits at 45% rather than halfway: pulling it up keeps the
 * lighter charcoal across the part of the page content actually occupies, and
 * lets the fade to near-black happen below the fold where it reads as the page
 * receding rather than as a band.
 */
export const backdrop = {
  colors: ['#1B1C1F', '#181A1D', '#0A0A0B'] as const,
  stops: [0, 0.45, 1] as const,
  /**
   * The "ánh sáng" layer — a flat 2% white wash over the gradient.
   *
   * Its job is to stop the darkest areas from clipping to a single value. On
   * its own it is imperceptible, which is the point.
   */
  wash: 'rgba(255,255,255,0.02)',
  /**
   * Grain. 2%, tiled from a 64pt noise texture.
   *
   * Kept at the low end of the brief's 1–2%: the tile is drawn with an overlay
   * blend, so mid-grey pixels leave the backdrop untouched and only the
   * variance shows. Without blend support it degrades to a 2% grey veil, which
   * is a difference of about two levels out of 255 — invisible either way.
   */
  noiseOpacity: 0.02,
  /** Tile size in points; the asset ships at 1×/2×/3× so the grain stays fine */
  noiseTile: 64,
  /**
   * The radial light. The brief puts it behind the mascot; on a page with no
   * mascot it goes behind whatever the page leads with — here the calorie ring
   * — which is the same idea: the thing you look at first sits in the light.
   */
  glow: {
    /** centre, as a fraction of the page */
    x: 0.5,
    y: 0.18,
    /**
     * Radii, as fractions of the page — each axis separately, because SVG's
     * object-bounding-box units normalise width and height independently.
     *
     * `rx` is wider than the screen on purpose: the light has to reach both
     * edges, or it reads as a disc someone drew rather than as light. `ry` is
     * kept well under half so the falloff finishes around the middle of the
     * page instead of washing the whole thing evenly — a wash is what the
     * gradient already does, and doing it twice just makes the gradient weaker.
     */
    rx: 0.95,
    ry: 0.42,
    opacity: 0.06,
  },
} as const;

/**
 * Card surface.
 *
 * A solid charcoal rather than the current translucent white overlay. On a
 * near-black page a 6% white fill is the only thing separating card from
 * background, so it has to be lifted; on charcoal the background already has a
 * value, and a solid fill one step above it with a hairline edge separates
 * cleanly and looks less like frosted plastic.
 *
 * The shadow can come back too. It was dropped from `GlassCard` because on
 * near-black a dark shadow is invisible and RN's rendering of it read as a
 * halo; against charcoal there is contrast for it to work with.
 */
export const card = {
  bg: '#1B1C1F',
  border: 'rgba(255,255,255,0.05)',
  shadow: 'rgba(0,0,0,0.35)',
  /** the sheen along the top edge, weaker than the glass card's 8% */
  highlight: 'rgba(255,255,255,0.04)',
} as const;

/**
 * Text ramp.
 *
 * Brighter than the current one at every level, because charcoal is a brighter
 * ground than near-black and the existing greys lose contrast against it —
 * `mutedForeground` (#6b6b6b) in particular sits at about 2.6:1 on #181A1D,
 * under the 4.5:1 that small text wants.
 *
 * Applied on the Nutrition page's *own* styles only. The shared components it
 * renders — the calorie card, the quick stats, the meal rows — reach for
 * `colors.mutedForeground` directly, and so do about fifty other files; forking
 * that for one page would mean editing all of them twice. So the page's section
 * headers and captions use this ramp while the cards inside it still use the
 * old one. The gap between #6b6b6b and #7B7F86 is small enough not to read as
 * two different greys, and if the theme is approved this ramp replaces
 * `foreground`/`secondaryForeground`/`mutedForeground` in `constants/ascnd.ts`
 * and the whole app lands on it at once.
 */
export const text = {
  primary: '#FFFFFF',
  secondary: '#B9BCC2',
  hint: '#7B7F86',
} as const;

/**
 * Controls that sit *in* the page rather than on a card — segmented tracks,
 * input fields, chips.
 *
 * These read as recesses, so they go **darker** than the backdrop, not
 * lighter. That inverts what the app does today: on a near-black page the only
 * direction available was up, so every control is a translucent light fill.
 * Replayed on charcoal those fills land within a couple of levels of the
 * background and the control disappears — the segmented tab bar in particular
 * loses its container entirely. A dark track gives it back, and puts the
 * selected segment (`active`, the brief's secondary-button grey) clearly above
 * it.
 */
export const control = {
  /** recessed container: segmented track, text field, chip */
  track: 'rgba(0,0,0,0.28)',
  /** raised element inside a track: selected segment, secondary button */
  active: '#2A2B2F',
  hairline: 'rgba(255,255,255,0.06)',
} as const;

/**
 * Buttons.
 *
 * The primary is near-white with dark text, which is the brief's single loudest
 * change — today it is the brand silver (#a8afbd). It *is* applied on the
 * Nutrition page, on the one button there, because a page cannot be judged for
 * "premium" with the old call-to-action still on it. If the white button is the
 * part that does not land, that is worth knowing separately from the backdrop.
 */
export const button = {
  primaryBg: '#F5F5F5',
  primaryFg: '#111111',
  secondaryBg: control.active,
  secondaryFg: '#F3F3F3',
} as const;

/**
 * Accents — recorded for the rollout, deliberately **not** applied in the trial.
 *
 * One accent per screen is the brief's rule, and the app currently spends four
 * on the dashboard alone (blue, purple, cyan, orange for the metric cards).
 * Honouring that is a decision about what those cards are for, not a token
 * swap, so it is kept out of a test about surfaces.
 */
export const accent = {
  blue: '#5EA7FF',
  green: '#5AD38A',
  orange: '#FFB54A',
} as const;
