/**
 * Mascot3D — real-time 3D buddy (path B). Renders the rigged/textured koala
 * GLB with react-three-fiber over expo-gl, driven by the Emotion Engine.
 *
 * Animation is procedural per-bone: named bones from the UniRig skeleton
 * (head/neck, shoulders, forearms) are rotated off their rest pose and blended
 * by the Emotion Engine — wave, double-biceps flex (curl), celebrate throw-up,
 * sleepy head-droop, idle breathe/bob. Only the neck-base bone rotates the head
 * (rigid, so the face never warps). Rest quaternions are cached once on load.
 */
import { Canvas, useFrame } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import * as THREE from 'three';

import { BONES, REQUIRED_BONES } from '@/config/mascot-bones';
import { FACE, type EyeSpec } from '@/config/mascot-face';
import type { MascotEmotion } from '@/lib/mascot-emotion';

const MODEL = require('../../../assets/mascots/koa.glb');

// Animation roles → canonical bones (mascot-bones.ts is the single source of
// truth). `posArm` is the +X arm (abducts with +Z), `negArm` the −X arm (−Z).
const RIG = {
  head: BONES.head,
  posArm: BONES.leftShoulder,
  posFore: BONES.leftForeArm,
  negArm: BONES.rightShoulder,
  negFore: BONES.rightForeArm,
} as const;

// reusable temporaries (single koala on screen, so module-shared is fine)
const _rd = new THREE.Quaternion();
const _rd2 = new THREE.Quaternion();
const _acc = new THREE.Quaternion();
// WORLD axes — we rotate bones in world (koala) space, not their local frame,
// so the direction of each pose is geometrically predictable regardless of how
// the auto-rig oriented each bone.
const _WX = new THREE.Vector3(1, 0, 0); // pitch (nod / curl)
const _WY = new THREE.Vector3(0, 1, 0); // yaw (head look left / right)
const _WZ = new THREE.Vector3(0, 0, 1); // roll (arm abduction — swing out to the side)
const _rd3 = new THREE.Quaternion();

interface Pose {
  head: number; // world-X nod (+ = look down)
  headYaw: number; // world-Y head turn (+ = look to +X side)
  tilt: number; // world-Z head tilt
  rArmX: number; // R upper-arm world-X (− = swing forward, hand in front of hip)
  rArmZ: number; // R upper-arm world-Z (+ = abduct out to the side)
  lArmX: number; // L upper-arm world-X (− = swing forward)
  lArmZ: number; // L upper-arm world-Z (− = abduct out, mirrored)
  rFore: number; // R forearm world-X curl
  lFore: number; // L forearm world-X curl
}
const lerp = THREE.MathUtils.lerp;

// HERO_MODEL_SPEC: the arms must NEVER touch the body — always keep a visible
// gap (Pixar-style round mascot, silhouette first). At rest the upper arms are
// held OUT to the side (Z) and slightly FORWARD so the hands sit just in front
// of the hips, clear of the shorts. Right arm abducts +Z, left mirrors −Z.
const REST_ARM_OUT = 0.42; // abduction (side clearance)
const REST_ARM_FWD = -0.3; // forward swing (hands in front of hips)

