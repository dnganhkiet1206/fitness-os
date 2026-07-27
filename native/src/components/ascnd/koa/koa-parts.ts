/**
 * Koa — part library for the code-drawn koala, ported 1:1 from the
 * "KOALA MASCOT – SVG DESIGN" spec sheet (Design Component `Koa`).
 *
 * Everything here is pure data: the palette from §2 BẢNG MÀU, the Bézier
 * paths for every layer, and the two lookup tables that turn an
 * `expression` / `pose` prop into the set of layers to draw. The renderer
 * (`koa-figure.tsx`) owns the motion.
 *
 * Coordinate space is the sheet's own: viewBox "0 0 240 300", feet on the
 * floor at y ≈ 293, the ground shadow at y = 294.
 *
 * Layer ids follow the rig contract in
 * native/assets/mascots/KOA_RIG_SPEC.md §1 (head_front, ear_left,
 * eye_left, pupil_left, arm_left_upper, leg_left_lower, torso_front,
 * belly, nose, mouth, tongue, blush_left, eyebrow_left,
 * upper_eyelid_left …) so the vector figure and a future Rive rig stay
 * name-compatible.
 */

export const KOA_VIEWBOX = '0 0 240 300';
export const KOA_W = 240;
export const KOA_H = 300;
/** height / width of the drawing — the figure box keeps the feet on the floor */
export const KOA_ASPECT = KOA_H / KOA_W;

/** §2 BẢNG MÀU — the only colours the character is allowed to use. */
export const PALETTE = {
  body: '#BFC7CF',
  light: '#D7DDE3',
  dark: '#3A4654',
  ink: '#20242A',
  blush: '#F3B5B5',
  shadow: '#AEB6BF',
  /** the slightly deeper shade used for form lines inside the body */
  shade: '#A9B2BC',
  /** hairline outline on head/ears so the silhouette reads on dark rooms */
  outline: '#B7BFC8',
  white: '#FFFFFF',
  tongue: '#E8657B',
  /** accents that only appear in props (star eyes, gear, cap, speed lines) */
  star: '#FBD24E',
  speed: '#C7CFD8',
  sweat: '#7FD3F5',
  /** the run's headband + singlet */
  kit: '#3FA9E5',
  kitShade: '#2E8FCB',
  /** limbs on the far side of a turned body — never the same tone as near */
  far: '#9AA4AF',
  /** the tank top is a different colour per pose, straight off the sheet */
  tankLift: '#63B948',
  tankStretch: '#F2C13D',
  tankRelax: '#F59A2E',
  gear: '#6E7681',
  weight: '#3A4654',
  weightMid: '#55606E',
} as const;

export type KoaExpression =
  | 'happy'
  | 'surprised'
  | 'grin'
  | 'confident'
  | 'sad'
  | 'tired'
  | 'angry'
  | 'delighted'
  | 'happytired';

export type KoaPose = 'idle' | 'running' | 'lifting' | 'stretching' | 'relaxing';

/** §3 BIỂU CẢM — the eight states of the sheet, in spec order. */
export const KOA_EXPRESSIONS: { key: KoaExpression; label: string }[] = [
  { key: 'happy', label: 'VUI VẺ' },
  { key: 'surprised', label: 'NGẠC NHIÊN' },
  { key: 'grin', label: 'CƯỜI TÍT MẮT' },
  { key: 'confident', label: 'TỰ TIN' },
  { key: 'sad', label: 'BUỒN' },
  { key: 'tired', label: 'MỆT MỎI' },
  { key: 'angry', label: 'TỨC GIẬN' },
  { key: 'delighted', label: 'THÍCH THÚ' },
];

/* ── expression → face layers ─────────────────────────────────────────── */

export interface FaceFlags {
  eyesOpen: boolean;
  eyesWide: boolean;
  eyesArc: boolean;
  eyesStar: boolean;
  lidsHalf: boolean;
  lidsWink: boolean;
  lidsHeavy: boolean;
  lidsSad: boolean;
  browArc: boolean;
  browRaised: boolean;
  browSad: boolean;
  browAngry: boolean;
  mouthSmile: boolean;
  mouthGrin: boolean;
  mouthBreath: boolean;
  mouthO: boolean;
  mouthSmirk: boolean;
  mouthFrown: boolean;
  mouthFlat: boolean;
  mouthShout: boolean;
  showSteam: boolean;
  showHearts: boolean;
}

