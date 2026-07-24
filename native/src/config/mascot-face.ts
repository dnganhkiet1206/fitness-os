/**
 * MASCOT FACE CONFIG — 2D expression overlay (Talking-Tom style).
 *
 * The GLB face is baked (no rig), so expression is a 2D layer aligned over the
 * baked face at the fixed camera: eyelids (blink / squint / sleep), eyebrows
 * and a mouth. All values are FRACTIONS of the 3D canvas (x/w of width, y/h of
 * height). Calibrate in tools/mascot-playground or from an idle screenshot and
 * paste the numbers here.
 */
export interface EyeBox {
  x: number; // eye centre X (fraction of canvas width)
  y: number; // eye centre Y (fraction of canvas height)
  w: number; // eye width
  h: number; // eye height
}

export interface FaceConfig {
  left: EyeBox;
  right: EyeBox;
  /** eyebrow: vertical gap above the eye centre + length, fractions */
  browGap: number;
  browLen: number;
  /** mouth box centre + size, fractions */
  mouth: { x: number; y: number; w: number; h: number };
  fur: string; // eyelid colour (koala fur)
  ink: string; // brow / mouth line colour
}

// Default/estimated placement — refine from an idle screenshot.
export const FACE: FaceConfig = {
  left: { x: 0.4, y: 0.32, w: 0.11, h: 0.085 },
  right: { x: 0.6, y: 0.32, w: 0.11, h: 0.085 },
  browGap: 0.07,
  browLen: 0.085,
  mouth: { x: 0.5, y: 0.46, w: 0.13, h: 0.06 },
  fur: '#8f8d92',
  ink: '#3a302b',
};
