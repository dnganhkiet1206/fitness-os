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

## A canvas is the size of what moves on it

```bash
node tools/koa-studio/budget.mjs
```

The room dropped frames and heated the phone. This is the third time, and the
first two fixes are still right — they were just no longer enough.

`react-native-svg` rasterises a whole `<Svg>` again whenever any child prop
changes, so **the price of one animated group is the area of its canvas times
everything else on that canvas**. The room was two canvases the size of the
screen: one for the plants, one for everything else. By the time the weather and
the insects had landed, the second held about a hundred and ninety shapes — and
the whole screen was being redrawn sixty times a second so that six stars could
blink inside a window covering five percent of it.

Three changes, none of which alter a pixel.

**Each idea got a canvas its own size.** The regions are in `live-regions.ts`,
*derived from the geometry they have to contain* rather than typed — a
hand-written box silently stops being true the first time a mote moves, and a
region that no longer contains its content does not warn you, it clips it.

**What cannot be seen is not mounted.** The rain is 148 lines and the sky is dry
six times in seven; each insect is away for nine tenths of its cycle; a cloud
below the current cover is drawn at opacity zero. All three were still animated
groups changing props every frame. They now leave the tree, and both schedules
are read from **the clock itself** rather than from a `Date.now()` at mount —
two timebases agree at first and then do not, and the failure mode is an insect
that unmounts halfway across the room.

**The mascot resolves its glance once a frame.** `gazeAt` walks all three insect
routes; the four things the look moves were each doing that walk for the same
answer.

```
canvas   vùng                  phủ    hình  lúc nào   giá
sky      87×109 @276,99         5.1%     21  100.0%   1.07
                                        148   15.1%   1.14
beam     138×259 @127,59       19.3%     10  100.0%   1.93
room     390×476 @0,0         100.0%      7   35.4%   2.48
stage    254×58 @68,381         7.9%      1  100.0%   0.08
plant0   40×42 @21,213          0.9%     17  100.0%   0.15
plant1   128×105 @252,300       7.2%     22  100.0%   1.59

trước 226.0 → sau 8.4   (3.7%, nhẹ hơn 27×)
```

It is a proxy, not milliseconds — but it is the proxy both earlier fixes were
reasoned from, and the one behind "shape count is not the cost, covered area
is". The insects' canvas is still the whole room, because a route from one wall
to the other is what they are; the saving there is entirely the unmounting.

### The half-pixel that nearly cost the whole thing

Splitting is only free if a sub-canvas lands on exactly the pixels the
full-screen one did. `region · k` is almost never a whole number, so a canvas
laid out at 118.65pt rasterises against a grid half a pixel off the one the
whole-room canvas used. A pixel diff of the two layouts at 361pt found **4,940
of 48,000 inked pixels differing** — a hairline along every edge in the room.

`LiveLayer` therefore snaps the *view* to whole points and solves the viewBox
back out of it, which keeps `x · k` exact while putting the raster grid back
where it was. That takes it to **one pixel, at a difference of 7**. The check
runs on every `budget.mjs`, because it is the only way the split can move
anything, and "it looks the same" is not how this room is held to anything.

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
| ~~The scene never moves~~ | **lifted by the user, 2026-07-28** — see below |

Current cost: **185 shapes, ~20KB of SVG**. `preview.mjs` prints both numbers
on every run; if they have moved, this line is what is stale.

## The room moves now

**"The studio is a static scene" was a rule here until 2026-07-28, when the
user lifted it.** The room may move. Do not restore the old rule, and do not
take the motes, the lamp's pulse or the stage glow out on the grounds that
the scene should be still — ask first.

What has *not* changed is the reason the rule existed. This sits under a
character running its own 30fps clock, on a phone. So every moving part
obeys the same three constraints:

