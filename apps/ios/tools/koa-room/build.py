#!/usr/bin/env python3
"""Đồ phòng của Koa (#527 phần 3, Kiệt duyệt mock 29/10) — biến thể cho 6 chỗ trong phòng.

`StudioSceneData.swift` là căn phòng RN sinh tự động (`tools/studio/gen.cjs`), vẫn là chuẩn
cho test golden. Công cụ này khoanh 6 chỗ trong danh sách phần tử phẳng của phòng (theo
chỉ số, có kiểm tra phần tử đúng là thứ mình nghĩ), vẽ 2 biến thể cho mỗi chỗ, rồi ghi
`StudioDecorData.swift`: chỉ số của từng chỗ + cây phần tử của từng biến thể, cùng định
dạng `{"t","p","k","m"}` với phòng gốc. `StudioScene.build` bỏ phần tử gốc của chỗ có món
đang dùng và chèn biến thể vào đúng vị trí của phần tử đầu tiên — thứ tự vẽ giữ nguyên.

Mỗi phần tử cấp đầu của biến thể và của lớp bụi có thể mang `"at"`: chỉ số phần tử của phòng mà
nó THAY (đồ mua) hay NẰM TRÊN (bụi). App dùng để (1) dựng mặt nạ che Koa (`StudioScene.objects`):
mặt nạ của kệ / cây / bóng lấy đúng phần đồ mua thay chúng và bụi nằm trên chúng; (2) bỏ bụi khi
thứ nó nằm trên không được vẽ (khung dọc bỏ cửa sổ / bảng neon cũ; đồ mua trong `bare` không có
mặt đỡ của đồ gốc, như giá olympic không có ván).

Biến thể vẽ theo bảng màu của phòng đêm (tím than #151A33 / #212B4E, tím #7B61FF /
#8F83FF, vàng #FFC24D); bản ngày đổi màu qua `dayColors` như phòng gốc.

    python3 tools/koa-room/build.py              # chạy từ apps/ios: ghi StudioDecorData.swift
    python3 tools/koa-room/build.py --preview D  # thêm: SVG + PNG từng biến thể vào thư mục D
"""
import json, math, re, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Packages/ASCNDKit/Sources/ASCNDCore/Koa/StudioSceneData.swift"
DST = ROOT / "Packages/ASCNDKit/Sources/ASCNDCore/Koa/StudioDecorData.swift"

scene = json.loads(re.search(r'##"(.*?)"##', SRC.read_text(), re.S).group(1))
BACK, FRONT = scene["back"], scene["front"]
TEMPLATE = BACK + FRONT
NB = len(BACK)


def F(i): return NB + i  # chỉ số trong `back + front` của phần tử front thứ i


# ── 6 CHỖ: chỉ số các phần tử gốc (bỏ Defs — gradient dùng chung). Kiểm từng chỗ.
SPOTS = {
    "shelf": list(range(77, 90)) + [91],          # kệ 3 tầng + đồ trên kệ + chậu cây nhỏ
    "board": list(range(65, 77)),                  # bảng số dưới cửa sổ
    "window": list(range(25, 65)),                 # khung, trời, trăng, phố, kính, bậu
    "plants": [90, 92, F(0), F(1)],                # cây lớn + bóng tập
    "lamp": [F(15)] + list(range(F(17), F(39))),   # quầng, nón sáng, dây, chao, bụi trong vệt
    "podium": [i for i in range(F(39), F(55)) if i != F(41)],  # bục (chữ tên giữ riêng)
}


def p(i): return TEMPLATE[i].get("p", {})


# Đồ RN gốc mà biến thể đồ mua dùng lại (bình nước + chậu cây nhỏ của kệ chrome, bóng tiếp xúc và
# quả bóng của chậu lưỡi hổ / bonsai). 04/11 (#799, Kiệt duyệt mock): kệ, cây lớn, bóng của phòng
# gốc đã vẽ lại; đồ đã mua giữ nguyên như Kiệt duyệt 29/10, nên đọc bản RN đóng băng (`rn-kept.json`,
# chép từ phòng trước khi vẽ lại) thay vì phần tử hiện tại của phòng.
RN_KEPT = json.loads((Path(__file__).parent / "rn-kept.json").read_text())


def kept(i): return json.loads(json.dumps(RN_KEPT[str(i)]))


def check():
    # 04/11 (#799): thân kệ vẽ lại gom vào 80 (con đầu là cột trái), 79 và 81…89 để trống
    assert TEMPLATE[80]["t"] == "G" and TEMPLATE[80]["k"][0]["p"]["d"] == "M 12 392 L 26 250", "kệ tạ đã đổi"
    assert all(TEMPLATE[i] == {"t": "G", "p": {}} for i in [79, *range(81, 90)]), "chỗ trống của kệ đã đổi"
    assert TEMPLATE[91]["m"][4:] == [41, 250], "chậu cây trên kệ đã đổi"
    assert TEMPLATE[90]["m"][4:] == [316, 397] and p(F(0))["cx"] == 352, "bóng của cây / bóng tập đã đổi"
    assert p(66)["width"] == 102 and p(67).get("text") == "STREAK", "bảng số đã đổi"
    assert p(26)["width"] == 95 and p(35)["d"].startswith("$moon"), "cửa sổ đã đổi"
    assert p(64)["width"] == 99, "bậu cửa sổ đã đổi"
    assert TEMPLATE[92]["m"][4:] == [316, 397] and TEMPLATE[F(1)]["m"][4:] == [352, 370], "cây / bóng đã đổi"
    assert p(F(15))["fill"] == "url(#nsHalo)" and p(F(28))["fill"] == "#FFC24D", "đèn đã đổi"
    assert p(F(43))["d"].startswith("M 58 412") and p(F(55)).get("text") == "$label", "bục đã đổi"
    for spot, idx in SPOTS.items():
        assert all(TEMPLATE[i]["t"] != "Defs" for i in idx), spot
    # `at`: phần tử thật của phòng; đồ mua chỉ trỏ trong chỗ của nó; bụi trên đúng mặt đỡ đã định
    for key, els in VARIANTS.items():
        for n in els:
            if "at" in n: assert n["at"] in SPOTS[key.split(".")[0]], key
    for level, els in DUST.items():
        for n in els:
            if "at" in n: assert n["at"] in (80, 62, 66, 100) and TEMPLATE[n["at"]]["t"] != "Defs", level
    assert p(62)["y"] == 209 and p(66)["y"] == 245 and p(100)["y"] == 130, "mặt đỡ của bụi đã đổi"
    assert set(BARE) <= set(VARIANTS), BARE


# ── Dựng hình (tên ngắn như tools/koa-wardrobe)
def N(t, kids=None, m=None, **p_):
    n = {"t": t, "p": {k: v for k, v in p_.items()}}
    if kids is not None: n["k"] = kids
    if m is not None: n["m"] = m
    return n
def R(x, y, w, h, rx=0, **a): return N("Rect", x=x, y=y, width=w, height=h, rx=rx, **a)
def C(cx, cy, r, **a): return N("Circle", cx=cx, cy=cy, r=r, **a)
def E(cx, cy, rx, ry, **a): return N("Ellipse", cx=cx, cy=cy, rx=rx, ry=ry, **a)
def P(d, **a): return N("Path", d=d, **a)
def L(d, c, w, o=1, cap="round"):
    a = dict(stroke=c, strokeWidth=w, fill="none", strokeLinecap=cap)
    if o != 1: a["opacity"] = o
    return P(d, **a)
def G(kids, m=None): return N("G", kids, m=m)
def T(x, y, s): return [1, 0, 0, 1, x, y]
def S(k, x, y): return [k, 0, 0, k, x, y]
def Lin(id_, stops, x2=0, y2=1):
    return N("LinearGradient", [N("Stop", offset=o, stopColor=c, stopOpacity=a) for o, c, a in stops],
             id=id_, x1=0, y1=0, x2=x2, y2=y2)
