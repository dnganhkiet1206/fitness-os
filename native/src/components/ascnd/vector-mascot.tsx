import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  Line,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { colors } from '@/constants/ascnd';
import type { MascotMood } from '@/hooks/use-mascot';
import type { MascotDef } from '@/lib/mascots';

/**
 * Fully code-drawn 2.5D character — no emoji. The Talking-Tom recipe,
 * lightweight: soft radial gradients sell volume ("2D wearing 3D"),
 * oversized glossy eyes carry the appeal, and the living parts (pupils
 * that wander, eyelids that really blink, a head that tilts) run as
 * separate animated layers over the SVG body.
 *
 * Everything is drawn in a fixed 200×236 rig space and scaled to `size`,
 * so face geometry, outfits and muscles stay anchored at any size.
 * Species (ears/mane/horn/tail) and palette come from MASCOT_ART.
 */

const RIG_W = 200;
const RIG_H = 236;

// Eye geometry in rig space (pupils + eyelids are layered Views)
const EYE_Y = 78;
const EYE_LX = 74;
const EYE_RX = 126;
const EYE_RXR = 14; // white rx
const EYE_RYR = 16; // white ry
const PUPIL_R = 7.5;
const LID_W = 34;
const LID_H = 38;
const LID_TIRED = 0.45; // heavy half-closed lids

interface Art {
  body: string;
  bodyDark: string;
  belly: string;
  /** Face/muzzle patch */
  muzzle: string;
  /** Extra per-species color (mane / ear tips / horn / spikes) */
  extra: string;
  variant: 'koala' | 'lion' | 'fox' | 'gorilla' | 'dragon' | 'unicorn';
}

const MASCOT_ART: Record<string, Art> = {
  koa: { body: '#a9b6ad', bodyDark: '#87968c', belly: '#e2ddd2', muzzle: '#c5cfc6', extra: '#c9a9ab', variant: 'koala' },
  blaze: { body: '#e2a850', bodyDark: '#c08a38', belly: '#f2dcae', muzzle: '#eec27c', extra: '#b8622d', variant: 'lion' },
  swift: { body: '#e2793f', bodyDark: '#bd5e2c', belly: '#f5ead9', muzzle: '#f5ead9', extra: '#3a2e28', variant: 'fox' },
  titan: { body: '#5b6472', bodyDark: '#464d59', belly: '#6d7684', muzzle: '#98a0ae', extra: '#39404b', variant: 'gorilla' },
  drago: { body: '#58a968', bodyDark: '#428453', belly: '#cfe8b8', muzzle: '#7cc389', extra: '#e8e6d8', variant: 'dragon' },
  nova: { body: '#f0eaf6', bodyDark: '#d4c8e6', belly: '#faf6fd', muzzle: '#f6f0fa', extra: '#b07de0', variant: 'unicorn' },
};

interface Props {
  mascot: MascotDef;
  /** Rendered width in px (height is width × 1.18) */
  size?: number;
  mood?: MascotMood;
  level?: number;
  equippedOutfits?: Set<string>;
  /** Turn off the pupil/blink timers (for static grids/pickers) */
  animated?: boolean;
}

const EMPTY = new Set<string>();

