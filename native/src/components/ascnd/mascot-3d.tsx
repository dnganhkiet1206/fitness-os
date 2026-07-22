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

import type { MascotEmotion } from '@/lib/mascot-emotion';

const MODEL = require('../../../assets/mascots/koa.glb');

// ── Bone map (from koa.glb rest-pose analysis, UniRig auto-rig) ──
const BONES = {
  head: 'Bone_034', // neck base — rigid head rotation (no face warp)
  chest: 'Bone_002',
  rUpperArm: 'Bone_030',
  rForearm: 'Bone_029',
  lUpperArm: 'Bone_022',
  lForearm: 'Bone_021',
} as const;

// reusable temporaries (single koala on screen, so module-shared is fine)
const _qx = new THREE.Quaternion();
const _qz = new THREE.Quaternion();
const _AX = new THREE.Vector3(1, 0, 0);
const _AZ = new THREE.Vector3(0, 0, 1);

interface Pose {
  head: number; // X nod (+ = look down)
  tilt: number; // Z head tilt
  rArm: number; // R upper-arm Z (− = raise out to the side)
  rFore: number; // R forearm X (+ = curl up)
  lArm: number; // L upper-arm Z (+ = raise out to the side, mirrored)
  lFore: number; // L forearm X
}
const lerp = THREE.MathUtils.lerp;

function Koala({ emotion }: { emotion: MascotEmotion }) {
  const gltf = useGLTF(MODEL);
  const scene = (Array.isArray(gltf) ? gltf[0] : gltf).scene as THREE.Group;
  const group = useRef<THREE.Group>(null);
  const emo = useRef<MascotEmotion>(emotion);
  emo.current = emotion;

  const t0 = useRef(0);
  const cur = useRef<Pose>({ head: 0, tilt: 0, rArm: 0, rFore: 0, lArm: 0, lFore: 0 });

  // Fit the model to ~1.55 units tall with feet at y=0 — applied to a wrapper
  // group (NOT by cloning the scene: cloning a rigged SkinnedMesh detaches the
  // skeleton and breaks/throws). We render the shared scene directly, then find
  // the bones once and cache each one's rest quaternion.
  const { fit, bones, baseQ } = useMemo(() => {
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
    return {
      fit: {
        scale,
        pos: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
      },
      bones: b,
      baseQ: q,
    };
  }, [scene]);

  useEffect(() => {
    t0.current = 0;
  }, [emotion]);

  // rotate a bone off its rest pose: base * Rx(ax) * Rz(az)
  const poseBone = (name: string, ax: number, az: number) => {
    const bone = bones[name];
    const base = baseQ[name];
    if (!bone || !base) return;
    bone.quaternion.copy(base);
    if (ax) {
      _qx.setFromAxisAngle(_AX, ax);
      bone.quaternion.multiply(_qx);
    }
    if (az) {
      _qz.setFromAxisAngle(_AZ, az);
      bone.quaternion.multiply(_qz);
    }
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
    // bone pose target
    const tp: Pose = { head: 0, tilt: 0, rArm: 0, rFore: 0, lArm: 0, lFore: 0 };

    if (e === 'celebrate') {
      const hop = Math.max(0, Math.sin(t * 6)) * 0.16;
      py = hop;
      spin = Math.min(t * 2.5, Math.PI * 2);
      // both arms thrown up
      tp.rArm = -2.0;
      tp.lArm = 2.0;
      tp.head = -0.12;
    } else if (e === 'wave') {
      // right arm up, forearm waving side to side
      tp.rArm = -1.9;
      tp.rFore = Math.sin(t * 9) * 0.5 + 0.1;
      tp.tilt = 0.12;
      tp.head = -0.05;
    } else if (e === 'curl') {
      // double-biceps flex — both forearms pump up
      const pump = Math.sin(t * 3) * 0.5 + 0.5;
      tp.rArm = -0.35;
      tp.lArm = 0.35;
      tp.rFore = 1.1 + pump * 0.5;
      tp.lFore = 1.1 + pump * 0.5;
    } else if (e === 'sleep') {
      lean = 0.16;
      tp.head = 0.5 + breathe * 0.03; // head droops forward, gentle breathe
      tp.tilt = 0.14;
    } else if (e === 'sad' || e === 'tired') {
      lean = 0.06;
      tp.head = 0.3;
      tp.tilt = Math.sin(t * 1.1) * 0.04;
    } else {
      // idle / happy — breathe + subtle head bob + tiny arm sway
      py = Math.sin(t * (e === 'happy' ? 2.4 : 1.6)) * 0.015;
      const s = Math.sin(t * 1.1) * 0.05;
      tp.head = Math.sin(t * 1.6) * 0.05 + 0.02;
      tp.tilt = Math.sin(t * 0.8) * 0.04;
      tp.rArm = s * 0.6;
      tp.lArm = -s * 0.6;
      tp.rFore = (e === 'happy' ? 0.1 : 0) + breathe * 0.04;
    }

    // smooth the pose toward the target
    const k = 0.12;
    const c = cur.current;
    c.head = lerp(c.head, tp.head, k);
    c.tilt = lerp(c.tilt, tp.tilt, k);
    c.rArm = lerp(c.rArm, tp.rArm, k);
    c.rFore = lerp(c.rFore, tp.rFore, k);
    c.lArm = lerp(c.lArm, tp.lArm, k);
    c.lFore = lerp(c.lFore, tp.lFore, k);

    // apply to bones
    poseBone(BONES.head, c.head, c.tilt);
    poseBone(BONES.rUpperArm, 0, c.rArm);
    poseBone(BONES.rForearm, c.rFore, 0);
    poseBone(BONES.lUpperArm, 0, c.lArm);
    poseBone(BONES.lForearm, c.lFore, 0);

    // whole-object
    g.position.y = lerp(g.position.y, py, 0.15);
    g.rotation.y = lerp(g.rotation.y, spin, 0.2);
    g.rotation.x = lerp(g.rotation.x, lean, 0.15);
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
}: {
  emotion?: MascotEmotion;
  size?: number;
  accent?: string;
}) {
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
      <Koala emotion={emotion} />
    </Canvas>
  );
}

useGLTF.preload?.(MODEL);

export default Mascot3D;
