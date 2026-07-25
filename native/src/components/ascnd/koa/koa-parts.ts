/**
 * Koa — flat-vector mascot part library.
 * Built to the "Koala SVG Construction Manual v1.0".
 *
 * Hard rules honoured here:
 *  - every part is a hand-authored Bézier path; no ellipse/circle/rect is
 *    used to build the character
 *  - flat palette colours only — no stroke, gradient, filter or blur
 *  - layers overlap (ears tuck 10–20% behind the head, eyes sit under the
 *    face patch, nose over the patch, mouth over the nose)
 *  - deliberate ~5% asymmetry: ears, cheeks and mouth differ slightly and
 *    pupils never sit dead-centre
 *  - node counts kept low (head 16–24, ear 10–16, body 12–18, limbs 6–10)
 *
 * Coordinate space: viewBox "0 0 240 300". Head occupies the upper block,
 * the small body tucks beneath it, feet rest near y = 268.
 */

export const KOA_VIEWBOX = '-26 0 292 300';

export const PALETTE = {
  body: '#BFC7CF',
  light: '#D7DDE3',
  dark: '#3A4654',
  ink: '#20242A',
  blush: '#F3B5B5',
  shade: '#AEB6BF',
  white: '#FFFFFF',
  tongue: '#E8657B',
} as const;

export type Expression =
  | 'happy'
  | 'surprised'
  | 'eyesClosed'
  | 'confident'
  | 'sad'
  | 'tired'
  | 'angry'
  | 'excited'
  | 'blink';

export type MouthKind = 'open' | 'smile' | 'sad' | 'flat' | 'small';

/* ── Silhouette-forming shapes (all Bézier) ───────────────────────────── */

