/**
 * Koa — flat-vector mascot part library.
 *
 * Spec (from the character sheet):
 *  - vector shapes only, NO stroke, NO gradient, NO filter
 *  - flat colours from the fixed palette below
 *  - every body part is its own layer with a stable pivot, so poses and
 *    expressions are made by transforming/swapping layers, never by
 *    redrawing the character
 *
 * Coordinate space: viewBox "0 0 240 300" (portrait). Head is centred on
 * (114, 106); the body sits below and the feet rest near y = 280.
 */

export const KOA_VIEWBOX = '0 0 240 300';

export const PALETTE = {
  body: '#BFC7CF',
  light: '#D7DDE3',
  dark: '#3A4654',
  ink: '#20242A',
  blush: '#F3B5B5',
  shade: '#AEB6BF',
  tongue: '#F0798C',
  white: '#FFFFFF',
} as const;

export type Expression =
  | 'happy'        // vui vẻ
  | 'surprised'    // ngạc nhiên
  | 'eyesClosed'   // cười tít mắt
  | 'confident'    // tự tin
  | 'sad'          // buồn
  | 'tired'        // mệt mỏi
  | 'angry'        // tức giận
  | 'excited'      // thích thú
  | 'blink';

/** Static body/head shapes — asymmetric on purpose so it reads hand-drawn */
export const SHAPES = {
  /** ellipse #AEB6BF @ 40% per spec */
  shadow: 'M114 288 C86 288 66 292 66 296 C66 300 86 304 114 304 C142 304 162 300 162 296 C162 292 142 288 114 288 Z',

  head:
    'M112 34 C68 32 38 60 36 104 C34 148 66 178 112 179 ' +
    'C160 180 190 150 191 106 C192 62 158 36 112 34 Z',
  headLight:
    'M78 52 C56 66 45 86 47 106 C64 90 86 72 108 62 C98 54 88 49 78 52 Z',

  earL:
    'M58 46 C30 38 12 58 15 86 C18 113 42 125 64 112 C83 100 82 55 58 46 Z',
  earLInner:
    'M55 63 C36 57 24 71 27 88 C30 106 48 112 61 101 C72 91 68 68 55 63 Z',
  earR:
    'M170 40 C200 30 220 52 217 82 C214 112 187 124 165 110 C144 96 145 50 170 40 Z',
  earRInner:
    'M172 58 C192 51 205 67 202 86 C199 105 179 111 166 99 C154 88 159 63 172 58 Z',

  /** muzzle / face patch */
  face:
    'M111 92 C78 91 58 112 60 138 C62 162 86 176 114 175 ' +
    'C144 174 164 158 163 132 C162 106 142 93 111 92 Z',

  nose:
    'M112 100 C99 99 90 111 93 124 C96 136 110 142 119 136 ' +
    'C130 129 132 111 125 104 C121 100 116 100 112 100 Z',
  noseShine: 'M103 108 C99 111 98 117 101 119 C105 117 107 111 106 108 Z',

  blushL: 'M56 132 C46 131 41 139 46 144 C52 149 66 147 68 141 C70 135 63 132 56 132 Z',
  blushR: 'M164 136 C156 135 151 142 155 147 C160 151 171 149 173 144 C175 138 170 136 164 136 Z',

  body:
    'M112 164 C74 164 55 194 54 228 C53 262 80 280 116 280 ' +
    'C153 280 174 260 173 226 C172 192 151 164 112 164 Z',
  bodyShade:
    'M112 182 C85 182 69 204 69 230 C69 258 89 271 116 271 ' +
    'C144 271 160 257 159 229 C158 202 139 182 112 182 Z',
  belly:
    'M107 190 C84 191 71 211 72 234 C73 258 90 270 111 269 ' +
    'C134 268 147 253 146 230 C145 207 130 189 107 190 Z',

  armL: 'M63 168 C44 172 34 198 38 224 C42 246 64 250 71 234 C79 215 78 176 63 168 Z',
  armLShade: 'M50 222 C45 232 53 242 62 239 C69 235 68 223 61 219 Z',
  armR: 'M163 164 C183 168 194 194 190 221 C186 244 164 248 157 232 C149 212 149 172 163 164 Z',
  armRShade: 'M176 219 C182 229 174 239 165 236 C158 232 159 220 166 216 Z',

  legL: 'M80 242 C67 245 64 264 69 274 C75 286 96 287 101 275 C106 263 99 243 89 240 Z',
  legLFoot: 'M74 268 C79 278 95 279 99 270 C96 262 79 261 74 268 Z',
  legR: 'M136 239 C123 242 119 261 125 272 C132 285 153 284 157 272 C161 260 154 240 145 237 Z',
  legRFoot: 'M129 265 C134 276 151 276 155 267 C152 259 134 258 129 265 Z',
} as const;

