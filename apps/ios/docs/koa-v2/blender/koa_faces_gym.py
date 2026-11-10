# Biểu cảm vẽ thêm cho cảnh tập (Koa V2, 05/11/2026; Kiệt: "biểu cảm được phép vẽ thêm").
# Mock để duyệt, chưa vào app. Toạ độ khung FACE của KoaSceneData (chưa cộng 11):
# mắt trái 82,96 / phải 158,96 (rx 18, ry 23,5), mũi 120,84…126, miệng ~128…146.
#
# Nguyên tắc (học từ cách Duolingo phóng đại, không chép Duo):
#   - lông mày làm phần lớn cảm xúc, nét dày, góc gắt;
#   - miệng là một mảng đồ hoạ lớn (răng, lưỡi), không chỉ là một nét;
#   - dấu phụ kể chuyện: giọt mồ hôi, vệt gắng sức, hơi thở, lấp lánh;
#   - giữ đúng bộ phận gốc của Koa: lòng trắng, con ngươi, hai chấm sáng, má hồng, mũi.
#
# Mỗi biểu cảm là danh sách mảng SVG (path d + fill / stroke), theo thứ tự vẽ.

FUR, DARK, PINK, WHITE, BLUSH = "#BFC7CF", "#20242A", "#E8657B", "#FFFFFF", "#F3B5B5"
SWEAT, SWEAT_EDGE, GOLD = "#9FD8F2", "#5BB8E6", "#E8B23A"


def ell(cx, cy, rx, ry, fill, **kw):
    k = 0.5523
    d = (f"M{cx - rx} {cy} C {cx - rx} {cy - ry * k} {cx - rx * k} {cy - ry} {cx} {cy - ry} "
         f"C {cx + rx * k} {cy - ry} {cx + rx} {cy - ry * k} {cx + rx} {cy} "
         f"C {cx + rx} {cy + ry * k} {cx + rx * k} {cy + ry} {cx} {cy + ry} "
         f"C {cx - rx * k} {cy + ry} {cx - rx} {cy + ry * k} {cx - rx} {cy} Z")
    return dict(d=d, fill=fill, **kw)


def line(d, w, colour=DARK, **kw):
    return dict(d=d, fill="none", stroke=colour, width=w, **kw)


def mirror(d):
    """Lật một path (chỉ M L C Q Z tuyệt đối) qua trục mũi x = 120."""
    out, toks, i, cmd, n = [], d.replace(",", " ").split(), 0, "M", 0
    import re
    toks = re.findall(r"[MLCQZ]|-?\d*\.?\d+", d)
    for t in toks:
        if t in "MLCQZ":
            cmd, n = t, 0
            out.append(t)
            continue
        v = float(t)
        out.append(f"{240 - v:g}" if n % 2 == 0 else f"{v:g}")
        n += 1
    return " ".join(out)


def down(shapes, dy):
    """Hạ một nhóm mảng xuống `dy` (miệng không chạm đáy mũi)."""
    import re
    out = []
    for sh in shapes:
        toks, res, n = re.findall(r"[MLCQZ]|-?\d*\.?\d+", sh["d"]), [], 0
        for t in toks:
            if t in "MLCQZ":
                n = 0
                res.append(t)
                continue
            v = float(t)
            res.append(f"{v + dy:g}" if n % 2 == 1 else f"{v:g}")
            n += 1
        out.append(dict(sh, d=" ".join(res)))
    return out


def pair(make):
    """Vẽ bên trái bằng `make(side=-1)`; bên phải lật qua mũi."""
    left = make()
    right = [dict(s, d=mirror(s["d"])) for s in left]
    return left + right


def eye(cx, cy=96, rx=18, ry=23.5, px=0, py=3, pr=(12, 16)):
    return [ell(cx, cy, rx, ry, WHITE), ell(cx + px, cy + py, pr[0], pr[1], DARK),
            ell(cx + px - 4, cy + py - 7, 4.6, 4.6, WHITE), ell(cx + px + 4.5, cy + py + 8, 2.2, 2.2, WHITE)]


def lid(cx, top, edge_l, edge_r, curve=0):
    """Mí trên màu lông che phần trên mắt; `edge_l` / `edge_r` là độ cao mép mí ở hai bên."""
    x0, x1 = cx - 20, cx + 20
    mid = (edge_l + edge_r) / 2 + curve
    return [dict(d=f"M{x0} {top} L{x1} {top} L{x1} {edge_r} Q{cx} {mid} {x0} {edge_l} Z", fill=FUR),
            line(f"M{x0 + 1} {edge_l} Q{cx} {mid} {x1 - 1} {edge_r}", 3.6)]


def sweat(x, y, s=1.0):
    return dict(d=f"M{x} {y} C {x + 5 * s} {y + 8 * s} {x + 7 * s} {y + 13 * s} {x + 2 * s} {y + 16 * s} "
                  f"C {x - 3 * s} {y + 18 * s} {x - 7 * s} {y + 13 * s} {x - 3 * s} {y + 7 * s} Z",
                fill=SWEAT, stroke=SWEAT_EDGE, width=1.4)


