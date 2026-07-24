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
import * as THREE from 'three';

import { BONES, REQUIRED_BONES } from '@/config/mascot-bones';
import { POSES, type KoaPose, type PoseKey } from '@/config/mascot-poses';
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

const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;

// The animator holds a single blended pose and eases it toward the active pose
// (Pose Library, v1.2 P1). Breathing / weight / dynamic overlays are layered on
// at apply time so the pose data stays clean.
function blendPose(cur: KoaPose, tgt: KoaPose, k: number, kSlow: number) {
  cur.hx = lerp(cur.hx, tgt.hx, k);
  cur.hy = lerp(cur.hy, tgt.hy, kSlow); // head look eases slower (deliberate turn)
  cur.hz = lerp(cur.hz, tgt.hz, k);
  cur.armR = lerp(cur.armR, tgt.armR, k);
  cur.armL = lerp(cur.armL, tgt.armL, k);
  cur.armFwd = lerp(cur.armFwd, tgt.armFwd, k);
  cur.foreR = lerp(cur.foreR, tgt.foreR, k);
  cur.foreL = lerp(cur.foreL, tgt.foreL, k);
  cur.lean = lerp(cur.lean, tgt.lean, k);
}

function Koala({ emotion, level = 1 }: { emotion: MascotEmotion; level?: number }) {
  const gltf = useGLTF(MODEL);
  const scene = (Array.isArray(gltf) ? gltf[0] : gltf).scene as THREE.Group;
  const group = useRef<THREE.Group>(null);
  const emo = useRef<MascotEmotion>(emotion);
  emo.current = emotion;
  const lvl = useRef(level);
  lvl.current = level;

  const t0 = useRef(0);
  // the single blended pose the animator eases toward the active pose
  const ps = useRef<KoaPose>({ ...POSES.relax });
  // idle state machine — Relax / Curious / Waiting / Stretch / Nothing, each
  // held for an irregular number of seconds, ~45% just standing (v1.2 P2/P3/P4)
  const idle = useRef({
    state: 'relax' as PoseKey,
    stateT: 2.5,
    lookDir: 1, // randomised gaze direction on entering curious/waiting
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
    const happy = e === 'happy';
    const restless = clamp(1 - (lvl.current - 1) * 0.045, 0.35, 1);
    const id = idle.current;

    // ── 1. pick the active pose (+ dynamic overlays) ──
    let key: PoseKey = 'relax';
    let hop = 0;
    let spin = 0;
    let waveFore = 0;
    let pump = 0;
    if (e === 'celebrate') {
      key = 'celebrate';
      hop = Math.max(0, Math.sin(t * 6)) * 0.16;
      spin = Math.min(t * 2.5, Math.PI * 2);
    } else if (e === 'wave') {
      key = 'wave';
      waveFore = Math.sin(t * 9) * 0.45;
    } else if (e === 'curl') {
      key = 'workout';
      pump = Math.sin(t * 3) * 0.5 + 0.5;
    } else if (e === 'sleep') {
      key = 'sleep';
    } else if (e === 'sad' || e === 'tired') {
      key = 'tired';
    } else {
      // idle STATE MACHINE (P2/P3/P4): hold a state for an irregular time,
      // ~45% of the time it just stands. Restless (low level) = shorter holds.
      id.stateT -= delta;
      if (id.stateT <= 0) {
        const r = Math.random();
        id.state = r < 0.45 ? 'nothing' : r < 0.64 ? 'relax' : r < 0.8 ? 'curious' : r < 0.92 ? 'waiting' : 'stretch';
        id.lookDir = Math.random() < 0.5 ? -1 : 1;
        const span = id.state === 'stretch' ? 1.6 : id.state === 'nothing' ? 3.2 + Math.random() * 3.8 : 2.4 + Math.random() * 3.6;
        id.stateT = span * (1.35 - restless * 0.45);
      }
      key = id.state;
    }

    // ── 2. target pose (randomise the gaze direction for idle glances) ──
    const basePose = POSES[key];
    const tgt: KoaPose = { ...basePose };
    if (key === 'curious' || key === 'waiting') {
      tgt.hy = basePose.hy * id.lookDir;
      tgt.hz = basePose.hz * (id.lookDir > 0 ? 1 : 0.6);
    }

    // ── 3. ease the blended pose toward the target (P7/P8: soft in & settle) ──
    blendPose(ps.current, tgt, 0.1, key === 'curious' || key === 'waiting' ? 0.05 : 0.09);
    const p = ps.current;

    // ── 4. weight shift — ease onto one foot, hold, transfer (P5) ──
    id.weightTimer -= delta;
    if (id.weightTimer <= 0) {
      id.weightTgt = (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.4);
      id.weightTimer = 2.6 + Math.random() * 3.4;
    }
    id.weightCur = lerp(id.weightCur, id.weightTgt, 0.018 + restless * 0.02);
    const weight = id.weightCur;

    // ── 5. phase-offset breathing — body / head / shoulders out of sync (P9) ──
    const bRate = happy ? 2.4 : 1.6;
    const bodyB = Math.sin(t * bRate);
    const headB = Math.sin(t * bRate + 0.5);
    const shB = Math.sin(t * bRate + 0.25);
    const shBL = Math.sin(t * bRate + 0.9); // different phase for the left arm

    // ── 6. compose final bone angles: pose + overlays ──
    let headX = p.hx + headB * 0.02 * restless;
    let headY = p.hy;
    let headZ = p.hz + weight * 0.03 + shB * 0.008;
    let rArmZ = p.armR + shB * 0.026 * restless + weight * 0.05;
    let lArmZ = -p.armL + shBL * 0.022 * restless - weight * 0.05;
    let rArmX = p.armFwd;
    let lArmX = p.armFwd * 0.92;
    let rFore = p.foreR - headB * 0.03 + waveFore - pump * 0.5;
    let lFore = p.foreL - shB * 0.025 - pump * 0.5;

    // ── 7. anatomical clamps (P2) ──
    headX = clamp(headX, -0.35, 0.6);
    headY = clamp(headY, -0.5, 0.5);
    headZ = clamp(headZ, -0.32, 0.32);
    rArmZ = clamp(rArmZ, -0.25, 1.8);
    lArmZ = clamp(lArmZ, -1.8, 0.25);
    rArmX = clamp(rArmX, -0.9, 0.4);
    lArmX = clamp(lArmX, -0.9, 0.4);
    rFore = clamp(rFore, -1.7, 0.3);
    lFore = clamp(lFore, -1.7, 0.3);

    // ── 8. apply. Motion chain (P6): the body carries ~20% of the head yaw so a
    //    turn originates from the torso, not the neck alone (whole-body yaw is
    //    safe vs. the uncertain chest-bone role). ──
    poseBone(RIG.head, headX, headY * 0.8, headZ);
    poseBone(RIG.posArm, rArmX, 0, rArmZ);
    poseBone(RIG.posFore, rFore, 0, 0);
    poseBone(RIG.negArm, lArmX, 0, lArmZ);
    poseBone(RIG.negFore, lFore, 0, 0);

    // ── 9. whole-object: bob, spin, lean, weight roll, body-follow yaw, posture
    const tall = 1 + Math.min((lvl.current - 1) * 0.004, 0.05);
    g.position.y = lerp(g.position.y, bodyB * (0.01 + restless * 0.005) + hop, 0.15);
    g.rotation.y = lerp(g.rotation.y, spin + headY * 0.2 + weight * 0.03, 0.18);
    g.rotation.x = lerp(g.rotation.x, p.lean, 0.15);
    g.rotation.z = lerp(g.rotation.z, weight * 0.05, 0.1);
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
  // NB: no 2D eyelid overlay — the model has no facial rig and floating fake
  // lids broke the quality. Blink/expression will come from a proper method
  // (eye texture-swap or a rig) later, not detached rectangles.
  return (
    <Canvas
      style={{ width: size, height: size * 1.25 }}
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
  );
}

useGLTF.preload?.(MODEL);

export default Mascot3D;