export function VectorMascot({
  mascot,
  size = 160,
  mood = 'neutral',
  level = 1,
  equippedOutfits = EMPTY,
  animated = true,
}: Props) {
  const art = MASCOT_ART[mascot.id] ?? MASCOT_ART.koa;
  const tired = mood === 'tired';

  const lid = useSharedValue(tired ? LID_TIRED : 0); // 0 open → 1 shut
  const px = useSharedValue(0);
  const py = useSharedValue(tired ? 3 : 0);
  const headTilt = useSharedValue(0);

  // Blink: eyelids really close — slow and heavy when tired
  useEffect(() => {
    const rest = tired ? LID_TIRED : 0;
    lid.value = withTiming(rest, { duration: 350 });
    if (!animated) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        lid.value = withSequence(
          withTiming(1, { duration: tired ? 150 : 80 }),
          withTiming(rest, { duration: tired ? 280 : 120 }),
        );
        schedule();
      }, (tired ? 1900 : 2800) + Math.random() * 3200);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [animated, tired, lid]);

  // Pupils wander + the head tilts along a touch — instant "it's alive"
  useEffect(() => {
    if (!animated) {
      px.value = 0;
      py.value = tired ? 3 : 0;
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        const tx = Math.random() * 10 - 5;
        px.value = withTiming(tx, { duration: 420 });
        py.value = withTiming(tired ? 3 : Math.random() * 5 - 2, { duration: 420 });
        headTilt.value = withTiming(tx * 0.55, { duration: 620 });
        schedule();
      }, 1600 + Math.random() * 2600);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [animated, tired, px, py, headTilt]);

  const pupilStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: px.value }, { translateY: py.value }],
  }));
  // Lids drop from the top edge of the eye (origin-top emulation)
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (-LID_H / 2) * (1 - lid.value) }, { scaleY: lid.value }],
  }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ rotateZ: `${headTilt.value}deg` }],
  }));

  const scale = size / RIG_W;
  const outH = RIG_H * scale;

  return (
    <View style={{ width: size, height: outH }} pointerEvents="none">
      <View
        style={{
          position: 'absolute',
          left: (size - RIG_W) / 2,
          top: (outH - RIG_H) / 2,
          width: RIG_W,
          height: RIG_H,
          transform: [{ scale }],
        }}>
        {/* ─ Body layer (legs, tail, torso, arms, belt/medal) ─ */}
        <Svg width={RIG_W} height={RIG_H} viewBox={`0 0 ${RIG_W} ${RIG_H}`} style={StyleSheet.absoluteFill}>
          <BodySvg art={art} level={level} equipped={equippedOutfits} />
        </Svg>

        {/* ─ Head layer: tilts independently for the 2.5D feel ─ */}
        <Animated.View style={[StyleSheet.absoluteFill, headStyle]}>
          <Svg width={RIG_W} height={RIG_H} viewBox={`0 0 ${RIG_W} ${RIG_H}`} style={StyleSheet.absoluteFill}>
            <HeadSvg art={art} mood={mood} equipped={equippedOutfits} />
          </Svg>

          {/* Pupils — layered Views so they can wander */}
          {!equippedOutfits.has('sunglasses') && (
            <>
              {[EYE_LX, EYE_RX].map((ex) => (
                <Animated.View
                  key={ex}
                  style={[
                    styles.pupil,
                    { left: ex - PUPIL_R, top: EYE_Y - PUPIL_R },
                    pupilStyle,
                  ]}>
                  <View style={styles.pupilShine} />
                  <View style={styles.pupilShineSm} />
                </Animated.View>
              ))}
              {/* Eyelids — head-colored, drop over the eyes */}
              {[EYE_LX, EYE_RX].map((ex) => (
                <Animated.View
                  key={`lid-${ex}`}
                  style={[
                    styles.lid,
                    { left: ex - LID_W / 2, top: EYE_Y - LID_H / 2 - 2, backgroundColor: art.body },
                    lidStyle,
                  ]}
                />
              ))}
            </>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

// ─── Body ──────────────────────────────────────────────────────────────

function BodySvg({ art, level, equipped }: { art: Art; level: number; equipped: Set<string> }) {
  // Gains: torso broadens and arms thicken with every level
  const bulk = Math.min(level - 1, 12);
  const torsoRx = 50 + bulk * 0.9;
  const armW = 15 + bulk * 0.8;
  const golden = level >= 12;
  const armStroke = golden ? colors.readinessYellow : art.bodyDark;

  return (
    <G>
      <Defs>
        <RadialGradient id="torso" cx="38%" cy="30%" r="80%">
          <Stop offset="0%" stopColor={lighten(art.body)} />
          <Stop offset="62%" stopColor={art.body} />
          <Stop offset="100%" stopColor={art.bodyDark} />
        </RadialGradient>
      </Defs>

      {art.variant === 'fox' && (
        <G>
          {/* bushy tail with a white tip */}
          <Path d="M 152 190 C 190 178 198 150 188 128 C 200 160 196 196 158 208 Z" fill={art.body} />
          <Path d="M 186 132 C 194 146 194 160 188 170 C 196 156 196 142 190 130 Z" fill={art.belly} />
        </G>
      )}
      {art.variant === 'lion' && (
        <Path d="M 150 196 C 176 190 184 172 180 158 L 186 156 C 192 176 180 198 154 204 Z" fill={art.bodyDark} />
      )}
      {art.variant === 'dragon' && (
        <Path d="M 150 194 C 178 190 190 176 190 160 L 198 168 L 188 170 L 196 178 L 184 178 C 178 192 164 200 152 202 Z" fill={art.body} />
      )}

      {/* legs */}
      <Rect x={62} y={192} width={30} height={40} rx={14} fill={art.bodyDark} />
      <Rect x={108} y={192} width={30} height={40} rx={14} fill={art.bodyDark} />
      <Ellipse cx={77} cy={228} rx={17} ry={8} fill={art.body} />
      <Ellipse cx={123} cy={228} rx={17} ry={8} fill={art.body} />

      {/* torso */}
      <Ellipse cx={100} cy={168} rx={torsoRx} ry={46} fill="url(#torso)" />
      <Ellipse cx={100} cy={174} rx={30} ry={27} fill={art.belly} opacity={0.92} />

      {/* chest pec lines — the level-6 milestone */}
      {level >= 6 && (
        <G>
          <Path d="M 78 150 Q 89 158 99 151" stroke="rgba(0,0,0,0.16)" strokeWidth={2.4} fill="none" strokeLinecap="round" />
          <Path d="M 101 151 Q 111 158 122 150" stroke="rgba(0,0,0,0.16)" strokeWidth={2.4} fill="none" strokeLinecap="round" />
        </G>
      )}

      {/* arms — thicken with level; bicep bump from level 2 */}
      <Path d={`M 58 146 C 44 156 36 170 34 184`} stroke={art.body} strokeWidth={armW} strokeLinecap="round" fill="none" />
      <Path d={`M 142 146 C 156 156 164 170 166 184`} stroke={art.body} strokeWidth={armW} strokeLinecap="round" fill="none" />
      {level >= 2 && (
        <G>
          <Circle cx={46} cy={160} r={armW * 0.62} fill={art.body} stroke={golden ? armStroke : 'none'} strokeWidth={golden ? 2 : 0} />
          <Circle cx={154} cy={160} r={armW * 0.62} fill={art.body} stroke={golden ? armStroke : 'none'} strokeWidth={golden ? 2 : 0} />
          <Circle cx={43} cy={156} r={armW * 0.2} fill="rgba(255,255,255,0.35)" />
          <Circle cx={151} cy={156} r={armW * 0.2} fill="rgba(255,255,255,0.35)" />
        </G>
      )}
      {/* paws */}
      <Circle cx={34} cy={186} r={armW * 0.52} fill={art.bodyDark} />
      <Circle cx={166} cy={186} r={armW * 0.52} fill={art.bodyDark} />
      {/* effort sparks — level 9 */}
      {level >= 9 && (
        <G>
          {[
            [20, 150, 14, 144],
            [16, 168, 8, 168],
            [180, 150, 186, 144],
            [184, 168, 192, 168],
          ].map(([x1, y1, x2, y2], i) => (
            <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.readinessYellow} strokeWidth={2.4} strokeLinecap="round" />
          ))}
        </G>
      )}

      {/* dragon belly ridges */}
      {art.variant === 'dragon' && (
        <G>
          {[160, 172, 184].map((y) => (
            <Path key={y} d={`M 78 ${y} Q 100 ${y + 6} 122 ${y}`} stroke="rgba(0,0,0,0.12)" strokeWidth={2} fill="none" />
          ))}
        </G>
      )}

      {/* outfit: lifting belt */}
      {equipped.has('belt') && (
        <G>
          <Rect x={100 - torsoRx + 4} y={188} width={torsoRx * 2 - 8} height={14} rx={7} fill="#5a4634" />
          <Rect x={88} y={185} width={24} height={20} rx={4} fill="#c9a24a" />
          <Rect x={94} y={190} width={12} height={10} rx={2} fill="#7a5f1e" />
        </G>
      )}
      {/* outfit: medal */}
      {equipped.has('medal') && (
        <G>
          <Path d="M 78 132 L 100 158 L 122 132" stroke="#e6485c" strokeWidth={6} fill="none" />
          <Circle cx={100} cy={162} r={12} fill={colors.readinessYellow} stroke="#a8790e" strokeWidth={2} />
          <Path d="M 100 156 L 102 161 L 107 161 L 103 164 L 105 169 L 100 166 L 95 169 L 97 164 L 93 161 L 98 161 Z" fill="#a8790e" />
        </G>
      )}
    </G>
  );
}

// ─── Head ──────────────────────────────────────────────────────────────

function HeadSvg({ art, mood, equipped }: { art: Art; mood: MascotMood; equipped: Set<string> }) {
  const tired = mood === 'tired';
  return (
    <G>
      <Defs>
        <RadialGradient id="head" cx="40%" cy="30%" r="82%">
          <Stop offset="0%" stopColor={lighten(art.body)} />
          <Stop offset="60%" stopColor={art.body} />
          <Stop offset="100%" stopColor={art.bodyDark} />
        </RadialGradient>
        <LinearGradient id="horn" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#f4d98a" />
          <Stop offset="100%" stopColor="#d9a832" />
        </LinearGradient>
        <RadialGradient id="eye" cx="50%" cy="38%" r="70%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#e8e9f0" />
        </RadialGradient>
      </Defs>

      <Ears art={art} />

      {/* head */}
      <Ellipse cx={100} cy={80} rx={56} ry={52} fill="url(#head)" />

      <FaceFeatures art={art} />

      {/* eye whites (glossy) */}
      <Ellipse cx={EYE_LX} cy={EYE_Y} rx={EYE_RXR} ry={EYE_RYR} fill="url(#eye)" />
      <Ellipse cx={EYE_RX} cy={EYE_Y} rx={EYE_RXR} ry={EYE_RYR} fill="url(#eye)" />

      {/* tired brows */}
      {tired && (
        <G>
          <Line x1={60} y1={58} x2={86} y2={64} stroke={art.bodyDark} strokeWidth={4} strokeLinecap="round" />
          <Line x1={140} y1={58} x2={114} y2={64} stroke={art.bodyDark} strokeWidth={4} strokeLinecap="round" />
        </G>
      )}

      {/* cheeks */}
      <Ellipse cx={58} cy={98} rx={9} ry={5.5} fill="#e6708a" opacity={mood === 'happy' ? 0.4 : 0.22} />
      <Ellipse cx={142} cy={98} rx={9} ry={5.5} fill="#e6708a" opacity={mood === 'happy' ? 0.4 : 0.22} />

      <Nose art={art} />
      <Mouth mood={mood} />

      {/* tired sweat drop */}
      {tired && (
        <Path d="M 152 52 C 158 62 159 68 152 70 C 145 68 146 62 152 52" fill={colors.metricCyan} opacity={0.85} />
      )}

      {/* outfit: headband / cap / sunglasses live on the head layer */}
      {equipped.has('headband') && (
        <G>
          <Rect x={50} y={42} width={100} height={13} rx={6.5} fill="#e6485c" />
          <Rect x={50} y={45} width={100} height={3} fill="rgba(255,255,255,0.35)" />
        </G>
      )}
      {equipped.has('cap') && (
        <G>
          <Path d="M 52 46 A 48 38 0 0 1 148 46 L 148 54 L 52 54 Z" fill={colors.metricBlue} />
          <Rect x={40} y={50} width={78} height={10} rx={5} fill="#2b62b4" />
          <Circle cx={100} cy={16} r={5} fill="#2b62b4" />
        </G>
      )}
      {equipped.has('sunglasses') && (
        <G>
          <Rect x={56} y={64} width={38} height={24} rx={9} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.6} />
          <Rect x={106} y={64} width={38} height={24} rx={9} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.6} />
          <Line x1={94} y1={73} x2={106} y2={73} stroke="rgba(255,255,255,0.4)" strokeWidth={2.6} />
          <Rect x={61} y={68} width={13} height={5} rx={2.5} fill="rgba(255,255,255,0.3)" />
          <Rect x={111} y={68} width={13} height={5} rx={2.5} fill="rgba(255,255,255,0.3)" />
        </G>
      )}
    </G>
  );
}