const OPEN_EYES: KoaExpression[] = ['happy', 'confident', 'sad', 'tired', 'angry', 'happytired'];

export function faceFlags(e: KoaExpression): FaceFlags {
  return {
    eyesOpen: OPEN_EYES.includes(e),
    eyesWide: e === 'surprised',
    eyesArc: e === 'grin',
    eyesStar: e === 'delighted',
    lidsHalf: e === 'confident',
    lidsWink: e === 'happytired',
    lidsHeavy: e === 'tired',
    lidsSad: e === 'sad',
    browArc: e === 'happy' || e === 'grin' || e === 'delighted' || e === 'happytired',
    browRaised: e === 'surprised',
    browSad: e === 'sad',
    browAngry: e === 'angry',
    mouthSmile: e === 'happy' || e === 'delighted',
    mouthGrin: e === 'grin' || e === 'happytired',
    mouthBreath: e === 'happytired',
    mouthO: e === 'surprised',
    mouthSmirk: e === 'confident',
    mouthFrown: e === 'sad',
    mouthFlat: e === 'tired',
    mouthShout: e === 'angry',
    showSteam: e === 'angry',
    showHearts: e === 'delighted',
  };
}

/* ── pose → body layers + the 3/4 turn transforms ─────────────────────── */

export interface PoseFlags {
  armsIdle: boolean;
  poseRun: boolean;
  poseLift: boolean;
  poseStretch: boolean;
  poseRelax: boolean;
  legsStand: boolean;
  legsSit: boolean;
  /** running turns the figure to the right — every group below shifts with it */
  turn: boolean;
}

export function poseFlags(p: KoaPose): PoseFlags {
  return {
    armsIdle: p === 'idle',
    poseRun: p === 'running',
    poseLift: p === 'lifting',
    poseStretch: p === 'stretching',
    poseRelax: p === 'relaxing',
    legsStand: p === 'idle' || p === 'lifting' || p === 'stretching',
    legsSit: p === 'relaxing',
    turn: p === 'running',
  };
}

/**
 * The running pose is a 3/4 turn to the right. The sheet expresses it as a
 * chain of SVG transforms; here each one is a nested <G> so react-native-svg
 * gets plain numeric props (it composes the same matrix).
 */
export const TURN = {
  /** whole figure: rotate(4 120 288) then scaleX .91 about x=120 */
  bodyRotate: 4,
  bodyRotateOx: 120,
  bodyRotateOy: 288,
  bodyScaleX: 0.91,
  bodyScaleOx: 120,
  /** head: rotate(-5 120 170) then scaleX .99 about x=120 */
  headRotate: -5,
  headRotateOx: 120,
  headRotateOy: 170,
  headScaleX: 0.99,
  /** belly: scaleX .9 about (120,228) then translate(13,0) */
  bellyScaleX: 0.9,
  bellyOx: 120,
  bellyOy: 228,
  bellyDx: 13,
  /** shadow: scaleX .92 about (120,294) */
  shadowScaleX: 0.92,
  shadowOx: 120,
  shadowOy: 294,
  faceDx: 18,
  earDx: 14,
  earLeftDx: -19,
} as const;

/* ── pivots (transform-origin of every animated group) ────────────────── */

export const PIVOTS = {
  body: { x: 120, y: 279 },
  head: { x: 120, y: 180 },
  earLeft: { x: 62, y: 92 },
  earRight: { x: 178, y: 92 },
  armLeft: { x: 80, y: 178 },
  armRight: { x: 160, y: 178 },
  runBody: { x: 120, y: 290 },
  shadow: { x: 120, y: 294 },
  eyes: { x: 120, y: 96 },
  /**
   * Blink pivot — the LASH LINE, and the one place we deliberately leave the
   * sheet. Given in FACE-LOCAL coords, so it is used raw (no `hy()`).
   *
   * The sheet pivots the lid at view-box y=72, which resolves to face-local
   * y=61 — 11px above the eye, level with the eyebrows. Verified against the
   * design running in a browser: the lid really does unroll from the brow
   * line there, which is what makes the blink catch the eye. The author asked
   * for it to start at the eyelid instead. The eye ellipse tops out at 72.5
   * and the lid at 71, so face-local 72 IS the lash line: at scaleY 0 the lid
   * is a flat line exactly along the top of the eye, and it never reaches the
   * brows at any point in the blink.
   */
  lashLine: { x: 120, y: 72 },
  mouth: { x: 120, y: 138 },
  curlLeft: { x: 84, y: 184 },
  curlRight: { x: 156, y: 184 },
  stretchArm: { x: 88, y: 176 },
  starLeft: { x: 82, y: 96 },
  starRight: { x: 158, y: 96 },
  /** where the head meets the shoulders — the cheek pop squashes onto it */
  cheekPop: { x: 120, y: 179 },
} as const;

