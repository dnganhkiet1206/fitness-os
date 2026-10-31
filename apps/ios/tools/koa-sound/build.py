#!/usr/bin/env python3
"""Tổng hợp tiếng của phòng Koa (31/10): không dùng nguồn ngoài, nên không vướng giấy phép.

Chạy: python3 tools/koa-sound/build.py  (cần numpy). Ghi ASCND/Resources/Sounds/koa-*.wav.
Không phải giọng Koa: giọng là tính cách nhân vật, phải có mock Kiệt duyệt.
"""
import pathlib
import wave

import numpy as np

RATE = 44100
OUT = pathlib.Path(__file__).resolve().parents[2] / "ASCND/Resources/Sounds"
rng = np.random.default_rng(7)


def time(sec):
    return np.arange(int(RATE * sec)) / RATE


def env(t, attack, decay):
    return np.minimum(t / attack, 1) * np.exp(-t / decay)


def glide(t, a, b):
    f = a + (b - a) * t / t[-1]
    return np.sin(2 * np.pi * np.cumsum(f) / RATE)


def soften(x, n):
    return np.convolve(x, np.ones(n) / n, mode="same")


def boop():
    t = time(0.14)
    return (glide(t, 500, 720) + 0.18 * glide(t, 1000, 1440)) * env(t, 0.008, 0.045)


def click():
    t = time(0.05)
    tick = np.sin(2 * np.pi * 1700 * t) * env(t, 0.0006, 0.005)
    noise = soften(rng.normal(0, 1, t.size), 4) * env(t, 0.0005, 0.008)
    return tick + 0.6 * noise


def land():
    t = time(0.26)
    thump = glide(t, 150, 70) * env(t, 0.004, 0.06)
    puff = soften(rng.normal(0, 1, t.size), 60) * env(t, 0.012, 0.07) * 3
    return thump + 0.5 * puff


def chime():
    t = time(0.75)
    out = np.zeros(t.size)
    for start, f in [(0.0, 784), (0.12, 1175)]:
        s = np.clip(t - start, 0, None)
        out += (np.sin(2 * np.pi * f * s) + 0.25 * np.sin(2 * np.pi * 2 * f * s)) * env(s + 1e-6, 0.004, 0.2) * (t >= start)
    return out


def write(name, x):
    x = x / np.max(np.abs(x)) * 0.6
    # chân tiếng về 0, khỏi nổ tách
    x[-200:] *= np.linspace(1, 0, 200)
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes((x * 32767).astype(np.int16).tobytes())


for name, make in [("koa-boop", boop), ("koa-click", click), ("koa-land", land), ("koa-chime", chime)]:
    write(name, make())