def Rad(id_, stops, **a):
    return N("RadialGradient", [N("Stop", offset=o, stopColor=c, stopOpacity=a_) for o, c, a_ in stops], id=id_, **a)
def Defs(*g): return N("Defs", list(g))
def contact(cx, cy, rx, ry, o): return E(cx, cy, rx, ry, fill="url(#nsContact)", opacity=o)


def on(i, nodes):
    """Đặt `at` (xem đầu tệp) cho các phần tử cấp đầu."""
    for n in nodes: n["at"] = i
    return nodes


NAVY, NAVY2, INK = "#151A33", "#212B4E", "#0F142E"
VIO, LAV, GOLD, WHITE, BLACK = "#7B61FF", "#8F83FF", "#FFC24D", "#FFFFFF", "#000000"
LEAF = "#3D8253"

VARIANTS = {}  # "chỗ.món" → [phần tử]
def variant(key):
    def deco(fn):
        VARIANTS[key] = fn()
        return fn
    return deco


# ══ 1. KỆ TẠ ══════════════════════════════════════════════════════════════════
def dumbbell(x, y, plate, bar, glint=None, k=1.0):
    kids = [R(-9, -2.5, 18, 5, 2.5, fill=bar),
            R(-17, -8, 8, 16, 3, fill=plate), R(9, -8, 8, 16, 3, fill=plate),
            R(-21, -6, 5, 12, 2.5, fill=plate), R(16, -6, 5, 12, 2.5, fill=plate)]
    if glint:
        kids += [R(-15.5, -6.5, 2, 9, 1, fill=glint, opacity=0.55), R(10.5, -6.5, 2, 9, 1, fill=glint, opacity=0.55),
                 R(-7, -1.6, 12, 1.2, 0.6, fill=glint, opacity=0.5)]
    return G(kids, S(k, x, y))


# 08/11 (#799, Kiệt duyệt mock https://claude.ai/artifact/WykvvaeuDyWWgPL79NbvbE ngày 04/11): kệ Chrome và giá
# Olympic vẽ lại cùng kiểu kệ gỗ mới (`tools/studio/redraw799.cjs`) — gradient, vệt sáng, bóng tiếp xúc
# `nwContact`; cùng chỗ, cùng cỡ, cùng món, chỗ cúp không đổi. Gradient `nw*` của kệ gốc ở `Defs` cấp đầu
# của phòng; gradient riêng (`nc*` thép mạ, `no*` gang / vàng / đĩa) ở `Defs` của biến thể. Màu vẽ theo bản
# đêm; bản ngày qua `StudioScene.dayColors` (cặp `CPAL_NIGHT` → `CPAL_DAY`); vàng và màu đĩa giữ cả ngày.
CPAL_NIGHT = dict(postDark="#3A4466", post="#7F8BAE", postEdge="#E6EBF7", top="#C9D2E8", board="#8D99BA", boardDark="#4C5778",
                  edge="#F2F5FC", hi="#EEF2FB", mid="#9AA6C4", low="#4D5878", glint="#FFFFFF", hub="#2A2D45")
CPAL_DAY = dict(postDark="#7D8598", post="#B9C0CF", postEdge="#FFFFFF", top="#EEF1F6", board="#C9CFDC", boardDark="#959DB0",
                edge="#FFFFFF", hi="#FFFFFF", mid="#C6CCD9", low="#868EA3", glint="#FFFFFF", hub="#5E6274")
GPAL = dict(goldHi="#FFE7A3", gold="#FFC24D", goldDark="#B9852A", red="#D64545", redHi="#F07A6E", redDark="#9E2E36",
            blue="#2E8FCB", blueHi="#6BC0F0", blueDark="#1D5E8F")
IRON = dict(iron="#2A2D45", ironHi="#55597E", ironDark="#15172A")  # gang của kệ gốc (đã có bản ngày)


def shelf_defs():
    c, g, p_ = CPAL_NIGHT, GPAL, IRON
    return Defs(
        Lin("ncPost", [(0, c["postDark"], 1), (0.5, c["post"], 1), (1, c["postDark"], 1)], x2=1, y2=0),
        Lin("ncBoard", [(0, c["board"], 1), (1, c["boardDark"], 1)]),
        Lin("ncChrome", [(0, c["hi"], 1), (0.45, c["mid"], 1), (1, c["low"], 1)], x2=1, y2=0),
        Lin("ncChromeV", [(0, c["hi"], 1), (0.5, c["mid"], 1), (1, c["low"], 1)]),
        Rad("ncBell", [(0, c["hi"], 1), (0.5, c["mid"], 1), (1, c["low"], 1)], cx=0.66, cy=0.35, r=0.8),
        Lin("noIron", [(0, p_["ironHi"], 1), (0.4, p_["iron"], 1), (1, p_["ironDark"], 1)], x2=1, y2=0),
        Lin("noIronV", [(0, p_["ironHi"], 1), (0.45, p_["iron"], 1), (1, p_["ironDark"], 1)]),
        Lin("noGold", [(0, g["goldHi"], 1), (1, g["gold"], 1)]),
        Rad("noGoldBell", [(0, g["goldHi"], 1), (0.55, g["gold"], 1), (1, g["goldDark"], 1)], cx=0.66, cy=0.35, r=0.8),
        Lin("noRed", [(0, g["redHi"], 1), (0.5, g["red"], 1), (1, g["redDark"], 1)], x2=1, y2=0),
        Lin("noBlue", [(0, g["blueHi"], 1), (0.5, g["blue"], 1), (1, g["blueDark"], 1)], x2=1, y2=0),
        Lin("noPlateGold", [(0, g["goldHi"], 1), (0.5, g["gold"], 1), (1, g["goldDark"], 1)], x2=1, y2=0),
    )


def rr(x, y, w, h, fill, r=0, op=None):
    a = dict(fill=fill)
    if op is not None: a["opacity"] = op
    return R(x, y, w, h, r, **a)


def ee(cx, cy, rx, ry, fill, op=None):
    a = dict(fill=fill)
    if op is not None: a["opacity"] = op
    return E(cx, cy, rx, ry, **a)


def stroke(d, c, w, op=None):
    a = dict(fill="none", stroke=c, strokeWidth=w, strokeLinecap="round")
    if op is not None: a["opacity"] = op
    return P(d, **a)


def nw_contact(cx, cy, rx, ry, op): return ee(cx, cy, rx, ry, "url(#nwContact)", op)


def base_plant():
    """Chậu cây nhỏ của kệ gốc mới (phần tử 91)."""
    return json.loads(json.dumps(TEMPLATE[91]))


def base_bottle():
    """Bình nước của kệ gốc mới (nhóm con của thân kệ 80)."""
    b = [k for k in TEMPLATE[80]["k"] if k.get("m") == [0.72, 0, 0, 0.72, 84, 250]]
    assert len(b) == 1, "bình nước của kệ gốc đã đổi"
    return json.loads(json.dumps(b[0]))


def c_post(x1, y1, x2, y2, c):
    return [stroke(f"M {x1} {y1} L {x2} {y2}", c["postDark"], 6.5),
            stroke(f"M {x1 + 0.8} {y1} L {x2 + 0.8} {y2}", c["post"], 3.6),
            stroke(f"M {x1 + 1.6} {y1 - 3} L {x2 + 1.4} {y2 + 3}", c["postEdge"], 1, 0.75)]