/* ── body ─────────────────────────────────────────────────────────────── */

export const BODY = {
  /** LEGS — standing pair (idle / lifting / stretching) */
  legLeftLower:
    'M104 252 C 114 254 117 268 117 279 C 117 288 111 293 100 293 ' +
    'C 88 293 78 292 74 287 C 70 281 71 268 77 260 C 84 253 96 250 104 252 Z',
  legRightLower:
    'M136 252 C 126 254 123 268 123 279 C 123 288 129 293 140 293 ' +
    'C 152 293 162 292 166 287 C 170 281 169 268 163 260 C 156 253 144 250 136 252 Z',
  shinLeft:
    'M104 256 C 112 262 115 271 115.5 284 C 115.5 287 113.6 287 113.3 284 ' +
    'C 112.6 272 109 264 101 259 Z',
  shinRight:
    'M136 256 C 128 262 125 271 124.5 284 C 124.5 287 126.4 287 126.7 284 ' +
    'C 127.4 272 131 264 139 259 Z',

  /** TORSO */
  torsoFront:
    'M120 140 C 96 140 72 154 66 182 C 63 200 63 224 67 244 ' +
    'C 71 264 92 279 120 279 C 148 279 169 264 173 244 ' +
    'C 177 224 177 200 174 182 C 168 154 144 140 120 140 Z',
  belly:
    'M120 188 C 142 188 155 202 155 223 C 155 244 148 263 134 268 ' +
    'C 126 271 114 271 106 268 C 92 263 85 244 85 223 C 85 202 98 188 120 188 Z',
  chestLine: 'M85 174 C 100 181 140 181 155 174 C 151 189 89 189 85 174 Z',

  /** ARMS — idle */
  armLeftUpper:
    'M68 171 C 51 188 40 208 37 228 C 35 242 58 248 65 234 ' +
    'C 72 220 79 209 89 199 C 92 181 76 164 68 171 Z',
  armRightUpper:
    'M172 171 C 189 188 200 208 203 228 C 205 242 182 248 175 234 ' +
    'C 168 220 161 209 151 199 C 148 181 164 164 172 171 Z',
  armLeftCrease:
    'M71.5 192 C 66.0 200 63.5 226 65.0 237 C 65.5 238.8 67.0 238.3 66.5 236 ' +
    'C 65.2 226 67.5 203 72.0 192.6 C 72.3 191.8 71.8 191.5 71.5 192 Z',
  armRightCrease:
    'M168.5 192 C 174.0 200 176.5 226 175.0 237 C 174.5 238.8 173.0 238.3 173.5 236 ' +
    'C 174.8 226 172.5 203 168.0 192.6 C 167.7 191.8 168.2 191.5 168.5 192 Z',

  /** sitting: the legs fold into a cushion (relaxing) */
  sitLegs:
    'M66 268 C 84 252 156 252 174 268 C 182 278 176 290 160 292 ' +
    'C 132 296 108 296 80 292 C 64 290 58 278 66 268 Z',
  sitCrease: 'M74 272 C 96 288 144 288 166 272',
} as const;

/* ── head ─────────────────────────────────────────────────────────────── */

