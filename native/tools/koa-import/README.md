# Importing a Koa design update

The character is not hand-written. When the design tool exports a new
`Koa.dc.html`, regenerate the scene instead of editing anything by hand:

```bash
python3 tools/koa-import/import-koa.py path/to/Koa.dc.html \
        src/components/ascnd/koa/koa-scene.ts
```

That rewrites `koa-scene.ts` (the SVG tree + every `@keyframes` as data).
Nothing else in `src/components/ascnd/koa/` is generated.

## Then check two things

1. **`koa-flags.ts`** is the export's own `renderVals()`, ported by hand
   because it is logic, not data. If the export gained a pose, an
   expression, an outfit slot or a new binding, mirror it there — the
   importer will happily emit nodes gated on a flag that nothing sets, and
   those layers simply never draw.
2. **The render matches**, checked by the browser rather than by eye:

   ```bash
   npm i -D playwright esbuild && npx playwright install chromium
   node tools/koa-import/verify.mjs path/to/Koa.dc.html      # --quick for a smoke test
   ```

   It renders the export in Chromium with its animations frozen at a clock,
   renders the generated data at the same clock through the same maths
   `koa-figure.tsx` uses, and compares every shape's screen box, effective
   opacity, fill, stroke and clip — across every pose × expression at
   thirteen points in the cycle, and every wardrobe item at four. A drift
   comes out as a named shape and a pixel distance. It exits non-zero if
   anything differs.

   Do not settle for a static screenshot instead. Eyeballing one is what got
   the running pose rebuilt from scratch, wrongly, and it hid four separate
   CSS rules being broken at once.

## The lamp

`koa-light.ts` shades the figure, and it is *not* generated — the export has
one flat colour per surface, and a character lit the same from its ears to its
feet reads as pasted onto the room rather than standing in it.

```bash
node tools/koa-import/figure.mjs <out.png>   # both figures, and the profile
```

Measured on the render, against the same points unlit:

| | crown | ear top | ear foot | cheek | chin | shoulder | belly | leg | shadow |
|---|---|---|---|---|---|---|---|---|---|
| lit ÷ flat | 104% | 102% | 96% | 95% | 91% | 90% | 88% | 85% | 21% |

Three things about it are worth knowing before changing it.

**It may not make anything dimmer overall.** A lamp adds light; it does not
take the white out of a white mascot. The first version multiplied every fill
by a factor of at most 1 and turned the koala grey — a different character,
not a lit one. The ramp starts *above* 1, so the crown and the ears come out
brighter than the artwork and only the lower body goes under.

**One factor per element cannot shade anything.** An ear is a single path, so
a per-element factor makes it a flat tone with its top and bottom identical.
What an ear needs is 105 at the top and 95 at the bottom, and that is a
gradient *inside* one shape. Each colour is a vertical gradient in **user
space** running the height of the figure — one gradient per colour per
coordinate system, ten to fifteen for a given pose, built once at module load
and filtered per pose by `rampsFor(flags)`.

Working in user space rather than per element is also what makes it seamless.
The export contains shapes whose only job is to be invisible: `head_top_fur`
is two tufts plus `M99 38 L141 38 L141 66 L99 66 Z`, a plain rectangle in the
head's own colour hiding where the tufts are rooted. Give it a fill of its own
and it is a grey patch on the forehead — an earlier pass drew exactly that.
Painted from the head's own ramp at the head's own coordinates, it cannot be.

```bash
node tools/koa-import/patches.mjs            # exits non-zero if one shows
```

That checks it across all sixty pose × expression combinations using the
browser's own bounding boxes, so it does not rest on this module's arithmetic.

**The rim light is a second stroke, not a glow.** A glow spreads and an
outline goes all the way round; a rim is the top contour only. So each of the
seven silhouette shapes — head, both ears, the torso, both upper arms — is
drawn a second time, stroke only, in a gradient that fades out over the first
sixth of that shape's *own* height. `objectBoundingBox` units are what let one
gradient serve every shape whatever its size or where it sits; on a round form
that first sixth is the arc within about 43° of the apex. The copy sits beside
the shape inside the same group, so it inherits every transform and animation
for free.