def c_board(x1, x2, y, c):
    w = x2 - x1
    return [rr(x1 + 2, y + 6, w - 4, 5, "url(#nwShadow)"),
            rr(x1, y - 2, w, 3, c["top"], 1.5),
            rr(x1, y, w, 5, "url(#ncBoard)", 1.5),
            rr(x1 + 1, y - 1.6, w - 2, 0.8, c["edge"], 0.4, 0.8),
            rr(x1 + w * 0.5, y + 1, w * 0.46, 0.9, c["edge"], 0.45, 0.6)]


def c_dumbbell(cx, cy, c):
    k = [nw_contact(cx, cy + 9, 22, 2.6, 0.8), rr(cx - 13, cy - 1.6, 26, 3.2, "url(#ncChromeV)", 1.6)]
    for side in (-1, 1):
        x = cx + side * 13
        k += [rr(x - 4, cy - 8, 8, 16, "url(#ncChrome)", 2.6), rr(x - 3, cy - 7, 1.4, 14, c["glint"], 0.7, 0.7)]
        xo = cx + side * 19
        k += [rr(xo - 2.6, cy - 6, 5.2, 12, "url(#ncChrome)", 2.2), rr(xo - 1.8, cy - 5, 1, 10, c["glint"], 0.5, 0.6)]
    return k


def c_kettlebell(cx, base, c, s=1.1):
    k = [nw_contact(0, 0.8, 14, 2.6, 0.9),
         stroke("M -7.5 -19 C -8 -31 8 -31 7.5 -19", c["low"], 4.6),
         stroke("M -6.6 -19.5 C -7 -29.4 7 -29.4 6.6 -19.5", c["hi"], 1.2, 0.8),
         ee(0, -10.5, 11.5, 10.5, "url(#ncBell)"),
         rr(-6, -1.6, 12, 2.2, c["low"], 1.1),
         ee(4, -15, 3.6, 2.6, c["glint"], 0.75),
         ee(-6, -6, 1.6, 3.4, c["glint"], 0.25)]
    return [G(k, S(s, cx, base))]


def c_plates(cx, base, c, s=1.1):
    """Ba đĩa tạ chồng (thay con lăn, như kệ Chrome đang bán)."""
    k = [nw_contact(0, 0.8, 18, 2.8, 0.9)]
    for i, (rx, h) in enumerate(((15.5, 4), (14.5, 4), (12, 3.6))):
        y = -i * 4.4
        k += [rr(-rx, y - h, rx * 2, h, c["low"]),
              ee(0, y, rx, 3.6, c["low"]),
              ee(0, y - h, rx, 3.6, "url(#ncChrome)"),
              ee(0, y - h, rx * 0.62, 2.2, c["mid"], 0.9),
              ee(0, y - h, 2.6, 0.9, c["hub"]),
              stroke(f"M {-rx * 0.7:.2f} {y - h - 2.4:.2f} Q 0 {y - h - 4.2:.2f} {rx * 0.7:.2f} {y - h - 2.4:.2f}", c["glint"], 0.8, 0.7)]
    return [G(k, S(s, cx, base))]


@variant("shelf.chrome")
def _():
    """Kệ Chrome (mua): dáng thang của kệ gỗ mới, vật liệu thép mạ."""
    c = CPAL_NIGHT
    k = [shelf_defs(), nw_contact(72, 393, 62, 5, 0.9)]
    k += c_post(12, 392, 26, 250, c) + c_post(132, 392, 118, 250, c)
    k += c_board(28, 116, 250, c) + c_board(20, 124, 300, c) + c_board(12, 132, 350, c)
    k += [base_plant(), base_bottle()]
    k += c_dumbbell(46, 291, c) + c_dumbbell(98, 291, c)
    k += c_kettlebell(40, 350, c) + c_plates(100, 350, c)
    return k


def o_plate(x, col, h):
    y = 268 - h / 2
    # rãnh đĩa giữ đen cả ngày: `black` (dayColors đổi chuỗi "#000000" sang nâu)
    return [rr(x, y, 8, h, f"url(#no{col})", 2.5),
            rr(x + 0.9, y + 2.5, 1.2, h - 5, WHITE, 0.6, 0.35),
            rr(x + 2.6, 265, 2.8, 6, "black", 1, 0.25)]


def o_stack(cx, base, cols):
    out = [nw_contact(cx, base + 2, 22, 3, 0.9)]
    for i, (col, rx) in enumerate(cols):
        y = base - i * 6
        out += [ee(cx, y + 1.6, rx, 4.4, f"url(#no{col})"), ee(cx, y + 1.6, rx, 4.4, "black", 0.35),
                ee(cx, y, rx, 4.4, f"url(#no{col})"),
                ee(cx, y, rx * 0.55, 2.3, "black", 0.18),
                stroke(f"M {cx - rx * 0.75:.2f} {y - 2.6:.2f} Q {cx} {y - 4.6:.2f} {cx + rx * 0.75:.2f} {y - 2.6:.2f}", WHITE, 0.8, 0.45)]
    return out


@variant("shelf.olympic")
def _():
    """Giá Olympic (hạng Beast): cùng khung, thanh đòn, đĩa, cọc đĩa, ấm tạ vàng — gang của kệ gốc, thép mạ."""
    c, p_, g = CPAL_NIGHT, IRON, GPAL
    k = [shelf_defs(), nw_contact(16, 394, 15, 3, 0.9), nw_contact(128, 394, 15, 3, 0.9),
         rr(12, 239, 120, 5, "url(#nwShadow)")]                                     # bóng xà trên tường
    for x in (10, 124):                                                              # hai cột
        k += [rr(x, 236, 10, 158, "url(#noIron)", 2), rr(x + 1.2, 238, 1.2, 152, p_["ironHi"], 0.6, 0.7)]
        for y in range(250, 384, 14):
            k += [ee(x + 5, y, 1.4, 1.4, p_["ironDark"]), ee(x + 5, y + 0.9, 1.1, 0.5, p_["ironHi"], 0.5)]
    for x in (4, 118):                                                               # đế
        k += [rr(x, 388, 22, 6, "url(#noIronV)", 2), rr(x + 1, 388.6, 20, 0.9, p_["ironHi"], 0.45, 0.8)]
    k += [rr(10, 232, 124, 7, "url(#noIronV)", 2), rr(12, 232.6, 120, 1, p_["ironHi"], 0.5, 0.9)]   # xà trên
    k += [P("M 20 262 L 28 262 L 28 270 L 24 270 L 24 266 L 20 266 Z", fill="url(#noGold)"),     # móc chữ J vàng
          P("M 124 262 L 116 262 L 116 270 L 120 270 L 120 266 L 124 266 Z", fill="url(#noGold)"),
          rr(20.6, 262.4, 6.8, 0.8, WHITE, 0, 0.6), rr(116.6, 262.4, 6.8, 0.8, WHITE, 0, 0.6)]
    k += [rr(-6, 266, 156, 4, "url(#ncChromeV)", 2)]                                 # thanh đòn mạ + vạch nhám
    for x in range(32, 114, 3):
        k.append(rr(x, 266.6, 0.6, 2.8, c["low"], 0, 0.45))
    k += [rr(-8, 265, 22, 6, "url(#ncChromeV)", 2), rr(130, 265, 22, 6, "url(#ncChromeV)", 2),
          rr(13, 264.4, 2.4, 7.2, c["low"], 0.8), rr(128.6, 264.4, 2.4, 7.2, c["low"], 0.8),
          rr(-6, 266.4, 156, 0.8, c["glint"], 0.4, 0.6)]
    for x, col, h in ((-4, "Red", 44), (4, "Blue", 38), (12, "PlateGold", 28)):
        k += o_plate(x, col, h)
    for x, col, h in ((140, "Red", 44), (132, "Blue", 38), (124, "PlateGold", 28)):
        k += o_plate(x, col, h)
    k += [rr(20, 330, 104, 4, "url(#noIronV)", 2), rr(21, 330.4, 102, 0.8, p_["ironHi"], 0.4, 0.8)]   # thanh an toàn
    k += [rr(66, 360, 4, 30, "url(#noIron)", 1.5)]                                   # cọc đĩa + ba đĩa
    k += o_stack(68, 386, [("Blue", 17), ("Red", 15), ("PlateGold", 12)])
    k += [rr(66, 356, 4, 8, "url(#noIron)", 1.5), ee(68, 356, 2.4, 0.9, p_["ironDark"])]
    bell = [nw_contact(0, 0.8, 14, 2.6, 0.9),                                        # ấm tạ vàng
            stroke("M -7.5 -19 C -8 -31 8 -31 7.5 -19", g["goldDark"], 4.6),
            stroke("M -6.6 -19.5 C -7 -29.4 7 -29.4 6.6 -19.5", g["goldHi"], 1.2, 0.8),
            ee(0, -10.5, 11.5, 10.5, "url(#noGoldBell)"), rr(-6, -1.6, 12, 2.2, g["goldDark"], 1.1),
            ee(4, -15, 3.4, 2.4, WHITE, 0.6)]
    k += [G(bell, S(1.0, 108, 392))]
    return k


