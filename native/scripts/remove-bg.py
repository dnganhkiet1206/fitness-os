#!/usr/bin/env python3
"""
Background remover for the mascot / room art — reproducible, code-only.

The handoff calls for U2Net matting, but this org's network blocks the
model download (HuggingFace / GitHub 403). This script gets an equally
clean cut on the studio-grey renders WITHOUT any model, using two
classical ideas that suit these images exactly:

  1. TEXTURE FLOOD for the silhouette. The wall / floor / cast-shadow are
     all SMOOTH (low local gradient) and continuous with the image border;
     the character has crisp edges. Flood the background in from the border
     through low-texture pixels — it absorbs the *gradient* floor and the
     soft shadow (which colour thresholds miss) and stops at the outline.
     Size-limited hole-fill keeps real interior gaps (nostril, finger gaps)
     while dropping big trapped pockets (shadow between the feet).

  2. BAND-LIMITED ALPHA MATTING for the fur. Force the eroded interior
     solid (alpha=1, no speckles) and matte only a thin ring at the edge,
     so fur wisps stay soft and full while the body is clean.

Deps (all pure numpy/scipy — no model, works offline):
    pip install pillow numpy scipy pymatting

Usage:
    python remove-bg.py INPUT.png OUTPUT.webp [--width 760] [--quality 90]

Verified on the 8 Koa poses (happy/sad/sleep/celebrate/curl/wave/hat/coat).
"""
import argparse
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from pymatting import estimate_alpha_cf, estimate_foreground_ml


def cut(src: str, tw: int = 760) -> Image.Image:
    im = Image.open(src).convert('RGB')
    if im.width > tw:
        im = im.resize((tw, round(im.height * tw / im.width)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float32)
    H, W, _ = a.shape
    border = np.concatenate([a[:5].reshape(-1, 3), a[-5:].reshape(-1, 3),
                             a[:, :5].reshape(-1, 3), a[:, -5:].reshape(-1, 3)])
    bg = np.median(border, 0)
    d = np.linalg.norm(a - bg, axis=2)
    sat = a.max(2) - a.min(2)
    val = a.max(2)
    ys = np.arange(H)[:, None] * np.ones((1, W))

    # 1) texture flood → silhouette (handles gradient bg + soft shadow)
    gray = a.mean(2)
    sob = np.hypot(ndi.sobel(gray, axis=0), ndi.sobel(gray, axis=1))
    smooth = ndi.gaussian_filter(sob, 1.0) < 22
    seed = np.zeros((H, W), bool)
    seed[0, :] = seed[-1, :] = seed[:, 0] = seed[:, -1] = True
    seed &= smooth
    bgflood = ndi.binary_propagation(seed, mask=smooth)
    bgflood = ndi.binary_dilation(bgflood, iterations=2) & smooth
    bgcand = d < 14
    lbl, _ = ndi.label(bgcand)
    edge = set(lbl[0, :]).union(lbl[-1, :]).union(lbl[:, 0]).union(lbl[:, -1]) - {0}
    bgflood |= np.isin(lbl, list(edge))

    raw = ~bgflood
    kl, kn = ndi.label(raw)
    if kn > 1:
        sz = ndi.sum(np.ones_like(kl), kl, range(1, kn + 1))
        raw = kl == (1 + int(np.argmax(sz)))
    # size-limited hole fill (drop big trapped pockets = shadow between feet)
    filled = ndi.binary_fill_holes(raw)
    hl, hn = ndi.label(filled & ~raw)
    koala = raw.copy()
    for i in range(1, hn + 1):
        m = hl == i
        if m.sum() < 500:
            koala |= m

    # 2) band-limited trimap → matting (full fur, solid body)
    core = ndi.binary_erosion(koala, iterations=6)
    outer = ndi.binary_dilation(koala, iterations=8)
    tri = np.full((H, W), 0.5, np.float64)
    tri[core] = 1.0
    tri[~outer] = 0.0
    img = (a / 255.0).astype(np.float64)
    alpha = estimate_alpha_cf(img, tri)
    alpha[core] = 1.0
    alpha[~outer] = 0.0

    # feet-anchored ground-shadow removal (grey below the lowest shoe pixel)
    greysh = (sat < 24) & (val > 48) & (val < 216)
    solid = (alpha > 0.6) & ((sat > 30) | (val < 46) | ((val > 206) & (sat < 34)))
    rows = np.where(solid.any(axis=1))[0]
    if len(rows):
        yfeet = rows.max()
        alpha = np.where((ys > yfeet - 12) & greysh, 0.0, alpha)
    # drop detached grey smears whose component never touches the body
    softg = (sat < 24) & (alpha > 0.06) & (~core)
    sl, sn = ndi.label(softg)
    if sn > 0:
        keep = set(np.unique(sl[ndi.binary_dilation(core, iterations=2)])) - {0}
        alpha = np.where(softg & (~np.isin(sl, list(keep))), 0.0, alpha)
    # keep the largest solidly-opaque body + a small fur fringe
    ml, mn = ndi.label(alpha > 0.9)
    if mn >= 1:
        sz = ndi.sum(np.ones_like(ml), ml, range(1, mn + 1))
        body = ml == (1 + int(np.argmax(sz)))
        alpha = alpha * ndi.binary_dilation(body, iterations=7)

    fg = estimate_foreground_ml(img, alpha)
    out = Image.fromarray(np.dstack([
        np.clip(fg * 255, 0, 255).astype(np.uint8),
        (np.clip(alpha, 0, 1) * 255).astype(np.uint8),
    ]), 'RGBA')
    bb = Image.fromarray((np.clip(alpha, 0, 1) * 255).astype(np.uint8), 'L') \
        .point(lambda p: 255 if p > 16 else 0).getbbox()
    return out.crop(bb) if bb else out


def main():
    ap = argparse.ArgumentParser(description='Texture-flood + band matting background remover.')
    ap.add_argument('input')
    ap.add_argument('output')
    ap.add_argument('--width', type=int, default=760, help='working width (px)')
    ap.add_argument('--quality', type=int, default=90, help='WebP quality')
    args = ap.parse_args()
    o = cut(args.input, tw=args.width)
    o.save(args.output, 'WEBP', quality=args.quality, method=6)
    print(f'{args.output}  {o.size[0]}x{o.size[1]}  aspect(h/w)={o.height / o.width:.3f}')


if __name__ == '__main__':
    main()
