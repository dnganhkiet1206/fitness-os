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
    'C176 32 192 24 210 25 ' +
    // RIGHT EAR — teardrop, not a circle: narrow at the top, the outer
    // edge is one long flat-ish sweep, the weight sits low
    'C232 26 250 45 250 69 ' +
    'C250 93 236 109 216 114 ' +
    // base is heavy and slides back under the skull
    'C204 117 197 113 193 105 ' +
    // cheek swells low and wide, then the chin tapers in (baby face)
    'C204 121 206 143 199 160 ' +
    'C194 178 178 192 152 199 ' +
    // no waist: the jaw runs straight on into a wide shoulder
    'C175 202 182 213 182 227 ' +
    'C181 247 155 260 120 260 ' +
    'C85 260 59 247 59 226 ' +
    'C58 213 65 202 78 197 ' +
    'C68 192 46 178 41 160 ' +
    'C34 143 36 121 40 103 ' +
    // LEFT EAR — mirrored idea, deliberately a little lower and fuller
    'C40 113 30 117 18 114 ' +
    'C-3 109 -14 91 -12 68 ' +
    'C-11 44 8 25 30 24 ' +
    'C48 25 64 33 74 44 ' +
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
    'M118 92 C98 91 80 100 71 117 ' +
    'C63 131 62 151 71 166 ' +      // má trái loe rộng, thấp
    'C80 179 98 186 120 186 ' +     // cằm patch nhỏ
    'C142 186 160 176 168 164 ' +
    'C177 150 177 131 169 116 ' +   // má phải loe rộng
    'C159 99 140 92 118 92 Z',

  /** belly — smaller, so the shoulders read wide and the head still leads */
  belly:
    'M120 201 C104 202 94 214 95 229 C96 244 107 253 121 252 ' +
    'C136 251 145 240 144 226 C143 211 134 200 120 201 Z',

  /** arms — curved with large rounded ends, never a straight capsule */
  armL: 'M82 192 C62 199 51 220 57 237 C62 252 81 254 88 240 C95 226 94 200 82 192 Z',
  armR: 'M158 189 C178 196 190 218 184 236 C179 251 160 253 153 239 C146 225 146 197 158 189 Z',

  /** legs — 10% shorter, wider feet, splayed outward */
  legL: 'M101 243 C87 246 78 258 82 267 C88 277 110 277 115 268 C119 258 111 245 101 243 Z',
  legR: 'M141 241 C127 244 119 256 123 265 C129 275 149 275 154 266 C158 256 151 243 141 241 Z',

  /** nose — teardrop with a broad base and a softened tip */
  nose:
    'M120 109 C114 109 109 117 107 126 ' +
    'C105 139 113 150 122 149 ' +
    'C134 148 141 136 138 125 C136 114 127 109 120 109 Z',
  noseShine: 'M115 118 C111 121 110 128 113 130 C117 128 119 121 118 118 Z',

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
    'M86 86 C70 87 59 104 57 123 C55 143 67 159 82 159 ' +
    'C97 158 109 141 111 122 C112 103 101 85 86 86 Z',
  cx: 84, cy: 122, rx: 26, ry: 36,
};
const EYE_R = {
  well:
    'M159 84 C142 85 131 102 129 121 ' +
    'C127 142 140 159 155 159 C171 158 185 141 186 120 ' +
    'C187 100 174 83 159 84 Z',
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
        `M${x - rx * 0.40} ${y - ry * 0.74} C${x - rx * 0.82} ${y - ry * 0.5} ${x - rx * 0.8} ${y - ry * 0.06} ` +
        `${x - rx * 0.34} ${y - ry * 0.12} C${x + rx * 0.02} ${y - ry * 0.2} ${x + rx * 0.02} ${y - ry * 0.6} ` +
        `${x - rx * 0.36} ${y - ry * 0.70} Z`,
      fill: PALETTE.white,
    },
    // small secondary highlight, lower-right
    {
      d:
        `M${x + rx * 0.44} ${y + ry * 0.34} C${x + rx * 0.62} ${y + ry * 0.36} ${x + rx * 0.62} ${y + ry * 0.64} ` +
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
        d: 'M96 173 C103 191 137 192 146 174 C138 185 108 184 96 173 Z',
        fill: PALETTE.ink,
      }];
    case 'sad':
      return [{
        d: 'M97 189 C105 174 135 174 144 185 C134 181 108 181 97 189 Z',
        fill: PALETTE.ink,
      }];
    case 'flat':
      return [{
        d: 'M96 178 C108 183 132 182 143 177 C134 187 107 188 96 178 Z',
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
            'M93 172 C100 170 109 176 120 176 ' +
            'C132 176 141 170 148 169 ' +
            'C148 195 132 206 120 206 C108 206 93 195 93 172 Z',
          fill: PALETTE.ink,
        },
        {
          d: 'M103 189 C108 206 135 205 139 186 C128 193 112 193 103 189 Z',
          fill: PALETTE.tongue,
        },
      ];
  }
}