function Koala({ emotion, level = 1 }: { emotion: MascotEmotion; level?: number }) {
  const gltf = useGLTF(MODEL);
  const scene = (Array.isArray(gltf) ? gltf[0] : gltf).scene as THREE.Group;
  const group = useRef<THREE.Group>(null);
  const emo = useRef<MascotEmotion>(emotion);
  emo.current = emotion;
  const lvl = useRef(level);
  lvl.current = level;

  const t0 = useRef(0);
  const cur = useRef<Pose>({ head: 0, headYaw: 0, tilt: 0, rArmX: 0, rArmZ: 0, lArmX: 0, lArmZ: 0, rFore: 0, lFore: 0 });
  // living-idle state machine (intentful look / tilt / stretch) + weight shift
  const idle = useRef({
    timer: 1.2,
    action: 'none' as 'none' | 'look' | 'tilt' | 'stretch',
    actionT: 0,
    lookX: 0,
    lookY: 0,
    tiltZ: 0,
    weightTgt: 0,
    weightCur: 0,
    weightTimer: 1,
  });

  // Fit the model to ~1.55 units tall with feet at y=0 — applied to a wrapper
  // group (NOT by cloning the scene: cloning a rigged SkinnedMesh detaches the
  // skeleton and breaks/throws). We render the shared scene directly, then find
  // the bones once and cache each one's rest quaternion.
  const { fit, bones, baseQ, parentW, parentWInv } = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = 1.55 / (size.y || 1);
    const b: Record<string, THREE.Bone> = {};
    const q: Record<string, THREE.Quaternion> = {};
    scene.traverse((o: any) => {
      if (o.isMesh) o.frustumCulled = false;
      if (o.isBone) {
        b[o.name] = o;
        q[o.name] = o.quaternion.clone();
      }
    });
    // Validate the rig (warn, never crash) per the spec's automatic check.
    for (const key of REQUIRED_BONES) {
      if (!b[BONES[key]]) {
        // eslint-disable-next-line no-console
        console.warn(`[Mascot3D] missing bone "${key}" (${BONES[key]}) — animation for it is skipped`);
      }
    }
    // Cache each animated bone's parent world-orientation (at rest) so we can
    // convert a world-space rotation into the bone's local quaternion.
    scene.updateWorldMatrix(true, true);
    const pw: Record<string, THREE.Quaternion> = {};
    const pwi: Record<string, THREE.Quaternion> = {};
    for (const name of Object.values(BONES)) {
      const bone = b[name];
      if (bone?.parent) {
        const w = bone.parent.getWorldQuaternion(new THREE.Quaternion());
        pw[name] = w;
        pwi[name] = w.clone().invert();
      }
    }
    return {
      fit: {
        scale,
        pos: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
      },
      bones: b,
      baseQ: q,
      parentW: pw,
      parentWInv: pwi,
    };
  }, [scene]);

  useEffect(() => {
    t0.current = 0;
  }, [emotion]);

  // Rotate a bone in WORLD space by (angX around world-X) then (angZ around
  // world-Z), on top of its rest pose:  local = parentWⁿⁱ · Rworld · parentW · rest
  const poseBone = (name: string, angX: number, angY: number, angZ: number) => {
    const bone = bones[name];
    const base = baseQ[name];
    const pw = parentW[name];
    const pwi = parentWInv[name];
    if (!bone || !base || !pw || !pwi) return;
    _acc.identity();
    if (angX) {
      _rd.setFromAxisAngle(_WX, angX);
      _acc.multiply(_rd);
    }
    if (angY) {
      _rd3.setFromAxisAngle(_WY, angY);
      _acc.multiply(_rd3);
    }
    if (angZ) {
      _rd2.setFromAxisAngle(_WZ, angZ);
      _acc.multiply(_rd2);
    }
    bone.quaternion.copy(pwi).multiply(_acc).multiply(pw).multiply(base);
  };

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    t0.current += delta;
    const t = t0.current;
    const e = emo.current;
    const slow = e === 'sleep' || e === 'sad' || e === 'tired';
    const breathe = Math.sin(t * (slow ? 1.4 : 2.2)) * 0.5 + 0.5;

    // whole-object motion
    let py = 0;
    let spin = 0;
    let lean = 0;
    let roll = 0; // body weight-shift (z)

    // Start every frame from the mandatory rest pose: arms OUT + slightly
    // FORWARD so there is always a visible arm↔body gap (HERO_MODEL_SPEC).
    const tp: Pose = {
      head: 0,
      headYaw: 0,
      tilt: 0,
      rArmX: REST_ARM_FWD,
      rArmZ: REST_ARM_OUT,
      lArmX: REST_ARM_FWD,
      lArmZ: -REST_ARM_OUT,
      rFore: 0,
      lFore: 0,
    };

    if (e === 'celebrate') {
      const hop = Math.max(0, Math.sin(t * 6)) * 0.16;
      py = hop;
      spin = Math.min(t * 2.5, Math.PI * 2);
      // both arms thrown up (abduct near-vertical)
      tp.rArmX = 0;
      tp.lArmX = 0;
      tp.rArmZ = 2.3;
      tp.lArmZ = -2.3;
      tp.head = -0.12;
    } else if (e === 'wave') {
      // right arm raised out to the side, forearm waving; left stays at rest
      tp.rArmX = -0.1;
      tp.rArmZ = 1.7;
      tp.rFore = Math.sin(t * 9) * 0.5;
      tp.tilt = 0.12;
      tp.head = -0.05;
    } else if (e === 'curl') {
      // double-biceps flex — arms out to the sides, forearms pump up
      const pump = Math.sin(t * 3) * 0.5 + 0.5;
      tp.rArmX = 0;
      tp.lArmX = 0;
      tp.rArmZ = 1.45;
      tp.lArmZ = -1.45;
      tp.rFore = -(1.0 + pump * 0.5);
      tp.lFore = -(1.0 + pump * 0.5);
    } else if (e === 'sleep') {
      lean = 0.16;
      tp.head = 0.5 + breathe * 0.03; // head droops forward, gentle breathe
      tp.tilt = 0.14;
    } else if (e === 'sad' || e === 'tired') {
      lean = 0.06;
      tp.head = 0.3;
      tp.tilt = Math.sin(t * 1.1) * 0.04;
    } else {
      // ── living idle (Phase 1). The test: hide the face and the silhouette
      //    must still feel alive. Priorities: WEIGHT (shifts + holds between
      //    the feet), phase-offset breathing (body/head/shoulders not in sync),
      //    intentful head motion (look → hold → settle), and a weighted idle
      //    where 40% of the time it just stands. Energy scales with LEVEL
      //    (Phase 5: low = restless/curious, high = calm/confident). ──
      const happy = e === 'happy';
      const restless = THREE.MathUtils.clamp(1 - (lvl.current - 1) * 0.045, 0.35, 1);
      const id = idle.current;

      // WEIGHT — ease to one foot, hold, then transfer (never perfectly balanced)
      id.weightTimer -= delta;
      if (id.weightTimer <= 0) {
        id.weightTgt = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
        id.weightTimer = 2.6 + Math.random() * 3.4;
      }
      id.weightCur = lerp(id.weightCur, id.weightTgt, 0.018 + restless * 0.02);
      const weight = id.weightCur;

      // intentful action state machine (look / tilt / stretch / just stand)
      id.timer -= delta;
      if (id.action === 'none' && id.timer <= 0) {
        const r = Math.random();
        if (r < 0.55) {
          id.action = 'none'; // 40%-ish: stand (breathing + weight only)
        } else if (r < 0.73) {
          id.action = 'look';
          id.lookX = (Math.random() * 2 - 1) * 0.32 * restless;
          id.lookY = (Math.random() < 0.3 ? 0.1 : 0) * restless;
          id.actionT = 1.2 + Math.random() * 1.6; // hold the gaze
        } else if (r < 0.88) {
          id.action = 'tilt';
          id.tiltZ = (Math.random() * 2 - 1) * 0.14 * restless;
          id.actionT = 1.0 + Math.random() * 1.2;
        } else {
          id.action = 'stretch';
          id.actionT = 1.4;
        }
        id.timer = (1.6 + Math.random() * 2.6) * (1.5 - restless * 0.7);
      }
      if (id.action !== 'none') {
        id.actionT -= delta;
        if (id.actionT <= 0) {
          id.action = 'none'; // return gaze to centre after the beat
          id.lookX = 0; id.lookY = 0; id.tiltZ = 0;
        }
      }
      const stretch = id.action === 'stretch' ? Math.sin((1 - Math.max(0, id.actionT) / 1.4) * Math.PI) : 0;

      // phase-offset breathing — body, head and shoulders not fully in sync
      const bRate = happy ? 2.4 : 1.6;
      const bodyB = Math.sin(t * bRate);
      const headB = Math.sin(t * bRate + 0.5);
      const shB = Math.sin(t * bRate + 0.25);

      py = bodyB * (0.01 + restless * 0.005) + stretch * 0.05;
      tp.head = id.lookY + headB * 0.02 * restless + 0.02 - stretch * 0.12;
      tp.headYaw = id.lookX; // eases slowly below (deliberate turn)
      tp.tilt = id.tiltZ + weight * 0.03 + shB * 0.01;
      roll = weight * 0.05; // body weight-shift
      const armSway = shB * 0.025 * restless + weight * 0.05;
      tp.rArmZ = REST_ARM_OUT + armSway + stretch * 0.5;
      tp.lArmZ = -REST_ARM_OUT + armSway - stretch * 0.5;
      tp.rArmX = REST_ARM_FWD - stretch * 0.2;
      tp.lArmX = REST_ARM_FWD - stretch * 0.2;
      tp.rFore = (happy ? -0.12 : 0) - headB * 0.03;
    }

    // smooth the pose toward the target (head look eases a touch slower)
    const k = 0.12;
    const c = cur.current;
    c.head = lerp(c.head, tp.head, k);
    c.headYaw = lerp(c.headYaw, tp.headYaw, 0.08);
    c.tilt = lerp(c.tilt, tp.tilt, k);
    c.rArmX = lerp(c.rArmX, tp.rArmX, k);
    c.rArmZ = lerp(c.rArmZ, tp.rArmZ, k);
    c.lArmX = lerp(c.lArmX, tp.lArmX, k);
    c.lArmZ = lerp(c.lArmZ, tp.lArmZ, k);
    c.rFore = lerp(c.rFore, tp.rFore, k);
    c.lFore = lerp(c.lFore, tp.lFore, k);

    // apply to bones (head: nod-X + look-Y + tilt-Z; arms: forward-X + abduct-Z)
    poseBone(RIG.head, c.head, c.headYaw, c.tilt);
    poseBone(RIG.posArm, c.rArmX, 0, c.rArmZ);
    poseBone(RIG.posFore, c.rFore, 0, 0);
    poseBone(RIG.negArm, c.lArmX, 0, c.lArmZ);
    poseBone(RIG.negFore, c.lFore, 0, 0);

    // whole-object: bob, spin, forward lean, weight-shift roll + posture.
    // Phase 5 — higher level stands a hair taller (confident).
    const tall = 1 + Math.min((lvl.current - 1) * 0.004, 0.05);
    g.position.y = lerp(g.position.y, py, 0.15);
    g.rotation.y = lerp(g.rotation.y, spin, 0.2);
    g.rotation.x = lerp(g.rotation.x, lean, 0.15);
    g.rotation.z = lerp(g.rotation.z, roll, 0.1);
    g.scale.y = lerp(g.scale.y, tall, 0.05);
  });

  return (
    <group ref={group}>
      <group scale={fit.scale} position={fit.pos}>
        <primitive object={scene} />
      </group>
    </group>
  );
}