export const SHAPES = {
  /** 24 — ground shadow */
  shadow:
    'M120 276 C88 276 64 281 64 287 C64 293 88 298 120 298 ' +
    'C153 298 177 293 177 287 C177 281 153 276 120 276 Z',

  /**
   * MASTER SILHOUETTE — one unbroken outline, sculpted rather than
   * assembled. The contour flows crown → right ear → cheek → shoulder →
   * body → shoulder → cheek → left ear → crown without a single join.
   *
   *  · ears are 58px on a 152px head = 38% (were 21%)
   *  · ears are warped, heavier at the base and tilt outward — the base
   *    merges into the skull instead of sitting beside it
   *  · forehead is wider than the chin; cheeks bulge low ("baby face")
   *  · crown carries two soft fur rises, never a flat dome
   *  · shoulders are wide, the waist never pinches
   */
  silhouette:
    // crown — one long soft dome, no separate "bumps" to read as parts
    'M120 27 ' +
    'C136 24 152 30 163 42 ' +
    // the crown does NOT dip into a valley before the ear; it keeps
    // rising so ear and skull share one mass
    'C174 30 189 20 206 20 ' +
    // RIGHT EAR — teardrop, not a circle: narrow at the top, the outer
    // edge is one long flat-ish sweep, the weight sits low
    'C228 20 246 39 248 63 ' +
    'C250 86 238 104 218 110 ' +
    // base is heavy and slides back under the skull
    'C207 113 199 110 195 104 ' +
    // cheek swells low and wide, then the chin tapers in (baby face)
    'C199 122 200 141 195 158 ' +
    'C190 176 177 190 160 196 ' +
    // no waist: the jaw runs straight on into a wide shoulder
    'C173 201 181 212 181 226 ' +
    'C181 247 155 260 120 260 ' +
    'C85 260 59 247 59 226 ' +
    'C59 212 67 201 80 196 ' +
    'C63 190 50 176 45 158 ' +
    'C40 141 41 122 45 104 ' +
    // LEFT EAR — mirrored idea, deliberately a little lower and fuller
    'C41 111 32 114 21 111 ' +
    'C0 105 -12 86 -10 62 ' +
    'C-8 38 11 19 33 19 ' +
    'C50 19 65 30 76 42 ' +
    'C87 30 104 24 120 27 Z',

  /** inner ears — follow the new, larger ear masses */
  earLInner:
    'M50 56 C31 44 8 54 2 76 C-4 99 10 114 30 115 ' +
    'C48 114 56 100 56 84 C56 71 54 62 49 57 Z',
  earRInner:
    'M190 53 C209 40 232 51 238 73 C244 96 230 112 210 113 ' +
    'C192 112 184 98 184 82 C184 69 186 59 191 54 Z',

  /**
   * face patch — 12 nodes, cheeks flare wide and low then taper to a
   * small chin, so it melts into the skull instead of reading as an oval
   */
  facePatch:
    'M118 94 C95 93 76 102 68 119 ' +
    'C62 132 62 148 70 162 ' +      // má trái loe thấp
    'C78 176 96 187 120 187 ' +     // cằm thu nhỏ
    'C145 187 163 175 170 161 ' +
    'C177 147 176 131 170 118 ' +   // má phải loe
    'C161 101 142 94 118 94 Z',

  /** belly — smaller, so the shoulders read wide and the head still leads */
  belly:
    'M120 200 C105 201 96 212 97 226 C98 240 108 249 121 248 ' +
    'C135 247 143 237 142 224 C141 210 133 199 120 200 Z',

  /** arms — curved with large rounded ends, never a straight capsule */
  armL: 'M80 194 C64 200 55 218 59 234 C63 248 79 250 85 239 C92 226 90 202 80 194 Z',
  armR: 'M160 191 C176 197 186 216 182 233 C178 247 162 249 156 238 C149 224 150 199 160 191 Z',

  /** legs — 10% shorter, wider feet, splayed outward */
  legL: 'M101 242 C88 245 81 258 85 268 C90 278 108 278 112 269 C116 259 111 244 101 242 Z',
  legR: 'M141 240 C128 243 122 256 126 266 C131 276 147 276 152 267 C156 257 151 242 141 240 Z',

  /** nose — teardrop with a broad base and a softened tip */
  nose:
    'M120 106 C115 106 110 113 108 122 ' +
    'C106 134 114 146 122 145 ' +
    'C133 144 140 133 137 122 C135 112 126 106 120 106 Z',
  noseShine: 'M115 115 C111 118 110 125 113 127 C117 125 119 118 118 115 Z',

  /** blush — overlaps the face patch, left larger and lower */
  blushL:
    'M62 152 C49 151 41 161 47 169 C55 177 74 175 76 166 C78 157 70 152 62 152 Z',
  blushR:
    'M180 148 C169 147 162 157 168 164 C175 171 190 169 192 161 C194 152 188 148 180 148 Z',
} as const;

/** Rotation pivots — joints, per the animation rules */
export const PIVOTS = {
  /** whole-figure tilt (the silhouette is a single piece) */
  body: { x: 120, y: 232 },
  armL: { x: 80, y: 197 }, // shoulder
  armR: { x: 160, y: 194 },
} as const;

/** A single filled Bézier layer */
export interface Layer {
  d: string;
  fill: string;
  opacity?: number;
}

/* ── Eyes ─────────────────────────────────────────────────────────────── */
/** 07/08 — vertical oval eye wells, authored as paths (left is smaller) */
const EYE_L = {
  well:
    'M84 86 C68 86 58 104 58 123 C58 143 69 159 84 159 ' +
    'C99 159 110 142 110 122 C110 103 99 86 84 86 Z',
  cx: 84, cy: 122, rx: 26, ry: 36,
};
const EYE_R = {
  well:
    'M157 84 C140 84 130 102 130 121 ' +
    'C130 142 142 159 157 159 C173 159 184 141 184 120 ' +
    'C184 100 173 84 157 84 Z',
  cx: 157, cy: 121, rx: 27, ry: 37,
};

