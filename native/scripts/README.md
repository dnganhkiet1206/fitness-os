# native/scripts

- `reset-project.js` — the Expo template's fresh-start helper.

Mascot tooling lives in `tools/koa-import/` now: `import-koa.py` turns a
design export into the scene data, and `verify.mjs` proves the render
matches the export.

`remove-bg.py` (matting for pre-rendered character art) and
`optimize-glb.py` (3D mesh/texture reduction) were removed along with the
image and 3D companion paths they fed. Koa is drawn in code; nothing in the
app reads a character asset any more.