It goes by name and not by size, because a rim only means anything on a
silhouette edge. `belly` is as large as anything here and sits inside the
torso, so a rim along its top would be a bright line across the middle of the
body. Containment cannot decide it either — the ear's box is inside the head's
and the ear is very much a silhouette.

`figure.mjs` finds it by differencing the two renders rather than by sampling
points, and prints where the light lands and how much it adds:

```
viền sáng: đỉnh +105 trên thân, +255 ngoài nền
  y 20 ####...   y 30 ####...   y 40 ####...   y 50 ##..   y170 #
```

A 1.6-unit line is easy to miss with a probe and easy to believe you have
drawn when you have not. The first run of this reported nothing on the ears or
the head, and the cause was in the tool: it appended `fill="none"` to a tag
that already carried a fill, and **a repeated attribute keeps its first value
in SVG**, so every rim was rendering as a second copy of its own shape. React
does the opposite — later props win — so the component was right and the
preview was wrong, which is the second time that has happened here.

**The shadow is not a light grey.** `#AEB6BF` at low opacity is what the export
uses for the contact shadow, and it was drawn for a white page — light grey
over white darkens. On the podium's dark plum it *lightens*: measured, a smudge
of 108 on a surface of 50. `koa-light.ts` remaps that one colour to a near-black
plum, and gives it no ramp, because a shadow is the absence of light.

One thing a browser preview cannot settle: whether `react-native-svg` resolves
`userSpaceOnUse` inside a nested transformed group the way the spec says. Most
of the figure sits at identity, where there is nothing to resolve; a limb is
where to look first if the device disagrees.

## What the importer understands

`<sc-if value="{{ flag }}">` → a conditional group · `{{ binding }}` in a
`transform` or `style` → a value supplied by `koa-flags.ts` ·
`animation: name 1.5s ease-in-out .25s infinite` · `transform-origin` ·
the CSS `translate` property · `<defs>` / `<clipPath>`.

Anything else it does not know about is dropped silently, so if a layer
goes missing after an update, look here first.

## The CSS rules this has to honour

An SVG that is animated by CSS is not "shapes plus transforms"; these are
the rules the port got wrong, every one of them visible on the device:

* **A CSS animation outranks a presentation attribute.** Keyframes that set
  `transform` *replace* the element's own `transform` — they do not compose
  with it. Same for `opacity`. The CSS `translate` property is a separate
  property and survives either way. (Wrong: the run's left arm, the left ear
  and the shadow each carried a second, doubled transform.)
* **Each property animates over only the stops that declare it.** `0%
  { transform: …; opacity: 0 } 25% { opacity: .95 } 100% { transform: …;
  opacity: 0 }` is a two-stop transform and a three-stop opacity. Treating
  it as three frames of both makes every particle snap back at 25%. The
  importer keeps a track per property for this reason.
* **Mismatched transform lists are matched pairwise.** Where one list is a
  prefix of the next — `rotate(-16deg)` against `rotate(17deg)
  translateY(-9px) scale(.94)` — CSS pads the short one with identity
  functions; where they name different functions it interpolates the
  decomposed matrices. The importer resolves both, so the runtime only ever
  lerps component by component.
* **`transform-origin` belongs to the element, not to the animation.** It
  applies to the element's own `transform` too — an eyelid styled
  `scaleY(0)` collapses onto the lash line at y=72, not onto the top of the
  viewBox.
* **During `animation-delay` nothing from the animation applies.**
  `animation-fill-mode` is `none` throughout this export, so before the
  delay is up the layer sits on its own transform and opacity — not on the
  0% keyframe.
* **`ease-out` and `ease-in-out` are cubic béziers**, (0, 0, .58, 1) and
  (.42, 0, .58, 1). A quadratic and a smoothstep stand-in drift by ~3px.
* Details that still matter: `translate: 6px 0` — `px` is optional on a zero
  — and an exact iteration boundary sits at the *end* of the cycle that just
  finished, not the start of the next.