// ── 2D eyelid overlay: blink + held-closed for sleepy/sad emotions (per-eye) ──
function FaceOverlay({ emotion, size }: { emotion: MascotEmotion; size: number }) {
  const W = size;
  const Hc = size * 1.25;

  const blink = useSharedValue(0); // 0 = open, 1 = closed
  const base = useSharedValue(0); // emotion-held closure
  const wink = useSharedValue(0); // right-eye only (wink action → sad? reserved)

  useEffect(() => {
    blink.value = withRepeat(
      withSequence(
        withDelay(2600, withTiming(1, { duration: 70, easing: Easing.in(Easing.quad) })),
        withTiming(0, { duration: 110, easing: Easing.out(Easing.quad) }),
      ),
      -1,
    );
  }, [blink]);

  useEffect(() => {
    const target =
      emotion === 'sleep' ? 0.92 : emotion === 'tired' ? 0.5 : emotion === 'sad' ? 0.55 : 0;
    base.value = withTiming(target, { duration: 420 });
    wink.value = 0;
  }, [emotion, base, wink]);

  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, width: W, height: Hc }}>
      <Eyelid eye={FACE.left} W={W} Hc={Hc} blink={blink} base={base} extra={undefined} />
      <Eyelid eye={FACE.right} W={W} Hc={Hc} blink={blink} base={base} extra={wink} />
    </View>
  );
}

