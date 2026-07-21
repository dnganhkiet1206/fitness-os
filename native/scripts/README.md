# native/scripts

Reproducible, code-only asset tooling for the mascot / room system.

## remove-bg.py — background remover

Cuts the studio-grey AI renders to transparent WebP with no ML model
(the U2Net download is network-blocked here). It combines a **texture
flood** for the silhouette — which absorbs the gradient floor + soft cast
shadow that colour thresholds miss — with **band-limited alpha matting**
for full, soft fur and a speckle-free body. See the module docstring for
the full method.

```bash
pip install pillow numpy scipy pymatting
python scripts/remove-bg.py INPUT.png assets/mascots/koa-happy.webp
# prints size + aspect(h/w) → paste the aspect into src/lib/mascot-images.ts
```

Verified on all 8 Koa poses and the room props. Re-run it whenever new
pose / prop art arrives, then register the printed aspect ratio.
