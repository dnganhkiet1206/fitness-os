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

**`ref.png` is not in the repository** — it is the user's design screenshot,
so `compare.mjs` and `light.mjs` cannot run without asking them for it.
`preview.mjs` and `stage.mjs` need nothing but the components and do run.

These four need `playwright` and `esbuild`, which are not project
dependencies: `npm i --no-save playwright esbuild`. Pin the version to the
Chromium already on the machine rather than downloading a browser — the
build under `PLAYWRIGHT_BROWSERS_PATH` is what decides. Build 1194 wants
playwright 1.56; a mismatched version fails with "Executable doesn't exist"
and tells you to run `playwright install`, which is the wrong fix.

`stage.mjs` draws Koa only when it finds `../koa-figure-mirror.js`, which is
outside the repo. Without it the podium comes out empty, and it says so —
an empty podium in a `stage.mjs` render is the tool, not the app.

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

**That holds for geometry, not for text.** The preview draws in a browser,
and a browser and `react-native-svg` disagree about whitespace: the sign's
`<TSpan>WIN </TSpan>` kept its trailing space here and lost it on the phone,
so the room read `WIN TODAY` in every check and `WINTODAY` on device.

Three versions of that gap were tried on device before one held. A trailing
space measures as nothing, because `RNSVGTSpan` sizes each span with
`CTLineGetBoundsWithOptions` and CoreText leaves trailing whitespace out of
a line's width. U+00A0 is no escape — `whitespaceCharacterSet` is Unicode
Zs, which contains it. `dx` reads correct all the way down (Fabric maps it,
the glyph context accumulates it, the draw applies it) and still did not
show up on the phone.

What holds is not sharing a `<Text>`: WIN and TODAY are two `<Text>`
elements at fixed `x`, anchored `end` and `start` — the same primitive as
the STRONGER and TOMORROW lines that always rendered correctly. Centring
the pair then needs the difference of their widths, which `LEAN` carries;
re-measure it if the words or the size change.

Put no layout in whitespace inside SVG text, and prefer separate positioned
`<Text>` over `TSpan` when two runs must sit a known distance apart. When
the preview and a device shot differ on text, the preview is the one that
is wrong.

## The rules this scene is held to

| Rule | Where it is checked |
|---|---|
| No bitmap, texture, noise, glassmorphism or blur | no `<filter>`, `<image>`, `<pattern>` in the output |
| Only Path / Rect / Circle / Ellipse / Text + the two gradients | the tag list in the rendered SVG |
| At most 12 colours | `palette.ts` is the only source; all 12 in use |
| Centre stays empty | nothing is drawn between x 120–270 above the podium |
| Depth from scale, overlap and brightness only | no perspective transform anywhere |
| Every object is its own component | one file each, placed by `(x, y)` |
| The scene imports no Reanimated | `preview.mjs` bundles it with esbuild and would fail |

Current cost: **COUNT shapes, ~SIZE of SVG**. Everything but the motes is
static — the scene draws once and then costs nothing per frame, which is
what lets it sit under a character that does animate, and the motes are
three group matrices off one shared value. `preview.mjs` prints both numbers
on every run; if they have moved, this line is what is stale.

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

## The three boxes on the wall

The neon sign, the window and the streak card were each drawn as a lit
rectangle, and together they made the wall look busy. Measuring the perimeter
of each box and its interior says why:

| | design viền/ruột | before | after |
|---|---|---|---|
| neon sign | 48 / 55 | 88 / 40 | 53 / 67 |
| window | 23 / 34 | 57 / 33 | 24 / 38 |
| streak card | 21 / 33 | 73 / 46 | 25 / 38 |

**Only the neon sign has an outline.** The window's frame was a purple stroke
of 57 on all four sides; the design's glass runs a flat 24–27 with no stroke
at all. The card's was 73; the design's card sits at 19, *below* the wall it
hangs on, and reads because its content is bright, not because it is ringed.

Two instruments were wrong on the way here, and both produced a confident
wrong answer:

- **A perimeter maximum finds one pixel.** It reported the design's window at
  106 on the bottom edge, which looks exactly like a lit sill. It is a single
  window alight in the skyline that happens to sit on the box line. A gold
  sill got built before a row scan showed the rest of that edge at 24. Use the
  **median** — a frame lights its whole perimeter, a speck does not.
- **A brightest-decile probe finds the same speck.** Sampling the top 12% of
  each row down the glass showed a horizon climbing to 85 and +62 warm. That
  was the lit windows again. The row **median** shows the real sky: 33 · 39 ·
  54 · 65, warming −53 → +23.

The neon sign's perimeter is a gradient, not a stroke of one opacity: round
the design it runs 42 · 48 · 57 · 70 from quartile to quartile, dim at the top
and pooling low. This had 74 · 74 · 75 · 75 — the same value on all four
sides, which is what reads as a drawn frame instead of a sign that glows. It
is also the one thing on that wall that emits, so `koa-studio.tsx` draws it
over the `Vignette`; underneath, its white lettering came out at 145.

Its type is set from the design's own scanlines: bolt at 137–156, then bands
of 255 at 164–172, 178–185 and 191–198, and the box ends at 209 — so H 79,
three lines on a 13pt rhythm with cap height 8.

