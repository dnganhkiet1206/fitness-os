#!/usr/bin/env python3
"""Tiếng của căn phòng Koa (Kiệt 04/11): bước chân nhẹ, tiếng nền ngày / đêm, tiếng ngủ và nhiều tiếng
lẻ cho phòng sống động. Không có nhạc nền (Kiệt 04/11: nghe ảm đạm). Tự tổng hợp như `voice.py` — không bản ghi, không giấy phép.

Chạy: python3 tools/koa-sound/room.py (cần numpy). Ghi ASCND/Resources/Sounds/koa-*.wav.
Vòng lặp (tiếng nền, tiếng ngủ) dựng TUẦN HOÀN theo độ dài file — nhiễu tạo trong miền tần số, mọi nốt / tiếng
chim / dế quấn vòng — nên lặp không có chỗ nối.
"""
import pathlib
import wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / "ASCND/Resources/Sounds"
RATE = 44100
LOOP_RATE = 22050  # vòng lặp dài: nửa tần số mẫu cho nhẹ app; nội dung đều dưới 8 kHz
rng = np.random.default_rng(404)


def write(name, x, rate=RATE, peak=0.7):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    print(f"{name}.wav  {x.size / rate:.2f}s")


def shaped_noise(n, rate, lo, hi, tilt=0.0, seed=None):
    """Nhiễu tuần hoàn (vòng lặp liền): biên độ phổ giữa lo…hi, nghiêng theo f^-tilt."""
    r = np.random.default_rng(seed) if seed is not None else rng
    f = np.fft.rfftfreq(n, 1 / rate)
    mag = ((f >= lo) & (f <= hi)).astype(float)
    # mép mềm
    for edge, k in ((lo, 1), (hi, -1)):
        band = np.abs(f - edge) < edge * 0.3 + 1
        mag[band] = np.maximum(mag[band], 0.5 * np.exp(-((f[band] - edge) / (edge * 0.15 + 1)) ** 2))
    mag *= np.where(f > 0, (np.maximum(f, 1) / max(lo, 1)) ** (-tilt), 0)
    spec = mag * np.exp(1j * r.uniform(0, 2 * np.pi, f.size))
    x = np.fft.irfft(spec, n)
    return x / (np.max(np.abs(x)) or 1)


def lowpass(x, rate, cut):
    f = np.fft.rfftfreq(x.size, 1 / rate)
    s = np.fft.rfft(x) / (1 + (f / cut) ** 4)
    return np.fft.irfft(s, x.size)


def env(n, rate, attack, decay):
    t = np.arange(n) / rate
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack) / decay)


def place(buf, x, at):
    """Cộng `x` vào `buf` từ mẫu `at`, quấn vòng ở cuối (vòng lặp)."""
    idx = (np.arange(x.size) + at) % buf.size
    np.add.at(buf, idx, x)


# ── Bước chân: đệm thịt mềm chạm sàn — tiếng thịch trầm rất ngắn + chút sột soạt, không gót cứng.
def step(seed, wood=False):
    r = np.random.default_rng(seed)
    n = int(0.22 * RATE)
    t = np.arange(n) / RATE
    f0 = r.uniform(62, 78) * (1.35 if wood else 1)
    thump = np.sin(2 * np.pi * (f0 * t - 18 * t * t)) * env(n, RATE, 0.004, 0.035)
    pad = shaped_noise(n, RATE, 250, 1400 if not wood else 2200, tilt=1.0, seed=seed) * env(n, RATE, 0.002, 0.018) * 0.35
    out = thump + pad
    if wood:  # bục gỗ: thêm cộng hưởng ngắn của ván
        out += np.sin(2 * np.pi * r.uniform(190, 230) * t) * env(n, RATE, 0.002, 0.05) * 0.25
        out += np.sin(2 * np.pi * r.uniform(410, 470) * t) * env(n, RATE, 0.001, 0.03) * 0.12
    return lowpass(out, RATE, 2400)