export const HEAD = {
  front:
    'M40 118 C 38 86 52 52 78 42 C 92 36 106 34 120 34 C 136 34 152 38 164 46 ' +
    'C 188 58 200 88 200 118 C 200 144 168 168 120 168 C 72 168 40 144 40 118 Z',
  /** two soft fur rises on the crown, never a flat dome */
  topFurA: 'M130 48 C 132 37 131 26 124 21 C 118 17 112 21 114 27 C 116 34 116 41 116 48 Z',
  topFurB: 'M120 48 C 120 40 117 33 111 29 C 105 26 100 30 104 35 C 107 39 109 43 109 48 Z',
  topFurFill: 'M99 38 L141 38 L141 66 L99 66 Z',
  earLeft:
    'M20 30 C 26 18 38 12 52 12 C 74 12 92 32 92 60 C 92 82 84 100 66 104 ' +
    'C 59 108 53 104 49 98 C 44 104 35 102 31 94 C 25 97 17 92 16 84 ' +
    'C 10 83 8 75 12 70 C 7 66 8 59 12 57 C 8 53 9 47 13 45 ' +
    'C 10 41 12 35 16 34 C 15 31 17 29 20 30 Z',
  earRight:
    'M220 30 C 214 18 202 12 188 12 C 166 12 148 32 148 60 C 148 82 156 100 174 104 ' +
    'C 181 108 187 104 191 98 C 196 104 205 102 209 94 C 215 97 223 92 224 84 ' +
    'C 230 83 232 75 228 70 C 233 66 232 59 228 57 C 232 53 231 47 227 45 ' +
    'C 230 41 228 35 224 34 C 225 31 223 29 220 30 Z',
  earLeftInner:
    'M54 27.3 C 71.7 27.3 80.6 40.6 79.1 55.3 C 77.6 68.6 65.8 80.4 51.1 78.9 ' +
    'C 39.3 77.4 32.8 67.1 34.3 53.8 C 35.8 39.1 43.1 27.3 54 27.3 Z',
  earRightInner:
    'M186 27.3 C 168.3 27.3 159.4 40.6 160.9 55.3 C 162.4 68.6 174.2 80.4 188.9 78.9 ' +
    'C 200.7 77.4 207.2 67.1 205.7 53.8 C 204.2 39.1 196.9 27.3 186 27.3 Z',
  nose:
    'M120 84 C 128 84 131 94 133 104 C 135 115 130 126 120 126 ' +
    'C 110 126 105 115 107 104 C 109 94 112 84 120 84 Z',
  nostrilLeft: 'M111 117 Q114 121 117 118',
  nostrilRight: 'M123 118 Q126 121 129 117',
  philtrum: 'M120 126 L120 130',
} as const;

/* ── face: eyes, lids, brows, mouths ──────────────────────────────────── */

export const FACE = {
  /** open eyes (§3 default) — sclera, pupil, two highlights per eye */
  eye: { left: { cx: 82, cy: 96 }, right: { cx: 158, cy: 96 }, rx: 18, ry: 23.5 },
  pupil: { left: { cx: 87, cy: 99 }, right: { cx: 153, cy: 99 }, rx: 12, ry: 16 },

  /** grin / wink — closed arcs */
  arcLeft: 'M64 101 Q82 80 100 101',
  arcRight: 'M140 101 Q158 80 176 101',

  /** star eyes (delighted) */
  starLeft: 'M82 80 L87.5 91 L98 96 L87.5 101 L82 112 L76.5 101 L66 96 L76.5 91 Z',
  starRight: 'M158 80 L163.5 91 L174 96 L163.5 101 L158 112 L152.5 101 L142 96 L152.5 91 Z',

  /** half lids (confident) */
  lidHalfLeft: 'M64 96 A18 23.5 0 0 1 100 96 Z',
  lidHalfRight: 'M140 96 A18 23.5 0 0 1 176 96 Z',
  lidHalfLineLeft: 'M65 95 Q82 99 99 95',
  lidHalfLineRight: 'M141 95 Q158 99 175 95',

  /** heavy lids (tired) */
  lidHeavyLeft: 'M64 104 A18 23.5 0 0 1 100 104 Z',
  lidHeavyRight: 'M140 104 A18 23.5 0 0 1 176 104 Z',
  lidHeavyLineLeft: 'M65 103 Q82 108 99 103',
  lidHeavyLineRight: 'M141 103 Q158 108 175 103',

  /** sad lids — the outer corners drop */
  lidSadLeft: 'M64 92 A18 23.5 0 0 1 100 88 Z',
  lidSadRight: 'M140 88 A18 23.5 0 0 1 176 92 Z',
  lidSadLineLeft: 'M65 90 Q82 94 99 87',
  lidSadLineRight: 'M141 87 Q158 94 175 90',

  /** brows */
  browArcLeft: 'M74 65 Q80.5 57.5 89 61',
  browArcRight: 'M166 65 Q159.5 57.5 151 61',
  browRaisedLeft: 'M71 54 Q82 46 93 54',
  browRaisedRight: 'M147 54 Q158 46 169 54',
  browSadLeft: 'M66 72 Q80 60 97 66',
  browSadRight: 'M174 72 Q160 60 143 66',
  browAngryMaskLeft: 'M60 90 A18 23.5 0 0 1 104 78 L104 68 L60 68 Z',
  browAngryMaskRight: 'M180 90 A18 23.5 0 0 0 136 78 L136 68 L180 68 Z',
  browAngryLeft: 'M62 58 L104 86',
  browAngryRight: 'M178 58 L136 86',
  angryTickLeft: 'M113 58 L109 72',
  angryTickRight: 'M127 58 L131 72',

  /** mouths */
  smile: 'M106 128 Q120 137 134 128 Q133 140 127 143 Q120 146 113 143 Q107 140 106 128 Z',
  smileLip: 'M106 128 Q120 137 134 128',
  grin: 'M104 128 Q120 139 136 128 Q135 141 128 145 Q120 148 112 145 Q105 141 104 128 Z',
  grinLip: 'M104 128 Q120 139 136 128',
  smirk: 'M113 132 Q126 146 137 130 Q125 137 113 132 Z',
  frown: 'M108 142 Q120 131 132 142',
  flat: 'M110 138 Q120 143 130 138',
  shout: 'M102 127 Q120 138 138 127 Q139 149 129 155 Q120 158 111 155 Q101 149 102 127 Z',
  shoutLip: 'M102 127 Q120 138 138 127',
  shoutInnerLip: 'M106 128 Q120 138 134 128',
  toothLeft: 'M107 131 L111 137 L115 131 Z',
  toothRight: 'M125 131 L129 137 L133 131 Z',

  blush: { left: { cx: 66, cy: 121, rot: -10 }, right: { cx: 174, cy: 121, rot: 10 }, rx: 8, ry: 6 },
} as const;