function Ears({ art }: { art: Art }) {
  switch (art.variant) {
    case 'koala':
      return (
        <G>
          <Circle cx={36} cy={44} r={28} fill={art.body} />
          <Circle cx={164} cy={44} r={28} fill={art.body} />
          <Circle cx={36} cy={44} r={16} fill={art.extra} />
          <Circle cx={164} cy={44} r={16} fill={art.extra} />
        </G>
      );
    case 'lion':
      return (
        <G>
          {/* mane: ring of petals behind the head */}
          {Array.from({ length: 10 }).map((_, i) => {
            const a = (i / 10) * Math.PI * 2;
            return (
              <Circle key={i} cx={100 + Math.cos(a) * 56} cy={78 + Math.sin(a) * 52} r={22} fill={art.extra} />
            );
          })}
          <Circle cx={52} cy={30} r={13} fill={art.body} />
          <Circle cx={148} cy={30} r={13} fill={art.body} />
        </G>
      );
    case 'fox':
      return (
        <G>
          <Path d="M 38 58 L 50 6 L 84 40 Z" fill={art.body} />
          <Path d="M 48 44 L 53 20 L 70 38 Z" fill={art.extra} />
          <Path d="M 162 58 L 150 6 L 116 40 Z" fill={art.body} />
          <Path d="M 152 44 L 147 20 L 130 38 Z" fill={art.extra} />
        </G>
      );
    case 'gorilla':
      return (
        <G>
          <Circle cx={42} cy={78} r={13} fill={art.body} />
          <Circle cx={158} cy={78} r={13} fill={art.body} />
        </G>
      );
    case 'dragon':
      return (
        <G>
          <Path d="M 62 40 C 56 22 60 12 70 6 C 70 20 74 28 80 34 Z" fill={art.extra} />
          <Path d="M 138 40 C 144 22 140 12 130 6 C 130 20 126 28 120 34 Z" fill={art.extra} />
          <Path d="M 88 32 L 94 16 L 100 30 L 106 14 L 112 32 Z" fill={art.bodyDark} />
        </G>
      );
    case 'unicorn':
      return (
        <G>
          <Path d="M 92 34 L 100 -2 L 108 34 Z" fill="url(#horn)" />
          <Line x1={95} y1={22} x2={106} y2={18} stroke="rgba(0,0,0,0.15)" strokeWidth={2} />
          <Line x1={93} y1={29} x2={107} y2={25} stroke="rgba(0,0,0,0.15)" strokeWidth={2} />
          <Path d="M 46 54 L 56 22 L 76 44 Z" fill={art.body} />
          <Path d="M 154 54 L 144 22 L 124 44 Z" fill={art.body} />
          {/* mane strands */}
          <Path d="M 140 38 C 162 48 168 72 160 96 C 172 70 168 44 148 32 Z" fill={art.extra} />
          <Path d="M 150 50 C 166 64 168 84 160 102 C 174 82 172 58 156 44 Z" fill="#e08ac2" />
        </G>
      );
  }
}

