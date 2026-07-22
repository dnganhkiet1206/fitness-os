/**
 * Mascot3D — real-time 3D buddy (path B). Renders the rigged/textured koala
 * GLB with react-three-fiber over expo-gl, driven by the Emotion Engine.
 *
 * NOT wired in yet: it needs native 3D deps + a dev-build rebuild. Enable it
 * once installed (see native/docs/MASCOT_3D_SETUP.md), then swap it in for
 * MascotFigure inside StageRenderer.
 *
 * v1 uses WHOLE-OBJECT procedural motion (bob / breathe / hop / spin / slump)
 * — no per-bone posing, so the face never warps and no bone mapping is needed.
 * Limb-level poses (arm wave, bicep curl) come later via named-bone rotation.
 */
import { Canvas, useFrame } from '@react-three/fiber/native';
import { useGLTF } from '@react-three/drei/native';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

import type { MascotEmotion } from '@/lib/mascot-emotion';

const MODEL = require('../../../assets/mascots/koa.glb');

function Koala({ emotion }: { emotion: MascotEmotion }) {
  const gltf = useGLTF(MODEL);
  const scene = (Array.isArray(gltf) ? gltf[0] : gltf).scene as THREE.Group;
  const group = useRef<THREE.Group>(null);
  const emo = useRef<MascotEmotion>(emotion);
  emo.current = emotion;

  // one-shot timers for celebrate/wave so they play then settle
  const t0 = useRef(0);

  // Fit the model to ~1.6 units tall with feet at y=0 — applied to a wrapper
  // group (NOT by cloning the scene: cloning a rigged SkinnedMesh detaches the
  // skeleton and breaks/throws). We render the shared scene directly.
  const fit = useMemo(() => {
    const box = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = 1.72 / (size.y || 1);
    scene.traverse((o: any) => {
      if (o.isMesh) o.frustumCulled = false;
    });
    return {
      scale,
      pos: [-center.x * scale, -box.min.y * scale, -center.z * scale] as [number, number, number],
    };
  }, [scene]);

  useEffect(() => {
    t0.current = 0;
  }, [emotion]);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    t0.current += delta;
    const t = t0.current;
    const e = emo.current;
    // defaults
    let py = 0;
    let sway = 0;
    let lean = 0;
    let spin = 0;
    let sy = 1;
    const slow = e === 'sleep' || e === 'sad' || e === 'tired';
    const breathe = Math.sin(t * (slow ? 1.4 : 2.0)) * 0.5 + 0.5;

    if (e === 'celebrate') {
      const hop = Math.max(0, Math.sin(t * 6)) * 0.18;
      py = hop;
      spin = Math.min(t * 3, Math.PI * 2); // one spin then hold
      sy = 1 + hop * 0.5;
    } else if (e === 'wave') {
      sway = Math.sin(t * 5) * 0.12;
      lean = 0.05;
    } else if (e === 'curl') {
      const pump = Math.sin(t * 3) * 0.5 + 0.5;
      sy = 1 - pump * 0.06;
      py = -pump * 0.04;
    } else if (e === 'sleep') {
      lean = 0.25;
      py = -0.04 + breathe * 0.01;
    } else if (e === 'sad' || e === 'tired') {
      lean = 0.14;
      py = -0.02;
      sway = Math.sin(t * 1.2) * 0.02;
    } else {
      // idle / happy — gentle bob + breathe + micro sway
      py = Math.sin(t * (e === 'happy' ? 2.4 : 1.6)) * 0.02;
      sway = Math.sin(t * 0.8) * 0.03;
      sy = 1 + breathe * 0.012;
    }

    g.position.y = THREE.MathUtils.lerp(g.position.y, py, 0.15);
    g.rotation.y = THREE.MathUtils.lerp(g.rotation.y, sway + spin, 0.2);
    g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, lean, 0.15);
    g.scale.y = THREE.MathUtils.lerp(g.scale.y, sy, 0.2);
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
      camera={{ position: [0, 1.0, 3.5], fov: 32 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl, camera }) => {
        gl.setClearColor(0x000000, 0);
        // Look horizontally at the buddy's chest so the feet land at the very
        // bottom edge of the canvas (no float) with a flattering near-eye-level
        // hero angle.
        camera.lookAt(0, 1.0, 0);
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