/* ── props that ride on an expression / pose ──────────────────────────── */

/** anger steam — two puffs of three rings, one per side of the head */
export const STEAM = [
  { cx: 28, cy: 26, r: 7 },
  { cx: 40, cy: 16, r: 6 },
  { cx: 18, cy: 14, r: 5 },
  { cx: 212, cy: 26, r: 7 },
  { cx: 200, cy: 16, r: 6 },
  { cx: 222, cy: 14, r: 5 },
] as const;

export const HEARTS = [
  {
    d: 'M214 84 C 214 78 222 76 224 82 C 226 76 234 78 234 84 C 234 91 224 98 224 98 C 224 98 214 91 214 84 Z',
    ox: 224,
    oy: 88,
    delay: 0,
    opacity: 1,
  },
  {
    d: 'M204 110 C 204 106 209 105 210 109 C 211 105 216 106 216 110 C 216 115 210 120 210 120 C 210 120 204 115 204 110 Z',
    ox: 210,
    oy: 112,
    delay: 700,
    opacity: 0.85,
  },
] as const;

/** running: speed lines behind the figure */
export const SPEED_LINES = [
  { d: 'M6 150 H44', w: 5, delay: 0 },
  { d: 'M2 186 H32', w: 4, delay: 250 },
  { d: 'M10 218 H40', w: 4.5, delay: 550 },
  { d: 'M0 252 H26', w: 3.5, delay: 800 },
] as const;

/** running: ground dust kicked up at the heels */
export const DUST = [
  { cx: 76, cy: 290, rx: 11, ry: 6, delay: 0 },
  { cx: 62, cy: 284, rx: 8, ry: 5, delay: 500 },
  { cx: 86, cy: 294, rx: 6.5, ry: 4, delay: 950 },
] as const;

