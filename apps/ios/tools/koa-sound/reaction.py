#!/usr/bin/env python3
"""Tiếng của cảnh Koa phản ứng toàn màn hình (05/11, Kiệt: "âm thanh tối giản, dễ chịu, sang trọng, nhưng phải
hợp với bối cảnh và storyboard; không làm lớn quá").

Tự tổng hợp như `room.py` / `voice.py`: không bản ghi, không giấy phép. Bảng tiếng:
- sóng sin có mép mềm, vài hoạ âm như chuông gỗ / chuông thuỷ tinh nhỏ;
- tiếng thở, tiếng gió là nhiễu lọc mềm;
- không trống, không kèn, không tiếng "game" chói. Mọi tiếng ngắn, đỉnh thấp, đuôi tắt êm;
- cao độ trong một hợp âm (Mi trưởng thêm chín) để các tiếng chồng nhau vẫn hoà.

Chạy: python3 tools/koa-sound/reaction.py (cần numpy). Ghi ASCND/Resources/Sounds/koa-rx-*.wav.
"""
import pathlib
import wave

import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
OUT = HERE.parents[1] / "ASCND/Resources/Sounds"
RATE = 44100
rng = np.random.default_rng(1105)

# Mi trưởng thêm chín: E4 G#4 B4 D#5 F#5 E5 G#5 B5
NOTE = {"E4": 329.63, "G#4": 415.30, "B4": 493.88, "D#5": 622.25, "E5": 659.26, "F#5": 739.99, "G#5": 830.61,
        "B5": 987.77, "E6": 1318.51, "B3": 246.94, "E3": 164.81}