# ── Ngủ (Kiệt 04/11: "hiệu ứng âm thanh ngái ngủ"): hít vào khẽ, thở ra có rung nhẹ trong cổ như
# ngáy rất nhỏ. Bốn giây một nhịp thở, hai đầu im nên lặp liền.
def snore():
    rate = LOOP_RATE
    n = int(4.0 * rate)
    t = np.arange(n) / rate
    buf = np.zeros(n)
    i0, i1 = int(0.2 * rate), int(1.6 * rate)
    inh = shaped_noise(i1 - i0, rate, 300, 1800, tilt=0.8, seed=91) * np.sin(np.pi * np.linspace(0, 1, i1 - i0)) ** 2
    buf[i0:i1] += inh * 0.35
    e0, e1 = int(1.9 * rate), int(3.7 * rate)
    tt = t[e0:e1] - t[e0]
    shape = np.sin(np.pi * np.linspace(0, 1, e1 - e0)) ** 1.5
    flutter = 0.6 + 0.4 * np.sin(2 * np.pi * 26 * tt)  # rung mềm của ngáy
    exh = lowpass(shaped_noise(e1 - e0, rate, 80, 700, tilt=1.0, seed=92), rate, 600) * flutter
    exh += np.sin(2 * np.pi * (92 - 6 * tt) * tt) * 0.25 * flutter
    buf[e0:e1] += exh * shape * 0.6
    return buf, rate


# ── Tiếng nền đêm: dế xa, thành phố ù rất trầm.
def night():
    rate = LOOP_RATE
    n = int(30 * rate)
    buf = shaped_noise(n, rate, 40, 260, tilt=1.5, seed=11) * 0.18  # thành phố
    r = np.random.default_rng(12)
    for _ in range(26):
        f = r.uniform(3900, 4700)
        pulses = r.integers(3, 6)
        at = int(r.uniform(0, 30) * rate)
        for p in range(pulses):
            nt = int(0.035 * rate)
            tt = np.arange(nt) / rate
            chirp = np.sin(2 * np.pi * f * tt) * np.sin(np.pi * tt / tt[-1]) ** 2
            place(buf, chirp * r.uniform(0.05, 0.12), at + int(p * 0.06 * rate))
    return buf, rate


# ── Tiếng nền ngày: gió nhẹ ngoài cửa sổ, chim hót xa thưa thớt.
def day():
    rate = LOOP_RATE
    n = int(30 * rate)
    t = np.arange(n) / rate
    breeze = shaped_noise(n, rate, 180, 1400, tilt=1.0, seed=21) * (0.6 + 0.4 * np.sin(2 * np.pi * t / 15) ** 2) * 0.12
    buf = breeze
    r = np.random.default_rng(22)
    for _ in range(9):
        place(buf, bird(r) * r.uniform(0.04, 0.08), int(r.uniform(0, 30) * rate))
    return buf, rate


def bird(r, rate=LOOP_RATE):
    out = []
    for _ in range(r.integers(2, 5)):
        nt = int(r.uniform(0.06, 0.12) * rate)
        tt = np.arange(nt) / rate
        f0, f1 = r.uniform(2600, 3400), r.uniform(3600, 4800)
        ph = 2 * np.pi * np.cumsum(np.linspace(f0, f1, nt)) / rate
        out += [np.sin(ph) * np.sin(np.pi * tt / tt[-1]), np.zeros(int(r.uniform(0.03, 0.08) * rate))]
    return np.concatenate(out)


# ── Tiếng lẻ
def rustle():
    n = int(0.7 * RATE)
    x = np.zeros(n)
    r = np.random.default_rng(31)
    for _ in range(14):
        m = int(r.uniform(0.01, 0.04) * RATE)
        burst = shaped_noise(m, RATE, 1800, 7000, seed=int(r.integers(1e6))) * np.hanning(m)
        place(x, burst * r.uniform(0.3, 1), int(r.uniform(0, 0.6) * RATE))
    return x * np.hanning(n) ** 0.3