/** running: sweat drops, each rotated to fly away from the head */
export const SWEAT = [
  {
    d: 'M24 72 C 24 64.5 30.25 55.75 30.25 55.75 C 30.25 55.75 36.5 64.5 36.5 72 C 36.5 78.25 33.375 82 30.25 82 C 27.125 82 24 78.25 24 72 Z',
    rot: 55,
    ox: 30.25,
    oy: 72,
    dir: 'left' as const,
    dur: 2600,
    delay: 0,
    opacity: 0.95,
  },
  {
    d: 'M200 68 C 200 61.7 205.25 54.35 205.25 54.35 C 205.25 54.35 210.5 61.7 210.5 68 C 210.5 73.25 207.875 76.4 205.25 76.4 C 202.625 76.4 200 73.25 200 68 Z',
    rot: -55,
    ox: 205.25,
    oy: 68,
    dir: 'right' as const,
    dur: 3000,
    delay: 900,
    opacity: 0.75,
  },
  {
    d: 'M16 124 C 16 118.9 20.25 112.95 20.25 112.95 C 20.25 112.95 24.5 118.9 24.5 124 C 24.5 128.25 22.375 130.8 20.25 130.8 C 18.125 130.8 16 128.25 16 124 Z',
    rot: 62,
    ox: 20.25,
    oy: 124,
    dir: 'left' as const,
    dur: 2700,
    delay: 1400,
    opacity: 0.6,
  },
  {
    d: 'M206 128 C 206 121.1 211.75 113.05 211.75 113.05 C 211.75 113.05 217.5 121.1 217.5 128 C 217.5 133.75 214.625 137.2 211.75 137.2 C 208.875 137.2 206 133.75 206 128 Z',
    rot: -62,
    ox: 211.75,
    oy: 128,
    dir: 'right' as const,
    dur: 2500,
    delay: 400,
    opacity: 0.9,
  },
  {
    d: 'M112 26 C 112 21.2 116 15.6 116 15.6 C 116 15.6 120 21.2 120 26 C 120 30 118 32.4 116 32.4 C 114 32.4 112 30 112 26 Z',
    rot: 4,
    ox: 116,
    oy: 26,
    dir: 'up' as const,
    dur: 2900,
    delay: 1800,
    opacity: 0.65,
  },
] as const;

/**
 * running: the blue headband of §5 CHẠY BỘ.
 *
 * Head-local, so it rides the head rig. It follows the skull's own curve —
 * a flatter or wider arc immediately reads as earmuffs — and sits on the
 * brow line, which is why the run drops the eyebrows.
 */
export const HEADBAND = {
  band: 'M47 80 C 56 52 88 44 120 44 C 152 44 184 52 193 80',
  width: 16,
  /** the little woven tag on the near side */
  tag: { x: 163, y: 50, width: 9, height: 15, rx: 3, rot: 16, ox: 167, oy: 57 },
} as const;

/**
 * running: a two-bone stride.
 *
 * The sheet's runner has legs that clearly leave the silhouette — the old
 * rigid leg blobs stayed hidden behind the torso the whole cycle, which is
 * why it read as standing still. Each limb is now hip → knee → ankle (and
 * shoulder → elbow → wrist), each joint rotating on its own 4-key cycle:
 *
 *   reach → stance → push-off → recovery
 *
 * The far side runs the same cycle half a stride out of phase and in a
 * darker tone, so near and far limbs never merge into one shape.
 *
 * PROPORTIONS ARE FIXED BY THE ORIGINAL DRAWING — do not slim or stretch
 * the limbs to make a stride read better. Measured off the sheet's own art:
 *   · standing leg   `legLeftLower`  = 43 tall (hip 250 → foot 293), 47 wide
 *   · idle arm       `armLeftUpper`  = 77 long from the shoulder, ~28 thick
 *   · every other pose's limb        = a 26-wide tube with an r13.5 hand
 * so the run uses 20+18 (+10 foot) legs at 33/29, and 30+29 arms at 26/24.
 * Only the ANGLES below are free to change.
 */
export const RUN = {
  hipNear: { x: 134, y: 246 },
  hipFar: { x: 102, y: 245 },
  shoulderNear: { x: 152, y: 178 },
  shoulderFar: { x: 90, y: 178 },
  thigh: 20,
  shin: 18,
  thighW: 33,
  shinW: 29,
  footRx: 15,
  footRy: 10,
  upper: 30,
  fore: 29,
  upperW: 26,
  foreW: 24,
  handR: 13.5,
  /**
   * FORESHORTENED FOR THE 3/4 VIEW — these are not side-view angles.
   *
   * The sheet draws the turned body with `scale(0.91,1)`, i.e. its width is
   * compressed to 91%, so the figure is turned only ~24.5° off front — the
   * amount you can read in the head and face. Fore/aft motion therefore
   * projects onto screen-x by sin(24.5°) ≈ 0.41, and a full sagittal stride
   * (foot travelling 61 units across) reads as a pure side view against a
   * body that is barely turned. These keys put the foot's horizontal travel
   * at 31 units, so the legs stay under the body the way a 3/4 view demands.
   * If the turn ever changes, re-derive from the new scaleX — do not just
   * open the angles up.
   */
  thighKeys: [-24, -4, 24, -14],
  kneeKeys: [10, 4, 12, 80],
  /**
   * Arms swing against the legs of the same side.
   *
   * SIGNS MATTER, and they are not symmetric. Koa runs to the RIGHT, and a
   * negative rotation here carries a limb's far end toward +x — forward.
   * The elbow only folds one way: toward the front of the body, so the
   * forearm's angle relative to the upper arm is always NEGATIVE. Positive
   * elbow keys bend the arm backwards and the whole figure reads as running
   * one way while reaching the other.
   * The elbow stays near 74° through the cycle; the swing comes from the
   * shoulder, which is how a runner actually carries their arms.
   */
  upperKeys: [20, 4, -18, 2],
  elbowKeys: [-64, -60, -62, -60],
  /** the body rises twice a stride and leans into the run */
  bob: 6,
  lean: 4,
  /**
   * The singlet is OFF for now, at the author's request, so the pose can be
   * judged on the body alone. Flip back to true to dress the run again —
   * nothing else needs touching.
   */
  wearKit: false,
} as const;

