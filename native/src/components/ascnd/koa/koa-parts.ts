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

export const KOA_VIEWBOX = '0 0 240 300';

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
  /** 24 — ground shadow, the only place a flattened oval is acceptable */
  shadow:
    'M120 272 C92 272 70 277 70 283 C70 289 92 294 120 294 ' +
    'C149 294 171 289 171 283 C171 277 149 272 120 272 Z',

  /**
   * MASTER SILHOUETTE — ears, crown, cheeks, waist and body as ONE
   * unbroken Bézier outline. Tuned to the review:
   *  1. head is ~7% taller than wide (was square and heavy)
   *  3. ears are ~40% of head width (were ~31%)
   *  4. the crown carries 3 soft fur bumps instead of a flat dome
   *  5. cheeks bulge below the eyes for a "baby face"
   *  9. body is ~40% of head height — short and round, not long
   */
  silhouette:
    'M120 26 ' +
    'C129 21 138 25 143 33 ' +        // crown fur bump 1
    'C152 25 163 29 169 41 ' +        // crown fur bump 2 → head shoulder
    'C182 24 210 22 222 41 ' +        // RIGHT EAR — big, warped oval
    'C235 60 230 89 209 99 ' +
    'C203 102 197 103 192 102 ' +
    'C196 122 197 143 191 159 ' +     // right cheek bulges out
    'C185 175 171 187 153 191 ' +
    'C161 197 167 208 167 221 ' +     // short, round body
    'C167 241 146 255 120 255 ' +
    'C94 255 73 241 73 221 ' +
    'C73 208 79 197 87 191 ' +
    'C69 187 55 175 49 159 ' +        // left cheek bulge
    'C43 143 44 122 48 102 ' +
    'C43 103 37 102 31 99 ' +         // LEFT EAR
    'C10 89 5 60 18 41 ' +
    'C30 22 58 24 71 41 ' +
    'C77 29 88 25 97 33 ' +           // crown fur bump 3
    'C102 25 111 21 120 26 Z',

  /** inner ears — thicker at the base, tilted outward (fix 2) */
  earLInner:
    'M46 62 C33 55 19 62 15 77 C11 93 19 105 32 106 ' +
    'C44 107 51 97 51 84 C51 74 50 66 46 62 Z',
  earRInner:
    'M196 58 C209 50 224 57 227 72 C231 88 223 101 210 102 ' +
    'C198 103 191 93 191 80 C191 70 192 62 196 58 Z',

  /** face patch — 2px left of centre, never a true oval */
  facePatch:
    'M118 94 C89 93 68 113 69 139 C70 164 93 181 120 180 ' +
    'C148 179 168 162 167 137 C166 111 145 94 118 94 Z',

  /** belly — round, tucked into the short body */
  belly:
    'M120 192 C102 193 91 206 92 222 C93 239 105 250 121 249 ' +
    'C138 248 148 236 147 220 C146 204 136 191 120 192 Z',

  /** arms — short, plump, clearly curved (fix 10) */
  armL: 'M80 190 C66 195 58 212 61 228 C64 241 78 244 84 234 C90 222 89 198 80 190 Z',
  armR: 'M161 187 C175 192 184 210 181 227 C178 240 164 243 158 233 C152 220 152 195 161 187 Z',

  /** legs — short, round, splayed ~8°, left 2px lower */
  legL: 'M101 238 C89 241 83 254 86 265 C90 275 105 276 110 267 C114 257 110 240 101 238 Z',
  legR: 'M141 236 C129 239 124 252 128 263 C132 273 146 274 151 265 C155 255 150 238 141 236 Z',

  /** 13 — nose: teardrop, round base, softly pointed top */
  nose:
    'M120 104 C116 104 112 112 110 121 ' +
    'C108 133 115 143 122 142 ' +
    'C132 141 138 131 136 121 C134 111 127 104 120 104 Z',
  noseShine: 'M116 113 C112 116 111 123 114 125 C118 123 120 116 119 113 Z',

  /** 16/17 — blush, left slightly larger and higher */
  blushL:
    'M60 146 C48 145 41 154 47 161 C54 168 71 166 73 158 C75 150 68 146 60 146 Z',
  blushR:
    'M180 142 C170 141 164 150 169 156 C175 162 188 160 190 153 C192 146 187 142 180 142 Z',
} as const;

/** Rotation pivots — joints, per the animation rules */
export const PIVOTS = {
  /** whole-figure tilt (the silhouette is a single piece) */
  body: { x: 120, y: 230 },
  armL: { x: 79, y: 184 }, // shoulder
  armR: { x: 162, y: 181 },
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
    'M84 88 C70 88 61 103 61 120 C61 138 71 151 84 151 ' +
    'C97 151 107 137 107 119 C107 102 97 88 84 88 Z',
  cx: 84, cy: 119, rx: 23, ry: 32,
};
const EYE_R = {
  well:
    'M159 84 C144 84 134 100 134 118 C134 137 145 152 159 152 ' +
    'C173 152 184 136 184 117 C184 99 173 84 159 84 Z',
  cx: 159, cy: 118, rx: 25, ry: 34,
};

/** 09/10 — pupil: teardrop-ish oval, never centred (pushed up + inward) */
function pupil(E: typeof EYE_L, dy = 0, s = 1): Layer[] {
  const x = E.cx + (E.cx < 120 ? 2.2 : -2.4); // inward
  const y = E.cy - E.ry * 0.16 + dy;          // up
  const rx = E.rx * 0.63 * s;
  const ry = E.ry * 0.68 * s;
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
        `M${x - rx * 0.34} ${y - ry * 0.66} C${x - rx * 0.82} ${y - ry * 0.5} ${x - rx * 0.8} ${y - ry * 0.06} ` +
        `${x - rx * 0.34} ${y - ry * 0.12} C${x + rx * 0.02} ${y - ry * 0.2} ${x + rx * 0.02} ${y - ry * 0.6} ` +
        `${x - rx * 0.34} ${y - ry * 0.66} Z`,
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
        d: 'M102 166 C107 180 130 181 138 168 C132 176 111 175 102 166 Z',
        fill: PALETTE.ink,
      }];
    case 'sad':
      return [{
        d: 'M103 178 C109 166 130 166 137 175 C129 171 111 171 103 178 Z',
        fill: PALETTE.ink,
      }];
    case 'flat':
      return [{
        d: 'M103 170 C112 174 128 173 136 169 C129 176 111 177 103 170 Z',
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
            'M100 166 C104 165 111 168 120 168 ' +
            'C130 168 137 165 141 164 ' +
            'C141 181 128 190 120 190 C112 190 100 182 100 166 Z',
          fill: PALETTE.ink,
        },
        {
          d: 'M108 179 C112 189 130 188 133 177 C125 182 114 182 108 179 Z',
          fill: PALETTE.tongue,
        },
      ];
  }
}