- **One clock each, and only three in the room** — `motes-drift.tsx` at 26s,
  `light-drift.tsx` at 7.3s (shared by the lamp's pulse and the stage glow) and
  `bugs-live.tsx` at 41s. The periods are deliberately unrelated so they never
  fall into step and start reading as a single pulse.
- **Nothing animates inside `KoaStudio`'s canvas.** `react-native-svg`
  rasterises a whole `<Svg>` again whenever any child prop changes, so an
  animated group in there redraws every shape in the room, every frame, over
  full-canvas gradients, under a character already running its own 30fps
  clock. That is exactly what the first version did and the Mascot Room went
  visibly laggy. The moving parts live in `studio-live.tsx`, a second canvas
  laid directly over the studio, and the studio's own canvas goes back to
  never redrawing. **`StageRenderer` must position that overlay absolutely** —
  as a plain sibling it lays out below the studio instead of on top of it.
- **And nothing large animates on the overlay either.** Moving the beam onto
  its own canvas fixed the lag and the phone still ran hot: nine full-height
  gradient trapezoids at 60fps. **Shape count is not the cost — covered area
  is.** The beam is static again and what moves is a glow at the lamp's
  mouth, nine motes and the stage's glow, all small. Do not animate the
  cones, the vignette, the wall or the floor.
- **Derived on the UI thread**, through `useAnimatedProps` into a group
  `matrix` or `opacity`. Nothing crosses to JS per frame.
- **Gated on screen focus.** `StageRenderer` passes the live versions only
  while the screen is focused, so the clocks stop with the screen rather than
  running behind it.

`KoaStudio` takes a `live` flag and leaves the motes and the glow out when
the overlay is drawing them, so nothing is drawn twice. The beam is drawn
there either way — it is far too large an area to animate.

## The weather in the window

```bash
node tools/koa-studio/weather.mjs <out.png>
```

Clear sky, a few clouds, overcast, and rain — and the clouds are a slightly
different colour when it is raining.

**A weather change is an event, not a clock.** Clouds drifting is motion; the
sky turning happens once in a couple of minutes, and driving it from a running
clock would mean a fourth invalidation source ticking at 60fps to change
something that hardly changes. So it is rolled in JS on an interval and eased
across with `withTiming`: nothing per frame while the weather holds, one long
transition when it turns.

**A sky holds for two and a half minutes**, up from the half-minute this
started at. Weather that turns every thirty seconds is not weather, it is a
slideshow — you cannot look up, notice it is raining, and still find it raining
when you look back. At this length a session sees one sky or two. Which is also
why the *first* sky is rolled at mount and set with no transition at all:
otherwise every session ever opened begins with the same few clouds and most of
them end before it changes. You walk in on weather already happening.

Nothing else needed a clock either. The drift is `t · 0.42` on the sky's own
45s and each rain sheet is a multiple of the same one. **A multiple of a clock
you already have is free.**

| sky | clouds | weight |
|---|---|---|
| clear | 0 | 3 |
| a few | 2 | 4 |
| overcast | 3 | 2 |
| rain | 3 | 1.6 |

"A few" and "overcast" are the *same three clouds* at different thresholds,
not three more of them: each cloud has a cover it starts to appear at and
fades in over a quarter above it, so the sky thickens rather than switching
on.

**The colour is on the group and the shapes carry no fill.** That is what lets
a rain cloud be the same five circles in a different paint rather than a second
set of them fading in underneath.

### A rain cloud is not a fair cloud in another hue

The first version interpolated `soft` → `accent`: two light purples a shade
apart, which is "a slightly different colour" in the sense that a
spectrophotometer would agree and nobody else would. A second attempt at
`#2B3050` measured a perfectly respectable "darker than the sky" and came out
*paler than the fair-weather cloud*, because at 57% over a sky of about
`#2A2A55` there was not enough between them to see.

What was missing is that a rain cloud is **heavier**, not recoloured. Both
things move now: `soft` → `primary`, the near-black navy the room's panels are
cut from, at 84% instead of 30% — dense enough to block the stars behind it,
which is the read. It is not literally black; against a night sky a cloud
darker than the sky is a cloud nobody can see.

### Why rain made of one repeating row is always regular

A sheet of drops is animated by sliding one group down and wrapping it, and for
the wrap to have no seam **the drop that arrives has to be identical to the one
that left**. With one drop per column per repeat, that forces every column to
be a train of identical drops at identical spacing — a comb, however the
columns are jittered against each other. The first version varied length by
column and phase by column and was still visibly a lattice sliding down. This
is structural: no amount of jitter fixes it, because the jitter is exactly what
the wrap forbids from varying.

The way out is to make the **repeat longer than the spacing**. A sheet whose
tile is 34 units tall with two drops in it wraps just as seamlessly, and inside
that tile the two are free to differ in length, in weight, in opacity and in
where they sit — so a column becomes an irregular train. The tool reports the
gaps down a single column for exactly this: one distinct value is a comb, and
one distinct value is what the old version would have printed.

The other half is depth. Three sheets, tiles sharing no ratio, falling at 62,
92 and 128 units a second, thinner and shorter and fainter as they go back.
Every property moves together with the distance, because one of them alone
reads as a mistake rather than as depth.

```
ô 34  rơi  62 đv/s  1.0 đv/khung  khoảng cách giọt 11.2–22.8 (12 giá trị)
ô 41  rơi  92 đv/s  1.5 đv/khung  khoảng cách giọt 13.5–27.5 (12 giá trị)
ô 27  rơi 128 đv/s  2.1 đv/khung  khoảng cách giọt  8.9–18.1  (8 giá trị)
```

The per-frame step is in there because it is the other way to get this wrong:
the previous rain fell at 18 units a second, which on a 96-unit pane is five
seconds to cross — drizzle in slow motion, and half of why it read as even.

## The bee and the butterflies

```bash
node tools/koa-studio/bugs.mjs <out.png> [frames per crossing]
```

A bee and two butterflies cross the room now and then. They are the smallest
things in the studio, so the rule about covered area barely applies — three of
them together cover less than the lamp's mouth. What they cost is
**invalidation sources**, which is why each is a *single* animated group:
position, heading and wingbeat all come out of one matrix, `translate ·
rotate · scale(sx, 1)`. A group for the wings alone would have been tidier and
doubled the count, and the body squashing with them is not something you can
see at seven points across.

They live behind the buddy, on the same overlay as the motes.

**They land, and they do not fly in straight lines.** A route is a list of
places rather than a line from one edge to the other, and one of them is
somewhere the insect sits on for a second or two: the bee on the shelf's
plant, the butterfly on the corner of the neon sign, the moth on the floor
plant. Both are places a real one would pick — something to stand on, near
light.

The wander is three things together, because no one of them is enough. The
legs bow alternately, so the path S-bends rather than arcing once. Two sine
terms at 3.7 and 2.3 cycles per crossing — deliberately not a ratio that
closes — push it off its own path. And all of it rides an envelope of `sin(π ·
leg progress)`, zero at every stop: it wanders most in the middle of a leg and
settles as it arrives, which is both what an insect does and what keeps a
landing from jittering. Two of the three no longer leave by the far side
either; a route that always ends where you can see it is heading is the thing
that reads as a sprite on a track.

Landing needs two things the flight does not. The wingbeat is carried as an
accumulated **phase**, not read off a rate, because the rate changes when it
settles — a butterfly at rest opens and closes about once every two seconds
where in flight it beats six times a second, and reading the phase off the
rate directly jumps the wings at every landing. And the heading, which comes
from the path's slope one step on, is zero while perched: `atan2(0, 0)` is 0,
which snaps a landed butterfly flat to the horizontal. A hold keeps the
heading it arrived with instead.

Three things had to be measured rather than eyeballed, and the tool prints all
three:

- **How often the room is empty.** 35% of a 72-second cycle. "Now and then" is
  a number, and without one it drifts into "always". The period went from 41s
  to 72 when they started landing — a crossing with a pause in it takes twice
  as long, and at the old one something would have been on screen most of the
  time.
- **The wingbeat, in Hz.** `beats` is per *crossing*, not per clock cycle —
  read the other way the first values here put the butterfly at 42Hz and the
  bee at 103, both far past what 60fps can draw. A wing that beats faster than
  the frame rate does not look fast, it looks like noise. They run at 11.9,
  6.0 and 4.5Hz, with the largest step between frames at 7, 19 and 13 percent.
- **Whether you can see them at all.** Drawn life-size — nine units on a
  390-wide board — they were there and invisible, and a butterfly in the
  palette's own purples crossing a purple wall is the worst case of it. They
  are twice that now, and the second one is a pale moth, white at half
  strength, which is the only value in the palette that has nothing to do with
  the room it crosses.

`bugs.tsx` holds the routes, the flight maths and the drawings and imports no
Reanimated, so `bugs.mjs` steps the *same* `flightAt` the phone runs. The tool
samples frames inside each insect's own window rather than evenly across the
cycle: evenly is what the room actually looks like, and two thirds of that
strip came out empty.

**The room is three canvases while it is live**, not one, and that is the
plants' doing. They sway, so they need a canvas to themselves — but they also
have to stay *under* the vignette, which takes about a third out of both where
they stand (0.32 for the floor plant, 0.33 for the shelf one). Drawn up on the
main overlay they jump that much brighter, which is far more visible than the
sway. So `StageRenderer` stacks `layer="back"` → `PlantsCanvas` →
`layer="front"` → `StudioLive`, and `KoaStudio` with no `layer` draws the
whole scene in one canvas for stills and for `preview.mjs`. **Every one of
those canvases must carry the same viewBox, size and `preserveAspectRatio`**
or the layers drift apart.

Only the foliage moves; `plant.tsx` splits into `PlantFoliage` and `PlantPot`
for that reason, because a pot that rocks with its own plant reads as an
earthquake rather than a draught. The two sway at different rates and their
gusts fall at different points in the cycle — a room where every leaf moves
together is a room in a wind tunnel — and the envelope is a raised cosine
cubed, so each plant is still for most of the cycle and then moves for a few
seconds. Off — which
is the default, and what `preview.mjs` gets — it draws the whole scene in one
canvas exactly as before. That is also the boundary the Reanimated rule above
needs: the studio imports none of it.

Lifting the motes and the glow above `FloorLight` and `Platform` costs
nothing visible, and that was checked rather than assumed: no mote sits inside
the podium's box. **Re-check if one is moved down.**

The lamp hangs 12 units lower than the design's, at the user's direction, and
the beam's gradient reaches 0.62 rather than 0.58 for the same reason. **The
landmark table's `lamp mouth` row is knowingly out of date because of it** —
that is a deliberate change, not drift to be corrected.

## Koa notices them

```bash
node tools/koa-studio/gaze.mjs <out.png>
```

When one of the insects lands, the character glances at it: the eyes go first,
the head follows with a small roll toward it, and the open mouth closes into a
pleased little smile. When the insect leaves, it all comes back. Three times in
a 72-second cycle, for 1.4 to 2.3 seconds each.

**One clock, two consumers.** `StageRenderer` owns it and hands the same shared
value to the insects and to the figure. On a clock each they would agree for
about a minute and then have Koa staring at an empty shelf. `perchAt(t)` in
`bugs.tsx` returns whichever insect is sitting still, and `gazeAt(t)` in
`koa-gaze.ts` turns that into a direction and a strength — no state, no timers,
so the same `t` always gives the same look and it all runs on the UI thread.
The strength is the insect's own `settle`, which already ramps 0 → 1 → 0 across
a hold, so the glance eases in as it lands and out as it takes off for free.

The travel is deliberately unequal: eyes 3.6 units, head 4.5 sideways and 5° of
roll. An animal glances with its eyes and brings its head after, and that order
is what reads as *noticing* rather than as turning to face something. The roll
is most of the effect. `HEAD_TURN` is a shift rather than a yaw because the
figure is flat and has no far side to bring round.

The glance is composed as wrapper groups **around** `#HEADRIG` and the pupils
rather than folded into their matrices, because `koa-scene.ts` is a generated
export — a look composed on top of `koaBob` survives the next re-import and one
folded into it would not. The mouth swap only applies to `mouthSmile` and
`mouthGrin`; a koala mid-workout under `mouthBreath` does not stop to admire a
butterfly.

Two things the tool got wrong before it got them right, both worth knowing:

- **The component drops ids** — `n.id` is a field on the node, not an attribute
  — so the first run's `querySelector('#pupil_left')` matched nothing and it
  cheerfully reported "correct all three times" having measured nothing at all.
  A check that cannot fail is not a check.
- **One pupil is the wrong probe.** A head that rolls left drops its left eye
  and lifts its right one; that is what a roll *is*. Measuring `#pupil_left`
  alone mixes the tilt into the vertical reading and called two of the three
  landings wrong. Between the two eyes the roll cancels vertically and adds
  horizontally, which is exactly the pair of numbers being asked about.

The tool draws two crops per landing for the same reason: the wide shot is the
only place you can see the character is looking at *where the insect actually
is*, and at that scale a four-degree tilt is two pixels, so the head gets its
own crop beside it.

### Koa does not stand to attention

The export is drawn on a mirror line and it is exact: `leg_left_lower` is
`leg_right_lower` reflected in x = 120 to the decimal, the arms likewise, and
`koaEarL` / `koaEarR` are −3.5° and +3.5° of the same animation. Everything
balances, and a figure in perfect balance reads as a **sticker** — a drawing of
a character rather than a character standing there.

`koa-pose.ts` breaks the mirror by a few degrees, statically: the body leans 1°
from the hips, the head cocks 2.5° the *other* way, and the arms and legs drift
the same direction as each other by different amounts. Never in matched pairs —
equal-and-opposite is just a second kind of symmetry, and one leg further out
than the other is what puts the weight on a hip. It is a pose, not a motion: one
`<G>` per node it touches and nothing per frame. Running, stretching and lifting
are excluded, because `poseTilt` has already decided where the weight is for
those.

Measured one at a time, **the arms, the legs and the body cost no clearance at
all** — they are nowhere near the walls. Only the head does, because rolling it
widens the ear block on both sides at once. That is what forced the next
section.

### The figure had 6.4 units of room and it was not enough

The export draws the ears within 8.6 units of its own 240 × 300 viewBox,
`koaBob` eats 2.2 of that by itself, and **an SVG viewport clips**. Every idea
that moved the head has been paid for out of what was left: the glance was cut
from 5° to 3.6° and its pivot moved from the neck to the middle of the skull,
and then the resting lean arrived with 0.6° of room — not a cocked head, a
rounding error.

A constraint that has bent two features out of shape is not a constraint, it is
a bug. `koa-frame.ts` draws the artwork at **93% of its box, anchored at the
feet**, and the stage asks for a proportionally larger box: `HERO_W` 128 → 138,
drawn width 138 × 0.93 = 128.3. The character is the same size on screen to
within a third of a unit and gains eight units of margin on each side. Nothing
about the artwork changes; only the amount of air around it.

```
              lúc đứng yên      xấu nhất (liếc + koaBob + tư thế nghỉ)
trước         8.6 / 8.6         0.8 trái / 4.5 phải
sau           11.8 / 12.7       6.3 trái / 8.7 phải
```

`HERO_W` was copied into four places — the stage, the gaze, and two tools, one
of which documented itself as *importing* it. They all read `koa-frame.ts` now,
because with an inset in the mix a fifth number would have had to agree with all
of them, and the failure mode is a character standing in front of its own
podium.

### What that clearance is spent on

The first version of the glance shipped with the head clipped. The user
reported it as "something surrounding the mascot" — the frame was real, it was
the viewBox.

Two things came out of it, and the second matters more than the first.

**The pivot moved from the neck to the middle of the skull.** The sideways cost
of a roll is `−Δy · sin θ`, so it is the *distance from the pivot to the ears*
that spends the margin, not the angle. Same 3.6°, a quarter of the travel. What
was left over went to the pupils, which have six units of white to move in and
cost nothing.

**The shadow moved out of the figure and into the room.** Widened to what a
broad overhead lamp actually throws — 2 × 2.5 on a 64 × 9 ellipse — it ran from
−8 to 248 across and down to 316, and the viewport cut it into a rectangle with
hard edges on three sides. A cast shadow belongs to the surface it falls on, so
the wide soft pool is now `Platform`'s, where there are 476 units to spread in
instead of six below the feet, and it lands on the podium's lit face where it
can be seen. The figure keeps a small core shadow that fits its box — which is
also the only shadow a picker or a grid gets, the other reason it could never
have been the stage's.

`gaze.mjs` now measures the figure's bounding box against the viewBox on every
run, **with `koaBob` at the extreme of its cycle**. Checking the rest pose would
have signed off on a margin the idle animation eats by itself.

## A worklet may only call other worklets

```bash
node tools/koa-studio/worklets.mjs
```

This shipped broken and it was not close: `gazeAt` clamped through a plain
three-line `clamp()` helper, and on a phone Reanimated throws the moment a
worklet reaches a function that is not one —

```
[Worklets] Tried to synchronously call a Remote Function. Called "clamp" on the UI Runtime.
```

**No tool in this directory could have seen it.** They all bundle the real
modules and step them in Node, where a function call is a function call:
`gaze.mjs` ran `gazeAt` four thousand times and measured the eyes to a tenth of
a pixel on code that could not run. The room's rule is that "it looks fine" is
not evidence. This is the case where *it measures fine* is not evidence either,
and the answer is a check that reads the source rather than running it.

`Math.min` and a nested helper declared inside the worklet's own body are both
fine. What is not is a helper at module scope without its own directive.

The tool got this wrong twice before it got it right, and both are the same
mistake — looking *near* a thing instead of *at* it:

- It first decided a function was a worklet if `'worklet'` appeared in the 200
  characters after its declaration. The very bug it was written to catch went
  straight through, because the doc-comment on the *next* function said the
  word.
- It then tried to find each body by its opening brace, which is not where a
  body starts when the signature ends in `): { x: number; y: number } {`, or
  when the parameter is destructured — `function AnimGroup({ clock, … })`. That
  version called `walk` in `bugs.tsx` a violation and still missed `clamp`.

So comments are stripped first, a declaration owns the text up to the next one,
and a worklet's reach is the enclosing block found by scanning *back* to the
brace that opens it. **It runs its own `--self-test` on the original `clamp`
bug before it says anything about the room** — a check that has never been seen
to fail is not a check, which is the second time that has been written down on
this page.

## Definition comes from shadow, not from outlines

Measuring each prop against the wall right behind it found three that had no
edge at all: the streak card at |Δ| 0.4, the window at 1.2, and the floor
plant against the ground it stands on. They are the correct *colours* — the
panels are `primary` because that is what the design's interiors measure — so
the fix cannot be to lighten them, and it cannot be a stroke either: the
design has none, and three boxes each ringed in light is what made this wall
look cluttered in the first place.

**A contact shadow separates them without touching either colour**: a
slightly larger rounded rect in `shadow` at 0.3, offset three units down,
behind the box. The card's edge went 0.4 → 6.1 and the window's 1.2 → 6.8.
The pots got the same treatment and the plant's ground went 23 → 18 under it.

**The neon sign is the exception, and it was tried.** Its panel is translucent
— `secondary` at 0.55 — so a shadow behind it shows straight through and
darkens the sign along with the wall; the edge measured *down*, 28.1 → 25.7.
It was removed again. If a box is translucent, a shadow behind it is not
separation, it is tint.

Measure this at the shadow band itself, three units under the box. Sampling
the wall further out reports no change at all and looks like the shadow is not
drawing — that happened twice while this was being fitted.

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

## Touching the buddy is haptic only

A tap used to wave the character and nod the stage. Both read as a sticker
being tapped rather than a companion being touched: the pose swap is a cut to
a different drawing, and the nod is the whole figure rocking as one rigid
piece. Removed at the user's direction, 2026-07-28 — a touch should be felt,
not performed.

The wave still fires as a greeting the first time the buddy appears in a
session, and `celebrate` still fires from `celebration-host.tsx`; those are
events the app initiates, not a reaction to being prodded. If a visible
reaction to touch goes back in, it has to come from inside the rig — an ear
flick, the cheek pop the hand-drawn figure had — and not from a transform on
the container.

## Nothing is drawn over the buddy

There was a soft ellipse here for one commit — lit air in front of the
character, meant to stop the beam and Koa reading as two layers. It measured
well and it looked wrong: **at that size a falloff stops reading as light and
starts reading as an object**, a pale shape parked behind the mascot. Removed
at the user's direction, 2026-07-28.

The rule that replaces it: **the beam is one continuous cone from the lamp to
the stage, and nothing else in this room is allowed to stand in for light.**
What the lamp does to the character it does *on* the character —
`koa-light.ts` — and what it does to the floor is the pool and the contact
shadow. If the two still read as separate layers, strengthen those; do not put
a glow back between them.

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

Nine motes hang **inside the lamp's beam** at 8.5–10%, in `motes.tsx`. The
room's air is only visible where light crosses it, so they are not scattered
over the walls: each sits within the cone's half-width at its own height — 30
units at y95 widening to 100 at y305, where the gradient has faded out. Their
radii run 0.7 to 1.8 on purpose; one speck size reads as a pattern, and dust
has none.

They are all `highlight`, the lamp's own colour, so the dust is lit by the
beam rather than sitting in it as neutral specks. **The tint follows the
light**: near the mouth they measure R−B +34 · +35 · +23, plainly warm, and by
the foot they read −6 to −16, because the beam has cooled to the wall's colour
by then and a mote this faint cannot warm what is behind it. Forcing that back
by raising their opacity only makes them brighter, not warmer.

A mote only reads where it is brighter than what is behind it, which inside a
lit beam is not free: an early gold mote up in the bright cone measured 7
luminance units **darker** than the light around it, which looks like dirt on
the lens. Each is measured at +12 to +16 against a median of its surroundings
— they were briefly at +30 to +99, which read as stars rather than dust.

**They drift up and down.** Dust in a beam rises and settles rather than
sliding sideways, so the vertical term carries the motion and the horizontal
one is barely a wobble. Three group matrices off a single shared value,
derived on the UI thread with no per-frame work in JS, over a 26s cycle whose
terms are whole numbers of cycles so the loop closes without a seam. `StageRenderer` only
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

## The window has a sky

**The moon keeps the real phase.** `moonPhase()` in `window.tsx` counts
synodic months from a known new moon — arithmetic, no network, no key, and
accurate to hours over decades, which is far past what an 11-unit moon can
show. `moonPath()` draws the lit part as two arcs sharing their endpoints: the
limb is a half circle, the terminator a half *ellipse* whose width is
`r·|cos(2π·phase)|`, so the shape is right between the quarters and not only
at them.

The terminator hugs the lit limb while the moon is a crescent and bows past
centre once it is gibbous — opposite sweep to the limb before a quarter, the
same one after. **Getting that pair the wrong way round inverts the whole
cycle**, drawing new as full and full as nothing, and it looks entirely
plausible in code; it was written backwards first and only a render of all
eight phases caught it. A faint disc sits under the lit part so the moon does
not vanish outright for the days around new.

Phase changes over days, not frames, so this is geometry in the scene and
costs nothing. What moves is in `sky-live.tsx` and is tiny: the six stars
twinkle, and a shooting star crosses for about a second in every forty-five.
Star blink rates are coprime so no two ever fire together.

**The overlay draws above the whole room, so the sky needs putting back
behind its own window.** Without that a star sits *on* a glazing bar instead
of behind it, and the streak crosses one — both happened. `LiveSky` clips its
contents to the glass and redraws the two bars on top, so keep new stars off
`GLASS`'s bars anyway and let the clip handle the streak, which now enters and
leaves past the edges rather than winking on in mid-air.

`preview.mjs` passes no phase, so a still of the room shows the default young
crescent rather than tonight's moon — deliberate, so the snapshot does not
change from one day to the next.

## The name is part of the stage

The companion's name is set into the podium's front face (`stage-label.tsx`),
not shown as the screen's header title — `mascot-room.tsx` passes `title=""`
and the header keeps only its chevron and coin pill. Down in the room, in the
room's own colour, it reads as something the stage was built with rather than
a label laid over it.

Keep it in `glow`: that is the ring's colour too, so a skin changes both
together. The halo is a wide stroke at low opacity under a sharp fill — the
same two passes the neon sign uses, and still only `<Text>`.

Its `Y` sits on the front face, which at the centre runs from the ring at 443
to the bottom arc at about 467. **Move the podium and the label has to move
with it.**

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