/** lifting / stretching / relaxing all wear the same tank + shorts */
export const GEAR = {
  tank:
    'M82 172 C 72 180 68 192 67 206 C 66 222 68 238 72 250 C 92 258 148 258 168 250 ' +
    'C 172 238 174 222 173 206 C 172 192 168 180 158 172 ' +
    'C 150 186 138 192 120 192 C 102 192 90 186 82 172 Z',
  shorts:
    'M69 244 C 90 252 150 252 171 244 C 172 258 168 270 160 275 ' +
    'C 150 279 132 280 122 274 C 120 272 120 272 118 274 ' +
    'C 108 280 90 279 80 275 C 72 270 68 258 69 244 Z',
  shoulderLeft: { cx: 71, cy: 193, rx: 15, ry: 17, rot: 16 },
  shoulderRight: { cx: 169, cy: 193, rx: 15, ry: 17, rot: -16 },
} as const;

/** lifting: the curling forearms + dumbbells */
export const LIFT = {
  armLeft: 'M84 184 C 70 196 66 212 76 222',
  armRight: 'M156 184 C 170 196 174 212 164 222',
  handLeft: { cx: 78, cy: 222, r: 13.5 },
  handRight: { cx: 162, cy: 222, r: 13.5 },
  /** dumbbell plates, drawn around each hand */
  bellLeft: { x: 70, y: 206, midX: 74, midY: 214 },
  bellRight: { x: 154, y: 206, midX: 158, midY: 214 },
} as const;

/** stretching: one arm reaches overhead, the other rests on the hip */
export const STRETCH = {
  reach: 'M90 176 C 62 162 56 92 92 62 C 112 48 134 56 140 74',
  reachHand: { cx: 142, cy: 78, r: 12.5 },
  restArm: 'M156 184 C 172 196 176 212 164 220',
  restHand: { cx: 162, cy: 220, r: 13.5 },
} as const;

/** relaxing: both arms plant on the floor beside the sitting body */
export const RELAX = {
  armLeft: 'M80 194 C 64 220 74 252 98 266',
  armRight: 'M160 194 C 176 220 166 252 142 266',
  handLeft: { cx: 100, cy: 266, r: 13.5 },
  handRight: { cx: 140, cy: 266, r: 13.5 },
} as const;

/* ── outfit layers (shop unlocks) ─────────────────────────────────────── */

/**
 * Outfits are drawn in head/body space so they ride the rig. They are kept
 * deliberately simple — the sheet has not specified outfit art yet, so these
 * only have to sit correctly and read at thumbnail size.
 */
export const OUTFIT = {
  /** head-local (inside the head's translate(0,11)) */
  headband: { x: 44, y: 56, width: 152, height: 17, rx: 8 },
  capBrim: 'M40 62 A80 62 0 0 1 200 62 L200 72 L40 72 Z',
  sunglassLeft: { x: 58, y: 82, width: 52, height: 30, rx: 13 },
  sunglassRight: { x: 130, y: 82, width: 52, height: 30, rx: 13 },
  sunglassBridge: 'M110 95 h20',
  /** root space, on the torso */
  medalRibbon: 'M104 150 L120 186 L136 150',
  medal: { cx: 120, cy: 194, r: 13 },
  belt: { x: 74, y: 236, width: 92, height: 18, rx: 6 },
  beltBuckle: { x: 110, y: 239, width: 20, height: 12, rx: 3 },
} as const;