def star(x, y, r, colour=GOLD):
    k = r * 0.28
    return dict(d=f"M{x} {y - r} Q{x + k} {y - k} {x + r} {y} Q{x + k} {y + k} {x} {y + r} "
                  f"Q{x - k} {y + k} {x - r} {y} Q{x - k} {y - k} {x} {y - r} Z", fill=colour)


def blush(r=1.0):
    return [ell(66, 121, 8 * r, 6 * r, BLUSH), ell(174, 121, 8 * r, 6 * r, BLUSH)]


FACES = {
    # Gồng hết sức, nghiến răng: mày dốc gắt vào mũi, mí xiên, răng trắng to, giọt mồ hôi.
    "grit": (
        pair(lambda: eye(82, 99, 18, 19, px=4, py=2, pr=(9, 10)) + lid(82, 70, 80, 93)
             + [line("M62 66 L101 80", 6.5)])
        + blush(0.9)
        + down([dict(d="M98 129 Q98 123 104 123 L136 123 Q142 123 142 129 L142 138 Q142 144 136 144 "
                       "L104 144 Q98 144 98 138 Z", fill=WHITE, stroke=DARK, width=3.2),
                line("M99 133.5 L141 133.5", 2), line("M110 124 L110 143", 1.6), line("M120 124 L120 143", 1.6),
                line("M130 124 L130 143", 1.6)], 5)
        + [sweat(186, 54, 1.1),
           line("M28 70 L16 64", 3, "#A9B2BC"), line("M26 84 L12 84", 3, "#A9B2BC")]
    ),
    # Phồng má thở ra: mắt nhắm > <, má hồng to, miệng chụm, hai vệt hơi.
    "puff": (
        [line("M68 88 L92 98 L68 108", 5), line("M172 88 L148 98 L172 108", 5),
         line("M66 70 Q80 61 95 67", 5), line("M174 70 Q160 61 145 67", 5)]
        + [ell(60, 122, 14, 11, BLUSH), ell(180, 122, 14, 11, BLUSH)]
        + [ell(124, 141, 6.5, 7, DARK), line("M136 134 L150 130", 2.6, "#A9B2BC"),
           line("M137 142 L152 145", 2.6, "#A9B2BC")]
    ),
    # Hét chiến thắng: mắt cười cong ^ ^, mày vút cao, miệng há to có răng và lưỡi, lấp lánh.
    "roar": (
        pair(lambda: [line("M66 101 Q82 82 98 101", 5.5), line("M64 63 Q80 50 98 60", 5.5)])
        + blush(1.25)
        + down([dict(d="M96 124 Q120 129 144 124 Q146 152 120 159 Q94 152 96 124 Z", fill=DARK),
                dict(d="M101 126 Q120 131 139 126 L138 132 Q120 137 102 132 Z", fill=WHITE),
                ell(120, 150, 13, 6.5, PINK)], 4)
        + [star(30, 40, 9), star(208, 34, 7), star(214, 70, 5)]
    ),
    # Tập trung: mí phẳng hạ thấp, con ngươi nhỏ ở giữa, mày thẳng sát mắt, miệng một nét ngắn.
    "focus": (
        pair(lambda: eye(82, 99, 17, 19, px=2, py=2, pr=(8.5, 9.5)) + lid(82, 70, 88, 88)
             + [line("M65 79 L99 81", 5.5)])
        + blush(0.8)
        + [line("M111 135 Q120 133 129 135", 3.6)]
    ),
    # Thở dốc lè lưỡi: mí sụp, con ngươi trễ xuống, mày xếch buồn, lưỡi thè, hai giọt mồ hôi.
    "pant": (
        pair(lambda: eye(82, 98, 18, 21, px=1, py=6, pr=(10, 11)) + lid(82, 70, 93, 95, curve=4)
             + [line("M66 74 L95 67", 5)])
        + blush(1.1)
        + down([dict(d="M103 127 Q120 125 137 127 Q137 142 120 147 Q103 142 103 127 Z", fill=DARK),
                dict(d="M111 139 Q110 158 120 160 Q130 158 129 139 Z", fill=PINK),
                line("M120 145 L120 156", 1.6, "#C9506A")], 4)
        + [sweat(190, 58), sweat(46, 66, 0.8)]
    ),
    # Tự hào nhếch mép: mắt trái lim dim, mày phải nhướn cao, cười lệch một bên.
    "smug": (
        eye(82, 98, 18, 21, px=5, py=4, pr=(10, 12)) + lid(82, 70, 92, 92)
        + eye(158, 96, 18, 23.5, px=5, py=3, pr=(11, 14))
        + [line("M64 82 L100 84", 5), line("M140 62 Q158 46 178 56", 5.5)]
        + blush(1)
        + [line("M104 134 Q124 142 140 127", 4.6), line("M138 124 L143 130", 3)]
    ),
}
