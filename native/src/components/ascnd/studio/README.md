# Koa Studio — the mascot screen's background

Built to the "Koa Studio (Background Only)" brief. The character is **not**
part of this scene; `STAGE_MARK` in `palette.ts` is where its feet go, and
both the scene and the figure are placed from that one number.

```bash
node tools/koa-studio/preview.mjs <dir>/studio.png   # renders the real components
node tools/koa-studio/compare.mjs  <dir> --shot      # holds it to the design
```

`compare.mjs` wants the design screenshot as `<dir>/ref.png`. It finds each
landmark by what its colour *is* — gold, purple, green, lit sky — rather
than by an exact hex, because the reference is a painted render whose values
do not match the palette, and reports the gap in points.

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

Current cost: **143 shapes, ~14KB of SVG**, all static — it draws once and
then costs nothing per frame, which is what lets it sit under a character
that does animate.

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

## Not wired in yet

`StageRenderer` still draws the old podium scene, and it has three
purchasable stage skins (`stage_night`, `stage_sunset`, `stage_champion`).
Swapping the studio in without a decision on those would quietly devalue
things people bought, so that is an open question, not an oversight.
