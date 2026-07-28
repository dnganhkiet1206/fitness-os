# Koa Studio — the mascot screen's background

Built to the "Koa Studio (Background Only)" brief. The character is **not**
part of this scene; `STAGE_MARK` in `palette.ts` is where its feet go, and
both the scene and the figure are placed from that one number.

```bash
node tools/koa-studio/preview.mjs <dir>/studio.png   # renders the real components
node tools/koa-studio/compare.mjs  <dir> --shot      # holds it to the design
```

```bash
node tools/koa-studio/light.mjs <dir>                 # holds it to the lighting
node tools/koa-studio/stage.mjs  <out.png>            # the stage as the app builds it
```

`stage.mjs` imports `STAGE_MARK` and `SCENE_BOTTOM` rather than copying them.
A throwaway version of it hard-coded the mark, kept the old value when the
podium moved, and drew the character standing in front of the podium instead
of on it — the app was right and the preview was lying. Any preview that
restates a layout constant will eventually do that.

`compare.mjs` wants the design screenshot as `<dir>/ref.png`. It finds each
landmark by what its colour *is* — gold, purple, green, lit sky — rather
than by an exact hex, because the reference is a painted render whose values
do not match the palette, and reports the gap in points.

**`light.mjs` matters more than `compare.mjs`.** The screenshot is not an
iPhone aspect, so its coordinates are a guide and not a target: the landmark
table once read 4pt everywhere while the room still looked wrong, because
the light was wrong. `light.mjs` samples by fraction of the stage box, so it
does not care about either image's aspect, and it measures the things that
actually carry: falloff down the beam, warmth at the lamp, how far the props
sit above the wall, and the vignette.

The preview bundles the actual `.tsx` with `react-native-svg` swapped for a
stub of tag names and walks the element tree the components return, so it is
the components and not a copy of them that can drift.

## The rules this scene is held to

| Rule | Where it is checked |
|---|---|
| No bitmap, texture, noise, glassmorphism or blur | no `<filter>`, `<image>`, `<pattern>` in the output |
| Only Path / Rect / Circle / Ellipse / Text + the two gradients | the tag list in the rendered SVG |
| At most 12 colours | `palette.ts` is the only source; 10 in use |
| Centre stays empty | nothing is drawn between x 120–270 above the podium |
| Depth from scale, overlap and brightness only | no perspective transform anywhere |
| Every object is its own component | one file each, placed by `(x, y)` |

Current cost: **153 shapes, ~16KB of SVG**, all static — it draws once and
then costs nothing per frame, which is what lets it sit under a character
that does animate. `preview.mjs` prints both numbers on every run; if they
have moved, this line is what is stale.

## Held to the design, measured

Every landmark now lands within **4pt** of the design screenshot, and the
wall/floor line within 12pt. Worth keeping in mind when changing anything:

| landmark | design | studio |
|---|---|---|
| podium ring (column scan) | ry 31.0 | ry 33.0 |
| lamp mouth | x168 y61 55×5 | x167 y62 56×8 |
| neon sign | x24 y129 84×80 | x23 y129 86×84 |
| streak card | x270 y245 102×62 | x269 y245 103×63 |
| shelf plant | x26 y220 29×24 | x27 y219 29×21 |
| floor plant | x263 y310 107×38 | x262 y310 107×37 |
| window sky | x272 y95 95×117 | x271 y94 97×119 |

Real errors the eye had passed over: the room had no wall/floor line at
all, and the two plants are not one plant at two scales — the shelf carries
a compact bush at 1.2 wide for its height, the floor a broad spray on stems
at 2.8.

**A bounding box takes the glow in with the object.** The podium's gold box
measures 275 × 141 in the design and led to an ellipse built more than twice
as deep as the real one; scanning down the podium's centre line finds the
ring itself at 382 and 444, so `ry` is 31, not 68. Anything that glows gets
measured down a line — `compare.mjs` prints that separately, below the
table, and that is the number to read.

