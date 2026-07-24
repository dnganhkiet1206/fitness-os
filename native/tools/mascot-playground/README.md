# Mascot Facial Playground

Standalone Three.js tool to preview the mascot GLB and tune its facial /
expression animation **in a browser** — the piece Claude can't see on-device.
Use it to verify the rig, calibrate the 2D eye overlay, and read out values to
paste back into the app.

## Run

The model is loaded by a relative path, so serve from the **`native/` folder**
(one level above `tools/`):

```bash
cd native
npx serve .        # or: python3 -m http.server 8000
```

Then open: `http://localhost:3000/tools/mascot-playground/` (serve) or
`http://localhost:8000/tools/mascot-playground/` (http.server).

Requires internet (Three.js loads from a CDN via import map).

## What it shows

- **Viewport** — the model at the app's exact camera (fov 32, pos [0, 0.8, 3.5],
  lookAt [0, 0.8, 0]). Toggle **Free orbit** to inspect from any angle.
- **Validation** — checks the required bones exist (head, shoulders, forearms).
- **Hierarchy** — bones + meshes (tri counts). Click a bone → inspector
  (parent, children, world position, quaternion).
- **Controls** — Head X/Y/Z, arm out/forward, blink & breathing speed.
- **Expression** — Neutral / Happy / Excited / Determined / Sad / Sleep /
  Tired / Surprised / Wink / Wave / Curl (procedural: head + arms + eyelids +
  breathing, no facial rig needed).
- **Eye overlay (FACE)** — drag the yellow lid boxes over the model's real eyes
  with the lx / rx / y / w / h sliders. The box at the bottom prints the
  `FACE = { … }` values — **paste those into `FACE` in
  `src/components/ascnd/mascot-3d.tsx`** so the in-app eyelids line up.

## Notes

- Bone map mirrors `src/config/mascot-bones.ts`. Keep them in sync.
- Arm posing uses the same world-space math as the app, so the abduction
  direction you see here matches the device.
- This tool is dev-only; it is not bundled into the app.