# Kệ mua thay thân kệ (80, trong mặt nạ che Koa của kệ); bóng tiếp xúc trên sàn thay bóng kệ (77, ngoài
# mặt nạ: bóng không che Koa).
for _key in ("shelf.chrome", "shelf.olympic"):
    for _n in VARIANTS[_key]:
        if _n["t"] != "Defs": _n["at"] = 77 if _n["p"].get("fill") in ("url(#nsContact)", "url(#nwContact)") else 80
# Đồ mua không có mặt đỡ của đồ gốc: bụi nằm trên đồ gốc của chỗ ấy không vẽ (giá olympic không có ván).
BARE = ["shelf.olympic"]


# ══ 2. BẢNG SỐ ═════════════════════════════════════════════════════════════════
# Giữ nguyên chữ / số / chấm của bảng gốc (token `$streak`, `$dotN` — `StudioScene` đổi
# sang chỉ số người dùng chọn), chỉ đổi khung và màu.
BOARD_INNER = [67, 68, 69] + list(range(70, 77))


def board_inner(text_fill=None, num_fill=None, icon_fill=None, on=None, off=None):
    out = []
    for i in BOARD_INNER:
        n = json.loads(json.dumps(TEMPLATE[i]))
        pp = n["p"]
        if i == 67 and text_fill: pp["fill"] = text_fill
        if i == 68 and num_fill: pp["fill"] = num_fill
        if i == 69 and icon_fill: pp["fill"] = icon_fill
        if i >= 70 and (on or off):
            _, a, b = pp["fill"].split(":")
            pp["fill"] = pp["fill"].split(":")[0] + ":" + (off or a) + ":" + (on or b)
        out.append(n)
    return out


@variant("board.neon")
def _():
    """Bảng Neon (mua): nền đen, viền ống neon hồng + xanh, chữ phát sáng."""
    pink, cyan = "#FF5FA2", "#4FE3F0"
    return [R(269, 248, 104, 62, 12, fill=BLACK, opacity=0.35),
            R(270, 245, 102, 62, 11, fill="#0B0D1C"),
            R(268, 243, 106, 66, 13, fill="none", stroke=pink, strokeWidth=7, opacity=0.12),
            R(270, 245, 102, 62, 11, fill="none", stroke=pink, strokeWidth=2.2),
            R(274, 249, 94, 54, 8, fill="none", stroke=cyan, strokeWidth=1, opacity=0.7),
            C(276, 251, 1.6, fill=WHITE, opacity=0.8), C(366, 301, 1.6, fill=WHITE, opacity=0.8),
            ] + board_inner(text_fill=cyan, num_fill="#FFE6F2", icon_fill=pink, on=pink, off="#1E2140")


@variant("board.gold")
def _():
    """Bảng Vàng (hạng Swole): gỗ sẫm, khung vàng hai lớp, cành nguyệt quế hai bên."""
    leaf = lambda x, y, r_, flip: P(f"M {x} {y} q {4 * flip} {-5} {9 * flip} {-3} q {-4 * flip} {5} {-9 * flip} {3} Z",
                                    fill=GOLD, opacity=0.85)
    out = [Defs(Lin("decorGold", [(0, "#FFE7A3", 1), (0.5, GOLD, 1), (1, "#B9852A", 1)])),
           R(269, 248, 104, 62, 12, fill=BLACK, opacity=0.35),
           R(270, 245, 102, 62, 11, fill="#2A1E16"),
           R(270, 245, 102, 62, 11, fill="none", stroke="url(#decorGold)", strokeWidth=3),
           R(275, 250, 92, 52, 7, fill="none", stroke=GOLD, strokeWidth=0.8, opacity=0.55),
           R(272, 247, 98, 1.4, 0.7, fill="#FFE7A3", opacity=0.6)]
    for i in range(3):
        out += [leaf(276, 284 - i * 8, 4, 1), leaf(366, 284 - i * 8, 4, -1)]
    return out + board_inner(text_fill="#FFE7A3", num_fill="#FFF6DD", icon_fill=GOLD, on=GOLD, off="#4A3626")


# ══ 3. CỬA SỔ ══════════════════════════════════════════════════════════════════
def window_frame(sky_id, extra, frame=NAVY):
    """Khung + kính + bậu như gốc; `extra` vẽ trong ô kính (đã cắt theo ô)."""
    return ([TEMPLATE[25], R(272, 95, 95, 117, 12, fill=frame), R(278, 101, 83, 105, 7, fill=f"url(#{sky_id})"),
             N("Defs", [N("ClipPath", [R(278, 101, 83, 105, 7)], id=f"{sky_id}Clip")]),
             N("G", extra, clipPath=f"url(#{sky_id}Clip)")]
            + [TEMPLATE[i] for i in (58, 59, 60, 61, 62, 63, 64)])


def stars(pts, o=0.85): return [C(x, y, r_, fill=WHITE, opacity=o) for x, y, r_ in pts]


@variant("window.ocean")
def _():
    """Biển đêm (mua): trời tím, trăng và vệt trăng trên sóng, ngọn hải đăng xa."""
    sky = Defs(Lin("decorSeaSky", [(0, INK, 1), (0.5, VIO, 0.3), (0.62, "#FF9A7A", 0.35), (0.64, "#1B2B5A", 1), (1, "#0D1838", 1)]))
    waves = [L(f"M {278 + (i * 13) % 70} {178 + i * 4} l 10 0", LAV, 1, 0.35) for i in range(7)]
    glint = [R(343 - w / 2, 172 + i * 4.2, w, 1.4, 0.7, fill=GOLD, opacity=0.75 - i * 0.08) for i, w in enumerate((14, 10, 12, 7, 9, 5, 6))]
    inner = (stars([(290, 112, 0.9), (330, 110, 1.1), (303, 133, 0.8), (355, 142, 0.9), (310, 118, 0.7)])
             + [C(343, 124, 12, fill=LAV, opacity=0.12), P("$moon:343:124:8", fill="#FFE7A3"),
                P("M 278 168 Q 300 165 320 168 T 361 168 L 361 206 L 278 206 Z", fill="#1B2B5A")]
             + glint + waves
             + [P("M 278 168 Q 290 156 304 168 Z", fill=NAVY),
                P("M 287 160 L 290 136 L 294 160 Z", fill="#E4E9F5"),
                R(287.6, 146, 5.6, 3, 0, fill="#D64545"), R(288.6, 153, 4.8, 3, 0, fill="#D64545"),
                R(288, 132, 4, 4, 1, fill=GOLD), P("M 290 130 L 289 131.5 L 291 131.5 Z", fill="#D64545"),
                P("M 292 134 L 316 126 L 316 142 Z", fill=GOLD, opacity=0.22)])
    return [sky] + window_frame("decorSeaSky", inner)


