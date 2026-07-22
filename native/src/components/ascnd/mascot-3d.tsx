// @ts-nocheck
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

const MODEL = require('../../assets/mascots/koa.glb');

function Koala({ emotion }: { emotion: MascotEmotion }) {
  const { scene } = useGLTF(MODEL);
  const group = useRef<THREE.Group>(null);
  const emo = useRef<MascotEmotion>(emotion);
  emo.current = emotion;

  // one-shot timers for celebrate/wave so they play then settle
  const t0 = useRef(0);

  // center + normalize the model to a unit height, feet at y=0
  const fitted = useMemo(() => {
    const s = scene.clone(true);
    const box = new THREE.Box3().setFromObject(s);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    box.getSize(size);
    box.getCenter(center);
    const scale = 1.6 / (size.y || 1);
    s.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);
    s.scale.setScalar(scale);
    s.traverse((o: any) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.frustumCulled = false;
        if (o.material) o.material.envMapIntensity = 0.6;
      }
    });
    return s;
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
      <primitive object={fitted} />
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
      style={{ width: size, height: size * 1.15 }}
      camera={{ position: [0, 0.85, 3.2], fov: 38 }}
      gl={{ alpha: true, antialias: true }}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
      <ambientLight intensity={0.85} />
      <directionalLight position={[3, 5, 4]} intensity={1.3} castShadow />
      <directionalLight position={[-4, 2, -2]} intensity={0.5} color={accent} />
      <Koala emotion={emotion} />
    </Canvas>
  );
}

useGLTF.preload?.(MODEL);
