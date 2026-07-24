/**
 * MASCOT FACE — 2D eyelid-overlay config (MASCOT RIG & FACIAL SPEC v3.0).
 *
 * The GLB has no facial rig, so expression is a 2D overlay of eyelids aligned
 * over the baked eyes at the fixed camera. Per-eye so each lid lines up exactly;
 * values are fractions of the 3D canvas (width for x/w, height for y/h). Tune
 * them in tools/mascot-playground and paste the exported object here.
 */
export interface EyeSpec {
  x: number; // centre X (fraction of canvas width)
  y: number; // centre Y (fraction of canvas height)
  w: number; // width (fraction of width)
  h: number; // height (fraction of height)
  rotation: number; // degrees
  radius: number; // corner radius (0..1 of half-size)
  opacity: number; // 0..1
}

export interface FaceConfig {
  left: EyeSpec;
  right: EyeSpec;
  fur: string; // lid colour (matches koala fur)
}

export const FACE: FaceConfig = {
  left: { x: 0.4, y: 0.33, w: 0.12, h: 0.1, rotation: 0, radius: 0.5, opacity: 1 },
  right: { x: 0.6, y: 0.33, w: 0.12, h: 0.1, rotation: 0, radius: 0.5, opacity: 1 },
  fur: '#8f8d92',
};