def write(name, x, peak):
    x = np.asarray(x, dtype=np.float64)
    m = np.max(np.abs(x)) or 1
    x = x / m * peak
    # mép 3 ms để không có tiếng tách
    n = int(0.003 * RATE)
    if x.size > 2 * n:
        x[:n] *= np.linspace(0, 1, n)
        x[-n:] *= np.linspace(1, 0, n)
    pcm = (np.clip(x, -1, 1) * 32767).astype("<i2")
    with wave.open(str(OUT / f"{name}.wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(pcm.tobytes())
    print(f"{name}.wav  {x.size / RATE:.2f}s  đỉnh {peak}")


def t_(sec):
    return np.arange(int(sec * RATE)) / RATE


def env(t, attack, decay):
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-np.maximum(0, t - attack) / decay)


def bell(freq, sec, decay, attack=0.004, bright=0.25):
    """Chuông thuỷ tinh nhỏ: nốt gốc + hoạ âm lệch nhẹ (2,76; 5,4) tắt nhanh hơn → trong mà không chói."""
    t = t_(sec)
    x = np.sin(2 * np.pi * freq * t) * env(t, attack, decay)
    x += bright * np.sin(2 * np.pi * freq * 2.756 * t) * env(t, attack, decay * 0.35)
    x += bright * 0.4 * np.sin(2 * np.pi * freq * 5.404 * t) * env(t, attack, decay * 0.15)
    return x


def wood(freq, sec=0.18, decay=0.05):
    """Chuông gỗ / mộc cầm tắt nhanh: ấm, gọn."""
    t = t_(sec)
    x = np.sin(2 * np.pi * freq * t) * env(t, 0.002, decay)
    x += 0.35 * np.sin(2 * np.pi * freq * 3.93 * t) * env(t, 0.001, decay * 0.25)
    return x


def lowpass(x, cut):
    f = np.fft.rfftfreq(x.size, 1 / RATE)
    return np.fft.irfft(np.fft.rfft(x) / (1 + (f / cut) ** 4), x.size)


def bandnoise(sec, lo, hi):
    n = int(sec * RATE)
    f = np.fft.rfftfreq(n, 1 / RATE)
    mag = np.exp(-((np.log(np.maximum(f, 1)) - np.log((lo * hi) ** 0.5)) / np.log(hi / lo) * 2.2) ** 2)
    x = np.fft.irfft(mag * np.exp(1j * rng.uniform(0, 2 * np.pi, f.size)), n)
    return x / (np.max(np.abs(x)) or 1)


def mix(total, *parts):
    """`(âm, lúc bắt đầu (s), độ to)` → một tiếng."""
    out = np.zeros(int(total * RATE))
    for x, at, g in parts:
        i = int(at * RATE)
        j = min(out.size, i + x.size)
        out[i:j] += x[: j - i] * g
    return out


# 1. Gồng nâng tạ: hơi gió rất nhỏ dâng lên (căng dần), không có cao độ rõ.
def lift(sec=0.8):
    t = t_(sec)
    x = bandnoise(sec, 300, 1800) * (t / sec) ** 2 * np.exp(-np.maximum(0, t - sec * 0.85) / 0.05)
    return lowpass(x, 2200)


# 2. Xong set: hai nốt chuông nhỏ đi lên (G#5 → B5), như một dấu tích nhẹ.
def set_done():
    return mix(0.9, (bell(NOTE["G#5"], 0.9, 0.32), 0, 0.8), (bell(NOTE["B5"], 0.8, 0.36), 0.085, 0.9))


# 3. Thở ra: nhiễu mềm đi xuống, như "phù".
def exhale(sec=0.55):
    t = t_(sec)
    x = bandnoise(sec, 250, 1400) * env(t, 0.06, 0.18)
    return lowpass(x, 1500)


# 4. Hít vào sâu: thở ra đảo ngược, dịu hơn.
def inhale(sec=0.6):
    return exhale(sec)[::-1] * 0.8


# 5. Vào vòng đồng hồ nghỉ: một tiếng gỗ trầm gọn.
def ring_tock():
    return mix(0.25, (wood(NOTE["E4"], 0.25, 0.06), 0, 1), (wood(NOTE["B4"], 0.2, 0.04), 0.0, 0.3))


# 6. Kỷ lục: ba nốt chuông đi lên (E5 G#5 B5) trên một nền trầm ấm, đuôi lấp lánh rất khẽ.
def record():
    pad_t = t_(1.6)
    pad = (np.sin(2 * np.pi * NOTE["E3"] * pad_t) + 0.5 * np.sin(2 * np.pi * NOTE["B3"] * pad_t)) * env(pad_t, 0.05, 0.6)
    return mix(1.7, (lowpass(pad, 600), 0, 0.35), (bell(NOTE["E5"], 1.2, 0.45), 0.0, 0.7),
               (bell(NOTE["G#5"], 1.2, 0.45), 0.09, 0.75), (bell(NOTE["B5"], 1.2, 0.55), 0.18, 0.85),
               (bell(NOTE["E6"], 1.0, 0.4, bright=0.1), 0.30, 0.25))


# 7. Bật nhảy: hơi gió ngắn đi lên.
def whoosh(sec=0.32):
    t = t_(sec)
    x = bandnoise(sec, 500, 3000) * np.sin(np.pi * t / sec) ** 2
    return lowpass(x, 3200)


# 8. Tiếp đất: tiếng "bịch" êm như đệm, trầm, gần như chỉ cảm thấy.
def land():
    t = t_(0.22)
    body = np.sin(2 * np.pi * (95 - 40 * t / 0.22) * t) * env(t, 0.003, 0.06)
    tap = bandnoise(0.22, 200, 900) * env(t, 0.001, 0.02) * 0.25
    return body + tap


# 9. Pháo giấy: vài tiếng ping rất nhỏ, cao, rải ngẫu nhiên.
def sparkle(sec=1.2, count=9):
    out = np.zeros(int(sec * RATE))
    notes = [NOTE["B5"], NOTE["E6"], NOTE["G#5"] * 2, NOTE["D#5"] * 2]
    for k in range(count):
        at = rng.uniform(0, sec - 0.3)
        x = bell(notes[k % len(notes)], 0.3, 0.08, bright=0.05) * rng.uniform(0.4, 1)
        i = int(at * RATE)
        out[i:i + x.size] += x[: out.size - i]
    return out


# 10. Số đếm / chip hiện: tiếng gỗ cao rất gọn.
def tick():
    return wood(NOTE["B5"], 0.12, 0.025)


# 11. Đấm tay lên: một nốt gỗ ấm.
def pump():
    return wood(NOTE["E5"], 0.18, 0.05)


# 12. Xong buổi: hợp âm Mi trưởng thêm chín rải chậm, mềm, có đuôi — "hoàn thành" trang nhã.
def done():
    t = t_(2.0)
    pad = sum(np.sin(2 * np.pi * NOTE[n] * t) for n in ("E4", "G#4", "B4", "F#5")) * env(t, 0.25, 0.8)
    return mix(2.1, (lowpass(pad, 1800), 0, 0.3), (bell(NOTE["E5"], 1.4, 0.5), 0.0, 0.55),
               (bell(NOTE["G#5"], 1.4, 0.5), 0.12, 0.55), (bell(NOTE["B5"], 1.4, 0.55), 0.24, 0.6),
               (bell(NOTE["F#5"] * 2, 1.2, 0.5, bright=0.1), 0.40, 0.25))


# 13. Gains: hai nốt gỗ đi lên, nhẹ.
def gains():
    return mix(0.4, (wood(NOTE["B4"], 0.25, 0.06), 0, 0.8), (wood(NOTE["E5"], 0.3, 0.08), 0.07, 0.9))


if __name__ == "__main__":
    # đỉnh thấp: tiếng nền của cảnh, không át nhạc người dùng đang nghe (category `.ambient`)
    write("koa-rx-lift", lift(), 0.35)
    write("koa-rx-set", set_done(), 0.5)
    write("koa-rx-exhale", exhale(), 0.4)
    write("koa-rx-inhale", inhale(), 0.35)
    write("koa-rx-ring", ring_tock(), 0.45)
    write("koa-rx-record", record(), 0.55)
    write("koa-rx-whoosh", whoosh(), 0.35)
    write("koa-rx-land", land(), 0.55)
    write("koa-rx-sparkle", sparkle(), 0.3)
    write("koa-rx-tick", tick(), 0.4)
    write("koa-rx-pump", pump(), 0.45)
    write("koa-rx-done", done(), 0.5)
    write("koa-rx-gains", gains(), 0.45)
