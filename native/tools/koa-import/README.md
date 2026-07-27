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