def coin():
    n = int(0.9 * RATE)
    t = np.arange(n) / RATE
    a = np.sin(2 * np.pi * 1318.5 * t) * env(n, RATE, 0.002, 0.25)
    b = np.sin(2 * np.pi * 1760 * t) * env(n, RATE, 0.002, 0.35)
    b[: int(0.09 * RATE)] = 0
    return a * 0.6 + b * 0.7 + np.sin(2 * np.pi * 3520 * t) * env(n, RATE, 0.001, 0.08) * 0.15


def sweep():
    n = int(0.8 * RATE)
    t = np.arange(n) / RATE
    noise = shaped_noise(n, RATE, 400, 6000, tilt=0.6, seed=41)
    # quét chổi: hai nhát, mỗi nhát sáng dần rồi tắt
    stroke = np.sin(np.pi * np.clip(t / 0.36, 0, 1)) ** 2 + 0.8 * np.sin(np.pi * np.clip((t - 0.38) / 0.36, 0, 1)) ** 2
    return noise * stroke * (0.5 + 0.5 * t / t[-1])


def car():
    rate = LOOP_RATE
    n = int(4.5 * rate)
    t = np.arange(n) / rate
    swell = np.exp(-((t - 2.2) / 1.1) ** 2)
    hum = shaped_noise(n, rate, 60, 700, tilt=1.2, seed=51) * swell
    tone = np.sin(2 * np.pi * np.cumsum(95 + 12 * np.tanh((2.2 - t) * 2)) / rate) * swell * 0.25
    return lowpass(hum + tone, rate, 900), rate


def creak():
    n = int(0.55 * RATE)
    t = np.arange(n) / RATE
    f = 140 + 70 * np.sin(np.pi * t / t[-1])
    grain = (np.sin(2 * np.pi * np.cumsum(f) / RATE) > 0.6).astype(float)  # ma sát: xung gỗ
    body = lowpass(grain, RATE, 1300) * np.sin(np.pi * t / t[-1])
    return body + shaped_noise(n, RATE, 300, 2000, seed=61) * 0.1 * np.sin(np.pi * t / t[-1])


def buzz():
    n = int(0.3 * RATE)
    t = np.arange(n) / RATE
    x = sum(np.sin(2 * np.pi * 120 * k * t) / k for k in range(1, 8))
    return x * env(n, RATE, 0.01, 0.12) * (0.6 + 0.4 * (np.sin(2 * np.pi * 23 * t) > 0))


def hop():
    n = int(0.3 * RATE)
    t = np.arange(n) / RATE
    return shaped_noise(n, RATE, 500, 3000, seed=71) * np.sin(np.pi * t / t[-1]) ** 2 * (0.4 + t / t[-1])


def tick():
    """Đồng hồ treo: hai tiếng tích tắc gỗ nhỏ."""
    n = int(1.0 * RATE)
    x = np.zeros(n)
    for at, f in ((0.0, 2400), (0.5, 2000)):
        m = int(0.03 * RATE)
        tt = np.arange(m) / RATE
        place(x, np.sin(2 * np.pi * f * tt) * env(m, RATE, 0.0005, 0.006), int(at * RATE))
    return x


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for i in range(3):
        write(f"koa-step-{i + 1}", step(10 + i), peak=0.45)
    for i in range(2):
        write(f"koa-step-wood-{i + 1}", step(20 + i, wood=True), peak=0.45)
    x, r = snore()
    write("koa-snore", x, r, peak=0.35)
    x, r = night()
    write("koa-amb-night", x, r, peak=0.4)
    x, r = day()
    write("koa-amb-day", x, r, peak=0.4)
    write("koa-rustle", rustle(), peak=0.45)
    write("koa-coin", coin(), peak=0.5)
    write("koa-sweep", sweep(), peak=0.45)
    x, r = car()
    write("koa-car", x, r, peak=0.35)
    write("koa-creak", creak(), peak=0.3)
    write("koa-buzz", buzz(), peak=0.18)
    write("koa-hop", hop(), peak=0.35)
    write("koa-tick", tick(), peak=0.3)
    write("koa-bird", np.concatenate([bird(np.random.default_rng(81), RATE), np.zeros(RATE // 10)]), peak=0.35)
