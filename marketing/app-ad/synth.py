"""Âm thanh cho video 30 giây: nhạc nền + hiệu ứng, tổng hợp hoàn toàn bằng code (không dùng mẫu âm thanh nào có bản quyền)."""
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

# ── nhạc nền: pad 4 hợp âm (Cmaj9 – Am9 – Fmaj9 – G6/9), mỗi hợp âm 2,4 s, chồng nhẹ ──
m = lambda n: 440 * 2 ** ((n - 69) / 12)
CH = [[48, 55, 59, 62, 64], [45, 52, 55, 59, 60], [41, 48, 52, 55, 57], [43, 50, 52, 55, 57]]
BAR = 2.4
pad = np.zeros(N)
for b in range(13):
    ch = [m(x) for x in CH[b % 4]]
    s = pad_chord(ch, BAR + 1.0); i = int(b * BAR * SR); j = min(N, i + len(s)); pad[i:j] += s[: j - i]
pad = lowpass(pad, 2600)
fade = np.clip(t_all / 1.8, 0, 1) * np.clip((30 - t_all) / 1.2, 0, 1)
# chìm xuống khi sang cảnh tối rồi trồi lại
duck = 1 - 0.55 * np.exp(-((t_all - 27.2) / 0.5) ** 2)
pad *= fade * duck
L += pad * 0.22; R += pad * 0.22

# ── nhịp: kick mỗi phách (100 bpm) từ lúc điện thoại vào tới cảnh Koa, hat giữa phách ──
BEAT = 60 / 100
b0 = 2.4
k = kick(); h = hat()
t = b0
while t < 26.9:
    add(k, t, 0.34)
    add(h, t + BEAT / 2, 0.06, pan=0.25)
    t += BEAT

# ── hiệu ứng theo cảnh (khớp compose30.html) ──
add(boom(1.8, 46), 0.1, 0.55)
add(bell(m(84), 2.5), 0.15, 0.10, pan=-0.2)
add(bell(m(91), 2.5), 0.32, 0.07, pan=0.2)
add(whoosh(0.9, 300, 2400), 2.05, 0.30)                       # điện thoại vào
TR = [(5.4, 'slide'), (8.2, 'flip'), (11.0, 'sheet'), (13.2, 'flip'), (15.6, 'blur'), (17.8, 'slide'),
      (20.0, 'sheet'), (22.0, 'flip'), (25.0, 'slide'), (27.0, 'dark')]
for at, kind in TR:
    if kind == 'slide':
        w = whoosh(0.55, 2200, 700); add(w, at - 0.08, 0.30, pan=0.5); add(w, at - 0.02, 0.18, pan=-0.5)
    elif kind == 'sheet':
        add(whoosh(0.6, 500, 3200), at - 0.1, 0.30)
    elif kind == 'flip':
        add(whoosh(0.28, 900, 4200), at - 0.05, 0.28, pan=-0.4); add(whoosh(0.3, 4200, 800), at + 0.2, 0.24, pan=0.4)
    elif kind == 'blur':
        add(whoosh(0.8, 1200, 600), at - 0.15, 0.22)
    elif kind == 'dark':
        add(whoosh(1.1, 3000, 200), at - 0.3, 0.30); add(boom(2.0, 38), at, 0.6)
    add(tick(2800 if kind != 'dark' else 1800), at + 0.13, 0.10)
# lần đầu chữ "Hôm nay." hiện
add(tick(), 2.65, 0.10)
# huy chương: lấp lánh
for i, n in enumerate([88, 91, 96]):
    add(bell(m(n), 1.2), 25.35 + i * 0.07, 0.05, pan=-0.3 + i * 0.3)
# kết: tiếng trầm + chuông hợp âm
add(boom(2.0, 44), 28.62, 0.55)
for i, n in enumerate([72, 76, 79, 84]):
    add(bell(m(n), 2.2), 28.7 + i * 0.09, 0.11, pan=-0.3 + i * 0.2)
add(whoosh(0.7, 2500, 400), 28.35, 0.2)

# ── vang đơn giản (IR nhiễu tắt dần) trên toàn bộ, trộn nhẹ ──
ir_n = int(1.6 * SR); ir = rng.standard_normal(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.45)
ir = lowpass(ir, 5000); ir /= np.abs(ir).sum() ** 0.5 * 12
def conv(x):
    n = len(x) + ir_n; F = 1 << (n - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, F) * np.fft.rfft(ir, F), F)[: len(x)]
L = L + 0.25 * conv(L); R = R + 0.25 * conv(R)
# đuôi 30 s êm
tail = np.clip((30 - t_all) / 0.25, 0, 1); L *= tail; R *= tail
peak = max(np.abs(L).max(), np.abs(R).max()); g = 0.89 / peak
out = (np.stack([L, R], 1) * g * 32767).astype(np.int16)
with wave.open(sys.argv[1] if len(sys.argv) > 1 else 'audio30.wav', 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(out.tobytes())
print('xong', round(DUR, 1), 's, gain', round(g, 3))
