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
    "head": ["cap", "band", "beanie", "santa", "antler", "pumpkin", "witch", "khanxep", "phones", "lion"], "face": ["shades", "goggles", "mask", "eyepatch", "beard", "tuong", "vr", "nosestrip", "heart", "dragon"], "top": ["tee", "tank", "hoodie", "xmas", "aodai", "ghost", "windbreak", "jersey", "lion", "armor"], "bottom": ["short"],
    "shoes": ["sneaker"], "back": ["backpack"], "hand": ["bottle"],
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

# ── Đồ cầm tay ẩn khi tập tạ: hai tay đang cầm tạ (RN: đồ chồng lên quả tạ).
#    `handFree` do `KoaRender.flags` đặt — không nằm trong cờ golden của RN.
hand_g = next(n for n in walk(nodes[3]) if n.get('bind') == 'handTf')
hand_g['if'] = 'handFree'

# Mọi món đã vẽ lại phải xuất hiện đúng một lần trở lên trong cây mới.
flags_in = {n.get('if') for n in walk({'kids': d['nodes']})}
missing = sorted(gone - flags_in)
assert not missing, f"thiếu bản vẽ mới: {missing}"

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