@variant("window.mountain")
def _():
    """Núi tuyết (hạng Lifter): dãy núi đỉnh tuyết dưới trăng, rừng thông, cực quang nhạt."""
    sky = Defs(Lin("decorPeakSky", [(0, INK, 1), (0.45, "#2E7D7A", 0.35), (0.7, VIO, 0.3), (1, "#1B2B5A", 1)]))
    pine = lambda x, y, h: P(f"M {x} {y} l {-h * 0.32} 0 l {h * 0.24} {-h * 0.4} l {-h * 0.14} 0 l {h * 0.22} {-h * 0.6} "
                             f"l {h * 0.22} {h * 0.6} l {-h * 0.14} 0 l {h * 0.24} {h * 0.4} Z", fill=NAVY)
    inner = (stars([(286, 110, 0.8), (300, 120, 1), (340, 112, 0.9), (356, 126, 0.8), (322, 106, 0.7)])
             + [P("M 278 132 Q 310 112 361 128 L 361 138 Q 310 124 278 144 Z", fill="#4FE3B0", opacity=0.14),
                C(345, 120, 10, fill=LAV, opacity=0.1), P("$moon:345:120:7", fill="#E4E9F5"),
                P("M 278 190 L 300 150 L 312 164 L 330 136 L 361 184 L 361 206 L 278 206 Z", fill="#3A4566"),
                P("M 300 150 L 306 161 L 302 159 L 297 164 L 295 159 Z", fill="#E4E9F5"),
                P("M 330 136 L 338 149 L 333 147 L 330 152 L 326 146 L 322 149 Z", fill="#E4E9F5"),
                P("M 278 196 L 296 176 L 314 192 L 334 172 L 361 196 L 361 206 L 278 206 Z", fill="#212B4E")]
             + [pine(x, 206, h) for x, h in ((284, 18), (293, 24), (304, 16), (340, 20), (351, 26), (359, 17))])
    return [sky] + window_frame("decorPeakSky", inner)


# ══ 4. CÂY VÀ BÓNG ════════════════════════════════════════════════════════════
def leaf_fan(cx, cy, specs, colour):
    out = []
    for ang, ln_, w in specs:
        a = math.radians(ang)
        tx, ty = cx + ln_ * math.sin(a), cy - ln_ * math.cos(a)
        nx, ny = math.cos(a) * w, math.sin(a) * w
        mx, my = (cx + tx) / 2, (cy + ty) / 2
        out += [P(f"M {cx:.1f} {cy:.1f} Q {mx + nx:.1f} {my + ny:.1f} {tx:.1f} {ty:.1f} Q {mx - nx:.1f} {my - ny:.1f} {cx:.1f} {cy:.1f} Z",
                  fill=colour),
                L(f"M {cx:.1f} {cy:.1f} L {tx:.1f} {ty:.1f}", "#2C5E3C", 0.8, 0.6)]
    return out


@variant("plants.snake")
def _():
    """Lưỡi hổ + bóng xanh ngọc (mua): chậu trụ cao, lá dựng viền vàng; bóng đổi màu."""
    leaves = []
    for x, h, lean in ((-12, 62, -6), (-5, 78, -2), (3, 70, 3), (10, 56, 7), (-1, 48, 0)):
        leaves += [P(f"M {x - 4} 0 Q {x - 5 + lean} {-h * 0.6} {x + lean} {-h} Q {x + 5 + lean} {-h * 0.6} {x + 4} 0 Z", fill="#2F7A4C"),
                   P(f"M {x - 4} 0 Q {x - 5 + lean} {-h * 0.6} {x + lean} {-h}", stroke="#E3C55A", strokeWidth=1, fill="none", opacity=0.8),
                   L(f"M {x - 1} {-h * 0.2} L {x + lean * 0.6} {-h * 0.7}", "#4FA36B", 1, 0.6)]
    pot = [R(-17, 0, 34, 30, 6, fill="#E9E2D6"), R(-17, 0, 34, 5, 3, fill="#C9BFAE"), R(-15, 7, 3, 20, 1.5, fill=WHITE, opacity=0.4)]
    ball = kept(F(1))
    ball["k"][1]["p"]["fill"] = "#2BB5A8"
    return (on(90, [kept(90), contact(313, 397, 20, 3.6, 0.5)]) + on(92, [G(leaves + pot, T(0, 0, 0)[:4] + [313, 367])])
            + on(F(0), [kept(F(0))]) + on(F(1), [ball]))


@variant("plants.bonsai")
def _():
    """Bonsai + ấm tạ vàng (hạng Gym Rat): bàn gỗ thấp, cây dáng nghiêng, ấm tạ thay bóng."""
    bonsai = [R(-26, -6, 52, 6, 2, fill="#4A3626"), R(-22, 0, 4, 16, 1, fill="#4A3626"), R(18, 0, 4, 16, 1, fill="#4A3626"),
              R(-16, -16, 32, 10, 3, fill="#2C3A66"), R(-18, -18, 36, 4, 2, fill="#3A4C80"),
              P("M -2 -18 C -4 -30 6 -36 2 -46 C 0 -52 8 -56 12 -58", stroke="#6B4A33", strokeWidth=4.5, fill="none", strokeLinecap="round"),
              P("M 1 -40 C -6 -44 -12 -46 -18 -44", stroke="#6B4A33", strokeWidth=3, fill="none", strokeLinecap="round")]
    for cx, cy, rx, ry in ((-18, -48, 13, 7), (12, -62, 15, 8), (-2, -66, 11, 6), (24, -54, 9, 5)):
        bonsai += [E(cx, cy, rx, ry, fill="#2F7A4C"), E(cx - 2, cy - 2, rx * 0.7, ry * 0.5, fill="#4FA36B", opacity=0.7)]
    bell = [L("M -12 -36 C -12 -52 12 -52 12 -36", "#B9852A", 7), L("M -12 -36 C -12 -52 12 -52 12 -36", GOLD, 4.5),
            C(0, -18, 20, fill="url(#decorBell)"), E(-7, -25, 5, 6, fill=WHITE, opacity=0.45),
            R(-9, -16, 18, 7, 2, fill="#B9852A", opacity=0.5)]
    return [Defs(Rad("decorBell", [(0, "#FFE7A3", 1), (0.6, GOLD, 1), (1, "#B9852A", 1)], cx="35%", cy="30%", r="75%")),
            *on(90, [contact(312, 398, 30, 4, 0.5)]), *on(92, [G(bonsai, [1.3, 0, 0, 1.3, 312, 382])]),
            *on(F(0), [kept(F(0))]), *on(F(1), [G(bell, [1.15, 0, 0, 1.15, 352, 399])])]


# ══ 5. ĐÈN ═════════════════════════════════════════════════════════════════════
CONES = list(range(F(17), F(26)))
DUST = list(range(F(30), F(39)))


def recolor_cone(c1):
    return [Defs(Lin("decorCone", [(0, c1, 0.25), (0.1, c1, 0.26), (0.3, c1, 0.15), (0.6, c1, 0.07), (1, c1, 0)]))] + [
        {**TEMPLATE[i], "p": {**TEMPLATE[i]["p"], "fill": "url(#decorCone)"}} for i in CONES]


