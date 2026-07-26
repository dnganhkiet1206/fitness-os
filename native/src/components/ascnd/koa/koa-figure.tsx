import { View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import {
  Blink,
  Breathe,
  Fade,
  Flash,
  Fly,
  Look,
  Pop,
  Rot,
  RunBody,
  Shake,
  Shift,
  useGaze,
  useLoop,
  usePop,
} from '@/components/ascnd/koa/koa-anim';
import {
  BODY,
  CAP,
  DUST,
  FACE,
  GEAR,
  HEAD,
  HEARTS,
  KOA_ASPECT,
  KOA_VIEWBOX,
  LIFT,
  OUTFIT,
  PALETTE as C,
  PIVOTS,
  RELAX,
  SPEED_LINES,
  STEAM,
  STRETCH,
  SWEAT,
  TURN,
  faceFlags,
  poseFlags,
  type KoaExpression,
  type KoaPose,
} from '@/components/ascnd/koa/koa-parts';

/**
 * Koa — the koala from the "KOALA MASCOT – SVG DESIGN" spec sheet, drawn in
 * code so every layer stays animatable (blink, look, mouth, cheek pop) and
 * nothing ships as a bitmap.
 *
 * Two props drive it, exactly as on the sheet:
 *   · `expression` — the eight states of §3, plus `happytired`, the
 *      out-of-breath state Koa wears while running
 *   · `pose` — idle / running / lifting / stretching / relaxing
 *
 * Draw order (bottom → top): shadow → run FX → legs → torso → belly →
 * idle arms → pose arms & gear → ears → head → face → outfits → head FX.
 *
 * Coordinate note: EARS, HEAD and FACE all sit inside `translate(0,11)`, so
 * their path coordinates are head-local while the sheet's transform-origins
 * are given in view-box space. `hy()` converts the latter to the former.
 */

const EMPTY: Set<string> = new Set();

const HEAD_DY = 11;
const hy = (y: number) => y - HEAD_DY;
const DOWN = `translate(0,${HEAD_DY})`;

export interface KoaFigureProps {
  expression?: KoaExpression;
  pose?: KoaPose;
  /** rendered width in px (height = width × 1.25) */
  size?: number;
  /** turn the loops off for static grids and pickers */
  animated?: boolean;
  equippedOutfits?: Set<string>;
  /** bump to make Koa react to a touch — §8's cheek pop, and eyes front */
  pokeSignal?: number;
}

export function KoaFigure({
  expression = 'happy',
  pose = 'idle',
  size = 160,
  animated = true,
  equippedOutfits = EMPTY,
  pokeSignal = 0,
}: KoaFigureProps) {
  const f = faceFlags(expression);
  const p = poseFlags(pose);
  const height = size * KOA_ASPECT;

  // One clock per keyframe period. Each is stopped unless the current
  // expression/pose actually uses it, so an idle Koa runs three loops.
  const idle = useLoop(3600, animated);
  const blushClock = useLoop(4400, animated);
  const blinkA = useLoop(5200, animated && f.eyesOpen);
  const blinkB = useLoop(8700, animated && f.eyesOpen);
  const run = useLoop(1500, animated && p.poseRun);
  const speed = useLoop(1100, animated && p.poseRun);
  const sweat = useLoop(2800, animated && p.poseRun);
  const pop = useLoop(1600, animated && (f.eyesWide || p.poseLift));
  const twinkle = useLoop(1400, animated && f.eyesStar);
  const wink = useLoop(9000, animated && f.lidsWink);
  const shake = useLoop(320, animated && (f.browAngry || f.mouthShout));
  const steam = useLoop(1050, animated && f.showSteam);
  const heart = useLoop(2200, animated && f.showHearts);
  const breath = useLoop(5000, animated && (f.mouthGrin || f.mouthBreath));
  const deep = useLoop(12000, animated && (f.mouthGrin || f.mouthBreath));
  const sway = useLoop(3000, animated && p.poseStretch);

  // §8 GỢI Ý ANIMATE: the wandering gaze, and the cheek pop it snaps out of.
  // Running looks ahead, not around, so the gaze rests while Koa runs.
  const { gx, gy } = useGaze(animated && !p.poseRun, pokeSignal);
  const cheek = usePop(pokeSignal, animated);

  const earShift = p.turn ? `translate(${TURN.earDx},0)` : undefined;
  const earLeftShift = p.turn ? `translate(${TURN.earLeftDx},0)` : undefined;

  /* ── ears ─────────────────────────────────────────────────────────── */
  const ears = (
    <G id="EARS" transform={DOWN}>
      <G transform={earShift}>
        <G transform={earLeftShift}>
          <Rot v={idle} from={0} to={-3.5} ox={PIVOTS.earLeft.x} oy={hy(PIVOTS.earLeft.y)}>
            <Path id="ear_left" d={HEAD.earLeft} fill={C.body} stroke={C.outline} strokeWidth={0.45} />
          </Rot>
        </G>
        <Rot v={idle} from={0} to={3.5} ox={PIVOTS.earRight.x} oy={hy(PIVOTS.earRight.y)}>
          <Path id="ear_right" d={HEAD.earRight} fill={C.body} stroke={C.outline} strokeWidth={0.45} />
        </Rot>
        <G transform={earLeftShift}>
          <Path id="ear_left_inner" d={HEAD.earLeftInner} fill={C.light} />
        </G>
        <Path id="ear_right_inner" d={HEAD.earRightInner} fill={C.light} />
      </G>
    </G>
  );

  /* ── eyes ─────────────────────────────────────────────────────────── */
  const eyes = (
    <>
      {f.eyesOpen && (
        <>
          <Ellipse id="eye_left" cx={FACE.eye.left.cx} cy={FACE.eye.left.cy} rx={FACE.eye.rx} ry={FACE.eye.ry} fill={C.white} />
          <Ellipse id="eye_right" cx={FACE.eye.right.cx} cy={FACE.eye.right.cy} rx={FACE.eye.rx} ry={FACE.eye.ry} fill={C.white} />
          {/* pupils + their specular highlights travel together with the gaze */}
          <Look gx={gx} gy={gy} ax={4} ay={2.6}>
            <Ellipse id="pupil_left" cx={FACE.pupil.left.cx} cy={FACE.pupil.left.cy} rx={FACE.pupil.rx} ry={FACE.pupil.ry} fill={C.ink} />
            <Ellipse id="pupil_right" cx={FACE.pupil.right.cx} cy={FACE.pupil.right.cy} rx={FACE.pupil.rx} ry={FACE.pupil.ry} fill={C.ink} />
            <Circle cx={83.5} cy={90} r={4.8} fill={C.white} />
            <Circle cx={92} cy={108} r={2.3} fill={C.white} opacity={0.9} />
            <Circle cx={156.5} cy={90} r={4.8} fill={C.white} />
            <Circle cx={148} cy={108} r={2.3} fill={C.white} opacity={0.9} />
          </Look>
        </>
      )}

      {f.eyesWide && (
        <Breathe v={pop} sx={1.07} sy={1.07} ox={PIVOTS.eyes.x} oy={hy(PIVOTS.eyes.y)}>
          <Ellipse cx={82} cy={95} rx={19.5} ry={25.5} fill={C.white} />
          <Ellipse cx={158} cy={95} rx={19.5} ry={25.5} fill={C.white} />
          <Look gx={gx} gy={gy} ax={4.5} ay={3}>
            <Ellipse cx={89} cy={96} rx={11} ry={13} fill={C.ink} />
            <Ellipse cx={151} cy={96} rx={11} ry={13} fill={C.ink} />
            <Circle cx={84.5} cy={90} r={3.8} fill={C.white} />
            <Circle cx={146.5} cy={90} r={3.8} fill={C.white} />
          </Look>
        </Breathe>
      )}

      {f.eyesArc && (
        <>
          <Path d={FACE.arcLeft} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
          <Path d={FACE.arcRight} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
        </>
      )}

      {f.eyesStar && (
        <>
          <Ellipse cx={82} cy={96} rx={17} ry={22.5} fill={C.ink} />
          <Ellipse cx={158} cy={96} rx={17} ry={22.5} fill={C.ink} />
          <Breathe v={twinkle} sx={1.18} sy={1.18} ox={PIVOTS.starLeft.x} oy={hy(PIVOTS.starLeft.y)}>
            <Rot v={twinkle} from={0} to={12} ox={PIVOTS.starLeft.x} oy={hy(PIVOTS.starLeft.y)}>
              <Path d={FACE.starLeft} fill={C.star} />
            </Rot>
          </Breathe>
          <Breathe v={twinkle} phase={0.25} sx={1.18} sy={1.18} ox={PIVOTS.starRight.x} oy={hy(PIVOTS.starRight.y)}>
            <Rot v={twinkle} phase={0.25} from={0} to={12} ox={PIVOTS.starRight.x} oy={hy(PIVOTS.starRight.y)}>
              <Path d={FACE.starRight} fill={C.star} />
            </Rot>
          </Breathe>
        </>
      )}
    </>
  );

  /* ── lids & brows ─────────────────────────────────────────────────── */
  const lids = (
    <>
      {f.lidsHalf && (
        <>
          <Path id="upper_eyelid_left" d={FACE.lidHalfLeft} fill={C.body} />
          <Path id="upper_eyelid_right" d={FACE.lidHalfRight} fill={C.body} />
          <Path d={FACE.lidHalfLineLeft} stroke={C.ink} strokeWidth={4} strokeLinecap="round" fill="none" />
          <Path d={FACE.lidHalfLineRight} stroke={C.ink} strokeWidth={4} strokeLinecap="round" fill="none" />
        </>
      )}
      {f.lidsHeavy && (
        <>
          <Path d={FACE.lidHeavyLeft} fill={C.body} />
          <Path d={FACE.lidHeavyRight} fill={C.body} />
          <Path d={FACE.lidHeavyLineLeft} stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" />
          <Path d={FACE.lidHeavyLineRight} stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        </>
      )}
      {f.lidsSad && (
        <>
          <Path d={FACE.lidSadLeft} fill={C.body} />
          <Path d={FACE.lidSadRight} fill={C.body} />
          <Path d={FACE.lidSadLineLeft} stroke={C.ink} strokeWidth={3.6} strokeLinecap="round" fill="none" />
          <Path d={FACE.lidSadLineRight} stroke={C.ink} strokeWidth={3.6} strokeLinecap="round" fill="none" />
        </>
      )}
    </>
  );

  const brows = (
    <>
      {f.browArc && (
        <>
          <Path id="eyebrow_left" d={FACE.browArcLeft} stroke={C.ink} strokeWidth={5} strokeLinecap="round" fill="none" />
          <Path id="eyebrow_right" d={FACE.browArcRight} stroke={C.ink} strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      )}
      {f.browRaised && (
        <>
          <Path d={FACE.browRaisedLeft} stroke={C.shadow} strokeWidth={4.5} strokeLinecap="round" fill="none" />
          <Path d={FACE.browRaisedRight} stroke={C.shadow} strokeWidth={4.5} strokeLinecap="round" fill="none" />
        </>
      )}
      {f.browSad && (
        <>
          <Path d={FACE.browSadLeft} stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" opacity={0.75} />
          <Path d={FACE.browSadRight} stroke={C.ink} strokeWidth={4.5} strokeLinecap="round" fill="none" opacity={0.75} />
        </>
      )}
    </>
  );

  /* ── mouths ───────────────────────────────────────────────────────── */
  const mouth = (
    <>
      {f.mouthSmile && (
        <>
          <Path id="mouth" d={FACE.smile} fill={C.ink} />
          <Ellipse id="tongue" cx={120} cy={139} rx={9} ry={5} fill={C.tongue} />
          <Path d={FACE.smileLip} stroke={C.ink} strokeWidth={5} strokeLinecap="round" fill="none" />
        </>
      )}

      {/* the grin drops open when Koa takes a breath, and again on the sigh */}
      {f.mouthGrin && (
        <Flash v={deep} windows={[[0.84, 0.03, 0.03, 0.99]]} invert>
          <Flash v={breath} windows={[[0.58, 0.05, 0.05, 0.93]]} invert>
            <Path d={FACE.grin} fill={C.ink} />
            <Ellipse cx={120} cy={140} rx={10} ry={5.5} fill={C.tongue} />
            <Path d={FACE.grinLip} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
          </Flash>
        </Flash>
      )}

      {f.mouthBreath && (
        <>
          <Flash
            v={breath}
            windows={[[0.58, 0.08, 0.06, 0.9]]}
            scaleFrom={0.7}
            scaleTo={1}
            ox={PIVOTS.mouth.x}
            oy={hy(PIVOTS.mouth.y)}>
            <Ellipse cx={120} cy={138} rx={11} ry={13} fill={C.ink} />
            <Ellipse cx={120} cy={144} rx={7} ry={5} fill={C.tongue} />
          </Flash>
          <Fly v={breath} start={0.6} dx={26} dy={-10} s0={0.5} s1={1.5} peak={0.75} peakAt={0.25} ox={127} oy={hy(140)}>
            <Ellipse cx={127} cy={140} rx={7} ry={5.5} fill={C.white} opacity={0.92} />
          </Fly>
          <Fly v={breath} phase={0.05} start={0.6} dx={26} dy={-10} s0={0.5} s1={1.5} peak={0.75} peakAt={0.25} ox={127} oy={hy(140)}>
            <Ellipse cx={127} cy={140} rx={5} ry={4} fill={C.white} opacity={0.92} />
          </Fly>
          <Flash
            v={deep}
            windows={[[0.84, 0.05, 0.04, 0.98]]}
            scaleFrom={0.6}
            scaleTo={1.25}
            ox={PIVOTS.mouth.x}
            oy={hy(PIVOTS.mouth.y)}>
            <Ellipse cx={120} cy={139} rx={12} ry={15} fill={C.ink} />
            <Ellipse cx={120} cy={146} rx={7.5} ry={5.5} fill={C.tongue} />
          </Flash>
          <Fly v={deep} start={0.86} dx={38} dy={-16} s0={0.5} s1={2.1} peak={0.85} peakAt={0.25} ox={127} oy={hy(141)}>
            <Ellipse cx={127} cy={141} rx={8} ry={6.5} fill={C.white} opacity={0.92} />
          </Fly>
          <Fly v={deep} phase={0.025} start={0.86} dx={38} dy={-16} s0={0.5} s1={2.1} peak={0.85} peakAt={0.25} ox={127} oy={hy(141)}>
            <Ellipse cx={127} cy={141} rx={5.5} ry={4.5} fill={C.white} opacity={0.92} />
          </Fly>
        </>
      )}

      {f.mouthO && (
        <>
          <Ellipse cx={120} cy={139} rx={7.5} ry={9.5} fill={C.tongue} />
          <Ellipse cx={120} cy={143} rx={4.5} ry={4.5} fill={C.blush} opacity={0.5} />
        </>
      )}
      {f.mouthSmirk && <Path d={FACE.smirk} fill={C.tongue} />}
      {f.mouthFrown && <Path d={FACE.frown} stroke={C.dark} strokeWidth={4} strokeLinecap="round" fill="none" />}
      {f.mouthFlat && <Path d={FACE.flat} stroke={C.dark} strokeWidth={4} strokeLinecap="round" fill="none" />}
    </>
  );

  /* ── face ─────────────────────────────────────────────────────────── */
  const face = (
    <G id="FACE" transform={DOWN}>
      <G transform={p.turn ? `translate(${TURN.faceDx},0)` : undefined}>
        {eyes}
        {lids}

        {f.lidsWink && (
          <Flash
            v={wink}
            windows={[
              [0.26, 0.04, 0.04, 0.44],
              [0.72, 0.04, 0.04, 0.9],
            ]}>
            <Ellipse cx={82} cy={96} rx={21} ry={26} fill={C.body} />
            <Ellipse cx={158} cy={96} rx={21} ry={26} fill={C.body} />
            <Path d={FACE.arcLeft} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
            <Path d={FACE.arcRight} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
          </Flash>
        )}

        {brows}

        {f.browAngry && (
          <Shake v={shake}>
            <Path d={FACE.browAngryMaskLeft} fill={C.body} />
            <Path d={FACE.browAngryMaskRight} fill={C.body} />
            <Path d={FACE.browAngryLeft} stroke={C.ink} strokeWidth={8} strokeLinecap="round" fill="none" />
            <Path d={FACE.browAngryRight} stroke={C.ink} strokeWidth={8} strokeLinecap="round" fill="none" />
            <Path d={FACE.angryTickLeft} stroke={C.ink} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.45} />
            <Path d={FACE.angryTickRight} stroke={C.ink} strokeWidth={3} strokeLinecap="round" fill="none" opacity={0.45} />
          </Shake>
        )}

        <Path id="nose" d={HEAD.nose} fill={C.dark} />
        <Ellipse cx={114} cy={94} rx={3.5} ry={5.5} fill={C.white} opacity={0.16} transform="rotate(-18 114 94)" />
        <Path d={HEAD.nostrilLeft} stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.35} />
        <Path d={HEAD.nostrilRight} stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" fill="none" opacity={0.35} />
        <Path d={HEAD.philtrum} stroke={C.ink} strokeWidth={3.4} strokeLinecap="round" fill="none" />

        {mouth}

        {f.mouthShout && (
          <Shake v={shake}>
            <Path d={FACE.shout} fill={C.ink} />
            <Ellipse cx={120} cy={148} rx={11} ry={5.5} fill={C.tongue} />
            <Path d={FACE.shoutLip} stroke={C.ink} strokeWidth={5.5} strokeLinecap="round" fill="none" />
            <Path d={FACE.toothLeft} fill={C.white} />
            <Path d={FACE.toothRight} fill={C.white} />
            <Path d={FACE.shoutInnerLip} stroke={C.ink} strokeWidth={5} strokeLinecap="round" fill="none" />
          </Shake>
        )}

        <Fade v={blushClock} from={1} to={0.72}>
          <Pop v={cheek} sx={1.4} sy={1.4} ox={FACE.blush.left.cx} oy={FACE.blush.left.cy}>
            <Ellipse
              id="blush_left"
              cx={FACE.blush.left.cx}
              cy={FACE.blush.left.cy}
              rx={FACE.blush.rx}
              ry={FACE.blush.ry}
              fill={C.blush}
              transform={`rotate(${FACE.blush.left.rot} ${FACE.blush.left.cx} ${FACE.blush.left.cy})`}
            />
          </Pop>
        </Fade>
        <Fade v={blushClock} phase={0.136} from={1} to={0.72}>
          <Pop v={cheek} sx={1.4} sy={1.4} ox={FACE.blush.right.cx} oy={FACE.blush.right.cy}>
            <Ellipse
              id="blush_right"
              cx={FACE.blush.right.cx}
              cy={FACE.blush.right.cy}
              rx={FACE.blush.rx}
              ry={FACE.blush.ry}
              fill={C.blush}
              transform={`rotate(${FACE.blush.right.rot} ${FACE.blush.right.cx} ${FACE.blush.right.cy})`}
            />
          </Pop>
        </Fade>

        {f.showSteam && (
          <G transform="translate(0,4)">
            <Fly v={steam} dx={0} dy={-14} s0={0.85} s1={1.1} peak={0.9} peakAt={0.4} ox={120} oy={hy(20)}>
              <G stroke={C.tongue} strokeWidth={3.5} fill="none" strokeLinecap="round">
                {STEAM.map((s) => (
                  <Circle key={`${s.cx}-${s.cy}`} cx={s.cx} cy={s.cy} r={s.r} />
                ))}
              </G>
            </Fly>
          </G>
        )}

        {/* blink lids — two loops out of phase, so blinks never feel metronomic */}
        {f.eyesOpen && (
          <>
            <Blink v={blinkA} ox={PIVOTS.lids.x} oy={hy(PIVOTS.lids.y)}>
              <Ellipse cx={82} cy={96} rx={19} ry={25} fill={C.body} />
              <Ellipse cx={158} cy={96} rx={19} ry={25} fill={C.body} />
            </Blink>
            <Blink v={blinkB} double ox={PIVOTS.lids.x} oy={hy(PIVOTS.lids.y)}>
              <Ellipse cx={82} cy={96} rx={19} ry={25} fill={C.body} />
              <Ellipse cx={158} cy={96} rx={19} ry={25} fill={C.body} />
            </Blink>
          </>
        )}
      </G>
    </G>
  );

  /* ── outfits worn on the head ─────────────────────────────────────── */
  const headOutfits = (
    <G transform={DOWN}>
      {equippedOutfits.has('headband') && <Rect {...OUTFIT.headband} fill="#c85466" />}
      {equippedOutfits.has('cap') && <Path d={OUTFIT.capBrim} fill="#3a6db0" />}
      {equippedOutfits.has('sunglasses') && (
        <G>
          <Rect {...OUTFIT.sunglassLeft} fill="#101318" />
          <Rect {...OUTFIT.sunglassRight} fill="#101318" />
          <Path d={OUTFIT.sunglassBridge} stroke="#101318" strokeWidth={4} />
        </G>
      )}
    </G>
  );

  /* ── head rig ─────────────────────────────────────────────────────── */
  const head = (
    <G
      transform={
        p.turn
          ? `rotate(${TURN.headRotate} ${TURN.headRotateOx} ${TURN.headRotateOy}) ` +
            `translate(${TURN.headRotateOx},0) scale(${TURN.headScaleX},1) translate(${-TURN.headRotateOx},0)`
          : undefined
      }>
      <Shift v={idle} dy={-2.5} deg={-0.8} ox={PIVOTS.head.x} oy={PIVOTS.head.y}>
        {/* §8 cheek pop: the head squashes wide onto the shoulders when poked */}
        <Pop v={cheek} sx={1.06} sy={0.95} dy={2} ox={PIVOTS.cheekPop.x} oy={PIVOTS.cheekPop.y}>
        {ears}
        <G id="HEAD" transform={DOWN}>
          <Path id="head_front" d={HEAD.front} fill={C.body} stroke={C.outline} strokeWidth={0.45} />
          <G id="head_top_fur">
            <Path d={HEAD.topFurA} fill={C.body} stroke={C.outline} strokeWidth={0.45} strokeLinejoin="round" />
            <Path d={HEAD.topFurB} fill={C.body} stroke={C.outline} strokeWidth={0.45} strokeLinejoin="round" />
            <Path d={HEAD.topFurFill} fill={C.body} />
          </G>
        </G>

        {/* turned to the right, the near ear rides in front of the skull */}
        {p.turn && (
          <G transform={DOWN}>
            <G transform={`translate(${TURN.earDx + TURN.earLeftDx},0)`}>
              <Rot v={idle} from={0} to={-3.5} ox={PIVOTS.earLeft.x} oy={hy(PIVOTS.earLeft.y)}>
                <Path d={HEAD.earLeft} fill={C.body} stroke={C.outline} strokeWidth={0.45} />
                <Path d={HEAD.earLeftInner} fill={C.light} />
              </Rot>
            </G>
          </G>
        )}

          {face}
          {headOutfits}
        </Pop>
      </Shift>
    </G>
  );

  /* ── body ─────────────────────────────────────────────────────────── */

  const standingLegs = (
    <G id="LEGS">
      <Path id="leg_left_lower" d={BODY.legLeftLower} fill={C.body} />
      <Path id="leg_right_lower" d={BODY.legRightLower} fill={C.body} />
      <Ellipse cx={96} cy={291} rx={17} ry={5} fill={C.shadow} opacity={0.26} />
      <Ellipse cx={144} cy={291} rx={17} ry={5} fill={C.shadow} opacity={0.26} />
      <Path d={BODY.shinLeft} fill={C.shade} opacity={0.5} />
      <Path d={BODY.shinRight} fill={C.shade} opacity={0.5} />
    </G>
  );

  const runningLegs = (
    <>
      <G transform="translate(6,0)">
        <Rot v={run} phase={0.9} from={-22} to={24} ox={PIVOTS.legLeft.x} oy={PIVOTS.legLeft.y}>
          <Path d={BODY.legRunLeft} fill={C.body} />
          <Ellipse cx={96} cy={291} rx={17} ry={5} fill={C.shadow} opacity={0.26} />
          <Path d={BODY.shinLeft} fill={C.shade} opacity={0.5} />
        </Rot>
      </G>
      <G transform="translate(6,0)">
        <Rot v={run} from={16} to={-17} ox={PIVOTS.legRight.x} oy={PIVOTS.legRight.y}>
          <Path d={BODY.legRunRight} fill={C.body} />
          <Ellipse cx={144} cy={291} rx={17} ry={5} fill={C.shadow} opacity={0.26} />
          <Path d={BODY.shinRight} fill={C.shade} opacity={0.5} />
        </Rot>
      </G>
    </>
  );

  const tank = (color: string, withShorts = true) => (
    <>
      <Path d={GEAR.tank} fill={color} />
      <Ellipse
        cx={GEAR.shoulderLeft.cx}
        cy={GEAR.shoulderLeft.cy}
        rx={GEAR.shoulderLeft.rx}
        ry={GEAR.shoulderLeft.ry}
        fill={color}
        transform={`rotate(${GEAR.shoulderLeft.rot} ${GEAR.shoulderLeft.cx} ${GEAR.shoulderLeft.cy})`}
      />
      <Ellipse
        cx={GEAR.shoulderRight.cx}
        cy={GEAR.shoulderRight.cy}
        rx={GEAR.shoulderRight.rx}
        ry={GEAR.shoulderRight.ry}
        fill={color}
        transform={`rotate(${GEAR.shoulderRight.rot} ${GEAR.shoulderRight.cx} ${GEAR.shoulderRight.cy})`}
      />
      {withShorts && <Path d={GEAR.shorts} fill={C.gear} />}
    </>
  );

  const dumbbell = (b: { x: number; y: number; midX: number; midY: number }) => (
    <G>
      <Rect x={b.x} y={b.y} width={16} height={10} rx={4} fill={C.weight} />
      <Rect x={b.midX} y={b.midY} width={8} height={16} rx={3} fill={C.weightMid} />
      <Rect x={b.x} y={b.y + 22} width={16} height={10} rx={4} fill={C.weight} />
    </G>
  );

  /** a limb is a fat stroke with a darker one behind it — the sheet's trick */
  const limb = (d: string) => (
    <>
      <Path d={d} stroke={C.shade} strokeWidth={29} strokeLinecap="round" fill="none" />
      <Path d={d} stroke={C.body} strokeWidth={26} strokeLinecap="round" fill="none" />
    </>
  );

  const hand = (h: { cx: number; cy: number; r: number }) => (
    <Circle cx={h.cx} cy={h.cy} r={h.r} fill={C.body} stroke={C.shade} strokeWidth={1.2} />
  );

  const body = (
    <>
      <G id="BODYRIG">
        <Breathe v={idle} sx={1.015} sy={1.025} ox={PIVOTS.body.x} oy={PIVOTS.body.y}>
          {p.legsStand && standingLegs}
          {p.poseRun && runningLegs}

          <G id="TORSO">
            <Path id="torso_front" d={BODY.torsoFront} fill={C.body} />
            <G
              transform={
                p.turn
                  ? `translate(${TURN.bellyOx},${TURN.bellyOy}) scale(${TURN.bellyScaleX},1) ` +
                    `translate(${-TURN.bellyOx},${-TURN.bellyOy}) translate(${TURN.bellyDx},0)`
                  : undefined
              }>
              <Path id="belly" d={BODY.belly} fill={C.light} />
              <Path d={BODY.chestLine} fill={C.shade} opacity={0.32} />
            </G>
          </G>

          {p.armsIdle && (
            <G id="ARMS">
              <Rot v={idle} from={0} to={2.5} ox={PIVOTS.armLeft.x} oy={PIVOTS.armLeft.y}>
                <Path id="arm_left_upper" d={BODY.armLeftUpper} fill={C.body} />
              </Rot>
              <Rot v={idle} from={0} to={-2.5} ox={PIVOTS.armRight.x} oy={PIVOTS.armRight.y}>
                <Path id="arm_right_upper" d={BODY.armRightUpper} fill={C.body} />
              </Rot>
              <Path d={BODY.armLeftCrease} fill={C.shade} opacity={0.55} />
              <Path d={BODY.armRightCrease} fill={C.shade} opacity={0.55} />
            </G>
          )}
        </Breathe>
      </G>

      {p.legsSit && (
        <G>
          <Path d={BODY.sitLegs} fill={C.body} />
          <Path d={BODY.sitCrease} stroke={C.shade} strokeWidth={2.6} strokeLinecap="round" fill="none" opacity={0.5} />
          <Ellipse cx={92} cy={284} rx={15} ry={8} fill={C.light} opacity={0.65} />
          <Ellipse cx={148} cy={284} rx={15} ry={8} fill={C.light} opacity={0.65} />
        </G>
      )}

      {p.poseRun && (
        <G id="ARMS">
          <G transform={`translate(${TURN.armLeftDx},0) rotate(${TURN.armLeftRotate} ${TURN.armLeftOx} ${TURN.armLeftOy})`}>
            <Rot v={run} phase={0.9} from={-22} to={24} ox={PIVOTS.armLeft.x} oy={PIVOTS.armLeft.y}>
              <Path d={BODY.armRunLeft} fill={C.body} />
            </Rot>
          </G>
          <Rot v={run} from={16} to={-17} ox={PIVOTS.armRight.x} oy={PIVOTS.armRight.y}>
            <Path d={BODY.armRunRight} fill={C.body} />
          </Rot>
          <Path d={BODY.armRightCrease} fill={C.shade} opacity={0.55} />
          <G transform={`translate(${TURN.armLeftDx},0) rotate(${TURN.armLeftRotate} ${TURN.armLeftOx} ${TURN.armLeftOy})`}>
            <Path d={BODY.armLeftCrease} fill={C.shade} opacity={0.55} />
          </G>
        </G>
      )}

      {p.poseLift && (
        <>
          {tank(C.tankLift)}
          <Rot v={pop} from={0} to={-16} ox={PIVOTS.curlLeft.x} oy={PIVOTS.curlLeft.y}>
            {limb(LIFT.armLeft)}
            {hand(LIFT.handLeft)}
            {dumbbell(LIFT.bellLeft)}
          </Rot>
          <Rot v={pop} from={-16} to={0} ox={PIVOTS.curlRight.x} oy={PIVOTS.curlRight.y}>
            {limb(LIFT.armRight)}
            {hand(LIFT.handRight)}
            {dumbbell(LIFT.bellRight)}
          </Rot>
        </>
      )}

      {p.poseStretch && (
        <>
          {tank(C.tankStretch)}
          {limb(STRETCH.restArm)}
          {hand(STRETCH.restHand)}
        </>
      )}

      {p.poseRelax && (
        <>
          {tank(C.tankRelax, false)}
          <Shift v={idle} dy={1.5}>
            {limb(RELAX.armLeft)}
            {hand(RELAX.handLeft)}
            {limb(RELAX.armRight)}
            {hand(RELAX.handRight)}
          </Shift>
        </>
      )}
    </>
  );

  return (
    <View style={{ width: size, height }} pointerEvents="none">
      <Svg width={size} height={height} viewBox={KOA_VIEWBOX} preserveAspectRatio="xMidYMax meet">
        {/* ground shadow — squashes a touch with the breath */}
        <G
          transform={
            p.turn
              ? `translate(${TURN.shadowOx},${TURN.shadowOy}) scale(${TURN.shadowScaleX},1) ` +
                `translate(${-TURN.shadowOx},${-TURN.shadowOy})`
              : undefined
          }>
          <Fade v={idle} from={0.45} to={0.4}>
            <Breathe v={idle} sx={0.96} sy={1} ox={PIVOTS.shadow.x} oy={PIVOTS.shadow.y}>
              <Ellipse id="shadow" cx={120} cy={294} rx={64} ry={9} fill={C.shadow} />
            </Breathe>
          </Fade>
        </G>

        {/* running: the world streaks past and the heels kick up dust */}
        {p.poseRun && (
          <>
            <G stroke={C.speed} strokeLinecap="round" fill="none">
              {SPEED_LINES.map((l) => (
                <Fly
                  key={l.d}
                  v={speed}
                  phase={l.delay / 1100}
                  dx={-60}
                  dy={0}
                  sx0={0.4}
                  sx1={1.3}
                  peak={0.55}
                  peakAt={0.25}
                  ease={false}
                  ox={120}
                  oy={150}>
                  <Path d={l.d} strokeWidth={l.w} />
                </Fly>
              ))}
            </G>
            <G fill={C.speed}>
              {DUST.map((d) => (
                <Fly
                  key={`${d.cx}-${d.cy}`}
                  v={run}
                  phase={d.delay / 1500}
                  dx={-30}
                  dy={-14}
                  s0={0.4}
                  s1={1.5}
                  peak={0.55}
                  peakAt={0.2}
                  ox={d.cx}
                  oy={d.cy}>
                  <Ellipse cx={d.cx} cy={d.cy} rx={d.rx} ry={d.ry} />
                </Fly>
              ))}
            </G>
          </>
        )}

        {/* POSERIG — the whole figure, turned 3/4 right while running */}
        <G
          id="POSERIG"
          transform={
            p.turn
              ? `rotate(${TURN.bodyRotate} ${TURN.bodyRotateOx} ${TURN.bodyRotateOy}) ` +
                `translate(${TURN.bodyScaleOx},0) scale(${TURN.bodyScaleX},1) translate(${-TURN.bodyScaleOx},0)`
              : undefined
          }>
          <RunBody v={run} ox={PIVOTS.runBody.x} oy={PIVOTS.runBody.y}>
            {body}
            {head}

            {p.poseRun && (
              <>
                <Path d={CAP.crown} fill={C.cap} />
                <Path d={CAP.shade} fill={C.capShade} opacity={0.35} />
                <G fill={C.sweat}>
                  {SWEAT.map((s, i) => (
                    <Fly
                      key={s.d}
                      v={sweat}
                      phase={(i * 0.37) % 1}
                      dx={s.dir === 'left' ? -22 : s.dir === 'right' ? 22 : 0}
                      dy={s.dir === 'up' ? -24 : -14}
                      s0={0.6}
                      s1={1.05}
                      peak={s.opacity}
                      peakAt={0.25}
                      ox={s.ox}
                      oy={s.oy}>
                      <Path d={s.d} transform={`rotate(${s.rot} ${s.ox} ${s.oy})`} />
                    </Fly>
                  ))}
                </G>
              </>
            )}

            {p.poseStretch && (
              <Rot v={sway} from={0} to={-6} ox={PIVOTS.stretchArm.x} oy={PIVOTS.stretchArm.y}>
                <Path d={STRETCH.reach} stroke={C.shade} strokeWidth={24} strokeLinecap="round" fill="none" />
                <Path d={STRETCH.reach} stroke={C.body} strokeWidth={21} strokeLinecap="round" fill="none" />
                <Circle
                  cx={STRETCH.reachHand.cx}
                  cy={STRETCH.reachHand.cy}
                  r={STRETCH.reachHand.r}
                  fill={C.body}
                  stroke={C.shade}
                  strokeWidth={1.2}
                />
              </Rot>
            )}

            {f.showHearts &&
              HEARTS.map((h) => (
                <Fly
                  key={h.d}
                  v={heart}
                  phase={h.delay / 2200}
                  dx={0}
                  dy={-20}
                  s0={0.8}
                  s1={1.05}
                  peak={h.opacity}
                  peakAt={0.35}
                  ox={h.ox}
                  oy={h.oy}>
                  <Path d={h.d} fill={C.tongue} />
                </Fly>
              ))}
          </RunBody>
        </G>

        {/* medal + lifting belt ride on the torso, above everything else */}
        {equippedOutfits.has('medal') && (
          <G>
            <Path d={OUTFIT.medalRibbon} stroke="#c85466" strokeWidth={6} fill="none" />
            <Circle cx={OUTFIT.medal.cx} cy={OUTFIT.medal.cy} r={OUTFIT.medal.r} fill="#e0b23a" />
          </G>
        )}
        {equippedOutfits.has('belt') && (
          <G>
            <Rect {...OUTFIT.belt} fill="#4a3826" />
            <Rect {...OUTFIT.beltBuckle} fill="#c9a24a" />
          </G>
        )}
      </Svg>
    </View>
  );
}
