#!/usr/bin/env python3
"""Giọng "nói" của Koa (Kiệt 04/11): tiếng koala được nhân hoá thành lời người, như mèo Tom nói
"no no no" hay dân làng Animal Crossing nói bằng âm tiết.

Học từ hai app ấy: Talking Tom là giọng cao, khoang miệng nhỏ, ngữ điệu phóng đại; Animal Crossing
("Animalese") nói bằng chuỗi âm tiết ngắn, cao độ lên xuống theo câu. Bản đầu dùng máy đọc
espeak-ng rồi biến giọng bằng WORLD — Kiệt nghe "như robot, sợ quá" — nên bỏ. Giờ mọi tiếng dựng
bằng chính bộ giọng hoạt hình của Koa (`voice.py`: nguồn thanh quản + formant, ừm mũi, khàn nhẹ của
koala, cao độ rung tự nhiên): mỗi "chữ" là một âm tiết phụ âm mũi → nguyên âm, ngữ điệu kiểu Tom.
Âm lượng vào / ra mềm, không chói (Kiệt: tiếng phải thư giãn, không đau đầu).

Chạy: python3 tools/koa-sound/koala.py (cần numpy). Ghi ASCND/Resources/Sounds/koa-v-*.wav (phản
ứng khi chạm) và koa-talk-*.wav (âm tiết khi nói).
"""
import numpy as np

from voice import OUT, RATE, cat, voice, write

# âm lượng một âm tiết: vào nhanh, giữ, ra mềm
SYL = [(0, 0), (0.12, 1), (0.7, 0.85), (1, 0)]


def syl(sec, pitch, vowels, breath=0.12, growl=0.2):
    return voice(sec, pitch, vowels, SYL, growl=growl, breath=breath)


def soft(x):
    """Bớt dải chói trên 4 kHz một chút để tiếng êm."""
    f = np.fft.rfftfreq(x.size, 1 / RATE)
    return np.fft.irfft(np.fft.rfft(x) / (1 + (f / 4200) ** 4), x.size)


REACTIONS = {
    # mũi: "no no no" kiểu mèo Tom — ba nhịp, mỗi nhịp lên rồi rơi, thấp dần
    "nonono": lambda: cat(
        syl(0.15, [(0, 520), (0.3, 600), (1, 520)], ["n", "o", "o"]),
        syl(0.15, [(0, 490), (0.3, 560), (1, 470)], ["n", "o", "o"]),
        syl(0.22, [(0, 460), (0.3, 520), (1, 360)], ["n", "o", "u"]),
        gap=0.05),
    # bụng: bị cù, cười khúc khích "hi hi hi"
    "giggle": lambda: cat(*[syl(0.08, [(0, p), (1, p + 40)], ["i", "e"], breath=0.32, growl=0.1)
                            for p in (600, 660, 620, 560)], gap=0.035),
    # đỉnh đầu: được xoa, "ưm~" lim dim, khàn gừ nhẹ của koala
    "mmm": lambda: voice(0.75, [(0, 360), (0.35, 450), (1, 330)], ["m", "u", "m"],
                         [(0, 0), (0.15, 0.9), (0.75, 0.7), (1, 0)], growl=0.4, breath=0.14),
    # tai: "ối!" giật mình, vút lên
    "oi": lambda: syl(0.3, [(0, 430), (0.35, 720), (1, 640)], ["o", "o", "i"]),
    # chân: "úi da"
    "ui": lambda: cat(syl(0.17, [(0, 620), (1, 540)], ["u", "i"]), syl(0.18, [(0, 500), (1, 420)], ["n", "a"]), gap=0.03),
    # má: "hê hê" tinh nghịch
    "hehe": lambda: cat(syl(0.1, [(0, 540), (1, 580)], ["e", "e"], breath=0.25),
                        syl(0.12, [(0, 590), (1, 560)], ["e", "e"], breath=0.25), gap=0.04),
    # người: "hửm?" tò mò, lên giọng cuối
    "hm": lambda: voice(0.3, [(0, 380), (0.5, 420), (1, 600)], ["m", "u", "m"], SYL, growl=0.3, breath=0.08),
    # vui: "yay!"
    "yay": lambda: syl(0.32, [(0, 520), (0.4, 720), (1, 660)], ["i", "a", "e"]),
}

# Âm tiết khi nói (Animalese): mỗi âm một nguyên âm và một cao độ hơi khác để chuỗi nghe như câu.
TALK = [("m", "a", 500), ("m", "o", 470), ("n", "e", 540), ("m", "u", 460), ("n", "i", 560),
        ("m", "a", 530), ("n", "o", 490), ("m", "e", 520), ("n", "u", 480), ("m", "i", 550)]


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in REACTIONS.items():
        write(f"koa-v-{name}", soft(make()))
    for i, (c, v, p) in enumerate(TALK):
        write(f"koa-talk-{i + 1}", soft(syl(0.11, [(0, p), (0.5, p * 1.06), (1, p * 0.94)], [c, v, v], breath=0.15)))
    print("ok: koa-v-*, koa-talk-*")
