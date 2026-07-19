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
 * Fully code-drawn kawaii character — no emoji. One soft egg-shaped
 * body (radial gradient sells the volume), stubby arms/feet, and huge
 * glossy eyes that carry all the appeal: pupils wander as layered
 * views, eyelids really blink, moods change brows/mouth/cheeks.
 * Design iterated visually against a rendered preview (Pou/Duolingo
 * school of cute), so proportions are proven, not guessed.
 *
 * Drawn in a fixed 200×240 rig space and scaled to `size`, so face
 * geometry, outfits and muscle growth stay anchored at any size.
 */

const RIG_W = 200;
const RIG_H = 240;

// Eye geometry in rig space (pupils + eyelids are layered Views)
const EYE_Y = 95;
const EYE_LX = 67;
const EYE_RX = 133;
const EYE_RXR = 21; // white rx
const EYE_RYR = 25; // white ry
const PUPIL_R = 10.5;
const LID_W = 46;
const LID_H = 54;
const LID_TIRED = 0.45; // heavy half-closed lids

interface Art {
  body: string;
  bodyDark: string;
  belly: string;
  /** Extra per-species color (mane / ear inner / horn / spikes) */
  extra: string;
  /** Eyelid color when the face behind the eyes isn't plain body color */
  lid?: string;
  variant: 'koala' | 'lion' | 'fox' | 'gorilla' | 'dragon' | 'unicorn';
}

const MASCOT_ART: Record<string, Art> = {
  koa: { body: '#aebdb4', bodyDark: '#8d9e94', belly: '#e6e1d6', extra: '#d99ea4', variant: 'koala' },
  blaze: { body: '#f0b254', bodyDark: '#d3942f', belly: '#f8e3b6', extra: '#cf6b2e', variant: 'lion' },
  swift: { body: '#ee8442', bodyDark: '#cc6528', belly: '#f9efdf', extra: '#472f26', variant: 'fox' },
  titan: { body: '#6b7585', bodyDark: '#525b69', belly: '#7d8796', extra: '#9aa3b2', lid: '#8993a2', variant: 'gorilla' },
  drago: { body: '#62ba74', bodyDark: '#47945a', belly: '#d6eec0', extra: '#ede9d8', variant: 'dragon' },
  nova: { body: '#f4eefa', bodyDark: '#d5c6ea', belly: '#faf6fd', extra: '#b781e8', variant: 'unicorn' },
};

interface Props {
  mascot: MascotDef;
  /** Rendered width in px (height is width × 1.2) */
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
  const py = useSharedValue(tired ? 4 : 0);

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

  // Pupils wander — instant "it's alive"
  useEffect(() => {
    if (!animated) {
      px.value = 0;
      py.value = tired ? 4 : 0;
      return;
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (!alive) return;
        px.value = withTiming(Math.random() * 12 - 6, { duration: 420 });
        py.value = withTiming(tired ? 4 : Math.random() * 6 - 2.5, { duration: 420 });
        schedule();
      }, 1600 + Math.random() * 2600);
    };
    schedule();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [animated, tired, px, py]);

  const pupilStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: px.value }, { translateY: py.value }],
  }));
  // Lids drop from the top edge of the eye (origin-top emulation)
  const lidStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (-LID_H / 2) * (1 - lid.value) }, { scaleY: lid.value }],
  }));

  const scale = size / RIG_W;
  const outH = RIG_H * scale;
  const showEyes = !equippedOutfits.has('sunglasses');

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
        <Svg width={RIG_W} height={RIG_H} viewBox={`0 0 ${RIG_W} ${RIG_H}`} style={StyleSheet.absoluteFill}>
          <CharacterSvg art={art} mood={mood} level={level} equipped={equippedOutfits} />
        </Svg>

        {/* Pupils — layered Views so they can wander */}
        {showEyes && (
          <>
            {[EYE_LX, EYE_RX].map((ex) => (
              <Animated.View
                key={ex}
                style={[styles.pupil, { left: ex - PUPIL_R, top: EYE_Y - PUPIL_R }, pupilStyle]}>
                <View style={styles.pupilShine} />
                <View style={styles.pupilShineSm} />
              </Animated.View>
            ))}
            {/* Eyelids — face-colored, drop over the eyes */}
            {[EYE_LX, EYE_RX].map((ex) => (
              <Animated.View
                key={`lid-${ex}`}
                style={[
                  styles.lid,
                  {
                    left: ex - LID_W / 2,
                    top: EYE_Y - LID_H / 2 - 1,
                    backgroundColor: art.lid ?? art.body,
                  },
                  lidStyle,
                ]}
              />
            ))}
          </>
        )}
      </View>
    </View>
  );
}