function FaceFeatures({ art }: { art: Art }) {
  switch (art.variant) {
    case 'gorilla':
      return (
        <G>
          {/* strong brow + lighter face plate */}
          <Ellipse cx={100} cy={96} rx={40} ry={30} fill={art.muzzle} opacity={0.55} />
          <Path d="M 54 62 Q 100 48 146 62 L 146 70 Q 100 58 54 70 Z" fill={art.extra} />
        </G>
      );
    case 'fox':
      return <Ellipse cx={100} cy={106} rx={30} ry={22} fill={art.muzzle} />;
    case 'lion':
      return <Ellipse cx={100} cy={106} rx={28} ry={20} fill={art.muzzle} opacity={0.85} />;
    default:
      return <Ellipse cx={100} cy={106} rx={26} ry={19} fill={art.muzzle} opacity={0.7} />;
  }
}

function Nose({ art }: { art: Art }) {
  switch (art.variant) {
    case 'koala':
      // the big koala nose is the face's centerpiece
      return <Ellipse cx={100} cy={98} rx={13} ry={17} fill="#3d3d44" />;
    case 'gorilla':
      return (
        <G>
          <Ellipse cx={93} cy={100} rx={4.5} ry={6} fill="#2e333c" />
          <Ellipse cx={107} cy={100} rx={4.5} ry={6} fill="#2e333c" />
        </G>
      );
    case 'dragon':
      return (
        <G>
          <Ellipse cx={92} cy={98} rx={3.5} ry={4.5} fill="#2c4a34" />
          <Ellipse cx={108} cy={98} rx={3.5} ry={4.5} fill="#2c4a34" />
        </G>
      );
    default:
      return <Path d="M 93 96 Q 100 90 107 96 Q 100 106 93 96" fill="#3d3d44" />;
  }
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === 'happy') {
    return (
      <G>
        <Path d="M 82 112 Q 100 132 118 112 Q 100 120 82 112" fill="#5a2e33" />
        <Path d="M 92 121 Q 100 127 108 121 Q 100 130 92 121" fill="#e6708a" />
      </G>
    );
  }
  if (mood === 'tired') {
    return <Path d="M 88 122 Q 100 112 112 122" stroke="#5a2e33" strokeWidth={3.5} fill="none" strokeLinecap="round" />;
  }
  return <Path d="M 88 114 Q 100 124 112 114" stroke="#5a2e33" strokeWidth={3.5} fill="none" strokeLinecap="round" />;
}

/** Cheap perceptual lighten for gradient highlights */
function lighten(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((n >> 16) & 255) + 42);
  const g = Math.min(255, ((n >> 8) & 255) + 42);
  const b = Math.min(255, (n & 255) + 42);
  return `rgb(${r},${g},${b})`;
}

const styles = StyleSheet.create({
  pupil: {
    position: 'absolute',
    width: PUPIL_R * 2,
    height: PUPIL_R * 2,
    borderRadius: PUPIL_R,
    backgroundColor: '#26262c',
  },
  pupilShine: {
    position: 'absolute',
    top: 2,
    left: 2.5,
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  pupilShineSm: {
    position: 'absolute',
    bottom: 2.5,
    right: 3,
    width: 2.5,
    height: 2.5,
    borderRadius: 1.25,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  lid: {
    position: 'absolute',
    width: LID_W,
    height: LID_H,
    borderRadius: 14,
  },
});