/** Rotation pivots (joint centres) for posing */
export const PIVOTS = {
  head: { x: 114, y: 110 },
  armL: { x: 63, y: 171 },
  armR: { x: 163, y: 167 },
  legL: { x: 84, y: 244 },
  legR: { x: 140, y: 241 },
} as const;

/** Eye geometry — left is slightly smaller/lower for a hand-drawn feel */
const EYE_L = { x: 84, y: 106, rx: 22, ry: 28 };
const EYE_R = { x: 142, y: 102, rx: 24, ry: 30 };

/** Egg-shaped filled pupil (no stroke), wider at the bottom */
function eggPath(x: number, y: number, rx: number, ry: number) {
  return (
    `M${x} ${y - ry} ` +
    `C${x - rx * 0.92} ${y - ry * 0.86} ${x - rx} ${y + ry * 0.45} ${x} ${y + ry} ` +
    `C${x + rx} ${y + ry * 0.45} ${x + rx * 0.92} ${y - ry * 0.86} ${x} ${y - ry} Z`
  );
}

/** Filled crescent (used instead of a stroked arc — spec forbids strokes) */
function crescent(x: number, y: number, w: number, h: number, t: number, flip = false) {
  const d = flip ? -1 : 1;
  return (
    `M${x - w} ${y} ` +
    `C${x - w * 0.45} ${y - h * d} ${x + w * 0.45} ${y - h * d} ${x + w} ${y} ` +
    `C${x + w * 0.45} ${y - (h - t) * d} ${x - w * 0.45} ${y - (h - t) * d} ${x - w} ${y} Z`
  );
}

/** A tapered brow (filled crescent, no stroke) sitting above the eye */
function brow(x: number, y: number, w: number, lift: number, t = 5, mirror = false) {
  const m = mirror ? -1 : 1;
  const x1 = x - w;
  const x2 = x + w;
  const cy = y - lift;
  return (
    `M${x1} ${y + (mirror ? 0 : 0)} ` +
    `C${x1 + w * 0.5} ${cy - 3 * m} ${x2 - w * 0.5} ${cy - 5 * m} ${x2} ${y - lift * 0.35 * m} ` +
    `C${x2 - w * 0.5} ${cy - 5 * m + t} ${x1 + w * 0.5} ${cy - 3 * m + t} ${x1} ${y + t} Z`
  );
}

export interface EyeLayer {
  d: string;
  fill: string;
  opacity?: number;
}