// ─── The character (single soft blob + species features) ───────────────

function CharacterSvg({
  art,
  mood,
  level,
  equipped,
}: {
  art: Art;
  mood: MascotMood;
  level: number;
  equipped: Set<string>;
}) {
  const tired = mood === 'tired';
  // Gains: the arms bulk up with every level
  const bulk = Math.min(level - 1, 12);
  const armRx = 13 + bulk * 0.5;
  const armRy = 27 + bulk * 0.7;
  const golden = level >= 12;

  return (
    <G>
      <Defs>
        <RadialGradient id="vmBody" cx="38%" cy="26%" r="85%">
          <Stop offset="0%" stopColor={lighten(art.body)} />
          <Stop offset="55%" stopColor={art.body} />
          <Stop offset="100%" stopColor={art.bodyDark} />
        </RadialGradient>
        <LinearGradient id="vmHorn" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor="#f6dd92" />
          <Stop offset="100%" stopColor="#d9a832" />
        </LinearGradient>
        <RadialGradient id="vmEye" cx="50%" cy="40%" r="72%">
          <Stop offset="0%" stopColor="#ffffff" />
          <Stop offset="100%" stopColor="#e4e6ef" />
        </RadialGradient>
      </Defs>

      <BehindBody art={art} />

      {/* feet */}
      <Ellipse cx={66} cy={212} rx={19} ry={12} fill={art.bodyDark} />
      <Ellipse cx={134} cy={212} rx={19} ry={12} fill={art.bodyDark} />

      {/* arms — bulk up with level */}
      <Ellipse cx={27} cy={146} rx={armRx} ry={armRy} fill={art.body} transform="rotate(16 27 146)" stroke={golden ? colors.readinessYellow : undefined} strokeWidth={golden ? 2 : 0} />
      <Ellipse cx={173} cy={146} rx={armRx} ry={armRy} fill={art.body} transform="rotate(-16 173 146)" stroke={golden ? colors.readinessYellow : undefined} strokeWidth={golden ? 2 : 0} />
      {level >= 9 && (
        <G>
          {[
            [10, 122, 4, 116],
            [6, 142, -2, 142],
            [190, 122, 196, 116],
            [194, 142, 202, 142],
          ].map(([x1, y1, x2, y2], i) => (
            <Line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.readinessYellow} strokeWidth={2.6} strokeLinecap="round" />
          ))}
        </G>
      )}

      {/* body blob + gloss + belly */}
      <Path
        d="M 100 34 C 146 34 168 72 166 108 C 178 150 166 196 128 208 C 110 213 90 213 72 208 C 34 196 22 150 34 108 C 32 72 54 34 100 34 Z"
        fill="url(#vmBody)"
      />
      <Ellipse cx={70} cy={72} rx={30} ry={19} fill="rgba(255,255,255,0.14)" transform="rotate(-18 70 72)" />
      <Ellipse cx={100} cy={164} rx={42} ry={35} fill={art.belly} opacity={0.95} />

      <AfterBody art={art} />

      {/* eye whites (glossy) — pupils/lids are layered views above */}
      <Ellipse cx={EYE_LX} cy={EYE_Y} rx={EYE_RXR} ry={EYE_RYR} fill="url(#vmEye)" />
      <Ellipse cx={EYE_RX} cy={EYE_Y} rx={EYE_RXR} ry={EYE_RYR} fill="url(#vmEye)" />

      {/* tired: knitted brows + sweat drop */}
      {tired && (
        <G>
          <Line x1={54} y1={56} x2={78} y2={62} stroke={art.bodyDark} strokeWidth={5} strokeLinecap="round" />
          <Line x1={146} y1={56} x2={122} y2={62} stroke={art.bodyDark} strokeWidth={5} strokeLinecap="round" />
          <Path d="M 160 66 C 167 77 168 84 160 86 C 152 84 153 77 160 66" fill={colors.metricCyan} opacity={0.85} />
        </G>
      )}

      {/* cheeks */}
      <Ellipse cx={52} cy={122} rx={11} ry={7} fill="#e6708a" opacity={mood === 'happy' ? 0.4 : 0.24} />
      <Ellipse cx={148} cy={122} rx={11} ry={7} fill="#e6708a" opacity={mood === 'happy' ? 0.4 : 0.24} />

      <MuzzleNose art={art} />
      <Mouth mood={mood} />

      {/* outfits */}
      {equipped.has('headband') && (
        <G>
          <Rect x={52} y={50} width={96} height={13} rx={6.5} fill="#e6485c" />
          <Rect x={52} y={53} width={96} height={3} fill="rgba(255,255,255,0.35)" />
        </G>
      )}
      {equipped.has('cap') && (
        <G>
          <Path d="M 52 56 A 48 38 0 0 1 148 56 L 148 62 L 52 62 Z" fill={colors.metricBlue} />
          <Rect x={40} y={58} width={80} height={10} rx={5} fill="#2b62b4" />
          <Circle cx={100} cy={24} r={5} fill="#2b62b4" />
        </G>
      )}
      {equipped.has('sunglasses') && (
        <G>
          <Rect x={44} y={80} width={46} height={30} rx={11} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} />
          <Rect x={110} y={80} width={46} height={30} rx={11} fill="#0c0c10" stroke="rgba(255,255,255,0.4)" strokeWidth={1.8} />
          <Line x1={90} y1={92} x2={110} y2={92} stroke="rgba(255,255,255,0.4)" strokeWidth={3} />
          <Rect x={50} y={85} width={16} height={6} rx={3} fill="rgba(255,255,255,0.3)" />
          <Rect x={116} y={85} width={16} height={6} rx={3} fill="rgba(255,255,255,0.3)" />
        </G>
      )}
      {equipped.has('medal') && (
        <G>
          <Path d="M 76 148 L 100 172 L 124 148" stroke="#e6485c" strokeWidth={6} fill="none" />
          <Circle cx={100} cy={176} r={12} fill={colors.readinessYellow} stroke="#a8790e" strokeWidth={2} />
          <Path d="M 100 169 L 102.3 174 L 107.5 174 L 103.4 177.4 L 105.4 182.4 L 100 179.3 L 94.6 182.4 L 96.6 177.4 L 92.5 174 L 97.7 174 Z" fill="#a8790e" />
        </G>
      )}
      {equipped.has('belt') && (
        <G>
          <Rect x={42} y={186} width={116} height={15} rx={7.5} fill="#5a4634" />
          <Rect x={88} y={183} width={24} height={21} rx={4} fill="#c9a24a" />
          <Rect x={94} y={188} width={12} height={11} rx={2} fill="#7a5f1e" />
        </G>
      )}
    </G>
  );
}

