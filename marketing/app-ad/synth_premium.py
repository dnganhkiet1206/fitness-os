"""Âm thanh cho bản premium 30 giây (120 bpm, khớp premium.html): nhạc nền + hiệu ứng, tổng hợp hoàn toàn bằng code (không dùng mẫu âm thanh nào có bản quyền)."""
import numpy as np, wave, sys
SR = 48000; DUR = 30.0; N = int(SR * DUR)
rng = np.random.default_rng(7)
L = np.zeros(N); R = np.zeros(N)
t_all = np.arange(N) / SR

def add(sig, at, gain=1.0, pan=0.0):
    i = int(at * SR); j = min(N, i + len(sig)); sig = sig[: j - i] * gain
    L[i:j] += sig * np.sqrt((1 - pan) / 2); R[i:j] += sig * np.sqrt((1 + pan) / 2)

def env(n, a, d, sus=0.0, rel=None):
    e = np.ones(n); na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    k = np.arange(n - na) / SR
    e[na:] = sus + (1 - sus) * np.exp(-k / max(d, 1e-4))
    return e

def lowpass(x, fc):
    a = np.exp(-2 * np.pi * fc / SR); y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc = (1 - a) * x[i] + a * acc; y[i] = acc
    return y

def bandsweep(n, f0, f1, q=6):
    """nhiễu lọc dải, tâm quét từ f0 → f1 (tiếng vút)"""
    x = rng.standard_normal(n)
    X = np.fft.rfft(x); f = np.fft.rfftfreq(n, 1 / SR)
    # xấp xỉ: chia khối, lọc từng khối theo tâm hiện tại
    out = np.zeros(n); blk = 1024
    for s in range(0, n, blk // 2):
        e = min(n, s + blk); seg = x[s:e] * np.hanning(e - s)
        c = f0 * (f1 / f0) ** (s / n)
        F = np.fft.rfft(seg); ff = np.fft.rfftfreq(e - s, 1 / SR)
        F *= np.exp(-((np.log2(ff + 1) - np.log2(c)) ** 2) * q)
        out[s:e] += np.fft.irfft(F, e - s)
    return out / (np.abs(out).max() + 1e-9)

def whoosh(dur, f0, f1, shape='swell'):
    n = int(dur * SR); x = bandsweep(n, f0, f1)
    k = np.linspace(0, 1, n)
    e = np.sin(np.pi * k) ** 1.5 if shape == 'swell' else (k ** 2) * np.exp(-(k - 1) ** 2 * 0) * (1 - k) ** 0.3
    return x * e

def tick(freq=3200, dur=0.05):
    n = int(dur * SR); k = np.arange(n) / SR
    return np.sin(2 * np.pi * freq * k) * np.exp(-k / 0.008) * 0.8 + rng.standard_normal(n) * np.exp(-k / 0.003) * 0.2

def kick(dur=0.35):
    n = int(dur * SR); k = np.arange(n) / SR
    f = 42 + 70 * np.exp(-k / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-k / 0.12) + rng.standard_normal(n) * np.exp(-k / 0.002) * 0.15

def hat(dur=0.05):
    n = int(dur * SR); k = np.arange(n) / SR
    x = rng.standard_normal(n); x = x - lowpass(x, 6000)
    return x * np.exp(-k / 0.012)

def bell(freq, dur=2.2):
    n = int(dur * SR); k = np.arange(n) / SR
    s = sum(a * np.sin(2 * np.pi * freq * m * k) * np.exp(-k / (d)) for m, a, d in [(1, 1, .9), (2.01, .45, .5), (3.02, .25, .3), (4.2, .12, .2)])
    return s * env(n, 0.004, 10)

def boom(dur=1.6, f=48):
    n = int(dur * SR); k = np.arange(n) / SR
    ff = f + 30 * np.exp(-k / 0.08)
    return np.sin(2 * np.pi * np.cumsum(ff) / SR) * np.exp(-k / 0.5) * env(n, 0.01, 10)

def pad_chord(freqs, dur):
    n = int(dur * SR); k = np.arange(n) / SR; x = np.zeros(n)
    for fr in freqs:
        for det in (-0.12, 0.0, 0.13):
            f = fr * 2 ** (det / 12)
            x += np.sin(2 * np.pi * f * k + rng.uniform(0, 6.28)) + 0.3 * np.sin(2 * np.pi * 2 * f * k)
    a = min(0.9, dur * 0.4); e = np.minimum(1, np.minimum(k / a, (dur - k) / 0.9).clip(0, 1))
    return x * e / (len(freqs) * 3)


SR_ = SR
m = lambda n: 440 * 2 ** ((n - 69) / 12)
BEAT = 0.5  # 120 bpm
def pluck(freq, dur=0.35):
    n = int(dur * SR); k = np.arange(n) / SR
    x = sum(a * np.sin(2 * np.pi * freq * h * k) for h, a in [(1, 1), (2, .35), (3, .15)])
    return x * np.exp(-k / 0.09) * env(n, 0.003, 10)
def clap(dur=0.18):
    n = int(dur * SR); k = np.arange(n) / SR; x = rng.standard_normal(n)
    x = lowpass(x, 5200) - lowpass(x, 900)
    e = np.exp(-k / 0.045) * (1 + 0.6 * (np.sin(2 * np.pi * 90 * k) > 0))
    return x * e
def stab(freqs, dur=0.5):
    n = int(dur * SR); k = np.arange(n) / SR
    x = sum(np.sin(2 * np.pi * f * k) + .4 * np.sin(2 * np.pi * 2.01 * f * k) for f in freqs)
    return lowpass(x * np.exp(-k / 0.12), 3500) / len(freqs)
def riser(dur):
    n = int(dur * SR); k = np.linspace(0, 1, n)
    x = bandsweep(n, 300, 6000, q=3) * k ** 2
    tone = np.sin(2 * np.pi * np.cumsum(200 + 900 * k ** 2) / SR) * k ** 3 * .3
    return x + tone
def bassnote(freq, dur):
    n = int(dur * SR); k = np.arange(n) / SR
    x = np.sin(2 * np.pi * freq * k) + .25 * np.sin(2 * np.pi * 2 * freq * k)
    return x * env(n, 0.005, 10) * np.exp(-k / (dur * 1.5))

# hợp âm theo ô nhịp 2 s: Am9 – Fmaj9 – C(add9) – G6
CH = [[57, 60, 64, 67, 71], [53, 57, 60, 64, 67], [48, 55, 60, 62, 64], [55, 59, 62, 64, 67]]
ROOT = [45, 41, 48, 43]
pad = np.zeros(N)
for b in range(16):
    s_ = pad_chord([m(x) for x in CH[b % 4]], 2.0 + 0.9); i = int(b * 2.0 * SR); j = min(N, i + len(s_)); pad[i:j] += s_[: j - i]
pad = lowpass(pad, 2400)
pl = np.clip(t_all / 1.5, 0, 1) * np.clip((30 - t_all) / 1.0, 0, 1)
pl *= 1 - 0.35 * ((t_all > 2.4) & (t_all < 2.6))
L += pad * pl * 0.20; R += pad * pl * 0.20

# nhịp: kick mỗi phách 2.5–23.0, clap phách 2 và 4 từ 5.0, hat nửa phách, bass móc đơn từ 5.0
kk, hh, cc = kick(), hat(), clap()
for i in range(int(2.5 / BEAT), int(23.0 / BEAT)):
    tt = i * BEAT
    add(kk, tt, 0.40)
    add(hh, tt + BEAT / 2, 0.07, pan=0.3)
    if tt >= 5.0 and i % 2 == 1: add(cc, tt, 0.16, pan=-0.1)
    if tt >= 5.0:
        bar = int(tt // 2.0) % 4
        for h in (0, BEAT / 2):
            add(bassnote(m(ROOT[bar]), 0.24), tt + h, 0.26)
# móc đàn (arp) nhẹ 11.0–23.0 theo hợp âm
for i in range(int(11.0 / (BEAT / 2)), int(23.0 / (BEAT / 2))):
    tt = i * BEAT / 2; ch = CH[int(tt // 2.0) % 4]
    add(pluck(m(ch[i % len(ch)] + 12)), tt, 0.05, pan=(-0.4 if i % 2 else 0.4))

# ── mở đầu: bốn chữ ──
for at, ch in zip([.15, .65, 1.15, 1.65], [CH[0], CH[1], CH[2], CH[3]]):
    add(kick(), at, 0.5); add(stab([m(x) for x in ch[:3]]), at, 0.22); add(hat(0.08), at, 0.12)
add(riser(1.25), 1.2, 0.22)
add(boom(2.2, 42), 2.45, 0.7); add(whoosh(0.8, 4000, 300), 2.35, 0.2)
for i, n in enumerate([81, 84, 88]): add(bell(m(n), 2.0), 2.6 + i * 0.08, 0.07, pan=-0.3 + i * 0.3)
add(whoosh(1.2, 2500, 9000), 3.0, 0.06)                      # vệt sáng chữ
add(whoosh(1.0, 250, 2000), 3.8, 0.3)                          # điện thoại lên
add(whoosh(1.2, 400, 3000), 5.3, 0.22)                         # tiến sát
add(bell(m(88), 1.6), 6.25, 0.08); add(tick(3000), 6.35, 0.1)
add(whoosh(0.6, 3000, 500), 7.5, 0.22)
# quét sáng → tối: tiếng vút dài lướt từ phải sang trái
w = whoosh(1.3, 900, 5000)
nw = len(w); pan = np.linspace(0.8, -0.8, nw)
i0 = int(8.85 * SR); L[i0:i0 + nw] += w * 0.3 * np.sqrt((1 - pan) / 2); R[i0:i0 + nw] += w * 0.3 * np.sqrt((1 + pan) / 2)
add(tick(2400), 10.1, 0.12)
add(whoosh(0.9, 300, 2600), 10.85, 0.3)                        # quạt ba máy
for at in (11.5, 12.0, 12.5): add(tick(2600), at, 0.1)
add(whoosh(0.35, 5000, 800), 13.9, 0.32, pan=-0.5)            # lia nhanh
for at in (14.75, 15.35): add(boom(0.25, 180), at, 0.25); add(tick(3500), at + .02, 0.08)
add(whoosh(0.35, 800, 5000), 16.7, 0.3, pan=0.5)
add(whoosh(0.35, 5000, 800), 16.95, 0.3, pan=-0.5)
add(riser(0.5), 19.55, 0.2); add(whoosh(0.5, 400, 6000), 19.7, 0.28)
add(boom(1.0, 60), 20.0, 0.35)
# vào Koa: trầm xuống, lấp lánh
add(whoosh(0.9, 3000, 150), 22.95, 0.3); add(boom(2.4, 36), 23.5, 0.65)
for i, n in enumerate([76, 79, 83, 88]): add(bell(m(n), 1.6), 24.3 + i * 0.11, 0.06, pan=-0.3 + i * 0.2)
# kết
add(boom(2.6, 40), 26.65, 0.7)
for i, n in enumerate([69, 72, 76, 79, 84]): add(bell(m(n), 2.6), 26.8 + i * 0.08, 0.09, pan=-0.4 + i * 0.2)
add(whoosh(1.4, 3000, 10000), 27.6, 0.07)
# ── vang đơn giản (IR nhiễu tắt dần) trên toàn bộ, trộn nhẹ ──
ir_n = int(1.6 * SR); ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.45)
ir = lowpass(ir, 5000); ir /= np.abs(ir).sum() ** 0.5 * 12
def conv(x):
    n = len(x) + ir_n; F = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[: len(x)]
L = L + 0.25 * conv(L); R = R + 0.25 * conv(R)
# đuôi 30 s êm
tail = np.clip((30 - t_all) / 0.25, 0, 1); L *= tail; R *= tail
peak = max(np.abs(L).max(), np.abs(R).max()); g = 0.93 / peak
out = (np.stack([L, R], 1) * g * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio-premium.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('xong', round(DUR, 1), 's, gain', round(g, 3))
