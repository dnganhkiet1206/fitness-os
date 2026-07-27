# Companion mascot art

Koa is **drawn in code, from a design export** — there is no image, Lottie
or Rive asset behind it. This folder holds only what the code needs to be
checked against:

- `koa-svg-spec-sheet.png` — the design sheet the character is built to.
  Panels §3 (expressions) and §5 (poses) are live on device at
  `/koa-sheet`, so the drawing can be compared to the sheet on hardware.
- `KOA_OUTFIT_CATALOGUE.md` — the wardrobe: 7 slots × 10 items.

The source of truth is the design tool's `Koa.dc.html` export. It is turned
into `src/components/ascnd/koa/koa-scene.ts` by `tools/koa-import/` — read
that README before touching anything Koa-shaped.

## What used to be here, and why it is gone

Four ways of rendering a companion were tried and dropped: a rigged 3D GLB,
a rigged Rive character, pre-rendered AI art with the background matted
out, and Lottie. Only the last three left registries in the code, all of
them empty or unreachable, plus two native dependencies and ~4MB of art the
app could no longer reach. They were removed.

The one that survived is code-drawn vector, because it is the only one an
AI-only workflow can author, diff and verify end to end.

## Adding a second character

The roster (`src/lib/mascots.ts`) has five more ids — `blaze`, `swift`,
`titan`, `drago`, `nova` — and they all fall back to the generic vector
figure in `components/ascnd/vector-mascot.tsx`. To give one real art, take
Koa's path: a design export, the importer, the flags module, and
`verify.mjs` at zero. Do not reintroduce an asset pipeline for it.