## The beam's edges

A gradient runs one way, so a single trapezoid keeps the geometry of its
sides however the light fades down it. Painting the wall colour across the
shape softens the foot, but that fade is a fixed width and the beam is 50pt
across at the lamp and 316 at the floor — up by the shade the whole cone sat
inside the gradient's clear middle and kept two sharp diagonals exactly
where the light is brightest.

`Spotlight` stacks nine trapezoids sharing an apex instead, each a little
wider, each carrying the same light at a ninth of the strength. The fade is
then a proportion of the beam's own width at every height. Widths are packed
toward the outside (`^0.4`) so the core stays flat and only the outer third
ramps, which is the profile the design has.

Largest step in luminance between neighbouring samples across the beam:

| y | design | one gradient | nine layers |
|---|---|---|---|
| 110 (near the lamp) | 18 | 18 | **2.7** |
| 170 | 7.7 | 8.3 | **1.3** |
| 250 | 0.7 | 0.7 | 0.7 |
| 320 | 1 | 1 | 0.7 |

Measure this with a 3-sample median or the dust reads as an edge: there is a
speck at exactly (150, 250) and it shows up as a step of 10.

## The lighting, measured

This is what the room is, more than its coordinates are:

| | design | studio |
|---|---|---|
| beam down the middle | 61 · 49 · 36 · 31 | 54 · 45 · 41 · 41 |
| warmth at the lamp (R−B) | +8.1 | +10.9 |
| … halfway down | −14.9 | −3.8 |
| props against the wall | 47 · 56 · 52 | 59 · 70 · 54 |
| stage centre | 39.3 | 40.3 |
| vignette (corners ÷ centre) | 0.61 | 0.71 |

Three of those were the whole problem. The beam **did not fall off at all**
(61 · 58 · 55) and was **cold** (−22 at the lamp, where the design is +8),
so it read as a grey wedge rather than a lamp. And the props stood at
**95–106 against a wall of 29–58** — twice the design's — so the room was
flat and the character was no longer the brightest thing in it. `Vignette`
in `floor.tsx` is what fixes the last one: it goes over the wall and
everything standing against it, and under the lamp and the podium.

Still open: the props sit about 1.2× brighter than the design and the
corners about four luminance units lighter. Pushing further flattens the
room, so it stopped there.

## Where the design and the brief disagree

Two places, both left on the brief's side on purpose:

- **The podium's glow.** The design's warm pool is bright enough to span
  141pt of gold on the floor. The brief says *"phát sáng nhẹ … không glow
  quá mạnh, không quá dày"*. The studio glows about half as far.
- **Brush work.** The screenshot is a painted render: soft shadows, gradient
  foliage, leaf midribs picked out in a lighter green. The brief rules out
  blur, texture and detail and asks for few anchor points. The studio
  matches silhouette, proportion, position and tonal weight instead.

Where a value looks flat next to the reference, that is the brief winning on
purpose.

## Layout

The artboard is 390 × 844. The room occupies the top ~470; below that is
app content. Left column is the neon sign over the shelf, right column is
the window over the streak card, and the podium is centred at (195, 414).

`Plant` is used twice — small on the shelf, large on the floor — because the
brief asks for depth from scale rather than from more artwork. Adding a prop
to an existing object is preferred over adding another file.

## Wired in, and what happened to the skins

`StageRenderer` draws this scene — `<KoaStudio width height skin energy
streak />` is the whole backdrop, and the old podium scene is gone. What is
left of `stage-renderer.tsx` is only what the scene is not: where the
character stands, the poke, the fade into the page.

The three purchasable skins survived rather than being devalued.
`STUDIO_SKINS` in `palette.ts` maps `stage_night` / `stage_sunset` /
`stage_champion` to a wall gradient and a glow colour, so what people
bought still changes the room. A new skin is an entry in that table, not a
new scene.