/** 09/10 — pupil: teardrop-ish oval, never centred (pushed up + inward) */
function pupil(E: typeof EYE_L, dy = 0, s = 1): Layer[] {
  const x = E.cx + (E.cx < 120 ? 2.2 : -2.4); // inward
  const y = E.cy - E.ry * 0.16 + dy;          // up
  const rx = E.rx * 0.66 * s;
  const ry = E.ry * 0.71 * s;
  return [
    {
      d:
        `M${x} ${y - ry} C${x - rx * 0.95} ${y - ry * 0.8} ${x - rx} ${y + ry * 0.4} ${x} ${y + ry} ` +
        `C${x + rx} ${y + ry * 0.4} ${x + rx * 0.95} ${y - ry * 0.8} ${x} ${y - ry} Z`,
      fill: PALETTE.ink,
    },
    // 11/12 — big highlight, upper-left
    {
      d:
        `M${x - rx * 0.36} ${y - ry * 0.70} C${x - rx * 0.82} ${y - ry * 0.5} ${x - rx * 0.8} ${y - ry * 0.06} ` +
        `${x - rx * 0.34} ${y - ry * 0.12} C${x + rx * 0.02} ${y - ry * 0.2} ${x + rx * 0.02} ${y - ry * 0.6} ` +
        `${x - rx * 0.36} ${y - ry * 0.70} Z`,
      fill: PALETTE.white,
    },
    // small secondary highlight, lower-right
    {
      d:
        `M${x + rx * 0.4} ${y + ry * 0.3} C${x + rx * 0.62} ${y + ry * 0.36} ${x + rx * 0.62} ${y + ry * 0.64} ` +
        `${x + rx * 0.36} ${y + ry * 0.62} C${x + rx * 0.16} ${y + ry * 0.58} ${x + rx * 0.18} ${y + ry * 0.32} ` +
        `${x + rx * 0.4} ${y + ry * 0.3} Z`,
      fill: PALETTE.white,
      opacity: 0.9,
    },
  ];
}

/** closed / squinting eye — a filled curved wedge, no stroke */
function closedEye(E: typeof EYE_L, up = true, thick = 5.5): Layer {
  const w = E.rx * 0.92;
  const h = up ? 13 : -11;
  const x = E.cx;
  const y = E.cy + (up ? 5 : 1);
  return {
    d:
      `M${x - w} ${y} C${x - w * 0.42} ${y - h} ${x + w * 0.42} ${y - h} ${x + w} ${y} ` +
      `C${x + w * 0.42} ${y - h + thick} ${x - w * 0.42} ${y - h + thick} ${x - w} ${y} Z`,
    fill: PALETTE.ink,
  };
}

/** 11/12 — eyebrow: tapered filled sliver above the eye */
function brow(E: typeof EYE_L, lift: number, tiltIn: number): Layer {
  const w = E.rx * 0.86;
  const x = E.cx;
  const y = E.cy - E.ry - 6;
  const inner = E.cx < 120 ? 1 : -1; // which end tips toward the nose
  const t = 5.2;
  const yi = y - lift + tiltIn * inner;
  const yo = y - lift - tiltIn * inner;
  return {
    d:
      `M${x - w} ${inner > 0 ? yo : yi} ` +
      `C${x - w * 0.3} ${y - lift - 5} ${x + w * 0.3} ${y - lift - 5} ${x + w} ${inner > 0 ? yi : yo} ` +
      `C${x + w * 0.3} ${y - lift - 5 + t} ${x - w * 0.3} ${y - lift - 5 + t} ${x - w} ${(inner > 0 ? yo : yi) + t} Z`,
    fill: PALETTE.ink,
  };
}

/** Heavy lid used by the tired mood — body-coloured cap over the eye */
function lid(E: typeof EYE_L): Layer {
  const w = E.rx + 3;
  const x = E.cx;
  const y = E.cy - 2;
  return {
    d:
      `M${x - w} ${y} C${x - w * 0.4} ${y - E.ry * 0.62} ${x + w * 0.4} ${y - E.ry * 0.62} ${x + w} ${y - 4} ` +
      `L${x + w} ${y - E.ry - 10} L${x - w} ${y - E.ry - 8} Z`,
    fill: PALETTE.body,
  };
}