@variant("lamp.ring")
def _():
    """Đèn vòng LED (mua): vòng tròn treo, ánh trắng lạnh hơi hồng, quầng tròn."""
    out = [Defs(Rad("decorRingHalo", [(0, "#FFD6EC", 0.35), (1, "#FFD6EC", 0)]))]
    out += [E(195, 70, 70, 52, fill="url(#decorRingHalo)")] + recolor_cone("#FFE3F1")
    out += [R(194, 0, 2, 40, fill=VIO, opacity=0.55), R(186, 38, 18, 5, 2, fill=NAVY2),
            C(195, 66, 24, fill="none", stroke="#FF8CC6", strokeWidth=9, opacity=0.18),
            C(195, 66, 24, fill="none", stroke=NAVY2, strokeWidth=6),
            C(195, 66, 24, fill="none", stroke="#FFF3FA", strokeWidth=3.2),
            P("M 177 54 A 24 24 0 0 1 207 46", stroke=WHITE, strokeWidth=1.4, fill="none", opacity=0.9)]
    return out + [{**TEMPLATE[i], "p": {**TEMPLATE[i]["p"], "fill": "#FFD6EC"}} for i in DUST]


@variant("lamp.chandelier")
def _():
    """Đèn chùm vô địch (hạng Mass Monster): khung vàng 3 tay, 3 bóng, pha lê treo."""
    out = [TEMPLATE[F(15)]] + [TEMPLATE[i] for i in CONES]
    out += [R(194, 0, 2, 40, fill=GOLD, opacity=0.8), C(195, 42, 4, fill=GOLD),
            P("M 195 46 L 195 66", stroke=GOLD, strokeWidth=3, fill="none"),
            P("M 163 62 Q 179 76 195 66 Q 211 76 227 62", stroke=GOLD, strokeWidth=3, fill="none", strokeLinecap="round"),
            E(195, 68, 10, 4, fill="#B9852A")]
    for x in (163, 195, 227):
        y = 62 if x != 195 else 70
        out += [R(x - 4, y - 7, 8, 7, 1.5, fill="#B9852A"), E(x, y - 12, 4, 6, fill="#FFF3D6"),
                E(x, y - 12, 9, 10, fill=GOLD, opacity=0.18)]
    for x, y in ((172, 74), (183, 78), (207, 78), (218, 74), (195, 82)):
        out += [L(f"M {x} {y - 6} L {x} {y}", GOLD, 0.6, 0.7), P(f"M {x} {y} l -2.2 3.6 l 2.2 3.6 l 2.2 -3.6 Z", fill="#E4E9F5", opacity=0.85)]
    return out + [TEMPLATE[i] for i in DUST]


# ══ 6. BỤC ═════════════════════════════════════════════════════════════════════
def podium_with(top, side, rim_paint=None, extra=()):
    out = []
    for i in SPOTS["podium"]:
        n = json.loads(json.dumps(TEMPLATE[i]))
        pp = n["p"]
        if i == F(43): pp["fill"] = side
        if i == F(45): pp["fill"] = top
        if rim_paint and i in (F(48), F(49)): pp["stroke"] = rim_paint
        out.append(n)
    return out + list(extra)


@variant("podium.rubber")
def _():
    """Bục sàn tạ (mua): mặt gỗ giữa hai dải cao su đen, như sàn deadlift."""
    wood = [N("Defs", [N("ClipPath", [E(195, 412, 137, 31)], id="decorPodTop")]),
            N("G", [R(58, 380, 274, 64, fill="#1A1D24"), R(130, 380, 130, 64, fill="#8A5A36"),
                    R(130, 380, 130, 64, fill="url(#decorWood)"),
                    L("M 130 381 L 130 443 M 260 381 L 260 443", "#000000", 1.6, 0.5),
                    L("M 150 384 L 150 440 M 172 382 L 172 442 M 195 381 L 195 443 M 218 382 L 218 442 M 240 384 L 240 440", "#5E3C22", 0.8, 0.6)],
              clipPath="url(#decorPodTop)")]
    out = podium_with("#1A1D24", "#0E1016")
    i45 = SPOTS["podium"].index(F(45))
    return [Defs(Lin("decorWood", [(0, "#B07A4A", 0.5), (1, "#5E3C22", 0.4)]))] + out[:i45 + 1] + wood + out[i45 + 1:]


@variant("podium.marble")
def _():
    """Bục đá cẩm thạch (hạng Swole): mặt trắng vân xám, hông viền vàng."""
    vein = [N("Defs", [N("ClipPath", [E(195, 412, 137, 31)], id="decorPodMarble")]),
            N("G", [L("M 80 402 Q 120 412 150 398 T 220 410", "#9AA4B8", 1.2, 0.6),
                    L("M 200 424 Q 240 414 270 426 T 320 416", "#9AA4B8", 1, 0.5),
                    L("M 110 426 Q 140 420 160 430", "#9AA4B8", 0.8, 0.5)], clipPath="url(#decorPodMarble)")]
    out = podium_with("#D9DEE8", "#8E9BBB", rim_paint=GOLD)
    i45 = SPOTS["podium"].index(F(45))
    band = [L("M 58 430 A 137 31 0 0 0 332 430", GOLD, 2, 0.8)]
    return out[:i45] + band + out[i45:i45 + 1] + vein + out[i45 + 1:]


# ══ BỤI VÀ MẠNG NHỆN (#527 phần 5 — Kiệt duyệt mock bản 3, 29/10) ═══════════════
# Lớp phủ trên phòng, KHÔNG đổi màu phòng (Kiệt 29/10): chỉ nét xám / trắng mờ chồng
# lên đồ vật. Ba mức cộng dồn: 1 = bụi nhẹ, 2 = thêm mạng nhện góc, 3 = bụi dày + nhện.
DUSTC, WEBC = "#C9CED8", "#E4E9F5"


