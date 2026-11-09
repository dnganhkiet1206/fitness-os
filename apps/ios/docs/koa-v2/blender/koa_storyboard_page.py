# Trang thư viện dáng Koa cho storyboard (index.html) + một storyboard mẫu 6 khung.
#   python3 koa_storyboard_page.py POSES_DIR FACES_DIR OUT_DIR
# POSES_DIR / FACES_DIR là đầu ra của koa_pose.py (poses.json, faces.json, *.png).
import json, os, sys, shutil, subprocess, html

POSES, FACES, OUT = sys.argv[1:4]
os.makedirs(os.path.join(OUT, "poses"), exist_ok=True)
os.makedirs(os.path.join(OUT, "faces"), exist_ok=True)
meta = json.load(open(os.path.join(POSES, "poses.json")))
faces = json.load(open(os.path.join(FACES, "faces.json")))["faces"]

def jpg(src, dst, size=480):
    subprocess.run(["magick", src, "-resize", f"{size}x{size}", "-quality", "84", dst], check=True)

cams = meta["cams"]
for key in meta["poses"]:
    for c, _ in cams:
        jpg(os.path.join(POSES, f"{key}-{c}.png"), os.path.join(OUT, "poses", f"{key}-{c}.jpg"))
for f in faces:
    for c in ("front", "q34"):
        jpg(os.path.join(FACES, f"face-{f}-{c}.png"), os.path.join(OUT, "faces", f"face-{f}-{c}.jpg"), 320)

APP = {"happy": "Vui vẻ", "surprised": "Ngạc nhiên", "grin": "Cười tít mắt", "confident": "Tự tin", "sad": "Buồn",
       "tired": "Mệt mỏi", "angry": "Tức giận", "delighted": "Thích thú", "happytired": "Vui mà mệt",
       "strain": "Gồng sức", "plead": "Van nài", "meditate": "Thiền", "content": "Thư thái", "warm": "Mỉm cười",
       "sheepish": "Ái ngại", "sleepy": "Buồn ngủ", "thinking": "Suy nghĩ", "say1": "Nói 1", "say2": "Nói 2",
       "say3": "Nói 3", "tease": "Thách đểu", "nope": "Phụng phịu"}
NEW = {"grit": "Nghiến răng gồng", "puff": "Phồng má thở ra", "roar": "Hét chiến thắng", "focus": "Tập trung",
       "pant": "Thở dốc lè lưỡi", "smug": "Tự hào nhếch mép"}

CSS = """
body{margin:0;background:#F7F5F0;font-family:-apple-system,'Helvetica Neue',sans-serif;color:#20242A}
h1{font-size:28px;margin:28px 32px 4px} h2{font-size:20px;margin:28px 32px 8px} p.lead{margin:0 32px 16px;color:#5E6773;max-width:980px}
table{border-collapse:collapse;margin:0 24px 24px} th{font-size:12px;font-weight:600;color:#5E6773;padding:6px 4px;text-align:center}
td{padding:4px;vertical-align:middle} td.name{font-size:14px;font-weight:600;padding-right:10px;white-space:nowrap}
td.name small{display:block;font-weight:400;color:#5E6773}
img{display:block;border-radius:8px;background:#fff}
.grid{display:flex;flex-wrap:wrap;gap:10px;margin:0 32px 24px}
.face{width:150px;text-align:center;font-size:12px} .face b{display:block;font-size:13px}
.tag{display:inline-block;background:#E8842A;color:#fff;border-radius:6px;padding:1px 6px;font-size:11px;margin-left:4px}
.board{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:0 32px 32px;max-width:1180px}
.panel{background:#fff;border-radius:10px;padding:10px;box-shadow:0 1px 3px rgba(0,0,0,.08)}
.panel img{width:100%;border-radius:6px} .panel .shot{font-size:12px;font-weight:700;color:#E8842A;margin-top:8px}
.panel .act{font-size:13px;margin-top:2px}
"""

def pose_rows(keys):
    head = "<tr><th></th>" + "".join(f"<th>{html.escape(l)}</th>" for _, l in cams) + "</tr>"
    rows = []
    for k in keys:
        m = meta["poses"][k]
        face = NEW.get(m["face"]) or APP.get(m["face"], m["face"])
        props = ", ".join(m["props"]) or "—"
        cells = "".join(f'<td><img src="poses/{k}-{c}.jpg" width="132" height="132"></td>' for c, _ in cams)
        rows.append(f'<tr><td class="name">{html.escape(m["label"])}<small>{k} · mặt: {html.escape(face)}<br>đạo cụ: {props}</small></td>{cells}</tr>')
    return f"<table>{head}{''.join(rows)}</table>"

keys = list(meta["poses"])
faces_html = "".join(
    f'<div class="face"><img src="faces/face-{f}-q34.jpg" width="150" height="150"><b>{html.escape(NEW.get(f) or APP.get(f, f))}'
    f'{"<span class=tag>mới</span>" if f in NEW else ""}</b>{f}</div>' for f in faces)

BOARD = [  # (ảnh, cỡ cảnh / góc máy, hành động)
    ("poses/idle-front.jpg", "1 · TOÀN CẢNH · ngang mắt", "Koa đến phòng tập, chào người xem."),
    ("poses/curl-q34r.jpg", "2 · TRUNG CẢNH · 3/4 phải", "Bài đầu: cuốn tạ, mặt nghiến răng."),
    ("faces/face-grit-q34.jpg", "3 · CẬN MẶT · 3/4", "Rep cuối, mồ hôi rịn trên trán."),
    ("poses/press-low.jpg", "4 · GÓC THẤP · anh hùng", "Đẩy tạ vai: góc thấp cho thấy sức mạnh."),
    ("poses/rest-high.jpg", "5 · GÓC CAO · nhìn xuống", "Ngồi nghỉ, thở dốc: góc cao cho thấy mệt."),
    ("poses/cheer-front.jpg", "6 · TOÀN CẢNH · ngang mắt", "Xong buổi tập! Nhảy ăn mừng."),
]
board = "".join(f'<div class="panel"><img src="{i}"><div class="shot">{html.escape(s)}</div><div class="act">{html.escape(a)}</div></div>' for i, s, a in BOARD)

page = f"""<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Koa · thư viện dáng storyboard</title><style>{CSS}</style></head><body>
<h1>Koa · thư viện dáng cho storyboard</h1>
<p class="lead">{len(keys)} dáng × {len(cams)} góc máy, {len(faces)} biểu cảm ({len(NEW)} vẽ thêm, đánh dấu “mới”). Dựng tự động bằng Blender
(mã nguồn mở) từ đúng đường viền bản vẽ Koa: <code>docs/koa-v2/blender/koa_pose.py</code>. Đây là <b>mock tham khảo cho storyboard</b>, chưa phải art của app.</p>
<h2>Storyboard mẫu: “Buổi tập của Koa”</h2><div class="board">{board}</div>
<h2>Dáng: đứng, tập, nghỉ</h2>{pose_rows(keys[:9])}
<h2>Dáng: vận động, ăn mừng, thư giãn</h2>{pose_rows(keys[9:])}
<h2>Biểu cảm (cận mặt, 3/4)</h2><div class="grid">{faces_html}</div>
</body></html>"""
open(os.path.join(OUT, "index.html"), "w").write(page)
print("ok", len(keys), len(faces))
