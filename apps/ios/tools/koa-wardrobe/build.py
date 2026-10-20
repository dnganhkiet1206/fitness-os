#!/usr/bin/env python3
"""Tủ đồ Koa vẽ lại (#527, Kiệt duyệt mock 19/10) — lớp phủ native lên cảnh RN.

`KoaSceneData.swift` là cảnh RN sinh tự động (`gen-koa-scene.mjs`) và vẫn là chuẩn
cho các test golden. Công cụ này đọc cảnh ấy, BỎ nhóm vẽ cũ của từng món đã vẽ lại,
chèn bản mới vào đúng chỗ trong cây (theo đầu / mặt / thân / tay của từng tư thế),
rồi ghi `KoaWardrobeData.swift` — cảnh app thật sự vẽ. Món giữ nguyên tên
(`it_<ô>_<món>`), nên đồ đã mua / đang mặc không đổi.

Vì sao đồ RN lệch (audit 19/10): mọi món vẽ ở toạ độ đứng yên — nón sau tai bị đầu
che, kính nằm ngoài nhóm mặt nên không theo đầu, tay áo bị cánh tay che, quần là
một dải ngang, giày hai miếng dẹt, balo nằm dưới đất, đồ cầm tay lơ lửng.

    python3 tools/koa-wardrobe/build.py      # chạy từ apps/ios
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaSceneData.swift"
DST = ROOT / "Packages/ASCNDKit/Sources/ASCNDCore/Koa/KoaWardrobeData.swift"

s = SRC.read_text()
m = re.search(r'##"(.*)"##', s, re.S)
d = json.loads(m.group(1))

# Các món đã vẽ lại, theo ô. Nhóm vẽ RN của chúng bị bỏ trước khi chèn bản mới.
REDRAWN = {
    "head": ["cap", "band", "beanie", "santa", "antler", "pumpkin", "witch", "khanxep", "phones", "lion"], "face": ["shades", "goggles", "mask", "eyepatch", "beard", "tuong", "vr", "nosestrip", "heart", "dragon"], "top": ["tee", "tank", "hoodie", "xmas", "aodai", "ghost", "windbreak", "jersey", "lion", "armor"], "bottom": ["short", "legging", "jogger", "xmaspants", "tetpants", "tutu", "camo", "swim", "ghostpants", "flame"],
    "shoes": ["sneaker", "runner", "boot", "xmasboot", "hai", "sandal", "socks", "glow", "ghostshoe", "wing"], "back": ["backpack", "hydro", "angel", "bat", "giftbag", "lixi", "cape", "oxygen", "dragonwing", "jetpack"], "hand": ["bottle", "dumbbell", "towel", "rope", "candy", "lantern", "broom", "redenv", "trophy", "sparkler"],
}
gone = {f"it_{slot}_{i}" for slot, ids in REDRAWN.items() for i in ids}
def _all(n):
    yield n
    for k in n.get("kids", []): yield from _all(k)
# Nhóm RN cũ, nhớ theo danh tính: bản mới được chèn cạnh chúng trước, bỏ chúng sau.
old_groups = {id(n) for n in _all({"kids": d["nodes"]}) if n.get("if") in gone}
def prune(n):
    if "kids" in n:
        n["kids"] = [prune(k) for k in n["kids"] if id(k) not in old_groups]
    return n


def P(dd, **a): a['d'] = dd; return {"t": "path", "a": fix(a)}
def E(cx, cy, rx, ry, **a): a.update(cx=cx, cy=cy, rx=rx, ry=ry); return {"t": "ellipse", "a": fix(a)}
def C(cx, cy, r, **a): a.update(cx=cx, cy=cy, r=r); return {"t": "circle", "a": fix(a)}
def R(x, y, w, h, rx, **a): a.update(x=x, y=y, width=w, height=h, rx=rx); return {"t": "rect", "a": fix(a)}
def G(kids, **k): n = {"t": "g", "kids": kids}; n.update(k); return n
def fix(a): return {k.replace('_', '-'): v for k, v in a.items()}

FUR, FURD, OUT = "#BFC7CF", "#A9B2BC", "#8A94A1"

nodes = d['nodes']
poserig_inner = nodes[3]['kids'][0]            # g trong POSERIG
body = poserig_inner['kids'][0]                # BODYRIG
assert body['id'] == 'BODYRIG'
def outer(flag):
    return [k for k in poserig_inner['kids'] if k.get('if') == flag]
def walk(n):
    yield n
    for k in n.get('kids', []): yield from walk(k)
headrig = next(n for n in walk(nodes[3]) if n.get('id') == 'HEADRIG')
face = next(n for n in walk(nodes[3]) if n.get('id') == 'FACE')
faceshift = face['kids'][0]
assert faceshift.get('bind') == 'faceShift'

# ── 1. NÓN LƯỠI TRAI: ôm đỉnh đầu, vẽ SAU mặt trước đầu (RN: sau tai, bị đầu che nên
#     trông như đậu trên đỉnh); lưỡi chĩa sang trái, ra ngoài khuôn mặt.
CAP = "#D64545"; CAPD = "#B23636"
cap = G([G([G([
    P("M60 60 C 40 57 18 60 8 70 C 22 78 48 75 68 64 Z", fill=CAPD),                        # lưỡi
    P("M8 70 C 22 78 48 75 68 64", stroke="#8E2A2A", stroke_width=1.6, fill="none", opacity=0.6),
    P("M40 72 C 38 40 72 16 120 16 C 168 16 202 40 200 72 C 184 58 154 50 120 50 C 86 50 56 58 40 72 Z", fill=CAP),
    P("M42 70 C 58 57 88 50 120 50 C 152 50 182 57 198 70", stroke=CAPD, stroke_width=5, fill="none", stroke_linecap="round"),
    P("M120 17 L120 50", stroke=CAPD, stroke_width=2, opacity=0.55),
    P("M86 22 C 78 32 76 42 78 53", stroke=CAPD, stroke_width=2, fill="none", opacity=0.4),
    P("M154 22 C 162 32 164 42 162 53", stroke=CAPD, stroke_width=2, fill="none", opacity=0.4),
    P("M70 34 C 84 25 100 21 112 21", stroke="#FFFFFF", stroke_width=4, fill="none", stroke_linecap="round", opacity=0.28),
    C(120, 17, 5, fill="#E8B23A"),
])], tf=[["t", 0, 11]])], **{"if": "it_head_cap"})
# Chèn ngay TRƯỚC nhóm mặt: sau mặt trước đầu VÀ sau tai gần (`turnedView`, khi quay
# 3/4 / chạy tai gần vẽ sau đầu — chèn sớm hơn thì tai che nửa nón).
hi = [i for i, k in enumerate(headrig['kids']) if k.get('id') == 'FACE'][0] - 1
headrig['kids'].insert(hi + 1, cap)

# ── Ô ĐẦU (còn lại): cùng nguyên tắc với nón — vẽ đè lên đầu (sau HEAD, trước mặt),
#    ôm từ tai này sang tai kia; mép dưới giữ trên lông mày (y ≈ 50 ở giữa, toạ độ đầu).
def hat(flag, kids):
    headrig['kids'].insert(hi + 1, G([G(kids, tf=[["t", 0, 11]])], **{"if": flag}))
RIM = "C 184 58 154 50 120 50 C 86 50 56 58 40 72 Z"   # mép dưới chung, từ (200,72) về (40,72)

# băng đô thể thao: dải vải ôm trán, sọc trắng, hai đuôi buộc bên phải
hat("it_head_band", [
    P("M194 62 C 206 60 214 68 216 80 C 208 76 200 72 192 70 Z", fill="#2E8FCB"),
    P("M192 64 C 204 68 210 78 210 90 C 202 84 196 78 190 72 Z", fill="#2E8FCB", opacity=0.85),
    P("M44 62 C 58 44 88 34 120 34 C 152 34 182 44 196 62 L 197 72 C 182 56 152 47 120 47 C 88 47 58 56 43 72 Z", fill="#3FA9E5"),
    P("M46 66 C 60 49 89 40.5 120 40.5 C 151 40.5 180 49 194 66", stroke="#FFFFFF", stroke_width=2.6, fill="none", opacity=0.85),
])
# nón len: thân đan, vành gập có gân, quả bông
hat("it_head_beanie", [
    P("M40 70 C 38 34 74 10 120 10 C 166 10 202 34 200 70 " + RIM, fill="#3F9E63"),
    P("M78 24 C 74 36 74 46 76 54 M100 14 C 98 28 98 40 99 50 M140 14 C 142 28 142 40 141 50 M162 24 C 166 36 166 46 164 54",
      stroke="#2F7A4C", stroke_width=2, fill="none", opacity=0.5),
    P("M38 72 C 56 56 86 48 120 48 C 154 48 184 56 202 72 L 201 60 C 184 44 154 37 120 37 C 86 37 56 44 39 60 Z", fill="#2F7A4C"),
    P("M56 60 L 55 52 M72 54 L 71 45 M88 50 L 88 41 M104 48 L 104 39 M120 48 L 120 38 M136 48 L 136 39 M152 50 L 152 41 "
      "M168 54 L 169 45 M184 60 L 185 52", stroke="#245E3B", stroke_width=2, opacity=0.6),
    C(120, 8, 11, fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
])
# nón Noel: chóp đổ sang phải, bông trắng, vành lông trắng
hat("it_head_santa", [
    P("M40 66 C 44 30 80 8 124 8 C 160 8 186 22 202 42 C 216 58 222 78 216 94 C 208 78 196 66 182 60 "
      "C 160 52 140 50 120 50 C 86 50 58 56 40 66 Z", fill="#D64545"),
    P("M150 14 C 176 22 196 40 206 62", stroke="#B23636", stroke_width=3, fill="none", opacity=0.5),
    C(217, 98, 11, fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P("M36 72 C 54 54 86 45 120 45 C 154 45 186 54 204 72 C 206 79 201 83 195 80 C 180 64 152 57 120 57 "
      "C 88 57 60 64 45 80 C 39 83 34 79 36 72 Z", fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
])
# gạc tuần lộc: gắn trên băng đô nâu, mọc từ đỉnh đầu
hat("it_head_antler", [
    G([P("M92 40 C 84 26 80 14 82 2"), P("M84 22 L 68 12"), P("M83 12 L 92 0"),
       P("M148 40 C 156 26 160 14 158 2"), P("M156 22 L 172 12"), P("M157 12 L 148 0")],
      a={"stroke": "#8A6A3B", "stroke-width": 7, "stroke-linecap": "round", "fill": "none"}),
    P("M46 62 C 62 44 90 36 120 36 C 150 36 178 44 194 62", stroke="#6B4F2A", stroke_width=6, fill="none", stroke_linecap="round"),
])
# mũ bí ngô: múi cong, vành sẫm, cuống và lá xanh
hat("it_head_pumpkin", [
    P("M40 70 C 38 32 74 12 120 12 C 166 12 202 32 200 70 " + RIM, fill="#E8842A"),
    P("M86 18 C 74 32 70 46 72 56 M108 13 C 102 28 100 40 101 50 M132 13 C 138 28 140 40 139 50 M154 18 C 166 32 170 46 168 56",
      stroke="#C46A1C", stroke_width=3, fill="none"),
    P("M40 72 C 56 58 86 50 120 50 C 154 50 184 58 200 72", stroke="#C46A1C", stroke_width=6, fill="none", stroke_linecap="round"),
    P("M116 14 C 114 4 120 -2 128 0", stroke="#2F7A4C", stroke_width=5, fill="none", stroke_linecap="round"),
    P("M124 6 C 132 -2 146 0 148 8 C 140 12 130 12 124 6 Z", fill="#3F9E63"),
])
# mũ phù thuỷ: vành rộng ngang đầu, chóp cong, băng vàng
hat("it_head_witch", [
    P("M70 54 C 86 30 102 6 124 -6 C 130 -8 134 -4 130 2 C 128 8 136 14 142 22 C 154 36 164 46 172 54 Z", fill="#7A5BC4"),
    P("M76 50 C 100 43 140 43 166 50 L 160 38 C 138 33 102 33 82 38 Z", fill="#E8B23A"),
    P("M12 62 C 40 44 200 44 228 62 C 200 74 40 74 12 62 Z", fill="#5B41A0"),
    P("M12 62 C 40 74 200 74 228 62", stroke="#45307D", stroke_width=2, fill="none", opacity=0.7),
])
# khăn xếp: khăn quấn nhiều lớp, nếp chéo chữ V phía trước
hat("it_head_khanxep", [
    P("M40 72 C 38 40 74 20 120 20 C 166 20 202 40 200 72 " + RIM, fill="#D64545"),
    P("M42 66 C 66 46 94 38 120 38 C 146 38 174 46 198 66", stroke="#B23636", stroke_width=6, fill="none", stroke_linecap="round"),
    P("M48 52 C 72 34 98 28 120 28 C 142 28 168 34 192 52", stroke="#E8B23A", stroke_width=4, fill="none", stroke_linecap="round"),
    P("M100 52 L 120 26 L 140 52", stroke="#B23636", stroke_width=5, fill="none", stroke_linejoin="round"),
    P("M108 52 L 120 36 L 132 52", stroke="#E8B23A", stroke_width=3, fill="none", stroke_linejoin="round"),
])
# tai nghe: vòng qua đỉnh đầu, hai bên tai là chụp tai to có đệm
hat("it_head_phones", [
    P("M48 72 C 44 28 80 4 120 4 C 160 4 196 28 192 72", stroke="#39424E", stroke_width=10, fill="none", stroke_linecap="round"),
    P("M60 40 C 76 16 100 10 120 10", stroke="#5B6573", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.6),
    R(26, 56, 32, 46, 14, fill="#2A313B"), R(33, 64, 18, 30, 9, fill="#3FA9E5"),
    R(182, 56, 32, 46, 14, fill="#2A313B"), R(189, 64, 18, 30, 9, fill="#3FA9E5"),
])
# mũ lân: đỏ, viền vàng, bông vàng trên đỉnh, chấm xanh, sừng nhỏ
hat("it_head_lion", [
    P("M38 72 C 36 34 72 8 120 8 C 168 8 204 34 202 72 " + RIM.replace("40 72", "38 72"), fill="#D64545"),
    P("M38 72 C 56 57 86 49 120 49 C 154 49 184 57 202 72", stroke="#E8B23A", stroke_width=7, fill="none", stroke_linecap="round"),
    P("M60 44 C 80 32 100 28 120 28 C 140 28 160 32 180 44", stroke="#E8B23A", stroke_width=3, fill="none", opacity=0.8),
    C(84, 30, 8, fill="#3F9E63"), C(156, 30, 8, fill="#3F9E63"),
    P("M120 2 L 112 -8 L 128 -8 Z", fill="#E8B23A"),
    C(120, 12, 12, fill="#E8B23A"), C(116, 8, 4, fill="#FFFFFF", opacity=0.45),
])

# ── 2. KÍNH ĐEN: trong nhóm mặt (theo nghiêng / quay), tròng đủ to che cả mắt mở to.
SH = "#2A313B"
def lens(flip):
    f = (lambda x: 240 - x) if flip else (lambda x: x)
    d1 = f"M{f(54)} 73 C {f(54)} 68 {f(58)} 66 {f(64)} 66 L {f(100)} 66 C {f(106)} 66 {f(110)} 68 {f(110)} 73 " \
         f"L {f(108)} 104 C {f(107)} 116 {f(98)} 122 {f(84)} 122 C {f(68)} 122 {f(58)} 116 {f(56)} 104 Z"
    g1 = f"M{f(64)} 73 L {f(78)} 73 L {f(66)} 98 Z"
    return [P(d1, fill=SH), P(g1, fill="#FFFFFF", opacity=0.16)]
shades = G(lens(False) + lens(True) + [
    P("M108 74 C 114 67 126 67 132 74", stroke=SH, stroke_width=5, fill="none", stroke_linecap="round"),
    P("M55 72 L 42 77", stroke=SH, stroke_width=4, stroke_linecap="round"),
    P("M185 72 L 198 77", stroke=SH, stroke_width=4, stroke_linecap="round"),
], **{"if": "it_face_shades"})
faceshift['kids'].append(shades)

# ── Ô MẶT (còn lại): mọi món nằm trong nhóm mặt (theo đầu nghiêng / quay). Kính, khẩu
#    trang, râu… vẽ ĐÈ lên mặt; sơn tuồng và mặt nạ rồng vẽ DƯỚI mắt / mũi / miệng để
#    mắt Koa vẫn hiện (RN che mắt bằng hai vòng tròn). Toạ độ mặt: mắt (82|158, 96),
#    mắt mở to tới y 69…121, mũi 107…133 × 84…126, miệng 128…148, cằm 168.
def face_over(flag, kids): faceshift['kids'].append(G(kids, **{"if": flag}))
def face_under(flag, kids): faceshift['kids'].insert(0, G(kids, **{"if": flag}))
def temples(colour, w=4):
    return [P("M55 92 L 42 96", stroke=colour, stroke_width=w, stroke_linecap="round"),
            P("M185 92 L 198 96", stroke=colour, stroke_width=w, stroke_linecap="round")]

# kính bơi: tròng trong (thấy mắt), viền xanh dày, dây ra hai bên
face_over("it_face_goggles", temples("#2E8FCB", 6) + [
    C(82, 96, 27, fill="#8FD8F5", opacity=0.45), C(158, 96, 27, fill="#8FD8F5", opacity=0.45),
    C(82, 96, 27, fill="none", stroke="#2E8FCB", stroke_width=5), C(158, 96, 27, fill="none", stroke="#2E8FCB", stroke_width=5),
    P("M109 92 C 114 87 126 87 131 92", stroke="#2E8FCB", stroke_width=5, fill="none", stroke_linecap="round"),
    P("M66 86 C 70 78 78 75 86 75", stroke="#FFFFFF", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.7),
    P("M142 86 C 146 78 154 75 162 75", stroke="#FFFFFF", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.7),
])
# khẩu trang: che mũi + miệng, nếp gấp, quai vòng ra hai tai
face_over("it_face_mask", [
    P("M84 118 C 70 112 56 104 48 94", stroke="#A9B2BC", stroke_width=2.5, fill="none", stroke_linecap="round"),
    P("M156 118 C 170 112 184 104 192 94", stroke="#A9B2BC", stroke_width=2.5, fill="none", stroke_linecap="round"),
    P("M100 104 C 112 99 128 99 140 104 C 150 108 156 116 158 126 C 158 146 142 158 120 158 C 98 158 82 146 82 126 "
      "C 84 116 90 108 100 104 Z", fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P("M90 122 C 108 118 132 118 150 122 M88 134 C 108 130 132 130 152 134 M92 146 C 108 143 132 143 148 146",
      stroke="#A9B2BC", stroke_width=1.6, fill="none", opacity=0.8),
])
# bịt mắt cướp biển: miếng bịt mắt phải, dây chéo qua trán
face_over("it_face_eyepatch", [
    P("M44 78 C 78 62 118 56 140 72", stroke="#39424E", stroke_width=4, fill="none", stroke_linecap="round"),
    P("M180 84 C 188 90 194 98 198 106", stroke="#39424E", stroke_width=4, fill="none", stroke_linecap="round"),
    P("M136 78 C 146 69 172 69 182 80 C 187 98 180 117 162 123 C 146 125 135 113 133 96 C 133 88 134 82 136 78 Z", fill="#2A313B"),
    P("M144 82 C 150 77 160 76 168 79", stroke="#FFFFFF", stroke_width=2.4, fill="none", stroke_linecap="round", opacity=0.25),
])
# râu ông già: ria mép trên miệng, chòm râu ôm quanh miệng xuống dưới cằm (miệng vẫn hiện)
face_over("it_face_beard", [
    P("M70 122 C 70 160 92 188 120 188 C 148 188 170 160 170 122 C 162 140 150 150 140 152 C 134 156 128 158 120 158 "
      "C 112 158 106 156 100 152 C 90 150 78 140 70 122 Z", fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P("M86 160 C 90 166 96 168 100 166 M110 172 C 114 178 122 178 126 174 M138 164 C 142 168 148 166 152 160",
      stroke="#A9B2BC", stroke_width=1.6, fill="none", stroke_linecap="round", opacity=0.8),
    P("M120 129 C 110 120 94 120 87 131 C 97 128 108 133 120 135 C 132 133 143 128 153 131 C 146 120 130 120 120 129 Z",
      fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.4),
])
# sơn mặt tuồng: mảng đỏ nửa trên mặt, mày trắng, hoạ tiết vàng trên trán — DƯỚI mắt
face_under("it_face_tuong", [
    P("M50 80 C 66 58 174 58 190 80 C 192 104 182 124 162 128 C 146 130 134 120 120 120 C 106 120 94 130 78 128 "
      "C 58 124 48 104 50 80 Z", fill="#D64545", opacity=0.92),
    P("M58 74 C 72 62 94 62 104 72 C 92 69 74 70 58 80 Z", fill="#FFFFFF"),
    P("M182 74 C 168 62 146 62 136 72 C 148 69 166 70 182 80 Z", fill="#FFFFFF"),
    P("M106 64 L 120 50 L 134 64", stroke="#E8B23A", stroke_width=3.5, fill="none", stroke_linejoin="round"),
    C(120, 66, 4, fill="#E8B23A"),
    P("M50 80 C 66 58 174 58 190 80", stroke="#20242A", stroke_width=2, fill="none", opacity=0.5),
])
# kính thực tế ảo: hộp kính che kín mắt, quai trên đỉnh đầu và hai bên
face_over("it_face_vr", [
    P("M104 68 C 102 44 138 44 136 68", stroke="#39424E", stroke_width=6, fill="none", stroke_linecap="round"),
    P("M52 96 L 40 98 M188 96 L 200 98", stroke="#39424E", stroke_width=6, stroke_linecap="round"),
    R(50, 66, 140, 60, 20, fill="#2A313B"),
    R(60, 76, 120, 40, 14, fill="#4A5A72"),
    P("M68 84 C 90 78 120 78 140 82", stroke="#FFFFFF", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.25),
    C(178, 74, 4, fill="#3FA9E5"),
])
# miếng dán mũi: ngang sống mũi, có lỗ thoáng
face_over("it_face_nosestrip", [
    R(99, 97, 42, 12, 6, fill="#F4F6F8", stroke="#8A94A1", stroke_width=1.4),
    C(108, 103, 1.3, fill="#A9B2BC"), C(132, 103, 1.3, fill="#A9B2BC"),
])
# kính trái tim: tròng hình tim đủ to che mắt, gọng và càng như kính đen
def heart(cx, cy=96):
    return (f"M{cx-27} {cy-8} C {cx-27} {cy-25} {cx-6} {cy-30} {cx} {cy-14} C {cx+6} {cy-30} {cx+27} {cy-25} {cx+27} {cy-8} "
            f"C {cx+27} {cy+11} {cx+9} {cy+22} {cx} {cy+29} C {cx-9} {cy+22} {cx-27} {cy+11} {cx-27} {cy-8} Z")
face_over("it_face_heart", temples("#C94A62") + [
    P(heart(82), fill="#E8657B", stroke="#C94A62", stroke_width=2.5),
    P(heart(158), fill="#E8657B", stroke="#C94A62", stroke_width=2.5),
    P("M107 88 C 113 83 127 83 133 88", stroke="#C94A62", stroke_width=4, fill="none", stroke_linecap="round"),
    P("M66 84 C 68 78 74 75 79 76", stroke="#FFFFFF", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.5),
    P("M142 84 C 144 78 150 75 155 76", stroke="#FFFFFF", stroke_width=3, fill="none", stroke_linecap="round", opacity=0.5),
])
# mặt nạ rồng: mảng vàng nửa trên mặt, viền mắt đỏ, sừng xanh, râu rồng — DƯỚI mắt
face_under("it_face_dragon", [
    P("M64 64 L 50 40 M176 64 L 190 40", stroke="#3F9E63", stroke_width=7, stroke_linecap="round"),
    P("M60 122 C 44 126 36 136 34 148 M180 122 C 196 126 204 136 206 148", stroke="#D64545", stroke_width=4,
      fill="none", stroke_linecap="round"),
    P("M48 78 C 70 56 170 56 192 78 C 194 106 180 128 158 132 C 140 134 132 126 120 126 C 108 126 100 134 82 132 "
      "C 60 128 46 106 48 78 Z", fill="#E8B23A"),
    E(82, 96, 23, 28, fill="none", stroke="#D64545", stroke_width=5),
    E(158, 96, 23, 28, fill="none", stroke="#D64545", stroke_width=5),
    C(104, 68, 3, fill="#3F9E63"), C(120, 64, 3, fill="#3F9E63"), C(136, 68, 3, fill="#3F9E63"),
])

# ── 3. ÁO THUN: thân + tay áo VẼ SAU tay (cũ: tay che mất tay áo), tay áo theo từng tư thế.
TEE, TEED = "#F4F6F8", "#A9B2BC"
tee_body = G([
    P("M80 164 C 70 178 66 194 66 212 C 65 230 68 244 72 252 C 94 262 146 262 168 252 C 172 244 175 230 174 212 "
      "C 174 194 170 178 160 164 C 150 178 136 184 120 184 C 104 184 90 178 80 164 Z", fill=TEE, stroke=TEED, stroke_width=1.6),
    P("M74 246 C 96 255 144 255 166 246", stroke=TEED, stroke_width=1.6, fill="none", opacity=0.7),
    C(120, 218, 12, fill="#3FA9E5"),
    P("M114 214 C 116 210 124 210 126 214 C 126 220 120 224 120 224 C 120 224 114 220 114 214 Z", fill="#FFFFFF", opacity=0.9),
], **{"if": "it_top_tee"})
ti = [i for i, k in enumerate(body['kids']) if k.get('if') == 'it_top_tee'][0]
body['kids'].insert(ti + 1, tee_body)
def sleeve_stroke(dd, w=31):
    return [P(dd, stroke=TEED, stroke_width=w + 3, stroke_linecap="round", fill="none"),
            P(dd, stroke=TEE, stroke_width=w, stroke_linecap="round", fill="none"),
            P(dd, stroke=TEED, stroke_width=1.4, fill="none", opacity=0)]
# tay đứng yên (path tay to, không phải nét): tay áo là mảnh phủ phần vai
sl_idle_L = P("M69 168 C 58 177 50 189 46 201 C 56 209 70 212 80 208 C 85 199 90 192 92 186 C 90 172 80 163 69 168 Z",
              fill=TEE, stroke=TEED, stroke_width=1.6)
sl_idle_R = P("M171 168 C 182 177 190 189 194 201 C 184 209 170 212 160 208 C 155 199 150 192 148 186 C 150 172 160 163 171 168 Z",
              fill=TEE, stroke=TEED, stroke_width=1.6)
body['kids'].append(G([G([
    G([sl_idle_L], anim={"k": "koaArmL", "dur": 3600, "delay": 0, "ease": "io"}, o=[80, 178]),
    G([sl_idle_R], anim={"k": "koaArmR", "dur": 3600, "delay": 0, "ease": "io"}, o=[160, 178]),
], **{"if": "armsIdle"})], **{"if": "it_top_tee"}))
# tập tạ / ngồi / giãn cơ: tay là nét 26pt → tay áo là đoạn đầu của cùng nét, rộng hơn
lift = outer('poseLift')[0]
la, lb = lift['kids'][0], lift['kids'][1]
for grp, dd in ((la, "M84 184 C 79 188 75 193 72 199"), (lb, "M156 184 C 161 188 165 193 168 199")):
    grp['kids'].insert(2, G(sleeve_stroke(dd), **{"if": "it_top_tee"}))
relax = outer('poseRelax')[0]['kids'][0]
relax['kids'].insert(2, G(sleeve_stroke("M76 182 C 71 189 67 196 65 204"), **{"if": "it_top_tee"}))
relax['kids'].append(G(sleeve_stroke("M164 182 C 169 189 173 196 175 204"), **{"if": "it_top_tee"}))
st = outer('poseStretch')
st_right = st[0]; st_left = st[1]['kids'][0]
st_right['kids'].insert(2, G(sleeve_stroke("M156 184 C 162 188 166 193 168 199"), tf=[["t", 20, -10]], **{"if": "it_top_tee"}))
st_left['kids'].insert(2, G(sleeve_stroke("M84 182 C 78 179 74 174 71 168"), **{"if": "it_top_tee"}))
run_arms = outer('poseRun')[0]['kids'][0]
run_arms['kids'].append(G([
    G([sl_idle_L], bind="armLeftTurn", anim={"k": "koaRunArm18", "dur": 18000, "delay": 0, "ease": "lin"}, o=[80, 178]),
    G([sl_idle_R], anim={"k": "koaRunArm18", "dur": 18000, "delay": 0, "ease": "lin"}, o=[160, 178]),
], **{"if": "it_top_tee"}))

# ── Ô ÁO (còn lại): thân áo như RN (đã đúng chỗ), thêm tay áo theo từng tư thế — tay
#    áo RN nằm dưới cánh tay nên mất. Ba kiểu: "short" (cộc), "long" (tới cổ tay, chừa
#    bàn tay), "pad" (giáp vai). `body` chèn ngay sau nhóm RN của món.
TORSO_FLAGS = {}
def top_body(flag, kids):
    i = [j for j, k in enumerate(body['kids']) if k.get('if') == 'it_top_tee'][0]
    body['kids'].insert(i + 1, G(kids, **{"if": flag}))

LONG_IDLE_L = "M69 168 C 54 184 44 202 40 220 C 48 228 62 231 71 226 C 77 214 84 202 92 190 C 90 172 80 163 69 168 Z"
LONG_IDLE_R = "M171 168 C 186 184 196 202 200 220 C 192 228 178 231 169 226 C 163 214 156 202 148 190 C 150 172 160 163 171 168 Z"
CUFF_IDLE_L = "M41 219 C 49 226 62 229 71 225"
CUFF_IDLE_R = "M199 219 C 191 226 178 229 169 225"
PAD_IDLE_L = "M62 168 C 70 158 88 158 94 172 C 94 182 88 188 80 190 C 70 190 60 184 62 168 Z"
PAD_IDLE_R = "M178 168 C 170 158 152 158 146 172 C 146 182 152 188 160 190 C 170 190 180 184 178 168 Z"
# Tay dạng nét (tập tạ / ngồi / giãn cơ): đoạn đầu (cộc) và gần hết cánh tay (dài).
STROKE = {
    "liftL": ("M84 184 C 79 188 75 193 72 199", "M84 184 C 72 194 68 204 69 212"),
    "liftR": ("M156 184 C 161 188 165 193 168 199", "M156 184 C 168 194 172 204 171 212"),
    "relaxL": ("M76 182 C 71 189 67 196 65 204", "M76 182 C 62 202 64 226 80 244"),
    "relaxR": ("M164 182 C 169 189 173 196 175 204", "M164 182 C 178 202 176 226 160 244"),
    "stretchR": ("M156 184 C 162 188 166 193 168 199", "M156 184 C 168 194 172 204 170 212"),
    "stretchL": ("M84 182 C 78 179 74 174 71 168", "M84 182 C 68 172 62 156 68 144"),
}

def sleeves(flag, kind, fill, edge, cuff=None):
    def stroke_sleeve(key):
        short, long = STROKE[key]
        if kind == "pad":
            x, y = (short.split()[0][1:], short.split()[1])
            return [E(float(x), float(y) + 2, 17, 13, fill=fill, stroke=edge, stroke_width=1.6)]
        d = short if kind == "short" else long
        out = [P(d, stroke=edge, stroke_width=34, stroke_linecap="round", fill="none"),
               P(d, stroke=fill, stroke_width=31, stroke_linecap="round", fill="none")]
        return out  # tay dạng nét: không bo tay — chấm tròn ở cổ tay trông như quả bóng
    def idle_sleeve(side):
        if kind == "short":
            return [P(sl_idle_L["a"]["d"] if side == "L" else sl_idle_R["a"]["d"], fill=fill, stroke=edge, stroke_width=1.6)]
        if kind == "long":
            out = [P(LONG_IDLE_L if side == "L" else LONG_IDLE_R, fill=fill, stroke=edge, stroke_width=1.6)]
            if cuff:
                out.append(P(CUFF_IDLE_L if side == "L" else CUFF_IDLE_R, stroke=cuff, stroke_width=6, fill="none",
                             stroke_linecap="round"))
            return out
        return [P(PAD_IDLE_L if side == "L" else PAD_IDLE_R, fill=fill, stroke=edge, stroke_width=1.6)]
    tag = {"if": flag}
    body['kids'].append(G([G([
        G(idle_sleeve("L"), anim={"k": "koaArmL", "dur": 3600, "delay": 0, "ease": "io"}, o=[80, 178]),
        G(idle_sleeve("R"), anim={"k": "koaArmR", "dur": 3600, "delay": 0, "ease": "io"}, o=[160, 178]),
    ], **{"if": "armsIdle"})], **tag))
    # dài: vẽ SAU bàn tay (circle) thì che bàn tay — chèn trước nó (index 2) như tee
    la['kids'].insert(2, G(stroke_sleeve("liftL"), **tag))
    lb['kids'].insert(2, G(stroke_sleeve("liftR"), **tag))
    relax['kids'].insert(2, G(stroke_sleeve("relaxL"), **tag))
    relax['kids'].insert(len(relax['kids']) - 1, G(stroke_sleeve("relaxR"), **tag))
    st_right['kids'].insert(2, G(stroke_sleeve("stretchR"), tf=[["t", 20, -10]], **tag))
    st_left['kids'].insert(2, G(stroke_sleeve("stretchL"), **tag))
    run_arms['kids'].append(G([
        G(idle_sleeve("L"), bind="armLeftTurn", anim={"k": "koaRunArm18", "dur": 18000, "delay": 0, "ease": "lin"}, o=[80, 178]),
        G(idle_sleeve("R"), anim={"k": "koaRunArm18", "dur": 18000, "delay": 0, "ease": "lin"}, o=[160, 178]),
    ], **tag))

NECK = "C 148 184 136 190 120 190 C 104 190 92 184 84 168 Z"
SHIRT = "M84 168 C 74 178 70 192 69 208 C 68 226 70 240 74 250 C 94 259 146 259 166 250 C 170 240 172 226 171 208 C 170 192 166 178 156 168 " + NECK
# áo ba lỗ: không tay (đúng kiểu), thêm viền nách / cổ trắng
top_body("it_top_tank", [
    P(SHIRT, fill="#3FA9E5"),
    P("M84 168 C 92 184 104 190 120 190 C 136 190 148 184 156 168", stroke="#FFFFFF", stroke_width=3, fill="none", opacity=0.9),
    P("M74 250 C 94 259 146 259 166 250", stroke="#2E8FCB", stroke_width=3, fill="none"),
])
# hoodie: mũ trùm gập sau cổ, túi kangaroo, dây rút, tay dài có bo
top_body("it_top_hoodie", [
    P(SHIRT, fill="#8A94A1"),
    P("M76 170 C 82 154 100 148 120 148 C 140 148 158 154 164 170 C 152 184 136 190 120 190 C 104 190 88 184 76 170 Z", fill="#6E7885"),
    P("M92 226 C 104 220 136 220 148 226 L 152 248 C 132 254 108 254 88 248 Z", fill="#7B8592", stroke="#6E7885", stroke_width=1.6),
    P("M112 190 L 112 214 M128 190 L 128 214", stroke="#F4F6F8", stroke_width=3, stroke_linecap="round"),
    P("M74 250 C 94 259 146 259 166 250", stroke="#6E7885", stroke_width=5, fill="none", stroke_linecap="round"),
])
sleeves("it_top_hoodie", "long", "#8A94A1", "#6E7885", cuff="#6E7885")
# áo len Noel: thân đỏ, dải trắng, cây thông; tay dài bo trắng
top_body("it_top_xmas", [
    P(SHIRT, fill="#D64545"),
    P("M70 208 C 96 214 144 214 170 208", stroke="#F4F6F8", stroke_width=7, fill="none"),
    P("M120 220 L 108 242 L 132 242 Z", fill="#3F9E63"), R(117, 242, 6, 5, 1, fill="#8A6A3B"), C(120, 218, 4, fill="#E8B23A"),
    P("M74 250 C 94 259 146 259 166 250", stroke="#F4F6F8", stroke_width=5, fill="none", stroke_linecap="round"),
])
sleeves("it_top_xmas", "long", "#D64545", "#B23636", cuff="#F4F6F8")
# áo dài: thân dài xẻ tà, cổ đứng đỏ, hoa văn; tay dài
top_body("it_top_aodai", [
    P("M84 166 C 72 180 68 198 68 216 C 68 240 72 256 78 270 C 98 278 116 276 118 270 L 122 270 C 124 276 142 278 162 270 "
      "C 168 256 172 240 172 216 C 172 198 168 180 156 166 C 148 184 134 190 120 190 C 106 190 92 184 84 166 Z", fill="#E8B23A"),
    P("M108 178 C 110 186 130 186 132 178 L 132 190 C 128 194 112 194 108 190 Z", fill="#D64545"),
    P("M120 192 C 128 206 132 222 136 238", stroke="#D64545", stroke_width=3, fill="none", stroke_linecap="round"),
    C(98, 214, 6, fill="#D64545", opacity=0.85), C(146, 232, 5, fill="#D64545", opacity=0.85), C(104, 246, 4, fill="#D64545", opacity=0.85),
])
sleeves("it_top_aodai", "long", "#E8B23A", "#C9952C")
# áo ma: tấm vải trùm, gấu lượn sóng, hai mắt đen — trùm cả vai
top_body("it_top_ghost", [
    P("M74 162 C 58 178 54 202 54 226 C 54 246 60 260 66 270 C 78 262 90 272 104 266 C 114 274 126 274 136 266 "
      "C 150 272 162 262 174 270 C 180 260 186 246 186 226 C 186 202 182 178 166 162 C 152 184 136 192 120 192 "
      "C 104 192 88 184 74 162 Z", fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.8),
    E(106, 214, 6, 8, fill="#39424E"), E(134, 214, 6, 8, fill="#39424E"),
    P("M112 236 C 116 232 124 232 128 236", stroke="#39424E", stroke_width=3, fill="none", stroke_linecap="round"),
])
sleeves("it_top_ghost", "long", "#F4F6F8", "#A9B2BC")
# áo gió: khoá kéo giữa, sọc trắng ngang ngực và tay, tay dài
top_body("it_top_windbreak", [
    P(SHIRT, fill="#3F9E63"),
    P("M120 190 L 120 256", stroke="#2F7A4C", stroke_width=4), R(116, 192, 8, 10, 2, fill="#E8B23A"),
    P("M70 222 C 96 228 144 228 170 222", stroke="#FFFFFF", stroke_width=5, fill="none", opacity=0.9),
    P("M84 168 C 92 184 104 190 120 190 C 136 190 148 184 156 168", stroke="#2F7A4C", stroke_width=5, fill="none"),
])
sleeves("it_top_windbreak", "long", "#3F9E63", "#2F7A4C", cuff="#2F7A4C")
# áo thi đấu: không tay (áo bóng rổ), viền vàng, số 1
top_body("it_top_jersey", [
    P(SHIRT, fill="#7A5BC4"),
    P("M84 168 C 92 184 104 190 120 190 C 136 190 148 184 156 168", stroke="#E8B23A", stroke_width=4, fill="none"),
    P("M114 210 L 122 202 L 122 240 M114 240 L 130 240", stroke="#F4F6F8", stroke_width=6, fill="none",
      stroke_linecap="round", stroke_linejoin="round"),
    P("M74 250 C 94 259 146 259 166 250", stroke="#E8B23A", stroke_width=3, fill="none"),
])
# áo lân: đỏ, dải vàng và xanh, tay cộc viền vàng
top_body("it_top_lion", [
    P(SHIRT, fill="#D64545"),
    P("M68 206 C 96 198 144 198 172 206", stroke="#E8B23A", stroke_width=6, fill="none"),
    P("M70 232 C 98 224 142 224 170 232", stroke="#3F9E63", stroke_width=5, fill="none"),
    C(120, 218, 9, fill="#E8B23A"),
])
sleeves("it_top_lion", "short", "#D64545", "#E8B23A")
# giáp: tấm ngực kim loại, huy hiệu vàng, giáp vai
top_body("it_top_armor", [
    P(SHIRT, fill="#4A5A72"),
    P("M120 194 L 98 214 L 120 236 L 142 214 Z", fill="#E8B23A"),
    P("M120 202 L 106 214 L 120 228 L 134 214 Z", fill="#F2C95A"),
    P("M76 244 C 96 252 144 252 164 244", stroke="#6E7E96", stroke_width=4, fill="none"),
])
sleeves("it_top_armor", "pad", "#6E7E96", "#39424E")

# ── 4. QUẦN ĐÙI: có cạp, hai ống quanh đùi; khi ngồi thì phủ lên đùi.
SHO, SHOD = "#2E8FCB", "#1F6FA3"
shorts = G([
    P("M68 234 C 92 245 148 245 172 234 C 176 250 173 264 166 273 C 154 280 136 280 126 274 C 124 268 122 264 120 264 "
      "C 118 264 116 268 114 274 C 104 280 86 280 74 273 C 67 264 64 250 68 234 Z", fill=SHO),
    P("M68 236 C 92 247 148 247 172 236", stroke=SHOD, stroke_width=6, fill="none", stroke_linecap="round"),
    P("M74 248 L 78 271", stroke="#FFFFFF", stroke_width=3, stroke_linecap="round", opacity=0.85),
    P("M166 248 L 162 271", stroke="#FFFFFF", stroke_width=3, stroke_linecap="round", opacity=0.85),
    P("M120 246 L 120 262", stroke=SHOD, stroke_width=1.6, opacity=0.6),
], **{"if": "it_bottom_short"})
bi = [i for i, k in enumerate(body['kids']) if k.get('if') == 'it_bottom_short'][0]
body['kids'].insert(bi + 1, shorts)
sit = outer('legsSit')[0]
sit['kids'].insert(1, G([
    P("M64 266 C 84 250 156 250 176 266 C 179 272 177 277 172 279 C 150 270 90 270 68 279 C 63 277 61 272 64 266 Z", fill=SHO),
    P("M68 279 C 90 270 150 270 172 279", stroke=SHOD, stroke_width=2, fill="none", opacity=0.7),
], **{"if": "it_bottom_short"}))

# ── Ô QUẦN (còn lại). Quần dài = phần hông (sau thân) + hai ống quần vẽ đè lên chân
#    (đứng: ngay sau nhóm chân, trước giày; chạy: trong từng nhóm chân có hoạt ảnh) +
#    phủ đùi khi ngồi. Quần ngắn dùng lại dáng quần đùi. RN: một khối đứng yên, chạy
#    không theo bước, ngồi thì mất.
# đứng: cả quần (hông + hai ống tới mắt cá) vẽ SAU thân; chạy: hông sau thân + hai ống
# trong nhóm chân có hoạt ảnh (ống lộ dưới thân và theo bước chân).
FULL = ("M68 234 C 92 245 148 245 172 234 C 175 254 172 274 168 290 C 156 294 138 294 128 290 C 126 278 124 270 120 270 "
        "C 116 270 114 278 112 290 C 102 294 84 294 72 290 C 68 274 65 254 68 234 Z")
HIP = ("M68 234 C 92 245 148 245 172 234 C 175 250 172 264 168 274 L 72 274 C 68 264 65 250 68 234 Z")
def pant_leg(flip):
    f = (lambda x: 240 - x) if flip else (lambda x: x)
    return (f"M{f(104)} 250 C {f(115)} 253 {f(118)} 266 {f(118)} 289 C {f(108)} 293 {f(86)} 293 {f(73)} 289 "
            f"C {f(71)} 268 {f(74)} 258 {f(79)} 254 C {f(86)} 250 {f(96)} 249 {f(104)} 250 Z")
def cuffs(colour):
    return [P("M73 287 C 86 291 104 291 112 288", stroke=colour, stroke_width=5, fill="none", stroke_linecap="round"),
            P("M167 287 C 154 291 136 291 128 288", stroke=colour, stroke_width=5, fill="none", stroke_linecap="round")]
def cuff1(flip, colour):
    f = (lambda x: 240 - x) if flip else (lambda x: x)
    return P(f"M{f(74)} 287 C {f(86)} 291 {f(106)} 291 {f(117)} 287", stroke=colour, stroke_width=5, fill="none", stroke_linecap="round")
SIT = "M66 268 C 84 252 156 252 174 268 C 182 278 176 290 160 292 C 132 296 108 296 80 292 C 64 290 58 278 66 268 Z"
run_legs = [k for k in body['kids'] if k.get('if') == 'poseRun'][0]['kids']
def pants(flag, fill, edge, hip_extra=(), leg_extra=lambda flip: [], sit_extra=(), cuff_colour=None, opacity=1):
    tag = {"if": flag}
    def leg(flip):
        out = [P(pant_leg(flip), fill=fill, opacity=opacity)]
        if cuff_colour: out.append(cuff1(flip, cuff_colour))
        return out + leg_extra(flip)
    run_legs[0]['kids'].append(G(leg(False), **tag))
    run_legs[1]['kids'].append(G(leg(True), **tag))
    j = [k for k, n in enumerate(body['kids']) if n.get('if') == 'it_bottom_short'][0]
    stand = [P(FULL, fill=fill, opacity=opacity),
             P("M120 248 L 120 268", stroke=edge, stroke_width=1.6, opacity=0.6)]
    stand += cuffs(cuff_colour) if cuff_colour else []
    stand += leg_extra(False) + leg_extra(True)
    body['kids'].insert(j + 1, G([
        G(stand, **{"if": "legsStand"}),
        G([P(HIP, fill=fill, opacity=opacity)], **{"if": "poseRun"}),
        G(list(hip_extra)),
    ], **tag))
    sit['kids'].insert(1, G([P(SIT, fill=fill, opacity=opacity),
                             P("M74 272 C 96 288 144 288 166 272", stroke=edge, stroke_width=2.6, fill="none", opacity=0.6)]
                            + list(sit_extra), **tag))

pants("it_bottom_legging", "#39424E", "#2A313B",
      hip_extra=[P("M68 236 C 92 247 148 247 172 236", stroke="#4A5563", stroke_width=5, fill="none", stroke_linecap="round")])
pants("it_bottom_jogger", "#8A94A1", "#6E7885", cuff_colour="#6E7885",
      hip_extra=[P("M68 236 C 92 247 148 247 172 236", stroke="#6E7885", stroke_width=6, fill="none", stroke_linecap="round"),
                 P("M112 246 C 112 252 110 256 108 258 M128 246 C 128 252 130 256 132 258", stroke="#F4F6F8", stroke_width=2,
                   fill="none", stroke_linecap="round")],
      leg_extra=lambda flip: [P(f"M{240 - 76 if flip else 76} 256 L {240 - 76 if flip else 76} 278", stroke="#F4F6F8",
                                stroke_width=3, stroke_linecap="round")])
pants("it_bottom_tetpants", "#E8B23A", "#C9952C", cuff_colour="#D64545",
      hip_extra=[P("M68 236 C 92 247 148 247 172 236", stroke="#D64545", stroke_width=5, fill="none", stroke_linecap="round"),
                 C(96, 254, 3, fill="#D64545"), C(144, 254, 3, fill="#D64545")])
pants("it_bottom_camo", "#6E7A55", "#55603F",
      hip_extra=[C(90, 252, 7, fill="#55603F"), C(150, 256, 6, fill="#8A9670"), C(124, 244, 5, fill="#55603F")],
      leg_extra=lambda flip: [C(240 - 92 if flip else 92, 264, 6, fill="#55603F"), C(240 - 104 if flip else 104, 276, 5, fill="#8A9670")],
      sit_extra=[C(92, 264, 7, fill="#55603F"), C(140, 270, 6, fill="#8A9670"), C(118, 262, 5, fill="#55603F")])
pants("it_bottom_ghostpants", "#7A5BC4", "#5B41A0", opacity=0.92,
      leg_extra=lambda flip: [P(("M{0} 280 C {1} 286 {2} 286 {3} 280 C {4} 286 {5} 286 {6} 280").format(
          *[str(240 - x if flip else x) for x in (74, 78, 84, 88, 94, 100, 106)]), stroke="#B9A6F0", stroke_width=2.5, fill="none")])
pants("it_bottom_flame", "#E8842A", "#C46A1C",
      leg_extra=lambda flip: [P(("M{0} 282 C {1} 272 {0} 266 {2} 258 C {3} 266 {4} 272 {5} 282 Z").format(
          *[str(240 - x if flip else x) for x in (86, 82, 92, 96, 100, 98)]), fill="#E8B23A"),
          P(("M{0} 282 C {1} 276 {0} 272 {2} 266 C {3} 272 {4} 276 {5} 282 Z").format(
          *[str(240 - x if flip else x) for x in (102, 100, 106, 110, 112, 110)]), fill="#D64545", opacity=0.85)])

# quần ngắn: dáng quần đùi (đã vẽ ở trên) đổi màu / viền
SHORTS = shorts['kids'][0]['a']['d']
def short_like(flag, fill, band, extra=(), sit_extra=()):
    j = [k for k, n in enumerate(body['kids']) if n.get('if') == 'it_bottom_short'][0]
    body['kids'].insert(j + 1, G([P(SHORTS, fill=fill),
        P("M68 236 C 92 247 148 247 172 236", stroke=band, stroke_width=6, fill="none", stroke_linecap="round")] + list(extra),
        **{"if": flag}))
    sit['kids'].insert(1, G([
        P("M64 266 C 84 250 156 250 176 266 C 179 272 177 277 172 279 C 150 270 90 270 68 279 C 63 277 61 272 64 266 Z", fill=fill)]
        + list(sit_extra), **{"if": flag}))
# quần Noel: đỏ, gấu lông trắng
short_like("it_bottom_xmaspants", "#D64545", "#B23636",
           extra=[P("M74 271 C 86 278 106 278 114 272 M126 272 C 134 278 154 278 166 271", stroke="#F4F6F8", stroke_width=6,
                    fill="none", stroke_linecap="round")],
           sit_extra=[P("M68 277 C 90 268 150 268 172 277", stroke="#F4F6F8", stroke_width=5, fill="none", stroke_linecap="round")])
# quần bơi: cam, sọc trắng, dây rút
short_like("it_bottom_swim", "#E8842A", "#C46A1C",
           extra=[P("M72 254 C 96 262 144 262 168 254", stroke="#F4F6F8", stroke_width=4, fill="none"),
                  P("M116 242 C 114 250 112 254 110 256 M124 242 C 126 250 128 254 130 256", stroke="#F4F6F8", stroke_width=2,
                    fill="none", stroke_linecap="round")])
# váy tutu: xoè từ eo, hai lớp bèo; ngồi thì xoè trên đùi
j = [k for k, n in enumerate(body['kids']) if n.get('if') == 'it_bottom_short'][0]
body['kids'].insert(j + 1, G([
    P("M70 236 C 92 246 148 246 170 236 C 182 246 192 258 194 268 C 178 276 160 272 150 276 C 138 270 128 278 120 272 "
      "C 112 278 102 270 90 276 C 80 272 62 276 46 268 C 48 258 58 246 70 236 Z", fill="#E8657B"),
    P("M56 262 C 66 270 78 268 90 272 C 102 266 112 274 120 268 C 128 274 138 266 150 272 C 162 268 174 270 184 262",
      stroke="#F5A0B0", stroke_width=4, fill="none", stroke_linecap="round"),
    P("M70 236 C 92 246 148 246 170 236", stroke="#C94A62", stroke_width=6, fill="none", stroke_linecap="round"),
], **{"if": "it_bottom_tutu"}))
sit['kids'].insert(1, G([
    P("M56 268 C 74 248 166 248 184 268 C 190 278 180 284 168 280 C 150 286 90 286 72 280 C 60 284 50 278 56 268 Z", fill="#E8657B"),
    P("M62 272 C 90 264 150 264 178 272", stroke="#F5A0B0", stroke_width=4, fill="none", stroke_linecap="round"),
], **{"if": "it_bottom_tutu"}))

# ── 5. GIÀY SNEAKER: to hơn, có đế, dây, sọc màu — đọc được ở cỡ 76pt.
def sneaker(flip):
    f = (lambda x: 240 - x) if flip else (lambda x: x)
    return [
        P(f"M{f(70)} 290 C {f(70)} 274 {f(80)} 264 {f(96)} 264 C {f(112)} 264 {f(122)} 274 {f(123)} 288 L {f(123)} 292 L {f(70)} 292 Z",
          fill="#FFFFFF", stroke=OUT, stroke_width=1.6),
        P(f"M{f(70)} 290 C {f(70)} 282 {f(74)} 277 {f(80)} 276 C {f(84)} 282 {f(84)} 288 {f(82)} 292 L {f(70)} 292 Z", fill="#3FA9E5"),
        P(f"M{f(123)} 290 C {f(123)} 282 {f(119)} 277 {f(113)} 276 C {f(109)} 282 {f(109)} 288 {f(111)} 292 L {f(123)} 292 Z", fill="#3FA9E5"),
        P(f"M{f(68)} 291 C {f(68)} 288 {f(70)} 287 {f(74)} 287 L {f(120)} 287 C {f(123)} 287 {f(124)} 289 {f(124)} 292 "
          f"C {f(124)} 297 {f(120)} 300 {f(114)} 300 L {f(76)} 300 C {f(70)} 300 {f(68)} 296 {f(68)} 291 Z", fill="#5B6573"),
        P(f"M{f(84)} 285 C {f(92)} 281 {f(102)} 281 {f(110)} 285", stroke="#3FA9E5", stroke_width=3.5, fill="none", stroke_linecap="round"),
        P(f"M{f(88)} 270 L {f(104)} 270 M{f(87)} 275 L {f(105)} 275", stroke=OUT, stroke_width=1.6, stroke_linecap="round"),
    ]
for g in body['kids']:
    if g['t'] == 'g' and g.get('animBind') in ('shoeAnimL', 'shoeAnimR'):
        g['kids'].append(G(sneaker(False) + sneaker(True), **{"if": "it_shoes_sneaker"}))
sit['kids'].append(G([
    E(92, 284, 17, 10, fill="#5B6573"), E(92, 283, 13, 7, fill="#FFFFFF"), E(92, 283, 7, 3.5, fill="#3FA9E5", opacity=0.8),
    E(148, 284, 17, 10, fill="#5B6573"), E(148, 283, 13, 7, fill="#FFFFFF"), E(148, 283, 7, 3.5, fill="#3FA9E5", opacity=0.8),
], **{"if": "it_shoes_sneaker"}))

# ── Ô GIÀY (còn lại): cùng khung với sneaker mới (mũ giày, đế, mặt trên có chi tiết),
#    mỗi chiếc nằm trong nhóm giày có hoạt ảnh (theo bước chạy) + hai đế khi ngồi.
def shoe_pair(flag, one, sit_one):
    for g in body['kids']:
        if g['t'] == 'g' and g.get('animBind') in ('shoeAnimL', 'shoeAnimR'):
            g['kids'].append(G(one(False) + one(True), **{"if": flag}))
    sit['kids'].append(G(sit_one(92) + sit_one(148), **{"if": flag}))
def F(flip): return (lambda x: 240 - x) if flip else (lambda x: x)
def upper(flip, top=264, colour="#FFFFFF", edge=OUT):
    f = F(flip)
    return P(f"M{f(70)} 290 C {f(70)} {top + 10} {f(80)} {top} {f(96)} {top} C {f(112)} {top} {f(122)} {top + 10} {f(123)} 288 "
             f"L {f(123)} 292 L {f(70)} 292 Z", fill=colour, stroke=edge, stroke_width=1.6)
def sole(flip, colour="#5B6573"):
    f = F(flip)
    return P(f"M{f(68)} 291 C {f(68)} 288 {f(70)} 287 {f(74)} 287 L {f(120)} 287 C {f(123)} 287 {f(124)} 289 {f(124)} 292 "
             f"C {f(124)} 297 {f(120)} 300 {f(114)} 300 L {f(76)} 300 C {f(70)} 300 {f(68)} 296 {f(68)} 291 Z", fill=colour)
def sit_sole(colour, inner, accent=None):
    def one(cx):
        out = [E(cx, 284, 17, 10, fill=colour), E(cx, 283, 13, 7, fill=inner)]
        if accent: out.append(E(cx, 283, 7, 3.5, fill=accent, opacity=0.85))
        return out
    return one

# giày chạy bộ: xanh, đế trắng dày, vạch phản quang
shoe_pair("it_shoes_runner", lambda flip: [
    upper(flip, colour="#3FA9E5", edge="#2A86BC"), sole(flip, "#F4F6F8"),
    P(("M{0} 284 C {1} 280 {2} 280 {3} 284").format(*[F(flip)(x) for x in (78, 90, 104, 118)]), stroke="#F4F6F8", stroke_width=3.5,
      fill="none", stroke_linecap="round"),
    P(("M{0} 272 L {1} 276").format(*[F(flip)(x) for x in (90, 104)]), stroke="#E8B23A", stroke_width=3, stroke_linecap="round"),
], sit_sole("#F4F6F8", "#3FA9E5"))
# bốt da: cổ cao tới bắp chân, đế sẫm, dây buộc
shoe_pair("it_shoes_boot", lambda flip: [
    P(("M{0} 290 L {0} 262 C {0} 256 {1} 254 {2} 254 L {3} 254 C {4} 254 {5} 258 {5} 266 C {6} 274 {7} 280 {7} 288 "
       "L {7} 292 L {0} 292 Z").format(*[F(flip)(x) for x in (72, 76, 82, 108, 114, 116, 122, 124)]), fill="#6B4A2E"),
    sole(flip, "#4A3220"),
    P(("M{0} 262 L {1} 266 M{0} 270 L {1} 274 M{0} 278 L {1} 282").format(*[F(flip)(x) for x in (98, 108)]),
      stroke="#C9A06A", stroke_width=2, stroke_linecap="round"),
], sit_sole("#4A3220", "#6B4A2E"))
# bốt Noel: đỏ, cổ lông trắng
shoe_pair("it_shoes_xmasboot", lambda flip: [
    P(("M{0} 290 L {0} 264 L {1} 264 C {2} 270 {3} 278 {3} 288 L {3} 292 L {0} 292 Z").format(
        *[F(flip)(x) for x in (72, 114, 120, 124)]), fill="#D64545"),
    sole(flip, "#8E2A2A"),
    R(min(F(flip)(70), F(flip)(124)), 270, 54, 10, 5, fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    C(F(flip)(86), 275, 2, fill="#E4E9EE"), C(F(flip)(104), 275, 2, fill="#E4E9EE"),
], sit_sole("#8E2A2A", "#D64545"))
# hài: đỏ, mũi cong, hoa văn vàng
shoe_pair("it_shoes_hai", lambda flip: [
    P(("M{0} 290 C {0} 282 {1} 276 {2} 276 C {3} 276 {4} 280 {5} 286 C {6} 284 {7} 280 {8} 282 C {9} 288 {10} 292 {5} 293 "
       "L {0} 293 Z").format(*[F(flip)(x) for x in (72, 80, 96, 110, 116, 120, 124, 128, 130, 128, 124)]), fill="#D64545"),
    sole(flip, "#8E2A2A"),
    C(F(flip)(96), 284, 4, fill="#E8B23A"),
    P(("M{0} 282 C {1} 279 {2} 279 {3} 282").format(*[F(flip)(x) for x in (84, 90, 102, 108)]), stroke="#E8B23A", stroke_width=2,
      fill="none"),
], sit_sole("#8E2A2A", "#D64545", "#E8B23A"))
# dép quai hậu: đế nâu, hai quai sẫm, thấy chân lông
shoe_pair("it_shoes_sandal", lambda flip: [
    sole(flip, "#8A6A3B"),
    P(("M{0} 288 C {1} 278 {2} 278 {3} 288").format(*[F(flip)(x) for x in (76, 86, 104, 116)]), stroke="#39424E", stroke_width=5,
      fill="none", stroke_linecap="round"),
    P(("M{0} 288 C {1} 282 {2} 282 {3} 288").format(*[F(flip)(x) for x in (96, 102, 112, 118)]), stroke="#39424E", stroke_width=4,
      fill="none", stroke_linecap="round"),
], sit_sole("#8A6A3B", "#BFC7CF"))
# tất cao cổ: trắng, sọc đỏ, ôm bắp chân
shoe_pair("it_shoes_socks", lambda flip: [
    P(("M{0} 290 L {0} 260 L {1} 260 C {2} 268 {3} 278 {3} 288 L {3} 292 L {0} 292 Z").format(
        *[F(flip)(x) for x in (74, 112, 118, 122)]), fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P(("M{0} 264 L {1} 264 M{0} 271 L {2} 271").format(*[F(flip)(x) for x in (74, 113, 115)]), stroke="#D64545", stroke_width=4),
], sit_sole("#F4F6F8", "#E4E9EE"))
# giày phát sáng: đen, đế viền xanh neon, quầng sáng dưới chân
shoe_pair("it_shoes_glow", lambda flip: [
    E(F(flip)(96), 298, 30, 5, fill="#6DE3FF", opacity=0.35),
    upper(flip, colour="#2A313B", edge="#39424E"), sole(flip, "#39424E"),
    P(("M{0} 296 L {1} 296").format(*[F(flip)(x) for x in (72, 120)]), stroke="#6DE3FF", stroke_width=4, stroke_linecap="round"),
    P(("M{0} 276 L {1} 280").format(*[F(flip)(x) for x in (90, 104)]), stroke="#6DE3FF", stroke_width=3, stroke_linecap="round"),
], sit_sole("#39424E", "#2A313B", "#6DE3FF"))
# giày ma: tím trong, mép lượn như vạt áo ma
shoe_pair("it_shoes_ghostshoe", lambda flip: [
    P(("M{0} 292 C {0} 276 {1} 266 {2} 266 C {3} 266 {4} 276 {4} 292 C {5} 296 {6} 290 {7} 295 C {8} 290 {9} 296 {0} 292 Z").format(
        *[F(flip)(x) for x in (70, 80, 96, 112, 123, 116, 108, 98, 88, 78)]), fill="#7A5BC4", opacity=0.85),
    C(F(flip)(90), 280, 2.5, fill="#F4F6F8"), C(F(flip)(102), 280, 2.5, fill="#F4F6F8"),
], sit_sole("#7A5BC4", "#B9A6F0"))
# giày cánh: vàng, đôi cánh trắng ở gót
shoe_pair("it_shoes_wing", lambda flip: [
    P(("M{0} 278 C {1} 266 {2} 264 {3} 268 C {4} 272 {5} 280 {0} 284 Z").format(*[F(flip)(x) for x in (72, 60, 48, 42, 50, 62)]),
      fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P(("M{0} 274 C {1} 270 {2} 272 {3} 276").format(*[F(flip)(x) for x in (66, 58, 52, 50)]), stroke="#A9B2BC", stroke_width=1.4,
      fill="none"),
    upper(flip, colour="#E8B23A", edge="#C9952C"), sole(flip, "#C9952C"),
], sit_sole("#C9952C", "#E8B23A", "#F4F6F8"))

# ── 6. BALO: nhìn thẳng thì thấy quai qua vai + thân balo lộ hai bên; quay / chạy thì thấy ở hông.
BP, BPD, BPL = "#2F7A4C", "#245E3B", "#3F9E63"
pack_front = G([
    P("M54 172 C 54 160 64 154 76 154 L 164 154 C 176 154 186 160 186 172 L 188 244 C 188 256 178 262 166 262 "
      "L 74 262 C 62 262 52 256 52 244 Z", fill=BP),
], **{"if": "torsoStand"})
pack_side = G([
    R(30, 168, 44, 82, 16, fill=BP), R(36, 196, 30, 28, 9, fill=BPL), P("M38 206 L 64 206", stroke=BPD, stroke_width=2),
], **{"if": "torsoRun"})
bk = [i for i, k in enumerate(body['kids']) if k.get('if') == 'it_back_backpack'][0]
body['kids'].insert(bk + 1, G([pack_front, pack_side], **{"if": "it_back_backpack"}))
straps = G([
    G([
        P("M86 162 C 82 186 81 210 84 236", stroke=BP, stroke_width=9, fill="none", stroke_linecap="round"),
        P("M154 162 C 158 186 159 210 156 236", stroke=BP, stroke_width=9, fill="none", stroke_linecap="round"),
        P("M85 206 L 155 206", stroke=BPD, stroke_width=4, stroke_linecap="round"),
        R(113, 201, 14, 10, 3, fill="#E8B23A"),
    ], **{"if": "torsoStand"}),
    G([P("M78 168 C 96 186 112 206 124 236", stroke=BP, stroke_width=9, fill="none", stroke_linecap="round")], **{"if": "torsoRun"}),
], **{"if": "it_back_backpack"})
ai = [i for i, k in enumerate(body['kids']) if k.get('if') == 'armsIdle'][0]
body['kids'].insert(ai, straps)

# ── Ô SAU LƯNG (còn lại). Túi / bình đeo như balo mới: thân lộ hai bên lưng + quai
#    qua vai (đứng), ở hông + một quai chéo (quay / chạy). Cánh mọc cao hơn vai để tay
#    không che; áo choàng phủ từ vai xuống mắt cá, khuy cài trước cổ.
def back_item(flag, behind, front=()):
    i = [k for k, n in enumerate(body['kids']) if n.get('if') == 'it_back_backpack'][0]
    body['kids'].insert(i + 1, G(behind, **{"if": flag}))
    if front:
        j = [k for k, n in enumerate(body['kids']) if n.get('if') == 'armsIdle'][0]
        body['kids'].insert(j, G(list(front), **{"if": flag}))

def worn_pack(flag, colour, dark, light, side_extra=(), straps=True, chest=True):
    behind = [
        G([P("M56 176 C 56 164 66 158 78 158 L 162 158 C 174 158 184 164 184 176 L 186 240 C 186 252 176 258 164 258 "
             "L 76 258 C 64 258 54 252 54 240 Z", fill=colour)], **{"if": "torsoStand"}),
        G([R(30, 170, 44, 80, 16, fill=colour), R(36, 196, 30, 28, 9, fill=light)] + list(side_extra), **{"if": "torsoRun"}),
    ]
    front = []
    if straps:
        stand = [P("M86 162 C 82 186 81 210 84 236", stroke=colour, stroke_width=8, fill="none", stroke_linecap="round"),
                 P("M154 162 C 158 186 159 210 156 236", stroke=colour, stroke_width=8, fill="none", stroke_linecap="round")]
        if chest: stand.append(P("M85 206 L 155 206", stroke=dark, stroke_width=4, stroke_linecap="round"))
        front = [G(stand, **{"if": "torsoStand"}),
                 G([P("M78 168 C 96 186 112 206 124 236", stroke=colour, stroke_width=8, fill="none", stroke_linecap="round")],
                   **{"if": "torsoRun"})]
    back_item(flag, behind, front)

# bình nước đeo lưng: túi xanh, ống hút vòng qua vai ra trước ngực
worn_pack("it_back_hydro", "#2E8FCB", "#1F6FA3", "#3FA9E5", chest=False)
back_item("it_back_hydro", [], [G([
    P("M150 162 C 160 176 160 196 148 210", stroke="#39424E", stroke_width=4, fill="none", stroke_linecap="round"),
    R(142, 206, 10, 8, 3, fill="#39424E")], **{"if": "torsoStand"})])
# túi quà: túi đỏ thắt nơ vàng, quai đỏ
worn_pack("it_back_giftbag", "#D64545", "#B23636", "#E36A6A", chest=False)
back_item("it_back_giftbag", [], [G([
    P("M85 206 L 155 206", stroke="#E8B23A", stroke_width=4, stroke_linecap="round"),
    P("M120 206 C 108 194 98 196 100 204 C 102 212 112 210 120 206 C 128 210 138 212 140 204 C 142 196 132 194 120 206 Z",
      fill="#E8B23A"), C(120, 206, 4, fill="#C9952C")], **{"if": "torsoStand"})])
# lì xì: bao đỏ to đeo lưng, đồng tiền vàng lộ hai bên
worn_pack("it_back_lixi", "#D64545", "#B23636", "#E8B23A", chest=False,
          side_extra=[C(51, 210, 9, fill="#E8B23A"), C(51, 210, 4, fill="#D64545")])
back_item("it_back_lixi", [], [G([
    P("M85 200 L 155 200", stroke="#B23636", stroke_width=4, stroke_linecap="round"),
    R(106, 196, 28, 36, 4, fill="#D64545", stroke="#B23636", stroke_width=1.4),
    P("M106 204 L 120 212 L 134 204", stroke="#B23636", stroke_width=1.6, fill="none"),
    C(120, 218, 7, fill="#E8B23A"), R(117.5, 215.5, 5, 5, 0.5, fill="#D64545")], **{"if": "torsoStand"})])
# bình oxy: hai bình xám dựng sau lưng, van đen trên vai
back_item("it_back_oxygen", [
    G([R(52, 150, 30, 96, 14, fill="#8A94A1"), R(158, 150, 30, 96, 14, fill="#8A94A1"),
       R(60, 138, 14, 14, 5, fill="#39424E"), R(166, 138, 14, 14, 5, fill="#39424E")], **{"if": "torsoStand"}),
    G([R(30, 160, 28, 88, 13, fill="#8A94A1"), R(37, 148, 14, 14, 5, fill="#39424E")], **{"if": "torsoRun"}),
], [G([P("M86 162 C 82 186 81 210 84 236", stroke="#5B6573", stroke_width=7, fill="none", stroke_linecap="round"),
       P("M154 162 C 158 186 159 210 156 236", stroke="#5B6573", stroke_width=7, fill="none", stroke_linecap="round"),
       P("M150 168 C 166 176 168 196 152 208", stroke="#39424E", stroke_width=4, fill="none", stroke_linecap="round")],
      **{"if": "torsoStand"})])
# ba lô phản lực: hai ống đẩy cao hơn vai, lửa cam dưới đáy
back_item("it_back_jetpack", [
    G([R(46, 140, 30, 96, 14, fill="#6E7E96"), R(164, 140, 30, 96, 14, fill="#6E7E96"),
       R(50, 132, 22, 14, 6, fill="#4A5A72"), R(168, 132, 22, 14, 6, fill="#4A5A72"),
       P("M50 236 C 54 256 64 262 61 276 C 56 266 46 258 50 236 Z", fill="#E8842A"),
       P("M190 236 C 186 256 176 262 179 276 C 184 266 194 258 190 236 Z", fill="#E8842A"),
       P("M56 238 C 58 250 62 254 60 262 C 57 256 54 250 56 238 Z", fill="#E8B23A"),
       P("M184 238 C 182 250 178 254 180 262 C 183 256 186 250 184 238 Z", fill="#E8B23A")], **{"if": "torsoStand"}),
    G([R(28, 156, 30, 88, 14, fill="#6E7E96"), R(32, 148, 22, 12, 5, fill="#4A5A72"),
       P("M34 244 C 38 262 46 268 43 280 C 38 270 30 262 34 244 Z", fill="#E8842A")], **{"if": "torsoRun"}),
], [G([P("M86 162 C 82 186 81 210 84 236", stroke="#4A5A72", stroke_width=8, fill="none", stroke_linecap="round"),
       P("M154 162 C 158 186 159 210 156 236", stroke="#4A5A72", stroke_width=8, fill="none", stroke_linecap="round"),
       P("M85 206 L 155 206", stroke="#39424E", stroke_width=4, stroke_linecap="round"), C(120, 206, 5, fill="#E8B23A")],
      **{"if": "torsoStand"})])

# cánh: mọc từ bả vai, cao hơn vai, toả ra ngoài cánh tay
def wings(flag, left, fill, edge=None, extra=()):
    right = left.replace("M", "M").split()
    def mirror(d):
        out = []
        for tok in d.split():
            head = tok[0] if tok[0].isalpha() else ""
            num = tok[1:] if head else tok
            out.append(tok)
        return d
    kids = [P(left, fill=fill, **({"stroke": edge, "stroke_width": 1.6} if edge else {})),
            {"t": "g", "tf": [["t", 240, 0], ["s", -1, 1]], "kids": [P(left, fill=fill, **({"stroke": edge, "stroke_width": 1.6} if edge else {}))]}]
    back_item(flag, kids + list(extra))
ANGEL = "M80 172 C 56 150 26 140 10 150 C 2 160 6 176 18 182 C 8 190 8 204 20 210 C 14 220 20 232 32 232 C 48 232 64 214 76 196 Z"
wings("it_back_angel", ANGEL, "#FFFFFF", edge="#A9B2BC", extra=[
    P("M22 170 C 36 170 52 176 66 186 M24 198 C 38 196 52 198 64 204", stroke="#D7DDE3", stroke_width=2, fill="none",
      stroke_linecap="round"),
    {"t": "g", "tf": [["t", 240, 0], ["s", -1, 1]], "kids": [
        P("M22 170 C 36 170 52 176 66 186 M24 198 C 38 196 52 198 64 204", stroke="#D7DDE3", stroke_width=2, fill="none",
          stroke_linecap="round")]}])
BAT = "M80 174 C 58 146 26 132 4 138 C 12 150 14 162 8 176 C 20 172 30 178 32 190 C 42 182 54 186 58 198 C 66 190 74 186 78 192 Z"
wings("it_back_bat", BAT, "#4A3A6B", extra=[
    P("M76 176 L 12 146 M76 182 L 30 186 M76 188 L 56 196", stroke="#35284F", stroke_width=2, fill="none", stroke_linecap="round"),
    {"t": "g", "tf": [["t", 240, 0], ["s", -1, 1]], "kids": [
        P("M76 176 L 12 146 M76 182 L 30 186 M76 188 L 56 196", stroke="#35284F", stroke_width=2, fill="none", stroke_linecap="round")]}])
DRAGON = "M80 172 C 60 136 28 118 2 124 C 10 138 12 150 6 166 C 20 160 30 166 30 180 C 42 170 54 174 56 188 C 64 180 74 180 78 190 Z"
wings("it_back_dragonwing", DRAGON, "#2F7A4C", extra=[
    P("M78 174 L 6 128 M78 180 L 28 176 M78 186 L 54 188", stroke="#E8B23A", stroke_width=2.5, fill="none", stroke_linecap="round"),
    {"t": "g", "tf": [["t", 240, 0], ["s", -1, 1]], "kids": [
        P("M78 174 L 6 128 M78 180 L 28 176 M78 186 L 54 188", stroke="#E8B23A", stroke_width=2.5, fill="none", stroke_linecap="round")]}])

# áo choàng: phủ sau lưng tới mắt cá, toả rộng, khuy vàng trước cổ
back_item("it_back_cape", [
    P("M78 160 C 52 188 40 230 40 284 C 70 296 170 296 200 284 C 200 230 188 188 162 160 C 148 176 92 176 78 160 Z", fill="#B23636"),
    P("M44 280 C 74 290 166 290 196 280", stroke="#8E2A2A", stroke_width=3, fill="none"),
], [G([P("M86 164 C 96 176 110 180 120 180 C 130 180 144 176 154 164", stroke="#B23636", stroke_width=7, fill="none",
         stroke_linecap="round"),
       C(120, 180, 6, fill="#E8B23A", stroke="#C9952C", stroke_width=1.4)], **{"if": "torsoStand"})])

# ── 7. BÌNH NƯỚC: thân bình xuyên qua CHÍNH đầu cánh tay phải của Koa — vẽ lại đầu bàn
#     tay (cùng màu lông, không viền) đè lên giữa bình: thấy nắp ở trên, đáy ở dưới.
hand = next(n for n in walk(nodes[3]) if n.get('bind') == 'handTf')
hand['kids'].append(G([
    R(-9, -32, 18, 46, 8, fill="#3FA9E5"),
    R(-9, -32, 18, 46, 8, fill="none", stroke="#2A86BC", stroke_width=1.2),
    R(-6, -39, 12, 8, 3, fill="#39424E"),
    R(-9, -18, 18, 9, 1.5, fill="#FFFFFF", opacity=0.85),
    P("M-4 -28 L -4 8", stroke="#FFFFFF", stroke_width=2.6, stroke_linecap="round", opacity=0.35),
    P("M-14 -5 C -8 -11 8 -11 14 -4 C 17 3 11 10 0 10 C -10 10 -16 5 -16 0 C -16 -2 -15 -4 -14 -5 Z", fill=FUR),
    P("M-5 -3 C -3 1 -3 5 -5 8 M3 -4 C 5 0 5 5 3 9", stroke=FURD, stroke_width=1.3, fill="none",
      stroke_linecap="round", opacity=0.5),
], **{"if": "it_hand_bottle"}))


d["nodes"] = [prune(n) for n in d["nodes"] if id(n) not in old_groups]

# ── Ô CẦM TAY (còn lại): như bình nước — món nằm ĐÚNG ở đầu cánh tay phải (gốc
#    `handTf`), to hơn RN, và bàn tay Koa (cùng màu lông, hai nét ngón) vẽ đè lên
#    chỗ cầm: món nhô ra trên / dưới bàn tay.
PAW = [P("M-14 -5 C -8 -11 8 -11 14 -4 C 17 3 11 10 0 10 C -10 10 -16 5 -16 0 C -16 -2 -15 -4 -14 -5 Z", fill=FUR),
       P("M-5 -3 C -3 1 -3 5 -5 8 M3 -4 C 5 0 5 5 3 9", stroke=FURD, stroke_width=1.3, fill="none", stroke_linecap="round",
         opacity=0.5)]
def held(flag, under, over=()):
    hand['kids'].append(G(list(under) + PAW + list(over), **{"if": flag}))

# tạ đơn: tay cầm ngang trong lòng bàn tay, hai quả tạ hai bên
held("it_hand_dumbbell", [
    R(-24, -3, 48, 7, 3, fill="#7E8896"),
    R(-30, -13, 10, 26, 4, fill="#39424E"), R(20, -13, 10, 26, 4, fill="#39424E"),
    R(-36, -9, 7, 18, 3, fill="#2A313B"), R(29, -9, 7, 18, 3, fill="#2A313B"),
])
# khăn: vắt qua tay, hai vạt rủ xuống
held("it_hand_towel", [
    P("M-14 -4 C -18 10 -16 26 -10 36 C -4 38 2 36 4 30 C 0 20 0 8 2 -2 Z", fill="#F4F6F8", stroke="#A9B2BC", stroke_width=1.6),
    P("M4 -2 C 10 10 14 22 12 32 C 16 36 22 34 24 28 C 22 16 18 4 12 -4 Z", fill="#E4E9EE", stroke="#A9B2BC", stroke_width=1.6),
    P("M-14 26 L 2 26 M6 22 L 20 22", stroke="#3FA9E5", stroke_width=2.5, stroke_linecap="round"),
])
# dây nhảy: tay cầm đỏ trong lòng bàn tay, dây vòng xuống chạm đất
held("it_hand_rope", [
    P("M0 14 C 14 36 18 58 0 66 C -24 74 -44 60 -38 40", stroke="#39424E", stroke_width=3, fill="none", stroke_linecap="round"),
    R(-5, -18, 10, 36, 5, fill="#D64545"),
])
# kẹo gậy Noel: cán thẳng qua bàn tay, móc cong trên đầu, sọc đỏ
held("it_hand_candy", [
    P("M2 22 L 2 -18 C 2 -34 24 -34 24 -18", stroke="#F4F6F8", stroke_width=9, fill="none", stroke_linecap="round"),
    P("M2 22 L 2 -18 C 2 -34 24 -34 24 -18", stroke="#A9B2BC", stroke_width=10.5, fill="none", stroke_linecap="round", opacity=0),
    P("M2 16 L 2 12 M2 -10 L 2 -14 M4 -24 L 8 -28 M18 -30 L 20 -26 M24 -20 L 24 -16", stroke="#D64545", stroke_width=4.5,
      stroke_linecap="round"),
])
# lồng đèn: quai cầm trong tay, đèn treo phía dưới, tua vàng
held("it_hand_lantern", [
    P("M0 6 L 0 18", stroke="#39424E", stroke_width=3),
    E(0, 34, 16, 18, fill="#D64545"), E(0, 34, 10, 18, fill="#E36A6A", opacity=0.6),
    R(-9, 15, 18, 5, 2, fill="#E8B23A"), R(-9, 49, 18, 5, 2, fill="#E8B23A"),
    P("M-5 54 L -5 62 M0 54 L 0 64 M5 54 L 5 62", stroke="#E8B23A", stroke_width=2.5, stroke_linecap="round"),
    P("M0 -4 C -6 -14 6 -14 0 -4", stroke="#39424E", stroke_width=3, fill="none"),
])
# chổi phù thuỷ: cán dài chéo qua tay, bó rơm dưới đất
held("it_hand_broom", [
    P("M-6 -40 L 6 40", stroke="#8A6A3B", stroke_width=5, stroke_linecap="round"),
    P("M4 34 C 18 40 22 58 12 66 C 0 70 -10 62 -8 40 Z", fill="#C4901F"),
    P("M2 44 L 0 64 M8 44 L 8 66 M-2 42 L -6 60", stroke="#A57A18", stroke_width=1.6, stroke_linecap="round"),
    G([R(-1, 32, 12, 6, 2, fill="#D64545")], tf=[["r", 10, 5, 35]]),
])
# bao lì xì: kẹp giữa ngón, nửa trên nhô khỏi bàn tay
held("it_hand_redenv", [
    R(-12, -34, 24, 34, 4, fill="#D64545", stroke="#B23636", stroke_width=1.4),
    P("M-12 -26 L 0 -18 L 12 -26", stroke="#B23636", stroke_width=1.6, fill="none"),
    C(0, -12, 6, fill="#E8B23A"),
])
# cúp: chân cúp trong lòng bàn tay, thân cúp vàng phía trên
held("it_hand_trophy", [
    P("M-16 -42 L 16 -42 L 13 -22 C 11 -10 -11 -10 -13 -22 Z", fill="#E8B23A"),
    P("M-16 -38 C -28 -38 -28 -22 -14 -22 M16 -38 C 28 -38 28 -22 14 -22", stroke="#C4901F", stroke_width=3.5, fill="none"),
    R(-4, -12, 8, 10, 1, fill="#C4901F"),
    P("M-8 -36 C -8 -28 -6 -24 -2 -20", stroke="#FFFFFF", stroke_width=2.5, fill="none", stroke_linecap="round", opacity=0.5),
], over=[R(-14, 8, 28, 8, 3, fill="#C4901F")])
# que pháo hoa: que dài qua tay, chùm tia sáng ở đầu
held("it_hand_sparkler", [
    P("M0 18 L 0 -30", stroke="#39424E", stroke_width=4, stroke_linecap="round"),
    G([P("M0 -32 L 0 -50"), P("M0 -32 L -14 -46"), P("M0 -32 L 14 -46"), P("M0 -32 L -20 -30"), P("M0 -32 L 20 -30"),
       P("M0 -32 L -10 -20"), P("M0 -32 L 10 -20")],
      a={"stroke": "#E8B23A", "stroke-width": 3, "stroke-linecap": "round"}),
    C(0, -32, 5, fill="#FFF6D6"),
])

# ── Đồ cầm tay ẩn khi tập tạ: hai tay đang cầm tạ (RN: đồ chồng lên quả tạ).
#    `handFree` do `KoaRender.flags` đặt — không nằm trong cờ golden của RN.
hand_g = next(n for n in walk(nodes[3]) if n.get('bind') == 'handTf')
hand_g['if'] = 'handFree'

# ── MẮT THIỀN (20/10, Kiệt chọn mock B `docs/design/mocks/koa-meditate-eyes.html`):
#    Koa ngồi thiền lúc "ngủ" — mắt khép: hàng mi cong xuống, nếp mí nhạt phía trên,
#    một nét mi ở khoé ngoài. Cờ `eyesMeditate` (native, chỉ có khi biểu cảm `meditate`).
#    Chèn cùng chỗ với các nhóm mắt RN (trước lông mày), để kính / đồ mặt vẫn đè lên.
def meditate_eye(cx, outer):
    return [
        P(f"M{cx-13} 90 Q{cx} 84 {cx+13} 90", stroke="#9AA4AE", stroke_width=3, stroke_linecap="round", fill="none"),
        P(f"M{cx-17} 100 Q{cx} 113 {cx+17} 100", stroke="#20242A", stroke_width=4.5, stroke_linecap="round", fill="none"),
        P(f"M{cx+17*outer} 100 l{4*outer} 3", stroke="#20242A", stroke_width=3.5, stroke_linecap="round", fill="none"),
    ]
bi = next(i for i, k in enumerate(faceshift['kids']) if k.get('if') == 'browArc')
faceshift['kids'].insert(bi, G(meditate_eye(82, -1) + meditate_eye(158, 1), **{"if": "eyesMeditate"}))

# ── VÓC DÁNG THEO HẠNG (20/10, Kiệt duyệt `docs/design/mocks/koa-rank-evolution.html`):
#    6 hạng → vai rộng ra, eo gọn chữ V, bắp tay dày + dang theo vai; nét cơ cùng tông
#    lông. Mọi thứ BÁM theo Koa: nét trên tay nằm TRONG nhóm hoạt ảnh của cánh tay, tay
#    áo / đồ cầm tay nhận cùng phép biến đổi hạng với cánh tay, thân áo nở theo vai,
#    nét bụng / đai nằm trong thân (thở theo). Cờ do `KoaRender.flags` đặt từ cấp:
#    `rk1…rk5` (hạng ≥ n), `rkE0…rkE5` (đúng hạng n), `armRankL/R`, `topRank`, `handRank`.
RANK_T = [0, .18, .4, .6, .82, 1]
LINE, SH = "#A3ACB6", "#C8CFD6"
def rank_torso(t):
    sw = 54 + 12 * t; ww = 53 - 7 * t
    L = lambda x: f"{120 - x:g}"; R_ = lambda x: f"{120 + x:g}"
    return (f"M120 140 C {L(24 + 4 * t)} 140 {L(48 + 10 * t)} 152 {L(sw)} 180 C {L(sw + 2)} 200 {L(ww + 5)} 224 {L(ww)} 244 "
            f"C {L(ww - 4)} 264 92 279 120 279 C 148 279 {R_(ww - 4)} 264 {R_(ww)} 244 C {R_(ww + 5)} 224 {R_(sw + 2)} 200 {R_(sw)} 180 "
            f"C {R_(48 + 10 * t)} 152 {R_(24 + 4 * t)} 140 120 140 Z")
def stroke(dd, w=2.4, c=LINE, o=1):
    a = dict(stroke=c, stroke_width=w, stroke_linecap="round", fill="none")
    if o != 1: a['opacity'] = o
    return P(dd, **a)
def mx(dd):
    return re.sub(r'(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)', lambda m: f"{240 - float(m.group(1)):g} {m.group(2)}", dd)
def arm_marks(left):
    f = (lambda d: d) if left else mx
    out = [G([stroke(f("M57 188 C 48 198 44 207 45 215")), stroke(f("M65 181 C 61 186 58 191 57 196"), w=3, c="#FFFFFF", o=0.35)], **{"if": "rk1"}),
           G([stroke(f("M69 172 C 62 175 57 181 55 188"), w=2.2)], **{"if": "rk2"}),
           G([stroke(f("M50 214 C 52 222 56 228 58 233"), w=2)], **{"if": "rk3"})]
    chalk = [(48, 238, 5, .55), (55, 242, 3.5, .45), (44, 232, 3, .4)]
    out.append(G([C(x if left else 240 - x, y, r, fill="#FFFFFF", opacity=o) for x, y, r, o in chalk], **{"if": "rk4"}))
    return out

# 1. Thân: torso_front đứng → 6 biến thể theo hạng (hạng 0 = nguyên bản).
torso_stand = next(n for n in walk(nodes[3]) if n.get('if') == 'torsoStand' and any(k.get('id') == 'torso_front' for k in n.get('kids', [])))
ti = next(i for i, k in enumerate(torso_stand['kids']) if k.get('id') == 'torso_front')
tf0 = torso_stand['kids'][ti]
variants = []
for r, t in enumerate(RANK_T):
    v = json.loads(json.dumps(tf0))
    if r: v['a']['d'] = rank_torso(t); v.pop('id', None)
    variants.append(G([v], **{"if": f"rkE{r}"}))
torso_stand['kids'][ti:ti + 1] = variants

# 2. Cơ bụng + đường chữ V: trong TORSO, ngay sau bụng; chỉ khi thân đứng.
torso = next(n for n in walk(nodes[3]) if n.get('id') == 'TORSO')
bi_ = next(i for i, k in enumerate(torso['kids']) if k.get('id') == 'belly')
def pads(rows):
    out = []
    for y, h in rows:
        for x in (100.5, 121.5):
            out += [R(x, y, 18, h, 7, fill=SH), stroke(f"M{x + 4:g} {y + 3} L{x + 14:g} {y + 3}", w=2, c="#FFFFFF", o=0.45)]
    return out
torso['kids'].insert(bi_ + 1, G([
    G(pads([(200, 22), (225, 22)]), **{"if": "rkE3"}),
    G(pads([(198, 19), (220, 19), (242, 19)]), **{"if": "rk4"}),
    G([stroke("M74 212 C 78 234 88 252 101 262", w=2.2), stroke(mx("M74 212 C 78 234 88 252 101 262"), w=2.2)], **{"if": "rk4"}),
], **{"if": "torsoStand"}))

# 3. Tay đứng: mỗi cánh tay + nét của nó vào MỘT nhóm hoạt ảnh (nét đi theo tay),
#    rồi cả bên vào nhóm biến đổi hạng.
arms_g = next(n for n in walk(nodes[3]) if n.get('id') == 'ARMS' and any(k.get('id') == 'arm_left_upper' for k in n.get('kids', [])))
def side_of(n):
    m = re.search(r'M\s*(-?[\d.]+)', (n.get('a') or {}).get('d', ''))
    return 'L' if (m and float(m.group(1)) < 120) else 'R'
left, right = [], []
for k in arms_g['kids']:
    if k.get('id') in ('arm_left_upper', 'arm_right_upper'):
        isl = k['id'] == 'arm_left_upper'
        anim, o = k.pop('anim'), k.pop('o')
        grp = G([k] + arm_marks(isl), anim=anim, o=o)
        (left if isl else right).append(grp)
    else:
        (left if side_of(k) == 'L' else right).append(k)
arms_g['kids'] = [G(left, bind="armRankL"), G(right, bind="armRankR")]

# 4. Tay áo (tư thế đứng, mọi áo): nhóm mang hoạt ảnh koaArmL / koaArmR → bọc thêm
#    biến đổi hạng của đúng bên. Thân áo (nhóm áo không chứa tay áo) nở theo vai.
def wrap_arm_anims(n):
    kids = []
    for k in n.get('kids', []):
        wrap_arm_anims(k)
        a = (k.get('anim') or {}).get('k')
        if a in ('koaArmL', 'koaArmR') and k is not arms_g and k not in left and k not in right:
            k = G([k], bind="armRankL" if a == 'koaArmL' else "armRankR")
        kids.append(k)
    if 'kids' in n: n['kids'] = kids
wrap_arm_anims(body)
def has_arm_anim(n): return any((x.get('anim') or {}).get('k') in ('koaArmL', 'koaArmR') for x in walk(n))
body['kids'] = [G([k], bind="topRank") if (k.get('if', '').startswith('it_top_') and not has_arm_anim(k)) else k
                for k in body['kids']]

# 5. Đồ cầm tay (tư thế đứng): theo cánh tay phải.
hand_free = next(n for n in walk(nodes[3]) if n.get('if') == 'handFree')
hp = next((pn, i) for pn in walk(nodes[3]) for i, k in enumerate(pn.get('kids', [])) if k is hand_free)
hp[0]['kids'][hp[1]] = G([hand_free], bind="handRank")

# 6. Đai lưng tập tạ (hạng 5): sau quần, trước tay; thở theo thân.
last_bottom = max(i for i, k in enumerate(body['kids']) if k.get('if', '').startswith('it_bottom_'))
body['kids'].insert(last_bottom + 1, G([G([
    P("M70 258 Q120 270 170 258 L169 272 Q120 284 71 272 Z", fill="#2B2F36"),
    P("M71 261 Q120 273 169 261", stroke="#454B54", stroke_width=1.2, fill="none"),
    P("M71 269 Q120 281 169 269", stroke="#454B54", stroke_width=1.2, fill="none"),
    R(110, 266, 20, 14, 3, fill="none", stroke="#C9CED4", stroke_width=2.6),
    P("M120 267 L120 279", stroke="#C9CED4", stroke_width=2.2, stroke_linecap="round"),
], **{"if": "rk5"})], **{"if": "torsoStand"}))

# Mọi món đã vẽ lại phải xuất hiện đúng một lần trở lên trong cây mới.
flags_in = {n.get('if') for n in walk({'kids': d['nodes']})}
missing = sorted(gone - flags_in)
assert not missing, f"thiếu bản vẽ mới: {missing}"

for n in walk({'kids': d['nodes']}):
    for k, v in (n.get('a') or {}).items():
        assert isinstance(v, (str, int, float)), f"thuộc tính {k} phải là chuỗi / số: {v!r}"
out = json.dumps(d, ensure_ascii=False, separators=(',', ':'))
if '"##' in out: raise SystemExit("chuỗi thô của Swift sẽ gãy")
DST.write_text(f"""// SINH TỰ ĐỘNG — đừng sửa tay.
// Nguồn: KoaSceneData.swift (cảnh RN) + tools/koa-wardrobe/build.py (tủ đồ vẽ lại).
// Sinh lại: python3 tools/koa-wardrobe/build.py (từ apps/ios).

extension KoaScene {{
  static let wardrobeJSON = ##"{out}"##
}}
""")
print(f"ok: {DST.name}, vẽ lại {len(gone)} món")