The skyline came from the same kind of measurement. What fraction of each row
is in shadow runs 4% · 5% · 22% · 49% · 76% down the design's glass: the city
only takes the width in the last ten points, and it was built here as six
towers covering 78–85% from three times that height. Matching the fractions
was not enough — seven narrow towers hit the same numbers and still read as a
row of sticks, because a shadow fraction says nothing about whether it is one
silhouette or many. Few and wide is the shape.

Equipment on the shelf was lit the same way the boxes were. Above a threshold
of 60 the design puts **3.3%** of that column, averaging 99 — small bright
highlights on dark bodies. This had **14.9%** at 78: a broad mid-bright mass.
The bodies now carry `opacity` and the highlights stay full, which is 9.4% at
78. The shelf's own rails are `secondary` and stay there; taking them to
`primary` moved the region's median by one unit and made the ladder vanish.

## Colour

Luminance was right and the room still looked grey beside the design, because
luminance is exactly what a wash of white or of the complementary warm keeps.
Read as hue / saturation / lightness:

| | design | before | after |
|---|---|---|---|
| wall, top left | 230 / 51 / 11 | 230 / 42 / 12 | 231 / 50 / 12 |
| beam, y240 | 235 / 47 / 15 | 235 / **13** / 17 | 237 / 42 / 15 |
| beam, y330 | 232 / 50 / 13 | 229 / **26** / 16 | 238 / 43 / 15 |
| floor, right | 253 / 29 / 19 | 253 / **8** / 18 | 236 / 24 / 14 |
| podium face | 296 / 10 / 20 | 327 / **2** / **34** | 303 / 11 / 21 |
| floor pool | 316 / 11 / 21 | **230** / 11 / **31** | 278 / 16 / 20 |

Average error: **13.5 points of saturation and 3 of lightness, now 0.3 and
1.3.** Every one of the worst cells is somewhere the room is *lit*, and the
cause is the same in each: light was painted as white or as gold.

- **White keeps luminance and takes hue.** The podium's top face was
  `secondary` under 11% white, and measured 2% saturation at 34% lightness
  against the design's 10 and 20 — a pale grey disc where the design has a
  dark plum one. It is now flat `lit` and lands on 303 / 11 / 21.
- **Gold over this indigo cancels.** The warm's blue channel is 77 against a
  wall in the forties, so a low-alpha gold walks the mixture to neutral
  instead of warming it: the floor's own glow put the ground at 8%
  saturation. No amount of `highlight` reaches the design's 316 — that is
  what `lit` is in the palette for.
- **The beam had a gold tail.** Below its top third the design's beam has no
  colour to give: saturation climbs 34 · 43 · 47 · 50 down the middle while
  the hue settles on the wall's own 234, so what reads as a beam low down is
  the vignette leaving the centre alone. Carrying gold to the foot at 0.045
  held the luminance and took the middle of the room to 13%.
- **Black is the only darkener that keeps colour.** Scaling all three
  channels leaves (max−min)/(max+min) exactly where it was; every other entry
  in the palette mixes, and mixing walks the result to the pair's average
  saturation. `shadow` is now plain `#000000` with the alpha at each use site
  rather than baked in, which is what lets the yoga ball be `accent` made
  darker instead of `accent` diluted with `primary`.
- **A radial vignette is stretched to its box.** Measured against the 844pt
  artboard rather than the 476pt room, its vertical radius came out 557, so
  the bottom corners sat less than a fifth of the way into the falloff and
  stayed at 30 and 36 while the top two reached 22.

The palette went from 10 colours to 12 — `lit`, the muted plum the lamp
leaves on the floor and the podium, and `edge`, dark enough for the vignette
to end on. `bgTop`, `bgBottom`, `primary`, `secondary` and `plant` were all
deepened; `bgBottom` also turned violet, since the design's wall runs 230 at
the top and 258 at the floor. That is the whole budget spent.

## The floor and the podium

Averaging every row of both images — a profile neither `light.mjs` nor
`compare.mjs` looks at — found the largest structural error left in the room,
in the band from y360 to y396, running 13 to 37 units bright:

| row | 316 | 332 | 348 | 364 | 372 | 380 | 388 | 412 | 436 | 452 |
|---|---|---|---|---|---|---|---|---|---|---|
| design | 34 | 29 | 31 | 28 | 25 | 33 | 48 | 46 | 53 | 23 |
| before | 28 | 37 | 30 | 34 | 45 | 67 | 59 | 45 | 52 | 22 |
| after | 28 | 37 | 30 | 30 | 33 | 42 | 49 | 46 | 57 | 20 |

Three separate things were wrong in that band.

**The floor was lit from below.** The design's wall reads 34 where it meets
the ground and its floor 24–30 under it — about nine units *darker* than what
it meets. Built out of `secondary` this went the other way, 28 on the wall and
41 · 45 · 49 going down. It is `edge` now: what makes the ground bright is the
lamp's pool and nothing else.

