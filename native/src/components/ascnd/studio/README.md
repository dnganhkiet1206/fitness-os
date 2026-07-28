# Koa Studio — the mascot screen's background

Built to the "Koa Studio (Background Only)" brief. The character is **not**
part of this scene; `STAGE_MARK` in `palette.ts` is where its feet go, and
both the scene and the figure are placed from that one number.

```bash
node tools/koa-studio/preview.mjs studio.png   # renders the real components
```

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

Current cost: **115 shapes, ~10KB of SVG**, all static — it draws once and
then costs nothing per frame, which is what lets it sit under a character
that does animate.

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