/** Returns every filled shape that makes up the eyes + brows for a mood */
export function eyeShapes(e: Expression): EyeLayer[] {
  const L = EYE_L;
  const R = EYE_R;
  const out: EyeLayer[] = [];

  const pupil = (E: typeof EYE_L, dy = 0, sx = 1, sy = 1) => {
    out.push({ d: eggPath(E.x, E.y + dy, E.rx * sx, E.ry * sy), fill: PALETTE.ink });
    // white highlights (spec: pupil #20242A, white highlight)
    out.push({
      d: eggPath(E.x - E.rx * 0.3, E.y + dy - E.ry * 0.34, E.rx * 0.3, E.ry * 0.28),
      fill: PALETTE.white,
    });
    out.push({
      d: eggPath(E.x + E.rx * 0.28, E.y + dy + E.ry * 0.3, E.rx * 0.15, E.ry * 0.14),
      fill: PALETTE.white,
      opacity: 0.85,
    });
  };

  switch (e) {
    case 'eyesClosed':
      out.push({ d: crescent(L.x, L.y + 4, L.rx * 0.9, 16, 5), fill: PALETTE.ink });
      out.push({ d: crescent(R.x, R.y + 4, R.rx * 0.9, 17, 5), fill: PALETTE.ink });
      break;
    case 'blink':
      out.push({ d: crescent(L.x, L.y, L.rx * 0.85, 11, 4.4, true), fill: PALETTE.ink });
      out.push({ d: crescent(R.x, R.y, R.rx * 0.85, 12, 4.4, true), fill: PALETTE.ink });
      break;
    case 'surprised':
      pupil(L, -1, 1.06, 1.06);
      pupil(R, -1, 1.06, 1.06);
      out.push({ d: brow(74, 58, 16, 9), fill: PALETTE.ink });
      out.push({ d: brow(152, 54, 17, 9, 5, true), fill: PALETTE.ink });
      break;
    case 'sad':
      pupil(L, 4);
      pupil(R, 4);
      out.push({ d: brow(74, 62, 16, -6), fill: PALETTE.ink });
      out.push({ d: brow(152, 58, 17, -6, 5, true), fill: PALETTE.ink });
      break;
    case 'angry':
      pupil(L, 2, 0.9, 0.9);
      pupil(R, 2, 0.9, 0.9);
      out.push({ d: brow(74, 62, 17, -10), fill: PALETTE.ink });
      out.push({ d: brow(152, 58, 18, -10, 5, true), fill: PALETTE.ink });
      break;
    case 'tired':
      pupil(L, 5);
      pupil(R, 5);
      // heavy lids: body-coloured caps that cover the top of each eye
      out.push({
        d: `M${L.x - L.rx - 3} ${L.y - 2} C${L.x - L.rx * 0.4} ${L.y - L.ry * 0.6} ${L.x + L.rx * 0.4} ${L.y - L.ry * 0.6} ${L.x + L.rx + 3} ${L.y - 5} L${L.x + L.rx + 3} ${L.y - L.ry - 8} L${L.x - L.rx - 3} ${L.y - L.ry - 6} Z`,
        fill: PALETTE.body,
      });
      out.push({
        d: `M${R.x - R.rx - 3} ${R.y - 2} C${R.x - R.rx * 0.4} ${R.y - R.ry * 0.6} ${R.x + R.rx * 0.4} ${R.y - R.ry * 0.6} ${R.x + R.rx + 3} ${R.y - 5} L${R.x + R.rx + 3} ${R.y - R.ry - 8} L${R.x - R.rx - 3} ${R.y - R.ry - 6} Z`,
        fill: PALETTE.body,
      });
      out.push({ d: crescent(L.x, L.y - 1, L.rx, 8, 3.6), fill: PALETTE.ink });
      out.push({ d: crescent(R.x, R.y - 4, R.rx, 8, 3.6), fill: PALETTE.ink });
      break;
    case 'confident':
      out.push({ d: crescent(L.x, L.y + 3, L.rx * 0.9, 14, 5), fill: PALETTE.ink });
      pupil(R, 0, 0.94, 0.94);
      out.push({ d: brow(74, 60, 16, -8), fill: PALETTE.ink });
      out.push({ d: brow(152, 56, 17, -8, 5, true), fill: PALETTE.ink });
      break;
    case 'excited':
      // sparkle eyes: four-point stars
      [L, R].forEach((E) => {
        out.push({ d: eggPath(E.x, E.y, E.rx, E.ry), fill: PALETTE.ink });
        const s = E.rx * 0.78;
        out.push({
          d:
            `M${E.x} ${E.y - s} C${E.x + s * 0.22} ${E.y - s * 0.22} ${E.x + s * 0.22} ${E.y - s * 0.22} ${E.x + s} ${E.y} ` +
            `C${E.x + s * 0.22} ${E.y + s * 0.22} ${E.x + s * 0.22} ${E.y + s * 0.22} ${E.x} ${E.y + s} ` +
            `C${E.x - s * 0.22} ${E.y + s * 0.22} ${E.x - s * 0.22} ${E.y + s * 0.22} ${E.x - s} ${E.y} ` +
            `C${E.x - s * 0.22} ${E.y - s * 0.22} ${E.x - s * 0.22} ${E.y - s * 0.22} ${E.x} ${E.y - s} Z`,
          fill: '#F5D65B',
        });
      });
      break;
    default: // happy
      pupil(L);
      pupil(R);
      out.push({ d: brow(74, 60, 16, 7), fill: PALETTE.ink });
      out.push({ d: brow(152, 56, 17, 7, 5, true), fill: PALETTE.ink });
  }
  return out;
}

export type MouthKind = 'open' | 'smile' | 'sad' | 'flat' | 'small';

/** Mouth is an oval/ellipse shape with a pink tongue (spec) */
export function mouthShapes(m: MouthKind): EyeLayer[] {
  switch (m) {
    case 'smile':
      return [{ d: crescent(113, 150, 17, 12, 4.2), fill: PALETTE.ink }];
    case 'sad':
      return [{ d: crescent(113, 154, 15, 9, 4, true), fill: PALETTE.ink }];
    case 'flat':
      return [{ d: crescent(113, 151, 14, 3.4, 3.4), fill: PALETTE.ink }];
    case 'small':
      return [
        { d: eggPath(113, 149, 8, 7), fill: PALETTE.ink },
        { d: eggPath(113, 151, 5, 4), fill: PALETTE.tongue },
      ];
    default: // open smile with tongue
      return [
        {
          d:
            'M95 144 C100 164 127 163 131 143 ' +
            'C120 149 106 149 95 144 Z',
          fill: PALETTE.ink,
        },
        {
          d: 'M102 150 C106 160 122 159 124 149 C117 152 108 152 102 150 Z',
          fill: PALETTE.tongue,
        },
      ];
  }
}