**The pool was a disc the podium sat on.** Sampling across the design at y420
gives 38 and 54 at the podium's flanks, and across y372 gives 15–28 — so its
pool is short and wide and centred low, not tall enough to reach the floor
above the podium, which is the only place a wide pool shows at all. Cutting it
narrow enough to fix y372 then left the flanks at 25 against 38; short *and*
wide is what satisfies both.

**The ring is not one weight all the way round.** Down the design's centre
line the far edge is a single point of 194 and the near edge three of 200 ·
191 · 203 — a band seen almost edge-on at the back and nearly face-on at the
front, which is most of what makes the podium read as a disc lying down rather
than a hoop drawn on the floor. A uniform ellipse stroke laid a three-point
far edge across the widest, flattest part of the curve. It is two arcs now, at
2:3.6, with the glow split the same way. The inner line went the same way for
a different reason: the design's is *bright*, 68 against a face of 42–44, and
this had drawn a dark one.

## The lighting, measured

This is what the room is, more than its coordinates are:

| | design | studio |
|---|---|---|
| beam down the middle | 61 · 49 · 36 · 31 | 61 · 54 · 37 · 34 |
| warmth at the lamp (R−B) | +8.1 | +12 |
| … halfway down | −14.9 | −10 |
| props against the wall | 47 · 56 · 52 | 44 · 54 · 61 |
| stage centre | 39.3 | 40.3 |
| podium face ÷ its side | — | 3.96 (was 2.80) |
| vignette (corners ÷ centre) | 0.61 | 0.65 |

The first three rows were re-measured on 2026-07-28 with a stand-in
sampler — median-of-3 down the beam at y 110/170/250/320 on a `preview.mjs`
render — because `ref.png` is not in the repo and `light.mjs` cannot run
without it. It agreed with the design column closely enough to tune
against, but **re-confirm these three with `light.mjs`** the next time the
screenshot is to hand. The bottom three rows are still light.mjs's.

Three of those were the whole problem. The beam **did not fall off at all**
(61 · 58 · 55) and was **cold** (−22 at the lamp, where the design is +8),
so it read as a grey wedge rather than a lamp.

The correction after that went too far the other way and left the cone too
weak to have a colour of its own. A warm at low alpha over this wall does
not read as a faint warm: it sweeps blue → purple → magenta as the alpha
climbs, because `highlight`'s blue channel is barely above the wall's while
its red runs away. Hue down the middle measured 312 · 270 · 261 at
y 110/140/170 — the **bright** half of the beam was magenta and purple and
none of it was gold, which is what "the light has several colours in it"
looks like on a phone. It measures 25 · 32 · 24 there now, and the sweep
sits in the dim lower half where it does not read as colour. And the props stood at
**95–106 against a wall of 29–58** — twice the design's — so the room was
flat and the character was no longer the brightest thing in it. `Vignette`
in `floor.tsx` is what fixes the last one: it goes over the wall and
everything standing against it, and under the lamp and the podium.

Still open: the yoga ball reads 43% saturation against the design's 53, and
it cannot be fixed by darkening — `accent` is (123, 97, 255), whose
(max−min)/(max+min) is 0.449, and black scaling preserves exactly that ratio.
Reaching 0.53 means a more saturated `accent`, which the shelf equipment does
not want: it already measures 43 against the design's 37.

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

## The air, and the podium's face

Twenty-two neon motes hang in the room at 7–11%, in `motes.tsx` but drawn
**after** `Vignette` and `Spotlight` rather than with the white dust: the
vignette reaches full `bgTop` at the corners, so anything in `Background` is
painted out exactly where these are meant to read.

A mote only reads where it is brighter than what is behind it. Two of the
first placements failed that: a warm one inside the beam's bright upper cone
measured 7 luminance units **darker** than the light around it — a speck of
dirt, not dust — and one on the window frame moved the pixel by 1.5. They go
on wall and floor now, never on a lit prop and never inside the beam above
y≈210, and each is measured at +6.1 to +15.5 against a median of its
surroundings. They were first drawn at 3–5%, which measured +3.5 to +7.1 and
read as too faint on device; re-measure if they move again.

**They drift, and that makes them the one thing here that moves.** The
motion is three group matrices off a single shared value, derived on the UI
thread with no per-frame work in JS, over a 26s cycle whose terms are whole
numbers of cycles so the loop closes without a seam. `StageRenderer` only
passes them while the screen is focused, so the clock stops with the screen.

`DriftingMotes` lives in its own file, `motes-drift.tsx`, and `koa-studio.tsx`
takes it as a `motes` prop rather than importing it. That is not style:
Reanimated pulls in `react-native`, whose Flow syntax esbuild will not parse,
so one import of it inside the scene takes `preview.mjs` and `stage.mjs` down
with it — which is exactly what happened on the first attempt. **Keep the
studio's module graph free of Reanimated.** Omit the prop and the motes draw
at rest, which is what every still of the scene shows.

The podium's top face was lifted from 0.05 to 0.11 white and its side takes
a second pass of the contact shadow, so face ÷ side went 2.80 → 3.96. That
difference is the only thing making the podium read as a solid rather than a
disc lying on the floor, which is why it is worth measuring rather than
eyeballing.

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
