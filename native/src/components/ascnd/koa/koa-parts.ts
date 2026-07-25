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

  /** 02 — left ear: large, wavy outer edge, heavier at the base */
  earL:
    'M62 50 C46 33 22 32 11 49 C0 66 3 93 18 107 ' +
    'C31 119 52 118 62 105 C71 94 72 62 62 50 Z',
  /** 04 — inner ear left */
  earLInner:
    'M59 66 C47 54 30 56 23 68 C16 81 19 99 31 106 ' +
    'C42 112 56 107 60 96 C64 86 65 74 59 66 Z',

  /** 03 — right ear: intentionally NOT a mirror of the left */
  earR:
    'M180 44 C197 27 221 29 231 47 C241 65 237 92 221 104 ' +
    'C208 114 188 112 180 99 C172 87 171 56 180 44 Z',
  /** 05 — inner ear right */
  earRInner:
    'M177 60 C190 49 207 52 213 65 C219 78 215 96 203 102 ' +
    'C192 107 179 101 176 90 C173 80 172 67 177 60 Z',

  /**
   * 01 — head. 20 nodes. Not an ellipse: the crown dips slightly, the
   * cheeks bulge low and the left side is a touch fuller than the right.
   */
  head:
    'M120 26 C149 24 173 37 187 59 ' +
    'C197 76 201 95 199 113 ' +
    'C197 139 181 161 155 171 ' +
    'C141 177 128 179 119 179 ' +
    'C101 179 83 175 68 167 ' +
    'C43 154 29 132 28 107 ' +
    'C27 87 33 67 47 52 ' +
    'C63 34 92 27 120 26 Z',
  /** soft light patch, upper-left key light */
  headLight:
    'M84 46 C63 56 48 74 47 94 C63 78 84 63 106 55 C99 47 91 44 84 46 Z',

  /** 06 — face patch, deliberately off-round and pushed slightly left */
  facePatch:
    'M117 86 C90 85 71 103 72 127 C73 150 94 165 119 164 ' +
    'C145 163 163 148 162 125 C161 101 142 86 117 86 Z',

  /** 18 — body: small standing oval that tucks under the head */
  body:
    'M119 150 C93 150 73 172 71 202 ' +
    'C69 234 88 260 120 261 ' +
    'C152 262 170 237 169 205 ' +
    'C168 175 147 150 119 150 Z',
  /** 19 — belly, vertical oval, smaller than the body */
  belly:
    'M117 178 C97 179 85 197 86 219 ' +
    'C87 241 101 254 118 253 ' +
    'C137 252 149 237 148 215 ' +
    'C147 193 135 177 117 178 Z',

  /** 20 — left arm: curved capsule, never straight */
  armL:
    'M74 166 C59 170 48 192 50 215 ' +
    'C52 233 68 240 77 228 C86 214 86 176 74 166 Z',
  /** 21 — right arm, a little longer than the left */
  armR:
    'M166 162 C182 166 194 189 192 213 ' +
    'C190 232 173 239 164 227 C154 212 154 172 166 162 Z',

  /** 22 — left leg: short capsule, splayed outward */
  legL:
    'M92 234 C79 236 71 252 74 266 ' +
    'C77 278 96 280 102 269 C108 257 103 236 92 234 Z',
  /** 23 — right leg */
  legR:
    'M146 232 C133 234 126 250 129 264 ' +
    'C133 277 151 278 157 267 C163 255 157 234 146 232 Z',

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
  head: { x: 120, y: 150 }, // neck
  earL: { x: 58, y: 100 },  // ear base
  earR: { x: 184, y: 96 },
  armL: { x: 76, y: 170 },  // shoulder
  armR: { x: 164, y: 166 },
  legL: { x: 94, y: 238 },  // hip
  legR: { x: 145, y: 236 },
} as const;

export interface Layer {
  d: string;
  fill: string;
  opacity?: number;
}

/* ── Eyes ─────────────────────────────────────────────────────────────── */
/** 07/08 — vertical oval eye wells, authored as paths (left is smaller) */
const EYE_L = {
  well:
    'M89 80 C77 80 70 93 70 107 C70 122 78 133 89 133 ' +
    'C100 133 108 121 108 106 C108 92 100 80 89 80 Z',
  cx: 89, cy: 106, rx: 19, ry: 26,
};
const EYE_R = {
  well:
    'M152 76 C139 76 131 90 131 105 C131 121 140 133 152 133 ' +
    'C164 133 172 120 172 104 C172 89 164 76 152 76 Z',
  cx: 152, cy: 104, rx: 21, ry: 28,
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
