#!/usr/bin/env python3
"""Giọng Koa kiểu hoạt hình (Kiệt 31/10): tổng hợp theo mô hình nguồn - bộ lọc, không dùng bản ghi.

Không có bản ghi koala CC0 rõ nguồn, nên mô phỏng đặc điểm tiếng koala: ừm mũi trầm, khàn ở cổ, có
hơi thở; rồi nâng cao giọng và uốn cao độ như nhân vật hoạt hình. Chạy: python3 tools/koa-sound/voice.py
(cần numpy). Ghi ASCND/Resources/Sounds/koa-*.wav. Sửa số ở `CUES` để đổi tính cách.
"""
import pathlib
import wave

import numpy as np

RATE = 44100
HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / "ASCND/Resources/Sounds"
rng = np.random.default_rng(12)

# formant (F1, F2, F3) nâng 1,2 lần cho giọng nhỏ người; "m" là âm mũi, nghe như ngậm miệng
VOWEL = {"m": (300, 1200, 2700), "u": (420, 960, 2900), "o": (600, 1080, 3000), "a": (960, 1560, 3100), "e": (640, 2100, 3100)}


def track(points, n):
    """Đường cong qua các mốc (0…1, giá trị), mượt, không gãy."""
    x = np.linspace(0, 1, n)
    y = np.interp(x, [p[0] for p in points], [p[1] for p in points])
    k = max(3, RATE // 80)
    pad = np.pad(y, k, mode="edge")
    return np.convolve(pad, np.ones(k) / k, mode="same")[k:-k]


def resonator(x, freq, bw):
    r = np.exp(-np.pi * bw / RATE)
    c = 2 * r * np.cos(2 * np.pi * freq / RATE)
    d = -r * r
    y = np.zeros(x.size)
    a, b = 0.0, 0.0
    for i in range(x.size):
        v = x[i] + c[i] * a + d * b
        b, a = a, v
        y[i] = v
    return y * (1 - r)


def voice(sec, pitch, vowels, loud, growl=0.25, breath=0.12):
    n = int(RATE * sec)
    f0 = track(pitch, n)
    # cao độ không đều một chút, kẻo nghe như máy
    t = np.arange(n) / RATE
    f0 = f0 * (1 + 0.012 * np.sin(2 * np.pi * 7 * t) + 0.012 * np.cumsum(rng.normal(0, 0.012, n)) / 40)
    phase = np.cumsum(f0) / RATE
    p = phase % 1
    glottal = np.where(p < 0.6, 3 * (p / 0.6) ** 2 - 2 * (p / 0.6) ** 3, np.maximum(0, 1 - (p - 0.6) / 0.08))
    src = np.diff(glottal, prepend=glottal[0]) * 40
    # khàn: nhịp lẻ yếu đi như tiếng ừm trong cổ koala
    src *= 1 - growl * (phase.astype(int) % 2)
    src = src + breath * rng.normal(0, 1, n)
    keys = [(i / (len(vowels) - 1), v) for i, v in enumerate(vowels)]
    out = np.zeros(n)
    for j, (gain, bw) in enumerate([(1.0, 90), (0.5, 120), (0.16, 180)]):
        out += gain * resonator(src, track([(k, VOWEL[v][j]) for k, v in keys], n), bw)
    return out * track(loud, n)


def hum(sec, pitch, loud):
    return voice(sec, pitch, ["m", "m"], loud, growl=0.35, breath=0.05)


def cat(*parts, gap=0.0):
    silence = np.zeros(int(RATE * gap))
    out = parts[0]
    for p in parts[1:]:
        out = np.concatenate([out, silence, p])
    return out


UP = [(0, 0), (0.15, 1), (0.7, 0.8), (1, 0)]
CUES = {
    # chạm Koa: ba tiếng "ừm?" khác nhau, phát ngẫu nhiên
    "koa-boop-1": lambda: voice(0.2, [(0, 330), (0.6, 470), (1, 560)], ["m", "u", "u"], UP),
    "koa-boop-2": lambda: voice(0.24, [(0, 400), (0.4, 340), (1, 500)], ["m", "o", "u"], UP),
    "koa-boop-3": lambda: cat(
        voice(0.11, [(0, 360), (1, 430)], ["m", "u"], UP), voice(0.14, [(0, 430), (1, 540)], ["m", "e"], UP), gap=0.02),
    # dậy: ngáp dài, xuống giọng
    "koa-yawn": lambda: voice(
        0.85, [(0, 300), (0.3, 420), (1, 180)], ["m", "a", "a", "o", "m"], [(0, 0), (0.25, 1), (0.7, 0.75), (1, 0)], breath=0.3),
    # lên hạng: "a-ha!" lên giọng, vui
    "koa-cheer": lambda: cat(
        voice(0.13, [(0, 380), (1, 470)], ["m", "a"], UP), voice(0.3, [(0, 520), (0.4, 700), (1, 640)], ["a", "e"], UP), gap=0.03),
}


def write(name, x):
    x = x / np.max(np.abs(x)) * 0.7
    x[-300:] *= np.linspace(1, 0, 300)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


def read(path):
    with wave.open(str(path)) as w:
        return np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16) / 32768


for name, make in CUES.items():
    write(name, make())

# đáp giường: "ụm" nén xuống, chồng lên tiếng bịch Kenney (CC0)
grunt = voice(0.24, [(0, 300), (1, 170)], ["u", "m"], [(0, 0), (0.08, 1), (0.5, 0.6), (1, 0)], growl=0.45)
grunt = grunt / np.max(np.abs(grunt))
thud = read(HERE / "thud.wav")
mix = np.zeros(max(grunt.size, thud.size))
mix[: grunt.size] += 0.8 * grunt
mix[: thud.size] += 0.9 * thud / np.max(np.abs(thud))
write("koa-land", mix)
