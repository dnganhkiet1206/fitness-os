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
2. **The render matches.** Do not eyeball it in a static screenshot; that
   mistake cost a whole rebuild of the running pose once. Resolve the
   `<sc-if>` bindings, keep the CSS, load the export in a browser and
   freeze each frame through the Web Animations API:

   ```js
   el.getAnimations().forEach((a) => { a.currentTime = t; a.pause(); });
   ```

   Then render the generated data at the same `t` and compare side by side,
   across every pose and every item.

## What the importer understands

`<sc-if value="{{ flag }}">` → a conditional group · `{{ binding }}` in a
`transform` or `style` → a value supplied by `koa-flags.ts` ·
`animation: name 1.5s ease-in-out .25s infinite` · `transform-origin` ·
the CSS `translate` property · `<defs>` / `<clipPath>`.

Anything else it does not know about is dropped silently, so if a layer
goes missing after an update, look here first.
