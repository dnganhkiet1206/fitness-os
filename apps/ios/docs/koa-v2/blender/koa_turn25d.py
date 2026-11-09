# Koa 2.5D head/body turn, the way flat mascots (Rive-style rigs) fake a turn:
# the drawn shapes stay the drawn shapes; each layer only SLIDES (and narrows a
# little) by how deep it sits. Face marks ride a cylinder around the head, the
# ears and the far arm drift the other way, layers re-sort by depth.
#
#   python3 koa_turn25d.py KoaSceneData.swift OUTDIR [angles...]
import json, math, sys, os

SRC, OUT = sys.argv[1], sys.argv[2]
ANGLES = [float(a) for a in sys.argv[3:]] or [0, 15, 30, 40]
src = open(SRC).read()
if SRC.endswith(".swift"):
    src = src[src.index('##"') + 3:src.index('"##')]
ART = json.loads(src)["nodes"]

def find(nodes, pred, acc):
    for n in nodes:
        if pred(n): acc.append(n)
        find(n.get("kids", []), pred, acc)
    return acc
by_id = lambda i: find(ART, lambda n: n.get("id") == i, [])[0]["a"]
by_d = lambda p: find(ART, lambda n: n["t"] == "path" and n.get("a", {}).get("d", "").startswith(p), [])[0]["a"]

HEAD = dict(cx=120, cy=112, rx=80, ry=67, rz=62)      # head ellipsoid (canvas units), from head_front + 11
TORSO = dict(cx=120, cy=210, rx=56, ry=70, rz=47)

def on_cyl(e, x, y, lift=0.0):
    """Yaw angle and radius of a surface point on ellipsoid e at canvas (x, y)."""
    k = max(0.05, 1 - ((y - e["cy"]) / e["ry"]) ** 2)
    R = e["rx"] * math.sqrt(k) + lift
    s = max(-0.98, min(0.98, (x - e["cx"]) / R))
    return math.asin(s), R

# layer: (name, svg element, anchor x, anchor y, kind, extra)
# kind: "head" (rides head cylinder), "torso" (rides torso cylinder), "solid" (rotates as a point at depth z)
L = []
def path(a, **kw):
    attrs = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in a.items() if k != "d")
    return f'<path d="{a["d"]}" {attrs}/>'
def ell(cx, cy, rx, ry, fill, rot=0, op=None):
    t = f' transform="rotate({rot} {cx} {cy})"' if rot else ""
    o = f' opacity="{op}"' if op else ""
    return f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="{fill}"{t}{o}/>'
def shift(el, dy):
    return f'<g transform="translate(0 {dy})">{el}</g>' if dy else el

# body (no head offset)
for s, n, x in (("L", "left", 94), ("R", "right", 146)):
    L.append((f"foot_{s}", path(by_id(f"leg_{n}_lower")), x, 272, "solid", dict(z=5, sx=False)))
    L.append((f"leg_shade_{s}", path(by_d("M104 256" if s == "L" else "M136 256")), x, 272, "solid", dict(z=4.5, sx=False)))
L.append(("torso", path(by_id("torso_front")), 120, 210, "solid", dict(z=0, sx=False)))
L.append(("belly", path(by_id("belly")), 120, 229, "torso", dict(lift=0)))
L.append(("chin_shade", path(by_d("M85 174")), 120, 180, "torso", dict(lift=0)))
for s, n, x in (("L", "left", 78), ("R", "right", 162)):
    L.append((f"arm_{s}", path(by_id(f"arm_{n}_upper")), x, 200, "solid", dict(z=-2, sx=False)))
    L.append((f"arm_shade_{s}", path(by_d("M71.5 192" if s == "L" else "M168.5 192")), x, 200, "solid", dict(z=-2.5, sx=False)))
# head group (+11)
for s, n, x in (("L", "left", 54), ("R", "right", 186)):
    L.append((f"ear_{s}", shift(path(by_id(f"ear_{n}")), 11) + shift(path(by_id(f"ear_{n}_inner")), 11), x, 69, "solid", dict(z=30, sx=True)))
