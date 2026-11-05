#!/usr/bin/env python3
"""Giọng "nói" của Koa (Kiệt 04/11) — kiểu GAME, không phải giọng người.

Hai bản trước (máy đọc espeak-ng + biến giọng WORLD; rồi giọng formant của `voice.py`) Kiệt nghe
"như robot", "rất đáng sợ": giọng gần người mà không phải người rơi vào thung lũng kỳ dị. Game giải
bài này bằng "text blip": nhân vật nói bằng chuỗi tiếng píp / búp tròn trịa có cao độ — Animal
Crossing (Animalese), Undertale và Celeste (mỗi nhân vật một kiểu blip), tiếng kêu Pokémon. Cảm xúc
nằm ở GIAI ĐIỆU: "no no no" là ba nốt đi xuống, cười khúc khích là chuỗi nốt cao nảy lên, "ưm~" là
một nốt ấm rung nhẹ, "ối!" là tiếng boing vút lên.

Mỗi blip: sóng sin (thêm một chút họa âm bậc 2 cho tròn, như bong bóng), lướt cao độ ngắn ở đầu,
vào 6–10 ms, tắt dần mềm — không có tiếng xì, tiếng khàn. Nốt theo âm giai ngũ cung nên ghép kiểu
gì cũng thuận tai (Kiệt: thư giãn, không đau đầu).

Chạy: python3 tools/koa-sound/koala.py (cần numpy). Ghi ASCND/Resources/Sounds/koa-v-*.wav (phản
ứng khi chạm) và koa-talk-*.wav (âm tiết khi nói).
"""
import pathlib
import wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / "ASCND/Resources/Sounds"
RATE = 44100


def note(name):
    """Tên nốt → Hz ("C5", "A5", "D#5")."""
    names = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}
    return 440 * 2 ** ((names[name[:-1]] + 12 * (int(name[-1]) + 1) - 69) / 12)


def blip(sec, f0, f1=None, glide=0.35, vib=0.0, attack=0.008, tail=0.5, bright=0.18):
    """Một tiếng píp: lướt từ f0 tới f1 trong phần `glide` đầu, rung `vib` (nửa cung) nhẹ, tắt mềm."""
    n = int(sec * RATE)
    t = np.arange(n) / RATE
    f1 = f0 if f1 is None else f1
    u = np.clip(t / max(sec * glide, 1e-3), 0, 1)
    f = f0 * (f1 / f0) ** (1 - (1 - u) ** 2)
    if vib:
        f = f * 2 ** (vib / 12 * np.sin(2 * np.pi * 5.5 * t) * np.clip(t / 0.08, 0, 1))
    ph = 2 * np.pi * np.cumsum(f) / RATE
    x = np.sin(ph) + bright * np.sin(2 * ph)
    env = np.minimum(1, t / attack) * np.clip((sec - t) / (sec * tail), 0, 1) ** 1.5
    return x * env


def seq(*parts, gap=0.04):
    out = []
    for p in parts:
        out += [p, np.zeros(int(gap * RATE))]
    return np.concatenate(out[:-1])


REACTIONS = {
    # mũi (chạm nhiều lần): "no no no" — ba nốt đi xuống, mỗi nốt hơi trĩu xuống ở cuối
    "nonono": lambda: seq(*[blip(0.11, note(a), note(b), glide=0.9) for a, b in (("E5", "D5"), ("D5", "C5"), ("C5", "A4"))], gap=0.06),
    # bụng: cười khúc khích — năm nốt cao nảy lên xuống
    "giggle": lambda: seq(*[blip(0.055, note(n) * 1.03, note(n)) for n in ("A5", "C6", "A5", "D6", "C6")], gap=0.03),
    # đỉnh đầu: được xoa — một nốt ấm, rung nhẹ, lên rồi lắng
    "mmm": lambda: blip(0.55, note("G4"), note("A4"), glide=0.5, vib=0.25, attack=0.05, tail=0.6, bright=0.1),
    # tai: "ối!" — tiếng boing vút lên rồi nảy về
    "oi": lambda: seq(blip(0.14, note("A4"), note("A5"), glide=0.8), blip(0.1, note("G5"), note("E5")), gap=0.0),
    # chân: "úi" — lên rồi xuống
    "ui": lambda: seq(blip(0.09, note("C5"), note("G5")), blip(0.13, note("E5"), note("C5"), glide=0.9), gap=0.02),
    # má, mặt: "hê hê" — hai nốt vui đi lên
    "hehe": lambda: seq(blip(0.08, note("G5"), note("A5")), blip(0.1, note("A5"), note("C6")), gap=0.05),
    # người: "hửm?" — hai nốt, nốt sau lên như câu hỏi
    "hm": lambda: seq(blip(0.09, note("C5")), blip(0.15, note("D5"), note("G5"), glide=0.7), gap=0.03),
    # vui: "yay!" — rải ba nốt lên
    "yay": lambda: seq(*[blip(0.07, note(n)) for n in ("C6", "E6", "G6")], gap=0.02),
}

# Âm tiết khi nói: nốt ngũ cung quanh C5–A5, ngắn, mỗi file một nốt; app phát theo nhịp miệng.
TALK = ["C5", "D5", "E5", "G5", "A5", "C6", "A5", "G5", "E5", "D5"]


def write(name, x, peak=0.5):
    x = x / (np.max(np.abs(x)) or 1) * peak
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((x * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for name, make in REACTIONS.items():
        write(f"koa-v-{name}", make())
    for i, n in enumerate(TALK):
        f = note(n)
        write(f"koa-talk-{i + 1}", blip(0.075, f * 1.04, f, glide=0.4, tail=0.6), peak=0.4)
    print("ok: koa-v-*, koa-talk-*")
