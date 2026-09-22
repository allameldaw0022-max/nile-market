#!/usr/bin/env python3
"""
يولّد أيقونات PWA بصيغة PNG بلا أي مكتبة خارجية.

لماذا سكربت بدل صورة مرفوعة؟ الأيقونة جزء من الهوية ويجب أن تُعاد
بنفس القيم لو تغيّر المقاس — والتوليد يجعلها مراجَعة كالكود لا ملفًّا
ثنائيًّا مبهمًا. الألوان مأخوذة حرفيًا من Design System (§4).
"""
import math
import struct
import zlib
from pathlib import Path

NAVY = (0x0B, 0x1F, 0x3A)
NILE = (0x0B, 0x5E, 0xD7)
GOLD = (0xD9, 0xA4, 0x41)
WHITE = (0xFF, 0xFF, 0xFF)

OUT = Path(__file__).resolve().parent.parent / "public" / "icons"


def mix(a, b, t):
    t = max(0.0, min(1.0, t))
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def coverage(distance, edge, softness=1.0):
    """تنعيم الحواف: نسبة تغطية البكسل بدل حافة مسنّنة."""
    return max(0.0, min(1.0, (edge - distance) / softness + 0.5))


def rounded_square(x, y, size, radius):
    """مسافة موقَّعة من حافة مربّع بزوايا دائرية، مركزه منتصف الصورة."""
    cx = cy = size / 2
    dx = abs(x - cx) - (size / 2 - radius)
    dy = abs(y - cy) - (size / 2 - radius)
    if dx <= 0 and dy <= 0:
        return max(dx, dy)
    dx = max(dx, 0.0)
    dy = max(dy, 0.0)
    return math.hypot(dx, dy)


def pixel(x, y, size, maskable):
    """
    التصميم: مربّع نيلي بتدرّج نحو الكحلي، وفوقه موجة ذهبية — نهرٌ
    ومركب. بسيط يبقى مقروءًا عند 48 بكسل.
    """
    s = size
    # الخلفية
    if maskable:
        # maskable: الخلفية تملأ الإطار كاملًا لأن النظام يقصّ الحواف
        bg = mix(NILE, NAVY, y / s)
        a = 1.0
    else:
        d = rounded_square(x, y, s, s * 0.235)
        a = coverage(d, 0.0, max(1.5, s * 0.004))
        bg = mix(NILE, NAVY, y / s)

    # آمن للقصّ: كل العناصر داخل 80% المركزية
    inner = s * 0.1 if maskable else 0.0
    w = s - inner * 2
    px = (x - inner) / w
    py = (y - inner) / w

    color = bg

    # الموجة الذهبية: جيبٌ واحد عرض الأيقونة
    wave = 0.63 + 0.055 * math.sin((px - 0.12) * math.pi * 2.0)
    band = abs(py - wave)
    if band < 0.052:
        color = mix(color, GOLD, coverage(band, 0.045, 0.012))

    # الشراع: مثلّث أبيض فوق الموجة
    if 0.30 < py < wave - 0.02:
        t = (wave - 0.02 - py) / (wave - 0.32)
        half = 0.20 * (1.0 - t)
        if abs(px - 0.50) < half:
            color = mix(color, WHITE, 0.96)

    # الصاري
    if 0.26 < py < wave - 0.02 and abs(px - 0.50) < 0.013:
        color = mix(color, GOLD, 0.9)

    return color, a


def render(size, maskable):
    rows = bytearray()
    for y in range(size):
        rows.append(0)  # filter type 0
        for x in range(size):
            (r, g, b), a = pixel(x + 0.5, y + 0.5, size, maskable)
            rows += bytes((r, g, b, round(a * 255)))
    return bytes(rows)


def chunk(tag, data):
    return (struct.pack(">I", len(data)) + tag + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))


def write_png(path, size, maskable=False):
    header = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", header)
           + chunk(b"IDAT", zlib.compress(render(size, maskable), 9))
           + chunk(b"IEND", b""))
    path.write_bytes(png)
    return len(png)


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        n = write_png(OUT / f"icon-{size}.png", size)
        print(f"icon-{size}.png  {n:,} bytes")
    for size in (192, 512):
        n = write_png(OUT / f"maskable-{size}.png", size, maskable=True)
        print(f"maskable-{size}.png  {n:,} bytes")
    n = write_png(OUT / "apple-touch-icon.png", 180)
    print(f"apple-touch-icon.png  {n:,} bytes")