/** Species features drawn behind the body (ears, horns, mane, tail) */
function BehindBody({ art }: { art: Art }) {
  switch (art.variant) {
    case 'koala':
      return (
        <G>
          <Circle cx={32} cy={46} r={27} fill={art.body} />
          <Circle cx={168} cy={46} r={27} fill={art.body} />
          <Circle cx={32} cy={46} r={15} fill={art.extra} />
          <Circle cx={168} cy={46} r={15} fill={art.extra} />
        </G>
      );
    case 'lion':
      return (
        <G>
          {Array.from({ length: 12 }).map((_, i) => {
            const t = (i / 12) * Math.PI * 2;
            return (
              <Circle key={i} cx={100 + Math.cos(t) * 66} cy={92 + Math.sin(t) * 62} r={24} fill={art.extra} />
            );
          })}
        </G>
      );
    case 'fox':
      return (
        <G>
          <Path d="M 28 64 L 42 0 L 88 34 Z" fill={art.body} />
          <Path d="M 39 46 L 46 16 L 72 34 Z" fill={art.extra} />
          <Path d="M 172 64 L 158 0 L 112 34 Z" fill={art.body} />
          <Path d="M 161 46 L 154 16 L 128 34 Z" fill={art.extra} />
          {/* bushy tail with a light tip */}
          <Path d="M 158 200 C 196 188 202 152 190 124 C 206 158 202 200 164 214 Z" fill={art.body} />
          <Path d="M 188 128 C 198 146 198 166 190 180 C 200 162 200 142 192 126 Z" fill={art.belly} />
        </G>
      );
    case 'gorilla':
      return (
        <G>
          <Circle cx={28} cy={92} r={15} fill={art.body} />
          <Circle cx={172} cy={92} r={15} fill={art.body} />
          <Circle cx={28} cy={92} r={8} fill={art.bodyDark} />
          <Circle cx={172} cy={92} r={8} fill={art.bodyDark} />
        </G>
      );
    case 'dragon':
      return (
        <G>
          <Path d="M 64 30 C 56 12 60 2 72 -4 C 71 12 76 20 82 26 Z" fill={art.extra} />
          <Path d="M 136 30 C 144 12 140 2 128 -4 C 129 12 124 20 118 26 Z" fill={art.extra} />
          <Path d="M 86 22 L 93 6 L 100 20 L 107 4 L 114 22 Z" fill={art.bodyDark} />
        </G>
      );
    case 'unicorn':
      return (
        <G>
          <Path d="M 90 40 L 100 -6 L 110 40 Z" fill="url(#vmHorn)" />
          <Line x1={93} y1={24} x2={107} y2={19} stroke="rgba(0,0,0,0.16)" strokeWidth={2.5} />
          <Line x1={91} y1={32} x2={109} y2={27} stroke="rgba(0,0,0,0.16)" strokeWidth={2.5} />
          <Path d="M 52 52 L 60 16 L 84 40 Z" fill={art.body} />
          <Path d="M 148 52 L 140 16 L 116 40 Z" fill={art.body} />
          <Path d="M 138 34 C 164 48 174 82 166 116 C 180 80 172 44 146 26 Z" fill={art.extra} />
          <Path d="M 148 44 C 166 62 170 90 162 112 C 176 88 172 60 156 38 Z" fill="#ea92c8" />
        </G>
      );
  }
}

