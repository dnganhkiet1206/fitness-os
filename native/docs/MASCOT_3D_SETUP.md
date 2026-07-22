# Mascot 3D (path B) — setup

The rigged/textured koala renders in real time via react-three-fiber over
expo-gl. The asset (`assets/mascots/koa.glb`, 1.2 MB) and the component
(`src/components/ascnd/mascot-3d.tsx`) are already in the repo. The steps below
must run on a machine with npm access (the CI sandbox blocks installs), and 3D
needs a **dev-build rebuild** (expo-gl is native).

## 1. Install deps (compatible with Expo SDK 57 / React 19)

```bash
cd native
npx expo install expo-gl
npm install three @react-three/fiber @react-three/drei
npm install -D @types/three
```

If `@react-three/fiber` warns about React 19, use the v9 line
(`@react-three/fiber@^9`), which supports React 19.

## 2. Let Metro bundle .glb

Add `glb` to `assetExts` in `metro.config.js` (create it if missing):

```js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb');
module.exports = config;
```

## 3. Rebuild the dev client

expo-gl is native, so a JS reload isn't enough:

```bash
npx expo run:ios   # or: eas build --profile development
```

## 4. Wire it into the Stage

In `src/components/ascnd/stage-renderer.tsx`, swap the `MascotFigure` in the
buddy slot for `Mascot3D` (pass the engine `emotion` instead of `mood`). Keep
`MascotFigure` as the fallback when the 3D asset/deps aren't present so the app
still runs everywhere. Remove the `// @ts-nocheck` at the top of
`mascot-3d.tsx` once deps are installed to get real type-checking.

## 5. Tune on device → iterate

Only a device shows the real 3D result. Send a screenshot and we tune camera
(`position`/`fov`), lights, model scale (`1.6 / size.y`), and the per-emotion
motion. Limb-level poses (arm wave, bicep curl) come next by rotating named
bones (Bone_000…Bone_034) once we identify head/arms from the live skeleton.

## Notes

- v1 animation is **whole-object** (bob / breathe / hop / spin / slump) — the
  head never warps and no bone mapping is needed.
- Keep the 2D image Stage as the default until the 3D path is verified on
  device; gate the swap behind a flag if you want to A/B them.
