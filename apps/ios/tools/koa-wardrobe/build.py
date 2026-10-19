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
    "head": ["cap"], "face": ["shades"], "top": ["tee"], "bottom": ["short"],
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
hi = [i for i, k in enumerate(headrig['kids']) if k.get('id') == 'HEAD'][0]
headrig['kids'].insert(hi + 1, cap)

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