/** All eye + brow layers for a mood (07–12) */
export function eyeShapes(e: Expression): Layer[] {
  const wells: Layer[] = [
    { d: EYE_L.well, fill: PALETTE.white },
    { d: EYE_R.well, fill: PALETTE.white },
  ];

  switch (e) {
    case 'eyesClosed':
      return [closedEye(EYE_L), closedEye(EYE_R)];
    case 'blink':
      return [closedEye(EYE_L, false), closedEye(EYE_R, false)];
    case 'surprised':
      return [...wells, ...pupil(EYE_L, -2, 1.08), ...pupil(EYE_R, -2, 1.08),
        brow(EYE_L, 9, -2), brow(EYE_R, 9, -2)];
    case 'sad':
      return [...wells, ...pupil(EYE_L, 4), ...pupil(EYE_R, 4),
        brow(EYE_L, 1, 6), brow(EYE_R, 1, 6)];
    case 'angry':
      return [...wells, ...pupil(EYE_L, 2, 0.9), ...pupil(EYE_R, 2, 0.9),
        brow(EYE_L, 2, -8), brow(EYE_R, 2, -8)];
    case 'confident':
      return [closedEye(EYE_L), ...[{ d: EYE_R.well, fill: PALETTE.white }], ...pupil(EYE_R, 0, 0.95),
        brow(EYE_R, 4, -5)];
    case 'tired':
      return [...wells, ...pupil(EYE_L, 5), ...pupil(EYE_R, 5),
        lid(EYE_L), lid(EYE_R),
        closedEye(EYE_L, true, 3.6), closedEye(EYE_R, true, 3.6)];
    case 'excited': {
      const star = (E: typeof EYE_L) => {
        const s = E.rx * 0.8;
        const x = E.cx;
        const y = E.cy;
        return {
          d:
            `M${x} ${y - s} C${x + s * 0.2} ${y - s * 0.2} ${x + s * 0.2} ${y - s * 0.2} ${x + s} ${y} ` +
            `C${x + s * 0.2} ${y + s * 0.2} ${x + s * 0.2} ${y + s * 0.2} ${x} ${y + s} ` +
            `C${x - s * 0.2} ${y + s * 0.2} ${x - s * 0.2} ${y + s * 0.2} ${x - s} ${y} ` +
            `C${x - s * 0.2} ${y - s * 0.2} ${x - s * 0.2} ${y - s * 0.2} ${x} ${y - s} Z`,
          fill: '#F5D65B',
        };
      };
      return [
        { d: EYE_L.well, fill: PALETTE.ink },
        { d: EYE_R.well, fill: PALETTE.ink },
        star(EYE_L), star(EYE_R),
      ];
    }
    default: // happy
      return [...wells, ...pupil(EYE_L), ...pupil(EYE_R),
        brow(EYE_L, 5, 2), brow(EYE_R, 5, 2)];
  }
}

/* ── Mouth (14/15) — own path with corners + tongue, offset 2px left ──── */
export function mouthShapes(m: MouthKind): Layer[] {
  switch (m) {
    case 'smile':
      return [{
        d: 'M99 170 C105 187 134 188 143 172 C136 182 110 181 99 170 Z',
        fill: PALETTE.ink,
      }];
    case 'sad':
      return [{
        d: 'M100 186 C107 172 133 172 141 182 C132 178 110 178 100 186 Z',
        fill: PALETTE.ink,
      }];
    case 'flat':
      return [{
        d: 'M99 175 C110 180 130 179 140 174 C132 183 109 184 99 175 Z',
        fill: PALETTE.ink,
      }];
    case 'small':
      return [
        { d: 'M112 145 C106 146 104 153 108 157 C114 160 121 156 121 150 C121 146 117 144 112 145 Z', fill: PALETTE.ink },
        { d: 'M112 152 C109 152 108 156 111 157 C114 157 116 153 112 152 Z', fill: PALETTE.tongue },
      ];
    default: // open smile with tongue
      return [
        {
          // corners lift, upper lip has thickness, lower lip is deep
          d:
            'M96 170 C102 168 110 173 120 173 ' +
            'C131 173 139 168 145 167 ' +
            'C145 191 130 202 120 202 C110 202 96 192 96 170 Z',
          fill: PALETTE.ink,
        },
        {
          d: 'M105 186 C110 200 133 199 137 184 C127 190 113 190 105 186 Z',
          fill: PALETTE.tongue,
        },
      ];
  }
}
