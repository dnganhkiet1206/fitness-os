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
   * MASTER SILHOUETTE — ears, head, cheeks, waist and body are ONE
   * continuous Bézier outline (18 nodes). Drawing them as separate
   * stacked blobs is what made earlier versions read as glued-together
   * ellipses; here the contour never breaks, so the form reads sculpted.
   */
  silhouette:
    'M120 34 ' +
    'C142 32 160 38 173 50 ' +
    'C184 33 210 28 224 44 ' +      // right ear grows out of the skull
    'C240 61 238 92 220 104 ' +
    'C213 109 205 111 198 110 ' +
    'C197 133 190 154 176 167 ' +   // right cheek flows down
    'C173 170 170 172 167 174 ' +
    'C172 184 175 198 175 213 ' +   // straight into the small body
    'C175 240 152 259 121 260 ' +
    'C90 261 66 242 66 214 ' +
    'C66 199 69 185 74 175 ' +
    'C71 173 68 171 65 168 ' +
    'C51 155 44 134 43 111 ' +      // left cheek back up
    'C36 112 28 110 21 104 ' +
    'C4 91 3 61 19 45 ' +           // left ear
    'C34 30 60 34 71 51 ' +
    'C84 39 100 35 120 34 Z',

  /** inner ears — detail drawn over the silhouette, hiding any seam */
  earLInner:
    'M42 66 C30 58 17 63 13 76 C9 90 15 102 26 104 C37 106 45 97 46 85 C47 76 46 70 42 66 Z',
  earRInner:
    'M199 62 C211 54 225 60 228 74 C231 88 224 100 213 101 C202 102 195 93 195 81 C195 72 196 66 199 62 Z',

  /** face patch — pushed 2px left of centre, never a true oval */
  facePatch:
    'M118 92 C90 91 70 110 71 135 C72 159 94 175 120 174 ' +
    'C147 173 166 157 165 133 C164 108 144 92 118 92 Z',

  /** belly — small vertical form tucked into the body */
  belly:
    'M120 186 C101 187 89 203 90 222 C91 241 104 253 121 252 ' +
    'C139 251 150 238 149 219 C148 200 137 185 120 186 Z',

  /** arms — curved capsules that overlap deep into the torso */
  armL: 'M77 180 C62 186 54 208 58 227 C62 243 77 246 84 234 C91 220 89 190 77 180 Z',
  armR: 'M164 177 C179 183 188 205 184 224 C180 240 165 243 158 231 C151 217 152 187 164 177 Z',

  /**
   * legs — short capsules splayed ~8° outward, tucked deep under the body
   * so the join never shows. Left sits 2px lower (deliberate asymmetry).
   */
  legL: 'M99 238 C86 241 79 256 82 268 C86 279 103 280 108 270 C113 259 109 240 99 238 Z',
  legR: 'M143 236 C130 239 124 254 128 266 C132 277 148 278 153 268 C158 257 153 238 143 236 Z',

  /** 13 — nose: teardrop, round base, softly pointed top */
  nose:
    'M120 98 C112 98 105 108 106 119 ' +
    'C107 131 116 139 124 136 ' +
    'C134 132 138 118 134 108 C131 101 126 98 120 98 Z',
  noseShine: 'M113 106 C108 109 107 116 110 118 C114 116 116 109 115 106 Z',

  /** 16/17 — blush, left slightly larger and higher */
  blushL:
    'M62 130 C51 129 45 137 50 143 C56 149 71 147 73 140 C75 133 69 130 62 130 Z',
  blushR:
    'M170 134 C161 133 156 141 160 146 C166 151 177 149 179 143 C181 137 176 134 170 134 Z',
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
    'M89 84 C76 84 68 98 68 113 C68 129 77 141 89 141 ' +
    'C101 141 110 128 110 112 C110 97 101 84 89 84 Z',
  cx: 89, cy: 112, rx: 21, ry: 29,
};
const EYE_R = {
  well:
    'M153 80 C139 80 130 95 130 111 C130 128 140 141 153 141 ' +
    'C166 141 176 127 176 110 C176 94 166 80 153 80 Z',
  cx: 153, cy: 110, rx: 23, ry: 31,
};

/** 09/10 — pupil: teardrop-ish oval, never centred (pushed up + inward) */
function pupil(E: typeof EYE_L, dy = 0, s = 1): Layer[] {
  const x = E.cx + (E.cx < 120 ? 2.2 : -2.4); // inward
  const y = E.cy - E.ry * 0.16 + dy;          // up
  const rx = E.rx * 0.62 * s;
  const ry = E.ry * 0.66 * s;
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
        d: 'M102 148 C107 160 124 161 132 150 C127 157 108 156 102 148 Z',
        fill: PALETTE.ink,
      }];
    case 'sad':
      return [{
        d: 'M103 158 C109 148 126 148 132 156 C125 152 110 152 103 158 Z',
        fill: PALETTE.ink,
      }];
    case 'flat':
      return [{
        d: 'M104 151 C112 154 124 153 130 150 C124 156 111 156 104 151 Z',
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
          d:
            'M101 142 C104 160 129 161 134 141 ' +
            'C127 148 108 148 101 142 Z',
          fill: PALETTE.ink,
        },
        {
          d: 'M108 150 C111 159 126 158 128 148 C121 152 113 152 108 150 Z',
          fill: PALETTE.tongue,
        },
      ];
  }
}