/** Species features drawn over the body, under the face */
function AfterBody({ art }: { art: Art }) {
  switch (art.variant) {
    case 'lion':
      return (
        <G>
          <Circle cx={52} cy={38} r={12} fill={art.body} />
          <Circle cx={148} cy={38} r={12} fill={art.body} />
          <Circle cx={52} cy={38} r={6} fill={art.bodyDark} />
          <Circle cx={148} cy={38} r={6} fill={art.bodyDark} />
        </G>
      );
    case 'gorilla':
      return (
        <G>
          <Ellipse cx={100} cy={106} rx={54} ry={46} fill={art.extra} opacity={0.65} />
          <Path d="M 84 40 C 88 30 112 30 116 40 C 108 36 92 36 84 40 Z" fill={art.bodyDark} />
        </G>
      );
    case 'unicorn':
      return <Path d="M 74 34 C 82 26 96 26 102 34 C 92 32 84 36 80 44 Z" fill={art.extra} />;
    default:
      return null;
  }
}

function MuzzleNose({ art }: { art: Art }) {
  switch (art.variant) {
    case 'koala':
      return (
        <G>
          <Ellipse cx={100} cy={118} rx={13} ry={16} fill="#46464e" />
          <Ellipse cx={96} cy={112} rx={4} ry={5} fill="rgba(255,255,255,0.22)" />
        </G>
      );
    case 'fox':
      return (
        <G>
          <Ellipse cx={100} cy={126} rx={30} ry={20} fill={art.belly} />
          <Path d="M 93 112 Q 100 106 107 112 Q 100 122 93 112" fill="#3a2b24" />
        </G>
      );
    case 'lion':
      return (
        <G>
          <Ellipse cx={100} cy={126} rx={26} ry={18} fill={art.belly} opacity={0.9} />
          <Path d="M 93 114 Q 100 108 107 114 Q 100 124 93 114" fill="#6b4a2c" />
        </G>
      );
    case 'gorilla':
      return (
        <G>
          <Ellipse cx={92} cy={122} rx={4.5} ry={6.5} fill="#39404b" />
          <Ellipse cx={108} cy={122} rx={4.5} ry={6.5} fill="#39404b" />
        </G>
      );
    case 'dragon':
      return (
        <G>
          <Ellipse cx={91} cy={116} rx={4} ry={5} fill="#2c4a34" />
          <Ellipse cx={109} cy={116} rx={4} ry={5} fill="#2c4a34" />
        </G>
      );
    case 'unicorn':
      return (
        <G>
          <Ellipse cx={92} cy={120} rx={3.5} ry={4.5} fill="#b9a4cc" />
          <Ellipse cx={108} cy={120} rx={3.5} ry={4.5} fill="#b9a4cc" />
        </G>
      );
  }
}

function Mouth({ mood }: { mood: MascotMood }) {
  if (mood === 'happy') {
    return (
      <G>
        <Path d="M 83 134 Q 100 157 117 134 Q 100 143 83 134" fill="#5a2e33" />
        <Ellipse cx={100} cy={146} rx={8} ry={4.5} fill="#e6708a" />
      </G>
    );
  }
  if (mood === 'tired') {
    return <Path d="M 89 144 Q 100 135 111 144" stroke="#5a2e33" strokeWidth={4} fill="none" strokeLinecap="round" />;
  }
  return <Path d="M 89 135 Q 100 145 111 135" stroke="#5a2e33" strokeWidth={4} fill="none" strokeLinecap="round" />;
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
    backgroundColor: '#2b2b33',
  },
  pupilShine: {
    position: 'absolute',
    top: 2.5,
    left: 3,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
  },
  pupilShineSm: {
    position: 'absolute',
    bottom: 3,
    right: 3.5,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  lid: {
    position: 'absolute',
    width: LID_W,
    height: LID_H,
    borderRadius: 18,
  },
});
