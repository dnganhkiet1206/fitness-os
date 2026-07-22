# Mascot 3D (path B) — status & how to run

The real-time 3D buddy is **wired in and build-verified** on the branch:

- Asset: `assets/mascots/koa.glb` (1.2 MB — rigged, textured, 8,980 tris).
- Component: `src/components/ascnd/mascot-3d.tsx` — `Mascot3D` (react-three-fiber
  over expo-gl) + `MascotBuddy` (error-boundary that falls back to the 2D
  `MascotFigure` if GL/model fails, so the Stage never goes blank).
- Wired into `src/components/ascnd/stage-renderer.tsx` (the buddy slot),
  driven by the Emotion Engine.
- Deps added to package.json: `expo-gl` 57.0.2, `three` 0.185.1,
  `@react-three/fiber` 9.6.1, `@react-three/drei` 10.7.7 (+ `@types/three`).
- `metro.config.js` bundles `.glb`/`.gltf`.
- Verified: `tsc --noEmit` clean, `expo export` bundles the model + all 3D deps.

## To see it on a device

expo-gl is native, so a JS reload isn't enough — rebuild the dev client once:

```bash
cd native
npm install          # pull the newly-added 3D deps
npx expo run:ios     # or: eas build --profile development
```

Then open the Mascot tab. If anything GL-related fails on the device, the
boundary shows the 2D figure instead (no crash) — tell me and send the log.

## Animation

v1 is **whole-object** procedural motion (bob / breathe / hop / spin / slump)
driven by the emotion, so the head never warps and no bone mapping is needed.
Next: limb-level poses (arm wave, bicep curl) by rotating named bones
(Bone_000…Bone_034) once we identify head/arms from the live skeleton.

## Tuning (send a device screenshot)

Only a device shows the real GL result. With a screenshot I tune, in
`mascot-3d.tsx`: camera (`position`/`fov`), the two lights, model fit
(`1.6 / size.y`), and the per-emotion motion curves.