def cobweb(cx, cy, a0, a1, r, rings=4, seed=0, o=0.62):
    """Mạng nhện cách điệu ở một góc (29/10, Kiệt: "đừng ngay ngắn quá"): sợi toả lệch
    nhau, dài ngắn khác nhau, hơi cong; vòng tơ võng XUỐNG theo trọng lực, sâu ở khoảng
    rộng; vài đoạn rách; nét đậm ở chỗ bám, nhạt dần ra ngoài; một sợi đứt rủ xuống."""
    import random
    rnd = random.Random(seed)
    n = 5 + rnd.randint(0, 1)
    # góc lệch không đều
    cuts = sorted(rnd.random() for _ in range(n - 2))
    angs = [math.radians(a0 + (a1 - a0) * t) for t in [0.0] + cuts + [1.0]]
    lens = [r * (0.65 + 0.45 * rnd.random()) for _ in angs]
    out = []
    for t, l in zip(angs, lens):
        ex, ey = cx + l * math.cos(t), cy + l * math.sin(t)
        mx_, my_ = (cx + ex) / 2, (cy + ey) / 2 + l * 0.05
        out.append(P(f"M {cx} {cy} Q {mx_:.1f} {my_:.1f} {ex:.1f} {ey:.1f}", stroke=WEBC, strokeWidth=1.1, fill="none",
                     opacity=o, strokeLinecap="round"))
    for k in range(1, rings + 1):
        f = (k / (rings + 0.4)) * (0.92 + 0.12 * rnd.random())
        pts = [(cx + l * f * math.cos(t), cy + l * f * math.sin(t)) for t, l in zip(angs, lens)]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            if rnd.random() < 0.14:  # rách
                continue
            seg = math.hypot(x1 - x0, y1 - y0)
            sag = seg * (0.18 + 0.14 * rnd.random())
            qx, qy = (x0 + x1) / 2 + (rnd.random() - 0.5) * 3, max(y0, y1) + sag
            w = 0.95 - 0.35 * k / rings
            out.append(P(f"M {x0:.1f} {y0:.1f} Q {qx:.1f} {qy:.1f} {x1:.1f} {y1:.1f}", stroke=WEBC, strokeWidth=round(w, 2),
                         fill="none", opacity=round(o * (1 - 0.35 * k / rings), 2), strokeLinecap="round"))
    # một sợi đứt rủ xuống từ vòng ngoài
    t, l = angs[len(angs) // 2], lens[len(lens) // 2]
    hx, hy = cx + l * 0.8 * math.cos(t), cy + l * 0.8 * math.sin(t)
    drop = 10 + 12 * rnd.random()
    out += [P(f"M {hx:.1f} {hy:.1f} q 3 {drop / 2:.1f} -1 {drop:.1f}", stroke=WEBC, strokeWidth=0.7, fill="none", opacity=o * 0.8,
              strokeLinecap="round"),
            C(hx - 1, hy + drop + 1.2, 1.4, fill=WEBC, opacity=o * 0.7)]
    return out


DUSTD = "#9AA2B4"  # bóng dưới của bụi — vẫn là xám, không nhuộm phòng


def dust_line(x, y, w, o=0.8):
    """Lớp bụi trên mặt kệ / bậu: một dải xù, mép trên gợn, gồ thành vài đụn, có
    vệt sáng trên đỉnh và vài hạt rơi ở mép trước."""
    import random
    rnd = random.Random(int(x * 7 + y))
    top, steps = [], max(6, int(w / 5))
    for i in range(steps + 1):
        px = x + w * i / steps
        top.append((px, y - 1.2 - 1.6 * rnd.random() - (2.2 if rnd.random() < 0.18 else 0)))
    d = f"M {x:.1f} {y:.1f} L {top[0][0]:.1f} {top[0][1]:.1f}"
    for (x0, y0), (x1, y1) in zip(top, top[1:]):
        d += f" Q {(x0 + x1) / 2:.1f} {min(y0, y1) - 1:.1f} {x1:.1f} {y1:.1f}"
    d += f" L {x + w:.1f} {y:.1f} Z"
    out = [P(d, fill=DUSTC, opacity=o), P(d, fill="none", stroke=WEBC, strokeWidth=0.6, opacity=o * 0.6)]
    for _ in range(int(w / 14)):
        out.append(C(x + rnd.random() * w, y + 1 + rnd.random() * 2.5, 0.6 + rnd.random() * 0.6, fill=DUSTC, opacity=o * 0.7))
    return out


def hammock(ax, ay, bx, by, n=5, seed=0, o=0.6):
    """Tấm tơ võng căng giữa hai điểm bám (trần ↔ tường): các sợi chạy gần song song,
    mỗi sợi võng một độ sâu khác, vài sợi ngang nối lệch — không có tâm, không đối xứng."""
    import random
    rnd = random.Random(seed)
    out = []
    prev = None
    for k in range(n):
        f = k / (n - 1)
        # điểm bám trượt dần dọc trần / tường, lệch ngẫu nhiên
        x0, y0 = ax - 14 * f + rnd.uniform(-2, 2), ay + 2 * f
        x1, y1 = bx + rnd.uniform(-1, 1), by + 16 * f + rnd.uniform(-2, 2)
        sag = 8 + 10 * f + 6 * rnd.random()
        qx, qy = (x0 + x1) / 2 - 4, max(y0, y1) + sag
        out.append(P(f"M {x0:.1f} {y0:.1f} Q {qx:.1f} {qy:.1f} {x1:.1f} {y1:.1f}", stroke=WEBC,
                     strokeWidth=round(1.0 - 0.4 * f, 2), fill="none", opacity=round(o * (1 - 0.3 * f), 2), strokeLinecap="round"))
        if prev and rnd.random() < 0.7:
            t = 0.25 + 0.5 * rnd.random()
            def at(c, t):
                (sx, sy), (cx_, cy_), (ex, ey) = c
                return ((1 - t) ** 2 * sx + 2 * (1 - t) * t * cx_ + t * t * ex, (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy_ + t * t * ey)
            p0, p1 = at(prev, t), at(((x0, y0), (qx, qy), (x1, y1)), t + rnd.uniform(-0.08, 0.08))
            out.append(L(f"M {p0[0]:.1f} {p0[1]:.1f} L {p1[0]:.1f} {p1[1]:.1f}", WEBC, 0.5, o * 0.7))
        prev = ((x0, y0), (qx, qy), (x1, y1))
    return out


def tangle(cx, cy, r, n=6, seed=0, o=0.55):
    """Vài sợi rối bắt chéo nhau quanh một điểm (dây đèn, chân kệ), một nhúm tơ ở giữa."""
    import random
    rnd = random.Random(seed)
    out = []
    for _ in range(n):
        a = rnd.uniform(0, math.tau)
        b = a + math.pi + rnd.uniform(-0.6, 0.6)
        r0, r1 = r * rnd.uniform(0.5, 1), r * rnd.uniform(0.5, 1)
        x0, y0 = cx + r0 * math.cos(a), cy + r0 * math.sin(a)
        x1, y1 = cx + r1 * math.cos(b), cy + r1 * math.sin(b)
        out.append(P(f"M {x0:.1f} {y0:.1f} Q {cx + rnd.uniform(-3, 3):.1f} {cy + rnd.uniform(1, 5):.1f} {x1:.1f} {y1:.1f}",
                     stroke=WEBC, strokeWidth=0.55, fill="none", opacity=o, strokeLinecap="round"))
    out.append(E(cx, cy + 1, 2.4, 1.6, fill=WEBC, opacity=o * 0.6))
    return out


def fluff(x, y, w, seed=0, o=0.7):
    """Bụi xơ dẹt trên sàn: một vệt thấp mờ + nhiều sợi lông bụi ngắn, cong, nằm ngang."""
    import random
    rnd = random.Random(seed + int(x))
    out = [E(x, y, w / 2, w / 9, fill=DUSTC, opacity=o * 0.45)]
    for _ in range(int(w * 0.9)):
        px = x + rnd.uniform(-w / 2, w / 2) * 0.9
        py = y + rnd.uniform(-w / 10, w / 14)
        dx = rnd.uniform(2, 5) * (1 if rnd.random() < 0.5 else -1)
        out.append(P(f"M {px:.1f} {py:.1f} q {dx / 2:.1f} {rnd.uniform(-1.6, 0.4):.1f} {dx:.1f} {rnd.uniform(-0.6, 0.6):.1f}",
                     stroke=rnd.choice([WEBC, DUSTC]), strokeWidth=0.55, fill="none", opacity=round(o * rnd.uniform(0.5, 1), 2),
                     strokeLinecap="round"))
    return out


def baseboard(x0, x1, seed=0, o=0.6):
    """Bụi dồn ở chân tường (mép sàn y 358): vài đụn ngắn mép gợn, dài ngắn và cách nhau
    không đều, có lông xơ — không thành một hàng nét đứt."""
    import random
    rnd = random.Random(seed)
    out = []
    x = x0 + rnd.uniform(0, 20)
    while x < x1 - 8:
        w = rnd.uniform(10, 34)
        out += dust_line(x, 359.5, w, o=round(o * rnd.uniform(0.55, 0.9), 2))
        out += fluff(x + w * rnd.uniform(0.3, 0.7), 360.5, rnd.uniform(6, 10), seed=int(x), o=o * 0.7)
        x += w + rnd.uniform(18, 60)
    return out


DUST = {
    # `at` (đầu tệp): ván kệ 80, bậu cửa sổ 62, bảng số 66, bảng neon cũ 100 (khung dọc bỏ bậu và bảng
    # neon cũ nên bụi trên chúng chỉ vẽ khi cửa sổ là đồ mua). Bụi chân tường, sàn: không gắn.
    # 04/11 (Kiệt): không còn hạt bụi vẽ chết trong vệt đèn — hạt lơ lửng do app vẽ và luôn trôi
    # (`StudioMotes`, nhiều hơn khi bẩn hơn). Tơ nhện ở trần / cửa sổ / dây đèn nằm trên tường cao
    # của phòng khung dọc, ở `TALL_DUST`.
    1: (on(80, dust_line(28, 250, 88) + dust_line(20, 300, 104)) + on(62, dust_line(267, 209, 105, 0.7))
        + on(66, dust_line(270, 245, 102, 0.6))
        + baseboard(0, 140, seed=1) + fluff(22, 430, 22, seed=1)),
    2: (on(80, tangle(118, 262, 10, seed=23) + dust_line(12, 350, 120))
        + dust_line(168, 298, 48, 0.55)  # gờ ván ốp chân tường
        + baseboard(250, 390, seed=2) + fluff(366, 446, 26, seed=2)),
    3: (on(100, dust_line(24, 130, 84, 0.75)) + on(80, dust_line(28, 250, 88, 0.95) + dust_line(20, 300, 104, 0.95))
        + dust_line(226, 298, 62, 0.65)
        + baseboard(140, 250, seed=3, o=0.5) + fluff(150, 372, 18, seed=3) + fluff(12, 466, 20, seed=4)),
}


def tall(layer, nodes):
    """Phần tử của tường cao (`StudioTall`): lớp `wall` hay `lamp` (dây đèn trôi theo tầng của đèn)."""
    for n in nodes: n["layer"] = layer
    return nodes


# Tơ nhện và bụi trên phần tường cao vẽ mới (04/11, Kiệt: "phòng đã được vẽ lại hoàn toàn"): góc
# trần hai bên (8, -170) và (382, -170), dây đèn x 195, bậu cửa sổ vòm y 160 (x 194–380), góc
# trong cửa sổ (368, 160), đỉnh bảng neon y -60 (x 20–160). Mỗi chỗ một kiểu tơ, không đối xứng.
TALL_DUST = {
    1: tall("wall", dust_line(204, 160, 92, 0.6)),
    2: tall("wall", cobweb(9, -169, 2, 84, 96, rings=5, seed=21) + hammock(374, -170, 383, -138, n=4, seed=22)
            + dust_line(26, -60, 70, 0.55)),
    3: (tall("lamp", tangle(195, -150, 12, n=7, seed=24, o=0.5))
        + tall("wall", cobweb(366, 157, 194, 262, 30, rings=2, seed=25, o=0.5)
               + dust_line(96, -60, 60, 0.6) + dust_line(300, 160, 76, 0.7)
               # nhện nhỏ thả tơ từ mạng góc trần bên trái
               + [P("M 66 -142 Q 68 -116 65 -92", stroke=WEBC, strokeWidth=0.6, fill="none", opacity=0.7),
                  E(65, -88, 2.8, 3.4, fill="#3A4566"), C(65, -91.8, 1.8, fill="#3A4566"),
                  L("M 62.5 -89.5 l -3.2 -2.4 M 62.4 -87 l -3.4 1.2 M 67.5 -89.5 l 3.2 -2.4 M 67.6 -87 l 3.4 1.2", "#3A4566", 0.7)])),
}


def dust_layer(level, gone=()):
    """Như app: bụi nằm trên phần tử không vẽ (`gone`) thì bỏ."""
    return [n for k in sorted(DUST) if k <= level for n in DUST[k] if n.get("at") not in gone]


# ── Ghi file
def write():
    check()
    # bụi: các lớp theo mức (cộng dồn ở app) + chỉ số phần tử mà bụi nằm ngay sau
    data = {"spots": SPOTS, "variants": VARIANTS, "dust": {str(k): v for k, v in DUST.items()}, "dustAfter": F(1),
            "tallDust": {str(k): v for k, v in TALL_DUST.items()}, "bare": BARE}
    out = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    if '"##' in out: raise SystemExit("chuỗi thô của Swift sẽ gãy")
    DST.write_text(f"""// SINH TỰ ĐỘNG — đừng sửa tay.
// Nguồn: StudioSceneData.swift (phòng RN) + tools/koa-room/build.py (đồ phòng).
// Sinh lại: python3 tools/koa-room/build.py (từ apps/ios).

extension StudioScene {{
  static let decorJSON = ##"{out}"##
}}
""")
    print(f"ok: {DST.name}, {len(VARIANTS)} biến thể")


# ── Xem trước: SVG → PNG bằng Chrome chạy ẩn (không cần cài gì)
SKIN = {"$wall0": "#0F142E", "$wall1": "#261F4E", "$glow": GOLD}
TAGS = {"Rect": "rect", "Circle": "circle", "Ellipse": "ellipse", "Path": "path", "Text": "text", "G": "g", "Defs": "defs",
        "LinearGradient": "linearGradient", "RadialGradient": "radialGradient", "Stop": "stop", "ClipPath": "clipPath"}


def kebab(k): return re.sub(r"[A-Z]", lambda m: "-" + m.group(0).lower(), k)


def resolve(v, rank=2):
    if not isinstance(v, str) or not v.startswith("$"): return v
    if v in SKIN: return SKIN[v]
    if v == "$streak": return str(rank + 1)
    if v == "$countSize": return 22
    if v == "$label": return "KOA"
    parts = v.split(":")
    if parts[0] == "$e": return float(parts[1]) + (float(parts[2]) - float(parts[1])) * 0.6
    if parts[0] == "$day": return float(parts[1])  # xem trước là phòng đêm
    if parts[0] == "$moon":
        cx, cy, r_ = map(float, parts[1:])
        return f"M {cx} {cy - r_} A {r_} {r_} 0 0 1 {cx} {cy + r_} A {r_ * 0.55} {r_} 0 0 0 {cx} {cy - r_} Z"
    if parts[0].startswith("$dot"):
        return parts[2] if int(parts[0][4:]) <= rank else parts[1]
    return v


def svg(n):
    t = TAGS[n["t"]]
    pp = dict(n.get("p", {}))
    text = pp.pop("text", None)
    if text == "STREAK": text = "HẠNG"
    attrs = " ".join(f'{kebab(k)}="{resolve(v)}"' for k, v in pp.items())
    if "m" in n: attrs += ' transform="matrix({})"'.format(" ".join(map(str, n["m"])))
    if t == "text": attrs += ' font-family="-apple-system, Helvetica"'
    inner = "".join(svg(k) for k in n.get("k", [])) + (str(resolve(text)) if text is not None else "")
    return f"<{t} {attrs}>{inner}</{t}>"


def room(spot=None, key=None, dust=0):
    skip = set(SPOTS[spot]) if spot else set()
    gone = skip if key in BARE else set()
    els = []
    for i, n in enumerate(TEMPLATE):
        if i in skip:
            if i == min(skip): els += VARIANTS[key]
        else:
            els.append(n)
        # bụi nằm trên đồ đạc, dưới đèn / vignette của lớp trước (cả khi F(1) là đồ mua)
        if dust and i == F(1): els += dust_layer(dust, gone)
    body = "".join(svg(n) for n in els)
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="780" height="952" viewBox="0 0 390 476">{body}</svg>'


def preview(dir_):
    d_ = Path(dir_); d_.mkdir(parents=True, exist_ok=True)
    chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    shots = [("base", None, None, 0)] + [(k.replace(".", "_"), k.split(".")[0], k, 0) for k in VARIANTS]
    shots += [(f"dust{n}", None, None, n) for n in (1, 2, 3)]
    for name, spot, key, dust in shots:
        f = d_ / f"{name}.svg"
        f.write_text(room(spot, key, dust))
        subprocess.run([chrome, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={d_ / (name + '.png')}",
                        "--window-size=780,952", "--default-background-color=00000000", f.as_uri()],
                       check=True, capture_output=True)
    print(f"xem trước: {d_}")


if __name__ == "__main__":
    write()
    if "--preview" in sys.argv: preview(sys.argv[sys.argv.index("--preview") + 1])