function Eyelid({
  eye,
  W,
  Hc,
  blink,
  base,
  extra,
}: {
  eye: EyeSpec;
  W: number;
  Hc: number;
  blink: { value: number };
  base: { value: number };
  extra?: { value: number };
}) {
  const eyeW = eye.w * W;
  const eyeH = eye.h * Hc;
  const lidStyle = useAnimatedStyle(() => {
    const c = Math.max(base.value, blink.value, extra ? extra.value : 0); // 0 open → 1 closed
    return { transform: [{ translateY: (c - 1) * eyeH }] };
  });
  return (
    <View
      style={{
        position: 'absolute',
        left: eye.x * W - eyeW / 2,
        top: eye.y * Hc - eyeH / 2,
        width: eyeW,
        height: eyeH,
        borderRadius: (Math.min(eyeW, eyeH) / 2) * eye.radius,
        overflow: 'hidden',
        opacity: eye.opacity,
        transform: [{ rotate: `${eye.rotation}deg` }],
      }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            top: 0,
            height: '100%',
            backgroundColor: FACE.fur,
            borderBottomLeftRadius: eyeW * 0.5,
            borderBottomRightRadius: eyeW * 0.5,
          },
          lidStyle,
        ]}
      />
    </View>
  );
}

export function Mascot3D({
  emotion = 'idle',
  size = 200,
  accent = '#8f9bff',
  level = 1,
}: {
  emotion?: MascotEmotion;
  size?: number;
  accent?: string;
  level?: number;
}) {
  return (
    <View style={{ width: size, height: size * 1.25 }}>
      <Canvas
        style={{ flex: 1 }}
        camera={{ position: [0, 0.8, 3.5], fov: 32 }}
        gl={{ alpha: true, antialias: true }}
        onCreated={({ gl, camera }) => {
          gl.setClearColor(0x000000, 0);
          // Look horizontally at the buddy's mid-body so the feet sit ~10% above
          // the canvas bottom — leaves a margin so the shoes are never clipped,
          // and the podium.cy is tuned to meet the feet at that height.
          camera.lookAt(0, 0.8, 0);
        }}>
        <ambientLight intensity={0.9} />
        <directionalLight position={[3, 5, 4]} intensity={1.35} castShadow />
        <directionalLight position={[-4, 2, -2]} intensity={0.55} color={accent} />
        <Koala emotion={emotion} level={level} />
      </Canvas>
      <FaceOverlay emotion={emotion} size={size} />
    </View>
  );
}

useGLTF.preload?.(MODEL);

export default Mascot3D;