L.append(("head", shift(path(by_id("head_front")), 11), 120, 112, "solid", dict(z=0, sx=False, top=True)))
L.append(("tuft", shift(path(by_d("M130 48")) + path(by_d("M120 48")), 11), 120, 43, "head", dict(lift=0)))
face = [
    ("eye_L", ell(82, 107, 18, 23.5, "#FFFFFF"), 82, 107), ("eye_R", ell(158, 107, 18, 23.5, "#FFFFFF"), 158, 107),
    ("pupil_L", ell(87, 110, 12, 16, "#20242A") + ell(83.5, 101, 4.8, 4.8, "#FFFFFF") + ell(92, 119, 2.3, 2.3, "#FFFFFF", op=0.9), 87, 110),
    ("pupil_R", ell(153, 110, 12, 16, "#20242A") + ell(156.5, 101, 4.8, 4.8, "#FFFFFF") + ell(148, 119, 2.3, 2.3, "#FFFFFF", op=0.9), 153, 110),
    ("brow_L", shift(path(by_id("eyebrow_left")), 11), 81, 72), ("brow_R", shift(path(by_id("eyebrow_right")), 11), 159, 72),
    ("blush_L", ell(66, 132, 8, 6, "#F3B5B5", rot=-10), 66, 132), ("blush_R", ell(174, 132, 8, 6, "#F3B5B5", rot=10), 174, 132),
    ("mouth", shift(path(by_d("M120 126 L120 130")) + path(by_id("mouth")) + ell(120, 139, 9, 5, "#E8657B") + '<path d="M106 128 Q120 137 134 128" stroke="#20242A" stroke-width="5" stroke-linecap="round" fill="none"/>', 11), 120, 140),
]
for n, el, x, y in face:
    L.append((n, el, x, y, "head", dict(lift=0)))
L.append(("nose", shift(path(by_id("nose")) + ell(114, 94, 3.5, 5.5, "#FFFFFF", rot=-18, op=0.16) + path(by_d("M111 117")) + path(by_d("M123 118")), 11), 120, 116, "head", dict(lift=20)))

FACE_GAIN = 0.8   # the head outline does not rotate, so the face slides a bit less than true 3D

def frame(deg):
    phi = math.radians(deg)
    items = []
    for name, el, x, y, kind, ex in L:
        if kind in ("head", "torso"):
            e = HEAD if kind == "head" else TORSO
            th, R = on_cyl(e, x, y, ex["lift"])
            t2 = max(-1.45, min(1.45, th + phi * (FACE_GAIN if kind == "head" else 1.0)))
            nx = e["cx"] + R * math.sin(t2)
            sx = max(0.25, math.cos(t2) / max(0.2, math.cos(th)))
            z = -100 if kind == "head" else -1.5   # marks sit on their host in art order; torso marks stay under the arms
            hidden = abs(t2) > 1.35
            if hidden: continue
        else:
            dx, dz = x - 120, ex["z"]
            nx = 120 + dx * math.cos(phi) - dz * math.sin(phi)
            z = dx * math.sin(phi) + dz * math.cos(phi)
            if ex.get("top"): z -= 90                             # big head sits over the body
            if name.startswith("ear"): z = -89 + 0.01 * z            # ears always just behind the head
            sx = (0.85 + 0.15 * math.cos(phi)) if ex.get("sx") else 1.0
        tf = f"translate({nx:.2f} {y}) scale({sx:.3f} 1) translate({-x} {-y})"
        g = f'<g id="{name}" transform="{tf}">{el}</g>'
        if kind == "torso":
            g = f'<g clip-path="url(#torsoClip)">{g}</g>'
        items.append((z, name, "  " + g))
    shadow = ell(120, 294, 64, 9, "#AEB6BF", op=0.45)
    shadow = f'<defs><clipPath id="torsoClip"><path d="{by_id("torso_front")["d"]}"/></clipPath></defs>\n  ' + shadow
    order = {n: k for k, (n, *_rest) in enumerate(L)}
    items.sort(key=lambda t: (-t[0], order[t[1]]))
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 300" width="480" height="600">\n  '
            + shadow + "\n" + "\n".join(i[2] for i in items) + "\n</svg>\n")

os.makedirs(OUT, exist_ok=True)
for a in ANGLES:
    open(os.path.join(OUT, f"turn{int(a):+03d}.svg"), "w").write(frame(a))
