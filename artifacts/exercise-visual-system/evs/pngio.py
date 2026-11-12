"""Minimal PNG writer and reader for 8-bit grayscale and RGB images. Plain
Python with numpy, so the atlas tools do not depend on Blender or Pillow."""

from __future__ import annotations

import struct
import zlib

import numpy as np


def _chunk(tag: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)


def write_png(path, pixels: np.ndarray) -> None:
    """``pixels`` is (H, W) or (H, W, 3) uint8, first row at the top."""
    pixels = np.ascontiguousarray(pixels, dtype=np.uint8)
    if pixels.ndim == 2:
        color_type, channels = 0, 1
    elif pixels.ndim == 3 and pixels.shape[2] == 3:
        color_type, channels = 2, 3
    else:
        raise ValueError("expected (H, W) or (H, W, 3)")
    h, w = pixels.shape[:2]
    raw = np.zeros((h, 1 + w * channels), dtype=np.uint8)
    raw[:, 1:] = pixels.reshape(h, w * channels)
    data = b"\x89PNG\r\n\x1a\n"
    data += _chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, color_type, 0, 0, 0))
    data += _chunk(b"IDAT", zlib.compress(raw.tobytes(), 6))
    data += _chunk(b"IEND", b"")
    with open(path, "wb") as fh:
        fh.write(data)


def read_png(path) -> np.ndarray:
    """Reads 8-bit grayscale, RGB or RGBA PNGs without interlacing."""
    with open(path, "rb") as fh:
        blob = fh.read()
    if blob[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("not a PNG")
    pos, idat, header = 8, b"", None
    while pos < len(blob):
        (length,) = struct.unpack(">I", blob[pos : pos + 4])
        tag = blob[pos + 4 : pos + 8]
        body = blob[pos + 8 : pos + 8 + length]
        if tag == b"IHDR":
            header = struct.unpack(">IIBBBBB", body)
        elif tag == b"IDAT":
            idat += body
        pos += 12 + length
    w, h, depth, color_type, _c, _f, interlace = header
    if depth != 8 or interlace != 0 or color_type not in (0, 2, 6):
        raise ValueError("unsupported PNG variant")
    channels = {0: 1, 2: 3, 6: 4}[color_type]
    stride = w * channels
    raw = np.frombuffer(zlib.decompress(idat), dtype=np.uint8).reshape(h, 1 + stride)
    out = np.zeros((h, stride), dtype=np.uint8)
    prev = np.zeros(stride, dtype=np.int32)
    for y in range(h):
        kind = int(raw[y, 0])
        line = raw[y, 1:].astype(np.int32)
        if kind == 0:
            cur = line
        elif kind == 2:
            cur = (line + prev) & 0xFF
        else:
            cur = np.zeros(stride, dtype=np.int32)
            for i in range(stride):
                left = cur[i - channels] if i >= channels else 0
                up = prev[i]
                up_left = prev[i - channels] if i >= channels else 0
                if kind == 1:
                    pred = left
                elif kind == 3:
                    pred = (left + up) >> 1
                else:
                    p = left + up - up_left
                    pa, pb, pc = abs(p - left), abs(p - up), abs(p - up_left)
                    pred = left if pa <= pb and pa <= pc else (up if pb <= pc else up_left)
                cur[i] = (line[i] + pred) & 0xFF
        out[y] = cur
        prev = cur
    return out.reshape(h, w) if channels == 1 else out.reshape(h, w, channels)
