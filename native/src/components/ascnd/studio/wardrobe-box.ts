/**
 * How big the wardrobe is, with nothing else attached.
 *
 * Split out of `wardrobe.tsx` because `shop-plan.ts` needs the box to place the
 * thing and to frame a camera shot around it, and `shop-plan.ts` is imported by
 * `shop-camera.ts`, which `tools/shop-camera.mjs` bundles and *runs* in Node.
 * Reaching these two numbers through the component would drag
 * `react-native-svg` into that bundle and execute it outside React Native.
 *
 * `wardrobe.tsx` re-exports both, so callers that want the drawing and its size
 * still have one import.
 */
export const WARDROBE_W = 168;
export const WARDROBE_H = 196;
