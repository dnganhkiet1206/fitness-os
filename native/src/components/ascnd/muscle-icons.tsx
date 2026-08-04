import Svg, { Circle, Ellipse, Path, Rect } from 'react-native-svg';

/**
 * Six muscle groups, drawn.
 *
 * ── why drawings and not glyphs ──
 *
 * The exercise library is browsed by body part, and a body part is a shape
 * before it is a word. A row of identical dumbbell glyphs above six different
 * labels makes the reader do the work the picture was supposed to do; a torso
 * with its chest lit says "chest" before the caption is read.
 *
 * ── how they are built ──
 *
 * One torso outline, shared as a string constant, drawn faintly — and on top of
 * it the group itself at full strength. Every tile is the same body seen from
 * the same angle, and the only thing that changes is which part is lit. Six
 * unrelated drawings would each have to be learned; these are one drawing
 * learned once.
 *
 * The two limb groups break the pattern on purpose. An arm or a leg lit inside
 * a whole torso is a small mark in a large picture, so those two are the limb
 * on its own, at the size the others give the whole body.
 *
 * ── they are checked by looking ──
 *
 * `node tools/muscle-icons.mjs` renders these at 132pt and at the 34pt they are
 * used at, on the app's background, and writes a PNG. Artwork cannot be
 * reviewed as source: the macro icons read fine in the file and came out on the
 * device as a spanner and a thermometer.
 *
 * The first pass of these proved the point. The chest and shoulder highlights
 * were drawn outside the torso they belonged to — the delts read as two ears —
 * the arm read as a slug, and the torso itself came out shoulder-narrow and
 * hip-wide, which is a cupcake. None of that was visible in the paths.
 */

const VIEW = 64;

/**
 * The torso, neck to hips, from the front.
 *
 * Widest across the deltoids at y≈25 and narrowest at the waist at y≈44, which
 * is the proportion that reads as a trained body rather than as a shield. Every
 * highlight below is drawn to sit *inside* these edges — the left edge runs
 * x≈12 at the shoulder, x≈16 at the ribs and x≈20 at the hip, and a highlight
 * that crosses them stops looking attached to the body.
 */
const TORSO =
  'M24 16C18 17 11 20 10 26C9 31 13 34 16 37C18 41 20 45 21 48C21 52 20 54 20 57L44 57C44 54 43 52 43 48C44 45 46 41 48 37C51 34 55 31 54 26C53 20 46 17 40 16Z';

/** Head and neck, so the torso reads as a body rather than a breastplate. */
const HEAD = 'M32 2C27 2 24 6 24 10C24 13 25 15 26 17L38 17C39 15 40 13 40 10C40 6 37 2 32 2Z';

/** the body behind the highlight — present, and clearly not the subject */
const GHOST = 0.2;

function Frame({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`}>
      {children}
    </Svg>
  );
}

export function ChestMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      <Path d={HEAD} fill={color} fillOpacity={GHOST} />
      <Path d={TORSO} fill={color} fillOpacity={GHOST} />
      {/* Two pecs, square at the sternum and rounded under the arm. The gap
          down the middle is what makes them a pair rather than a bib, and the
          flat bottom edge is what stops them reading as a bikini. */}
      <Path d="M30 23L20 24C16 25 13 28 14 32C15 36 19 39 24 39L30 40Z" fill={color} />
      <Path d="M34 23L44 24C48 25 51 28 50 32C49 36 45 39 40 39L34 40Z" fill={color} />
    </Frame>
  );
}

export function BackMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      <Path d={HEAD} fill={color} fillOpacity={GHOST} />
      <Path d={TORSO} fill={color} fillOpacity={GHOST} />
      {/* Lats as a V, tucked inside the ribs — the shape a back is recognised
          by, which is why this one needs no caption once it has been seen. */}
      <Path d="M15 26C19 23 25 21 30 21L30 30L25 49C20 42 15 33 15 26Z" fill={color} />
      <Path d="M49 26C45 23 39 21 34 21L34 30L39 49C44 42 49 33 49 26Z" fill={color} />
      {/* The spine, so the V is unmistakably seen from behind */}
      <Rect x="31" y="21" width="2" height="29" rx="1" fill={color} fillOpacity={0.5} />
    </Frame>
  );
}

export function ShouldersMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      <Path d={HEAD} fill={color} fillOpacity={GHOST} />
      <Path d={TORSO} fill={color} fillOpacity={GHOST} />
      {/* Caps that follow the torso's own top corners rather than sitting
          beside them. In the first pass these were drawn wider than the body
          and read as two ears. */}
      <Path d="M24 16C18 17 11 20 10 26C9 31 13 34 16 37C19 35 22 33 23 30C23 25 23 20 24 16Z" fill={color} />
      <Path d="M40 16C46 17 53 20 54 26C55 31 51 34 48 37C45 35 42 33 41 30C41 25 41 20 40 16Z" fill={color} />
    </Frame>
  );
}

export function AbsMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      <Path d={HEAD} fill={color} fillOpacity={GHOST} />
      <Path d={TORSO} fill={color} fillOpacity={GHOST} />
      {/* Three rows of two, narrowing with the waist so they sit inside it.
          Six blocks and not eight: at 34 points a fourth row closes into a
          smudge. */}
      <Rect x="23" y="31" width="8" height="6.5" rx="2.5" fill={color} />
      <Rect x="33" y="31" width="8" height="6.5" rx="2.5" fill={color} />
      <Rect x="24" y="39" width="7" height="6.5" rx="2.5" fill={color} />
      <Rect x="33" y="39" width="7" height="6.5" rx="2.5" fill={color} />
      <Rect x="25" y="47" width="6" height="6" rx="2.5" fill={color} />
      <Rect x="33" y="47" width="6" height="6" rx="2.5" fill={color} />
    </Frame>
  );
}

export function ArmsMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      {/* The flex: upper arm across, elbow at the right, forearm up, fist on
          top. Built from a bar, a bar and a circle because at this size an arm
          is those three things — the first pass drew it as one organic outline
          and it came out as a slug. */}
      <Path
        d="M6 44C6 39 10 36 16 36L32 36L32 22C32 17 35 14 39 14C43 14 46 17 46 22L46 44C46 49 42 52 37 52L16 52C10 52 6 49 6 44Z"
        fill={color}
        fillOpacity={GHOST}
      />
      {/* The fist, so the L reads as an arm and not as a bracket */}
      <Circle cx="39" cy="13" r="8" fill={color} fillOpacity={GHOST} />
      {/* The bicep, bulging above the line of the upper arm — the one thing
          this icon is for. Kept away from the elbow so it is a muscle on a
          limb rather than a blob in a corner. */}
      <Ellipse cx="18" cy="35" rx="11" ry="9" fill={color} />
    </Frame>
  );
}

export function LegsMuscle({ size = 34, color }: { size?: number; color: string }) {
  return (
    <Frame size={size}>
      {/* Pelvis, so the legs hang from something — shallow and rounded, not the
          box the first pass drew. */}
      <Path d="M20 8C20 5 25 4 32 4C39 4 44 5 44 8L43 14L21 14Z" fill={color} fillOpacity={GHOST} />
      {/* Two legs with a thigh, a knee and a calf, rather than two tubes */}
      <Path d="M21 14C17 20 17 29 20 35C22 38 21 41 21 45C20 50 22 55 23 59L30 59C30 53 30 47 30 41C30 31 31 22 31 14Z" fill={color} fillOpacity={GHOST} />
      <Path d="M43 14C47 20 47 29 44 35C42 38 43 41 43 45C44 50 42 55 41 59L34 59C34 53 34 47 34 41C34 31 33 22 33 14Z" fill={color} fillOpacity={GHOST} />
      {/* The quads, lit — a leg day is about the thigh */}
      <Path d="M23 15C20 21 20 28 22 33C24 35 27 35 28 33C29 27 29 20 29 15Z" fill={color} />
      <Path d="M41 15C44 21 44 28 42 33C40 35 37 35 36 33C35 27 35 20 35 15Z" fill={color} />
    </Frame>
  );
}
